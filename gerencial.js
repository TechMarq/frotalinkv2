// ============================================================
//  gerencial.js — Painel Executivo | FrotaLink
//  Conecta a todos os módulos para gerar KPIs para o gestor.
// ============================================================

let sb = null;
let empresaId = null;
let dadosBrutos = {};

// Período selecionado
let periodoAtual = { tipo: 'mes', value: new Date().toISOString().slice(0, 7) };

// Gráficos Chart.js
let chartReceitaDespesa = null;
let chartDespesasCateg = null;
let chartFrotaStatus = null;

// ============================================================
//  INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    function esperarAuth(attempts = 0) {
        if (window.authClient && window.currentEmpresaId !== undefined) {
            sb = window.authClient;
            empresaId = window.currentEmpresaId;
            initGerencial();
        } else if (attempts < 40) {
            setTimeout(() => esperarAuth(attempts + 1), 200);
        } else {
            sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
            initGerencial();
        }
    }
    esperarAuth();

    document.getElementById('periodo-select')?.addEventListener('change', (e) => {
        periodoAtual.tipo = e.target.value;
        const mesWrap = document.getElementById('mes-picker-wrap');
        if (mesWrap) mesWrap.style.display = e.target.value === 'mes' ? 'flex' : 'none';
        carregarTodos();
    });

    document.getElementById('mes-picker')?.addEventListener('change', (e) => {
        periodoAtual.value = e.target.value;
        carregarTodos();
    });

    document.getElementById('btn-refresh')?.addEventListener('click', () => {
        const btn = document.getElementById('btn-refresh');
        if (btn) { btn.classList.add('spin'); setTimeout(() => btn.classList.remove('spin'), 800); }
        carregarTodos();
    });
});

async function initGerencial() {
    setInterval(atualizarRelogio, 1000);
    atualizarRelogio();

    // Esperar Chart.js
    function waitChart(cb, n = 0) {
        if (window.Chart) cb();
        else if (n < 30) setTimeout(() => waitChart(cb, n + 1), 200);
    }
    waitChart(() => {
        initCharts();
        carregarTodos();
    });

    if (window.lucide) lucide.createIcons();
}

// ============================================================
//  UTILITÁRIOS
// ============================================================

function fmt(val, decimais = 2) {
    return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: decimais, maximumFractionDigits: decimais }).format(val || 0);
}

function fmtBRL(val) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
}

function atualizarRelogio() {
    const el = document.getElementById('timestamp');
    if (el) el.textContent = 'Atualizado: ' + new Date().toLocaleString('pt-BR');
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
        case 'trimestre':
            const q = Math.floor(hoje.getMonth() / 3);
            inicio = new Date(hoje.getFullYear(), q * 3, 1);
            fim = new Date(hoje.getFullYear(), q * 3 + 3, 0);
            break;
        case 'semestre':
            const h = hoje.getMonth() < 6 ? 0 : 6;
            inicio = new Date(hoje.getFullYear(), h, 1);
            fim = new Date(hoje.getFullYear(), h + 6, 0);
            break;
        case 'ano':
            inicio = new Date(hoje.getFullYear(), 0, 1);
            fim = new Date(hoje.getFullYear(), 11, 31);
            break;
        default: // mes
            const [ano, mes] = (periodoAtual.value || hoje.toISOString().slice(0, 7)).split('-');
            inicio = new Date(parseInt(ano), parseInt(mes) - 1, 1);
            fim = new Date(parseInt(ano), parseInt(mes), 0);
    }
    return { inicio: inicio.toISOString().slice(0, 10), fim: fim.toISOString().slice(0, 10) };
}

function mostrarLoading(show) {
    const el = document.getElementById('loading-overlay');
    if (el) el.style.display = show ? 'flex' : 'none';
}

// ============================================================
//  CARREGAMENTO DE DADOS
// ============================================================

async function carregarTodos() {
    mostrarLoading(true);
    try {
        const { inicio, fim } = getIntervaloDatas();
        await Promise.allSettled([
            carregarFinanceiro(inicio, fim),
            carregarFrota(),
            carregarAbastecimento(inicio, fim),
            carregarManutencao(inicio, fim),
            carregarDP(),
            carregarEstoque(),
            carregarComercial(),
        ]);
        renderTodos();
    } catch (e) {
        console.error('[Gerencial] Erro geral:', e);
    } finally {
        mostrarLoading(false);
    }
}

