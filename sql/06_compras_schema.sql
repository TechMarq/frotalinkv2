/* === 06_compras_schema.sql === */

/* --- File: compras.sql --- */
-- ==========================================
-- SCRIPT DE ESTRUTURA COMPLETA: MÓDULO DE COMPRAS V2
-- ÚLTIMA ATUALIZAÇÃO: 12/05/2026
-- ==========================================

-- 1. Centros de Custo
CREATE TABLE IF NOT EXISTS public.centros_custo (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    codigo TEXT NOT NULL UNIQUE,
    nome TEXT NOT NULL,
    parent_id UUID REFERENCES public.centros_custo(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Formas de Pagamento
CREATE TABLE IF NOT EXISTS public.formas_pagamento (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nome TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Espécies de Nota
CREATE TABLE IF NOT EXISTS public.especies_nota (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nome TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Compras (Notas/Despesas)
CREATE TABLE IF NOT EXISTS public.compras (
    id TEXT PRIMARY KEY, 
    data_emissao DATE NOT NULL DEFAULT CURRENT_DATE,
    numero_nota TEXT,
    especie_id UUID REFERENCES public.especies_nota(id),
    fornecedor_id UUID REFERENCES public.fornecedores(id),
    centro_custo_id UUID REFERENCES public.centros_custo(id),
    forma_pagamento_id UUID REFERENCES public.formas_pagamento(id),
    data_vencimento DATE,
    valor_total NUMERIC(12,2) NOT NULL DEFAULT 0,
    financeiro_parcelado BOOLEAN DEFAULT FALSE,
    qtd_parcelas INTEGER DEFAULT 1,
    observacoes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Itens da Compra
CREATE TABLE IF NOT EXISTS public.compra_itens (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    compra_id TEXT REFERENCES public.compras(id) ON DELETE CASCADE,
    tipo TEXT DEFAULT 'peca',
    produto TEXT NOT NULL,
    marca TEXT,
    quantidade NUMERIC(12,3) NOT NULL DEFAULT 1,
    valor_unitario NUMERIC(12,2) NOT NULL DEFAULT 0,
    estoque BOOLEAN DEFAULT FALSE,
    vinculo_veiculo_id UUID REFERENCES public.veiculos(id),
    vinculo_pessoa TEXT,
    produto_id UUID REFERENCES public.estoque(id),
    centro_custo_id UUID REFERENCES public.centros_custo(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Custos Adicionais
CREATE TABLE IF NOT EXISTS public.compra_adicionais (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    compra_id TEXT REFERENCES public.compras(id) ON DELETE CASCADE,
    descricao TEXT NOT NULL,
    valor NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Parcelas da Compra
CREATE TABLE IF NOT EXISTS public.compra_parcelas (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    compra_id TEXT REFERENCES public.compras(id) ON DELETE CASCADE,
    numero_parcela INTEGER,
    data_vencimento DATE NOT NULL,
    valor NUMERIC(12,2) NOT NULL,
    status TEXT DEFAULT 'PENDENTE',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ==========================================
-- SEÇÃO DE MIGRAÇÃO (PARA ATUALIZAR TABELAS EXISTENTES)
-- ==========================================

/* 
-- COPIE E COLE NO SQL EDITOR DO SUPABASE PARA ATUALIZAR:

-- 1. Atualizar Tabela Compras
ALTER TABLE public.compras ADD COLUMN IF NOT EXISTS data_vencimento DATE;
ALTER TABLE public.compras ADD COLUMN IF NOT EXISTS financeiro_parcelado BOOLEAN DEFAULT FALSE;
ALTER TABLE public.compras ADD COLUMN IF NOT EXISTS qtd_parcelas INTEGER DEFAULT 1;

-- 2. Atualizar Tabela Itens
ALTER TABLE public.compra_itens ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'peca';
ALTER TABLE public.compra_itens ADD COLUMN IF NOT EXISTS produto_id UUID REFERENCES public.estoque(id);
ALTER TABLE public.compra_itens ADD COLUMN IF NOT EXISTS centro_custo_id UUID REFERENCES public.centros_custo(id);
ALTER TABLE public.compra_itens ADD COLUMN IF NOT EXISTS maint_control BOOLEAN DEFAULT FALSE;
ALTER TABLE public.compra_itens ADD COLUMN IF NOT EXISTS maint_tipo_id UUID REFERENCES public.manutencao_tipos(id);
ALTER TABLE public.compra_itens ADD COLUMN IF NOT EXISTS maint_acao_id UUID REFERENCES public.manutencao_acoes(id);
ALTER TABLE public.compra_itens ADD COLUMN IF NOT EXISTS maint_km NUMERIC(12,2);
ALTER TABLE public.compra_itens ADD COLUMN IF NOT EXISTS maint_controle TEXT DEFAULT 'NENHUMA';
ALTER TABLE public.compra_itens ADD COLUMN IF NOT EXISTS maint_intervalo_km NUMERIC(12,2);
ALTER TABLE public.compra_itens ADD COLUMN IF NOT EXISTS maint_intervalo_meses INTEGER;
ALTER TABLE public.compra_itens ADD COLUMN IF NOT EXISTS maint_garantia BOOLEAN DEFAULT FALSE;
ALTER TABLE public.compra_itens ADD COLUMN IF NOT EXISTS maint_meses_garantia INTEGER;

-- 3. Atualizar Tabela Parcelas
ALTER TABLE public.compra_parcelas ADD COLUMN IF NOT EXISTS numero_parcela INTEGER;

-- 4. Desabilitar RLS para testes (opcional)
-- ALTER TABLE public.compras DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.compra_itens DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.compra_adicionais DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.compra_parcelas DISABLE ROW LEVEL SECURITY;
*/



