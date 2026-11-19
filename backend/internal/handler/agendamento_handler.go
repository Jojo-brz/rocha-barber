package handler

import (
	"encoding/json"
	"errors"
	"log"
	"math"
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

	// Isolamento RBAC: barbeiros veem apenas os próprios agendamentos; CEO vê todos ou filtra por ?barbeiro_id=
	caller, hasCaller := middleware.UsuarioAutenticado(r.Context())
	if !hasCaller {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "Sessão não autenticada"})
		return
	}

	var filtroBarbeiroID *int64
	if !domain.IsAdminRole(caller.Papel) {
		ownID := caller.ID
		filtroBarbeiroID = &ownID
	} else {
		barbeiroIDStr := strings.TrimSpace(r.URL.Query().Get("barbeiro_id"))
		if barbeiroIDStr != "" && strings.ToLower(barbeiroIDStr) != "todos" {
			barbeiroID, err := strconv.ParseInt(barbeiroIDStr, 10, 64)
			if err != nil || barbeiroID <= 0 {
				w.WriteHeader(http.StatusBadRequest)
				json.NewEncoder(w).Encode(map[string]string{"error": "barbeiro_id inválido"})
				return
			}
			filtroBarbeiroID = &barbeiroID
		}
	}

	var filtroData *string
	dataParam := strings.TrimSpace(r.URL.Query().Get("data"))
	if dataParam != "" && dataParam != "todos" {
		if _, err := time.Parse("2006-01-02", dataParam); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "Parâmetro data inválido. Use YYYY-MM-DD"})
			return
		}
		filtroData = &dataParam
	}

	const query = `
		SELECT 
			a.id, a.barbeiro_id, COALESCE(u.nome, 'Barbeiro') as barbeiro_nome,
			a.cliente_nome, a.servico, COALESCE(a.valor, 0), COALESCE(a.forma_pagamento, 'pix'),
			a.data_hora, a.status, a.criado_em
		FROM agendamentos a
		LEFT JOIN usuarios u ON a.barbeiro_id = u.id
		WHERE ($1::bigint IS NULL OR a.barbeiro_id = $1)
		  AND ($2::text IS NULL OR (a.data_hora AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date = $2::date)
		ORDER BY a.data_hora ASC;
	`

	rows, err := h.db.Pool.Query(r.Context(), query, filtroBarbeiroID, filtroData)
	if err != nil {
		log.Printf("[AgendamentoHandler.ListarAgendamentos] erro query: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao consultar agendamentos"})
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
			&a.Valor,
			&a.FormaPagamento,
			&a.DataHora,
			&a.Status,
			&a.CriadoEm,
		)
		if err != nil {
			log.Printf("[AgendamentoHandler.ListarAgendamentos] erro scan: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao mapear agendamento"})
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

	if math.IsNaN(req.Valor) || math.IsInf(req.Valor, 0) || req.Valor < 0 || req.Valor > 1000000 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "O valor do agendamento é inválido"})
		return
	}

	formaNormalizada := domain.FormaPagamento(strings.ToLower(strings.TrimSpace(string(req.FormaPagamento))))
	if formaNormalizada != domain.PagamentoPix &&
		formaNormalizada != domain.PagamentoDinheiro &&
		formaNormalizada != domain.PagamentoCartaoCredito &&
		formaNormalizada != domain.PagamentoCartaoDebito {
		formaNormalizada = domain.PagamentoPix
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

	// Valida se o barbeiro existe e obtém seu nome
	var barbeiroNome string
	err := h.db.Pool.QueryRow(r.Context(), "SELECT nome FROM usuarios WHERE id = $1", req.BarbeiroID).Scan(&barbeiroNome)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Barbeiro informado não encontrado"})
		return
	}

	query := `
		INSERT INTO agendamentos (barbeiro_id, cliente_nome, servico, valor, forma_pagamento, data_hora, status)
		VALUES ($1, $2, $3, $4, $5, $6, 'agendado')
		RETURNING id, criado_em;
	`

	a := domain.Agendamento{
		BarbeiroID:     req.BarbeiroID,
		BarbeiroNome:   barbeiroNome,
		ClienteNome:    req.ClienteNome,
		Servico:        req.Servico,
		Valor:          req.Valor,
		FormaPagamento: formaNormalizada,
		DataHora:       dataHoraUTC,
		Status:         domain.StatusAgendado,
	}

	err = h.db.Pool.QueryRow(
		r.Context(),
		query,
		req.BarbeiroID,
		req.ClienteNome,
		req.Servico,
		req.Valor,
		formaNormalizada,
		dataHoraUTC,
	).Scan(&a.ID, &a.CriadoEm)

	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao criar agendamento: " + err.Error()})
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

	caller, ok := middleware.UsuarioAutenticado(r.Context())
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "Sessão não autenticada"})
		return
	}

	tx, err := h.db.Pool.Begin(r.Context())
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao iniciar atualização do agendamento"})
		return
	}
	defer tx.Rollback(r.Context())

	var barbeiroID int64
	var statusAnterior domain.StatusAgendamento
	err = tx.QueryRow(
		r.Context(),
		"SELECT barbeiro_id, status FROM agendamentos WHERE id = $1 FOR UPDATE",
		id,
	).Scan(&barbeiroID, &statusAnterior)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "Agendamento não encontrado"})
			return
		}
		log.Printf("[AgendamentoHandler.AtualizarStatusAgendamento] erro select: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao consultar agendamento"})
		return
	}

	// Barbeiro só pode alterar agendamentos próprios; CEO/admin pode alterar qualquer um
	if !domain.IsAdminRole(caller.Papel) && barbeiroID != caller.ID {
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]string{"error": "Sem permissão para alterar agendamento de outro profissional"})
		return
	}

	var a domain.Agendamento
	err = tx.QueryRow(
		r.Context(),
		`UPDATE agendamentos a
		 SET status = $1
		 FROM (SELECT id, COALESCE(nome, 'Barbeiro') AS nome FROM usuarios) u
		 WHERE a.id = $2 AND (a.barbeiro_id = u.id OR a.barbeiro_id IS NULL)
		 RETURNING a.id, a.barbeiro_id, u.nome, a.cliente_nome, a.servico, COALESCE(a.valor, 0), COALESCE(a.forma_pagamento, 'pix'), a.data_hora, a.status, a.criado_em`,
		statusNormalizado,
		id,
	).Scan(
		&a.ID,
		&a.BarbeiroID,
		&a.BarbeiroNome,
		&a.ClienteNome,
		&a.Servico,
		&a.Valor,
		&a.FormaPagamento,
		&a.DataHora,
		&a.Status,
		&a.CriadoEm,
	)

	if err != nil {
		log.Printf("[AgendamentoHandler.AtualizarStatusAgendamento] erro update: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao atualizar status do agendamento"})
		return
	}

	// Quando o serviço é concluído pela primeira vez e possui valor > 0, lança automaticamente no faturamento do barbeiro
	if statusNormalizado == domain.StatusConcluido && statusAnterior != domain.StatusConcluido && a.Valor > 0 {
		descricaoCaixa := a.Servico + " - " + a.ClienteNome
		_, err = tx.Exec(
			r.Context(),
			`INSERT INTO movimentacoes_caixa (barbeiro_id, tipo, descricao, valor, forma_pagamento, criado_em)
			 VALUES ($1, 'entrada', $2, $3, $4, ($5::timestamptz AT TIME ZONE 'UTC'))`,
			a.BarbeiroID,
			descricaoCaixa,
			a.Valor,
			a.FormaPagamento,
			a.DataHora.UTC(),
		)
		if err != nil {
			log.Printf("[AgendamentoHandler.AtualizarStatusAgendamento] erro insert caixa: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao registrar faturamento do agendamento concluído"})
			return
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao confirmar conclusão do agendamento"})
		return
	}

	a.HoraFormat = h.formatHoraLocal(a.DataHora)

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(a)
}

