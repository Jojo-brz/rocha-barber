import {
  User,
  UserRole,
  DailySummary,
  CaixaPeriod,
  Transaction,
  Appointment,
  AppointmentStatus,
  PaymentMethod,
  TransactionType,
  AdminUsuariosResponse,
  MaterialRequest,
  MaterialUrgency,
  MaterialStatus,
} from "@/types";

function formatTxDateTime(iso: string, serverDate?: string, serverTime?: string) {
  const d = new Date(iso);
  const valid = !isNaN(d.getTime());
  const date =
    serverDate ||
    (valid
      ? `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1)
          .toString()
          .padStart(2, "0")}/${d.getFullYear()}`
      : "--/--/----");
  const timestamp =
    serverTime ||
    (valid
      ? `${d.getHours().toString().padStart(2, "0")}:${d
          .getMinutes()
          .toString()
          .padStart(2, "0")}`
      : "Hoje");
  return { date, timestamp };
}

const RAW_API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
export const API_BASE_URL = RAW_API_URL.replace(/\/+$/, "");

const SESSION_KEY = "barbearia_rocha_user";
let inMemoryToken: string | null = null;

function getSessionToken(): string | null {
  if (inMemoryToken) return inMemoryToken;
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { token?: string };
    return parsed?.token || null;
  } catch {
    return null;
  }
}

export function clearSessionAuth() {
  inMemoryToken = null;
  if (typeof window !== "undefined") {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // Ignora erro de storage
    }
  }
}

class ApiError extends Error {
  constructor(public message: string, public status?: number) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };

  if (endpoint !== "/api/auth/pin") {
    const token = getSessionToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  try {
    const res = await fetch(url, {
      ...options,
      headers,
    });

    const data = await res.json().catch(() => null);

    if (res.status === 401 && endpoint !== "/api/auth/pin") {
      clearSessionAuth();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("rocha:unauthorized"));
      }
    }

    if (!res.ok) {
      const errorMsg = data?.error || `Erro na requisição (${res.status})`;
      throw new ApiError(errorMsg, res.status);
    }

    return data as T;
  } catch (err: any) {
    if (err instanceof ApiError) {
      throw err;
    }
    throw new ApiError(
      `Não foi possível conectar ao servidor backend (${API_BASE_URL}). Verifique sua conexão ou se a API está online no Fly.io.`,
      503
    );
  }
}

