"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Download, Share, PlusSquare, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

const DISMISS_STORAGE_KEY = "rocha_pwa_banner_dismissed_at";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export const PWAInstallBanner: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState<boolean>(false);
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const [isClosing, setIsClosing] = useState<boolean>(false);
  const [isInstalling, setIsInstalling] = useState<boolean>(false);

  const isDismissedWithin30Days = useCallback((): boolean => {
    if (typeof window === "undefined") return true;
    try {
      const raw = localStorage.getItem(DISMISS_STORAGE_KEY);
      if (!raw) return false;
      const dismissedAt = Number(raw);
      if (isNaN(dismissedAt)) return false;
      return Date.now() - dismissedAt < THIRTY_DAYS_MS;
    } catch {
      return false;
    }
  }, []);

  const hideBanner = useCallback((persistDismissal: boolean) => {
    setIsClosing(true);
    if (persistDismissal && typeof window !== "undefined") {
      try {
        localStorage.setItem(DISMISS_STORAGE_KEY, String(Date.now()));
      } catch {
        // Ignora erro de storage
      }
    }
    setTimeout(() => {
      setIsVisible(false);
      setIsClosing(false);
    }, 260);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof navigator === "undefined") {
      return;
    }

    // 1. Verifica se já está rodando em modo standalone (instalado)
    const isStandaloneMode =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone ===
        true;

    if (isStandaloneMode || isDismissedWithin30Days()) {
      return;
    }

    // 2. Detecção de iOS (iPhone / iPad / iPod)
    const ua = window.navigator.userAgent || "";
    const isAppleMobile =
      /iPad|iPhone|iPod/.test(ua) ||
      (window.navigator.platform === "MacIntel" &&
        window.navigator.maxTouchPoints > 1);

    if (isAppleMobile) {
      setIsIOS(true);
      setIsVisible(true);
    }

    // 3. Intercepta beforeinstallprompt no Android / Windows / Chrome
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      if (isDismissedWithin30Days()) return;
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsIOS(false);
      setIsVisible(true);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsVisible(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, [isDismissedWithin30Days]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    setIsInstalling(true);
    try {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === "accepted") {
        setDeferredPrompt(null);
        hideBanner(false);
      }
    } catch {
      // Ignora cancelamento do prompt
    } finally {
      setIsInstalling(false);
    }
  };

  if (!isVisible) return null;

  return (
    <div
      role="dialog"
      aria-label="Instalar aplicativo Barbearia Rocha"
      className={`fixed bottom-3 inset-x-3 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-full sm:max-w-md z-50 transition-all duration-300 ease-out ${
        isClosing
          ? "opacity-0 translate-y-4 pointer-events-none"
          : "opacity-100 translate-y-0 animate-fade-up"
      }`}
    >
      <div className="rounded-2xl bg-zinc-900/95 backdrop-blur-xl border border-white/15 p-4 shadow-2xl text-slate-100">
        <div className="flex items-start gap-3.5">
          {/* Miniatura do Ícone Oficial da Barbearia */}
          <img
            src="/icon.png"
            alt="Barbearia Rocha"
            className="w-12 h-12 rounded-xl object-cover border border-amber-500/30 flex-shrink-0 shadow-glow bg-black"
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-white leading-tight">
                  Instalar App Barbearia Rocha
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Acesse o caixa e a agenda direto da tela inicial em tela cheia.
                </p>
              </div>
              <button
                type="button"
                onClick={() => hideBanner(true)}
                aria-label="Fechar sugestão de instalação"
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Conteúdo específico para iOS vs Android/Chrome */}
            {isIOS ? (
              <div className="mt-3 p-2.5 rounded-xl bg-black/60 border border-white/10 text-xs text-zinc-200 space-y-1.5">
                <p className="font-semibold text-amber-400">
                  Para instalar no iPhone:
                </p>
                <p className="flex items-center gap-1.5 leading-snug">
                  <span className="font-bold text-white">1.</span>
                  <span>
                    Toque no botão de compartilhar (ícone da caixinha com a seta
                    para cima 📤 no Safari)
                  </span>
                  <Share className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 inline" />
                </p>
                <p className="flex items-center gap-1.5 leading-snug">
                  <span className="font-bold text-white">2.</span>
                  <span>
                    Desça a lista e selecione{" "}
                    <strong className="text-white">
                      &apos;Adicionar à Tela Inicial&apos;
                    </strong>{" "}
                    ➕
                  </span>
                  <PlusSquare className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 inline" />
                </p>
              </div>
            ) : null}

            {/* Botões de Ação */}
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => hideBanner(true)}
                className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition-colors"
              >
                Agora não
              </button>

              {!isIOS && deferredPrompt && (
                <button
                  type="button"
                  onClick={handleInstallClick}
                  disabled={isInstalling}
                  className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs font-bold flex items-center gap-1.5 shadow-md transition-all disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  {isInstalling ? "Instalando..." : "Instalar App"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PWAInstallBanner;
