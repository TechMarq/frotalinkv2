/* === 02_estoque_vendas_schema.sql === */

/* --- File: estoque_migration.sql --- */
-- 0. Tabelas Auxiliares
CREATE TABLE IF NOT EXISTS public.estoque_categorias (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    nome text NOT NULL UNIQUE,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.estoque_unidades (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    nome text NOT NULL UNIQUE,
    sigla text NOT NULL UNIQUE,
    created_at timestamptz DEFAULT now()
);

-- 1. Tabela de Produtos (Estoque)
CREATE TABLE IF NOT EXISTS public.estoque (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    nome text NOT NULL,
    marca text,
    ref text,
    codigo_barras text,
    codigo_interno text UNIQUE,
    categoria text,
    aplicacao text,
    descricao text,
    estoque_atual numeric DEFAULT 0,
    estoque_minimo numeric DEFAULT 5,
    unidade text DEFAULT 'UN',
    valor_custo numeric DEFAULT 0,
    valor_venda numeric DEFAULT 0,
    status text DEFAULT 'ATIVO',
    created_at timestamptz DEFAULT now()
);

-- 2. Tabela de Movimentações (Entradas, Saídas e Estornos)
CREATE TABLE IF NOT EXISTS public.estoque_movimentacoes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    item_id uuid REFERENCES public.estoque(id) ON DELETE CASCADE,
    tipo text CHECK (tipo IN ('ENTRADA', 'SAIDA', 'ESTORNO')),
    quantidade numeric NOT NULL,
    valor_unitario numeric DEFAULT 0,
    lucro numeric DEFAULT 0,
    data timestamptz DEFAULT now(),
    motivo text,
    responsavel text,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.estoque_modelos (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    marca text,
    modelo text NOT NULL,
    potencia text,
    ano text,
    created_at timestamptz DEFAULT now()
);

-- Seed Categorias Populares
INSERT INTO public.estoque_categorias (nome) VALUES 
('MECÂNICA'), ('ELÉTRICA'), ('FILTROS'), ('LUBRIFICANTES'), ('PNEUS'), 
('SUSPENSÃO'), ('FREIOS'), ('ILUMINAÇÃO'), ('ARREFECIMENTO'), 
('CARROCERIA'), ('ACESSÓRIOS'), ('FERRAMENTAS')
ON CONFLICT (nome) DO NOTHING;

-- Seed Unidades Comuns
INSERT INTO public.estoque_unidades (nome, sigla) VALUES 
('Unidade', 'UN'), ('Peça', 'PC'), ('Litro', 'LT'), ('Quilo', 'KG'), 
('Metro', 'MT'), ('Conjunto', 'CJ'), ('Jogo', 'JG'), ('Kit', 'KT')
ON CONFLICT (nome) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.estoque_fornecedores (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    nome text NOT NULL UNIQUE,
    created_at timestamptz DEFAULT now()
);

-- 3. Habilitar RLS
ALTER TABLE public.estoque ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estoque_movimentacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estoque_categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estoque_unidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estoque_modelos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estoque_fornecedores ENABLE ROW LEVEL SECURITY;

-- 4. Políticas de Acesso
-- 4. Políticas de Acesso (Deletar se existir para evitar erro de duplicata)
DROP POLICY IF EXISTS "Allow all on estoque" ON public.estoque;
CREATE POLICY "Allow all on estoque" ON public.estoque FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all on mov" ON public.estoque_movimentacoes;
CREATE POLICY "Allow all on mov" ON public.estoque_movimentacoes FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all on cats" ON public.estoque_categorias;
CREATE POLICY "Allow all on cats" ON public.estoque_categorias FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all on units" ON public.estoque_unidades;
CREATE POLICY "Allow all on units" ON public.estoque_unidades FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all on models" ON public.estoque_modelos;
CREATE POLICY "Allow all on models" ON public.estoque_modelos FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all on suppliers" ON public.estoque_fornecedores;
CREATE POLICY "Allow all on suppliers" ON public.estoque_fornecedores FOR ALL USING (true);

-- 5. Marcas do Produto
CREATE TABLE IF NOT EXISTS public.estoque_marcas (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    nome text NOT NULL UNIQUE,
    created_at timestamptz DEFAULT now()
);
ALTER TABLE public.estoque_marcas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on brands" ON public.estoque_marcas;
CREATE POLICY "Allow all on brands" ON public.estoque_marcas FOR ALL USING (true);

-- Seed Marcas Comuns
INSERT INTO public.estoque_marcas (nome) VALUES 
('BOSCH'), ('COBREQ'), ('VALEO'), ('FRAS-LE'), ('MAHLE'), ('FRAM')
ON CONFLICT (nome) DO NOTHING;


/* --- File: vendas_migration.sql --- */
-- 1. Sequência para Código de Venda (VD-0001)
CREATE SEQUENCE IF NOT EXISTS public.venda_codigo_seq START 1;

-- 2. Tabela de Vendas / Saídas de Produto
CREATE TABLE IF NOT EXISTS public.vendas (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    codigo TEXT UNIQUE NOT NULL DEFAULT ('VD-' || LPAD(nextval('public.venda_codigo_seq')::text, 4, '0')),
    data TIMESTAMPTZ DEFAULT now(),
    tipo TEXT CHECK (tipo IN ('SIMPLES', 'OS', 'EXTERNA')),
    veiculo_id UUID REFERENCES public.veiculos(id),
    placa TEXT, -- Para casos onde o veículo não está no cadastro formal ou apenas referência rápida
    os_id UUID, -- Placeholder para integração futura com Ordem de Serviço
    cliente_nome TEXT, -- Para venda externa
    valor_bruto NUMERIC(12,2) DEFAULT 0,
    desconto_tipo TEXT CHECK (desconto_tipo IN ('PORCENTAGEM', 'VALOR')),
    desconto_valor NUMERIC(12,2) DEFAULT 0,
    acrescimo_tipo TEXT CHECK (acrescimo_tipo IN ('PORCENTAGEM', 'VALOR')),
    acrescimo_valor NUMERIC(12,2) DEFAULT 0,
    valor_total NUMERIC(12,2) DEFAULT 0,
    status_pagamento TEXT DEFAULT 'PENDENTE' CHECK (status_pagamento IN ('PENDENTE', 'PAGO')),
    data_pagamento TIMESTAMPTZ,
    observacoes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Tabela de Itens da Venda (Relacionamento N para N entre Vendas e Estoque)
CREATE TABLE IF NOT EXISTS public.venda_itens (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    venda_id UUID REFERENCES public.vendas(id) ON DELETE CASCADE,
    produto_id UUID REFERENCES public.estoque(id),
    quantidade NUMERIC(12,3) NOT NULL,
    valor_unitario NUMERIC(12,2) NOT NULL,
    desconto_tipo TEXT,
    desconto_valor NUMERIC(12,2) DEFAULT 0,
    acrescimo_tipo TEXT,
    acrescimo_valor NUMERIC(12,2) DEFAULT 0,
    subtotal NUMERIC(12,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Habilitar Real-time (Caso queira observar mudanças em tempo real)
-- Nota: Verifique se a publicação 'supabase_realtime' já existe no seu projeto.
-- ALTER PUBLICATION supabase_realtime ADD TABLE vendas, venda_itens;

-- 5. Habilitar Row Level Security (RLS)
ALTER TABLE public.vendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venda_itens ENABLE ROW LEVEL SECURITY;

-- 6. Políticas de Acesso (Abertas para teste - Ajuste conforme necessário em produção)
CREATE POLICY "Allow all on vendas" ON public.vendas FOR ALL USING (true);
CREATE POLICY "Allow all on venda_itens" ON public.venda_itens FOR ALL USING (true);

-- Comentário: A geração do código VD-XXXX é automática via SEQUENCE no Postgres.
-- Mesmo que uma venda seja excluída, o número da sequência avançará, garantindo que não se repita.



