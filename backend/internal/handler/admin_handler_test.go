package handler

import "testing"

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
