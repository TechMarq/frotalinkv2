/* === 04_manutencao_schema.sql === */

/* --- File: manutencao_schema.sql --- */
-- Tabela de Manutenções
CREATE TABLE IF NOT EXISTS manutencoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    veiculo_id UUID REFERENCES veiculos(id),
    data DATE NOT NULL DEFAULT CURRENT_DATE,
    km_atual NUMERIC(15,2),
    tipo_manutencao TEXT NOT NULL CHECK (tipo_manutencao IN ('PREVENTIVA', 'CORRETIVA', 'PREDITIVA')),
    acao_id UUID REFERENCES manutencao_acoes(id),
    oficina_id UUID REFERENCES fornecedores(id),
    descricao_servico TEXT,
    valor_pecas NUMERIC(15,2) DEFAULT 0,
    valor_servicos NUMERIC(15,2) DEFAULT 0,
    valor_total NUMERIC(15,2) GENERATED ALWAYS AS (valor_pecas + valor_servicos) STORED,
    -- Planejamento de Próxima Troca
    controle_proxima_troca TEXT DEFAULT 'NENHUMA' CHECK (controle_proxima_troca IN ('KM', 'DATA', 'NENHUMA')),
    intervalo_km NUMERIC(15,2),
    intervalo_meses INTEGER,
    proxima_troca_km NUMERIC(15,2),
    proxima_troca_data DATE,
    -- Controle de Garantia
    possui_garantia BOOLEAN DEFAULT FALSE,
    meses_garantia INTEGER,
    vencimento_garantia DATE,
    status TEXT DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'CONCLUIDO')),
    observacoes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE manutencoes ENABLE ROW LEVEL SECURITY;

-- Política de acesso total (ajuste conforme necessário para produção)
CREATE POLICY "Acesso total manutencoes" ON manutencoes FOR ALL USING (true);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_manutencoes_veiculo ON manutencoes(veiculo_id);
CREATE INDEX IF NOT EXISTS idx_manutencoes_data ON manutencoes(data);

-- Tabela de Ações de Manutenção
CREATE TABLE IF NOT EXISTS manutencao_acoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    descricao TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inserir valores padrão
INSERT INTO manutencao_acoes (descricao) VALUES ('TROCA'), ('SUBSTITUIÇÃO'), ('SERVICO') ON CONFLICT DO NOTHING;

-- Habilitar RLS
ALTER TABLE manutencao_acoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total acoes" ON manutencao_acoes FOR ALL USING (true);

-- Tabela de Tipos de Manutenção (Preventiva, Corretiva, etc)
CREATE TABLE IF NOT EXISTS manutencao_tipos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    descricao TEXT NOT NULL UNIQUE,
    cor_badge TEXT DEFAULT '#6366f1', -- Cor para o badge na tabela
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inserir valores padrão
INSERT INTO manutencao_tipos (descricao, cor_badge) VALUES 
('PREVENTIVA', '#10b981'), 
('CORRETIVA', '#ef4444'), 
('PREDITIVA', '#f59e0b') 
ON CONFLICT DO NOTHING;

-- Habilitar RLS
ALTER TABLE manutencao_tipos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total tipos" ON manutencao_tipos FOR ALL USING (true);

-- Atualizar tabela de Manutenções para usar o ID do tipo (opcional, mas recomendado)
ALTER TABLE manutencoes ADD COLUMN IF NOT EXISTS tipo_id UUID REFERENCES manutencao_tipos(id);

-- Tabela de Itens da Manutenção (Detalhamento)
CREATE TABLE IF NOT EXISTS manutencao_itens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    manutencao_id UUID REFERENCES manutencoes(id) ON DELETE CASCADE,
    descricao TEXT,
    acao_id UUID REFERENCES manutencao_acoes(id),
    valor_pecas NUMERIC(15,2) DEFAULT 0,
    valor_servicos NUMERIC(15,2) DEFAULT 0,
    valor_total NUMERIC(15,2) GENERATED ALWAYS AS (valor_pecas + valor_servicos) STORED,
    controle_proxima_troca TEXT DEFAULT 'NENHUMA' CHECK (controle_proxima_troca IN ('KM', 'DATA', 'NENHUMA')),
    intervalo_km NUMERIC(15,2),
    intervalo_meses INTEGER,
    proxima_troca_km NUMERIC(15,2),
    proxima_troca_data DATE,
    possui_garantia BOOLEAN DEFAULT FALSE,
    meses_garantia INTEGER,
    vencimento_garantia DATE,
    origem_garantia TEXT,
    origem_garantia_fornecedor_id UUID REFERENCES fornecedores(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS para itens
ALTER TABLE manutencao_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total itens" ON manutencao_itens FOR ALL USING (true);



