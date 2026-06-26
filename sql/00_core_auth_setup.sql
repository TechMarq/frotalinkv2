/* === 00_core_auth_setup.sql === */

/* --- File: supabase_setup.sql --- */
-- 1. Tabela de Motoristas
CREATE TABLE IF NOT EXISTS public.motoristas (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nome_completo TEXT NOT NULL,
    contato_whatsapp TEXT,
    cpf TEXT UNIQUE,
    registro_cnh TEXT,
    vencimento_cnh DATE,
    categoria_cnh TEXT,
    data_nascimento DATE,
    status TEXT DEFAULT 'ATIVO', -- ATIVO ou INATIVO
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Tabela de Veículos
CREATE TABLE IF NOT EXISTS public.veiculos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    -- Dados Básicos
    placa TEXT NOT NULL UNIQUE,
    renavam TEXT,
    proprietario TEXT,
    classificacao TEXT, -- CASA, VENDIDO, BO
    -- Seguro
    seguradora TEXT,
    vencimento_seguro DATE,
    proponente_seguro TEXT,
    condutor_principal_id UUID REFERENCES public.motoristas(id),
    corretor_seguro TEXT,
    numero_apolice TEXT,
    endosso_proposta TEXT,
    ci_seguro TEXT,
    valor_franquia NUMERIC(10,2),
    valor_premio NUMERIC(10,2),
    valor_dia_seguro NUMERIC(10,2),
    forma_pagamento TEXT, -- BOLETO, CARTAO
    parcelas_pagamento INTEGER,
    -- Documentação
    nome_documento TEXT,
    cpf_cnpj TEXT,
    codigo_fipe TEXT,
    valor_fipe_mes NUMERIC(10,2),
    chassi TEXT,
    numero_motor TEXT,
    -- Detalhes Técnicos
    ano_fabricacao INTEGER,
    ano_modelo INTEGER,
    marca TEXT,
    modelo TEXT NOT NULL,
    cor TEXT,
    -- Aquisição
    data_aquisicao_nf DATE,
    data_saida_nf DATE,
    fornecedor_aquisicao TEXT,
    status TEXT DEFAULT 'ATIVO', -- ATIVO ou INATIVO
    inativo_motivo TEXT,
    inativo_data DATE,
    inativo_beneficiario TEXT,
    inativo_valor NUMERIC(15,2),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ativar Real-time para ambas se não existirem na publicação
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'veiculos') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.veiculos;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'motoristas') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.motoristas;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- Habitar RLS e abrir permissões para teste (Atenção: Em prod deve-se restringir)
ALTER TABLE public.veiculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.motoristas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso público total veiculos" ON public.veiculos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso público total motoristas" ON public.motoristas FOR ALL USING (true) WITH CHECK (true);

-- VIEW para facilitar a contagem de vínculos de seguro
CREATE OR REPLACE VIEW public.view_motoristas_vinculos AS
SELECT 
    m.*,
    (SELECT COUNT(*) FROM public.veiculos v WHERE v.condutor_principal_id = m.id) as quantidade_vinculo_seguro
FROM public.motoristas m;

