package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/barbearia-rocha/backend/internal/domain"
	"github.com/barbearia-rocha/backend/internal/repository"
)

type TeamHandler struct {
	repo *repository.Repository
}

func NewTeamHandler(repo *repository.Repository) *TeamHandler {
	return &TeamHandler{repo: repo}
}

// Roteador de Equipe: GET /api/v1/team, POST /api/v1/team, PUT /api/v1/team/{id}, DELETE /api/v1/team/{id}
func (h *TeamHandler) HandleTeam(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	path := strings.TrimPrefix(r.URL.Path, "/api/v1/team")
	path = strings.TrimPrefix(path, "/")

	if path == "" {
		switch r.Method {
		case http.MethodGet:
			users := h.repo.GetUsers()
			json.NewEncoder(w).Encode(users)
			return

		case http.MethodPost:
			var newUser domain.User
			if err := json.NewDecoder(r.Body).Decode(&newUser); err != nil {
				w.WriteHeader(http.StatusBadRequest)
				json.NewEncoder(w).Encode(map[string]string{"error": "Payload inválido"})
				return
			}

			// Chama repositório que valida teto de 5 membros e duplicidade de PIN
			if err := h.repo.CreateUser(&newUser); err != nil {
				w.WriteHeader(http.StatusBadRequest)
				json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
				return
			}

			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(newUser)
			return

		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
			json.NewEncoder(w).Encode(map[string]string{"error": "Método não permitido"})
			return
		}
	}

	// Operações por ID: /api/v1/team/{id}
	userID := path
	switch r.Method {
	case http.MethodPut:
		var updates domain.User
		if err := json.NewDecoder(r.Body).Decode(&updates); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "Payload inválido"})
			return
		}

		if err := h.repo.UpdateUser(userID, &updates); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"message": "Colaborador atualizado com sucesso"})

	case http.MethodDelete:
		if err := h.repo.DeleteUser(userID); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"message": "Colaborador removido da equipe"})

	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(map[string]string{"error": "Método não permitido"})
	}
}
