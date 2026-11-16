package handler

import (
	"testing"
	"time"

	"github.com/barbearia-rocha/backend/internal/domain"
)

func TestResolverPeriodoCaixa(t *testing.T) {
	cases := []struct {
		input string
		want  string
		ok    bool
	}{
		{"", "diario", true},
		{"diario", "diario", true},
		{"SEMANAL", "semanal", true},
		{" mensal ", "mensal", true},
		{"anual", "", false},
	}

	for _, tc := range cases {
		got, ok := resolverPeriodoCaixa(tc.input)
		if got != tc.want || ok != tc.ok {
			t.Fatalf("resolverPeriodoCaixa(%q) = (%q, %v), want (%q, %v)", tc.input, got, ok, tc.want, tc.ok)
		}
	}
}

func TestResolverDataReferencia(t *testing.T) {
	loc := loadSaoPauloLocation()
	// 2026-11-12 01:30 UTC == 2026-11-11 22:30 BRT (-03:00)
	now := time.Date(2026, 11, 12, 1, 30, 0, 0, time.UTC)

	str, _, err := resolverDataReferencia("", loc, now)
	if err != nil {
		t.Fatalf("erro inesperado: %v", err)
	}
	if str != "2026-11-11" {
		t.Fatalf("esperado 2026-11-11 em BRT, obtido %s", str)
	}

	str2, _, err := resolverDataReferencia("2026-10-05", loc, now)
	if err != nil || str2 != "2026-10-05" {
		t.Fatalf("esperado 2026-10-05, obtido (%s, %v)", str2, err)
	}

	if _, _, err := resolverDataReferencia("11/11/2026", loc, now); err == nil {
		t.Fatalf("esperado erro para formato invalido")
	}
}

func TestResolverTimestampLancamentoAndFormatacao(t *testing.T) {
	loc := loadSaoPauloLocation()
	// 2026-11-12 15:45:00 BRT == 18:45:00 UTC
	now := time.Date(2026, 11, 12, 18, 45, 0, 0, time.UTC)

	data := "2026-11-10"
	ts, err := resolverTimestampLancamento(&data, loc, now)
	if err != nil {
		t.Fatalf("erro inesperado: %v", err)
	}

	h := &CaixaHandler{loc: loc}
	m := domain.MovimentacaoCaixa{CriadoEm: ts}
	h.preencherDataHoraLocal(&m)

	if m.DataFormatada != "10/11/2026" {
		t.Fatalf("DataFormatada = %s, want 10/11/2026", m.DataFormatada)
	}
	if m.HoraFormatada != "15:45" {
		t.Fatalf("HoraFormatada = %s, want 15:45", m.HoraFormatada)
	}
}
