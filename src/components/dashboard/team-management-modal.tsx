"use client";

import React, { useState, useEffect } from "react";
import { User, UserRole } from "@/types";
import {
  Users,
  UserPlus,
  ShieldAlert,
  Trash2,
  Pencil,
  Check,
  KeyRound,
  X,
  AlertCircle,
  Loader2,
} from "lucide-react";

interface TeamManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: User[];
  initialEditUserId?: number | null;
  onAddUser: (userData: {
    nome: string;
    pin: string;
    papel: UserRole;
  }) => Promise<{ success: boolean; error?: string }>;
  onDeleteUser: (id: number) => Promise<{ success: boolean; error?: string }>;
  onEditUser: (
    id: number,
    data: { nome: string; pin: string }
  ) => Promise<{ success: boolean; error?: string }>;
  onRefresh: () => void;
}

export const TeamManagementModal: React.FC<TeamManagementModalProps> = ({
  isOpen,
  onClose,
  users,
  initialEditUserId = null,
  onAddUser,
  onDeleteUser,
  onEditUser,
  onRefresh,
}) => {
  // ── Estados do formulário de criação ──────────────────────────────────
  const [name, setName] = useState<string>("");
  const [pin, setPin] = useState<string>("");
  const [role, setRole] = useState<UserRole>("barbeiro");
  const [formError, setFormError] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // ── Estados de exclusão ───────────────────────────────────────────────
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string>("");

  // ── Estados de edição ─────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState<string>("");
  const [editPin, setEditPin] = useState<string>("");
  const [editError, setEditError] = useState<string>("");
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen && initialEditUserId) {
      const target = users.find((u) => Number(u.id) === Number(initialEditUserId));
      if (target && target.role !== "admin") {
        setEditingId(Number(target.id));
        setEditName(target.name);
        setEditPin(target.pin || "");
        setEditError("");
      }
    } else if (!isOpen) {
      setEditingId(null);
      setEditName("");
      setEditPin("");
      setEditError("");
      setDeleteError("");
    }
  }, [isOpen, initialEditUserId, users]);

  if (!isOpen) return null;

  const MAX_USERS = 5;
  const isFull = users.length >= MAX_USERS;

  const resetForm = () => {
    setName("");
    setPin("");
    setRole("barbeiro");
    setFormError("");
    setIsSubmitting(false);
  };

  const startEdit = (u: User) => {
    setEditingId(Number(u.id));
    setEditName(u.name);
    setEditPin(u.pin || "");
    setEditError("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditPin("");
    setEditError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!name.trim()) {
      setFormError("Informe o nome do colaborador.");
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      setFormError("O PIN deve conter exatamente 4 números.");
      return;
    }
    if (isFull) {
      setFormError("Limite estrito de 5 colaboradores atingido no banco de dados.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await onAddUser({ nome: name, pin, papel: role });
      if (!res.success) {
        setFormError(res.error || "Erro ao adicionar colaborador.");
      } else {
        resetForm();
        onRefresh();
      }
    } catch (err: any) {
      setFormError(err.message || "Erro de conexão ao criar colaborador.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (u: User) => {
    const userId = Number(u.id);
    setDeleteError("");
    if (
      !window.confirm(
        `Remover "${u.name}" da equipe?\n\nEsta ação não pode ser desfeita.`
      )
    )
      return;

    setDeletingId(userId);
    try {
      const res = await onDeleteUser(userId);
      if (!res.success) {
        setDeleteError(res.error || "Erro ao remover colaborador.");
      } else {
        onRefresh();
      }
    } catch (err: any) {
      setDeleteError(err.message || "Erro de conexão ao remover colaborador.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleSaveEdit = async (u: User) => {
    const userId = Number(u.id);
    setEditError("");

    if (!editName.trim()) {
      setEditError("O nome não pode ser vazio.");
      return;
    }
    if (!/^\d{4}$/.test(editPin)) {
      setEditError("O PIN deve conter exatamente 4 números.");
      return;
    }

    setIsSavingEdit(true);
    try {
      const res = await onEditUser(userId, { nome: editName.trim(), pin: editPin });
      if (!res.success) {
        setEditError(res.error || "Erro ao salvar alterações.");
      } else {
        cancelEdit();
        onRefresh();
      }
    } catch (err: any) {
      setEditError(err.message || "Erro de conexão ao salvar edição.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl bg-[#0c1220] border border-white/15 p-5 sm:p-6 shadow-2xl my-auto text-slate-100">

        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Gestão da Equipe &amp; Cadeiras
                <span className="text-xs px-2 py-0.5 rounded-full font-mono bg-purple-500/15 text-purple-300 border border-purple-500/30">
                  {users.length} / {MAX_USERS} Vagas
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Acesso restrito do CEO. Limite máximo de 5 colaboradores.
              </p>
            </div>
          </div>
          <button
            onClick={() => { resetForm(); cancelEdit(); onClose(); }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Indicador Visual de Slots */}
        <div className="my-4 p-3.5 rounded-xl bg-slate-950/60 border border-white/5">
          <div className="flex items-center justify-between text-xs mb-2 text-slate-400">
            <span>Ocupação das Cadeiras da Barbearia</span>
            <span className="font-semibold text-purple-400">
              {MAX_USERS - users.length > 0
                ? `${MAX_USERS - users.length} vaga(s) restante(s)`
                : "Capacidade máxima atingida"}
            </span>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((slotNumber) => {
              const assignedUser = users[slotNumber - 1];
              return (
                <div
                  key={slotNumber}
                  className={`p-2 rounded-xl border flex flex-col items-center justify-center text-center transition-all ${
                    assignedUser
                      ? "bg-slate-900 border-purple-500/30 text-white"
                      : "bg-slate-950/40 border-dashed border-white/10 text-slate-600"
                  }`}
                >
                  <span className="text-[10px] font-mono uppercase text-slate-500">
                    Slot #{slotNumber}
                  </span>
                  {assignedUser ? (
                    <>
                      <div className="text-xs font-bold truncate max-w-full mt-0.5">
                        {assignedUser.role === "admin" ? "👑" : "💈"}{" "}
                        {assignedUser.name.split(" ")[0]}
                      </div>
                      <span className="text-[9px] text-amber-400/90 font-mono">
                        PIN: {assignedUser.pin || "****"}
                      </span>
                    </>
                  ) : (
                    <span className="text-[10px] italic text-slate-600 mt-1">Livre</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Formulário: Cadastrar Novo Colaborador */}
        <form
          onSubmit={handleSubmit}
          className="p-4 rounded-xl bg-slate-900/70 border border-white/10 mb-4"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <UserPlus className="w-3.5 h-3.5 text-purple-400" />
              Cadastrar Novo Colaborador
            </h3>
          </div>

          {formError && (
            <div className="p-2.5 mb-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Nome do Profissional
              </label>
              <input
                type="text"
                placeholder="Ex: Matheus Silva"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isFull || isSubmitting}
                className="w-full h-10 px-3 rounded-xl bg-slate-950 border border-white/10 text-sm text-white focus:outline-none focus:border-purple-400 disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                PIN de Acesso (4 Números)
              </label>
              <div className="relative">
                <input
                  type="text"
                  maxLength={4}
                  placeholder="Ex: 5555"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  disabled={isFull || isSubmitting}
                  className="w-full h-10 px-3 pl-9 rounded-xl bg-slate-950 border border-white/10 text-sm font-mono tracking-widest text-white focus:outline-none focus:border-purple-400 disabled:opacity-50"
                />
                <KeyRound className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Papel no Sistema
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                disabled={isFull || isSubmitting}
                className="w-full h-10 px-3 rounded-xl bg-slate-950 border border-white/10 text-sm text-white focus:outline-none focus:border-purple-400 disabled:opacity-50"
              >
                <option value="barbeiro">Barbeiro (Bancada &amp; Agenda)</option>
                <option value="admin">Administrador (CEO - Acesso Geral)</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={isFull || isSubmitting}
            className={`w-full mt-3 h-10 rounded-xl font-bold text-xs sm:text-sm text-white transition-all flex items-center justify-center gap-2 ${
              isFull
                ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-white/5"
                : "bg-purple-600 hover:bg-purple-500 shadow-md"
            }`}
          >
            {isSubmitting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
            ) : isFull ? (
              <><ShieldAlert className="w-4 h-4" /> Limite de 5 Membros Atingido</>
            ) : (
              <><UserPlus className="w-4 h-4" /> Adicionar à Equipe</>
            )}
          </button>
        </form>

        {/* Lista de Colaboradores */}
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Colaboradores Ativos ({users.length}):
          </p>

          {/* Erro de exclusão */}
          {deleteError && (
            <div className="p-2.5 mb-2 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {deleteError}
            </div>
          )}

          {users.map((u) => {
            const isEditing = editingId === u.id;
            const isAdmin = u.role === "admin";

            return (
              <div
                key={u.id}
                className={`rounded-xl border transition-all ${
                  isEditing
                    ? "bg-slate-900 border-purple-500/40 p-3"
                    : "bg-slate-950/70 border-white/5 p-3"
                }`}
              >
                {isEditing ? (
                  /* ── Modo Edição ──────────────────────────────────── */
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2 mb-1">
                      <Pencil className="w-3.5 h-3.5 text-purple-400" />
                      <span className="text-xs font-bold text-purple-300 uppercase tracking-wider">
                        Editando barbeiro
                      </span>
                    </div>

                    {editError && (
                      <div className="p-2 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                        {editError}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                          Nome
                        </label>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          disabled={isSavingEdit}
                          autoFocus
                          className="w-full h-9 px-3 rounded-lg bg-slate-950 border border-purple-500/30 text-sm text-white focus:outline-none focus:border-purple-400 disabled:opacity-50"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                          PIN (4 dígitos)
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            maxLength={4}
                            value={editPin}
                            onChange={(e) =>
                              setEditPin(e.target.value.replace(/\D/g, ""))
                            }
                            disabled={isSavingEdit}
                            className="w-full h-9 px-3 pl-8 rounded-lg bg-slate-950 border border-purple-500/30 text-sm font-mono tracking-widest text-white focus:outline-none focus:border-purple-400 disabled:opacity-50"
                          />
                          <KeyRound className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2 justify-end pt-1">
                      <button
                        type="button"
                        onClick={cancelEdit}
                        disabled={isSavingEdit}
                        className="h-8 px-3 rounded-lg bg-slate-800 border border-white/10 text-slate-300 text-xs font-semibold hover:bg-slate-700 transition-all disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(u)}
                        disabled={isSavingEdit}
                        className="h-8 px-4 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all disabled:opacity-50"
                      >
                        {isSavingEdit ? (
                          <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Salvando...</>
                        ) : (
                          <><Check className="w-3.5 h-3.5" /> Salvar</>
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── Modo Visualização ───────────────────────────── */
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-center font-bold text-amber-400 text-sm">
                        {isAdmin ? "👑" : "💈"}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white">{u.name}</span>
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold uppercase ${
                              isAdmin
                                ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                            }`}
                          >
                            {isAdmin ? "CEO" : "BARBEIRO"}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          <span className="text-slate-300 font-mono">
                            PIN: {u.pin || "****"}
                          </span>
                        </p>
                      </div>
                    </div>

                    {/* Ações — apenas barbeiros */}
                    <div className="flex items-center gap-1.5">
                      {!isAdmin ? (
                        <>
                          {/* Botão Editar */}
                          <button
                            type="button"
                            onClick={() => startEdit(u)}
                            disabled={deletingId === u.id || editingId !== null}
                            title="Editar nome e PIN"
                            className="p-2 rounded-xl bg-purple-950/30 border border-purple-500/20 text-purple-400 hover:bg-purple-900/50 hover:border-purple-500/50 hover:text-purple-300 active:scale-95 transition-all disabled:opacity-40"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>

                          {/* Botão Excluir */}
                          <button
                            type="button"
                            onClick={() => handleDelete(u)}
                            disabled={deletingId === u.id || editingId !== null}
                            title="Remover barbeiro da equipe"
                            className="p-2 rounded-xl bg-rose-950/30 border border-rose-500/20 text-rose-400 hover:bg-rose-900/50 hover:border-rose-500/50 hover:text-rose-300 active:scale-95 transition-all disabled:opacity-40"
                          >
                            {deletingId === u.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        </>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                          Protegido
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default TeamManagementModal;
