package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/barbearia-rocha/backend/internal/database"
	"github.com/barbearia-rocha/backend/internal/domain"
	"github.com/barbearia-rocha/backend/internal/middleware"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

type AgendamentoHandler struct {
	db  *database.DB
	loc *time.Location
}

func NewAgendamentoHandler(db *database.DB) *AgendamentoHandler {
	return &AgendamentoHandler{db: db, loc: loadSaoPauloLocation()}
}

func (h *AgendamentoHandler) formatHoraLocal(t time.Time) string {
	return t.In(h.loc).Format("15:04")
}

// ListarAgendamentos retorna os agendamentos filtráveis por barbeiro e data (America/Sao_Paulo)
// GET /api/agendamentos?barbeiro_id=X&data=YYYY-MM-DD
func (h *AgendamentoHandler) ListarAgendamentos(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	conditions := make([]string, 0, 2)
	args := make([]any, 0, 2)

	// Isolamento RBAC: barbeiros veem apenas os próprios agendamentos; CEO vê todos ou filtra por ?barbeiro_id=
	caller, hasCaller := middleware.UsuarioAutenticado(r.Context())
	if !hasCaller {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "Sessão não autenticada"})
		return
	}

	if !domain.IsAdminRole(caller.Papel) {
		args = append(args, caller.ID)
		conditions = append(conditions, fmt.Sprintf("a.barbeiro_id = $%d", len(args)))
	} else {
		barbeiroIDStr := strings.TrimSpace(r.URL.Query().Get("barbeiro_id"))
		if barbeiroIDStr != "" && strings.ToLower(barbeiroIDStr) != "todos" {
			barbeiroID, err := strconv.ParseInt(barbeiroIDStr, 10, 64)
			if err != nil || barbeiroID <= 0 {
				w.WriteHeader(http.StatusBadRequest)
				json.NewEncoder(w).Encode(map[string]string{"error": "barbeiro_id inválido"})
				return
			}
			args = append(args, barbeiroID)
			conditions = append(conditions, fmt.Sprintf("a.barbeiro_id = $%d", len(args)))
		}
	}

	dataParam := strings.TrimSpace(r.URL.Query().Get("data"))
	if dataParam != "" && dataParam != "todos" {
		if _, err := time.Parse("2006-01-02", dataParam); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "Parâmetro data inválido. Use YYYY-MM-DD"})
			return
		}
		args = append(args, dataParam)
		conditions = append(
			conditions,
			fmt.Sprintf("(a.data_hora AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date = $%d::date", len(args)),
		)
	}

	query := `
		SELECT 
			a.id, a.barbeiro_id, COALESCE(u.nome, 'Barbeiro') as barbeiro_nome,
			a.cliente_nome, a.servico, a.data_hora, a.status, a.criado_em
		FROM agendamentos a
		LEFT JOIN usuarios u ON a.barbeiro_id = u.id
	`
	if len(conditions) > 0 {
		query += " WHERE " + strings.Join(conditions, " AND ")
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

		a.HoraFormat = h.formatHoraLocal(a.DataHora)
		agendamentos = append(agendamentos, a)
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(agendamentos)
}

// CriarAgendamento registra um novo horário vinculado ao barbeiro
// POST /api/agendamentos
func (h *AgendamentoHandler) CriarAgendamento(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	caller, hasCaller := middleware.UsuarioAutenticado(r.Context())
	if !hasCaller {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "Sessão não autenticada"})
		return
	}

	var req domain.NovoAgendamentoRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Payload JSON inválido"})
		return
	}

	req.ClienteNome = strings.TrimSpace(req.ClienteNome)
	req.Servico = strings.TrimSpace(req.Servico)

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

	// Isolamento RBAC: barbeiro só pode criar agendamentos para si mesmo
	if !domain.IsAdminRole(caller.Papel) {
		req.BarbeiroID = caller.ID
	} else if req.BarbeiroID <= 0 {
		req.BarbeiroID = caller.ID
	}

	if req.DataHora.IsZero() {
		req.DataHora = time.Now()
	}
	dataHoraUTC := req.DataHora.UTC()

	// Valida se o barbeiro existe no Neon e obtém seu nome
	var barbeiroNome string
	err := h.db.Pool.QueryRow(r.Context(), "SELECT nome FROM usuarios WHERE id = $1", req.BarbeiroID).Scan(&barbeiroNome)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Barbeiro informado não encontrado"})
		return
	}

	query := `
		INSERT INTO agendamentos (barbeiro_id, cliente_nome, servico, data_hora, status)
		VALUES ($1, $2, $3, $4, 'agendado')
		RETURNING id, criado_em;
	`

	a := domain.Agendamento{
		BarbeiroID:   req.BarbeiroID,
		BarbeiroNome: barbeiroNome,
		ClienteNome:  req.ClienteNome,
		Servico:      req.Servico,
		DataHora:     dataHoraUTC,
		Status:       domain.StatusAgendado,
	}

	err = h.db.Pool.QueryRow(
		r.Context(),
		query,
		req.BarbeiroID,
		req.ClienteNome,
		req.Servico,
		dataHoraUTC,
	).Scan(&a.ID, &a.CriadoEm)

	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao criar agendamento no Neon: " + err.Error()})
		return
	}

	a.HoraFormat = h.formatHoraLocal(a.DataHora)

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(a)
}

