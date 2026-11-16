package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/barbearia-rocha/backend/internal/database"
	"github.com/barbearia-rocha/backend/internal/domain"
	"github.com/barbearia-rocha/backend/internal/middleware"
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

	var filtroBarbeiroID *int64
	if !domain.IsAdminRole(caller.Papel) {
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

	// 1. Consolidado simultâneo Diário, Semanal (segunda a domingo) e Mensal para a data de referência (com filtro RBAC)
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

	err = h.db.Pool.QueryRow(r.Context(), resumoPeriodosQuery, dataRefStr, filtroBarbeiroID).Scan(
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
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao consolidar faturamento por período: " + err.Error()})
		return
	}

	periodos.Diario.SaldoLiquido = periodos.Diario.Entradas - periodos.Diario.Saidas
	periodos.Semanal.SaldoLiquido = periodos.Semanal.Entradas - periodos.Semanal.Saidas
	periodos.Mensal.SaldoLiquido = periodos.Mensal.Entradas - periodos.Mensal.Saidas

	// 2. Movimentações do período selecionado (com filtro RBAC por barbeiro_id)
	var filtroPeriodoSQL string
	switch periodo {
	case "semanal":
		filtroPeriodoSQL = `date_trunc('week', (m.criado_em AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date) = date_trunc('week', $1::date)`
	case "mensal":
		filtroPeriodoSQL = `date_trunc('month', (m.criado_em AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date) = date_trunc('month', $1::date)`
	default:
		filtroPeriodoSQL = `(m.criado_em AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date = $1::date`
	}

	query := fmt.Sprintf(`
		SELECT
			m.id, m.barbeiro_id, COALESCE(u.nome, 'Geral/Caixa') as barbeiro_nome,
			m.tipo, m.descricao, m.valor, COALESCE(m.forma_pagamento, 'dinheiro'), m.criado_em
		FROM movimentacoes_caixa m
		LEFT JOIN usuarios u ON m.barbeiro_id = u.id
		WHERE (%s) AND ($2::bigint IS NULL OR m.barbeiro_id = $2)
		ORDER BY m.criado_em DESC;
	`, filtroPeriodoSQL)

	rows, err := h.db.Pool.Query(r.Context(), query, dataRefStr, filtroBarbeiroID)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao buscar movimentações de caixa: " + err.Error()})
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
			&m.Descricao,
			&m.Valor,
			&m.FormaPagamento,
			&m.CriadoEm,
		)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao mapear linhas do caixa: " + err.Error()})
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

	if req.Valor <= 0 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "O valor da movimentação deve ser maior que zero"})
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

	if strings.TrimSpace(req.Descricao) == "" {
		if tipoNormalizado == domain.TipoEntrada {
			req.Descricao = "Serviço Avulso de Bancada"
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
		INSERT INTO movimentacoes_caixa (barbeiro_id, tipo, descricao, valor, forma_pagamento, criado_em)
		VALUES ($1, $2, $3, $4, $5, ($6::timestamptz AT TIME ZONE 'UTC'))
		RETURNING id, criado_em;
	`

	var id int64
	var criadoEm time.Time
	err = h.db.Pool.QueryRow(
		r.Context(),
		query,
		req.BarbeiroID,
		tipoNormalizado,
		req.Descricao,
		req.Valor,
		formaNormalizada,
		criadoEmUTC,
	).Scan(&id, &criadoEm)

	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao gravar movimentação no Neon: " + err.Error()})
		return
	}

	resp := domain.MovimentacaoCaixa{
		ID:             id,
		BarbeiroID:     req.BarbeiroID,
		BarbeiroNome:   targetBarbeiroNome,
		Tipo:           tipoNormalizado,
		Descricao:      req.Descricao,
		Valor:          req.Valor,
		FormaPagamento: formaNormalizada,
		CriadoEm:       criadoEm,
	}
	h.preencherDataHoraLocal(&resp)

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(resp)
}
