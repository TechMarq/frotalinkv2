/**
 * 💰 Módulo Financeiro FrotaLink
 * Gestão de Contas a Pagar, Receber, Fluxo de Caixa e DRE
 */

// --- Configuração Supabase (Reutilizando do app.js) ---
let supabaseClient = null;

// --- Estado Global ---
const state = {
    lancamentos: [],
    contas: [],
    categorias: [],
    centrosCusto: [],
    fornecedores: [],
    clientes: [],
    formasPagamento: [],
    periodoFluxo: new Date(),
    filtros: {
        PAGAR: { status: '', busca: '', categoria: '' },
        RECEBER: { status: '', busca: '', categoria: '' }
    },
    sort: {
        PAGAR: { key: 'data_vencimento', dir: 'asc' },
        RECEBER: { key: 'data_vencimento', dir: 'asc' }
    },
    adminMode: true,
    importedXmlCnpj: ""
};

// --- Inicialização ---
document.addEventListener('DOMContentLoaded', async () => {
    initSupabase();
    await loadInitialData();
    renderAll();
    setupEventListeners();
    setupSearchableInputs();
    if (window.lucide) lucide.createIcons();
});

function setupSearchableInputs() {
    const input = document.getElementById('entryCategoriaName');
    const hidden = document.getElementById('entryCategoriaId');
    if (input && hidden) {
        input.addEventListener('input', () => {
            const val = input.value;
            const match = state.categorias.find(c => `${c.codigo} - ${c.nome}` === val);
            hidden.value = match ? match.id : '';
        });
    }
}

function initSupabase() {
    try {
        if (typeof supabase !== 'undefined') {
            supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
            console.log('Financeiro: Supabase ok');
        }
    } catch (e) {
        console.error('Erro Supabase:', e);
    }
}

async function loadInitialData() {
    if (!supabaseClient) return;

    try {
        const fetchClientesSafely = async () => {
            try {
                const { data, error } = await supabaseClient.from('clientes').select('*').order('nome');
                if (error) throw error;
                return { data };
            } catch (err) {
                console.warn('Erro ao carregar tabela clientes, tentando com_contratos:', err);
                try {
                    const { data, error } = await supabaseClient.from('com_contratos').select('*').order('cliente_nome');
                    if (error) throw error;
                    return {
                        data: (data || []).map(item => ({
                            id: item.id,
                            nome: item.cliente_nome,
                            cnpj_cpf: item.cliente_cnpj_cpf,
                            email: item.cliente_email,
                            contato: item.cliente_telefone
                        }))
                    };
                } catch (e2) {
                    return { data: [] };
                }
            }
        };

        const [l, c, cat, cc, forn, cl, formas] = await Promise.all([
            supabaseClient.from('fin_lancamentos').select('*'),
            supabaseClient.from('fin_contas_bancarias').select('*'),
            supabaseClient.from('fin_plano_contas').select('*').order('codigo'),
            supabaseClient.from('fin_centros_custo').select('*').order('codigo'),
            supabaseClient.from('fornecedores').select('*').order('nome'),
            fetchClientesSafely(),
            supabaseClient.from('formas_pagamento').select('*').order('nome')
        ]);

        state.lancamentos = l.data || [];
        state.contas = c.data || [];
        state.categorias = cat.data || [];
        state.centrosCusto = cc.data || [];
        state.fornecedores = forn.data || [];
        state.clientes = (cl.data || []).map(item => ({
            id: item.id,
            nome: item.nome || item.cliente_nome,
            cnpj_cpf: item.cnpj_cpf || item.cliente_cnpj_cpf,
            email: item.email || item.cliente_email,
            contato: item.contato || item.cliente_telefone
        }));
        state.formasPagamento = formas.data || [];

        updateDropdowns();
        renderAll();
    } catch (err) {
        console.error('Erro ao carregar dados:', err);
    }
}

// --- Navegação ---
function switchMainTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.tab-item').forEach(b => b.classList.remove('active'));

    document.getElementById(`tab-${tabId}`).classList.add('active');
    event.currentTarget.classList.add('active');

    if (tabId === 'fluxo') renderFluxo();
    if (tabId === 'dre') renderDRE();
    if (tabId === 'conciliacao') renderConciliacao();
}

function toggleAdminMode(tipo) {
    // Modo edição removido. As opções de ação agora estão sempre visíveis.
    console.log("Modo edição unificado.");
}

// --- Renderização de Listas ---
function renderAll() {
    renderLancamentos('PAGAR');
    renderLancamentos('RECEBER');
    renderDashboard();
    renderConfig();
}

function renderLancamentos(tipo) {
    const tbody = document.getElementById(`tbody-${tipo.toLowerCase()}`);
    if (!tbody) return;

    // Reset master checkbox
    const masterChk = document.getElementById(`chkAll${tipo === 'PAGAR' ? 'Pagar' : 'Receber'}`);
    if (masterChk) masterChk.checked = false;

    // 1. Filter & Sort
    const filter = state.filtros[tipo];
    const sort = state.sort[tipo];

    let filtered = state.lancamentos.filter(l => l.tipo === tipo);

    if (filter.status) {
        if (filter.status === 'ATRASADO') {
            const hoje = new Date();
            hoje.setHours(0, 0, 0, 0);
            filtered = filtered.filter(l => {
                const dataVenc = new Date((l.data_vencimento || l.previsao_pagamento || l.data_emissao) + 'T00:00:00');
                return dataVenc < hoje && l.status === 'ABERTO';
            });
        } else {
            filtered = filtered.filter(l => l.status === filter.status);
        }
    }
    if (filter.categoria) filtered = filtered.filter(l => l.centro_custo_id === filter.categoria);
    if (filter.busca) {
        const b = filter.busca.toLowerCase();
        filtered = filtered.filter(l =>
            l.descricao.toLowerCase().includes(b) ||
            (l.entidade_nome || '').toLowerCase().includes(b)
        );
    }

    filtered.sort((a, b) => {
        let vA = a[sort.key], vB = b[sort.key];
        if (sort.key.includes('data')) { vA = new Date(vA || 0); vB = new Date(vB || 0); }
        if (sort.key === 'valor_total' || sort.key === 'valor_pago') { vA = parseFloat(vA) || 0; vB = parseFloat(vB) || 0; }
        if (vA < vB) return sort.dir === 'asc' ? -1 : 1;
        if (vA > vB) return sort.dir === 'asc' ? 1 : -1;
        return 0;
    });

    // 2. Render Table
    tbody.innerHTML = filtered.map(l => {
        const cat = state.categorias.find(c => c.id === l.categoria_id);
        const cc = state.centrosCusto.find(c => c.id === l.centro_custo_id);
        
        // Lógica de Vencimento
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const dataVenc = new Date((l.data_vencimento || l.previsao_pagamento || l.data_emissao) + 'T00:00:00');
        const isOverdue = dataVenc < hoje && l.status === 'ABERTO';
        
        let displayStatus = l.status;
        let statusClass = `status-${l.status.toLowerCase()}`;
        
        if (isOverdue) {
            displayStatus = 'ATRASADO';
            statusClass = 'status-atrasado';
        }

        if (tipo === 'RECEBER') {
            const vBruto = parseFloat(l.valor_total) || 0;
            const vTributo = parseFloat(l.valor_tributo_total) || 0;
            const vLiquido = vBruto - vTributo;
            const competencia = l.data_competencia ? l.data_competencia.substring(0, 7) : '-';

            return `
                <tr class="${isOverdue ? 'overdue-row' : ''}">
                    <td style="text-align: center; vertical-align: middle;">
                        <input type="checkbox" class="chk-bulk-select" value="${l.id}" onchange="updateBulkActionBar('${tipo}')">
                    </td>
                    <td data-label="Código">
                        <div style="font-weight:800; color:var(--primary); font-family:'JetBrains Mono'">${l.codigo_sequencial || '-'}</div>
                    </td>
                    <td data-label="Previsão">
                        <div style="font-weight:700">${formatDate(l.previsao_pagamento || l.data_vencimento)}</div>
                    </td>
                    <td data-label="Cliente">
                        <div style="font-weight:600">${l.entidade_nome || '-'}</div>
                    </td>
                    <td data-label="Descrição">
                        <div style="font-size:0.85rem">${l.descricao}</div>
                    </td>
                    <td data-label="Vlr. Bruto" style="text-align:right; font-weight:700">${formatCurrency(vBruto)}</td>
                    <td data-label="Vlr. Líquido" style="text-align:right; color:#10b981; font-weight:700">${formatCurrency(vLiquido)}</td>
                    <td data-label="Status">
                        <span class="status-badge ${statusClass}">${displayStatus}</span>
                    </td>
                    <td data-label="Competência">${competencia}</td>
                    <td class="actions-cell">
                        <div style="display:flex; justify-content:center; gap:0.4rem">
                            <button class="btn-action view" onclick="viewEntry('${l.id}')" title="Visualizar"><i data-lucide="eye"></i></button>
                            ${l.status !== 'PAGO' ? `<button class="btn-action pay" onclick="openPaymentModal('${l.id}')" title="Baixar/Receber"><i data-lucide="check-square"></i></button>` : ''}
                            <button class="btn-action edit" onclick="editEntry('${l.id}', '${tipo}')" title="Editar"><i data-lucide="edit-2"></i></button>
                            <button class="btn-action delete" onclick="deleteEntry('${l.id}')" title="Excluir"><i data-lucide="trash-2"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        }

        return `
            <tr class="${isOverdue ? 'overdue-row' : ''}">
                <td style="text-align: center; vertical-align: middle;">
                    <input type="checkbox" class="chk-bulk-select" value="${l.id}" onchange="updateBulkActionBar('${tipo}')">
                </td>
                <td data-label="Código">
                    <div style="font-weight:800; color:var(--primary); font-family:'JetBrains Mono'">${l.codigo_sequencial || '-'}</div>
                </td>
                <td data-label="Vencimento">
                    <div style="font-weight:700">${formatDate(l.data_vencimento)}</div>
                    ${l.data_pagamento ? `<div style="font-size:0.65rem; color:var(--success)">Pago: ${formatDate(l.data_pagamento)}</div>` : ''}
                </td>
                <td data-label="Entidade">
                    <div style="font-weight:600">${l.entidade_nome || '-'}</div>
                    <div style="font-size:0.7rem; color:var(--text-muted)">${l.recorrencia !== 'NAO' ? '<i data-lucide="repeat" style="width:10px"></i> Recorrência' : ''}</div>
                </td>
                <td data-label="Descrição">
                    <div>${l.descricao}</div>
                </td>
                <td data-label="Total" style="text-align:right; font-weight:700">${formatCurrency(l.valor_total)}</td>
                <td data-label="Pago" style="text-align:right; color:var(--success)">${formatCurrency(l.valor_pago)}</td>
                <td data-label="Status">
                    <span class="status-badge ${statusClass}">${displayStatus}</span>
                </td>
                <td data-label="C. Custo">${cc ? cc.nome : '-'}</td>
                <td class="actions-cell">
                    <div style="display:flex; justify-content:center; gap:0.4rem">
                        <button class="btn-action view" onclick="viewEntry('${l.id}')" title="Visualizar"><i data-lucide="eye"></i></button>
                        ${l.status !== 'PAGO' ? `<button class="btn-action pay" onclick="openPaymentModal('${l.id}')" title="Baixar/Pagar"><i data-lucide="check-square"></i></button>` : ''}
                        
                        <button class="btn-action edit" onclick="editEntry('${l.id}', '${tipo}')" title="Editar"><i data-lucide="edit-2"></i></button>
                        <button class="btn-action duplicate" onclick="duplicateEntry('${l.id}')" title="Duplicar"><i data-lucide="copy"></i></button>
                        <button class="btn-action delete" onclick="deleteEntry('${l.id}')" title="Excluir"><i data-lucide="trash-2"></i></button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    if (window.lucide) lucide.createIcons();
    renderDashboardPagar();
    renderDashboardReceber();
    updateBulkActionBar(tipo);
}

// --- Dashboard Logic ---
function renderDashboard() {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const monthEntries = state.lancamentos.filter(l => {
        if (!l.data_vencimento) return false;
        const d = new Date(l.data_vencimento + 'T12:00:00');
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    const totalPagar = monthEntries.filter(l => l.tipo === 'PAGAR' && l.status !== 'CANCELADO').reduce((acc, l) => acc + (parseFloat(l.valor_total) || 0), 0);
    const totalReceber = monthEntries.filter(l => l.tipo === 'RECEBER' && l.status !== 'CANCELADO').reduce((acc, l) => acc + (parseFloat(l.valor_total) || 0), 0);
    const saldoTotal = state.contas.reduce((acc, c) => acc + (parseFloat(c.saldo_atual) || 0), 0);

    // Previsto 30 dias: saldo atual + a receber (próximos 30 dias) - a pagar (próximos 30 dias) em aberto
    const trintaDias = new Date();
    trintaDias.setDate(now.getDate() + 30);
    const entries30d = state.lancamentos.filter(l => {
        if (!l.data_vencimento || l.status === 'PAGO' || l.status === 'CANCELADO') return false;
        const d = new Date(l.data_vencimento + 'T12:00:00');
        return d >= now && d <= trintaDias;
    });
    const receber30d = entries30d.filter(l => l.tipo === 'RECEBER').reduce((acc, l) => acc + (parseFloat(l.valor_total) || 0), 0);
    const pagar30d = entries30d.filter(l => l.tipo === 'PAGAR').reduce((acc, l) => acc + (parseFloat(l.valor_total) || 0), 0);
    const kpiPrevistoVal = saldoTotal + receber30d - pagar30d;

    document.getElementById('kpi-pagar').innerText = formatCurrency(totalPagar);
    document.getElementById('kpi-receber').innerText = formatCurrency(totalReceber);
    document.getElementById('kpi-saldo').innerText = formatCurrency(saldoTotal);
    document.getElementById('kpi-previsto').innerText = formatCurrency(kpiPrevistoVal);

    initCharts();
}

let cashflowChart = null;
let categoryChart = null;

function initCharts() {
    // 1. Chart: Cashflow (Entradas vs Saídas últimos 12 meses)
    const ctx = document.getElementById('cashflowChart');
    if (ctx) {
        if (cashflowChart) cashflowChart.destroy();

        // Calcular últimos 12 meses
        const labels = [];
        const dataIn = [];
        const dataOut = [];
        const now = new Date();

        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            labels.push(getMonthName(d.getMonth()) + '/' + d.getFullYear().toString().substring(2));
            
            const entries = state.lancamentos.filter(l => {
                if (!l.data_vencimento || l.status === 'CANCELADO') return false;
                const entryDate = new Date(l.data_vencimento + 'T12:00:00');
                return entryDate.getMonth() === d.getMonth() && entryDate.getFullYear() === d.getFullYear();
            });

            const totalIn = entries.filter(l => l.tipo === 'RECEBER').reduce((acc, l) => acc + (parseFloat(l.valor_total) || 0), 0);
            const totalOut = entries.filter(l => l.tipo === 'PAGAR').reduce((acc, l) => acc + (parseFloat(l.valor_total) || 0), 0);
            
            dataIn.push(totalIn);
            dataOut.push(totalOut);
        }

        cashflowChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: 'Entradas', data: dataIn, backgroundColor: '#10b981', borderRadius: 6 },
                    { label: 'Saídas', data: dataOut, backgroundColor: '#ef4444', borderRadius: 6 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                    x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
                },
                plugins: {
                    legend: { labels: { color: '#94a3b8', font: { family: 'Inter' } } }
                }
            }
        });
    }

    // 2. Chart: Despesas por Categoria (Doughnut)
    const ctxCat = document.getElementById('categoryChart');
    if (ctxCat) {
        if (categoryChart) categoryChart.destroy();

        // Filtrar despesas pagar ativas do ano corrente
        const currentYear = new Date().getFullYear();
        const despesasAno = state.lancamentos.filter(l => {
            if (l.tipo !== 'PAGAR' || l.status === 'CANCELADO' || !l.data_vencimento) return false;
            return new Date(l.data_vencimento + 'T12:00:00').getFullYear() === currentYear;
        });

        // Agrupar por categoria
        const categoryTotals = {};
        despesasAno.forEach(l => {
            const cat = state.categorias.find(c => c.id === l.categoria_id);
            const catName = cat ? cat.nome : 'Outras / Geral';
            categoryTotals[catName] = (categoryTotals[catName] || 0) + (parseFloat(l.valor_total) || 0);
        });

        const labels = Object.keys(categoryTotals);
        const data = Object.values(categoryTotals);

        // Palette harmoniosa e premium
        const colors = [
            '#6366f1', '#10b981', '#f59e0b', '#ec4899', 
            '#3b82f6', '#ef4444', '#8b5cf6', '#06b6d4', 
            '#84cc16', '#14b8a6', '#f43f5e', '#a855f7'
        ];

        categoryChart = new Chart(ctxCat, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: colors.slice(0, labels.length),
                    borderWidth: 1,
                    borderColor: 'rgba(30, 41, 59, 0.8)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 } }
                    }
                },
                cutout: '70%'
            }
        });
    }
}

