package handler

import (
	"encoding/json"
	"errors"
	"log"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/barbearia-rocha/backend/internal/auth"
	"github.com/barbearia-rocha/backend/internal/database"
	"github.com/barbearia-rocha/backend/internal/domain"
	"github.com/jackc/pgx/v5"
)

const (
	maxFailedPINAttemptsPerMinute = 8
	pinRateLimitWindow            = 1 * time.Minute
)

type ipAttemptWindow struct {
	failures  int
	expiresAt time.Time
}

type pinRateLimiter struct {
	mu       sync.Mutex
	attempts map[string]ipAttemptWindow
}

func newPINRateLimiter() *pinRateLimiter {
	return &pinRateLimiter{
		attempts: make(map[string]ipAttemptWindow),
	}
}

func (l *pinRateLimiter) allow(ip string, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	for k, v := range l.attempts {
		if now.After(v.expiresAt) {
			delete(l.attempts, k)
		}
	}

	entry, exists := l.attempts[ip]
	if !exists || now.After(entry.expiresAt) {
		return true
	}
	return entry.failures < maxFailedPINAttemptsPerMinute
}

func (l *pinRateLimiter) recordFailure(ip string, now time.Time) {
	l.mu.Lock()
	defer l.mu.Unlock()

	entry, exists := l.attempts[ip]
	if !exists || now.After(entry.expiresAt) {
		l.attempts[ip] = ipAttemptWindow{
			failures:  1,
			expiresAt: now.Add(pinRateLimitWindow),
		}
		return
	}
	entry.failures++
	l.attempts[ip] = entry
}

func (l *pinRateLimiter) reset(ip string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.attempts, ip)
}

func extractClientIP(r *http.Request) string {
	if xff := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); xff != "" {
		parts := strings.Split(xff, ",")
		if ip := strings.TrimSpace(parts[0]); ip != "" {
			return ip
		}
	}
	if realIP := strings.TrimSpace(r.Header.Get("X-Real-IP")); realIP != "" {
		return realIP
	}
	host, _, err := net.SplitHostPort(strings.TrimSpace(r.RemoteAddr))
	if err == nil && host != "" {
		return host
	}
	return r.RemoteAddr
}

type AuthHandler struct {
	db      *database.DB
	secret  []byte
	limiter *pinRateLimiter
}

func NewAuthHandler(db *database.DB, secret []byte) *AuthHandler {
	return &AuthHandler{
		db:      db,
		secret:  secret,
		limiter: newPINRateLimiter(),
	}
}

// LoginPIN valida o PIN enviado pelo usuário com proteção de Rate Limiting por IP contra força bruta
// POST /api/auth/pin
func (h *AuthHandler) LoginPIN(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	clientIP := extractClientIP(r)
	now := time.Now()
	if !h.limiter.allow(clientIP, now) {
		w.WriteHeader(http.StatusTooManyRequests)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Muitas tentativas incorretas. Aguarde 1 minuto antes de tentar novamente.",
		})
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 4096)

	var req domain.LoginPINRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Payload JSON inválido"})
		return
	}

	pinTrim := strings.TrimSpace(req.PIN)
	if !pinQuatroDigitosRegex.MatchString(pinTrim) {
		h.limiter.recordFailure(clientIP, now)
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "O PIN deve conter exatamente 4 dígitos numéricos"})
		return
	}

	query := `
		SELECT id, nome, papel 
		FROM usuarios 
		WHERE pin = $1
		LIMIT 1;
	`

	var u domain.Usuario
	err := h.db.Pool.QueryRow(r.Context(), query, pinTrim).Scan(
		&u.ID,
		&u.Nome,
		&u.Papel,
	)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			h.limiter.recordFailure(clientIP, now)
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"error": "PIN incorreto ou usuário não cadastrado"})
			return
		}
		log.Printf("[AuthHandler.LoginPIN] erro ao consultar usuario: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro interno ao validar credenciais"})
		return
	}

	h.limiter.reset(clientIP)

	token, err := auth.SignToken(u.ID, u.Papel, h.secret, 24*time.Hour)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao gerar token de sessão"})
		return
	}

	resp := domain.AuthResponse{
		ID:    u.ID,
		Nome:  u.Nome,
		Papel: u.Papel,
		Token: token,
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
}
