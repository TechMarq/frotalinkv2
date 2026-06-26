const SUPABASE_URL = 'https://ffgwqsrfmmcqwjjkbrsq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmZ3dxc3JmbW1jcXdqamticnNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NDA3MDEsImV4cCI6MjA5MDAxNjcwMX0.bLHIvQENAcGZ0i0zk85oW7NPvGuMtJey7RqzORcqf0U';

const rawInput = `
1. ATIVO (G1)
1.1 CIRCULANTE (G2)
1.1.01 DISPONIBILIDADES (G3)
1.1.01.001 Caixa Geral (G4)
1.1.01.002 Bancos Conta Movimento (G4)
1.1.01.003 Aplicações Financeiras de Liquidez Imediata (G4)
1.1.02 CONTAS A RECEBER (G3)
1.1.02.001 Clientes - Faturamento Nacional (G4)
1.1.02.002 Clientes - Faturamento Internacional (G4)
1.1.02.003 (-) Provisão para Créditos de Liquidação Duvidosa (PCLD) (G4)
1.1.03 ESTOQUES (G3)
1.1.03.001 Peças de Reposição Mecânica (Motores, Câmbio, Suspensão) (G4)
1.1.03.002 Componentes Elétricos e Eletrônicos (G4)
1.1.03.003 Pneus e Câmaras de Ar (Novos em Estoque) (G4)
1.1.03.004 Óleos, Lubrificantes e Fluidos (G4)
1.1.03.005 Materiais de Consumo e Oficina (EPIs, Estopas, Ferramentas Descartáveis) (G4)
1.1.03.006 Combustível em Tanque Próprio (Abastecimento Interno) (G4)
1.1.04 IMPOSTOS A RECUPERAR (G3)
1.1.04.001 ICMS sobre Fretes/Combustíveis a Recuperar (G4)
1.1.04.002 PIS a Recuperar (G4)
1.1.04.003 COFINS a Recuperar (G4)
1.1.05 DESPESAS ANTECIPADAS (G3)
1.1.05.001 Prêmios de Seguros Corridos a Apropriar (RCF-DC, RCTR-C, Frota) (G4)
1.1.05.002 IPVA / Licenciamento Antecipado (G4)
1.2 NÃO CIRCULANTE (G2)
1.2.01 REALIZÁVEL A LONGO PRAZO (G3)
1.2.01.001 Depósitos Judiciais (G4)
1.2.02 IMOBILIZADO (G3)
1.2.02.010 FROTA DE VEÍCULOS (G4)
1.2.02.010.001 Caminhões / Cavalos Mecânicos (G5)
1.2.02.010.002 Vans e Utilitários (G5)
1.2.02.010.003 Carros Operacionais (G5)
1.2.02.010.004 Implementos Rodoviários (Carretas, Reboques, Baús) (G5)
1.2.02.010.005 Grandes Componentes a Capitalizar (Motores/Câmbios Novos Intercambiáveis) (G5)
1.2.02.020 MÁQUINAS, EQUIPAMENTOS E FERRAMENTAS (G4)
1.2.02.020.001 Ferramental de Oficina (Elevadores, Compressores, Scanners) (G5)
1.2.02.020.002 Equipamentos de TI e Sistemas de Rastreamento Físicos (G5)
1.2.02.030 IMÓVEIS E BENFEITORIAS (G4)
1.2.02.030.001 Benfeitorias em Imóveis de Terceiros (Garagem/Pátio/Oficina) (G5)
1.2.02.090 (-) DEPRECIAÇÃO ACUMULADA (G4)
1.2.02.090.001 (-) Depreciação Acumulada - Frota (G5)
1.2.02.090.002 (-) Depreciação Acumulada - Implementos (G5)
1.2.02.090.003 (-) Depreciação Acumulada - Ferramentas e Equipamentos (G5)
1.2.03 INTANGÍVEL (G3)
1.2.03.001 Softwares, ERPs e Licenças de TMS/WMS (G4)
2. PASSIVO E PATRIMÔNIO LÍQUIDO (G1)
2.1 CIRCULANTE (G2)
2.1.01 FORNECEDORES (G3)
2.1.01.001 Fornecedores Nacionais - Peças e Autopeças (G4)
2.1.01.002 Fornecedores Nacionais - Combustíveis e Lubrificantes (G4)
2.1.01.003 Fornecedores de Serviços (Oficinas Externas/Terceiros) (G4)
2.1.02 OBRIGAÇÕES TRABALHISTAS E SOCIAIS (G3)
2.1.02.001 Salários e Ordenados a Pagar (Motoristas e Mecânicos) (G4)
2.1.02.002 Salários a Pagar - Administrativo (G4)
2.1.02.003 Provisão de Férias e Encargos (G4)
2.1.02.004 Provisão de 13º Salário e Encargos (G4)
2.1.02.005 FGTS / INSS / IRRF sobre Folha a Recolher (G4)
2.1.03 OBRIGAÇÕES FISCAIS / TRIBUTÁRIAS (G3)
2.1.03.001 ICMS sobre Fretes a Recolher (G4)
2.1.03.002 ISSQN sobre Serviços de Logística (G4)
2.1.03.003 PIS / COFINS / IRPJ / CSLL a Recolher (G4)
2.1.04 EMPRÉSTIMOS E FINANCIAMENTOS (G3)
2.1.04.001 Financiamentos de Veículos - Parcelas de Curto Prazo (Finame/Leasing) (G4)
2.2 NÃO CIRCULANTE (G2)
2.2.01 OBRIGAÇÕES A LONGO PRAZO (G3)
2.2.01.001 Financiamentos de Veículos - Parcelas de Longo Prazo (G4)
2.2.01.002 Parcelamentos Fiscais de Longo Prazo (REFIS) (G4)
2.3 PATRIMÔNIO LÍQUIDO (G2)
2.3.01 CAPITAL SOCIAL (G3)
2.3.01.001 Capital Social Subscrito e Integralizado (G4)
2.3.02 RESERVAS E LUCROS (G3)
2.3.02.001 Lucros ou Prejuízos Acumulados (G4)
2.3.02.002 Reservas de Lucros (G4)
3. RECEITAS (G1)
3.1 RECEITA BRUTA DE TRANSPORTE (G2)
3.1.01 FRETES NACIONAIS (G3)
3.1.01.001 Frete por KM / Lotação (G4)
3.1.01.002 Frete por Contrato / Dedicado (G4)
3.1.01.003 Frete Spot / Fracionado (G4)
3.1.02 FRETES INTERNACIONAIS (G3)
3.1.02.001 Fretes Mercosul (G4)
3.1.03 RECEITAS DE LOGÍSTICA E ARMAZENAGEM (G3)
3.1.03.001 Serviços de Armazenagem e Paletização (G4)
3.1.03.002 Serviços de Logística Integrada / Crossdocking (G4)
3.2 (-) DEDUÇÕES DA RECEITA BRUTA (G2)
3.2.01 IMPOSTOS INCIDENTES SOBRE VENDAS (G3)
3.2.01.001 (-) ICMS sobre Fretes (G4)
3.2.01.002 (-) PIS sobre Faturamento (G4)
3.2.01.003 (-) COFINS sobre Faturamento (G4)
3.2.01.004 (-) ISSQN (G4)
3.3 RECEITAS FINANCEIRAS E DIVERSAS (G2)
3.3.01 Rendimentos de Aplicações Financeiras (G3)
3.3.02 Receita com Venda de Ativo Imobilizado (Venda de Caminhões/Sucatas) (G3)
4. CUSTOS E DESPESAS (G1)
4.1 CUSTOS DOS SERVIÇOS PRESTADOS - CSP / FROTA (G2)
4.1.01 COMBUSTÍVEIS E LUBRIFICANTES (G3)
4.1.01.001 Óleo Diesel (Abastecimento Externo) (G4)
4.1.01.002 Óleo Diesel (Consumo Tanque Interno / Almoxarifado) (G4)
4.1.01.003 ARLA 32 (G4)
4.1.01.004 Óleos Motores, Graxas e Fluidos Hidráulicos (G4)
4.1.02 MANUTENÇÃO DE FROTA (CONSUMO DE ESTOQUE INTERNO) (G3)
4.1.02.001 Peças Aplicadas - Manutenção Preventiva (G4)
4.1.02.002 Peças Aplicadas - Manutenção Corretiva (G4)
4.1.02.003 Consumíveis de Oficina Mecânica (G4)
4.1.03 MANUTENÇÃO EXTERNA E MÃO DE OBRA (G3)
4.1.03.001 Serviços de Mecânica em Oficinas Terceirizadas (G4)
4.1.03.002 Mão de Obra Própria - Salários e Encargos da Equipe de Mecânicos (G4)
4.1.04 RODADO E PNEUMÁTICOS (G3)
4.1.04.001 Custo de Pneus Novos Aplicados (G4)
4.1.04.002 Serviços de Recapagem / Vulcanização (G4)
4.1.04.003 Elementos de Fixação (Rodas, Parafusos, Alinhamento) (G4)
4.1.05 PEDÁGIOS E CUSTOS DE VIAGEM (G3)
4.1.05.001 Pedágios (G4)
4.1.05.002 Diárias, Pernoites e Alimentação de Motoristas (G4)
4.1.05.003 Chapa / Auxilio de Carga e Descarga (G4)
4.1.06 SEGUROS DA OPERAÇÃO / GERENCIAMENTO DE RISCO (G3)
4.1.06.001 Seguro de Carga (RCTR-C / RCF-DC) (G4)
4.1.06.002 Seguro Casco (Frota) (G4)
4.1.06.003 Monitoramento, Rastreamento e Isentas (G4)
4.1.07 PESSOAL DA OPERAÇÃO (CUSTOS DIRETOS) (G3)
4.1.07.001 Salários e Comissões de Motoristas (G4)
4.1.07.002 Encargos Sociais da Operação (INSS/FGTS) (G4)
4.1.07.003 Benefícios da Operação (Vale Refeição, Convênio) (G4)
4.1.07.004 Contratação de Transportador Autônomo (TAC / Agregados) (G4)
4.1.08 TAXAS, IMPOSTOS E DEPRECIAÇÃO OPERACIONAL (G3)
4.1.08.001 IPVA, Licenciamento e Taxas ANTT (G4)
4.1.08.002 Multas de Trânsito Operacionais / Balança (G4)
4.1.08.003 Depreciação de Veículos e Implementos (Custo não financeiro) (G4)
4.2 DESPESAS ADMINISTRATIVAS / ESTRUTURA (G2)
4.2.01 PESSOAL ADMINISTRATIVO (G3)
4.2.01.001 Salários da Diretoria e Setor Administrativo (G4)
4.2.02 INFRAESTRUTURA E PÁTIO (G3)
4.2.02.001 Aluguel de Sedes, Filiais e Garagens (G4)
4.2.02.002 Energia Elétrica, Água e Saneamento (G4)
4.2.02.003 Telecomunicações e Internet Link Dedicado (G4)
4.2.02.004 Segurança Patrimonial e Monitoramento de Pátio (G4)
4.2.03 SERVIÇOS DE TERCEIROS E TECNOLOGIA (G3)
4.2.03.001 Honorários Contábeis e Jurídicos (G4)
4.2.03.002 Licenciamento de Sistemas ERP/TMS/Rastreamento Admin (G4)
4.2.03.003 Material de Expediente e Limpeza (G4)
4.3 DESPESAS FINANCEIRAS (G2)
4.3.01.001 Juros Passivos e IOF sobre Financiamentos (G4)
4.3.01.002 Tarifas de Contas Bancárias e Custos de Emissão de Boletos (G4)
`;

