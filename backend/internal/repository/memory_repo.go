package repository

import (
	"fmt"
	"sync"
	"time"

	"github.com/barbearia-rocha/backend/internal/domain"
)

type Repository struct {
	mu               sync.RWMutex
	users            []*domain.User
	transactions     []*domain.Transaction
	appointments     []*domain.Appointment
	materialRequests []*domain.MaterialRequest
}

func NewRepository() *Repository {
	now := time.Now()
	repo := &Repository{
		users: []*domain.User{
			{
				ID:            "usr_ceo_01",
				Name:          "Márcio Rocha",
				PIN:           "1234",
				Role:          domain.RoleCEO,
				StationNumber: 1,
				Active:        true,
				CreatedAt:     now.Add(-240 * time.Hour),
			},
			{
				ID:            "usr_barb_01",
				Name:          "Lucas Fade",
				PIN:           "1111",
				Role:          domain.RoleBarbeiro,
				StationNumber: 2,
				Active:        true,
				CreatedAt:     now.Add(-120 * time.Hour),
			},
			{
				ID:            "usr_barb_02",
				Name:          "Diego Navalha",
				PIN:           "2222",
				Role:          domain.RoleBarbeiro,
				StationNumber: 3,
				Active:        true,
				CreatedAt:     now.Add(-90 * time.Hour),
			},
			{
				ID:            "usr_barb_03",
				Name:          "Rafael Cortes",
				PIN:           "3333",
				Role:          domain.RoleBarbeiro,
				StationNumber: 4,
				Active:        true,
				CreatedAt:     now.Add(-60 * time.Hour),
			},
		},
		transactions: []*domain.Transaction{
			{
				ID:            "tx_01",
				Type:          domain.TypeEntrada,
				Category:      domain.CategoryCombo,
				Description:   "Corte Degradê + Barboterapia",
				Amount:        90.00,
				PaymentMethod: domain.PaymentPIX,
				BarberID:      "usr_barb_01",
				BarberName:    "Lucas Fade",
				Timestamp:     "10:15",
				CreatedAt:     now,
			},
			{
				ID:            "tx_02",
				Type:          domain.TypeEntrada,
				Category:      domain.CategoryCorte,
				Description:   "Corte Social Tesoura",
				Amount:        55.00,
				PaymentMethod: domain.PaymentCartao,
				BarberID:      "usr_barb_02",
				BarberName:    "Diego Navalha",
				Timestamp:     "11:00",
				CreatedAt:     now,
			},
			{
				ID:            "tx_03",
				Type:          domain.TypeEntrada,
				Category:      domain.CategoryProduto,
				Description:   "Pomada Matte Rocha 100g",
				Amount:        45.00,
				PaymentMethod: domain.PaymentDinheiro,
				BarberID:      "usr_ceo_01",
				BarberName:    "Márcio Rocha",
				Timestamp:     "11:30",
				CreatedAt:     now,
			},
			{
				ID:            "tx_04",
				Type:          domain.TypeSaida,
				Category:      domain.CategoryInsumo,
				Description:   "Gelo e Água Mineral para clientes",
				Amount:        32.00,
				PaymentMethod: domain.PaymentPIX,
				BarberID:      "usr_ceo_01",
				BarberName:    "Márcio Rocha",
				Timestamp:     "12:10",
				CreatedAt:     now,
			},
			{
				ID:            "tx_05",
				Type:          domain.TypeEntrada,
				Category:      domain.CategoryBarba,
				Description:   "Alinhamento e Pigmentação",
				Amount:        50.00,
				PaymentMethod: domain.PaymentPIX,
				BarberID:      "usr_barb_03",
				BarberName:    "Rafael Cortes",
				Timestamp:     "13:20",
				CreatedAt:     now,
			},
			{
				ID:            "tx_06",
				Type:          domain.TypeEntrada,
				Category:      domain.CategoryCombo,
				Description:   "Corte Infantil + Desenho",
				Amount:        60.00,
				PaymentMethod: domain.PaymentCartao,
				BarberID:      "usr_barb_01",
				BarberName:    "Lucas Fade",
				Timestamp:     "14:15",
				CreatedAt:     now,
			},
		},
		appointments: []*domain.Appointment{
			{
				ID:         "ap_01",
				ClientName: "Rodrigo Silva",
				Service:    "Corte Degradê",
				Time:       "15:00",
				BarberID:   "usr_barb_01",
				BarberName: "Lucas Fade",
				Amount:     50.00,
				Status:     domain.StatusNaCadeira,
			},
			{
				ID:         "ap_02",
				ClientName: "Carlos Eduardo",
				Service:    "Barboterapia Completa",
				Time:       "15:30",
				BarberID:   "usr_barb_02",
				BarberName: "Diego Navalha",
				Amount:     45.00,
				Status:     domain.StatusEmEspera,
			},
		},
		materialRequests: []*domain.MaterialRequest{
			{
				ID:          "mat_01",
				Item:        "Lâminas descartáveis Derby Premium (1 cx)",
				Quantity:    "1 caixa",
				Urgency:     domain.UrgencyCritica,
				Status:      domain.MaterialStatusPendente,
				RequestedBy: "Diego Navalha",
				RequestedAt: "09:30",
			},
		},
	}

	return repo
}

// Autenticação rápida por PIN numérico
func (r *Repository) AuthenticateByPIN(pin string) (*domain.User, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	for _, u := range r.users {
		if u.PIN == pin && u.Active {
			// Retorna cópia com segurança
			userCopy := *u
			return &userCopy, nil
		}
	}
	return nil, domain.ErrUnauthorized
}

