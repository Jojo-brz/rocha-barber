# 💈 Barbearia Rocha - Sistema de Bancada & Gestão Interna

Sistema web interno de alta performance desenvolvido com **Next.js 14+ (App Router)** e **Tailwind CSS** no Frontend e **Golang** no Backend.

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
   - Tela de Keypad estilo cofre para login instantâneo na bancada.
   - Suporte a toque e teclado físico numérico.
2. **CEO / Administrador:**
   - Acesso irrestrito a todos os dados financeiros e saldo consolidado.
   - Visão de todas as cadeiras e extrato geral.
   - **Painel de Gestão de Equipe com trava estrita de até 5 colaboradores no total**.
3. **Barbeiro:**
   - Acesso simplificado via PIN pessoal.
   - Foco na sua própria bancada: visualização de sua agenda, chamadas de clientes (`Em Espera` ➔ `Na Cadeira` ➔ `Concluído`) e lançamento rápido de serviços/produtos.
   - Canal de solicitação de insumos (lâminas, pomadas, toalhas).

---

## 📂 Arquitetura do Repositório

```
barbearia-rocha/
├── src/                                  # Frontend Next.js (App Router)
│   ├── app/
│   │   ├── globals.css                   # Reset e variáveis do Dark Mode
│   │   ├── layout.tsx                    # Viewport otimizado para celular/tablet
│   │   └── page.tsx                      # Estado raiz: PIN Keypad <-> Dashboard
│   ├── components/
│   │   ├── auth/
│   │   │   └── pin-login.tsx             # Keypad numérico com haptic visual
│   │   └── dashboard/
│   │       ├── dashboard-caixa.tsx       # Dashboard consolidado (Caixa, Agenda, Insumos)
│   │       └── team-management-modal.tsx # Gestão da Equipe (CEO: Trava estrita de 5)
│   ├── data/
│   │   └── mock-data.ts                  # Mock inicial com 4/5 vagas ocupadas
│   └── types/
│       └── index.ts                      # Tipagens completas do domínio
├── backend/                              # API Backend em Golang
│   ├── cmd/
│   │   └── api/
│   │       └── main.go                   # Ponto de entrada do servidor HTTP (:8080)
│   ├── internal/
│   │   ├── domain/
│   │   │   └── models.go                 # Modelos de dados e erros de negócio
│   │   ├── repository/
│   │   │   └── memory_repo.go            # Repositório com trava de 5 membros e concorrência
│   │   ├── middleware/
│   │   │   └── cors.go                   # CORS e Logger
│   │   └── handler/
│   │       ├── auth_handler.go           # Login por PIN (POST /api/v1/auth/pin)
│   │       ├── caixa_handler.go          # Fluxo de Caixa (GET/POST /api/v1/caixa/...)
│   │       ├── team_handler.go           # Gestão de Equipe (GET/POST/PUT/DELETE /api/v1/team/...)
│   │       └── agenda_handler.go         # Agenda e Insumos (/api/v1/agenda, /api/v1/materiais)
│   └── go.mod
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## 🚀 Como Executar

### 1. Frontend (Next.js)
```bash
# Na raiz do projeto:
npm install
npm run dev
# Acesse: http://localhost:3000
```

### 2. Backend (Golang)
```bash
cd backend
go run cmd/api/main.go
# Servidor rodará em http://localhost:8080
```
