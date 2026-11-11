package domain

import (
	"errors"
	"time"
)

var (
	ErrMaxUsersReached     = errors.New("limite máximo estrito de 5 colaboradores atingido")
	ErrCannotDeleteCEO     = errors.New("o Administrador/CEO não pode ser removido do sistema")
	ErrInvalidPIN          = errors.New("o PIN deve conter exatamente 4 dígitos numéricos")
	ErrPINAlreadyExists    = errors.New("este PIN já está cadastrado para outro membro da equipe")
	ErrUserNotFound        = errors.New("colaborador não encontrado")
	ErrUnauthorized        = errors.New("PIN incorreto ou usuário inativo")
	ErrInvalidAmount       = errors.New("o valor do lançamento deve ser maior que zero")
)

type UserRole string

const (
	RoleCEO      UserRole = "CEO"
	RoleBarbeiro UserRole = "BARBEIRO"
)

type PaymentMethod string

const (
	PaymentPIX      PaymentMethod = "PIX"
	PaymentDinheiro PaymentMethod = "DINHEIRO"
	PaymentCartao   PaymentMethod = "CARTAO"
)

type TransactionType string

const (
	TypeEntrada TransactionType = "ENTRADA"
	TypeSaida   TransactionType = "SAIDA"
)

type TransactionCategory string

const (
	CategoryCorte        TransactionCategory = "CORTE"
	CategoryBarba        TransactionCategory = "BARBA"
	CategoryCombo        TransactionCategory = "COMBO"
	CategoryProduto      TransactionCategory = "PRODUTO"
	CategoryInsumo       TransactionCategory = "INSUMO"
	CategoryDespesaGeral TransactionCategory = "DESPESA_GERAL"
	CategorySangria      TransactionCategory = "SANGRIA"
)

type User struct {
	ID            string    `json:"id"`
	Name          string    `json:"name"`
	PIN           string    `json:"pin,omitempty"` // Ocultado nas respostas públicas quando necessário
	Role          UserRole  `json:"role"`
	StationNumber int       `json:"stationNumber"`
	Active        bool      `json:"active"`
	CreatedAt     time.Time `json:"createdAt"`
}

type Transaction struct {
	ID            string              `json:"id"`
	Type          TransactionType     `json:"type"`
	Category      TransactionCategory `json:"category"`
	Description   string              `json:"description"`
	Amount        float64             `json:"amount"`
	PaymentMethod PaymentMethod       `json:"paymentMethod"`
	BarberID      string              `json:"barberId,omitempty"`
	BarberName    string              `json:"barberName"`
	Timestamp     string              `json:"timestamp"`
	CreatedAt     time.Time           `json:"createdAt"`
}

type AppointmentStatus string

const (
	StatusEmEspera  AppointmentStatus = "EM_ESPERA"
	StatusNaCadeira AppointmentStatus = "NA_CADEIRA"
	StatusConcluido AppointmentStatus = "CONCLUIDO"
	StatusCancelado AppointmentStatus = "CANCELADO"
)

type Appointment struct {
	ID         string            `json:"id"`
	ClientName string            `json:"clientName"`
	Service    string            `json:"service"`
	Time       string            `json:"time"`
	BarberID   string            `json:"barberId"`
	BarberName string            `json:"barberName"`
	Amount     float64           `json:"amount"`
	Status     AppointmentStatus `json:"status"`
}

type MaterialUrgency string

const (
	UrgencyBaixa   MaterialUrgency = "BAIXA"
	UrgencyMedia   MaterialUrgency = "MEDIA"
	UrgencyAlta    MaterialUrgency = "ALTA"
	UrgencyCritica MaterialUrgency = "CRITICA"
)

type MaterialStatus string

const (
	MaterialStatusPendente MaterialStatus = "PENDENTE"
	MaterialStatusComprado MaterialStatus = "COMPRADO"
	MaterialStatusEntregue MaterialStatus = "ENTREGUE"
)

type MaterialRequest struct {
	ID          string          `json:"id"`
	Item        string          `json:"item"`
	Quantity    string          `json:"quantity"`
	Urgency     MaterialUrgency `json:"urgency"`
	Status      MaterialStatus  `json:"status"`
	RequestedBy string          `json:"requestedBy"`
	RequestedAt string          `json:"requestedAt"`
}

type PaymentBreakdown struct {
	PIX      float64 `json:"pix"`
	Dinheiro float64 `json:"dinheiro"`
	Cartao   float64 `json:"cartao"`
}

type DailySummary struct {
	SaldoLiquido       float64          `json:"saldoLiquido"`
	TotalEntradas      float64          `json:"totalEntradas"`
	TotalSaidas        float64          `json:"totalSaidas"`
	TotalAtendimentos  int              `json:"totalAtendimentos"`
	PorFormaPagamento  PaymentBreakdown `json:"porFormaPagamento"`
}
