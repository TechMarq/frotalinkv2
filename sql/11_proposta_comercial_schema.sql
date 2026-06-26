/* === 11_proposta_comercial_schema.sql === */
-- ============================================================
-- MÓDULO COMERCIAL: SISTEMA DE PROPOSTAS (FLUXO CORRETO)
-- CRIADO: 22/06/2026
-- Relacionado ao módulo: comercial (com_contratos)
-- ============================================================

-- 1. ADICIONA CAMPOS DE PROPOSTA EM COM_CONTRATOS SE NÃO EXISTIREM
ALTER TABLE public.com_contratos ADD COLUMN IF NOT EXISTS proposta_step INTEGER DEFAULT 0;
ALTER TABLE public.com_contratos ADD COLUMN IF NOT EXISTS objeto_proposta TEXT;
ALTER TABLE public.com_contratos ADD COLUMN IF NOT EXISTS data_proposta DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.com_contratos ADD COLUMN IF NOT EXISTS validade_dias INTEGER DEFAULT 30;
ALTER TABLE public.com_contratos ADD COLUMN IF NOT EXISTS data_validade DATE;
ALTER TABLE public.com_contratos ADD COLUMN IF NOT EXISTS periodo_medicao TEXT;
ALTER TABLE public.com_contratos ADD COLUMN IF NOT EXISTS forma_pagamento TEXT;
ALTER TABLE public.com_contratos ADD COLUMN IF NOT EXISTS endereco_proposta TEXT;
ALTER TABLE public.com_contratos ADD COLUMN IF NOT EXISTS cep_proposta TEXT;
ALTER TABLE public.com_contratos ADD COLUMN IF NOT EXISTS contato_proposta TEXT;
ALTER TABLE public.com_contratos ADD COLUMN IF NOT EXISTS assinatura_proposta TEXT;
ALTER TABLE public.com_contratos ADD COLUMN IF NOT EXISTS observacoes_proposta TEXT;

-- 2. INSERE OS NOVOS STATUS SE NÃO EXISTIREM
INSERT INTO public.com_status (nome) VALUES 
    ('PROPOSTA ABERTA'),
    ('EM ANÁLISE')
ON CONFLICT (nome) DO NOTHING;

-- 3. REMOVE A TABELA ANTIGA COM_PROPOSTAS SE ELA JÁ EXISTIR (evitando conflitos se o usuário migrar)
-- Primeiro, dropa tabelas dependentes
DROP TABLE IF EXISTS public.com_proposta_itens CASCADE;
DROP TABLE IF EXISTS public.com_proposta_historico CASCADE;
DROP TABLE IF EXISTS public.com_propostas CASCADE;

-- 4. CRIA A TABELA DE ITENS DA PROPOSTA VINCULADA AO CONTRATO
CREATE TABLE public.com_proposta_itens (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contrato_id  UUID NOT NULL REFERENCES public.com_contratos(id) ON DELETE CASCADE,
    ordem        INTEGER NOT NULL DEFAULT 1,
    descricao    TEXT NOT NULL DEFAULT '',
    unidade      TEXT DEFAULT '',
    quantidade   NUMERIC(15, 3) DEFAULT 0,
    preco_unit   NUMERIC(15, 2) DEFAULT 0,
    created_at   TIMESTAMPTZ DEFAULT now()
);

-- RLS para com_proposta_itens
ALTER TABLE public.com_proposta_itens ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "Acesso público com_proposta_itens"
        ON public.com_proposta_itens FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 5. CRIA A TABELA DE HISTÓRICO DA PROPOSTA VINCULADA AO CONTRATO
CREATE TABLE public.com_proposta_historico (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contrato_id  UUID NOT NULL REFERENCES public.com_contratos(id) ON DELETE CASCADE,
    step         INTEGER NOT NULL,
    label        TEXT NOT NULL,
    data         DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at   TIMESTAMPTZ DEFAULT now()
);

-- RLS para com_proposta_historico
ALTER TABLE public.com_proposta_historico ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "Acesso público com_proposta_historico"
        ON public.com_proposta_historico FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 6. ÍNDICES DE PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_com_proposta_itens_contrato_id
    ON public.com_proposta_itens(contrato_id);

CREATE INDEX IF NOT EXISTS idx_com_proposta_historico_contrato_id
    ON public.com_proposta_historico(contrato_id);