-- 3. Tabela de Fornecedores (Centralizada)
CREATE TABLE IF NOT EXISTS public.fornecedores (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nome TEXT NOT NULL,
    cnpj_cpf TEXT,
    contato TEXT,
    email TEXT,
    endereco TEXT,
    cidade TEXT,
    estado TEXT,
    categoria TEXT, -- MECANICA, POSTO, PEÇAS, etc.
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Tabela de Abastecimentos
CREATE TABLE IF NOT EXISTS public.abastecimentos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    veiculo_id UUID REFERENCES public.veiculos(id) ON DELETE CASCADE,
    motorista_id UUID REFERENCES public.motoristas(id) ON DELETE SET NULL,
    data DATE NOT NULL DEFAULT CURRENT_DATE,
    horario TIME,
    km_atual NUMERIC(12,2) NOT NULL,
    litros NUMERIC(10,2) NOT NULL,
    valor_unitario NUMERIC(10,3),
    valor_subtotal NUMERIC(12,2),
    valor_desconto NUMERIC(12,2) DEFAULT 0,
    valor_total NUMERIC(12,2) NOT NULL,
    tipo_combustivel TEXT, 
    posto_id UUID REFERENCES public.fornecedores(id),
    cidade_posto TEXT,
    estado_posto TEXT,
    categoria_posto TEXT,
    media_calculada NUMERIC(10,2),
    observacoes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Tabela de Manutenções
CREATE TABLE IF NOT EXISTS public.manutencoes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    veiculo_id UUID REFERENCES public.veiculos(id) ON DELETE CASCADE,
    motorista_id UUID REFERENCES public.motoristas(id) ON DELETE SET NULL,
    data DATE NOT NULL DEFAULT CURRENT_DATE,
    km_atual NUMERIC(12,2) NOT NULL,
    tipo_acao TEXT DEFAULT 'SERVICO', -- TROCA, SERVICO
    descricao TEXT NOT NULL,
    origem TEXT DEFAULT 'AUTOPEÇA', -- ESTOQUE, AUTOPEÇA
    numero_nf TEXT,
    fornecedor_id UUID REFERENCES public.fornecedores(id),
    valor_total NUMERIC(12,2) NOT NULL,
    tem_garantia BOOLEAN DEFAULT FALSE,
    garantia_meses INTEGER,
    controle_proxima TEXT DEFAULT 'KM', -- KM, DATA, NENHUM
    proxima_revisao_km NUMERIC(12,2),
    proxima_revisao_data DATE,
    status TEXT DEFAULT 'CONCLUIDO', -- AGENDADO, EM_EXECUCAO, CONCLUIDO
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Real-time para novas tabelas se não existirem na publicação
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'fornecedores') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.fornecedores;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'abastecimentos') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.abastecimentos;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'manutencoes') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.manutencoes;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- RLS para novas tabelas
ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abastecimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manutencoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso público total fornecedores" ON public.fornecedores FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso público total abastecimentos" ON public.abastecimentos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso público total abastecimentos" ON public.abastecimentos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso público total manutencoes" ON public.manutencoes FOR ALL USING (true) WITH CHECK (true);