// Obter todos os colaboradores da equipe
func (r *Repository) GetUsers() []*domain.User {
	r.mu.RLock()
	defer r.mu.RUnlock()

	result := make([]*domain.User, len(r.users))
	for i, u := range r.users {
		copyUser := *u
		result[i] = &copyUser
	}
	return result
}

// Criação de usuário - ENFORCE LIMITE DE 5 MEMBROS
func (r *Repository) CreateUser(u *domain.User) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	// REGRA DE NEGÓCIO: Teto estrito de 5 colaboradores
	if len(r.users) >= 5 {
		return domain.ErrMaxUsersReached
	}

	// Validar PIN
	if len(u.PIN) != 4 {
		return domain.ErrInvalidPIN
	}

	for _, existing := range r.users {
		if existing.PIN == u.PIN {
			return domain.ErrPINAlreadyExists
		}
	}

	if u.ID == "" {
		u.ID = fmt.Sprintf("usr_barb_%d", time.Now().UnixNano())
	}
	u.CreatedAt = time.Now()
	u.Active = true

	r.users = append(r.users, u)
	return nil
}

// Atualizar usuário
func (r *Repository) UpdateUser(id string, updates *domain.User) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	for _, u := range r.users {
		if u.ID == id {
			if updates.Name != "" {
				u.Name = updates.Name
			}
			if updates.PIN != "" {
				if len(updates.PIN) != 4 {
					return domain.ErrInvalidPIN
				}
				// Checar conflito com outro usuário
				for _, other := range r.users {
					if other.ID != id && other.PIN == updates.PIN {
						return domain.ErrPINAlreadyExists
					}
				}
				u.PIN = updates.PIN
			}
			if updates.StationNumber > 0 {
				u.StationNumber = updates.StationNumber
			}
			if updates.Role != "" {
				u.Role = updates.Role
			}
			return nil
		}
	}
	return domain.ErrUserNotFound
}

// Deletar usuário (bloqueia exclusão do CEO)
func (r *Repository) DeleteUser(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	targetIndex := -1
	for i, u := range r.users {
		if u.ID == id {
			if u.Role == domain.RoleCEO {
				return domain.ErrCannotDeleteCEO
			}
			targetIndex = i
			break
		}
	}

	if targetIndex == -1 {
		return domain.ErrUserNotFound
	}

	r.users = append(r.users[:targetIndex], r.users[targetIndex+1:]...)
	return nil
}

// Listar movimentações financeiras
func (r *Repository) GetTransactions() []*domain.Transaction {
	r.mu.RLock()
	defer r.mu.RUnlock()

	result := make([]*domain.Transaction, len(r.transactions))
	for i, tx := range r.transactions {
		copyTx := *tx
		result[i] = &copyTx
	}
	return result
}

// Criar nova movimentação no caixa
func (r *Repository) CreateTransaction(tx *domain.Transaction) error {
	if tx.Amount <= 0 {
		return domain.ErrInvalidAmount
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	if tx.ID == "" {
		tx.ID = fmt.Sprintf("tx_%d", time.Now().UnixNano())
	}
	tx.CreatedAt = time.Now()
	if tx.Timestamp == "" {
		tx.Timestamp = tx.CreatedAt.Format("15:04")
	}

	// Inserir no topo para ordem cronológica decrescente
	r.transactions = append([]*domain.Transaction{tx}, r.transactions...)
	return nil
}

// Resumo consolidado do caixa diário
func (r *Repository) GetDailySummary() *domain.DailySummary {
	r.mu.RLock()
	defer r.mu.RUnlock()

	summary := &domain.DailySummary{
		PorFormaPagamento: domain.PaymentBreakdown{},
	}

	for _, tx := range r.transactions {
		if tx.Type == domain.TypeEntrada {
			summary.TotalEntradas += tx.Amount
			switch tx.PaymentMethod {
			case domain.PaymentPIX:
				summary.PorFormaPagamento.PIX += tx.Amount
			case domain.PaymentDinheiro:
				summary.PorFormaPagamento.Dinheiro += tx.Amount
			case domain.PaymentCartao:
				summary.PorFormaPagamento.Cartao += tx.Amount
			}
		} else if tx.Type == domain.TypeSaida {
			summary.TotalSaidas += tx.Amount
		}
	}

	summary.SaldoLiquido = summary.TotalEntradas - summary.TotalSaidas
	summary.TotalAtendimentos = len(r.transactions)

	return summary
}

// Agendamentos
func (r *Repository) GetAppointments() []*domain.Appointment {
	r.mu.RLock()
	defer r.mu.RUnlock()

	result := make([]*domain.Appointment, len(r.appointments))
	for i, ap := range r.appointments {
		copyAp := *ap
		result[i] = &copyAp
	}
	return result
}

func (r *Repository) UpdateAppointmentStatus(id string, status domain.AppointmentStatus) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	for _, ap := range r.appointments {
		if ap.ID == id {
			ap.Status = status
			return nil
		}
	}
	return fmt.Errorf("agendamento não encontrado")
}

// Insumos
func (r *Repository) GetMaterialRequests() []*domain.MaterialRequest {
	r.mu.RLock()
	defer r.mu.RUnlock()

	result := make([]*domain.MaterialRequest, len(r.materialRequests))
	for i, req := range r.materialRequests {
		copyReq := *req
		result[i] = &copyReq
	}
	return result
}

func (r *Repository) CreateMaterialRequest(req *domain.MaterialRequest) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if req.ID == "" {
		req.ID = fmt.Sprintf("mat_%d", time.Now().UnixNano())
	}
	if req.RequestedAt == "" {
		req.RequestedAt = time.Now().Format("15:04")
	}
	if req.Status == "" {
		req.Status = domain.MaterialStatusPendente
	}

	r.materialRequests = append([]*domain.MaterialRequest{req}, r.materialRequests...)
	return nil
}