// --- Fluxo de Caixa ---
window.changeFluxoPeriod = function(dir) {
    state.periodoFluxo.setMonth(state.periodoFluxo.getMonth() + dir);
    const span = document.getElementById('fluxo-current-period');
    if (span) {
        const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        span.innerText = `${months[state.periodoFluxo.getMonth()]} ${state.periodoFluxo.getFullYear()}`;
    }
    renderFluxo();
};

function renderFluxo() {
    const grid = document.getElementById('fluxoGrid');
    if (!grid) return;

    const currentYear = state.periodoFluxo.getFullYear();
    const currentMonth = state.periodoFluxo.getMonth();

    const firstOfMonth = new Date(currentYear, currentMonth, 1);
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const firstDay = firstOfMonth.getDay();

    // 1. Calcular Saldo Anterior (Realizado até antes do mês de referência + saldo inicial das contas)
    const saldoContasInicial = state.contas.reduce((acc, c) => acc + (parseFloat(c.saldo_inicial) || 0), 0);
    const lancamentosAntes = state.lancamentos.filter(l => {
        if (l.status !== 'PAGO' || !l.data_pagamento) return false;
        const pagDate = new Date(l.data_pagamento + 'T12:00:00');
        return pagDate < firstOfMonth;
    });
    
    const entradasAntes = lancamentosAntes.filter(l => l.tipo === 'RECEBER').reduce((acc, l) => acc + (parseFloat(l.valor_total) || 0), 0);
    const saidasAntes = lancamentosAntes.filter(l => l.tipo === 'PAGAR').reduce((acc, l) => acc + (parseFloat(l.valor_total) || 0), 0);
    const saldoAnterior = saldoContasInicial + entradasAntes - saidasAntes;

    // Lógica de Lançamentos do Mês
    const monthEntries = state.lancamentos.filter(l => {
        if (l.status === 'CANCELADO') return false;
        const dateStr = l.status === 'PAGO' ? l.data_pagamento : (l.data_vencimento || l.previsao_pagamento);
        if (!dateStr) return false;
        const d = new Date(dateStr + 'T12:00:00');
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    const totalEntradasMes = monthEntries.filter(l => l.tipo === 'RECEBER').reduce((acc, l) => acc + (parseFloat(l.valor_total) || 0), 0);
    const totalSaidasMes = monthEntries.filter(l => l.tipo === 'PAGAR').reduce((acc, l) => acc + (parseFloat(l.valor_total) || 0), 0);
    const saldoFinal = saldoAnterior + totalEntradasMes - totalSaidasMes;

    // Atualizar HTML de resumo
    document.getElementById('fluxo-saldo-ant').innerText = formatCurrency(saldoAnterior);
    document.getElementById('fluxo-entradas').innerText = formatCurrency(totalEntradasMes);
    document.getElementById('fluxo-saidas').innerText = formatCurrency(totalSaidasMes);
    document.getElementById('fluxo-saldo-fin').innerText = formatCurrency(saldoFinal);

    // Mapear entradas/saídas por dia
    const dailyValues = {};
    for (let d = 1; d <= daysInMonth; d++) {
        dailyValues[d] = { E: 0, S: 0 };
    }

    monthEntries.forEach(l => {
        const dateStr = l.status === 'PAGO' ? l.data_pagamento : (l.data_vencimento || l.previsao_pagamento);
        const day = new Date(dateStr + 'T12:00:00').getDate();
        if (dailyValues[day]) {
            if (l.tipo === 'RECEBER') dailyValues[day].E += parseFloat(l.valor_total) || 0;
            else if (l.tipo === 'PAGAR') dailyValues[day].S += parseFloat(l.valor_total) || 0;
        }
    });

    grid.innerHTML = '';

    // Placeholders dias do mês anterior
    for (let i = 0; i < firstDay; i++) {
        grid.innerHTML += '<div class="day-card empty"></div>';
    }

    // Dias do mês
    for (let d = 1; d <= daysInMonth; d++) {
        const dateObj = new Date(currentYear, currentMonth, d);
        const isToday = d === new Date().getDate() && currentMonth === new Date().getMonth() && currentYear === new Date().getFullYear();
        
        grid.innerHTML += `
            <div class="day-card ${isToday ? 'today' : ''}">
                <div class="day-header">
                    <span class="number">${d}</span>
                    <span class="weekday">${getWeekday(dateObj)}</span>
                </div>
                <div class="day-values">
                    <div class="day-val text-success"><span>E:</span> ${dailyValues[d].E.toFixed(2)}</div>
                    <div class="day-val text-danger"><span>S:</span> ${dailyValues[d].S.toFixed(2)}</div>
                </div>
            </div>
        `;
    }
}

// --- DRE ---
function renderDRE() {
    const container = document.getElementById('dreContent');
    const selectYear = document.getElementById('dre-year');
    if (!container || !selectYear) return;

    // Popula dropdown de anos se vazio
    if (selectYear.options.length === 0) {
        const years = new Set([new Date().getFullYear()]);
        state.lancamentos.forEach(l => {
            if (l.data_competencia) {
                years.add(new Date(l.data_competencia + 'T12:00:00').getFullYear());
            } else if (l.data_emissao) {
                years.add(new Date(l.data_emissao + 'T12:00:00').getFullYear());
            }
        });
        const sortedYears = Array.from(years).sort((a,b) => b - a);
        selectYear.innerHTML = sortedYears.map(y => `<option value="${y}">${y}</option>`).join('');
        selectYear.addEventListener('change', renderDRE);
    }

    const selectedYear = parseInt(selectYear.value) || new Date().getFullYear();

    // Filtra lançamentos do ano de competência selecionado
    const yearEntries = state.lancamentos.filter(l => {
        if (l.status === 'CANCELADO') return false;
        const dateStr = l.data_competencia || l.data_emissao || l.data_vencimento;
        if (!dateStr) return false;
        return new Date(dateStr + 'T12:00:00').getFullYear() === selectedYear;
    });

    // Função para acumular por nível ou estrutura do plano de contas
    const getMonthlyValuesForStructure = (parentCode, tipoFilter) => {
        const values = Array(12).fill(0);
        
        yearEntries.forEach(l => {
            const cat = state.categorias.find(c => c.id === l.categoria_id);
            if (!cat || cat.tipo !== tipoFilter) return;

            // Verifica se a categoria pertence a este grupo (ex: 1.1 pertence a 1)
            if (cat.codigo === parentCode || cat.codigo.startsWith(parentCode + '.')) {
                const dateStr = l.data_competencia || l.data_emissao || l.data_vencimento;
                const month = new Date(dateStr + 'T12:00:00').getMonth();
                values[month] += parseFloat(l.valor_total) || 0;
            }
        });

        return values;
    };

    // Monta a estrutura da DRE baseada no Plano de Contas cadastrado
    const rootCategories = state.categorias.filter(c => !c.parent_id);

    let html = `
        <div class="dre-table" style="overflow-x: auto; width: 100%;">
            <div class="dre-row header" style="min-width: 1000px; display: grid; grid-template-columns: 220px repeat(12, 1fr) 100px; border-bottom: 2px solid rgba(255,255,255,0.1); padding: 0.8rem; font-weight:800;">
                <div class="dre-cell name">Estrutura DRE</div>
                ${Array.from({ length: 12 }, (_, i) => `<div class="dre-cell month" style="text-align:right">${getMonthName(i)}</div>`).join('')}
                <div class="dre-cell month" style="text-align:right">Acumulado</div>
            </div>
    `;

    // Receitas não classificadas (ex: sem categoria_id ou sem categoria correspondente)
    const getUncategorizedMonthlyValues = (tipoFilter) => {
        const values = Array(12).fill(0);
        yearEntries.forEach(l => {
            if (l.tipo !== tipoFilter) return;
            const cat = state.categorias.find(c => c.id === l.categoria_id);
            if (!l.categoria_id || !cat) {
                const dateStr = l.data_competencia || l.data_emissao || l.data_vencimento;
                if (dateStr) {
                    const month = new Date(dateStr + 'T12:00:00').getMonth();
                    values[month] += parseFloat(l.valor_total) || 0;
                }
            }
        });
        return values;
    };

    // 1. Receitas
    const receitaRows = [];
    const receitasIniciais = rootCategories.filter(c => c.tipo === 'RECEITA');
    let totalReceitasMes = Array(12).fill(0);

    receitasIniciais.forEach(cat => {
        const monthly = getMonthlyValuesForStructure(cat.codigo, 'RECEITA');
        const accum = monthly.reduce((sum, v) => sum + v, 0);
        for(let i=0; i<12; i++) totalReceitasMes[i] += monthly[i];

        receitaRows.push({
            name: `${cat.codigo} - ${cat.nome}`,
            monthly,
            accum,
            class: 'level-1'
        });

        // Filhos Grau 2
        state.categorias.filter(child => child.parent_id === cat.id).forEach(c => {
            const cMonthly = getMonthlyValuesForStructure(c.codigo, 'RECEITA');
            const cAccum = cMonthly.reduce((sum, v) => sum + v, 0);
            receitaRows.push({
                name: `${c.codigo} - ${c.nome}`,
                monthly: cMonthly,
                accum: cAccum,
                class: 'level-2'
            });
        });
    });

    const monthlyUncatRec = getUncategorizedMonthlyValues('RECEBER');
    const accumUncatRec = monthlyUncatRec.reduce((sum, v) => sum + v, 0);
    if (accumUncatRec > 0) {
        for(let i=0; i<12; i++) totalReceitasMes[i] += monthlyUncatRec[i];
        receitaRows.push({
            name: 'Receitas Não Classificadas',
            monthly: monthlyUncatRec,
            accum: accumUncatRec,
            class: 'level-2'
        });
    }

    // 2. Despesas
    const despesaRows = [];
    const despesasIniciais = rootCategories.filter(c => c.tipo === 'DESPESA');
    let totalDespesasMes = Array(12).fill(0);

    despesasIniciais.forEach(cat => {
        const monthly = getMonthlyValuesForStructure(cat.codigo, 'DESPESA');
        const accum = monthly.reduce((sum, v) => sum + v, 0);
        for(let i=0; i<12; i++) totalDespesasMes[i] += monthly[i];

        despesaRows.push({
            name: `${cat.codigo} - ${cat.nome}`,
            monthly,
            accum,
            class: 'level-1'
        });

        // Filhos Grau 2
        state.categorias.filter(child => child.parent_id === cat.id).forEach(c => {
            const cMonthly = getMonthlyValuesForStructure(c.codigo, 'DESPESA');
            const cAccum = cMonthly.reduce((sum, v) => sum + v, 0);
            despesaRows.push({
                name: `${c.codigo} - ${c.nome}`,
                monthly: cMonthly,
                accum: cAccum,
                class: 'level-2'
            });
        });
    });

    const monthlyUncatDesp = getUncategorizedMonthlyValues('PAGAR');
    const accumUncatDesp = monthlyUncatDesp.reduce((sum, v) => sum + v, 0);
    if (accumUncatDesp > 0) {
        for(let i=0; i<12; i++) totalDespesasMes[i] += monthlyUncatDesp[i];
        despesaRows.push({
            name: 'Despesas Não Classificadas',
            monthly: monthlyUncatDesp,
            accum: accumUncatDesp,
            class: 'level-2'
        });
    }

    // Renderizar Receitas
    html += `<div class="dre-section-title" style="padding: 0.6rem; background: rgba(16,185,129,0.05); color:#10b981; font-weight:800; font-size:0.8rem; text-transform:uppercase;">Receitas Operacionais</div>`;
    receitaRows.forEach(r => {
        html += renderDRERow(r.name, r.monthly, r.accum, r.class);
    });

    html += renderDRERow('(=) TOTAL RECEITAS BRUTAS', totalReceitasMes, totalReceitasMes.reduce((s,v)=>s+v, 0), 'total-receitas');

    // Renderizar Despesas
    html += `<div class="dre-section-title" style="padding: 0.6rem; background: rgba(239,68,68,0.05); color:#ef4444; font-weight:800; font-size:0.8rem; text-transform:uppercase; margin-top: 1rem;">Custos e Despesas</div>`;
    despesaRows.forEach(r => {
        html += renderDRERow(r.name, r.monthly.map(v => -v), -r.accum, r.class);
    });

    html += renderDRERow('(-) TOTAL DEDUÇÕES E DESPESAS', totalDespesasMes.map(v => -v), -totalDespesasMes.reduce((s,v)=>s+v, 0), 'total-despesas');

    // Resultado Líquido
    const resultadoMes = Array(12).fill(0);
    for(let i=0; i<12; i++) resultadoMes[i] = totalReceitasMes[i] - totalDespesasMes[i];
    const resultadoAcum = resultadoMes.reduce((s,v)=>s+v, 0);

    html += `<div style="margin-top: 1rem;"></div>`;
    html += renderDRERow('(=) RESULTADO LÍQUIDO DO EXERCÍCIO', resultadoMes, resultadoAcum, 'result-final');

    html += `</div>`;
    container.innerHTML = html;
}

function renderDRERow(name, monthly, accum, rowClass) {
    let fontStyle = '';
    let bgColor = '';
    if (rowClass === 'total-receitas') { fontStyle = 'font-weight: 800; color: #10b981;'; bgColor = 'background: rgba(16,185,129,0.08);'; }
    else if (rowClass === 'total-despesas') { fontStyle = 'font-weight: 800; color: #ef4444;'; bgColor = 'background: rgba(239,68,68,0.08);'; }
    else if (rowClass === 'result-final') { fontStyle = 'font-weight: 900; color: #818cf8; font-size: 0.95rem;'; bgColor = 'background: rgba(129,140,248,0.15); border-top: 2px solid #818cf8; border-bottom: 2px solid #818cf8;'; }
    else if (rowClass === 'level-1') { fontStyle = 'font-weight: 700; color: #ffffff;'; }
    else { fontStyle = 'color: #94a3b8; padding-left: 20px;'; }

    return `
        <div class="dre-row" style="min-width: 1000px; display: grid; grid-template-columns: 220px repeat(12, 1fr) 100px; border-bottom: 1px solid rgba(255,255,255,0.03); padding: 0.6rem; align-items: center; ${bgColor} ${fontStyle}">
            <div class="dre-cell name" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${name}</div>
            ${monthly.map(v => `<div class="dre-cell val" style="text-align:right">${formatCurrency(v)}</div>`).join('')}
            <div class="dre-cell val" style="text-align:right; font-weight:800;">${formatCurrency(accum)}</div>
        </div>
    `;
}

window.exportDRE = function() {
    const selectYear = document.getElementById('dre-year');
    const selectedYear = selectYear ? selectYear.value : new Date().getFullYear();
    
    // Obter dados da tabela DRE para exportar como Excel
    const rows = [];
    rows.push(['FrotaLink - Demonstrativo de Resultados (DRE) - Ano: ' + selectedYear]);
    rows.push([]);
    rows.push(['Descrição', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez', 'Acumulado']);

    const dreRowsHTML = document.querySelectorAll('.dre-row');
    dreRowsHTML.forEach(row => {
        const name = row.querySelector('.name').innerText;
        const vals = Array.from(row.querySelectorAll('.val')).map(cell => {
            // Converte formato de moeda "R$ 1.200,00" para número float puro
            const clean = cell.innerText.replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
            return parseFloat(clean) || 0;
        });
        rows.push([name, ...vals]);
    });

    try {
        const ws = XLSX.utils.aoa_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "DRE " + selectedYear);
        XLSX.writeFile(wb, `DRE_${selectedYear}.xlsx`);
        showToast("DRE exportado com sucesso!", "success");
    } catch(e) {
        showToast("Falha ao exportar excel: " + e.message, "error");
    }
};


// --- CRUD Operations ---
async function openEntryModal(tipo, id = null) {
    if (tipo === 'RECEBER') {
        if (typeof canDo === 'function' && !canDo('financeiro_receber', id ? 'edit' : 'add')) {
            showToast('Você não tem permissão para esta ação.', 'error');
            return;
        }
        return openReceberModal(id);
    }
    if (typeof canDo === 'function' && !canDo('financeiro_pagar', id ? 'edit' : 'add')) {
        showToast('Você não tem permissão para esta ação.', 'error');
        return;
    }
    const modal = document.getElementById('entryModal');
    const form = document.getElementById('entryForm');
    if (!modal || !form) return;

    form.reset();
    document.getElementById('entryId').value = id || '';
    document.getElementById('entryTipo').value = tipo;

    // UI Reset
    document.getElementById('itemsContainer').innerHTML = '';
    document.getElementById('additionalContainer').innerHTML = '';
    document.getElementById('installmentsContainer').innerHTML = '';
    document.getElementById('installmentsWrapper').style.display = 'none';
    document.getElementById('qtdParcelas').value = 1;

    if (id) {
        const item = state.lancamentos.find(l => l.id === id);
        if (item) {
            populateForm(form, item);

            // Carregar itens do banco
            try {
                const { data: it } = await supabaseClient.from('fin_lancamento_itens').select('*').eq('lancamento_id', id);
                if (it && it.length > 0) {
                    it.forEach(row => addFinItemRow(row));
                    // Recalcula totais após carregar os itens do banco
                    setTimeout(calculateFinTotal, 200);
                } else {
                    addFinItemRow();
                }

                const { data: ad } = await supabaseClient.from('fin_lancamento_adicionais').select('*').eq('lancamento_id', id);
                if (ad && ad.length > 0) {
                    ad.forEach(row => addFinAdditionalRow(row));
                    setTimeout(calculateFinTotal, 250);
                }

                // Carregar parcelas
                const { data: parc } = await supabaseClient.from('fin_lancamento_parcelas').select('*').eq('lancamento_id', id).order('numero_parcela');
                if (parc && parc.length > 1) {
                    document.getElementById('qtdParcelas').value = item.qtd_parcelas;
                    document.getElementById('installmentsWrapper').style.display = 'block';
                    document.getElementById('installmentsContainer').innerHTML = parc.map((p, idx) => `
                        <div class="installment-row" style="display: grid; grid-template-columns: 80px 1fr 1fr; gap: 1rem; margin-bottom: 0.8rem; align-items: center; background: rgba(255,255,255,0.03); padding: 0.8rem; border-radius: 8px;">
                            <div style="font-weight: 800; color: #818cf8; font-size: 0.8rem;">#${p.numero_parcela}</div>
                            <div class="input-group" style="margin:0;">
                                <input type="date" class="financeiro-input parc-date" value="${p.data_vencimento}">
                            </div>
                            <div class="input-group" style="margin:0;">
                                <input type="number" step="0.01" class="financeiro-input parc-val" value="${p.valor}">
                            </div>
                        </div>
                    `).join('');
                }
            } catch (e) {
                console.error("Erro ao carregar detalhes:", e);
            }
        }
    } else {
        document.getElementById('entryVencimento').value = new Date().toISOString().split('T')[0];
        document.getElementById('entryEmissao').value = new Date().toISOString().split('T')[0];
        addFinItemRow(); // Inicia com uma linha vazia
    }

    // Mostrar botão excluir apenas se for edição
    const deleteBtn = document.getElementById('btnDeleteEntry');
    if (deleteBtn) {
        deleteBtn.style.display = id ? 'flex' : 'none';
        if (window.lucide) lucide.createIcons();
    }

    modal.classList.add('active');
    calculateFinTotal();

    // Foca automaticamente no campo de emissão após a abertura
    setTimeout(() => {
        const focusField = document.getElementById('entryEmissao');
        if (focusField) focusField.focus();
    }, 100);
}

async function editEntry(id, tipo) {
    const item = state.lancamentos.find(l => l.id === id);
    if (!item) return;

    await openEntryModal(tipo, id);
}

function populateForm(form, item) {
    document.getElementById('entryId').value = item.id;
    document.getElementById('entryEntidade').value = item.entidade_nome || '';

    // Configura Categoria (Nome e ID)
    const cat = state.categorias.find(c => c.id === item.categoria_id);
    document.getElementById('entryCategoriaId').value = item.categoria_id || '';
    document.getElementById('entryCategoriaName').value = cat ? `${cat.codigo} - ${cat.nome}` : '';

    document.getElementById('entryVencimento').value = item.data_vencimento;
    document.getElementById('entryConta').value = item.conta_bancaria_id || '';
    document.getElementById('entryForma').value = item.forma_pagamento || 'BOLETO';
    document.getElementById('entryObs').value = item.observacoes || '';

    if (document.getElementById('entryLoja')) document.getElementById('entryLoja').value = item.loja_unidade || '';
    if (document.getElementById('entryNumNF')) document.getElementById('entryNumNF').value = item.num_nf || '';
    if (document.getElementById('entrySerieNF')) document.getElementById('entrySerieNF').value = item.serie_nf || '';
    if (document.getElementById('entryEmissao')) document.getElementById('entryEmissao').value = item.data_emissao || '';
}

// --- Filters ---
function filterFinancial(tipo, val) {
    state.filtros.busca = val;
    renderLancamentos(tipo);
}

function filterStatus(tipo, val) {
    state.filtros.status = val;
    renderLancamentos(tipo);
}


let pinCallback = null;
let currentPinChallenge = "";

function movePinFocus(input) {
    if (input.value.length === 1) {
        const next = input.nextElementSibling;
        if (next && next.classList.contains('pin-field')) {
            next.focus();
        }
    }
}

function openPinModal(callback) {
    pinCallback = callback;
    const modal = document.getElementById('pinModal');
    if (!modal) return;
    
    // Reset fields
    document.querySelectorAll('.pin-field').forEach(input => {
        input.value = '';
        input.classList.remove('error');
    });
    
    // Gerar novo desafio de 6 dígitos
    currentPinChallenge = Math.floor(100000 + Math.random() * 900000).toString();
    const display = document.getElementById('pinChallengeValue');
    if (display) display.innerText = currentPinChallenge;

    modal.classList.add('active');
    setTimeout(() => {
        const first = document.querySelector('.pin-field[data-index="0"]');
        if (first) first.focus();
    }, 100);
}

function confirmPin() {
    let pin = "";
    document.querySelectorAll('.pin-field').forEach(input => pin += input.value);
    
    if (pin === currentPinChallenge) {
        closeModal('pinModal');
        if (typeof pinCallback === 'function') pinCallback();
        pinCallback = null;
    } else {
        document.querySelectorAll('.pin-field').forEach(input => {
            input.classList.add('error');
            input.value = '';
        });
        const first = document.querySelector('.pin-field[data-index="0"]');
        if (first) first.focus();
        showToast('Código Incorreto! Tente novamente.', 'error');
    }
}

async function deleteEntry(id) {
    if (!id) return;
    const l = state.lancamentos.find(item => item.id === id);
    if (l) {
        const mod = l.tipo === 'RECEBER' ? 'financeiro_receber' : 'financeiro_pagar';
        if (typeof canDo === 'function' && !canDo(mod, 'delete')) {
            showToast('Você não tem permissão para esta ação.', 'error');
            return;
        }
    }
    
    openPinModal(async () => {
        try {
            const { error } = await supabaseClient.from('fin_lancamentos').delete().eq('id', id);
            if (error) throw error;
            
            // Reverter integrado_financeiro se for o último lançamento daquela compra
            if (l && l.compra_id) {
                const { data: outros } = await supabaseClient
                    .from('fin_lancamentos')
                    .select('id')
                    .eq('compra_id', l.compra_id);
                
                if (!outros || outros.length === 0) {
                    await supabaseClient
                        .from('compras')
                        .update({ integrado_financeiro: false, data_integracao: null })
                        .eq('id', l.compra_id);
                }
            }

            await loadInitialData();
            renderAll();
            showToast('Lançamento excluído com sucesso!', 'success');
            
            // Fecha o modal de edição se estiver aberto
            closeModal('entryModal');
        } catch (err) { 
            showToast('Erro ao excluir: ' + err.message, 'error'); 
        }
    });
}

async function openReceberModal(id = null) {
    if (typeof canDo === 'function' && !canDo('financeiro_receber', id ? 'edit' : 'add')) {
        showToast('Você não tem permissão para esta ação.', 'error');
        return;
    }
    const modal = document.getElementById('receberModal');
    const form = document.getElementById('receberForm');
    if (!modal || !form) return;

    form.reset();
    document.getElementById('receberId').value = id || '';
    document.getElementById('receberCodUnico').innerText = id ? 'EDITANDO REGISTRO' : 'NOVO REGISTRO';

    state.importedXmlCnpj = "";
    const warningDiv = document.getElementById('receberClienteWarning');
    if (warningDiv) warningDiv.style.display = 'none';

    if (id) {
        const item = state.lancamentos.find(l => l.id === id);
        if (item) {
            document.getElementById('receberId').value = item.id;
            document.getElementById('receberData').value = item.data_emissao || '';
            document.getElementById('receberEntidade').value = item.entidade_nome || '';
            document.getElementById('receberNumNF').value = item.num_nf || '';
            document.getElementById('receberCompetencia').value = item.data_competencia ? item.data_competencia.substring(0, 7) : '';
            document.getElementById('receberDescricao').value = item.descricao || '';
            document.getElementById('receberTipoServico').value = item.tipo_servico_produto || 'SERVICO';
            document.getElementById('receberValorBruto').value = item.valor_total || 0;
            document.getElementById('receberValorINSS').value = item.valor_inss || 0;
            document.getElementById('receberValorISS').value = item.valor_iss || 0;
            document.getElementById('receberValorIR').value = item.valor_ir || 0;
            document.getElementById('receberPrazo').value = item.prazo_pagamento || 0;
            document.getElementById('receberPrevisao').value = item.previsao_pagamento || '';
            
            calculateReceberTaxes();
        }
    } else {
        document.getElementById('receberData').value = new Date().toISOString().split('T')[0];
        document.getElementById('receberCompetencia').value = new Date().toISOString().substring(0, 7);
        document.getElementById('receberDescricao').value = '';
        calculateReceberForecast();
    }

    modal.classList.add('active');
}

function handleReceberXMLUpload(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const xmlText = e.target.result;
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, "text/xml");

            // Verifica erros no parser XML
            const parserError = xmlDoc.getElementsByTagName("parsererror");
            if (parserError.length > 0) {
                showToast("Erro ao processar arquivo XML: Formato inválido.", "error");
                return;
            }

            // Função auxiliar de busca segura de texto da tag
            const getTagText = (parent, tagName) => {
                const els = parent.getElementsByTagName(tagName);
                return els.length > 0 ? els[0].textContent.trim() : null;
            };

            // 1. Data de Emissão / Competência
            let dataEmi = getTagText(xmlDoc, "dCompet") || getTagText(xmlDoc, "dhEmi") || getTagText(xmlDoc, "dEmi") || getTagText(xmlDoc, "DataEmissao") || getTagText(xmlDoc, "DtEmissao");
            if (dataEmi) {
                dataEmi = dataEmi.substring(0, 10);
            } else {
                dataEmi = new Date().toISOString().split('T')[0];
            }

            // 2. Número da Nota Fiscal / CT-e / NFSe
            const numNF = getTagText(xmlDoc, "nNFSe") || getTagText(xmlDoc, "nCT") || getTagText(xmlDoc, "nNF") || getTagText(xmlDoc, "Numero") || getTagText(xmlDoc, "NumeroNfse");

            // 3. Cliente / Razão Social (Tomador do Serviço na NFSe/CT-e, Destinatário na NFe)
            let cliente = null;
            let tomadorCnpjCpf = null;

            const getCnpjCpfFromElement = (element) => {
                if (!element) return null;
                return getTagText(element, "CNPJ") || getTagText(element, "Cnpj") || getTagText(element, "CPF") || getTagText(element, "Cpf");
            };

            const dest = xmlDoc.getElementsByTagName("dest")[0];
            if (dest) {
                cliente = getTagText(dest, "xNome");
                tomadorCnpjCpf = getCnpjCpfFromElement(dest);
            }
            if (!cliente) {
                const toma = xmlDoc.getElementsByTagName("toma")[0] || xmlDoc.getElementsByTagName("toma3")[0] || xmlDoc.getElementsByTagName("toma4")[0];
                if (toma) {
                    cliente = getTagText(toma, "xNome");
                    tomadorCnpjCpf = getCnpjCpfFromElement(toma);
                }
            }
            if (!cliente) {
                const tomador = xmlDoc.getElementsByTagName("TomadorServico")[0] || xmlDoc.getElementsByTagName("Tomador")[0] || xmlDoc.getElementsByTagName("TomadorServicoId")[0];
                if (tomador) {
                    cliente = getTagText(tomador, "RazaoSocial") || getTagText(tomador, "NomeTomador") || getTagText(tomador, "xNome");
                    const cpfCnpj = tomador.getElementsByTagName("CpfCnpj")[0] || tomador.getElementsByTagName("IdentificacaoTomador")[0] || tomador;
                    tomadorCnpjCpf = getCnpjCpfFromElement(cpfCnpj);
                }
            }
            if (!cliente) {
                cliente = getTagText(xmlDoc, "RazaoSocialTomador") || getTagText(xmlDoc, "xNome");
            }
            if (!tomadorCnpjCpf) {
                tomadorCnpjCpf = getTagText(xmlDoc, "CnpjTomador") || getTagText(xmlDoc, "CNPJTomador") || getTagText(xmlDoc, "Cnpj") || getTagText(xmlDoc, "CNPJ") || getTagText(xmlDoc, "Cpf") || getTagText(xmlDoc, "CPF");
            }

            // Validação por CNPJ contra base comercial
            if (tomadorCnpjCpf) {
                const cleanCnpj = tomadorCnpjCpf.replace(/\D/g, '');
                state.importedXmlCnpj = cleanCnpj;

                const exists = state.clientes.some(c => (c.cnpj_cpf || '').replace(/\D/g, '') === cleanCnpj);
                const warningDiv = document.getElementById('receberClienteWarning');
                if (warningDiv) {
                    if (!exists) {
                        warningDiv.style.display = 'block';
                        showToast("Aviso: Tomador/Cliente do XML não cadastrado no Comercial.", "error");
                    } else {
                        warningDiv.style.display = 'none';
                    }
                }
            } else {
                state.importedXmlCnpj = "";
                const warningDiv = document.getElementById('receberClienteWarning');
                if (warningDiv) warningDiv.style.display = 'none';
            }

            // 4. Descrição (Serviço ou discriminação)
            let descricao = "";
            const servico = xmlDoc.getElementsByTagName("serv")[0] || xmlDoc.getElementsByTagName("Servico")[0];
            if (servico) {
                descricao = getTagText(servico, "Discriminacao") || getTagText(servico, "xServ") || "";
            }
            if (!descricao) {
                const infServ = xmlDoc.getElementsByTagName("infServ")[0];
                if (infServ) {
                    descricao = getTagText(infServ, "xDescServ") || "";
                }
            }
            if (!descricao) {
                descricao = getTagText(xmlDoc, "xDescServ") || getTagText(xmlDoc, "Discriminacao") || getTagText(xmlDoc, "xProd") || "";
            }
            if (!descricao) {
                descricao = `Recebimento referente à Nota Fiscal/CT-e ${numNF || ''}`;
            }

            // 5. Valor Bruto
            let valorBruto = 0;
            let valorTexto = getTagText(xmlDoc, "vTPrest") || getTagText(xmlDoc, "vServ") || getTagText(xmlDoc, "vBC") || getTagText(xmlDoc, "vNF") || getTagText(xmlDoc, "ValorServicos") || getTagText(xmlDoc, "ValorTotal");
            if (valorTexto) {
                valorBruto = parseFloat(valorTexto) || 0;
            }

            // 6. Impostos
            let valorINSS = parseFloat(getTagText(xmlDoc, "vRetCP") || getTagText(xmlDoc, "vRetINSS") || getTagText(xmlDoc, "vINSS") || getTagText(xmlDoc, "ValorInss") || "0.00") || 0;
            let valorISS = parseFloat(getTagText(xmlDoc, "vISSQN") || getTagText(xmlDoc, "vRetISS") || getTagText(xmlDoc, "vISS") || getTagText(xmlDoc, "ValorIss") || getTagText(xmlDoc, "ValorIssRetido") || "0.00") || 0;
            let valorIR = parseFloat(getTagText(xmlDoc, "vRetIRRF") || getTagText(xmlDoc, "vRetIR") || getTagText(xmlDoc, "vIRRF") || getTagText(xmlDoc, "ValorIr") || getTagText(xmlDoc, "ValorIrrf") || getTagText(xmlDoc, "vIR") || "0.00") || 0;

            // Preenche os campos do form
            if (dataEmi) document.getElementById('receberData').value = dataEmi;
            if (cliente) document.getElementById('receberEntidade').value = cliente;
            if (numNF) document.getElementById('receberNumNF').value = numNF;
            if (descricao) document.getElementById('receberDescricao').value = descricao;
            document.getElementById('receberCompetencia').value = "";
            document.getElementById('receberPrazo').value = "";
            document.getElementById('receberPrevisao').value = "";
            
            document.getElementById('receberValorBruto').value = valorBruto.toFixed(2);
            document.getElementById('receberValorINSS').value = valorINSS.toFixed(2);
            document.getElementById('receberValorISS').value = valorISS.toFixed(2);
            document.getElementById('receberValorIR').value = valorIR.toFixed(2);

            // Executa atualizações e recálculos automáticos do modal
            calculateReceberTaxes();
            calculateReceberForecast();

            showToast("XML importado com sucesso!", "success");
        } catch (err) {
            console.error("Erro ao ler XML:", err);
            showToast("Falha ao analisar o arquivo XML: " + err.message, "error");
        }
    };
    reader.readAsText(file);
    input.value = "";
}

