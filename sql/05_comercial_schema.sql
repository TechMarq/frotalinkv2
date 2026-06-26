/* === 05_comercial_schema.sql === */

/* --- File: comercial_schema.sql --- */
-- ============================================================
-- MÓDULO COMERCIAL: FrotaLink
-- Os Contratos armazenam diretamente os dados dos clientes
-- ============================================================

-- 1. Tabelas de Configuração
CREATE TABLE IF NOT EXISTS com_tabelas_preco (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS com_tipos_demanda (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS com_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. CONTRATOS (Contém dados do cliente diretamente)
CREATE TABLE IF NOT EXISTS com_contratos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_nome TEXT NOT NULL,
    cliente_cnpj_cpf TEXT,
    cliente_email TEXT,
    cliente_telefone TEXT,
    descricao_contrato TEXT,
    versao_contrato TEXT,
    data_assinatura DATE,
    prazo_meses INTEGER,
    data_vencimento DATE,
    tabela_preco_id UUID REFERENCES com_tabelas_preco(id),
    observacao TEXT,
    vigencia TEXT,
    tipo_demanda_id UUID REFERENCES com_tipos_demanda(id),
    referencia TEXT,
    nome_responsavel TEXT,
    contato_responsavel TEXT,
    status_id UUID REFERENCES com_status(id),
    valor_contrato NUMERIC(15,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trigger para updated_at em com_contratos
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_com_contratos_modtime ON com_contratos;
CREATE TRIGGER update_com_contratos_modtime
    BEFORE UPDATE ON com_contratos
    FOR EACH ROW
    EXECUTE PROCEDURE update_modified_column();

-- RLS para com_contratos
ALTER TABLE public.com_contratos ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "Acesso público com_contratos" ON public.com_contratos FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- RLS para tabelas de apoio
ALTER TABLE public.com_tabelas_preco ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "Acesso público com_tabelas_preco" ON public.com_tabelas_preco FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

ALTER TABLE public.com_tipos_demanda ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "Acesso público com_tipos_demanda" ON public.com_tipos_demanda FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

ALTER TABLE public.com_status ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "Acesso público com_status" ON public.com_status FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 3. Dados Iniciais
INSERT INTO com_status (nome) VALUES
    ('ATIVO'), ('VENCIDO'), ('REVISÃO'), ('CANCELADO')
ON CONFLICT DO NOTHING;

INSERT INTO com_tipos_demanda (nome) VALUES
    ('SPOT'), ('RECORRENTE'), ('EMERGÊNCIAL')
ON CONFLICT DO NOTHING;

INSERT INTO com_tabelas_preco (nome) VALUES
    ('TABELA PADRÃO 2024'), ('TABELA VIP')
ON CONFLICT DO NOTHING;



