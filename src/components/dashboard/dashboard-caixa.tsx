"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  User,
  Transaction,
  Appointment,
  MaterialRequest,
  PaymentMethod,
  TransactionType,
  DailySummary,
  UserRole,
  MaterialUrgency,
} from "@/types";
import { api } from "@/services/api";
import { TeamManagementModal } from "./team-management-modal";
import { jsPDF } from "jspdf";
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
  Scissors,
  X,
  Settings,
  RefreshCw,
  Loader2,
  AlertCircle,
  Plus,
  FileDown,
  Pencil,
} from "lucide-react";

interface DashboardCaixaProps {
  currentUser: User;
  onLogout: () => void;
}

export const DashboardCaixa: React.FC<DashboardCaixaProps> = ({
  currentUser,
  onLogout,
}) => {
  const isCEO = currentUser.role === "admin";

  // Estados de dados da API
  const [caixaData, setCaixaData] = useState<DailySummary>({
    saldoLiquido: 0,
    totalEntradas: 0,
    totalSaidas: 0,
    totalMovimentacoes: 0,
    porFormaPagamento: { pix: 0, dinheiro: 0, cartaoCredito: 0, cartaoDebito: 0 },
    movimentacoes: [],
  });

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [teamMembers, setTeamMembers] = useState<User[]>([]);
  const [materialRequests, setMaterialRequests] = useState<MaterialRequest[]>([]);

  // Estados de carregamento e erro
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");

  // Aba ativa
  const [activeTab, setActiveTab] = useState<"caixa" | "agenda" | "insumos" | "equipe">(
    "caixa"
  );

  // Modal de Transação (Entrada/Saída)
  const [isTxModalOpen, setIsTxModalOpen] = useState<boolean>(false);
  const [txType, setTxType] = useState<TransactionType>("entrada");
  const [amountInput, setAmountInput] = useState<string>("");
  const [descInput, setDescInput] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix");
  const [selectedBarberId, setSelectedBarberId] = useState<number | string>(currentUser.id);
  const [isSubmittingTx, setIsSubmittingTx] = useState<boolean>(false);

  // Modal de Novo Agendamento
  const [isAppModalOpen, setIsAppModalOpen] = useState<boolean>(false);
  const [clientNameInput, setClientNameInput] = useState<string>("");
  const [serviceInput, setServiceInput] = useState<string>("");
  const [timeInput, setTimeInput] = useState<string>("");
  const [appBarberId, setAppBarberId] = useState<number | string>(currentUser.id);
  const [isSubmittingApp, setIsSubmittingApp] = useState<boolean>(false);

  // Modal de Pedido de Insumo
  const [isMaterialModalOpen, setIsMaterialModalOpen] = useState<boolean>(false);
  const [materialItem, setMaterialItem] = useState<string>("");
  const [materialQuantity, setMaterialQuantity] = useState<number>(1);
  const [materialUrgency, setMaterialUrgency] = useState<MaterialUrgency>("media");
  const [isSubmittingMaterial, setIsSubmittingMaterial] = useState<boolean>(false);

  // Modal de Equipe (CEO)
  const [isTeamModalOpen, setIsTeamModalOpen] = useState<boolean>(false);
  const [editingTeamMemberId, setEditingTeamMemberId] = useState<number | null>(null);

  // Função central de carregamento de dados da API Neon
  const carregarDados = useCallback(async (silencioso = false) => {
    if (!silencioso) setIsLoading(true);
    setIsRefreshing(true);
    setErrorMessage("");

    try {
      const [caixaRes, agendamentosRes, materiaisRes, adminRes] = await Promise.all([
        api.getCaixaSummary(),
        api.getAgendamentos(isCEO ? undefined : currentUser.id),
        api.getMateriais().catch(() => []),
        api.getUsuariosAdmin().catch(() => null),
      ]);

      setCaixaData(caixaRes);
      setAppointments(agendamentosRes);
      setMaterialRequests(materiaisRes);

      if (adminRes?.usuarios) {
        setTeamMembers(
          adminRes.usuarios.map((u, idx) => ({
            id: u.id,
            name: u.nome,
            pin: u.pin,
            role: u.papel,
            stationNumber: idx + 1,
          }))
        );
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Erro ao conectar aos serviços da barbearia");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [currentUser, isCEO]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  // Handler para Novo Lançamento Financeiro (POST /api/caixa)
  const handleCreateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(amountInput.replace(",", "."));
    if (isNaN(val) || val <= 0) return;

    setIsSubmittingTx(true);
    try {
      await api.criarMovimentacao({
        tipo: txType,
        descricao: descInput.trim() || (txType === "entrada" ? "Serviço de Bancada" : "Despesa Operacional"),
        valor: val,
        forma_pagamento: paymentMethod,
        barbeiro_id: selectedBarberId ? Number(selectedBarberId) : null,
      });

      setIsTxModalOpen(false);
      setAmountInput("");
      setDescInput("");
      await carregarDados(true);
    } catch (err: any) {
      alert(err.message || "Erro ao registrar no caixa.");
    } finally {
      setIsSubmittingTx(false);
    }
  };

  // Geração e download direto do Fechamento de Caixa em PDF (jsPDF) para envio ao CEO
  const handleDownloadCashClosing = () => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    const contentWidth = pageWidth - margin * 2;
    const reportDate = new Date();
    const dateStr = reportDate.toLocaleDateString("pt-BR");
    const timeStr = reportDate.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const formatCurrency = (value: number) =>
      new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(value);

    const paymentLabel = (method: PaymentMethod) => {
      switch (method) {
        case "pix":
          return "PIX";
        case "dinheiro":
          return "Dinheiro";
        case "cartao_credito":
          return "Cartão Crédito";
        case "cartao_debito":
          return "Cartão Débito";
        default:
          return method;
      }
    };

    // Cabeçalho escuro elegante
    doc.setFillColor(11, 15, 25);
    doc.rect(0, 0, pageWidth, 34, "F");
    doc.setFillColor(245, 158, 11);
    doc.rect(0, 34, pageWidth, 1.2, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.text("ROCHA BARBERSHOP", margin, 14);

    doc.setTextColor(245, 158, 11);
    doc.setFontSize(10);
    doc.text("FECHAMENTO DE CAIXA DIARIO - RELATORIO PARA O CEO", margin, 21);

    doc.setTextColor(203, 213, 225);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Data: ${dateStr} as ${timeStr}  |  Emitido por: ${currentUser.name}`, margin, 28);

    let y = 43;

    // 1. Cards de Resumo (Entradas, Saidas, Saldo Liquido)
    const cardGap = 4;
    const cardWidth = (contentWidth - cardGap * 2) / 3;
    const summaryCards = [
      {
        label: "TOTAL ENTRADAS",
        value: formatCurrency(caixaData.totalEntradas),
        bg: [236, 253, 245] as const,
        border: [16, 185, 129] as const,
        text: [4, 120, 87] as const,
      },
      {
        label: "TOTAL SAIDAS",
        value: formatCurrency(caixaData.totalSaidas),
        bg: [255, 241, 242] as const,
        border: [244, 63, 94] as const,
        text: [190, 18, 60] as const,
      },
      {
        label: "SALDO LIQUIDO",
        value: formatCurrency(caixaData.saldoLiquido),
        bg: [241, 245, 249] as const,
        border: [15, 23, 42] as const,
        text: [15, 23, 42] as const,
      },
    ];

    summaryCards.forEach((card, idx) => {
      const x = margin + idx * (cardWidth + cardGap);
      doc.setFillColor(card.bg[0], card.bg[1], card.bg[2]);
      doc.setDrawColor(card.border[0], card.border[1], card.border[2]);
      doc.roundedRect(x, y, cardWidth, 20, 2, 2, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(card.label, x + 4, y + 6.5);

      doc.setFontSize(13);
      doc.setTextColor(card.text[0], card.text[1], card.text[2]);
      doc.text(card.value, x + 4, y + 15);
    });

    y += 28;

    // 2. Formas de Pagamento
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text("Recebimentos por Forma de Pagamento", margin, y);
    y += 4;

    const payWidth = (contentWidth - cardGap * 3) / 4;
    const payMethods = [
      { label: "PIX", value: formatCurrency(caixaData.porFormaPagamento.pix) },
      { label: "Dinheiro", value: formatCurrency(caixaData.porFormaPagamento.dinheiro) },
      { label: "Cartao Credito", value: formatCurrency(caixaData.porFormaPagamento.cartaoCredito) },
      { label: "Cartao Debito", value: formatCurrency(caixaData.porFormaPagamento.cartaoDebito) },
    ];

    payMethods.forEach((pm, idx) => {
      const x = margin + idx * (payWidth + cardGap);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(x, y, payWidth, 15, 1.5, 1.5, "FD");

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(pm.label, x + 3, y + 5.5);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text(pm.value, x + 3, y + 11.8);
    });

    y += 23;

    // 3. Resumo por Profissional
    const byBarber = new Map<
      string,
      { count: number; entradas: number; saidas: number }
    >();
    caixaData.movimentacoes.forEach((tx) => {
      const key = tx.barberName || "Geral/Caixa";
      const cur = byBarber.get(key) || { count: 0, entradas: 0, saidas: 0 };
      cur.count += 1;
      if (tx.type === "entrada") cur.entradas += tx.amount;
      else cur.saidas += tx.amount;
      byBarber.set(key, cur);
    });

    if (byBarber.size > 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(15, 23, 42);
      doc.text("Resumo por Profissional", margin, y);
      y += 4;

      doc.setFillColor(241, 245, 249);
      doc.rect(margin, y, contentWidth, 7, "F");
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text("Profissional", margin + 3, y + 4.8);
      doc.text("Qtd.", margin + 88, y + 4.8, { align: "right" });
      doc.text("Entradas", margin + 122, y + 4.8, { align: "right" });
      doc.text("Saidas", margin + 150, y + 4.8, { align: "right" });
      doc.text("Saldo", margin + contentWidth - 3, y + 4.8, { align: "right" });
      y += 7;

      doc.setFont("helvetica", "normal");
      Array.from(byBarber.entries()).forEach(([barber, stats], idx) => {
        if (y > pageHeight - 28) {
          doc.addPage();
          y = 18;
        }
        if (idx % 2 === 1) {
          doc.setFillColor(248, 250, 252);
          doc.rect(margin, y, contentWidth, 6.5, "F");
        }
        doc.setFontSize(8.5);
        doc.setTextColor(15, 23, 42);
        doc.text(barber.slice(0, 38), margin + 3, y + 4.6);
        doc.text(String(stats.count), margin + 88, y + 4.6, { align: "right" });
        doc.setTextColor(4, 120, 87);
        doc.text(formatCurrency(stats.entradas), margin + 122, y + 4.6, { align: "right" });
        doc.setTextColor(190, 18, 60);
        doc.text(formatCurrency(stats.saidas), margin + 150, y + 4.6, { align: "right" });
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text(formatCurrency(stats.entradas - stats.saidas), margin + contentWidth - 3, y + 4.6, {
          align: "right",
        });
        doc.setFont("helvetica", "normal");
        y += 6.5;
      });

      y += 8;
    }

    // 4. Tabela Detalhada de Movimentações
    const drawTransactionsHeader = () => {
      doc.setFillColor(15, 23, 42);
      doc.rect(margin, y, contentWidth, 7.5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text("Hora", margin + 2.5, y + 5.2);
      doc.text("Tipo", margin + 18, y + 5.2);
      doc.text("Descricao", margin + 37, y + 5.2);
      doc.text("Profissional", margin + 102, y + 5.2);
      doc.text("Pagamento", margin + 137, y + 5.2);
      doc.text("Valor", margin + contentWidth - 2.5, y + 5.2, { align: "right" });
      y += 7.5;
    };

    if (y > pageHeight - 36) {
      doc.addPage();
      y = 18;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text(
      `Detalhamento das Movimentacoes (${caixaData.totalMovimentacoes})`,
      margin,
      y
    );
    y += 4;
    drawTransactionsHeader();

    if (caixaData.movimentacoes.length === 0) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text("Nenhuma movimentacao registrada neste dia.", margin + 3, y + 8);
      y += 12;
    } else {
      caixaData.movimentacoes.forEach((tx, idx) => {
        const descLines = doc.splitTextToSize(tx.description || "-", 62) as string[];
        const rowHeight = Math.max(7, descLines.length * 4.2 + 2.8);

        if (y + rowHeight > pageHeight - 18) {
          doc.addPage();
          y = 18;
          drawTransactionsHeader();
        }

        if (idx % 2 === 1) {
          doc.setFillColor(248, 250, 252);
          doc.rect(margin, y, contentWidth, rowHeight, "F");
        }
        doc.setDrawColor(226, 232, 240);
        doc.line(margin, y + rowHeight, margin + contentWidth, y + rowHeight);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105);
        doc.text(tx.timestamp, margin + 2.5, y + 4.8);

        doc.setFont("helvetica", "bold");
        if (tx.type === "entrada") {
          doc.setTextColor(4, 120, 87);
          doc.text("Entrada", margin + 18, y + 4.8);
        } else {
          doc.setTextColor(190, 18, 60);
          doc.text("Saida", margin + 18, y + 4.8);
        }

        doc.setFont("helvetica", "normal");
        doc.setTextColor(15, 23, 42);
        doc.text(descLines, margin + 37, y + 4.8);
        doc.text((tx.barberName || "Geral").slice(0, 19), margin + 102, y + 4.8);
        doc.text(paymentLabel(tx.paymentMethod), margin + 137, y + 4.8);

        doc.setFont("helvetica", "bold");
        doc.setTextColor(tx.type === "entrada" ? 4 : 190, tx.type === "entrada" ? 120 : 18, tx.type === "entrada" ? 87 : 60);
        doc.text(
          `${tx.type === "entrada" ? "+" : "-"} ${formatCurrency(tx.amount)}`,
          margin + contentWidth - 2.5,
          y + 4.8,
          { align: "right" }
        );

        y += rowHeight;
      });
    }

    // Rodapé em todas as páginas
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Barbearia Rocha - Fechamento para envio ao CEO (${dateStr})`,
        margin,
        pageHeight - 8
      );
      doc.text(`Pagina ${p} de ${totalPages}`, pageWidth - margin, pageHeight - 8, {
        align: "right",
      });
    }

    const fileDate = reportDate.toISOString().slice(0, 10);
    doc.save(`fechamento-caixa-rocha-${fileDate}.pdf`);
  };

  // Handler para Novo Agendamento (POST /api/agendamentos)
  const handleCreateAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientNameInput.trim() || !serviceInput.trim() || !timeInput) return;

    const [hours, minutes] = timeInput.split(":");
    const scheduleDate = new Date();
    scheduleDate.setHours(Number(hours), Number(minutes), 0, 0);

    setIsSubmittingApp(true);
    try {
      await api.criarAgendamento({
        cliente_nome: clientNameInput.trim(),
        servico: serviceInput.trim(),
        data_hora: scheduleDate.toISOString(),
        barbeiro_id: Number(appBarberId),
      });

      setIsAppModalOpen(false);
      setClientNameInput("");
      setServiceInput("");
      setTimeInput("");
      await carregarDados(true);
    } catch (err: any) {
      alert(err.message || "Erro ao criar agendamento.");
    } finally {
      setIsSubmittingApp(false);
    }
  };

  // Handler para Pedido de Material (POST /api/materiais)
  const handleCreateMaterialRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!materialItem.trim()) return;

    setIsSubmittingMaterial(true);
    try {
      await api.criarMaterial({
        solicitante_id: Number(currentUser.id) || null,
        item: materialItem.trim(),
        quantidade: Number(materialQuantity) || 1,
        urgencia: materialUrgency,
      });

      setIsMaterialModalOpen(false);
      setMaterialItem("");
      setMaterialQuantity(1);
      await carregarDados(true);
    } catch (err: any) {
      alert(err.message || "Erro ao registrar pedido de material.");
    } finally {
      setIsSubmittingMaterial(false);
    }
  };

  // Handler para Adicionar Colaborador (POST /api/admin/usuarios)
  const handleAddTeamMember = async (userData: {
    nome: string;
    pin: string;
    papel: UserRole;
  }) => {
    try {
      await api.criarUsuarioAdmin(userData);
      await carregarDados(true);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  // Handler para Remover Barbeiro (DELETE /api/admin/usuarios/{id})
  const handleDeleteTeamMember = async (id: number) => {
    try {
      await api.deletarUsuarioAdmin(id);
      await carregarDados(true);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  // Handler para Editar Nome e PIN do Barbeiro (PUT /api/admin/usuarios/{id})
  const handleEditTeamMember = async (
    id: number,
    data: { nome: string; pin: string }
  ) => {
    try {
      await api.editarUsuarioAdmin(id, data);
      await carregarDados(true);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col font-sans pb-24 md:pb-8">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 w-full backdrop-blur-xl bg-[#0b0f19]/80 border-b border-white/10 px-4 py-3 sm:px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500/20 to-amber-600/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Scissors className="w-5 h-5 -rotate-45" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold tracking-tight text-white flex items-center gap-2">
                ROCHA BARBERSHOP
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  FLY.IO ONLINE
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

          {/* Perfil Ativo, Atualização e Bloqueio */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => carregarDados(true)}
              disabled={isRefreshing}
              title="Recarregar dados do Neon"
              className="p-2 rounded-xl bg-slate-900 border border-white/10 text-slate-400 hover:text-white hover:border-white/20 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin text-amber-400" : ""}`} />
            </button>

            <div className="text-right hidden sm:block">
              <p className="text-xs font-semibold text-slate-200">
                {currentUser.name}
              </p>
              <p className="text-[10px] text-amber-400 font-medium">
                {isCEO ? "👑 CEO / Administrador" : "💈 Barbeiro"}
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
        {/* Alerta de Erro de Conexão */}
        {errorMessage && (
          <div className="mb-4 p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => carregarDados()}
              className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-[11px] font-bold"
            >
              Tentar Novamente
            </button>
          </div>
        )}

        {/* 1. CARDS DE RESUMO DO CAIXA */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mb-6 animate-pulse">
            <div className="h-36 rounded-2xl bg-slate-900/60 border border-white/5" />
            <div className="h-36 rounded-2xl bg-slate-900/60 border border-white/5" />
            <div className="h-36 rounded-2xl bg-slate-900/60 border border-white/5" />
          </div>
        ) : (
          <section className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mb-6">
            {/* Card 1: Saldo Líquido do Dia */}
            <div className="relative overflow-hidden p-5 rounded-2xl bg-gradient-to-br from-[#0c1815] via-[#0f172a] to-[#07090e] border border-emerald-500/30 shadow-emerald-glow">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <Wallet className="w-4 h-4" /> Saldo Líquido do Dia
                </span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-medium">
                  Neon PostgreSQL
                </span>
              </div>
              <div className="text-3xl font-extrabold text-white tracking-tight">
                R$ {caixaData.saldoLiquido.toFixed(2).replace(".", ",")}
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-400 border-t border-emerald-500/10 pt-2.5">
                <span>
                  Entradas: <strong className="text-emerald-400">R$ {caixaData.totalEntradas.toFixed(2)}</strong>
                </span>
                <span>
                  Saídas: <strong className="text-rose-400">R$ {caixaData.totalSaidas.toFixed(2)}</strong>
                </span>
              </div>
            </div>

            {/* Card 2: Entradas Brutas */}
            <div className="p-5 rounded-2xl bg-slate-900/60 backdrop-blur-md border border-white/10 flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-emerald-400" /> Total Entradas
                </span>
                <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                  +{caixaData.totalMovimentacoes} mov.
                </span>
              </div>
              <div className="text-2xl font-bold text-emerald-400">
                R$ {caixaData.totalEntradas.toFixed(2).replace(".", ",")}
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                Serviços de corte, barba e produtos registrados
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
                R$ {caixaData.totalSaidas.toFixed(2).replace(".", ",")}
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                Gastos operacionais e retiradas da barbearia
              </p>
            </div>
          </section>
        )}

        {/* 2. FORMAS DE PAGAMENTO DO NEON */}
        <section className="mb-6 p-4 rounded-2xl bg-slate-900/40 border border-white/10">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
            Recebimento Consolidado por Meio de Pagamento
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
            <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 flex flex-col">
              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <QrCode className="w-3.5 h-3.5 text-cyan-400" /> PIX
              </span>
              <span className="text-base sm:text-lg font-bold text-slate-100 mt-1">
                R$ {caixaData.porFormaPagamento.pix.toFixed(2).replace(".", ",")}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 flex flex-col">
              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <Banknote className="w-3.5 h-3.5 text-emerald-400" /> Dinheiro
              </span>
              <span className="text-base sm:text-lg font-bold text-slate-100 mt-1">
                R$ {caixaData.porFormaPagamento.dinheiro.toFixed(2).replace(".", ",")}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 flex flex-col">
              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <CreditCard className="w-3.5 h-3.5 text-amber-400" /> C. Crédito
              </span>
              <span className="text-base sm:text-lg font-bold text-slate-100 mt-1">
                R$ {caixaData.porFormaPagamento.cartaoCredito.toFixed(2).replace(".", ",")}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 flex flex-col">
              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <CreditCard className="w-3.5 h-3.5 text-blue-400" /> C. Débito
              </span>
              <span className="text-base sm:text-lg font-bold text-slate-100 mt-1">
                R$ {caixaData.porFormaPagamento.cartaoDebito.toFixed(2).replace(".", ",")}
              </span>
            </div>
          </div>
        </section>

        {/* 3. AÇÕES RÁPIDAS DE BANCADA */}
        <section className="mb-6 grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          <button
            onClick={() => {
              setTxType("entrada");
              setIsTxModalOpen(true);
            }}
            className="p-3.5 rounded-2xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 font-semibold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all shadow-sm"
          >
            <PlusCircle className="w-5 h-5" />
            + Lançar Entrada
          </button>

          <button
            onClick={() => {
              setTxType("saida");
              setIsTxModalOpen(true);
            }}
            className="p-3.5 rounded-2xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 font-semibold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all shadow-sm"
          >
            <MinusCircle className="w-5 h-5" />
            - Lançar Saída
          </button>

          <button
            onClick={() => setIsAppModalOpen(true)}
            className="p-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-white/10 text-slate-200 font-semibold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all shadow-sm"
          >
            <Calendar className="w-5 h-5 text-amber-400" />
            + Agendamento
          </button>

          <button
            onClick={() => setIsMaterialModalOpen(true)}
            className="p-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-white/10 text-slate-200 font-semibold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all shadow-sm"
          >
            <Package className="w-5 h-5 text-cyan-400" />
            Pedir Material
          </button>

          <button
            onClick={handleDownloadCashClosing}
            className="col-span-2 sm:col-span-1 p-3.5 rounded-2xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 font-semibold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all shadow-sm"
            title="Baixar fechamento do caixa em PDF para enviar ao CEO"
          >
            <FileDown className="w-5 h-5" />
            Fechamento PDF
          </button>
        </section>

        {/* 4. ABAS DE VISUALIZAÇÃO */}
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
            Movimentações do Caixa ({caixaData.movimentacoes.length})
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
            Agenda ({appointments.length})
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

          {isCEO && (
            <button
              onClick={() => setActiveTab("equipe")}
              className={`pb-2.5 px-3 text-xs sm:text-sm font-semibold transition-colors flex items-center gap-2 border-b-2 whitespace-nowrap ${
                activeTab === "equipe"
                  ? "border-purple-400 text-purple-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <Users className="w-4 h-4" />
              Equipe ({teamMembers.length}/5 Vagas)
            </button>
          )}
        </div>

        {/* 5. CONTEÚDO DAS ABAS */}

        {/* ABA CAIXA: TABELA MOVIMENTACOES_CAIXA DO NEON */}
        {activeTab === "caixa" && (
          <div className="space-y-2.5">
            {caixaData.movimentacoes.length === 0 ? (
              <div className="p-8 text-center rounded-2xl bg-slate-900/40 border border-white/5">
                <p className="text-sm text-slate-400">Nenhuma movimentação registrada no caixa.</p>
                <p className="text-xs text-slate-500 mt-1">Utilize os botões acima para lançar atendimentos ou despesas.</p>
              </div>
            ) : (
              caixaData.movimentacoes.map((tx) => (
                <div
                  key={tx.id}
                  className="p-3.5 rounded-2xl bg-slate-900/50 hover:bg-slate-900/80 border border-white/5 flex items-center justify-between transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${
                        tx.type === "entrada"
                          ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                          : "bg-rose-500/15 text-rose-400 border border-rose-500/20"
                      }`}
                    >
                      {tx.type === "entrada" ? "+" : "-"}
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
                        <span className="px-1.5 py-0.2 rounded bg-white/5 text-slate-300 text-[10px] uppercase font-mono">
                          {tx.paymentMethod.replace("_", " ")}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <span
                      className={`text-sm sm:text-base font-bold font-mono ${
                        tx.type === "entrada" ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {tx.type === "entrada" ? "+" : "-"} R$ {tx.amount.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ABA AGENDA: TABELA AGENDAMENTOS DO NEON */}
        {activeTab === "agenda" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400 px-1">
              <span>Agendamentos do Neon</span>
              <button
                onClick={() => setIsAppModalOpen(true)}
                className="text-amber-400 hover:underline font-semibold flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Novo Agendamento
              </button>
            </div>

            {appointments.length === 0 ? (
              <div className="p-8 text-center rounded-2xl bg-slate-900/40 border border-white/5">
                <p className="text-sm text-slate-400">Nenhum atendimento na fila.</p>
                <button
                  onClick={() => setIsAppModalOpen(true)}
                  className="mt-3 px-4 py-2 rounded-xl bg-amber-500/20 text-amber-300 text-xs font-bold border border-amber-500/30"
                >
                  Agendar Cliente
                </button>
              </div>
            ) : (
              appointments.map((app) => (
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
                        Profissional: <span className="text-slate-300">{app.barberName}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold capitalize">
                      {app.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ABA INSUMOS: TABELA PEDIDOS_MATERIAIS DO NEON */}
        {activeTab === "insumos" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">
                Lista de materiais em falta (Neon: <code>pedidos_materiais</code>)
              </p>
              <button
                onClick={() => setIsMaterialModalOpen(true)}
                className="text-xs text-cyan-400 hover:underline font-semibold"
              >
                + Novo Pedido
              </button>
            </div>

            {materialRequests.length === 0 ? (
              <div className="p-8 text-center rounded-2xl bg-slate-900/40 border border-white/5">
                <p className="text-sm text-slate-400">Nenhum pedido de material pendente.</p>
              </div>
            ) : (
              materialRequests.map((req) => (
                <div
                  key={req.id}
                  className="p-3.5 rounded-2xl bg-slate-900/60 border border-white/5 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-2.5 h-10 rounded-full ${
                        req.urgency === "alta"
                          ? "bg-rose-500"
                          : req.urgency === "media"
                          ? "bg-amber-500"
                          : "bg-slate-500"
                      }`}
                    />
                    <div>
                      <p className="text-sm font-semibold text-slate-200">
                        {req.item} <span className="text-xs text-slate-400 font-mono">({req.quantity} un)</span>
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Solicitado por {req.requestedBy} • {req.requestedAt}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                        req.urgency === "alta"
                          ? "bg-rose-500/20 text-rose-300"
                          : "bg-amber-500/20 text-amber-300"
                      }`}
                    >
                      {req.urgency}
                    </span>
                    <span className="text-[11px] font-mono bg-white/5 px-2 py-1 rounded-lg text-slate-300 border border-white/5 uppercase">
                      {req.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ABA EQUIPE (EXCLUSIVO CEO/ADMIN) */}
        {activeTab === "equipe" && isCEO && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-purple-950/20 border border-purple-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-purple-300">
                  Capacidade da Equipe: {teamMembers.length} / 5 membros
                </h4>
                <p className="text-xs text-purple-200/70 mt-0.5">
                  Conectado à tabela <code>usuarios</code> do Neon PostgreSQL.
                </p>
              </div>
              <button
                onClick={() => {
                  setEditingTeamMemberId(null);
                  setIsTeamModalOpen(true);
                }}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold border border-purple-400/30 flex items-center justify-center gap-2 transition-all shadow-md self-start sm:self-auto"
              >
                <Settings className="w-4 h-4" />
                Gerenciar Equipe
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {teamMembers.map((usr) => (
                <div
                  key={usr.id}
                  className="p-3.5 rounded-2xl bg-slate-900/60 border border-white/10 flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center font-bold text-amber-400 border border-white/10 flex-shrink-0">
                      {usr.role === "admin" ? "👑" : "💈"}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate">{usr.name}</p>
                      <p className="text-[11px] text-slate-400">
                        {usr.role === "admin"
                          ? "Gestor Geral / CEO"
                          : `Barbeiro • Cadeira #${usr.stationNumber || 1}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="font-mono text-xs bg-white/5 px-2 py-1 rounded text-slate-300">
                      PIN: {usr.pin || "****"}
                    </span>
                    {usr.role !== "admin" && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingTeamMemberId(Number(usr.id));
                          setIsTeamModalOpen(true);
                        }}
                        title="Editar nome e PIN do barbeiro"
                        className="p-2 rounded-xl bg-purple-950/40 border border-purple-500/25 text-purple-300 hover:bg-purple-900/60 hover:border-purple-400/50 transition-all"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* MODAL 1: NOVO LANÇAMENTO FINANCEIRO (POST /api/caixa) */}
      {isTxModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-white/15 p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/10">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                {txType === "entrada" ? (
                  <>
                    <PlusCircle className="w-5 h-5 text-emerald-400" />
                    Nova Entrada no Caixa
                  </>
                ) : (
                  <>
                    <MinusCircle className="w-5 h-5 text-rose-400" />
                    Lançar Despesa / Saída
                  </>
                )}
              </h3>
              <button
                onClick={() => setIsTxModalOpen(false)}
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
                  Descrição da Movimentação
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
                  Profissional (Cadastrado no Neon)
                </label>
                <select
                  value={selectedBarberId}
                  onChange={(e) => setSelectedBarberId(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-white/15 text-sm text-white focus:outline-none focus:border-amber-400"
                >
                  {teamMembers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role})
                    </option>
                  ))}
                </select>
              </div>

              {/* Forma de Pagamento */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Forma de Pagamento (Neon)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: "pix", label: "PIX" },
                    { id: "dinheiro", label: "Dinheiro" },
                    { id: "cartao_credito", label: "C. Crédito" },
                    { id: "cartao_debito", label: "C. Débito" },
                  ].map((method) => (
                    <button
                      key={method.id}
                      type="button"
                      onClick={() => setPaymentMethod(method.id as PaymentMethod)}
                      className={`h-10 rounded-xl text-xs font-bold uppercase transition-all ${
                        paymentMethod === method.id
                          ? "bg-amber-500 text-slate-950 shadow-glow"
                          : "bg-slate-950 text-slate-300 border border-white/10 hover:border-white/20"
                      }`}
                    >
                      {method.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmittingTx}
                className={`w-full h-12 rounded-xl font-bold text-sm text-white transition-all shadow-md mt-2 flex items-center justify-center gap-2 ${
                  txType === "entrada"
                    ? "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-glow"
                    : "bg-rose-600 hover:bg-rose-500"
                } disabled:opacity-50`}
              >
                {isSubmittingTx ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Registrando no Neon...
                  </>
                ) : (
                  "Confirmar Lançamento"
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: NOVO AGENDAMENTO (POST /api/agendamentos) */}
      {isAppModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-white/15 p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/10">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Calendar className="w-5 h-5 text-amber-400" />
                Novo Agendamento (Neon)
              </h3>
              <button
                onClick={() => setIsAppModalOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAppointment} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Nome do Cliente
                </label>
                <input
                  type="text"
                  placeholder="Ex: Carlos Oliveira"
                  value={clientNameInput}
                  onChange={(e) => setClientNameInput(e.target.value)}
                  required
                  autoFocus
                  className="w-full h-10 px-3 rounded-xl bg-slate-950 border border-white/15 text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Horário
                </label>
                <input
                  type="time"
                  value={timeInput}
                  onChange={(e) => setTimeInput(e.target.value)}
                  required
                  className="w-full h-10 px-3 rounded-xl bg-slate-950 border border-white/15 text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Serviço
                </label>
                <input
                  type="text"
                  placeholder="Ex: Corte Degradê, Barboterapia..."
                  value={serviceInput}
                  onChange={(e) => setServiceInput(e.target.value)}
                  required
                  className="w-full h-10 px-3 rounded-xl bg-slate-950 border border-white/15 text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Barbeiro Designado
                </label>
                <select
                  value={appBarberId}
                  onChange={(e) => setAppBarberId(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-slate-950 border border-white/15 text-sm text-white focus:outline-none focus:border-amber-400"
                >
                  {teamMembers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role})
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={isSubmittingApp}
                className="w-full h-11 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm transition-all shadow-glow flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
              >
                {isSubmittingApp ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Salvando Agendamento...
                  </>
                ) : (
                  "Confirmar Agendamento"
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: PEDIDO DE INSUMO (POST /api/materiais) */}
      {isMaterialModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-white/15 p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/10">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Package className="w-5 h-5 text-cyan-400" />
                Solicitar Material (Neon)
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
                  placeholder="Ex: Lâminas de barbear, Pomada em pó..."
                  value={materialItem}
                  onChange={(e) => setMaterialItem(e.target.value)}
                  required
                  autoFocus
                  className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-white/15 text-sm text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Quantidade
                </label>
                <input
                  type="number"
                  min="1"
                  value={materialQuantity}
                  onChange={(e) => setMaterialQuantity(Number(e.target.value))}
                  className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-white/15 text-sm text-white focus:outline-none focus:border-cyan-400 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Nível de Urgência
                </label>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {(["baixa", "media", "alta"] as const).map((urg) => (
                    <button
                      key={urg}
                      type="button"
                      onClick={() => setMaterialUrgency(urg)}
                      className={`py-2 rounded-xl font-bold uppercase transition-all ${
                        materialUrgency === urg
                          ? urg === "alta"
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
                disabled={isSubmittingMaterial}
                className="w-full h-11 rounded-xl bg-cyan-600 hover:bg-cyan-500 font-bold text-sm text-white transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSubmittingMaterial ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Registrando no Neon...
                  </>
                ) : (
                  "Enviar Solicitação"
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: GESTÃO DE EQUIPE (CEO - POST /api/admin/usuarios) */}
      <TeamManagementModal
        isOpen={isTeamModalOpen}
        onClose={() => {
          setIsTeamModalOpen(false);
          setEditingTeamMemberId(null);
        }}
        users={teamMembers}
        initialEditUserId={editingTeamMemberId}
        onAddUser={handleAddTeamMember}
        onDeleteUser={handleDeleteTeamMember}
        onEditUser={handleEditTeamMember}
        onRefresh={() => carregarDados(true)}
      />
    </div>
  );
};

export default DashboardCaixa;
