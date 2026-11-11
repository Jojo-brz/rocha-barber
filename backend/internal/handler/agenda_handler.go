package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/barbearia-rocha/backend/internal/domain"
	"github.com/barbearia-rocha/backend/internal/repository"
)

type AgendaHandler struct {
	repo *repository.Repository
}

func NewAgendaHandler(repo *repository.Repository) *AgendaHandler {
	return &AgendaHandler{repo: repo}
}

// GET /api/v1/agenda e PATCH /api/v1/agenda/{id}/status
func (h *AgendaHandler) HandleAppointments(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	path := strings.TrimPrefix(r.URL.Path, "/api/v1/agenda")
	path = strings.TrimPrefix(path, "/")

	if path == "" {
		if r.Method == http.MethodGet {
			apps := h.repo.GetAppointments()
			json.NewEncoder(w).Encode(apps)
			return
		}
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	// PATCH /api/v1/agenda/{id}
	parts := strings.Split(path, "/")
	id := parts[0]

	if r.Method == http.MethodPatch || r.Method == http.MethodPut {
		var body struct {
			Status domain.AppointmentStatus `json:"status"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "JSON inválido"})
			return
		}

		if err := h.repo.UpdateAppointmentStatus(id, body.Status); err != nil {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"message": "Status atualizado"})
		return
	}

	w.WriteHeader(http.StatusMethodNotAllowed)
}

// GET /api/v1/materiais e POST /api/v1/materiais
func (h *AgendaHandler) HandleMaterials(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case http.MethodGet:
		requests := h.repo.GetMaterialRequests()
		json.NewEncoder(w).Encode(requests)

	case http.MethodPost:
		var req domain.MaterialRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "JSON inválido"})
			return
		}

		if err := h.repo.CreateMaterialRequest(&req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(req)

	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}