export const api = {
  // 1. Autenticação por PIN
  async loginByPin(pin: string): Promise<User> {
    const data = await request<{
      id: number;
      nome: string;
      papel: UserRole;
      token: string;
    }>("/api/auth/pin", {
      method: "POST",
      body: JSON.stringify({ pin }),
    });

    inMemoryToken = data.token;

    return {
      id: data.id,
      name: data.nome,
      role: data.papel,
      token: data.token,
    };
  },

  // Equipe autenticada (sem expor PINs)
  async getEquipe(): Promise<User[]> {
    const raw = await request<
      Array<{
        id: number;
        nome: string;
        papel: UserRole;
      }>
    >("/api/equipe", { method: "GET" });

    return (raw || []).map((m, idx) => ({
      id: m.id,
      name: m.nome,
      role: m.papel,
      stationNumber: idx + 1,
    }));
  },

  // 2. Controle de Caixa (Diário, Semanal e Mensal com sincronização de data e filtro RBAC por barbeiro)
  async getCaixaSummary(
    periodo: CaixaPeriod = "diario",
    data?: string,
    barbeiroId?: number | string
  ): Promise<DailySummary> {
    const params = new URLSearchParams();
    params.set("periodo", periodo);
    if (data && data.trim()) {
      params.set("data", data.trim());
    }
    if (barbeiroId && String(barbeiroId) !== "todos") {
      params.set("barbeiro_id", String(barbeiroId));
    }

    const raw = await request<{
      periodo?: CaixaPeriod;
      data_referencia?: string;
      barbeiro_id_filtro?: number | null;
      saldo_liquido: number;
      total_entradas: number;
      total_saidas: number;
      total_movimentacoes: number;
      por_forma_pagamento: {
        pix: number;
        dinheiro: number;
        cartao_credito: number;
        cartao_debito: number;
      };
      faturamento_periodos?: {
        data_referencia?: string;
        diario?: { entradas: number; saidas: number; saldo_liquido: number; total_movimentacoes: number };
        semanal?: { entradas: number; saidas: number; saldo_liquido: number; total_movimentacoes: number };
        mensal?: { entradas: number; saidas: number; saldo_liquido: number; total_movimentacoes: number };
      };
      movimentacoes: Array<{
        id: number;
        barbeiro_id?: number | null;
        barbeiro_nome?: string;
        tipo: TransactionType;
        descricao: string;
        valor: number;
        forma_pagamento: PaymentMethod;
        criado_em: string;
        data_formatada?: string;
        hora_formatada?: string;
      }>;
    }>(`/api/caixa?${params.toString()}`, { method: "GET" });

    const movimentacoes: Transaction[] = (raw.movimentacoes || []).map((m) => {
      const { date, timestamp } = formatTxDateTime(
        m.criado_em,
        m.data_formatada,
        m.hora_formatada
      );

      return {
        id: m.id,
        type: m.tipo,
        description: m.descricao,
        amount: Number(m.valor),
        paymentMethod: m.forma_pagamento,
        barberId: m.barbeiro_id,
        barberName: m.barbeiro_nome || "Geral/Caixa",
        date,
        timestamp,
        createdAt: m.criado_em,
      };
    });

    const mapBreakdown = (b?: {
      entradas: number;
      saidas: number;
      saldo_liquido: number;
      total_movimentacoes: number;
    }) => ({
      entradas: Number(b?.entradas || 0),
      saidas: Number(b?.saidas || 0),
      saldoLiquido: Number(b?.saldo_liquido || 0),
      totalMovimentacoes: Number(b?.total_movimentacoes || 0),
    });

    const refDate = raw.data_referencia || data || "";

    return {
      periodo: raw.periodo || periodo,
      dataReferencia: refDate,
      barbeiroIdFiltro: raw.barbeiro_id_filtro ?? null,
      saldoLiquido: Number(raw.saldo_liquido || 0),
      totalEntradas: Number(raw.total_entradas || 0),
      totalSaidas: Number(raw.total_saidas || 0),
      totalMovimentacoes: Number(raw.total_movimentacoes || 0),
      porFormaPagamento: {
        pix: Number(raw.por_forma_pagamento?.pix || 0),
        dinheiro: Number(raw.por_forma_pagamento?.dinheiro || 0),
        cartaoCredito: Number(raw.por_forma_pagamento?.cartao_credito || 0),
        cartaoDebito: Number(raw.por_forma_pagamento?.cartao_debito || 0),
      },
      faturamentoPeriodos: {
        dataReferencia: raw.faturamento_periodos?.data_referencia || refDate,
        diario: mapBreakdown(raw.faturamento_periodos?.diario),
        semanal: mapBreakdown(raw.faturamento_periodos?.semanal),
        mensal: mapBreakdown(raw.faturamento_periodos?.mensal),
      },
      movimentacoes,
    };
  },

  async criarMovimentacao(payload: {
    tipo: TransactionType;
    descricao: string;
    valor: number;
    forma_pagamento: PaymentMethod;
    barbeiro_id?: number | null;
    data?: string;
  }): Promise<Transaction> {
    const raw = await request<{
      id: number;
      barbeiro_id?: number;
      barbeiro_nome?: string;
      tipo: TransactionType;
      descricao: string;
      valor: number;
      forma_pagamento: PaymentMethod;
      criado_em: string;
      data_formatada?: string;
      hora_formatada?: string;
    }>("/api/caixa", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const { date: dateStr, timestamp: timeStr } = formatTxDateTime(
      raw.criado_em,
      raw.data_formatada,
      raw.hora_formatada
    );

    return {
      id: raw.id,
      type: raw.tipo,
      description: raw.descricao,
      amount: Number(raw.valor),
      paymentMethod: raw.forma_pagamento,
      barberId: raw.barbeiro_id,
      barberName: raw.barbeiro_nome || "Registrado",
      date: dateStr,
      timestamp: timeStr,
      createdAt: raw.criado_em,
    };
  },

  // 3. Agendamentos
  async getAgendamentos(
    barbeiroId?: number | string,
    data?: string
  ): Promise<Appointment[]> {
    const params = new URLSearchParams();
    if (barbeiroId && String(barbeiroId) !== "todos") {
      params.set("barbeiro_id", String(barbeiroId));
    }
    if (data) params.set("data", data);

    const qs = params.toString();
    const endpoint = qs ? `/api/agendamentos?${qs}` : "/api/agendamentos";

    const raw = await request<
      Array<{
        id: number;
        barbeiro_id: number;
        barbeiro_nome?: string;
        cliente_nome: string;
        servico: string;
        data_hora: string;
        hora_formatada?: string;
        status: AppointmentStatus;
      }>
    >(endpoint, { method: "GET" });

    return (raw || []).map((a) => {
      let timeStr = a.hora_formatada;
      if (!timeStr) {
        const d = new Date(a.data_hora);
        timeStr = !isNaN(d.getTime())
          ? `${d.getHours().toString().padStart(2, "0")}:${d
              .getMinutes()
              .toString()
              .padStart(2, "0")}`
          : "12:00";
      }

      return {
        id: a.id,
        clientName: a.cliente_nome,
        service: a.servico,
        time: timeStr,
        barberId: a.barbeiro_id,
        barberName: a.barbeiro_nome || "Barbeiro",
        status: a.status,
      };
    });
  },

  async criarAgendamento(payload: {
    barbeiro_id: number;
    cliente_nome: string;
    servico: string;
    data_hora: string;
  }): Promise<Appointment> {
    const raw = await request<{
      id: number;
      barbeiro_id: number;
      barbeiro_nome?: string;
      cliente_nome: string;
      servico: string;
      data_hora: string;
      hora_formatada?: string;
      status: AppointmentStatus;
    }>("/api/agendamentos", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    return {
      id: raw.id,
      clientName: raw.cliente_nome,
      service: raw.servico,
      time: raw.hora_formatada || "12:00",
      barberId: raw.barbeiro_id,
      barberName: raw.barbeiro_nome || "Barbeiro",
      status: raw.status,
    };
  },

  async atualizarStatusAgendamento(
    id: number | string,
    status: AppointmentStatus
  ): Promise<Appointment> {
    const raw = await request<{
      id: number;
      barbeiro_id: number;
      barbeiro_nome?: string;
      cliente_nome: string;
      servico: string;
      data_hora: string;
      hora_formatada?: string;
      status: AppointmentStatus;
    }>(`/api/agendamentos/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });

    return {
      id: raw.id,
      clientName: raw.cliente_nome,
      service: raw.servico,
      time: raw.hora_formatada || "12:00",
      barberId: raw.barbeiro_id,
      barberName: raw.barbeiro_nome || "Barbeiro",
      status: raw.status,
    };
  },

  async deletarAgendamento(id: number | string): Promise<void> {
    await request(`/api/agendamentos/${id}`, {
      method: "DELETE",
    });
  },

  // 4. Pedidos de Materiais (Neon: pedidos_materiais)
  async getMateriais(): Promise<MaterialRequest[]> {
    const raw = await request<
      Array<{
        id: number;
        solicitante_id?: number;
        solicitante_nome?: string;
        item: string;
        quantidade: number;
        urgencia: MaterialUrgency;
        status: MaterialStatus;
        criado_em: string;
      }>
    >("/api/materiais", { method: "GET" });

    return (raw || []).map((p) => {
      const d = new Date(p.criado_em);
      const timeStr = !isNaN(d.getTime())
        ? `${d.getHours().toString().padStart(2, "0")}:${d
            .getMinutes()
            .toString()
            .padStart(2, "0")}`
        : "Hoje";

      return {
        id: p.id,
        item: p.item,
        quantity: p.quantidade,
        urgency: p.urgencia,
        status: p.status,
        requestedBy: p.solicitante_nome || "Bancada",
        requestedAt: timeStr,
      };
    });
  },

  async criarMaterial(payload: {
    solicitante_id?: number | null;
    item: string;
    quantidade: number;
    urgencia: MaterialUrgency;
  }): Promise<MaterialRequest> {
    const raw = await request<{
      id: number;
      solicitante_id?: number;
      item: string;
      quantidade: number;
      urgencia: MaterialUrgency;
      status: MaterialStatus;
      criado_em: string;
    }>("/api/materiais", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    return {
      id: raw.id,
      item: raw.item,
      quantity: raw.quantidade,
      urgency: raw.urgencia,
      status: raw.status,
      requestedBy: "Bancada",
      requestedAt: "Agora",
    };
  },

  async atualizarStatusMaterial(
    id: number | string,
    status: MaterialStatus
  ): Promise<MaterialRequest> {
    const raw = await request<{
      id: number;
      solicitante_nome?: string;
      item: string;
      quantidade: number;
      urgencia: MaterialUrgency;
      status: MaterialStatus;
      criado_em: string;
    }>(`/api/materiais/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });

    return {
      id: raw.id,
      item: raw.item,
      quantity: raw.quantidade,
      urgency: raw.urgencia,
      status: raw.status,
      requestedBy: raw.solicitante_nome || "Bancada",
      requestedAt: "Hoje",
    };
  },

  // 5. Gestão de Equipe (Exclusivo CEO)
  async getUsuariosAdmin(): Promise<AdminUsuariosResponse> {
    return request<AdminUsuariosResponse>("/api/admin/usuarios", {
      method: "GET",
    });
  },

  async criarUsuarioAdmin(payload: {
    nome: string;
    pin: string;
    papel: UserRole;
  }): Promise<User> {
    const raw = await request<{
      id: number;
      nome: string;
      pin: string;
      papel: UserRole;
    }>("/api/admin/usuarios", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    return {
      id: raw.id,
      name: raw.nome,
      pin: raw.pin,
      role: raw.papel,
    };
  },

  // Remover barbeiro da equipe (apenas CEO, admins são protegidos pelo backend)
  async deletarUsuarioAdmin(id: number): Promise<{ message: string }> {
    return request<{ message: string }>(`/api/admin/usuarios/${id}`, {
      method: "DELETE",
    });
  },

  // Editar nome e PIN de um barbeiro (PUT /api/admin/usuarios/{id})
  async editarUsuarioAdmin(
    id: number,
    payload: { nome: string; pin: string }
  ): Promise<User> {
    const raw = await request<{
      id: number;
      nome: string;
      pin: string;
      papel: UserRole;
    }>(`/api/admin/usuarios/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });

    return {
      id: raw.id,
      name: raw.nome,
      pin: raw.pin,
      role: raw.papel,
    };
  },
};
