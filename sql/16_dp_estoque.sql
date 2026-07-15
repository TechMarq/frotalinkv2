/* === 16_dp_estoque.sql === */
/* Módulo: Departamento Pessoal — Controle de Estoque de EPIs e Uniformes */

-- ============================================================
-- 1. CATÁLOGO / ITENS DE ESTOQUE (EPI e Uniformes)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dp_estoque_itens (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id          UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
    tipo                TEXT NOT NULL CHECK (tipo IN ('EPI', 'UNIFORME')),
    nome                TEXT NOT NULL,
    tamanho             TEXT,                          -- Para uniformes (P, M, G, GG, 38, 40, etc.)
    ca_numero           TEXT,                          -- Para EPIs (Certificado de Aprovação)
    ca_vencimento       DATE,                          -- Vencimento do CA
    fabricante          TEXT,
    quantidade_atual    INTEGER DEFAULT 0,
    quantidade_minima   INTEGER DEFAULT 0,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 2. HISTÓRICO DE MOVIMENTAÇÕES DE ESTOQUE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dp_estoque_movimentacoes (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id          UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
    item_id             UUID REFERENCES public.dp_estoque_itens(id) ON DELETE CASCADE,
    tipo                TEXT NOT NULL CHECK (tipo IN ('ENTRADA', 'SAIDA', 'ESTORNO')),
    quantidade          INTEGER NOT NULL,
    data                TIMESTAMPTZ DEFAULT now(),
    motivo              TEXT,                          -- Compra, Ajuste, Descarte, Entrega de EPI, etc.
    funcionario_id      UUID REFERENCES public.dp_funcionarios(id) ON DELETE SET NULL, -- Se associado a uma entrega
    responsavel         TEXT,                          -- Usuário que fez a ação
    created_at          TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 3. ÍNDICES DE PERFORMANCE
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_dp_estoque_itens_empresa ON public.dp_estoque_itens(empresa_id);
CREATE INDEX IF NOT EXISTS idx_dp_estoque_itens_tipo ON public.dp_estoque_itens(tipo);
CREATE INDEX IF NOT EXISTS idx_dp_estoque_mov_item ON public.dp_estoque_movimentacoes(item_id);

-- ============================================================
-- 4. ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE public.dp_estoque_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dp_estoque_movimentacoes ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'dp_estoque_itens', 'dp_estoque_movimentacoes'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Allow all for authenticated" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "Allow all for authenticated" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      t
    );
  END LOOP;
END $$;
