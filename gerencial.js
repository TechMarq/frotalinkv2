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
let chartCombTipos = null;
let chartCombClassificacao = null;
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
            chartCombEvolucaoMensal, chartCombTipos, chartCombClassificacao, chartManutEvolucaoMensal,
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
        const [compRes, ccRes, fornRes] = await Promise.allSettled([
            sb.from('compras')
                .select('id, data_emissao, numero_nota, fornecedor_id, valor_total, financeiro_parcelado, qtd_parcelas, categoria_id, consolidado_vales, observacoes, fornecedores:fornecedor_id(nome, plano_contas_id)')
                .gte('data_emissao', ctx.inicioFetch)
                .lte('data_emissao', ctx.fim)
                .order('data_emissao', { ascending: false }),
            sb.from('centros_custo')
                .select('id, codigo, nome, parent_id')
                .order('codigo', { ascending: true }),
            sb.from('fornecedores')
                .select('id, nome, razao_social')
                .limit(2000)
        ]);

        const rawCompras = (compRes.status === 'fulfilled' && compRes.value.data && !compRes.value.error) ? compRes.value.data : [];
        // Excluir notas de fechamento consolidado de vales para evitar duplicidade de valores e itens sem centro de custo
        const todasCompras = rawCompras.filter(c => {
            const isFechamento = Boolean(
                c.consolidado_vales || 
                c.consolidadoVales || 
                (c.id && String(c.id).startsWith('NC-FAT-')) ||
                (c.observacoes && String(c.observacoes).includes('[CONSOLIDADO FECHAMENTO VALES]'))
            );
            return !isFechamento;
        });
        dadosBrutos.comprasHistorico = todasCompras;
        dadosBrutos.compras = todasCompras.filter(c => c.data_emissao >= ctx.inicio && c.data_emissao <= ctx.fim);
        dadosBrutos.centrosCusto = (ccRes.status === 'fulfilled' && ccRes.value.data && !ccRes.value.error) ? ccRes.value.data : [];

        // Mapa de fornecedores para resolução precisa de nomes
        const rawForns = (fornRes && fornRes.status === 'fulfilled' && fornRes.value.data && !fornRes.value.error) ? fornRes.value.data : [];
        dadosBrutos.fornecedores = rawForns;
        if (!dadosBrutos.fornecedoresMap) dadosBrutos.fornecedoresMap = {};
        rawForns.forEach(f => {
            if (f && f.id) {
                dadosBrutos.fornecedoresMap[String(f.id)] = f.nome || f.razao_social || 'Fornecedor';
            }
        });
        todasCompras.forEach(c => {
            if (c.fornecedor_id) {
                let fNome = '';
                if (c.fornecedores) {
                    if (Array.isArray(c.fornecedores) && c.fornecedores.length > 0) {
                        fNome = c.fornecedores[0].nome || c.fornecedores[0].razao_social;
                    } else if (typeof c.fornecedores === 'object') {
                        fNome = c.fornecedores.nome || c.fornecedores.razao_social;
                    }
                }
                if (fNome && !dadosBrutos.fornecedoresMap[String(c.fornecedor_id)]) {
                    dadosBrutos.fornecedoresMap[String(c.fornecedor_id)] = fNome;
                }
            }
        });

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
                ? 'id, veiculo_id, veiculo_placa, veiculo_modelo, veiculo_classificacao, valor_total, litros, km_atual, valor_unitario, tipo_combustivel, posto_nome, motorista_nome, motorista_id, data'
                : 'id, veiculo_id, motorista_id, valor_total, litros, km_atual, valor_unitario, tipo_combustivel, data';

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
                .select('id, veiculo_id, oficina_id, valor_total, tipo_id, status, data, numero_os, manutencao_tipos:tipo_id(descricao), fornecedores:oficina_id(nome), manutencao_itens(descricao, quantidade, valor_pecas, valor_servicos, valor_total)')
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

        if (!dadosBrutos.fornecedoresMap) dadosBrutos.fornecedoresMap = {};
        manutAll.forEach(m => {
            if (m.oficina_id && m.fornecedores) {
                let oname = '';
                if (Array.isArray(m.fornecedores) && m.fornecedores.length > 0) oname = m.fornecedores[0].nome || m.fornecedores[0].razao_social;
                else if (typeof m.fornecedores === 'object') oname = m.fornecedores.nome || m.fornecedores.razao_social;
                if (oname && !dadosBrutos.fornecedoresMap[String(m.oficina_id)]) {
                    dadosBrutos.fornecedoresMap[String(m.oficina_id)] = oname;
                }
            }
        });
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
                .select('id, codigo, data, tipo, veiculo_id, placa, valor_total, status_pagamento, status')
                .gte('data', ctx.inicioFetch)
                .lte('data', ctx.fim + 'T23:59:59')
        ]);

        dadosBrutos.estoque = (estRes.status === 'fulfilled' && estRes.value.data) ? estRes.value.data : [];
        const movs = (movRes.status === 'fulfilled' && movRes.value.data) ? movRes.value.data : [];
        const vendas = (vendasRes.status === 'fulfilled' && vendasRes.value.data) ? vendasRes.value.data : [];

        // Identificar códigos de vendas canceladas para blindagem total contra saídas canceladas
        const canceladasCodigos = new Set();
        vendas.forEach(v => {
            const st = (v.status || '').toUpperCase();
            const stPgto = (v.status_pagamento || '').toUpperCase();
            if (st === 'CANCELADA' || st === 'CANCELADO' || stPgto === 'CANCELADA' || stPgto === 'CANCELADO') {
                if (v.codigo) canceladasCodigos.add(v.codigo.toUpperCase().trim());
            }
        });
        dadosBrutos.vendasCanceladasCodigos = canceladasCodigos;

        dadosBrutos.estoqueMovsHistorico = movs;
        dadosBrutos.estoqueMovs = movs.filter(m => {
            const dt = String(m.data || '').slice(0, 10);
            return dt >= ctx.inicio && dt <= ctx.fim;
        });
        dadosBrutos.vendasHistorico = vendas.filter(v => (v.status || '').toUpperCase() !== 'CANCELADA');
        dadosBrutos.vendas = dadosBrutos.vendasHistorico.filter(v => {
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
        dadosBrutos.vendasCanceladasCodigos = new Set();
    }
}