// EditarAgendamento permite ao CEO editar os dados de um agendamento
// PUT /api/agendamentos/{id}
func (h *AgendamentoHandler) EditarAgendamento(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if !requireAdminCaller(w, r) {
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "ID do agendamento inválido"})
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
	if req.ClienteNome == "" || req.Servico == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Nome do cliente e serviço são obrigatórios"})
		return
	}

	if math.IsNaN(req.Valor) || math.IsInf(req.Valor, 0) || req.Valor < 0 || req.Valor > 1000000 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "O valor do agendamento é inválido"})
		return
	}

	formaNormalizada := domain.FormaPagamento(strings.ToLower(strings.TrimSpace(string(req.FormaPagamento))))
	if formaNormalizada != domain.PagamentoPix &&
		formaNormalizada != domain.PagamentoDinheiro &&
		formaNormalizada != domain.PagamentoCartaoCredito &&
		formaNormalizada != domain.PagamentoCartaoDebito {
		formaNormalizada = domain.PagamentoPix
	}

	var barbeiroNome string
	if err := h.db.Pool.QueryRow(r.Context(), "SELECT nome FROM usuarios WHERE id = $1", req.BarbeiroID).Scan(&barbeiroNome); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Profissional selecionado não encontrado"})
		return
	}

	dataHoraUTC := req.DataHora.UTC()
	if req.DataHora.IsZero() {
		dataHoraUTC = time.Now().UTC()
	}

	var a domain.Agendamento
	err = h.db.Pool.QueryRow(
		r.Context(),
		`UPDATE agendamentos
		 SET barbeiro_id = $1,
		     cliente_nome = $2,
		     servico = $3,
		     valor = $4,
		     forma_pagamento = $5,
		     data_hora = $6
		 WHERE id = $7
		 RETURNING id, barbeiro_id, cliente_nome, servico, COALESCE(valor, 0), COALESCE(forma_pagamento, 'pix'), data_hora, status, criado_em`,
		req.BarbeiroID,
		req.ClienteNome,
		req.Servico,
		req.Valor,
		formaNormalizada,
		dataHoraUTC,
		id,
	).Scan(
		&a.ID,
		&a.BarbeiroID,
		&a.ClienteNome,
		&a.Servico,
		&a.Valor,
		&a.FormaPagamento,
		&a.DataHora,
		&a.Status,
		&a.CriadoEm,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "Agendamento não encontrado"})
			return
		}
		log.Printf("[AgendamentoHandler.EditarAgendamento] erro update: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao editar agendamento"})
		return
	}

	a.BarbeiroNome = barbeiroNome
	a.HoraFormat = h.formatHoraLocal(a.DataHora)

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(a)
}

// DeletarAgendamento permite ao CEO excluir um agendamento
// DELETE /api/agendamentos/{id}
func (h *AgendamentoHandler) DeletarAgendamento(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if !requireAdminCaller(w, r) {
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "ID do agendamento inválido"})
		return
	}

	cmdTag, err := h.db.Pool.Exec(r.Context(), "DELETE FROM agendamentos WHERE id = $1", id)
	if err != nil {
		log.Printf("[AgendamentoHandler.DeletarAgendamento] erro delete: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao excluir agendamento"})
		return
	}
	if cmdTag.RowsAffected() == 0 {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "Agendamento não encontrado"})
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Agendamento excluído com sucesso"})
}
