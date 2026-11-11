package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/barbearia-rocha/backend/internal/database"
	"github.com/barbearia-rocha/backend/internal/domain"
)

type AgendamentoHandler struct {
	db *database.DB
}

func NewAgendamentoHandler(db *database.DB) *AgendamentoHandler {
	return &AgendamentoHandler{db: db}
}

// ListarAgendamentos retorna os agendamentos da tabela agendamentos do Neon
// GET /api/agendamentos
func (h *AgendamentoHandler) ListarAgendamentos(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	barbeiroIDStr := r.URL.Query().Get("barbeiro_id")
	var barbeiroID int64
	var err error

	query := `
		SELECT 
			a.id, a.barbeiro_id, COALESCE(u.nome, 'Barbeiro') as barbeiro_nome,
			a.cliente_nome, a.servico, a.data_hora, a.status, a.criado_em
		FROM agendamentos a
		LEFT JOIN usuarios u ON a.barbeiro_id = u.id
	`
	args := []any{}

	if barbeiroIDStr != "" {
		barbeiroID, err = strconv.ParseInt(barbeiroIDStr, 10, 64)
		if err == nil && barbeiroID > 0 {
			query += " WHERE a.barbeiro_id = $1"
			args = append(args, barbeiroID)
		}
	}

	query += " ORDER BY a.data_hora ASC;"

	rows, err := h.db.Pool.Query(r.Context(), query, args...)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao consultar agendamentos no Neon: " + err.Error()})
		return
	}
	defer rows.Close()

	agendamentos := make([]domain.Agendamento, 0)
	for rows.Next() {
		var a domain.Agendamento
		err := rows.Scan(
			&a.ID,
			&a.BarbeiroID,
			&a.BarbeiroNome,
			&a.ClienteNome,
			&a.Servico,
			&a.DataHora,
			&a.Status,
			&a.CriadoEm,
		)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao mapear agendamento: " + err.Error()})
			return
		}

		a.HoraFormat = a.DataHora.Format("15:04")
		agendamentos = append(agendamentos, a)
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(agendamentos)
}

// CriarAgendamento registra um novo horário vinculado ao barbeiro
// POST /api/agendamentos
func (h *AgendamentoHandler) CriarAgendamento(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var req domain.NovoAgendamentoRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Payload JSON inválido"})
		return
	}

	if req.ClienteNome == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "O nome do cliente é obrigatório"})
		return
	}

	if req.Servico == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "O serviço é obrigatório"})
		return
	}

	if req.BarbeiroID <= 0 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "O ID do barbeiro é obrigatório"})
		return
	}

	if req.DataHora.IsZero() {
		req.DataHora = time.Now()
	}

	// Valida se o barbeiro existe no Neon
	var barbeiroExiste bool
	err := h.db.Pool.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM usuarios WHERE id = $1)", req.BarbeiroID).Scan(&barbeiroExiste)
	if err != nil || !barbeiroExiste {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Barbeiro informado não encontrado"})
		return
	}

	query := `
		INSERT INTO agendamentos (barbeiro_id, cliente_nome, servico, data_hora, status)
		VALUES ($1, $2, $3, $4, 'agendado')
		RETURNING id, criado_em;
	`

	var a domain.Agendamento
	a.BarbeiroID = req.BarbeiroID
	a.ClienteNome = req.ClienteNome
	a.Servico = req.Servico
	a.DataHora = req.DataHora
	a.Status = domain.StatusAgendado

	err = h.db.Pool.QueryRow(
		r.Context(),
		query,
		req.BarbeiroID,
		req.ClienteNome,
		req.Servico,
		req.DataHora,
	).Scan(&a.ID, &a.CriadoEm)

	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao criar agendamento no Neon: " + err.Error()})
		return
	}

	a.HoraFormat = a.DataHora.Format("15:04")

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(a)
}
