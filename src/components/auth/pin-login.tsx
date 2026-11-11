"use client";

import React, { useState, useEffect, useCallback } from "react";
import { User } from "@/types";
import { INITIAL_USERS } from "@/data/mock-data";
import { Delete, ShieldCheck, Sparkles, AlertCircle, Scissors } from "lucide-react";

interface PinLoginProps {
  onLoginSuccess: (user: User) => void;
  availableUsers?: User[];
}

export const PinLogin: React.FC<PinLoginProps> = ({
  onLoginSuccess,
  availableUsers = INITIAL_USERS,
}) => {
  const [pin, setPin] = useState<string>("");
  const [isError, setIsError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleDigit = useCallback(
    (digit: string) => {
      if (pin.length < 4 && !isSubmitting) {
        setIsError(false);
        setErrorMessage("");
        setPin((prev) => prev + digit);
      }
    },
    [pin, isSubmitting]
  );

  const handleBackspace = useCallback(() => {
    if (!isSubmitting) {
      setIsError(false);
      setErrorMessage("");
      setPin((prev) => prev.slice(0, -1));
    }
  }, [isSubmitting]);

  const handleClear = useCallback(() => {
    if (!isSubmitting) {
      setIsError(false);
      setErrorMessage("");
      setPin("");
    }
  }, [isSubmitting]);

  // Validação do PIN quando atingir 4 dígitos
  useEffect(() => {
    if (pin.length === 4) {
      setIsSubmitting(true);
      const timer = setTimeout(() => {
        const matchedUser = availableUsers.find(
          (u) => u.pin === pin && u.active
        );

        if (matchedUser) {
          onLoginSuccess(matchedUser);
        } else {
          setIsError(true);
          setErrorMessage("PIN não reconhecido. Tente novamente.");
          setPin("");
          setIsSubmitting(false);
        }
      }, 250);

      return () => clearTimeout(timer);
    }
  }, [pin, availableUsers, onLoginSuccess]);

  // Suporte a teclado físico
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) {
        handleDigit(e.key);
      } else if (e.key === "Backspace") {
        handleBackspace();
      } else if (e.key === "Escape") {
        handleClear();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleDigit, handleBackspace, handleClear]);

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-between p-4 sm:p-6 bg-[#07090e] text-slate-100 overflow-hidden select-none">
      {/* Background Glows sutis */}
      <div className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 left-1/2 -translate-x-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />

      {/* Header com Branding Rocha */}
      <header className="w-full max-w-sm pt-6 flex flex-col items-center text-center z-10">
        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400/20 to-amber-600/10 border border-amber-500/30 text-amber-400 shadow-glow mb-4">
          <Scissors className="w-7 h-7 transform -rotate-45" />
        </div>
        <h1 className="text-2xl font-bold tracking-wider uppercase text-white font-serif">
          Barbearia Rocha
        </h1>
        <p className="text-xs uppercase tracking-widest text-slate-400 mt-1 font-medium">
          Sistema de Bancada & Gestão
        </p>
      </header>

      {/* Centro: Display do PIN e Slots */}
      <div className="w-full max-w-sm flex flex-col items-center my-auto z-10">
        <div className="mb-3 text-center">
          <p className="text-sm font-medium text-slate-300">
            Digite seu PIN de 4 dígitos
          </p>
          <span className="text-xs text-slate-500">
            Acesso rápido individual para bancada
          </span>
        </div>

        {/* Indicadores de Dígitos (Slots) */}
        <div
          className={`flex items-center justify-center gap-4 py-4 px-6 rounded-2xl bg-slate-900/40 border transition-all duration-300 ${
            isError
              ? "border-rose-500/60 shadow-[0_0_20px_-3px_rgba(244,63,94,0.4)] animate-shake"
              : pin.length === 4
              ? "border-emerald-500/50 shadow-emerald-glow"
              : "border-white/10"
          }`}
        >
          {[0, 1, 2, 3].map((index) => {
            const isFilled = index < pin.length;
            return (
              <div
                key={index}
                className={`w-4 h-4 rounded-full transition-all duration-200 ${
                  isFilled
                    ? "bg-amber-400 scale-125 shadow-[0_0_12px_rgba(245,158,11,0.8)]"
                    : "border-2 border-slate-600 bg-transparent"
                }`}
              />
            );
          })}
        </div>

        {/* Mensagem de Erro / Status */}
        <div className="h-6 mt-3 flex items-center justify-center">
          {isError ? (
            <p className="text-xs text-rose-400 font-medium flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              {errorMessage}
            </p>
          ) : isSubmitting ? (
            <p className="text-xs text-amber-300 font-medium flex items-center gap-1.5 animate-pulse">
              <Sparkles className="w-3.5 h-3.5" />
              Validando credencial...
            </p>
          ) : (
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
              Terminal protegido e criptografado
            </p>
          )}
        </div>

        {/* Teclado Numérico Mobile-First */}
        <div className="grid grid-cols-3 gap-3.5 mt-4 w-full max-w-[280px]">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
            <button
              key={num}
              type="button"
              onClick={() => handleDigit(num)}
              disabled={isSubmitting}
              className="h-16 rounded-2xl bg-slate-900/70 border border-white/10 text-2xl font-semibold text-slate-100 hover:bg-slate-800/80 hover:border-white/20 active:scale-95 active:bg-amber-500/20 transition-all flex items-center justify-center shadow-sm disabled:opacity-50"
            >
              {num}
            </button>
          ))}

          {/* Botão Limpar */}
          <button
            type="button"
            onClick={handleClear}
            disabled={isSubmitting || pin.length === 0}
            className="h-16 rounded-2xl bg-slate-900/30 border border-white/5 text-sm font-bold text-slate-400 hover:text-rose-400 hover:bg-rose-950/20 active:scale-95 transition-all flex items-center justify-center disabled:opacity-30"
          >
            LIMPAR
          </button>

          {/* Dígito Zero */}
          <button
            type="button"
            onClick={() => handleDigit("0")}
            disabled={isSubmitting}
            className="h-16 rounded-2xl bg-slate-900/70 border border-white/10 text-2xl font-semibold text-slate-100 hover:bg-slate-800/80 hover:border-white/20 active:scale-95 active:bg-amber-500/20 transition-all flex items-center justify-center shadow-sm disabled:opacity-50"
          >
            0
          </button>

          {/* Botão Backspace */}
          <button
            type="button"
            onClick={handleBackspace}
            disabled={isSubmitting || pin.length === 0}
            className="h-16 rounded-2xl bg-slate-900/30 border border-white/5 text-slate-300 hover:text-white hover:bg-slate-800/40 active:scale-95 transition-all flex items-center justify-center disabled:opacity-30"
            aria-label="Apagar último dígito"
          >
            <Delete className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Rodapé: Atalhos rápidos de demonstração (Ideal para testes e homologação rápida) */}
      <footer className="w-full max-w-md pt-4 pb-2 z-10 border-t border-white/5">
        <p className="text-[11px] text-center text-slate-500 uppercase tracking-wider mb-2 font-semibold">
          Colaboradores Cadastrados (Atalho de Teste):
        </p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {availableUsers.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => {
                setPin(u.pin);
              }}
              className="px-2.5 py-1.5 rounded-xl bg-slate-900/60 border border-white/10 text-slate-300 hover:border-amber-400/40 hover:text-amber-300 flex items-center justify-between text-left transition-colors"
            >
              <span className="truncate">
                {u.role === "CEO" ? "👑" : "💈"} {u.name}
              </span>
              <span className="font-mono text-slate-400 bg-white/5 px-1.5 py-0.5 rounded text-[10px]">
                PIN: {u.pin}
              </span>
            </button>
          ))}
        </div>
      </footer>
    </div>
  );
};

export default PinLogin;
