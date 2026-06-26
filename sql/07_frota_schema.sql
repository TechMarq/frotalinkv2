/* === 07_frota_schema.sql === */

/* --- File: frota_inativos_migration.sql --- */
-- Migration para adicionar campos de inativação de veículos
ALTER TABLE public.veiculos 
ADD COLUMN IF NOT EXISTS inativo_motivo TEXT,
ADD COLUMN IF NOT EXISTS inativo_data DATE,
ADD COLUMN IF NOT EXISTS inativo_beneficiario TEXT,
ADD COLUMN IF NOT EXISTS inativo_valor NUMERIC(15,2);

-- Tabela para motivos de inativação
CREATE TABLE IF NOT EXISTS public.veiculo_motivos_inativacao (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nome TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.veiculo_motivos_inativacao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on inactivation reasons" ON public.veiculo_motivos_inativacao;
CREATE POLICY "Allow all on inactivation reasons" ON public.veiculo_motivos_inativacao FOR ALL USING (true);

-- Seed motivos iniciais
INSERT INTO public.veiculo_motivos_inativacao (nome) VALUES 
('VENDIDO'), ('PERDA TOTAL (PT)'), ('ROUBADO/FURTADO')
ON CONFLICT (nome) DO NOTHING;



