package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/barbearia-rocha/backend/internal/database"
	"github.com/barbearia-rocha/backend/internal/domain"
)

type MaterialHandler struct {
	db *database.DB
}

func NewMaterialHandler(db *database.DB) *MaterialHandler {
	return &MaterialHandler{db: db}
}

// ListarMateriais retorna os pedidos de materiais cadastrados na tabela pedidos_materiais do Neon
// GET /api/materiais
func (h *MaterialHandler) ListarMateriais(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	query := `
		SELECT 
			p.id, p.solicitante_id, COALESCE(u.nome, 'Bancada') as solicitante_nome,
			p.item, p.quantidade, p.urgencia, p.status, p.criado_em
		FROM pedidos_materiais p
		LEFT JOIN usuarios u ON p.solicitante_id = u.id
		ORDER BY p.criado_em DESC;
	`

	rows, err := h.db.Pool.Query(r.Context(), query)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao listar pedidos de materiais: " + err.Error()})
		return
	}
	defer rows.Close()

	pedidos := make([]domain.PedidoMaterial, 0)
	for rows.Next() {
		var p domain.PedidoMaterial
		err := rows.Scan(
			&p.ID,
			&p.SolicitanteID,
			&p.Solicitante,
			&p.Item,
			&p.Quantidade,
			&p.Urgencia,
			&p.Status,
			&p.CriadoEm,
		)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao mapear pedido de material: " + err.Error()})
			return
		}
		pedidos = append(pedidos, p)
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(pedidos)
}

// CriarPedidoMaterial insere uma nova solicitação de material na tabela pedidos_materiais do Neon
// POST /api/materiais
func (h *MaterialHandler) CriarPedidoMaterial(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var req domain.NovoPedidoMaterialRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Payload JSON inválido"})
		return
	}

	if strings.TrimSpace(req.Item) == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "O nome do item é obrigatório"})
		return
	}

	if req.Quantidade <= 0 {
		req.Quantidade = 1
	}

	// Normaliza urgência conforme o check constraint: 'baixa', 'media', 'alta'
	urgenciaNormalizada := domain.UrgenciaMaterial(strings.ToLower(string(req.Urgencia)))
	if urgenciaNormalizada != domain.UrgenciaBaixa &&
		urgenciaNormalizada != domain.UrgenciaMedia &&
		urgenciaNormalizada != domain.UrgenciaAlta {
		urgenciaNormalizada = domain.UrgenciaMedia
	}

	query := `
		INSERT INTO pedidos_materiais (solicitante_id, item, quantidade, urgencia, status)
		VALUES ($1, $2, $3, $4, 'pendente')
		RETURNING id, criado_em;
	`

	var p domain.PedidoMaterial
	p.SolicitanteID = req.SolicitanteID
	p.Item = req.Item
	p.Quantidade = req.Quantidade
	p.Urgencia = urgenciaNormalizada
	p.Status = domain.StatusPendente

	err := h.db.Pool.QueryRow(
		r.Context(),
		query,
		req.SolicitanteID,
		req.Item,
		req.Quantidade,
		urgenciaNormalizada,
	).Scan(&p.ID, &p.CriadoEm)

	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao salvar pedido de material no Neon: " + err.Error()})
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(p)
}
