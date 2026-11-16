package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"time"

	"github.com/barbearia-rocha/backend/internal/domain"
)

type TokenClaims struct {
	UserID int64               `json:"user_id"`
	Papel  domain.PapelUsuario `json:"papel"`
	Exp    int64               `json:"exp"`
}

// ResolveSecretFromEnv obtém a chave secreta priorizando JWT_SECRET, TOKEN_SECRET e AUTH_SECRET,
// mantendo fallback seguro para não interromper o servidor caso nenhuma variável esteja definida.
func ResolveSecretFromEnv(databaseURL string) []byte {
	for _, key := range []string{"JWT_SECRET", "TOKEN_SECRET", "AUTH_SECRET"} {
		if val := strings.TrimSpace(os.Getenv(key)); val != "" {
			return DeriveSecret(val, databaseURL)
		}
	}
	return DeriveSecret("", databaseURL)
}

// DeriveSecret retorna a chave HMAC a partir do segredo configurado ou derivada de forma determinística.
func DeriveSecret(authSecret, databaseURL string) []byte {
	trimmed := strings.TrimSpace(authSecret)
	if trimmed != "" {
		sum := sha256.Sum256([]byte(trimmed))
		return sum[:]
	}
	sum := sha256.Sum256([]byte("barbearia-rocha-hmac-v1:" + databaseURL))
	return sum[:]
}

// SignToken gera um token assinado com HMAC-SHA256 e prazo de expiração.
func SignToken(userID int64, papel domain.PapelUsuario, secret []byte, ttl time.Duration) (string, error) {
	claims := TokenClaims{
		UserID: userID,
		Papel:  papel,
		Exp:    time.Now().Add(ttl).Unix(),
	}

	payloadBytes, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}

	payloadEnc := base64.RawURLEncoding.EncodeToString(payloadBytes)
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(payloadEnc))
	sigEnc := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	return payloadEnc + "." + sigEnc, nil
}

// VerifyToken valida assinatura HMAC-SHA256 e expiração do token.
func VerifyToken(token string, secret []byte) (*TokenClaims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return nil, errors.New("formato de token inválido")
	}

	payloadEnc, sigEnc := parts[0], parts[1]
	sigBytes, err := base64.RawURLEncoding.DecodeString(sigEnc)
	if err != nil {
		return nil, errors.New("assinatura de token inválida")
	}

	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(payloadEnc))
	expectedSig := mac.Sum(nil)

	if !hmac.Equal(sigBytes, expectedSig) {
		return nil, errors.New("assinatura de token não confere")
	}

	payloadBytes, err := base64.RawURLEncoding.DecodeString(payloadEnc)
	if err != nil {
		return nil, errors.New("payload de token inválido")
	}

	var claims TokenClaims
	if err := json.Unmarshal(payloadBytes, &claims); err != nil {
		return nil, errors.New("claims de token inválidas")
	}

	if claims.UserID <= 0 || time.Now().Unix() > claims.Exp {
		return nil, errors.New("token expirado ou inválido")
	}

	if !domain.IsAdminRole(claims.Papel) && claims.Papel != domain.PapelBarbeiro {
		return nil, errors.New("papel de usuário inválido no token")
	}

	return &claims, nil
}
