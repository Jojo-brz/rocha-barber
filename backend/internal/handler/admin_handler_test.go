package handler

import (
	"testing"
	"time"
)

func TestValidarUsuarioInput(t *testing.T) {
	cases := []struct {
		nome     string
		pin      string
		wantErr  bool
		wantNome string
		wantPIN  string
	}{
		{nome: "  João Silva  ", pin: " 4321 ", wantErr: false, wantNome: "João Silva", wantPIN: "4321"},
		{nome: "", pin: "1234", wantErr: true},
		{nome: "Maria", pin: "123", wantErr: true},
		{nome: "Maria", pin: "12345", wantErr: true},
		{nome: "Maria", pin: "abcd", wantErr: true},
	}

	for _, tc := range cases {
		gotNome, gotPIN, errMsg := validarUsuarioInput(tc.nome, tc.pin)
		if tc.wantErr && errMsg == "" {
			t.Errorf("validarUsuarioInput(%q, %q) deveria retornar erro", tc.nome, tc.pin)
		}
		if !tc.wantErr {
			if errMsg != "" {
				t.Errorf("validarUsuarioInput(%q, %q) erro inesperado: %s", tc.nome, tc.pin, errMsg)
			}
			if gotNome != tc.wantNome || gotPIN != tc.wantPIN {
				t.Errorf("obtido (%q, %q), esperado (%q, %q)", gotNome, gotPIN, tc.wantNome, tc.wantPIN)
			}
		}
	}
}

func TestPINRateLimiter(t *testing.T) {
	limiter := newPINRateLimiter()
	now := time.Now()
	ip := "203.0.113.10"

	for i := 0; i < maxFailedPINAttemptsPerMinute; i++ {
		if !limiter.allow(ip, now) {
			t.Fatalf("tentativa %d deveria ser permitida", i+1)
		}
		limiter.recordFailure(ip, now)
	}

	if limiter.allow(ip, now) {
		t.Fatalf("tentativa após atingir o limite de %d falhas deveria ser bloqueada", maxFailedPINAttemptsPerMinute)
	}

	// Após expirar a janela de 1 minuto, deve voltar a permitir
	if !limiter.allow(ip, now.Add(pinRateLimitWindow+time.Second)) {
		t.Fatalf("deveria permitir novamente após expirar a janela de rate limit")
	}

	// Reset explícito após login válido
	limiter.recordFailure(ip, now)
	limiter.reset(ip)
	if !limiter.allow(ip, now) {
		t.Fatalf("deveria permitir após reset")
	}
}