async function carregarFinanceiro(inicio, fim) {
    try {
        const [{ data: lancamentos, error: e1 }, { data: contas, error: e2 }] = await Promise.all([
            sb.from('fin_lancamentos').select('tipo, valor_total, valor_pago, status, data_vencimento, data_pagamento, fin_plano_contas(nome)').order('data_vencimento', { ascending: false }).limit(2000),
            sb.from('fin_contas_bancarias').select('saldo_atual, nome'),
        ]);
        if (e1) console.warn('[fin_lancamentos]', e1.message);
        if (e2) console.warn('[fin_contas_bancarias]', e2.message);
        dadosBrutos.lancamentos = lancamentos || [];
        dadosBrutos.contas = contas || [];
        dadosBrutos.lancamentosPeriodo = (lancamentos || []).filter(l => {
            const ref = l.data_pagamento || l.data_vencimento;
            return ref && ref >= inicio && ref <= fim;
        });
        dadosBrutos.evolucaoMeses = calcularEvolucaoMeses(lancamentos || []);
    } catch (e) { console.warn('[Gerencial] Financeiro:', e); dadosBrutos.lancamentos = []; dadosBrutos.contas = []; dadosBrutos.lancamentosPeriodo = []; dadosBrutos.evolucaoMeses = []; }
}

function calcularEvolucaoMeses(lancamentos) {
    const meses = [];
    const hoje = new Date();
    for (let i = 5; i >= 0; i--) {
        const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
        const anoMes = d.toISOString().slice(0, 7);
        const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
        const pago = (l) => ['PAGO', 'PARCIAL'].includes(l.status);
        const val = (l) => l.valor_pago || l.valor_total || 0;
        const receita = lancamentos.filter(l => l.tipo === 'RECEBER' && pago(l) && (l.data_pagamento || '').startsWith(anoMes)).reduce((s, l) => s + val(l), 0);
        const despesa = lancamentos.filter(l => l.tipo === 'PAGAR' && pago(l) && (l.data_pagamento || '').startsWith(anoMes)).reduce((s, l) => s + val(l), 0);
        meses.push({ label, anoMes, receita, despesa, resultado: receita - despesa });
    }
    return meses;
}

async function carregarFrota() {
    try {
        const [{ data: veiculos }, { data: alocacoes }] = await Promise.all([
            sb.from('veiculos').select('id, placa, modelo, status'),
            sb.from('alocacoes').select('id, veiculo_id').is('data_fim', null),
        ]);
        dadosBrutos.veiculos = veiculos || [];
        dadosBrutos.alocacoes = alocacoes || [];
    } catch (e) { console.warn('[Gerencial] Frota:', e); dadosBrutos.veiculos = []; dadosBrutos.alocacoes = []; }
}

async function carregarAbastecimento(inicio, fim) {
    try {
        const { data } = await sb.from('abastecimentos').select('valor_total, litros, km_atual, tipo_combustivel').gte('data', inicio).lte('data', fim + 'T23:59:59');
        dadosBrutos.abastecimentos = data || [];
    } catch (e) { console.warn('[Gerencial] Abastecimento:', e); dadosBrutos.abastecimentos = []; }
}

async function carregarManutencao(inicio, fim) {
    try {
        const [{ data: manut }, { data: pendentes }] = await Promise.all([
            sb.from('manutencoes').select('valor_total, tipo_manutencao, status').gte('data', inicio).lte('data', fim),
            sb.from('manutencoes').select('id, status').eq('status', 'PENDENTE'),
        ]);
        dadosBrutos.manutencoes = manut || [];
        dadosBrutos.manutPendentes = pendentes || [];
    } catch (e) { console.warn('[Gerencial] Manutenção:', e); dadosBrutos.manutencoes = []; dadosBrutos.manutPendentes = []; }
}

async function carregarDP() {
    try {
        const filtro = empresaId ? { empresa_id: empresaId } : {};
        const [{ data: funcs }, { data: asos }] = await Promise.all([
            sb.from('dp_funcionarios').select('id, nome_completo, status, salario, data_nascimento').eq('status', 'ATIVO').match(filtro),
            sb.from('dp_asos').select('id, data_vencimento').match(filtro),
        ]);
        dadosBrutos.funcionarios = funcs || [];
        dadosBrutos.asos = asos || [];
    } catch (e) { console.warn('[Gerencial] DP:', e); dadosBrutos.funcionarios = []; dadosBrutos.asos = []; }
}

