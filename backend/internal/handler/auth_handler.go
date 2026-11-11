package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/barbearia-rocha/backend/internal/database"
	"github.com/barbearia-rocha/backend/internal/domain"
	"github.com/jackc/pgx/v5"
)

type AuthHandler struct {
	db *database.DB
}

func NewAuthHandler(db *database.DB) *AuthHandler {
	return &AuthHandler{db: db}
}

// LoginPIN valida o PIN enviado pelo usuário contra a tabela usuarios do Neon
// POST /api/auth/pin
func (h *AuthHandler) LoginPIN(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var req domain.LoginPINRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Payload JSON inválido"})
		return
	}

	if len(req.PIN) == 0 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "O PIN numérico deve ser informado"})
		return
	}

	query := `
		SELECT id, nome, papel 
		FROM usuarios 
		WHERE pin = $1
		LIMIT 1;
	`

	var u domain.Usuario
	err := h.db.Pool.QueryRow(r.Context(), query, req.PIN).Scan(
		&u.ID,
		&u.Nome,
		&u.Papel,
	)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"error": "PIN incorreto ou usuário não cadastrado"})
			return
		}
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao consultar usuário no Neon: " + err.Error()})
		return
	}

	token := fmt.Sprintf("rocha_auth_%d_%s", u.ID, u.Papel)

	resp := domain.AuthResponse{
		ID:    u.ID,
		Nome:  u.Nome,
		Papel: u.Papel,
		Token: token,
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
}
