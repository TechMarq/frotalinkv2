/* === 15_dp_schema.sql === */
/* Módulo: Departamento Pessoal — FrotaLink */
/* Criado em: 2026-07 */

-- ============================================================
-- 1. CARGOS E SALÁRIOS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dp_cargos (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id      UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
    nome            TEXT NOT NULL,
    cbo             TEXT,                          -- Código Brasileiro de Ocupações
    nivel           TEXT,                          -- OPERACIONAL, TECNICO, SUPERVISAO, GERENCIAL, DIRETORIA
    setor           TEXT,                          -- Departamento/Setor
    salario_base    NUMERIC(12,2),
    salario_minimo  NUMERIC(12,2),
    salario_maximo  NUMERIC(12,2),
    carga_horaria   INTEGER DEFAULT 220,           -- horas mensais
    descricao       TEXT,                          -- Descrição do cargo
    requisitos      TEXT,                          -- Requisitos mínimos
    responsabilidades TEXT,
    beneficios_padrao TEXT,
    ativo           BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 2. FUNCIONÁRIOS (Cadastro Central)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dp_funcionarios (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id          UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
    matricula           TEXT,                      -- Matrícula interna
    -- Dados Pessoais
    nome_completo       TEXT NOT NULL,
    cpf                 TEXT,
    rg                  TEXT,
    rg_orgao_emissor    TEXT,
    rg_uf               TEXT,
    data_nascimento     DATE,
    sexo                TEXT,                      -- M, F, OUTRO
    estado_civil        TEXT,                      -- SOLTEIRO, CASADO, DIVORCIADO, VIUVO, UNIAO_ESTAVEL
    naturalidade        TEXT,
    nacionalidade       TEXT DEFAULT 'Brasileira',
    nome_mae            TEXT,
    nome_pai            TEXT,
    escolaridade        TEXT,                      -- FUNDAMENTAL, MEDIO, SUPERIOR, POS, MESTRADO, DOUTORADO
    -- Dados de Contato
    telefone            TEXT,
    celular             TEXT,
    email               TEXT,
    -- Endereço
    cep                 TEXT,
    logradouro          TEXT,
    numero              TEXT,
    complemento         TEXT,
    bairro              TEXT,
    cidade              TEXT,
    uf                  TEXT,
    -- Contato de Emergência
    emergencia_nome     TEXT,
    emergencia_telefone TEXT,
    emergencia_parentesco TEXT,
    -- Dados Trabalhistas
    cargo_id            UUID REFERENCES public.dp_cargos(id),
    cargo_nome          TEXT,                      -- Denormalizado para histórico
    setor               TEXT,
    data_admissao       DATE,
    data_demissao       DATE,
    tipo_contrato       TEXT DEFAULT 'CLT',        -- CLT, PJ, ESTAGIO, APRENDIZ, TEMPORARIO
    turno               TEXT,                      -- DIURNO, NOTURNO, 12X36, ESCALA
    salario             NUMERIC(12,2),
    status              TEXT DEFAULT 'ATIVO',      -- ATIVO, FERIAS, AFASTADO, DESLIGADO
    motivo_desligamento TEXT,
    -- Documentos Legais
    pis_pasep           TEXT,
    ctps_numero         TEXT,
    ctps_serie          TEXT,
    ctps_uf             TEXT,
    ctps_data_emissao   DATE,
    -- Dados Bancários
    banco               TEXT,
    agencia             TEXT,
    conta               TEXT,
    tipo_conta          TEXT,                      -- CORRENTE, POUPANCA, PAGAMENTO
    chave_pix           TEXT,
    -- Dados Adicionais
    foto_url            TEXT,
    observacoes         TEXT,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 3. ASO — ATESTADOS DE SAÚDE OCUPACIONAL
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dp_asos (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id          UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
    funcionario_id      UUID NOT NULL REFERENCES public.dp_funcionarios(id) ON DELETE CASCADE,
    tipo                TEXT NOT NULL,             -- ADMISSIONAL, PERIODICO, MUDANCA_FUNCAO, RETORNO_TRABALHO, DEMISSIONAL
    data_exame          DATE NOT NULL,
    data_vencimento     DATE,                      -- Para periódicos
    periodicidade_meses INTEGER,                   -- 6, 12, 24 meses
    medico_nome         TEXT,
    medico_crm          TEXT,
    clinica             TEXT,
    resultado           TEXT DEFAULT 'APTO',       -- APTO, INAPTO, APTO_COM_RESTRICOES
    restricoes          TEXT,
    exames_realizados   TEXT,                      -- Lista de exames feitos (JSON ou texto)
    observacoes         TEXT,
    arquivo_url         TEXT,                      -- Link para PDF do ASO
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 4. FÉRIAS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dp_ferias (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id          UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
    funcionario_id      UUID NOT NULL REFERENCES public.dp_funcionarios(id) ON DELETE CASCADE,
    -- Período Aquisitivo
    periodo_aq_inicio   DATE NOT NULL,
    periodo_aq_fim      DATE NOT NULL,
    -- Período Concessivo (prazo para gozar)
    periodo_conc_fim    DATE,                      -- Calculado: aq_fim + 12 meses
    -- Programação/Gozo
    data_inicio_gozo    DATE,
    data_fim_gozo       DATE,
    dias_gozados        INTEGER,
    -- Opções Legais
    abono_pecuniario    BOOLEAN DEFAULT false,     -- Venda de 10 dias
    dias_abono          INTEGER DEFAULT 0,
    -- Adiantamento 13º
    adiantamento_13     BOOLEAN DEFAULT false,
    -- Parcelamento (CLT permite até 3 períodos)
    parcela_numero      INTEGER DEFAULT 1,         -- 1, 2 ou 3
    -- Status
    status              TEXT DEFAULT 'AQUISITIVO', -- AQUISITIVO, PROGRAMADA, EM_GOZO, CONCLUIDA, VENCIDA
    -- Financeiro
    data_pagamento      DATE,
    valor_pago          NUMERIC(12,2),
    observacoes         TEXT,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 5. PONTO — BANCO DE HORAS, FALTAS E ATRASOS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dp_ponto (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id          UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
    funcionario_id      UUID NOT NULL REFERENCES public.dp_funcionarios(id) ON DELETE CASCADE,
    data                DATE NOT NULL,
    tipo                TEXT NOT NULL,             -- FALTA, ATRASO, HORA_EXTRA, SAIDA_ANTECIPADA
    minutos             INTEGER,                   -- Minutos de atraso / hora extra / saída antecipada
    justificativa       TEXT,
    justificado         BOOLEAN DEFAULT false,
    aprovado_por        TEXT,
    observacoes         TEXT,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 6. ATESTADOS MÉDICOS E AFASTAMENTOS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dp_atestados (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id          UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
    funcionario_id      UUID NOT NULL REFERENCES public.dp_funcionarios(id) ON DELETE CASCADE,
    tipo                TEXT NOT NULL,             -- ATESTADO_MEDICO, AFASTAMENTO_INSS, ACIDENTE_TRABALHO, LICENCA_MATERNIDADE, LICENCA_PATERNIDADE, OUTROS
    data_inicio         DATE NOT NULL,
    data_fim            DATE,
    dias                INTEGER,                   -- Calculado automaticamente
    cid                 TEXT,                      -- Código CID-10
    medico_nome         TEXT,
    medico_crm          TEXT,
    -- INSS (para afastamentos longos > 15 dias)
    numero_beneficio    TEXT,
    data_pericia        DATE,
    -- Resultado
    status              TEXT DEFAULT 'ATIVO',      -- ATIVO, ENCERRADO, INDEFERIDO
    retorno_efetivo     DATE,                      -- Data real de retorno
    observacoes         TEXT,
    arquivo_url         TEXT,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 7. EPIs — EQUIPAMENTOS DE PROTEÇÃO INDIVIDUAL
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dp_epis (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id          UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
    funcionario_id      UUID NOT NULL REFERENCES public.dp_funcionarios(id) ON DELETE CASCADE,
    nome_epi            TEXT NOT NULL,
    ca_numero           TEXT,                      -- Certificado de Aprovação (MTE)
    ca_vencimento       DATE,                      -- Vencimento do CA
    fabricante          TEXT,
    data_entrega        DATE NOT NULL,
    data_devolucao      DATE,
    data_vencimento_epi DATE,                      -- Vencimento do EPI em si (vida útil)
    quantidade          INTEGER DEFAULT 1,
    motivo              TEXT,                      -- ADMISSIONAL, TROCA_PERIODICA, DESGASTE, PERDA, OUTROS
    assinatura_recebido BOOLEAN DEFAULT false,     -- Funcionário assinou o recibo
    observacoes         TEXT,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 8. UNIFORMES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dp_uniformes (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id          UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
    funcionario_id      UUID NOT NULL REFERENCES public.dp_funcionarios(id) ON DELETE CASCADE,
    item                TEXT NOT NULL,             -- Camisa, Calça, Bota, etc.
    tamanho             TEXT,
    quantidade          INTEGER DEFAULT 1,
    data_entrega        DATE NOT NULL,
    data_devolucao      DATE,
    estado              TEXT DEFAULT 'NOVO',       -- NOVO, BOM, DESGASTADO, DANIFICADO
    motivo              TEXT,                      -- ADMISSIONAL, TROCA, PERDA, OUTROS
    observacoes         TEXT,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 9. BENEFÍCIOS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dp_beneficios (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id          UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
    funcionario_id      UUID NOT NULL REFERENCES public.dp_funcionarios(id) ON DELETE CASCADE,
    tipo                TEXT NOT NULL,             -- VT, VA, VR, PLANO_SAUDE, PLANO_ODONTO, SEGURO_VIDA, OUTROS
    descricao           TEXT,
    valor               NUMERIC(12,2),
    valor_desconto_func NUMERIC(12,2) DEFAULT 0,   -- Desconto em folha do funcionário
    operadora           TEXT,
    numero_cartao       TEXT,
    data_inicio         DATE NOT NULL,
    data_fim            DATE,
    ativo               BOOLEAN DEFAULT true,
    observacoes         TEXT,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 10. CONTRATOS DE EXPERIÊNCIA
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dp_contratos_exp (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id          UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
    funcionario_id      UUID NOT NULL REFERENCES public.dp_funcionarios(id) ON DELETE CASCADE,
    data_inicio         DATE NOT NULL,
    -- Período 1 (45 dias)
    data_fim_45         DATE,                      -- data_inicio + 45 dias
    status_45           TEXT DEFAULT 'PENDENTE',   -- PENDENTE, APROVADO, REPROVADO, PRORROGADO
    avaliacao_45        TEXT,
    data_avaliacao_45   DATE,
    avaliador_45        TEXT,
    -- Período 2 (90 dias — prorrogação)
    data_fim_90         DATE,                      -- data_inicio + 90 dias
    status_90           TEXT DEFAULT 'PENDENTE',   -- PENDENTE, APROVADO, REPROVADO, EFETIVADO
    avaliacao_90        TEXT,
    data_avaliacao_90   DATE,
    avaliador_90        TEXT,
    -- Resultado Final
    resultado_final     TEXT,                      -- EFETIVADO, DESLIGADO
    data_efetivacao     DATE,
    observacoes         TEXT,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 11. CHECKLIST DE EXPERIÊNCIA (45 e 90 dias)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dp_checklist_exp (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id          UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
    funcionario_id      UUID NOT NULL REFERENCES public.dp_funcionarios(id) ON DELETE CASCADE,
    contrato_exp_id     UUID REFERENCES public.dp_contratos_exp(id) ON DELETE CASCADE,
    periodo             TEXT NOT NULL,             -- 45_DIAS, 90_DIAS
    data_avaliacao      DATE,
    avaliador           TEXT,
    -- Critérios de Avaliação (1 a 5)
    pontualidade        INTEGER CHECK (pontualidade BETWEEN 1 AND 5),
    assiduidade         INTEGER CHECK (assiduidade BETWEEN 1 AND 5),
    producao            INTEGER CHECK (producao BETWEEN 1 AND 5),
    qualidade           INTEGER CHECK (qualidade BETWEEN 1 AND 5),
    relacionamento      INTEGER CHECK (relacionamento BETWEEN 1 AND 5),
    iniciativa          INTEGER CHECK (iniciativa BETWEEN 1 AND 5),
    disciplina          INTEGER CHECK (disciplina BETWEEN 1 AND 5),
    apresentacao        INTEGER CHECK (apresentacao BETWEEN 1 AND 5),
    conhecimento_tecnico INTEGER CHECK (conhecimento_tecnico BETWEEN 1 AND 5),
    adaptacao           INTEGER CHECK (adaptacao BETWEEN 1 AND 5),
    -- Resultado
    nota_media          NUMERIC(4,2),              -- Calculada automaticamente
    recomendacao        TEXT,                      -- EFETIVADO, PRORROGAR, DESLIGAR
    comentarios         TEXT,
    assinatura_func     BOOLEAN DEFAULT false,
    assinatura_gestor   BOOLEAN DEFAULT false,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- ÍNDICES DE PERFORMANCE
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_dp_funcionarios_empresa ON public.dp_funcionarios(empresa_id);
CREATE INDEX IF NOT EXISTS idx_dp_funcionarios_status ON public.dp_funcionarios(status);
CREATE INDEX IF NOT EXISTS idx_dp_funcionarios_cargo ON public.dp_funcionarios(cargo_id);
CREATE INDEX IF NOT EXISTS idx_dp_asos_funcionario ON public.dp_asos(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_dp_asos_vencimento ON public.dp_asos(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_dp_ferias_funcionario ON public.dp_ferias(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_dp_ferias_status ON public.dp_ferias(status);
CREATE INDEX IF NOT EXISTS idx_dp_ponto_funcionario ON public.dp_ponto(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_dp_ponto_data ON public.dp_ponto(data);
CREATE INDEX IF NOT EXISTS idx_dp_atestados_funcionario ON public.dp_atestados(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_dp_epis_funcionario ON public.dp_epis(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_dp_epis_ca_vencimento ON public.dp_epis(ca_vencimento);
CREATE INDEX IF NOT EXISTS idx_dp_contratos_funcionario ON public.dp_contratos_exp(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_dp_beneficios_funcionario ON public.dp_beneficios(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_dp_cargos_empresa ON public.dp_cargos(empresa_id);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE public.dp_cargos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dp_funcionarios   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dp_asos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dp_ferias         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dp_ponto          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dp_atestados      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dp_epis           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dp_uniformes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dp_beneficios     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dp_contratos_exp  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dp_checklist_exp  ENABLE ROW LEVEL SECURITY;

-- Políticas abertas (iguais ao padrão das demais tabelas do sistema)
DO $$ DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'dp_cargos','dp_funcionarios','dp_asos','dp_ferias','dp_ponto',
    'dp_atestados','dp_epis','dp_uniformes','dp_beneficios',
    'dp_contratos_exp','dp_checklist_exp'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Allow all for authenticated" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "Allow all for authenticated" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      t
    );
  END LOOP;
END $$;

-- ============================================================
-- REAL-TIME (opcional - adicionar se necessário)
-- ============================================================
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'dp_funcionarios') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.dp_funcionarios;
    END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
