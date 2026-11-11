"use client";

import React, { useState } from "react";
import { User } from "@/types";
import { INITIAL_USERS } from "@/data/mock-data";
import { PinLogin } from "@/components/auth/pin-login";
import { DashboardCaixa } from "@/components/dashboard/dashboard-caixa";

export default function Home() {
  const [users, setUsers] = useState<User[]>(INITIAL_USERS);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  if (!currentUser) {
    return (
      <PinLogin
        availableUsers={users}
        onLoginSuccess={(user) => setCurrentUser(user)}
      />
    );
  }

  return (
    <DashboardCaixa
      currentUser={currentUser}
      users={users}
      onUpdateUsers={setUsers}
      onLogout={() => setCurrentUser(null)}
    />
  );
}