// AtualizarStatusAgendamento altera o status de um agendamento ('agendado', 'concluido', 'cancelado')
// PATCH /api/agendamentos/{id}
func (h *AgendamentoHandler) AtualizarStatusAgendamento(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "ID do agendamento inválido"})
		return
	}

	var req domain.AtualizarStatusAgendamentoRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Payload JSON inválido"})
		return
	}

	statusNormalizado := domain.StatusAgendamento(strings.ToLower(strings.TrimSpace(string(req.Status))))
	if statusNormalizado != domain.StatusAgendado &&
		statusNormalizado != domain.StatusConcluido &&
		statusNormalizado != domain.StatusCancelado {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Status inválido. Use 'agendado', 'concluido' ou 'cancelado'"})
		return
	}

	var barbeiroID int64
	err = h.db.Pool.QueryRow(r.Context(), "SELECT barbeiro_id FROM agendamentos WHERE id = $1", id).Scan(&barbeiroID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "Agendamento não encontrado"})
			return
		}
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao consultar agendamento: " + err.Error()})
		return
	}

	// Barbeiro só pode alterar agendamentos próprios; CEO/admin pode alterar qualquer um
	caller, ok := middleware.UsuarioAutenticado(r.Context())
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "Sessão não autenticada"})
		return
	}
	if !domain.IsAdminRole(caller.Papel) && barbeiroID != caller.ID {
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]string{"error": "Sem permissão para alterar agendamento de outro profissional"})
		return
	}

	var a domain.Agendamento
	err = h.db.Pool.QueryRow(
		r.Context(),
		`UPDATE agendamentos a
		 SET status = $1
		 FROM (SELECT id, COALESCE(nome, 'Barbeiro') AS nome FROM usuarios) u
		 WHERE a.id = $2 AND (a.barbeiro_id = u.id OR a.barbeiro_id IS NULL)
		 RETURNING a.id, a.barbeiro_id, u.nome, a.cliente_nome, a.servico, a.data_hora, a.status, a.criado_em`,
		statusNormalizado,
		id,
	).Scan(
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
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao atualizar status do agendamento: " + err.Error()})
		return
	}

	a.HoraFormat = h.formatHoraLocal(a.DataHora)

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(a)
}

// DeletarAgendamento remove um agendamento garantindo que barbeiros só excluam os próprios registros
// DELETE /api/agendamentos/{id}
func (h *AgendamentoHandler) DeletarAgendamento(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	caller, ok := middleware.UsuarioAutenticado(r.Context())
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "Sessão não autenticada"})
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "ID do agendamento inválido"})
		return
	}

	var barbeiroID int64
	err = h.db.Pool.QueryRow(r.Context(), "SELECT barbeiro_id FROM agendamentos WHERE id = $1", id).Scan(&barbeiroID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "Agendamento não encontrado"})
			return
		}
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao consultar agendamento: " + err.Error()})
		return
	}

	if !domain.IsAdminRole(caller.Papel) && barbeiroID != caller.ID {
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]string{"error": "Sem permissão para excluir agendamento de outro profissional"})
		return
	}

	_, err = h.db.Pool.Exec(r.Context(), "DELETE FROM agendamentos WHERE id = $1", id)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao excluir agendamento: " + err.Error()})
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Agendamento excluído com sucesso"})
}
