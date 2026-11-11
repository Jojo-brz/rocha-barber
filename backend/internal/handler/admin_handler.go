package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/barbearia-rocha/backend/internal/database"
	"github.com/barbearia-rocha/backend/internal/domain"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

const usuariosLimitAdvisoryLockKey int64 = 9042001

var pinQuatroDigitosRegex = regexp.MustCompile(`^\d{4}$`)

type AdminHandler struct {
	db *database.DB
}

func NewAdminHandler(db *database.DB) *AdminHandler {
	return &AdminHandler{db: db}
}

func validarUsuarioInput(nome, pin string) (string, string, string) {
	nomeTrim := strings.TrimSpace(nome)
	pinTrim := strings.TrimSpace(pin)

	if nomeTrim == "" {
		return "", "", "O nome do colaborador é obrigatório"
	}
	if len([]rune(nomeTrim)) > 100 {
		return "", "", "O nome do colaborador deve ter no máximo 100 caracteres"
	}
	if !pinQuatroDigitosRegex.MatchString(pinTrim) {
		return "", "", "O PIN deve conter exatamente 4 dígitos numéricos"
	}

	return nomeTrim, pinTrim, ""
}

// ListarEquipePublica retorna os membros da equipe autenticada sem expor o PIN
// GET /api/equipe
func (h *AdminHandler) ListarEquipePublica(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	query := `
		SELECT id, nome, papel, criado_em
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

	membros := make([]domain.EquipeMembro, 0)
	for rows.Next() {
		var m domain.EquipeMembro
		if err := rows.Scan(&m.ID, &m.Nome, &m.Papel, &m.CriadoEm); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao mapear membro da equipe: " + err.Error()})
			return
		}
		membros = append(membros, m)
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(membros)
}

// ListarUsuarios retorna todos os colaboradores da tabela usuarios do Neon (apenas CEO/admin)
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

// CriarUsuario adiciona um novo membro com transação/lock e trava estrita de 5 cadastros
// POST /api/admin/usuarios
func (h *AdminHandler) CriarUsuario(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var req domain.NovoUsuarioRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Payload JSON inválido"})
		return
	}

	nomeTrim, pinTrim, errMsg := validarUsuarioInput(req.Nome, req.PIN)
	if errMsg != "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": errMsg})
		return
	}

	// Normaliza papel para 'admin' ou 'barbeiro' conforme o check constraint do Neon
	papelNormalizado := domain.PapelUsuario(strings.ToLower(strings.TrimSpace(string(req.Papel))))
	if papelNormalizado == "ceo" {
		papelNormalizado = domain.PapelAdmin
	}
	if papelNormalizado != domain.PapelAdmin && papelNormalizado != domain.PapelBarbeiro {
		papelNormalizado = domain.PapelBarbeiro
	}

	// 🔒 Transação com advisory lock para evitar race condition no limite de 5 cadastros
	tx, err := h.db.Pool.Begin(r.Context())
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao iniciar transação no Neon"})
		return
	}
	defer tx.Rollback(r.Context())

	if _, err := tx.Exec(r.Context(), "SELECT pg_advisory_xact_lock($1)", usuariosLimitAdvisoryLockKey); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao sincronizar cadastro de equipe"})
		return
	}

	var totalCadastrados int
	if err := tx.QueryRow(r.Context(), "SELECT COUNT(*) FROM usuarios").Scan(&totalCadastrados); err != nil {
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

	var pinJaExiste bool
	if err := tx.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM usuarios WHERE pin = $1)", pinTrim).Scan(&pinJaExiste); err != nil {
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

	u := domain.Usuario{
		Nome:  nomeTrim,
		PIN:   pinTrim,
		Papel: papelNormalizado,
	}

	if err := tx.QueryRow(r.Context(), query, nomeTrim, pinTrim, papelNormalizado).Scan(&u.ID, &u.CriadoEm); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao criar usuário no Neon: " + err.Error()})
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao confirmar criação do colaborador"})
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

	nomeTrim, pinTrim, errMsg := validarUsuarioInput(req.Nome, req.PIN)
	if errMsg != "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": errMsg})
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
			"error": "O CEO/Administrador não pode ser removido do sistema.",
		})
		return
	}

	if _, err := h.db.Pool.Exec(r.Context(), "DELETE FROM usuarios WHERE id = $1", id); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao remover colaborador do Neon: " + err.Error()})
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Colaborador removido da equipe com sucesso.",
	})
}
