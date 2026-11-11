"use client";

import React, { useState, useEffect } from "react";
import { User } from "@/types";
import { PinLogin } from "@/components/auth/pin-login";
import { DashboardCaixa } from "@/components/dashboard/dashboard-caixa";

const SESSION_KEY = "barbearia_rocha_user";

export default function Home() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);

  // Restaura sessão ativa no tablet/celular da bancada ao recarregar a página
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(SESSION_KEY);
      if (stored) {
        setCurrentUser(JSON.parse(stored));
      }
    } catch {
      // Ignora erro de storage
    } finally {
      setIsInitializing(false);
    }
  }, []);

  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
    } catch {
      // Ignora erro de storage
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    try {
      sessionStorage.removeItem(SESSION_KEY);
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
