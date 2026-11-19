package handler

import (
	"encoding/json"
	"errors"
	"fmt"
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

func loadSaoPauloLocation() *time.Location {
	loc, err := time.LoadLocation("America/Sao_Paulo")
	if err != nil {
		return time.FixedZone("BRT", -3*3600)
	}
	return loc
}

type CaixaHandler struct {
	db  *database.DB
	loc *time.Location
}

func NewCaixaHandler(db *database.DB) *CaixaHandler {
	return &CaixaHandler{
		db:  db,
		loc: loadSaoPauloLocation(),
	}
}

func resolverPeriodoCaixa(raw string) (string, bool) {
	p := strings.ToLower(strings.TrimSpace(raw))
	if p == "" {
		return "diario", true
	}
	switch p {
	case "diario", "semanal", "mensal":
		return p, true
	default:
		return "", false
	}
}

func resolverDataReferencia(raw string, loc *time.Location, now time.Time) (string, time.Time, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		hojeLocal := now.In(loc)
		str := hojeLocal.Format("2006-01-02")
		parsed, _ := time.ParseInLocation("2006-01-02", str, loc)
		return str, parsed, nil
	}
	parsed, err := time.ParseInLocation("2006-01-02", trimmed, loc)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("formato de data inválido; use AAAA-MM-DD")
	}
	return parsed.Format("2006-01-02"), parsed, nil
}

func resolverTimestampLancamento(dataParam *string, loc *time.Location, now time.Time) (time.Time, error) {
	if dataParam == nil || strings.TrimSpace(*dataParam) == "" {
		return now.UTC(), nil
	}
	_, dataLocal, err := resolverDataReferencia(*dataParam, loc, now)
	if err != nil {
		return time.Time{}, err
	}
	agoraLocal := now.In(loc)
	combinado := time.Date(
		dataLocal.Year(),
		dataLocal.Month(),
		dataLocal.Day(),
		agoraLocal.Hour(),
		agoraLocal.Minute(),
		agoraLocal.Second(),
		agoraLocal.Nanosecond(),
		loc,
	)
	return combinado.UTC(), nil
}

func (h *CaixaHandler) preencherDataHoraLocal(m *domain.MovimentacaoCaixa) {
	local := m.CriadoEm.In(h.loc)
	m.DataFormatada = local.Format("02/01/2006")
	m.HoraFormatada = local.Format("15:04")
}