function calculateReceberTaxes() {
    const bruto = parseFloat(document.getElementById('receberValorBruto').value) || 0;
    const inss = parseFloat(document.getElementById('receberValorINSS').value) || 0;
    const iss = parseFloat(document.getElementById('receberValorISS').value) || 0;
    const ir = parseFloat(document.getElementById('receberValorIR').value) || 0;

    const totalTributos = inss + iss + ir;
    const valorLiquido = bruto - totalTributos;

    document.getElementById('receberTotalTributo').value = formatCurrency(totalTributos);
    document.getElementById('receberValorLiquido').value = valorLiquido.toFixed(2);
}

function calculateReceberForecast() {
    const dataRef = document.getElementById('receberData').value;
    const prazoVal = document.getElementById('receberPrazo').value;
    
    if (prazoVal === "" || prazoVal === null || prazoVal === undefined) {
        document.getElementById('receberPrevisao').value = "";
        return;
    }

    const prazo = parseInt(prazoVal) || 0;
    if (dataRef) {
        const date = new Date(dataRef + 'T00:00:00');
        date.setDate(date.getDate() + prazo);
        document.getElementById('receberPrevisao').value = date.toISOString().split('T')[0];
    }
}

async function handleReceberSubmit(e) {
    e.preventDefault();

    // Bloqueia se o cliente importado do XML não estiver cadastrado no Comercial
    if (state.importedXmlCnpj) {
        let exists = false;
        try {
            const { data: dbClientes } = await supabaseClient.from('clientes').select('cnpj_cpf');
            exists = (dbClientes || []).some(c => (c.cnpj_cpf || '').replace(/\D/g, '') === state.importedXmlCnpj);
        } catch (err) {
            exists = state.clientes.some(c => (c.cnpj_cpf || '').replace(/\D/g, '') === state.importedXmlCnpj);
        }
        
        if (!exists) {
            showToast("Bloqueado: O Tomador/Cliente com CNPJ do XML não está cadastrado no sistema (Comercial).", "error");
            alert("Não é possível salvar: O Tomador/Cliente com CNPJ do XML não está cadastrado no sistema (Comercial). Por favor, realize o cadastro antes de prosseguir.");
            return;
        }
    }

    const formData = new FormData(e.target);
    const id = document.getElementById('receberId').value;
    
    const bruto = parseFloat(formData.get('valor_total')) || 0;
    const inss = parseFloat(formData.get('valor_inss')) || 0;
    const iss = parseFloat(formData.get('valor_iss')) || 0;
    const ir = parseFloat(formData.get('valor_ir')) || 0;
    const totalTributos = inss + iss + ir;

    const record = {
        tipo: 'RECEBER',
        data_emissao: formData.get('data_emissao'),
        entidade_nome: formData.get('entidade_nome'),
        num_nf: formData.get('num_nf'),
        data_competencia: formData.get('data_competencia') ? formData.get('data_competencia') + '-01' : null,
        tipo_servico_produto: formData.get('tipo_servico_produto'),
        valor_total: bruto,
        valor_inss: inss,
        valor_iss: iss,
        valor_ir: ir,
        valor_tributo_total: totalTributos,
        prazo_pagamento: parseInt(formData.get('prazo_pagamento')) || 0,
        previsao_pagamento: formData.get('previsao_pagamento'),
        data_vencimento: formData.get('previsao_pagamento'), // Usando previsão como vencimento real
        descricao: formData.get('descricao'),
        status: 'ABERTO'
    };

    try {
        if (id) {
            const { error } = await supabaseClient.from('fin_lancamentos').update(record).eq('id', id);
            if (error) throw error;
        } else {
            const { error } = await supabaseClient.from('fin_lancamentos').insert([record]);
            if (error) throw error;
        }

        closeModal('receberModal');
        await loadInitialData();
        renderAll();
        showToast('Recebimento salvo com sucesso!', 'success');
    } catch (err) {
        showToast('Erro ao salvar: ' + err.message, 'error');
    }
}

