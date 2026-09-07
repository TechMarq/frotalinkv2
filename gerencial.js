// ============================================================
//  gerencial.js — Painel Executivo / Cockpit do Dono | FrotaLink
//  Inteligência Gerencial Consolidada de Todos os Módulos:
//  Financeiro, Compras, Frota, Abastecimento, Manutenção, DP,
//  Comercial e Estoque.
// ============================================================

let sb = null;
let empresaId = null;
let dadosBrutos = {};

// Período de análise
let periodoAtual = {
    tipo: 'mes_atual',
    valor: new Date().toISOString().slice(0, 7)
};

// Gráficos Chart.js instanciados
let chartReceitaDespesa = null;
let chartDespesasCateg = null;
let chartFrotaStatus = null;
let chartMixCompras = null;

// ============================================================
//  INICIALIZAÇÃO & EVENT LISTENERS
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    // 1. Conexão com Supabase via authClient ou cliente fallback
    function esperarAuth(attempts = 0) {
        if (window.authClient) {
            sb = window.authClient;
            empresaId = window.currentEmpresaId;
            initGerencial();
        } else if (attempts < 30) {
            setTimeout(() => esperarAuth(attempts + 1), 150);
        } else if (window.supabase) {
            sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
            initGerencial();
        }
    }
    esperarAuth();

    // 2. Seletor de Período
    const periodoSelect = document.getElementById('periodo-select');
    const mesPickerWrap = document.getElementById('mes-picker-wrap');
    const mesPicker = document.getElementById('mes-picker');

    if (mesPicker) {
        mesPicker.value = new Date().toISOString().slice(0, 7);
    }

    if (periodoSelect) {
        periodoSelect.addEventListener('change', (e) => {
            periodoAtual.tipo = e.target.value;
            if (mesPickerWrap) {
                mesPickerWrap.style.display = e.target.value === 'mes_especifico' ? 'flex' : 'none';
            }
            carregarTodos();
        });
    }

    if (mesPicker) {
        mesPicker.addEventListener('change', (e) => {
            periodoAtual.valor = e.target.value;
            carregarTodos();
        });
    }

    // 3. Botão Atualizar
    const btnRefresh = document.getElementById('btn-refresh');
    if (btnRefresh) {
        btnRefresh.addEventListener('click', () => {
            btnRefresh.classList.add('spin');
            setTimeout(() => btnRefresh.classList.remove('spin'), 800);
            carregarTodos();
        });
    }

    // 4. Botão Relatório Executivo (Print)
    const btnPrint = document.getElementById('btn-print');
    if (btnPrint) {
        btnPrint.addEventListener('click', () => {
            window.print();
        });
    }
});

async function initGerencial() {
    setInterval(atualizarRelogio, 1000);
    atualizarRelogio();

    // Aguardar Chart.js estar disponível
    function waitChart(cb, n = 0) {
        if (window.Chart) cb();
        else if (n < 40) setTimeout(() => waitChart(cb, n + 1), 150);
    }
    waitChart(() => {
        initCharts();
        carregarTodos();
    });

    if (window.lucide) lucide.createIcons();
}

// ============================================================
//  UTILITÁRIOS DE FORMATAÇÃO E DATAS
// ============================================================

function fmt(val, decimais = 2) {
    return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: decimais, maximumFractionDigits: decimais }).format(val || 0);
}

function fmtBRL(val) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
}

function atualizarRelogio() {
    const el = document.getElementById('timestamp');
    if (el) el.textContent = 'Atualizado: ' + new Date().toLocaleTimeString('pt-BR');
}

function setKPI(id, valor) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = valor;
        el.classList.add('kpi-animate');
        setTimeout(() => el.classList.remove('kpi-animate'), 600);
    }
}

function dataAddDias(dateStr, dias) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + dias);
    return d.toISOString().slice(0, 10);
}

function getIntervaloDatas() {
    const hoje = new Date();
    let inicio, fim;

    switch (periodoAtual.tipo) {
        case 'mes_anterior': {
            const ano = hoje.getMonth() === 0 ? hoje.getFullYear() - 1 : hoje.getFullYear();
            const mes = hoje.getMonth() === 0 ? 11 : hoje.getMonth() - 1;
            inicio = new Date(ano, mes, 1);
            fim = new Date(ano, mes + 1, 0);
            break;
        }
        case 'ultimos_30': {
            const d = new Date();
            d.setDate(d.getDate() - 30);
            inicio = d;
            fim = hoje;
            break;
        }
        case 'trimestre': {
            const q = Math.floor(hoje.getMonth() / 3);
            inicio = new Date(hoje.getFullYear(), q * 3, 1);
            fim = new Date(hoje.getFullYear(), q * 3 + 3, 0);
            break;
        }
        case 'semestre': {
            const s = hoje.getMonth() < 6 ? 0 : 6;
            inicio = new Date(hoje.getFullYear(), s, 1);
            fim = new Date(hoje.getFullYear(), s + 6, 0);
            break;
        }
        case 'ano': {
            inicio = new Date(hoje.getFullYear(), 0, 1);
            fim = new Date(hoje.getFullYear(), 11, 31);
            break;
        }
        case 'mes_especifico': {
            const parts = (periodoAtual.valor || hoje.toISOString().slice(0, 7)).split('-');
            const ano = parseInt(parts[0], 10);
            const mes = parseInt(parts[1], 10);
            inicio = new Date(ano, mes - 1, 1);
            fim = new Date(ano, mes, 0);
            break;
        }
        default: // 'mes_atual'
            inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
            fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
            break;
    }

    return {
        inicio: inicio.toISOString().slice(0, 10),
        fim: fim.toISOString().slice(0, 10)
    };
}

function mostrarLoading(show) {
    const el = document.getElementById('loading-overlay');
    if (el) el.style.display = show ? 'flex' : 'none';
}

