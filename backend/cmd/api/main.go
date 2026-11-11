package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/barbearia-rocha/backend/internal/auth"
	"github.com/barbearia-rocha/backend/internal/database"
	"github.com/barbearia-rocha/backend/internal/handler"
	"github.com/barbearia-rocha/backend/internal/middleware"
	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/joho/godotenv"
)

// buildAllowedOrigins monta a lista explícita de origens CORS autorizadas (FRONTEND_URL, ALLOWED_ORIGINS + localhost).
func buildAllowedOrigins() []string {
	seen := map[string]struct{}{}
	origins := make([]string, 0, 6)

	addOrigin := func(raw string) {
		trimmed := strings.TrimRight(strings.TrimSpace(raw), "/")
		if trimmed == "" {
			return
		}
		if _, exists := seen[trimmed]; !exists {
			seen[trimmed] = struct{}{}
			origins = append(origins, trimmed)
		}
	}

	// Origens locais de desenvolvimento
	addOrigin("http://localhost:3000")
	addOrigin("http://127.0.0.1:3000")

	for _, envVar := range []string{os.Getenv("FRONTEND_URL"), os.Getenv("ALLOWED_ORIGINS")} {
		for _, item := range strings.Split(envVar, ",") {
			addOrigin(item)
		}
	}

	return origins
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
		log.Println("👉 Crie um arquivo .env na pasta backend com sua conexão Neon: DATABASE_URL=postgres://...")
	}

	// 1. Conexão com o PostgreSQL do Neon
	db, err := database.Conectar(databaseURL)
	if err != nil {
		log.Fatalf("❌ Falha crítica ao inicializar banco de dados Neon: %v", err)
	}
	defer db.Fechar()

	// Chave HMAC para tokens de sessão
	authSecret := auth.DeriveSecret(os.Getenv("AUTH_SECRET"), databaseURL)
	authMiddleware := middleware.NewAuthMiddleware(db, authSecret)

	// 2. Inicialização dos Handlers da API
	authHandler := handler.NewAuthHandler(db, authSecret)
	caixaHandler := handler.NewCaixaHandler(db)
	agendamentoHandler := handler.NewAgendamentoHandler(db)
	adminHandler := handler.NewAdminHandler(db)
	materialHandler := handler.NewMaterialHandler(db)

	// 3. Inicialização do Router Chi
	r := chi.NewRouter()

	// Middlewares essenciais
	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.RealIP)
	r.Use(chimiddleware.Logger)
	r.Use(chimiddleware.Recoverer)
	r.Use(chimiddleware.Timeout(30 * time.Second))

	allowedOrigins := buildAllowedOrigins()
	log.Printf("🔒 CORS autorizado para origens: %v", allowedOrigins)

	// CORS restrito às origens configuradas (autenticação via header Bearer token, sem cookies)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   allowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token", "X-Requested-With"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: false,
		MaxAge:           300, // 5 minutos
	}))

	// Rota pública de Healthcheck
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"online","sistema":"Barbearia Rocha API","banco":"Neon PostgreSQL"}`))
	})

	// 4. Registro dos Endpoints Principais
	r.Route("/api", func(r chi.Router) {
		// Rota pública: Autenticação por PIN
		r.Post("/auth/pin", authHandler.LoginPIN)

		// Rotas autenticadas (Barbeiro e CEO)
		r.Group(func(r chi.Router) {
			r.Use(authMiddleware.RequireAuth)

			// Lista pública para equipe logada (sem PINs)
			r.Get("/equipe", adminHandler.ListarEquipePublica)

			// Controle de Caixa Diário
			r.Get("/caixa", caixaHandler.ObterCaixaDiario)
			r.Post("/caixa", caixaHandler.RegistrarMovimentacao)

			// Agendamentos de Atendimentos
			r.Get("/agendamentos", agendamentoHandler.ListarAgendamentos)
			r.Post("/agendamentos", agendamentoHandler.CriarAgendamento)
			r.Patch("/agendamentos/{id}", agendamentoHandler.AtualizarStatusAgendamento)

			// Pedidos de Insumos & Materiais (solicitação aberta à bancada)
			r.Get("/materiais", materialHandler.ListarMateriais)
			r.Post("/materiais", materialHandler.CriarPedidoMaterial)

			// Rotas exclusivas do CEO/Admin
			r.Group(func(r chi.Router) {
				r.Use(authMiddleware.RequireAdmin)

				r.Patch("/materiais/{id}", materialHandler.AtualizarStatusMaterial)

				// Painel de Gestão de Equipe (CEO - Limite estrito de 5 cadastros)
				r.Get("/admin/usuarios", adminHandler.ListarUsuarios)
				r.Post("/admin/usuarios", adminHandler.CriarUsuario)
				r.Put("/admin/usuarios/{id}", adminHandler.EditarUsuario)
				r.Delete("/admin/usuarios/{id}", adminHandler.DeletarUsuario)
			})
		})
	})

	// 5. Inicialização com Graceful Shutdown
	addr := fmt.Sprintf(":%s", port)
	srv := &http.Server{
		Addr:         addr,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("==========================================================")
		log.Printf("💈 BARBEARIA ROCHA - API BACKEND (Golang + Neon Postgres)")
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
