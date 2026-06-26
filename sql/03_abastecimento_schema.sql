/* === 03_abastecimento_schema.sql === */

/* --- File: abastecimento_schema.sql --- */
-- SQL Schema for Fueling Module (Abastecimento) - REFRESH
-- Copy and paste this into Supabase SQL Editor

-- 1. Table for Fuel Types
CREATE TABLE IF NOT EXISTS tipos_combustivel (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    descricao TEXT NOT NULL UNIQUE,
    unidade TEXT DEFAULT 'L',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Table for Post Categories
CREATE TABLE IF NOT EXISTS categorias_posto (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    descricao TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. Dedicated Table for Postos (Establishments)
CREATE TABLE IF NOT EXISTS postos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nome TEXT NOT NULL,
    cidade TEXT,
    estado TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 4. Table for Abastecimentos (Transactions)
CREATE TABLE IF NOT EXISTS abastecimentos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    data TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    veiculo_id UUID REFERENCES veiculos(id) ON DELETE CASCADE,
    motorista_id UUID REFERENCES motoristas(id) ON DELETE SET NULL,
    posto_id UUID REFERENCES postos(id) ON DELETE SET NULL,
    categoria_id UUID REFERENCES categorias_posto(id) ON DELETE SET NULL,
    tipo_combustivel TEXT,
    km_atual NUMERIC(12,2) NOT NULL,
    litros NUMERIC(12,3) NOT NULL,
    valor_total NUMERIC(12,2) NOT NULL,
    valor_unitario NUMERIC(12,3) GENERATED ALWAYS AS (CASE WHEN litros > 0 THEN valor_total / litros ELSE 0 END) STORED,
    observacoes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Insert Default Categories
INSERT INTO categorias_posto (descricao)
VALUES ('EXTERNO'), ('INTERNO'), ('CONVENIADO')
ON CONFLICT (descricao) DO NOTHING;

-- Insert Default Fuel Types
INSERT INTO tipos_combustivel (descricao, unidade)
VALUES 
    ('Diesel S10', 'L'),
    ('Diesel S500', 'L'),
    ('Gasolina Comum', 'L'),
    ('Gasolina Aditivada', 'L'),
    ('Etanol', 'L'),
    ('GNV', 'm³'),
    ('Arla 32', 'L')
ON CONFLICT (descricao) DO NOTHING;

-- Enable RLS
ALTER TABLE tipos_combustivel ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias_posto ENABLE ROW LEVEL SECURITY;
ALTER TABLE postos ENABLE ROW LEVEL SECURITY;
ALTER TABLE abastecimentos ENABLE ROW LEVEL SECURITY;

-- Recreate policies (Public Access for Testing - CHANGE TO auth.role() = 'authenticated' in production)
DROP POLICY IF EXISTS "Public access tipos_combustivel" ON tipos_combustivel;
CREATE POLICY "Public access tipos_combustivel" ON tipos_combustivel FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access categorias_posto" ON categorias_posto;
CREATE POLICY "Public access categorias_posto" ON categorias_posto FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access postos" ON postos;
CREATE POLICY "Public access postos" ON postos FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access abastecimentos" ON abastecimentos;
CREATE POLICY "Public access abastecimentos" ON abastecimentos FOR ALL USING (true) WITH CHECK (true);


/* --- File: importacoes.sql --- */
-- Criar tabela de controle de importações
CREATE TABLE IF NOT EXISTS importacoes_abastecimento (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    display_id TEXT UNIQUE NOT NULL,
    data_importacao TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    total_registros INTEGER DEFAULT 0,
    total_valor DECIMAL(12,2) DEFAULT 0.00,
    nome_arquivo TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Adicionar coluna de vínculo na tabela de abastecimentos
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'abastecimentos' AND COLUMN_NAME = 'importacao_id') THEN
        ALTER TABLE abastecimentos ADD COLUMN importacao_id UUID REFERENCES importacoes_abastecimento(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Habilitar RLS
ALTER TABLE importacoes_abastecimento ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso (Simplificadas para o contexto)
CREATE POLICY "Permitir leitura para todos os autenticados" ON importacoes_abastecimento
    FOR SELECT USING (true);

CREATE POLICY "Permitir inserção para todos os autenticados" ON importacoes_abastecimento
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Permitir deleção para todos os autenticados" ON importacoes_abastecimento
    FOR DELETE USING (true);



