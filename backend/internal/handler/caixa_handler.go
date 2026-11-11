package handler

import (
	"encoding/json"
	"net/http"

	"github.com/barbearia-rocha/backend/internal/domain"
	"github.com/barbearia-rocha/backend/internal/repository"
)

type CaixaHandler struct {
	repo *repository.Repository
}

func NewCaixaHandler(repo *repository.Repository) *CaixaHandler {
	return &CaixaHandler{repo: repo}
}

// GET /api/v1/caixa/summary
func (h *CaixaHandler) GetSummary(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Método não permitido", http.StatusMethodNotAllowed)
		return
	}

	summary := h.repo.GetDailySummary()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(summary)
}

// GET e POST /api/v1/caixa/transactions
func (h *CaixaHandler) HandleTransactions(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case http.MethodGet:
		transactions := h.repo.GetTransactions()
		json.NewEncoder(w).Encode(transactions)

	case http.MethodPost:
		var tx domain.Transaction
		if err := json.NewDecoder(r.Body).Decode(&tx); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "JSON inválido"})
			return
		}

		if err := h.repo.CreateTransaction(&tx); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(tx)

	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(map[string]string{"error": "Método não suportado"})
	}
}