// ObterCaixaDiario lista as movimentações filtradas por período (diario, semanal ou mensal)
// e aplica isolamento RBAC: barbeiros veem apenas o próprio caixa; CEO vê global ou filtra por ?barbeiro_id=
// GET /api/caixa?periodo=diario|semanal|mensal&data=AAAA-MM-DD&barbeiro_id=X
func (h *CaixaHandler) ObterCaixaDiario(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	caller, hasCaller := middleware.UsuarioAutenticado(r.Context())
	if !hasCaller {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "Sessão não autenticada"})
		return
	}

	isAdmin := domain.IsAdminRole(caller.Papel)
	var filtroBarbeiroID *int64
	if !isAdmin {
		ownID := caller.ID
		filtroBarbeiroID = &ownID
	} else {
		barbeiroIDStr := strings.TrimSpace(r.URL.Query().Get("barbeiro_id"))
		if barbeiroIDStr != "" && strings.ToLower(barbeiroIDStr) != "todos" {
			parsedID, err := strconv.ParseInt(barbeiroIDStr, 10, 64)
			if err != nil || parsedID <= 0 {
				w.WriteHeader(http.StatusBadRequest)
				json.NewEncoder(w).Encode(map[string]string{"error": "barbeiro_id inválido"})
				return
			}
			filtroBarbeiroID = &parsedID
		}
	}

	periodo, ok := resolverPeriodoCaixa(r.URL.Query().Get("periodo"))
	if !ok {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Período inválido. Use 'diario', 'semanal' ou 'mensal'"})
		return
	}

	dataRefStr, _, err := resolverDataReferencia(r.URL.Query().Get("data"), h.loc, time.Now())
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	// 1. Consolidado simultâneo Diário, Semanal (segunda a domingo) e Mensal para a data de referência.
	// Apenas o CEO/Admin ($3 = true) visualiza as despesas (saídas); barbeiros ($3 = false) veem apenas entradas.
	resumoPeriodosQuery := `
		WITH mov_local AS (
			SELECT
				m.tipo,
				m.valor,
				(m.criado_em AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date AS data_local
			FROM movimentacoes_caixa m
			WHERE (
				date_trunc('month', (m.criado_em AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date) = date_trunc('month', $1::date)
				OR date_trunc('week', (m.criado_em AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date) = date_trunc('week', $1::date)
			)
			AND ($2::bigint IS NULL OR m.barbeiro_id = $2)
			AND ($3::boolean OR m.tipo = 'entrada')
		)
		SELECT
			COALESCE(SUM(CASE WHEN data_local = $1::date AND tipo = 'entrada' THEN valor ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN data_local = $1::date AND tipo = 'saida' THEN valor ELSE 0 END), 0),
			COALESCE(COUNT(*) FILTER (WHERE data_local = $1::date), 0),
			COALESCE(SUM(CASE WHEN date_trunc('week', data_local) = date_trunc('week', $1::date) AND tipo = 'entrada' THEN valor ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN date_trunc('week', data_local) = date_trunc('week', $1::date) AND tipo = 'saida' THEN valor ELSE 0 END), 0),
			COALESCE(COUNT(*) FILTER (WHERE date_trunc('week', data_local) = date_trunc('week', $1::date)), 0),
			COALESCE(SUM(CASE WHEN date_trunc('month', data_local) = date_trunc('month', $1::date) AND tipo = 'entrada' THEN valor ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN date_trunc('month', data_local) = date_trunc('month', $1::date) AND tipo = 'saida' THEN valor ELSE 0 END), 0),
			COALESCE(COUNT(*) FILTER (WHERE date_trunc('month', data_local) = date_trunc('month', $1::date)), 0)
		FROM mov_local;
	`

	var periodos domain.FaturamentoPeriodos
	periodos.DataReferencia = dataRefStr

	err = h.db.Pool.QueryRow(r.Context(), resumoPeriodosQuery, dataRefStr, filtroBarbeiroID, isAdmin).Scan(
		&periodos.Diario.Entradas,
		&periodos.Diario.Saidas,
		&periodos.Diario.TotalMovimentacoes,
		&periodos.Semanal.Entradas,
		&periodos.Semanal.Saidas,
		&periodos.Semanal.TotalMovimentacoes,
		&periodos.Mensal.Entradas,
		&periodos.Mensal.Saidas,
		&periodos.Mensal.TotalMovimentacoes,
	)
	if err != nil {
		log.Printf("[CaixaHandler.ObterCaixaDiario] erro ao consolidar faturamento: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao consolidar faturamento por período"})
		return
	}

	periodos.Diario.SaldoLiquido = periodos.Diario.Entradas - periodos.Diario.Saidas
	periodos.Semanal.SaldoLiquido = periodos.Semanal.Entradas - periodos.Semanal.Saidas
	periodos.Mensal.SaldoLiquido = periodos.Mensal.Entradas - periodos.Mensal.Saidas

	// 2. Movimentações do período selecionado (100% parametrizada com $1, $2, $3 e $4)
	const query = `
		SELECT
			m.id, m.barbeiro_id, COALESCE(u.nome, 'Geral/Caixa') as barbeiro_nome,
			m.tipo, COALESCE(m.categoria, ''), m.descricao, m.valor, COALESCE(m.forma_pagamento, 'dinheiro'), m.criado_em
		FROM movimentacoes_caixa m
		LEFT JOIN usuarios u ON m.barbeiro_id = u.id
		WHERE (
			($3 = 'diario' AND (m.criado_em AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date = $1::date)
			OR ($3 = 'semanal' AND date_trunc('week', (m.criado_em AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date) = date_trunc('week', $1::date))
			OR ($3 = 'mensal' AND date_trunc('month', (m.criado_em AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date) = date_trunc('month', $1::date))
		)
		AND ($2::bigint IS NULL OR m.barbeiro_id = $2)
		AND ($4::boolean OR m.tipo = 'entrada')
		ORDER BY m.criado_em DESC;
	`

	rows, err := h.db.Pool.Query(r.Context(), query, dataRefStr, filtroBarbeiroID, periodo, isAdmin)
	if err != nil {
		log.Printf("[CaixaHandler.ObterCaixaDiario] erro ao buscar movimentacoes: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao buscar movimentações de caixa"})
		return
	}
	defer rows.Close()

	movimentacoes := make([]domain.MovimentacaoCaixa, 0)
	var totalEntradas, totalSaidas float64
	var totaisFormas domain.FormasPagamentoTotais

	for rows.Next() {
		var m domain.MovimentacaoCaixa
		err := rows.Scan(
			&m.ID,
			&m.BarbeiroID,
			&m.BarbeiroNome,
			&m.Tipo,
			&m.Categoria,
			&m.Descricao,
			&m.Valor,
			&m.FormaPagamento,
			&m.CriadoEm,
		)
		if err != nil {
			log.Printf("[CaixaHandler.ObterCaixaDiario] erro scan: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao mapear linhas do caixa"})
			return
		}

		h.preencherDataHoraLocal(&m)

		if m.Tipo == domain.TipoEntrada {
			totalEntradas += m.Valor
			switch m.FormaPagamento {
			case domain.PagamentoPix:
				totaisFormas.Pix += m.Valor
			case domain.PagamentoDinheiro:
				totaisFormas.Dinheiro += m.Valor
			case domain.PagamentoCartaoCredito:
				totaisFormas.CartaoCredito += m.Valor
			case domain.PagamentoCartaoDebito:
				totaisFormas.CartaoDebito += m.Valor
			}
		} else if m.Tipo == domain.TipoSaida {
			totalSaidas += m.Valor
		}

		movimentacoes = append(movimentacoes, m)
	}

	resumo := domain.ResumoCaixaResponse{
		Periodo:             periodo,
		DataReferencia:      dataRefStr,
		BarbeiroIDFiltro:    filtroBarbeiroID,
		SaldoLiquido:        totalEntradas - totalSaidas,
		TotalEntradas:       totalEntradas,
		TotalSaidas:         totalSaidas,
		TotalMovimentacoes:  len(movimentacoes),
		PorFormaPagamento:   totaisFormas,
		FaturamentoPeriodos: periodos,
		Movimentacoes:       movimentacoes,
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resumo)
}

