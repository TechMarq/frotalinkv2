// ============================================================
//  gerencial.js — Painel Executivo / Cockpit do Dono | FrotaLink
//  Inteligência Gerencial Consolidada 100% Real de Todos os Módulos:
//  Financeiro, Compras, Frota, Centros de Custo, Seguros,
//  Abastecimento, Manutenção, DP, Comercial, Prestadores e Estoque.
// ============================================================

let sb = null;
let empresaId = null;
let dadosBrutos = {};

// Período de análise
const hojeISO = new Date().toISOString().slice(0, 10);
const inicioMesISO = hojeISO.slice(0, 7) + '-01';

let periodoAtual = {
    tipo: 'mes_atual',
    valor: hojeISO.slice(0, 7),
    dataInicio: inicioMesISO,
    dataFim: hojeISO
};

// Instâncias de Gráficos Chart.js
let chartReceitaDespesa = null;
let chartCockpitMacroCustos = null;
let chartFinEvolucaoMensal = null;
let chartDespesasCateg = null;
let chartComprasEvolucaoMensal = null;
let chartMixCompras = null;
let chartFrotaEvolucaoMensal = null;
let chartFrotaStatus = null;
let chartFrotaCentrosCusto = null;
let chartCombEvolucaoMensal = null;
let chartManutEvolucaoMensal = null;
let chartDpEvolucaoMensal = null;
let chartDpSetores = null;
let chartComercialEvolucaoMensal = null;
let chartEstoqueEvolucaoMensal = null;
let chartEstoqueCategorias = null;

// ============================================================
//  INICIALIZAÇÃO & EVENT LISTENERS
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
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

    const periodoSelect = document.getElementById('periodo-select');
    const mesPickerWrap = document.getElementById('mes-picker-wrap');
    const mesPicker = document.getElementById('mes-picker');
    const customRangeWrap = document.getElementById('custom-range-wrap');
    const dataInicioPicker = document.getElementById('data-inicio-picker');
    const dataFimPicker = document.getElementById('data-fim-picker');

    if (mesPicker) mesPicker.value = hojeISO.slice(0, 7);
    if (dataInicioPicker) dataInicioPicker.value = inicioMesISO;
    if (dataFimPicker) dataFimPicker.value = hojeISO;

    if (periodoSelect) {
        periodoSelect.addEventListener('change', (e) => {
            periodoAtual.tipo = e.target.value;
            if (mesPickerWrap) {
                mesPickerWrap.style.display = e.target.value === 'mes_especifico' ? 'flex' : 'none';
            }
            if (customRangeWrap) {
                customRangeWrap.style.display = e.target.value === 'personalizado' ? 'flex' : 'none';
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

    if (dataInicioPicker) {
        dataInicioPicker.addEventListener('change', (e) => {
            periodoAtual.dataInicio = e.target.value;
            if (periodoAtual.dataFim && periodoAtual.dataInicio > periodoAtual.dataFim) {
                periodoAtual.dataFim = periodoAtual.dataInicio;
                if (dataFimPicker) dataFimPicker.value = periodoAtual.dataFim;
            }
            carregarTodos();
        });
    }

    if (dataFimPicker) {
        dataFimPicker.addEventListener('change', (e) => {
            periodoAtual.dataFim = e.target.value;
            if (periodoAtual.dataInicio && periodoAtual.dataFim < periodoAtual.dataInicio) {
                periodoAtual.dataInicio = periodoAtual.dataFim;
                if (dataInicioPicker) dataInicioPicker.value = periodoAtual.dataInicio;
            }
            carregarTodos();
        });
    }

    const btnRefresh = document.getElementById('btn-refresh');
    if (btnRefresh) {
        btnRefresh.addEventListener('click', () => {
            btnRefresh.classList.add('spin');
            setTimeout(() => btnRefresh.classList.remove('spin'), 800);
            carregarTodos();
        });
    }

    const btnPrint = document.getElementById('btn-print');
    if (btnPrint) {
        btnPrint.addEventListener('click', () => window.print());
    }
});

async function initGerencial() {
    setInterval(atualizarRelogio, 1000);
    atualizarRelogio();

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
//  UTILITÁRIOS DE FORMATAÇÃO E INTERVALOS DE DATAS / MESES
// ============================================================

function fmt(val, decimais = 2) {
    return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: decimais, maximumFractionDigits: decimais }).format(val || 0);
}

function fmtBRL(val) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
}

function fmtDataBR(dateStr) {
    if (!dateStr) return '-';
    const s = String(dateStr).slice(0, 10);
    const p = s.split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s;
}

function atualizarRelogio() {
    const el = document.getElementById('timestamp');
    if (el) el.textContent = 'Atualizado: ' + new Date().toLocaleTimeString('pt-BR');
}

function setKPI(id, valor) {
    const el = document.getElementById(id);
    if (el) el.textContent = valor;
}

function dataAddDias(dateStr, dias) {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + dias);
    return d.toISOString().slice(0, 10);
}

function toISODateLocal(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
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
            const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 30);
            inicio = d;
            fim = hoje;
            break;
        }
        case 'ultimos_3_meses': {
            inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 2, 1);
            fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
            break;
        }
        case 'trimestre': {
            const q = Math.floor(hoje.getMonth() / 3);
            inicio = new Date(hoje.getFullYear(), q * 3, 1);
            fim = new Date(hoje.getFullYear(), q * 3 + 3, 0);
            break;
        }
        case 'ultimos_6_meses': {
            inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 5, 1);
            fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
            break;
        }
        case 'semestre': {
            const s = hoje.getMonth() < 6 ? 0 : 6;
            inicio = new Date(hoje.getFullYear(), s, 1);
            fim = new Date(hoje.getFullYear(), s + 6, 0);
            break;
        }
        case 'ultimos_12_meses': {
            inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1);
            fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
            break;
        }
        case 'ano': {
            inicio = new Date(hoje.getFullYear(), 0, 1);
            fim = new Date(hoje.getFullYear(), 11, 31);
            break;
        }
        case 'mes_especifico': {
            const parts = (periodoAtual.valor || toISODateLocal(hoje).slice(0, 7)).split('-');
            const ano = parseInt(parts[0], 10);
            const mes = parseInt(parts[1], 10);
            inicio = new Date(ano, mes - 1, 1);
            fim = new Date(ano, mes, 0);
            break;
        }
        case 'personalizado': {
            const iniStr = periodoAtual.dataInicio || inicioMesISO;
            const fimStr = periodoAtual.dataFim || hojeISO;
            return { inicio: iniStr, fim: fimStr };
        }
        default: // 'mes_atual'
            inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
            fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
            break;
    }

    return {
        inicio: toISODateLocal(inicio),
        fim: toISODateLocal(fim)
    };
}

// Gera a lista exata de meses entre duas datas YYYY-MM-DD
function gerarMesesEntre(inicioStr, fimStr) {
    const meses = [];
    const [y1, m1] = inicioStr.slice(0, 7).split('-').map(Number);
    const [y2, m2] = fimStr.slice(0, 7).split('-').map(Number);

    let curY = y1;
    let curM = m1;
    let guard = 0;

    while ((curY < y2 || (curY === y2 && curM <= m2)) && guard < 48) {
        const d = new Date(curY, curM - 1, 1);
        const ultimoDia = new Date(curY, curM, 0);
        const anoMes = `${curY}-${String(curM).padStart(2, '0')}`;
        const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '');
        meses.push({
            anoMes,
            label: label.charAt(0).toUpperCase() + label.slice(1),
            inicio: toISODateLocal(d),
            fim: toISODateLocal(ultimoDia)
        });
        curM++;
        if (curM > 12) {
            curM = 1;
            curY++;
        }
        guard++;
    }
    return meses;
}

// Retorna os meses exatos do período (se > 1 mês) ou os últimos 6 meses até o mês selecionado (se 1 único mês)
function getContextoTemporal() {
    const { inicio, fim } = getIntervaloDatas();
    const mesesPeriodo = gerarMesesEntre(inicio, fim);
    const isMultiMes = mesesPeriodo.length > 1;

    let mesesGrafico = mesesPeriodo;
    if (!isMultiMes) {
        const [yFim, mFim] = fim.slice(0, 7).split('-').map(Number);
        const dRefIni = new Date(yFim, mFim - 6, 1);
        mesesGrafico = gerarMesesEntre(toISODateLocal(dRefIni), fim);
    }

    const inicioFetch = mesesGrafico.length > 0 && mesesGrafico[0].inicio < inicio
        ? mesesGrafico[0].inicio
        : inicio;

    return {
        inicio,
        fim,
        inicioFetch,
        mesesPeriodo,
        mesesGrafico,
        isMultiMes,
        qtdMesesPeriodo: Math.max(1, mesesPeriodo.length)
    };
}

function mostrarLoading(show) {
    const el = document.getElementById('loading-overlay');
    if (el) el.style.display = show ? 'flex' : 'none';
}