-- 6. Módulo de Compras & Cadastro de Apoio
-- 6.1 Tabela de Centros de Custo (Suporte a Hierarquia)
CREATE TABLE IF NOT EXISTS public.centros_custo (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    codigo TEXT NOT NULL UNIQUE, -- Ex: 01, 01.0001, 02
    nome TEXT NOT NULL,
    parent_id UUID REFERENCES public.centros_custo(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 6.2 Tabela de Formas de Pagamento
CREATE TABLE IF NOT EXISTS public.formas_pagamento (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nome TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 6.3 Tabela de Espécies de Nota
CREATE TABLE IF NOT EXISTS public.especies_nota (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nome TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Inserir valores padrão para Espécies de Nota
INSERT INTO public.especies_nota (nome) VALUES 
('NF-e'), ('NF-s'), ('Recibo'), ('Cupom'), ('Vale')
ON CONFLICT (nome) DO NOTHING;

-- 6.4 Tabela de Compras (Notas/Despesas)
CREATE TABLE IF NOT EXISTS public.compras (
    id TEXT PRIMARY KEY, -- Usando o código NC-XXXXXX
    data_emissao DATE NOT NULL DEFAULT CURRENT_DATE,
    numero_nota TEXT,
    especie_id UUID REFERENCES public.especies_nota(id),
    fornecedor_id UUID REFERENCES public.fornecedores(id),
    centro_custo_id UUID REFERENCES public.centros_custo(id),
    forma_pagamento_id UUID REFERENCES public.formas_pagamento(id),
    valor_total NUMERIC(12,2) NOT NULL DEFAULT 0,
    financeiro_parcelado BOOLEAN DEFAULT FALSE,
    qtd_parcelas INTEGER DEFAULT 1,
    observacoes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 6.4 Tabela de Itens da Compra
CREATE TABLE IF NOT EXISTS public.compra_itens (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    compra_id TEXT REFERENCES public.compras(id) ON DELETE CASCADE,
    produto TEXT NOT NULL,
    marca TEXT,
    quantidade NUMERIC(12,3) NOT NULL DEFAULT 1,
    valor_unitario NUMERIC(12,2) NOT NULL DEFAULT 0,
    estoque BOOLEAN DEFAULT FALSE,
    vinculo_veiculo_id UUID REFERENCES public.veiculos(id),
    vinculo_pessoa TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 6.5 Tabela de Custos Adicionais
CREATE TABLE IF NOT EXISTS public.compra_adicionais (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    compra_id TEXT REFERENCES public.compras(id) ON DELETE CASCADE,
    descricao TEXT NOT NULL,
    valor NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 6.6 Tabela de Parcelas da Compra
CREATE TABLE IF NOT EXISTS public.compra_parcelas (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    compra_id TEXT REFERENCES public.compras(id) ON DELETE CASCADE,
    data_vencimento DATE NOT NULL,
    valor NUMERIC(12,2) NOT NULL,
    status TEXT DEFAULT 'PENDENTE', -- PENDENTE, PAGO
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Real-time para Compras se não existirem na publicação
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'centros_custo') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.centros_custo;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'formas_pagamento') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.formas_pagamento;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'especies_nota') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.especies_nota;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'compras') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.compras;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'compra_itens') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.compra_itens;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'compra_adicionais') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.compra_adicionais;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'compra_parcelas') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.compra_parcelas;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

ALTER TABLE public.centros_custo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.formas_pagamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.especies_nota ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compra_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compra_adicionais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compra_parcelas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso público total centros_custo" ON public.centros_custo FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso público total formas_pagamento" ON public.formas_pagamento FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso público total especies_nota" ON public.especies_nota FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso público total compras" ON public.compras FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso público total compra_itens" ON public.compra_itens FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso público total compra_adicionais" ON public.compra_adicionais FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso público total compra_parcelas" ON public.compra_parcelas FOR ALL USING (true) WITH CHECK (true);

-- 7. Motivos de Inativação de Veículos
CREATE TABLE IF NOT EXISTS public.veiculo_motivos_inativacao (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nome TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.veiculo_motivos_inativacao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso público total motivos inativação" ON public.veiculo_motivos_inativacao FOR ALL USING (true) WITH CHECK (true);
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'veiculo_motivos_inativacao') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.veiculo_motivos_inativacao;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

INSERT INTO public.veiculo_motivos_inativacao (nome) VALUES 
('VENDIDO'), ('PERDA TOTAL (PT)'), ('ROUBADO/FURTADO')
ON CONFLICT (nome) DO NOTHING;



/* --- File: empresa_saas_migration.sql --- */
-- ============================================================
-- MIGRAÇÃO SAAS: MULTI-EMPRESA — FrotaLink / FrotaLink
-- Execute este script NO SUPABASE SQL EDITOR
-- Desenvolvido para ser idempotente (pode ser rodado mais de uma vez)
-- ============================================================

-- ============================================================
-- PASSO 1: CRIAR TABELA DE EMPRESAS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.empresas (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    razao_social TEXT NOT NULL,
    nome_fantasia TEXT,
    cnpj TEXT,
    inscricao_estadual TEXT,
    telefone TEXT,
    email TEXT,
    site TEXT,
    -- Endereço
    endereco TEXT,
    numero TEXT,
    complemento TEXT,
    bairro TEXT,
    cidade TEXT,
    estado TEXT,
    cep TEXT,
    -- Identidade
    setor TEXT DEFAULT 'Transportes e Logística',
    logo_url TEXT,
    cor_primaria TEXT DEFAULT '#4f46e5',
    -- SaaS Control
    plano TEXT DEFAULT 'starter', -- starter | professional | enterprise
    ativo BOOLEAN DEFAULT true,
    setup_completo BOOLEAN DEFAULT false, -- flag: onboarding foi concluído
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS para empresas
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso autenticado empresas" ON public.empresas;
CREATE POLICY "Acesso autenticado empresas" ON public.empresas FOR ALL USING (true) WITH CHECK (true);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.fn_update_empresas_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_empresas_updated_at ON public.empresas;
CREATE TRIGGER trg_empresas_updated_at
    BEFORE UPDATE ON public.empresas
    FOR EACH ROW EXECUTE FUNCTION public.fn_update_empresas_timestamp();

-- Real-time
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'empresas') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.empresas;
    END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================================
-- PASSO 2: INSERIR EMPRESA PADRÃO (vinculada ao usuário existente)
-- ============================================================

INSERT INTO public.empresas (
    razao_social,
    nome_fantasia,
    setor,
    plano,
    ativo,
    setup_completo
)
VALUES (
    'Minha Empresa',       -- Será atualizado pelo admin no onboarding
    'FROTALINK',
    'Transportes e Logística',
    'professional',
    true,
    false                  -- false = vai mostrar tela de onboarding
)
ON CONFLICT DO NOTHING;

-- ============================================================
-- PASSO 3: ADICIONAR empresa_id EM user_access
-- ============================================================

ALTER TABLE public.user_access
    ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id),
    ADD COLUMN IF NOT EXISTS nome_completo TEXT,
    ADD COLUMN IF NOT EXISTS temp_reset BOOLEAN DEFAULT false;