function generateNF() {
    showToast("Integração com Bsoft em desenvolvimento. Em breve você poderá gerar NFs diretamente por aqui!", "info");
}

async function handleEntrySubmit(e) {
    e.preventDefault();
    const finalTotal = calculateFinTotal();
    if (finalTotal <= 0) return alert('O valor total deve ser maior que zero.');

    const formData = new FormData(e.target);
    const id = document.getElementById('entryId').value;
    const tipo = document.getElementById('entryTipo').value;
    const qtdParcelas = parseInt(document.getElementById('qtdParcelas').value) || 1;
    const isParcelado = qtdParcelas > 1;

    const firstItemDesc = document.querySelector('.item-desc')?.value || 'Lançamento sem itens';
    const mainRecord = {
        data_emissao: formData.get('data_emissao'),
        num_nf: formData.get('num_nf'),
        serie_nf: formData.get('serie_nf'),
        entidade_nome: formData.get('entidade_nome'),
        categoria_id: formData.get('categoria_id'),
        forma_pagamento: formData.get('forma_pagamento'),
        data_vencimento: formData.get('data_vencimento'),
        conta_bancaria_id: formData.get('conta_bancaria_id'),
        observacoes: formData.get('observacoes'),
        valor_total: finalTotal,
        descricao: firstItemDesc,
        tipo: tipo,
        is_parcelado: isParcelado,
        qtd_parcelas: qtdParcelas,
        status: 'ABERTO'
    };

    try {
        let lancamentoId = id;

        if (id) {
            const { error: upErr } = await supabaseClient.from('fin_lancamentos').update(mainRecord).eq('id', id);
            if (upErr) throw upErr;
            await supabaseClient.from('fin_lancamento_itens').delete().eq('lancamento_id', id);
            await supabaseClient.from('fin_lancamento_adicionais').delete().eq('lancamento_id', id);
            await supabaseClient.from('fin_lancamento_parcelas').delete().eq('lancamento_id', id);
        } else {
            const { data: inserted, error: inErr } = await supabaseClient.from('fin_lancamentos').insert([mainRecord]).select().single();
            if (inErr) throw inErr;
            lancamentoId = inserted.id;
        }

        // 3. Salvar Itens (Peças/Serviços)
        const itens = [];
        document.querySelectorAll('#itemsContainer .item-row-v2').forEach(row => {
            const desc = row.querySelector('.item-desc').value.trim();
            const qtd = parseFloat(row.querySelector('.item-qtd').value) || 0;
            const unit = parseFloat(row.querySelector('.item-unit').value) || 0;
            
            if (desc || unit > 0) {
                itens.push({
                    lancamento_id: lancamentoId,
                    descricao: desc,
                    tipo: row.querySelector('.item-tipo').value || 'SERVICO',
                    quantidade: qtd || 1,
                    valor_unitario: unit,
                    centro_custo_id: row.querySelector('.item-cc').value || null
                });
            }
        });

        console.log("Tentando salvar itens detalhados:", itens);
        if (itens.length > 0) {
            const { error: itemErr } = await supabaseClient
                .from('fin_lancamento_itens')
                .insert(itens);
            if (itemErr) {
                console.error("Erro crítico ao salvar itens:", itemErr);
                throw new Error("Falha ao salvar itens detalhados.");
            }
        }

        // 4. Salvar Custos Adicionais
        const adds = [];
        document.querySelectorAll('#additionalContainer .item-row-v2').forEach(row => {
            const addDesc = row.querySelector('.add-desc').value.trim();
            const addVal = parseFloat(row.querySelector('.add-val').value) || 0;
            if (addDesc || addVal > 0) {
                adds.push({
                    lancamento_id: lancamentoId,
                    descricao: addDesc,
                    valor: addVal
                });
            }
        });

        if (adds.length > 0) {
            const { error: addErr } = await supabaseClient
                .from('fin_lancamento_adicionais')
                .insert(adds);
            if (addErr) console.error("Erro Adicionais:", addErr);
        }

        // Salvar Parcelas se houver
        if (isParcelado) {
            const parcelas = [];
            document.querySelectorAll('#installmentsContainer .installment-row').forEach((row, idx) => {
                parcelas.push({
                    lancamento_id: lancamentoId,
                    numero_parcela: idx + 1,
                    data_vencimento: row.querySelector('.parc-date').value,
                    valor: parseFloat(row.querySelector('.parc-val').value) || 0,
                    status: 'ABERTO'
                });
            });
            if (parcelas.length > 0) await supabaseClient.from('fin_lancamento_parcelas').insert(parcelas);
        }

        closeModal('entryModal');
        await loadInitialData();
        renderAll();
        showToast('Lançamento salvo com sucesso!', 'success');
    } catch (err) {
        showToast('Erro ao salvar: ' + err.message, 'error');
    }
}

// --- Payment (Baixa) ---
async function openPaymentModal(id) {
    const l = state.lancamentos.find(item => item.id === id);
    if (!l) return;

    const mod = l.tipo === 'RECEBER' ? 'financeiro_receber' : 'financeiro_pagar';
    if (typeof canDo === 'function' && !canDo(mod, 'edit')) {
        showToast('Você não tem permissão para esta ação.', 'error');
        return;
    }

    document.getElementById('payLancamentoId').value = l.id;
    document.getElementById('payValor').value = l.valor_total - l.valor_pago;
    document.getElementById('payData').value = new Date().toISOString().split('T')[0];

    const selectConta = document.getElementById('payConta');
    selectConta.innerHTML = state.contas.map(c => `<option value="${c.id}">${c.nome} (Saldo: ${formatCurrency(c.saldo_atual)})</option>`).join('');
    if (l.conta_bancaria_id) selectConta.value = l.conta_bancaria_id;

    const modal = document.getElementById('paymentModal');
    if (modal) modal.classList.add('active');
}

async function handlePayment(e) {
    e.preventDefault();
    const id = document.getElementById('payLancamentoId').value;
    const valorPagoInput = parseFloat(document.getElementById('payValor').value);
    const dataPagamento = document.getElementById('payData').value;
    const contaId = document.getElementById('payConta').value;
    const forma = document.getElementById('payForma').value;

    try {
        const l = state.lancamentos.find(item => item.id === id);
        const conta = state.contas.find(c => c.id === contaId);

        if (!l || !conta) throw new Error('Dados inválidos');

        const novoValorPago = (parseFloat(l.valor_pago) || 0) + valorPagoInput;
        const novoStatus = novoValorPago >= l.valor_total ? 'PAGO' : 'PARCIAL';

        // 1. Atualiza Lançamento
        const { error: errL } = await supabaseClient.from('fin_lancamentos').update({
            valor_pago: novoValorPago,
            status: novoStatus,
            data_pagamento: dataPagamento,
            conta_bancaria_id: contaId,
            forma_pagamento: forma
        }).eq('id', id);
        if (errL) throw errL;

        // 2. Atualiza Saldo da Conta
        const fator = l.tipo === 'PAGAR' ? -1 : 1;
        const novoSaldo = parseFloat(conta.saldo_atual) + (valorPagoInput * fator);
        const { error: errC } = await supabaseClient.from('fin_contas_bancarias').update({
            saldo_atual: novoSaldo
        }).eq('id', contaId);
        if (errC) throw errC;

        closeModal('paymentModal');
        await loadInitialData();
        renderAll();
        showToast('Pagamento registrado!', 'success');
    } catch (err) {
        showToast('Erro: ' + err.message, 'error');
    }
}

async function duplicateEntry(id) {
    const l = state.lancamentos.find(item => item.id === id);
    if (!l) return;

    const mod = l.tipo === 'RECEBER' ? 'financeiro_receber' : 'financeiro_pagar';
    if (typeof canDo === 'function' && !canDo(mod, 'add')) {
        showToast('Você não tem permissão para esta ação.', 'error');
        return;
    }

    try {
        const copy = { ...l };
        delete copy.id;
        delete copy.created_at;
        copy.status = 'ABERTO';
        copy.valor_pago = 0;
        copy.data_pagamento = null;
        copy.descricao = `${l.descricao} (Cópia)`;

        const { error } = await supabaseClient.from('fin_lancamentos').insert([copy]);
        if (error) throw error;

        await loadInitialData();
        renderAll();
        showToast('Duplicado!', 'success');
    } catch (err) {
        showToast('Erro: ' + err.message, 'error');
    }
}

function renderDashboardPagar() {
    const elements = {
        total: document.getElementById('kpi-pagar-total'),
        hoje: document.getElementById('kpi-pagar-hoje'),
        atraso: document.getElementById('kpi-pagar-atrasadas'),
        pagas: document.getElementById('kpi-pagar-pagas')
    };
    if (!elements.total) return;

    const pagarList = state.lancamentos.filter(l => l.tipo === 'PAGAR' && l.status !== 'CANCELADO');
    const todayStr = new Date().toISOString().split('T')[0];
    const monthNow = new Date().getMonth();

    const total = pagarList.filter(l => l.status !== 'PAGO').reduce((acc, l) => acc + (parseFloat(l.valor_total) - parseFloat(l.valor_pago)), 0);
    const hoje = pagarList.filter(l => l.data_vencimento === todayStr && l.status !== 'PAGO').reduce((acc, l) => acc + parseFloat(l.valor_total), 0);
    const atraso = pagarList.filter(l => new Date(l.data_vencimento) < new Date(todayStr) && l.status !== 'PAGO').reduce((acc, l) => acc + parseFloat(l.valor_total), 0);
    const pagas = pagarList.filter(l => l.status === 'PAGO' && (l.data_pagamento && new Date(l.data_pagamento).getMonth() === monthNow)).reduce((acc, l) => acc + parseFloat(l.valor_total), 0);

    elements.total.innerText = formatCurrency(total);
    elements.hoje.innerText = formatCurrency(hoje);
    elements.atraso.innerText = formatCurrency(atraso);
    elements.pagas.innerText = formatCurrency(pagas);
}

