"use client";

import React, { useState, useEffect, useCallback } from "react";
import { User } from "@/types";
import { clearSessionAuth } from "@/services/api";
import { PinLogin } from "@/components/auth/pin-login";
import { DashboardCaixa } from "@/components/dashboard/dashboard-caixa";

const SESSION_KEY = "barbearia_rocha_user";

export default function Home() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);

  const handleLogout = useCallback(() => {
    setCurrentUser(null);
    clearSessionAuth();
  }, []);

  // Restaura sessão ativa com token válido e escuta expiração/401 da API
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(SESSION_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as User;
        if (parsed?.token && parsed.token.includes(".")) {
          setCurrentUser(parsed);
        } else {
          clearSessionAuth();
        }
      }
    } catch {
      clearSessionAuth();
    } finally {
      setIsInitializing(false);
    }

    const onUnauthorized = () => handleLogout();
    window.addEventListener("rocha:unauthorized", onUnauthorized);
    return () => window.removeEventListener("rocha:unauthorized", onUnauthorized);
  }, [handleLogout]);

  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
    } catch {
      // Ignora erro de storage
    }
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#07090e] text-amber-400">
        <div className="w-8 h-8 rounded-full border-2 border-amber-400/20 border-t-amber-400 animate-spin" />
      </div>
    );
  }

  if (!currentUser) {
    return <PinLogin onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <DashboardCaixa
      currentUser={currentUser}
      onLogout={handleLogout}
    />
  );
}