-- Vincular o usuário admin à empresa padrão
UPDATE public.user_access
SET empresa_id = (SELECT id FROM public.empresas ORDER BY created_at LIMIT 1)
WHERE email = 'manutencaoveritas@gmail.com'
  AND empresa_id IS NULL;

-- ============================================================
-- PASSO 4: ADICIONAR empresa_id NAS TABELAS DE DADOS EXISTENTES
-- ============================================================

-- 4.1 Frota
ALTER TABLE public.veiculos    ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id);
ALTER TABLE public.motoristas  ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id);
ALTER TABLE public.fornecedores ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id);

-- 4.2 Operacional
ALTER TABLE public.abastecimentos ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id);
ALTER TABLE public.manutencoes    ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id);

-- 4.3 Compras
ALTER TABLE public.compras          ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id);
ALTER TABLE public.compra_itens     ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id);
ALTER TABLE public.compra_adicionais ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id);
ALTER TABLE public.compra_parcelas  ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id);
ALTER TABLE public.centros_custo    ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id);
ALTER TABLE public.formas_pagamento ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id);
ALTER TABLE public.especies_nota    ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id);

-- 4.4 Estoque
ALTER TABLE public.estoque              ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id);
ALTER TABLE public.estoque_movimentacoes ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id);

-- 4.5 Financeiro
ALTER TABLE public.fin_lancamentos      ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id);
ALTER TABLE public.fin_contas_bancarias ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id);
ALTER TABLE public.fin_plano_contas     ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id);
ALTER TABLE public.fin_centros_custo    ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id);

-- 4.6 Comercial
ALTER TABLE public.com_contratos ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id);

-- ============================================================
-- PASSO 5: VINCULAR TODOS OS DADOS EXISTENTES À EMPRESA PADRÃO
-- Esta operação é segura: atualiza apenas registros sem empresa_id
-- ============================================================

DO $$
DECLARE
    v_empresa_id UUID;