function renderDashboardReceber() {
    const elements = {
        total: document.getElementById('kpi-receber-total'),
        hoje: document.getElementById('kpi-receber-hoje'),
        atraso: document.getElementById('kpi-receber-atrasadas'),
        recebidas: document.getElementById('kpi-receber-recebidas')
    };
    if (!elements.total) return;

    const receberList = state.lancamentos.filter(l => l.tipo === 'RECEBER' && l.status !== 'CANCELADO');
    const todayStr = new Date().toISOString().split('T')[0];
    const monthNow = new Date().getMonth();

    // Total a Receber (Bruto - Já Recebido)
    const total = receberList.filter(l => l.status !== 'PAGO').reduce((acc, l) => acc + (parseFloat(l.valor_total) - parseFloat(l.valor_pago || 0)), 0);
    
    // Recebendo Hoje
    const hoje = receberList.filter(l => (l.previsao_pagamento === todayStr || l.data_vencimento === todayStr) && l.status !== 'PAGO').reduce((acc, l) => acc + parseFloat(l.valor_total), 0);
    
    // Atraso (Data de vencimento menor que hoje e ainda aberto)
    const atraso = receberList.filter(l => {
        const dVenc = l.data_vencimento || l.previsao_pagamento;
        return dVenc && dVenc < todayStr && l.status === 'ABERTO';
    }).reduce((acc, l) => acc + parseFloat(l.valor_total), 0);

    // Recebidas no mês
    const recebidas = receberList.filter(l => l.status === 'PAGO' && (l.data_pagamento && new Date(l.data_pagamento).getMonth() === monthNow)).reduce((acc, l) => acc + parseFloat(l.valor_total), 0);

    elements.total.innerText = formatCurrency(total);
    elements.hoje.innerText = formatCurrency(hoje);
    elements.atraso.innerText = formatCurrency(atraso);
    elements.recebidas.innerText = formatCurrency(recebidas);
}

// --- Helpers ---
function formatCurrency(v) { return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function formatDate(d) { return d ? new Date(d).toLocaleDateString('pt-BR') : '-'; }
function getMonthName(i) { return ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][i]; }
function getWeekday(d) { return ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][d.getDay()]; }

function updateDropdowns() {
    const selects = ['entryCategoriaName', 'entryConta', 'entryCentroCusto', 'payConta', 'planoParentId', 'custoParentId', 'entryForma', 'filterFornecedorPagar', 'filterCCPagar', 'concContaSelect'];

    // Função auxiliar para identificar se um item é folha (não tem filhos)
    const isLeaf = (item, list) => !list.some(other => other.parent_id === item.id);

    selects.forEach(id => {
        const el = document.getElementById(id);
        if (!el) {
            // Se for entryCategoriaName, popula o datalist mesmo se o el id for diferente
            if (id === 'entryCategoriaName') {
                const datalist = document.getElementById('categoriasDatalist');
                if (datalist) {
                    const leaves = state.categorias.filter(c => isLeaf(c, state.categorias));
                    datalist.innerHTML = leaves.map(c => `<option value="${c.codigo} - ${c.nome}">`).join('');
                }
            }
            return;
        }

        if (id === 'entryCategoriaName') {
            const datalist = document.getElementById('categoriasDatalist');
            if (datalist) {
                const leaves = state.categorias.filter(c => isLeaf(c, state.categorias));
                datalist.innerHTML = leaves.map(c => `<option value="${c.codigo} - ${c.nome}">`).join('');
            }
        }

        if (id === 'entryConta' || id === 'payConta' || id === 'concContaSelect') {
            el.innerHTML = state.contas.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
        }

        if (id === 'entryCentroCusto') {
            const leaves = state.centrosCusto.filter(c => isLeaf(c, state.centrosCusto));
            el.innerHTML = leaves.map(c => `<option value="${c.id}">${c.codigo} - ${c.nome}</option>`).join('');
        }

        if (id === 'entryForma') {
            el.innerHTML = state.formasPagamento.map(f => `<option value="${f.id}">${f.nome}</option>`).join('');
        }

        if (id === 'planoParentId') {
            const options = state.categorias
                .filter(c => (c.codigo.split('.').length < 4))
                .map(c => `<option value="${c.id}" data-code="${c.codigo}">${c.codigo} - ${c.nome}</option>`);
            el.innerHTML = '<option value="">Nenhum (Grau 1)</option>' + options.join('');
        }

        if (id === 'custoParentId') {
            const options = state.centrosCusto
                .filter(c => !c.parent_id)
                .map(c => `<option value="${c.id}" data-code="${c.codigo}">${c.codigo} - ${c.nome}</option>`);
            el.innerHTML = '<option value="">Nenhum (Grupo Principal)</option>' + options.join('');
        }

        if (id === 'filterFornecedorPagar') {
            const options = state.fornecedores.map(f => `<option value="${f.nome}">${f.nome}</option>`);
            el.innerHTML = '<option value="">Todos os Fornecedores</option>' + options.join('');
        }
        if (id === 'filterCCPagar') {
            const options = state.centrosCusto.map(c => `<option value="${c.id}">${c.codigo} - ${c.nome}</option>`);
            el.innerHTML = '<option value="">Todos os Centros</option>' + options.join('');
        }
    });

    const datalist = document.getElementById('fornecedoresDatalist');
    if (datalist) {
        datalist.innerHTML = state.fornecedores.map(f => `<option value="${f.nome}">`).join('');
    }

    const clientesDatalist = document.getElementById('clientesDatalist');
    if (clientesDatalist) {
        datalist.innerHTML = state.clientes.map(f => `<option value="${f.nome}">`).join('');
    }
}

function closeModal(id) { document.getElementById(id).classList.remove('active'); }

function showToast(msg, type) {
    const t = document.createElement('div');
    t.className = `toast active ${type}`;
    t.innerHTML = `<i data-lucide="${type === 'success' ? 'check' : 'alert-circle'}"></i> <span>${msg}</span>`;
    document.body.appendChild(t);
    setTimeout(() => { t.classList.remove('active'); setTimeout(() => t.remove(), 400); }, 3000);
    if (window.lucide) lucide.createIcons();
}

function handleSort(tipo, key) {
    const s = state.sort[tipo];
    if (s.key === key) s.dir = s.dir === 'asc' ? 'desc' : 'asc';
    else { s.key = key; s.dir = 'asc'; }
    renderLancamentos(tipo);
}

function sortFinancial(tipo, key) { handleSort(tipo, key); }

function filterFinancial(tipo, val) {
    state.filtros[tipo].busca = val;
    renderLancamentos(tipo);
}

function filterStatus(tipo, val) {
    state.filtros[tipo].status = val;
    renderLancamentos(tipo);
}

function filterByCategory(tipo, val) {
    state.filtros[tipo].categoria = val;
    renderLancamentos(tipo);
}

function clearFilters(tipo) {
    state.filtros[tipo] = { status: '', busca: '', categoria: '' };

    // Reset inputs
    if (tipo === 'PAGAR') {
        document.getElementById('pagarSearch').value = '';
        document.getElementById('filterStatusPagar').value = '';
        document.getElementById('filterFornecedorPagar').value = '';
        document.getElementById('filterCCPagar').value = '';
    } else {
        document.getElementById('receberSearch').value = '';
        document.getElementById('filterStatusReceber').value = '';
    }

    renderLancamentos(tipo);
}

// --- LÓGICA DE ITENS DINÂMICOS (Inspirado no módulo Compras) ---

function addFinItemRow(data = null) {
    const container = document.getElementById('itemsContainer');
    const rowId = 'row-' + Date.now() + Math.random().toString(36).substr(2, 5);
    const tipoAtual = data?.tipo || 'SERVICO';

    const row = document.createElement('div');
    row.className = 'item-row-v2';
    row.id = rowId;

    const leaves = state.centrosCusto.filter(c => !state.centrosCusto.some(other => other.parent_id === c.id));
    const ccOptions = leaves.map(c =>
        `<option value="${c.id}" ${data?.centro_custo_id === c.id ? 'selected' : ''}>${c.codigo} - ${c.nome}</option>`
    ).join('');

    row.innerHTML = `
        <!-- Topo: Tabs PEÇA / SERVIÇO -->
        <div class="item-tabs-bar">
            <button type="button" class="item-tab ${tipoAtual === 'PECA' ? 'active' : ''}" onclick="setItemTipo('${rowId}', 'PECA', this)">PEÇA</button>
            <button type="button" class="item-tab ${tipoAtual === 'SERVICO' ? 'active' : ''}" onclick="setItemTipo('${rowId}', 'SERVICO', this)">SERVIÇO</button>
        </div>
        <input type="hidden" class="item-tipo" value="${tipoAtual}">

        <!-- Linha principal: descrição | qtd | valor | total | lixeira -->
        <div class="item-main-row">
            <div class="item-desc-wrap">
                <i data-lucide="search" class="item-search-icon"></i>
                <input type="text" class="financeiro-input item-desc" value="${data ? data.descricao : ''}" placeholder="Descrição do item..." required>
            </div>
            <input type="number" class="financeiro-input item-qtd" value="${data ? data.quantidade : 1}" step="0.001" oninput="calculateFinTotal()" placeholder="QTD">
            <input type="number" class="financeiro-input item-unit" value="${data ? data.valor_unitario : 0}" step="0.01" oninput="calculateFinTotal()" placeholder="VALOR">
            <input type="text" class="financeiro-input item-total item-total-display" value="0,00" readonly>
            <button type="button" class="btn-remove" onclick="removeFinRow('${rowId}')">
                <i data-lucide="trash-2"></i>
            </button>
        </div>

        <!-- Linha secundária: Centro de Custo -->
        <div class="item-secondary-row" style="display:flex; align-items:center; gap:0.5rem;">
            <div style="flex:1; display:flex; flex-direction:column; gap:4px;">
                <span class="item-secondary-label">Centro de Custo</span>
                <div style="display:flex; gap:0.5rem; align-items:center;">
                    <select class="financeiro-input item-cc" style="flex:1;">
                        <option value="">Selecione...</option>
                        ${ccOptions}
                    </select>
                    <button type="button" class="btn-quick-add" onclick="openModal('custoModal')" style="width:32px; height:32px;">
                        <i data-lucide="plus"></i>
                    </button>
                </div>
            </div>
        </div>
    `;

    container.appendChild(row);
    if (window.lucide) lucide.createIcons();
    calculateFinTotal();
}

function setItemTipo(rowId, tipo, btn) {
    const row = document.getElementById(rowId);
    if (!row) return;
    row.querySelectorAll('.item-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    const hidden = row.querySelector('.item-tipo');
    if (hidden) hidden.value = tipo;
}

/**
 * 📦 GERAÇÃO DINÂMICA DE PARCELAS
 */
function generateInstallmentFields(forcedTotal = null) {
    const qtd = parseInt(document.getElementById('qtdParcelas').value) || 1;
    const wrapper = document.getElementById('installmentsWrapper');
    const container = document.getElementById('installmentsContainer');
    const firstDate = document.getElementById('entryVencimento').value;
    const total = forcedTotal !== null ? forcedTotal : calculateFinTotal();

    if (qtd <= 1) {
        wrapper.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    wrapper.style.display = 'block';
    container.innerHTML = '';

    const valorParcela = (total / qtd).toFixed(2);
    let dateBase = firstDate ? new Date(firstDate + 'T12:00:00') : new Date();

    for (let i = 0; i < qtd; i++) {
        const rowDate = new Date(dateBase);
        rowDate.setMonth(rowDate.getMonth() + i);
        const dateStr = rowDate.toISOString().split('T')[0];

        const row = document.createElement('div');
        row.className = 'installment-row';
        row.style = "display: grid; grid-template-columns: 80px 1fr 1fr; gap: 1rem; margin-bottom: 0.8rem; align-items: center; background: rgba(255,255,255,0.03); padding: 0.8rem; border-radius: 8px;";
        row.innerHTML = `
            <div style="font-weight: 800; color: #818cf8; font-size: 0.8rem;">#${i + 1}</div>
            <div class="input-group" style="margin:0;">
                <input type="date" class="financeiro-input parc-date" value="${dateStr}">
            </div>
            <div class="input-group" style="margin:0;">
                <input type="number" step="0.01" class="financeiro-input parc-val" value="${valorParcela}">
            </div>
        `;
        container.appendChild(row);
    }
}

function addFinAdditionalRow(data = null) {
    const container = document.getElementById('additionalContainer');
    const rowId = 'add-' + Date.now();

    const div = document.createElement('div');
    div.className = 'item-row-v2';
    div.id = rowId;
    div.style.gridTemplateColumns = "2fr 1fr 40px";

    div.innerHTML = `
        <div class="input-group">
            <label>Descrição do Custo</label>
            <input type="text" class="financeiro-input add-desc" value="${data ? data.descricao : ''}" placeholder="Ex: Frete ou Taxa">
        </div>
        <div class="input-group">
            <label>Valor</label>
            <input type="number" class="financeiro-input add-val" value="${data ? data.valor : '0'}" step="0.01" oninput="calculateFinTotal()">
        </div>
        <button type="button" class="btn-remove" onclick="removeFinRow('${rowId}')">
            <i data-lucide="trash-2" style="width: 16px;"></i>
        </button>
    `;
    container.appendChild(div);
    if (window.lucide) lucide.createIcons();
    calculateFinTotal();
}

function removeFinRow(id) {
    const row = document.getElementById(id);
    if (row) row.remove();
    calculateFinTotal();
}

function calculateFinTotal() {
    let totalItems = 0;
    let countItems = 0;

    // Itens
    document.querySelectorAll('.item-row-v2:not([id^="add-"])').forEach(row => {
        const qtdInput = row.querySelector('.item-qtd');
        const unitInput = row.querySelector('.item-unit');
        if (!qtdInput || !unitInput) return;

        const qtd = parseFloat(qtdInput.value) || 0;
        const unit = parseFloat(unitInput.value) || 0;
        const sub = qtd * unit;
        totalItems += sub;
        countItems++;
        row.querySelector('.item-total').value = sub.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    });

    // Adicionais
    let totalAdds = 0;
    let countAdds = 0;
    document.querySelectorAll('.add-val').forEach(input => {
        totalAdds += parseFloat(input.value) || 0;
        countAdds++;
    });

    const finalTotal = totalItems + totalAdds;

    document.getElementById('totalVisual').innerText = finalTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    document.getElementById('summaryText').innerText = `${countItems} itens + ${countAdds} adicionais`;

    // Atualiza parcelas se estiverem visíveis
    if (document.getElementById('installmentsWrapper').style.display !== 'none') {
        generateInstallmentFields(finalTotal);
    }

    return finalTotal;
}

// A inicialização e os event listeners agora estão unificados no topo do arquivo.

function setupEventListeners() {
    const entryForm = document.getElementById('entryForm');
    const paymentForm = document.getElementById('paymentForm');
    const fornecedorForm = document.getElementById('fornecedorForm');
    const planoForm = document.getElementById('planoForm');
    const custoForm = document.getElementById('custoForm');
    const bankForm = document.getElementById('bankForm');
    const formaForm = document.getElementById('formaForm');

    const receberForm = document.getElementById('receberForm');

    if (entryForm) entryForm.addEventListener('submit', handleEntrySubmit);
    if (receberForm) receberForm.addEventListener('submit', handleReceberSubmit);
    if (paymentForm) paymentForm.addEventListener('submit', handlePayment);
    if (fornecedorForm) fornecedorForm.addEventListener('submit', handleFornecedorSubmit);
    if (planoForm) planoForm.addEventListener('submit', handlePlanoSubmit);
    if (custoForm) custoForm.addEventListener('submit', handleCustoSubmit);
    if (bankForm) bankForm.addEventListener('submit', handleBankSubmit);
    if (formaForm) formaForm.addEventListener('submit', handleFormaSubmit);

    const bulkPaymentForm = document.getElementById('bulkPaymentForm');
    if (bulkPaymentForm) bulkPaymentForm.addEventListener('submit', handleBulkPayment);

    // Aplicar máscaras de CPF/CNPJ e Telefone no Fornecedor
    applyMask(document.getElementById('fDoc'), maskCnpjCpf);
    applyMask(document.getElementById('fTel'), maskTelefone);

    // Listeners para automação do Receber
    const recData = document.getElementById('receberData');
    const recPrazo = document.getElementById('receberPrazo');
    if (recData) recData.addEventListener('change', calculateReceberForecast);
    if (recPrazo) recPrazo.addEventListener('input', calculateReceberForecast);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const activeModal = document.querySelector('.modal-overlay.active');
            if (activeModal) closeModal(activeModal.id);
        }
    });

    // Auto-calculo de total ao abrir/alterar campos? 
}

