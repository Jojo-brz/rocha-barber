package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/barbearia-rocha/backend/internal/auth"
	"github.com/barbearia-rocha/backend/internal/database"
	"github.com/barbearia-rocha/backend/internal/handler"
	"github.com/barbearia-rocha/backend/internal/middleware"
	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/joho/godotenv"
)

// enableCORS libera origens da Vercel (*.vercel.app), domínios customizados e localhost,
// respondendo imediatamente ao preflight OPTIONS antes de qualquer middleware de autenticação.
func enableCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
		} else {
			w.Header().Set("Access-Control-Allow-Origin", "*")
		}

		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Origin, Accept, Authorization, Content-Type, X-CSRF-Token, X-Requested-With")
		w.Header().Set("Access-Control-Allow-Credentials", "true")

		// Responde imediatamente com 200 OK para a verificação preflight do navegador
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func main() {
	// Carrega arquivo .env se existir no diretório local
	_ = godotenv.Load()

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		log.Println("⚠️  [Atenção] Variável DATABASE_URL não definida!")
		log.Println("👉 Crie um arquivo .env na pasta backend com sua conexão: DATABASE_URL=postgres://...")
	}

	// 1. Conexão com o PostgreSQL
	db, err := database.Conectar(databaseURL)
	if err != nil {
		log.Fatalf("❌ Falha crítica ao inicializar banco de dados: %v", err)
	}
	defer db.Fechar()

	// Chave HMAC para tokens de sessão (lê JWT_SECRET / TOKEN_SECRET / AUTH_SECRET com fallback seguro)
	authSecret := auth.ResolveSecretFromEnv(databaseURL)
	authMiddleware := middleware.NewAuthMiddleware(db, authSecret)

	// 2. Inicialização dos Handlers da API
	authHandler := handler.NewAuthHandler(db, authSecret)
	caixaHandler := handler.NewCaixaHandler(db)
	agendamentoHandler := handler.NewAgendamentoHandler(db)
	adminHandler := handler.NewAdminHandler(db)
	materialHandler := handler.NewMaterialHandler(db)

	// 3. Inicialização do Router Chi
	r := chi.NewRouter()

	// Middleware de CORS no topo do roteador (antes de qualquer rota ou autenticação)
	r.Use(enableCORS)

	// Middlewares essenciais
	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.RealIP)
	r.Use(chimiddleware.Logger)
	r.Use(chimiddleware.Recoverer)
	r.Use(chimiddleware.Timeout(30 * time.Second))

	// Rota pública de Healthcheck
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"online","sistema":"Barbearia Rocha API"}`))
	})

	// 4. Registro dos Endpoints Principais
	r.Route("/api", func(r chi.Router) {
		// Rotas públicas: Autenticação por PIN e Ícone da Barbearia
		r.Post("/auth/pin", authHandler.LoginPIN)
		r.Get("/config/logo", adminHandler.ObterLogoBarbearia)

		// Rotas autenticadas (Barbeiro e CEO)
		r.Group(func(r chi.Router) {
			r.Use(authMiddleware.RequireAuth)

			// Lista pública para equipe logada (sem PINs)
			r.Get("/equipe", adminHandler.ListarEquipePublica)

			// Controle de Caixa Diário
			r.Get("/caixa", caixaHandler.ObterCaixaDiario)
			r.Post("/caixa", caixaHandler.RegistrarMovimentacao)
			r.Put("/caixa/{id}", caixaHandler.EditarMovimentacao)
			r.Delete("/caixa/{id}", caixaHandler.DeletarMovimentacao)

			// Agendamentos de Atendimentos
			r.Get("/agendamentos", agendamentoHandler.ListarAgendamentos)
			r.Post("/agendamentos", agendamentoHandler.CriarAgendamento)
			r.Put("/agendamentos/{id}", agendamentoHandler.EditarAgendamento)
			r.Patch("/agendamentos/{id}", agendamentoHandler.AtualizarStatusAgendamento)
			r.Delete("/agendamentos/{id}", agendamentoHandler.DeletarAgendamento)

			// Pedidos de Insumos & Materiais (solicitação aberta à bancada)
			r.Get("/materiais", materialHandler.ListarMateriais)
			r.Post("/materiais", materialHandler.CriarPedidoMaterial)

			// Rotas exclusivas do CEO/Admin
			r.Group(func(r chi.Router) {
				r.Use(authMiddleware.RequireAdmin)

				r.Patch("/materiais/{id}", materialHandler.AtualizarStatusMaterial)

				// Painel de Gestão de Equipe e Identidade Visual (CEO)
				r.Get("/admin/usuarios", adminHandler.ListarUsuarios)
				r.Post("/admin/usuarios", adminHandler.CriarUsuario)
				r.Put("/admin/usuarios/{id}", adminHandler.EditarUsuario)
				r.Delete("/admin/usuarios/{id}", adminHandler.DeletarUsuario)
				r.Put("/admin/config/logo", adminHandler.AtualizarLogoBarbearia)
			})
		})
	})

	// 5. Inicialização com Graceful Shutdown
	addr := fmt.Sprintf(":%s", port)
	srv := &http.Server{
		Addr:         addr,
		Handler:      enableCORS(r),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("==========================================================")
		log.Printf("💈 BARBEARIA ROCHA - API BACKEND (Golang + PostgreSQL)")
		log.Printf("🚀 Servidor rodando em: http://localhost:%s", port)
		log.Printf("🔒 Trava de Equipe: Limite estrito de 5 colaboradores")
		log.Printf("==========================================================")
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Erro no servidor HTTP: %v", err)
		}
	}()

	// Graceful Shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("🛑 Encerrando servidor da Barbearia Rocha com segurança...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Falha no encerramento forçado do servidor: %v", err)
	}

	log.Println("👋 Servidor finalizado com sucesso!")
}