async function carregarEstoque() {
    try {
        const { data } = await sb.from('estoque').select('id, nome, estoque_atual, estoque_minimo, valor_custo, status').eq('status', 'ATIVO');
        dadosBrutos.estoque = data || [];
    } catch (e) { console.warn('[Gerencial] Estoque:', e); dadosBrutos.estoque = []; }
}

async function carregarComercial() {
    try {
        const { data } = await sb.from('com_contratos').select('id, cliente_nome, valor_contrato, data_vencimento, com_status(nome)');
        dadosBrutos.contratos = data || [];
    } catch (e) { console.warn('[Gerencial] Comercial:', e); dadosBrutos.contratos = []; }
}

// ============================================================
//  RENDERIZAÇÃO
// ============================================================

function renderTodos() {
    renderFinanceiro();
    renderFrota();
    renderAbastecimento();
    renderManutencao();
    renderDP();
    renderEstoque();
    renderComercial();
    renderAlertas();
    atualizarGraficos();
    if (window.lucide) lucide.createIcons();
}

function renderFinanceiro() {
    const lp = dadosBrutos.lancamentosPeriodo || [];
    const lancamentos = dadosBrutos.lancamentos || [];
    const contas = dadosBrutos.contas || [];
    const pago = (l) => ['PAGO', 'PARCIAL'].includes(l.status);
    const val = (l) => l.valor_pago || l.valor_total || 0;

    const receita = lp.filter(l => l.tipo === 'RECEBER' && pago(l)).reduce((s, l) => s + val(l), 0);
    const despesa = lp.filter(l => l.tipo === 'PAGAR' && pago(l)).reduce((s, l) => s + val(l), 0);
    const resultado = receita - despesa;
    const saldoCaixa = contas.reduce((s, c) => s + (c.saldo_atual || 0), 0);

    const hoje = new Date().toISOString().slice(0, 10);
    const contasAtrasadas = lancamentos.filter(l => ['ATRASADO'].includes(l.status) || (l.status === 'ABERTO' && l.data_vencimento < hoje)).length;
    const aVencer7 = lancamentos.filter(l => l.tipo === 'PAGAR' && l.status === 'ABERTO' && l.data_vencimento >= hoje && l.data_vencimento <= dataAddDias(hoje, 7)).length;
    const aReceber30 = lancamentos.filter(l => l.tipo === 'RECEBER' && l.status === 'ABERTO' && l.data_vencimento >= hoje && l.data_vencimento <= dataAddDias(hoje, 30)).reduce((s, l) => s + val(l), 0);

    setKPI('kpi-receita', fmtBRL(receita));
    setKPI('kpi-despesa', fmtBRL(despesa));
    setKPI('kpi-saldo-caixa', fmtBRL(saldoCaixa));
    setKPI('kpi-contas-atrasadas', contasAtrasadas);
    setKPI('kpi-a-vencer', aVencer7);
    setKPI('kpi-a-receber', fmtBRL(aReceber30));

    const resEl = document.getElementById('kpi-resultado');
    if (resEl) {
        resEl.textContent = fmtBRL(resultado);
        resEl.style.color = resultado >= 0 ? 'var(--success)' : 'var(--danger)';
        const card = resEl.closest('.kpi-card');
        if (card) card.style.borderColor = resultado >= 0 ? 'rgba(16,185,129,0.35)' : 'rgba(239,68,68,0.35)';
    }

    const contasListEl = document.getElementById('contas-bancarias-list');
    if (contasListEl) {
        contasListEl.innerHTML = contas.map(c => `
            <div class="conta-item">
                <span class="conta-nome"><i data-lucide="landmark" style="width:14px;height:14px;opacity:0.6;"></i> ${c.nome}</span>
                <span class="conta-saldo ${(c.saldo_atual || 0) < 0 ? 'neg' : 'pos'}">${fmtBRL(c.saldo_atual)}</span>
            </div>`).join('') || '<p class="empty-msg">Nenhuma conta bancária cadastrada</p>';
    }
}