async function viewEntry(id) {
    console.log("Visualizando lançamento ID:", id);
    try {
        const l = state.lancamentos.find(item => item.id === id);
        if (!l) {
            console.error("Lançamento não encontrado no estado local:", id);
            return showToast("Lançamento não encontrado.", "error");
        }

        const modal = document.getElementById('viewModal');
        if (!modal) {
            console.error("Elemento #viewModal não encontrado no HTML");
            return;
        }

        // 1. Preencher Dados Básicos (Sincrono)
        document.getElementById('viewCod').innerText = l.codigo_sequencial || '-';
        document.getElementById('viewValor').innerText = formatCurrency(l.valor_total);
        document.getElementById('viewVenc').innerText = formatDate(l.data_vencimento);
        document.getElementById('viewEntidade').innerText = l.entidade_nome || '-';
        document.getElementById('viewEmissao').innerText = `Emissão: ${formatDate(l.data_emissao)}`;
        document.getElementById('viewDoc').innerText = `NF: ${l.num_nf || '-'} | Série: ${l.serie_nf || '-'}`;
        
        const statusEl = document.getElementById('viewStatus');
        
        // Lógica de Vencimento Dinâmico (Sincronizado com a listagem)
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const dataVenc = new Date((l.data_vencimento || l.previsao_pagamento || l.data_emissao) + 'T00:00:00');
        const isOverdue = dataVenc < hoje && l.status === 'ABERTO';

        if (isOverdue) {
            statusEl.innerText = 'ATRASADO';
            statusEl.className = `status-badge status-atrasado`;
        } else {
            statusEl.innerText = l.status;
            statusEl.className = `status-badge status-${l.status.toLowerCase()}`;
        }

        const cat = state.categorias.find(c => c.id === l.categoria_id);
        document.getElementById('viewCategoria').innerText = `Categoria: ${cat ? `${cat.codigo} - ${cat.nome}` : '-'}`;

        const obsEl = document.getElementById('viewObs');
        const obsWrapper = document.getElementById('viewObsWrapper');
        if (l.observacoes) {
            obsEl.innerText = l.observacoes;
            obsWrapper.style.display = 'block';
        } else {
            obsWrapper.style.display = 'none';
        }

        // Detalhamento de Tributos e Líquido
        const taxWrapper = document.getElementById('viewTaxWrapper');
        if (l.tipo === 'RECEBER' || (l.valor_inss || l.valor_iss || l.valor_ir)) {
            taxWrapper.style.display = 'block';
            document.getElementById('viewINSS').innerText = formatCurrency(l.valor_inss || 0);
            document.getElementById('viewISS').innerText = formatCurrency(l.valor_iss || 0);
            document.getElementById('viewIR').innerText = formatCurrency(l.valor_ir || 0);
            
            const vBruto = parseFloat(l.valor_total) || 0;
            const vTributo = parseFloat(l.valor_tributo_total) || 0;
            document.getElementById('viewLiquido').innerText = formatCurrency(vBruto - vTributo);
        } else {
            taxWrapper.style.display = 'none';
        }

        // Abrir modal imediatamente para feedback visual
        modal.classList.add('active');
        if (window.lucide) lucide.createIcons();

        // 2. Carregar Itens e Parcelas (Assíncrono)
        try {
            // Chamadas explícitas e limpas ao Supabase
            const { data: itens, error: errItens } = await supabaseClient
                .from('fin_lancamento_itens')
                .select('*')
                .eq('lancamento_id', id);

            const { data: parcelas, error: errParc } = await supabaseClient
                .from('fin_lancamento_parcelas')
                .select('*')
                .eq('lancamento_id', id)
                .order('numero_parcela');

            if (errItens) console.error("Erro Itens:", errItens);
            if (errParc) console.error("Erro Parcelas:", errParc);

            console.log("Dados retornados do banco - Itens:", itens);
            
            const itemsList = document.getElementById('viewItemsList');
            // Se houver itens detalhados, renderiza a lista
            if (itens && itens.length > 0) {
                itemsList.innerHTML = itens.map(i => `
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);">
                        <td style="padding: 0.8rem;">
                            <div style="font-weight:600;">${i.descricao || 'Item sem descrição'}</div>
                            <div style="font-size:0.75rem; color:#94a3b8;">${i.tipo}</div>
                        </td>
                        <td style="padding: 0.8rem; text-align:center;">${i.quantidade}</td>
                        <td style="padding: 0.8rem; text-align:right;">${formatCurrency(i.valor_unitario)}</td>
                        <td style="padding: 0.8rem; text-align:right; font-weight:700;">${formatCurrency(i.quantidade * i.valor_unitario)}</td>
                    </tr>
                `).join('');
            } else {
                // Fallback: Se não houver itens detalhados, mostra a descrição principal do lançamento
                itemsList.innerHTML = `
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);">
                        <td style="padding: 0.8rem;">
                            <div style="font-weight:600;">${l.descricao || 'Lançamento Geral'}</div>
                            <div style="font-size:0.75rem; color:#94a3b8;">SINTÉTICO</div>
                        </td>
                        <td style="padding: 0.8rem; text-align:center;">1</td>
                        <td style="padding: 0.8rem; text-align:right;">${formatCurrency(l.valor_total)}</td>
                        <td style="padding: 0.8rem; text-align:right; font-weight:700;">${formatCurrency(l.valor_total)}</td>
                    </tr>
                `;
            }

            const parcWrapper = document.getElementById('viewParcelasWrapper');
            const parcList = document.getElementById('viewParcelasList');
            if (parcelas && parcelas.length > 0) {
                parcWrapper.style.display = 'block';
                parcList.innerHTML = parcelas.map(p => `
                    <div style="background: rgba(255,255,255,0.03); padding: 1rem; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);">
                        <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem;">
                            <span style="font-weight:800; color:#818cf8; font-size:0.75rem;">PARCELA #${p.numero_parcela}</span>
                            <span class="status-badge status-${p.status.toLowerCase()}" style="font-size:0.6rem; padding:2px 8px;">${p.status}</span>
                        </div>
                        <div style="font-weight:700; font-size:1.1rem; margin-bottom:0.2rem;">${formatCurrency(p.valor)}</div>
                        <div style="font-size:0.75rem; color:#94a3b8;">Venc: ${formatDate(p.data_vencimento)}</div>
                    </div>
                `).join('');
            } else {
                parcWrapper.style.display = 'none';
            }
        } catch (dbErr) {
            console.error("Erro ao buscar detalhes no DB:", dbErr);
        }
    } catch (err) {
        console.error("Erro crítico em viewEntry:", err);
        showToast("Erro ao abrir detalhes: " + err.message, "error");
    }
}

function importData(tipo, input) { alert('Importação via CSV em desenvolvimento.'); }
function exportToExcel(tipo) { alert('Exportação em preparação.'); }

function switchSubTab(tabId) {
    document.querySelectorAll('.subtab-item').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.subtab-content').forEach(content => content.classList.remove('active'));

    event.target.classList.add('active');
    document.getElementById('subtab-' + tabId).classList.add('active');
    renderConfig();
}

