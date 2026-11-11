package database

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type DB struct {
	Pool *pgxpool.Pool
}

// Conectar inicializa o pool de conexões com o PostgreSQL do Neon
func Conectar(databaseURL string) (*DB, error) {
	if databaseURL == "" {
		return nil, fmt.Errorf("a variável de ambiente DATABASE_URL não foi informada")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Configuração do pool de conexões otimizada para Serverless (Neon)
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("erro ao analisar DATABASE_URL: %w", err)
	}

	config.MaxConns = 20
	config.MinConns = 2
	config.MaxConnLifetime = 45 * time.Minute
	config.MaxConnIdleTime = 15 * time.Minute
	config.HealthCheckPeriod = 1 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("falha ao criar pool de conexões pgx: %w", err)
	}

	// Testa o ping no banco de dados Neon
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("não foi possível estabelecer conexão com o Neon PostgreSQL: %w", err)
	}

	log.Println("✅ [Database] Conexão com o Neon PostgreSQL estabelecida com sucesso!")

	db := &DB{Pool: pool}

	// Garante que as tabelas existem conforme o schema do usuário
	if err := db.verificarSchema(ctx); err != nil {
		return nil, fmt.Errorf("falha ao verificar schema do banco: %w", err)
	}

	return db, nil
}

// verificarSchema garante que as tabelas criadas no console do Neon estão acessíveis
func (db *DB) verificarSchema(ctx context.Context) error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS usuarios (
			id SERIAL PRIMARY KEY,
			nome VARCHAR(100) NOT NULL,
			pin VARCHAR(10) NOT NULL UNIQUE,
			papel VARCHAR(20) NOT NULL CHECK (papel IN ('admin', 'barbeiro')),
			criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		);`,

		`CREATE TABLE IF NOT EXISTS agendamentos (
			id SERIAL PRIMARY KEY,
			barbeiro_id INT REFERENCES usuarios(id) ON DELETE CASCADE,
			cliente_nome VARCHAR(100) NOT NULL,
			servico VARCHAR(100) NOT NULL,
			data_hora TIMESTAMP NOT NULL,
			status VARCHAR(20) DEFAULT 'agendado' CHECK (status IN ('agendado', 'concluido', 'cancelado')),
			criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		);`,

		`CREATE TABLE IF NOT EXISTS movimentacoes_caixa (
			id SERIAL PRIMARY KEY,
			barbeiro_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
			tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('entrada', 'saida')),
			descricao VARCHAR(255) NOT NULL,
			valor NUMERIC(10, 2) NOT NULL,
			forma_pagamento VARCHAR(30) CHECK (forma_pagamento IN ('pix', 'dinheiro', 'cartao_credito', 'cartao_debito')),
			criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		);`,

		`CREATE TABLE IF NOT EXISTS pedidos_materiais (
			id SERIAL PRIMARY KEY,
			solicitante_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
			item VARCHAR(150) NOT NULL,
			quantidade INT NOT NULL,
			urgencia VARCHAR(20) DEFAULT 'media' CHECK (urgencia IN ('baixa', 'media', 'alta')),
			status VARCHAR(20) DEFAULT 'pendente' CHECK (status IN ('pendente', 'comprado')),
			criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		);`,
	}

	for _, q := range queries {
		if _, err := db.Pool.Exec(ctx, q); err != nil {
			return fmt.Errorf("erro verificando schema: %w", err)
		}
	}

	// Garante que o CEO inicial do usuário existe
	seedQuery := `
		INSERT INTO usuarios (nome, pin, papel) 
		VALUES ('Lucas Rocha (CEO)', '0000', 'admin')
		ON CONFLICT (pin) DO NOTHING;
	`
	_, _ = db.Pool.Exec(ctx, seedQuery)

	log.Println("✅ [Database] Schema do Neon verificado e sincronizado!")
	return nil
}

// Fechar encerra o pool de conexões
func (db *DB) Fechar() {
	if db.Pool != nil {
		db.Pool.Close()
	}
}