// Alternar abas do padrão Standard UI
window.switchTab = function(tabId) {
    document.querySelectorAll('.tabs-header .tab-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));

    const activeBtn = document.querySelector(`.tab-item[onclick*="${tabId}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    const activeSection = document.getElementById(`view-${tabId}`);
    if (activeSection) activeSection.classList.add('active');

    if (window.lucide) lucide.createIcons();

    // Redesenhar gráficos após troca de aba para evitar bugs de dimensionamento
    setTimeout(() => {
        if (chartReceitaDespesa) chartReceitaDespesa.resize();
        if (chartDespesasCateg) chartDespesasCateg.resize();
        if (chartFrotaStatus) chartFrotaStatus.resize();
        if (chartMixCompras) chartMixCompras.resize();
    }, 100);
};

// ============================================================
//  CARREGAMENTO CONSOLIDADO DE TODOS OS MÓDULOS
// ============================================================

async function carregarTodos() {
    mostrarLoading(true);
    try {
        const { inicio, fim } = getIntervaloDatas();
        
        await Promise.allSettled([
            carregarFinanceiro(inicio, fim),
            carregarCompras(inicio, fim),
            carregarFrota(),
            carregarAbastecimento(inicio, fim),
            carregarManutencao(inicio, fim),
            carregarDP(),
            carregarEstoque(),
            carregarComercial()
        ]);

        renderTodos();
    } catch (err) {
        console.error('[Gerencial] Erro geral ao consolidar dados:', err);
    } finally {
        mostrarLoading(false);
    }
}

// 1. Financeiro & Bancos
async function carregarFinanceiro(inicio, fim) {
    try {
        const [lancRes, contasRes] = await Promise.allSettled([
            sb.from('view_fin_lancamentos_plano')
                .select('id, tipo, valor_total, valor_pago, status, data_vencimento, data_pagamento, plano_conta_nome')
                .order('data_vencimento', { ascending: false })
                .limit(3000),
            sb.from('fin_contas_bancarias')
                .select('id, nome, banco, agencia, numero_conta, saldo_atual, saldo_inicial, pix, cor_identificacao')
                .order('nome', { ascending: true })
        ]);

        let lancList = [];
        if (lancRes.status === 'fulfilled' && lancRes.value.data && !lancRes.value.error) {
            lancList = lancRes.value.data;
        } else {
            // Fallback caso a view ainda não esteja criada
            const { data: fb } = await sb.from('fin_lancamentos').select('id, tipo, valor_total, valor_pago, status, data_vencimento, data_pagamento').limit(3000);
            lancList = fb || [];
        }

        let contas = [];
        if (contasRes.status === 'fulfilled' && contasRes.value.data && !contasRes.value.error && contasRes.value.data.length > 0) {
            contas = contasRes.value.data;
        } else {
            // Fallback para select('*') caso haja qualquer discrepância de colunas
            try {
                const { data: fbContas } = await sb.from('fin_contas_bancarias').select('*').order('nome', { ascending: true });
                contas = fbContas || [];
            } catch (errC) {
                console.warn('[Gerencial] Fallback de contas bancárias:', errC);
                contas = [];
            }
        }

        dadosBrutos.lancamentos = lancList;
        dadosBrutos.contas = contas;
        
        // Lançamentos correspondentes ao período analisado
        dadosBrutos.lancamentosPeriodo = lancList.filter(l => {
            const ref = l.data_pagamento || l.data_vencimento;
            return ref && ref >= inicio && ref <= fim;
        });

        dadosBrutos.evolucaoMeses = calcularEvolucaoMeses(lancList);
    } catch (e) {
        console.warn('[Gerencial] Erro no módulo Financeiro:', e);
        dadosBrutos.lancamentos = [];
        dadosBrutos.contas = [];
        dadosBrutos.lancamentosPeriodo = [];
        dadosBrutos.evolucaoMeses = [];
    }
}

function calcularEvolucaoMeses(lancamentos) {
    const meses = [];
    const hoje = new Date();
    for (let i = 5; i >= 0; i--) {
        const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
        const anoMes = d.toISOString().slice(0, 7);
        const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '');
        
        const pago = (l) => ['PAGO', 'PARCIAL'].includes(l.status);
        const val = (l) => l.valor_pago || l.valor_total || 0;

        const receita = lancamentos
            .filter(l => l.tipo === 'RECEBER' && pago(l) && (l.data_pagamento || '').startsWith(anoMes))
            .reduce((s, l) => s + val(l), 0);

        const despesa = lancamentos
            .filter(l => l.tipo === 'PAGAR' && pago(l) && (l.data_pagamento || '').startsWith(anoMes))
            .reduce((s, l) => s + val(l), 0);

        meses.push({ label, anoMes, receita, despesa, resultado: receita - despesa });
    }
    return meses;
}

// 2. Módulo de Compras (Novo no Painel)
async function carregarCompras(inicio, fim) {
    try {
        const { data: compras, error: cErr } = await sb.from('compras')
            .select('id, data_emissao, numero_nota, fornecedor_id, valor_total, fornecedores:fornecedor_id(nome)')
            .gte('data_emissao', inicio)
            .lte('data_emissao', fim)
            .order('data_emissao', { ascending: false });

        if (cErr) throw cErr;
        dadosBrutos.compras = compras || [];

        const compraIds = (compras || []).map(c => c.id).filter(Boolean);
        if (compraIds.length > 0) {
            // Limitar batch a 200 IDs para segurança de URL
            const batch = compraIds.slice(0, 200);
            const { data: itens, error: iErr } = await sb.from('compra_itens')
                .select('id, compra_id, tipo, produto, quantidade, valor_unitario, vinculo_veiculo_id, estoque')
                .in('compra_id', batch);
            if (!iErr && itens) {
                dadosBrutos.compraItens = itens;
            } else {
                dadosBrutos.compraItens = [];
            }
        } else {
            dadosBrutos.compraItens = [];
        }
    } catch (e) {
        console.warn('[Gerencial] Erro no módulo de Compras:', e);
        dadosBrutos.compras = [];
        dadosBrutos.compraItens = [];
    }
}

// 3. Frota, Veículos, Seguros e Motoristas
async function carregarFrota() {
    try {
        const [veicRes, motRes] = await Promise.allSettled([
            sb.from('veiculos')
                .select('id, placa, modelo, marca, status, status_alocacao, motorista_alocado_id, motorista_alocado_2_id, manutencao_oficina_id, valor_fipe_mes, vencimento_seguro, empresa_id')
                .order('placa', { ascending: true }),
            sb.from('motoristas')
                .select('id, nome_completo, vencimento_cnh, status')
        ]);

        let veiculos = [];
        if (veicRes.status === 'fulfilled' && veicRes.value.data && !veicRes.value.error) {
            veiculos = veicRes.value.data;
        } else {
            const { data: fb } = await sb.from('veiculos').select('*').order('placa', { ascending: true });
            veiculos = fb || [];
        }

        let motoristas = [];
        if (motRes.status === 'fulfilled' && motRes.value.data && !motRes.value.error) {
            motoristas = motRes.value.data;
        } else {
            const { data: fbM } = await sb.from('motoristas').select('*');
            motoristas = fbM || [];
        }

        // Frota Ativa (status != INATIVO)
        dadosBrutos.veiculos = veiculos.filter(v => (v.status || '').toUpperCase() !== 'INATIVO');
        dadosBrutos.motoristas = motoristas.filter(m => (m.status || '').toUpperCase() !== 'INATIVO');
        // Alocações ativas via vínculo de motoristas nos veículos
        dadosBrutos.alocacoes = dadosBrutos.veiculos.filter(v => v.motorista_alocado_id || v.motorista_alocado_2_id);
    } catch (e) {
        console.warn('[Gerencial] Erro no módulo Frota:', e);
        dadosBrutos.veiculos = [];
        dadosBrutos.alocacoes = [];
        dadosBrutos.motoristas = [];
    }
}

// 4. Abastecimento & Combustível (com paginação automática para superar o limite de 1.000 linhas do PostgREST)
async function carregarAbastecimento(inicio, fim) {
    try {
        let allRecords = [];
        const BATCH_SIZE = 1000;
        const MAX_REGISTROS = 15000;

        let useView = true;
        for (let offset = 0; offset < MAX_REGISTROS; offset += BATCH_SIZE) {
            const tableOrView = useView ? 'view_abastecimentos_completo' : 'abastecimentos';
            const selectCols = useView
                ? 'id, veiculo_id, veiculo_placa, valor_total, litros, km_atual, valor_unitario, tipo_combustivel, posto_nome, data'
                : 'id, veiculo_id, valor_total, litros, km_atual, valor_unitario, tipo_combustivel, data';

            const { data, error } = await sb.from(tableOrView)
                .select(selectCols)
                .gte('data', inicio)
                .lte('data', fim + 'T23:59:59')
                .order('data', { ascending: false })
                .range(offset, offset + BATCH_SIZE - 1);

            if (error) {
                if (useView && offset === 0) {
                    useView = false;
                    offset = -BATCH_SIZE; // reiniciar busca na tabela base
                    continue;
                }
                console.warn('[Gerencial] Erro na paginação de abastecimentos:', error);
                break;
            }

            if (!data || data.length === 0) break;
            allRecords = allRecords.concat(data);
            if (data.length < BATCH_SIZE) break;
        }

        dadosBrutos.abastecimentos = allRecords;
    } catch (e) {
        console.warn('[Gerencial] Erro no módulo Abastecimento:', e);
        dadosBrutos.abastecimentos = [];
    }
}

// 5. Manutenção da Frota
async function carregarManutencao(inicio, fim) {
    try {
        const [manutRes, pendRes] = await Promise.allSettled([
            sb.from('manutencoes')
                .select('id, veiculo_id, valor_total, tipo_id, status, data, manutencao_tipos:tipo_id(descricao), manutencao_itens(valor_pecas, valor_servicos)')
                .gte('data', inicio)
                .lte('data', fim + 'T23:59:59')
                .order('data', { ascending: false }),
            sb.from('manutencoes')
                .select('id, status, veiculo_id')
                .in('status', ['PENDENTE', 'EM_ANDAMENTO', 'AGENDADO'])
        ]);

        let manut = [];
        if (manutRes.status === 'fulfilled' && manutRes.value.data && !manutRes.value.error) {
            manut = manutRes.value.data;
        } else {
            const { data: fbManut } = await sb.from('manutencoes')
                .select('id, veiculo_id, valor_total, tipo_id, status, data')
                .gte('data', inicio)
                .lte('data', fim + 'T23:59:59');
            manut = fbManut || [];
        }

        let pendentes = [];
        if (pendRes.status === 'fulfilled' && pendRes.value.data && !pendRes.value.error) {
            pendentes = pendRes.value.data;
        } else {
            const { data: fbPend } = await sb.from('manutencoes')
                .select('id, status, veiculo_id')
                .eq('status', 'PENDENTE');
            pendentes = fbPend || [];
        }

        dadosBrutos.manutencoes = manut;
        dadosBrutos.manutPendentes = pendentes;
    } catch (e) {
        console.warn('[Gerencial] Erro no módulo Manutenção:', e);
        dadosBrutos.manutencoes = [];
        dadosBrutos.manutPendentes = [];
    }
}

// 6. Departamento Pessoal (Funcionários & ASOs)
async function carregarDP() {
    try {
        const filtro = empresaId ? { empresa_id: empresaId } : {};
        const [{ data: funcs }, { data: asos }] = await Promise.all([
            sb.from('dp_funcionarios')
                .select('id, nome_completo, status, salario, data_nascimento')
                .eq('status', 'ATIVO')
                .match(filtro),
            sb.from('dp_asos')
                .select('id, funcionario_id, data_vencimento')
                .match(filtro)
        ]);

        dadosBrutos.funcionarios = funcs || [];
        dadosBrutos.asos = asos || [];
    } catch (e) {
        console.warn('[Gerencial] Erro no módulo DP:', e);
        dadosBrutos.funcionarios = [];
        dadosBrutos.asos = [];
    }
}

// 7. Estoque & Peças
async function carregarEstoque() {
    try {
        const { data } = await sb.from('estoque')
            .select('id, nome, estoque_atual, estoque_minimo, valor_custo, status')
            .eq('status', 'ATIVO');

        dadosBrutos.estoque = data || [];
    } catch (e) {
        console.warn('[Gerencial] Erro no módulo Estoque:', e);
        dadosBrutos.estoque = [];
    }
}

// 8. Comercial & Contratos
async function carregarComercial() {
    try {
        const { data, error } = await sb.from('view_com_contratos_status')
            .select('id, cliente_nome, valor_contrato, data_vencimento, status_nome');

        if (error || !data) {
            const { data: fb } = await sb.from('com_contratos')
                .select('id, cliente_nome, valor_contrato, data_vencimento');
            dadosBrutos.contratos = (fb || []).map(c => ({ ...c, status_nome: 'ATIVO' }));
        } else {
            dadosBrutos.contratos = data;
        }
    } catch (e) {
        console.warn('[Gerencial] Erro no módulo Comercial:', e);
        dadosBrutos.contratos = [];
    }
}

// ============================================================
//  RENDERIZAÇÃO GERAL E CÁLCULO DOS KPIS
// ============================================================

function getFrotaStatusCounts(veiculos = []) {
    const total = veiculos.length;
    const emManut = veiculos.filter(v => 
        (v.status || '').toUpperCase() === 'MANUTENCAO' || 
        (v.status_alocacao || '').toUpperCase() === 'MANUTENCAO'
    ).length;
    const alocados = veiculos.filter(v => {
        const isManut = (v.status || '').toUpperCase() === 'MANUTENCAO' || (v.status_alocacao || '').toUpperCase() === 'MANUTENCAO';
        const isGaragem = (v.status_alocacao || '').toUpperCase() === 'GARAGEM';
        return !isManut && !isGaragem && (v.motorista_alocado_id || v.motorista_alocado_2_id);
    }).length;
    const patio = Math.max(0, total - alocados - emManut);
    return { total, alocados, emManut, patio };
}

function renderTodos() {
    renderHealthScoreAndCockpit();
    renderAlertas();
    renderPatrimonio();
    renderFinanceiro();
    renderCompras();
    renderFrota();
    renderDP();
    renderComercial();
    renderEstoque();
    atualizarGraficos();

    if (window.lucide) lucide.createIcons();
}

// ─── 1. HEALTH SCORE & COCKPIT EXECUTIVO ───
function renderHealthScoreAndCockpit() {
    const hoje = new Date().toISOString().slice(0, 10);
    const lp = dadosBrutos.lancamentosPeriodo || [];
    const pago = (l) => ['PAGO', 'PARCIAL'].includes(l.status);
    const val = (l) => l.valor_pago || l.valor_total || 0;

    const receita = lp.filter(l => l.tipo === 'RECEBER' && pago(l)).reduce((s, l) => s + val(l), 0);
    const despesa = lp.filter(l => l.tipo === 'PAGAR' && pago(l)).reduce((s, l) => s + val(l), 0);
    const resultado = receita - despesa;
    const margem = receita > 0 ? ((resultado / receita) * 100) : 0;

    // Pilar 1: Finanças (0 a 35 pts)
    let pilarFin = 0;
    if (resultado > 0) pilarFin += 15;
    else if (resultado === 0 && receita > 0) pilarFin += 8;

    const atrasadas = (dadosBrutos.lancamentos || []).filter(l => l.tipo === 'PAGAR' && (l.status === 'ATRASADO' || (l.status === 'ABERTO' && l.data_vencimento < hoje)));
    if (atrasadas.length === 0) pilarFin += 10;
    else if (atrasadas.length <= 2) pilarFin += 5;

    const saldoCaixa = (dadosBrutos.contas || []).reduce((s, c) => s + (parseFloat(c.saldo_atual) || 0), 0);
    const pagar30d = (dadosBrutos.lancamentos || [])
        .filter(l => l.tipo === 'PAGAR' && l.status === 'ABERTO' && l.data_vencimento >= hoje && l.data_vencimento <= dataAddDias(hoje, 30))
        .reduce((s, l) => s + val(l), 0);
    const liquidez = pagar30d > 0 ? (saldoCaixa > 0 ? (saldoCaixa / pagar30d) : 0) : (saldoCaixa > 0 ? 2 : 1);
    if (liquidez >= 1.0) pilarFin += 10;
    else if (liquidez >= 0.6) pilarFin += 5;

    // Pilar 2: Operações & Frota (0 a 25 pts)
    let pilarOps = 0;
    const { total: totalVeiculos, alocados } = getFrotaStatusCounts(dadosBrutos.veiculos || []);
    const taxaUso = totalVeiculos > 0 ? (alocados / totalVeiculos) : 0;
    if (taxaUso >= 0.5 && taxaUso <= 0.95) pilarOps += 10;
    else if (taxaUso > 0) pilarOps += 6;

    const mans = dadosBrutos.manutencoes || [];
    const prevs = mans.filter(m => (m.manutencao_tipos?.descricao || '').toUpperCase() === 'PREVENTIVA').length;
    const taxaPrev = mans.length > 0 ? (prevs / mans.length) : 0.8;
    if (taxaPrev >= 0.5) pilarOps += 8;
    else pilarOps += 3;

    const pendentes = (dadosBrutos.manutPendentes || []).length;
    if (pendentes === 0) pilarOps += 7;
    else if (pendentes <= 30) pilarOps += 5;
    else pilarOps += 2;

    // Pilar 3: Compliance & Pessoas (0 a 20 pts)
    let pilarComp = 0;
    const cnhsVencidas = (dadosBrutos.motoristas || []).filter(m => m.vencimento_cnh && m.vencimento_cnh < hoje).length;
    if (cnhsVencidas === 0) pilarComp += 7;

    const asosVencidos = (dadosBrutos.asos || []).filter(a => a.data_vencimento && a.data_vencimento < hoje).length;
    if (asosVencidos === 0) pilarComp += 7;

    const segurosVencidos = (dadosBrutos.veiculos || []).filter(v => v.vencimento_seguro && v.vencimento_seguro < hoje).length;
    if (segurosVencidos === 0) pilarComp += 6;

    // Pilar 4: Suprimentos & Comercial (0 a 20 pts)
    let pilarSup = 0;
    const estoque = dadosBrutos.estoque || [];
    const criticos = estoque.filter(e => (e.estoque_atual || 0) < (e.estoque_minimo || 0)).length;
    if (criticos === 0) pilarSup += 10;
    else if (criticos <= 3) pilarSup += 6;

    const contratos = dadosBrutos.contratos || [];
    const ativosContr = contratos.filter(c => c.status_nome === 'ATIVO').length;
    if (ativosContr > 0) pilarSup += 10;
    else pilarSup += 5;

    // Score Geral (0 a 100)
    const scoreTotal = Math.min(100, Math.max(0, pilarFin + pilarOps + pilarComp + pilarSup));

    // Atualizar UI do Radar
    const scoreEl = document.getElementById('health-score-num');
    if (scoreEl) scoreEl.textContent = scoreTotal;

    const circleBar = document.getElementById('health-circle-bar');
    if (circleBar) {
        // Comprimento da circunferência: 2 * PI * 60 ~= 377
        const offset = 377 - (377 * (scoreTotal / 100));
        circleBar.style.strokeDashoffset = offset;
        circleBar.style.stroke = scoreTotal >= 80 ? 'var(--success)' : scoreTotal >= 60 ? 'var(--warning)' : 'var(--danger)';
    }

    const badgeEl = document.getElementById('health-status-badge');
    const descEl = document.getElementById('health-status-desc');
    if (badgeEl && descEl) {
        if (scoreTotal >= 80) {
            badgeEl.className = 'health-desc-badge badge-success';
            badgeEl.textContent = 'Saúde Excelente';
            descEl.innerHTML = `Sua empresa opera em <strong>alta eficiência e rentabilidade</strong>. Finanças sólidas com margem de <strong>${fmt(margem, 1)}%</strong>, compromissos em dia e conformidade jurídica operacional sem pendências críticas.`;
        } else if (scoreTotal >= 60) {
            badgeEl.className = 'health-desc-badge badge-warning';
            badgeEl.textContent = 'Atenção Moderada';
            descEl.innerHTML = `Operação estável, porém requer atenção em pontos pontuais como <strong>${atrasadas.length ? atrasadas.length + ' conta(s) em atraso' : 'manutenções pendentes e itens de estoque'}</strong>. Monitore a liquidez nos próximos 30 dias.`;
        } else {
            badgeEl.className = 'health-desc-badge badge-danger';
            badgeEl.textContent = 'Atenção Crítica';
            descEl.innerHTML = `Sua empresa necessita de <strong>ações imediatas</strong> da diretoria. Existem pendências financeiras ou de conformidade legal (CNHs, ASOs ou contas atrasadas) que exigem intervenção hoje.`;
        }
    }

    // Mini barras dos pilares
    const setPillar = (id, val, max) => {
        const perc = Math.round((val / max) * 100);
        const valEl = document.getElementById(`pillar-${id}-val`);
        const barEl = document.getElementById(`pillar-${id}-bar`);
        if (valEl) valEl.textContent = `${perc}%`;
        if (barEl) {
            barEl.style.width = `${perc}%`;
            barEl.style.background = perc >= 75 ? 'var(--success)' : perc >= 50 ? 'var(--warning)' : 'var(--danger)';
        }
    };
    setPillar('fin', pilarFin, 35);
    setPillar('ops', pilarOps, 25);
    setPillar('comp', pilarComp, 20);
    setPillar('sup', pilarSup, 20);

    // Big Numbers no Cockpit
    setKPI('kpi-receita', fmtBRL(receita));
    setKPI('kpi-despesa', fmtBRL(despesa));
    setKPI('kpi-resultado', fmtBRL(resultado));
    const resEl = document.getElementById('kpi-resultado');
    if (resEl) resEl.style.color = resultado >= 0 ? 'var(--success)' : 'var(--danger)';
    
    const margemEl = document.getElementById('kpi-margem');
    if (margemEl) margemEl.textContent = `Margem líquida: ${fmt(margem, 1)}%`;

    setKPI('kpi-saldo-caixa', fmtBRL(saldoCaixa));
    const saldoCaixaEl = document.getElementById('kpi-saldo-caixa');
    if (saldoCaixaEl) {
        saldoCaixaEl.className = 'kpi-val ' + (saldoCaixa < 0 ? 'accent-red' : 'accent-green');
    }
    setKPI('kpi-frota-resumo', `${alocados} / ${totalVeiculos}`);
    const ocupEl = document.getElementById('kpi-frota-ocupacao');
    if (ocupEl) ocupEl.textContent = `${Math.round(taxaUso * 100)}% em operação`;

    const funcs = dadosBrutos.funcionarios || [];
    setKPI('kpi-dp-funcionarios', funcs.length);
    const folhaTotal = funcs.reduce((s, f) => s + (f.salario || 0), 0);
    const folhaSubEl = document.getElementById('kpi-dp-folha-sub');
    if (folhaSubEl) folhaSubEl.textContent = `Folha: ${fmtBRL(folhaTotal)}/mês`;

    // DRE Sintético
    const absGasto = (dadosBrutos.abastecimentos || []).reduce((s, a) => s + (parseFloat(a.valor_total) || 0), 0);
    const manGasto = (dadosBrutos.manutencoes || []).reduce((s, m) => {
        const itVal = (m.manutencao_itens || []).reduce((si, it) => si + (parseFloat(it.valor_pecas) || 0) + (parseFloat(it.valor_servicos) || 0), 0);
        return s + Math.max(parseFloat(m.valor_total) || 0, itVal);
    }, 0);
    const compGasto = (dadosBrutos.compras || []).reduce((s, c) => s + (parseFloat(c.valor_total) || 0), 0);
    const outrasDespesas = Math.max(0, despesa - (absGasto + manGasto + compGasto));

    setKPI('dre-receita', fmtBRL(receita));
    setKPI('dre-combustivel', `- ${fmtBRL(absGasto)}`);
    setKPI('dre-manutencao', `- ${fmtBRL(manGasto)}`);
    setKPI('dre-compras', `- ${fmtBRL(compGasto)}`);
    setKPI('dre-pessoal', `- ${fmtBRL(folhaTotal)}`);
    setKPI('dre-outras', `- ${fmtBRL(outrasDespesas)}`);
    setKPI('dre-resultado', fmtBRL(resultado));
    const dreResEl = document.getElementById('dre-resultado');
    if (dreResEl) dreResEl.style.color = resultado >= 0 ? 'var(--success)' : 'var(--danger)';
}

// ─── 2. CENTRAL DE ALERTAS E RISCOS (INFORMATIVOS) ───
function renderAlertas() {
    const hoje = new Date().toISOString().slice(0, 10);
    const em30 = dataAddDias(hoje, 30);
    const alertas = [];

    // Alerta 1: Contas a Pagar Vencidas
    const contasAtrasadas = (dadosBrutos.lancamentos || []).filter(l => l.tipo === 'PAGAR' && (l.status === 'ATRASADO' || (l.status === 'ABERTO' && l.data_vencimento < hoje)));
    if (contasAtrasadas.length > 0) {
        const valAtraso = contasAtrasadas.reduce((s, l) => s + (l.valor_total || 0), 0);
        alertas.push({
            tipo: 'danger',
            icon: 'alert-octagon',
            msg: `<strong>${contasAtrasadas.length} conta(s) a pagar vencida(s)</strong> (${fmtBRL(valAtraso)}) — pendente de regularização financeira.`
        });
    }

    // Alerta 2: Contas a Receber Vencidas (Inadimplência de Clientes)
    const receberAtrasadas = (dadosBrutos.lancamentos || []).filter(l => l.tipo === 'RECEBER' && (l.status === 'ATRASADO' || (l.status === 'ABERTO' && l.data_vencimento < hoje)));
    if (receberAtrasadas.length > 0) {
        const valReceberAtraso = receberAtrasadas.reduce((s, l) => s + (l.valor_total || 0), 0);
        alertas.push({
            tipo: 'warn',
            icon: 'dollar-sign',
            msg: `<strong>${receberAtrasadas.length} título(s) a receber em atraso</strong> (${fmtBRL(valReceberAtraso)}) — inadimplência de clientes.`
        });
    }

    // Alerta 3: CNHs de Motoristas Vencidas
    const cnhsVencidas = (dadosBrutos.motoristas || []).filter(m => m.vencimento_cnh && m.vencimento_cnh < hoje);
    if (cnhsVencidas.length > 0) {
        alertas.push({
            tipo: 'danger',
            icon: 'user-x',
            msg: `<strong>${cnhsVencidas.length} motorista(s) com CNH vencida</strong> — impedimento legal de condução.`
        });
    }

    // Alerta 4: ASOs Ocupacionais Vencidos
    const asosVencidos = (dadosBrutos.asos || []).filter(a => a.data_vencimento && a.data_vencimento < hoje);
    if (asosVencidos.length > 0) {
        alertas.push({
            tipo: 'danger',
            icon: 'file-text',
            msg: `<strong>${asosVencidos.length} ASO(s) ocupacional(is) vencido(s)</strong> — exames periódicos pendentes.`
        });
    }

    // Alerta 5: Seguros de Veículos Vencendo em 30 Dias ou Vencidos
    const segurosVencidos = (dadosBrutos.veiculos || []).filter(v => v.vencimento_seguro && v.vencimento_seguro < hoje);
    if (segurosVencidos.length > 0) {
        alertas.push({
            tipo: 'danger',
            icon: 'shield-alert',
            msg: `<strong>${segurosVencidos.length} veículo(s) com apólice de seguro vencida</strong> — sem cobertura securitária ativa.`
        });
    }

    // Alerta 6: Manutenções Pendentes
    const manPend = (dadosBrutos.manutPendentes || []).length;
    if (manPend > 0) {
        alertas.push({
            tipo: 'info',
            icon: 'wrench',
            msg: `<strong>${manPend} ordem(ns) de serviço pendente(s)</strong> — veículos em oficina ou aguardando reparo.`
        });
    }

    // Alerta 7: Estoque Crítico
    const estoqueCritico = (dadosBrutos.estoque || []).filter(e => (e.estoque_atual || 0) < (e.estoque_minimo || 0)).length;
    if (estoqueCritico > 0) {
        alertas.push({
            tipo: 'warn',
            icon: 'package-open',
            msg: `<strong>${estoqueCritico} peça(s) abaixo do estoque mínimo</strong> — risco de ruptura em manutenções.`
        });
    }

    // Alerta 8: Contratos Comerciais Vencendo
    const contratosVencendo = (dadosBrutos.contratos || []).filter(c => c.data_vencimento && c.data_vencimento >= hoje && c.data_vencimento <= em30 && c.status_nome === 'ATIVO').length;
    if (contratosVencendo > 0) {
        alertas.push({
            tipo: 'info',
            icon: 'briefcase',
            msg: `<strong>${contratosVencendo} contrato(s) comercial(is) a vencer nos próximos 30 dias</strong> — período de renovação contratual.`
        });
    }

    // Renderizar na UI
    const listEl = document.getElementById('alertas-list');
    const countBadge = document.getElementById('alertas-count-badge');

    if (countBadge) {
        countBadge.textContent = `${alertas.length} pendência(s)`;
        countBadge.className = alertas.length > 0 ? (alertas.some(a => a.tipo === 'danger') ? 'badge badge-danger' : 'badge badge-warning') : 'badge badge-success';
    }

    if (listEl) {
        if (alertas.length === 0) {
            listEl.innerHTML = `
                <div class="alerta-card alerta-ok">
                    <i data-lucide="check-check"></i>
                    <span>Tudo em ordem! Nenhum risco ou pendência crítica detectada nos módulos neste momento.</span>
                </div>`;
        } else {
            listEl.innerHTML = alertas.map(a => `
                <div class="alerta-card alerta-${a.tipo}">
                    <i data-lucide="${a.icon}"></i>
                    <span>${a.msg}</span>
                </div>`).join('');
        }
        if (window.lucide) lucide.createIcons();
    }
}

// ─── 3. RESUMO PATRIMONIAL OPERACIONAL ───
function renderPatrimonio() {
    const saldoCaixa = (dadosBrutos.contas || []).reduce((s, c) => s + (parseFloat(c.saldo_atual) || 0), 0);
    const fipeTotal = (dadosBrutos.veiculos || []).reduce((s, v) => s + (parseFloat(v.valor_fipe_mes) || 0), 0);
    const estoqueTotal = (dadosBrutos.estoque || []).reduce((s, e) => s + ((parseFloat(e.estoque_atual) || 0) * (parseFloat(e.valor_custo) || 0)), 0);
    
    // Contas a receber em aberto
    const receberAberto = (dadosBrutos.lancamentos || [])
        .filter(l => l.tipo === 'RECEBER' && ['ABERTO', 'PARCIAL', 'ATRASADO'].includes(l.status))
        .reduce((s, l) => s + (parseFloat(l.valor_total) || 0), 0);

    const totalAtivos = saldoCaixa + fipeTotal + estoqueTotal + receberAberto;

    setKPI('patri-caixa', fmtBRL(saldoCaixa));
    const patriCaixaEl = document.getElementById('patri-caixa');
    if (patriCaixaEl) patriCaixaEl.style.color = saldoCaixa < 0 ? '#fca5a5' : '#86efac';

    setKPI('patri-fipe', fmtBRL(fipeTotal));
    setKPI('patri-estoque', fmtBRL(estoqueTotal));
    setKPI('patri-receber', fmtBRL(receberAberto));
    setKPI('patri-total', fmtBRL(totalAtivos));
}

// ─── 4. FINANCEIRO DETALHADO ───
function getBankMeta(c) {
    const cod = String(c.banco || '').trim();
    const nomeUpper = String(c.nome || '').toUpperCase();
    
    if (cod === '748' || nomeUpper.includes('SICREDI')) {
        return {
            tag: 'SICREDI',
            label: 'Banco Cooperativo Sicredi (748)',
            color: '#10b981',
            bg: 'rgba(16, 185, 129, 0.12)',
            border: 'rgba(16, 185, 129, 0.35)'
        };
    }
    if (cod === '341' || nomeUpper.includes('ITAU') || nomeUpper.includes('ITAÚ')) {
        return {
            tag: 'ITAÚ',
            label: 'Banco Itaú Unibanco (341)',
            color: '#f97316',
            bg: 'rgba(249, 115, 22, 0.12)',
            border: 'rgba(249, 115, 22, 0.35)'
        };
    }
    if (cod === '001' || cod === '1' || nomeUpper.includes('BRASIL') || nomeUpper.includes('BB')) {
        return {
            tag: 'BB',
            label: 'Banco do Brasil (001)',
            color: '#38bdf8',
            bg: 'rgba(56, 189, 248, 0.12)',
            border: 'rgba(56, 189, 248, 0.35)'
        };
    }
    if (cod === '033' || cod === '33' || nomeUpper.includes('SANTANDER')) {
        return {
            tag: 'SAN',
            label: 'Banco Santander Brasil (033)',
            color: '#ef4444',
            bg: 'rgba(239, 68, 68, 0.12)',
            border: 'rgba(239, 68, 68, 0.35)'
        };
    }
    if (cod === '104' || nomeUpper.includes('CAIXA')) {
        return {
            tag: 'CEF',
            label: 'Caixa Econômica Federal (104)',
            color: '#0284c7',
            bg: 'rgba(2, 132, 199, 0.12)',
            border: 'rgba(2, 132, 199, 0.35)'
        };
    }
    if (cod === '237' || nomeUpper.includes('BRADESCO')) {
        return {
            tag: 'BBD',
            label: 'Banco Bradesco (237)',
            color: '#e11d48',
            bg: 'rgba(225, 29, 72, 0.12)',
            border: 'rgba(225, 29, 72, 0.35)'
        };
    }
    return {
        tag: cod ? `BCO ${cod}` : 'BANCO',
        label: c.banco ? `Banco Cód. ${c.banco}` : 'Conta Corrente Bancária',
        color: c.cor_identificacao || '#818cf8',
        bg: 'rgba(129, 140, 248, 0.12)',
        border: 'rgba(129, 140, 248, 0.35)'
    };
}

function renderFinanceiro() {
    const hoje = new Date().toISOString().slice(0, 10);
    const em7 = dataAddDias(hoje, 7);
    const em30 = dataAddDias(hoje, 30);
    const lancamentos = dadosBrutos.lancamentos || [];
    const contas = dadosBrutos.contas || [];
    const val = (l) => parseFloat(l.valor_pago) || parseFloat(l.valor_total) || 0;

    const saldoCaixa = contas.reduce((s, c) => s + (parseFloat(c.saldo_atual) || 0), 0);
    const pagar30d = lancamentos
        .filter(l => l.tipo === 'PAGAR' && l.status === 'ABERTO' && l.data_vencimento >= hoje && l.data_vencimento <= em30)
        .reduce((s, l) => s + val(l), 0);

    const aReceber30 = lancamentos
        .filter(l => l.tipo === 'RECEBER' && l.status === 'ABERTO' && l.data_vencimento >= hoje && l.data_vencimento <= em30)
        .reduce((s, l) => s + val(l), 0);

    const projecao30d = saldoCaixa + aReceber30 - pagar30d;

    // 1. Saldo Consolidado em Bancos
    const saldoEl = document.getElementById('kpi-fin-saldo-caixa');
    if (saldoEl) {
        saldoEl.textContent = fmtBRL(saldoCaixa);
        saldoEl.className = `stat-mini-val ${saldoCaixa < 0 ? 'accent-red' : 'accent-green'}`;
    }
    const saldoSubEl = document.getElementById('kpi-fin-saldo-sub');
    if (saldoSubEl) {
        saldoSubEl.textContent = `Consolidado em ${contas.length} conta(s)`;
    }

    // 2. Projeção de Caixa a 30 dias
    const projEl = document.getElementById('kpi-fin-projecao');
    if (projEl) {
        projEl.textContent = fmtBRL(projecao30d);
        projEl.className = `stat-mini-val ${projecao30d < 0 ? 'accent-red' : 'accent-green'}`;
    }

    // 3. Liquidez Imediata
    const liquidez = pagar30d > 0 ? (saldoCaixa > 0 ? (saldoCaixa / pagar30d) : 0) : (saldoCaixa > 0 ? 9.99 : 0);
    setKPI('kpi-liquidez', fmt(liquidez, 2) + 'x');
    const liqDescEl = document.getElementById('kpi-liquidez-desc');
    if (liqDescEl) {
        if (saldoCaixa < 0) {
            liqDescEl.textContent = '⚠️ Caixa devedor / Limite em uso';
            liqDescEl.style.color = 'var(--danger)';
        } else if (liquidez >= 1.0) {
            liqDescEl.textContent = '✓ Caixa cobre compromissos (30d)';
            liqDescEl.style.color = 'var(--success)';
        } else {
            liqDescEl.textContent = '⚠️ Caixa insuficiente para 30 dias';
            liqDescEl.style.color = 'var(--warning)';
        }
    }

    // 4. Contas Atrasadas
    const atrasadas = lancamentos.filter(l => l.tipo === 'PAGAR' && (l.status === 'ATRASADO' || (l.status === 'ABERTO' && l.data_vencimento < hoje)));
    const valAtrasadas = atrasadas.reduce((s, l) => s + (parseFloat(l.valor_total) || 0), 0);
    setKPI('kpi-contas-atrasadas', atrasadas.length);
    const atrasadasValEl = document.getElementById('kpi-contas-atrasadas-val');
    if (atrasadasValEl) atrasadasValEl.textContent = fmtBRL(valAtrasadas);

    // 5. A Pagar Próximos 7 Dias
    const aVencer7 = lancamentos.filter(l => l.tipo === 'PAGAR' && l.status === 'ABERTO' && l.data_vencimento >= hoje && l.data_vencimento <= em7);
    const valVencer7 = aVencer7.reduce((s, l) => s + (parseFloat(l.valor_total) || 0), 0);
    setKPI('kpi-a-vencer', aVencer7.length);
    const aVencerValEl = document.getElementById('kpi-a-vencer-val');
    if (aVencerValEl) aVencerValEl.textContent = fmtBRL(valVencer7);

    // 6. A Receber Próximos 30 Dias
    setKPI('kpi-a-receber', fmtBRL(aReceber30));

    const inadimplencia = lancamentos
        .filter(l => l.tipo === 'RECEBER' && (l.status === 'ATRASADO' || (l.status === 'ABERTO' && l.data_vencimento < hoje)))
        .reduce((s, l) => s + val(l), 0);
    const inadEl = document.getElementById('kpi-inadimplencia-receber');
    if (inadEl) inadEl.textContent = `Inadimplência: ${fmtBRL(inadimplencia)}`;

    // 7. Badge de Contas
    const badgeContas = document.getElementById('contas-count-badge');
    if (badgeContas) {
        badgeContas.textContent = `${contas.length} Contas Cadastradas`;
        badgeContas.className = `badge ${contas.length > 0 ? 'badge-info' : 'badge-warning'}`;
    }

    // 8. Contas Bancárias Detalhadas
    const contasListEl = document.getElementById('contas-bancarias-list');
    if (contasListEl) {
        if (contas.length === 0) {
            contasListEl.innerHTML = '<p class="empty-msg">Nenhuma conta bancária cadastrada no sistema.</p>';
        } else {
            const itemsHtml = contas.map(c => {
                const meta = getBankMeta(c);
                const saldo = parseFloat(c.saldo_atual) || 0;
                const isNeg = saldo < 0;
                const agCC = [c.agencia ? `Ag: ${c.agencia}` : '', c.numero_conta ? `CC: ${c.numero_conta}` : ''].filter(Boolean).join(' • ');
                return `
                    <div class="bank-card-item">
                        <div class="bank-card-left">
                            <div class="bank-icon-badge" style="background:${meta.bg}; color:${meta.color}; border:1px solid ${meta.border};">
                                ${meta.tag}
                            </div>
                            <div>
                                <div class="bank-name">${c.nome}</div>
                                <div class="bank-sub">
                                    <span>${meta.label}</span>
                                    ${agCC ? `<span>•</span><span>${agCC}</span>` : ''}
                                    ${c.pix ? `<span class="bank-pix-tag"><i data-lucide="qr-code" style="width:11px;height:11px;"></i> PIX: ${c.pix}</span>` : ''}
                                </div>
                            </div>
                        </div>
                        <div class="bank-card-right">
                            <div class="bank-saldo ${isNeg ? 'accent-red' : 'accent-green'}">
                                ${fmtBRL(saldo)}
                            </div>
                            <span class="bank-status-pill ${isNeg ? 'status-devedor' : 'status-positivo'}">
                                ${isNeg ? 'Saldo Devedor / Limite' : 'Saldo Positivo'}
                            </span>
                        </div>
                    </div>
                `;
            }).join('');

            const footerHtml = `
                <div class="bank-summary-footer">
                    <div style="display:flex;align-items:center;gap:0.6rem;">
                        <i data-lucide="wallet" style="width:18px;height:18px;color:var(--info);"></i>
                        <div>
                            <div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.04em;">Posição Líquida Consolidada:</div>
                            <div style="font-size:0.75rem;color:var(--text-soft);">${contas.length} contas bancárias integradas</div>
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:1.35rem;font-weight:900;" class="${saldoCaixa < 0 ? 'accent-red' : 'accent-green'}">
                            ${fmtBRL(saldoCaixa)}
                        </div>
                        <div style="font-size:0.72rem;color:${saldoCaixa < 0 ? '#fca5a5' : '#86efac'};font-weight:600;">
                            ${saldoCaixa < 0 ? '⚠️ Caixa Global Devedor' : '✓ Caixa Global Positivo'}
                        </div>
                    </div>
                </div>
            `;

            contasListEl.innerHTML = itemsHtml + footerHtml;
        }
        if (window.lucide) lucide.createIcons();
    }
}

// ─── 5. MÓDULO DE COMPRAS (SUPRIMENTOS) ───
function renderCompras() {
    const compras = dadosBrutos.compras || [];
    const totalGasto = compras.reduce((s, c) => s + (parseFloat(c.valor_total) || 0), 0);
    const qtdNotas = compras.length;
    const ticketMedio = qtdNotas > 0 ? (totalGasto / qtdNotas) : 0;

    // Fornecedores distintos
    const fornecedoresSet = new Set(compras.map(c => c.fornecedor_id).filter(Boolean));

    setKPI('kpi-compras-total', fmtBRL(totalGasto));
    setKPI('kpi-compras-qtd', qtdNotas);
    setKPI('kpi-compras-ticket', fmtBRL(ticketMedio));
    setKPI('kpi-compras-fornecedores', fornecedoresSet.size);

    // Top Fornecedores de Compras
    const porFornecedor = {};
    compras.forEach(c => {
        const nome = c.fornecedores?.nome || 'Fornecedor Geral';
        if (!porFornecedor[nome]) porFornecedor[nome] = { count: 0, total: 0 };
        porFornecedor[nome].count += 1;
        porFornecedor[nome].total += (parseFloat(c.valor_total) || 0);
    });

    const topForns = Object.entries(porFornecedor)
        .map(([nome, d]) => ({ nome, count: d.count, total: d.total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);

    const fornsBody = document.getElementById('top-fornecedores-body');
    if (fornsBody) {
        fornsBody.innerHTML = topForns.length === 0
            ? '<tr><td colspan="4" class="empty-msg">Nenhuma compra no período selecionado</td></tr>'
            : topForns.map((f, i) => `
                <tr>
                    <td><span class="badge-rank ${i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : ''}">${i + 1}</span></td>
                    <td style="font-weight:600;">${f.nome}</td>
                    <td>${f.count} nota(s)</td>
                    <td style="text-align:right;font-weight:700;">${fmtBRL(f.total)}</td>
                </tr>`).join('');
    }
}

// ─── 6. FROTA, COMBUSTÍVEL, MANUTENÇÃO & VILÕES DE CUSTO ───
function renderFrota() {
    const veiculos = dadosBrutos.veiculos || [];
    const { total, alocados, emManut, patio: disponiveis } = getFrotaStatusCounts(veiculos);
    const mans = dadosBrutos.manutencoes || [];
    const pendentes = dadosBrutos.manutPendentes || [];
    const abs = dadosBrutos.abastecimentos || [];

    setKPI('kpi-frota-total', total);
    setKPI('kpi-frota-alocados', alocados);
    setKPI('kpi-frota-disponiveis', disponiveis);
    setKPI('kpi-frota-em-manut', emManut);

    // Combustível
    const totalCombGasto = abs.reduce((s, a) => s + (parseFloat(a.valor_total) || 0), 0);
    const totalLitros = abs.reduce((s, a) => s + (parseFloat(a.litros) || 0), 0);
    const mediaPrecoLitro = totalLitros > 0 ? (totalCombGasto / totalLitros) : 0;

    // Estimativa de KM e Consumo
    let totalKmRodado = 0;
    const kmPorVeiculo = {};
    abs.forEach(a => {
        if (!a.veiculo_id || !a.km_atual) return;
        if (!kmPorVeiculo[a.veiculo_id]) kmPorVeiculo[a.veiculo_id] = [];
        kmPorVeiculo[a.veiculo_id].push(parseFloat(a.km_atual));
    });

    Object.values(kmPorVeiculo).forEach(kms => {
        if (kms.length > 1) {
            kms.sort((a, b) => a - b);
            const delta = kms[kms.length - 1] - kms[0];
            if (delta > 0 && delta < 50000) totalKmRodado += delta;
        }
    });

    const mediaKmL = (totalLitros > 0 && totalKmRodado > 0) ? (totalKmRodado / totalLitros) : 0;
    const custoKm = (totalKmRodado > 0 && totalCombGasto > 0) ? (totalCombGasto / totalKmRodado) : 0;

    setKPI('kpi-comb-gasto', fmtBRL(totalCombGasto));
    setKPI('kpi-comb-litros', `${fmt(totalLitros, 0)} L`);
    setKPI('kpi-comb-preco-medio', fmtBRL(mediaPrecoLitro) + '/L');
    setKPI('kpi-comb-km-l', mediaKmL > 0 ? `${fmt(mediaKmL, 2)} KM/L` : 'Sob apuração');
    setKPI('kpi-comb-custo-km', custoKm > 0 ? fmtBRL(custoKm) + '/KM' : 'Sob apuração');

    // Manutenção
    const totalManutGasto = mans.reduce((s, m) => {
        const itVal = (m.manutencao_itens || []).reduce((si, it) => si + (parseFloat(it.valor_pecas) || 0) + (parseFloat(it.valor_servicos) || 0), 0);
        return s + Math.max(parseFloat(m.valor_total) || 0, itVal);
    }, 0);
    const preventivas = mans.filter(m => (m.manutencao_tipos?.descricao || '').toUpperCase() === 'PREVENTIVA').length;
    const corretivas = mans.filter(m => (m.manutencao_tipos?.descricao || '').toUpperCase() === 'CORRETIVA').length;
    const totalClassif = preventivas + corretivas;
    const taxaPrev = totalClassif > 0 ? Math.round((preventivas / totalClassif) * 100) : (mans.length > 0 ? 50 : 0);

    setKPI('kpi-manut-gasto', fmtBRL(totalManutGasto));
    setKPI('kpi-manut-total', mans.length);
    setKPI('kpi-manut-pendentes', pendentes.length);
    setKPI('kpi-manut-preventivas', preventivas);
    setKPI('kpi-manut-corretivas', corretivas);
    setKPI('kpi-manut-taxa-prev', `${taxaPrev}%`);

    // ─── VILÕES DE CUSTO DA FROTA (TOP 5 VEÍCULOS MAIS CAROS NO PERÍODO) ───
    const custosVeiculo = {};

    // Mapear placa e modelo de todos os veículos por ID e placa normalizada
    const veiculoMap = {};
    veiculos.forEach(v => {
        const info = { placa: v.placa, modelo: v.modelo || '' };
        if (v.id) {
            veiculoMap[String(v.id).toLowerCase()] = info;
        }
        if (v.placa) {
            veiculoMap[String(v.placa).toUpperCase().replace(/[^A-Z0-9]/g, '')] = info;
        }
    });

    const getVeicInfo = (rawId, fallbackPlaca, fallbackModelo) => {
        if (!rawId && !fallbackPlaca) return { placa: 'Veículo', modelo: '' };
        const idKey = String(rawId || '').toLowerCase();
        const placaKey = String(fallbackPlaca || rawId || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const found = veiculoMap[idKey] || veiculoMap[placaKey];
        if (found) return found;
        return {
            placa: fallbackPlaca || (String(rawId).length <= 8 ? String(rawId).toUpperCase() : 'Veículo'),
            modelo: fallbackModelo || ''
        };
    };

    // 1. Somar Combustível por veículo
    abs.forEach(a => {
        const id = a.veiculo_id;
        if (!id) return;
        if (!custosVeiculo[id]) {
            custosVeiculo[id] = {
                placaFallback: a.veiculo_placa || '',
                modeloFallback: a.veiculo_modelo || '',
                combustivel: 0,
                manutencao: 0,
                pecas: 0
            };
        }
        custosVeiculo[id].combustivel += (parseFloat(a.valor_total) || 0);
    });

    // 2. Somar Manutenção por veículo
    mans.forEach(m => {
        const id = m.veiculo_id;
        if (!id) return;
        if (!custosVeiculo[id]) {
            custosVeiculo[id] = {
                placaFallback: '',
                modeloFallback: '',
                combustivel: 0,
                manutencao: 0,
                pecas: 0
            };
        }
        const itVal = (m.manutencao_itens || []).reduce((si, it) => si + (parseFloat(it.valor_pecas) || 0) + (parseFloat(it.valor_servicos) || 0), 0);
        custosVeiculo[id].manutencao += Math.max(parseFloat(m.valor_total) || 0, itVal);
    });

    // 3. Somar Peças de Compras por veículo
    (dadosBrutos.compraItens || []).forEach(it => {
        const id = it.vinculo_veiculo_id;
        if (!id) return;
        if (!custosVeiculo[id]) {
            custosVeiculo[id] = {
                placaFallback: '',
                modeloFallback: '',
                combustivel: 0,
                manutencao: 0,
                pecas: 0
            };
        }
        const custoItem = (parseFloat(it.quantidade) || 1) * (parseFloat(it.valor_unitario) || 0);
        custosVeiculo[id].pecas += custoItem;
    });

    // Consolidar total e ordenar
    let custoFrotaTotal = 0;
    const rankingVeiculos = Object.entries(custosVeiculo).map(([id, d]) => {
        const vInfo = getVeicInfo(id, d.placaFallback, d.modeloFallback);
        const placa = vInfo.placa || 'Veículo';
        const modelo = vInfo.modelo || '';
        const total = d.combustivel + d.manutencao + d.pecas;
        custoFrotaTotal += total;
        return {
            id,
            placa,
            modelo,
            combustivel: d.combustivel,
            manutencao: d.manutencao,
            pecas: d.pecas,
            total
        };
    }).filter(v => v.total > 0).sort((a, b) => b.total - a.total).slice(0, 5);

    const viloesBody = document.getElementById('viloes-frota-body');
    if (viloesBody) {
        viloesBody.innerHTML = rankingVeiculos.length === 0
            ? '<tr><td colspan="7" class="empty-msg">Nenhum custo operacional registrado no período</td></tr>'
            : rankingVeiculos.map((v, i) => {
                const perc = custoFrotaTotal > 0 ? ((v.total / custoFrotaTotal) * 100) : 0;
                return `
                    <tr>
                        <td><span class="badge-rank ${i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : ''}">${i + 1}</span></td>
                        <td>
                            <strong>${v.placa}</strong>
                            <div style="font-size:0.75rem;color:var(--text-muted);">${v.modelo}</div>
                        </td>
                        <td class="accent-red">${fmtBRL(v.combustivel)}</td>
                        <td class="accent-amber">${fmtBRL(v.manutencao)}</td>
                        <td class="accent-cyan">${fmtBRL(v.pecas)}</td>
                        <td style="text-align:right;font-weight:800;font-size:0.95rem;">${fmtBRL(v.total)}</td>
                        <td style="text-align:right;font-weight:700;color:var(--text-soft);">${fmt(perc, 1)}%</td>
                    </tr>`;
            }).join('');
    }
}

// ─── 7. DEPARTAMENTO PESSOAL & COMPLIANCE ───
function renderDP() {
    const funcs = dadosBrutos.funcionarios || [];
    const asos = dadosBrutos.asos || [];
    const motoristas = dadosBrutos.motoristas || [];
    const veiculos = dadosBrutos.veiculos || [];
    const hoje = new Date().toISOString().slice(0, 10);
    const em30 = dataAddDias(hoje, 30);

    const folhaTotal = funcs.reduce((s, f) => s + (parseFloat(f.salario) || 0), 0);
    const salarioMedio = funcs.length > 0 ? (folhaTotal / funcs.length) : 0;

    const mesAtual = new Date().getMonth() + 1;
    const anivers = funcs.filter(f => f.data_nascimento && parseInt(f.data_nascimento.slice(5, 7)) === mesAtual);

    setKPI('kpi-dp-colab-count', funcs.length);
    setKPI('kpi-dp-folha-val', fmtBRL(folhaTotal));
    setKPI('kpi-dp-salario-medio', fmtBRL(salarioMedio));
    setKPI('kpi-dp-anivers-count', anivers.length);

    // Compliance ASOs
    const asoVencendo = asos.filter(a => a.data_vencimento && a.data_vencimento >= hoje && a.data_vencimento <= em30).length;
    const asoVencido = asos.filter(a => a.data_vencimento && a.data_vencimento < hoje).length;
    setKPI('kpi-dp-aso-vencendo', asoVencendo);
    setKPI('kpi-dp-aso-vencido', asoVencido);

    // Compliance CNHs
    const cnhVencendo = motoristas.filter(m => m.vencimento_cnh && m.vencimento_cnh >= hoje && m.vencimento_cnh <= em30).length;
    const cnhVencida = motoristas.filter(m => m.vencimento_cnh && m.vencimento_cnh < hoje).length;
    setKPI('kpi-cnh-vencendo', cnhVencendo);
    setKPI('kpi-cnh-vencida', cnhVencida);

    // Compliance Seguros
    const seguroVencendo = veiculos.filter(v => v.vencimento_seguro && v.vencimento_seguro >= hoje && v.vencimento_seguro <= em30).length;
    const seguroVencido = veiculos.filter(v => v.vencimento_seguro && v.vencimento_seguro < hoje).length;
    setKPI('kpi-seguro-vencendo', seguroVencendo);
    setKPI('kpi-seguro-vencido', seguroVencido);

    // Aniversariantes List
    const aniListEl = document.getElementById('aniversariantes-list');
    if (aniListEl) {
        const diaHoje = new Date().getDate();
        aniListEl.innerHTML = anivers.length === 0
            ? '<p class="empty-msg">Nenhum aniversariante este mês</p>'
            : anivers
                .sort((a, b) => parseInt(a.data_nascimento.slice(8)) - parseInt(b.data_nascimento.slice(8)))
                .slice(0, 6)
                .map(f => {
                    const dia = f.data_nascimento.slice(8, 10);
                    const isToday = parseInt(dia, 10) === diaHoje;
                    return `
                        <div class="item-list-row ${isToday ? 'highlight' : ''}">
                            <span style="font-weight:600;">${isToday ? '🎂 ' : ''}${f.nome_completo}</span>
                            <span style="font-weight:700;color:var(--text-muted);">${dia}/${String(mesAtual).padStart(2, '0')}</span>
                        </div>`;
                }).join('');
    }
}

// ─── 8. COMERCIAL & CONTRATOS ───
function renderComercial() {
    const contratos = dadosBrutos.contratos || [];
    const ativos = contratos.filter(c => c.status_nome === 'ATIVO');
    const valorAtivos = ativos.reduce((s, c) => s + (parseFloat(c.valor_contrato) || 0), 0);

    const hoje = new Date().toISOString().slice(0, 10);
    const em30 = dataAddDias(hoje, 30);

    const vencendo = ativos.filter(c => c.data_vencimento && c.data_vencimento >= hoje && c.data_vencimento <= em30).length;
    const vencidos = contratos.filter(c => c.data_vencimento && c.data_vencimento < hoje && c.status_nome !== 'CANCELADO').length;

    setKPI('kpi-comercial-ativos', ativos.length);
    setKPI('kpi-comercial-valor', fmtBRL(valorAtivos));
    setKPI('kpi-comercial-vencendo', vencendo);
    setKPI('kpi-comercial-vencidos', vencidos);

    // Top Clientes
    const clientesListEl = document.getElementById('top-clientes-list');
    if (clientesListEl) {
        const topContratos = [...ativos].sort((a, b) => (b.valor_contrato || 0) - (a.valor_contrato || 0)).slice(0, 5);
        clientesListEl.innerHTML = topContratos.length === 0
            ? '<p class="empty-msg">Nenhum contrato ativo cadastrado</p>'
            : topContratos.map(c => `
                <div class="item-list-row">
                    <span style="font-weight:600;">${c.cliente_nome || 'Cliente'}</span>
                    <span style="font-weight:700;" class="accent-indigo">${fmtBRL(c.valor_contrato)}</span>
                </div>`).join('');
    }
}

// ─── 9. ESTOQUE DE PEÇAS ───
function renderEstoque() {
    const estoque = dadosBrutos.estoque || [];
    const abaixo = estoque.filter(e => (parseFloat(e.estoque_atual) || 0) < (parseFloat(e.estoque_minimo) || 0));
    const valorTotal = estoque.reduce((s, e) => s + ((parseFloat(e.estoque_atual) || 0) * (parseFloat(e.valor_custo) || 0)), 0);

    setKPI('kpi-estoque-total', `${estoque.length} itens`);
    setKPI('kpi-estoque-alertas', abaixo.length);
    setKPI('kpi-estoque-valor', fmtBRL(valorTotal));

    const criticoListEl = document.getElementById('estoque-critico-list');
    if (criticoListEl) {
        criticoListEl.innerHTML = abaixo.length === 0
            ? '<p class="empty-msg" style="color:var(--success);">✓ Todos os itens com estoque adequado</p>'
            : abaixo.slice(0, 5).map(e => `
                <div class="item-list-row" style="border-left:3px solid var(--danger);">
                    <span style="font-weight:600;">${e.nome}</span>
                    <span class="accent-red" style="font-weight:700;">
                        ${e.estoque_atual || 0} / ${e.estoque_minimo || 0} mín
                    </span>
                </div>`).join('');
    }
}

// ============================================================
//  GRÁFICOS CHART.JS
// ============================================================

function initCharts() {
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = 'Inter';

    const axisStyle = {
        ticks: { color: '#64748b', font: { size: 11 } },
        grid: { color: 'rgba(255,255,255,0.04)' },
        border: { dash: [4, 4] }
    };

    // 1. Gráfico Receita vs Despesa (Evolução 6 Meses)
    const ctx1 = document.getElementById('chart-receita-despesa');
    if (ctx1) {
        if (chartReceitaDespesa) chartReceitaDespesa.destroy();
        chartReceitaDespesa = new Chart(ctx1, {
            type: 'bar',
            data: { labels: [], datasets: [] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { labels: { padding: 16, usePointStyle: true, pointStyle: 'circle', font: { size: 12 } } },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => ` ${ctx.dataset.label}: ${fmtBRL(ctx.parsed.y)}`
                        }
                    }
                },
                scales: {
                    x: axisStyle,
                    y: {
                        ...axisStyle,
                        ticks: { ...axisStyle.ticks, callback: v => 'R$ ' + fmt(v / 1000, 0) + 'k' }
                    }
                }
            }
        });
    }

    // 2. Gráfico Despesas por Categoria
    const ctx2 = document.getElementById('chart-despesas-categ');
    if (ctx2) {
        if (chartDespesasCateg) chartDespesasCateg.destroy();
        chartDespesasCateg = new Chart(ctx2, {
            type: 'doughnut',
            data: { labels: [], datasets: [] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right', labels: { padding: 14, usePointStyle: true, font: { size: 11 } } },
                    tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${fmtBRL(ctx.parsed)}` } }
                },
                cutout: '65%'
            }
        });
    }

    // 3. Gráfico Status da Frota
    const ctx3 = document.getElementById('chart-frota-status');
    if (ctx3) {
        if (chartFrotaStatus) chartFrotaStatus.destroy();
        chartFrotaStatus = new Chart(ctx3, {
            type: 'doughnut',
            data: { labels: [], datasets: [] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { padding: 12, usePointStyle: true, font: { size: 11 } } } },
                cutout: '60%'
            }
        });
    }

    // 4. Gráfico Mix de Compras (Peça x Serviço x Outro)
    const ctx4 = document.getElementById('chart-mix-compras');
    if (ctx4) {
        if (chartMixCompras) chartMixCompras.destroy();
        chartMixCompras = new Chart(ctx4, {
            type: 'doughnut',
            data: { labels: [], datasets: [] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right', labels: { padding: 14, usePointStyle: true, font: { size: 11 } } },
                    tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${fmtBRL(ctx.parsed)}` } }
                },
                cutout: '60%'
            }
        });
    }
}

function atualizarGraficos() {
    // 1. Evolução Financeira
    const evolucao = dadosBrutos.evolucaoMeses || [];
    if (chartReceitaDespesa && evolucao.length > 0) {
        chartReceitaDespesa.data.labels = evolucao.map(m => m.label);
        chartReceitaDespesa.data.datasets = [
            {
                label: 'Receitas',
                data: evolucao.map(m => m.receita),
                backgroundColor: 'rgba(16,185,129,0.75)',
                borderColor: '#10b981',
                borderWidth: 2,
                borderRadius: 6
            },
            {
                label: 'Despesas',
                data: evolucao.map(m => m.despesa),
                backgroundColor: 'rgba(239,68,68,0.75)',
                borderColor: '#ef4444',
                borderWidth: 2,
                borderRadius: 6
            },
            {
                label: 'Lucro Líquido',
                data: evolucao.map(m => m.resultado),
                type: 'line',
                borderColor: '#818cf8',
                backgroundColor: 'rgba(129,140,248,0.1)',
                borderWidth: 2.5,
                tension: 0.35,
                pointRadius: 4,
                pointBackgroundColor: '#818cf8',
                fill: true
            }
        ];
        chartReceitaDespesa.update('active');
    }

    // 2. Despesas por Categoria
    const lp = dadosBrutos.lancamentosPeriodo || dadosBrutos.lancamentos || [];
    const porCateg = {};
    lp.filter(l => l.tipo === 'PAGAR' && ['PAGO', 'PARCIAL'].includes(l.status)).forEach(l => {
        const cat = l.plano_conta_nome || 'Outras Despesas';
        porCateg[cat] = (porCateg[cat] || 0) + (l.valor_pago || l.valor_total || 0);
    });

    const categSorted = Object.entries(porCateg).sort(([, a], [, b]) => b - a).slice(0, 6);
    if (chartDespesasCateg) {
        const colors = ['#ef4444', '#f97316', '#eab308', '#8b5cf6', '#06b6d4', '#10b981'];
        chartDespesasCateg.data.labels = categSorted.length > 0 ? categSorted.map(([k]) => k) : ['Sem dados'];
        chartDespesasCateg.data.datasets = [{
            data: categSorted.length > 0 ? categSorted.map(([, v]) => v) : [1],
            backgroundColor: categSorted.length > 0 ? colors.slice(0, categSorted.length) : ['rgba(255,255,255,0.05)'],
            borderWidth: 0,
            hoverOffset: 8
        }];
        chartDespesasCateg.update('active');
    }

    // 3. Status da Frota
    const { total: totalV, alocados, emManut, patio } = getFrotaStatusCounts(dadosBrutos.veiculos || []);

    if (chartFrotaStatus) {
        chartFrotaStatus.data.labels = ['Em Rota (Alocados)', 'Disponíveis no Pátio', 'Em Manutenção'];
        chartFrotaStatus.data.datasets = [{
            data: totalV > 0 ? [alocados, patio, emManut] : [1, 0, 0],
            backgroundColor: ['#6366f1', '#10b981', '#ef4444'],
            borderWidth: 0,
            hoverOffset: 8
        }];
        chartFrotaStatus.update('active');
    }

    // 4. Mix de Compras
    const itens = dadosBrutos.compraItens || [];
    let pecasVal = 0, servicosVal = 0, outrosVal = 0;
    itens.forEach(it => {
        const v = (parseFloat(it.quantidade) || 1) * (parseFloat(it.valor_unitario) || 0);
        const t = (it.tipo || '').toLowerCase();
        if (t.includes('peca') || t.includes('peça') || it.estoque) pecasVal += v;
        else if (t.includes('servico') || t.includes('serviço')) servicosVal += v;
        else outrosVal += v;
    });

    if (chartMixCompras) {
        const totalMix = pecasVal + servicosVal + outrosVal;
        chartMixCompras.data.labels = ['Peças de Estoque', 'Serviços Externos', 'Outros Suprimentos'];
        chartMixCompras.data.datasets = [{
            data: totalMix > 0 ? [pecasVal, servicosVal, outrosVal] : [1, 0, 0],
            backgroundColor: ['#f59e0b', '#06b6d4', '#8b5cf6'],
            borderWidth: 0,
            hoverOffset: 8
        }];
        chartMixCompras.update('active');
    }
}
