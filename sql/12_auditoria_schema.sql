-- Create user audit logs table
CREATE TABLE IF NOT EXISTS public.logs_atividade (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
    usuario_email TEXT NOT NULL,
    modulo TEXT NOT NULL,
    acao TEXT NOT NULL,
    descricao TEXT NOT NULL,
    data_hora TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.logs_atividade ENABLE ROW LEVEL SECURITY;

-- Create Policies
CREATE POLICY "Permitir leitura para membros da mesma empresa" ON public.logs_atividade
    FOR SELECT USING (
        empresa_id = (SELECT empresa_id FROM public.user_access WHERE email = auth.jwt()->>'email' AND active = true)
    );

CREATE POLICY "Permitir insercao para usuarios autenticados" ON public.logs_atividade
    FOR INSERT WITH CHECK (
        empresa_id = (SELECT empresa_id FROM public.user_access WHERE email = auth.jwt()->>'email' AND active = true)
    );

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_logs_atividade_empresa ON public.logs_atividade(empresa_id);
CREATE INDEX IF NOT EXISTS idx_logs_atividade_data ON public.logs_atividade(data_hora DESC);