BEGIN
    -- Busca o ID da empresa padrão
    SELECT id INTO v_empresa_id FROM public.empresas ORDER BY created_at LIMIT 1;

    IF v_empresa_id IS NULL THEN
        RAISE EXCEPTION 'Nenhuma empresa encontrada. Verifique o Passo 2.';
    END IF;

    RAISE NOTICE 'Vinculando dados à empresa: %', v_empresa_id;

    -- Frota
    UPDATE public.veiculos    SET empresa_id = v_empresa_id WHERE empresa_id IS NULL;
    UPDATE public.motoristas  SET empresa_id = v_empresa_id WHERE empresa_id IS NULL;
    UPDATE public.fornecedores SET empresa_id = v_empresa_id WHERE empresa_id IS NULL;

    -- Operacional
    UPDATE public.abastecimentos SET empresa_id = v_empresa_id WHERE empresa_id IS NULL;
    UPDATE public.manutencoes    SET empresa_id = v_empresa_id WHERE empresa_id IS NULL;

    -- Compras
    UPDATE public.compras          SET empresa_id = v_empresa_id WHERE empresa_id IS NULL;
    UPDATE public.compra_itens     SET empresa_id = v_empresa_id WHERE empresa_id IS NULL;
    UPDATE public.compra_adicionais SET empresa_id = v_empresa_id WHERE empresa_id IS NULL;
    UPDATE public.compra_parcelas  SET empresa_id = v_empresa_id WHERE empresa_id IS NULL;
    UPDATE public.centros_custo    SET empresa_id = v_empresa_id WHERE empresa_id IS NULL;
    UPDATE public.formas_pagamento SET empresa_id = v_empresa_id WHERE empresa_id IS NULL;
    UPDATE public.especies_nota    SET empresa_id = v_empresa_id WHERE empresa_id IS NULL;

    -- Estoque
    UPDATE public.estoque              SET empresa_id = v_empresa_id WHERE empresa_id IS NULL;
    UPDATE public.estoque_movimentacoes SET empresa_id = v_empresa_id WHERE empresa_id IS NULL;

    -- Financeiro (se as tabelas existirem)
    BEGIN
        UPDATE public.fin_lancamentos      SET empresa_id = v_empresa_id WHERE empresa_id IS NULL;
        UPDATE public.fin_contas_bancarias SET empresa_id = v_empresa_id WHERE empresa_id IS NULL;
        UPDATE public.fin_plano_contas     SET empresa_id = v_empresa_id WHERE empresa_id IS NULL;
        UPDATE public.fin_centros_custo    SET empresa_id = v_empresa_id WHERE empresa_id IS NULL;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Tabelas financeiro: %', SQLERRM;
    END;

    -- Comercial (se a tabela existir)
    BEGIN
        UPDATE public.com_contratos SET empresa_id = v_empresa_id WHERE empresa_id IS NULL;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Tabelas comercial: %', SQLERRM;
    END;

    RAISE NOTICE 'Migração concluída com sucesso! empresa_id = %', v_empresa_id;
END $$;

-- ============================================================
-- PASSO 6: VERIFICAÇÃO FINAL (consulta de conferência)
-- ============================================================

SELECT
    'empresas'         AS tabela, COUNT(*) AS total, COUNT(id) AS com_id FROM public.empresas
UNION ALL
SELECT 'user_access',    COUNT(*), COUNT(empresa_id) FROM public.user_access
UNION ALL
SELECT 'veiculos',       COUNT(*), COUNT(empresa_id) FROM public.veiculos
UNION ALL
SELECT 'motoristas',     COUNT(*), COUNT(empresa_id) FROM public.motoristas
UNION ALL
SELECT 'abastecimentos', COUNT(*), COUNT(empresa_id) FROM public.abastecimentos
UNION ALL
SELECT 'manutencoes',    COUNT(*), COUNT(empresa_id) FROM public.manutencoes
UNION ALL
SELECT 'compras',        COUNT(*), COUNT(empresa_id) FROM public.compras
UNION ALL
SELECT 'estoque',        COUNT(*), COUNT(empresa_id) FROM public.estoque;