function parseInput(input) {
    const lines = input.split('\n').map(l => l.trim()).filter(l => l);
    const parsed = [];

    for (const line of lines) {
        // Regex to match code and description.
        // Code is normally numbers separated by dots, e.g., 1, 1.1, 1.1.01, 1.2.02.010.001
        // Followed by description, optionally followed by Gx or custom note in parens at end.
        const match = line.match(/^([\d\.]+)\s+(.+)$/);
        if (match) {
            const codigo = match[1];
            let rawDesc = match[2];

            // Strip (G1), (G2), (G3), etc. from description
            let nome = rawDesc.replace(/\s*\(G\d+\)\s*$/, '').trim();

            // Determine tipo
            let tipo = 'DESPESA';
            if (codigo.startsWith('1') || codigo.startsWith('3')) {
                tipo = 'RECEITA';
            }

            parsed.push({ codigo, nome, tipo });
        }
    }
    return parsed;
}

async function run() {
    const list = parseInput(rawInput);
    console.log(`Parsed ${list.length} categories.`);

    // Sort categories by code length (or level) so parent elements are always processed first
    list.sort((a, b) => a.codigo.split('.').length - b.codigo.split('.').length);

    // Get current database entries to build mapping
    const res = await fetch(`${SUPABASE_URL}/rest/v1/fin_plano_contas?select=id,codigo`, {
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
        }
    });

    if (!res.ok) {
        throw new Error(`Failed to fetch current accounts: ${await res.text()}`);
    }

    const currentMap = {};
    const currentData = await res.json();
    currentData.forEach(item => {
        currentMap[item.codigo] = item.id;
    });

    console.log(`Loaded ${currentData.length} existing categories from db.`);

    // Now upsert each level sequentially to ensure parent_ids exist and can be set
    const levels = {};
    list.forEach(item => {
        const level = item.codigo.split('.').length;
        if (!levels[level]) levels[level] = [];
        levels[level].push(item);
    });

    const maxLevel = Math.max(...Object.keys(levels).map(Number));

    for (let l = 1; l <= maxLevel; l++) {
        const items = levels[l] || [];
        if (items.length === 0) continue;

        console.log(`Processing Level ${l} (${items.length} items)...`);

        const payload = items.map(item => {
            const codeParts = item.codigo.split('.');
            let parentId = null;
            if (codeParts.length > 1) {
                const parentCode = codeParts.slice(0, -1).join('.');
                parentId = currentMap[parentCode] || null;
            }
            return {
                codigo: item.codigo,
                nome: item.nome,
                tipo: item.tipo,
                parent_id: parentId
            };
        });

        // POST upsert with Prefer: resolution=merge-duplicates, return=representation to get new IDs
        const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/fin_plano_contas`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates,return=representation'
            },
            body: JSON.stringify(payload)
        });

        if (!upsertRes.ok) {
            throw new Error(`Failed level ${l} upsert: ${await upsertRes.text()}`);
        }

        const upsertedData = await upsertRes.json();
        upsertedData.forEach(item => {
            currentMap[item.codigo] = item.id;
        });
        console.log(`Level ${l} finished successfully.`);
    }

    // Attempt to delete any categories that are NOT in the new list
    const newCodes = new Set(list.map(x => x.codigo));
    const codesToDelete = currentData.filter(x => !newCodes.has(x.codigo));

    if (codesToDelete.length > 0) {
        console.log(`Found ${codesToDelete.length} obsolete categories. Attempting to delete...`);
        for (const item of codesToDelete) {
            // Delete one by one because child dependencies might exist.
            // Since we sorted, if we delete in reverse level order, it works better.
        }
        
        const deleteList = [...codesToDelete].sort((a,b) => b.codigo.split('.').length - a.codigo.split('.').length);
        for (const item of deleteList) {
            const delRes = await fetch(`${SUPABASE_URL}/rest/v1/fin_plano_contas?codigo=eq.${item.codigo}`, {
                method: 'DELETE',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`
                }
            });
            if (delRes.ok) {
                console.log(`Deleted obsolete category: ${item.codigo}`);
            } else {
                console.warn(`Could not delete category ${item.codigo} (probably referenced): ${await delRes.text()}`);
            }
        }
    }

    console.log("Database restructuring for Plano de Contas completed successfully!");
}

run().catch(err => {
    console.error("Fatal Error running sync script:", err);
    process.exit(1);
});
