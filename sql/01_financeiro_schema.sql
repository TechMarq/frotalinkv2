/* === 01_financeiro_schema.sql === */

/* --- File: financeiro_schema.sql --- */
-- 💰 Módulo Financeiro: FrotaLink
-- Esquema profissional para Gestão Financeira Completa

-- 1. Canais Financeiros (Contas Bancárias / Caixas)
CREATE TABLE IF NOT EXISTS public.fin_contas_bancarias (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nome TEXT NOT NULL,
    banco TEXT,
    agencia TEXT,
    numero_conta TEXT UNIQUE,
    saldo_inicial NUMERIC(15,2) DEFAULT 0,
    saldo_atual NUMERIC(15,2) DEFAULT 0,
    pix TEXT,
    cor_identificacao TEXT DEFAULT '#4f46e5',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Plano de Contas (Categorias Hierárquicas)
CREATE TABLE IF NOT EXISTS public.fin_plano_contas (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    codigo TEXT NOT NULL UNIQUE, -- Ex: 1, 1.1, 1.1.01
    nome TEXT NOT NULL,
    tipo TEXT CHECK (tipo IN ('RECEITA', 'DESPESA', 'INVESTIMENTO', 'TRANSFERENCIA')),
    parent_id UUID REFERENCES public.fin_plano_contas(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Centros de Custo
CREATE TABLE IF NOT EXISTS public.fin_centros_custo (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    codigo TEXT NOT NULL UNIQUE,
    nome TEXT NOT NULL,
    parent_id UUID REFERENCES public.fin_centros_custo(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Formas de Pagamento (Sincronizado com Compras)
CREATE TABLE IF NOT EXISTS public.formas_pagamento (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nome TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Lançamentos Financeiros (Mestre)
CREATE SEQUENCE IF NOT EXISTS public.seq_fin_pagar START 1;
CREATE SEQUENCE IF NOT EXISTS public.seq_fin_receber START 1;

CREATE TABLE IF NOT EXISTS public.fin_lancamentos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tipo TEXT NOT NULL CHECK (tipo IN ('PAGAR', 'RECEBER')),
    descricao TEXT NOT NULL,
    entidade_nome TEXT, -- Nome do fornecedor ou cliente (pode ser linkado se houver tabela)
    codigo_sequencial TEXT UNIQUE,
    
    -- Valores e Datas
    valor_total NUMERIC(15,2) NOT NULL,
    valor_pago NUMERIC(15,2) DEFAULT 0,
    data_vencimento DATE NOT NULL,
    data_competencia DATE DEFAULT CURRENT_DATE,
    data_pagamento DATE,
    
    -- Relacionamentos
    categoria_id UUID REFERENCES public.fin_plano_contas(id),
    centro_custo_id UUID REFERENCES public.fin_centros_custo(id),
    conta_bancaria_id UUID REFERENCES public.fin_contas_bancarias(id),
    
    -- Vínculo com Cliente (Módulo Comercial) - para lançamentos do tipo RECEBER
    -- Referencia com_contratos, que armazena os dados do cliente
    cliente_id UUID, -- REFERENCES public.com_contratos(id) --- (habilitar após rodar comercial_schema.sql)
    
    -- Status e Controle
    status TEXT DEFAULT 'ABERTO' CHECK (status IN ('ABERTO', 'PAGO', 'PARCIAL', 'CANCELADO', 'ATRASADO')),
    status_aprovacao TEXT DEFAULT 'PENDENTE' CHECK (status_aprovacao IN ('PENDENTE', 'APROVADO', 'REPROVADO')),
    recorrencia TEXT DEFAULT 'NAO' CHECK (recorrencia IN ('NAO', 'SEMANAL', 'QUINZENAL', 'MENSAL', 'TRIMESTRAL', 'ANUAL')),
    numero_parcelas INTEGER DEFAULT 1,
    pai_id UUID REFERENCES public.fin_lancamentos(id) ON DELETE CASCADE, -- Para recorrências e parcelas vinculadas
    
    -- Metadados e Anexos
    forma_pagamento TEXT,
    anexo_url TEXT,
    observacoes TEXT,
    created_by TEXT, -- Auditoria simples (identificador do criador)
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Rateio por Centro de Custo (Opcional por lançamento)
CREATE TABLE IF NOT EXISTS public.fin_rateios (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    lancamento_id UUID REFERENCES public.fin_lancamentos(id) ON DELETE CASCADE,
    centro_custo_id UUID REFERENCES public.fin_centros_custo(id) ON DELETE CASCADE,
    porcentagem NUMERIC(5,2) NOT NULL,
    valor NUMERIC(15,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Conciliação Bancária (Importações de Extrato)
CREATE TABLE IF NOT EXISTS public.fin_conciliacao (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conta_bancaria_id UUID REFERENCES public.fin_contas_bancarias(id) ON DELETE CASCADE,
    data_transacao DATE NOT NULL,
    descricao_extrato TEXT NOT NULL,
    valor NUMERIC(15,2) NOT NULL,
    lancamento_vinculado_id UUID REFERENCES public.fin_lancamentos(id),
    status TEXT DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'CONCILIADO', 'IGNORADO')),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Migrações (Campos Fiscais e Organizacionais)
ALTER TABLE public.fin_lancamentos ADD COLUMN IF NOT EXISTS num_nf TEXT;
ALTER TABLE public.fin_lancamentos ADD COLUMN IF NOT EXISTS serie_nf TEXT;
ALTER TABLE public.fin_lancamentos ADD COLUMN IF NOT EXISTS especie_id UUID;
ALTER TABLE public.fin_lancamentos ADD COLUMN IF NOT EXISTS data_emissao DATE;
ALTER TABLE public.fin_lancamentos ADD COLUMN IF NOT EXISTS data_entrada DATE;
ALTER TABLE public.fin_lancamentos ADD COLUMN IF NOT EXISTS valor_base DECIMAL(12,2) DEFAULT 0;
ALTER TABLE public.fin_lancamentos ADD COLUMN IF NOT EXISTS valor_icms DECIMAL(12,2) DEFAULT 0;
ALTER TABLE public.fin_lancamentos ADD COLUMN IF NOT EXISTS valor_frete DECIMAL(12,2) DEFAULT 0;
ALTER TABLE public.fin_lancamentos ADD COLUMN IF NOT EXISTS valor_outras DECIMAL(12,2) DEFAULT 0;
ALTER TABLE public.fin_lancamentos ADD COLUMN IF NOT EXISTS loja_unidade TEXT;
ALTER TABLE public.fin_lancamentos ADD COLUMN IF NOT EXISTS status_aprovacao TEXT DEFAULT 'PENDENTE' CHECK (status_aprovacao IN ('PENDENTE', 'APROVADO', 'REPROVADO'));
ALTER TABLE public.fin_lancamentos ADD COLUMN IF NOT EXISTS anexo_url TEXT;
ALTER TABLE public.fin_lancamentos ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE public.fin_lancamentos ADD COLUMN IF NOT EXISTS is_parcelado BOOLEAN DEFAULT FALSE;
ALTER TABLE public.fin_lancamentos ADD COLUMN IF NOT EXISTS qtd_parcelas INTEGER DEFAULT 1;

-- Campos específicos para Contas a Receber
ALTER TABLE public.fin_lancamentos ADD COLUMN IF NOT EXISTS valor_inss NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.fin_lancamentos ADD COLUMN IF NOT EXISTS valor_iss NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.fin_lancamentos ADD COLUMN IF NOT EXISTS valor_ir NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.fin_lancamentos ADD COLUMN IF NOT EXISTS valor_tributo_total NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.fin_lancamentos ADD COLUMN IF NOT EXISTS prazo_pagamento INTEGER; -- em dias
ALTER TABLE public.fin_lancamentos ADD COLUMN IF NOT EXISTS previsao_pagamento DATE;
ALTER TABLE public.fin_lancamentos ADD COLUMN IF NOT EXISTS tipo_servico_produto TEXT CHECK (tipo_servico_produto IN ('PRODUTO', 'SERVICO'));

-- Vínculo com cliente do módulo comercial (com_contratos)
-- Substitui o campo texto "entidade_nome" para lançamentos RECEBER.
-- Para PAGAR, a entidade é fornecedores (tabela fornecedores existente).
ALTER TABLE public.fin_lancamentos ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES public.com_contratos(id) ON DELETE SET NULL;

-- 8. Novas Tabelas de Detalhamento (Padrão Nota Fiscal)
ALTER TABLE public.fornecedores ADD COLUMN IF NOT EXISTS inscricao_estadual TEXT;
ALTER TABLE public.fornecedores ADD COLUMN IF NOT EXISTS estado TEXT;

CREATE TABLE IF NOT EXISTS public.fin_lancamento_itens (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    lancamento_id UUID REFERENCES public.fin_lancamentos(id) ON DELETE CASCADE,
    tipo TEXT DEFAULT 'SERVICO', -- PEÇA ou SERVIÇO
    descricao TEXT NOT NULL,
    quantidade NUMERIC(12,3) DEFAULT 1,
    valor_unitario NUMERIC(12,2) DEFAULT 0,
    centro_custo_id UUID REFERENCES public.fin_centros_custo(id),
    veiculo_id UUID REFERENCES public.veiculos(id),
    pessoa_nome TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fin_lancamento_adicionais (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    lancamento_id UUID REFERENCES public.fin_lancamentos(id) ON DELETE CASCADE,
    descricao TEXT NOT NULL,
    valor NUMERIC(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fin_lancamento_parcelas (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    lancamento_id UUID REFERENCES public.fin_lancamentos(id) ON DELETE CASCADE,
    numero_parcela INTEGER,
    data_vencimento DATE NOT NULL,
    valor NUMERIC(12,2) NOT NULL,
    status TEXT DEFAULT 'ABERTO',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 9. Real-time e RLS
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'fin_lancamento_itens'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE fin_lancamento_itens, fin_lancamento_adicionais, fin_lancamento_parcelas;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Publicação já configurada.';
END $$;

ALTER TABLE public.fin_lancamento_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_lancamento_adicionais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_lancamento_parcelas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso público itens" ON public.fin_lancamento_itens FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso público adicionais" ON public.fin_lancamento_adicionais FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso público parcelas" ON public.fin_lancamento_parcelas FOR ALL USING (true) WITH CHECK (true);

-- 8. Segurança RLS
ALTER TABLE public.fin_contas_bancarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_plano_contas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_centros_custo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_lancamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_rateios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_conciliacao ENABLE ROW LEVEL SECURITY;

-- Políticas (Tolerantes a erros se já existirem)
DO $$
BEGIN
    CREATE POLICY "Acesso público total fin_contas" ON public.fin_contas_bancarias FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$
BEGIN
    CREATE POLICY "Acesso público total fin_plano" ON public.fin_plano_contas FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$
BEGIN
    CREATE POLICY "Acesso público total fin_centros" ON public.fin_centros_custo FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$
BEGIN
    CREATE POLICY "Acesso público total fin_lancamentos" ON public.fin_lancamentos FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$
BEGIN
    CREATE POLICY "Acesso público total fin_rateios" ON public.fin_rateios FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$
BEGIN
    CREATE POLICY "Acesso público total fin_conciliado" ON public.fin_conciliacao FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Dados Iniciais Sugeridos (Plano de Contas)
INSERT INTO public.fin_plano_contas (codigo, nome, tipo) VALUES 
('1', 'RECEITAS', 'RECEITA'),
('1.1', 'Receitas de Serviços', 'RECEITA'),
('1.2', 'Receitas de Vendas', 'RECEITA'),
('2', 'DESPESAS', 'DESPESA'),
('2.1', 'Custos Operacionais', 'DESPESA'),
('2.1.01', 'Combustíveis', 'DESPESA'),
('2.1.02', 'Manutenção Frota', 'DESPESA'),
('2.2', 'Despesas Administrativas', 'DESPESA'),
('2.2.01', 'Aluguel', 'DESPESA'),
('2.2.02', 'Energia/Água/Internet', 'DESPESA'),
('2.3', 'Folha de Pagamento', 'DESPESA')
ON CONFLICT (codigo) DO NOTHING;

-- 13. Sequenciamento Automático de Registros (CAP/CAR)
CREATE SEQUENCE IF NOT EXISTS public.seq_fin_pagar START 1;
CREATE SEQUENCE IF NOT EXISTS public.seq_fin_receber START 1;

ALTER TABLE public.fin_lancamentos ADD COLUMN IF NOT EXISTS codigo_sequencial TEXT UNIQUE;

CREATE OR REPLACE FUNCTION public.fn_gerar_codigo_financeiro()
RETURNS TRIGGER AS $$
DECLARE
    prefixo TEXT;
    proximo_valor BIGINT;
BEGIN
    IF NEW.codigo_sequencial IS NOT NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.tipo = 'PAGAR' THEN
        prefixo := 'CAP-';
        SELECT nextval('public.seq_fin_pagar') INTO proximo_valor;
    ELSE
        prefixo := 'CAR-';
        SELECT nextval('public.seq_fin_receber') INTO proximo_valor;
    END IF;

    NEW.codigo_sequencial := prefixo || LPAD(proximo_valor::TEXT, 4, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_gerar_codigo_financeiro ON public.fin_lancamentos;
CREATE TRIGGER trg_gerar_codigo_financeiro
BEFORE INSERT ON public.fin_lancamentos
FOR EACH ROW
EXECUTE FUNCTION public.fn_gerar_codigo_financeiro();


/* --- File: receber_migration.sql --- */
-- Migração para Contas a Receber: Novos campos fiscais e de prazo
ALTER TABLE public.fin_lancamentos ADD COLUMN IF NOT EXISTS valor_inss NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.fin_lancamentos ADD COLUMN IF NOT EXISTS valor_iss NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.fin_lancamentos ADD COLUMN IF NOT EXISTS valor_ir NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.fin_lancamentos ADD COLUMN IF NOT EXISTS valor_tributo_total NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.fin_lancamentos ADD COLUMN IF NOT EXISTS prazo_pagamento INTEGER; -- em dias
ALTER TABLE public.fin_lancamentos ADD COLUMN IF NOT EXISTS previsao_pagamento DATE;
ALTER TABLE public.fin_lancamentos ADD COLUMN IF NOT EXISTS tipo_servico_produto TEXT CHECK (tipo_servico_produto IN ('PRODUTO', 'SERVICO'));


/* --- File: seed_plano_contas.sql --- */
-- 📑 PLANO DE CONTAS COMPLETO - FROTALINK (4 GRAUS)
-- Focado em Gestão de Frota, Logística e Transporte

-- Limpeza preventiva (opcional)
-- DELETE FROM public.fin_plano_contas;

-- ==========================================
-- GRAU 1: GRUPOS PRINCIPAIS
-- ==========================================
INSERT INTO public.fin_plano_contas (codigo, nome, tipo) VALUES 
('1', 'ATIVO', 'RECEITA'),
('2', 'PASSIVO', 'DESPESA'),
('3', 'RECEITA', 'RECEITA'),
('4', 'DESPESA', 'DESPESA')
ON CONFLICT (codigo) DO UPDATE SET nome = EXCLUDED.nome;

-- ==========================================
-- GRAU 2: SUBGRUPOS
-- ==========================================
INSERT INTO public.fin_plano_contas (codigo, nome, tipo, parent_id) VALUES 
-- ATIVO (1)
('1.1', 'CIRCULANTE', 'RECEITA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '1')),
('1.2', 'REALIZAVEL', 'RECEITA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '1')),
('1.3', 'IMOBILIZADO', 'RECEITA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '1')),
('1.4', 'INTANGIVEL', 'RECEITA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '1')),

-- PASSIVO (2)
('2.1', 'CIRCULANTE', 'DESPESA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '2')),
('2.2', 'NAO CIRCULANTE', 'DESPESA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '2')),
('2.3', 'PATRIMONIO LIQUIDO', 'DESPESA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '2')),

-- RECEITA (3)
('3.1', 'FRETES', 'RECEITA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '3')),
('3.2', 'SERVICOS LOGISTICOS', 'RECEITA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '3')),
('3.3', 'RECEITAS FINANCEIRAS', 'RECEITA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '3')),
('3.4', 'RECEITAS DIVERSAS', 'RECEITA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '3')),

-- DESPESA (4)
('4.1', 'CUSTOS OPERACIONAIS FROTA', 'DESPESA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '4')),
('4.2', 'DESPESAS ADMINISTRATIVAS', 'DESPESA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '4')),
('4.3', 'DESPESAS FINANCEIRAS', 'DESPESA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '4')),
('4.4', 'DESPESAS FIXAS', 'DESPESA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '4'))
ON CONFLICT (codigo) DO UPDATE SET nome = EXCLUDED.nome;

-- ==========================================
-- GRAU 3: CONTAS DE CONTROLE
-- ==========================================
INSERT INTO public.fin_plano_contas (codigo, nome, tipo, parent_id) VALUES 
-- ATIVO > IMOBILIZADO
('1.3.01', 'VEICULOS', 'RECEITA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '1.3')),
('1.3.02', 'IMPLEMENTOS (carretas, reboques)', 'RECEITA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '1.3')),
('1.3.03', 'EQUIPAMENTOS', 'RECEITA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '1.3')),

-- ATIVO > CIRCULANTE
('1.1.01', 'CAIXA', 'RECEITA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '1.1')),
('1.1.02', 'BANCOS', 'RECEITA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '1.1')),
('1.1.03', 'CONTAS A RECEBER', 'RECEITA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '1.1')),

-- PASSIVO > CIRCULANTE
('2.1.01', 'FORNECEDORES', 'DESPESA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '2.1')),
('2.1.02', 'CONTAS A PAGAR', 'DESPESA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '2.1')),
('2.1.03', 'IMPOSTOS', 'DESPESA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '2.1')),
('2.1.04', 'SALARIOS', 'DESPESA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '2.1')),

-- RECEITA > FRETES
('3.1.01', 'FRETES NACIONAIS', 'RECEITA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '3.1')),
('3.1.02', 'FRETES INTERNACIONAIS', 'RECEITA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '3.1')),

-- RECEITA > SERVICOS
('3.2.01', 'ARMAZENAGEM', 'RECEITA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '3.2')),
('3.2.02', 'LOGISTICA INTEGRADA', 'RECEITA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '3.2')),

-- DESPESA > CUSTOS OPERACIONAIS FROTA
('4.1.01', 'COMBUSTIVEL', 'DESPESA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '4.1')),
('4.1.02', 'PEDAGIOS', 'DESPESA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '4.1')),
('4.1.03', 'MANUTENCAO DE VEICULOS', 'DESPESA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '4.1')),
('4.1.04', 'PNEUS', 'DESPESA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '4.1')),
('4.1.05', 'SEGUROS DE VEICULOS', 'DESPESA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '4.1')),
('4.1.06', 'RASTREAMENTO', 'DESPESA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '4.1')),
('4.1.07', 'MOTORISTAS (custos diretos)', 'DESPESA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '4.1')),
('4.1.08', 'VEICULOS (DESPESAS)', 'DESPESA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '4.1')),

-- DESPESA > ADMINISTRATIVAS
('4.2.01', 'SALARIOS ADMINISTRATIVOS', 'DESPESA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '4.2')),
('4.2.02', 'SISTEMAS', 'DESPESA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '4.2')),
('4.2.03', 'CONTABILIDADE', 'DESPESA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '4.2')),
('4.2.04', 'MARKETING', 'DESPESA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '4.2')),

-- DESPESA > FINANCEIRAS
('4.3.01', 'JUROS', 'DESPESA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '4.3')),
('4.3.02', 'TARIFAS BANCARIAS', 'DESPESA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '4.3')),

-- DESPESA > FIXAS
('4.4.01', 'ALUGUEL', 'DESPESA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '4.4')),
('4.4.02', 'ENERGIA', 'DESPESA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '4.4')),
('4.4.03', 'INTERNET', 'DESPESA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '4.4'))
ON CONFLICT (codigo) DO UPDATE SET nome = EXCLUDED.nome;

-- ==========================================
-- GRAU 4: DETALHAMENTO OPERACIONAL (FROTA)
-- ==========================================
INSERT INTO public.fin_plano_contas (codigo, nome, tipo, parent_id) VALUES 
-- DESPESA > MANUTENCÃO
('4.1.03.001', 'MANUTENCAO PREVENTIVA', 'DESPESA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '4.1.03')),
('4.1.03.002', 'MANUTENCAO CORRETIVA', 'DESPESA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '4.1.03')),
('4.1.03.003', 'TROCA DE OLEO', 'DESPESA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '4.1.03')),
('4.1.03.004', 'REVISAO PERIODICA', 'DESPESA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '4.1.03')),
('4.1.03.005', 'MAO DE OBRA MECANICA', 'DESPESA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '4.1.03')),

-- DESPESA > PNEUS
('4.1.04.001', 'COMPRA DE PNEUS', 'DESPESA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '4.1.04')),
('4.1.04.002', 'RECAPAGEM', 'DESPESA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '4.1.04')),
('4.1.04.003', 'CONSERTO DE PNEUS', 'DESPESA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '4.1.04')),

-- DESPESA > COMBUSTIVEL
('4.1.01.001', 'DIESEL', 'DESPESA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '4.1.01')),
('4.1.01.002', 'GASOLINA', 'DESPESA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '4.1.01')),
('4.1.01.003', 'ARLA 32', 'DESPESA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '4.1.01')),

-- DESPESA > VEICULOS (TAXAS)
('4.1.08.001', 'LICENCIAMENTO', 'DESPESA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '4.1.08')),
('4.1.08.002', 'IPVA', 'DESPESA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '4.1.08')),
('4.1.08.003', 'MULTAS', 'DESPESA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '4.1.08')),

-- ATIVO > VEICULOS
('1.3.01.001', 'CAMINHOES', 'RECEITA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '1.3.01')),
('1.3.01.002', 'VANS', 'RECEITA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '1.3.01')),
('1.3.01.003', 'CARROS OPERACIONAIS', 'RECEITA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '1.3.01')),

-- RECEITA > FRETES
('3.1.01.001', 'FRETE POR KM', 'RECEITA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '3.1.01')),
('3.1.01.002', 'FRETE POR CONTRATO', 'RECEITA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '3.1.01')),
('3.1.01.003', 'FRETE SPOT', 'RECEITA', (SELECT id FROM public.fin_plano_contas WHERE codigo = '3.1.01'))
ON CONFLICT (codigo) DO UPDATE SET nome = EXCLUDED.nome;


/* --- File: seed_centros_custo.sql --- */
-- 🏗️ SEED: Centros de Custo Hierárquicos (2 Graus)
-- Focado em Estrutura Departamental para Logística

-- GRAU 1: GRUPOS PRINCIPAIS
INSERT INTO public.fin_centros_custo (codigo, nome) VALUES 
('1', 'OPERACIONAL'),
('2', 'MANUTENCAO'),
('3', 'ADMINISTRATIVO'),
('4', 'COMERCIAL'),
('5', 'FINANCEIRO'),
('6', 'TECNOLOGIA')
ON CONFLICT (codigo) DO UPDATE SET nome = EXCLUDED.nome;

-- GRAU 2: SUB-CENTROS
INSERT INTO public.fin_centros_custo (codigo, nome, parent_id) VALUES 
-- OPERACIONAL (1)
('1.1', 'TRANSPORTE', (SELECT id FROM public.fin_centros_custo WHERE codigo = '1')),
('1.2', 'LOGISTICA', (SELECT id FROM public.fin_centros_custo WHERE codigo = '1')),
('1.3', 'DISTRIBUICAO', (SELECT id FROM public.fin_centros_custo WHERE codigo = '1')),
('1.4', 'ARMAZENAGEM', (SELECT id FROM public.fin_centros_custo WHERE codigo = '1')),

-- MANUTENCAO (2)
('2.1', 'OFICINA INTERNA', (SELECT id FROM public.fin_centros_custo WHERE codigo = '2')),
('2.2', 'MANUTENCAO TERCEIRIZADA', (SELECT id FROM public.fin_centros_custo WHERE codigo = '2')),
('2.3', 'GESTAO DE PNEUS', (SELECT id FROM public.fin_centros_custo WHERE codigo = '2')),
('2.4', 'MANUTENCAO PREVENTIVA', (SELECT id FROM public.fin_centros_custo WHERE codigo = '2')),
('2.5', 'MANUTENCAO CORRETIVA', (SELECT id FROM public.fin_centros_custo WHERE codigo = '2')),

-- ADMINISTRATIVO (3)
('3.1', 'RECURSOS HUMANOS', (SELECT id FROM public.fin_centros_custo WHERE codigo = '3')),
('3.2', 'FINANCEIRO (DEP)', (SELECT id FROM public.fin_centros_custo WHERE codigo = '3')),
('3.3', 'JURIDICO', (SELECT id FROM public.fin_centros_custo WHERE codigo = '3')),
('3.4', 'CONTROLADORIA', (SELECT id FROM public.fin_centros_custo WHERE codigo = '3')),
('3.5', 'COMPRAS', (SELECT id FROM public.fin_centros_custo WHERE codigo = '3')),

-- COMERCIAL (4)
('4.1', 'VENDAS', (SELECT id FROM public.fin_centros_custo WHERE codigo = '4')),
('4.2', 'POS-VENDA', (SELECT id FROM public.fin_centros_custo WHERE codigo = '4')),
('4.3', 'ATENDIMENTO AO CLIENTE', (SELECT id FROM public.fin_centros_custo WHERE codigo = '4')),

-- FINANCEIRO (5)
('5.1', 'TESOURARIA', (SELECT id FROM public.fin_centros_custo WHERE codigo = '5')),
('5.2', 'CONTAS A PAGAR', (SELECT id FROM public.fin_centros_custo WHERE codigo = '5')),
('5.3', 'CONTAS A RECEBER', (SELECT id FROM public.fin_centros_custo WHERE codigo = '5')),
('5.4', 'CONCILIACAO BANCARIA', (SELECT id FROM public.fin_centros_custo WHERE codigo = '5')),

-- TECNOLOGIA (6)
('6.1', 'SISTEMAS', (SELECT id FROM public.fin_centros_custo WHERE codigo = '6')),
('6.2', 'INFRAESTRUTURA', (SELECT id FROM public.fin_centros_custo WHERE codigo = '6')),
('6.3', 'TELEMETRIA', (SELECT id FROM public.fin_centros_custo WHERE codigo = '6')),
('6.4', 'SUPORTE TI', (SELECT id FROM public.fin_centros_custo WHERE codigo = '6'))
ON CONFLICT (codigo) DO UPDATE SET nome = EXCLUDED.nome;


/* --- File: seed_contas_bancarias.sql --- */
-- 🏦 SEED: Contas Bancárias FROTALINK
ALTER TABLE public.fin_contas_bancarias ADD COLUMN IF NOT EXISTS pix TEXT;

INSERT INTO public.fin_contas_bancarias (nome, banco, agencia, numero_conta, pix, cor_identificacao, saldo_inicial, saldo_atual)
VALUES (
    'SICREDI - PRINCIPAL', 
    'SICREDI', 
    '0710', 
    '20072-6', 
    '24974011937', 
    '#34d399', 
    0, 
    0
);




