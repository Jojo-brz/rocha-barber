export type UserRole = "admin" | "barbeiro";

export interface User {
  id: number | string;
  name: string;
  pin?: string;
  role: UserRole;
  stationNumber?: number;
  token?: string;
}

export type PaymentMethod = "pix" | "dinheiro" | "cartao_credito" | "cartao_debito";

export type TransactionType = "entrada" | "saida";

export interface Transaction {
  id: number | string;
  type: TransactionType;
  description: string;
  amount: number;
  paymentMethod: PaymentMethod;
  barberId?: number | string | null;
  barberName: string;
  timestamp: string;
  createdAt?: string;
}

export type AppointmentStatus = "agendado" | "concluido" | "cancelado";

export interface Appointment {
  id: number | string;
  clientName: string;
  service: string;
  time: string;
  barberId: number | string;
  barberName: string;
  status: AppointmentStatus;
}

export type MaterialUrgency = "baixa" | "media" | "alta";
export type MaterialStatus = "pendente" | "comprado";

export interface MaterialRequest {
  id: number | string;
  item: string;
  quantity: number;
  urgency: MaterialUrgency;
  status: MaterialStatus;
  requestedBy: string;
  requestedAt: string;
}

export interface DailySummary {
  saldoLiquido: number;
  totalEntradas: number;
  totalSaidas: number;
  totalMovimentacoes: number;
  porFormaPagamento: {
    pix: number;
    dinheiro: number;
    cartaoCredito: number;
    cartaoDebito: number;
  };
  movimentacoes: Transaction[];
}

export interface AdminUsuariosResponse {
  limite_maximo: number;
  total_membros: number;
  vagas_livres: number;
  usuarios: Array<{
    id: number;
    nome: string;
    pin: string;
    papel: UserRole;
    criado_em: string;
  }>;
}
