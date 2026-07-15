-- ============================================================
-- TABELA DE RESERVAS DE SALAS (WIDGET GLOBAL)
-- Execute este script no Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.reservas_salas (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sala TEXT NOT NULL, -- 'Sala de Reunião' | 'Sala de Treinamento'
    data DATE NOT NULL,
    horario TIME NOT NULL,
    duracao TEXT NOT NULL, -- ex: '30 min', '1 hora', etc.
    reservado_por TEXT NOT NULL,
    criado_por_email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Agendado', -- 'Agendado' | 'Finalizado'
    concluido_em TIMESTAMPTZ,
    empresa_id UUID REFERENCES public.empresas(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS (Row Level Security)
ALTER TABLE public.reservas_salas ENABLE ROW LEVEL SECURITY;

-- 1. Permitir leitura para todos os usuários autenticados (o frontend filtra por empresa_id)
CREATE POLICY "authenticated_view_reservas"
ON public.reservas_salas
FOR SELECT
TO authenticated
USING (true);

-- 2. Permitir inserção para todos os usuários autenticados
CREATE POLICY "authenticated_insert_reservas"
ON public.reservas_salas
FOR INSERT
TO authenticated
WITH CHECK (true);

-- 3. Permitir atualização para marcar como concluído
CREATE POLICY "authenticated_update_reservas"
ON public.reservas_salas
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- 4. Permitir deleção apenas para o próprio criador da reserva
CREATE POLICY "creator_delete_reservas"
ON public.reservas_salas
FOR DELETE
TO authenticated
USING (
    LOWER(criado_por_email) = LOWER(auth.jwt()->>'email')
    OR LOWER(criado_por_email) = LOWER(auth.email())
);
