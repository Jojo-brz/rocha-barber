package middleware

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/barbearia-rocha/backend/internal/auth"
	"github.com/barbearia-rocha/backend/internal/database"
	"github.com/barbearia-rocha/backend/internal/domain"
	"github.com/jackc/pgx/v5"
)

type contextKey string

const (
	authUserContextKey contextKey = "auth_user"
	userIDContextKey   contextKey = "user_id"
	userRoleContextKey contextKey = "user_role"
)

type AuthUser struct {
	ID    int64
	Nome  string
	Papel domain.PapelUsuario
}

type AuthMiddleware struct {
	db     *database.DB
	secret []byte
}

func NewAuthMiddleware(db *database.DB, secret []byte) *AuthMiddleware {
	return &AuthMiddleware{db: db, secret: secret}
}

func writeJSONError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

// RequireAuth exige Bearer token válido e verifica se o colaborador ainda existe no banco.
func (m *AuthMiddleware) RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := strings.TrimSpace(r.Header.Get("Authorization"))
		if !strings.HasPrefix(header, "Bearer ") {
			writeJSONError(w, http.StatusUnauthorized, "Autenticação obrigatória. Faça login com seu PIN.")
			return
		}

		tokenStr := strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
		claims, err := auth.VerifyToken(tokenStr, m.secret)
		if err != nil {
			writeJSONError(w, http.StatusUnauthorized, "Sessão expirada ou inválida. Entre novamente com seu PIN.")
			return
		}

		var u AuthUser
		err = m.db.Pool.QueryRow(
			r.Context(),
			"SELECT id, nome, papel FROM usuarios WHERE id = $1 LIMIT 1",
			claims.UserID,
		).Scan(&u.ID, &u.Nome, &u.Papel)

		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				writeJSONError(w, http.StatusUnauthorized, "Usuário não encontrado ou removido da equipe.")
				return
			}
			writeJSONError(w, http.StatusInternalServerError, "Erro ao validar sessão do colaborador.")
			return
		}

		ctx := context.WithValue(r.Context(), authUserContextKey, u)
		ctx = context.WithValue(ctx, userIDContextKey, u.ID)
		ctx = context.WithValue(ctx, userRoleContextKey, u.Papel)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// RequireAdmin restringe a rota exclusivamente para usuários com papel 'admin' / 'ceo'.
func (m *AuthMiddleware) RequireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, ok := UsuarioAutenticado(r.Context())
		if !ok {
			writeJSONError(w, http.StatusUnauthorized, "Sessão não autenticada.")
			return
		}
		if !domain.IsAdminRole(user.Papel) {
			writeJSONError(w, http.StatusForbidden, "Acesso restrito ao CEO/Administrador.")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// UsuarioAutenticado extrai o usuário autenticado do contexto da requisição.
func UsuarioAutenticado(ctx context.Context) (AuthUser, bool) {
	u, ok := ctx.Value(authUserContextKey).(AuthUser)
	return u, ok
}
