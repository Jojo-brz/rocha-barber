package auth

import (
	"testing"
	"time"

	"github.com/barbearia-rocha/backend/internal/domain"
)

func TestSignAndVerifyToken(t *testing.T) {
	secret := DeriveSecret("segredo-teste-123", "postgres://unused")

	token, err := SignToken(5, domain.PapelBarbeiro, secret, time.Hour)
	if err != nil {
		t.Fatalf("erro inesperado ao assinar token: %v", err)
	}

	claims, err := VerifyToken(token, secret)
	if err != nil {
		t.Fatalf("erro inesperado ao verificar token válido: %v", err)
	}
	if claims.UserID != 5 || claims.Papel != domain.PapelBarbeiro {
		t.Fatalf("claims inesperadas: %+v", claims)
	}

	// Token adulterado deve ser rejeitado
	if _, err := VerifyToken(token+"x", secret); err == nil {
		t.Fatalf("token adulterado deveria falhar na verificação")
	}

	// Token expirado deve ser rejeitado
	expired, err := SignToken(1, domain.PapelAdmin, secret, -time.Minute)
	if err != nil {
		t.Fatalf("erro inesperado ao gerar token expirado: %v", err)
	}
	if _, err := VerifyToken(expired, secret); err == nil {
		t.Fatalf("token expirado deveria falhar na verificação")
	}
}