// RegistrarMovimentacao cadastra uma nova entrada ou saída no caixa vinculada ao barbeiro
// POST /api/caixa
func (h *CaixaHandler) RegistrarMovimentacao(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	caller, hasCaller := middleware.UsuarioAutenticado(r.Context())
	if !hasCaller {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "Sessão não autenticada"})
		return
	}

	var req domain.NovaMovimentacaoRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Payload JSON inválido"})
		return
	}

	// Isolamento RBAC: barbeiro só pode lançar movimentações no próprio ID; CEO pode selecionar ou usar o próprio
	targetBarbeiroID := caller.ID
	targetBarbeiroNome := caller.Nome
	if domain.IsAdminRole(caller.Papel) && req.BarbeiroID != nil && *req.BarbeiroID > 0 {
		var nomeEncontrado string
		err := h.db.Pool.QueryRow(r.Context(), "SELECT nome FROM usuarios WHERE id = $1", *req.BarbeiroID).Scan(&nomeEncontrado)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "Profissional selecionado não encontrado"})
			return
		}
		targetBarbeiroID = *req.BarbeiroID
		targetBarbeiroNome = nomeEncontrado
	}
	req.BarbeiroID = &targetBarbeiroID

	if math.IsNaN(req.Valor) || math.IsInf(req.Valor, 0) || req.Valor <= 0 || req.Valor > 1000000 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "O valor da movimentação deve ser maior que zero e válido"})
		return
	}

	// Normaliza para minúsculo conforme os CHECK constraints do Neon: 'entrada' / 'saida'
	tipoNormalizado := domain.TipoMovimentacao(strings.ToLower(string(req.Tipo)))
	if tipoNormalizado != domain.TipoEntrada && tipoNormalizado != domain.TipoSaida {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Tipo inválido. Deve ser 'entrada' ou 'saida'"})
		return
	}

	// Normaliza forma de pagamento: 'pix', 'dinheiro', 'cartao_credito', 'cartao_debito'
	formaNormalizada := domain.FormaPagamento(strings.ToLower(string(req.FormaPagamento)))
	if formaNormalizada == "cartao" {
		formaNormalizada = domain.PagamentoCartaoCredito
	}

	if formaNormalizada != domain.PagamentoPix &&
		formaNormalizada != domain.PagamentoDinheiro &&
		formaNormalizada != domain.PagamentoCartaoCredito &&
		formaNormalizada != domain.PagamentoCartaoDebito {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Forma de pagamento inválida. Use pix, dinheiro, cartao_credito ou cartao_debito"})
		return
	}

	// Normaliza categoria de despesa ("USO DIARIO" ou "DESPESA GERAL")
	categoriaNormalizada := strings.ToUpper(strings.TrimSpace(req.Categoria))
	if tipoNormalizado == domain.TipoSaida {
		if categoriaNormalizada == "USO DIÁRIO" || categoriaNormalizada == "USO_DIARIO" || categoriaNormalizada == "USO DIARIO" {
			categoriaNormalizada = "USO DIARIO"
		} else if categoriaNormalizada == "" {
			categoriaNormalizada = "DESPESA GERAL"
		}
	} else {
		categoriaNormalizada = ""
	}

	if strings.TrimSpace(req.Descricao) == "" {
		if tipoNormalizado == domain.TipoEntrada {
			req.Descricao = "Serviço Avulso de Bancada"
		} else if categoriaNormalizada == "USO DIARIO" {
			req.Descricao = "Compra / Insumo de Uso Diário"
		} else {
			req.Descricao = "Despesa Operacional"
		}
	}

	criadoEmUTC, err := resolverTimestampLancamento(req.Data, h.loc, time.Now())
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	query := `
		INSERT INTO movimentacoes_caixa (barbeiro_id, tipo, categoria, descricao, valor, forma_pagamento, criado_em)
		VALUES ($1, $2, NULLIF($3, ''), $4, $5, $6, ($7::timestamptz AT TIME ZONE 'UTC'))
		RETURNING id, criado_em;
	`

	var id int64
	var criadoEm time.Time
	err = h.db.Pool.QueryRow(
		r.Context(),
		query,
		req.BarbeiroID,
		tipoNormalizado,
		categoriaNormalizada,
		req.Descricao,
		req.Valor,
		formaNormalizada,
		criadoEmUTC,
	).Scan(&id, &criadoEm)

	if err != nil {
		log.Printf("[CaixaHandler.RegistrarMovimentacao] erro insert: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao gravar movimentação"})
		return
	}

	resp := domain.MovimentacaoCaixa{
		ID:             id,
		BarbeiroID:     req.BarbeiroID,
		BarbeiroNome:   targetBarbeiroNome,
		Tipo:           tipoNormalizado,
		Categoria:      categoriaNormalizada,
		Descricao:      req.Descricao,
		Valor:          req.Valor,
		FormaPagamento: formaNormalizada,
		CriadoEm:       criadoEm,
	}
	h.preencherDataHoraLocal(&resp)

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(resp)
}

