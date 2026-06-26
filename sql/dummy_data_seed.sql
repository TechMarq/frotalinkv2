-- Script de Geração de Dados Fictícios para FrotaLink
-- Este script popula as tabelas com dados de exemplo para teste do sistema.

-- Limpar dados existentes (OPCIONAL - CUIDADO: Remove dados reais se houver)
-- TRUNCATE public.manutencoes, public.abastecimentos, public.veiculos, public.motoristas, public.fornecedores RESTART IDENTITY CASCADE;

-- 1. Inserir Motoristas
INSERT INTO public.motoristas (nome_completo, contato_whatsapp, cpf, registro_cnh, vencimento_cnh, categoria_cnh, data_nascimento, status)
VALUES 
('João Silva de Oliveira', '(11) 98888-7777', '123.456.789-01', '12345678901', '2028-05-20', 'AD', '1985-03-15', 'ATIVO'),
('Maria Santos Ferreira', '(11) 97777-6666', '234.567.890-12', '23456789012', '2027-10-12', 'B', '1990-07-22', 'ATIVO'),
('Carlos Pereira Souza', '(11) 96666-5555', '345.678.901-23', '34567890123', '2026-12-30', 'E', '1982-11-05', 'ATIVO'),
('Ana Paula Mendes', '(11) 95555-4444', '456.789.012-34', '45678901234', '2029-01-15', 'D', '1995-05-10', 'ATIVO');

-- 2. Inserir Fornecedores (Postos e Oficinas)
INSERT INTO public.fornecedores (nome, categoria, cnpj_cpf, cidade, estado)
VALUES 
('Posto Ipiranga Rota 10', 'POSTO', '11.111.111/0001-01', 'São Paulo', 'SP'),
('Auto Posto Shell Central', 'POSTO', '22.222.222/0001-02', 'São Paulo', 'SP'),
('Mecânica Diesel Express', 'MECANICA', '33.333.333/0001-03', 'Guarulhos', 'SP'),
('Pneus & Cia', 'PEÇAS', '44.444.444/0001-04', 'Campinas', 'SP'),
('Oficina do Zé Lanternagem', 'MECANICA', '55.555.555/0001-05', 'São Bernardo', 'SP');

-- 3. Inserir Veículos (Vinculando alguns ao primeiro motorista para teste)
DO $$
DECLARE
    motorista_id UUID;
BEGIN
    SELECT id INTO motorista_id FROM public.motoristas WHERE nome_completo = 'João Silva de Oliveira' LIMIT 1;

    INSERT INTO public.veiculos (placa, modelo, marca, ano_fabricacao, ano_modelo, cor, classificacao, condutor_principal_id, status)
    VALUES 
    ('ABC-1234', 'Gol G8', 'VW', 2022, 2023, 'BRANCO', 'PROPRIO', motorista_id, 'ATIVO'),
    ('XYZ-9876', 'Hilux SRV', 'TOYOTA', 2021, 2021, 'PRATA', 'PROPRIO', NULL, 'ATIVO'),
    ('KJH-5522', 'F-4000', 'FORD', 2018, 2019, 'AZUL', 'TERCEIRO', NULL, 'ATIVO'),
    ('MOT-0001', 'S10 High Country', 'GM', 2023, 2024, 'PRETO', 'DIRETORIA', (SELECT id FROM public.motoristas WHERE nome_completo = 'Ana Paula Mendes' LIMIT 1), 'ATIVO');
END $$;

-- 4. Inserir Abastecimentos Fictícios (Últimos 30 dias)
DO $$
DECLARE
    veiculo_abc UUID;
    veiculo_xyz UUID;
    posto_1 UUID;
    posto_2 UUID;
BEGIN
    SELECT id INTO veiculo_abc FROM public.veiculos WHERE placa = 'ABC-1234' LIMIT 1;
    SELECT id INTO veiculo_xyz FROM public.veiculos WHERE placa = 'XYZ-9876' LIMIT 1;
    SELECT id INTO posto_1 FROM public.fornecedores WHERE nome = 'Posto Ipiranga Rota 10' LIMIT 1;
    SELECT id INTO posto_2 FROM public.fornecedores WHERE nome = 'Auto Posto Shell Central' LIMIT 1;

    -- Abastecimentos para ABC-1234
    INSERT INTO public.abastecimentos (veiculo_id, data, km_atual, litros, valor_total, posto_id, tipo_combustivel)
    VALUES 
    (veiculo_abc, current_date - interval '15 days', 10500, 42.5, 235.50, posto_1, 'GASOLINA'),
    (veiculo_abc, current_date - interval '7 days', 11200, 45.0, 248.85, posto_2, 'GASOLINA'),
    (veiculo_abc, current_date - interval '1 day', 11950, 40.0, 222.00, posto_1, 'GASOLINA');

    -- Abastecimentos para XYZ-9876
    INSERT INTO public.abastecimentos (veiculo_id, data, km_atual, litros, valor_total, posto_id, tipo_combustivel)
    VALUES 
    (veiculo_xyz, current_date - interval '10 days', 45200, 75.0, 465.00, posto_1, 'DIESEL S10'),
    (veiculo_xyz, current_date - interval '3 days', 46100, 70.0, 434.00, posto_1, 'DIESEL S10');
END $$;

-- 5. Inserir Manutenções Fictícias
DO $$
DECLARE
    veiculo_abc UUID;
    veiculo_f4000 UUID;
    oficina UUID;
    oficina_pneus UUID;
BEGIN
    SELECT id INTO veiculo_abc FROM public.veiculos WHERE placa = 'ABC-1234' LIMIT 1;
    SELECT id INTO veiculo_f4000 FROM public.veiculos WHERE placa = 'KJH-5522' LIMIT 1;
    SELECT id INTO oficina FROM public.fornecedores WHERE nome = 'Mecânica Diesel Express' LIMIT 1;
    SELECT id INTO oficina_pneus FROM public.fornecedores WHERE nome = 'Pneus & Cia' LIMIT 1;

    -- Manutenção Concluída
    INSERT INTO public.manutencoes (veiculo_id, data, km_atual, tipo_acao, descricao, fornecedor_id, valor_total, controle_proxima, proxima_revisao_km)
    VALUES 
    (veiculo_abc, current_date - interval '45 days', 9500, 'SERVICO', 'Troca de Óleo e Filtros - Revisão 10k', oficina, 850.00, 'KM', 19500);

    -- Troca de Pneus
    INSERT INTO public.manutencoes (veiculo_id, data, km_atual, tipo_acao, descricao, fornecedor_id, valor_total, tem_garantia, garantia_meses)
    VALUES 
    (veiculo_f4000, current_date - interval '20 days', 125000, 'TROCA', 'Troca dos 2 Pneus Dianteiros', oficina_pneus, 2400.00, TRUE, 12);

    -- Manutenção Corretiva
    INSERT INTO public.manutencoes (veiculo_id, data, km_atual, tipo_acao, descricao, fornecedor_id, valor_total, status)
    VALUES 
    (veiculo_abc, current_date - interval '5 days', 11800, 'SERVICO', 'Reparo no ar-condicionado', oficina, 420.00, 'CONCLUIDO');
END $$;