window.switchTab = function(tabId) {
    document.querySelectorAll('.tabs-header .tab-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));

    const activeBtn = document.querySelector(`.tab-item[onclick*="${tabId}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    const activeSection = document.getElementById(`view-${tabId}`);
    if (activeSection) activeSection.classList.add('active');

    if (window.lucide) lucide.createIcons();

    setTimeout(() => {
        [
            chartReceitaDespesa, chartCockpitMacroCustos,
            chartFinEvolucaoMensal, chartDespesasCateg,
            chartComprasEvolucaoMensal, chartMixCompras,
            chartFrotaEvolucaoMensal, chartFrotaStatus, chartFrotaCentrosCusto,
            chartCombEvolucaoMensal, chartManutEvolucaoMensal,
            chartDpEvolucaoMensal, chartDpSetores,
            chartComercialEvolucaoMensal, chartEstoqueEvolucaoMensal, chartEstoqueCategorias
        ].forEach(ch => { if (ch) ch.resize(); });
    }, 80);
};

// ============================================================
//  CARREGAMENTO CONSOLIDADO DE TODOS OS MÓDULOS (DADOS REAIS)
// ============================================================

async function carregarTodos() {
    mostrarLoading(true);
    try {
        const ctx = getContextoTemporal();
        dadosBrutos.ctxTemporal = ctx;

        // Atualizar badge de período no header
        const badgePeriodo = document.getElementById('periodo-badge-ativo');
        if (badgePeriodo) {
            badgePeriodo.textContent = `${fmtDataBR(ctx.inicio)} até ${fmtDataBR(ctx.fim)} (${ctx.qtdMesesPeriodo} ${ctx.qtdMesesPeriodo > 1 ? 'meses' : 'mês'})`;
        }

        await Promise.allSettled([
            carregarFinanceiro(ctx),
            carregarCompras(ctx),
            carregarFrota(ctx),
            carregarAbastecimento(ctx),
            carregarManutencao(ctx),
            carregarDP(ctx),
            carregarEstoque(ctx),
            carregarComercial(ctx)
        ]);

        renderTodos();
    } catch (err) {
        console.error('[Gerencial] Erro geral ao consolidar dados:', err);
    } finally {
        mostrarLoading(false);
    }
}

// 1. Financeiro, Plano de Contas, Centros de Custo, Itens de Lançamento & Bancos
async function carregarFinanceiro(ctx) {
    try {
        const [lancRes, contasRes, planoRes, ccFinRes, itensFinRes] = await Promise.allSettled([
            sb.from('view_fin_lancamentos_plano')
                .select('*')
                .order('data_vencimento', { ascending: false })
                .limit(6000),
            sb.from('fin_contas_bancarias')
                .select('*')
                .order('nome', { ascending: true }),
            sb.from('fin_plano_contas')
                .select('id, codigo, nome, tipo, parent_id')
                .order('codigo', { ascending: true }),
            sb.from('fin_centros_custo')
                .select('id, codigo, nome, parent_id')
                .order('codigo', { ascending: true }),
            sb.from('fin_lancamento_itens')
                .select('id, lancamento_id, tipo, descricao, quantidade, valor_unitario, centro_custo_id, veiculo_id, pessoa_nome')
                .limit(5000)
        ]);

        let planoContas = (planoRes.status === 'fulfilled' && planoRes.value.data) ? planoRes.value.data : [];
        const planoMap = {};
        planoContas.forEach(p => { planoMap[p.id] = p; });

        let lancList = [];
        if (lancRes.status === 'fulfilled' && lancRes.value.data && !lancRes.value.error) {
            lancList = lancRes.value.data;
        } else {
            const { data: fb } = await sb.from('fin_lancamentos').select('*').order('data_vencimento', { ascending: false }).limit(6000);
            lancList = fb || [];
        }

        // Enriquecer cada lançamento com código e nome do plano de contas se ausente
        lancList.forEach(l => {
            const pc = planoMap[l.categoria_id];
            if (pc) {
                if (!l.plano_conta_nome) l.plano_conta_nome = pc.nome;
                l.plano_conta_codigo = pc.codigo || '';
            } else {
                l.plano_conta_codigo = l.plano_conta_codigo || '';
            }
        });

        let contas = [];
        if (contasRes.status === 'fulfilled' && contasRes.value.data && !contasRes.value.error) {
            contas = contasRes.value.data;
        }

        dadosBrutos.planoContas = planoContas;
        dadosBrutos.planoMap = planoMap;
        dadosBrutos.finCentrosCusto = (ccFinRes.status === 'fulfilled' && ccFinRes.value.data) ? ccFinRes.value.data : [];
        dadosBrutos.finLancamentoItens = (itensFinRes.status === 'fulfilled' && itensFinRes.value.data) ? itensFinRes.value.data : [];
        dadosBrutos.lancamentos = lancList.filter(l => (l.status || '').toUpperCase() !== 'CANCELADO');
        dadosBrutos.contas = contas;

        // Lançamentos no período selecionado:
        // Para realizados (PAGO/RECEBIDO/PARCIAL), referência prioritária é data_pagamento || data_vencimento
        // Para abertos/previstos, referência é data_vencimento || data_competencia
        dadosBrutos.lancamentosPeriodo = dadosBrutos.lancamentos.filter(l => {
            const isPago = ['PAGO', 'RECEBIDO', 'PARCIAL'].includes((l.status || '').toUpperCase());
            const ref = isPago ? (l.data_pagamento || l.data_vencimento) : (l.data_vencimento || l.data_competencia);
            return ref && ref >= ctx.inicio && ref <= ctx.fim;
        });
    } catch (e) {
        console.warn('[Gerencial] Erro no módulo Financeiro:', e);
        dadosBrutos.lancamentos = [];
        dadosBrutos.lancamentosPeriodo = [];
        dadosBrutos.contas = [];
        dadosBrutos.planoContas = [];
        dadosBrutos.finCentrosCusto = [];
        dadosBrutos.finLancamentoItens = [];
    }
}

// 2. Compras, Itens de Compra e Centros de Custo
async function carregarCompras(ctx) {
    try {
        const [compRes, ccRes] = await Promise.allSettled([
            sb.from('compras')
                .select('id, data_emissao, numero_nota, fornecedor_id, centro_custo_id, valor_total, financeiro_parcelado, qtd_parcelas, fornecedores:fornecedor_id(nome, plano_contas_id)')
                .gte('data_emissao', ctx.inicioFetch)
                .lte('data_emissao', ctx.fim)
                .order('data_emissao', { ascending: false }),
            sb.from('centros_custo')
                .select('id, codigo, nome, parent_id')
                .order('codigo', { ascending: true })
        ]);

        const todasCompras = (compRes.status === 'fulfilled' && compRes.value.data) ? compRes.value.data : [];
        dadosBrutos.comprasHistorico = todasCompras;
        dadosBrutos.compras = todasCompras.filter(c => c.data_emissao >= ctx.inicio && c.data_emissao <= ctx.fim);
        dadosBrutos.centrosCusto = (ccRes.status === 'fulfilled' && ccRes.value.data) ? ccRes.value.data : [];

        const compraIds = todasCompras.map(c => c.id).filter(Boolean);
        let todosItens = [];
        if (compraIds.length > 0) {
            for (let i = 0; i < compraIds.length; i += 150) {
                const batch = compraIds.slice(i, i + 150);
                const { data: itens, error: iErr } = await sb.from('compra_itens')
                    .select('id, compra_id, tipo, produto, quantidade, valor_unitario, vinculo_veiculo_id, centro_custo_id, estoque')
                    .in('compra_id', batch);
                if (!iErr && itens) todosItens = todosItens.concat(itens);
            }
        }
        dadosBrutos.compraItensHistorico = todosItens;
        const idsPeriodoSet = new Set(dadosBrutos.compras.map(c => c.id));
        dadosBrutos.compraItens = todosItens.filter(it => idsPeriodoSet.has(it.compra_id));
    } catch (e) {
        console.warn('[Gerencial] Erro no módulo Compras:', e);
        dadosBrutos.comprasHistorico = [];
        dadosBrutos.compras = [];
        dadosBrutos.compraItensHistorico = [];
        dadosBrutos.compraItens = [];
        dadosBrutos.centrosCusto = [];
    }
}

// 3. Frota, Veículos, Seguros, Motoristas e Custos Adicionais de Fechamento
async function carregarFrota(ctx) {
    try {
        const [veicRes, motRes, adicRes] = await Promise.allSettled([
            sb.from('veiculos')
                .select('*')
                .order('placa', { ascending: true }),
            sb.from('motoristas')
                .select('id, nome_completo, vencimento_cnh, status'),
            sb.from('fechamento_custos_adicionais')
                .select('*')
        ]);

        const veiculos = (veicRes.status === 'fulfilled' && veicRes.value.data) ? veicRes.value.data : [];
        const motoristas = (motRes.status === 'fulfilled' && motRes.value.data) ? motRes.value.data : [];
        const custosAdicionais = (adicRes.status === 'fulfilled' && adicRes.value.data) ? adicRes.value.data : [];

        dadosBrutos.veiculos = veiculos.filter(v => (v.status || '').toUpperCase() !== 'INATIVO');
        dadosBrutos.motoristas = motoristas.filter(m => (m.status || '').toUpperCase() !== 'INATIVO');
        dadosBrutos.alocacoes = dadosBrutos.veiculos.filter(v => v.motorista_alocado_id || v.motorista_alocado_2_id);
        dadosBrutos.custosAdicionaisFrota = custosAdicionais;
    } catch (e) {
        console.warn('[Gerencial] Erro no módulo Frota:', e);
        dadosBrutos.veiculos = [];
        dadosBrutos.motoristas = [];
        dadosBrutos.alocacoes = [];
        dadosBrutos.custosAdicionaisFrota = [];
    }
}

// 4. Abastecimento & Combustível (Paginação automática cobrindo período + gráfico)
async function carregarAbastecimento(ctx) {
    try {
        let allRecords = [];
        const BATCH_SIZE = 1000;
        const MAX_REGISTROS = 20000;

        let useView = true;
        for (let offset = 0; offset < MAX_REGISTROS; offset += BATCH_SIZE) {
            const tableOrView = useView ? 'view_abastecimentos_completo' : 'abastecimentos';
            const selectCols = useView
                ? 'id, veiculo_id, veiculo_placa, veiculo_modelo, veiculo_classificacao, valor_total, litros, km_atual, valor_unitario, tipo_combustivel, posto_nome, data'
                : 'id, veiculo_id, valor_total, litros, km_atual, valor_unitario, tipo_combustivel, data';

            const { data, error } = await sb.from(tableOrView)
                .select(selectCols)
                .gte('data', ctx.inicioFetch)
                .lte('data', ctx.fim + 'T23:59:59')
                .order('data', { ascending: false })
                .range(offset, offset + BATCH_SIZE - 1);

            if (error) {
                if (useView && offset === 0) {
                    useView = false;
                    offset = -BATCH_SIZE;
                    continue;
                }
                break;
            }
            if (!data || data.length === 0) break;
            allRecords = allRecords.concat(data);
            if (data.length < BATCH_SIZE) break;
        }

        dadosBrutos.abastecimentosHistorico = allRecords;
        dadosBrutos.abastecimentos = allRecords.filter(a => {
            const dt = String(a.data || '').slice(0, 10);
            return dt >= ctx.inicio && dt <= ctx.fim;
        });
    } catch (e) {
        console.warn('[Gerencial] Erro no módulo Abastecimento:', e);
        dadosBrutos.abastecimentosHistorico = [];
        dadosBrutos.abastecimentos = [];
    }
}

// 5. Manutenção da Frota
async function carregarManutencao(ctx) {
    try {
        const [manutRes, pendRes] = await Promise.allSettled([
            sb.from('manutencoes')
                .select('id, veiculo_id, oficina_id, valor_total, tipo_id, status, data, manutencao_tipos:tipo_id(descricao), manutencao_itens(valor_pecas, valor_servicos)')
                .gte('data', ctx.inicioFetch)
                .lte('data', ctx.fim + 'T23:59:59')
                .order('data', { ascending: false }),
            sb.from('manutencoes')
                .select('id, status, veiculo_id')
                .in('status', ['PENDENTE', 'EM_ANDAMENTO', 'AGENDADO'])
        ]);

        let manutAll = [];
        if (manutRes.status === 'fulfilled' && manutRes.value.data && !manutRes.value.error) {
            manutAll = manutRes.value.data;
        } else {
            const { data: fbManut } = await sb.from('manutencoes')
                .select('id, veiculo_id, valor_total, tipo_id, status, data')
                .gte('data', ctx.inicioFetch)
                .lte('data', ctx.fim + 'T23:59:59');
            manutAll = fbManut || [];
        }

        dadosBrutos.manutencoesHistorico = manutAll;
        dadosBrutos.manutencoes = manutAll.filter(m => {
            const dt = String(m.data || '').slice(0, 10);
            return dt >= ctx.inicio && dt <= ctx.fim;
        });
        dadosBrutos.manutPendentes = (pendRes.status === 'fulfilled' && pendRes.value.data) ? pendRes.value.data : [];
    } catch (e) {
        console.warn('[Gerencial] Erro no módulo Manutenção:', e);
        dadosBrutos.manutencoesHistorico = [];
        dadosBrutos.manutencoes = [];
        dadosBrutos.manutPendentes = [];
    }
}

// 6. Departamento Pessoal Completo (Funcionários, ASOs, Férias, Atestados, Benefícios, EPIs, Contratos Exp)
async function carregarDP(ctx) {
    try {
        const filtro = empresaId ? { empresa_id: empresaId } : {};
        const [funcsRes, asosRes, feriasRes, atestRes, benefRes, episRes, expRes] = await Promise.allSettled([
            sb.from('dp_funcionarios').select('*').match(filtro),
            sb.from('dp_asos').select('id, funcionario_id, tipo, data_exame, data_vencimento, resultado').match(filtro),
            sb.from('dp_ferias').select('*').match(filtro),
            sb.from('dp_atestados').select('*').match(filtro),
            sb.from('dp_beneficios').select('*').match(filtro),
            sb.from('dp_epis').select('*').match(filtro),
            sb.from('dp_contratos_exp').select('*').match(filtro)
        ]);

        const todosFuncs = (funcsRes.status === 'fulfilled' && funcsRes.value.data) ? funcsRes.value.data : [];
        dadosBrutos.todosFuncionarios = todosFuncs;
        dadosBrutos.funcionarios = todosFuncs.filter(f => ['ATIVO', 'FERIAS', 'AFASTADO'].includes((f.status || 'ATIVO').toUpperCase()));
        dadosBrutos.asos = (asosRes.status === 'fulfilled' && asosRes.value.data) ? asosRes.value.data : [];
        dadosBrutos.ferias = (feriasRes.status === 'fulfilled' && feriasRes.value.data) ? feriasRes.value.data : [];
        dadosBrutos.atestados = (atestRes.status === 'fulfilled' && atestRes.value.data) ? atestRes.value.data : [];
        dadosBrutos.beneficios = (benefRes.status === 'fulfilled' && benefRes.value.data) ? benefRes.value.data : [];
        dadosBrutos.epis = (episRes.status === 'fulfilled' && episRes.value.data) ? episRes.value.data : [];
        dadosBrutos.contratosExp = (expRes.status === 'fulfilled' && expRes.value.data) ? expRes.value.data : [];
    } catch (e) {
        console.warn('[Gerencial] Erro no módulo DP:', e);
        dadosBrutos.todosFuncionarios = [];
        dadosBrutos.funcionarios = [];
        dadosBrutos.asos = [];
        dadosBrutos.ferias = [];
        dadosBrutos.atestados = [];
        dadosBrutos.beneficios = [];
        dadosBrutos.epis = [];
        dadosBrutos.contratosExp = [];
    }
}

// 7. Estoque, Movimentações e Vendas/Saídas
async function carregarEstoque(ctx) {
    try {
        const [estRes, movRes, vendasRes] = await Promise.allSettled([
            sb.from('estoque').select('*').eq('status', 'ATIVO'),
            sb.from('estoque_movimentacoes')
                .select('*')
                .gte('data', ctx.inicioFetch)
                .lte('data', ctx.fim + 'T23:59:59')
                .order('data', { ascending: false }),
            sb.from('vendas')
                .select('id, codigo, data, tipo, veiculo_id, placa, valor_total, status_pagamento')
                .gte('data', ctx.inicioFetch)
                .lte('data', ctx.fim + 'T23:59:59')
        ]);

        dadosBrutos.estoque = (estRes.status === 'fulfilled' && estRes.value.data) ? estRes.value.data : [];
        const movs = (movRes.status === 'fulfilled' && movRes.value.data) ? movRes.value.data : [];
        const vendas = (vendasRes.status === 'fulfilled' && vendasRes.value.data) ? vendasRes.value.data : [];

        dadosBrutos.estoqueMovsHistorico = movs;
        dadosBrutos.estoqueMovs = movs.filter(m => {
            const dt = String(m.data || '').slice(0, 10);
            return dt >= ctx.inicio && dt <= ctx.fim;
        });
        dadosBrutos.vendasHistorico = vendas;
        dadosBrutos.vendas = vendas.filter(v => {
            const dt = String(v.data || '').slice(0, 10);
            return dt >= ctx.inicio && dt <= ctx.fim;
        });
    } catch (e) {
        console.warn('[Gerencial] Erro no módulo Estoque:', e);
        dadosBrutos.estoque = [];
        dadosBrutos.estoqueMovsHistorico = [];
        dadosBrutos.estoqueMovs = [];
        dadosBrutos.vendasHistorico = [];
        dadosBrutos.vendas = [];
    }
}

// 8. Comercial, Contratos e Prestadores (Agregados)
async function carregarComercial(ctx) {
    try {
        const [contRes, prestRes] = await Promise.allSettled([
            sb.from('view_com_contratos_status').select('*'),
            sb.from('com_prestadores').select('*')
        ]);

        if (contRes.status === 'fulfilled' && contRes.value.data && !contRes.value.error) {
            dadosBrutos.contratos = contRes.value.data;
        } else {
            const { data: fb } = await sb.from('com_contratos').select('*');
            dadosBrutos.contratos = (fb || []).map(c => ({ ...c, status_nome: 'ATIVO' }));
        }

        dadosBrutos.prestadores = (prestRes.status === 'fulfilled' && prestRes.value.data) ? prestRes.value.data : [];
    } catch (e) {
        console.warn('[Gerencial] Erro no módulo Comercial:', e);
        dadosBrutos.contratos = [];
        dadosBrutos.prestadores = [];
    }
}

// ============================================================
//  HELPERS DE CLASSIFICAÇÃO DE CUSTOS E FROTA
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

function getManutValor(m) {
    const itVal = (m.manutencao_itens || []).reduce((si, it) => si + (parseFloat(it.valor_pecas) || 0) + (parseFloat(it.valor_servicos) || 0), 0);
    return Math.max(parseFloat(m.valor_total) || 0, itVal);
}

// Classifica lançamentos financeiros veiculares em Centros de Custo da Frota
function classificarNaturezaVeicular(l) {
    const cod = String(l.plano_conta_codigo || '').trim();
    const nome = String(l.plano_conta_nome || l.descricao || '').toUpperCase();

    if (cod.includes('0495') || nome.includes('SEGURO VEIC') || nome.includes('SEGURO FROTA') || nome.includes('APOLICE') || nome.includes('APÓLICE')) {
        return 'SEGUROS';
    }
    if (
        cod.includes('0499') || cod.includes('0464') || cod.includes('0497') || cod.includes('0526') || cod.includes('0531') ||
        nome.includes('IPVA') || nome.includes('LICENCIAMENTO') || nome.includes('DUDA') || nome.includes('GRT') || nome.includes('DETRO') || nome.includes('DESPACHANTE')
    ) {
        return 'DOCUMENTACAO';
    }
    if (cod.includes('0082') || cod.includes('0532') || nome.includes('MULTA') || nome.includes('INFRAC')) {
        return 'MULTAS';
    }
    if (cod.includes('0509') || nome.includes('RASTRE') || nome.includes('MONITORAMENTO') || nome.includes('TELEMETRIA')) {
        return 'RASTREIO';
    }
    if (cod.includes('0510') || cod.includes('0552') || cod.includes('0242') || nome.includes('FINANCIAMENTO DE VEIC') || nome.includes('CONSORCIO') || nome.includes('CONSÓRCIO')) {
        return 'FINANCIAMENTOS';
    }
    if (cod.includes('0076') || cod.includes('0084') || cod.includes('0083') || nome.includes('LAVAGEM') || nome.includes('LUBRIFIC') || nome.includes('ESTACIONAMENTO') || nome.includes('PEDAGIO') || nome.includes('PEDÁGIO')) {
        return 'LAVAGEM_PEDAGIO';
    }
    if (cod.startsWith('04.004.0023')) {
        return 'OUTRAS_VEICULOS';
    }
    return null;
}

// ============================================================
//  RENDERIZAÇÃO GERAL
// ============================================================

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
    const ctx = dadosBrutos.ctxTemporal || getContextoTemporal();
    const hoje = new Date().toISOString().slice(0, 10);
    const lp = dadosBrutos.lancamentosPeriodo || [];
    const isPago = (l) => ['PAGO', 'RECEBIDO', 'PARCIAL'].includes((l.status || '').toUpperCase());
    const isAberto = (l) => ['ABERTO', 'ATRASADO', 'PARCIAL'].includes((l.status || '').toUpperCase());
    const valReal = (l) => parseFloat(l.valor_pago) || parseFloat(l.valor_total) || 0;
    const valAberto = (l) => {
        if ((l.status || '').toUpperCase() === 'PARCIAL') {
            return Math.max(0, (parseFloat(l.valor_total) || 0) - (parseFloat(l.valor_pago) || 0));
        }
        return parseFloat(l.valor_total) || 0;
    };

    const receita = lp.filter(l => l.tipo === 'RECEBER' && isPago(l)).reduce((s, l) => s + valReal(l), 0);
    const receitaPrev = lp.filter(l => l.tipo === 'RECEBER' && isAberto(l)).reduce((s, l) => s + valAberto(l), 0);
    const tributosRetidos = lp.filter(l => l.tipo === 'RECEBER' && isPago(l)).reduce((s, l) => s + (parseFloat(l.valor_tributo_total) || 0), 0);

    const despesa = lp.filter(l => l.tipo === 'PAGAR' && isPago(l)).reduce((s, l) => s + valReal(l), 0);
    const despesaPrev = lp.filter(l => l.tipo === 'PAGAR' && isAberto(l)).reduce((s, l) => s + valAberto(l), 0);

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
        .reduce((s, l) => s + valAberto(l), 0);
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
    const criticos = estoque.filter(e => (parseFloat(e.estoque_atual) || 0) < (parseFloat(e.estoque_minimo) || 0)).length;
    if (criticos === 0) pilarSup += 10;
    else if (criticos <= 3) pilarSup += 6;

    const contratos = dadosBrutos.contratos || [];
    const ativosContr = contratos.filter(c => c.status_nome === 'ATIVO').length;
    if (ativosContr > 0) pilarSup += 10;
    else pilarSup += 5;

    const scoreTotal = Math.min(100, Math.max(0, pilarFin + pilarOps + pilarComp + pilarSup));

    setKPI('health-score-num', scoreTotal);
    const circleBar = document.getElementById('health-circle-bar');
    if (circleBar) {
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
            descEl.innerHTML = `Sua empresa opera em <strong>alta eficiência e rentabilidade</strong>. Finanças com margem líquida de <strong>${fmt(margem, 1)}%</strong>, frota ativa e conformidade legal controlada.`;
        } else if (scoreTotal >= 60) {
            badgeEl.className = 'health-desc-badge badge-warning';
            badgeEl.textContent = 'Atenção Moderada';
            descEl.innerHTML = `Operação estável, mas requer acompanhamento em <strong>${atrasadas.length ? atrasadas.length + ' título(s) vencido(s)' : 'manutenções pendentes e itens de estoque'}</strong>. Monitore o fluxo de caixa para os próximos 30 dias.`;
        } else {
            badgeEl.className = 'health-desc-badge badge-danger';
            badgeEl.textContent = 'Atenção Crítica';
            descEl.innerHTML = `Sua empresa demanda <strong>ações imediatas da diretoria</strong> em liquidez de caixa ou pendências legais (CNHs, ASOs, Seguros ou Contas Vencidas).`;
        }
    }

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

    // Big Numbers Linha 1
    setKPI('kpi-receita', fmtBRL(receita));
    setKPI('kpi-receita-prev-sub', `Em aberto no período: ${fmtBRL(receitaPrev)}`);
    setKPI('kpi-despesa', fmtBRL(despesa));
    setKPI('kpi-despesa-prev-sub', `Em aberto no período: ${fmtBRL(despesaPrev)}`);
    setKPI('kpi-resultado', fmtBRL(resultado));
    const resEl = document.getElementById('kpi-resultado');
    if (resEl) resEl.style.color = resultado >= 0 ? 'var(--success)' : 'var(--danger)';
    setKPI('kpi-margem', `Margem líquida: ${fmt(margem, 1)}%`);

    setKPI('kpi-saldo-caixa', fmtBRL(saldoCaixa));
    const saldoCaixaEl = document.getElementById('kpi-saldo-caixa');
    if (saldoCaixaEl) saldoCaixaEl.className = 'kpi-val ' + (saldoCaixa < 0 ? 'accent-red' : 'accent-cyan');
    setKPI('kpi-caixa-contas-sub', `${(dadosBrutos.contas || []).length} conta(s) integrada(s)`);

    const prestAtivos = (dadosBrutos.prestadores || []).filter(p => (p.status || '').toUpperCase() === 'ATIVO').length;
    setKPI('kpi-frota-resumo', `${alocados} / ${totalVeiculos}`);
    setKPI('kpi-frota-ocupacao', `${Math.round(taxaUso * 100)}% frota | +${prestAtivos} agregados`);

    const funcs = dadosBrutos.funcionarios || [];
    const folhaBase = funcs.reduce((s, f) => s + (parseFloat(f.salario) || 0), 0);
    const benefLiquido = (dadosBrutos.beneficios || []).filter(b => b.ativo !== false).reduce((s, b) => s + Math.max(0, (parseFloat(b.valor) || 0) - (parseFloat(b.valor_desconto_func) || 0)), 0);
    const custoTotalRH = folhaBase + benefLiquido;
    setKPI('kpi-dp-funcionarios', funcs.length);
    setKPI('kpi-dp-folha-sub', `Custo RH: ${fmtBRL(custoTotalRH)}/mês`);

    // Custos Operacionais Detalhados para DRE e Macro-Custos
    const absGasto = (dadosBrutos.abastecimentos || []).reduce((s, a) => s + (parseFloat(a.valor_total) || 0), 0);
    const manGasto = (dadosBrutos.manutencoes || []).reduce((s, m) => s + getManutValor(m), 0);
    const compGasto = (dadosBrutos.compras || []).reduce((s, c) => s + (parseFloat(c.valor_total) || 0), 0);

    // Despesas veiculares específicas no Financeiro (Seguros, IPVA, Multas, Rastreamento, Financiamentos)
    const despVeicularesFin = lp.filter(l => l.tipo === 'PAGAR' && isPago(l) && classificarNaturezaVeicular(l) !== null)
        .reduce((s, l) => s + valReal(l), 0);

    const custoTotalFrotaPeriodo = absGasto + manGasto + despVeicularesFin + (dadosBrutos.compraItens || []).filter(it => it.vinculo_veiculo_id).reduce((s, it) => s + ((parseFloat(it.quantidade) || 1) * (parseFloat(it.valor_unitario) || 0)), 0);

    // KM rodado no período
    const kmTotalPeriodo = calcularKmTotalFrota(dadosBrutos.abastecimentos || []);
    const tcoPorVeiculo = totalVeiculos > 0 ? (custoTotalFrotaPeriodo / totalVeiculos) : 0;
    const tcoPorKm = kmTotalPeriodo > 0 ? (custoTotalFrotaPeriodo / kmTotalPeriodo) : 0;

    // Novos KPIs do Dono (Linha 2)
    const saídasTotaisRef = Math.max(despesa, absGasto + manGasto + compGasto + custoTotalRH);
    const burnRateMensal = saídasTotaisRef / Math.max(1, ctx.qtdMesesPeriodo);
    const runwayMeses = burnRateMensal > 0 ? (saldoCaixa > 0 ? (saldoCaixa / burnRateMensal) : 0) : 0;
    const breakEvenCob = saídasTotaisRef > 0 ? ((receita / saídasTotaisRef) * 100) : (receita > 0 ? 100 : 0);

    const todosReceberAbertos = (dadosBrutos.lancamentos || []).filter(l => l.tipo === 'RECEBER' && isAberto(l));
    const totalCarteiraReceber = todosReceberAbertos.reduce((s, l) => s + valAberto(l), 0);
    const totalInadimplencia = todosReceberAbertos.filter(l => l.status === 'ATRASADO' || l.data_vencimento < hoje).reduce((s, l) => s + valAberto(l), 0);
    const percInadimplencia = totalCarteiraReceber > 0 ? ((totalInadimplencia / totalCarteiraReceber) * 100) : 0;

    const recPorColab = funcs.length > 0 ? (receita / funcs.length) : 0;
    const recPorVeic = totalVeiculos > 0 ? (receita / totalVeiculos) : 0;

    setKPI('kpi-owner-burnrate', fmtBRL(burnRateMensal));
    setKPI('kpi-owner-burnrate-sub', `Base: ${ctx.qtdMesesPeriodo} mês(es) analisado(s)`);
    setKPI('kpi-owner-runway', saldoCaixa <= 0 ? '0.0 meses' : `${fmt(runwayMeses, 1)} meses`);
    setKPI('kpi-owner-runway-sub', saldoCaixa <= 0 ? 'Caixa sem reserva livre' : `~${Math.round(runwayMeses * 30)} dias de operação`);
    setKPI('kpi-owner-breakeven', `${fmt(breakEvenCob, 1)}%`);
    setKPI('kpi-owner-breakeven-sub', breakEvenCob >= 100 ? '✓ Custos 100% cobertos' : `Faltam ${fmtBRL(Math.max(0, saídasTotaisRef - receita))}`);
    setKPI('kpi-owner-tco-veic', fmtBRL(tcoPorVeiculo));
    setKPI('kpi-owner-tco-km', kmTotalPeriodo > 0 ? `${fmtBRL(tcoPorKm)} / KM (${fmt(kmTotalPeriodo, 0)} KM)` : 'KM sob apuração');
    setKPI('kpi-owner-inadimplencia', fmtBRL(totalInadimplencia));
    setKPI('kpi-owner-inadimplencia-perc', `${fmt(percInadimplencia, 1)}% da carteira aberta`);
    setKPI('kpi-owner-produtividade', fmtBRL(recPorColab));
    setKPI('kpi-owner-produtividade-sub', `Por veículo: ${fmtBRL(recPorVeic)}`);

    // DRE Gerencial Completo
    const receitaLiquida = Math.max(0, receita - tributosRetidos);
    const folhaProporcional = custoTotalRH * ctx.qtdMesesPeriodo;
    const outrasDespesas = Math.max(0, despesa - (absGasto + manGasto + despVeicularesFin + compGasto + folhaProporcional));

    setKPI('dre-receita', fmtBRL(receita));
    setKPI('dre-tributos', `- ${fmtBRL(tributosRetidos)}`);
    setKPI('dre-receita-liquida', fmtBRL(receitaLiquida));
    setKPI('dre-combustivel', `- ${fmtBRL(absGasto)}`);
    setKPI('dre-manutencao', `- ${fmtBRL(manGasto)}`);
    setKPI('dre-desp-veiculares', `- ${fmtBRL(despVeicularesFin)}`);
    setKPI('dre-compras', `- ${fmtBRL(compGasto)}`);
    setKPI('dre-pessoal', `- ${fmtBRL(folhaProporcional)}`);
    setKPI('dre-outras', `- ${fmtBRL(outrasDespesas)}`);
    setKPI('dre-resultado', fmtBRL(resultado));
    const dreResEl = document.getElementById('dre-resultado');
    if (dreResEl) dreResEl.style.color = resultado >= 0 ? 'var(--success)' : 'var(--danger)';

    // Resumo Executivo por Módulo no Cockpit
    const modResumoEl = document.getElementById('cockpit-modulos-resumo');
    if (modResumoEl) {
        const valorContratosAtivos = contratos.filter(c => c.status_nome === 'ATIVO').reduce((s, c) => s + (parseFloat(c.valor_contrato) || 0), 0);
        const valorEstoqueTotal = estoque.reduce((s, e) => s + ((parseFloat(e.estoque_atual) || 0) * (parseFloat(e.valor_custo) || 0)), 0);
        modResumoEl.innerHTML = `
            <div class="metric-row">
                <span class="metric-label">💰 <strong>Financeiro:</strong> Entradas vs Saídas Efetivadas</span>
                <span class="metric-value"><span class="accent-green">${fmtBRL(receita)}</span> / <span class="accent-red">${fmtBRL(despesa)}</span></span>
            </div>
            <div class="metric-row">
                <span class="metric-label">🛍️ <strong>Compras:</strong> ${(dadosBrutos.compras || []).length} nota(s) emitida(s) no período</span>
                <span class="metric-value accent-indigo">${fmtBRL(compGasto)}</span>
            </div>
            <div class="metric-row">
                <span class="metric-label">⛽ <strong>Abastecimento:</strong> ${(dadosBrutos.abastecimentos || []).length} registro(s)</span>
                <span class="metric-value accent-red">${fmtBRL(absGasto)}</span>
            </div>
            <div class="metric-row">
                <span class="metric-label">🔧 <strong>Manutenção:</strong> ${mans.length} OS no período (${pendentes} aberta(s))</span>
                <span class="metric-value accent-amber">${fmtBRL(manGasto)}</span>
            </div>
            <div class="metric-row">
                <span class="metric-label">🛡️ <strong>Seguros & Doc. Frota:</strong> Despesas veiculares quitadas</span>
                <span class="metric-value accent-cyan">${fmtBRL(despVeicularesFin)}</span>
            </div>
            <div class="metric-row">
                <span class="metric-label">👥 <strong>Pessoas (DP):</strong> ${funcs.length} ativos (Folha + Benefícios)</span>
                <span class="metric-value accent-purple">${fmtBRL(custoTotalRH)}/mês</span>
            </div>
            <div class="metric-row">
                <span class="metric-label">💼 <strong>Comercial & Estoque:</strong> ${ativosContr} contratos | ${estoque.length} SKUs</span>
                <span class="metric-value"><span class="accent-green">${fmtBRL(valorContratosAtivos)}</span> | <span class="accent-amber">${fmtBRL(valorEstoqueTotal)}</span></span>
            </div>
        `;
    }
}

function calcularKmTotalFrota(absList) {
    let totalKmRodado = 0;
    const kmPorVeiculo = {};
    absList.forEach(a => {
        if (!a.veiculo_id || !a.km_atual) return;
        if (!kmPorVeiculo[a.veiculo_id]) kmPorVeiculo[a.veiculo_id] = [];
        kmPorVeiculo[a.veiculo_id].push(parseFloat(a.km_atual));
    });
    Object.values(kmPorVeiculo).forEach(kms => {
        if (kms.length > 1) {
            kms.sort((a, b) => a - b);
            const delta = kms[kms.length - 1] - kms[0];
            if (delta > 0 && delta < 150000) totalKmRodado += delta;
        }
    });
    return totalKmRodado;
}

// ─── 2. CENTRAL DE ALERTAS E RISCOS ───
function renderAlertas() {
    const hoje = new Date().toISOString().slice(0, 10);
    const em30 = dataAddDias(hoje, 30);
    const alertas = [];

    const contasAtrasadas = (dadosBrutos.lancamentos || []).filter(l => l.tipo === 'PAGAR' && (l.status === 'ATRASADO' || (l.status === 'ABERTO' && l.data_vencimento < hoje)));
    if (contasAtrasadas.length > 0) {
        const valAtraso = contasAtrasadas.reduce((s, l) => s + (parseFloat(l.valor_total) || 0), 0);
        alertas.push({
            tipo: 'danger',
            icon: 'alert-octagon',
            msg: `<strong>${contasAtrasadas.length} conta(s) a pagar vencida(s)</strong> (${fmtBRL(valAtraso)}) — regularização imediata.`
        });
    }

    const receberAtrasadas = (dadosBrutos.lancamentos || []).filter(l => l.tipo === 'RECEBER' && (l.status === 'ATRASADO' || (l.status === 'ABERTO' && l.data_vencimento < hoje)));
    if (receberAtrasadas.length > 0) {
        const valRec = receberAtrasadas.reduce((s, l) => s + (parseFloat(l.valor_total) || 0), 0);
        alertas.push({
            tipo: 'warn',
            icon: 'dollar-sign',
            msg: `<strong>${receberAtrasadas.length} título(s) a receber em atraso</strong> (${fmtBRL(valRec)}) — acionar cobrança de clientes.`
        });
    }

    const cnhsVencidas = (dadosBrutos.motoristas || []).filter(m => m.vencimento_cnh && m.vencimento_cnh < hoje);
    if (cnhsVencidas.length > 0) {
        alertas.push({
            tipo: 'danger',
            icon: 'user-x',
            msg: `<strong>${cnhsVencidas.length} motorista(s) com CNH vencida</strong> — impedimento legal de condução.`
        });
    }

    const asosVencidos = (dadosBrutos.asos || []).filter(a => a.data_vencimento && a.data_vencimento < hoje);
    if (asosVencidos.length > 0) {
        alertas.push({
            tipo: 'danger',
            icon: 'file-text',
            msg: `<strong>${asosVencidos.length} ASO(s) ocupacional(is) vencido(s)</strong> — risco trabalhista (NR-7).`
        });
    }

    const segurosVencidos = (dadosBrutos.veiculos || []).filter(v => v.vencimento_seguro && v.vencimento_seguro < hoje);
    if (segurosVencidos.length > 0) {
        alertas.push({
            tipo: 'danger',
            icon: 'shield-alert',
            msg: `<strong>${segurosVencidos.length} veículo(s) com apólice de seguro vencida</strong> — patrimônio descoberto.`
        });
    }

    const feriasVencidas = (dadosBrutos.ferias || []).filter(f => (f.status || '').toUpperCase() === 'VENCIDA' || (f.periodo_conc_fim && f.periodo_conc_fim < hoje && (f.status || '').toUpperCase() !== 'CONCLUIDA'));
    if (feriasVencidas.length > 0) {
        alertas.push({
            tipo: 'danger',
            icon: 'calendar-off',
            msg: `<strong>${feriasVencidas.length} período(s) de férias vencido(s)</strong> — risco de pagamento em dobro (CLT).`
        });
    }

    const manPend = (dadosBrutos.manutPendentes || []).length;
    if (manPend > 0) {
        alertas.push({
            tipo: 'info',
            icon: 'wrench',
            msg: `<strong>${manPend} ordem(ns) de serviço pendente(s)</strong> — veículos em oficina ou agendados.`
        });
    }

    const estoqueCritico = (dadosBrutos.estoque || []).filter(e => (parseFloat(e.estoque_atual) || 0) < (parseFloat(e.estoque_minimo) || 0)).length;
    if (estoqueCritico > 0) {
        alertas.push({
            tipo: 'warn',
            icon: 'package-open',
            msg: `<strong>${estoqueCritico} peça(s) abaixo do estoque mínimo</strong> — risco de parada na manutenção.`
        });
    }

    const contratosVencendo = (dadosBrutos.contratos || []).filter(c => c.data_vencimento && c.data_vencimento >= hoje && c.data_vencimento <= em30 && c.status_nome === 'ATIVO').length;
    if (contratosVencendo > 0) {
        alertas.push({
            tipo: 'info',
            icon: 'briefcase',
            msg: `<strong>${contratosVencendo} contrato(s) comercial(is) vencendo em 30 dias</strong> — iniciar renovação.`
        });
    }

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
    }
}

// ─── 3. RESUMO PATRIMONIAL OPERACIONAL ───
function renderPatrimonio() {
    const saldoCaixa = (dadosBrutos.contas || []).reduce((s, c) => s + (parseFloat(c.saldo_atual) || 0), 0);
    const fipeTotal = (dadosBrutos.veiculos || []).reduce((s, v) => s + (parseFloat(v.valor_fipe_mes) || 0), 0);
    const estoqueTotal = (dadosBrutos.estoque || []).reduce((s, e) => s + ((parseFloat(e.estoque_atual) || 0) * (parseFloat(e.valor_custo) || 0)), 0);

    const receberAberto = (dadosBrutos.lancamentos || [])
        .filter(l => l.tipo === 'RECEBER' && ['ABERTO', 'PARCIAL', 'ATRASADO'].includes((l.status || '').toUpperCase()))
        .reduce((s, l) => s + Math.max(0, (parseFloat(l.valor_total) || 0) - (parseFloat(l.valor_pago) || 0)), 0);

    const passivoPagar = (dadosBrutos.lancamentos || [])
        .filter(l => l.tipo === 'PAGAR' && ['ABERTO', 'PARCIAL', 'ATRASADO'].includes((l.status || '').toUpperCase()))
        .reduce((s, l) => s + Math.max(0, (parseFloat(l.valor_total) || 0) - (parseFloat(l.valor_pago) || 0)), 0);

    const patrimonioLiquidoOp = (saldoCaixa + fipeTotal + estoqueTotal + receberAberto) - passivoPagar;

    setKPI('patri-caixa', fmtBRL(saldoCaixa));
    const patriCaixaEl = document.getElementById('patri-caixa');
    if (patriCaixaEl) patriCaixaEl.style.color = saldoCaixa < 0 ? '#fca5a5' : '#86efac';

    setKPI('patri-fipe', fmtBRL(fipeTotal));
    setKPI('patri-estoque', fmtBRL(estoqueTotal));
    setKPI('patri-receber', fmtBRL(receberAberto));
    setKPI('patri-passivo', fmtBRL(passivoPagar));
    setKPI('patri-total', fmtBRL(patrimonioLiquidoOp));
}

// ─── 4. FINANCEIRO DETALHADO ───
function getBankMeta(c) {
    const cod = String(c.banco || '').trim();
    const nomeUpper = String(c.nome || '').toUpperCase();
    if (cod === '748' || nomeUpper.includes('SICREDI')) {
        return { tag: 'SICREDI', label: 'Banco Cooperativo Sicredi (748)', color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.35)' };
    }
    if (cod === '341' || nomeUpper.includes('ITAU') || nomeUpper.includes('ITAÚ')) {
        return { tag: 'ITAÚ', label: 'Banco Itaú Unibanco (341)', color: '#f97316', bg: 'rgba(249, 115, 22, 0.12)', border: 'rgba(249, 115, 22, 0.35)' };
    }
    if (cod === '001' || cod === '1' || nomeUpper.includes('BRASIL') || nomeUpper.includes('BB')) {
        return { tag: 'BB', label: 'Banco do Brasil (001)', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.12)', border: 'rgba(56, 189, 248, 0.35)' };
    }
    if (cod === '033' || cod === '33' || nomeUpper.includes('SANTANDER')) {
        return { tag: 'SAN', label: 'Banco Santander Brasil (033)', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.35)' };
    }
    if (cod === '104' || nomeUpper.includes('CAIXA')) {
        return { tag: 'CEF', label: 'Caixa Econômica Federal (104)', color: '#0284c7', bg: 'rgba(2, 132, 199, 0.12)', border: 'rgba(2, 132, 199, 0.35)' };
    }
    if (cod === '237' || nomeUpper.includes('BRADESCO')) {
        return { tag: 'BBD', label: 'Banco Bradesco (237)', color: '#e11d48', bg: 'rgba(225, 29, 72, 0.12)', border: 'rgba(225, 29, 72, 0.35)' };
    }
    return {
        tag: cod ? `BCO ${cod}` : 'BANCO',
        label: c.banco ? `Banco Cód. ${c.banco}` : 'Conta Bancária',
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
    const lp = dadosBrutos.lancamentosPeriodo || [];
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

    const saldoEl = document.getElementById('kpi-fin-saldo-caixa');
    if (saldoEl) {
        saldoEl.textContent = fmtBRL(saldoCaixa);
        saldoEl.className = `stat-mini-val ${saldoCaixa < 0 ? 'accent-red' : 'accent-green'}`;
    }
    setKPI('kpi-fin-saldo-sub', `Consolidado em ${contas.length} conta(s)`);

    const projEl = document.getElementById('kpi-fin-projecao');
    if (projEl) {
        projEl.textContent = fmtBRL(projecao30d);
        projEl.className = `stat-mini-val ${projecao30d < 0 ? 'accent-red' : 'accent-green'}`;
    }

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
            liqDescEl.textContent = '⚠️ Caixa parcial para 30 dias';
            liqDescEl.style.color = 'var(--warning)';
        }
    }

    const atrasadas = lancamentos.filter(l => l.tipo === 'PAGAR' && (l.status === 'ATRASADO' || (l.status === 'ABERTO' && l.data_vencimento < hoje)));
    const valAtrasadas = atrasadas.reduce((s, l) => s + (parseFloat(l.valor_total) || 0), 0);
    setKPI('kpi-contas-atrasadas', atrasadas.length);
    setKPI('kpi-contas-atrasadas-val', fmtBRL(valAtrasadas));

    const aVencer7 = lancamentos.filter(l => l.tipo === 'PAGAR' && l.status === 'ABERTO' && l.data_vencimento >= hoje && l.data_vencimento <= em7);
    const valVencer7 = aVencer7.reduce((s, l) => s + (parseFloat(l.valor_total) || 0), 0);
    setKPI('kpi-a-vencer', aVencer7.length);
    setKPI('kpi-a-vencer-val', fmtBRL(valVencer7));

    setKPI('kpi-a-receber', fmtBRL(aReceber30));
    const inadimplencia = lancamentos
        .filter(l => l.tipo === 'RECEBER' && (l.status === 'ATRASADO' || (l.status === 'ABERTO' && l.data_vencimento < hoje)))
        .reduce((s, l) => s + val(l), 0);
    setKPI('kpi-inadimplencia-receber', `Inadimplência: ${fmtBRL(inadimplencia)}`);

    // Descontos obtidos vs Juros pagos no período
    const descontosPeriodo = lp.reduce((s, l) => s + (parseFloat(l.valor_desconto) || 0), 0);
    const jurosPeriodo = lp.reduce((s, l) => s + (parseFloat(l.valor_juros) || 0), 0);
    const tributosPeriodo = lp.filter(l => l.tipo === 'RECEBER').reduce((s, l) => s + (parseFloat(l.valor_tributo_total) || 0), 0);
    setKPI('kpi-fin-descontos', fmtBRL(descontosPeriodo));
    setKPI('kpi-fin-juros-sub', `Juros pagos: ${fmtBRL(jurosPeriodo)}`);
    setKPI('kpi-fin-tributos', fmtBRL(tributosPeriodo));

    // Contas Bancárias
    const badgeContas = document.getElementById('contas-count-badge');
    if (badgeContas) badgeContas.textContent = `${contas.length} Contas`;

    const contasListEl = document.getElementById('contas-bancarias-list');
    if (contasListEl) {
        if (contas.length === 0) {
            contasListEl.innerHTML = '<p class="empty-msg">Nenhuma conta bancária cadastrada.</p>';
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
                                    ${c.pix ? `<span class="bank-pix-tag">PIX: ${c.pix}</span>` : ''}
                                </div>
                            </div>
                        </div>
                        <div class="bank-card-right">
                            <div class="bank-saldo ${isNeg ? 'accent-red' : 'accent-green'}">${fmtBRL(saldo)}</div>
                            <span class="bank-status-pill ${isNeg ? 'status-devedor' : 'status-positivo'}">
                                ${isNeg ? 'Saldo Devedor' : 'Saldo Positivo'}
                            </span>
                        </div>
                    </div>`;
            }).join('');

            const footerHtml = `
                <div class="bank-summary-footer">
                    <div style="font-size:0.76rem;color:var(--text-soft);font-weight:700;">Posição Consolidada (${contas.length} contas):</div>
                    <div style="font-size:1.25rem;font-weight:900;" class="${saldoCaixa < 0 ? 'accent-red' : 'accent-green'}">${fmtBRL(saldoCaixa)}</div>
                </div>`;
            contasListEl.innerHTML = itemsHtml + footerHtml;
        }
    }

    // Tabela de Saídas por Plano de Contas no Período
    const planoBody = document.getElementById('fin-plano-contas-body');
    if (planoBody) {
        const porPlano = {};
        let somaGeralPlano = 0;
        lp.filter(l => l.tipo === 'PAGAR').forEach(l => {
            const nome = l.plano_conta_nome || 'Sem Classificação / Outras';
            if (!porPlano[nome]) porPlano[nome] = { pago: 0, aberto: 0, total: 0 };
            const st = (l.status || '').toUpperCase();
            if (['PAGO', 'RECEBIDO'].includes(st)) {
                const v = parseFloat(l.valor_pago) || parseFloat(l.valor_total) || 0;
                porPlano[nome].pago += v;
                porPlano[nome].total += v;
                somaGeralPlano += v;
            } else if (st === 'PARCIAL') {
                const vp = parseFloat(l.valor_pago) || 0;
                const va = Math.max(0, (parseFloat(l.valor_total) || 0) - vp);
                porPlano[nome].pago += vp;
                porPlano[nome].aberto += va;
                porPlano[nome].total += (vp + va);
                somaGeralPlano += (vp + va);
            } else {
                const va = parseFloat(l.valor_total) || 0;
                porPlano[nome].aberto += va;
                porPlano[nome].total += va;
                somaGeralPlano += va;
            }
        });

        const rows = Object.entries(porPlano)
            .map(([nome, d]) => ({ nome, ...d }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 10);

        planoBody.innerHTML = rows.length === 0
            ? '<tr><td colspan="5" class="empty-msg">Nenhuma despesa registrada no período selecionado.</td></tr>'
            : rows.map(r => {
                const perc = somaGeralPlano > 0 ? ((r.total / somaGeralPlano) * 100) : 0;
                return `
                    <tr>
                        <td style="font-weight:600;">${r.nome}</td>
                        <td style="text-align:right;" class="accent-green">${fmtBRL(r.pago)}</td>
                        <td style="text-align:right;" class="accent-amber">${fmtBRL(r.aberto)}</td>
                        <td style="text-align:right;font-weight:700;">${fmtBRL(r.total)}</td>
                        <td style="text-align:right;color:var(--text-soft);">${fmt(perc, 1)}%</td>
                    </tr>`;
            }).join('');
    }
}

