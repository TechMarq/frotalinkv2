/* === 08_integracoes_schema.sql === */

/* --- File: whatsapp_automation_schema.sql --- */
-- 1. Criação das Tabelas (IF NOT EXISTS já previne erros aqui)
CREATE TABLE IF NOT EXISTS public.whatsapp_config (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    api_type TEXT DEFAULT 'evolution', -- evolution ou callmebot
    api_url TEXT,
    instance TEXT,
    apikey TEXT,
    cmb_apikey TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.whatsapp_destinatarios (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nome TEXT,
    numero TEXT NOT NULL,
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Habilitar RLS
ALTER TABLE public.whatsapp_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_destinatarios ENABLE ROW LEVEL SECURITY;

-- 3. Criar Políticas de Acesso (Removendo as antigas antes para evitar erro de duplicidade)
DROP POLICY IF EXISTS "Acesso total whatsapp_config" ON public.whatsapp_config;
CREATE POLICY "Acesso total whatsapp_config" ON public.whatsapp_config FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acesso total whatsapp_destinatarios" ON public.whatsapp_destinatarios;
CREATE POLICY "Acesso total whatsapp_destinatarios" ON public.whatsapp_destinatarios FOR ALL USING (true) WITH CHECK (true);

-- 4. Ativar Real-time (Caso ainda não esteja ativo)
-- Nota: O comando abaixo pode variar dependendo da sua configuração de Realtime,
-- mas geralmente o Supabase ignora se já estiver na publicação.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'whatsapp_config') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_config;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'whatsapp_destinatarios') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_destinatarios;
    END IF;
END
$$;



