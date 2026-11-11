package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/barbearia-rocha/backend/internal/handler"
	"github.com/barbearia-rocha/backend/internal/middleware"
	"github.com/barbearia-rocha/backend/internal/repository"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// 1. Inicializar Repositório em memória
	repo := repository.NewRepository()

	// 2. Inicializar Handlers
	authH := handler.NewAuthHandler(repo)
	caixaH := handler.NewCaixaHandler(repo)
	teamH := handler.NewTeamHandler(repo)
	agendaH := handler.NewAgendaHandler(repo)

	// 3. Configurar Multiplexador de Rotas
	mux := http.NewServeMux()

	// Healthcheck
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok","app":"Barbearia Rocha API","version":"1.0.0"}`))
	})

	// Rotas da API v1
	mux.HandleFunc("/api/v1/auth/pin", authH.LoginByPIN)
	mux.HandleFunc("/api/v1/caixa/summary", caixaH.GetSummary)
	mux.HandleFunc("/api/v1/caixa/transactions", caixaH.HandleTransactions)
	mux.HandleFunc("/api/v1/team", teamH.HandleTeam)
	mux.HandleFunc("/api/v1/team/", teamH.HandleTeam)
	mux.HandleFunc("/api/v1/agenda", agendaH.HandleAppointments)
	mux.HandleFunc("/api/v1/agenda/", agendaH.HandleAppointments)
	mux.HandleFunc("/api/v1/materiais", agendaH.HandleMaterials)

	// 4. Envolver com Middlewares (CORS + Logger)
	wrappedMux := middleware.Logger(middleware.CORS(mux))

	// 5. Iniciar Servidor
	addr := fmt.Sprintf(":%s", port)
	log.Printf("==========================================================")
	log.Printf("💈 BARBEARIA ROCHA - API BACKEND (Golang)")
	log.Printf("🚀 Servidor HTTP rodando na porta %s", addr)
	log.Printf("👉 URL de Acesso: http://localhost:%s", port)
	log.Printf("🔒 Regra de Negócio: Limite estrito de 5 colaboradores")
	log.Printf("==========================================================")

	if err := http.ListenAndServe(addr, wrappedMux); err != nil {
		log.Fatalf("Falha crítica ao inicializar servidor HTTP: %v", err)
	}
}
