export type UserRole = "CEO" | "BARBEIRO";

export interface User {
  id: string;
  name: string;
  pin: string; // 4 dígitos
  role: UserRole;
  avatar?: string;
  stationNumber?: number; // Cadeira 1, 2, 3
  active: boolean;
}

export type PaymentMethod = "PIX" | "DINHEIRO" | "CARTAO";

export type TransactionType = "ENTRADA" | "SAIDA";

export type TransactionCategory = 
  | "CORTE" 
  | "BARBA" 
  | "COMBO" 
  | "PRODUTO" 
  | "INSUMO" 
  | "DESPESA_GERAL"
  | "SANGRIA";

export interface Transaction {
  id: string;
  type: TransactionType;
  category: TransactionCategory;
  description: string;
  amount: number;
  paymentMethod: PaymentMethod;
  barberId?: string;
  barberName: string;
  timestamp: string; // ISO ou formatado HH:mm
}

export type AppointmentStatus = "EM_ESPERA" | "NA_CADEIRA" | "CONCLUIDO" | "CANCELADO";

export interface Appointment {
  id: string;
  clientName: string;
  service: string;
  time: string; // Ex: "14:30"
  barberId: string;
  barberName: string;
  amount: number;
  status: AppointmentStatus;
}

export type MaterialUrgency = "BAIXA" | "MEDIA" | "ALTA" | "CRITICA";
export type MaterialStatus = "PENDENTE" | "COMPRADO" | "ENTREGUE";

export interface MaterialRequest {
  id: string;
  item: string;
  quantity: string;
  urgency: MaterialUrgency;
  status: MaterialStatus;
  requestedBy: string;
  requestedAt: string;
}

export interface DailySummary {
  saldoLiquido: number;
  totalEntradas: number;
  totalSaidas: number;
  totalAtendimentos: number;
  porFormaPagamento: {
    pix: number;
    dinheiro: number;
    cartao: number;
  };
}
