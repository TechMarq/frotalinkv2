-- ==========================================
-- 13_COMPRAS_VALES.SQL
-- Estrutura para fechamento/faturamento consolidado de Vales no módulo de Compras
-- ==========================================

-- 1. Adicionar coluna parent_faturamento_id na tabela compras para vincular o vale à NF de Fechamento
ALTER TABLE public.compras ADD COLUMN IF NOT EXISTS parent_faturamento_id TEXT REFERENCES public.compras(id) ON DELETE SET NULL;

-- 2. Adicionar coluna consolidado_vales na tabela compras para identificar a nota que consolida os vales (evitar duplicidade de custos)
ALTER TABLE public.compras ADD COLUMN IF NOT EXISTS consolidado_vales BOOLEAN DEFAULT FALSE;

-- 3. Criar índices para otimizar buscas de vales e vínculos de faturamento
CREATE INDEX IF NOT EXISTS idx_compras_parent_faturamento ON public.compras(parent_faturamento_id);
CREATE INDEX IF NOT EXISTS idx_compras_consolidado_vales ON public.compras(consolidado_vales);
