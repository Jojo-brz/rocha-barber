"use client";

import React, { useState, useMemo } from "react";
import {
  User,
  Transaction,
  Appointment,
  MaterialRequest,
  PaymentMethod,
  TransactionCategory,
} from "@/types";
import {
  INITIAL_TRANSACTIONS,
  INITIAL_APPOINTMENTS,
  INITIAL_MATERIAL_REQUESTS,
  INITIAL_USERS,
} from "@/data/mock-data";
import { TeamManagementModal } from "./team-management-modal";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  QrCode,
  Banknote,
  CreditCard,
  PlusCircle,
  MinusCircle,
  Calendar,
  Package,
  Lock,
  Users,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  Scissors,
  X,
  Settings,
} from "lucide-react";

interface DashboardCaixaProps {
  currentUser: User;
  users: User[];
  onUpdateUsers: (newUsers: User[]) => void;
  onLogout: () => void;
}

export const DashboardCaixa: React.FC<DashboardCaixaProps> = ({
  currentUser,
  users,
  onUpdateUsers,
  onLogout,
}) => {
  // Estados de dados
  const [transactions, setTransactions] = useState<Transaction[]>(INITIAL_TRANSACTIONS);
  const [appointments, setAppointments] = useState<Appointment[]>(INITIAL_APPOINTMENTS);
  const [materialRequests, setMaterialRequests] = useState<MaterialRequest[]>(
    INITIAL_MATERIAL_REQUESTS
  );
  const [activeTab, setActiveTab] = useState<"caixa" | "agenda" | "insumos" | "equipe">(
    "caixa"
  );

  // Modal de Gestão de Equipe (CEO)
  const [isTeamModalOpen, setIsTeamModalOpen] = useState<boolean>(false);

  // Estados dos Modais Rápidos
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalType, setModalType] = useState<"ENTRADA" | "SAIDA">("ENTRADA");
  const [amountInput, setAmountInput] = useState<string>("");
  const [descInput, setDescInput] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("PIX");
  const [category, setCategory] = useState<TransactionCategory>("CORTE");
  const [selectedBarberId, setSelectedBarberId] = useState<string>(currentUser.id);

  // Modal de pedido de insumo
  const [isMaterialModalOpen, setIsMaterialModalOpen] = useState<boolean>(false);
  const [materialItem, setMaterialItem] = useState<string>("");
  const [materialUrgency, setMaterialUrgency] = useState<
    "BAIXA" | "MEDIA" | "ALTA" | "CRITICA"
  >("ALTA");

  // Cálculos Consolidados de Caixa
  const summary = useMemo(() => {
    let entradas = 0;
    let saidas = 0;
    let pix = 0;
    let dinheiro = 0;
    let cartao = 0;

    transactions.forEach((tx) => {
      if (tx.type === "ENTRADA") {
        entradas += tx.amount;
        if (tx.paymentMethod === "PIX") pix += tx.amount;
        if (tx.paymentMethod === "DINHEIRO") dinheiro += tx.amount;
        if (tx.paymentMethod === "CARTAO") cartao += tx.amount;
      } else {
        saidas += tx.amount;
      }
    });

    const saldoLiquido = entradas - saidas;

    return {
      entradas,
      saidas,
      saldoLiquido,
      pix,
      dinheiro,
      cartao,
      totalCount: transactions.length,
    };
  }, [transactions]);

  // Handlers de Equipe (CEO)
  const handleAddUser = (userData: Omit<User, "id">) => {
    if (users.length >= 5) {
      return { success: false, error: "Limite estrito de 5 colaboradores atingido." };
    }
    const newUser: User = {
      ...userData,
      id: `usr_barb_${Date.now()}`,
    };
    onUpdateUsers([...users, newUser]);
    return { success: true };
  };

  const handleUpdateUser = (id: string, updates: Partial<User>) => {
    const updated = users.map((u) => (u.id === id ? { ...u, ...updates } : u));
    onUpdateUsers(updated);
  };

  const handleDeleteUser = (id: string) => {
    const target = users.find((u) => u.id === id);
    if (target?.role === "CEO") {
      return { success: false, error: "Não é permitido excluir o usuário Administrador/CEO." };
    }
    onUpdateUsers(users.filter((u) => u.id !== id));
    return { success: true };
  };

  // Handler para Novo Lançamento Financeiro
  const handleCreateTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(amountInput.replace(",", "."));
    if (isNaN(val) || val <= 0) return;

    const barberObj = users.find((u) => u.id === selectedBarberId);

    const now = new Date();
    const timeFormatted = `${now.getHours().toString().padStart(2, "0")}:${now
      .getMinutes()
      .toString()
      .padStart(2, "0")}`;

    const newTx: Transaction = {
      id: `tx_${Date.now()}`,
      type: modalType,
      category: category,
      description: descInput || (modalType === "ENTRADA" ? "Serviço Avulso" : "Despesa Bancada"),
      amount: val,
      paymentMethod: paymentMethod,
      barberId: barberObj?.id,
      barberName: barberObj ? barberObj.name : currentUser.name,
      timestamp: timeFormatted,
    };

    setTransactions([newTx, ...transactions]);
    setIsModalOpen(false);
    setAmountInput("");
    setDescInput("");
  };

  // Handler para Pedido de Material
  const handleCreateMaterialRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!materialItem.trim()) return;

    const newRequest: MaterialRequest = {
      id: `mat_${Date.now()}`,
      item: materialItem,
      quantity: "1 un",
      urgency: materialUrgency,
      status: "PENDENTE",
      requestedBy: currentUser.name,
      requestedAt: "Agora",
    };

    setMaterialRequests([newRequest, ...materialRequests]);
    setIsMaterialModalOpen(false);
    setMaterialItem("");
  };

  // Atualizar status do agendamento
  const handleUpdateAppointmentStatus = (
    id: string,
    status: Appointment["status"]
  ) => {
    setAppointments((prev) =>
      prev.map((app) => (app.id === id ? { ...app, status } : app))
    );
  };

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col font-sans pb-24 md:pb-8">
      {/* Top Navbar Sofisticada */}
      <header className="sticky top-0 z-40 w-full backdrop-blur-xl bg-[#0b0f19]/80 border-b border-white/10 px-4 py-3 sm:px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500/20 to-amber-600/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Scissors className="w-5 h-5 -rotate-45" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold tracking-tight text-white flex items-center gap-2">
                ROCHA BARBERSHOP
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  CAIXA ABERTO
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                {new Date().toLocaleDateString("pt-BR", {
                  weekday: "long",
                  day: "2-digit",
                  month: "short",
                })}
              </p>
            </div>
          </div>

          {/* Perfil Ativo & Bloqueio Rápido */}
          <div className="flex items-center gap-2.5">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-semibold text-slate-200">
                {currentUser.name}
              </p>
              <p className="text-[10px] text-amber-400 font-medium">
                {currentUser.role === "CEO" ? "👑 CEO / Administrador" : `💈 Cadeira ${currentUser.stationNumber || 1}`}
              </p>
            </div>
            <div className="w-9 h-9 rounded-full bg-slate-800 border border-white/15 flex items-center justify-center font-bold text-xs text-amber-300">
              {currentUser.name.slice(0, 2).toUpperCase()}
            </div>
            <button
              onClick={onLogout}
              title="Bloquear Bancada (Trocar PIN)"
              className="p-2 rounded-xl bg-slate-900 border border-white/10 text-slate-400 hover:text-rose-400 hover:border-rose-500/30 hover:bg-rose-950/20 transition-all"
            >
              <Lock className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Conteúdo Principal */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 pt-5">
        {/* Banner do Perfil Mobile */}
        <div className="sm:hidden flex items-center justify-between mb-4 p-3 rounded-2xl bg-slate-900/60 border border-white/5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">
              {currentUser.name}
            </span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                currentUser.role === "CEO"
                  ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                  : "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
              }`}
            >
              {currentUser.role}
            </span>
          </div>
          <span className="text-xs text-slate-400">
            {currentUser.role === "CEO" ? "Painel Geral" : `Cadeira ${currentUser.stationNumber}`}
          </span>
        </div>

        {/* 1. CARDS DE RESUMO DO CAIXA (DARK LUXURY) */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mb-6">
          {/* Card 1: Saldo Líquido do Dia (Destaque Principal) */}
          <div className="relative overflow-hidden p-5 rounded-2xl bg-gradient-to-br from-[#0c1815] via-[#0f172a] to-[#07090e] border border-emerald-500/30 shadow-emerald-glow">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <Wallet className="w-4 h-4" /> Saldo Líquido do Dia
              </span>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-medium">
                Consolidado
              </span>
            </div>
            <div className="text-3xl font-extrabold text-white tracking-tight">
              R$ {summary.saldoLiquido.toFixed(2).replace(".", ",")}
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-slate-400 border-t border-emerald-500/10 pt-2.5">
              <span>Entradas: <strong className="text-emerald-400">R$ {summary.entradas.toFixed(2)}</strong></span>
              <span>Saídas: <strong className="text-rose-400">R$ {summary.saidas.toFixed(2)}</strong></span>
            </div>
          </div>

          {/* Card 2: Entradas Brutas & Serviços */}
          <div className="p-5 rounded-2xl bg-slate-900/60 backdrop-blur-md border border-white/10 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-emerald-400" /> Total Entradas
              </span>
              <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                +{summary.totalCount} mov.
              </span>
            </div>
            <div className="text-2xl font-bold text-emerald-400">
              R$ {summary.entradas.toFixed(2).replace(".", ",")}
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Cortes, barbas, combos e produtos vendidos
            </p>
          </div>

          {/* Card 3: Saídas e Insumos */}
          <div className="p-5 rounded-2xl bg-slate-900/60 backdrop-blur-md border border-white/10 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <TrendingDown className="w-4 h-4 text-rose-400" /> Despesas & Insumos
              </span>
              <span className="text-xs font-mono text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-md">
                Saídas
              </span>
            </div>
            <div className="text-2xl font-bold text-rose-400">
              R$ {summary.saidas.toFixed(2).replace(".", ",")}
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Gastos operacionais imediatos e compras da barbearia
            </p>
          </div>
        </section>

        {/* 2. DISCRIMINAÇÃO POR FORMA DE PAGAMENTO */}
        <section className="mb-6 p-4 rounded-2xl bg-slate-900/40 border border-white/10">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
            Entradas por Meio de Pagamento
          </p>
          <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
            <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 flex flex-col">
              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <QrCode className="w-3.5 h-3.5 text-cyan-400" /> PIX
              </span>
              <span className="text-base sm:text-lg font-bold text-slate-100 mt-1">
                R$ {summary.pix.toFixed(2).replace(".", ",")}
              </span>
              <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                <div
                  className="bg-cyan-400 h-full rounded-full"
                  style={{
                    width: `${summary.entradas > 0 ? (summary.pix / summary.entradas) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 flex flex-col">
              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <Banknote className="w-3.5 h-3.5 text-emerald-400" /> Dinheiro
              </span>
              <span className="text-base sm:text-lg font-bold text-slate-100 mt-1">
                R$ {summary.dinheiro.toFixed(2).replace(".", ",")}
              </span>
              <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                <div
                  className="bg-emerald-400 h-full rounded-full"
                  style={{
                    width: `${summary.entradas > 0 ? (summary.dinheiro / summary.entradas) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 flex flex-col">
              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <CreditCard className="w-3.5 h-3.5 text-amber-400" /> Cartão
              </span>
              <span className="text-base sm:text-lg font-bold text-slate-100 mt-1">
                R$ {summary.cartao.toFixed(2).replace(".", ",")}
              </span>
              <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                <div
                  className="bg-amber-400 h-full rounded-full"
                  style={{
                    width: `${summary.entradas > 0 ? (summary.cartao / summary.entradas) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </section>

        {/* 3. AÇÕES RÁPIDAS DE BANCADA (FAST BUTTONS) */}
        <section className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <button
            onClick={() => {
              setModalType("ENTRADA");
              setCategory("CORTE");
              setIsModalOpen(true);
            }}
            className="p-3.5 rounded-2xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 font-semibold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all shadow-sm"
          >
            <PlusCircle className="w-5 h-5" />
            + Lançar Entrada
          </button>

          <button
            onClick={() => {
              setModalType("SAIDA");
              setCategory("INSUMO");
              setIsModalOpen(true);
            }}
            className="p-3.5 rounded-2xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 font-semibold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all shadow-sm"
          >
            <MinusCircle className="w-5 h-5" />
            - Lançar Saída
          </button>

          <button
            onClick={() => setActiveTab("agenda")}
            className="p-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-white/10 text-slate-200 font-semibold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all shadow-sm"
          >
            <Calendar className="w-5 h-5 text-amber-400" />
            Agenda Hoje
          </button>

          <button
            onClick={() => setIsMaterialModalOpen(true)}
            className="p-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-white/10 text-slate-200 font-semibold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all shadow-sm"
          >
            <Package className="w-5 h-5 text-cyan-400" />
            Pedir Material
          </button>
        </section>

        {/* 4. NAVEGAÇÃO POR ABAS DO MÓDULO */}
        <div className="flex items-center gap-2 border-b border-white/10 mb-5 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveTab("caixa")}
            className={`pb-2.5 px-3 text-xs sm:text-sm font-semibold transition-colors flex items-center gap-2 border-b-2 whitespace-nowrap ${
              activeTab === "caixa"
                ? "border-emerald-400 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Wallet className="w-4 h-4" />
            Movimentações do Caixa ({transactions.length})
          </button>

          <button
            onClick={() => setActiveTab("agenda")}
            className={`pb-2.5 px-3 text-xs sm:text-sm font-semibold transition-colors flex items-center gap-2 border-b-2 whitespace-nowrap ${
              activeTab === "agenda"
                ? "border-amber-400 text-amber-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Calendar className="w-4 h-4" />
            Fila & Agenda ({appointments.length})
          </button>

          <button
            onClick={() => setActiveTab("insumos")}
            className={`pb-2.5 px-3 text-xs sm:text-sm font-semibold transition-colors flex items-center gap-2 border-b-2 whitespace-nowrap ${
              activeTab === "insumos"
                ? "border-cyan-400 text-cyan-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Package className="w-4 h-4" />
            Pedidos de Insumo ({materialRequests.length})
          </button>

          {currentUser.role === "CEO" && (
            <button
              onClick={() => setActiveTab("equipe")}
              className={`pb-2.5 px-3 text-xs sm:text-sm font-semibold transition-colors flex items-center gap-2 border-b-2 whitespace-nowrap ${
                activeTab === "equipe"
                  ? "border-purple-400 text-purple-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <Users className="w-4 h-4" />
              Equipe ({users.length}/5 Vagas)
            </button>
          )}
        </div>

        {/* 5. ABA ATIVA CONTEÚDO */}

        {/* TAB CAIXA: EXTRATO DO DIA */}
        {activeTab === "caixa" && (
          <div className="space-y-2.5">
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="p-3.5 rounded-2xl bg-slate-900/50 hover:bg-slate-900/80 border border-white/5 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${
                      tx.type === "ENTRADA"
                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                        : "bg-rose-500/15 text-rose-400 border border-rose-500/20"
                    }`}
                  >
                    {tx.type === "ENTRADA" ? "+" : "-"}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-200">
                      {tx.description}
                    </p>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                      <span className="text-amber-300/90 font-medium">
                        {tx.barberName}
                      </span>
                      <span>•</span>
                      <span className="font-mono text-slate-500">{tx.timestamp}</span>
                      <span>•</span>
                      <span className="px-1.5 py-0.2 rounded bg-white/5 text-slate-300 text-[10px]">
                        {tx.paymentMethod}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <span
                    className={`text-sm sm:text-base font-bold font-mono ${
                      tx.type === "ENTRADA" ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {tx.type === "ENTRADA" ? "+" : "-"} R$ {tx.amount.toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB AGENDA: GESTÃO DE HORÁRIOS */}
        {activeTab === "agenda" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400 px-1">
              <span>Atendimentos programados para hoje</span>
              <span className="text-amber-400 font-medium">
                {currentUser.role === "BARBEIRO"
                  ? `Filtrado por: ${currentUser.name}`
                  : "Visão Geral (Todas as Cadeiras)"}
              </span>
            </div>

            {appointments
              .filter(
                (app) =>
                  currentUser.role === "CEO" || app.barberId === currentUser.id
              )
              .map((app) => (
                <div
                  key={app.id}
                  className="p-4 rounded-2xl bg-slate-900/60 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="px-2.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 font-mono font-bold text-xs flex flex-col items-center justify-center">
                      <Clock className="w-3.5 h-3.5 mb-0.5" />
                      {app.time}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">
                        {app.clientName}
                      </h4>
                      <p className="text-xs text-slate-300">{app.service}</p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Profissional: <span className="text-slate-300">{app.barberName}</span> • R$ {app.amount.toFixed(2)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    {app.status === "EM_ESPERA" && (
                      <button
                        onClick={() =>
                          handleUpdateAppointmentStatus(app.id, "NA_CADEIRA")
                        }
                        className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs font-semibold"
                      >
                        Chamar pra Cadeira
                      </button>
                    )}
                    {app.status === "NA_CADEIRA" && (
                      <button
                        onClick={() =>
                          handleUpdateAppointmentStatus(app.id, "CONCLUIDO")
                        }
                        className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Concluir Atendimento
                      </button>
                    )}
                    {app.status === "CONCLUIDO" && (
                      <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold">
                        ✓ Concluído
                      </span>
                    )}
                  </div>
                </div>
              ))}
          </div>
        )}

        {/* TAB INSUMOS: ALERTA DE MATERIAIS */}
        {activeTab === "insumos" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">
                Lista de materiais em falta ou solicitados pela equipe
              </p>
              <button
                onClick={() => setIsMaterialModalOpen(true)}
                className="text-xs text-cyan-400 hover:underline font-semibold"
              >
                + Novo Pedido
              </button>
            </div>

            {materialRequests.map((req) => (
              <div
                key={req.id}
                className="p-3.5 rounded-2xl bg-slate-900/60 border border-white/5 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-2.5 h-10 rounded-full ${
                      req.urgency === "CRITICA"
                        ? "bg-rose-500"
                        : req.urgency === "ALTA"
                        ? "bg-amber-500"
                        : "bg-slate-500"
                    }`}
                  />
                  <div>
                    <p className="text-sm font-semibold text-slate-200">
                      {req.item}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Pedido por {req.requestedBy} • {req.requestedAt}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                      req.urgency === "CRITICA"
                        ? "bg-rose-500/20 text-rose-300"
                        : "bg-amber-500/20 text-amber-300"
                    }`}
                  >
                    {req.urgency}
                  </span>
                  <span className="text-[11px] font-mono bg-white/5 px-2 py-1 rounded-lg text-slate-300 border border-white/5">
                    {req.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB EQUIPE: VISÃO EXCLUSIVA DO CEO */}
        {activeTab === "equipe" && currentUser.role === "CEO" && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-purple-950/20 border border-purple-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-purple-300">
                  Capacidade da Equipe: {users.length} / 5 membros
                </h4>
                <p className="text-xs text-purple-200/70 mt-0.5">
                  Limite estrito do plano interno. {5 - users.length > 0 ? `Resta(m) ${5 - users.length} vaga(s).` : "Todas as vagas preenchidas."}
                </p>
              </div>
              <button
                onClick={() => setIsTeamModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold border border-purple-400/30 flex items-center justify-center gap-2 transition-all shadow-md self-start sm:self-auto"
              >
                <Settings className="w-4 h-4" />
                Gerenciar Equipe
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {users.map((usr) => (
                <div
                  key={usr.id}
                  className="p-3.5 rounded-2xl bg-slate-900/60 border border-white/10 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center font-bold text-amber-400 border border-white/10">
                      {usr.role === "CEO" ? "👑" : "💈"}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">{usr.name}</p>
                      <p className="text-[11px] text-slate-400">
                        {usr.role === "CEO"
                          ? "Gestor Geral / Administrador"
                          : `Cadeira #${usr.stationNumber || 1} • Ativo`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-xs bg-white/5 px-2 py-1 rounded text-slate-300">
                      PIN: {usr.pin}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* MODAL DE GESTÃO DE EQUIPE (CEO) */}
      <TeamManagementModal
        isOpen={isTeamModalOpen}
        onClose={() => setIsTeamModalOpen(false)}
        users={users}
        onAddUser={handleAddUser}
        onUpdateUser={handleUpdateUser}
        onDeleteUser={handleDeleteUser}
      />

      {/* MODAL 1: NOVO LANÇAMENTO FINANCEIRO */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-white/15 p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/10">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                {modalType === "ENTRADA" ? (
                  <>
                    <PlusCircle className="w-5 h-5 text-emerald-400" />
                    Novo Atendimento / Entrada
                  </>
                ) : (
                  <>
                    <MinusCircle className="w-5 h-5 text-rose-400" />
                    Lançar Despesa / Saída
                  </>
                )}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTransaction} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Valor (R$)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  required
                  autoFocus
                  className="w-full h-12 px-4 rounded-xl bg-slate-950 border border-white/15 text-2xl font-bold font-mono text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Descrição do Serviço / Item
                </label>
                <input
                  type="text"
                  placeholder="Ex: Corte Degradê, Pomada, Água..."
                  value={descInput}
                  onChange={(e) => setDescInput(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-white/15 text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              {/* Barbeiro Responsável */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Profissional
                </label>
                <select
                  value={selectedBarberId}
                  onChange={(e) => setSelectedBarberId(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-white/15 text-sm text-white focus:outline-none focus:border-amber-400"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role})
                    </option>
                  ))}
                </select>
              </div>

              {/* Forma de Pagamento */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Forma de Pagamento
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["PIX", "DINHEIRO", "CARTAO"] as PaymentMethod[]).map(
                    (method) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setPaymentMethod(method)}
                        className={`h-10 rounded-xl text-xs font-bold uppercase transition-all ${
                          paymentMethod === method
                            ? "bg-amber-500 text-slate-950 shadow-glow"
                            : "bg-slate-950 text-slate-300 border border-white/10 hover:border-white/20"
                        }`}
                      >
                        {method}
                      </button>
                    )
                  )}
                </div>
              </div>

              <button
                type="submit"
                className={`w-full h-12 rounded-xl font-bold text-sm text-white transition-all shadow-md mt-2 ${
                  modalType === "ENTRADA"
                    ? "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-glow"
                    : "bg-rose-600 hover:bg-rose-500"
                }`}
              >
                Confirmar Lançamento
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: PEDIDO DE INSUMO */}
      {isMaterialModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-white/15 p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/10">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Package className="w-5 h-5 text-cyan-400" />
                Solicitar Material / Insumo
              </h3>
              <button
                onClick={() => setIsMaterialModalOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateMaterialRequest} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Item Necessário
                </label>
                <input
                  type="text"
                  placeholder="Ex: Lâminas de barbear, Pomada em pó, Talco..."
                  value={materialItem}
                  onChange={(e) => setMaterialItem(e.target.value)}
                  required
                  autoFocus
                  className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-white/15 text-sm text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Nível de Urgência
                </label>
                <div className="grid grid-cols-4 gap-1.5 text-xs">
                  {(["BAIXA", "MEDIA", "ALTA", "CRITICA"] as const).map((urg) => (
                    <button
                      key={urg}
                      type="button"
                      onClick={() => setMaterialUrgency(urg)}
                      className={`py-2 rounded-xl font-bold uppercase transition-all ${
                        materialUrgency === urg
                          ? urg === "CRITICA"
                            ? "bg-rose-600 text-white"
                            : "bg-cyan-500 text-slate-950 font-extrabold"
                          : "bg-slate-950 text-slate-400 border border-white/10"
                      }`}
                    >
                      {urg}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                className="w-full h-11 rounded-xl bg-cyan-600 hover:bg-cyan-500 font-bold text-sm text-white transition-all shadow-md"
              >
                Enviar Solicitação
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardCaixa;
