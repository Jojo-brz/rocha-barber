package handler

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/barbearia-rocha/backend/internal/database"
	"github.com/barbearia-rocha/backend/internal/domain"
	"github.com/barbearia-rocha/backend/internal/middleware"
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

func requireAdminCaller(w http.ResponseWriter, r *http.Request) bool {
	caller, ok := middleware.UsuarioAutenticado(r.Context())
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "Sessão não autenticada"})
		return false
	}
	if !domain.IsAdminRole(caller.Papel) {
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]string{"error": "Acesso restrito ao CEO/Administrador"})
		return false
	}
	return true
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

	if _, ok := middleware.UsuarioAutenticado(r.Context()); !ok {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "Sessão não autenticada"})
		return
	}

	query := `
		SELECT id, nome, papel, criado_em
		FROM usuarios
		ORDER BY id ASC;
	`

	rows, err := h.db.Pool.Query(r.Context(), query)
	if err != nil {
		log.Printf("[AdminHandler.ListarEquipePublica] erro: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao listar equipe"})
		return
	}
	defer rows.Close()

	membros := make([]domain.EquipeMembro, 0)
	for rows.Next() {
		var m domain.EquipeMembro
		if err := rows.Scan(&m.ID, &m.Nome, &m.Papel, &m.CriadoEm); err != nil {
			log.Printf("[AdminHandler.ListarEquipePublica] erro scan: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao mapear membro da equipe"})
			return
		}
		membros = append(membros, m)
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(membros)
}

// ListarUsuarios retorna todos os colaboradores da tabela usuarios (apenas CEO/admin)
// GET /api/admin/usuarios
func (h *AdminHandler) ListarUsuarios(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if !requireAdminCaller(w, r) {
		return
	}

	query := `
		SELECT id, nome, pin, papel, criado_em 
		FROM usuarios 
		ORDER BY id ASC;
	`

	rows, err := h.db.Pool.Query(r.Context(), query)
	if err != nil {
		log.Printf("[AdminHandler.ListarUsuarios] erro: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao listar equipe"})
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
			log.Printf("[AdminHandler.ListarUsuarios] erro scan: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao mapear colaborador"})
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
	if !requireAdminCaller(w, r) {
		return
	}

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
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao iniciar transação"})
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
		log.Printf("[AdminHandler.CriarUsuario] erro insert: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao criar usuário"})
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
	if !requireAdminCaller(w, r) {
		return
	}

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
		log.Printf("[AdminHandler.EditarUsuario] erro select: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao consultar colaborador"})
		return
	}

	if domain.IsAdminRole(domain.PapelUsuario(papel)) {
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

	// Atualiza nome e PIN
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
		log.Printf("[AdminHandler.EditarUsuario] erro update: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao atualizar colaborador"})
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(u)
}

// DeletarUsuario remove um barbeiro da equipe (admins são protegidos)
// DELETE /api/admin/usuarios/{id}
func (h *AdminHandler) DeletarUsuario(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if !requireAdminCaller(w, r) {
		return
	}

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
		log.Printf("[AdminHandler.DeletarUsuario] erro select: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao consultar colaborador"})
		return
	}

	if domain.IsAdminRole(domain.PapelUsuario(papel)) {
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "O CEO/Administrador não pode ser removido do sistema.",
		})
		return
	}

	if _, err := h.db.Pool.Exec(r.Context(), "DELETE FROM usuarios WHERE id = $1", id); err != nil {
		log.Printf("[AdminHandler.DeletarUsuario] erro delete: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao remover colaborador"})
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Colaborador removido da equipe com sucesso.",
	})
}

const maxLogoDataURLLength = 160000 // ~120 KB em Base64 após compressão no frontend

// ObterLogoBarbearia retorna o ícone/logo customizado da barbearia para todos os usuários
// GET /api/config/logo
func (h *AdminHandler) ObterLogoBarbearia(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var valor string
	var atualizadoEm time.Time
	err := h.db.Pool.QueryRow(
		r.Context(),
		"SELECT valor, atualizado_em FROM configuracoes_barbearia WHERE chave = 'logo_url' LIMIT 1",
	).Scan(&valor, &atualizadoEm)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(domain.LogoConfigResponse{LogoURL: ""})
			return
		}
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao carregar ícone da barbearia"})
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(domain.LogoConfigResponse{
		LogoURL:      valor,
		AtualizadoEm: &atualizadoEm,
	})
}

// AtualizarLogoBarbearia salva ou remove o ícone da barbearia (exclusivo CEO)
// PUT /api/admin/config/logo
func (h *AdminHandler) AtualizarLogoBarbearia(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if !requireAdminCaller(w, r) {
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 250*1024)

	var req domain.AtualizarLogoRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Imagem inválida ou acima do limite permitido"})
		return
	}

	logo := strings.TrimSpace(req.LogoURL)
	if logo == "" {
		_, err := h.db.Pool.Exec(r.Context(), "DELETE FROM configuracoes_barbearia WHERE chave = 'logo_url'")
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao restaurar ícone padrão"})
			return
		}
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(domain.LogoConfigResponse{LogoURL: ""})
		return
	}

	if len(logo) > maxLogoDataURLLength {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "A imagem excede o tamanho máximo permitido (use o redutor automático)"})
		return
	}

	validPrefix := strings.HasPrefix(logo, "data:image/webp;base64,") ||
		strings.HasPrefix(logo, "data:image/jpeg;base64,") ||
		strings.HasPrefix(logo, "data:image/png;base64,")
	if !validPrefix {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Formato de imagem inválido. Use WebP, JPEG ou PNG"})
		return
	}

	var atualizadoEm time.Time
	err := h.db.Pool.QueryRow(
		r.Context(),
		`INSERT INTO configuracoes_barbearia (chave, valor, atualizado_em)
		 VALUES ('logo_url', $1, CURRENT_TIMESTAMP)
		 ON CONFLICT (chave) DO UPDATE
		 SET valor = EXCLUDED.valor, atualizado_em = CURRENT_TIMESTAMP
		 RETURNING atualizado_em`,
		logo,
	).Scan(&atualizadoEm)

	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao salvar ícone da barbearia"})
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(domain.LogoConfigResponse{
		LogoURL:      logo,
		AtualizadoEm: &atualizadoEm,
	})
}