-- ============================================================
-- RESULTADO ESPERADO:
-- Todas as linhas devem mostrar: total = com_id
-- Isso confirma que NENHUM registro ficou sem empresa_id
-- ============================================================


/* --- File: access_control.sql --- */
-- ============================================================
-- CONTROLE DE ACESSO — FrotaLink / FrotaLink
-- Execute este script no Supabase SQL Editor
-- ============================================================

-- Tabela de controle de acesso por usuário
CREATE TABLE IF NOT EXISTS public.user_access (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'user', -- 'admin' | 'user'
    modules JSONB NOT NULL DEFAULT '["frota","abastecimento","manutencao","compras","estoque","fechamento","financeiro","comercial"]'::jsonb,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índice para busca por email
CREATE INDEX IF NOT EXISTS idx_user_access_email ON public.user_access(email);

-- RLS
ALTER TABLE public.user_access ENABLE ROW LEVEL SECURITY;

-- Política: usuário autenticado pode ler APENAS seu próprio registro
CREATE POLICY "user_can_read_own_access"
ON public.user_access
FOR SELECT
USING (auth.email() = email);

-- Política: apenas admin pode fazer tudo (INSERT, UPDATE, DELETE)
-- Admin é identificado por ter role = 'admin' na própria tabela
CREATE POLICY "admin_full_access"
ON public.user_access
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.user_access ua
        WHERE ua.email = auth.email()
        AND ua.role = 'admin'
        AND ua.active = true
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.user_access ua
        WHERE ua.email = auth.email()
        AND ua.role = 'admin'
        AND ua.active = true
    )
);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION public.update_user_access_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_user_access_updated_at
BEFORE UPDATE ON public.user_access
FOR EACH ROW EXECUTE FUNCTION public.update_user_access_timestamp();

-- Real-time (opcional)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'user_access'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.user_access;
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- ============================================================
-- INSTRUÇÃO: Após rodar este script, cadastre o usuário ADMIN
-- no Supabase Authentication > Users > "Add User"
-- e depois insira o email aqui:
-- ============================================================

-- Exemplo de inserção do admin master (ajuste o email):
-- INSERT INTO public.user_access (email, role, modules, active)
-- VALUES (
--     'SEU_EMAIL_ADMIN@dominio.com',
--     'admin',
--     '["frota","abastecimento","manutencao","compras","estoque","fechamento","financeiro","comercial"]'::jsonb,
--     true
-- ) ON CONFLICT (email) DO NOTHING;


/* --- File: fix_user_confirmation.sql --- */
-- ============================================================
-- SCRIPT DE EMERGÊNCIA: Confirmar usuário e/ou resetar senha
-- Execute no Supabase SQL Editor:
-- https://supabase.com/dashboard/project/ffgwqsrfmmcqwjjkbrsq/sql/new
-- ============================================================

-- ⚠️ SUBSTITUA o e-mail abaixo pelo e-mail do funcionário problemático

-- PASSO 1: Ver todos os usuários no Auth (para identificar quem está pendente)
SELECT 
    id,
    email,
    email_confirmed_at,
    created_at,
    last_sign_in_at,
    CASE 
        WHEN email_confirmed_at IS NULL THEN '⚠️ NÃO CONFIRMADO (não consegue logar)'
        ELSE '✅ Confirmado'
    END as status_confirmacao
FROM auth.users
ORDER BY created_at DESC;

-- ============================================================
-- PASSO 2: Confirmar manualmente o e-mail de um usuário específico
-- (Substitua o e-mail pelo e-mail correto)
-- ============================================================

-- UPDATE auth.users
-- SET email_confirmed_at = NOW(),
--     updated_at = NOW()
-- WHERE email = 'funcionario@email.com'
--   AND email_confirmed_at IS NULL;

