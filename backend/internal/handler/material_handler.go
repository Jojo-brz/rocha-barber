package handler

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/barbearia-rocha/backend/internal/database"
	"github.com/barbearia-rocha/backend/internal/domain"
	"github.com/barbearia-rocha/backend/internal/middleware"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

type MaterialHandler struct {
	db *database.DB
}

func NewMaterialHandler(db *database.DB) *MaterialHandler {
	return &MaterialHandler{db: db}
}

// ListarMateriais retorna os pedidos de materiais cadastrados
// GET /api/materiais
func (h *MaterialHandler) ListarMateriais(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if _, ok := middleware.UsuarioAutenticado(r.Context()); !ok {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "Sessão não autenticada"})
		return
	}

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
		log.Printf("[MaterialHandler.ListarMateriais] erro: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao listar pedidos de materiais"})
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
			log.Printf("[MaterialHandler.ListarMateriais] erro scan: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao mapear pedido de material"})
			return
		}
		pedidos = append(pedidos, p)
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(pedidos)
}

// CriarPedidoMaterial insere uma nova solicitação de material vinculada obrigatoriamente ao userID autenticado
// POST /api/materiais
func (h *MaterialHandler) CriarPedidoMaterial(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	caller, ok := middleware.UsuarioAutenticado(r.Context())
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "Sessão não autenticada"})
		return
	}

	var req domain.NovoPedidoMaterialRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Payload JSON inválido"})
		return
	}

	req.Item = strings.TrimSpace(req.Item)
	if req.Item == "" || len(req.Item) > 150 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "O nome do item é obrigatório (máximo de 150 caracteres)"})
		return
	}

	if req.Quantidade <= 0 || req.Quantidade > 1000 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "A quantidade deve ser um número positivo entre 1 e 1000"})
		return
	}

	// Normaliza urgência conforme o check constraint: 'baixa', 'media', 'alta'
	urgenciaNormalizada := domain.UrgenciaMaterial(strings.ToLower(strings.TrimSpace(string(req.Urgencia))))
	if urgenciaNormalizada != domain.UrgenciaBaixa &&
		urgenciaNormalizada != domain.UrgenciaMedia &&
		urgenciaNormalizada != domain.UrgenciaAlta {
		urgenciaNormalizada = domain.UrgenciaMedia
	}

	// Prevenção de IDOR: solicitante_id é sempre extraído do token autenticado
	solicitanteID := caller.ID

	query := `
		INSERT INTO pedidos_materiais (solicitante_id, item, quantidade, urgencia, status)
		VALUES ($1, $2, $3, $4, 'pendente')
		RETURNING id, criado_em;
	`

	var p domain.PedidoMaterial
	p.SolicitanteID = &solicitanteID
	p.Solicitante = caller.Nome
	p.Item = req.Item
	p.Quantidade = req.Quantidade
	p.Urgencia = urgenciaNormalizada
	p.Status = domain.StatusPendente

	err := h.db.Pool.QueryRow(
		r.Context(),
		query,
		solicitanteID,
		req.Item,
		req.Quantidade,
		urgenciaNormalizada,
	).Scan(&p.ID, &p.CriadoEm)

	if err != nil {
		log.Printf("[MaterialHandler.CriarPedidoMaterial] erro: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao salvar pedido de material"})
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(p)
}

// AtualizarStatusMaterial altera o status do pedido de material ('pendente' ou 'comprado') — restrito ao CEO/Admin
// PATCH /api/materiais/{id}
func (h *MaterialHandler) AtualizarStatusMaterial(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	caller, ok := middleware.UsuarioAutenticado(r.Context())
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "Sessão não autenticada"})
		return
	}
	if !domain.IsAdminRole(caller.Papel) {
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]string{"error": "Apenas o CEO/Administrador pode alterar o status de pedidos de materiais"})
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "ID do pedido de material inválido"})
		return
	}

	var req domain.AtualizarStatusMaterialRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Payload JSON inválido"})
		return
	}

	statusNormalizado := domain.StatusMaterial(strings.ToLower(strings.TrimSpace(string(req.Status))))
	if statusNormalizado != domain.StatusPendente && statusNormalizado != domain.StatusComprado {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Status inválido. Use 'pendente' ou 'comprado'"})
		return
	}

	var p domain.PedidoMaterial
	err = h.db.Pool.QueryRow(
		r.Context(),
		`WITH updated AS (
			UPDATE pedidos_materiais SET status = $1 WHERE id = $2
			RETURNING id, solicitante_id, item, quantidade, urgencia, status, criado_em
		)
		SELECT up.id, up.solicitante_id, COALESCE(u.nome, 'Bancada'), up.item, up.quantidade, up.urgencia, up.status, up.criado_em
		FROM updated up
		LEFT JOIN usuarios u ON up.solicitante_id = u.id`,
		statusNormalizado,
		id,
	).Scan(
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
		if errors.Is(err, pgx.ErrNoRows) {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "Pedido de material não encontrado"})
			return
		}
		log.Printf("[MaterialHandler.AtualizarStatusMaterial] erro: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao atualizar pedido de material"})
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(p)
}
