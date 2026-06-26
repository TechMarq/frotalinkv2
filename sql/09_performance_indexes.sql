-- =========================================================================
-- 09_PERFORMANCE_INDEXES.SQL
-- Criação de índices para otimização de consultas e relatórios (FrotaLink)
-- =========================================================================

-- 1. Tabela Veículos
CREATE INDEX IF NOT EXISTS idx_veiculos_placa ON public.veiculos(placa);
CREATE INDEX IF NOT EXISTS idx_veiculos_status ON public.veiculos(status);
CREATE INDEX IF NOT EXISTS idx_veiculos_classificacao ON public.veiculos(classificacao);

-- 2. Tabela Motoristas
CREATE INDEX IF NOT EXISTS idx_motoristas_status ON public.motoristas(status);
CREATE INDEX IF NOT EXISTS idx_motoristas_cnh ON public.motoristas(registro_cnh);

-- 3. Tabela Abastecimentos
CREATE INDEX IF NOT EXISTS idx_abastecimentos_veiculo ON public.abastecimentos(veiculo_id);
CREATE INDEX IF NOT EXISTS idx_abastecimentos_motorista ON public.abastecimentos(motorista_id);
CREATE INDEX IF NOT EXISTS idx_abastecimentos_posto ON public.abastecimentos(posto_id);
CREATE INDEX IF NOT EXISTS idx_abastecimentos_data ON public.abastecimentos(data);
CREATE INDEX IF NOT EXISTS idx_abastecimentos_combustivel ON public.abastecimentos(tipo_combustivel);

-- 4. Tabela Manutenções
CREATE INDEX IF NOT EXISTS idx_manutencoes_veiculo ON public.manutencoes(veiculo_id);
CREATE INDEX IF NOT EXISTS idx_manutencoes_motorista ON public.manutencoes(motorista_id);
CREATE INDEX IF NOT EXISTS idx_manutencoes_fornecedor ON public.manutencoes(fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_manutencoes_data ON public.manutencoes(data);
CREATE INDEX IF NOT EXISTS idx_manutencoes_status ON public.manutencoes(status);

-- 5. Tabela Lançamentos Financeiros (se existirem, como fin_lancamentos ou lancamentos)
CREATE INDEX IF NOT EXISTS idx_fin_lancamentos_conta ON public.fin_lancamentos(conta_bancaria_id);
CREATE INDEX IF NOT EXISTS idx_fin_lancamentos_data_vencimento ON public.fin_lancamentos(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_fin_lancamentos_status ON public.fin_lancamentos(status);
CREATE INDEX IF NOT EXISTS idx_fin_lancamentos_tipo ON public.fin_lancamentos(tipo);

-- 6. Tabela Estoque / Compras
CREATE INDEX IF NOT EXISTS idx_compras_fornecedor ON public.compras(fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_compras_data ON public.compras(data_emissao);


-- 7. Tabela User Access
CREATE INDEX IF NOT EXISTS idx_user_access_email ON public.user_access(email);
CREATE INDEX IF NOT EXISTS idx_user_access_role ON public.user_access(role);

-- Nota: Como o Supabase cria índices automáticos para as chaves primárias (id),
-- não precisamos declarar índices de Primary Keys aqui.
