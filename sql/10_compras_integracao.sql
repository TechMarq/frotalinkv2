-- =========================================================================
-- 10_COMPRAS_INTEGRACAO.SQL
-- Criação de vínculos para integração do módulo de Compras com Financeiro
-- =========================================================================

-- 1. Adicionar colunas de integração na tabela COMPRAS
ALTER TABLE public.compras ADD COLUMN IF NOT EXISTS integrado_financeiro BOOLEAN DEFAULT FALSE;
ALTER TABLE public.compras ADD COLUMN IF NOT EXISTS data_integracao TIMESTAMPTZ;

-- 2. Adicionar vínculo da compra na tabela FIN_LANCAMENTOS
ALTER TABLE public.fin_lancamentos ADD COLUMN IF NOT EXISTS compra_id TEXT REFERENCES public.compras(id);

-- 3. Criar índice para melhorar performance da aba de integração
CREATE INDEX IF NOT EXISTS idx_compras_integrado ON public.compras(integrado_financeiro);

-- Nota: Execute este script no SQL Editor do seu Supabase.
