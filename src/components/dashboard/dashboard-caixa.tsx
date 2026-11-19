"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  User,
  Transaction,
  Appointment,
  AppointmentStatus,
  MaterialRequest,
  PaymentMethod,
  TransactionType,
  ExpenseCategory,
  DailySummary,
  CaixaPeriod,
  UserRole,
  MaterialUrgency,
} from "@/types";
import { api, getCachedLogo } from "@/services/api";
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
  Check,
  CheckCircle2,
  XCircle,
  Trash2,
  ImagePlus,
} from "lucide-react";

// Redutor inteligente de imagem (HTML5 Canvas): recorta em quadrado central,
// redimensiona para ícone leve (128/192/256px) e comprime em WebP/JPEG.
async function compressImageToIcon(
  file: File,
  targetSize: number = 192,
  quality: number = 0.78
): Promise<{
  dataUrl: string;
  originalKB: number;
  compressedKB: number;
  reductionPct: number;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo de imagem."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Formato de imagem inválido."));
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = targetSize;
        canvas.height = targetSize;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Não foi possível inicializar o redutor de imagem."));
          return;
        }

        // Recorte central quadrado para encaixe perfeito no ícone
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, targetSize, targetSize);

        let dataUrl = canvas.toDataURL("image/webp", quality);
        if (!dataUrl.startsWith("data:image/webp")) {
          dataUrl = canvas.toDataURL("image/jpeg", quality);
        }

        const originalKB = Math.max(0.1, Number((file.size / 1024).toFixed(1)));
        const base64Len = dataUrl.split(",")[1]?.length || 0;
        const compressedBytes = Math.round((base64Len * 3) / 4);
        const compressedKB = Math.max(0.1, Number((compressedBytes / 1024).toFixed(1)));
        const reductionPct =
          file.size > compressedBytes
            ? Math.min(99, Math.round(((file.size - compressedBytes) / file.size) * 100))
            : 0;

        resolve({ dataUrl, originalKB, compressedKB, reductionPct });
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function getLocalDateISO(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDate(isoDate: string): Date | null {
  const parts = isoDate.split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function formatDateISOToBR(isoDate: string): string {
  const d = parseLocalDate(isoDate);
  if (!d) return isoDate;
  return d.toLocaleDateString("pt-BR");
}

function getWeekRangeLabel(isoDate: string): string {
  const d = parseLocalDate(isoDate) || new Date();
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (dt: Date) =>
    `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}`;
  return `${fmt(monday)} a ${fmt(sunday)}`;
}

function getMonthLabel(isoDate: string): string {
  const d = parseLocalDate(isoDate) || new Date();
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

const PERIOD_LABELS: Record<CaixaPeriod, string> = {
  diario: "Diário",
  semanal: "Semanal",
  mensal: "Mensal",
};

function parseCurrencyInput(raw: string): number {
  const cleaned = raw.trim().replace(/[^\d.,-]/g, "");
  if (!cleaned) return NaN;

  // Se houver vírgula e ponto (ex: "1.200,50"), trata ponto como separador de milhar
  if (cleaned.includes(",") && cleaned.includes(".")) {
    const normalized = cleaned.replace(/\./g, "").replace(",", ".");
    return parseFloat(normalized);
  }
  return parseFloat(cleaned.replace(",", "."));
}

interface DashboardCaixaProps {
  currentUser: User;
  onLogout: () => void;
}

export const DashboardCaixa: React.FC<DashboardCaixaProps> = ({
  currentUser,
  onLogout,
}) => {
  const isCEO = currentUser.role === "admin" || currentUser.role === "ceo";

  // Estados de período, data sincronizada e filtro de barbeiro (exclusivo CEO)
  const [caixaPeriod, setCaixaPeriod] = useState<CaixaPeriod>("diario");
  const [caixaDateRef, setCaixaDateRef] = useState<string>(() => getLocalDateISO());
  const [ceoBarberFilter, setCeoBarberFilter] = useState<string>("todos");

  // Estados de dados da API
  const [caixaData, setCaixaData] = useState<DailySummary>({
    periodo: "diario",
    dataReferencia: getLocalDateISO(),
    saldoLiquido: 0,
    totalEntradas: 0,
    totalSaidas: 0,
    totalMovimentacoes: 0,
    porFormaPagamento: { pix: 0, dinheiro: 0, cartaoCredito: 0, cartaoDebito: 0 },
    faturamentoPeriodos: {
      dataReferencia: getLocalDateISO(),
      diario: { entradas: 0, saidas: 0, saldoLiquido: 0, totalMovimentacoes: 0 },
      semanal: { entradas: 0, saidas: 0, saldoLiquido: 0, totalMovimentacoes: 0 },
      mensal: { entradas: 0, saidas: 0, saldoLiquido: 0, totalMovimentacoes: 0 },
    },
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
  const [txCategory, setTxCategory] = useState<ExpenseCategory>("USO DIARIO");
  const [amountInput, setAmountInput] = useState<string>("");
  const [descInput, setDescInput] = useState<string>("");
  const [txDateInput, setTxDateInput] = useState<string>(() => getLocalDateISO());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix");
  const [selectedBarberId, setSelectedBarberId] = useState<number | string>(currentUser.id);
  const [isSubmittingTx, setIsSubmittingTx] = useState<boolean>(false);

  // Modal de Novo Agendamento & filtro da Agenda
  const [agendaDateFilter, setAgendaDateFilter] = useState<string>(() => getLocalDateISO());
  const [isAppModalOpen, setIsAppModalOpen] = useState<boolean>(false);
  const [clientNameInput, setClientNameInput] = useState<string>("");
  const [serviceInput, setServiceInput] = useState<string>("");
  const [appAmountInput, setAppAmountInput] = useState<string>("");
  const [appPaymentMethod, setAppPaymentMethod] = useState<PaymentMethod>("pix");
  const [appDateInput, setAppDateInput] = useState<string>(() => getLocalDateISO());
  const [timeInput, setTimeInput] = useState<string>("");
  const [appBarberId, setAppBarberId] = useState<number | string>(currentUser.id);
  const [isSubmittingApp, setIsSubmittingApp] = useState<boolean>(false);
  const [updatingAppId, setUpdatingAppId] = useState<number | string | null>(null);
  const [updatingMaterialId, setUpdatingMaterialId] = useState<number | string | null>(null);

  // Modal de Pedido de Insumo
  const [isMaterialModalOpen, setIsMaterialModalOpen] = useState<boolean>(false);
  const [materialItem, setMaterialItem] = useState<string>("");
  const [materialQuantity, setMaterialQuantity] = useState<number>(1);
  const [materialUrgency, setMaterialUrgency] = useState<MaterialUrgency>("media");
  const [isSubmittingMaterial, setIsSubmittingMaterial] = useState<boolean>(false);

  // Modal de Equipe e Identidade Visual (CEO)
  const [isTeamModalOpen, setIsTeamModalOpen] = useState<boolean>(false);
  const [editingTeamMemberId, setEditingTeamMemberId] = useState<number | null>(null);
  const [logoUrl, setLogoUrl] = useState<string>(() => getCachedLogo());
  const [isLogoModalOpen, setIsLogoModalOpen] = useState<boolean>(false);
  const [rawLogoFile, setRawLogoFile] = useState<File | null>(null);
  const [logoTargetSize, setLogoTargetSize] = useState<128 | 192 | 256>(192);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string>("");
  const [logoStats, setLogoStats] = useState<{
    originalKB: number;
    compressedKB: number;
    reductionPct: number;
  } | null>(null);
  const [isSavingLogo, setIsSavingLogo] = useState<boolean>(false);

  // Função auxiliar para sincronizar data de referência do caixa, agenda e novos lançamentos
  const syncReferenceDate = (newDate: string) => {
    const target = newDate || getLocalDateISO();
    setCaixaDateRef(target);
    setAgendaDateFilter(target);
    setTxDateInput(target);
  };

  // Função central de carregamento de dados (com isolamento RBAC)
  const carregarDados = useCallback(async (silencioso = false) => {
    if (!silencioso) setIsLoading(true);
    setIsRefreshing(true);
    setErrorMessage("");

    try {
      const dateQuery = agendaDateFilter || "todos";
      const effectiveBarberFilter = isCEO
        ? ceoBarberFilter !== "todos"
          ? ceoBarberFilter
          : undefined
        : currentUser.id;

      const [caixaRes, agendamentosRes, materiaisRes, equipeRes, remoteLogo] = await Promise.all([
        api.getCaixaSummary(caixaPeriod, caixaDateRef, effectiveBarberFilter),
        api.getAgendamentos(effectiveBarberFilter, dateQuery),
        api.getMateriais(),
        isCEO ? api.getUsuariosAdmin() : Promise.resolve([currentUser]),
        api.getLogoBarbearia(),
      ]);

      setCaixaData(caixaRes);
      setAppointments(agendamentosRes);
      setMaterialRequests(materiaisRes);
      setLogoUrl(remoteLogo);

      if (Array.isArray(equipeRes)) {
        setTeamMembers(equipeRes);
      } else if (equipeRes?.usuarios) {
        setTeamMembers(
          equipeRes.usuarios.map((u, idx) => ({
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
  }, [currentUser, isCEO, agendaDateFilter, caixaPeriod, caixaDateRef, ceoBarberFilter]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  // Handler para Novo Lançamento Financeiro (POST /api/caixa)
  const handleCreateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseCurrencyInput(amountInput);
    if (isNaN(val) || val <= 0) {
      alert("Informe um valor numérico maior que zero (ex: 45,00).");
      return;
    }

    const targetBarberId = isCEO
      ? selectedBarberId
        ? Number(selectedBarberId)
        : Number(currentUser.id)
      : Number(currentUser.id);

    setIsSubmittingTx(true);
    try {
      const defaultDesc =
        txType === "entrada"
          ? "Serviço de Bancada"
          : txCategory === "USO DIARIO"
          ? "Insumo / Compra - Uso Diário"
          : "Despesa Operacional";

      await api.criarMovimentacao({
        tipo: txType,
        categoria: txType === "saida" ? txCategory : undefined,
        descricao: descInput.trim() || defaultDesc,
        valor: val,
        forma_pagamento: paymentMethod,
        barbeiro_id: targetBarberId,
        data: txDateInput || getLocalDateISO(),
      });

      setIsTxModalOpen(false);
      setAmountInput("");
      setDescInput("");
      await carregarDados(true);

      if (!isCEO && txType === "saida") {
        alert("Despesa enviada com sucesso para o controle do CEO!");
      }
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

    const periodTitle =
      caixaPeriod === "semanal"
        ? `SEMANAL (${getWeekRangeLabel(caixaDateRef)})`
        : caixaPeriod === "mensal"
        ? `MENSAL (${getMonthLabel(caixaDateRef).toUpperCase()})`
        : `DIARIO (${formatDateISOToBR(caixaDateRef)})`;

    doc.setTextColor(245, 158, 11);
    doc.setFontSize(10);
    doc.text(`FECHAMENTO DE CAIXA ${periodTitle} - RELATORIO PARA O CEO`, margin, 21);

    doc.setTextColor(203, 213, 225);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(
      `Ref.: ${formatDateISOToBR(caixaDateRef)}  |  Emitido: ${dateStr} as ${timeStr}  |  Por: ${currentUser.name}`,
      margin,
      28
    );

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

    // 2B. Divisão de Faturamento (Diário / Semanal / Mensal)
    const fp = caixaData.faturamentoPeriodos;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text("Divisao de Faturamento (Diario / Semanal / Mensal)", margin, y);
    y += 4;

    const periodCols = [
      {
        title: `Diario (${formatDateISOToBR(caixaDateRef)})`,
        entradas: fp.diario.entradas,
        saldo: fp.diario.saldoLiquido,
      },
      {
        title: `Semanal (${getWeekRangeLabel(caixaDateRef)})`,
        entradas: fp.semanal.entradas,
        saldo: fp.semanal.saldoLiquido,
      },
      {
        title: `Mensal (${getMonthLabel(caixaDateRef)})`,
        entradas: fp.mensal.entradas,
        saldo: fp.mensal.saldoLiquido,
      },
    ];
    periodCols.forEach((col, idx) => {
      const x = margin + idx * (cardWidth + cardGap);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(x, y, cardWidth, 16, 1.5, 1.5, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text(col.title.slice(0, 30), x + 3, y + 5.2);
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text(`Fat.: ${formatCurrency(col.entradas)}`, x + 3, y + 10.5);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(`Liquido: ${formatCurrency(col.saldo)}`, x + 3, y + 14.3);
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
      doc.setFontSize(7.5);
      doc.setTextColor(255, 255, 255);
      doc.text("Data", margin + 2, y + 5.2);
      doc.text("Hora", margin + 22, y + 5.2);
      doc.text("Tipo", margin + 34, y + 5.2);
      doc.text("Descricao", margin + 49, y + 5.2);
      doc.text("Profissional", margin + 103, y + 5.2);
      doc.text("Pagamento", margin + 135, y + 5.2);
      doc.text("Valor", margin + contentWidth - 2, y + 5.2, { align: "right" });
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
      doc.text("Nenhuma movimentacao registrada neste periodo.", margin + 3, y + 8);
      y += 12;
    } else {
      caixaData.movimentacoes.forEach((tx, idx) => {
        const descLines = doc.splitTextToSize(tx.description || "-", 51) as string[];
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
        doc.setFontSize(7.5);
        doc.setTextColor(71, 85, 105);
        doc.text(tx.date || formatDateISOToBR(caixaDateRef), margin + 2, y + 4.8);
        doc.text(tx.timestamp, margin + 22, y + 4.8);

        doc.setFont("helvetica", "bold");
        if (tx.type === "entrada") {
          doc.setTextColor(4, 120, 87);
          doc.text("Entrada", margin + 34, y + 4.8);
        } else {
          doc.setTextColor(190, 18, 60);
          doc.text("Saida", margin + 34, y + 4.8);
        }

        doc.setFont("helvetica", "normal");
        doc.setTextColor(15, 23, 42);
        doc.text(descLines, margin + 49, y + 4.8);
        doc.text((tx.barberName || "Geral").slice(0, 17), margin + 103, y + 4.8);
        doc.text(paymentLabel(tx.paymentMethod), margin + 135, y + 4.8);

        doc.setFont("helvetica", "bold");
        doc.setTextColor(tx.type === "entrada" ? 4 : 190, tx.type === "entrada" ? 120 : 18, tx.type === "entrada" ? 87 : 60);
        doc.text(
          `${tx.type === "entrada" ? "+" : "-"} ${formatCurrency(tx.amount)}`,
          margin + contentWidth - 2,
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

    doc.save(`fechamento-caixa-${caixaPeriod}-${caixaDateRef}.pdf`);
  };

  // Handler para Novo Agendamento (POST /api/agendamentos)
  const handleCreateAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientNameInput.trim() || !serviceInput.trim() || !timeInput) return;

    let parsedValor = 0;
    if (appAmountInput.trim()) {
      parsedValor = parseCurrencyInput(appAmountInput);
      if (isNaN(parsedValor) || parsedValor < 0) {
        alert("Informe um valor válido para o serviço (ex: 45,00).");
        return;
      }
    }

    const baseDate = appDateInput || getLocalDateISO();
    const [year, month, day] = baseDate.split("-").map(Number);
    const [hours, minutes] = timeInput.split(":").map(Number);
    const scheduleDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
    const targetBarberId = isCEO ? Number(appBarberId) : Number(currentUser.id);

    setIsSubmittingApp(true);
    try {
      await api.criarAgendamento({
        cliente_nome: clientNameInput.trim(),
        servico: serviceInput.trim(),
        valor: parsedValor,
        forma_pagamento: appPaymentMethod,
        data_hora: scheduleDate.toISOString(),
        barbeiro_id: targetBarberId,
      });

      setIsAppModalOpen(false);
      setClientNameInput("");
      setServiceInput("");
      setAppAmountInput("");
      setTimeInput("");
      await carregarDados(true);
    } catch (err: any) {
      alert(err.message || "Erro ao criar agendamento.");
    } finally {
      setIsSubmittingApp(false);
    }
  };

  // Handler para Atualizar Status do Agendamento (PATCH /api/agendamentos/{id})
  const handleUpdateAppointmentStatus = async (
    id: number | string,
    status: AppointmentStatus
  ) => {
    setUpdatingAppId(id);
    try {
      await api.atualizarStatusAgendamento(id, status);
      await carregarDados(true);
    } catch (err: any) {
      alert(err.message || "Erro ao atualizar status do agendamento.");
    } finally {
      setUpdatingAppId(null);
    }
  };

  // Handler para Excluir Agendamento (DELETE /api/agendamentos/{id})
  const handleDeleteAppointment = async (id: number | string) => {
    setUpdatingAppId(id);
    try {
      await api.deletarAgendamento(id);
      await carregarDados(true);
    } catch (err: any) {
      alert(err.message || "Erro ao excluir agendamento.");
    } finally {
      setUpdatingAppId(null);
    }
  };

  // Handler para Marcar Material como Comprado (PATCH /api/materiais/{id})
  const handleMarkMaterialBought = async (id: number | string) => {
    setUpdatingMaterialId(id);
    try {
      await api.atualizarStatusMaterial(id, "comprado");
      await carregarDados(true);
    } catch (err: any) {
      alert(err.message || "Erro ao atualizar pedido de material.");
    } finally {
      setUpdatingMaterialId(null);
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

  // Handlers do Redutor de Imagem e Ícone da Barbearia (Exclusivo CEO)
  const handleOpenLogoModal = () => {
    setRawLogoFile(null);
    setLogoPreviewUrl(logoUrl || "");
    setLogoStats(null);
    setIsLogoModalOpen(true);
  };

  const handleSelectLogoFile = async (
    file: File | null,
    size: 128 | 192 | 256 = logoTargetSize
  ) => {
    if (!file) return;
    setRawLogoFile(file);
    try {
      const result = await compressImageToIcon(file, size, 0.78);
      setLogoPreviewUrl(result.dataUrl);
      setLogoStats({
        originalKB: result.originalKB,
        compressedKB: result.compressedKB,
        reductionPct: result.reductionPct,
      });
    } catch (err: any) {
      alert(err.message || "Erro ao reduzir a imagem selecionada.");
    }
  };

  const handleChangeLogoResolution = async (newSize: 128 | 192 | 256) => {
    setLogoTargetSize(newSize);
    if (rawLogoFile) {
      await handleSelectLogoFile(rawLogoFile, newSize);
    }
  };

  const handleSaveLogo = async () => {
    setIsSavingLogo(true);
    try {
      const saved = await api.atualizarLogoBarbearia(logoPreviewUrl);
      setLogoUrl(saved);
      setIsLogoModalOpen(false);
    } catch (err: any) {
      alert(err.message || "Erro ao salvar ícone da barbearia.");
    } finally {
      setIsSavingLogo(false);
    }
  };

  const handleResetLogo = async () => {
    setIsSavingLogo(true);
    try {
      await api.atualizarLogoBarbearia("");
      setLogoUrl("");
      setLogoPreviewUrl("");
      setLogoStats(null);
      setRawLogoFile(null);
      setIsLogoModalOpen(false);
    } catch (err: any) {
      alert(err.message || "Erro ao restaurar ícone padrão.");
    } finally {
      setIsSavingLogo(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col font-sans pb-24 md:pb-8">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 w-full backdrop-blur-xl bg-[#0b0f19]/80 border-b border-white/10 px-4 py-3 sm:px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={isCEO ? handleOpenLogoModal : undefined}
              title={
                isCEO
                  ? "Clique para alterar o ícone da barbearia (visível para todos)"
                  : "Barbearia Rocha"
              }
              className={`relative w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500/20 to-amber-600/10 border border-amber-500/30 flex items-center justify-center text-amber-400 overflow-hidden shadow-glow animate-float-slow ${
                isCEO
                  ? "cursor-pointer hover:scale-105 hover:border-amber-400 transition-transform group"
                  : "cursor-default"
              }`}
            >
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Ícone da Barbearia"
                  className="w-full h-full object-cover"
                />
              ) : (
                <Scissors className="w-5 h-5 -rotate-45" />
              )}
              {isCEO && (
                <span className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <ImagePlus className="w-4 h-4 text-amber-300" />
                </span>
              )}
            </button>
            <div>
              <h2 className="text-sm sm:text-base font-bold tracking-tight text-white flex items-center gap-2">
                ROCHA BARBERSHOP
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
              title="Atualizar dados"
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

        {/* 0. SINCRONIZAÇÃO DE DATA, FILTRO DE VISÃO (RBAC) & DIVISÃO DE PERÍODO */}
        <section className="mb-5 p-4 rounded-2xl bg-slate-900/60 border border-white/10 space-y-4 animate-fade-up">
          {/* Cabeçalho de escopo RBAC: Visão Global / Filtro por Barbeiro (CEO) vs Visão Individual (Barbeiro) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
            <div className="flex items-center gap-2.5">
              <span
                className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
                  isCEO
                    ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                    : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                }`}
              >
                {isCEO
                  ? ceoBarberFilter === "todos"
                    ? "👑 Faturamento Geral da Barbearia"
                    : `🔎 Faturamento Individual: ${
                        teamMembers.find((u) => String(u.id) === String(ceoBarberFilter))?.name ||
                        "Profissional"
                      }`
                  : `💈 Meu Faturamento Individual (${currentUser.name})`}
              </span>
            </div>

            {isCEO && (
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-amber-400" />
                  Filtrar Profissional:
                </label>
                <select
                  value={ceoBarberFilter}
                  onChange={(e) => setCeoBarberFilter(e.target.value)}
                  className="h-8 px-2.5 rounded-lg bg-slate-950 border border-white/15 text-xs font-semibold text-slate-100 focus:outline-none focus:border-amber-400"
                >
                  <option value="todos">Todos os Barbeiros (Consolidado Geral)</option>
                  {teamMembers.map((u) => (
                    <option key={u.id} value={String(u.id)}>
                      {u.name} ({u.role === "admin" || u.role === "ceo" ? "CEO" : "Barbeiro"})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleOpenLogoModal}
                  className="h-8 px-3 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-300 text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95"
                >
                  <ImagePlus className="w-3.5 h-3.5" />
                  Ícone da Barbearia
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingTeamMemberId(null);
                    setIsTeamModalOpen(true);
                  }}
                  className="h-8 px-3 rounded-lg bg-purple-600/25 hover:bg-purple-600/40 border border-purple-500/40 text-purple-200 text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95"
                >
                  <Settings className="w-3.5 h-3.5" />
                  Gerenciar Equipe
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                Data Sincronizada:
              </span>
              <input
                type="date"
                value={caixaDateRef}
                onChange={(e) => syncReferenceDate(e.target.value)}
                aria-label="Data de referência sincronizada"
                className="h-8 px-2.5 rounded-lg bg-slate-950 border border-white/15 text-xs font-mono text-slate-100 focus:outline-none focus:border-amber-400"
              />
              <button
                type="button"
                onClick={() => syncReferenceDate(getLocalDateISO())}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                  caixaDateRef === getLocalDateISO()
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                    : "bg-slate-950 text-slate-400 border-white/10 hover:text-white"
                }`}
              >
                Hoje
              </button>
            </div>

            <div className="inline-flex items-center p-1 rounded-xl bg-slate-950/90 border border-white/10 self-start sm:self-auto">
              {(["diario", "semanal", "mensal"] as CaixaPeriod[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setCaixaPeriod(p)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    caixaPeriod === p
                      ? "bg-amber-500 text-slate-950 shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          {/* Cards Comparativos: Faturamento Diário / Semanal / Mensal */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {(
              [
                {
                  key: "diario" as CaixaPeriod,
                  title: isCEO ? "Faturamento Diário" : "Meu Faturamento Diário",
                  subtitle: formatDateISOToBR(caixaDateRef),
                  stats: caixaData.faturamentoPeriodos.diario,
                },
                {
                  key: "semanal" as CaixaPeriod,
                  title: isCEO ? "Faturamento Semanal" : "Meu Faturamento Semanal",
                  subtitle: getWeekRangeLabel(caixaDateRef),
                  stats: caixaData.faturamentoPeriodos.semanal,
                },
                {
                  key: "mensal" as CaixaPeriod,
                  title: isCEO ? "Faturamento Mensal" : "Meu Faturamento Mensal",
                  subtitle: getMonthLabel(caixaDateRef),
                  stats: caixaData.faturamentoPeriodos.mensal,
                },
              ]
            ).map((item) => {
              const isSelected = caixaPeriod === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setCaixaPeriod(item.key)}
                  className={`text-left p-3.5 rounded-xl border card-hover ${
                    isSelected
                      ? "bg-slate-950 border-amber-500/50 ring-1 ring-amber-500/30"
                      : "bg-slate-950/50 border-white/5 hover:border-white/15"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                      {item.title}
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                        isSelected
                          ? "bg-amber-500/20 text-amber-300"
                          : "bg-white/5 text-slate-400"
                      }`}
                    >
                      {item.subtitle}
                    </span>
                  </div>
                  <div className="text-lg font-extrabold text-white">
                    R$ {item.stats.entradas.toFixed(2).replace(".", ",")}
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                    <span>
                      Líq.:{" "}
                      <strong className="text-emerald-400">
                        R$ {item.stats.saldoLiquido.toFixed(2).replace(".", ",")}
                      </strong>
                    </span>
                    <span className="font-mono">{item.stats.totalMovimentacoes} mov.</span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* 1. CARDS DE RESUMO DO CAIXA ({PERIOD_LABELS[caixaPeriod]}) */}
        {isLoading ? (
          <div
            className={`grid grid-cols-1 ${
              isCEO ? "md:grid-cols-3" : "md:grid-cols-2"
            } gap-3.5 mb-6 animate-pulse`}
          >
            <div className="h-36 rounded-2xl bg-slate-900/60 border border-white/5" />
            <div className="h-36 rounded-2xl bg-slate-900/60 border border-white/5" />
            {isCEO && <div className="h-36 rounded-2xl bg-slate-900/60 border border-white/5" />}
          </div>
        ) : (
          <section
            className={`grid grid-cols-1 ${
              isCEO ? "md:grid-cols-3" : "md:grid-cols-2"
            } gap-3.5 mb-6 animate-fade-up`}
          >
            {/* Card 1: Saldo Líquido (CEO) / Meu Faturamento (Barbeiro) */}
            <div className="relative overflow-hidden p-5 rounded-2xl bg-gradient-to-br from-[#0c1815] via-[#0f172a] to-[#07090e] border border-emerald-500/30 shadow-emerald-glow card-hover">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <Wallet className="w-4 h-4" />{" "}
                  {isCEO ? "Saldo Líquido" : "Meu Faturamento"} ({PERIOD_LABELS[caixaPeriod]})
                </span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-medium">
                  {formatDateISOToBR(caixaDateRef)}
                </span>
              </div>
              <div className="text-3xl font-extrabold text-white tracking-tight">
                R$ {caixaData.saldoLiquido.toFixed(2).replace(".", ",")}
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-400 border-t border-emerald-500/10 pt-2.5">
                <span>
                  Entradas:{" "}
                  <strong className="text-emerald-400">
                    R$ {caixaData.totalEntradas.toFixed(2)}
                  </strong>
                </span>
                {isCEO && (
                  <span>
                    Saídas:{" "}
                    <strong className="text-rose-400">
                      R$ {caixaData.totalSaidas.toFixed(2)}
                    </strong>
                  </span>
                )}
              </div>
            </div>

            {/* Card 2: Entradas Brutas */}
            <div className="p-5 rounded-2xl bg-slate-900/60 backdrop-blur-md border border-white/10 flex flex-col justify-between card-hover">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />{" "}
                  {isCEO ? "Total Entradas" : "Minhas Entradas"}
                </span>
                <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                  +{caixaData.totalMovimentacoes} mov.
                </span>
              </div>
              <div className="text-2xl font-bold text-emerald-400">
                R$ {caixaData.totalEntradas.toFixed(2).replace(".", ",")}
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                {isCEO
                  ? "Serviços de corte, barba e produtos registrados"
                  : "Seus atendimentos e serviços lançados no período"}
              </p>
            </div>

            {/* Card 3: Saídas e Insumos (EXCLUSIVO CEO) */}
            {isCEO && (
              <div className="p-5 rounded-2xl bg-slate-900/60 backdrop-blur-md border border-white/10 flex flex-col justify-between card-hover">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <TrendingDown className="w-4 h-4 text-rose-400" /> Despesas &amp; Insumos
                  </span>
                  <span className="text-xs font-mono text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-md">
                    Visão CEO
                  </span>
                </div>
                <div className="text-2xl font-bold text-rose-400">
                  R$ {caixaData.totalSaidas.toFixed(2).replace(".", ",")}
                </div>
                <p className="text-[11px] text-slate-400 mt-2 flex items-center justify-between">
                  <span>Uso Diário &amp; Operacional</span>
                  <span className="font-mono text-amber-300">
                    Uso Diário: R${" "}
                    {caixaData.movimentacoes
                      .filter((m) => m.type === "saida" && m.category === "USO DIARIO")
                      .reduce((acc, m) => acc + m.amount, 0)
                      .toFixed(2)
                      .replace(".", ",")}
                  </span>
                </p>
              </div>
            )}
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
              setTxDateInput(caixaDateRef || getLocalDateISO());
              if (isCEO && ceoBarberFilter !== "todos") {
                setSelectedBarberId(ceoBarberFilter);
              } else {
                setSelectedBarberId(currentUser.id);
              }
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
              setTxCategory("USO DIARIO");
              setTxDateInput(caixaDateRef || getLocalDateISO());
              if (isCEO && ceoBarberFilter !== "todos") {
                setSelectedBarberId(ceoBarberFilter);
              } else {
                setSelectedBarberId(currentUser.id);
              }
              setIsTxModalOpen(true);
            }}
            className="p-3.5 rounded-2xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 font-semibold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all shadow-sm"
          >
            <MinusCircle className="w-5 h-5" />
            {isCEO ? "- Lançar Saída" : "- Enviar Despesa"}
          </button>

          <button
            onClick={() => {
              setAppDateInput(
                agendaDateFilter && agendaDateFilter !== "todos"
                  ? agendaDateFilter
                  : getLocalDateISO()
              );
              if (isCEO && ceoBarberFilter !== "todos") {
                setAppBarberId(ceoBarberFilter);
              } else {
                setAppBarberId(currentUser.id);
              }
              setIsAppModalOpen(true);
            }}
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
            {isCEO ? "Movimentações do Caixa" : "Meus Lançamentos"} ({caixaData.movimentacoes.length})
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
            {isCEO ? "Agenda" : "Minha Agenda"} ({appointments.length})
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
                <p className="text-sm text-slate-400">
                  Nenhuma movimentação registrada no período ({PERIOD_LABELS[caixaPeriod].toLowerCase()}) para {formatDateISOToBR(caixaDateRef)}.
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Troque o período (Diário / Semanal / Mensal), altere a data sincronizada ou lance uma movimentação acima.
                </p>
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
                      <div className="flex items-center flex-wrap gap-2">
                        <p className="text-sm font-semibold text-slate-200">
                          {tx.description}
                        </p>
                        {tx.type === "saida" && tx.category && (
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                              tx.category === "USO DIARIO"
                                ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                                : "bg-rose-500/15 text-rose-300 border-rose-500/30"
                            }`}
                          >
                            {tx.category === "USO DIARIO" ? "USO DIÁRIO" : tx.category}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center flex-wrap gap-2 text-[11px] text-slate-400 mt-0.5">
                        <span className="text-amber-300/90 font-medium">
                          {tx.barberName}
                        </span>
                        <span>•</span>
                        <span className="font-mono text-slate-300 bg-white/5 px-1.5 py-0.5 rounded">
                          {tx.date || formatDateISOToBR(caixaDateRef)}
                        </span>
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-400 px-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span>Filtro:</span>
                <button
                  type="button"
                  onClick={() => setAgendaDateFilter(getLocalDateISO())}
                  className={`px-2.5 py-1 rounded-lg font-semibold border transition-all ${
                    agendaDateFilter === getLocalDateISO()
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                      : "bg-slate-900 text-slate-400 border-white/10 hover:text-white"
                  }`}
                >
                  Hoje
                </button>
                <input
                  type="date"
                  value={agendaDateFilter === "todos" ? "" : agendaDateFilter}
                  onChange={(e) => setAgendaDateFilter(e.target.value || "todos")}
                  className="h-7 px-2 rounded-lg bg-slate-900 border border-white/10 text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                />
                <button
                  type="button"
                  onClick={() => setAgendaDateFilter("todos")}
                  className={`px-2.5 py-1 rounded-lg font-semibold border transition-all ${
                    agendaDateFilter === "todos"
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                      : "bg-slate-900 text-slate-400 border-white/10 hover:text-white"
                  }`}
                >
                  Ver Todos
                </button>
              </div>
              <button
                onClick={() => {
                  setAppDateInput(
                    agendaDateFilter && agendaDateFilter !== "todos"
                      ? agendaDateFilter
                      : getLocalDateISO()
                  );
                  setIsAppModalOpen(true);
                }}
                className="text-amber-400 hover:underline font-semibold flex items-center gap-1 self-end sm:self-auto"
              >
                <Plus className="w-3.5 h-3.5" /> Novo Agendamento
              </button>
            </div>

            {appointments.length === 0 ? (
              <div className="p-8 text-center rounded-2xl bg-slate-900/40 border border-white/5">
                <p className="text-sm text-slate-400">
                  {agendaDateFilter === "todos"
                    ? "Nenhum atendimento na fila."
                    : "Nenhum agendamento encontrado para a data selecionada."}
                </p>
                <button
                  onClick={() => setIsAppModalOpen(true)}
                  className="mt-3 px-4 py-2 rounded-xl bg-amber-500/20 text-amber-300 text-xs font-bold border border-amber-500/30"
                >
                  Agendar Cliente
                </button>
              </div>
            ) : (
              appointments.map((app) => {
                const isUpdating = updatingAppId === app.id;
                const statusBadge =
                  app.status === "concluido"
                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                    : app.status === "cancelado"
                    ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
                    : "bg-amber-500/15 text-amber-300 border-amber-500/30";

                return (
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
                        <div className="flex items-center flex-wrap gap-2">
                          <h4 className="text-sm font-bold text-white">
                            {app.clientName}
                          </h4>
                          {(app.amount || 0) > 0 && (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono text-xs font-bold">
                              R$ {(app.amount || 0).toFixed(2).replace(".", ",")} •{" "}
                              {(app.paymentMethod || "pix").replace("_", " ").toUpperCase()}
                            </span>
                          )}
                          {app.status === "concluido" && (app.amount || 0) > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-bold uppercase">
                              ✓ Faturado no Caixa
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-300">{app.service}</p>
                        <p className="text-[11px] text-slate-500 mt-1">
                          Profissional: <span className="text-slate-300">{app.barberName}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center flex-wrap">
                      <span
                        className={`px-3 py-1 rounded-full border text-xs font-bold capitalize ${statusBadge}`}
                      >
                        {app.status}
                      </span>

                      {app.status === "agendado" && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleUpdateAppointmentStatus(app.id, "concluido")}
                            disabled={isUpdating}
                            title="Marcar atendimento como concluído"
                            className="px-2.5 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-1 transition-all disabled:opacity-40"
                          >
                            {isUpdating ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            )}
                            Concluir
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateAppointmentStatus(app.id, "cancelado")}
                            disabled={isUpdating}
                            title="Cancelar agendamento"
                            className="px-2.5 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-1 transition-all disabled:opacity-40"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Cancelar
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => handleDeleteAppointment(app.id)}
                        disabled={isUpdating}
                        title="Excluir agendamento"
                        className="p-1.5 rounded-xl bg-slate-950/60 hover:bg-rose-950/40 border border-white/10 hover:border-rose-500/30 text-slate-400 hover:text-rose-300 transition-all disabled:opacity-40"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ABA INSUMOS */}
        {activeTab === "insumos" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">
                Controle de materiais e insumos da barbearia
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
              materialRequests.map((req) => {
                const isUpdatingMat = updatingMaterialId === req.id;
                const isBought = req.status === "comprado";

                return (
                  <div
                    key={req.id}
                    className="p-3.5 rounded-2xl bg-slate-900/60 border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-2.5 h-10 rounded-full ${
                          isBought
                            ? "bg-emerald-500"
                            : req.urgency === "alta"
                            ? "bg-rose-500"
                            : req.urgency === "media"
                            ? "bg-amber-500"
                            : "bg-slate-500"
                        }`}
                      />
                      <div>
                        <p
                          className={`text-sm font-semibold ${
                            isBought ? "text-slate-400 line-through" : "text-slate-200"
                          }`}
                        >
                          {req.item}{" "}
                          <span className="text-xs text-slate-400 font-mono">
                            ({req.quantity} un)
                          </span>
                        </p>
                        <p className="text-[11px] text-slate-400">
                          Solicitado por {req.requestedBy} • {req.requestedAt}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          req.urgency === "alta"
                            ? "bg-rose-500/20 text-rose-300"
                            : "bg-amber-500/20 text-amber-300"
                        }`}
                      >
                        {req.urgency}
                      </span>
                      <span
                        className={`text-[11px] font-mono px-2 py-1 rounded-lg border uppercase ${
                          isBought
                            ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                            : "bg-white/5 text-slate-300 border-white/5"
                        }`}
                      >
                        {req.status}
                      </span>
                      {isCEO && req.status === "pendente" && (
                        <button
                          type="button"
                          onClick={() => handleMarkMaterialBought(req.id)}
                          disabled={isUpdatingMat}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/35 border border-emerald-500/35 text-emerald-300 text-xs font-semibold flex items-center gap-1 transition-all disabled:opacity-40"
                        >
                          {isUpdatingMat ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                          Comprado
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
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
                  Gerencie o acesso e os PINs dos profissionais da barbearia.
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

              {txType === "saida" && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Classificação da Despesa
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      {
                        id: "USO DIARIO" as ExpenseCategory,
                        label: "USO DIÁRIO",
                        sub: "Insumos & Compras do dia",
                      },
                      {
                        id: "DESPESA GERAL" as ExpenseCategory,
                        label: "GERAL / FIXA",
                        sub: "Outras despesas",
                      },
                    ].map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setTxCategory(cat.id)}
                        className={`p-2.5 rounded-xl border text-left transition-all ${
                          txCategory === cat.id
                            ? "bg-rose-500/20 border-rose-400 text-rose-200 ring-1 ring-rose-500/40"
                            : "bg-slate-950 border-white/10 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        <div className="text-xs font-extrabold">{cat.label}</div>
                        <div className="text-[10px] opacity-80 mt-0.5">{cat.sub}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

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

              {/* Data do Lançamento & Barbeiro Responsável */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Data do Lançamento
                  </label>
                  <input
                    type="date"
                    value={txDateInput}
                    onChange={(e) => setTxDateInput(e.target.value)}
                    required
                    className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-white/15 text-sm font-mono text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Profissional Responsável
                  </label>
                  {isCEO ? (
                    <select
                      value={selectedBarberId}
                      onChange={(e) => setSelectedBarberId(e.target.value)}
                      className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-white/15 text-sm text-white focus:outline-none focus:border-amber-400"
                    >
                      {(teamMembers.length > 0 ? teamMembers : [currentUser]).map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.role})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="w-full h-11 px-3 rounded-xl bg-slate-950/70 border border-white/10 text-sm text-amber-300 font-semibold flex items-center">
                      💈 {currentUser.name}
                    </div>
                  )}
                </div>
              </div>

              {/* Forma de Pagamento */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Forma de Pagamento
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
                    <Loader2 className="w-4 h-4 animate-spin" /> Registrando...
                  </>
                ) : (
                  "Confirmar Lançamento"
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: NOVO AGENDAMENTO */}
      {isAppModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-white/15 p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/10">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Calendar className="w-5 h-5 text-amber-400" />
                Novo Agendamento
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Data
                  </label>
                  <input
                    type="date"
                    value={appDateInput}
                    onChange={(e) => setAppDateInput(e.target.value)}
                    required
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Valor p/ Faturamento ao Concluir (R$)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="Ex: 45,00"
                    value={appAmountInput}
                    onChange={(e) => setAppAmountInput(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-slate-950 border border-white/15 text-sm font-mono font-bold text-emerald-400 focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Forma de Pagamento
                  </label>
                  <select
                    value={appPaymentMethod}
                    onChange={(e) => setAppPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full h-10 px-3 rounded-xl bg-slate-950 border border-white/15 text-sm text-white focus:outline-none focus:border-amber-400"
                  >
                    <option value="pix">PIX</option>
                    <option value="dinheiro">Dinheiro</option>
                    <option value="cartao_credito">Cartão de Crédito</option>
                    <option value="cartao_debito">Cartão de Débito</option>
                  </select>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 -mt-2">
                Ao clicar em <strong className="text-emerald-400">Concluir</strong> na agenda, este valor será lançado automaticamente no faturamento.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Barbeiro Designado
                </label>
                {isCEO ? (
                  <select
                    value={appBarberId}
                    onChange={(e) => setAppBarberId(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-slate-950 border border-white/15 text-sm text-white focus:outline-none focus:border-amber-400"
                  >
                    {(teamMembers.length > 0 ? teamMembers : [currentUser]).map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.role})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="w-full h-10 px-3 rounded-xl bg-slate-950/70 border border-white/10 text-sm text-amber-300 font-semibold flex items-center">
                    💈 {currentUser.name}
                  </div>
                )}
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

      {/* MODAL 3: PEDIDO DE INSUMO */}
      {isMaterialModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-white/15 p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/10">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Package className="w-5 h-5 text-cyan-400" />
                Solicitar Material
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
                    <Loader2 className="w-4 h-4 animate-spin" /> Enviando solicitação...
                  </>
                ) : (
                  "Enviar Solicitação"
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: GESTÃO DE EQUIPE (EXCLUSIVO CEO) */}
      {isCEO && (
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
      )}

      {/* MODAL 5: ÍCONE DA BARBEARIA COM REDUTOR DE TAMANHO (EXCLUSIVO CEO) */}
      {isCEO && isLogoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-white/15 p-5 shadow-2xl animate-scale-in">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/10">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <ImagePlus className="w-5 h-5 text-amber-400" />
                Ícone da Barbearia (Visível para Todos)
              </h3>
              <button
                onClick={() => setIsLogoModalOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Pré-visualização ao vivo */}
              <div className="p-4 rounded-2xl bg-slate-950/70 border border-white/10 flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-amber-600/10 border border-amber-500/40 flex items-center justify-center text-amber-400 overflow-hidden shadow-glow flex-shrink-0 animate-float-slow">
                  {logoPreviewUrl ? (
                    <img
                      src={logoPreviewUrl}
                      alt="Prévia do ícone"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Scissors className="w-7 h-7 -rotate-45" />
                  )}
                </div>
                <div className="text-xs text-slate-300 space-y-1">
                  <p className="font-bold text-white">Pré-visualização do Ícone</p>
                  <p className="text-slate-400">
                    Aparecerá na tela de PIN e no topo do painel para toda a equipe.
                  </p>
                  {logoStats && (
                    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono text-[11px]">
                      <span>{logoStats.originalKB} KB</span>
                      <span>→</span>
                      <strong>{logoStats.compressedKB} KB</strong>
                      {logoStats.reductionPct > 0 && (
                        <span>(-{logoStats.reductionPct}%)</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Nível do Redutor de Tamanho */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Redutor Automático de Tamanho
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { size: 128 as const, label: "Ultra Leve", sub: "128×128px" },
                      { size: 192 as const, label: "Padrão HD", sub: "192×192px" },
                      { size: 256 as const, label: "Nitidez Máx.", sub: "256×256px" },
                    ]
                  ).map((opt) => (
                    <button
                      key={opt.size}
                      type="button"
                      onClick={() => handleChangeLogoResolution(opt.size)}
                      className={`p-2 rounded-xl border text-center transition-all ${
                        logoTargetSize === opt.size
                          ? "bg-amber-500/20 border-amber-400 text-amber-300 font-bold"
                          : "bg-slate-950 border-white/10 text-slate-400 hover:text-white"
                      }`}
                    >
                      <div className="text-xs">{opt.label}</div>
                      <div className="text-[10px] font-mono opacity-80">{opt.sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Upload de Imagem */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Selecionar Imagem da Barbearia
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleSelectLogoFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-300 file:mr-3 file:py-2 file:px-3.5 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-amber-500 file:text-slate-950 hover:file:bg-amber-400 file:cursor-pointer cursor-pointer bg-slate-950 border border-white/15 rounded-xl p-1.5"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Qualquer foto é automaticamente recortada em quadrado e comprimida em WebP leve.
                </p>
              </div>

              <div className="flex items-center gap-2 pt-2">
                {logoUrl && (
                  <button
                    type="button"
                    onClick={handleResetLogo}
                    disabled={isSavingLogo}
                    className="h-11 px-3.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-bold transition-all disabled:opacity-50"
                  >
                    Restaurar Padrão
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSaveLogo}
                  disabled={isSavingLogo || !logoPreviewUrl}
                  className="flex-1 h-11 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm transition-all shadow-glow flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSavingLogo ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Salvando...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" /> Salvar Ícone para Todos
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardCaixa;