function renderConfig() {
    // 1. Fornecedores
    const fornList = document.getElementById('fornecedoresList');
    if (fornList) {
        fornList.innerHTML = state.fornecedores.map(f => `
            <tr>
                <td style="font-weight:700">${f.nome}</td>
                <td>${f.cnpj_cpf || '-'}</td>
                <td><span class="badge secondary">${f.categoria || 'Geral'}</span></td>
                <td style="font-size:0.8rem">${f.contato || f.email || '-'}</td>
                <td>
                    <div class="table-actions">
                        <button class="btn-edit" onclick="openFornecedorModal('${f.id}')"><i data-lucide="edit"></i></button>
                        <button class="btn-delete" onclick="deleteFornecedor('${f.id}')"><i data-lucide="trash"></i></button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    // 2. Contas Bancárias
    const bankList = document.getElementById('bankAccountsList');
    if (bankList) {
        bankList.innerHTML = state.contas.map(c => `
            <div class="conc-item" style="display:flex; justify-content:space-between; align-items:center; padding:1.2rem; border-bottom:1px solid rgba(255,255,255,0.05); background:rgba(255,255,255,0.01); border-radius:12px; margin-bottom:0.8rem;">
                <div style="display:flex; align-items:center; gap:1.2rem;">
                    <div style="width:40px; height:40px; border-radius:10px; background:rgba(92, 96, 245, 0.1); display:flex; align-items:center; justify-content:center; color:var(--primary);">
                        <i data-lucide="landmark"></i>
                    </div>
                    <div>
                        <div style="font-weight:700; font-size:1rem;">${c.nome}</div>
                        <div style="font-size:0.75rem; color:var(--text-muted)">${c.banco || 'BANCO'} | Ag: ${c.agencia} | CC: ${c.numero_conta}</div>
                        ${c.pix ? `<div style="font-size:0.65rem; color:var(--primary); font-weight:700; margin-top:4px;">PIX: ${c.pix}</div>` : ''}
                    </div>
                </div>
                <div style="text-align:right; display:flex; align-items:center; gap:1.5rem;">
                    <div>
                        <div style="font-size:0.65rem; color:var(--text-muted); text-transform:uppercase; font-weight:800;">Saldo Disponível</div>
                        <div style="font-weight:900; font-size:1.4rem; color:#818cf8;">${formatCurrency(c.saldo_atual)}</div>
                    </div>
                    <div class="table-actions">
                        <button class="btn-edit" style="background:rgba(255,255,255,0.05); padding:8px; border-radius:8px;" onclick="openBankAccountModal('${c.id}')"><i data-lucide="edit-2" style="width:16px;"></i></button>
                        <button class="btn-delete" style="background:rgba(255, 71, 87, 0.1); color:#ff4757; padding:8px; border-radius:8px;" onclick="deleteBankItem('${c.id}')"><i data-lucide="trash" style="width:16px;"></i></button>
                    </div>
                </div>
            </div>
        `).join('');
    }

    // 3. Plano de Contas (Hierárquico)
    const planoList = document.getElementById('planoContasTree');
    if (planoList) {
        planoList.innerHTML = state.categorias.map(c => {
            const level = c.codigo.split('.').length;
            const indent = (level - 1) * 20;
            return `
                <div style="padding: 0.8rem; border-bottom: 1px solid rgba(255,255,255,0.02); display:flex; justify-content:space-between; align-items:center; padding-left: ${indent + 10}px;">
                    <div>
                        <strong style="color:var(--primary)">${c.codigo}</strong> ${c.nome}
                        <span class="badge secondary" style="font-size:0.55rem; margin-left:10px;">G${level}</span>
                    </div>
                    <div class="table-actions">
                        <button class="btn-edit" style="padding:4px;" onclick="openPlanoModal('${c.id}')"><i data-lucide="edit" style="width:14px;"></i></button>
                        <button class="btn-delete" style="padding:4px;" onclick="deletePlanoItem('${c.id}')"><i data-lucide="trash" style="width:14px;"></i></button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // 4. Centros de Custo (Hierárquico)
    const ccList = document.getElementById('centroCustoTree');
    if (ccList) {
        ccList.innerHTML = state.centrosCusto.map(c => {
            const level = c.codigo.split('.').length;
            const indent = (level - 1) * 20;
            return `
                <div style="padding: 0.8rem; border-bottom: 1px solid rgba(255,255,255,0.02); display:flex; justify-content:space-between; align-items:center; padding-left: ${indent + 10}px;">
                    <div>
                        <strong style="color:#10b981">${c.codigo}</strong> ${c.nome}
                    </div>
                    <div class="table-actions">
                        <button class="btn-edit" style="padding:4px;" onclick="openCustoModal('${c.id}')"><i data-lucide="edit" style="width:14px;"></i></button>
                        <button class="btn-delete" style="padding:4px;" onclick="deleteCustoItem('${c.id}')"><i data-lucide="trash" style="width:14px;"></i></button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // 5. Formas de Pagamento
    const formasPagamentoList = document.getElementById('formasPagamentoList');
    if (formasPagamentoList) {
        formasPagamentoList.innerHTML = state.formasPagamento.map(f => `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.02);">
                <td style="padding: 0.8rem; font-weight:700;">${f.nome}</td>
                <td style="padding: 0.8rem; text-align: right;">
                    <div class="table-actions">
                        <button class="btn-edit" style="padding:4px;" onclick="openFormaModal('${f.id}')"><i data-lucide="edit-2" style="width:14px;"></i></button>
                        <button class="btn-delete" style="padding:4px; color:#ff4757;" onclick="deleteFormaItem('${f.id}')"><i data-lucide="trash" style="width:14px;"></i></button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    if (window.lucide) lucide.createIcons();
}

// --- Máscaras de Input ---
function maskCnpjCpf(value) {
    if (!value) return '';
    const d = value.replace(/\D/g, '').slice(0, 14);
    const n = d.length;
    if (n === 0) return '';

    if (n <= 11) {
        // CPF: XXX.XXX.XXX-XX
        let r = d;
        if (n > 9) r = d.slice(0,3) + '.' + d.slice(3,6) + '.' + d.slice(6,9) + '-' + d.slice(9);
        else if (n > 6) r = d.slice(0,3) + '.' + d.slice(3,6) + '.' + d.slice(6);
        else if (n > 3) r = d.slice(0,3) + '.' + d.slice(3);
        return r;
    } else {
        // CNPJ: XX.XXX.XXX/XXXX-XX
        let r = d.slice(0,2) + '.' + d.slice(2,5) + '.' + d.slice(5,8) + '/' + d.slice(8,12);
        if (n > 12) r += '-' + d.slice(12,14);
        return r;
    }
}

function maskTelefone(value) {
    if (!value) return '';
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length === 0) return '';
    if (digits.length <= 2) return `(${digits}`;
    if (digits.length <= 6) return `(${digits.slice(0,2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) {
        // (XX) XXXX-XXXX
        return `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6)}`;
    }
    // (XX) X XXXX-XXXX - celular 9 dígitos
    return `(${digits.slice(0,2)}) ${digits.slice(2,3)} ${digits.slice(3,7)}-${digits.slice(7)}`;
}

function applyMask(inputEl, maskFn) {
    if (!inputEl) return;
    inputEl.addEventListener('input', (e) => {
        const pos = e.target.selectionStart;
        const oldLen = e.target.value.length;
        e.target.value = maskFn(e.target.value);
        const newLen = e.target.value.length;
        // Ajusta cursor
        const newPos = pos + (newLen - oldLen);
        try { e.target.setSelectionRange(newPos, newPos); } catch (_) {}
    });
}

// === CRUD FORNECEDORES ===
function openFornecedorModal(id = null) {
    if (typeof canDo === 'function' && !canDo('financeiro_config', id ? 'edit' : 'add')) {
        showToast('Você não tem permissão para esta ação.', 'error');
        return;
    }
    const modal = document.getElementById('fornecedorModal');
    const form = document.getElementById('fornecedorForm');
    const title = document.getElementById('fornecedorModalTitle');

    form.reset();
    document.getElementById('fornecedorId').value = id || '';

    if (id) {
        const forn = state.fornecedores.find(f => f.id === id);
        if (forn) {
            title.innerText = 'Editar Fornecedor';
            document.getElementById('fNome').value = forn.nome;
            document.getElementById('fNomeFantasia').value = forn.nome_fantasia || '';
            document.getElementById('fDoc').value = maskCnpjCpf(forn.cnpj || forn.doc || forn.cnpj_cpf || '');
            document.getElementById('fIE').value = forn.inscricao_estadual || '';
            document.getElementById('fRua').value = forn.endereco || '';
            document.getElementById('fCidade').value = forn.cidade || '';
            document.getElementById('fTel').value = maskTelefone(forn.tel || forn.contato || '');
            document.getElementById('fEmail').value = forn.email || '';
        }
    } else {
        title.innerText = 'Cadastro de Fornecedor';
    }

    modal.classList.add('active');
    if (window.lucide) lucide.createIcons();
}

async function handleFornecedorSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('fornecedorId').value;
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());

    delete data.id;

    try {
        if (id) {
            const { error } = await supabaseClient.from('fornecedores').update(data).eq('id', id);
            if (error) throw error;
        } else {
            const { error } = await supabaseClient.from('fornecedores').insert([data]);
            if (error) throw error;
        }

        showToast('Fornecedor salvo!', 'success');
        closeModal('fornecedorModal');
        await loadInitialData();
        renderConfig();
        updateDropdowns();
    } catch (err) {
        showToast('Erro ao salvar: ' + err.message, 'error');
    }
}

async function deleteFornecedor(id) {
    if (!confirm('Excluir este fornecedor? Ele pode estar vinculado a compras ou abastecimentos.')) return;
    try {
        const { error } = await supabaseClient.from('fornecedores').delete().eq('id', id);
        if (error) throw error;
        await loadInitialData();
        renderConfig();
        updateDropdowns();
        showToast('Fornecedor removido!', 'success');
    } catch (e) { showToast('Erro: ' + e.message, 'error'); }
}

// === CRUD PLANO DE CONTAS ===
function openPlanoModal(id = null) {
    if (typeof canDo === 'function' && !canDo('financeiro_config', id ? 'edit' : 'add')) {
        showToast('Você não tem permissão para esta ação.', 'error');
        return;
    }
    const modal = document.getElementById('planoModal');
    const form = document.getElementById('planoForm');
    const title = document.getElementById('planoModalTitle');

    form.reset();
    document.getElementById('planoId').value = id || '';

    if (id) {
        const item = state.categorias.find(c => c.id === id);
        if (item) {
            title.innerText = 'Editar Conta';
            document.getElementById('planoParentId').value = item.parent_id || '';
            document.getElementById('planoCodigo').value = item.codigo;
            document.getElementById('planoNome').value = item.nome;
            document.getElementById('planoTipo').value = item.tipo;
        }
    } else {
        title.innerText = 'Nova Conta (Plano de Contas)';
        generatePlanoCode();
    }

    modal.classList.add('active');
}

function generatePlanoCode() {
    const parentId = document.getElementById('planoParentId').value;
    const parent = state.categorias.find(c => c.id === parentId);
    const parentCode = parent ? parent.codigo : '';

    // Filtra filhos diretos para achar o próximo número
    let children = [];
    if (parentCode) {
        const parentDotsCount = parentCode.split('.').length;
        children = state.categorias.filter(c => {
            if (!c.codigo || !c.codigo.startsWith(parentCode + '.')) return false;
            return c.codigo.split('.').length === parentDotsCount + 1;
        });
    } else {
        children = state.categorias.filter(c => !c.parent_id && c.codigo && !c.codigo.includes('.'));
    }

    let nextNum = 1;
    if (children.length > 0) {
        const codes = children.map(c => {
            const parts = c.codigo.split('.');
            return parseInt(parts[parts.length - 1]);
        }).filter(n => !isNaN(n));
        nextNum = Math.max(...codes, 0) + 1;
    }

    let code = '';
    if (!parent) {
        code = nextNum.toString();
    } else {
        // Formatação: 1.1 ou 1.1.01 ou 1.1.01.001
        const level = parentCode.split('.').length + 1;
        if (level === 2) code = `${parentCode}.${nextNum}`;
        else if (level === 3) code = `${parentCode}.${nextNum.toString().padStart(2, '0')}`;
        else code = `${parentCode}.${nextNum.toString().padStart(3, '0')}`;
    }

    document.getElementById('planoCodigo').value = code;
}

async function handlePlanoSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('planoId').value;
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    if (!data.parent_id) data.parent_id = null;

    delete data.id;

    try {
        if (id) {
            const { error } = await supabaseClient.from('fin_plano_contas').update(data).eq('id', id);
            if (error) throw error;
        } else {
            const { error } = await supabaseClient.from('fin_plano_contas').insert([data]);
            if (error) throw error;
        }

        showToast('Conta salva!', 'success');
        closeModal('planoModal');
        await loadInitialData();
        renderConfig();
        updateDropdowns();
    } catch (err) {
        showToast('Erro: ' + err.message, 'error');
    }
}

async function deletePlanoItem(id) {
    if (!confirm('Deseja excluir esta conta? Subcontas também serão removidas.')) return;
    try {
        const { error } = await supabaseClient.from('fin_plano_contas').delete().eq('id', id);
        if (error) throw error;
        await loadInitialData();
        renderConfig();
        updateDropdowns();
        showToast('Conta excluída!', 'success');
    } catch (e) { showToast('Erro: ' + e.message, 'error'); }
}

// === CRUD CENTROS DE CUSTO ===
function openCustoModal(id = null) {
    if (typeof canDo === 'function' && !canDo('financeiro_config', id ? 'edit' : 'add')) {
        showToast('Você não tem permissão para esta ação.', 'error');
        return;
    }
    const modal = document.getElementById('custoModal');
    const form = document.getElementById('custoForm');
    const title = document.getElementById('custoModalTitle');

    form.reset();
    document.getElementById('custoId').value = id || '';

    if (id) {
        const item = state.centrosCusto.find(c => c.id === id);
        if (item) {
            title.innerText = 'Editar Centro de Custo';
            document.getElementById('custoParentId').value = item.parent_id || '';
            document.getElementById('custoCodigo').value = item.codigo;
            document.getElementById('custoNome').value = item.nome;
        }
    } else {
        title.innerText = 'Novo Centro de Custo';
        generateCustoCode();
    }

    modal.classList.add('active');
}

function generateCustoCode() {
    const parentId = document.getElementById('custoParentId').value;
    const parent = state.centrosCusto.find(c => c.id === parentId);
    const parentCode = parent ? parent.codigo : '';

    const children = state.centrosCusto.filter(c => c.parent_id === (parentId || null));
    let nextNum = 1;
    if (children.length > 0) {
        const codes = children.map(c => {
            const parts = c.codigo.split('.');
            return parseInt(parts[parts.length - 1]);
        }).filter(n => !isNaN(n));
        nextNum = Math.max(...codes, 0) + 1;
    }

    const code = parent ? `${parentCode}.${nextNum}` : nextNum.toString();
    document.getElementById('custoCodigo').value = code;
}

async function handleCustoSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('custoId').value;
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    if (!data.parent_id) data.parent_id = null;
    delete data.id;

    try {
        if (id) {
            const { error } = await supabaseClient.from('fin_centros_custo').update(data).eq('id', id);
            if (error) throw error;
        } else {
            const { error } = await supabaseClient.from('fin_centros_custo').insert([data]);
            if (error) throw error;
        }

        showToast('Centro de custo salvo!', 'success');
        closeModal('custoModal');
        await loadInitialData();
        renderConfig();
        updateDropdowns();
    } catch (err) {
        showToast('Erro: ' + err.message, 'error');
    }
}

async function deleteCustoItem(id) {
    if (!confirm('Deseja excluir este centro de custo?')) return;
    try {
        const { error } = await supabaseClient.from('fin_centros_custo').delete().eq('id', id);
        if (error) throw error;
        await loadInitialData();
        renderConfig();
        updateDropdowns();
        showToast('Centro de custo excluído!', 'success');
    } catch (e) { showToast('Erro: ' + e.message, 'error'); }
}

// === CRUD CONTAS BANCÁRIAS ===
function openBankAccountModal(id = null) {
    if (typeof canDo === 'function' && !canDo('financeiro_config', id ? 'edit' : 'add')) {
        showToast('Você não tem permissão para esta ação.', 'error');
        return;
    }
    const modal = document.getElementById('bankAccountModal');
    const form = document.getElementById('bankForm');
    const title = document.getElementById('bankModalTitle');

    form.reset();
    document.getElementById('bankId').value = id || '';

    if (id) {
        const item = state.contas.find(c => c.id === id);
        if (item) {
            title.innerText = 'Editar Conta Bancária';
            document.getElementById('bankNome').value = item.nome;
            document.getElementById('bankBanco').value = item.banco || '';
            document.getElementById('bankAgencia').value = item.agencia || '';
            document.getElementById('bankNumero').value = item.numero_conta || '';
            document.getElementById('bankSaldo').value = item.saldo_inicial || 0;
            document.getElementById('bankPix').value = item.pix || '';
        }
    } else {
        title.innerText = 'Nova Conta Bancária';
    }

    modal.classList.add('active');
}

async function handleBankSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('bankId').value;
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    delete data.id;

    // Se for nova conta, saldo_atual = saldo_inicial
    if (!id) data.saldo_atual = data.saldo_inicial;

    try {
        if (id) {
            const { error } = await supabaseClient.from('fin_contas_bancarias').update(data).eq('id', id);
            if (error) throw error;
        } else {
            const { error } = await supabaseClient.from('fin_contas_bancarias').insert([data]);
            if (error) throw error;
        }

        showToast('Conta bancária salva!', 'success');
        closeModal('bankAccountModal');
        await loadInitialData();
        renderConfig();
        updateDropdowns();
    } catch (err) {
        showToast('Erro: ' + err.message, 'error');
    }
}

async function deleteBankItem(id) {
    if (!confirm('Deseja excluir esta conta bancária?')) return;
    try {
        const { error } = await supabaseClient.from('fin_contas_bancarias').delete().eq('id', id);
        if (error) throw error;
        await loadInitialData();
        renderConfig();
        updateDropdowns();
        showToast('Conta excluída!', 'success');
    } catch (e) { showToast('Erro: ' + e.message, 'error'); }
}

// === CRUD FORMAS DE PAGAMENTO ===
function openFormaModal(id = null) {
    if (typeof canDo === 'function' && !canDo('financeiro_config', id ? 'edit' : 'add')) {
        showToast('Você não tem permissão para esta ação.', 'error');
        return;
    }
    const modal = document.getElementById('formaModal');
    const form = document.getElementById('formaForm');
    const title = document.getElementById('formaModalTitle');

    form.reset();
    document.getElementById('formaId').value = id || '';

    if (id) {
        const item = state.formasPagamento.find(f => f.id === id);
        if (item) {
            title.innerText = 'Editar Forma de Pagamento';
            document.getElementById('formaNome').value = item.nome;
        }
    } else {
        title.innerText = 'Nova Forma de Pagamento';
    }

    modal.classList.add('active');
}

async function handleFormaSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('formaId').value;
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    delete data.id;

    try {
        if (id) {
            const { error } = await supabaseClient.from('formas_pagamento').update(data).eq('id', id);
            if (error) throw error;
        } else {
            const { error } = await supabaseClient.from('formas_pagamento').insert([data]);
            if (error) throw error;
        }

        showToast('Forma de pagamento salva!', 'success');
        closeModal('formaModal');
        await loadInitialData();
        renderConfig();
        updateDropdowns();
    } catch (err) {
        showToast('Erro: ' + err.message, 'error');
    }
}

async function deleteFormaItem(id) {
    if (!confirm('Deseja excluir esta forma de pagamento?')) return;
    try {
        const { error } = await supabaseClient.from('formas_pagamento').delete().eq('id', id);
        if (error) throw error;
        await loadInitialData();
        renderConfig();
        updateDropdowns();
        showToast('Forma excluída!', 'success');
    } catch (e) { showToast('Erro: ' + e.message, 'error'); }
}

// ==========================================
// SELEÇÃO E AÇÕES EM LOTE
// ==========================================

let selectedType = 'PAGAR'; // Controla qual tipo de lote está ativo

window.toggleSelectAll = (tipo, masterCheckbox) => {
    selectedType = tipo;
    const tbody = document.getElementById(`tbody-${tipo.toLowerCase()}`);
    if (!tbody) return;
    
    const checkboxes = tbody.querySelectorAll('.chk-bulk-select');
    checkboxes.forEach(chk => chk.checked = masterCheckbox.checked);
    
    window.updateBulkActionBar(tipo);
};

window.updateBulkActionBar = (tipo) => {
    selectedType = tipo;
    const tbody = document.getElementById(`tbody-${tipo.toLowerCase()}`);
    if (!tbody) return;
    
    const checked = tbody.querySelectorAll('.chk-bulk-select:checked');
    const bar = document.getElementById('bulkActionsBar');
    const countSpan = document.getElementById('bulkSelectedCount');
    
    if (checked.length > 0) {
        if (countSpan) countSpan.innerText = checked.length;
        if (bar) bar.style.display = 'flex';
    } else {
        if (bar) bar.style.display = 'none';
        // Desmarcar master checkbox se tudo foi desmarcado
        const masterChk = document.getElementById(`chkAll${tipo === 'PAGAR' ? 'Pagar' : 'Receber'}`);
        if (masterChk) masterChk.checked = false;
    }
};

window.openBulkPaymentModal = () => {
    const modal = document.getElementById('bulkPaymentModal');
    const form = document.getElementById('bulkPaymentForm');
    if (!modal || !form) return;
    
    form.reset();
    document.getElementById('bulkPayData').value = new Date().toISOString().split('T')[0];
    
    const selectConta = document.getElementById('bulkPayConta');
    selectConta.innerHTML = state.contas.map(c => `<option value="${c.id}">${c.nome} (Saldo: ${formatCurrency(c.saldo_atual)})</option>`).join('');
    
    modal.classList.add('active');
};

// Enviar formulário de baixa em lote
async function handleBulkPayment(e) {
    e.preventDefault();
    const dataPagamento = document.getElementById('bulkPayData').value;
    const contaId = document.getElementById('bulkPayConta').value;
    const forma = document.getElementById('bulkPayForma').value;
    
    const tbody = document.getElementById(`tbody-${selectedType.toLowerCase()}`);
    if (!tbody) return;
    
    const checked = tbody.querySelectorAll('.chk-bulk-select:checked');
    if (checked.length === 0) return;
    
    const ids = Array.from(checked).map(chk => chk.value);
    
    try {
        const conta = state.contas.find(c => c.id === contaId);
        if (!conta) throw new Error('Conta bancária inválida');
        
        let totalPagoLote = 0;
        let countSucesso = 0;
        
        for (const id of ids) {
            const l = state.lancamentos.find(item => item.id === id);
            if (!l || l.status === 'PAGO') continue;
            
            const valorRestante = l.valor_total - l.valor_pago;
            const novoValorPago = l.valor_total; // Baixa total no lote
            
            // 1. Atualizar o lançamento
            const { error: errL } = await supabaseClient.from('fin_lancamentos').update({
                valor_pago: novoValorPago,
                status: 'PAGO',
                data_pagamento: dataPagamento,
                conta_bancaria_id: contaId,
                forma_pagamento: forma
            }).eq('id', id);
            
            if (errL) {
                console.error(`Erro ao baixar lançamento ${id}:`, errL);
                continue;
            }
            
            const fator = l.tipo === 'PAGAR' ? -1 : 1;
            totalPagoLote += (valorRestante * fator);
            countSucesso++;
        }
        
        // 2. Atualizar o saldo da conta uma única vez para o lote inteiro
        if (countSucesso > 0) {
            const novoSaldo = parseFloat(conta.saldo_atual) + totalPagoLote;
            const { error: errC } = await supabaseClient.from('fin_contas_bancarias').update({
                saldo_atual: novoSaldo
            }).eq('id', contaId);
            
            if (errC) console.error("Erro ao atualizar saldo da conta:", errC);
        }
        
        closeModal('bulkPaymentModal');
        await loadInitialData();
        renderAll();
        showToast(`${countSucesso} lançamentos baixados com sucesso!`, 'success');
        
        // Esconder barra
        const bar = document.getElementById('bulkActionsBar');
        if (bar) bar.style.display = 'none';
        
    } catch (err) {
        showToast('Erro na baixa em lote: ' + err.message, 'error');
    }
}

window.deleteBulkSelected = async () => {
    const tbody = document.getElementById(`tbody-${selectedType.toLowerCase()}`);
    if (!tbody) return;
    
    const checked = tbody.querySelectorAll('.chk-bulk-select:checked');
    if (checked.length === 0) return;
    
    const ids = Array.from(checked).map(chk => chk.value);
    
    if (!confirm(`Deseja realmente excluir ${ids.length} lançamentos selecionados?`)) return;
    
    openPinModal(async () => {
        try {
            let countSucesso = 0;
            const comprasParaReverter = new Set();
            
            for (const id of ids) {
                const l = state.lancamentos.find(item => item.id === id);
                if (l && l.compra_id) {
                    comprasParaReverter.add(l.compra_id);
                }
                const { error } = await supabaseClient.from('fin_lancamentos').delete().eq('id', id);
                if (!error) countSucesso++;
            }
            
            // Reverter integrado_financeiro para as compras que não possuem mais nenhum lançamento ativo
            for (const compraId of comprasParaReverter) {
                const { data: outros } = await supabaseClient
                    .from('fin_lancamentos')
                    .select('id')
                    .eq('compra_id', compraId);
                
                if (!outros || outros.length === 0) {
                    await supabaseClient
                        .from('compras')
                        .update({ integrado_financeiro: false, data_integracao: null })
                        .eq('id', compraId);
                }
            }
            
            await loadInitialData();
            renderAll();
            showToast(`${countSucesso} lançamentos excluídos!`, 'success');
            
            const bar = document.getElementById('bulkActionsBar');
            if (bar) bar.style.display = 'none';
            
        } catch (err) {
            showToast('Erro ao excluir: ' + err.message, 'error');
        }
    });
};


// ==========================================
// CONCILIAÇÃO BANCÁRIA (OFX / CSV)
// ==========================================
state.extratoParsed = [];
state.selectedExtratoItem = null;

window.handleOFXUpload = function(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const text = e.target.result;
            
            // Parser Simples de OFX (SGML/XML)
            const transactions = [];
            const regex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/g;
            let match;
            
            while ((match = regex.exec(text)) !== null) {
                const content = match[1];
                
                const trntype = getValue(content, 'TRNTYPE');
                const dtposted = getValue(content, 'DTPOSTED');
                const trnamt = getValue(content, 'TRNAMT');
                const fitid = getValue(content, 'FITID');
                const memo = getValue(content, 'MEMO') || getValue(content, 'NAME') || 'Transação Bancária';
                
                if (trnamt && dtposted) {
                    const amount = parseFloat(trnamt);
                    const rawDate = dtposted.substring(0, 8); // YYYYMMDD
                    const formattedDate = `${rawDate.substring(0, 4)}-${rawDate.substring(4, 6)}-${rawDate.substring(6, 8)}`;
                    
                    transactions.push({
                        id: fitid || 'fit-' + Math.random().toString(36).substr(2, 9),
                        tipo: amount < 0 ? 'DEBIT' : 'CREDIT',
                        data: formattedDate,
                        valor: amount,
                        descricao: memo
                    });
                }
            }
            
            if (transactions.length === 0) {
                // Tenta parser CSV simples se não for OFX
                const lines = text.split('\n');
                lines.forEach((line, idx) => {
                    if (idx === 0 || !line.trim()) return;
                    const cols = line.split(/[;,]/);
                    if (cols.length >= 3) {
                        const rawDate = cols[0].replace(/\D/g, ''); // tentar DDMMAAAA ou AAAAMMDD
                        let date = new Date().toISOString().split('T')[0];
                        if (rawDate.length === 8) {
                            date = `${rawDate.substring(4, 8)}-${rawDate.substring(2, 4)}-${rawDate.substring(0, 2)}`;
                        }
                        const memo = cols[1].replace(/["']/g, '').trim();
                        const amount = parseFloat(cols[2].replace(',', '.'));
                        if (!isNaN(amount)) {
                            transactions.push({
                                id: 'csv-' + idx + '-' + Math.random().toString(36).substr(2, 5),
                                tipo: amount < 0 ? 'DEBIT' : 'CREDIT',
                                data: date,
                                valor: amount,
                                descricao: memo
                            });
                        }
                    }
                });
            }
            
            function getValue(source, tag) {
                const regexTag = new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i');
                const m = source.match(regexTag);
                return m ? m[1].trim() : null;
            }
            
            if (transactions.length > 0) {
                state.extratoParsed = transactions;
                state.selectedExtratoItem = transactions[0]; // seleciona o primeiro por padrão
                showToast(`${transactions.length} transações importadas!`, 'success');
                renderConciliacao();
            } else {
                showToast("Nenhuma transação encontrada no arquivo.", "error");
            }
        } catch (err) {
            console.error("Erro OFX:", err);
            showToast("Falha ao ler arquivo: " + err.message, "error");
        }
    };
    reader.readAsText(file);
    input.value = '';
};

window.renderConciliacao = function() {
    const extratoList = document.getElementById('extratoList');
    const matchList = document.getElementById('matchList');
    if (!extratoList || !matchList) return;

    if (state.extratoParsed.length === 0) {
        extratoList.innerHTML = `
            <div class="empty-state" style="text-align: center; padding: 3rem; color: var(--text-muted);">
                <i data-lucide="info" style="width: 48px; height: 48px; margin-bottom: 1rem; opacity: 0.5;"></i>
                <p>Importe um extrato bancário para começar a conciliação.</p>
            </div>
        `;
        matchList.innerHTML = `
            <div class="empty-state" style="text-align: center; padding: 3rem; color: var(--text-muted);">
                <p>Selecione uma transação do extrato para ver as sugestões de vínculo.</p>
            </div>
        `;
        if (window.lucide) lucide.createIcons();
        return;
    }

    // Renderizar Extrato Bancário
    extratoList.innerHTML = state.extratoParsed.map(item => {
        const isSelected = state.selectedExtratoItem && state.selectedExtratoItem.id === item.id;
        const color = item.valor < 0 ? 'var(--expense)' : 'var(--income)';
        const sign = item.valor < 0 ? '' : '+';
        
        return `
            <div class="conc-item ${isSelected ? 'active' : ''}" 
                 onclick="selectExtratoItem('${item.id}')"
                 style="padding: 1rem; border: 1px solid ${isSelected ? 'var(--primary)' : 'rgba(255,255,255,0.05)'}; 
                        background: ${isSelected ? 'rgba(99, 102, 241, 0.1)' : 'rgba(255,255,255,0.01)'}; 
                        border-radius: 12px; margin-bottom: 0.8rem; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: all 0.2s;">
                <div>
                    <div style="font-weight: 700; font-size: 0.9rem; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.descricao}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">${formatDate(item.data)}</div>
                </div>
                <div style="font-weight: 800; color: ${color}; font-size: 1.1rem; text-align: right;">
                    ${sign}${formatCurrency(item.valor)}
                </div>
            </div>
        `;
    }).join('');

    // Renderizar Sugestões para o Item Selecionado
    const selected = state.selectedExtratoItem;
    if (!selected) {
        matchList.innerHTML = `
            <div class="empty-state" style="text-align: center; padding: 3rem; color: var(--text-muted);">
                <p>Selecione uma transação do extrato.</p>
            </div>
        `;
        return;
    }

    const valorAbs = Math.abs(selected.valor);
    const targetTipo = selected.valor < 0 ? 'PAGAR' : 'RECEBER';

    // Algoritmo de Busca Inteligente de Matches
    const suggestions = state.lancamentos.filter(l => {
        if (l.status === 'PAGO' || l.status === 'CANCELADO') return false;
        if (l.tipo !== targetTipo) return false;
        
        const valDiff = Math.abs(parseFloat(l.valor_total) - valorAbs);
        if (valDiff > 1.5) return false; // Diferença máxima de 1.50 R$

        // Margem de data de até 15 dias
        const lDate = new Date(l.data_vencimento + 'T12:00:00');
        const extDate = new Date(selected.data + 'T12:00:00');
        const dayDiff = Math.abs(lDate - extDate) / (1000 * 60 * 60 * 24);
        
        return dayDiff <= 15;
    });

    // Ordena por maior relevância (diferença de valor e data)
    suggestions.sort((a, b) => {
        const valDiffA = Math.abs(parseFloat(a.valor_total) - valorAbs);
        const valDiffB = Math.abs(parseFloat(b.valor_total) - valorAbs);
        if (valDiffA !== valDiffB) return valDiffA - valDiffB;

        const dateDiffA = Math.abs(new Date(a.data_vencimento + 'T12:00:00') - new Date(selected.data + 'T12:00:00'));
        const dateDiffB = Math.abs(new Date(b.data_vencimento + 'T12:00:00') - new Date(selected.data + 'T12:00:00'));
        return dateDiffA - dateDiffB;
    });

    if (suggestions.length === 0) {
        matchList.innerHTML = `
            <div style="background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.1); border-radius: 16px; padding: 2.5rem; text-align: center;">
                <i data-lucide="search-code" style="width: 36px; height: 36px; color: var(--text-muted); margin-bottom: 1rem; opacity: 0.5;"></i>
                <p style="font-weight: 700; color: #cbd5e1; margin-bottom: 0.5rem;">Nenhuma correspondência exata encontrada</p>
                <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1.5rem;">Não encontramos nenhum lançamento com vencimento próximo e valor de ${formatCurrency(valorAbs)}.</p>
                <button class="btn-primary-new" onclick="lancarConciliacaoRapida()" style="margin: 0 auto; font-size: 0.85rem; padding: 0.6rem 1.2rem;">
                    <i data-lucide="plus-circle"></i> Criar Lançamento Rápido
                </button>
            </div>
        `;
    } else {
        matchList.innerHTML = suggestions.map((s, idx) => {
            const isPerfect = Math.abs(parseFloat(s.valor_total) - valorAbs) < 0.01;
            
            return `
                <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 16px; padding: 1.2rem; margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center; gap: 1rem;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 0.6rem;">
                            <span style="font-weight: 800; font-family: 'JetBrains Mono'; color: var(--primary); font-size: 0.85rem;">#${s.codigo_sequencial || s.id.substring(0,8)}</span>
                            ${isPerfect ? '<span class="status-badge status-pago" style="font-size: 0.65rem; padding: 2px 6px; background: rgba(16, 185, 129, 0.15); color: #10b981;">Sugestão Ideal</span>' : ''}
                        </div>
                        <div style="font-weight: 700; font-size: 1rem; color: white; margin-top: 6px;">${s.entidade_nome || 'Lançamento Geral'}</div>
                        <div style="font-size: 0.8rem; color: #94a3b8; margin-top: 4px;">${s.descricao || ''}</div>
                        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 6px;">Vencimento: ${formatDate(s.data_vencimento)} | Valor: ${formatCurrency(s.valor_total)}</div>
                    </div>
                    <button class="btn-primary" onclick="vincularConciliacao('${s.id}')" style="background: #10b981; border: none; border-radius: 8px; padding: 0.6rem 1.2rem; font-weight: 800; font-size: 0.8rem; cursor: pointer; display: flex; align-items: center; gap: 0.4rem;">
                        <i data-lucide="link"></i> Conciliar
                    </button>
                </div>
            `;
        }).join('');
    }

    if (window.lucide) lucide.createIcons();
};

window.selectExtratoItem = function(id) {
    const item = state.extratoParsed.find(x => x.id === id);
    if (item) {
        state.selectedExtratoItem = item;
        renderConciliacao();
    }
};

window.vincularConciliacao = async function(lancamentoId) {
    const selected = state.selectedExtratoItem;
    const contaId = document.getElementById('concContaSelect').value;
    
    if (!selected || !contaId) {
        showToast("Por favor, selecione uma conta bancária.", "error");
        return;
    }

    try {
        const l = state.lancamentos.find(item => item.id === lancamentoId);
        const conta = state.contas.find(c => c.id === contaId);
        
        if (!l || !conta) throw new Error("Lançamento ou conta não encontrada.");

        // Atualizar lançamento para PAGO
        const { error: errL } = await supabaseClient.from('fin_lancamentos').update({
            status: 'PAGO',
            valor_pago: l.valor_total,
            data_pagamento: selected.data,
            conta_bancaria_id: contaId,
            forma_pagamento: 'TRANSFERENCIA'
        }).eq('id', lancamentoId);

        if (errL) throw errL;

        // Atualizar saldo da conta
        const fator = l.tipo === 'PAGAR' ? -1 : 1;
        const novoSaldo = parseFloat(conta.saldo_atual) + (parseFloat(l.valor_total) * fator);
        const { error: errC } = await supabaseClient.from('fin_contas_bancarias').update({
            saldo_atual: novoSaldo
        }).eq('id', contaId);

        if (errC) throw errC;

        // Remover do extrato temporário local
        state.extratoParsed = state.extratoParsed.filter(x => x.id !== selected.id);
        state.selectedExtratoItem = state.extratoParsed[0] || null;

        showToast("Conciliação efetuada com sucesso!", "success");
        await loadInitialData();
        renderAll();
        renderConciliacao();
    } catch (err) {
        showToast("Erro ao conciliar: " + err.message, "error");
    }
};

window.lancarConciliacaoRapida = async function() {
    const selected = state.selectedExtratoItem;
    const contaId = document.getElementById('concContaSelect').value;
    
    if (!selected || !contaId) return;

    try {
        const conta = state.contas.find(c => c.id === contaId);
        if (!conta) throw new Error("Conta bancária inválida.");

        const valorAbs = Math.abs(selected.valor);
        const record = {
            tipo: selected.valor < 0 ? 'PAGAR' : 'RECEBER',
            data_emissao: selected.data,
            data_vencimento: selected.data,
            data_pagamento: selected.data,
            entidade_nome: 'Transação Extrato',
            valor_total: valorAbs,
            valor_pago: valorAbs,
            status: 'PAGO',
            descricao: selected.descricao,
            conta_bancaria_id: contaId,
            forma_pagamento: 'TRANSFERENCIA'
        };

        const { error: inErr } = await supabaseClient.from('fin_lancamentos').insert([record]);
        if (inErr) throw inErr;

        // Atualizar saldo
        const fator = selected.valor < 0 ? -1 : 1;
        const novoSaldo = parseFloat(conta.saldo_atual) + (valorAbs * fator);
        const { error: errC } = await supabaseClient.from('fin_contas_bancarias').update({
            saldo_atual: novoSaldo
        }).eq('id', contaId);

        if (errC) throw errC;

        state.extratoParsed = state.extratoParsed.filter(x => x.id !== selected.id);
        state.selectedExtratoItem = state.extratoParsed[0] || null;

        showToast("Lançamento rápido criado e conciliado!", "success");
        await loadInitialData();
        renderAll();
        renderConciliacao();
    } catch (err) {
        showToast("Erro ao criar lançamento: " + err.message, "error");
    }
};

window.toggleExportPlanoDropdown = function() {
    const dropdown = document.getElementById('exportPlanoDropdown');
    if (!dropdown) return;
    if (dropdown.style.display === 'none' || !dropdown.style.display) {
        dropdown.style.display = 'block';
    } else {
        dropdown.style.display = 'none';
    }
};

// Fechar dropdown de exportação ao clicar fora
document.addEventListener('click', function(e) {
    const dropdown = document.getElementById('exportPlanoDropdown');
    const btn = document.getElementById('btn-export-plano');
    if (dropdown && btn && !btn.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = 'none';
    }
});

window.exportPlano = function(format) {
    const dropdown = document.getElementById('exportPlanoDropdown');
    if (dropdown) dropdown.style.display = 'none';

    if (!state.categorias || state.categorias.length === 0) {
        showToast('Nenhum plano de contas para exportar.', 'warning');
        return;
    }

    if (format === 'excel') {
        const rows = [
            ['FrotaLink - Plano de Contas'],
            [],
            ['Código', 'Descrição', 'Nível']
        ];
        state.categorias.forEach(c => {
            const level = c.codigo.split('.').length;
            rows.push([c.codigo, c.nome, 'G' + level]);
        });

        try {
            const ws = XLSX.utils.aoa_to_sheet(rows);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Plano de Contas");
            XLSX.writeFile(wb, "Plano_de_Contas.xlsx");
            showToast("Plano de contas exportado em Excel!", "success");
        } catch(e) {
            showToast("Falha ao exportar excel: " + e.message, "error");
        }
    } else if (format === 'pdf') {
        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF('p', 'mm', 'a4');
            
            // Title
            doc.setFontSize(16);
            doc.setTextColor(30, 41, 59); // Slate 800
            doc.text("Plano de Contas", 14, 20);
            
            doc.setFontSize(10);
            doc.setTextColor(100, 116, 139); // Slate 500
            doc.text("Relatório de categorias cadastradas no sistema", 14, 26);
            
            // Build table rows
            const body = state.categorias.map(c => {
                const level = c.codigo.split('.').length;
                return [c.codigo, c.nome, 'G' + level];
            });
            
            doc.autoTable({
                startY: 32,
                head: [['Código', 'Descrição', 'Nível']],
                body: body,
                theme: 'striped',
                headStyles: { fillColor: [92, 96, 245] }, // primary color
                styles: { fontSize: 9 }
            });
            
            doc.save("Plano_de_Contas.pdf");
            showToast("Plano de contas exportado em PDF!", "success");
        } catch(e) {
            console.error(e);
            showToast("Falha ao exportar PDF: " + e.message, "error");
        }
    }
};