function renderFrota() {
    const veiculos = dadosBrutos.veiculos || [];
    const alocacoes = dadosBrutos.alocacoes || [];
    const total = veiculos.length;
    const alocados = alocacoes.length;
    const disponiveis = Math.max(0, total - alocados);
    const perc = total > 0 ? Math.round((alocados / total) * 100) : 0;

    setKPI('kpi-frota-total', total);
    setKPI('kpi-frota-alocados', alocados);
    setKPI('kpi-frota-disponiveis', disponiveis);
    setKPI('kpi-frota-utilizacao', perc + '%');
    const bar = document.getElementById('frota-progress-bar');
    if (bar) {
        bar.style.width = perc + '%';
        bar.style.background = perc > 85 ? '#ef4444' : perc > 60 ? '#f59e0b' : '#10b981';
    }
}

function renderAbastecimento() {
    const abs = dadosBrutos.abastecimentos || [];
    const totalGasto = abs.reduce((s, a) => s + (a.valor_total || 0), 0);
    const totalLitros = abs.reduce((s, a) => s + (a.litros || 0), 0);
    const mediaPreco = totalLitros > 0 ? totalGasto / totalLitros : 0;
    setKPI('kpi-comb-gasto', fmtBRL(totalGasto));
    setKPI('kpi-comb-litros', fmt(totalLitros, 0) + ' L');
    setKPI('kpi-comb-preco-medio', 'R$ ' + fmt(mediaPreco, 3) + '/L');
    setKPI('kpi-comb-abastecimentos', abs.length + ' registros');
}

function renderManutencao() {
    const man = dadosBrutos.manutencoes || [];
    const pendentes = dadosBrutos.manutPendentes || [];
    const totalGasto = man.reduce((s, m) => s + (m.valor_total || 0), 0);
    const preventivas = man.filter(m => m.tipo_manutencao === 'PREVENTIVA').length;
    const corretivas = man.filter(m => m.tipo_manutencao === 'CORRETIVA').length;
    setKPI('kpi-manut-gasto', fmtBRL(totalGasto));
    setKPI('kpi-manut-total', man.length);
    setKPI('kpi-manut-pendentes', pendentes.length);
    setKPI('kpi-manut-preventivas', preventivas);
    setKPI('kpi-manut-corretivas', corretivas);
}

function renderDP() {
    const funcs = dadosBrutos.funcionarios || [];
    const asos = dadosBrutos.asos || [];
    const folha = funcs.reduce((s, f) => s + (f.salario || 0), 0);
    const hoje = new Date().toISOString().slice(0, 10);
    const em30 = dataAddDias(hoje, 30);
    const asoVencendo = asos.filter(a => a.data_vencimento && a.data_vencimento >= hoje && a.data_vencimento <= em30).length;
    const asoVencido = asos.filter(a => a.data_vencimento && a.data_vencimento < hoje).length;
    const mesAtual = new Date().getMonth() + 1;
    const anivers = funcs.filter(f => f.data_nascimento && parseInt(f.data_nascimento.slice(5, 7)) === mesAtual);

    setKPI('kpi-dp-funcionarios', funcs.length);
    setKPI('kpi-dp-folha', fmtBRL(folha));
    setKPI('kpi-dp-aso-vencendo', asoVencendo);
    setKPI('kpi-dp-aso-vencido', asoVencido);
    setKPI('kpi-dp-aniversariantes', anivers.length);

    const aniEl = document.getElementById('aniversariantes-list');
    if (aniEl) {
        const hoje_dia = new Date().getDate();
        aniEl.innerHTML = anivers.sort((a, b) => parseInt(a.data_nascimento.slice(8)) - parseInt(b.data_nascimento.slice(8))).slice(0, 5).map(f => {
            const dia = f.data_nascimento.slice(8, 10);
            const isToday = parseInt(dia) === hoje_dia;
            return `<div class="ani-item ${isToday ? 'today' : ''}">
                <span class="ani-nome">${isToday ? '🎂 ' : ''}${f.nome_completo}</span>
                <span class="ani-data">${dia}/${String(mesAtual).padStart(2, '0')}</span>
            </div>`;
        }).join('') || '<p class="empty-msg">Nenhum aniversariante este mês</p>';
    }
}

