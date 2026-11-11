package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/barbearia-rocha/backend/internal/database"
	"github.com/barbearia-rocha/backend/internal/domain"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

type AdminHandler struct {
	db *database.DB
}

func NewAdminHandler(db *database.DB) *AdminHandler {
	return &AdminHandler{db: db}
}

// ListarUsuarios retorna todos os colaboradores da tabela usuarios do Neon
// GET /api/admin/usuarios
func (h *AdminHandler) ListarUsuarios(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	query := `
		SELECT id, nome, pin, papel, criado_em 
		FROM usuarios 
		ORDER BY id ASC;
	`

	rows, err := h.db.Pool.Query(r.Context(), query)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao listar equipe no Neon: " + err.Error()})
		return
	}
	defer rows.Close()

	usuarios := make([]domain.Usuario, 0)
	for rows.Next() {
		var u domain.Usuario
		err := rows.Scan(
			&u.ID,
			&u.Nome,
			&u.PIN,
			&u.Papel,
			&u.CriadoEm,
		)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao mapear colaborador: " + err.Error()})
			return
		}
		usuarios = append(usuarios, u)
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]any{
		"limite_maximo": 5,
		"total_membros": len(usuarios),
		"vagas_livres":  5 - len(usuarios),
		"usuarios":      usuarios,
	})
}

// CriarUsuario adiciona um novo membro com validação estrita do limite de 5 cadastros
// POST /api/admin/usuarios
func (h *AdminHandler) CriarUsuario(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var req domain.NovoUsuarioRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Payload JSON inválido"})
		return
	}

	if strings.TrimSpace(req.Nome) == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "O nome do colaborador é obrigatório"})
		return
	}

	if strings.TrimSpace(req.PIN) == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "O PIN numérico deve ser informado"})
		return
	}

	// Normaliza papel para 'admin' ou 'barbeiro' conforme o check constraint do Neon
	papelNormalizado := domain.PapelUsuario(strings.ToLower(string(req.Papel)))
	if papelNormalizado == "ceo" {
		papelNormalizado = domain.PapelAdmin
	}
	if papelNormalizado != domain.PapelAdmin && papelNormalizado != domain.PapelBarbeiro {
		papelNormalizado = domain.PapelBarbeiro
	}

	// 🔒 REGRA DE NEGÓCIO: Limite estrito de no máximo 5 colaboradores no Neon
	var totalCadastrados int
	err := h.db.Pool.QueryRow(r.Context(), "SELECT COUNT(*) FROM usuarios").Scan(&totalCadastrados)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao consultar total de colaboradores"})
		return
	}

	if totalCadastrados >= 5 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Limite máximo estrito de 5 colaboradores atingido. Exclua um colaborador para liberar vaga.",
		})
		return
	}

	// Validação de unicidade do PIN
	var pinJaExiste bool
	err = h.db.Pool.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM usuarios WHERE pin = $1)", req.PIN).Scan(&pinJaExiste)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao validar unicidade do PIN"})
		return
	}

	if pinJaExiste {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Este PIN já está cadastrado para outro membro da equipe"})
		return
	}

	query := `
		INSERT INTO usuarios (nome, pin, papel)
		VALUES ($1, $2, $3)
		RETURNING id, criado_em;
	`

	var u domain.Usuario
	u.Nome = req.Nome
	u.PIN = req.PIN
	u.Papel = papelNormalizado

	err = h.db.Pool.QueryRow(
		r.Context(),
		query,
		req.Nome,
		req.PIN,
		papelNormalizado,
	).Scan(&u.ID, &u.CriadoEm)

	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao criar usuário no Neon: " + err.Error()})
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(u)
}

// EditarUsuario atualiza nome e/ou PIN de um colaborador (admins são protegidos)
// PUT /api/admin/usuarios/{id}
func (h *AdminHandler) EditarUsuario(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil || id <= 0 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "ID do colaborador inválido"})
		return
	}

	var req domain.EditarUsuarioRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Payload JSON inválido"})
		return
	}

	nomeTrim := strings.TrimSpace(req.Nome)
	pinTrim := strings.TrimSpace(req.PIN)

	if nomeTrim == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "O nome não pode ser vazio"})
		return
	}

	if pinTrim == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "O PIN não pode ser vazio"})
		return
	}

	// 🔒 PROTEÇÃO: Admins não podem ter seus dados alterados por esta rota
	var papel string
	err = h.db.Pool.QueryRow(r.Context(), "SELECT papel FROM usuarios WHERE id = $1", id).Scan(&papel)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "Colaborador não encontrado no banco de dados"})
			return
		}
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao consultar colaborador: " + err.Error()})
		return
	}

	if papel == string(domain.PapelAdmin) {
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "O CEO/Administrador não pode ser editado por esta rota.",
		})
		return
	}

	// Verifica se o novo PIN já está em uso por outro colaborador
	var pinEmUso bool
	err = h.db.Pool.QueryRow(
		r.Context(),
		"SELECT EXISTS(SELECT 1 FROM usuarios WHERE pin = $1 AND id != $2)",
		pinTrim, id,
	).Scan(&pinEmUso)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao validar PIN"})
		return
	}

	if pinEmUso {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Este PIN já está em uso por outro colaborador"})
		return
	}

	// Atualiza nome e PIN no Neon
	var u domain.Usuario
	err = h.db.Pool.QueryRow(
		r.Context(),
		`UPDATE usuarios SET nome = $1, pin = $2 WHERE id = $3
		 RETURNING id, nome, pin, papel, criado_em`,
		nomeTrim,
		pinTrim,
		id,
	).Scan(&u.ID, &u.Nome, &u.PIN, &u.Papel, &u.CriadoEm)

	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao atualizar colaborador no Neon: " + err.Error()})
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(u)
}

// DeletarUsuario remove um barbeiro da equipe (admins são protegidos)
// DELETE /api/admin/usuarios/{id}
func (h *AdminHandler) DeletarUsuario(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil || id <= 0 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "ID do colaborador inválido"})
		return
	}

	// 🔒 PROTEÇÃO: Verifica se o usuário alvo é admin — admins não podem ser removidos
	var papel string
	err = h.db.Pool.QueryRow(r.Context(), "SELECT papel FROM usuarios WHERE id = $1", id).Scan(&papel)
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "Colaborador não encontrado no banco de dados"})
		return
	}

	if papel == string(domain.PapelAdmin) {
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "O CEO/Administrador não pode ser removido do sistema.",
		})
		return
	}

	// Remove o barbeiro do Neon
	_, err = h.db.Pool.Exec(r.Context(), "DELETE FROM usuarios WHERE id = $1", id)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao remover colaborador do Neon: " + err.Error()})
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Colaborador removido da equipe com sucesso.",
	})
}