// EditarMovimentacao permite ao CEO editar qualquer lançamento do caixa
// PUT /api/caixa/{id}
func (h *CaixaHandler) EditarMovimentacao(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if !requireAdminCaller(w, r) {
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "ID da movimentação inválido"})
		return
	}

	var req domain.NovaMovimentacaoRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Payload JSON inválido"})
		return
	}

	if math.IsNaN(req.Valor) || math.IsInf(req.Valor, 0) || req.Valor <= 0 || req.Valor > 1000000 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "O valor da movimentação deve ser maior que zero e válido"})
		return
	}

	tipoNormalizado := domain.TipoMovimentacao(strings.ToLower(strings.TrimSpace(string(req.Tipo))))
	if tipoNormalizado != domain.TipoEntrada && tipoNormalizado != domain.TipoSaida {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Tipo inválido. Deve ser 'entrada' ou 'saida'"})
		return
	}

	formaNormalizada := domain.FormaPagamento(strings.ToLower(strings.TrimSpace(string(req.FormaPagamento))))
	if formaNormalizada == "cartao" {
		formaNormalizada = domain.PagamentoCartaoCredito
	}
	if formaNormalizada != domain.PagamentoPix &&
		formaNormalizada != domain.PagamentoDinheiro &&
		formaNormalizada != domain.PagamentoCartaoCredito &&
		formaNormalizada != domain.PagamentoCartaoDebito {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Forma de pagamento inválida"})
		return
	}

	categoriaNormalizada := strings.ToUpper(strings.TrimSpace(req.Categoria))
	if tipoNormalizado == domain.TipoSaida {
		if categoriaNormalizada == "USO DIÁRIO" || categoriaNormalizada == "USO_DIARIO" || categoriaNormalizada == "USO DIARIO" {
			categoriaNormalizada = "USO DIARIO"
		} else if categoriaNormalizada == "" {
			categoriaNormalizada = "DESPESA GERAL"
		}
	} else {
		categoriaNormalizada = ""
	}

	req.Descricao = strings.TrimSpace(req.Descricao)
	if req.Descricao == "" {
		if tipoNormalizado == domain.TipoEntrada {
			req.Descricao = "Serviço Avulso de Bancada"
		} else if categoriaNormalizada == "USO DIARIO" {
			req.Descricao = "Compra / Insumo de Uso Diário"
		} else {
			req.Descricao = "Despesa Operacional"
		}
	}

	var criadoEmAtual time.Time
	var barbeiroAtual *int64
	err = h.db.Pool.QueryRow(
		r.Context(),
		"SELECT criado_em, barbeiro_id FROM movimentacoes_caixa WHERE id = $1",
		id,
	).Scan(&criadoEmAtual, &barbeiroAtual)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "Lançamento não encontrado"})
			return
		}
		log.Printf("[CaixaHandler.EditarMovimentacao] erro select: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao consultar lançamento"})
		return
	}

	targetBarbeiroID := barbeiroAtual
	if req.BarbeiroID != nil && *req.BarbeiroID > 0 {
		targetBarbeiroID = req.BarbeiroID
	}

	novoCriadoEmUTC := criadoEmAtual
	if req.Data != nil && strings.TrimSpace(*req.Data) != "" {
		ts, err := resolverTimestampLancamento(req.Data, h.loc, criadoEmAtual)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
		novoCriadoEmUTC = ts
	}

	var m domain.MovimentacaoCaixa
	err = h.db.Pool.QueryRow(
		r.Context(),
		`WITH updated AS (
			UPDATE movimentacoes_caixa
			SET barbeiro_id = $1,
			    tipo = $2,
			    categoria = NULLIF($3, ''),
			    descricao = $4,
			    valor = $5,
			    forma_pagamento = $6,
			    criado_em = ($7::timestamptz AT TIME ZONE 'UTC')
			WHERE id = $8
			RETURNING id, barbeiro_id, tipo, COALESCE(categoria, '') AS categoria, descricao, valor, forma_pagamento, criado_em
		)
		SELECT up.id, up.barbeiro_id, COALESCE(u.nome, 'Geral/Caixa'), up.tipo, up.categoria, up.descricao, up.valor, up.forma_pagamento, up.criado_em
		FROM updated up
		LEFT JOIN usuarios u ON up.barbeiro_id = u.id`,
		targetBarbeiroID,
		tipoNormalizado,
		categoriaNormalizada,
		req.Descricao,
		req.Valor,
		formaNormalizada,
		novoCriadoEmUTC,
		id,
	).Scan(
		&m.ID,
		&m.BarbeiroID,
		&m.BarbeiroNome,
		&m.Tipo,
		&m.Categoria,
		&m.Descricao,
		&m.Valor,
		&m.FormaPagamento,
		&m.CriadoEm,
	)
	if err != nil {
		log.Printf("[CaixaHandler.EditarMovimentacao] erro update: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao atualizar lançamento do caixa"})
		return
	}

	h.preencherDataHoraLocal(&m)
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(m)
}

// DeletarMovimentacao permite ao CEO excluir qualquer lançamento do caixa
// DELETE /api/caixa/{id}
func (h *CaixaHandler) DeletarMovimentacao(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if !requireAdminCaller(w, r) {
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "ID da movimentação inválido"})
		return
	}

	cmdTag, err := h.db.Pool.Exec(r.Context(), "DELETE FROM movimentacoes_caixa WHERE id = $1", id)
	if err != nil {
		log.Printf("[CaixaHandler.DeletarMovimentacao] erro delete: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao excluir lançamento do caixa"})
		return
	}
	if cmdTag.RowsAffected() == 0 {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "Lançamento não encontrado"})
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Lançamento excluído com sucesso"})
}