function renderEstoque() {
    const estoque = dadosBrutos.estoque || [];
    const abaixo = estoque.filter(e => (e.estoque_atual || 0) < (e.estoque_minimo || 0));
    const valorTotal = estoque.reduce((s, e) => s + ((e.estoque_atual || 0) * (e.valor_custo || 0)), 0);
    setKPI('kpi-estoque-total', estoque.length + ' itens');
    setKPI('kpi-estoque-alertas', abaixo.length);
    setKPI('kpi-estoque-valor', fmtBRL(valorTotal));

    const listEl = document.getElementById('estoque-critico-list');
    if (listEl) {
        listEl.innerHTML = abaixo.slice(0, 5).map(e => `
            <div class="estoque-item-critico">
                <span class="item-nome">${e.nome}</span>
                <span class="item-saldo danger">${e.estoque_atual || 0} / ${e.estoque_minimo || 0} mín</span>
            </div>`).join('') || '<p class="empty-msg ok">✓ Todos os itens com estoque adequado</p>';
    }
}

function renderComercial() {
    const contratos = dadosBrutos.contratos || [];
    const ativos = contratos.filter(c => c.com_status?.nome === 'ATIVO');
    const valorAtivos = ativos.reduce((s, c) => s + (c.valor_contrato || 0), 0);
    const hoje = new Date().toISOString().slice(0, 10);
    const vencendo = ativos.filter(c => c.data_vencimento && c.data_vencimento >= hoje && c.data_vencimento <= dataAddDias(hoje, 30)).length;
    const vencidos = contratos.filter(c => c.data_vencimento && c.data_vencimento < hoje && c.com_status?.nome !== 'CANCELADO').length;
    setKPI('kpi-comercial-ativos', ativos.length);
    setKPI('kpi-comercial-valor', fmtBRL(valorAtivos));
    setKPI('kpi-comercial-vencendo', vencendo);
    setKPI('kpi-comercial-vencidos', vencidos);
}

function renderAlertas() {
    const lancamentos = dadosBrutos.lancamentos || [];
    const hoje = new Date().toISOString().slice(0, 10);
    const alertas = [];

    const atrasadas = lancamentos.filter(l => l.status === 'ATRASADO' || (l.status === 'ABERTO' && l.data_vencimento < hoje));
    if (atrasadas.length) alertas.push({ tipo: 'danger', icon: 'alert-circle', msg: `${atrasadas.length} conta(s) em atraso no financeiro`, link: 'financeiro.html' });

    const aVencer = lancamentos.filter(l => l.tipo === 'PAGAR' && l.status === 'ABERTO' && l.data_vencimento >= hoje && l.data_vencimento <= dataAddDias(hoje, 7));
    if (aVencer.length) alertas.push({ tipo: 'warn', icon: 'clock', msg: `${aVencer.length} conta(s) a pagar vencem em 7 dias`, link: 'financeiro.html' });

    const asoVencidos = (dadosBrutos.asos || []).filter(a => a.data_vencimento && a.data_vencimento < hoje).length;
    if (asoVencidos) alertas.push({ tipo: 'danger', icon: 'user-x', msg: `${asoVencidos} ASO(s) vencido(s) — regularize imediatamente`, link: 'dp.html' });

    const estoqueBaixo = (dadosBrutos.estoque || []).filter(e => (e.estoque_atual || 0) < (e.estoque_minimo || 0)).length;
    if (estoqueBaixo) alertas.push({ tipo: 'warn', icon: 'package-open', msg: `${estoqueBaixo} item(ns) de estoque abaixo do mínimo`, link: 'estoque.html' });

    const manutPend = (dadosBrutos.manutPendentes || []).length;
    if (manutPend) alertas.push({ tipo: 'info', icon: 'wrench', msg: `${manutPend} manutenção(ões) pendente(s) na frota`, link: 'manutencao.html' });

    const comercVenc = (dadosBrutos.contratos || []).filter(c => c.data_vencimento && c.data_vencimento >= hoje && c.data_vencimento <= dataAddDias(hoje, 30) && c.com_status?.nome === 'ATIVO').length;
    if (comercVenc) alertas.push({ tipo: 'info', icon: 'briefcase', msg: `${comercVenc} contrato(s) comercial(is) vencem em 30 dias`, link: 'comercial.html' });

    const alertEl = document.getElementById('alertas-list');
    if (alertEl) {
        alertEl.innerHTML = alertas.length === 0
            ? '<div class="alerta-item alerta-ok"><i data-lucide="shield-check"></i><span>Nenhum alerta crítico no momento — empresa em boa saúde!</span></div>'
            : alertas.map(a => `<a href="${a.link}" class="alerta-item alerta-${a.tipo}"><i data-lucide="${a.icon}"></i><span>${a.msg}</span><i data-lucide="chevron-right" style="margin-left:auto;opacity:0.5;width:16px;"></i></a>`).join('');
        if (window.lucide) lucide.createIcons();
    }
}

