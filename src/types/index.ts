export type UserRole = "admin" | "ceo" | "barbeiro";

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

export type CaixaPeriod = "diario" | "semanal" | "mensal";

export interface PeriodBreakdown {
  entradas: number;
  saidas: number;
  saldoLiquido: number;
  totalMovimentacoes: number;
}

export type ExpenseCategory = "USO DIARIO" | "DESPESA GERAL";

export interface Transaction {
  id: number | string;
  type: TransactionType;
  category?: string;
  description: string;
  amount: number;
  paymentMethod: PaymentMethod;
  barberId?: number | string | null;
  barberName: string;
  date?: string;
  timestamp: string;
  createdAt?: string;
}

export type AppointmentStatus = "agendado" | "concluido" | "cancelado";

export interface Appointment {
  id: number | string;
  clientName: string;
  service: string;
  amount?: number;
  paymentMethod?: PaymentMethod;
  dateISO?: string;
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
  periodo: CaixaPeriod;
  dataReferencia: string;
  barbeiroIdFiltro?: number | null;
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
  faturamentoPeriodos: {
    dataReferencia: string;
    diario: PeriodBreakdown;
    semanal: PeriodBreakdown;
    mensal: PeriodBreakdown;
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
