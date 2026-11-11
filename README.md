# 💈 Barbearia Rocha - Sistema de Bancada & Gestão Interna

Sistema web interno full-stack desenvolvido com **Next.js 14+ (App Router)** e **Tailwind CSS** no Frontend e **Golang (Chi + pgx/v5)** no Backend conectado ao **PostgreSQL do Neon**.

---

## 🎨 Design System & UI/UX (Dark Luxury)
- **Tema:** Dark Mode Imersivo (`#07090e` / `#0b0f19`) com efeitos de vidro translúcido (`backdrop-blur-md`, `border-white/10`).
- **Cores de Destaque:**
  - 🟢 **Verde Esmeralda (`#10b981`)**: Entradas de caixa, saldo líquido positivo e ações de sucesso.
  - 🟡 **Dourado / Âmbar Nobre (`#f59e0b` / `#d4af37`)**: Identidade visual da barbearia, destaque do CEO e botões de destaque.
  - 🟣 **Roxo / Púrpura Real (`#a855f7`)**: Gestão de equipe e controle de cadeiras.
  - 🔴 **Carmim / Rose (`#f43f5e`)**: Saídas de caixa, despesas e urgências críticas.
- **Ergonomia de Bancada:** Mobile-first, teclas de toque grandes (mínimo 48px), haptic visual e ausência de atrito no dia a dia.

---

## 👥 Perfis de Acesso & Regras de Negócio
1. **Autenticação Rápida por PIN de 4 dígitos:**
   - Tela de Keypad estilo cofre (`POST /api/auth/pin`) para login instantâneo na bancada.
   - Suporte a toque e teclado físico numérico com sessão persistente (`sessionStorage`).
2. **CEO / Administrador:**
   - Acesso irrestrito ao faturamento diário consolidado (`GET /api/caixa`).
   - Visão de todas as cadeiras e extrato geral em tempo real.
   - **Painel de Gestão de Equipe com trava estrita de até 5 colaboradores no total (`POST /api/admin/usuarios`)**.
3. **Barbeiro:**
   - Acesso simplificado via PIN pessoal.
   - Foco na sua própria bancada: visualização de sua agenda (`GET /api/agendamentos?barbeiro_id=X`), chamadas de clientes e lançamento rápido de serviços/produtos (`POST /api/caixa`).
   - Canal de solicitação de insumos (lâminas, pomadas, toalhas).

---

## 📂 Arquitetura do Repositório

```
barbearia-rocha/
├── src/                                  # Frontend Next.js (App Router)
│   ├── app/
│   │   ├── globals.css                   # Reset e variáveis do Dark Mode
│   │   ├── layout.tsx                    # Viewport otimizado para celular/tablet
│   │   └── page.tsx                      # Estado raiz e restauração de sessão
│   ├── components/
│   │   ├── auth/
│   │   │   └── pin-login.tsx             # Keypad conectado ao endpoint /api/auth/pin
│   │   └── dashboard/
│   │       ├── dashboard-caixa.tsx       # Dashboard com dados reais de Caixa e Agenda
│   │       └── team-management-modal.tsx # Gestão da Equipe (CEO: Trava estrita de 5 no Neon)
│   ├── services/
│   │   └── api.ts                        # Camada de comunicação com a API Golang
│   └── types/
│       └── index.ts                      # Tipagens completas do domínio
├── backend/                              # API Backend em Golang
│   ├── cmd/
│   │   └── api/
│   │       └── main.go                   # Servidor HTTP (:8080) com Chi, CORS e logs
│   ├── internal/
│   │   ├── database/
│   │   │   └── db.go                     # Pool pgx, migrações DDL e seed inicial no Neon
│   │   ├── domain/
│   │   │   └── models.go                 # Modelos de dados e DTOs
│   │   └── handler/
│   │       ├── auth_handler.go           # POST /api/auth/pin
│   │       ├── caixa_handler.go          # GET & POST /api/caixa
│   │       ├── agendamento_handler.go    # GET & POST /api/agendamentos
│   │       └── admin_handler.go          # GET & POST /api/admin/usuarios
│   ├── .env.example
│   └── go.mod
├── .env.local                            # NEXT_PUBLIC_API_URL=http://localhost:8080
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## 🚀 Como Executar o Sistema Completo

### 1. Iniciar o Backend (Golang + Neon PostgreSQL)
- **Produção (Fly.io):** A API já está hospedada e rodando ao vivo em `https://backend-snowy-tide-7292.fly.dev`
- **Desenvolvimento Local:**
```bash
cd backend
# Defina o DATABASE_URL no .env
go run cmd/api/main.go
# O servidor rodará em http://localhost:8080
```

### 2. Iniciar o Frontend (Next.js)
```bash
# Na raiz do projeto:
npm install
npm run dev
# Acesse no navegador ou no celular da bancada: http://localhost:3000
```
