"use client";

import React, { useState } from "react";
import { User, UserRole } from "@/types";
import {
  Users,
  UserPlus,
  ShieldAlert,
  Trash2,
  Edit2,
  KeyRound,
  Scissors,
  CheckCircle2,
  X,
  AlertCircle,
} from "lucide-react";

interface TeamManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: User[];
  onAddUser: (user: Omit<User, "id">) => { success: boolean; error?: string };
  onUpdateUser: (id: string, updates: Partial<User>) => void;
  onDeleteUser: (id: string) => { success: boolean; error?: string };
}

export const TeamManagementModal: React.FC<TeamManagementModalProps> = ({
  isOpen,
  onClose,
  users,
  onAddUser,
  onUpdateUser,
  onDeleteUser,
}) => {
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState<string>("");
  const [pin, setPin] = useState<string>("");
  const [role, setRole] = useState<UserRole>("BARBEIRO");
  const [stationNumber, setStationNumber] = useState<number>(users.length + 1);
  const [formError, setFormError] = useState<string>("");

  if (!isOpen) return null;

  const MAX_USERS = 5;
  const isFull = users.length >= MAX_USERS;

  const resetForm = () => {
    setName("");
    setPin("");
    setRole("BARBEIRO");
    setStationNumber(users.length + 1);
    setFormError("");
    setIsEditing(false);
    setEditingUserId(null);
  };

  const handleStartEdit = (user: User) => {
    setIsEditing(true);
    setEditingUserId(user.id);
    setName(user.name);
    setPin(user.pin);
    setRole(user.role);
    setStationNumber(user.stationNumber || 1);
    setFormError("");
  };

  const handleSubmit = (e: React.FormEvent) => {
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

    // Checar se o PIN já está sendo usado por outro usuário
    const pinConflict = users.find(
      (u) => u.pin === pin && (!isEditing || u.id !== editingUserId)
    );
    if (pinConflict) {
      setFormError(`Este PIN já está cadastrado para ${pinConflict.name}.`);
      return;
    }

    if (isEditing && editingUserId) {
      onUpdateUser(editingUserId, {
        name,
        pin,
        role,
        stationNumber,
      });
      resetForm();
    } else {
      const res = onAddUser({
        name,
        pin,
        role,
        stationNumber,
        active: true,
      });

      if (!res.success) {
        setFormError(res.error || "Erro ao adicionar colaborador.");
      } else {
        resetForm();
      }
    }
  };

  const handleDelete = (id: string, userName: string) => {
    if (confirm(`Tem certeza que deseja remover ${userName} do sistema?`)) {
      const res = onDeleteUser(id);
      if (!res.success) {
        alert(res.error || "Não foi possível remover.");
      }
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
                Gestão da Equipe & Cadeiras
                <span className="text-xs px-2 py-0.5 rounded-full font-mono bg-purple-500/15 text-purple-300 border border-purple-500/30">
                  {users.length} / {MAX_USERS} Vagas
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Acesso restrito do CEO. Limite estrito de até 5 colaboradores.
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              resetForm();
              onClose();
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Indicador Visual de Slots de Membros */}
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
                        {assignedUser.role === "CEO" ? "👑" : "💈"} {assignedUser.name.split(" ")[0]}
                      </div>
                      <span className="text-[9px] text-amber-400/90 font-mono">
                        PIN: {assignedUser.pin}
                      </span>
                    </>
                  ) : (
                    <span className="text-[10px] italic text-slate-600 mt-1">
                      Disponível
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Formulário: Adicionar ou Editar Colaborador */}
        <form
          onSubmit={handleSubmit}
          className="p-4 rounded-xl bg-slate-900/70 border border-white/10 mb-4"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              {isEditing ? (
                <>
                  <Edit2 className="w-3.5 h-3.5 text-amber-400" />
                  Editando Colaborador: {name}
                </>
              ) : (
                <>
                  <UserPlus className="w-3.5 h-3.5 text-purple-400" />
                  Cadastrar Novo Colaborador
                </>
              )}
            </h3>

            {isEditing && (
              <button
                type="button"
                onClick={resetForm}
                className="text-xs text-slate-400 hover:text-white"
              >
                Cancelar Edição
              </button>
            )}
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
                placeholder="Ex: Matheus Cortes"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isFull && !isEditing}
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
                  disabled={isFull && !isEditing}
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
                disabled={isFull && !isEditing}
                className="w-full h-10 px-3 rounded-xl bg-slate-950 border border-white/10 text-sm text-white focus:outline-none focus:border-purple-400 disabled:opacity-50"
              >
                <option value="BARBEIRO">Barbeiro (Acesso Bancada & Agenda)</option>
                <option value="CEO">CEO / Administrador (Acesso Geral)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Cadeira / Estação
              </label>
              <select
                value={stationNumber}
                onChange={(e) => setStationNumber(Number(e.target.value))}
                disabled={isFull && !isEditing}
                className="w-full h-10 px-3 rounded-xl bg-slate-950 border border-white/10 text-sm text-white focus:outline-none focus:border-purple-400 disabled:opacity-50"
              >
                <option value={1}>Cadeira 1</option>
                <option value={2}>Cadeira 2</option>
                <option value={3}>Cadeira 3</option>
                <option value={4}>Cadeira 4</option>
                <option value={5}>Cadeira 5</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={isFull && !isEditing}
            className={`w-full mt-3 h-10 rounded-xl font-bold text-xs sm:text-sm text-white transition-all flex items-center justify-center gap-2 ${
              isFull && !isEditing
                ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-white/5"
                : isEditing
                ? "bg-amber-600 hover:bg-amber-500 shadow-glow"
                : "bg-purple-600 hover:bg-purple-500"
            }`}
          >
            {isEditing ? (
              <>
                <CheckCircle2 className="w-4 h-4" /> Salvar Alterações
              </>
            ) : isFull ? (
              <>
                <ShieldAlert className="w-4 h-4" /> Limite de 5 Membros Atingido
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4" /> Adicionar à Equipe
              </>
            )}
          </button>
        </form>

        {/* Lista de Colaboradores Atuais */}
        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Membros Cadastrados ({users.length}):
          </p>

          {users.map((u) => (
            <div
              key={u.id}
              className="p-3 rounded-xl bg-slate-950/70 border border-white/5 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-center font-bold text-amber-400 text-sm">
                  {u.role === "CEO" ? "👑" : "💈"}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">{u.name}</span>
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-bold uppercase ${
                        u.role === "CEO"
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                      }`}
                    >
                      {u.role}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Cadeira #{u.stationNumber || 1} •{" "}
                    <span className="text-slate-300 font-mono">PIN: {u.pin}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleStartEdit(u)}
                  title="Editar dados ou PIN"
                  className="p-2 rounded-lg bg-slate-900 text-slate-300 hover:text-amber-400 hover:bg-slate-800 transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                </button>

                {u.role !== "CEO" && (
                  <button
                    type="button"
                    onClick={() => handleDelete(u.id, u.name)}
                    title="Remover barbeiro"
                    className="p-2 rounded-lg bg-slate-900 text-slate-400 hover:text-rose-400 hover:bg-rose-950/20 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TeamManagementModal;