// ============================================================
//  GRÁFICOS
// ============================================================

function initCharts() {
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = 'Inter';

    const axisStyle = {
        ticks: { color: '#64748b', font: { size: 11 } },
        grid: { color: 'rgba(255,255,255,0.04)' },
        border: { dash: [4, 4] }
    };

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
                    legend: { labels: { padding: 20, usePointStyle: true, pointStyle: 'circle', font: { size: 12 } } },
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
                    legend: { position: 'right', labels: { padding: 18, usePointStyle: true, font: { size: 11 } } },
                    tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${fmtBRL(ctx.parsed)}` } }
                },
                cutout: '65%',
            }
        });
    }

    const ctx3 = document.getElementById('chart-frota-status');
    if (ctx3) {
        if (chartFrotaStatus) chartFrotaStatus.destroy();
        chartFrotaStatus = new Chart(ctx3, {
            type: 'doughnut',
            data: { labels: [], datasets: [] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true, font: { size: 11 } } } },
                cutout: '60%'
            }
        });
    }
}

function atualizarGraficos() {
    // Evolução financeira
    const evolucao = dadosBrutos.evolucaoMenses || dadosBrutos.evolucaoMeses || [];
    if (chartReceitaDespesa) {
        chartReceitaDespesa.data.labels = evolucao.map(m => m.label);
        chartReceitaDespesa.data.datasets = [
            { label: 'Receitas', data: evolucao.map(m => m.receita), backgroundColor: 'rgba(16,185,129,0.75)', borderColor: '#10b981', borderWidth: 2, borderRadius: 6 },
            { label: 'Despesas', data: evolucao.map(m => m.despesa), backgroundColor: 'rgba(239,68,68,0.75)', borderColor: '#ef4444', borderWidth: 2, borderRadius: 6 },
            { label: 'Resultado', data: evolucao.map(m => m.resultado), type: 'line', borderColor: '#818cf8', backgroundColor: 'rgba(129,140,248,0.08)', borderWidth: 2.5, tension: 0.4, pointRadius: 5, pointBackgroundColor: '#818cf8', fill: true }
        ];
        chartReceitaDespesa.update('active');
    }

    // Despesas por categoria
    const lancamentos = dadosBrutos.lancamentos || [];
    const porCateg = {};
    lancamentos.filter(l => l.tipo === 'PAGAR' && ['PAGO', 'PARCIAL'].includes(l.status)).forEach(l => {
        const cat = l.fin_plano_contas?.nome || 'Outros';
        porCateg[cat] = (porCateg[cat] || 0) + (l.valor_pago || l.valor_total || 0);
    });
    const categSorted = Object.entries(porCateg).sort(([, a], [, b]) => b - a).slice(0, 7);
    if (chartDespesasCateg) {
        const colors = ['#ef4444', '#f97316', '#eab308', '#8b5cf6', '#06b6d4', '#10b981', '#6366f1'];
        chartDespesasCateg.data.labels = categSorted.map(([k]) => k);
        chartDespesasCateg.data.datasets = [{ data: categSorted.map(([, v]) => v), backgroundColor: colors.slice(0, categSorted.length), borderWidth: 0, hoverOffset: 10 }];
        chartDespesasCateg.update('active');
    }

    // Frota: alocados vs disponíveis
    const total = (dadosBrutos.veiculos || []).length;
    const alocados = (dadosBrutos.alocacoes || []).length;
    if (chartFrotaStatus) {
        chartFrotaStatus.data.labels = ['Alocados', 'Disponíveis'];
        chartFrotaStatus.data.datasets = [{ data: [alocados, Math.max(0, total - alocados)], backgroundColor: ['#6366f1', 'rgba(99,102,241,0.2)'], borderWidth: 0, hoverOffset: 8 }];
        chartFrotaStatus.update('active');
    }
}
