package domain

import (
	"time"
)

// Tipos alinhados com os CHECK constraints do seu Neon PostgreSQL
type PapelUsuario string

const (
	PapelAdmin    PapelUsuario = "admin"
	PapelBarbeiro PapelUsuario = "barbeiro"
)

type TipoMovimentacao string

const (
	TipoEntrada TipoMovimentacao = "entrada"
	TipoSaida   TipoMovimentacao = "saida"
)

type FormaPagamento string

const (
	PagamentoPix           FormaPagamento = "pix"
	PagamentoDinheiro      FormaPagamento = "dinheiro"
	PagamentoCartaoCredito FormaPagamento = "cartao_credito"
	PagamentoCartaoDebito  FormaPagamento = "cartao_debito"
)

type StatusAgendamento string

const (
	StatusAgendado  StatusAgendamento = "agendado"
	StatusConcluido StatusAgendamento = "concluido"
	StatusCancelado StatusAgendamento = "cancelado"
)

type UrgenciaMaterial string

const (
	UrgenciaBaixa UrgenciaMaterial = "baixa"
	UrgenciaMedia UrgenciaMaterial = "media"
	UrgenciaAlta  UrgenciaMaterial = "alta"
)

type StatusMaterial string

const (
	StatusPendente StatusMaterial = "pendente"
	StatusComprado StatusMaterial = "comprado"
)

// Modelos das Tabelas do Neon

type Usuario struct {
	ID       int64        `json:"id"`
	Nome     string       `json:"nome"`
	PIN      string       `json:"pin,omitempty"`
	Papel    PapelUsuario `json:"papel"`
	CriadoEm time.Time    `json:"criado_em"`
}

type MovimentacaoCaixa struct {
	ID             int64            `json:"id"`
	BarbeiroID     *int64           `json:"barbeiro_id,omitempty"`
	BarbeiroNome   string           `json:"barbeiro_nome,omitempty"`
	Tipo           TipoMovimentacao `json:"tipo"`
	Descricao      string           `json:"descricao"`
	Valor          float64          `json:"valor"`
	FormaPagamento FormaPagamento   `json:"forma_pagamento"`
	CriadoEm       time.Time        `json:"criado_em"`
}

type Agendamento struct {
	ID           int64             `json:"id"`
	BarbeiroID   int64             `json:"barbeiro_id"`
	BarbeiroNome string            `json:"barbeiro_nome,omitempty"`
	ClienteNome  string            `json:"cliente_nome"`
	Servico      string            `json:"servico"`
	DataHora     time.Time         `json:"data_hora"`
	HoraFormat   string            `json:"hora_formatada,omitempty"`
	Status       StatusAgendamento `json:"status"`
	CriadoEm     time.Time         `json:"criado_em"`
}

type PedidoMaterial struct {
	ID            int64            `json:"id"`
	SolicitanteID *int64          `json:"solicitante_id,omitempty"`
	Solicitante   string           `json:"solicitante_nome,omitempty"`
	Item          string           `json:"item"`
	Quantidade    int              `json:"quantidade"`
	Urgencia      UrgenciaMaterial `json:"urgencia"`
	Status        StatusMaterial   `json:"status"`
	CriadoEm      time.Time        `json:"criado_em"`
}

// DTOs de Request / Response

type LoginPINRequest struct {
	PIN string `json:"pin"`
}

type AuthResponse struct {
	ID    int64        `json:"id"`
	Nome  string       `json:"nome"`
	Papel PapelUsuario `json:"papel"`
	Token string       `json:"token"`
}

type NovaMovimentacaoRequest struct {
	BarbeiroID     *int64           `json:"barbeiro_id"`
	Tipo           TipoMovimentacao `json:"tipo"`
	Descricao      string           `json:"descricao"`
	Valor          float64          `json:"valor"`
	FormaPagamento FormaPagamento   `json:"forma_pagamento"`
}

type NovoAgendamentoRequest struct {
	BarbeiroID  int64     `json:"barbeiro_id"`
	ClienteNome string    `json:"cliente_nome"`
	Servico     string    `json:"servico"`
	DataHora    time.Time `json:"data_hora"`
}

type NovoUsuarioRequest struct {
	Nome  string       `json:"nome"`
	PIN   string       `json:"pin"`
	Papel PapelUsuario `json:"papel"`
}

type EditarUsuarioRequest struct {
	Nome  string `json:"nome"`
	PIN   string `json:"pin"`
}

type NovoPedidoMaterialRequest struct {
	SolicitanteID *int64          `json:"solicitante_id"`
	Item          string           `json:"item"`
	Quantidade    int              `json:"quantidade"`
	Urgencia      UrgenciaMaterial `json:"urgencia"`
}

type FormasPagamentoTotais struct {
	Pix           float64 `json:"pix"`
	Dinheiro      float64 `json:"dinheiro"`
	CartaoCredito float64 `json:"cartao_credito"`
	CartaoDebito  float64 `json:"cartao_debito"`
}

type ResumoCaixaResponse struct {
	SaldoLiquido       float64               `json:"saldo_liquido"`
	TotalEntradas      float64               `json:"total_entradas"`
	TotalSaidas        float64               `json:"total_saidas"`
	TotalMovimentacoes int                   `json:"total_movimentacoes"`
	PorFormaPagamento  FormasPagamentoTotais `json:"por_forma_pagamento"`
	Movimentacoes      []MovimentacaoCaixa   `json:"movimentacoes"`
}
