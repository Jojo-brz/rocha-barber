package handler

import (
	"encoding/json"
	"net/http"

	"github.com/barbearia-rocha/backend/internal/domain"
	"github.com/barbearia-rocha/backend/internal/repository"
)

type AuthHandler struct {
	repo *repository.Repository
}

func NewAuthHandler(repo *repository.Repository) *AuthHandler {
	return &AuthHandler{repo: repo}
}

type PINLoginRequest struct {
	PIN string `json:"pin"`
}

type AuthResponse struct {
	User  *domain.User `json:"user"`
	Token string       `json:"token"`
}

// POST /api/v1/auth/pin
func (h *AuthHandler) LoginByPIN(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Método não permitido", http.StatusMethodNotAllowed)
		return
	}

	var req PINLoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Payload JSON inválido"})
		return
	}

	if len(req.PIN) != 4 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "O PIN deve conter exatamente 4 dígitos numéricos"})
		return
	}

	user, err := h.repo.AuthenticateByPIN(req.PIN)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "PIN não reconhecido ou colaborador inativo"})
		return
	}

	// Token de sessão assinado (simulado para integração com frontend)
	fakeJWT := "bearer_rocha_" + user.ID + "_" + string(user.Role)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(AuthResponse{
		User:  user,
		Token: fakeJWT,
	})
}