-- ============================================================
-- PASSO 3: RESETAR SENHA de um usuário específico
-- (Substitua e-mail e nova senha)
-- ATENÇÃO: Esta função só existe em versões recentes do Supabase
-- ============================================================

-- SELECT supabase_auth.update_user_password(
--     (SELECT id FROM auth.users WHERE email = 'funcionario@email.com'),
--     'NovaSenha123'
-- );

-- ============================================================
-- ALTERNATIVA: Confirmar TODOS os usuários não confirmados
-- Use com cuidado — confirma todos de uma vez
-- ============================================================

-- UPDATE auth.users
-- SET email_confirmed_at = NOW(),
--     updated_at = NOW()
-- WHERE email_confirmed_at IS NULL;

-- ============================================================
-- VERIFICAÇÃO FINAL: Usuários no user_access vs Auth
-- Mostra quem tem acesso mas não está confirmado no Auth
-- ============================================================

SELECT 
    ua.email,
    ua.nome_completo,
    ua.role,
    ua.active,
    au.email_confirmed_at,
    CASE 
        WHEN au.id IS NULL THEN '❌ NÃO existe no Auth'
        WHEN au.email_confirmed_at IS NULL THEN '⚠️ Existe mas NÃO confirmado'
        ELSE '✅ OK — pode logar'
    END as situacao
FROM public.user_access ua
LEFT JOIN auth.users au ON au.email = ua.email
ORDER BY ua.created_at DESC;


/* --- File: permissions_migration.sql --- */
-- ============================================================
-- MIGRATION: PERMISSÕES GRANULARES E INFORMAÇÕES DE FUNCIONÁRIO
-- Execute este script no Supabase SQL Editor
-- ============================================================

-- 1. Garantir que as novas colunas existam na tabela user_access
ALTER TABLE public.user_access
    ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS nome_completo TEXT,
    ADD COLUMN IF NOT EXISTS temp_password TEXT; -- Guarda hash ou texto de senha temporária se aplicável, ou controle interno

-- 2. Script para popular permissões iniciais dos usuários existentes baseado no array de modules atual
DO $$
DECLARE
    r RECORD;
    v_mod TEXT;
    v_perm JSONB;
BEGIN
    FOR r IN SELECT email, role, modules, permissions FROM public.user_access LOOP
        -- Se já tiver permissões configuradas, pular
        IF r.modules IS NOT NULL AND (r.permissions IS NULL OR r.permissions = '{}'::jsonb) THEN
            v_perm := '{}'::jsonb;
            
            -- Se for admin, concede tudo. Caso contrário, monta baseado no array modules
            IF r.role = 'admin' THEN
                v_perm := '{
                    "frota": {"view": true, "add": true, "edit": true, "delete": true},
                    "abastecimento": {"view": true, "add": true, "edit": true, "delete": true},
                    "manutencao": {"view": true, "add": true, "edit": true, "delete": true},
                    "compras": {"view": true, "add": true, "edit": true, "delete": true},
                    "estoque": {"view": true, "add": true, "edit": true, "delete": true},
                    "fechamento": {"view": true, "add": true, "edit": true, "delete": true},
                    "financeiro": {"view": true, "add": true, "edit": true, "delete": true},
                    "comercial": {"view": true, "add": true, "edit": true, "delete": true}
                }'::jsonb;
            ELSE
                -- Para cada módulo no array, insere com view: true e todas ações true por padrão (para não quebrar acessos atuais)
                FOR v_mod IN SELECT jsonb_array_elements_text(r.modules) LOOP
                    v_perm := jsonb_set(
                        v_perm, 
                        array[v_mod], 
                        '{"view": true, "add": true, "edit": true, "delete": true}'::jsonb, 
                        true
                    );
                END LOOP;
            END IF;

            UPDATE public.user_access 
            SET permissions = v_perm 
            WHERE email = r.email;
        END IF;
    END LOOP;
END $$;


