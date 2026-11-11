package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/barbearia-rocha/backend/internal/database"
	"github.com/barbearia-rocha/backend/internal/domain"
)

type CaixaHandler struct {
	db *database.DB
}

func NewCaixaHandler(db *database.DB) *CaixaHandler {
	return &CaixaHandler{db: db}
}

// ObterCaixaDiario lista as movimentações do dia e consolida os totais
// GET /api/caixa
func (h *CaixaHandler) ObterCaixaDiario(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// Seleciona movimentações registradas na tabela movimentacoes_caixa do Neon
	query := `
		SELECT
			m.id, m.barbeiro_id, COALESCE(u.nome, 'Geral/Caixa') as barbeiro_nome,
			m.tipo, m.descricao, m.valor, COALESCE(m.forma_pagamento, 'dinheiro'), m.criado_em
		FROM movimentacoes_caixa m
		LEFT JOIN usuarios u ON m.barbeiro_id = u.id
		WHERE (m.criado_em AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date =
			(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date
		ORDER BY m.criado_em DESC;
	`

	rows, err := h.db.Pool.Query(r.Context(), query)
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
		SaldoLiquido:       totalEntradas - totalSaidas,
		TotalEntradas:      totalEntradas,
		TotalSaidas:        totalSaidas,
		TotalMovimentacoes: len(movimentacoes),
		PorFormaPagamento:  totaisFormas,
		Movimentacoes:      movimentacoes,
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resumo)
}

// RegistrarMovimentacao cadastra uma nova entrada ou saída no caixa
// POST /api/caixa
func (h *CaixaHandler) RegistrarMovimentacao(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var req domain.NovaMovimentacaoRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Payload JSON inválido"})
		return
	}

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

	query := `
		INSERT INTO movimentacoes_caixa (barbeiro_id, tipo, descricao, valor, forma_pagamento)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, criado_em;
	`

	var id int64
	var criadoEm domain.MovimentacaoCaixa
	err := h.db.Pool.QueryRow(
		r.Context(),
		query,
		req.BarbeiroID,
		tipoNormalizado,
		req.Descricao,
		req.Valor,
		formaNormalizada,
	).Scan(&id, &criadoEm.CriadoEm)

	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao gravar movimentação no Neon: " + err.Error()})
		return
	}

	resp := domain.MovimentacaoCaixa{
		ID:             id,
		BarbeiroID:     req.BarbeiroID,
		Tipo:           tipoNormalizado,
		Descricao:      req.Descricao,
		Valor:          req.Valor,
		FormaPagamento: formaNormalizada,
		CriadoEm:       criadoEm.CriadoEm,
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(resp)
}