// Helper para identificar movimentações de estoque canceladas, estornos ou revertidas
function isMovimentoEstoqueCancelado(m, canceladasCodigos = null) {
    if (!m) return false;
    const tipo = (m.tipo || '').toUpperCase();
    if (tipo === 'ESTORNO') return true;
    const motivo = (m.motivo || '').toUpperCase();
    if (motivo.includes('[CANCELADA]') || motivo.includes('(CANCELAMENTO)') || motivo.includes('CANCELADO') || motivo.includes('EXCLUÍDO') || motivo.includes('EXCLUIDO')) {
        return true;
    }
    const resp = (m.responsavel || '').toUpperCase();
    if (resp.includes('(CANCELAMENTO)')) return true;
    const st = (m.status || '').toUpperCase();
    if (st === 'CANCELADA' || st === 'CANCELADO') return true;

    const cods = canceladasCodigos || dadosBrutos.vendasCanceladasCodigos;
    if (cods && cods.size > 0) {
        for (const cod of cods) {
            if (cod && motivo.includes(cod)) return true;
        }
    }
    return false;
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
    let emManut = 0;
    let garagem = 0;
    let alocados = 0;
    let patio = 0;

    veiculos.forEach(v => {
        const sa = (v.status_alocacao || '').toUpperCase();
        const st = (v.status || '').toUpperCase();
        const isManut = st === 'MANUTENCAO' || sa === 'MANUTENCAO';
        const isGaragem = sa === 'GARAGEM';
        const hasMot = Boolean(v.motorista_alocado_id || v.motorista_alocado_2_id);

        if (isManut) {
            emManut++;
        } else if (isGaragem) {
            garagem++;
        } else if (hasMot) {
            alocados++;
        } else {
            patio++;
        }
    });

    return { total, alocados, emManut, garagem, patio };
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
    initFiltrosFrota();
    renderFrota();
    renderHealthScoreAndCockpit();
    renderAlertas();
    renderPatrimonio();
    renderFinanceiro();
    renderCompras();
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

    // Custo Total da Frota = Combustível + Manutenção/Peças/Serviços (sem duplicar com módulo financeiro)
    const custoTotalFrotaPeriodo = absGasto + (dadosBrutos.totalGastoManutencaoGeral || (manGasto + (dadosBrutos.compraItens || []).filter(it => it.vinculo_veiculo_id).reduce((s, it) => s + ((parseFloat(it.quantidade) || 1) * (parseFloat(it.valor_unitario) || 0)), 0)));

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
            const ccId = it.centro_custo_id;
            const nomeCC = (ccId && ccMap[String(ccId)]) ? ccMap[String(ccId)] : (it.vinculo_veiculo_id ? 'Manutenção / Aplicação Veicular' : 'Geral / Suprimentos');
            const val = (parseFloat(it.quantidade) || 1) * (parseFloat(it.valor_unitario) || 0);
            if (!porCC[nomeCC]) porCC[nomeCC] = { count: 0, total: 0 };
            porCC[nomeCC].count += 1;
            porCC[nomeCC].total += val;
            totalCC += val;
        });
    } else {
        compras.forEach(c => {
            const nomeCC = 'Geral / Suprimentos';
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

// ─── 6. FILTROS INTELIGENTES CASCATEADOS DA FROTA (CLASSIFICAÇÃO & PLACA) ───
const stateFiltroFrota = {
    classificacoes: new Set(),
    placas: new Set(),
    eventsBound: false
};

function normalizeClassificacaoFrota(rawClass) {
    const raw = String(rawClass || 'PROPRIO').trim().toUpperCase();
    if (raw === 'PROPRIO' || raw === 'CASA') return 'PROPRIO';
    if (raw === 'ESPECIAL') return 'ESPECIAL';
    if (raw === 'DIRETORIA') return 'DIRETORIA';
    if (raw === 'TERCEIRO' || raw === 'TERCEIROS') return 'TERCEIRO';
    if (raw === 'ALUGADO' || raw === 'LOCADO') return 'ALUGADO';
    return raw || 'OUTRO';
}

function getClassificacaoLabel(key) {
    const labels = {
        'PROPRIO': 'Próprio',
        'ESPECIAL': 'Especiais',
        'DIRETORIA': 'Diretoria',
        'TERCEIRO': 'Terceiros',
        'ALUGADO': 'Alugados',
        'OUTRO': 'Outros'
    };
    return labels[key] || (key.charAt(0).toUpperCase() + key.slice(1).toLowerCase());
}

function getVeiculosPorClassificacaoFiltro() {
    const todos = dadosBrutos.veiculos || [];
    if (!stateFiltroFrota.classificacoes.size) return todos;
    return todos.filter(v => stateFiltroFrota.classificacoes.has(normalizeClassificacaoFrota(v.classificacao)));
}

function getVeiculosFiltradosFrota() {
    const todos = dadosBrutos.veiculos || [];
    const veicsClass = getVeiculosPorClassificacaoFiltro();
    if (stateFiltroFrota.placas.size > 0) {
        return veicsClass.filter(v => {
            const pNorm = String(v.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
            const idNorm = String(v.id || '').toLowerCase();
            return stateFiltroFrota.placas.has(pNorm) || stateFiltroFrota.placas.has(idNorm);
        });
    }
    return veicsClass;
}

function renderOpcoesPlacas() {
    const optionsPlacaEl = document.getElementById('options-filtro-placa');
    if (!optionsPlacaEl) return;

    const veiculosDisponiveis = getVeiculosPorClassificacaoFiltro();

    // Cascata inteligente: se alguma placa selecionada não pertence mais às classificações ativas, desmarcar
    const placasValidas = new Set();
    veiculosDisponiveis.forEach(v => {
        const pNorm = String(v.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const idNorm = String(v.id || '').toLowerCase();
        if (pNorm) placasValidas.add(pNorm);
        if (idNorm) placasValidas.add(idNorm);
    });

    stateFiltroFrota.placas.forEach(p => {
        if (!placasValidas.has(p)) {
            stateFiltroFrota.placas.delete(p);
        }
    });

    if (veiculosDisponiveis.length === 0) {
        optionsPlacaEl.innerHTML = '<div style="padding:0.75rem; text-align:center; color:var(--text-muted); font-size:0.78rem;">Nenhum veículo nesta classificação</div>';
        return;
    }

    const sortedVeics = [...veiculosDisponiveis].sort((a, b) => String(a.placa || '').localeCompare(String(b.placa || '')));

    optionsPlacaEl.innerHTML = sortedVeics.map(v => {
        const pNorm = String(v.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const isChecked = stateFiltroFrota.placas.has(pNorm) || (v.id && stateFiltroFrota.placas.has(String(v.id).toLowerCase()));
        const searchStr = `${v.placa || ''} ${v.modelo || ''} ${v.classificacao || ''}`.toLowerCase();
        const classKey = normalizeClassificacaoFrota(v.classificacao);
        const classLabel = getClassificacaoLabel(classKey);

        return `
        <div class="frota-option-item ${isChecked ? 'selected' : ''}" data-key="${pNorm}" data-search="${searchStr}" onclick="toggleFiltroPlaca('${pNorm}')">
            <input type="checkbox" ${isChecked ? 'checked' : ''} onclick="event.stopPropagation(); toggleFiltroPlaca('${pNorm}')">
            <div class="frota-option-info">
                <div class="frota-option-main">
                    <span style="font-weight:700; letter-spacing:0.04em;">${v.placa || 'SEM PLACA'}</span>
                    <span class="frota-count-badge" style="font-size:0.65rem;">${classLabel}</span>
                </div>
                ${v.modelo ? `<span class="frota-option-sub">${v.modelo}</span>` : ''}
            </div>
        </div>`;
    }).join('');

    const searchInput = document.getElementById('search-filtro-placa');
    if (searchInput && searchInput.value.trim()) {
        const termo = searchInput.value.trim().toLowerCase();
        optionsPlacaEl.querySelectorAll('.frota-option-item').forEach(item => {
            const searchData = item.getAttribute('data-search') || '';
            item.style.display = searchData.includes(termo) ? 'flex' : 'none';
        });
    }
}

function initFiltrosFrota() {
    const veiculos = dadosBrutos.veiculos || [];
    if (!veiculos.length) return;

    const classMap = new Map();
    veiculos.forEach(v => {
        const key = normalizeClassificacaoFrota(v.classificacao);
        const label = getClassificacaoLabel(key);
        if (!classMap.has(key)) {
            classMap.set(key, { key, label, count: 0 });
        }
        classMap.get(key).count++;
    });

    const optionsClassEl = document.getElementById('options-filtro-classificacao');
    if (optionsClassEl) {
        const sortedClass = Array.from(classMap.values()).sort((a, b) => b.count - a.count);
        optionsClassEl.innerHTML = sortedClass.map(c => {
            const isChecked = stateFiltroFrota.classificacoes.has(c.key);
            return `
            <div class="frota-option-item ${isChecked ? 'selected' : ''}" data-key="${c.key}" onclick="toggleFiltroClassificacao('${c.key}')">
                <input type="checkbox" ${isChecked ? 'checked' : ''} onclick="event.stopPropagation(); toggleFiltroClassificacao('${c.key}')">
                <div class="frota-option-info">
                    <div class="frota-option-main">
                        <span style="font-weight:600;">${c.label}</span>
                        <span class="frota-count-badge">${c.count}</span>
                    </div>
                </div>
            </div>`;
        }).join('');
    }

    renderOpcoesPlacas();
    atualizarLabelsFiltrosFrota();

    if (!stateFiltroFrota.eventsBound) {
        bindFiltrosFrotaEvents();
        stateFiltroFrota.eventsBound = true;
    }
    if (window.lucide) lucide.createIcons();
}

function toggleFiltroClassificacao(key) {
    if (stateFiltroFrota.classificacoes.has(key)) {
        stateFiltroFrota.classificacoes.delete(key);
    } else {
        stateFiltroFrota.classificacoes.add(key);
    }

    const optionsClassEl = document.getElementById('options-filtro-classificacao');
    if (optionsClassEl) {
        optionsClassEl.querySelectorAll('.frota-option-item').forEach(item => {
            const k = item.getAttribute('data-key');
            const isChecked = stateFiltroFrota.classificacoes.has(k);
            item.classList.toggle('selected', isChecked);
            const chk = item.querySelector('input[type="checkbox"]');
            if (chk) chk.checked = isChecked;
        });
    }

    renderOpcoesPlacas();
    atualizarLabelsFiltrosFrota();
    aplicarFiltrosFrota();
}

function toggleFiltroPlaca(pNorm) {
    if (stateFiltroFrota.placas.has(pNorm)) {
        stateFiltroFrota.placas.delete(pNorm);
    } else {
        stateFiltroFrota.placas.add(pNorm);
    }

    const optionsPlacaEl = document.getElementById('options-filtro-placa');
    if (optionsPlacaEl) {
        optionsPlacaEl.querySelectorAll('.frota-option-item').forEach(item => {
            const k = item.getAttribute('data-key');
            const isChecked = stateFiltroFrota.placas.has(k);
            item.classList.toggle('selected', isChecked);
            const chk = item.querySelector('input[type="checkbox"]');
            if (chk) chk.checked = isChecked;
        });
    }

    atualizarLabelsFiltrosFrota();
    aplicarFiltrosFrota();
}

function atualizarLabelsFiltrosFrota() {
    const totalVeiculos = (dadosBrutos.veiculos || []).length;
    const veiculosFiltrados = getVeiculosFiltradosFrota();
    const isAtivo = (stateFiltroFrota.classificacoes.size > 0 || stateFiltroFrota.placas.size > 0);

    const labelClassEl = document.getElementById('label-filtro-classificacao');
    if (labelClassEl) {
        const size = stateFiltroFrota.classificacoes.size;
        if (size === 0) {
            labelClassEl.textContent = 'Classificação: Todas';
        } else if (size === 1) {
            const first = Array.from(stateFiltroFrota.classificacoes)[0];
            labelClassEl.textContent = `Classificação: ${getClassificacaoLabel(first)}`;
        } else {
            labelClassEl.textContent = `Classificação: ${size} selecionadas`;
        }
    }

    const labelPlacaEl = document.getElementById('label-filtro-placa');
    if (labelPlacaEl) {
        const size = stateFiltroFrota.placas.size;
        if (size === 0) {
            labelPlacaEl.textContent = stateFiltroFrota.classificacoes.size > 0 ? 'Placas: Todas da seleção' : 'Placas: Todas';
        } else if (size === 1) {
            const first = Array.from(stateFiltroFrota.placas)[0];
            labelPlacaEl.textContent = `Placa: ${first}`;
        } else {
            labelPlacaEl.textContent = `Placas: ${size} selecionadas`;
        }
    }

    const badgeStatus = document.getElementById('badge-filtro-frota-status');
    const textStatus = document.getElementById('text-filtro-frota-status');
    const btnLimpar = document.getElementById('btn-limpar-filtros-frota');

    if (badgeStatus && textStatus) {
        if (isAtivo) {
            badgeStatus.style.display = 'inline-flex';
            textStatus.textContent = `Exibindo: ${veiculosFiltrados.length} de ${totalVeiculos} veículos`;
        } else {
            badgeStatus.style.display = 'none';
        }
    }

    if (btnLimpar) {
        btnLimpar.style.display = isAtivo ? 'inline-flex' : 'none';
    }
}

function aplicarFiltrosFrota() {
    renderFrota();
    atualizarGraficos();
    if (window.lucide) lucide.createIcons();
}

function limparFiltrosFrota() {
    stateFiltroFrota.classificacoes.clear();
    stateFiltroFrota.placas.clear();

    const searchInput = document.getElementById('search-filtro-placa');
    if (searchInput) searchInput.value = '';

    const optionsClassEl = document.getElementById('options-filtro-classificacao');
    if (optionsClassEl) {
        optionsClassEl.querySelectorAll('.frota-option-item').forEach(item => {
            item.classList.remove('selected');
            const chk = item.querySelector('input[type="checkbox"]');
            if (chk) chk.checked = false;
        });
    }

    renderOpcoesPlacas();
    atualizarLabelsFiltrosFrota();
    aplicarFiltrosFrota();
}

function selecionarTodasClassificacoes() {
    const veiculos = dadosBrutos.veiculos || [];
    veiculos.forEach(v => {
        stateFiltroFrota.classificacoes.add(normalizeClassificacaoFrota(v.classificacao));
    });

    const optionsClassEl = document.getElementById('options-filtro-classificacao');
    if (optionsClassEl) {
        optionsClassEl.querySelectorAll('.frota-option-item').forEach(item => {
            item.classList.add('selected');
            const chk = item.querySelector('input[type="checkbox"]');
            if (chk) chk.checked = true;
        });
    }

    renderOpcoesPlacas();
    atualizarLabelsFiltrosFrota();
    aplicarFiltrosFrota();
}

function limparClassificacoes() {
    stateFiltroFrota.classificacoes.clear();
    const optionsClassEl = document.getElementById('options-filtro-classificacao');
    if (optionsClassEl) {
        optionsClassEl.querySelectorAll('.frota-option-item').forEach(item => {
            item.classList.remove('selected');
            const chk = item.querySelector('input[type="checkbox"]');
            if (chk) chk.checked = false;
        });
    }

    renderOpcoesPlacas();
    atualizarLabelsFiltrosFrota();
    aplicarFiltrosFrota();
}

function selecionarTodasPlacas() {
    const veics = getVeiculosPorClassificacaoFiltro();
    veics.forEach(v => {
        const pNorm = String(v.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (pNorm) stateFiltroFrota.placas.add(pNorm);
    });

    const optionsPlacaEl = document.getElementById('options-filtro-placa');
    if (optionsPlacaEl) {
        optionsPlacaEl.querySelectorAll('.frota-option-item').forEach(item => {
            if (item.style.display !== 'none') {
                item.classList.add('selected');
                const chk = item.querySelector('input[type="checkbox"]');
                if (chk) chk.checked = true;
                const key = item.getAttribute('data-key');
                if (key) stateFiltroFrota.placas.add(key);
            }
        });
    }

    atualizarLabelsFiltrosFrota();
    aplicarFiltrosFrota();
}

function limparPlacas() {
    stateFiltroFrota.placas.clear();
    const optionsPlacaEl = document.getElementById('options-filtro-placa');
    if (optionsPlacaEl) {
        optionsPlacaEl.querySelectorAll('.frota-option-item').forEach(item => {
            item.classList.remove('selected');
            const chk = item.querySelector('input[type="checkbox"]');
            if (chk) chk.checked = false;
        });
    }

    atualizarLabelsFiltrosFrota();
    aplicarFiltrosFrota();
}

function bindFiltrosFrotaEvents() {
    const triggerClass = document.getElementById('trigger-filtro-classificacao');
    const dropClass = document.getElementById('dropdown-filtro-classificacao');
    const triggerPlaca = document.getElementById('trigger-filtro-placa');
    const dropPlaca = document.getElementById('dropdown-filtro-placa');

    if (triggerClass && dropClass) {
        triggerClass.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = dropClass.classList.contains('show');
            if (dropPlaca) {
                dropPlaca.classList.remove('show');
                triggerPlaca?.classList.remove('active');
            }
            dropClass.classList.toggle('show', !isOpen);
            triggerClass.classList.toggle('active', !isOpen);
        });
    }

    if (triggerPlaca && dropPlaca) {
        triggerPlaca.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = dropPlaca.classList.contains('show');
            if (dropClass) {
                dropClass.classList.remove('show');
                triggerClass?.classList.remove('active');
            }
            dropPlaca.classList.toggle('show', !isOpen);
            triggerPlaca.classList.toggle('active', !isOpen);
            if (!isOpen) {
                setTimeout(() => {
                    document.getElementById('search-filtro-placa')?.focus();
                }, 50);
            }
        });
    }

    document.getElementById('btn-classif-todos')?.addEventListener('click', (e) => {
        e.stopPropagation();
        selecionarTodasClassificacoes();
    });

    document.getElementById('btn-classif-limpar')?.addEventListener('click', (e) => {
        e.stopPropagation();
        limparClassificacoes();
    });

    document.getElementById('btn-placa-todos')?.addEventListener('click', (e) => {
        e.stopPropagation();
        selecionarTodasPlacas();
    });

    document.getElementById('btn-placa-limpar')?.addEventListener('click', (e) => {
        e.stopPropagation();
        limparPlacas();
    });

    document.getElementById('btn-limpar-filtros-frota')?.addEventListener('click', (e) => {
        e.stopPropagation();
        limparFiltrosFrota();
    });

    const searchInput = document.getElementById('search-filtro-placa');
    if (searchInput) {
        searchInput.addEventListener('click', (e) => e.stopPropagation());
        searchInput.addEventListener('input', (e) => {
            const termo = e.target.value.trim().toLowerCase();
            const items = document.querySelectorAll('#options-filtro-placa .frota-option-item');
            items.forEach(item => {
                const searchData = item.getAttribute('data-search') || item.textContent.toLowerCase();
                if (!termo || searchData.includes(termo)) {
                    item.style.display = 'flex';
                } else {
                    item.style.display = 'none';
                }
            });
        });
    }

    document.addEventListener('click', (e) => {
        const contClass = document.getElementById('container-filtro-classificacao');
        const contPlaca = document.getElementById('container-filtro-placa');

        if (contClass && !contClass.contains(e.target)) {
            dropClass?.classList.remove('show');
            triggerClass?.classList.remove('active');
        }
        if (contPlaca && !contPlaca.contains(e.target)) {
            dropPlaca?.classList.remove('show');
            triggerPlaca?.classList.remove('active');
        }
    });
}

// ─── 6. FROTA, CENTROS DE CUSTO (SEGUROS ETC.), COMBUSTÍVEL, MANUTENÇÃO & VILÕES ───
function renderFrota() {
    const hoje = new Date().toISOString().slice(0, 10);
    const em30 = dataAddDias(hoje, 30);
    const todosVeiculos = dadosBrutos.veiculos || [];

    // Aplicação dos Filtros Inteligentes da Frota
    const isFiltroAtivo = (stateFiltroFrota.classificacoes.size > 0 || stateFiltroFrota.placas.size > 0);
    const veiculos = isFiltroAtivo ? getVeiculosFiltradosFrota() : todosVeiculos;

    const veiculoIdsSet = new Set(veiculos.map(v => String(v.id || '').toLowerCase()));
    const veiculoPlacasSet = new Set(veiculos.map(v => String(v.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '')));

    const { total, alocados, emManut, patio: disponiveis } = getFrotaStatusCounts(veiculos);
    
    // Abastecimentos filtrados pela seleção ativa
    const absTodos = dadosBrutos.abastecimentos || [];
    const abs = isFiltroAtivo
        ? absTodos.filter(a => {
            const vid = a.veiculo_id ? String(a.veiculo_id).toLowerCase() : null;
            const vpl = a.veiculo_placa ? String(a.veiculo_placa).toUpperCase().replace(/[^A-Z0-9]/g, '') : null;
            return (vid && veiculoIdsSet.has(vid)) || (vpl && veiculoPlacasSet.has(vpl));
        })
        : absTodos;
    dadosBrutos.abastecimentosFiltradosFrota = abs;

    // Manutenções filtradas pela seleção ativa
    const mansTodos = dadosBrutos.manutencoes || [];
    const mans = isFiltroAtivo
        ? mansTodos.filter(m => m.veiculo_id && veiculoIdsSet.has(String(m.veiculo_id).toLowerCase()))
        : mansTodos;

    const pendentes = (dadosBrutos.manutPendentes || []).filter(m => !isFiltroAtivo || (m.veiculo_id && veiculoIdsSet.has(String(m.veiculo_id).toLowerCase())));
    const lp = dadosBrutos.lancamentosPeriodo || [];
    const prestadores = dadosBrutos.prestadores || [];

    // Classificação Real de Frota (eliminada a restrição errônea de 'CASA')
    // Agrupamento por classificações reais cadastradas no sistema:
    // PROPRIO, ESPECIAL, DIRETORIA, TERCEIRO, OUTRO e Prestadores Comerciais (Agregados)
    const porClassificacao = {};
    veiculos.forEach(v => {
        const rawClass = String(v.classificacao || 'PROPRIO').trim().toUpperCase();
        let classKey = rawClass;
        let classLabel = 'Próprio';
        let iconName = 'car';
        let badgeColor = '#10b981';

        if (rawClass === 'PROPRIO' || rawClass === 'CASA') {
            classKey = 'PROPRIO';
            classLabel = 'Próprio';
            iconName = 'car';
            badgeColor = '#10b981';
        } else if (rawClass === 'ESPECIAL') {
            classKey = 'ESPECIAL';
            classLabel = 'Especiais';
            iconName = 'star';
            badgeColor = '#8b5cf6';
        } else if (rawClass === 'DIRETORIA') {
            classKey = 'DIRETORIA';
            classLabel = 'Diretoria';
            iconName = 'award';
            badgeColor = '#06b6d4';
        } else if (rawClass === 'TERCEIRO' || rawClass === 'TERCEIROS') {
            classKey = 'TERCEIRO';
            classLabel = 'Terceiros';
            iconName = 'truck';
            badgeColor = '#f59e0b';
        } else if (rawClass === 'ALUGADO' || rawClass === 'LOCADO') {
            classKey = 'ALUGADO';
            classLabel = 'Alugados';
            iconName = 'key';
            badgeColor = '#ec4899';
        } else {
            classKey = 'OUTRO';
            classLabel = rawClass.charAt(0) + rawClass.slice(1).toLowerCase();
            iconName = 'shield';
            badgeColor = '#64748b';
        }

        if (!porClassificacao[classKey]) {
            porClassificacao[classKey] = {
                key: classKey,
                label: classLabel,
                icon: iconName,
                badgeColor: badgeColor,
                origem: 'FROTA',
                total: 0,
                rodando: 0,
                garagem: 0,
                manut: 0,
                patio: 0
            };
        }

        porClassificacao[classKey].total++;

        const sa = (v.status_alocacao || '').toUpperCase();
        const st = (v.status || '').toUpperCase();
        const isManut = st === 'MANUTENCAO' || sa === 'MANUTENCAO';
        const isGaragem = sa === 'GARAGEM';
        const hasMot = Boolean(v.motorista_alocado_id || v.motorista_alocado_2_id);

        if (isManut) {
            porClassificacao[classKey].manut++;
        } else if (isGaragem) {
            porClassificacao[classKey].garagem++;
        } else if (hasMot) {
            porClassificacao[classKey].rodando++;
        } else {
            porClassificacao[classKey].patio++;
        }
    });

    const qtdPrestAtivos = prestadores.filter(p => (p.status || '').toUpperCase() === 'ATIVO').length;
    porClassificacao['AGREGADOS'] = {
        key: 'AGREGADOS',
        label: 'Prestadores / Agregados',
        icon: 'briefcase',
        badgeColor: '#38bdf8',
        origem: 'COMERCIAL',
        total: qtdPrestAtivos,
        rodando: qtdPrestAtivos,
        garagem: 0,
        manut: 0,
        patio: 0
    };

    dadosBrutos.classificacoesFrotaMap = porClassificacao;

    const qtdPropriaTotal = (porClassificacao['PROPRIO']?.total || 0) +
                           (porClassificacao['ESPECIAL']?.total || 0) +
                           (porClassificacao['DIRETORIA']?.total || 0);
    const qtdOutrosTerc = total - qtdPropriaTotal;

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

    // Seguros cadastrais nos veículos
    const veicComSeguro = veiculos.filter(v => v.seguradora || v.vencimento_seguro || v.numero_apolice);
    const segVencidos = veiculos.filter(v => v.vencimento_seguro && v.vencimento_seguro < hoje);
    const segVencendo30 = veiculos.filter(v => v.vencimento_seguro && v.vencimento_seguro >= hoje && v.vencimento_seguro <= em30);
    const segVigentesOk = veiculos.filter(v => v.vencimento_seguro && v.vencimento_seguro >= hoje);

    // Preencher KPIs de Frota Operacionais com Classificações Reais (view-operacoes)
    const qtdPropria = porClassificacao['PROPRIO']?.total || 0;
    const qtdEspecial = porClassificacao['ESPECIAL']?.total || 0;
    const qtdDiretoria = porClassificacao['DIRETORIA']?.total || 0;
    const totalFrotaPropria = qtdPropria + qtdEspecial + qtdDiretoria;
    const totalAgregados = qtdPrestAtivos;

    setKPI('kpi-frota-total', total);
    setKPI('kpi-frota-casa-agreg-sub', `${totalFrotaPropria} Próprios (${qtdPropria} Base · ${qtdEspecial} Esp. · ${qtdDiretoria} Dir.) · ${totalAgregados} Agreg.`);
    setKPI('kpi-frota-alocados', alocados);
    setKPI('kpi-frota-disp-manut-sub', `Pátio: ${disponiveis} | Oficina: ${emManut}`);
    setKPI('kpi-frota-fipe-total', fmtBRL(fipeTotal));
    setKPI('kpi-frota-fipe-media', `Média/veíc: ${fmtBRL(fipeMedia)}`);
    setKPI('kpi-frota-seguros-ok', `${segVigentesOk.length} / ${total}`);
    setKPI('kpi-frota-seguros-alerta-sub', `${segVencidos.length} vencido(s) | ${segVencendo30.length} vencendo (30d)`);

    setKPI('kpi-frota-qtd-casa', totalFrotaPropria);
    setKPI('kpi-frota-qtd-agregados', totalAgregados);
    setKPI('kpi-frota-disponiveis', disponiveis);
    setKPI('kpi-frota-em-manut', emManut);

    // ─── CENTROS DE CUSTO REAIS DE COMPRAS & SAÍDA DE ESTOQUE ───
    const centrosCustoTodos = [...(dadosBrutos.centrosCusto || []), ...(dadosBrutos.finCentrosCusto || [])];
    const ccMapCompleto = {};
    centrosCustoTodos.forEach(c => {
        if (c && c.id) ccMapCompleto[String(c.id)] = c;
    });

    // Mapear Grupos Pai (G1)
    const gruposPaiMap = {};
    centrosCustoTodos.filter(c => !c.parent_id).forEach(p => {
        const cod = String(p.codigo || '').trim();
        const nome = String(p.nome || '').trim();
        gruposPaiMap[String(p.id)] = {
            id: String(p.id),
            codigo: cod,
            nome: nome,
            total: 0,
            qtdItens: 0,
            filhos: {}
        };
    });

    // Mapear cada item lançado em Compras dentro do período (desconsiderando consolidados de fechamento de vales)
    const todosCompraItens = dadosBrutos.compraItens || [];
    const compraItensPeriodo = isFiltroAtivo
        ? todosCompraItens.filter(it => it.vinculo_veiculo_id && veiculoIdsSet.has(String(it.vinculo_veiculo_id).toLowerCase()))
        : todosCompraItens;

    compraItensPeriodo.forEach(it => {
        const ccId = it.centro_custo_id;
        const val = (parseFloat(it.quantidade) || 1) * (parseFloat(it.valor_unitario) || 0);
        if (val <= 0) return;

        const cc = ccId ? ccMapCompleto[String(ccId)] : null;
        if (!cc) {
            const semPaiId = '__SEM_CC__';
            if (!gruposPaiMap[semPaiId]) {
                gruposPaiMap[semPaiId] = {
                    id: semPaiId,
                    codigo: '--',
                    nome: 'SEM CENTRO DE CUSTO DEFINIDO',
                    total: 0,
                    qtdItens: 0,
                    filhos: {}
                };
            }
            gruposPaiMap[semPaiId].total += val;
            gruposPaiMap[semPaiId].qtdItens += 1;
            return;
        }

        let paiId = cc.parent_id ? String(cc.parent_id) : String(cc.id);
        let filhoId = String(cc.id);

        if (!gruposPaiMap[paiId]) {
            const paiObj = ccMapCompleto[paiId];
            gruposPaiMap[paiId] = {
                id: paiId,
                codigo: paiObj ? paiObj.codigo : '--',
                nome: paiObj ? paiObj.nome : 'OUTROS CENTROS DE CUSTO',
                total: 0,
                qtdItens: 0,
                filhos: {}
            };
        }

        gruposPaiMap[paiId].total += val;
        gruposPaiMap[paiId].qtdItens += 1;

        if (!gruposPaiMap[paiId].filhos[filhoId]) {
            gruposPaiMap[paiId].filhos[filhoId] = {
                id: filhoId,
                codigo: cc.codigo || '--',
                nome: cc.nome || 'Subgrupo',
                total: 0,
                qtdItens: 0
            };
        }

        gruposPaiMap[paiId].filhos[filhoId].total += val;
        gruposPaiMap[paiId].filhos[filhoId].qtdItens += 1;
    });

    // Filtro para EXCLUIR "03 - ESTOQUE" das compras de manutenção (pois compra de estoque é entrada/patrimonial e não custo de aplicação direta)
    const isCentroEstoque = (p) => {
        const c = String(p.codigo || '').trim();
        const n = String(p.nome || '').toUpperCase();
        return c === '03' || n === 'ESTOQUE' || n.includes('ENTRADA DE ESTOQUE');
    };

    const paisAtivosManut = Object.values(gruposPaiMap)
        .filter(p => p.total > 0 && !isCentroEstoque(p))
        .sort((a, b) => b.total - a.total);

    // Módulo Estoque: SAÍDA DE ESTOQUE (consumo real aplicado em manutenção)
    const estoqueMap = {};
    (dadosBrutos.estoque || []).forEach(e => { estoqueMap[e.id] = e; });
    const todasSaidasEstoque = (dadosBrutos.estoqueMovs || []).filter(m => (m.tipo || '').toUpperCase() === 'SAIDA' && !isMovimentoEstoqueCancelado(m));
    const saidasEstoquePeriodo = isFiltroAtivo
        ? todasSaidasEstoque.filter(m => {
            const vid = m.veiculo_id ? String(m.veiculo_id).toLowerCase() : null;
            const vpl = m.placa ? String(m.placa).toUpperCase().replace(/[^A-Z0-9]/g, '') : null;
            return (vid && veiculoIdsSet.has(vid)) || (vpl && veiculoPlacasSet.has(vpl));
        })
        : todasSaidasEstoque;
    const totalSaidaEstoque = saidasEstoquePeriodo.reduce((s, m) => {
        const custoRef = parseFloat(m.valor_unitario) || parseFloat(estoqueMap[m.item_id]?.valor_custo) || 0;
        return s + ((parseFloat(m.quantidade) || 0) * custoRef);
    }, 0);
    const qtdMovsSaida = saidasEstoquePeriodo.length;
    const qtdUnidadesSaida = saidasEstoquePeriodo.reduce((s, m) => s + (parseFloat(m.quantidade) || 0), 0);

    // Total Manutenção = Soma dos Centros de Manutenção em Compras + Saídas de Estoque aplicadas
    const totalComprasManut = paisAtivosManut.reduce((s, p) => s + p.total, 0);
    const totalGastoManutencaoGeral = totalComprasManut + totalSaidaEstoque;
    dadosBrutos.totalGastoManutencaoGeral = totalGastoManutencaoGeral;

    // Montar hierarquia consolidada para Gráfico e Tabela Analítica (incluindo Saída de Estoque)
    const hierarquiaFinal = [...paisAtivosManut];
    if (totalSaidaEstoque > 0) {
        const filhosEstoque = {};
        saidasEstoquePeriodo.forEach(m => {
            const itemNome = estoqueMap[m.item_id]?.nome || m.observacao || 'Item de Estoque';
            const fid = String(m.item_id || itemNome);
            const cRef = parseFloat(m.valor_unitario) || parseFloat(estoqueMap[m.item_id]?.valor_custo) || 0;
            const subVal = (parseFloat(m.quantidade) || 0) * cRef;
            if (!filhosEstoque[fid]) {
                filhosEstoque[fid] = {
                    id: fid,
                    codigo: 'EST',
                    nome: itemNome,
                    total: 0,
                    qtdItens: 0
                };
            }
            filhosEstoque[fid].total += subVal;
            filhosEstoque[fid].qtdItens += (parseFloat(m.quantidade) || 1);
        });

        hierarquiaFinal.push({
            id: '__SAIDA_ESTOQUE__',
            codigo: 'EST',
            nome: 'SAÍDA DE ESTOQUE (APLICAÇÃO)',
            total: totalSaidaEstoque,
            qtdItens: qtdMovsSaida,
            filhos: filhosEstoque,
            isEstoque: true
        });
    }

    dadosBrutos.centrosCustoHierarquia = hierarquiaFinal.sort((a, b) => b.total - a.total);

    // ─── BIG NUMBERS FINANCEIROS DA FROTA (VIEW-FROTA) ───
    // Custo Total Frota (TCO) = Gasto Combustível + Custo Manutenção (Centros de Custo de Compras + Saídas de Estoque)
    // NÃO inclui lançamentos do módulo financeiro (fin_lancamentos) para evitar duplicidade com Compras
    const tcoTotalFrota = totalCombGasto + totalGastoManutencaoGeral;
    const percTcoFipe = fipeTotal > 0 ? ((tcoTotalFrota / fipeTotal) * 100) : 0;
    const tcoPorKmGlobal = totalKmRodado > 0 ? (tcoTotalFrota / totalKmRodado) : 0;

    setKPI('kpi-frota-tco-total', fmtBRL(tcoTotalFrota));
    setKPI('kpi-frota-tco-fipe-perc', `${fmt(percTcoFipe, 1)}% sobre patrimônio FIPE`);
    setKPI('kpi-frota-comb-total', fmtBRL(totalCombGasto));
    setKPI('kpi-frota-comb-sub', `${fmt(totalLitros, 0)} L abastecidos`);
    setKPI('kpi-frota-manut-total', fmtBRL(totalGastoManutencaoGeral));
    setKPI('kpi-frota-manut-sub', `Centros de Custo + Saída de Estoque`);
    setKPI('kpi-frota-km-total', `${fmt(totalKmRodado, 0)} KM`);
    setKPI('kpi-frota-custo-km-global', totalKmRodado > 0 ? `${fmtBRL(tcoPorKmGlobal)}/KM` : 'R$ 0,00/KM');

    // ─── CARDS DINÂMICOS & INTELIGENTES DA SEÇÃO CUSTO MANUTENÇÃO ───
    setKPI('kpi-manut-total-geral', fmtBRL(totalGastoManutencaoGeral));

    // Sequência mestre de prioridade solicitada:
    // 1. PEÇAS, 2. MÃO DE OBRA, 3. PNEU, 4. TAXAS, 5. SEGUROS, 6. BATERIAS, 7. FRANQUIAS, 8. SERVIÇOS, 9. UTILIDADES INTERNAS, 10. SAÍDA DE ESTOQUE
    const sequenciaMestre = [
        { key: 'pecas', cod: '04', match: 'PECA', label: '🔩 Peças', border: '#6366f1', colorClass: 'accent-indigo' },
        { key: 'mao_de_obra', cod: '05', match: 'OBRA', label: '🔧 Mão de Obra', border: '#10b981', colorClass: 'accent-green' },
        { key: 'pneu', cod: '06', match: 'PNEU', label: '🛞 Pneu', border: '#f59e0b', colorClass: 'accent-amber' },
        { key: 'taxas', cod: '07', match: 'TAXA', label: '📄 Taxas', border: '#06b6d4', colorClass: 'accent-cyan' },
        { key: 'seguros', cod: '08', match: 'SEGURO', label: '🛡️ Seguros', border: '#3b82f6', colorClass: 'accent-blue' },
        { key: 'baterias', cod: '09', match: 'BATERIA', label: '🔋 Baterias', border: '#ec4899', colorClass: 'accent-pink' },
        { key: 'franquias', cod: '10', match: 'FRANQUIA', label: '🏢 Franquias', border: '#8b5cf6', colorClass: 'accent-purple' },
        { key: 'servicos', cod: '11', match: 'SERVICO', label: '📋 Serviços', border: '#14b8a6', colorClass: 'accent-teal' },
        { key: 'utilidades', cod: '14', match: 'UTILIDADES', label: '🏢 Utilidades Internas', border: '#f97316', colorClass: 'accent-orange' },
        { key: 'saida_estoque', isEstoque: true, label: '📦 Saída de Estoque', border: '#a855f7', colorClass: 'accent-purple' }
    ];

    const cardsParaRenderizar = [];

    // Card 1 de Destaque: TOTAL MANUTENÇÃO (soma consolidada de todos os centros de custo + saída de estoque)
    if (totalGastoManutencaoGeral > 0 || hierarquiaFinal.length > 0) {
        cardsParaRenderizar.push({
            label: '🔧 Total Manutenção',
            valor: fmtBRL(totalGastoManutencaoGeral),
            sub: `Soma consolidada (${hierarquiaFinal.length} centros ativos)`,
            border: '#ef4444',
            colorClass: 'accent-red'
        });
    }

    const mappedPaiIds = new Set();
    sequenciaMestre.forEach(itemSeq => {
        if (itemSeq.isEstoque) {
            if (totalSaidaEstoque > 0) {
                cardsParaRenderizar.push({
                    label: itemSeq.label,
                    valor: fmtBRL(totalSaidaEstoque),
                    sub: `${qtdMovsSaida} saída(s) · ${Math.round(qtdUnidadesSaida)} un. aplicadas`,
                    border: itemSeq.border,
                    colorClass: itemSeq.colorClass
                });
            }
            return;
        }

        // Buscar grupo pai correspondente em compras de manutenção
        const itemPai = paisAtivosManut.find(p => {
            const c = (p.codigo || '').trim();
            const n = (p.nome || '').toUpperCase();
            return c === itemSeq.cod || n.includes(itemSeq.match);
        });

        if (itemPai && itemPai.total > 0) {
            mappedPaiIds.add(itemPai.id);
            const subCount = Object.keys(itemPai.filhos).length;
            cardsParaRenderizar.push({
                label: itemSeq.label,
                valor: fmtBRL(itemPai.total),
                sub: `${subCount} subgrupo(s) · ${itemPai.qtdItens} ite${itemPai.qtdItens > 1 ? 'ns' : 'm'}`,
                border: itemSeq.border,
                colorClass: itemSeq.colorClass
            });
        }
    });

    // Se houver algum outro centro de custo com gasto no período fora da lista mestre padrão:
    const outrosPaisNaoMapeados = paisAtivosManut.filter(p => !mappedPaiIds.has(p.id) && p.total > 0);
    outrosPaisNaoMapeados.forEach(p => {
        const subCount = Object.keys(p.filhos).length;
        cardsParaRenderizar.push({
            label: `📁 ${p.codigo ? p.codigo + ' - ' : ''}${p.nome}`,
            valor: fmtBRL(p.total),
            sub: `${subCount} subgrupo(s) · ${p.qtdItens} ite${p.qtdItens > 1 ? 'ns' : 'm'}`,
            border: '#64748b',
            colorClass: 'accent-indigo'
        });
    });

    // Renderizar dinamicamente apenas os cards que têm valores no container flexível
    const kpiContainer = document.getElementById('cc-frota-kpi-container');
    if (kpiContainer) {
        if (cardsParaRenderizar.length === 0) {
            kpiContainer.innerHTML = `
                <div class="empty-msg" style="grid-column: 1 / -1; padding: 1.2rem; text-align: center; color: var(--text-muted); background: var(--bg-card); border-radius: var(--radius); border: 1px dashed var(--border);">
                    Nenhum gasto registrado para os centros de custo no período selecionado
                </div>`;
        } else {
            kpiContainer.innerHTML = cardsParaRenderizar.map(c => `
                <div class="stat-mini" style="border-left: 3px solid ${c.border};">
                    <span class="stat-mini-label">${c.label}</span>
                    <span class="stat-mini-val ${c.colorClass}">${c.valor}</span>
                    <span class="stat-mini-sub">${c.sub}</span>
                </div>
            `).join('');
        }
    }

    // Renderizar Tabela Hierárquica Analítica (Pai G1 > Filhos)
    const ccFrotaBody = document.getElementById('frota-centros-custo-body');
    if (ccFrotaBody) {
        if (hierarquiaFinal.length === 0) {
            ccFrotaBody.innerHTML = '<tr><td colspan="5" class="empty-msg">Nenhum custo de manutenção registrado no período</td></tr>';
        } else {
            let htmlTable = '';
            hierarquiaFinal.forEach((p, idx) => {
                const percPai = totalGastoManutencaoGeral > 0 ? ((p.total / totalGastoManutencaoGeral) * 100) : 0;
                const filhosList = Object.values(p.filhos).sort((a, b) => b.total - a.total);
                const qtdFilhos = filhosList.length;
                const safePaiId = p.id.replace(/[^a-zA-Z0-9_-]/g, '_');

                htmlTable += `
                <tr class="tr-cc-pai" onclick="toggleSubCentrosCusto('${safePaiId}')" title="Clique para expandir/recolher os subgrupos de ${p.nome}">
                    <td style="font-weight:700; color:#ffffff;">
                        <button type="button" class="btn-toggle-filhos" id="btn-toggle-${safePaiId}" onclick="event.stopPropagation(); toggleSubCentrosCusto('${safePaiId}');" title="Expandir subgrupos">
                            <i data-lucide="chevron-down" style="width:14px;height:14px;"></i>
                        </button>
                        <span>${p.codigo} - ${p.nome}</span>
                        <span class="chip-subgrupo-count">${qtdFilhos} ${p.isEstoque ? 'item(ns)' : 'subgrupo(s)'}</span>
                    </td>
                    <td style="text-align:center; font-weight:600; color:#94a3b8;">${p.qtdItens}</td>
                    <td style="text-align:right; font-weight:800; color:#10b981;">${fmtBRL(p.total)}</td>
                    <td style="text-align:right; font-weight:700; color:var(--text-soft);">${fmt(percPai, 1)}%</td>
                    <td style="text-align:center;">
                        <span class="badge ${qtdFilhos > 0 ? 'badge-info' : 'badge-neutral'}" style="cursor:pointer;">
                            ${qtdFilhos > 0 ? 'Ver Detalhes' : 'Sem itens'}
                        </span>
                    </td>
                </tr>
                <tr class="tr-cc-filhos-wrap" id="wrap-filhos-${safePaiId}">
                    <td colspan="5" style="padding:0.5rem 1rem 0.9rem 2.8rem; background:rgba(15, 23, 42, 0.45);">
                        <table class="filhos-table">
                            <thead>
                                <tr>
                                    <th>${p.isEstoque ? 'Produto / Peça Aplicada' : 'Subgrupo / Centro de Custo Filho (G)'}</th>
                                    <th style="text-align:center;">Qtd ${p.isEstoque ? 'Unidades' : 'Itens'}</th>
                                    <th style="text-align:right;">Valor Consolidado</th>
                                    <th style="text-align:right;">% do Grupo Pai</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${filhosList.map(f => {
                                    const percFilho = p.total > 0 ? ((f.total / p.total) * 100) : 0;
                                    return `
                                    <tr>
                                        <td style="font-weight:600; color:#cbd5e1;">
                                            <span style="color:#10b981; margin-right:6px;">↳</span>
                                            ${f.codigo ? f.codigo + ' - ' : ''}${f.nome}
                                        </td>
                                        <td style="text-align:center; color:#94a3b8;">${f.qtdItens}</td>
                                        <td style="text-align:right; font-weight:700; color:#34d399;">${fmtBRL(f.total)}</td>
                                        <td style="text-align:right; color:#94a3b8; font-weight:600;">${fmt(percFilho, 1)}%</td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </td>
                </tr>`;
            });
            ccFrotaBody.innerHTML = htmlTable;
        }
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
    setKPI('kpi-comb-gasto-sub', `Período selecionado`);
    setKPI('kpi-comb-litros', `${fmt(totalLitros, 0)} L`);
    setKPI('kpi-comb-litros-sub', `Litros / M³`);
    setKPI('kpi-comb-preco-medio', mediaPrecoLitro > 0 ? `${fmtBRL(mediaPrecoLitro)}/L` : 'R$ 0,00/L');
    setKPI('kpi-comb-km-l', mediaKmL > 0 ? `${fmt(mediaKmL, 1)} KM/L` : '-- KM/L');
    setKPI('kpi-comb-custo-km', custoCombKm > 0 ? `${fmtBRL(custoCombKm)}/KM` : 'R$ --/KM');
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
                manutencaoOS: 0,
                comprasPecas: 0,
                saidasEstoque: 0,
                kms: []
            };
        }
        return custosVeiculo[id];
    };

    abs.forEach(a => {
        if (!a.veiculo_id && !a.veiculo_placa) return;
        const targetId = a.veiculo_id || a.veiculo_placa;
        const b = ensureBucket(targetId, a.veiculo_placa, a.veiculo_modelo);
        b.combustivel += (parseFloat(a.valor_total) || 0);
        if (a.km_atual) b.kms.push(parseFloat(a.km_atual));
    });

    mans.forEach(m => {
        if (!m.veiculo_id) return;
        const b = ensureBucket(m.veiculo_id);
        b.manutencaoOS += getManutValor(m);
    });

    compraItensPeriodo.forEach(it => {
        if (!it.vinculo_veiculo_id) return;
        const b = ensureBucket(it.vinculo_veiculo_id);
        b.comprasPecas += (parseFloat(it.quantidade) || 1) * (parseFloat(it.valor_unitario) || 0);
    });

    saidasEstoquePeriodo.forEach(m => {
        const vid = m.veiculo_id ? String(m.veiculo_id).toLowerCase() : null;
        const vpl = m.placa ? String(m.placa).toUpperCase().replace(/[^A-Z0-9]/g, '') : null;
        const targetId = vid || (vpl && veiculoMap[vpl]?.id) || vpl;
        if (!targetId) return;
        const b = ensureBucket(targetId, m.placa);
        const custoRef = parseFloat(m.valor_unitario) || parseFloat(estoqueMap[m.item_id]?.valor_custo) || 0;
        b.saidasEstoque += ((parseFloat(m.quantidade) || 0) * custoRef);
    });

    let custoFrotaSomadoVeic = 0;
    const rankingVeiculos = Object.entries(custosVeiculo).map(([id, d]) => {
        const vInfo = getVeicInfo(id, d.placaFallback, d.modeloFallback);
        const manutTotal = d.manutencaoOS + d.comprasPecas + d.saidasEstoque;
        const totalV = d.combustivel + manutTotal;
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
            classificacao: vInfo.classificacao || 'PROPRIO',
            combustivel: d.combustivel,
            manutencao: manutTotal,
            kmRod,
            custoKm: kmRod > 0 ? (totalV / kmRod) : 0,
            total: totalV
        };
    }).filter(v => v.total > 0).sort((a, b) => b.total - a.total);

    dadosBrutos.rankingVeiculosCompleto = rankingVeiculos;
    dadosBrutos.custoFrotaSomadoRanking = custoFrotaSomadoVeic;

    renderRankingVeiculosTabela();
}

// ─── TABELA DE RANKING DE CUSTOS & TOGGLE TOP 10 / TODOS ───
let rankingExibirTodos = false;

function toggleExibirTodosVeiculosRanking() {
    rankingExibirTodos = !rankingExibirTodos;
    renderRankingVeiculosTabela();
}

function renderRankingVeiculosTabela() {
    const viloesBody = document.getElementById('viloes-frota-body');
    const badgeCount = document.getElementById('badge-viloes-count');
    const btnLabel = document.getElementById('label-toggle-viloes');
    const ranking = dadosBrutos.rankingVeiculosCompleto || [];
    const totalFrota = dadosBrutos.custoFrotaSomadoRanking || 1;

    if (!viloesBody) return;

    if (ranking.length === 0) {
        viloesBody.innerHTML = '<tr><td colspan="9" class="empty-msg">Nenhum custo operacional por veículo registrado no período selecionado.</td></tr>';
        if (badgeCount) badgeCount.textContent = 'Top 10 Vilões de Custo';
        if (btnLabel) btnLabel.textContent = 'Ver Todos os Veículos';
        return;
    }

    const veicsParaExibir = rankingExibirTodos ? ranking : ranking.slice(0, 10);

    if (badgeCount) {
        badgeCount.textContent = rankingExibirTodos
            ? `Todos os ${ranking.length} Veículos Ativos`
            : `Top 10 Vilões de Custo`;
    }

    if (btnLabel) {
        btnLabel.textContent = rankingExibirTodos ? 'Ver Top 10 Vilões' : `Ver Todos (${ranking.length} veículos)`;
    }

    viloesBody.innerHTML = veicsParaExibir.map((v, i) => {
        const perc = totalFrota > 0 ? ((v.total / totalFrota) * 100) : 0;
        const classKey = normalizeClassificacaoFrota(v.classificacao);
        const classLabel = getClassificacaoLabel(classKey);
        const badgeClass = classKey === 'PROPRIO' ? 'badge-success' : classKey === 'ALUGADO' ? 'badge-purple' : 'badge-info';

        return `
        <tr>
            <td><span class="badge-rank ${i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : ''}">${i + 1}</span></td>
            <td>
                <strong>${v.placa}</strong>
                <div style="font-size:0.73rem;color:var(--text-muted);">${v.modelo}</div>
            </td>
            <td><span class="badge ${badgeClass}">${classLabel}</span></td>
            <td style="text-align:right;" class="accent-green td-drilldown" onclick="abrirDetalheVeiculoFrota('${v.id}', 'combustivel')" title="Clique para auditar os abastecimentos detalhados de ${v.placa}">
                ${fmtBRL(v.combustivel)} <i data-lucide="external-link" style="width:11px;height:11px;opacity:0.6;vertical-align:middle;margin-left:2px;"></i>
            </td>
            <td style="text-align:right;" class="accent-amber td-drilldown" onclick="abrirDetalheVeiculoFrota('${v.id}', 'manutencao')" title="Clique para ver a auditoria de manutenção em cascata de ${v.placa}">
                ${fmtBRL(v.manutencao)} <i data-lucide="external-link" style="width:11px;height:11px;opacity:0.6;vertical-align:middle;margin-left:2px;"></i>
            </td>
            <td style="text-align:right;">${v.kmRod > 0 ? fmt(v.kmRod, 0) + ' KM' : '—'}</td>
            <td style="text-align:right;font-weight:600;">${v.custoKm > 0 ? fmtBRL(v.custoKm) : '—'}</td>
            <td style="text-align:right;font-weight:800;font-size:0.92rem;">${fmtBRL(v.total)}</td>
            <td style="text-align:right;font-weight:700;color:var(--text-soft);">${fmt(perc, 1)}%</td>
        </tr>`;
    }).join('');

    if (window.lucide) lucide.createIcons();
}

// ─── MODAL DRILL-DOWN DE CUSTOS DO VEÍCULO (COMBUSTÍVEL & MANUTENÇÃO) ───
let veiculoAtualModal = null;

function fmtDataHoraBR(dateStr) {
    if (!dateStr) return '-';
    const s = String(dateStr);
    const dt = s.slice(0, 10);
    const hr = s.length >= 16 ? s.slice(11, 16) : '';
    const p = dt.split('-');
    const dtFmt = p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : dt;
    return hr ? `${dtFmt} ${hr}` : dtFmt;
}

// Estilos visuais e semânticos por tipo de combustível (Badges e Gráficos)
function getCombustivelStyle(tipoRaw) {
    const t = String(tipoRaw || '').trim().toUpperCase();
    if (t.includes('GAS NATURAL') || t.includes('GÁS NATURAL') || t === 'GNV') {
        return {
            bg: 'rgba(16, 185, 129, 0.18)',
            color: '#34d399',
            border: 'rgba(16, 185, 129, 0.35)',
            badgeClass: 'badge-fuel-gnv',
            unidade: 'm³',
            chartColor: '#10b981'
        };
    }
    if (t.includes('GASOLINA')) {
        return {
            bg: 'rgba(239, 68, 68, 0.18)',
            color: '#f87171',
            border: 'rgba(239, 68, 68, 0.35)',
            badgeClass: 'badge-fuel-gasolina',
            unidade: 'L',
            chartColor: '#ef4444'
        };
    }
    if (t.includes('DIESEL')) {
        return {
            bg: 'rgba(59, 130, 246, 0.18)',
            color: '#60a5fa',
            border: 'rgba(59, 130, 246, 0.35)',
            badgeClass: 'badge-fuel-diesel',
            unidade: 'L',
            chartColor: '#3b82f6'
        };
    }
    if (t.includes('ETANOL') || t.includes('ALCOOL') || t.includes('ÁLCOOL')) {
        return {
            bg: 'rgba(245, 158, 11, 0.18)',
            color: '#fbbf24',
            border: 'rgba(245, 158, 11, 0.35)',
            badgeClass: 'badge-fuel-etanol',
            unidade: 'L',
            chartColor: '#f59e0b'
        };
    }
    if (t.includes('ARLA')) {
        return {
            bg: 'rgba(6, 182, 212, 0.18)',
            color: '#22d3ee',
            border: 'rgba(6, 182, 212, 0.35)',
            badgeClass: 'badge-fuel-arla',
            unidade: 'L',
            chartColor: '#06b6d4'
        };
    }
    if (t.includes('ELETRIC') || t.includes('ELÉTRIC') || t.includes('HIBRID') || t.includes('HÍBRID')) {
        return {
            bg: 'rgba(168, 85, 247, 0.18)',
            color: '#c084fc',
            border: 'rgba(168, 85, 247, 0.35)',
            badgeClass: 'badge-fuel-eletrico',
            unidade: 'kWh',
            chartColor: '#a855f7'
        };
    }
    return {
        bg: 'rgba(148, 163, 184, 0.15)',
        color: '#cbd5e1',
        border: 'rgba(148, 163, 184, 0.25)',
        badgeClass: 'badge-fuel-outro',
        unidade: 'L',
        chartColor: '#64748b'
    };
}

function abrirDetalheVeiculoFrota(veiculoId, abaAtiva = 'combustivel') {
    const todosVeiculos = dadosBrutos.veiculos || [];
    const vIdNorm = String(veiculoId || '').toLowerCase();
    
    // Localizar veículo
    let v = todosVeiculos.find(x => String(x.id || '').toLowerCase() === vIdNorm);
    if (!v) {
        v = todosVeiculos.find(x => String(x.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '') === String(veiculoId || '').toUpperCase().replace(/[^A-Z0-9]/g, ''));
    }
    if (!v) {
        const vRank = (dadosBrutos.rankingVeiculosCompleto || []).find(r => r.id === veiculoId);
        v = {
            id: veiculoId,
            placa: vRank ? vRank.placa : (String(veiculoId).length <= 8 ? String(veiculoId).toUpperCase() : 'Veículo'),
            modelo: vRank ? vRank.modelo : '',
            classificacao: vRank ? vRank.classificacao : 'PROPRIO'
        };
    }

    veiculoAtualModal = v;
    const placaNorm = String(v.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const classKey = normalizeClassificacaoFrota(v.classificacao);
    const classLabel = getClassificacaoLabel(classKey);

    // Header do Modal
    const titleEl = document.getElementById('modalDetalheVeiculoTitle');
    if (titleEl) titleEl.textContent = v.placa || 'Veículo';

    const modeloEl = document.getElementById('modalDetalheVeiculoModelo');
    if (modeloEl) {
        const parts = [v.modelo || 'Modelo não informado'];
        if (v.ano_fabricacao || v.ano_modelo) parts.push(`Ano: ${v.ano_fabricacao || ''}/${v.ano_modelo || ''}`);
        if (v.tipo_veiculo) parts.push(v.tipo_veiculo);
        modeloEl.textContent = parts.filter(Boolean).join(' · ');
    }

    const badgeTipoEl = document.getElementById('modalDetalheVeiculoTipoBadge');
    if (badgeTipoEl) {
        badgeTipoEl.textContent = classLabel;
        badgeTipoEl.className = 'badge ' + (classKey === 'PROPRIO' ? 'badge-success' : classKey === 'ALUGADO' ? 'badge-purple' : 'badge-info');
    }

    // Filtrar Abastecimentos
    const todosAbs = dadosBrutos.abastecimentos || [];
    const absVeic = todosAbs.filter(a => {
        const aid = a.veiculo_id ? String(a.veiculo_id).toLowerCase() : null;
        const apl = a.veiculo_placa ? String(a.veiculo_placa).toUpperCase().replace(/[^A-Z0-9]/g, '') : null;
        return (aid && aid === vIdNorm) || (apl && apl === placaNorm);
    }).sort((a, b) => (b.data || '').localeCompare(a.data || ''));

    const totalCombGasto = absVeic.reduce((s, a) => s + (parseFloat(a.valor_total) || 0), 0);
    const totalLitros = absVeic.reduce((s, a) => s + (parseFloat(a.litros) || 0), 0);
    const mediaPrecoL = totalLitros > 0 ? (totalCombGasto / totalLitros) : 0;
    
    // KM Rodado do veículo no período
    let kmRod = 0;
    const kms = absVeic.map(a => parseFloat(a.km_atual) || 0).filter(k => k > 0).sort((a, b) => a - b);
    if (kms.length > 1) {
        const delta = kms[kms.length - 1] - kms[0];
        if (delta > 0 && delta < 150000) kmRod = delta;
    }
    const mediaKmL = (totalLitros > 0 && kmRod > 0) ? (kmRod / totalLitros) : 0;

    // Filtrar Manutenções OS
    const todasMans = dadosBrutos.manutencoes || [];
    const mansVeic = todasMans.filter(m => m.veiculo_id && String(m.veiculo_id).toLowerCase() === vIdNorm);

    // Filtrar Compras Vinculadas
    const todosCompraItens = dadosBrutos.compraItens || [];
    const comprasVeic = todosCompraItens.filter(it => it.vinculo_veiculo_id && String(it.vinculo_veiculo_id).toLowerCase() === vIdNorm);

    // Filtrar Saídas de Estoque
    const estoqueMap = {};
    (dadosBrutos.estoque || []).forEach(e => { estoqueMap[e.id] = e; });
    const todasSaidas = (dadosBrutos.estoqueMovs || []).filter(m => (m.tipo || '').toUpperCase() === 'SAIDA' && !isMovimentoEstoqueCancelado(m));
    const saidasVeic = todasSaidas.filter(m => {
        const vid = m.veiculo_id ? String(m.veiculo_id).toLowerCase() : null;
        const vpl = m.placa ? String(m.placa).toUpperCase().replace(/[^A-Z0-9]/g, '') : null;
        return (vid && vid === vIdNorm) || (vpl && vpl === placaNorm);
    });

    // Mapeamentos auxiliares
    const comprasMap = {};
    [...(dadosBrutos.compras || []), ...(dadosBrutos.comprasHistorico || [])].forEach(c => {
        if (c && c.id) comprasMap[String(c.id)] = c;
    });

    const ccMap = {};
    [...(dadosBrutos.centrosCusto || []), ...(dadosBrutos.finCentrosCusto || [])].forEach(c => {
        if (c && c.id) ccMap[String(c.id)] = c;
    });

    // Estrutura hierárquica em cascata para Manutenção
    const grupos = {};

    function getOrCreateGrupo(paiId, codigoPai, nomePai) {
        if (!grupos[paiId]) {
            grupos[paiId] = {
                id: paiId,
                codigo: codigoPai || '--',
                nome: nomePai || 'OUTROS',
                total: 0,
                qtdItens: 0,
                subgrupos: {}
            };
        }
        return grupos[paiId];
    }

    function getOrCreateSubgrupo(g, subId, codigoSub, nomeSub) {
        if (!g.subgrupos[subId]) {
            g.subgrupos[subId] = {
                id: subId,
                codigo: codigoSub || '--',
                nome: nomeSub || 'Geral',
                total: 0,
                qtdItens: 0,
                itens: []
            };
        }
        return g.subgrupos[subId];
    }

    // 1. Processar Compras vinculadas
    comprasVeic.forEach(it => {
        const val = (parseFloat(it.quantidade) || 1) * (parseFloat(it.valor_unitario) || 0);
        if (val <= 0) return;

        const cc = it.centro_custo_id ? ccMap[String(it.centro_custo_id)] : null;
        let paiId = '__COMPRAS_OUTROS__';
        let paiCod = '04';
        let paiNome = 'PEÇAS E MATERIAIS (COMPRAS)';
        let subId = '__SUB_COMPRAS_GERAL__';
        let subCod = '--';
        let subNome = 'Itens de Manutenção';

        if (cc) {
            if (cc.parent_id) {
                const paiObj = ccMap[String(cc.parent_id)];
                paiId = String(cc.parent_id);
                paiCod = paiObj ? (paiObj.codigo || '04') : '04';
                paiNome = paiObj ? paiObj.nome : 'PEÇAS E MATERIAIS';
                subId = String(cc.id);
                subCod = cc.codigo || '--';
                subNome = cc.nome || 'Subgrupo';
            } else {
                paiId = String(cc.id);
                paiCod = cc.codigo || '04';
                paiNome = cc.nome || 'PEÇAS E MATERIAIS';
                subId = String(cc.id) + '_geral';
                subCod = cc.codigo || '--';
                subNome = 'Geral';
            }
        }

        const g = getOrCreateGrupo(paiId, paiCod, paiNome);
        const sub = getOrCreateSubgrupo(g, subId, subCod, subNome);

        const comp = it.compra_id ? comprasMap[String(it.compra_id)] : null;
        const nfNum = comp ? (comp.numero_nota ? `NF #${comp.numero_nota}` : (comp.numero ? `Compra #${comp.numero}` : `Compra #${String(comp.id).slice(0, 8)}`)) : 'Compra';

        let fornNome = '';
        if (comp) {
            if (comp.fornecedores) {
                if (Array.isArray(comp.fornecedores) && comp.fornecedores.length > 0) {
                    fornNome = comp.fornecedores[0].nome || comp.fornecedores[0].razao_social || '';
                } else if (typeof comp.fornecedores === 'object') {
                    fornNome = comp.fornecedores.nome || comp.fornecedores.razao_social || '';
                }
            }
            if (!fornNome && comp.fornecedor_id && dadosBrutos.fornecedoresMap) {
                fornNome = dadosBrutos.fornecedoresMap[String(comp.fornecedor_id)] || '';
            }
            if (!fornNome && comp.fornecedor_nome) {
                fornNome = comp.fornecedor_nome;
            }
        }
        if (!fornNome) fornNome = 'Fornecedor não inf.';
        const dataEmissao = comp ? fmtDataBR(comp.data_emissao) : '—';

        g.total += val;
        g.qtdItens += (parseFloat(it.quantidade) || 1);
        sub.total += val;
        sub.qtdItens += (parseFloat(it.quantidade) || 1);

        sub.itens.push({
            nome: it.produto || it.descricao || 'Item / Peça de Manutenção',
            origem: nfNum,
            fornecedor: fornNome,
            data: dataEmissao,
            qtd: parseFloat(it.quantidade) || 1,
            valorUnit: parseFloat(it.valor_unitario) || 0,
            valorTotal: val
        });
    });

    // 2. Processar Ordens de Serviço (Manutenções)
    mansVeic.forEach(m => {
        const valM = getManutValor(m);
        if (valM <= 0) return;

        const paiId = '__OS_OFICINAS__';
        const paiCod = '05';
        const paiNome = 'SERVIÇOS DE OFICINA & MÃO DE OBRA (OS)';
        const g = getOrCreateGrupo(paiId, paiCod, paiNome);

        const tipoDesc = (m.manutencao_tipos && m.manutencao_tipos.descricao) ? m.manutencao_tipos.descricao : 'Manutenção Corretiva/Preventiva';
        const subId = String(m.tipo_id || '__TIPO_OS__');
        const sub = getOrCreateSubgrupo(g, subId, 'OS', tipoDesc);

        let oficina = '';
        if (m.fornecedores) {
            if (Array.isArray(m.fornecedores) && m.fornecedores.length > 0) {
                oficina = m.fornecedores[0].nome || m.fornecedores[0].razao_social || '';
            } else if (typeof m.fornecedores === 'object') {
                oficina = m.fornecedores.nome || m.fornecedores.razao_social || '';
            }
        }
        if (!oficina && m.oficina_id && dadosBrutos.fornecedoresMap) {
            oficina = dadosBrutos.fornecedoresMap[String(m.oficina_id)] || '';
        }
        if (!oficina && m.oficina_nome) {
            oficina = m.oficina_nome;
        }
        if (!oficina) oficina = 'Oficina Credenciada';

        const osDoc = m.numero_os ? `OS #${m.numero_os}` : `OS #${String(m.id).slice(0, 8)}`;
        const dtOS = fmtDataBR(m.data);

        g.total += valM;
        sub.total += valM;

        if (m.manutencao_itens && m.manutencao_itens.length > 0) {
            m.manutencao_itens.forEach(it => {
                const subItVal = parseFloat(it.valor_total) || ((parseFloat(it.valor_pecas) || 0) + (parseFloat(it.valor_servicos) || 0)) || valM;
                const qtdIt = parseFloat(it.quantidade) || 1;
                g.qtdItens += qtdIt;
                sub.qtdItens += qtdIt;
                sub.itens.push({
                    nome: it.descricao || 'Serviço / Item de Oficina',
                    origem: osDoc,
                    fornecedor: oficina,
                    data: dtOS,
                    qtd: qtdIt,
                    valorUnit: qtdIt > 0 ? (subItVal / qtdIt) : subItVal,
                    valorTotal: subItVal
                });
            });
        } else {
            g.qtdItens += 1;
            sub.qtdItens += 1;
            sub.itens.push({
                nome: `Ordem de Serviço — ${tipoDesc}`,
                origem: osDoc,
                fornecedor: oficina,
                data: dtOS,
                qtd: 1,
                valorUnit: valM,
                valorTotal: valM
            });
        }
    });

    // 3. Processar Saídas de Estoque aplicadas na placa
    saidasVeic.forEach(m => {
        const cRef = parseFloat(m.valor_unitario) || parseFloat(estoqueMap[m.item_id]?.valor_custo) || 0;
        const valEst = (parseFloat(m.quantidade) || 0) * cRef;
        if (valEst <= 0) return;

        const paiId = '__ESTOQUE_APLICADO__';
        const paiCod = '03';
        const paiNome = 'SAÍDA DE ESTOQUE (PEÇAS APLICADAS)';
        const g = getOrCreateGrupo(paiId, paiCod, paiNome);

        const subId = '__SUB_ESTOQUE_ALMOX__';
        const sub = getOrCreateSubgrupo(g, subId, 'EST', 'Almoxarifado Interno');

        const itemEst = estoqueMap[m.item_id];
        const itemNome = itemEst ? `${itemEst.codigo ? itemEst.codigo + ' - ' : ''}${itemEst.nome}` : (m.observacao || 'Item de Estoque');
        const qtdEst = parseFloat(m.quantidade) || 1;

        g.total += valEst;
        g.qtdItens += qtdEst;
        sub.total += valEst;
        sub.qtdItens += qtdEst;

        sub.itens.push({
            nome: itemNome,
            origem: 'Mov. Saída Estoque',
            fornecedor: 'Almoxarifado Interno',
            data: fmtDataBR(m.data),
            qtd: qtdEst,
            valorUnit: cRef,
            valorTotal: valEst
        });
    });

    const totalManutencao = Object.values(grupos).reduce((s, g) => s + g.total, 0);
    const tcoVeiculo = totalCombGasto + totalManutencao;
    const custoKmVeiculo = kmRod > 0 ? (tcoVeiculo / kmRod) : 0;

    // Atualizar KPIs rápidos
    const kpiTcoEl = document.getElementById('modalDetalheKpiTco');
    if (kpiTcoEl) kpiTcoEl.textContent = fmtBRL(tcoVeiculo);

    const kpiCombEl = document.getElementById('modalDetalheKpiComb');
    if (kpiCombEl) kpiCombEl.textContent = fmtBRL(totalCombGasto);

    const kpiManutEl = document.getElementById('modalDetalheKpiManut');
    if (kpiManutEl) kpiManutEl.textContent = fmtBRL(totalManutencao);

    const kpiKmEl = document.getElementById('modalDetalheKpiKm');
    if (kpiKmEl) {
        kpiKmEl.textContent = `${kmRod > 0 ? fmt(kmRod, 0) + ' KM' : '0 KM'} · ${custoKmVeiculo > 0 ? fmtBRL(custoKmVeiculo) + '/KM' : 'R$ 0,00/KM'}`;
    }

    // Labels das abas
    const tabCombLbl = document.getElementById('modal-tab-label-combustivel');
    if (tabCombLbl) tabCombLbl.textContent = `⛽ Combustível (${absVeic.length} abastecimento${absVeic.length > 1 ? 's' : ''})`;

    const tabManutLbl = document.getElementById('modal-tab-label-manutencao');
    if (tabManutLbl) tabManutLbl.textContent = `🔧 Manutenção & Centros de Custo (${fmtBRL(totalManutencao)})`;

    // ─── Renderizar Painel 1: Combustível ───
    const combSummaryEl = document.getElementById('modal-combustivel-summary');
    if (combSummaryEl) {
        combSummaryEl.innerHTML = `
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:0.75rem;">
            <div class="stat-mini" style="border-left:3px solid #10b981; padding:0.6rem 0.85rem;">
                <span class="stat-mini-label">Gasto Combustível</span>
                <span class="stat-mini-val accent-green" style="font-size:1.15rem;">${fmtBRL(totalCombGasto)}</span>
                <span class="stat-mini-sub">${absVeic.length} registros</span>
            </div>
            <div class="stat-mini" style="border-left:3px solid #06b6d4; padding:0.6rem 0.85rem;">
                <span class="stat-mini-label">Volume Total</span>
                <span class="stat-mini-val accent-cyan" style="font-size:1.15rem;">${fmt(totalLitros, 1)} L</span>
                <span class="stat-mini-sub">Litros consumidos</span>
            </div>
            <div class="stat-mini" style="border-left:3px solid #f59e0b; padding:0.6rem 0.85rem;">
                <span class="stat-mini-label">Preço Médio / L</span>
                <span class="stat-mini-val accent-amber" style="font-size:1.15rem;">${fmtBRL(mediaPrecoL)}/L</span>
                <span class="stat-mini-sub">Média ponderada</span>
            </div>
            <div class="stat-mini" style="border-left:3px solid #6366f1; padding:0.6rem 0.85rem;">
                <span class="stat-mini-label">Eficiência Média</span>
                <span class="stat-mini-val accent-indigo" style="font-size:1.15rem;">${mediaKmL > 0 ? fmt(mediaKmL, 1) + ' KM/L' : '-- KM/L'}</span>
                <span class="stat-mini-sub">${kmRod > 0 ? fmt(kmRod, 0) + ' KM rodados' : 'KM inicial/final não calculável'}</span>
            </div>
        </div>`;
    }

    const combBodyEl = document.getElementById('modal-combustivel-body');
    if (combBodyEl) {
        if (absVeic.length === 0) {
            combBodyEl.innerHTML = '<tr><td colspan="8" class="empty-msg">Nenhum abastecimento registrado para este veículo no período</td></tr>';
        } else {
            combBodyEl.innerHTML = absVeic.map(a => {
                const dt = fmtDataHoraBR(a.data);
                const mot = a.motorista_nome || (a.motorista_id && dadosBrutos.motoristasMap ? dadosBrutos.motoristasMap[a.motorista_id] : '') || 'Não informado';
                const posto = a.posto_nome || 'Posto Geral';
                const tipo = a.tipo_combustivel || 'DIESEL';
                const fStyle = getCombustivelStyle(tipo);
                const lit = parseFloat(a.litros) || 0;
                const pUnit = parseFloat(a.valor_unitario) || 0;
                const vTot = parseFloat(a.valor_total) || 0;
                const km = a.km_atual ? fmt(parseFloat(a.km_atual), 0) + ' KM' : '—';

                return `
                <tr>
                    <td style="font-weight:600; color:#ffffff; white-space:nowrap;">${dt}</td>
                    <td style="font-weight:600; color:#cbd5e1;">${mot}</td>
                    <td style="color:var(--text-muted);">${posto}</td>
                    <td>
                        <span class="badge ${fStyle.badgeClass}" style="background:${fStyle.bg}; color:${fStyle.color}; border:1px solid ${fStyle.border}; font-size:0.7rem; font-weight:700; text-transform:uppercase;">
                            ${tipo}
                        </span>
                    </td>
                    <td style="text-align:right; font-weight:700; color:#38bdf8;">${fmt(lit, 2)} ${fStyle.unidade}</td>
                    <td style="text-align:right; color:#94a3b8;">${pUnit > 0 ? fmtBRL(pUnit) : '—'}</td>
                    <td style="text-align:right; font-weight:800; color:#10b981;">${fmtBRL(vTot)}</td>
                    <td style="text-align:right; color:#cbd5e1;">${km}</td>
                </tr>`;
            }).join('');
        }
    }

    // ─── Renderizar Painel 2: Manutenções em Cascata ───
    const gruposList = Object.values(grupos).sort((a, b) => b.total - a.total);
    const manutSummaryEl = document.getElementById('modal-manutencao-summary');
    if (manutSummaryEl) {
        const qtdItensTotal = gruposList.reduce((s, g) => s + g.qtdItens, 0);
        manutSummaryEl.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:0.75rem; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:0.75rem 1rem;">
            <div style="display:flex; align-items:center; gap:0.6rem;">
                <i data-lucide="layers" style="width:16px;height:16px;color:var(--warning);"></i>
                <span style="font-size:0.83rem; font-weight:600; color:#ffffff;">Auditoria Hierárquica em Cascata: Centros de Custo Pai ➔ Subgrupos ➔ Itens Analíticos</span>
            </div>
            <div style="font-size:0.8rem; color:var(--text-muted);">
                Total: <strong style="color:#f59e0b;">${fmtBRL(totalManutencao)}</strong> · <strong>${gruposList.length}</strong> centro(s) · <strong>${Math.round(qtdItensTotal)}</strong> item(ns)
            </div>
        </div>`;
    }

    const cascataBodyEl = document.getElementById('modal-manutencao-cascata-body');
    if (cascataBodyEl) {
        if (gruposList.length === 0) {
            cascataBodyEl.innerHTML = '<tr><td colspan="7" class="empty-msg">Nenhum custo de manutenção registrado para este veículo no período</td></tr>';
        } else {
            let htmlCascata = '';
            gruposList.forEach(grp => {
                const percGrupo = totalManutencao > 0 ? ((grp.total / totalManutencao) * 100) : 0;
                const safeGrpId = String(grp.id).replace(/[^a-zA-Z0-9_-]/g, '_');
                const subList = Object.values(grp.subgrupos).sort((a, b) => b.total - a.total);

                htmlCascata += `
                <tr class="cascata-grupo-row" onclick="toggleCascataGrupo('${safeGrpId}')" title="Clique para expandir/recolher os subgrupos de ${grp.nome}">
                    <td style="font-weight:700; color:#ffffff;">
                        <button type="button" class="btn-cascata-toggle" id="btn-grp-${safeGrpId}">
                            <i data-lucide="chevron-down" style="width:13px;height:13px;"></i>
                        </button>
                        <span>${grp.codigo ? grp.codigo + ' - ' : ''}${grp.nome}</span>
                        <span class="badge badge-warning" style="margin-left:8px; font-size:0.68rem;">${subList.length} subgrupo(s)</span>
                    </td>
                    <td style="text-align:center;"><span class="badge badge-neutral" style="font-size:0.68rem;">Grupo Pai</span></td>
                    <td style="color:var(--text-muted); font-size:0.75rem;">Consolidado</td>
                    <td style="text-align:center; color:var(--text-muted);">—</td>
                    <td style="text-align:right; font-weight:600; color:#94a3b8;">${Math.round(grp.qtdItens)}</td>
                    <td style="text-align:right; font-weight:800; color:#f59e0b;">${fmtBRL(grp.total)}</td>
                    <td style="text-align:right; font-weight:700; color:var(--text-soft);">${fmt(percGrupo, 1)}%</td>
                </tr>`;

                // Subgrupos pertencentes a este Grupo Pai
                subList.forEach(sub => {
                    const percSub = grp.total > 0 ? ((sub.total / grp.total) * 100) : 0;
                    const safeSubId = safeGrpId + '_' + String(sub.id).replace(/[^a-zA-Z0-9_-]/g, '_');

                    htmlCascata += `
                    <tr class="cascata-subgrupo-row wrap-sub-of-${safeGrpId}" id="row-sub-${safeSubId}" style="display:none;" onclick="toggleCascataSubgrupo('${safeSubId}')" title="Clique para ver os itens analíticos de ${sub.nome}">
                        <td style="padding-left:2.5rem; font-weight:600; color:#e2e8f0;">
                            <button type="button" class="btn-cascata-toggle" id="btn-sub-${safeSubId}">
                                <i data-lucide="chevron-down" style="width:12px;height:12px;"></i>
                            </button>
                            <span style="color:#a5b4fc; margin-right:4px;">↳</span>
                            <span>${sub.codigo && sub.codigo !== '--' ? sub.codigo + ' - ' : ''}${sub.nome}</span>
                            <span class="chip-subgrupo-count" style="margin-left:6px;">${sub.itens.length} ite${sub.itens.length > 1 ? 'ns' : 'm'}</span>
                        </td>
                        <td style="text-align:center;"><span class="badge badge-info" style="font-size:0.68rem;">Subgrupo</span></td>
                        <td style="color:var(--text-muted); font-size:0.75rem;">Subgrupo</td>
                        <td style="text-align:center; color:var(--text-muted);">—</td>
                        <td style="text-align:right; color:#94a3b8;">${Math.round(sub.qtdItens)}</td>
                        <td style="text-align:right; font-weight:700; color:#38bdf8;">${fmtBRL(sub.total)}</td>
                        <td style="text-align:right; color:#94a3b8; font-weight:600;">${fmt(percSub, 1)}%</td>
                    </tr>`;

                    // Itens Analíticos do Subgrupo
                    sub.itens.forEach(it => {
                        const percItem = sub.total > 0 ? ((it.valorTotal / sub.total) * 100) : 0;
                        htmlCascata += `
                        <tr class="cascata-item-row wrap-item-of-${safeSubId} wrap-sub-of-${safeGrpId}" style="display:none;">
                            <td style="padding-left:4.6rem; color:#f8fafc; font-weight:500;">
                                <span style="color:#10b981; margin-right:6px;">•</span>
                                <span>${it.nome}</span>
                            </td>
                            <td style="text-align:center;"><span class="badge badge-neutral" style="font-size:0.68rem;">${it.origem}</span></td>
                            <td style="color:#cbd5e1; font-size:0.78rem;">${it.fornecedor}</td>
                            <td style="text-align:center; color:var(--text-muted); font-size:0.78rem;">${it.data}</td>
                            <td style="text-align:right; color:#cbd5e1;">${it.qtd} ${it.valorUnit > 0 ? `<span style="font-size:0.7rem; color:var(--text-muted);">x ${fmtBRL(it.valorUnit)}</span>` : ''}</td>
                            <td style="text-align:right; font-weight:700; color:#10b981;">${fmtBRL(it.valorTotal)}</td>
                            <td style="text-align:right; font-size:0.75rem; color:var(--text-muted);">${fmt(percItem, 1)}%</td>
                        </tr>`;
                    });
                });
            });
            cascataBodyEl.innerHTML = htmlCascata;
        }
    }

    // Ativar a aba solicitada (combustível ou manutenção)
    switchModalDetalheTab(abaAtiva);

    // Exibir Modal
    const modalEl = document.getElementById('modalDetalheVeiculoFrota');
    if (modalEl) modalEl.classList.add('active');

    if (window.lucide) lucide.createIcons();
}

function switchModalDetalheTab(tab) {
    const btnComb = document.getElementById('modal-tab-btn-combustivel');
    const btnManut = document.getElementById('modal-tab-btn-manutencao');
    const panelComb = document.getElementById('modal-painel-combustivel');
    const panelManut = document.getElementById('modal-painel-manutencao');

    if (tab === 'combustivel') {
        btnComb?.classList.add('active');
        btnManut?.classList.remove('active');
        if (panelComb) panelComb.style.display = 'block';
        if (panelManut) panelManut.style.display = 'none';
    } else {
        btnManut?.classList.add('active');
        btnComb?.classList.remove('active');
        if (panelManut) panelManut.style.display = 'block';
        if (panelComb) panelComb.style.display = 'none';
    }

    if (window.lucide) lucide.createIcons();
}

function fecharModalDetalheVeiculoFrota() {
    const modalEl = document.getElementById('modalDetalheVeiculoFrota');
    if (modalEl) modalEl.classList.remove('active');
}

function toggleCascataGrupo(safeGrpId) {
    const rows = document.querySelectorAll('.wrap-sub-of-' + safeGrpId);
    const btn = document.getElementById('btn-grp-' + safeGrpId);
    if (!rows.length) return;

    const isVisible = rows[0].style.display !== 'none';
    rows.forEach(r => {
        if (isVisible) {
            r.style.display = 'none';
            const subBtn = r.querySelector('.btn-cascata-toggle');
            if (subBtn) subBtn.classList.remove('open');
        } else {
            if (r.classList.contains('cascata-subgrupo-row')) {
                r.style.display = 'table-row';
            }
        }
    });

    if (btn) btn.classList.toggle('open', !isVisible);
    if (window.lucide) lucide.createIcons();
}

function toggleCascataSubgrupo(safeSubId) {
    const rows = document.querySelectorAll('.wrap-item-of-' + safeSubId);
    const btn = document.getElementById('btn-sub-' + safeSubId);
    if (!rows.length) return;

    const isVisible = rows[0].style.display !== 'none';
    rows.forEach(r => {
        r.style.display = isVisible ? 'none' : 'table-row';
    });

    if (btn) btn.classList.toggle('open', !isVisible);
    if (window.lucide) lucide.createIcons();
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

    // Movimentações no período (desconsiderando cancelamentos e estornos)
    const entradas = movs.filter(m => (m.tipo || '').toUpperCase() === 'ENTRADA');
    const saidasMov = movs.filter(m => (m.tipo || '').toUpperCase() === 'SAIDA' && !isMovimentoEstoqueCancelado(m));

    const valEntradas = entradas.reduce((s, m) => {
        const custoRef = parseFloat(m.valor_unitario) || parseFloat(estoqueMap[m.item_id]?.valor_custo) || 0;
        return s + ((parseFloat(m.quantidade) || 0) * custoRef);
    }, 0);

    const valSaidasMov = saidasMov.reduce((s, m) => {
        const custoRef = parseFloat(m.valor_unitario) || parseFloat(estoqueMap[m.item_id]?.valor_custo) || 0;
        return s + ((parseFloat(m.quantidade) || 0) * custoRef);
    }, 0);
    const valVendasOS = vendas.filter(v => (v.status || '').toUpperCase() !== 'CANCELADA').reduce((s, v) => s + (parseFloat(v.valor_total) || 0), 0);
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
    chartCombTipos = createDoughnutChart('chart-comb-tipos', 'right');
    chartCombClassificacao = createDoughnutChart('chart-comb-classificacao', 'right');
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
        'badge-chart-comb-meses',
        'badge-chart-manut-meses',
        'badge-chart-dp-meses',
        'badge-chart-comercial-meses',
        'badge-chart-estoque-meses'
    ].forEach(id => setKPI(id, labelBadge));

    const labelBadgeFrota = ctx.mesesPeriodo.length === 1
        ? `Mês: ${ctx.mesesPeriodo[0]?.label || 'Mês'}`
        : `Período: ${ctx.mesesPeriodo.length} Meses`;
    setKPI('badge-chart-frota-meses', labelBadgeFrota);
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

    // ─── 5. FROTA: Evolução Mensal Inteligente (Combustível vs Manutenção) ───
    const absHist = dadosBrutos.abastecimentosHistorico || [];
    const manutHist = dadosBrutos.manutencoesHistorico || [];
    const compItensHist = dadosBrutos.compraItensHistorico || [];
    const compraDataMap = {};
    comprasHist.forEach(c => { compraDataMap[c.id] = String(c.data_emissao || '').slice(0, 7); });

    // Filtrar históricos se houver filtros ativos na aba Frota
    const isFiltroFrotaAtivo = (stateFiltroFrota.classificacoes.size > 0 || stateFiltroFrota.placas.size > 0);
    let absHistFrota = absHist;
    let compItensHistFrota = compItensHist;
    let estoqueMovsHistFrota = dadosBrutos.estoqueMovsHistorico || dadosBrutos.estoqueMovs || [];
    const absCombGrafico = dadosBrutos.abastecimentosFiltradosFrota || dadosBrutos.abastecimentos || [];

    if (isFiltroFrotaAtivo) {
        const veicsFilt = getVeiculosFiltradosFrota();
        const vIds = new Set(veicsFilt.map(v => String(v.id || '').toLowerCase()));
        const vPlacas = new Set(veicsFilt.map(v => String(v.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '')));

        absHistFrota = absHist.filter(a => {
            const vid = a.veiculo_id ? String(a.veiculo_id).toLowerCase() : null;
            const vpl = a.veiculo_placa ? String(a.veiculo_placa).toUpperCase().replace(/[^A-Z0-9]/g, '') : null;
            return (vid && vIds.has(vid)) || (vpl && vPlacas.has(vpl));
        });

        compItensHistFrota = compItensHist.filter(it => it.vinculo_veiculo_id && vIds.has(String(it.vinculo_veiculo_id).toLowerCase()));

        estoqueMovsHistFrota = estoqueMovsHistFrota.filter(m => {
            const vid = m.veiculo_id ? String(m.veiculo_id).toLowerCase() : null;
            const vpl = m.placa ? String(m.placa).toUpperCase().replace(/[^A-Z0-9]/g, '') : null;
            return (vid && vIds.has(vid)) || (vpl && vPlacas.has(vpl));
        });
    }

    // Evolução Mensal da Frota segue estritamente o período filtrado (se 1 mês, mostra apenas 1 mês)
    const mesesFrota = ctx.mesesPeriodo && ctx.mesesPeriodo.length ? ctx.mesesPeriodo : meses;
    const labelsFrota = mesesFrota.map(m => m.label);

    const serieFrotaPeriodo = mesesFrota.map(m => {
        let comb = 0;
        let manutTotal = 0;
        if (ctx.mesesPeriodo && ctx.mesesPeriodo.length === 1 && m.anoMes === ctx.mesesPeriodo[0].anoMes && dadosBrutos.totalGastoManutencaoGeral !== undefined) {
            manutTotal = dadosBrutos.totalGastoManutencaoGeral;
            comb = absCombGrafico.reduce((s, a) => s + (parseFloat(a.valor_total) || 0), 0);
        } else {
            comb = absHistFrota.filter(a => String(a.data || '').startsWith(m.anoMes)).reduce((s, a) => s + (parseFloat(a.valor_total) || 0), 0);
            const ccMap = {};
            (dadosBrutos.centrosCusto || []).forEach(c => { ccMap[String(c.id)] = c; });
            const itensMes = compItensHistFrota.filter(it => compraDataMap[it.compra_id] === m.anoMes);
            const comprasMesManut = itensMes.reduce((s, it) => {
                const cc = it.centro_custo_id ? ccMap[String(it.centro_custo_id)] : null;
                const cCod = cc ? String(cc.codigo || '').trim() : '';
                const cNome = cc ? String(cc.nome || '').toUpperCase() : '';
                if (cCod === '03' || cNome === 'ESTOQUE' || cNome.includes('ENTRADA DE ESTOQUE')) return s;
                return s + ((parseFloat(it.quantidade) || 1) * (parseFloat(it.valor_unitario) || 0));
            }, 0);
            
            const saidasMes = estoqueMovsHistFrota
                .filter(mov => (mov.tipo || '').toUpperCase() === 'SAIDA' && !isMovimentoEstoqueCancelado(mov) && String(mov.data || '').startsWith(m.anoMes))
                .reduce((s, mov) => {
                    const cRef = parseFloat(mov.valor_unitario) || 0;
                    return s + ((parseFloat(mov.quantidade) || 0) * cRef);
                }, 0);
                
            manutTotal = comprasMesManut + saidasMes;
        }
        return { comb, manut: manutTotal };
    });

    if (chartFrotaEvolucaoMensal) {
        chartFrotaEvolucaoMensal.data.labels = labelsFrota;
        chartFrotaEvolucaoMensal.data.datasets = [
            { label: 'Combustível (R$)', data: serieFrotaPeriodo.map(x => x.comb), backgroundColor: '#10b981', borderRadius: 4 },
            { label: 'Manutenção (R$)', data: serieFrotaPeriodo.map(x => x.manut), backgroundColor: '#ef4444', borderRadius: 4 }
        ];
        chartFrotaEvolucaoMensal.update('active');
    }

    const badgeFrota = document.getElementById('badge-chart-frota-meses');
    if (badgeFrota) {
        badgeFrota.textContent = mesesFrota.length === 1
            ? `Mês Selecionado: ${mesesFrota[0].label}`
            : `Período: ${mesesFrota.length} Meses (${mesesFrota[0].label} a ${mesesFrota[mesesFrota.length - 1].label})`;
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
        const paisCC = (dadosBrutos.centrosCustoHierarquia || []).filter(r => r.total > 0);
        const colors = ['#6366f1', '#10b981', '#06b6d4', '#f59e0b', '#a855f7', '#ef4444', '#ec4899', '#14b8a6', '#84cc16', '#3b82f6'];
        chartFrotaCentrosCusto.data.labels = paisCC.length ? paisCC.map(r => `${r.codigo} - ${r.nome}`) : ['Sem compras no período'];
        chartFrotaCentrosCusto.data.datasets = [{
            data: paisCC.length ? paisCC.map(r => r.total) : [1],
            backgroundColor: paisCC.length ? colors.slice(0, paisCC.length) : ['rgba(255,255,255,0.05)'],
            borderWidth: 0
        }];
        chartFrotaCentrosCusto.update('active');
    }

    // ─── 5.1 SEÇÃO COMBUSTÍVEL: Gráficos Inteligentes de Tipos & Classificação ───
    const porTipoComb = {};
    absCombGrafico.forEach(a => {
        const tipo = (a.tipo_combustivel || 'Outros').trim();
        const v = parseFloat(a.valor_total) || 0;
        const l = parseFloat(a.litros) || 0;
        if (v <= 0) return;
        if (!porTipoComb[tipo]) porTipoComb[tipo] = { tipo, total: 0, litros: 0 };
        porTipoComb[tipo].total += v;
        porTipoComb[tipo].litros += l;
    });
    const tiposCombAtivos = Object.values(porTipoComb)
        .filter(t => t.total > 0)
        .sort((a, b) => b.total - a.total);

    const fuelColors = tiposCombAtivos.map(t => getCombustivelStyle(t.tipo).chartColor);

    if (chartCombTipos) {
        chartCombTipos.data.labels = tiposCombAtivos.length ? tiposCombAtivos.map(t => t.tipo) : ['Sem abastecimentos'];
        chartCombTipos.data.datasets = [{
            data: tiposCombAtivos.length ? tiposCombAtivos.map(t => t.total) : [1],
            backgroundColor: tiposCombAtivos.length ? fuelColors : ['rgba(255,255,255,0.05)'],
            borderWidth: 0
        }];
        chartCombTipos.update('active');
    }

    const legendTipos = document.getElementById('comb-tipos-legend');
    if (legendTipos) {
        const totalCombGeral = tiposCombAtivos.reduce((s, t) => s + t.total, 0);
        legendTipos.innerHTML = tiposCombAtivos.length === 0
            ? '<span class="empty-msg" style="font-size:0.78rem;">Sem abastecimentos no período</span>'
            : tiposCombAtivos.map((t, idx) => {
                const fStyle = getCombustivelStyle(t.tipo);
                const cor = fStyle.chartColor;
                const perc = totalCombGeral > 0 ? ((t.total / totalCombGeral) * 100) : 0;
                return `
                <div style="display:flex; align-items:center; justify-content:space-between; font-size:0.8rem; padding:0.25rem 0.5rem; background:rgba(255,255,255,0.02); border-radius:4px;">
                    <div style="display:flex; align-items:center; gap:0.4rem;">
                        <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${cor};"></span>
                        <span style="color:var(--text); font-weight:600;">${t.tipo}</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:0.6rem;">
                        <span style="color:var(--text-muted); font-size:0.75rem;">${fmt(t.litros, 0)} ${fStyle.unidade} (${fmt(perc, 1)}%)</span>
                        <span style="color:#10b981; font-weight:700;">${fmtBRL(t.total)}</span>
                    </div>
                </div>`;
            }).join('');
    }

    // Classificação da frota abastecida (Próprios, Agregados, Especiais, Diretoria, etc.)
    const veicMapClass = {};
    (dadosBrutos.veiculos || []).forEach(v => {
        if (v.id) veicMapClass[String(v.id)] = v;
    });

    const porClassComb = {};
    absCombGrafico.forEach(a => {
        const v = a.veiculo_id ? veicMapClass[String(a.veiculo_id)] : null;
        const rawClass = v ? String(v.classificacao || 'PROPRIO').trim().toUpperCase() : 'OUTRO';
        let classLabel = 'Próprio';
        if (rawClass === 'PROPRIO' || rawClass === 'CASA') {
            classLabel = 'Próprio';
        } else if (rawClass === 'ESPECIAL') {
            classLabel = 'Especiais';
        } else if (rawClass === 'DIRETORIA') {
            classLabel = 'Diretoria';
        } else if (rawClass === 'AGREGADO' || rawClass === 'AGREGADOS') {
            classLabel = 'Agregados';
        } else if (rawClass === 'TERCEIRO' || rawClass === 'TERCEIROS') {
            classLabel = 'Terceiros';
        } else if (rawClass === 'ALUGADO' || rawClass === 'LOCADO') {
            classLabel = 'Alugados';
        } else {
            classLabel = 'Outros';
        }

        const val = parseFloat(a.valor_total) || 0;
        const lit = parseFloat(a.litros) || 0;
        if (val <= 0) return;

        if (!porClassComb[classLabel]) {
            porClassComb[classLabel] = { label: classLabel, total: 0, litros: 0, qtd: 0 };
        }
        porClassComb[classLabel].total += val;
        porClassComb[classLabel].litros += lit;
        porClassComb[classLabel].qtd += 1;
    });

    const classCombAtivas = Object.values(porClassComb)
        .filter(c => c.total > 0)
        .sort((a, b) => b.total - a.total);

    const classColors = ['#6366f1', '#38bdf8', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#64748b'];

    if (chartCombClassificacao) {
        chartCombClassificacao.data.labels = classCombAtivas.length ? classCombAtivas.map(c => c.label) : ['Sem abastecimentos'];
        chartCombClassificacao.data.datasets = [{
            data: classCombAtivas.length ? classCombAtivas.map(c => c.total) : [1],
            backgroundColor: classCombAtivas.length ? classColors.slice(0, classCombAtivas.length) : ['rgba(255,255,255,0.05)'],
            borderWidth: 0
        }];
        chartCombClassificacao.update('active');
    }

    const legendClass = document.getElementById('comb-classif-legend');
    if (legendClass) {
        const totalClassGeral = classCombAtivas.reduce((s, c) => s + c.total, 0);
        legendClass.innerHTML = classCombAtivas.length === 0
            ? '<span class="empty-msg" style="font-size:0.78rem;">Sem abastecimentos no período</span>'
            : classCombAtivas.map((c, idx) => {
                const cor = classColors[idx % classColors.length];
                const perc = totalClassGeral > 0 ? ((c.total / totalClassGeral) * 100) : 0;
                return `
                <div style="display:flex; align-items:center; justify-content:space-between; font-size:0.8rem; padding:0.25rem 0.5rem; background:rgba(255,255,255,0.02); border-radius:4px;">
                    <div style="display:flex; align-items:center; gap:0.4rem;">
                        <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${cor};"></span>
                        <span style="color:var(--text); font-weight:600;">${c.label}</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:0.6rem;">
                        <span style="color:var(--text-muted); font-size:0.75rem;">${fmt(c.litros, 0)} L (${fmt(perc, 1)}%)</span>
                        <span style="color:#38bdf8; font-weight:700;">${fmtBRL(c.total)}</span>
                    </div>
                </div>`;
            }).join('');
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
                .filter(mv => (mv.tipo || '').toUpperCase() === 'SAIDA' && !isMovimentoEstoqueCancelado(mv) && String(mv.data || '').startsWith(m.anoMes))
                .reduce((s, mv) => s + ((parseFloat(mv.quantidade) || 0) * (parseFloat(mv.valor_unitario) || parseFloat(estMap[mv.item_id]?.valor_custo) || 0)), 0);

            const saiVend = vendasHist
                .filter(v => (v.status || '').toUpperCase() !== 'CANCELADA' && String(v.data || '').startsWith(m.anoMes))
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

// ============================================================
//  MODAL FULLSCREEN: RAIO-X DE CLASSIFICAÇÕES DA FROTA
// ============================================================

window.abrirModalClassificacoesFrota = function(foco = 'total') {
    const modal = document.getElementById('modalClassificacoesFrota');
    if (!modal) return;

    const veiculos = dadosBrutos.veiculos || [];
    const prestadores = dadosBrutos.prestadores || [];
    const statusCounts = getFrotaStatusCounts(veiculos);
    const prestAtivos = prestadores.filter(p => (p.status || '').toUpperCase() === 'ATIVO').length;

    // Atualizar Header do Modal
    const setTxt = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };
    setTxt('modal-hdr-rodando', statusCounts.alocados + prestAtivos);
    setTxt('modal-hdr-garagem', statusCounts.garagem);
    setTxt('modal-hdr-manut', statusCounts.emManut);
    setTxt('modal-hdr-patio', statusCounts.patio);
    setTxt('modal-total-geral-badge', `${statusCounts.total + prestAtivos} veículos (${statusCounts.total} frota + ${prestAtivos} agregados)`);

    // Atualizar Título de acordo com o foco
    const titleEl = document.getElementById('modalClassFrotaTitle');
    if (titleEl) {
        if (foco === 'alocados') {
            titleEl.textContent = 'Raio-X de Veículos em Operação (Rodando)';
        } else if (foco === 'status') {
            titleEl.textContent = 'Raio-X de Ocupação & Classificações da Frota';
        } else {
            titleEl.textContent = 'Raio-X de Classificações & Ocupação da Frota';
        }
    }

    // Mapa de Classificações
    const classMap = dadosBrutos.classificacoesFrotaMap || {};

    // Ordenação recomendada para os cards
    const ordem = ['PROPRIO', 'ESPECIAL', 'DIRETORIA', 'AGREGADOS', 'TERCEIRO', 'ALUGADO', 'OUTRO'];
    const chavesDisponiveis = Object.keys(classMap);
    const chavesOrdenadas = [
        ...ordem.filter(k => chavesDisponiveis.includes(k)),
        ...chavesDisponiveis.filter(k => !ordem.includes(k))
    ];

    const container = document.getElementById('modal-class-cards-container');
    if (container) {
        if (chavesOrdenadas.length === 0) {
            container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:3rem; color:#94a3b8;">Nenhum veículo cadastrado na frota.</div>';
        } else {
            container.innerHTML = chavesOrdenadas.map(k => {
                const item = classMap[k];
                if (!item || item.total === 0) return '';

                const percRodando = item.total > 0 ? Math.round((item.rodando / item.total) * 100) : 0;
                const percGaragem = item.total > 0 ? Math.round((item.garagem / item.total) * 100) : 0;
                const percManut = item.total > 0 ? Math.round((item.manut / item.total) * 100) : 0;
                const percPatio = item.total > 0 ? Math.max(0, 100 - percRodando - percGaragem - percManut) : 0;

                const isAgregado = item.origem === 'COMERCIAL';

                return `
                <div class="class-card" style="border-top:3px solid ${item.badgeColor};">
                    <div class="class-card-header">
                        <div class="class-card-title-wrap">
                            <div class="class-card-icon" style="background:${item.badgeColor}22; color:${item.badgeColor}; border:1px solid ${item.badgeColor}44;">
                                <i data-lucide="${item.icon}" style="width:20px;height:20px;"></i>
                            </div>
                            <div>
                                <h3 class="class-card-name">${item.label}</h3>
                                <span class="class-card-origin">${isAgregado ? '🤝 Módulo Comercial' : '🚗 Frota Própria (CASA)'}</span>
                            </div>
                        </div>
                        <span style="font-size:0.7rem; font-weight:800; padding:2px 8px; border-radius:6px; background:${item.badgeColor}18; color:${item.badgeColor}; border:1px solid ${item.badgeColor}33;">
                            ${item.key}
                        </span>
                    </div>

                    <div style="display:flex; align-items:baseline; justify-content:space-between; margin-top:0.2rem;">
                        <span class="class-card-total" style="color:${item.badgeColor};">${item.total}</span>
                        <span style="font-size:0.75rem; color:#94a3b8; font-weight:600;">
                            ${isAgregado ? 'Prestadores parceiros' : (item.total === 1 ? '1 veículo cadastrado' : `${item.total} veículos cadastrados`)}
                        </span>
                    </div>

                    <!-- Barra de distribuição de status -->
                    <div class="class-card-bar" title="Rodando: ${item.rodando} | Garagem: ${item.garagem} | Oficina: ${item.manut} | Pátio: ${item.patio}">
                        <div class="class-card-bar-seg" style="width:${percRodando}%; background:#10b981;" title="Rodando: ${item.rodando} (${percRodando}%)"></div>
                        <div class="class-card-bar-seg" style="width:${percGaragem}%; background:#f59e0b;" title="Garagem: ${item.garagem} (${percGaragem}%)"></div>
                        <div class="class-card-bar-seg" style="width:${percManut}%; background:#ef4444;" title="Manutenção: ${item.manut} (${percManut}%)"></div>
                        <div class="class-card-bar-seg" style="width:${percPatio}%; background:#64748b;" title="Pátio: ${item.patio} (${percPatio}%)"></div>
                    </div>

                    <!-- Chips de Status Quantitativos -->
                    <div class="class-status-chips">
                        <span class="status-chip chip-rodando" title="Veículos em operação rodando com condutor alocado">
                            <i data-lucide="play" style="width:11px;height:11px;"></i>
                            <span>${item.rodando} Rodando</span>
                        </span>
                        ${!isAgregado && item.garagem > 0 ? `
                        <span class="status-chip chip-garagem" title="Veículos recolhidos em garagem">
                            <i data-lucide="home" style="width:11px;height:11px;"></i>
                            <span>${item.garagem} Garagem</span>
                        </span>` : ''}
                        ${!isAgregado && item.manut > 0 ? `
                        <span class="status-chip chip-manut" title="Veículos parados em manutenção / oficina">
                            <i data-lucide="wrench" style="width:11px;height:11px;"></i>
                            <span>${item.manut} Oficina</span>
                        </span>` : ''}
                        ${!isAgregado && item.patio > 0 ? `
                        <span class="status-chip chip-patio" title="Veículos disponíveis no pátio para alocação">
                            <i data-lucide="parking-circle" style="width:11px;height:11px;"></i>
                            <span>${item.patio} Pátio</span>
                        </span>` : ''}
                    </div>
                </div>`;
            }).join('');
        }
    }

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    if (window.lucide) lucide.createIcons();
};

window.fecharModalClassificacoesFrota = function() {
    const modal = document.getElementById('modalClassificacoesFrota');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
};

window.fecharModalDetalheVeiculoFrota = function() {
    const modal = document.getElementById('modalDetalheVeiculoFrota');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
};

window.abrirDetalheVeiculoFrota = abrirDetalheVeiculoFrota;
window.switchModalDetalheTab = switchModalDetalheTab;
window.toggleCascataGrupo = toggleCascataGrupo;
window.toggleCascataSubgrupo = toggleCascataSubgrupo;
window.toggleExibirTodosVeiculosRanking = toggleExibirTodosVeiculosRanking;

// Fechar modais com ESC ou clique no backdrop
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        fecharModalClassificacoesFrota();
        fecharModalDetalheVeiculoFrota();
    }
});

document.addEventListener('click', (e) => {
    const modalClass = document.getElementById('modalClassificacoesFrota');
    if (modalClass && modalClass.classList.contains('active') && e.target === modalClass) {
        fecharModalClassificacoesFrota();
    }
    const modalDet = document.getElementById('modalDetalheVeiculoFrota');
    if (modalDet && modalDet.classList.contains('active') && e.target === modalDet) {
        fecharModalDetalheVeiculoFrota();
    }
});

// ============================================================
//  EXPANSÃO DINÂMICA DE SUBGRUPOS DE CENTROS DE CUSTO (COMPRAS)
// ============================================================

window.toggleSubCentrosCusto = function(safePaiId) {
    const wrapEl = document.getElementById(`wrap-filhos-${safePaiId}`);
    const btnEl = document.getElementById(`btn-toggle-${safePaiId}`);
    if (!wrapEl) return;

    const isOpen = wrapEl.classList.contains('open');
    if (isOpen) {
        wrapEl.classList.remove('open');
        if (btnEl) btnEl.classList.remove('active');
    } else {
        wrapEl.classList.add('open');
        if (btnEl) btnEl.classList.add('active');
    }
    if (window.lucide) lucide.createIcons();
};
