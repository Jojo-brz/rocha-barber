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

	"github.com/barbearia-rocha/backend/internal/database"
	"github.com/barbearia-rocha/backend/internal/handler"
	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/joho/godotenv"
)

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

	// 2. Inicialização dos Handlers da API
	authHandler := handler.NewAuthHandler(db)
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

	// Configuração do CORS para integração com Next.js (Local, Vercel ou dispositivos móveis)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"https://*", "http://*"},
		AllowOriginFunc:  func(r *http.Request, origin string) bool { return true },
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token", "X-Requested-With"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300, // 5 minutos
	}))

	// Rota de Healthcheck
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"online","sistema":"Barbearia Rocha API","banco":"Neon PostgreSQL"}`))
	})

	// 4. Registro dos Endpoints Principais
	r.Route("/api", func(r chi.Router) {
		// Autenticação Rápida de Bancada por PIN
		r.Post("/auth/pin", authHandler.LoginPIN)

		// Controle de Caixa Diário
		r.Get("/caixa", caixaHandler.ObterCaixaDiario)
		r.Post("/caixa", caixaHandler.RegistrarMovimentacao)

		// Agendamentos de Atendimentos
		r.Get("/agendamentos", agendamentoHandler.ListarAgendamentos)
		r.Post("/agendamentos", agendamentoHandler.CriarAgendamento)

		// Pedidos de Insumos & Materiais
		r.Get("/materiais", materialHandler.ListarMateriais)
		r.Post("/materiais", materialHandler.CriarPedidoMaterial)

		// Painel de Gestão de Equipe (CEO - Limite estrito de 5 cadastros)
		r.Get("/admin/usuarios", adminHandler.ListarUsuarios)
		r.Post("/admin/usuarios", adminHandler.CriarUsuario)
		r.Put("/admin/usuarios/{id}", adminHandler.EditarUsuario)
		r.Delete("/admin/usuarios/{id}", adminHandler.DeletarUsuario)
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