/* --- File: user_management_rpc.sql --- */
-- ============================================================
-- SQL RPC Functions for Admin User Management (Without Edge Functions)
-- Run this in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/ffgwqsrfmmcqwjjkbrsq/sql/new
-- ============================================================

-- Enable pgcrypto if it's not enabled yet
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Create User RPC
DROP FUNCTION IF EXISTS public.admin_create_user(text,text,text,text,boolean,text[],jsonb,uuid);

CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_email text,
  p_password text,
  p_nome_completo text,
  p_role text,
  p_active boolean,
  p_modules jsonb,
  p_permissions jsonb,
  p_empresa_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_user_id uuid;
BEGIN
  -- Check if caller is active admin
  IF NOT EXISTS (
    SELECT 1 FROM public.user_access
    WHERE email = auth.jwt() ->> 'email' AND role = 'admin' AND active = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado: Apenas administradores ativos podem criar usuários.';
  END IF;

  -- Check if user already exists
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = p_email) THEN
    RAISE EXCEPTION 'Este e-mail já está cadastrado.';
  END IF;

  -- Generate UUID
  new_user_id := gen_random_uuid();

  -- Insert into auth.users
  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    role,
    aud,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    is_sso_user
  ) VALUES (
    new_user_id,
    '00000000-0000-0000-0000-000000000000',
    p_email,
    crypt(p_password, gen_salt('bf', 10)),
    now(),
    now(),
    now(),
    'authenticated',
    'authenticated',
    '{"provider": "email", "providers": ["email"], "email_verified": true}'::jsonb,
    json_build_object('nome_completo', p_nome_completo)::jsonb,
    false,
    false
  );

  -- Insert into auth.identities
  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at,
    provider_id
  ) VALUES (
    new_user_id,
    new_user_id,
    json_build_object('sub', new_user_id, 'email', p_email, 'email_verified', true)::jsonb,
    'email',
    now(),
    now(),
    now(),
    new_user_id::text
  );

  -- Insert into public.user_access
  INSERT INTO public.user_access (
    email,
    nome_completo,
    role,
    modules,
    permissions,
    active,
    empresa_id,
    temp_reset
  ) VALUES (
    p_email,
    COALESCE(p_nome_completo, ''),
    COALESCE(p_role, 'user'),
    COALESCE(p_modules, '[]'::jsonb),
    COALESCE(p_permissions, '{}'::jsonb),
    COALESCE(p_active, true),
    p_empresa_id,
    false
  );

  RETURN new_user_id;
END;
$$;

-- 2. Update Password RPC
CREATE OR REPLACE FUNCTION public.admin_update_user_password(
  user_email text,
  new_password text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if caller is active admin
  IF NOT EXISTS (
    SELECT 1 FROM public.user_access
    WHERE email = auth.jwt() ->> 'email' AND role = 'admin' AND active = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado: Apenas administradores ativos podem alterar senhas.';
  END IF;

  -- Update encrypted password
  UPDATE auth.users
  SET encrypted_password = crypt(new_password, gen_salt('bf', 10)),
      updated_at = now()
  WHERE email = user_email;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário não encontrado no sistema de autenticação.';
  END IF;
END;
$$;

-- 3. Delete Auth User RPC
CREATE OR REPLACE FUNCTION public.admin_delete_auth_user(
  user_email text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if caller is active admin
  IF NOT EXISTS (
    SELECT 1 FROM public.user_access
    WHERE email = auth.jwt() ->> 'email' AND role = 'admin' AND active = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado: Apenas administradores ativos podem remover usuários.';
  END IF;

  -- Delete from auth.users (cascade will delete identity)
  DELETE FROM auth.users WHERE email = user_email;
END;
$$;

-- 4. Check Email Registered RPC (bypasses RLS)
CREATE OR REPLACE FUNCTION public.check_email_registered(p_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_access
    WHERE email = p_email AND active = true
  );
END;
$$;