// ─── 5. MÓDULO DE COMPRAS & CENTROS DE CUSTO ───
function renderCompras() {
    const compras = dadosBrutos.compras || [];
    const itens = dadosBrutos.compraItens || [];
    const centrosCusto = [...(dadosBrutos.centrosCusto || []), ...(dadosBrutos.finCentrosCusto || [])];
    const ccMap = {};
    centrosCusto.forEach(c => { ccMap[String(c.id)] = c.codigo ? `${c.codigo} - ${c.nome}` : c.nome; });

    const totalGasto = compras.reduce((s, c) => s + (parseFloat(c.valor_total) || 0), 0);
    const qtdNotas = compras.length;
    const ticketMedio = qtdNotas > 0 ? (totalGasto / qtdNotas) : 0;
    const fornecedoresSet = new Set(compras.map(c => c.fornecedor_id).filter(Boolean));

    // Valor vinculado diretamente a veículos vs estoque
    let valVeiculos = 0;
    let qtdItensVeic = 0;
    let valEstoque = 0;
    itens.forEach(it => {
        const sub = (parseFloat(it.quantidade) || 1) * (parseFloat(it.valor_unitario) || 0);
        if (it.vinculo_veiculo_id) {
            valVeiculos += sub;
            qtdItensVeic++;
        }
        if (it.estoque) {
            valEstoque += sub;
        }
    });

    setKPI('kpi-compras-total', fmtBRL(totalGasto));
    setKPI('kpi-compras-qtd', qtdNotas);
    setKPI('kpi-compras-ticket', fmtBRL(ticketMedio));
    setKPI('kpi-compras-fornecedores', fornecedoresSet.size);
    setKPI('kpi-compras-veiculos-val', fmtBRL(valVeiculos));
    setKPI('kpi-compras-veiculos-sub', `${qtdItensVeic} item(ns) aplicados em placas`);
    setKPI('kpi-compras-estoque-val', fmtBRL(valEstoque));

    // Compras por Centro de Custo (combina centro_custo_id da nota e dos itens)
    const porCC = {};
    let totalCC = 0;

    // Mapear compras por id
    const compraMap = {};
    compras.forEach(c => { compraMap[c.id] = c; });

    if (itens.length > 0) {
        itens.forEach(it => {
            const comp = compraMap[it.compra_id];
            const ccId = it.centro_custo_id || comp?.centro_custo_id;
            const nomeCC = (ccId && ccMap[String(ccId)]) ? ccMap[String(ccId)] : (it.vinculo_veiculo_id ? 'Manutenção / Aplicação Veicular' : 'Geral / Suprimentos');
            const val = (parseFloat(it.quantidade) || 1) * (parseFloat(it.valor_unitario) || 0);
            if (!porCC[nomeCC]) porCC[nomeCC] = { count: 0, total: 0 };
            porCC[nomeCC].count += 1;
            porCC[nomeCC].total += val;
            totalCC += val;
        });
    } else {
        compras.forEach(c => {
            const nomeCC = (c.centro_custo_id && ccMap[String(c.centro_custo_id)]) ? ccMap[String(c.centro_custo_id)] : 'Geral / Suprimentos';
            const val = parseFloat(c.valor_total) || 0;
            if (!porCC[nomeCC]) porCC[nomeCC] = { count: 0, total: 0 };
            porCC[nomeCC].count += 1;
            porCC[nomeCC].total += val;
            totalCC += val;
        });
    }

    const ccBody = document.getElementById('compras-centro-custo-body');
    if (ccBody) {
        const listCC = Object.entries(porCC)
            .map(([nome, d]) => ({ nome, ...d }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 8);

        ccBody.innerHTML = listCC.length === 0
            ? '<tr><td colspan="5" class="empty-msg">Nenhuma compra registrada no período</td></tr>'
            : listCC.map((c, i) => {
                const perc = totalCC > 0 ? ((c.total / totalCC) * 100) : 0;
                return `
                    <tr>
                        <td><span class="badge-rank ${i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : ''}">${i + 1}</span></td>
                        <td style="font-weight:600;">${c.nome}</td>
                        <td>${c.count}</td>
                        <td style="text-align:right;font-weight:700;">${fmtBRL(c.total)}</td>
                        <td style="text-align:right;color:var(--text-soft);">${fmt(perc, 1)}%</td>
                    </tr>`;
            }).join('');
    }

    // Top Fornecedores
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
        .slice(0, 8);

    const fornsBody = document.getElementById('top-fornecedores-body');
    if (fornsBody) {
        fornsBody.innerHTML = topForns.length === 0
            ? '<tr><td colspan="5" class="empty-msg">Nenhuma compra no período selecionado</td></tr>'
            : topForns.map((f, i) => {
                const perc = totalGasto > 0 ? ((f.total / totalGasto) * 100) : 0;
                return `
                    <tr>
                        <td><span class="badge-rank ${i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : ''}">${i + 1}</span></td>
                        <td style="font-weight:600;">${f.nome}</td>
                        <td>${f.count} nota(s)</td>
                        <td style="text-align:right;font-weight:700;">${fmtBRL(f.total)}</td>
                        <td style="text-align:right;color:var(--text-soft);">${fmt(perc, 1)}%</td>
                    </tr>`;
            }).join('');
    }
}

// ─── 6. FROTA, CENTROS DE CUSTO (SEGUROS ETC.), COMBUSTÍVEL, MANUTENÇÃO & VILÕES ───
function renderFrota() {
    const hoje = new Date().toISOString().slice(0, 10);
    const em30 = dataAddDias(hoje, 30);
    const veiculos = dadosBrutos.veiculos || [];
    const { total, alocados, emManut, patio: disponiveis } = getFrotaStatusCounts(veiculos);
    const mans = dadosBrutos.manutencoes || [];
    const pendentes = dadosBrutos.manutPendentes || [];
    const abs = dadosBrutos.abastecimentos || [];
    const lp = dadosBrutos.lancamentosPeriodo || [];
    const prestadores = dadosBrutos.prestadores || [];

    // Classificação Casa vs Agregados
    const qtdCasa = veiculos.filter(v => (v.classificacao || 'CASA').toUpperCase().includes('CASA')).length;
    const qtdAgregFrota = veiculos.length - qtdCasa;
    const qtdPrestAtivos = prestadores.filter(p => (p.status || '').toUpperCase() === 'ATIVO').length;

    const fipeTotal = veiculos.reduce((s, v) => s + (parseFloat(v.valor_fipe_mes) || 0), 0);
    const fipeMedia = total > 0 ? (fipeTotal / total) : 0;

    // ─── CÁLCULO DOS CENTROS DE CUSTO DA FROTA NO PERÍODO ───
    // 1. Combustível
    const totalCombGasto = abs.reduce((s, a) => s + (parseFloat(a.valor_total) || 0), 0);
    const totalLitros = abs.reduce((s, a) => s + (parseFloat(a.litros) || 0), 0);
    const mediaPrecoLitro = totalLitros > 0 ? (totalCombGasto / totalLitros) : 0;
    const totalKmRodado = calcularKmTotalFrota(abs);
    const mediaKmL = (totalLitros > 0 && totalKmRodado > 0) ? (totalKmRodado / totalLitros) : 0;
    const custoCombKm = (totalKmRodado > 0 && totalCombGasto > 0) ? (totalCombGasto / totalKmRodado) : 0;

    // 2. Manutenções
    let totalManutPecas = 0;
    let totalManutServicos = 0;
    const totalManutGasto = mans.reduce((s, m) => {
        (m.manutencao_itens || []).forEach(it => {
            totalManutPecas += (parseFloat(it.valor_pecas) || 0);
            totalManutServicos += (parseFloat(it.valor_servicos) || 0);
        });
        return s + getManutValor(m);
    }, 0);

    // 3. Peças/Compras vinculadas a veículos
    const totalComprasVeic = (dadosBrutos.compraItens || [])
        .filter(it => it.vinculo_veiculo_id)
        .reduce((s, it) => s + ((parseFloat(it.quantidade) || 1) * (parseFloat(it.valor_unitario) || 0)), 0);

    // 4. Centros de Custo Financeiros Veiculares (Seguros, IPVA/Doc, Multas, Rastreio, Financiamentos, Lavagem/Pedágio)
    const naturezas = {
        SEGUROS: { label: '🛡️ Seguros de Veículos (Apólices)', pago: 0, aberto: 0 },
        DOCUMENTACAO: { label: '📄 IPVA, Licenciamento, DUDA, GRT & DETRO', pago: 0, aberto: 0 },
        MULTAS: { label: '🚨 Multas & Infrações de Trânsito', pago: 0, aberto: 0 },
        RASTREIO: { label: '📡 Monitoramento, Telemetria & Rastreio', pago: 0, aberto: 0 },
        FINANCIAMENTOS: { label: '🏦 Financiamentos & Consórcios de Frota', pago: 0, aberto: 0 },
        LAVAGEM_PEDAGIO: { label: '🧼 Lavagem, Lubrificação, Pedágio & Estac.', pago: 0, aberto: 0 },
        OUTRAS_VEICULOS: { label: '⚙️ Outras Despesas Veiculares (Plano 0023)', pago: 0, aberto: 0 }
    };

    lp.filter(l => l.tipo === 'PAGAR').forEach(l => {
        const nat = classificarNaturezaVeicular(l);
        if (!nat || !naturezas[nat]) return;
        const st = (l.status || '').toUpperCase();
        if (['PAGO', 'RECEBIDO'].includes(st)) {
            naturezas[nat].pago += (parseFloat(l.valor_pago) || parseFloat(l.valor_total) || 0);
        } else if (st === 'PARCIAL') {
            const vp = parseFloat(l.valor_pago) || 0;
            const va = Math.max(0, (parseFloat(l.valor_total) || 0) - vp);
            naturezas[nat].pago += vp;
            naturezas[nat].aberto += va;
        } else {
            naturezas[nat].aberto += (parseFloat(l.valor_total) || 0);
        }
    });

    const totalSeguros = naturezas.SEGUROS.pago + naturezas.SEGUROS.aberto;
    const totalDoc = naturezas.DOCUMENTACAO.pago + naturezas.DOCUMENTACAO.aberto;
    const totalMultas = naturezas.MULTAS.pago + naturezas.MULTAS.aberto;
    const totalRastreio = naturezas.RASTREIO.pago + naturezas.RASTREIO.aberto;
    const totalFinanc = naturezas.FINANCIAMENTOS.pago + naturezas.FINANCIAMENTOS.aberto;
    const totalLavPed = naturezas.LAVAGEM_PEDAGIO.pago + naturezas.LAVAGEM_PEDAGIO.aberto;
    const totalOutrasVeic = naturezas.OUTRAS_VEICULOS.pago + naturezas.OUTRAS_VEICULOS.aberto;

    const totalDespVeicularesFin = totalSeguros + totalDoc + totalMultas + totalRastreio + totalFinanc + totalLavPed + totalOutrasVeic;
    const tcoTotalFrota = totalCombGasto + totalManutGasto + totalComprasVeic + totalDespVeicularesFin;
    const percTcoFipe = fipeTotal > 0 ? ((tcoTotalFrota / fipeTotal) * 100) : 0;
    const tcoPorKmGlobal = totalKmRodado > 0 ? (tcoTotalFrota / totalKmRodado) : 0;

    // Seguros cadastrais nos veículos
    const veicComSeguro = veiculos.filter(v => v.seguradora || v.vencimento_seguro || v.numero_apolice);
    const segVencidos = veiculos.filter(v => v.vencimento_seguro && v.vencimento_seguro < hoje);
    const segVencendo30 = veiculos.filter(v => v.vencimento_seguro && v.vencimento_seguro >= hoje && v.vencimento_seguro <= em30);
    const segVigentesOk = veiculos.filter(v => v.vencimento_seguro && v.vencimento_seguro >= hoje);

    // Preencher KPIs de Frota & TCO
    setKPI('kpi-frota-total', total);
    setKPI('kpi-frota-casa-agreg-sub', `${qtdCasa} Casa | ${qtdAgregFrota + qtdPrestAtivos} Agreg./Prest.`);
    setKPI('kpi-frota-alocados', alocados);
    setKPI('kpi-frota-disp-manut-sub', `Pátio: ${disponiveis} | Oficina: ${emManut}`);
    setKPI('kpi-frota-fipe-total', fmtBRL(fipeTotal));
    setKPI('kpi-frota-fipe-media', `Média/veíc: ${fmtBRL(fipeMedia)}`);
    setKPI('kpi-frota-tco-total', fmtBRL(tcoTotalFrota));
    setKPI('kpi-frota-tco-fipe-perc', `${fmt(percTcoFipe, 1)}% sobre patrimônio FIPE`);
    setKPI('kpi-frota-km-total', `${fmt(totalKmRodado, 0)} KM`);
    setKPI('kpi-frota-custo-km-global', totalKmRodado > 0 ? `TCO/KM: ${fmtBRL(tcoPorKmGlobal)}/KM` : 'Aguardando leituras de KM');
    setKPI('kpi-frota-seguros-ok', `${segVigentesOk.length} / ${total}`);
    setKPI('kpi-frota-seguros-alerta-sub', `${segVencidos.length} vencido(s) | ${segVencendo30.length} vencendo (30d)`);

    setKPI('kpi-frota-qtd-casa', qtdCasa);
    setKPI('kpi-frota-qtd-agregados', qtdAgregFrota + qtdPrestAtivos);
    setKPI('kpi-frota-disponiveis', disponiveis);
    setKPI('kpi-frota-em-manut', emManut);

    // Cards de Centros de Custo da Frota
    setKPI('kpi-cc-seguros', fmtBRL(totalSeguros));
    setKPI('kpi-cc-seguros-sub', `${veicComSeguro.length} apólice(s) cadastrada(s)`);
    setKPI('kpi-cc-documentacao', fmtBRL(totalDoc));
    setKPI('kpi-cc-multas', fmtBRL(totalMultas));
    setKPI('kpi-cc-rastreio', fmtBRL(totalRastreio));
    setKPI('kpi-cc-financiamentos', fmtBRL(totalFinanc));
    setKPI('kpi-cc-lavagem-pedagio', fmtBRL(totalLavPed));

    // Tabela Analítica de Centros de Custo da Frota
    const linhasCentrosFrota = [
        { nome: '⛽ Combustível & Abastecimentos', pago: totalCombGasto, aberto: 0, total: totalCombGasto },
        { nome: '🔧 Manutenção & Oficinas', pago: totalManutGasto, aberto: 0, total: totalManutGasto },
        { nome: '🔩 Compras de Peças / Insumos p/ Veículos', pago: totalComprasVeic, aberto: 0, total: totalComprasVeic },
        ...Object.values(naturezas).map(n => ({ nome: n.label, pago: n.pago, aberto: n.aberto, total: n.pago + n.aberto }))
    ].sort((a, b) => b.total - a.total);

    dadosBrutos.linhasCentrosFrota = linhasCentrosFrota;

    const ccFrotaBody = document.getElementById('frota-centros-custo-body');
    if (ccFrotaBody) {
        ccFrotaBody.innerHTML = linhasCentrosFrota.map(r => {
            const perc = tcoTotalFrota > 0 ? ((r.total / tcoTotalFrota) * 100) : 0;
            return `
                <tr>
                    <td style="font-weight:600;">${r.nome}</td>
                    <td style="text-align:right;" class="accent-green">${fmtBRL(r.pago)}</td>
                    <td style="text-align:right;" class="accent-amber">${fmtBRL(r.aberto)}</td>
                    <td style="text-align:right;font-weight:800;">${fmtBRL(r.total)}</td>
                    <td style="text-align:right;color:var(--text-soft);font-weight:700;">${fmt(perc, 1)}%</td>
                </tr>`;
        }).join('');
    }

    // Resumo de Seguradoras & Corretores
    const seguradorasBody = document.getElementById('frota-seguradoras-body');
    if (seguradorasBody) {
        const porSeguradora = {};
        let fipeProtegido = 0;
        veiculos.forEach(v => {
            const seg = (v.seguradora || '').trim() || (v.vencimento_seguro ? 'Seguradora Não Informada' : 'Sem Seguro Cadastrado');
            const corr = (v.corretor_seguro || '').trim();
            const key = corr ? `${seg} (${corr})` : seg;
            if (!porSeguradora[key]) porSeguradora[key] = { qtd: 0, alerta: 0, fipe: 0 };
            porSeguradora[key].qtd += 1;
            const fipeV = parseFloat(v.valor_fipe_mes) || 0;
            porSeguradora[key].fipe += fipeV;
            if (v.vencimento_seguro && v.vencimento_seguro >= hoje) fipeProtegido += fipeV;
            if (v.vencimento_seguro && v.vencimento_seguro <= em30) porSeguradora[key].alerta += 1;
        });

        const percFipeSeg = fipeTotal > 0 ? ((fipeProtegido / fipeTotal) * 100) : 0;
        const badgeSeg = document.getElementById('seguros-cobertura-badge');
        if (badgeSeg) badgeSeg.textContent = `${fmt(percFipeSeg, 0)}% FIPE Coberto`;

        const listSeg = Object.entries(porSeguradora)
            .map(([nome, d]) => ({ nome, ...d }))
            .sort((a, b) => b.qtd - a.qtd);

        seguradorasBody.innerHTML = listSeg.length === 0
            ? '<tr><td colspan="4" class="empty-msg">Nenhum veículo cadastrado</td></tr>'
            : listSeg.map(s => `
                <tr>
                    <td style="font-weight:600;">${s.nome}</td>
                    <td>${s.qtd} veículo(s)</td>
                    <td>${s.alerta > 0 ? `<span class="badge badge-danger">${s.alerta} vencido/a vencer</span>` : '<span class="badge badge-success">Em dia</span>'}</td>
                    <td style="text-align:right;font-weight:700;">${fmtBRL(s.fipe)}</td>
                </tr>`).join('');
    }

    // Controle de Vencimento de Apólices por Veículo
    const apolicesBody = document.getElementById('frota-apolices-vencimento-body');
    if (apolicesBody) {
        const veicsComData = veiculos
            .filter(v => v.vencimento_seguro || v.seguradora)
            .sort((a, b) => (a.vencimento_seguro || '9999-12-31').localeCompare(b.vencimento_seguro || '9999-12-31'))
            .slice(0, 8);

        apolicesBody.innerHTML = veicsComData.length === 0
            ? '<tr><td colspan="4" class="empty-msg">Nenhuma apólice com data de vencimento registrada nos veículos.</td></tr>'
            : veicsComData.map(v => {
                const venc = v.vencimento_seguro;
                let badgeHtml = '<span class="badge badge-info">Sem data</span>';
                if (venc) {
                    if (venc < hoje) badgeHtml = '<span class="badge badge-danger">Vencido</span>';
                    else if (venc <= em30) badgeHtml = '<span class="badge badge-warning">Vence em 30d</span>';
                    else badgeHtml = '<span class="badge badge-success">Vigente</span>';
                }
                return `
                    <tr>
                        <td><strong>${v.placa}</strong> <span style="font-size:0.74rem;color:var(--text-muted);">${v.modelo || ''}</span></td>
                        <td>${v.seguradora || '-'} ${v.corretor_seguro ? `<span style="font-size:0.73rem;color:var(--text-muted);">(${v.corretor_seguro})</span>` : ''}</td>
                        <td style="font-weight:600;">${fmtDataBR(venc)}</td>
                        <td style="text-align:right;">${badgeHtml}</td>
                    </tr>`;
            }).join('');
    }

    // Combustível KPIs
    const porPosto = {};
    abs.forEach(a => {
        const p = a.posto_nome || 'Posto Geral';
        porPosto[p] = (porPosto[p] || 0) + (parseFloat(a.valor_total) || 0);
    });
    const topPosto = Object.entries(porPosto).sort((a, b) => b[1] - a[1])[0];

    setKPI('kpi-comb-gasto', fmtBRL(totalCombGasto));
    setKPI('kpi-comb-litros', `${fmt(totalLitros, 0)} L`);
    setKPI('kpi-comb-preco-medio', fmtBRL(mediaPrecoLitro) + '/L');
    setKPI('kpi-comb-km-l', mediaKmL > 0 ? `${fmt(mediaKmL, 2)} KM/L` : 'Sob apuração');
    setKPI('kpi-comb-custo-km', custoCombKm > 0 ? fmtBRL(custoCombKm) + '/KM' : 'Sob apuração');
    setKPI('kpi-comb-top-posto', topPosto ? `${topPosto[0]} (${fmtBRL(topPosto[1])})` : '—');

    // Manutenção KPIs
    const preventivas = mans.filter(m => (m.manutencao_tipos?.descricao || '').toUpperCase().includes('PREVENTIVA')).length;
    const corretivas = mans.filter(m => (m.manutencao_tipos?.descricao || '').toUpperCase().includes('CORRETIVA')).length;
    const totalClassif = preventivas + corretivas;
    const taxaPrev = totalClassif > 0 ? Math.round((preventivas / totalClassif) * 100) : (mans.length > 0 ? 50 : 0);
    const ticketManut = mans.length > 0 ? (totalManutGasto / mans.length) : 0;

    setKPI('kpi-manut-gasto', fmtBRL(totalManutGasto));
    setKPI('kpi-manut-pecas-servicos', `${fmtBRL(totalManutPecas)} / ${fmtBRL(totalManutServicos)}`);
    setKPI('kpi-manut-total', `${mans.length} OS (Médio: ${fmtBRL(ticketManut)})`);
    setKPI('kpi-manut-pendentes', pendentes.length);
    setKPI('kpi-manut-preventivas', preventivas);
    setKPI('kpi-manut-corretivas', corretivas);
    setKPI('kpi-manut-taxa-prev', `${taxaPrev}%`);

    // ─── RANKING DE CUSTOS POR VEÍCULO (TOP 10 VILÕES DE CUSTO) ───
    const custosVeiculo = {};
    const veiculoMap = {};
    veiculos.forEach(v => {
        const info = { id: v.id, placa: v.placa, modelo: v.modelo || '', classificacao: v.classificacao || 'CASA' };
        if (v.id) veiculoMap[String(v.id).toLowerCase()] = info;
        if (v.placa) veiculoMap[String(v.placa).toUpperCase().replace(/[^A-Z0-9]/g, '')] = info;
    });

    const getVeicInfo = (rawId, fallbackPlaca, fallbackModelo) => {
        const idKey = String(rawId || '').toLowerCase();
        const placaKey = String(fallbackPlaca || rawId || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const found = veiculoMap[idKey] || veiculoMap[placaKey];
        if (found) return found;
        return {
            placa: fallbackPlaca || (String(rawId).length <= 8 ? String(rawId).toUpperCase() : 'Veículo'),
            modelo: fallbackModelo || '',
            classificacao: 'FROTA'
        };
    };

    const ensureBucket = (id, placaFb = '', modFb = '') => {
        if (!custosVeiculo[id]) {
            custosVeiculo[id] = {
                placaFallback: placaFb,
                modeloFallback: modFb,
                combustivel: 0,
                manutencao: 0,
                pecas: 0,
                outros: 0,
                kms: []
            };
        }
        return custosVeiculo[id];
    };

    abs.forEach(a => {
        if (!a.veiculo_id) return;
        const b = ensureBucket(a.veiculo_id, a.veiculo_placa, a.veiculo_modelo);
        b.combustivel += (parseFloat(a.valor_total) || 0);
        if (a.km_atual) b.kms.push(parseFloat(a.km_atual));
    });

    mans.forEach(m => {
        if (!m.veiculo_id) return;
        const b = ensureBucket(m.veiculo_id);
        b.manutencao += getManutValor(m);
    });

    (dadosBrutos.compraItens || []).forEach(it => {
        if (!it.vinculo_veiculo_id) return;
        const b = ensureBucket(it.vinculo_veiculo_id);
        b.pecas += (parseFloat(it.quantidade) || 1) * (parseFloat(it.valor_unitario) || 0);
    });

    // Itens financeiros vinculados diretamente ao veículo (Seguros, Multas, IPVA, etc.)
    const idsLancPeriodo = new Set(lp.map(l => l.id));
    (dadosBrutos.finLancamentoItens || []).forEach(fi => {
        if (!fi.veiculo_id || !idsLancPeriodo.has(fi.lancamento_id)) return;
        const b = ensureBucket(fi.veiculo_id);
        b.outros += (parseFloat(fi.quantidade) || 1) * (parseFloat(fi.valor_unitario) || 0);
    });

    let custoFrotaSomadoVeic = 0;
    const rankingVeiculos = Object.entries(custosVeiculo).map(([id, d]) => {
        const vInfo = getVeicInfo(id, d.placaFallback, d.modeloFallback);
        const totalV = d.combustivel + d.manutencao + d.pecas + d.outros;
        custoFrotaSomadoVeic += totalV;
        let kmRod = 0;
        if (d.kms.length > 1) {
            d.kms.sort((a, b) => a - b);
            const delta = d.kms[d.kms.length - 1] - d.kms[0];
            if (delta > 0 && delta < 150000) kmRod = delta;
        }
        return {
            id,
            placa: vInfo.placa || 'Veículo',
            modelo: vInfo.modelo || '',
            classificacao: vInfo.classificacao || 'CASA',
            combustivel: d.combustivel,
            manutencao: d.manutencao,
            pecas: d.pecas,
            outros: d.outros,
            kmRod,
            custoKm: kmRod > 0 ? (totalV / kmRod) : 0,
            total: totalV
        };
    }).filter(v => v.total > 0).sort((a, b) => b.total - a.total).slice(0, 10);

    const viloesBody = document.getElementById('viloes-frota-body');
    if (viloesBody) {
        viloesBody.innerHTML = rankingVeiculos.length === 0
            ? '<tr><td colspan="11" class="empty-msg">Nenhum custo operacional por veículo registrado no período selecionado.</td></tr>'
            : rankingVeiculos.map((v, i) => {
                const perc = custoFrotaSomadoVeic > 0 ? ((v.total / custoFrotaSomadoVeic) * 100) : 0;
                return `
                    <tr>
                        <td><span class="badge-rank ${i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : ''}">${i + 1}</span></td>
                        <td>
                            <strong>${v.placa}</strong>
                            <div style="font-size:0.73rem;color:var(--text-muted);">${v.modelo}</div>
                        </td>
                        <td><span class="badge ${v.classificacao === 'CASA' ? 'badge-info' : 'badge-purple'}">${v.classificacao}</span></td>
                        <td style="text-align:right;" class="accent-red">${fmtBRL(v.combustivel)}</td>
                        <td style="text-align:right;" class="accent-amber">${fmtBRL(v.manutencao)}</td>
                        <td style="text-align:right;" class="accent-cyan">${fmtBRL(v.pecas)}</td>
                        <td style="text-align:right;" class="accent-purple">${fmtBRL(v.outros)}</td>
                        <td style="text-align:right;">${v.kmRod > 0 ? fmt(v.kmRod, 0) + ' KM' : '—'}</td>
                        <td style="text-align:right;font-weight:600;">${v.custoKm > 0 ? fmtBRL(v.custoKm) : '—'}</td>
                        <td style="text-align:right;font-weight:800;font-size:0.92rem;">${fmtBRL(v.total)}</td>
                        <td style="text-align:right;font-weight:700;color:var(--text-soft);">${fmt(perc, 1)}%</td>
                    </tr>`;
            }).join('');
    }
}

// ─── 7. DEPARTAMENTO PESSOAL & COMPLIANCE ───
function renderDP() {
    const ctx = dadosBrutos.ctxTemporal || getContextoTemporal();
    const todosFuncs = dadosBrutos.todosFuncionarios || [];
    const funcs = dadosBrutos.funcionarios || [];
    const asos = dadosBrutos.asos || [];
    const ferias = dadosBrutos.ferias || [];
    const atestados = dadosBrutos.atestados || [];
    const beneficios = dadosBrutos.beneficios || [];
    const epis = dadosBrutos.epis || [];
    const contratosExp = dadosBrutos.contratosExp || [];
    const motoristas = dadosBrutos.motoristas || [];
    const veiculos = dadosBrutos.veiculos || [];

    const hoje = new Date().toISOString().slice(0, 10);
    const em30 = dataAddDias(hoje, 30);
    const em60 = dataAddDias(hoje, 60);

    const funcMap = {};
    todosFuncs.forEach(f => { funcMap[f.id] = f.nome_completo; });

    const cltCount = funcs.filter(f => (f.tipo_contrato || 'CLT').toUpperCase() === 'CLT').length;
    const pjOutrosCount = funcs.length - cltCount;

    const folhaTotal = funcs.reduce((s, f) => s + (parseFloat(f.salario) || 0), 0);
    const salarioMedio = funcs.length > 0 ? (folhaTotal / funcs.length) : 0;

    // Benefícios ativos
    const benefAtivos = beneficios.filter(b => b.ativo !== false);
    const benefBruto = benefAtivos.reduce((s, b) => s + (parseFloat(b.valor) || 0), 0);
    const benefDesc = benefAtivos.reduce((s, b) => s + (parseFloat(b.valor_desconto_func) || 0), 0);
    const benefLiquido = Math.max(0, benefBruto - benefDesc);

    const custoTotalPessoal = folhaTotal + benefLiquido;
    const custoPerCapita = funcs.length > 0 ? (custoTotalPessoal / funcs.length) : 0;

    // Turnover no período
    const admissoesPeriodo = todosFuncs.filter(f => f.data_admissao && f.data_admissao >= ctx.inicio && f.data_admissao <= ctx.fim).length;
    const demissoesPeriodo = todosFuncs.filter(f => f.data_demissao && f.data_demissao >= ctx.inicio && f.data_demissao <= ctx.fim).length;
    const turnoverPerc = funcs.length > 0 ? (((admissoesPeriodo + demissoesPeriodo) / 2 / funcs.length) * 100) : 0;

    // Absenteísmo (Atestados no período)
    const atestadosPeriodo = atestados.filter(a => a.data_inicio && a.data_inicio >= ctx.inicio && a.data_inicio <= ctx.fim);
    const diasAfastados = atestadosPeriodo.reduce((s, a) => s + (parseInt(a.dias, 10) || 1), 0);

    // Férias
    const feriasVencidas = ferias.filter(f => (f.status || '').toUpperCase() === 'VENCIDA' || (f.periodo_conc_fim && f.periodo_conc_fim < hoje && (f.status || '').toUpperCase() !== 'CONCLUIDA'));
    const feriasEmGozo = ferias.filter(f => (f.status || '').toUpperCase() === 'EM_GOZO');
    const feriasProgramadas = ferias.filter(f => (f.status || '').toUpperCase() === 'PROGRAMADA');
    const feriasCriticas60 = ferias.filter(f => f.periodo_conc_fim && f.periodo_conc_fim >= hoje && f.periodo_conc_fim <= em60 && (f.status || '').toUpperCase() !== 'CONCLUIDA');

    // Aniversariantes do mês atual
    const mesAtual = new Date().getMonth() + 1;
    const anivers = funcs.filter(f => f.data_nascimento && parseInt(f.data_nascimento.slice(5, 7), 10) === mesAtual);

    setKPI('kpi-dp-colab-count', funcs.length);
    setKPI('kpi-dp-clt-pj-sub', `${cltCount} CLT | ${pjOutrosCount} PJ/Outros`);
    setKPI('kpi-dp-folha-val', fmtBRL(folhaTotal));
    setKPI('kpi-dp-salario-medio', `Salário médio: ${fmtBRL(salarioMedio)}`);
    setKPI('kpi-dp-beneficios-val', fmtBRL(benefLiquido));
    setKPI('kpi-dp-beneficios-sub', `Bruto: ${fmtBRL(benefBruto)} (-${fmtBRL(benefDesc)})`);
    setKPI('kpi-dp-custo-total', fmtBRL(custoTotalPessoal));
    setKPI('kpi-dp-custo-per-capita', `Médio/colab: ${fmtBRL(custoPerCapita)}`);
    setKPI('kpi-dp-turnover', `+${admissoesPeriodo} / -${demissoesPeriodo}`);
    setKPI('kpi-dp-turnover-sub', `Índice turnover: ${fmt(turnoverPerc, 1)}%`);
    setKPI('kpi-dp-atestados-dias', `${diasAfastados} dia(s)`);
    setKPI('kpi-dp-atestados-qtd', `${atestadosPeriodo.length} atestado(s) no período`);
    setKPI('kpi-dp-ferias-status', `${feriasVencidas.length} / ${feriasEmGozo.length}`);
    setKPI('kpi-dp-ferias-sub', `${feriasProgramadas.length} programada(s)`);
    setKPI('kpi-dp-anivers-count', anivers.length);

    // Compliance ASOs, CNHs, Férias, EPIs, Experiência, Seguros
    const asoVencendo = asos.filter(a => a.data_vencimento && a.data_vencimento >= hoje && a.data_vencimento <= em30);
    const asoVencido = asos.filter(a => a.data_vencimento && a.data_vencimento < hoje);
    setKPI('kpi-dp-aso-vencendo', asoVencendo.length);
    setKPI('kpi-dp-aso-vencido', asoVencido.length);

    const cnhVencendo = motoristas.filter(m => m.vencimento_cnh && m.vencimento_cnh >= hoje && m.vencimento_cnh <= em30);
    const cnhVencida = motoristas.filter(m => m.vencimento_cnh && m.vencimento_cnh < hoje);
    setKPI('kpi-cnh-vencendo', cnhVencendo.length);
    setKPI('kpi-cnh-vencida', cnhVencida.length);

    setKPI('kpi-dp-ferias-vencidas-card', feriasVencidas.length);
    setKPI('kpi-dp-ferias-criticas-card', feriasCriticas60.length);

    const epiVencido = epis.filter(e => !e.data_devolucao && ((e.data_vencimento_epi && e.data_vencimento_epi < hoje) || (e.ca_vencimento && e.ca_vencimento < hoje)));
    const expAtivos = contratosExp.filter(c => !c.resultado_final);
    setKPI('kpi-dp-epi-vencido', epiVencido.length);
    setKPI('kpi-dp-exp-ativos', expAtivos.length);

    const seguroVencendo = veiculos.filter(v => v.vencimento_seguro && v.vencimento_seguro >= hoje && v.vencimento_seguro <= em30).length;
    const seguroVencido = veiculos.filter(v => v.vencimento_seguro && v.vencimento_seguro < hoje).length;
    setKPI('kpi-seguro-vencendo', seguroVencendo);
    setKPI('kpi-seguro-vencido', seguroVencido);

    // Lista Nominal de Pendências de Compliance
    const pendNominaisEl = document.getElementById('dp-pendencias-nominais-list');
    if (pendNominaisEl) {
        const itensPend = [];
        cnhVencida.slice(0, 3).forEach(m => itensPend.push({ nome: m.nome_completo, tipo: 'CNH Vencida', data: fmtDataBR(m.vencimento_cnh), cor: 'badge-danger' }));
        asoVencido.slice(0, 3).forEach(a => itensPend.push({ nome: funcMap[a.funcionario_id] || 'Colaborador', tipo: 'ASO Vencido', data: fmtDataBR(a.data_vencimento), cor: 'badge-danger' }));
        feriasVencidas.slice(0, 3).forEach(f => itensPend.push({ nome: funcMap[f.funcionario_id] || 'Colaborador', tipo: 'Férias Vencidas', data: fmtDataBR(f.periodo_conc_fim), cor: 'badge-danger' }));
        cnhVencendo.slice(0, 2).forEach(m => itensPend.push({ nome: m.nome_completo, tipo: 'CNH Vence 30d', data: fmtDataBR(m.vencimento_cnh), cor: 'badge-warning' }));
        asoVencendo.slice(0, 2).forEach(a => itensPend.push({ nome: funcMap[a.funcionario_id] || 'Colaborador', tipo: 'ASO Vence 30d', data: fmtDataBR(a.data_vencimento), cor: 'badge-warning' }));

        pendNominaisEl.innerHTML = itensPend.length === 0
            ? '<p class="empty-msg" style="color:var(--success);">✓ Nenhuma pendência nominal crítica de CNH, ASO ou Férias!</p>'
            : itensPend.slice(0, 6).map(p => `
                <div class="item-list-row">
                    <div>
                        <span style="font-weight:700;">${p.nome}</span>
                        <span class="badge ${p.cor}" style="margin-left:6px;">${p.tipo}</span>
                    </div>
                    <span style="font-size:0.76rem;color:var(--text-muted);font-weight:600;">${p.data}</span>
                </div>`).join('');
    }

    // Aniversariantes List
    const aniListEl = document.getElementById('aniversariantes-list');
    if (aniListEl) {
        const diaHoje = new Date().getDate();
        aniListEl.innerHTML = anivers.length === 0
            ? '<p class="empty-msg">Nenhum aniversariante este mês</p>'
            : anivers
                .sort((a, b) => parseInt(a.data_nascimento.slice(8), 10) - parseInt(b.data_nascimento.slice(8), 10))
                .slice(0, 6)
                .map(f => {
                    const dia = f.data_nascimento.slice(8, 10);
                    const isToday = parseInt(dia, 10) === diaHoje;
                    return `
                        <div class="item-list-row ${isToday ? 'highlight' : ''}">
                            <span style="font-weight:600;">${isToday ? '🎂 ' : ''}${f.nome_completo} <span style="font-size:0.72rem;color:var(--text-muted);">(${f.setor || f.cargo_nome || 'Equipe'})</span></span>
                            <span style="font-weight:700;color:var(--text-muted);">${dia}/${String(mesAtual).padStart(2, '0')}</span>
                        </div>`;
                }).join('');
    }
}

// ─── 8. COMERCIAL, CONTRATOS & PRESTADORES ───
function renderComercial() {
    const contratos = dadosBrutos.contratos || [];
    const prestadores = dadosBrutos.prestadores || [];
    const lp = dadosBrutos.lancamentosPeriodo || [];
    const hoje = new Date().toISOString().slice(0, 10);
    const em30 = dataAddDias(hoje, 30);

    const ativos = contratos.filter(c => (c.status_nome || '').toUpperCase() === 'ATIVO');
    const valorAtivos = ativos.reduce((s, c) => s + (parseFloat(c.valor_contrato) || 0), 0);
    const ticketContrato = ativos.length > 0 ? (valorAtivos / ativos.length) : 0;

    const propostas = contratos.filter(c => ['PROPOSTA ABERTA', 'EM ANÁLISE', 'REVISÃO'].includes((c.status_nome || '').toUpperCase()) || (c.proposta_step && c.proposta_step > 0 && (c.status_nome || '').toUpperCase() !== 'ATIVO'));
    const valorPropostas = propostas.reduce((s, c) => s + (parseFloat(c.valor_contrato) || 0), 0);

    const vencendo = ativos.filter(c => c.data_vencimento && c.data_vencimento >= hoje && c.data_vencimento <= em30).length;
    const vencidos = contratos.filter(c => c.data_vencimento && c.data_vencimento < hoje && (c.status_nome || '').toUpperCase() !== 'CANCELADO').length;

    // Prestadores / Agregados
    const prestAtivos = prestadores.filter(p => (p.status || '').toUpperCase() === 'ATIVO');
    const prestComPend = prestadores.filter(p => p.tem_pendencia === true);
    const prestVistoriaAlerta = prestadores.filter(p => p.data_proxima_vistoria && p.data_proxima_vistoria <= em30);

    setKPI('kpi-comercial-ativos', ativos.length);
    setKPI('kpi-comercial-ticket-sub', `Ticket médio: ${fmtBRL(ticketContrato)}`);
    setKPI('kpi-comercial-valor', fmtBRL(valorAtivos));
    setKPI('kpi-comercial-propostas', propostas.length);
    setKPI('kpi-comercial-propostas-val', `Potencial: ${fmtBRL(valorPropostas)}`);
    setKPI('kpi-comercial-vencendo', vencendo);
    setKPI('kpi-comercial-vencidos', vencidos);
    setKPI('kpi-prestadores-ativos', prestAtivos.length);
    setKPI('kpi-prestadores-pend-sub', `${prestComPend.length} com pendência doc.`);
    setKPI('kpi-prestadores-vistorias', prestVistoriaAlerta.length);

    // Somar valores recebidos por cliente no período
    const recebidoPorCliente = {};
    lp.filter(l => l.tipo === 'RECEBER' && ['PAGO', 'RECEBIDO', 'PARCIAL'].includes((l.status || '').toUpperCase())).forEach(l => {
        const keyId = l.cliente_id ? String(l.cliente_id) : '';
        const keyNome = (l.entidade_nome || '').toUpperCase().trim();
        const v = parseFloat(l.valor_pago) || parseFloat(l.valor_total) || 0;
        if (keyId) recebidoPorCliente[keyId] = (recebidoPorCliente[keyId] || 0) + v;
        if (keyNome) recebidoPorCliente[keyNome] = (recebidoPorCliente[keyNome] || 0) + v;
    });

    const clientesListEl = document.getElementById('top-clientes-list');
    if (clientesListEl) {
        const topContratos = [...contratos]
            .sort((a, b) => (parseFloat(b.valor_contrato) || 0) - (parseFloat(a.valor_contrato) || 0))
            .slice(0, 8);

        clientesListEl.innerHTML = topContratos.length === 0
            ? '<tr><td colspan="5" class="empty-msg">Nenhum contrato cadastrado</td></tr>'
            : topContratos.map(c => {
                const nome = c.cliente_nome || 'Cliente';
                const rec = recebidoPorCliente[String(c.id)] || recebidoPorCliente[nome.toUpperCase().trim()] || 0;
                const st = (c.status_nome || 'ATIVO').toUpperCase();
                const badgeCls = st === 'ATIVO' ? 'badge-success' : st.includes('VENCIDO') ? 'badge-danger' : 'badge-warning';
                return `
                    <tr>
                        <td style="font-weight:700;">${nome}</td>
                        <td>
                            <span class="badge ${badgeCls}">${st}</span>
                            ${c.tipo_demanda_nome ? `<span style="font-size:0.72rem;color:var(--text-muted);margin-left:4px;">${c.tipo_demanda_nome}</span>` : ''}
                        </td>
                        <td>${fmtDataBR(c.data_vencimento)}</td>
                        <td style="text-align:right;font-weight:700;" class="accent-indigo">${fmtBRL(c.valor_contrato)}</td>
                        <td style="text-align:right;font-weight:700;" class="accent-green">${fmtBRL(rec)}</td>
                    </tr>`;
            }).join('');
    }
}

// ─── 9. ESTOQUE DE PEÇAS & MOVIMENTAÇÕES ───
function renderEstoque() {
    const estoque = dadosBrutos.estoque || [];
    const movs = dadosBrutos.estoqueMovs || [];
    const vendas = dadosBrutos.vendas || [];

    const estoqueMap = {};
    estoque.forEach(e => { estoqueMap[e.id] = e; });

    const totalUnidades = estoque.reduce((s, e) => s + (parseFloat(e.estoque_atual) || 0), 0);
    const abaixo = estoque.filter(e => (parseFloat(e.estoque_atual) || 0) < (parseFloat(e.estoque_minimo) || 0));
    const zerados = estoque.filter(e => (parseFloat(e.estoque_atual) || 0) <= 0);
    const valorCustoTotal = estoque.reduce((s, e) => s + ((parseFloat(e.estoque_atual) || 0) * (parseFloat(e.valor_custo) || 0)), 0);
    const valorVendaTotal = estoque.reduce((s, e) => s + ((parseFloat(e.estoque_atual) || 0) * (parseFloat(e.valor_venda) || parseFloat(e.valor_custo) || 0)), 0);

    // Movimentações no período
    const entradas = movs.filter(m => (m.tipo || '').toUpperCase() === 'ENTRADA');
    const saidasMov = movs.filter(m => (m.tipo || '').toUpperCase() === 'SAIDA');

    const valEntradas = entradas.reduce((s, m) => {
        const custoRef = parseFloat(m.valor_unitario) || parseFloat(estoqueMap[m.item_id]?.valor_custo) || 0;
        return s + ((parseFloat(m.quantidade) || 0) * custoRef);
    }, 0);

    const valSaidasMov = saidasMov.reduce((s, m) => {
        const custoRef = parseFloat(m.valor_unitario) || parseFloat(estoqueMap[m.item_id]?.valor_custo) || 0;
        return s + ((parseFloat(m.quantidade) || 0) * custoRef);
    }, 0);
    const valVendasOS = vendas.reduce((s, v) => s + (parseFloat(v.valor_total) || 0), 0);
    const valSaidasTotal = Math.max(valSaidasMov, valVendasOS);

    const giroEstoque = valorCustoTotal > 0 ? ((valSaidasTotal / valorCustoTotal) * 100) : 0;

    setKPI('kpi-estoque-total', `${estoque.length} SKUs`);
    setKPI('kpi-estoque-unidades-sub', `${fmt(totalUnidades, 0)} unidades em saldo`);
    setKPI('kpi-estoque-valor', fmtBRL(valorCustoTotal));
    setKPI('kpi-estoque-venda-sub', `Preço venda: ${fmtBRL(valorVendaTotal)}`);
    setKPI('kpi-estoque-alertas', abaixo.length);
    setKPI('kpi-estoque-zerados-sub', `${zerados.length} item(ns) com saldo zero`);
    setKPI('kpi-estoque-entradas-val', fmtBRL(valEntradas));
    setKPI('kpi-estoque-entradas-qtd', `${entradas.length} entrada(s) no período`);
    setKPI('kpi-estoque-saidas-val', fmtBRL(valSaidasTotal));
    setKPI('kpi-estoque-saidas-qtd', `${saidasMov.length + vendas.length} saída(s) / OS`);
    setKPI('kpi-estoque-giro', `${fmt(giroEstoque, 1)}%`);

    const criticoListEl = document.getElementById('estoque-critico-list');
    if (criticoListEl) {
        criticoListEl.innerHTML = abaixo.length === 0
            ? '<p class="empty-msg" style="color:var(--success);">✓ Todos os itens estão acima do estoque mínimo!</p>'
            : abaixo.slice(0, 8).map(e => `
                <div class="item-list-row" style="border-left:3px solid var(--danger);">
                    <div>
                        <span style="font-weight:700;">${e.nome}</span>
                        <span style="font-size:0.72rem;color:var(--text-muted);margin-left:6px;">${e.categoria || 'Geral'}</span>
                    </div>
                    <span class="accent-red" style="font-weight:700;">
                        Atual: ${fmt(e.estoque_atual || 0, 0)} / Mín: ${fmt(e.estoque_minimo || 0, 0)} (${fmtBRL(e.valor_custo)})
                    </span>
                </div>`).join('');
    }

    // Curva ABC de Estoque
    const abcBody = document.getElementById('estoque-curva-abc-body');
    if (abcBody) {
        const topABC = estoque
            .map(e => ({
                ...e,
                totalImob: (parseFloat(e.estoque_atual) || 0) * (parseFloat(e.valor_custo) || 0)
            }))
            .filter(e => e.totalImob > 0)
            .sort((a, b) => b.totalImob - a.totalImob)
            .slice(0, 8);

        abcBody.innerHTML = topABC.length === 0
            ? '<tr><td colspan="6" class="empty-msg">Nenhum item com saldo valorizado em estoque</td></tr>'
            : topABC.map((e, i) => `
                <tr>
                    <td><span class="badge-rank ${i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : ''}">${i + 1}</span></td>
                    <td style="font-weight:600;">${e.nome}</td>
                    <td><span class="badge badge-info">${e.categoria || 'GERAL'}</span></td>
                    <td style="text-align:right;">${fmt(e.estoque_atual, 0)} ${e.unidade || 'UN'}</td>
                    <td style="text-align:right;">${fmtBRL(e.valor_custo)}</td>
                    <td style="text-align:right;font-weight:800;" class="accent-green">${fmtBRL(e.totalImob)}</td>
                </tr>`).join('');
    }
}

// ============================================================
//  GRÁFICOS CHART.JS (DINÂMICOS MÊS A MÊS EM TODOS OS MÓDULOS)
// ============================================================

function getAxisStyle() {
    return {
        ticks: { color: '#94a3b8', font: { size: 11 } },
        grid: { color: 'rgba(255,255,255,0.04)' },
        border: { dash: [4, 4] }
    };
}

function createBarLineChart(canvasId) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;
    const axisStyle = getAxisStyle();
    return new Chart(ctx, {
        type: 'bar',
        data: { labels: [], datasets: [] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { padding: 14, usePointStyle: true, pointStyle: 'circle', font: { size: 11 } } },
                tooltip: {
                    callbacks: {
                        label: (c) => {
                            const val = c.parsed.y;
                            if (c.dataset.isCount) return ` ${c.dataset.label}: ${val}`;
                            return ` ${c.dataset.label}: ${fmtBRL(val)}`;
                        }
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

function createDoughnutChart(canvasId, legendPos = 'right') {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;
    return new Chart(ctx, {
        type: 'doughnut',
        data: { labels: [], datasets: [] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: legendPos, labels: { padding: 12, usePointStyle: true, font: { size: 11 } } },
                tooltip: {
                    callbacks: {
                        label: (c) => ` ${c.label}: ${c.dataset.isCount ? c.parsed : fmtBRL(c.parsed)}`
                    }
                }
            },
            cutout: '62%'
        }
    });
}

function initCharts() {
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = 'Inter';

    chartReceitaDespesa = createBarLineChart('chart-receita-despesa');
    chartCockpitMacroCustos = createDoughnutChart('chart-cockpit-macro-custos', 'right');
    chartFinEvolucaoMensal = createBarLineChart('chart-fin-evolucao-mensal');
    chartDespesasCateg = createDoughnutChart('chart-despesas-categ', 'right');
    chartComprasEvolucaoMensal = createBarLineChart('chart-compras-evolucao-mensal');
    chartMixCompras = createDoughnutChart('chart-mix-compras', 'right');
    chartFrotaEvolucaoMensal = createBarLineChart('chart-frota-evolucao-mensal');
    chartFrotaStatus = createDoughnutChart('chart-frota-status', 'bottom');
    chartFrotaCentrosCusto = createDoughnutChart('chart-frota-centros-custo', 'right');
    chartCombEvolucaoMensal = createBarLineChart('chart-comb-evolucao-mensal');
    chartManutEvolucaoMensal = createBarLineChart('chart-manut-evolucao-mensal');
    chartDpEvolucaoMensal = createBarLineChart('chart-dp-evolucao-mensal');
    chartDpSetores = createDoughnutChart('chart-dp-setores', 'right');
    chartComercialEvolucaoMensal = createBarLineChart('chart-comercial-evolucao-mensal');
    chartEstoqueEvolucaoMensal = createBarLineChart('chart-estoque-evolucao-mensal');
    chartEstoqueCategorias = createDoughnutChart('chart-estoque-categorias', 'right');
}

function atualizarBadgesTemporais(ctx) {
    const labelBadge = ctx.isMultiMes
        ? `Período: ${ctx.mesesGrafico.length} Meses`
        : `Evolução 6M (Ref. ${ctx.mesesPeriodo[0]?.label || 'Mês'})`;

    [
        'badge-chart-cockpit-meses',
        'badge-chart-fin-meses',
        'badge-chart-compras-meses',
        'badge-chart-frota-meses',
        'badge-chart-comb-meses',
        'badge-chart-manut-meses',
        'badge-chart-dp-meses',
        'badge-chart-comercial-meses',
        'badge-chart-estoque-meses'
    ].forEach(id => setKPI(id, labelBadge));
}

function atualizarGraficos() {
    const ctx = dadosBrutos.ctxTemporal || getContextoTemporal();
    const meses = ctx.mesesGrafico || [];
    const labelsMeses = meses.map(m => m.label);
    atualizarBadgesTemporais(ctx);

    const lancs = dadosBrutos.lancamentos || [];
    const isPago = (l) => ['PAGO', 'RECEBIDO', 'PARCIAL'].includes((l.status || '').toUpperCase());
    const isAberto = (l) => ['ABERTO', 'ATRASADO', 'PARCIAL'].includes((l.status || '').toUpperCase());
    const valPago = (l) => parseFloat(l.valor_pago) || parseFloat(l.valor_total) || 0;
    const valAberto = (l) => (l.status || '').toUpperCase() === 'PARCIAL'
        ? Math.max(0, (parseFloat(l.valor_total) || 0) - (parseFloat(l.valor_pago) || 0))
        : (parseFloat(l.valor_total) || 0);

    // ─── 1. COCKPIT & FINANCEIRO: Evolução Mensal ───
    const serieFin = meses.map(m => {
        const recReal = lancs.filter(l => l.tipo === 'RECEBER' && isPago(l) && String(l.data_pagamento || l.data_vencimento || '').startsWith(m.anoMes)).reduce((s, l) => s + valPago(l), 0);
        const recPrev = lancs.filter(l => l.tipo === 'RECEBER' && isAberto(l) && String(l.data_vencimento || '').startsWith(m.anoMes)).reduce((s, l) => s + valAberto(l), 0);
        const despReal = lancs.filter(l => l.tipo === 'PAGAR' && isPago(l) && String(l.data_pagamento || l.data_vencimento || '').startsWith(m.anoMes)).reduce((s, l) => s + valPago(l), 0);
        const despPrev = lancs.filter(l => l.tipo === 'PAGAR' && isAberto(l) && String(l.data_vencimento || '').startsWith(m.anoMes)).reduce((s, l) => s + valAberto(l), 0);
        return { recReal, recPrev, despReal, despPrev, lucro: recReal - despReal };
    });

    if (chartReceitaDespesa) {
        chartReceitaDespesa.data.labels = labelsMeses;
        chartReceitaDespesa.data.datasets = [
            { label: 'Receita Realizada', data: serieFin.map(x => x.recReal), backgroundColor: 'rgba(16,185,129,0.78)', borderRadius: 6 },
            { label: 'Despesa Realizada', data: serieFin.map(x => x.despReal), backgroundColor: 'rgba(239,68,68,0.78)', borderRadius: 6 },
            { label: 'Lucro Líquido', data: serieFin.map(x => x.lucro), type: 'line', borderColor: '#818cf8', backgroundColor: 'rgba(129,140,248,0.12)', borderWidth: 2.5, tension: 0.35, fill: true }
        ];
        chartReceitaDespesa.update('active');
    }

    if (chartFinEvolucaoMensal) {
        chartFinEvolucaoMensal.data.labels = labelsMeses;
        chartFinEvolucaoMensal.data.datasets = [
            { label: 'Receita Realizada', data: serieFin.map(x => x.recReal), backgroundColor: '#10b981', borderRadius: 5 },
            { label: 'Receita Prevista (Aberto)', data: serieFin.map(x => x.recPrev), backgroundColor: 'rgba(16,185,129,0.3)', borderRadius: 5 },
            { label: 'Despesa Paga', data: serieFin.map(x => x.despReal), backgroundColor: '#ef4444', borderRadius: 5 },
            { label: 'Despesa em Aberto', data: serieFin.map(x => x.despPrev), backgroundColor: 'rgba(239,68,68,0.3)', borderRadius: 5 }
        ];
        chartFinEvolucaoMensal.update('active');
    }

    // ─── 2. COCKPIT: Macro-Custos Operacionais ───
    if (chartCockpitMacroCustos) {
        const absG = (dadosBrutos.abastecimentos || []).reduce((s, a) => s + (parseFloat(a.valor_total) || 0), 0);
        const manG = (dadosBrutos.manutencoes || []).reduce((s, m) => s + getManutValor(m), 0);
        const compG = (dadosBrutos.compras || []).reduce((s, c) => s + (parseFloat(c.valor_total) || 0), 0);
        const rhG = ((dadosBrutos.funcionarios || []).reduce((s, f) => s + (parseFloat(f.salario) || 0), 0)) * ctx.qtdMesesPeriodo;
        const veicFinG = (dadosBrutos.lancamentosPeriodo || []).filter(l => l.tipo === 'PAGAR' && classificarNaturezaVeicular(l) !== null).reduce((s, l) => s + valPago(l), 0);

        const macroData = [
            ['Combustível', absG, '#ef4444'],
            ['Manutenção & Oficinas', manG, '#f59e0b'],
            ['Compras & Peças', compG, '#6366f1'],
            ['Folha & Pessoal', rhG, '#a855f7'],
            ['Seguros/IPVA/Multas', veicFinG, '#06b6d4']
        ].filter(([, v]) => v > 0);

        chartCockpitMacroCustos.data.labels = macroData.length ? macroData.map(x => x[0]) : ['Sem custos no período'];
        chartCockpitMacroCustos.data.datasets = [{
            data: macroData.length ? macroData.map(x => x[1]) : [1],
            backgroundColor: macroData.length ? macroData.map(x => x[2]) : ['rgba(255,255,255,0.06)'],
            borderWidth: 0
        }];
        chartCockpitMacroCustos.update('active');
    }

    // ─── 3. FINANCEIRO: Despesas por Plano de Contas ───
    if (chartDespesasCateg) {
        const lp = dadosBrutos.lancamentosPeriodo || [];
        const porCateg = {};
        lp.filter(l => l.tipo === 'PAGAR').forEach(l => {
            const cat = l.plano_conta_nome || 'Outras Despesas';
            porCateg[cat] = (porCateg[cat] || 0) + (parseFloat(l.valor_pago) || parseFloat(l.valor_total) || 0);
        });
        const sorted = Object.entries(porCateg).sort((a, b) => b[1] - a[1]).slice(0, 6);
        const colors = ['#ef4444', '#f97316', '#eab308', '#8b5cf6', '#06b6d4', '#10b981'];
        chartDespesasCateg.data.labels = sorted.length ? sorted.map(x => x[0]) : ['Sem dados'];
        chartDespesasCateg.data.datasets = [{
            data: sorted.length ? sorted.map(x => x[1]) : [1],
            backgroundColor: sorted.length ? colors.slice(0, sorted.length) : ['rgba(255,255,255,0.05)'],
            borderWidth: 0
        }];
        chartDespesasCateg.update('active');
    }

    // ─── 4. COMPRAS: Evolução Mensal & Mix ───
    const comprasHist = dadosBrutos.comprasHistorico || [];
    if (chartComprasEvolucaoMensal) {
        const serieCompras = meses.map(m => {
            const doMes = comprasHist.filter(c => String(c.data_emissao || '').startsWith(m.anoMes));
            return {
                total: doMes.reduce((s, c) => s + (parseFloat(c.valor_total) || 0), 0),
                qtd: doMes.length
            };
        });
        chartComprasEvolucaoMensal.data.labels = labelsMeses;
        chartComprasEvolucaoMensal.data.datasets = [
            { label: 'Total Comprado (R$)', data: serieCompras.map(x => x.total), backgroundColor: 'rgba(99,102,241,0.8)', borderRadius: 6 }
        ];
        chartComprasEvolucaoMensal.update('active');
    }

    if (chartMixCompras) {
        const itens = dadosBrutos.compraItens || [];
        let pecas = 0, servicos = 0, outros = 0;
        itens.forEach(it => {
            const sub = (parseFloat(it.quantidade) || 1) * (parseFloat(it.valor_unitario) || 0);
            const t = (it.tipo || 'peca').toLowerCase();
            if (t.includes('peca') || t.includes('peça')) pecas += sub;
            else if (t.includes('serv')) servicos += sub;
            else outros += sub;
        });
        const totalMix = pecas + servicos + outros;
        chartMixCompras.data.labels = totalMix > 0 ? ['Peças / Materiais', 'Serviços', 'Outros'] : ['Sem itens detalhados'];
        chartMixCompras.data.datasets = [{
            data: totalMix > 0 ? [pecas, servicos, outros] : [1],
            backgroundColor: totalMix > 0 ? ['#6366f1', '#10b981', '#f59e0b'] : ['rgba(255,255,255,0.05)'],
            borderWidth: 0
        }];
        chartMixCompras.update('active');
    }

    // ─── 5. FROTA & OPERAÇÕES: Evolução Mensal de Custos (Comb + Manut + Peças + Seguros/Doc) ───
    const absHist = dadosBrutos.abastecimentosHistorico || [];
    const manutHist = dadosBrutos.manutencoesHistorico || [];
    const compItensHist = dadosBrutos.compraItensHistorico || [];
    const compraDataMap = {};
    comprasHist.forEach(c => { compraDataMap[c.id] = String(c.data_emissao || '').slice(0, 7); });

    const serieFrota = meses.map(m => {
        const comb = absHist.filter(a => String(a.data || '').startsWith(m.anoMes)).reduce((s, a) => s + (parseFloat(a.valor_total) || 0), 0);
        const litros = absHist.filter(a => String(a.data || '').startsWith(m.anoMes)).reduce((s, a) => s + (parseFloat(a.litros) || 0), 0);

        const mansMes = manutHist.filter(ma => String(ma.data || '').startsWith(m.anoMes));
        const manut = mansMes.reduce((s, ma) => s + getManutValor(ma), 0);
        const manutPrev = mansMes.filter(ma => (ma.manutencao_tipos?.descricao || '').toUpperCase().includes('PREVENTIVA')).reduce((s, ma) => s + getManutValor(ma), 0);
        const manutCorr = Math.max(0, manut - manutPrev);

        const pecasComp = compItensHist
            .filter(it => it.vinculo_veiculo_id && compraDataMap[it.compra_id] === m.anoMes)
            .reduce((s, it) => s + ((parseFloat(it.quantidade) || 1) * (parseFloat(it.valor_unitario) || 0)), 0);

        const segDoc = lancs
            .filter(l => l.tipo === 'PAGAR' && classificarNaturezaVeicular(l) !== null && String(l.data_pagamento || l.data_vencimento || '').startsWith(m.anoMes))
            .reduce((s, l) => s + valPago(l), 0);

        return { comb, litros, manut, manutPrev, manutCorr, pecasComp, segDoc, total: comb + manut + pecasComp + segDoc };
    });

    if (chartFrotaEvolucaoMensal) {
        chartFrotaEvolucaoMensal.data.labels = labelsMeses;
        chartFrotaEvolucaoMensal.data.datasets = [
            { label: 'Combustível', data: serieFrota.map(x => x.comb), backgroundColor: '#ef4444', borderRadius: 4 },
            { label: 'Manutenção', data: serieFrota.map(x => x.manut), backgroundColor: '#f59e0b', borderRadius: 4 },
            { label: 'Peças (Compras)', data: serieFrota.map(x => x.pecasComp), backgroundColor: '#06b6d4', borderRadius: 4 },
            { label: 'Seguros / IPVA / Doc / Multas', data: serieFrota.map(x => x.segDoc), backgroundColor: '#6366f1', borderRadius: 4 }
        ];
        chartFrotaEvolucaoMensal.update('active');
    }

    if (chartFrotaStatus) {
        const { total: totalV, alocados, emManut, patio } = getFrotaStatusCounts(dadosBrutos.veiculos || []);
        chartFrotaStatus.data.labels = ['Em Operação (Alocados)', 'Disponíveis no Pátio', 'Em Manutenção'];
        chartFrotaStatus.data.datasets = [{
            data: totalV > 0 ? [alocados, patio, emManut] : [1, 0, 0],
            backgroundColor: ['#6366f1', '#10b981', '#ef4444'],
            borderWidth: 0,
            isCount: true
        }];
        chartFrotaStatus.update('active');
    }

    if (chartFrotaCentrosCusto) {
        const linhasCC = (dadosBrutos.linhasCentrosFrota || []).filter(r => r.total > 0);
        const colors = ['#ef4444', '#f59e0b', '#06b6d4', '#6366f1', '#10b981', '#a855f7', '#ec4899', '#14b8a6'];
        chartFrotaCentrosCusto.data.labels = linhasCC.length ? linhasCC.map(r => r.nome) : ['Sem custos no período'];
        chartFrotaCentrosCusto.data.datasets = [{
            data: linhasCC.length ? linhasCC.map(r => r.total) : [1],
            backgroundColor: linhasCC.length ? colors.slice(0, linhasCC.length) : ['rgba(255,255,255,0.05)'],
            borderWidth: 0
        }];
        chartFrotaCentrosCusto.update('active');
    }

    if (chartCombEvolucaoMensal) {
        chartCombEvolucaoMensal.data.labels = labelsMeses;
        chartCombEvolucaoMensal.data.datasets = [
            { label: 'Gasto Combustível (R$)', data: serieFrota.map(x => x.comb), backgroundColor: 'rgba(16,185,129,0.78)', borderRadius: 5 }
        ];
        chartCombEvolucaoMensal.update('active');
    }

    if (chartManutEvolucaoMensal) {
        chartManutEvolucaoMensal.data.labels = labelsMeses;
        chartManutEvolucaoMensal.data.datasets = [
            { label: 'Preventiva (R$)', data: serieFrota.map(x => x.manutPrev), backgroundColor: '#10b981', borderRadius: 5 },
            { label: 'Corretiva / Outras (R$)', data: serieFrota.map(x => x.manutCorr), backgroundColor: '#ef4444', borderRadius: 5 }
        ];
        chartManutEvolucaoMensal.update('active');
    }

    // ─── 6. PESSOAS & COMPLIANCE (DP): Evolução Mensal & Setores ───
    if (chartDpEvolucaoMensal) {
        const serieDP = meses.map(m => {
            const despRH = lancs
                .filter(l => l.tipo === 'PAGAR' && isPago(l) && String(l.data_pagamento || l.data_vencimento || '').startsWith(m.anoMes) && (
                    String(l.plano_conta_codigo || '').startsWith('04.004.0001') ||
                    String(l.plano_conta_codigo || '').startsWith('04.004.0030') ||
                    String(l.plano_conta_codigo || '').startsWith('04.004.0077') ||
                    String(l.plano_conta_nome || '').toUpperCase().includes('SALARIO') ||
                    String(l.plano_conta_nome || '').toUpperCase().includes('FERIAS') ||
                    String(l.plano_conta_nome || '').toUpperCase().includes('FGTS')
                ))
                .reduce((s, l) => s + valPago(l), 0);
            const folhaEstimada = (dadosBrutos.funcionarios || []).reduce((s, f) => s + (parseFloat(f.salario) || 0), 0);
            return { despRH: despRH > 0 ? despRH : folhaEstimada };
        });

        chartDpEvolucaoMensal.data.labels = labelsMeses;
        chartDpEvolucaoMensal.data.datasets = [
            { label: 'Custo de Pessoal / Folha (R$)', data: serieDP.map(x => x.despRH), backgroundColor: 'rgba(168,85,247,0.78)', borderRadius: 6 }
        ];
        chartDpEvolucaoMensal.update('active');
    }

    if (chartDpSetores) {
        const porSetor = {};
        (dadosBrutos.funcionarios || []).forEach(f => {
            const st = (f.setor || f.cargo_nome || 'Operacional').trim();
            porSetor[st] = (porSetor[st] || 0) + (parseFloat(f.salario) || 0);
        });
        const sortedSetor = Object.entries(porSetor).sort((a, b) => b[1] - a[1]).slice(0, 6);
        const colors = ['#a855f7', '#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];
        chartDpSetores.data.labels = sortedSetor.length ? sortedSetor.map(x => x[0]) : ['Sem setores'];
        chartDpSetores.data.datasets = [{
            data: sortedSetor.length ? sortedSetor.map(x => x[1]) : [1],
            backgroundColor: sortedSetor.length ? colors.slice(0, sortedSetor.length) : ['rgba(255,255,255,0.05)'],
            borderWidth: 0
        }];
        chartDpSetores.update('active');
    }

    // ─── 7. COMERCIAL & ESTOQUE: Evolução Mensal ───
    if (chartComercialEvolucaoMensal) {
        const baseRecorrente = (dadosBrutos.contratos || [])
            .filter(c => (c.status_nome || '').toUpperCase() === 'ATIVO')
            .reduce((s, c) => s + (parseFloat(c.valor_contrato) || 0), 0);

        chartComercialEvolucaoMensal.data.labels = labelsMeses;
        chartComercialEvolucaoMensal.data.datasets = [
            { label: 'Receita Recebida (Caixa)', data: serieFin.map(x => x.recReal), backgroundColor: '#10b981', borderRadius: 5 },
            { label: 'Faturado em Aberto', data: serieFin.map(x => x.recPrev), backgroundColor: 'rgba(99,102,241,0.45)', borderRadius: 5 },
            { label: 'Meta Contratual Ativa', data: meses.map(() => baseRecorrente), type: 'line', borderColor: '#f59e0b', borderDash: [5, 5], borderWidth: 2, pointRadius: 3, fill: false }
        ];
        chartComercialEvolucaoMensal.update('active');
    }

    if (chartEstoqueEvolucaoMensal) {
        const movsHist = dadosBrutos.estoqueMovsHistorico || [];
        const vendasHist = dadosBrutos.vendasHistorico || [];
        const estMap = {};
        (dadosBrutos.estoque || []).forEach(e => { estMap[e.id] = e; });

        const serieEst = meses.map(m => {
            const ent = movsHist
                .filter(mv => (mv.tipo || '').toUpperCase() === 'ENTRADA' && String(mv.data || '').startsWith(m.anoMes))
                .reduce((s, mv) => s + ((parseFloat(mv.quantidade) || 0) * (parseFloat(mv.valor_unitario) || parseFloat(estMap[mv.item_id]?.valor_custo) || 0)), 0);

            const saiMov = movsHist
                .filter(mv => (mv.tipo || '').toUpperCase() === 'SAIDA' && String(mv.data || '').startsWith(m.anoMes))
                .reduce((s, mv) => s + ((parseFloat(mv.quantidade) || 0) * (parseFloat(mv.valor_unitario) || parseFloat(estMap[mv.item_id]?.valor_custo) || 0)), 0);

            const saiVend = vendasHist
                .filter(v => String(v.data || '').startsWith(m.anoMes))
                .reduce((s, v) => s + (parseFloat(v.valor_total) || 0), 0);

            return { ent, sai: Math.max(saiMov, saiVend) };
        });

        chartEstoqueEvolucaoMensal.data.labels = labelsMeses;
        chartEstoqueEvolucaoMensal.data.datasets = [
            { label: 'Entradas de Estoque (R$)', data: serieEst.map(x => x.ent), backgroundColor: '#06b6d4', borderRadius: 5 },
            { label: 'Saídas / Consumo OS (R$)', data: serieEst.map(x => x.sai), backgroundColor: '#f59e0b', borderRadius: 5 }
        ];
        chartEstoqueEvolucaoMensal.update('active');
    }

    if (chartEstoqueCategorias) {
        const porCatEst = {};
        (dadosBrutos.estoque || []).forEach(e => {
            const cat = (e.categoria || 'GERAL').toUpperCase();
            const val = (parseFloat(e.estoque_atual) || 0) * (parseFloat(e.valor_custo) || 0);
            if (val > 0) porCatEst[cat] = (porCatEst[cat] || 0) + val;
        });
        const sortedCat = Object.entries(porCatEst).sort((a, b) => b[1] - a[1]).slice(0, 6);
        const colors = ['#f59e0b', '#6366f1', '#10b981', '#06b6d4', '#a855f7', '#ef4444'];
        chartEstoqueCategorias.data.labels = sortedCat.length ? sortedCat.map(x => x[0]) : ['Sem estoque valorizado'];
        chartEstoqueCategorias.data.datasets = [{
            data: sortedCat.length ? sortedCat.map(x => x[1]) : [1],
            backgroundColor: sortedCat.length ? colors.slice(0, sortedCat.length) : ['rgba(255,255,255,0.05)'],
            borderWidth: 0
        }];
        chartEstoqueCategorias.update('active');
    }
}
