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
    especiesNota: [],
    periodoFluxo: new Date(),
    filtros: {
        PAGAR: { status: 'UNPAID', busca: '', categoria: '', origem: '' },
        RECEBER: { status: 'UNPAID', busca: '', categoria: '', origem: '' }
    },
    sort: {
        PAGAR: { key: 'data_vencimento', dir: 'asc' },
        RECEBER: { key: 'data_vencimento', dir: 'asc' }
    },
    adminMode: true,
    importedXmlCnpj: ""
};

// --- Paginação do Módulo Financeiro (Alinhada com Compras) ---
let currentPagePagar = 1;
let currentPageReceber = 1;
let currentPageFhist = 1;
const financialPageSize = 50;

// --- Inicialização ---
document.addEventListener('DOMContentLoaded', async () => {
    if (typeof window.showLoader === 'function') window.showLoader();
    try {
        initSupabase();
        await loadInitialData();
        renderAll();
        setupEventListeners();
        setupSearchableInputs();
        
        // Abrir aba específica pelo hash da URL (ex: financeiro.html#pagar)
        const hash = window.location.hash.replace('#', '');
        if (hash && ['dashboard', 'pagar', 'receber', 'fluxo', 'conciliacao', 'config'].includes(hash)) {
            switchMainTab(hash);
        }
        
        if (window.lucide) lucide.createIcons();
    } catch (err) {
        console.error("❌ Erro durante a inicialização do módulo financeiro:", err);
    } finally {
        if (typeof window.hideLoader === 'function') window.hideLoader();
    }
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
            let listaClientes = [];
            try {
                const { data: d1 } = await supabaseClient.from('clientes').select('*');
                if (d1 && d1.length) {
                    d1.forEach(item => {
                        const nome = item.nome || item.cliente_nome;
                        if (nome) {
                            listaClientes.push({
                                id: item.id,
                                nome: nome,
                                cnpj_cpf: item.cnpj_cpf || item.cliente_cnpj_cpf,
                                email: item.email || item.cliente_email,
                                contato: item.contato || item.cliente_telefone
                            });
                        }
                    });
                }
            } catch (err) {}

            try {
                const { data: d2 } = await supabaseClient.from('com_contratos').select('*');
                if (d2 && d2.length) {
                    d2.forEach(item => {
                        const name = item.cliente_nome;
                        const doc = item.cliente_cnpj_cpf;
                        if (name || doc) {
                            const existing = listaClientes.find(c => (c.nome || '').toLowerCase().trim() === (name || '').toLowerCase().trim());
                            if (existing) {
                                if (!existing.cnpj_cpf && doc) existing.cnpj_cpf = doc;
                            } else {
                                listaClientes.push({
                                    id: item.id,
                                    nome: name || doc,
                                    cnpj_cpf: doc,
                                    email: item.cliente_email,
                                    contato: item.cliente_telefone
                                });
                            }
                        }
                    });
                }
            } catch (err) {}

            return { data: listaClientes.sort((a,b) => (a.nome||'').localeCompare(b.nome||'')) };
        };

        // Otimização de Performance: Por padrão, carrega apenas contas não totalmente pagas (ABERTO / PARCIAL / PENDENTE)
        // para minimizar a carga no banco de dados e acelerar o tempo de resposta
        let lancQuery = supabaseClient.from('fin_lancamentos')
            .select('*')
            .order('data_vencimento', { ascending: false })
            .limit(1000);

        const [l, c, cat, cc, forn, cl, formas, especies] = await Promise.all([
            lancQuery,
            supabaseClient.from('fin_contas_bancarias').select('*'),
            supabaseClient.from('fin_plano_contas').select('*').order('codigo'),
            supabaseClient.from('fin_centros_custo').select('*').order('codigo'),
            supabaseClient.from('fornecedores').select('*').order('nome'),
            fetchClientesSafely(),
            supabaseClient.from('formas_pagamento').select('*').order('nome'),
            supabaseClient.from('especies_nota').select('*').order('nome')
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
        state.especiesNota = especies.data || [];

        updateDropdowns();
        renderAll();
    } catch (err) {
        console.error('Erro ao carregar dados:', err);
    }
}

// --- Navegação ---
function switchMainTab(tabId) {
    // 1. Ocultar todas as seções de abas
    document.querySelectorAll('.tab-content').forEach(c => {
        c.classList.remove('active');
        c.style.display = 'none';
    });

    // 2. Desativar todos os botões de abas
    document.querySelectorAll('.tab-item').forEach(b => b.classList.remove('active'));

    // 3. Exibir a seção ativada
    const tabEl = document.getElementById(`tab-${tabId}`);
    if (tabEl) {
        tabEl.classList.add('active');
        tabEl.style.display = 'block';
    }

    // 4. Marcar o botão correspondente como ativo
    document.querySelectorAll('.tab-item').forEach(btn => {
        const attr = btn.getAttribute('onclick') || '';
        if (attr.includes(`'${tabId}'`)) {
            btn.classList.add('active');
        }
    });

    // 5. Executar atualizações dinâmicas da aba de forma 100% segura
    try {
        if (tabId === 'pagar' && typeof renderLancamentos === 'function') {
            renderLancamentos('PAGAR');
        } else if (tabId === 'receber' && typeof renderLancamentos === 'function') {
            renderLancamentos('RECEBER');
        } else if (tabId === 'fluxo' && typeof renderFluxo === 'function') {
            renderFluxo();
        } else if (tabId === 'config' && typeof renderConfig === 'function') {
            renderConfig();
        } else if ((tabId === 'relatorios' || tabId === 'historico') && typeof fhistPopulateSelects === 'function') {
            fhistPopulateSelects();
        }
    } catch (e) {
        console.error('[switchMainTab] Erro ao atualizar visualização da aba:', e);
    }
}

window.switchMainTab = switchMainTab;

function toggleAdminMode(tipo) {
    // Modo edição removido. As opções de ação agora estão sempre visíveis.
    console.log("Modo edição unificado.");
}

// --- Configuração de Ordenação Semântica ---
const COL_DEFS = {
    PAGAR: [
        { key: 'codigo_sequencial', label: 'Cód.', sortable: true },
        { key: 'data_vencimento', label: 'Vencimento', sortable: true },
        { key: 'entidade_nome', label: 'Fornecedor / Favorecido', sortable: true },
        { key: 'descricao', label: 'Descrição Principal', sortable: true },
        { key: 'valor_total', label: 'Valor Total', sortable: true, align: 'right' },
        { key: 'valor_pago', label: 'Valor Pago', sortable: true, align: 'right' },
        { key: 'status', label: 'Status', sortable: true },
        { key: 'centro_custo_id', label: 'Centro Custo', sortable: true },
        { key: 'actions', label: 'Ações', sortable: false, align: 'center' }
    ],
    RECEBER: [
        { key: 'codigo_sequencial', label: 'Cód.', sortable: true },
        { key: 'previsao_pagamento', label: 'Previsão', sortable: true },
        { key: 'entidade_nome', label: 'Cliente', sortable: true },
        { key: 'descricao', label: 'Descrição', sortable: true },
        { key: 'tipo_nota', label: 'Tipo / Pgto', sortable: true },
        { key: 'valor_total', label: 'Vlr. Bruto', sortable: true, align: 'right' },
        { key: 'valor_liquido', label: 'Vlr. Líquido', sortable: true, align: 'right' },
        { key: 'status', label: 'Status', sortable: true },
        { key: 'data_competencia', label: 'Competência', sortable: true },
        { key: 'actions', label: 'Ações', sortable: false, align: 'center' }
    ]
};

function renderThead(tipo) {
    const table = document.getElementById(`table-${tipo.toLowerCase()}`);
    if (!table) return;
    const thead = table.querySelector('thead');
    if (!thead) return;

    const cols = COL_DEFS[tipo];
    const sort = state.sort[tipo];
    const chkId = tipo === 'PAGAR' ? 'chkAllPagar' : 'chkAllReceber';

    thead.innerHTML = `
        <tr>
            <th style="width: 40px; text-align: center; vertical-align: middle;">
                <input type="checkbox" id="${chkId}" onclick="toggleSelectAll('${tipo}', this)">
            </th>
            ${cols.map(c => {
                const isCurrent = sort.key === c.key;
                let icon = '';
                if (c.sortable) {
                    if (isCurrent) {
                        icon = sort.dir === 'asc' 
                            ? '<i data-lucide="chevron-up" style="width:14px; color:var(--primary);"></i>' 
                            : '<i data-lucide="chevron-down" style="width:14px; color:var(--primary);"></i>';
                    } else {
                        icon = '<i data-lucide="chevrons-up-down" style="width:12px; opacity:0.2;"></i>';
                    }
                }
                const alignStyle = c.align ? `text-align:${c.align};` : '';
                const cursorStyle = c.sortable ? 'cursor:pointer; user-select:none;' : '';
                const justify = c.align === 'right' ? 'flex-end' : (c.align === 'center' ? 'center' : 'flex-start');

                return `
                    <th ${c.sortable ? `onclick="handleSort('${tipo}', '${c.key}')"` : ''} 
                        style="${alignStyle} ${cursorStyle} transition: all 0.2s;" 
                        class="${c.sortable ? 'sortable-header' : ''} ${isCurrent ? 'active-sort' : ''}">
                        <div style="display:flex; align-items:center; gap:0.5rem; justify-content: ${justify}">
                            ${c.label}
                            ${c.sortable ? `<span class="sort-icon-wrapper" style="display:flex; align-items:center;">${icon}</span>` : ''}
                        </div>
                    </th>`;
            }).join('')}
        </tr>
    `;
    if (window.lucide) lucide.createIcons();
}

window.handleSort = (tipo, key) => {
    if (state.sort[tipo].key === key) {
        state.sort[tipo].dir = state.sort[tipo].dir === 'asc' ? 'desc' : 'asc';
    } else {
        state.sort[tipo].key = key;
        state.sort[tipo].dir = 'asc';
    }
    renderLancamentos(tipo);
};

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

    renderThead(tipo);

    // Reset master checkbox
    const masterChk = document.getElementById(`chkAll${tipo === 'PAGAR' ? 'Pagar' : 'Receber'}`);
    if (masterChk) masterChk.checked = false;

    // 1. Filter & Sort
    const filter = state.filtros[tipo];
    const sort = state.sort[tipo];

    let filtered = state.lancamentos.filter(l => l.tipo === tipo);

    if (filter.status) {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        if (filter.status === 'UNPAID') {
            filtered = filtered.filter(l => l.status !== 'PAGO' && l.status !== 'CANCELADO');
        } else if (filter.status === 'ATRASADO') {
            filtered = filtered.filter(l => {
                const dataVenc = new Date((l.data_vencimento || l.previsao_pagamento || l.data_emissao) + 'T00:00:00');
                return dataVenc < hoje && l.status === 'ABERTO';
            });
        } else if (filter.status === 'ABERTO') {
            filtered = filtered.filter(l => {
                const dataVenc = new Date((l.data_vencimento || l.previsao_pagamento || l.data_emissao) + 'T00:00:00');
                return dataVenc >= hoje && l.status === 'ABERTO';
            });
        } else {
            filtered = filtered.filter(l => l.status === filter.status);
        }
    }
    if (filter.categoria) filtered = filtered.filter(l => l.centro_custo_id === filter.categoria);
    if (filter.origem) {
        if (filter.origem === 'COMPRAS') {
            filtered = filtered.filter(l => l.origem_modulo === 'COMPRAS' || l.compra_id != null);
        } else if (filter.origem === 'MANUTENCAO') {
            filtered = filtered.filter(l => l.origem_modulo === 'MANUTENCAO' || l.manutencao_id != null);
        } else if (filter.origem === 'MANUAL') {
            filtered = filtered.filter(l => (!l.origem_modulo || l.origem_modulo === 'MANUAL') && !l.compra_id && !l.manutencao_id);
        } else {
            filtered = filtered.filter(l => l.origem_modulo === filter.origem);
        }
    }
    if (filter.busca) {
        const b = filter.busca.toLowerCase();
        filtered = filtered.filter(l =>
            (l.descricao || '').toLowerCase().includes(b) ||
            (l.entidade_nome || '').toLowerCase().includes(b) ||
            (l.codigo_sequencial || '').toLowerCase().includes(b) ||
            (l.num_nf || '').toLowerCase().includes(b)
        );
    }

    filtered.sort((a, b) => {
        let vA = a[sort.key], vB = b[sort.key];
        if (sort.key.includes('data') || sort.key === 'previsao_pagamento' || sort.key === 'data_competencia') { 
            vA = new Date(vA || 0); 
            vB = new Date(vB || 0); 
        }
        else if (sort.key === 'valor_total' || sort.key === 'valor_pago' || sort.key === 'valor_liquido') {
            if (sort.key === 'valor_liquido') {
                vA = (parseFloat(a.valor_total) || 0) - (parseFloat(a.valor_tributo_total) || 0);
                vB = (parseFloat(b.valor_total) || 0) - (parseFloat(b.valor_tributo_total) || 0);
            } else {
                vA = parseFloat(vA) || 0;
                vB = parseFloat(vB) || 0;
            }
        } else {
            vA = (vA || '').toString().toLowerCase();
            vB = (vB || '').toString().toLowerCase();
        }
        if (vA < vB) return sort.dir === 'asc' ? -1 : 1;
        if (vA > vB) return sort.dir === 'asc' ? 1 : -1;
        return 0;
    });

    // 2. Lógica de Paginação (Client-Side Pagination)
    const totalRecords = filtered.length;
    let page = tipo === 'PAGAR' ? currentPagePagar : currentPageReceber;
    const totalPages = Math.ceil(totalRecords / financialPageSize) || 1;
    if (page > totalPages) page = totalPages;
    if (page < 1) page = 1;

    if (tipo === 'PAGAR') currentPagePagar = page;
    else currentPageReceber = page;

    const startIdx = (page - 1) * financialPageSize;
    const endIdx = startIdx + financialPageSize;
    const pageRecords = filtered.slice(startIdx, endIdx);

    updateFinancialPaginationUI(tipo, totalRecords, startIdx, endIdx, totalPages, page);

    // 3. Render Table
    tbody.innerHTML = pageRecords.map(l => {
        const cat = state.categorias.find(c => c.id === l.categoria_id);
        const cc = state.centrosCusto.find(c => c.id === l.centro_custo_id);
        
        // Lógica de Vencimento e Status
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const dateStr = l.previsao_pagamento || l.data_vencimento || l.data_emissao;
        const dataVenc = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
        const isDatePast = dataVenc < hoje;
        
        let isOverdue = false;
        let displayStatus = l.status;
        let statusClass = `status-${l.status.toLowerCase()}`;
        
        if (l.status === 'ABERTO') {
            if (isDatePast) {
                isOverdue = true;
                displayStatus = 'ATRASADO';
                statusClass = 'status-atrasado';
            }
        } else if (l.status === 'PARCIAL') {
            if (isDatePast) {
                isOverdue = true;
                displayStatus = 'PARCIAL';
                statusClass = 'status-atrasado'; // Badge Vermelho + linha vermelha para PARCIAL Atrasado
            } else {
                displayStatus = 'PARCIAL';
                statusClass = 'status-aberto';   // Badge Laranja para PARCIAL em Aberto (no prazo)
            }
        }

        if (tipo === 'RECEBER') {
            const vBruto = parseFloat(l.valor_total) || 0;
            const vTributo = parseFloat(l.valor_tributo_total) || 0;
            const vLiquido = vBruto - vTributo;
            const vPago = parseFloat(l.valor_pago) || 0;
            const vFalta = Math.max(0, vLiquido - vPago);
            const competencia = l.data_competencia ? l.data_competencia.substring(0, 7) : '-';

            return `
                <tr class="${isOverdue ? 'overdue-row' : ''}">
                    <td style="text-align: center; vertical-align: middle;">
                        <input type="checkbox" class="chk-bulk-select" value="${l.id}" onchange="updateBulkActionBar('${tipo}')">
                    </td>
                    <td data-label="Código">
                        <div onclick="viewEntry('${l.id}')" class="clickable-view-link" style="font-weight:800; color:var(--primary); font-family:'JetBrains Mono'; cursor:pointer;" title="Clique para visualizar os detalhes">${l.codigo_sequencial || '-'}</div>
                    </td>
                    <td data-label="Previsão">
                        <div style="font-weight:700">${formatDate(l.previsao_pagamento || l.data_vencimento)}</div>
                    </td>
                    <td data-label="Cliente">
                        <div onclick="viewEntry('${l.id}')" class="clickable-view-link" style="font-weight:700; cursor:pointer;" title="Clique para visualizar os detalhes">${l.entidade_nome || '-'}</div>
                    </td>
                    <td data-label="Descrição">
                        ${l.num_nf ? `<div onclick="viewEntry('${l.id}')" class="clickable-view-link" style="font-size:0.75rem; font-weight:700; color:var(--primary); margin-bottom:2px; cursor:pointer;" title="Clique para visualizar os detalhes">NF/Doc: ${l.num_nf}${l.serie_nf ? ' (Série ' + l.serie_nf + ')' : ''}</div>` : ''}
                        <div style="font-size:0.85rem">${l.descricao}</div>
                    </td>
                    <td data-label="Tipo/Pgto">
                        <div style="display:flex; flex-direction:column; gap:2px; align-items:flex-start;">
                            <span style="font-size:0.68rem; font-weight:800; color:#0284c7; background:rgba(2,132,199,0.12); padding:1px 6px; border-radius:4px; line-height:1.2; display:inline-block;">${l.tipo_nota || '-'}</span>
                            <span style="font-size:0.68rem; font-weight:800; color:#6b21a8; background:rgba(147,51,234,0.12); padding:1px 6px; border-radius:4px; line-height:1.2; display:inline-block;">${l.forma_pagamento || '-'}</span>
                        </div>
                    </td>
                    <td data-label="Vlr. Bruto" style="text-align:right; font-weight:700">${formatCurrency(vBruto)}</td>
                    <td data-label="Vlr. Líquido" style="text-align:right;">
                        <div style="color:#10b981; font-weight:700;">${formatCurrency(vLiquido)}</div>
                        ${l.status === 'PARCIAL' ? `<div style="font-size:0.72rem; font-weight:800; color:#ef4444; margin-top:2px;" title="Valor restante a receber">Falta: ${formatCurrency(vFalta)}</div>` : ''}
                    </td>
                    <td data-label="Status">
                        <span class="status-badge ${statusClass}">${displayStatus}</span>
                    </td>
                    <td data-label="Competência">${competencia}</td>
                    <td class="actions-cell">
                        <div style="display:flex; justify-content:center; gap:0.4rem">
                            <button class="btn-action history" onclick="showRecordHistory('${l.id}')" title="Histórico de Alterações" style="background:rgba(99,102,241,0.15); border:1px solid rgba(99,102,241,0.3); color:#6366f1;"><i data-lucide="history"></i></button>
                            ${l.status === 'PAGO'
                                ? `<button class="btn-action unpay" onclick="reverterPagamento('${l.id}')" title="Estornar / Voltar para Pendente" style="background:rgba(245,158,11,0.15); border:1px solid rgba(245,158,11,0.3); color:#f59e0b;"><i data-lucide="rotate-ccw"></i></button>`
                                : l.status === 'PARCIAL'
                                ? `<button class="btn-action pay" onclick="openPaymentModal('${l.id}')" title="Baixar Restante / Receber" style="background:rgba(16,185,129,0.15); border:1px solid rgba(16,185,129,0.3); color:#10b981;"><i data-lucide="check-square"></i></button>
                                   <button class="btn-action unpay" onclick="reverterPagamento('${l.id}')" title="Estornar Baixa Parcial" style="background:rgba(245,158,11,0.15); border:1px solid rgba(245,158,11,0.3); color:#f59e0b;"><i data-lucide="rotate-ccw"></i></button>`
                                : `<button class="btn-action pay" onclick="openPaymentModal('${l.id}')" title="Baixar / Receber"><i data-lucide="check-square"></i></button>`
                            }
                            <button class="btn-action edit" onclick="editEntry('${l.id}', '${tipo}')" title="Editar"><i data-lucide="edit-2"></i></button>
                            <button class="btn-action delete" onclick="deleteEntry('${l.id}')" title="Excluir"><i data-lucide="trash-2"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        }

        const vTotalPagar = parseFloat(l.valor_total) || 0;
        const vPagoPagar = parseFloat(l.valor_pago) || 0;
        const vFaltaPagar = Math.max(0, vTotalPagar - vPagoPagar);

        return `
            <tr class="${isOverdue ? 'overdue-row' : ''}">
                <td style="text-align: center; vertical-align: middle;">
                    <input type="checkbox" class="chk-bulk-select" value="${l.id}" onchange="updateBulkActionBar('${tipo}')">
                </td>
                <td data-label="Código">
                    <div onclick="viewEntry('${l.id}')" class="clickable-view-link" style="font-weight:800; color:var(--primary); font-family:'JetBrains Mono'; cursor:pointer;" title="Clique para visualizar os detalhes">${l.codigo_sequencial || '-'}</div>
                </td>
                <td data-label="Vencimento">
                    <div style="font-weight:700">${formatDate(l.data_vencimento)}</div>
                    ${l.data_pagamento ? `<div style="font-size:0.65rem; color:var(--success)">Pago: ${formatDate(l.data_pagamento)}</div>` : ''}
                </td>
                <td data-label="Entidade">
                    <div onclick="viewEntry('${l.id}')" class="clickable-view-link" style="font-weight:700; cursor:pointer;" title="Clique para visualizar os detalhes">${l.entidade_nome || '-'}</div>
                    <div style="font-size:0.7rem; color:var(--text-muted)">${l.recorrencia !== 'NAO' ? '<i data-lucide="repeat" style="width:10px"></i> Recorrência' : ''}</div>
                </td>
                <td data-label="Descrição">
                    ${l.num_nf ? `<div onclick="viewEntry('${l.id}')" class="clickable-view-link" style="font-size:0.75rem; font-weight:700; color:var(--primary); margin-bottom:2px; cursor:pointer;" title="Clique para visualizar os detalhes">NF/Doc: ${l.num_nf}${l.serie_nf ? ' (Série ' + l.serie_nf + ')' : ''}</div>` : ''}
                    <div>${l.descricao}</div>
                    ${(() => {
                        if (l.origem_modulo === 'COMPRAS' || l.compra_id) {
                            const setor = l.setor_origem ? ` • ${l.setor_origem}` : '';
                            return `<div style="margin-top:4px;"><span class="badge-origem-compras" style="display:inline-flex; align-items:center; gap:4px; font-size:0.68rem; font-weight:700; padding:2px 7px; border-radius:12px; background:rgba(79, 70, 229, 0.12); color:#4f46e5; border:1px solid rgba(79, 70, 229, 0.25);" title="Integrado via Módulo de Compras"><i data-lucide="shopping-cart" style="width:11px; height:11px;"></i> Compras${setor}</span></div>`;
                        } else if (l.origem_modulo === 'MANUTENCAO' || l.manutencao_id) {
                            return `<div style="margin-top:4px;"><span class="badge-origem-manutencao" style="display:inline-flex; align-items:center; gap:4px; font-size:0.68rem; font-weight:700; padding:2px 7px; border-radius:12px; background:rgba(217, 119, 6, 0.12); color:#d97706; border:1px solid rgba(217, 119, 6, 0.25);" title="Integrado via Módulo de Manutenção"><i data-lucide="wrench" style="width:11px; height:11px;"></i> Manutenção</span></div>`;
                        } else if (l.origem_modulo && l.origem_modulo !== 'MANUAL') {
                            return `<div style="margin-top:4px;"><span class="badge-origem-outros" style="display:inline-flex; align-items:center; gap:4px; font-size:0.68rem; font-weight:700; padding:2px 7px; border-radius:12px; background:rgba(107, 114, 128, 0.12); color:#4b5563; border:1px solid rgba(107, 114, 128, 0.25);"><i data-lucide="link" style="width:11px; height:11px;"></i> ${l.origem_modulo}</span></div>`;
                        }
                        return '';
                    })()}
                </td>
                <td data-label="Total" style="text-align:right; font-weight:700">${formatCurrency(vTotalPagar)}</td>
                <td data-label="Pago" style="text-align:right;">
                    <div style="color:var(--success); font-weight:700;">${formatCurrency(vPagoPagar)}</div>
                    ${l.status === 'PARCIAL' ? `<div style="font-size:0.72rem; font-weight:800; color:#ef4444; margin-top:2px;" title="Valor restante a pagar">Falta: ${formatCurrency(vFaltaPagar)}</div>` : ''}
                </td>
                <td data-label="Status">
                    <span class="status-badge ${statusClass}">${displayStatus}</span>
                </td>
                <td data-label="C. Custo">${cc ? cc.nome : '-'}</td>
                <td class="actions-cell">
                    <div style="display:flex; justify-content:center; gap:0.4rem">
                        <button class="btn-action history" onclick="showRecordHistory('${l.id}')" title="Histórico de Alterações" style="background:rgba(99,102,241,0.15); border:1px solid rgba(99,102,241,0.3); color:#6366f1;"><i data-lucide="history"></i></button>
                        ${l.status === 'PAGO'
                            ? `<button class="btn-action unpay" onclick="reverterPagamento('${l.id}')" title="Estornar / Voltar para Pendente" style="background:rgba(245,158,11,0.15); border:1px solid rgba(245,158,11,0.3); color:#f59e0b;"><i data-lucide="rotate-ccw"></i></button>`
                            : l.status === 'PARCIAL'
                            ? `<button class="btn-action pay" onclick="openPaymentModal('${l.id}')" title="Baixar Restante / Pagar" style="background:rgba(16,185,129,0.15); border:1px solid rgba(16,185,129,0.3); color:#10b981;"><i data-lucide="check-square"></i></button>
                               <button class="btn-action unpay" onclick="reverterPagamento('${l.id}')" title="Estornar Baixa Parcial" style="background:rgba(245,158,11,0.15); border:1px solid rgba(245,158,11,0.3); color:#f59e0b;"><i data-lucide="rotate-ccw"></i></button>`
                            : `<button class="btn-action pay" onclick="openPaymentModal('${l.id}')" title="Baixar / Pagar"><i data-lucide="check-square"></i></button>`
                        }
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

// --- Funções de Paginação da Tabela (Sync com Compras) ---
function changePageFinancial(tipo, delta) {
    if (tipo === 'PAGAR') {
        currentPagePagar += delta;
    } else if (tipo === 'RECEBER') {
        currentPageReceber += delta;
    }
    renderTable(tipo);
}

function setPageFinancial(tipo, page) {
    if (tipo === 'PAGAR') {
        currentPagePagar = page;
    } else if (tipo === 'RECEBER') {
        currentPageReceber = page;
    }
    renderTable(tipo);
}

function updateFinancialPaginationUI(tipo, totalRecords, startIdx, endIdx, totalPages, currentPage) {
    const infoEl = document.getElementById(tipo === 'PAGAR' ? 'paginationInfoPagar' : 'paginationInfoReceber');
    const prevBtn = document.getElementById(tipo === 'PAGAR' ? 'btnPrevPagePagar' : 'btnPrevPageReceber');
    const nextBtn = document.getElementById(tipo === 'PAGAR' ? 'btnNextPagePagar' : 'btnNextPageReceber');
    const numbersEl = document.getElementById(tipo === 'PAGAR' ? 'pageNumbersPagar' : 'pageNumbersReceber');

    if (infoEl) {
        infoEl.innerText = totalRecords === 0
            ? 'Mostrando 0-0 de 0 registros'
            : `Mostrando ${startIdx + 1}-${Math.min(endIdx, totalRecords)} de ${totalRecords} registros`;
    }
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;

    if (numbersEl) {
        let html = '';
        const maxButtons = 5;
        let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
        let endPage = Math.min(totalPages, startPage + maxButtons - 1);
        if (endPage - startPage + 1 < maxButtons) {
            startPage = Math.max(1, endPage - maxButtons + 1);
        }

        for (let i = startPage; i <= endPage; i++) {
            html += `<button class="page-num ${i === currentPage ? 'active' : ''}" onclick="setPageFinancial('${tipo}', ${i})">${i}</button>`;
        }
        numbersEl.innerHTML = html;
    }
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

    const elPagar = document.getElementById('kpi-pagar');
    if (elPagar) elPagar.innerText = formatCurrency(totalPagar);
    const elReceber = document.getElementById('kpi-receber');
    if (elReceber) elReceber.innerText = formatCurrency(totalReceber);
    const elSaldo = document.getElementById('kpi-saldo');
    if (elSaldo) elSaldo.innerText = formatCurrency(saldoTotal);
    const elPrevisto = document.getElementById('kpi-previsto');
    if (elPrevisto) elPrevisto.innerText = formatCurrency(kpiPrevistoVal);

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

// --- Sub-abas do Fluxo de Caixa ---
window.switchFluxoSubTab = function(subtab, event) {
    document.querySelectorAll('#tab-fluxo .subtab-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('#tab-fluxo .fluxo-subtab-content').forEach(c => c.style.display = 'none');

    if (event && event.target) {
        const btn = event.target.closest('.subtab-item');
        if (btn) btn.classList.add('active');
    }
    const targetContent = document.getElementById('subtab-fluxo-' + subtab);
    if (targetContent) targetContent.style.display = 'block';

    if (subtab === 'contas') {
        renderFluxo();
    } else if (subtab === 'bancos') {
        renderBancoSubTab();
    }
};

window.changeFluxoPeriod = function(dir) {
    if (!state.periodoFluxo) state.periodoFluxo = new Date();
    state.periodoFluxo.setMonth(state.periodoFluxo.getMonth() + dir);
    renderFluxo();
};

window.filterFluxoPlanoTree = function() {
    const query = (document.getElementById('fluxo-search-input')?.value || '').toLowerCase().trim();
    const rows = document.querySelectorAll('#fluxoPlanoTbody tr[data-code]');
    rows.forEach(tr => {
        const code = tr.getAttribute('data-code') || '';
        const name = tr.getAttribute('data-name') || '';
        const hasVal = tr.getAttribute('data-has-value') === 'true';
        const matchesQuery = !query || code.toLowerCase().includes(query) || name.toLowerCase().includes(query);
        const matchesZerado = !window.fluxoHideZeradosActive || hasVal;
        
        if (matchesQuery && matchesZerado) {
            tr.style.display = '';
        } else {
            tr.style.display = 'none';
        }
    });
};

function populateFluxoBankSelect() {
    const sel = document.getElementById('fluxo-banco-filter');
    if (!sel) return;
    const currentVal = sel.value;
    const options = (state.contas || []).map(c => `<option value="${c.id}">${c.nome_banco || c.nome} (${c.agencia || ''}-${c.conta || ''})</option>`).join('');
    sel.innerHTML = '<option value="">(TODOS OS BANCOS)</option>' + options;
    sel.value = currentVal;
}

async function refreshFluxoView() {
    const btns = document.querySelectorAll('button[onclick*="refreshFluxoView"], button[onclick*="renderFluxo"]');
    btns.forEach(b => {
        b.disabled = true;
        b.innerHTML = '<i data-lucide="refresh-cw" class="spin"></i> Atualizando...';
    });
    if (window.lucide) lucide.createIcons();

    try {
        await loadInitialData();
        await renderFluxo();
        if (typeof showToast === 'function') {
            showToast('Dados do Fluxo de Caixa recarregados com sucesso!', 'success');
        }
    } catch (e) {
        console.error('[refreshFluxoView] Erro ao recarregar dados:', e);
    } finally {
        btns.forEach(b => {
            b.disabled = false;
            b.innerHTML = '<i data-lucide="refresh-cw"></i> Atualizar View';
        });
        if (window.lucide) lucide.createIcons();
    }
}
window.refreshFluxoView = refreshFluxoView;

let fluxoPlanoCacheData = [];

async function renderFluxo() {
    const tbody = document.getElementById('fluxoPlanoTbody');
    if (!tbody) return;

    populateFluxoBankSelect();

    if (!state.periodoFluxo) state.periodoFluxo = new Date();
    const refDate = state.periodoFluxo;

    // Calcular as 3 datas dos meses: Anterior, Atual e Posterior
    const dateAnt   = new Date(refDate.getFullYear(), refDate.getMonth() - 1, 1);
    const dateAtual = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
    const datePost  = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 1);

    const monthNames = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];

    const keyAnt   = `${dateAnt.getFullYear()}-${String(dateAnt.getMonth() + 1).padStart(2, '0')}`;
    const keyAtual = `${dateAtual.getFullYear()}-${String(dateAtual.getMonth() + 1).padStart(2, '0')}`;
    const keyPost  = `${datePost.getFullYear()}-${String(datePost.getMonth() + 1).padStart(2, '0')}`;

    const labelAnt   = `${monthNames[dateAnt.getMonth()]} / ${dateAnt.getFullYear()}`;
    const labelAtual = `${monthNames[dateAtual.getMonth()]} / ${dateAtual.getFullYear()}`;
    const labelPost  = `${monthNames[datePost.getMonth()]} / ${datePost.getFullYear()}`;

    // Atualizar títulos na interface
    const spanPeriod = document.getElementById('fluxo-current-period');
    if (spanPeriod) spanPeriod.innerText = `${monthNames[dateAtual.getMonth()]} ${dateAtual.getFullYear()}`;

    const bancoId = document.getElementById('fluxo-banco-filter')?.value || '';

    // 1. Tentar consultar a View SQL 'view_fin_fluxo_plano_contas_mensal'
    const totalsByCat = {}; // catId -> { ant:{pago:0,prev:0}, atual:{pago:0,prev:0}, post:{pago:0,prev:0} }
    let viewSuccess = false;

    try {
        if (!supabaseClient) throw new Error('supabaseClient não inicializado');
        let q = supabaseClient.from('view_fin_fluxo_plano_contas_mensal').select('*').in('ano_mes', [keyAnt, keyAtual, keyPost]);
        if (bancoId) q = q.eq('conta_bancaria_id', bancoId);
        const { data, error } = await q;

        if (!error && data && data.length > 0) {
            let hasNonZeroData = false;
            data.forEach(r => {
                const catId = r.categoria_id;
                if (!totalsByCat[catId]) {
                    totalsByCat[catId] = {
                        ant:   { pago: 0, prev: 0 },
                        atual: { pago: 0, prev: 0 },
                        post:  { pago: 0, prev: 0 }
                    };
                }

                // Suportar tanto a nova view (total_realizado) quanto a view legada (total_valor)
                let valPago = 0;
                let valPrev = 0;

                if (r.total_realizado !== undefined || r.total_previsao !== undefined) {
                    valPago = parseFloat(r.total_realizado) || 0;
                    valPrev = parseFloat(r.total_previsao) || 0;
                } else if (r.total_valor !== undefined) {
                    valPago = parseFloat(r.total_valor) || 0;
                }

                if (valPago > 0 || valPrev > 0) hasNonZeroData = true;

                if (r.ano_mes === keyAnt)   { totalsByCat[catId].ant.pago   += valPago; totalsByCat[catId].ant.prev   += valPrev; }
                if (r.ano_mes === keyAtual) { totalsByCat[catId].atual.pago += valPago; totalsByCat[catId].atual.prev += valPrev; }
                if (r.ano_mes === keyPost)  { totalsByCat[catId].post.pago  += valPago; totalsByCat[catId].post.prev  += valPrev; }
            });

            if (hasNonZeroData) viewSuccess = true;
        }
    } catch(e) {
        console.warn('[FluxoView] Não foi possível consultar a view SQL, utilizando agregação local:', e);
    }

    // 2. Agregação local de alta precisão a partir do state.lancamentos (Garante Previsão e Realizado em tempo real)
    (state.lancamentos || []).forEach(l => {
        if (l.status === 'CANCELADO' || !l.categoria_id) return;
        if (bancoId && l.conta_bancaria_id !== bancoId) return;

        const isPago = (l.status === 'PAGO' || l.status === 'RECEBIDO');
        // Regime de Caixa: Para contas PAGAS, utiliza a Data de Pagamento (l.data_pagamento) em 1º lugar!
        const dateStr = isPago
            ? (l.data_pagamento || l.data_vencimento || l.data_competencia)
            : (l.data_vencimento || l.data_competencia || l.data_pagamento);
        if (!dateStr) return;

        const anoMes = dateStr.substring(0, 7);
        if (anoMes !== keyAnt && anoMes !== keyAtual && anoMes !== keyPost) return;

        const catId = l.categoria_id;
        if (!totalsByCat[catId]) {
            totalsByCat[catId] = {
                ant:   { pago: 0, prev: 0 },
                atual: { pago: 0, prev: 0 },
                post:  { pago: 0, prev: 0 }
            };
        }

        // Cálculo do valor a considerar para RECEBER (Valor Líquido = Bruto - Tributos) vs PAGAR
        let valValido = 0;
        let valPrevisao = 0;

        if (l.tipo === 'RECEBER') {
            const bruto = parseFloat(l.valor_total) || 0;
            const trib = parseFloat(l.valor_tributo_total) || ( (parseFloat(l.valor_inss)||0) + (parseFloat(l.valor_iss)||0) + (parseFloat(l.valor_ir)||0) );
            const liquido = Math.max(0, bruto - trib);
            valValido = parseFloat(l.valor_pago) || liquido;
            valPrevisao = liquido;
        } else {
            valValido = parseFloat(l.valor_pago) || parseFloat(l.valor_total) || 0;
            valPrevisao = parseFloat(l.valor_total) || parseFloat(l.valor_pago) || 0;
        }

        const targetMonth = (anoMes === keyAnt) ? totalsByCat[catId].ant : ((anoMes === keyAtual) ? totalsByCat[catId].atual : totalsByCat[catId].post);

        if (isPago) {
            if (!viewSuccess) targetMonth.pago += valValido;
        } else {
            // Contas em aberto entram SEMPRE na Previsão (Laranja) utilizando Valor Líquido para Recebimentos
            targetMonth.prev += valPrevisao;
        }
    });

    // 3. Rollup Hierárquico dos Valores por Código de Plano de Contas
    const categorias = [...(state.categorias || [])].sort((a,b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }));

    const nodeValues = {}; // code -> { ant:{pago:0,prev:0}, atual:{pago:0,prev:0}, post:{pago:0,prev:0} }
    categorias.forEach(c => {
        nodeValues[c.codigo] = {
            ant:   { pago: 0, prev: 0 },
            atual: { pago: 0, prev: 0 },
            post:  { pago: 0, prev: 0 }
        };
    });

    // Atribuir valores diretos das categorias
    categorias.forEach(c => {
        const direct = totalsByCat[c.id];
        if (direct) {
            nodeValues[c.codigo].ant.pago   += direct.ant.pago;
            nodeValues[c.codigo].ant.prev   += direct.ant.prev;
            nodeValues[c.codigo].atual.pago += direct.atual.pago;
            nodeValues[c.codigo].atual.prev += direct.atual.prev;
            nodeValues[c.codigo].post.pago  += direct.post.pago;
            nodeValues[c.codigo].post.prev  += direct.post.prev;
        }
    });

    // Somar filhos nos pais hierarquicamente
    const sortedDesc = [...categorias].sort((a,b) => b.codigo.length - a.codigo.length);
    sortedDesc.forEach(cat => {
        const code = cat.codigo;
        const parts = code.split('.');
        if (parts.length > 1) {
            const parentCode = parts.slice(0, -1).join('.');
            if (nodeValues[parentCode]) {
                nodeValues[parentCode].ant.pago   += nodeValues[code].ant.pago;
                nodeValues[parentCode].ant.prev   += nodeValues[code].ant.prev;
                nodeValues[parentCode].atual.pago += nodeValues[code].atual.pago;
                nodeValues[parentCode].atual.prev += nodeValues[code].atual.prev;
                nodeValues[parentCode].post.pago  += nodeValues[code].post.pago;
                nodeValues[parentCode].post.prev  += nodeValues[code].post.prev;
            }
        }
    });

    // 4. Calcular KPIs Principais para o Mês Atual (Foco Principal: REALIZADO PAGO + PREVISÃO EM LARANJA)
    const emptyMonth = { pago: 0, prev: 0 };
    const gAtivo   = nodeValues['01'] || { ant: emptyMonth, atual: emptyMonth, post: emptyMonth };
    const gPassivo = nodeValues['02'] || { ant: emptyMonth, atual: emptyMonth, post: emptyMonth };
    const gReceita = nodeValues['03'] || { ant: emptyMonth, atual: emptyMonth, post: emptyMonth };
    const gDespesa = nodeValues['04'] || { ant: emptyMonth, atual: emptyMonth, post: emptyMonth };

    const resAntPago   = gReceita.ant.pago - gDespesa.ant.pago;
    const resAtualPago = gReceita.atual.pago - gDespesa.atual.pago;
    const resPostPago  = gReceita.post.pago - gDespesa.post.pago;

    const resAntPrev   = gReceita.ant.prev - gDespesa.ant.prev;
    const resAtualPrev = gReceita.atual.prev - gDespesa.atual.prev;
    const resPostPrev  = gReceita.post.prev - gDespesa.post.prev;

    const renderHeaderTitle = (title, valPago, valPrev) => {
        let prevSub = '';
        if (valPrev && Math.abs(valPrev) > 0.001) {
            prevSub = `<span style="font-size:0.75rem; font-weight:700; color:#d97706; background:rgba(245,158,11,0.12); padding:1px 6px; border-radius:4px; margin-top:3px; display:inline-block;">Prev: ${formatCurrency(valPrev)}</span>`;
        }
        return `
            <div style="display:flex; flex-direction:column; align-items:flex-end; gap:2px;">
                <span>${title}</span>
                <span class="dre-header-total-val">${formatCurrency(valPago)}</span>
                ${prevSub}
            </div>
        `;
    };

    const thAntElement   = document.getElementById('th-mes-anterior');
    const thAtualElement = document.getElementById('th-mes-atual');
    const thPostElement  = document.getElementById('th-mes-posterior');

    if (thAntElement)   thAntElement.innerHTML   = renderHeaderTitle(labelAnt, resAntPago, resAntPrev);
    if (thAtualElement) thAtualElement.innerHTML = renderHeaderTitle(labelAtual, resAtualPago, resAtualPrev);
    if (thPostElement)  thPostElement.innerHTML  = renderHeaderTitle(labelPost, resPostPago, resPostPrev);

    const kpiAtivo   = document.getElementById('fluxo-kpi-ativo');
    const kpiPassivo = document.getElementById('fluxo-kpi-passivo');
    const kpiReceita = document.getElementById('fluxo-kpi-receita');
    const kpiDespesa = document.getElementById('fluxo-kpi-despesa');
    const kpiRes     = document.getElementById('fluxo-kpi-resultado');

    const renderKpiValue = (el, valPago, valPrev) => {
        if (!el) return;
        let html = `<span>${formatCurrency(valPago)}</span>`;
        if (valPrev && Math.abs(valPrev) > 0.001) {
            html += `<span style="font-size:0.72rem; font-weight:700; color:#d97706; display:block; margin-top:2px;">Prev: ${formatCurrency(valPrev)}</span>`;
        }
        el.innerHTML = html;
    };

    renderKpiValue(kpiAtivo, gAtivo.atual.pago, gAtivo.atual.prev);
    renderKpiValue(kpiPassivo, gPassivo.atual.pago, gPassivo.atual.prev);
    renderKpiValue(kpiReceita, gReceita.atual.pago, gReceita.atual.prev);
    renderKpiValue(kpiDespesa, gDespesa.atual.pago, gDespesa.atual.prev);
    renderKpiValue(kpiRes, resAtualPago, resAtualPrev);

    if (!categorias.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="table-empty">Nenhum plano de contas cadastrado. Cadastre em Configurações > Plano de Contas.</td></tr>';
        return;
    }

    fluxoPlanoCacheData = { labelAnt, labelAtual, labelPost, categorias, nodeValues };

    // 5. Renderizar Tabela DRE (Foco Principal: REALIZADO PAGO + PREVISÃO EM LARANJA)
    tbody.innerHTML = categorias.map(c => {
        const code = c.codigo;
        const level = code.split('.').length;
        const emptyNode = { pago: 0, prev: 0 };
        const vals = nodeValues[code] || { ant: emptyNode, atual: emptyNode, post: emptyNode };
        const mainGroupCode = code.split('.')[0];
        const groupBaseVal = nodeValues[mainGroupCode] || { ant: emptyNode, atual: emptyNode, post: emptyNode };

        const indentPx = (level - 1) * 18;
        const levelClass = `dre-row-level-${Math.min(level, 4)}`;

        const formatCol = (itemMonth, groupMonth) => {
            const valPago = itemMonth.pago || 0;
            const valPrev = itemMonth.prev || 0;
            const basePago = groupMonth.pago || 0;

            const numStrPago = formatCurrency(valPago);
            const pctPago = basePago > 0 ? ((valPago / basePago) * 100).toFixed(2) + '%' : '0,00%';

            let prevBadge = '';
            if (valPrev && Math.abs(valPrev) > 0.001) {
                prevBadge = `<span style="font-size:0.72rem; font-weight:700; color:#d97706; background:rgba(245,158,11,0.12); padding:1px 6px; border-radius:4px; margin-top:3px; display:inline-block;" title="Previsão de contas a pagar/pendentes">Prev: ${formatCurrency(valPrev)}</span>`;
            }

            return `<div style="display:flex; flex-direction:column; align-items:flex-end;">
                        <span style="font-weight:700; color:${valPago > 0 ? 'inherit' : 'var(--text-muted)'}">${numStrPago}</span>
                        <span style="font-size:0.72rem; opacity:0.75;">(${pctPago})</span>
                        ${prevBadge}
                    </div>`;
        };

        const hasValue = Math.abs(vals.ant.pago) > 0.001 || Math.abs(vals.ant.prev) > 0.001 ||
                         Math.abs(vals.atual.pago) > 0.001 || Math.abs(vals.atual.prev) > 0.001 ||
                         Math.abs(vals.post.pago) > 0.001 || Math.abs(vals.post.prev) > 0.001;

        return `
            <tr data-code="${code}" data-name="${c.nome}" data-has-value="${hasValue}" class="${levelClass}">
                <td style="padding: 0.65rem 1rem 0.65rem ${indentPx + 12}px;">
                    <span class="dre-code-badge" style="margin-right: 8px;">${code}</span>
                    <span>${c.nome}</span>
                </td>
                <td style="padding: 0.65rem 1rem; text-align: right; font-family: 'JetBrains Mono', monospace;">
                    ${formatCol(vals.ant, groupBaseVal.ant)}
                </td>
                <td class="dre-cell-mes-atual" style="padding: 0.65rem 1rem; text-align: right; font-family: 'JetBrains Mono', monospace;">
                    ${formatCol(vals.atual, groupBaseVal.atual)}
                </td>
                <td style="padding: 0.65rem 1rem; text-align: right; font-family: 'JetBrains Mono', monospace;">
                    ${formatCol(vals.post, groupBaseVal.post)}
                </td>
            </tr>
        `;
    }).join('');

    // Re-aplicar ocultação de zerados se o filtro estiver ativo
    if (window.fluxoHideZeradosActive) {
        window.applyFluxoZeradosFilter();
    }
}

window.fluxoHideZeradosActive = false;

window.toggleFluxoZerados = function() {
    window.fluxoHideZeradosActive = !window.fluxoHideZeradosActive;
    const btn = document.getElementById('btn-toggle-fluxo-zerados');
    if (btn) {
        if (window.fluxoHideZeradosActive) {
            btn.className = 'fhist-btn-gerar';
            btn.style.height = '40px';
            btn.style.borderRadius = '10px';
            btn.style.fontSize = '0.85rem';
            btn.style.padding = '0 1.1rem';
            btn.innerHTML = `<i data-lucide="eye" style="width:16px;height:16px;"></i> <span>Exibir Todos</span>`;
        } else {
            btn.className = 'fhist-btn-clear';
            btn.style.height = '40px';
            btn.style.borderRadius = '10px';
            btn.style.fontSize = '0.85rem';
            btn.style.padding = '0 1.1rem';
            btn.style.background = '#ffffff';
            btn.style.borderColor = 'rgba(45, 158, 107, 0.3)';
            btn.style.color = '#2d9e6b';
            btn.innerHTML = `<i data-lucide="eye-off" style="width:16px;height:16px;color:#059669;"></i> <span>Ocultar Zerados</span>`;
        }
        if (window.lucide) lucide.createIcons();
    }
    window.applyFluxoZeradosFilter();
};

window.applyFluxoZeradosFilter = function() {
    const rows = document.querySelectorAll('#fluxoPlanoTbody tr[data-code]');
    rows.forEach(tr => {
        const hasVal = tr.getAttribute('data-has-value') === 'true';
        if (window.fluxoHideZeradosActive && !hasVal) {
            tr.style.display = 'none';
        } else {
            tr.style.display = '';
        }
    });
};

window.exportFluxoPlanoExcel = function() {
    if (!fluxoPlanoCacheData || !fluxoPlanoCacheData.categorias) {
        alert('Nenhum dado do movimento de contas para exportar.');
        return;
    }
    const { labelAnt, labelAtual, labelPost, categorias, nodeValues } = fluxoPlanoCacheData;

    const rows = categorias.map(c => {
        const vals = nodeValues[c.codigo] || { ant: 0, atual: 0, post: 0 };
        return {
            'Código': c.codigo,
            'Plano de Contas / Conta': c.nome,
            'Tipo': c.tipo || '',
            [labelAnt]: vals.ant,
            [labelAtual]: vals.atual,
            [labelPost]: vals.post
        };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Movimento de Contas');
    XLSX.writeFile(wb, `fluxo_movimento_contas_${new Date().toISOString().slice(0,10)}.xlsx`);
};


// --- CRUD Operations ---
async function openEntryModal(tipo, id = null) {
    if (typeof window.showLoader === 'function') window.showLoader();
    setTimeout(() => {
        if (typeof window.hideLoader === 'function') window.hideLoader();
    }, 250);
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
        document.getElementById('entryEntidadeSearch').value = '';
        document.getElementById('entryEntidade').value = '';
        document.getElementById('entryCategoriaSearch').value = '';
        document.getElementById('entryCategoriaId').value = '';
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
    document.getElementById('entryEntidadeSearch').value = item.entidade_nome || '';

    // Configura Categoria (Nome e ID)
    const cat = state.categorias.find(c => c.id === item.categoria_id);
    document.getElementById('entryCategoriaId').value = item.categoria_id || '';
    document.getElementById('entryCategoriaSearch').value = cat ? `${cat.codigo} - ${cat.nome}` : '';

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
    state.filtros[tipo].busca = val;
    renderLancamentos(tipo);
}

function filterOrigem(tipo, val) {
    state.filtros[tipo].origem = val;
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
            if (typeof registrarLog === 'function') registrarLog('financeiro', 'EXCLUSÃO', `DETALHE: Excluiu lançamento ${l ? l.tipo : ''}: ${l ? l.descricao : id} (Valor: R$ ${l ? l.valor_total : 0})`);
            
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

function formatCnpjDisplay(doc) {
    if (!doc) return '—';
    const clean = doc.toString().replace(/\D/g, '');
    if (clean.length === 14) {
        return clean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
    }
    if (clean.length === 11) {
        return clean.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
    }
    return doc;
}

function updateReceberClientCnpjInfo() {
    const elEnt = document.getElementById('receberEntidade');
    const elCnpj = document.getElementById('receberCNPJ');
    if (!elCnpj) return;

    const val = (elEnt ? elEnt.value : '').toLowerCase().trim();
    if (state.importedXmlCnpj) {
        elCnpj.value = formatCnpjDisplay(state.importedXmlCnpj);
        return;
    }

    if (!val) {
        elCnpj.value = '—';
        return;
    }

    const firstWordTyped = val.split(/\s+/)[0];
    const found = (state.clientes || []).find(c => {
        const cNome = (c.nome || '').toLowerCase().trim();
        if (!cNome || !c.cnpj_cpf) return false;
        if (cNome === val || cNome.includes(val) || val.includes(cNome)) return true;
        const firstWordDb = cNome.split(/\s+/)[0];
        if (firstWordTyped.length >= 4 && (cNome.includes(firstWordTyped) || val.includes(firstWordDb))) return true;
        return false;
    });

    if (found && found.cnpj_cpf) {
        elCnpj.value = formatCnpjDisplay(found.cnpj_cpf);
    } else {
        elCnpj.value = '—';
    }
}
window.updateReceberClientCnpjInfo = updateReceberClientCnpjInfo;

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
    if (document.getElementById('receberCNPJ')) document.getElementById('receberCNPJ').value = '—';

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
            if (document.getElementById('receberTipoServico')) document.getElementById('receberTipoServico').value = item.tipo_servico_produto || 'SERVICO';
            if (document.getElementById('receberTipoNota')) document.getElementById('receberTipoNota').value = item.tipo_nota || 'NFSE';
            if (document.getElementById('receberFormaPagamento')) document.getElementById('receberFormaPagamento').value = item.forma_pagamento || 'BOLETO';
            document.getElementById('receberValorBruto').value = item.valor_total || 0;
            document.getElementById('receberValorINSS').value = item.valor_inss || 0;
            document.getElementById('receberValorISS').value = item.valor_iss || 0;
            document.getElementById('receberValorIR').value = item.valor_ir || 0;
            document.getElementById('receberPrazo').value = item.prazo_pagamento || 0;
            document.getElementById('receberPrevisao').value = item.previsao_pagamento || '';
            
            const cat = state.categorias.find(c => c.id === item.categoria_id);
            if (document.getElementById('receberCategoriaId')) document.getElementById('receberCategoriaId').value = item.categoria_id || '';
            if (document.getElementById('receberCategoriaSearch')) document.getElementById('receberCategoriaSearch').value = cat ? `${cat.codigo} - ${cat.nome}` : '';

            calculateReceberTaxes();
        }
    } else {
        document.getElementById('receberData').value = new Date().toISOString().split('T')[0];
        document.getElementById('receberCompetencia').value = new Date().toISOString().substring(0, 7);
        document.getElementById('receberDescricao').value = '';
        if (document.getElementById('receberTipoNota')) document.getElementById('receberTipoNota').value = 'NFSE';
        if (document.getElementById('receberFormaPagamento')) document.getElementById('receberFormaPagamento').value = 'BOLETO';
        
        // Novo Lançamento: Inicializar Plano de Contas estritamente em BRANCO
        if (document.getElementById('receberCategoriaId')) document.getElementById('receberCategoriaId').value = '';
        if (document.getElementById('receberCategoriaSearch')) document.getElementById('receberCategoriaSearch').value = '';

        calculateReceberForecast();
    }

    updateReceberClientCnpjInfo();
    modal.classList.add('active');
}

function handleReceberXMLUpload(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
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

            // Validação estrita EXCLUSIVAMENTE por CNPJ contra a base do Comercial
            const cleanCnpj = tomadorCnpjCpf ? tomadorCnpjCpf.replace(/\D/g, '') : '';
            state.importedXmlCnpj = cleanCnpj;
            state.importedXmlNome = cliente || '';

            const cnpjCheck = await isCnpjCadastrado(cleanCnpj, cliente);
            const warningDiv = document.getElementById('receberClienteWarning');
            if (warningDiv) {
                if (!cnpjCheck.valid) {
                    warningDiv.style.display = 'block';
                    warningDiv.querySelector('span').innerText = `Aviso: O CNPJ do Tomador (${cleanCnpj || 'não informado'}) não está cadastrado no Comercial! O salvamento será bloqueado.`;
                    showToast(`Aviso: CNPJ do Tomador (${cleanCnpj || 'não informado'}) não cadastrado no Comercial.`, "error");
                } else {
                    warningDiv.style.display = 'none';
                }
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

            // Auto-detectar Tipo de Nota do XML baseado na tabela de especies_nota
            let matchedEspecie = null;
            if (state.especiesNota && state.especiesNota.length > 0) {
                const isNfse = xmlDoc.getElementsByTagName("nNFSe").length > 0 || xmlDoc.getElementsByTagName("NumeroNfse").length > 0 || xmlDoc.getElementsByTagName("Servico").length > 0;
                const isCte = xmlDoc.getElementsByTagName("nCT").length > 0 || xmlDoc.getElementsByTagName("cteProc").length > 0 || xmlDoc.getElementsByTagName("infCte").length > 0;
                const isNfe = xmlDoc.getElementsByTagName("nNF").length > 0 || xmlDoc.getElementsByTagName("nfeProc").length > 0 || xmlDoc.getElementsByTagName("infNFe").length > 0;

                matchedEspecie = state.especiesNota.find(e => {
                    const n = (e.nome || '').toUpperCase();
                    if (isNfse) return n.includes('NFS') || n.includes('SERVI');
                    if (isCte) return n.includes('CTE') || n.includes('TRANSP');
                    if (isNfe) return n.includes('NFE') || n.includes('PROD') || n.includes('ELETRONICA');
                    return false;
                });
            }
            if (document.getElementById('receberTipoNota') && matchedEspecie) {
                document.getElementById('receberTipoNota').value = matchedEspecie.nome;
            }

            // Executa atualizações e recálculos automáticos do modal
            updateReceberClientCnpjInfo();
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
        const parts = dataRef.split('-');
        if (parts.length === 3) {
            const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
            date.setDate(date.getDate() + prazo);
            const yyyy = date.getFullYear();
            const mm = String(date.getMonth() + 1).padStart(2, '0');
            const dd = String(date.getDate()).padStart(2, '0');
            document.getElementById('receberPrevisao').value = `${yyyy}-${mm}-${dd}`;
        }
    }
}

async function isCnpjCadastrado(cnpjInput, clienteNomeTyped = '') {
    // Carrega a base comercial (clientes + contratos) se a lista em memória estiver vazia
    if (!state.clientes || state.clientes.length === 0) {
        try {
            const { data: db1 } = await supabaseClient.from('clientes').select('cnpj_cpf, cliente_cnpj_cpf, nome, cliente_nome');
            const { data: db2 } = await supabaseClient.from('com_contratos').select('cliente_cnpj_cpf, cliente_nome');
            const list = [];
            (db1 || []).forEach(c => {
                const doc = c.cnpj_cpf || c.cliente_cnpj_cpf;
                const n = c.nome || c.cliente_nome;
                if (doc || n) list.push({ nome: n || '', cnpj_cpf: doc || '' });
            });
            (db2 || []).forEach(c => {
                if (c.cliente_cnpj_cpf || c.cliente_nome) list.push({ nome: c.cliente_nome || '', cnpj_cpf: c.cliente_cnpj_cpf || '' });
            });
            state.clientes = list;
        } catch (e) {}
    }

    // Função de sanitização inteligente: remove pontos, barras, hífens e espaços
    const sanitizeCnpj = (val) => (val || '').toString().replace(/\D/g, '');

    let targetCnpj = sanitizeCnpj(cnpjInput);

    // Se o CNPJ não veio direto do XML, tenta localizar o CNPJ do cliente na base comercial pelo Nome (busca flexível)
    if (!targetCnpj && clienteNomeTyped) {
        const normTyped = clienteNomeTyped.toLowerCase().trim();
        const firstWordTyped = normTyped.split(/\s+/)[0];

        const found = (state.clientes || []).find(c => {
            const cNome = (c.nome || '').toLowerCase().trim();
            if (!cNome || !c.cnpj_cpf) return false;

            if (cNome === normTyped || cNome.includes(normTyped) || normTyped.includes(cNome)) return true;

            const firstWordDb = cNome.split(/\s+/)[0];
            if (firstWordTyped.length >= 4 && (cNome.includes(firstWordTyped) || normTyped.includes(firstWordDb))) return true;

            return false;
        });

        if (found && found.cnpj_cpf) {
            targetCnpj = sanitizeCnpj(found.cnpj_cpf);
        }
    }

    if (!targetCnpj) {
        return { valid: false, cnpj: '', reason: 'CNPJ do Tomador/Cliente é obrigatório para validação Comercial.' };
    }

    const targetRoot = targetCnpj.length >= 8 ? targetCnpj.substring(0, 8) : targetCnpj;

    // Higieniza todos os CNPJs do banco (ex: 17.469.701/0260-52 -> 17469701026052) e compara por CNPJ ou Raiz
    const matched = (state.clientes || []).some(c => {
        const cCnpj = sanitizeCnpj(c.cnpj_cpf);
        if (!cCnpj) return false;

        const cRoot = cCnpj.length >= 8 ? cCnpj.substring(0, 8) : cCnpj;

        // Validação por CNPJ: 14 dígitos exatos ou 8 dígitos da Raiz (Matriz / Filial)
        return (targetCnpj === cCnpj) || (targetRoot.length >= 8 && targetRoot === cRoot);
    });

    return { valid: matched, cnpj: targetCnpj };
}

async function isNotaFiscalDuplicada(tipo, numNf, clienteNome, clienteCnpj, currentId = null) {
    const cleanNf = (numNf || '').toString().trim().replace(/^0+/, '');
    if (!cleanNf) return { duplicate: false };

    const targetCnpj = (clienteCnpj || '').replace(/\D/g, '');
    const targetRoot = targetCnpj.length >= 8 ? targetCnpj.substring(0, 8) : targetCnpj;
    const normNome = (clienteNome || '').toLowerCase().trim();

    try {
        let query = supabaseClient.from('fin_lancamentos').select('id, num_nf, entidade_nome, tipo').eq('tipo', tipo);
        if (currentId) query = query.neq('id', currentId);
        
        const { data: dbNfs, error } = await query;
        const listToSearch = (error || !dbNfs || !dbNfs.length) ? state.lancamentos.filter(l => l.tipo === tipo) : dbNfs;

        const duplicate = listToSearch.find(l => {
            if (currentId && (l.id === currentId || String(l.id) === String(currentId))) return false;

            const lNf = (l.num_nf || '').toString().trim().replace(/^0+/, '');
            if (!lNf || lNf !== cleanNf) return false;

            // Se o número de nota é idêntico, verifica se pertence ao mesmo cliente (por CNPJ ou Razão Social)
            const lNome = (l.entidade_nome || '').toLowerCase().trim();

            if (normNome && lNome) {
                if (normNome === lNome || normNome.includes(lNome) || lNome.includes(normNome)) return true;
                const firstWord1 = normNome.split(/\s+/)[0];
                const firstWord2 = lNome.split(/\s+/)[0];
                if (firstWord1.length >= 4 && (lNome.includes(firstWord1) || normNome.includes(firstWord2))) return true;
            }

            if (targetCnpj) {
                const cFound = (state.clientes || []).find(c => (c.nome || '').toLowerCase().trim() === lNome);
                if (cFound && cFound.cnpj_cpf) {
                    const cCnpj = cFound.cnpj_cpf.replace(/\D/g, '');
                    const cRoot = cCnpj.length >= 8 ? cCnpj.substring(0, 8) : cCnpj;
                    if (targetCnpj === cCnpj || (targetRoot.length >= 8 && targetRoot === cRoot)) return true;
                }
            }

            return false;
        });

        if (duplicate) {
            return { duplicate: true, existingNf: cleanNf, cliente: duplicate.entidade_nome };
        }
    } catch (e) {
        console.warn("Erro ao verificar duplicidade de NF:", e);
    }

    return { duplicate: false };
}

async function handleReceberSubmit(e) {
    e.preventDefault();
    const formData = new FormData(e.target);

    // Validação OBRIGATÓRIA e EXCLUSIVA por CNPJ no módulo Comercial
    const entidadeNomeForm = (formData.get('entidade_nome') || state.importedXmlNome || '').trim();
    const cnpjForm = state.importedXmlCnpj || '';

    const cnpjCheck = await isCnpjCadastrado(cnpjForm, entidadeNomeForm);
    if (!cnpjCheck.valid) {
        const cnpjExib = cnpjCheck.cnpj ? `CNPJ: ${cnpjCheck.cnpj}` : `Empresa: "${entidadeNomeForm}"`;
        showToast(`Bloqueado: O CNPJ do Tomador/Cliente não foi localizado no cadastro Comercial.`, "error");
        alert(`Não é possível salvar: O CNPJ (${cnpjCheck.cnpj || 'não informado'}) do Cliente/Tomador (${entidadeNomeForm}) não está cadastrado no sistema Comercial. Por favor, certifique-se de que o CNPJ da empresa (Matriz ou Filial) esteja cadastrado no módulo Comercial.`);
        return;
    }

    const id = document.getElementById('receberId').value;
    const numNfForm = (formData.get('num_nf') || '').trim();
    const tipoNotaForm = (formData.get('tipo_nota') || '').trim();
    const formaPagamentoForm = (formData.get('forma_pagamento') || '').trim();

    // Validações de Campos Obrigatórios
    if (!tipoNotaForm) {
        showToast('Campos obrigatórios: Selecione o Tipo de Nota.', "error");
        alert('Não é possível salvar: O campo TIPO DE NOTA é obrigatório.');
        return;
    }

    if (!numNfForm) {
        showToast('Campos obrigatórios: Informe o Nº da Nota Fiscal.', "error");
        alert('Não é possível salvar: O campo Nº NOTA FISCAL é obrigatório.');
        return;
    }

    if (!formaPagamentoForm) {
        showToast('Campos obrigatórios: Selecione o Tipo de Pagamento.', "error");
        alert('Não é possível salvar: O campo TIPO DE PAGAMENTO é obrigatório.');
        return;
    }

    // Validação Anti-Duplicidade de Nota Fiscal para o mesmo Cliente/CNPJ
    if (numNfForm) {
        const dupCheck = await isNotaFiscalDuplicada('RECEBER', numNfForm, entidadeNomeForm, cnpjCheck.cnpj, id);
        if (dupCheck.duplicate) {
            showToast(`Bloqueado: A Nota Fiscal Nº ${numNfForm} já foi lançada para este cliente!`, "error");
            alert(`Não é possível salvar: A Nota Fiscal de número "${numNfForm}" já está cadastrada no sistema para o cliente "${dupCheck.cliente || entidadeNomeForm}". Lançamentos duplicados com a mesma Nota Fiscal e mesmo Cliente/CNPJ não são permitidos.`);
            return;
        }
    }
    
    const bruto = parseFloat(formData.get('valor_total')) || 0;
    const inss = parseFloat(formData.get('valor_inss')) || 0;
    const iss = parseFloat(formData.get('valor_iss')) || 0;
    const ir = parseFloat(formData.get('valor_ir')) || 0;
    const totalTributos = inss + iss + ir;

    let catId = document.getElementById('receberCategoriaId')?.value || formData.get('categoria_id') || null;

    // Auto-resolução do ID caso o usuário tenha digitado o código/nome sem clicar no item do autocomplete
    if (!catId) {
        const searchText = (document.getElementById('receberCategoriaSearch')?.value || '').toLowerCase().trim();
        if (searchText) {
            const matched = (state.categorias || []).find(c => {
                const label = `${c.codigo || ''} - ${c.nome || ''}`.toLowerCase().trim();
                return label === searchText || (c.codigo && searchText.startsWith(c.codigo.toLowerCase())) || label.includes(searchText) || (c.nome && c.nome.toLowerCase().includes(searchText));
            });
            if (matched) {
                catId = matched.id;
                if (document.getElementById('receberCategoriaId')) document.getElementById('receberCategoriaId').value = matched.id;
            }
        }
    }

    if (!catId) {
        showToast("O preenchimento do Plano de Contas (Receita) é obrigatório!", "error");
        alert("Não é possível salvar: Por favor, selecione uma Conta de Receita no Plano de Contas.");
        const catInput = document.getElementById('receberCategoriaSearch');
        if (catInput) {
            catInput.focus();
            catInput.style.borderColor = '#ef4444';
        }
        return;
    }

    const record = {
        tipo: 'RECEBER',
        categoria_id: catId,
        data_emissao: formData.get('data_emissao'),
        entidade_nome: formData.get('entidade_nome'),
        num_nf: formData.get('num_nf'),
        data_competencia: formData.get('data_competencia') ? formData.get('data_competencia') + '-01' : null,
        tipo_servico_produto: formData.get('tipo_servico_produto'),
        tipo_nota: formData.get('tipo_nota') || 'NFSE',
        forma_pagamento: formData.get('forma_pagamento') || 'BOLETO',
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
            const existingItem = state.lancamentos.find(l => l.id === id);
            if (existingItem && existingItem.status) {
                record.status = existingItem.status;
            }
            const { error } = await supabaseClient.from('fin_lancamentos').update(record).eq('id', id);
            if (error) throw error;

            // Atualiza o objeto na memória local imediatamente
            if (existingItem) {
                Object.assign(existingItem, record);
            }

            if (typeof registrarLog === 'function') registrarLog('financeiro', 'ALTERAÇÃO', `DETALHE: Editou recebimento: ${record.descricao} - Cliente/Entidade: ${record.entidade_nome} (Valor: R$ ${record.valor_total})`);
        } else {
            const { data: insertedList, error } = await supabaseClient.from('fin_lancamentos').insert([record]).select();
            if (error) throw error;

            if (insertedList && insertedList.length > 0) {
                state.lancamentos.unshift(insertedList[0]);
            }

            if (typeof registrarLog === 'function') registrarLog('financeiro', 'INCLUSÃO', `DETALHE: Lançou recebimento: ${record.descricao} - Cliente/Entidade: ${record.entidade_nome} (Valor: R$ ${record.valor_total})`);
        }

        closeModal('receberModal');
        await loadInitialData();
        renderAll();
        showToast('Recebimento salvo com sucesso!', 'success');
    } catch (err) {
        console.error("Erro ao salvar recebimento:", err);
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
            // Edição de registro existente
            const { error: upErr } = await supabaseClient.from('fin_lancamentos').update(mainRecord).eq('id', id);
            if (upErr) throw upErr;
            if (typeof registrarLog === 'function') registrarLog('financeiro', 'ALTERAÇÃO', `DETALHE: Editou lançamento (${mainRecord.tipo}): ${mainRecord.descricao} - Fornecedor/Entidade: ${mainRecord.entidade_nome} (Valor: R$ ${mainRecord.valor_total})`);
            await supabaseClient.from('fin_lancamento_itens').delete().eq('lancamento_id', id);
            await supabaseClient.from('fin_lancamento_adicionais').delete().eq('lancamento_id', id);
            await supabaseClient.from('fin_lancamento_parcelas').delete().eq('lancamento_id', id);
        } else if (isParcelado) {
            // Novo lançamento parcelado: cria 1 registro individual em fin_lancamentos para cada parcela
            const installmentRows = document.querySelectorAll('#installmentsContainer .installment-row');
            const totalParcs = installmentRows.length || qtdParcelas;
            const recordsToInsert = [];

            installmentRows.forEach((row, idx) => {
                const parcNum = idx + 1;
                const parcVenc = row.querySelector('.parc-date').value;
                const parcVal = parseFloat(row.querySelector('.parc-val').value) || (finalTotal / totalParcs);

                recordsToInsert.push({
                    ...mainRecord,
                    descricao: `${firstItemDesc} (Parc ${parcNum}/${totalParcs})`,
                    data_vencimento: parcVenc,
                    valor_total: parcVal,
                    is_parcelado: true,
                    qtd_parcelas: totalParcs,
                    status: 'ABERTO'
                });
            });

            const { data: insertedList, error: inErr } = await supabaseClient.from('fin_lancamentos').insert(recordsToInsert).select();
            if (inErr) throw inErr;
            if (typeof registrarLog === 'function') registrarLog('financeiro', 'INCLUSÃO', `DETALHE: Lançou ${recordsToInsert.length} parcelas para (${mainRecord.tipo.toLowerCase()}): ${firstItemDesc} - Entidade: ${mainRecord.entidade_nome}`);
            if (insertedList && insertedList.length > 0) lancamentoId = insertedList[0].id;
        } else {
            // Novo lançamento único (não parcelado)
            const { data: inserted, error: inErr } = await supabaseClient.from('fin_lancamentos').insert([mainRecord]).select().single();
            if (inErr) throw inErr;
            if (typeof registrarLog === 'function') registrarLog('financeiro', 'INCLUSÃO', `DETALHE: Lançou ${mainRecord.tipo.toLowerCase()}: ${mainRecord.descricao} - Fornecedor/Entidade: ${mainRecord.entidade_nome} (Valor: R$ ${mainRecord.valor_total})`);
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
let currentModalParcelas = [];
let currentPayExpectedValue = 0;

function checkPaymentDivergence() {
    const valorInput = parseFloat(document.getElementById('payValor').value) || 0;
    const diff = Math.abs(valorInput - currentPayExpectedValue);
    const motivoGroup = document.getElementById('payMotivoGroup');
    const motivoInput = document.getElementById('payMotivo');

    if (!motivoGroup || !motivoInput) return;

    if (diff > 0.05) {
        motivoGroup.style.display = 'block';
        motivoInput.setAttribute('required', 'required');
    } else {
        motivoGroup.style.display = 'none';
        motivoInput.removeAttribute('required');
        motivoInput.value = '';
    }
}

window.checkPaymentDivergence = checkPaymentDivergence;

async function openPaymentModal(id) {
    const l = state.lancamentos.find(item => item.id === id);
    if (!l) return;

    const mod = l.tipo === 'RECEBER' ? 'financeiro_receber' : 'financeiro_pagar';
    if (typeof canDo === 'function' && !canDo(mod, 'edit')) {
        showToast('Você não tem permissão para esta ação.', 'error');
        return;
    }

    document.getElementById('payLancamentoId').value = l.id;
    document.getElementById('payData').value = new Date().toISOString().split('T')[0];
    if (document.getElementById('payMotivo')) {
        document.getElementById('payMotivo').value = '';
        document.getElementById('payMotivoGroup').style.display = 'none';
    }

    const selectConta = document.getElementById('payConta');
    selectConta.innerHTML = state.contas.map(c => `<option value="${c.id}">${c.nome} (Saldo: ${formatCurrency(c.saldo_atual)})</option>`).join('');
    if (l.conta_bancaria_id) selectConta.value = l.conta_bancaria_id;

    // Cálculo do Valor Líquido (se houver tributos) vs Valor Bruto
    const bruto = parseFloat(l.valor_total) || 0;
    const tributos = parseFloat(l.valor_tributo_total) || 0;
    const liquido = bruto - tributos;
    const valorJaPago = parseFloat(l.valor_pago) || 0;

    // Se for RECEBER, o valor base a receber é o VALOR LÍQUIDO menos o que já foi pago
    const valorBase = l.tipo === 'RECEBER' ? liquido : bruto;
    currentPayExpectedValue = Math.round(Math.max(0, valorBase - valorJaPago) * 100) / 100;

    // Atualizar Card Informativo do Modal
    const payValBrutoText = document.getElementById('payValBrutoText');
    const payRetencoesWrapper = document.getElementById('payRetencoesWrapper');
    const payRetencoesText = document.getElementById('payRetencoesText');
    const payValEsperadoLabel = document.getElementById('payValEsperadoLabel');
    const payValEsperadoText = document.getElementById('payValEsperadoText');

    if (payValBrutoText) payValBrutoText.innerText = formatCurrency(bruto);

    if (l.tipo === 'RECEBER' && tributos > 0) {
        if (payRetencoesWrapper) payRetencoesWrapper.style.display = 'flex';
        if (payRetencoesText) payRetencoesText.innerText = `- ${formatCurrency(tributos)}`;
    } else {
        if (payRetencoesWrapper) payRetencoesWrapper.style.display = 'none';
    }

    if (payValEsperadoLabel) payValEsperadoLabel.innerText = l.tipo === 'RECEBER' ? 'Valor Líquido a Receber:' : 'Valor a Pagar:';
    if (payValEsperadoText) payValEsperadoText.innerText = formatCurrency(currentPayExpectedValue);

    // Verificar se possui parcelas no banco
    currentModalParcelas = [];
    const parcelaGroup = document.getElementById('payParcelaGroup');
    const parcelaSelect = document.getElementById('payParcelaSelect');

    try {
        const { data: parc } = await supabaseClient
            .from('fin_lancamento_parcelas')
            .select('*')
            .eq('lancamento_id', l.id)
            .order('numero_parcela');

        if (parc && parc.length > 0) {
            currentModalParcelas = parc;
            const parcelasAbertas = parc.filter(p => p.status !== 'PAGO');

            if (parcelasAbertas.length > 0) {
                parcelaGroup.style.display = 'block';
                parcelaSelect.innerHTML = `<option value="">-- Quitar Lançamento / Valor Livre --</option>` +
                    parcelasAbertas.map(p => `<option value="${p.id}" data-val="${p.valor}">Parcela #${p.numero_parcela} - Venc: ${formatDate(p.data_vencimento)} (${formatCurrency(p.valor)})</option>`).join('');

                parcelaSelect.value = parcelasAbertas[0].id;
                currentPayExpectedValue = Math.round((parseFloat(parcelasAbertas[0].valor) || 0) * 100) / 100;
                document.getElementById('payValor').value = currentPayExpectedValue.toFixed(2);
            } else {
                parcelaGroup.style.display = 'none';
                document.getElementById('payValor').value = currentPayExpectedValue.toFixed(2);
            }
        } else {
            parcelaGroup.style.display = 'none';
            document.getElementById('payValor').value = currentPayExpectedValue.toFixed(2);
        }
    } catch (errParc) {
        console.warn('Erro ao carregar parcelas:', errParc);
        parcelaGroup.style.display = 'none';
        document.getElementById('payValor').value = currentPayExpectedValue.toFixed(2);
    }

    checkPaymentDivergence();

    const modal = document.getElementById('paymentModal');
    if (modal) modal.classList.add('active');
}

window.handleParcelaBaixaChange = () => {
    const sel = document.getElementById('payParcelaSelect');
    const selectedOption = sel.options[sel.selectedIndex];
    if (selectedOption && selectedOption.dataset.val) {
        currentPayExpectedValue = Math.round((parseFloat(selectedOption.dataset.val) || 0) * 100) / 100;
        document.getElementById('payValor').value = currentPayExpectedValue.toFixed(2);
    }
    checkPaymentDivergence();
};

async function handlePayment(e) {
    e.preventDefault();
    const id = document.getElementById('payLancamentoId').value;
    const valorPagoInput = parseFloat(document.getElementById('payValor').value) || 0;
    const dataPagamento = document.getElementById('payData').value;
    const contaId = document.getElementById('payConta').value;
    const forma = document.getElementById('payForma').value;
    const parcelaId = document.getElementById('payParcelaSelect')?.value || null;
    const motivoText = (document.getElementById('payMotivo')?.value || '').trim();

    try {
        const l = state.lancamentos.find(item => item.id === id);
        const conta = state.contas.find(c => c.id === contaId);

        if (!l || !conta) throw new Error('Dados inválidos');

        // VALIDAÇÃO E BLOQUEIO DE VALOR DIVERGENTE SEM MOTIVO
        const diff = Math.abs(valorPagoInput - currentPayExpectedValue);
        if (diff > 0.05 && !motivoText) {
            showToast('Divergência de valor: Informe o motivo da diferença para confirmar a baixa.', 'error');
            alert(`Não é possível salvar a baixa:\n\nO valor digitado (${formatCurrency(valorPagoInput)}) é diferente do valor líquido esperado (${formatCurrency(currentPayExpectedValue)}).\n\nPor favor, preencha o campo "Motivo da Divergência" informando a justificativa da diferença (ex: tarifa bancária, juros, desconto concedido, etc.).`);
            return;
        }

        const novoValorPago = (parseFloat(l.valor_pago) || 0) + valorPagoInput;
        const novoStatus = novoValorPago >= (l.valor_total - (l.valor_tributo_total || 0) - 0.01) ? 'PAGO' : 'PARCIAL';

        // 1. Se uma parcela específica foi selecionada, marca ela como PAGO no banco
        if (parcelaId) {
            const { error: errParc } = await supabaseClient
                .from('fin_lancamento_parcelas')
                .update({ status: 'PAGO' })
                .eq('id', parcelaId);
            if (errParc) console.error("Erro ao atualizar parcela:", errParc);
        } else if (currentModalParcelas.length > 0 && novoStatus === 'PAGO') {
            await supabaseClient
                .from('fin_lancamento_parcelas')
                .update({ status: 'PAGO' })
                .eq('lancamento_id', id);
        }

        // 2. Atualiza Lançamento mestre
        const updateObj = {
            valor_pago: novoValorPago,
            status: novoStatus,
            data_pagamento: dataPagamento,
            conta_bancaria_id: contaId,
            forma_pagamento: forma
        };

        if (motivoText) {
            const loggedUser = window.currentUser?.user_metadata?.nome_completo || window.currentUser?.email || localStorage.getItem('user_email') || 'Operador';
            updateObj.motivo_divergencia = motivoText;
            const logMotivo = `[MOTIVO DIVERGÊNCIA BAIXA (${formatDate(dataPagamento)}) por ${loggedUser}]: ${motivoText}`;
            updateObj.observacoes = l.observacoes ? `${l.observacoes}\n${logMotivo}` : logMotivo;
        }

        let { error: errL } = await supabaseClient.from('fin_lancamentos').update(updateObj).eq('id', id);
        if (errL && errL.message && errL.message.includes('motivo_divergencia')) {
            console.warn("Coluna motivo_divergencia não encontrada no banco. Salvando motivo no campo observações...");
            delete updateObj.motivo_divergencia;
            const { error: retryErr } = await supabaseClient.from('fin_lancamentos').update(updateObj).eq('id', id);
            if (retryErr) throw retryErr;
        } else if (errL) {
            throw errL;
        }

        // 3. Atualiza Saldo da Conta Bancária
        const fator = l.tipo === 'PAGAR' ? -1 : 1;
        const novoSaldo = parseFloat(conta.saldo_atual) + (valorPagoInput * fator);
        const { error: errC } = await supabaseClient.from('fin_contas_bancarias').update({
            saldo_atual: novoSaldo
        }).eq('id', contaId);
        if (errC) throw errC;

        if (typeof registrarLog === 'function') {
            registrarLog('financeiro', 'ALTERAÇÃO', `DETALHE: Baixou/Registrou pagamento no lançamento (${l.tipo}): ${l.descricao} - Valor Baixado: R$ ${valorPagoInput} (Esperado: R$ ${currentPayExpectedValue}). Conta: ${conta.nome}${motivoText ? ' - Motivo Divergência: ' + motivoText : ''}`);
        }

        closeModal('paymentModal');
        await loadInitialData();
        renderAll();
        showToast('Pagamento registrado com sucesso!', 'success');
    } catch (err) {
        showToast('Erro ao registrar pagamento: ' + err.message, 'error');
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
        if (typeof registrarLog === 'function') registrarLog('financeiro', 'INCLUSÃO', `DETALHE: Duplicou lançamento (${l.tipo}): ${l.descricao}`);

        await loadInitialData();
        renderAll();
        showToast('Duplicado!', 'success');
    } catch (err) {
        showToast('Erro: ' + err.message, 'error');
    }
}

/** Abre o modal de confirmação de estorno/reversão */
function reverterPagamento(id) {
    const l = state.lancamentos.find(item => item.id === id);
    if (!l) return;

    const mod = l.tipo === 'RECEBER' ? 'financeiro_receber' : 'financeiro_pagar';
    if (typeof canDo === 'function' && !canDo(mod, 'edit')) {
        showToast('Você não tem permissão para esta ação.', 'error');
        return;
    }

    const tipoText = l.tipo === 'PAGAR' ? 'o Pagamento' : 'o Recebimento';
    const valorText = formatCurrency(l.valor_pago || l.valor_total);

    document.getElementById('estornoLancamentoId').value = l.id;
    document.getElementById('estornoMotivoText').value = '';
    document.getElementById('estornoTituloText').innerText = `Estornar ${tipoText} (${l.codigo_sequencial || 'Ref'})`;
    document.getElementById('estornoInfoText').innerText = `Lançamento: "${l.descricao}" (${valorText}). O status retornará para ABERTO e o saldo pago será estornado da conta bancária.`;

    const modal = document.getElementById('estornoModal');
    if (modal) {
        modal.classList.add('active');
        if (window.lucide) lucide.createIcons();
    }
}

/** Executa o estorno/reversão de baixa com o motivo obrigatório */
async function handleEstornoSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('estornoLancamentoId').value;
    const motivoText = document.getElementById('estornoMotivoText').value.trim();

    if (!motivoText) {
        showToast('Motivo obrigatório: Informe a justificativa do estorno.', 'error');
        alert('Não é possível concluir o estorno sem informar o motivo da reversão.');
        return;
    }

    const l = state.lancamentos.find(item => item.id === id);
    if (!l) return;

    try {
        if (typeof window.showLoader === 'function') window.showLoader();

        const valorPagoAtual = parseFloat(l.valor_pago) || parseFloat(l.valor_total) || 0;
        const contaId = l.conta_bancaria_id;

        // 1. Estorna saldo da Conta Bancária (se houve conta vinculada)
        if (contaId && valorPagoAtual > 0) {
            const { data: contaObj } = await supabaseClient.from('fin_contas_bancarias').select('*').eq('id', contaId).single();
            if (contaObj) {
                // Para PAGAR (saída), a reversão DEVOLVE o saldo (+). Para RECEBER (entrada), SUBTRAI (-).
                const fator = l.tipo === 'PAGAR' ? 1 : -1;
                const novoSaldo = parseFloat(contaObj.saldo_atual || 0) + (valorPagoAtual * fator);
                await supabaseClient.from('fin_contas_bancarias').update({
                    saldo_atual: novoSaldo
                }).eq('id', contaId);
            }
        }

        // 2. Reseta status das parcelas se existirem
        await supabaseClient
            .from('fin_lancamento_parcelas')
            .update({ status: 'PENDENTE' })
            .eq('lancamento_id', id);

        // 3. Atualiza o lançamento mestre para ABERTO e anexa o motivo do estorno
        const loggedUser = window.currentUser?.user_metadata?.nome_completo || window.currentUser?.email || localStorage.getItem('user_email') || 'Operador';
        const dataHojeStr = formatDate(new Date().toISOString().split('T')[0]);
        const logEstorno = `[MOTIVO ESTORNO/REVERSÃO (${dataHojeStr}) por ${loggedUser}]: ${motivoText}`;
        const novasObs = l.observacoes ? `${l.observacoes}\n${logEstorno}` : logEstorno;

        const updateObj = {
            valor_pago: 0,
            status: 'ABERTO',
            data_pagamento: null,
            observacoes: novasObs,
            motivo_estorno: motivoText
        };

        let { error: errL } = await supabaseClient.from('fin_lancamentos').update(updateObj).eq('id', id);
        if (errL && errL.message && errL.message.includes('motivo_estorno')) {
            delete updateObj.motivo_estorno;
            const { error: retryErr } = await supabaseClient.from('fin_lancamentos').update(updateObj).eq('id', id);
            if (retryErr) throw retryErr;
        } else if (errL) {
            throw errL;
        }

        if (typeof registrarLog === 'function') {
            registrarLog('financeiro', 'ALTERAÇÃO', `DETALHE: Estornou/Reverteu pagamento do lançamento (${l.tipo}): ${l.descricao} - Status retornado para ABERTO. Motivo do Estorno: ${motivoText}`);
        }

        closeModal('estornoModal');
        await loadInitialData();
        renderAll();
        showToast(`Estorno realizado com sucesso! O lançamento retornou para ABERTO.`, 'success');
    } catch (err) {
        console.error('Erro ao estornar:', err);
        showToast('Erro ao estornar lançamento: ' + err.message, 'error');
    } finally {
        if (typeof window.hideLoader === 'function') window.hideLoader();
    }
}

window.handleEstornoSubmit = handleEstornoSubmit;

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
function formatDate(d) {
    if (!d) return '-';
    if (typeof d === 'string') {
        const clean = d.split('T')[0];
        const parts = clean.split('-');
        if (parts.length === 3) {
            const [yyyy, mm, dd] = parts;
            return `${dd.padStart(2, '0')}/${mm.padStart(2, '0')}/${yyyy}`;
        }
    }
    const dateObj = new Date(d);
    return isNaN(dateObj.getTime()) ? '-' : dateObj.toLocaleDateString('pt-BR');
}
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
            el.innerHTML = state.formasPagamento.map(f => `<option value="${f.nome}">${f.nome}</option>`).join('');
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
        clientesDatalist.innerHTML = state.clientes.map(f => `<option value="${f.nome}">`).join('');
    }

    populateFhistEntidadesSelect();

    const receberFormaSelect = document.getElementById('receberFormaPagamento');
    if (receberFormaSelect) {
        receberFormaSelect.innerHTML = (state.formasPagamento || []).map(f => `<option value="${f.nome}">${f.nome}</option>`).join('');
    }

    const receberTipoNotaSelect = document.getElementById('receberTipoNota');
    if (receberTipoNotaSelect) {
        receberTipoNotaSelect.innerHTML = (state.especiesNota || []).map(e => `<option value="${e.nome}">${e.nome}</option>`).join('');
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

async function filterStatus(tipo, val) {
    state.filtros[tipo].status = val;
    
    // Se o usuário solicitou ver contas PAGAS ou TODOS e ainda não carregamos itens pagos no estado:
    const needsFetch = (val === 'PAGO' || val === '' || val === 'TODOS') && state.lancamentos.every(l => l.status !== 'PAGO');
    if (needsFetch && supabaseClient) {
        if (typeof window.showLoader === 'function') window.showLoader();
        try {
            let query = supabaseClient.from('fin_lancamentos').select('*').order('data_vencimento', { ascending: false });
            if (val === 'PAGO') {
                query = query.eq('status', 'PAGO').limit(2000);
            } else {
                query = query.limit(2000);
            }
            const { data } = await query;
            if (data && data.length > 0) {
                const existingIds = new Set(state.lancamentos.map(l => l.id));
                const newItems = data.filter(d => !existingIds.has(d.id));
                state.lancamentos = [...state.lancamentos, ...newItems];
            }
        } catch (e) {
            console.error("❌ Erro ao buscar lançamentos por status sob demanda:", e);
        } finally {
            if (typeof window.hideLoader === 'function') window.hideLoader();
        }
    }
    
    renderLancamentos(tipo);
}

function filterByCategory(tipo, val) {
    state.filtros[tipo].categoria = val;
    renderLancamentos(tipo);
}

function clearFilters(tipo) {
    state.filtros[tipo] = { status: '', busca: '', categoria: '', origem: '' };

    // Reset inputs
    if (tipo === 'PAGAR') {
        if (document.getElementById('pagarSearch')) document.getElementById('pagarSearch').value = '';
        if (document.getElementById('filterStatusPagar')) document.getElementById('filterStatusPagar').value = '';
        if (document.getElementById('filterFornecedorPagar')) document.getElementById('filterFornecedorPagar').value = '';
        if (document.getElementById('filterCCPagar')) document.getElementById('filterCCPagar').value = '';
        if (document.getElementById('filterOrigemPagar')) document.getElementById('filterOrigemPagar').value = '';
    } else {
        if (document.getElementById('receberSearch')) document.getElementById('receberSearch').value = '';
        if (document.getElementById('filterStatusReceber')) document.getElementById('filterStatusReceber').value = '';
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
    const especieNotaForm = document.getElementById('especieNotaForm');

    const receberForm = document.getElementById('receberForm');

    if (entryForm) entryForm.addEventListener('submit', handleEntrySubmit);
    if (receberForm) receberForm.addEventListener('submit', handleReceberSubmit);
    if (paymentForm) paymentForm.addEventListener('submit', handlePayment);
    if (fornecedorForm) fornecedorForm.addEventListener('submit', handleFornecedorSubmit);
    if (planoForm) planoForm.addEventListener('submit', handlePlanoSubmit);
    if (custoForm) custoForm.addEventListener('submit', handleCustoSubmit);
    if (bankForm) bankForm.addEventListener('submit', handleBankSubmit);
    if (formaForm) formaForm.addEventListener('submit', handleFormaSubmit);
    if (especieNotaForm) especieNotaForm.addEventListener('submit', handleEspecieNotaSubmit);

    const bulkPaymentForm = document.getElementById('bulkPaymentForm');
    if (bulkPaymentForm) bulkPaymentForm.addEventListener('submit', handleBulkPayment);

    // Aplicar máscaras de CPF/CNPJ e Telefone no Fornecedor
    const fDocEl = document.getElementById('fDoc');
    if (fDocEl) applyMask(fDocEl, maskCnpjCpf);
    const fTelEl = document.getElementById('fTel');
    if (fTelEl) applyMask(fTelEl, maskTelefone);

    // Listeners para automação do Receber
    const recData = document.getElementById('receberData');
    const recPrazo = document.getElementById('receberPrazo');
    if (recData) recData.addEventListener('change', calculateReceberForecast);
    if (recPrazo) recPrazo.addEventListener('input', calculateReceberForecast);

    document.addEventListener('keydown', (e) => {
        // 1. ESC: Fechar qualquer modal ativo
        if (e.key === 'Escape') {
            const activeModal = document.querySelector('.modal-overlay.active');
            if (activeModal) {
                closeModal(activeModal.id);
            }
        }
        // 2. F2: Abrir o modal de lançamento rápido dependendo da aba ativa
        if (e.key === 'F2') {
            e.preventDefault();
            const tabReceberActive = document.getElementById('tab-receber')?.classList.contains('active');
            const activeBtn = document.querySelector('.tab-item.active');
            const isReceber = tabReceberActive || (activeBtn && activeBtn.getAttribute('onclick')?.includes('receber'));
            
            openEntryModal(isReceber ? 'RECEBER' : 'PAGAR');
        }
        // 3. Ctrl + Enter: Salvar / Enviar o formulário do modal ativo (Pagar ou Receber)
        if (e.ctrlKey && e.key === 'Enter') {
            const receberModal = document.getElementById('receberModal');
            if (receberModal && receberModal.classList.contains('active')) {
                e.preventDefault();
                const receberForm = document.getElementById('receberForm');
                if (receberForm) receberForm.requestSubmit();
                return;
            }

            const activeModal = document.getElementById('entryModal');
            if (activeModal && activeModal.classList.contains('active')) {
                e.preventDefault();
                const entryForm = document.getElementById('entryForm');
                if (entryForm) entryForm.requestSubmit();
                return;
            }
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
        if (!modal) return;

        // 1. Código e Valores
        document.getElementById('viewCod').innerText = l.codigo_sequencial || '-';
        document.getElementById('viewValor').innerText = formatCurrency(l.valor_total);
        document.getElementById('viewVenc').innerText = formatDate(l.data_vencimento || l.previsao_pagamento);
        
        // Status Badge
        const statusEl = document.getElementById('viewStatus');
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const dataVenc = new Date((l.data_vencimento || l.previsao_pagamento || l.data_emissao) + 'T00:00:00');
        const isOverdue = dataVenc < hoje && l.status === 'ABERTO';

        if (isOverdue) {
            statusEl.innerText = 'ATRASADO';
            statusEl.className = `status-badge status-atrasado`;
        } else {
            statusEl.innerText = l.status || 'ABERTO';
            statusEl.className = `status-badge status-${(l.status || 'aberto').toLowerCase()}`;
        }

        // Cliente / Entidade & CNPJ
        document.getElementById('viewEntidade').innerText = l.entidade_nome || '-';
        
        let docCliente = l.cnpj_cpf || '';
        if (!docCliente && state.clientes) {
            const foundClient = state.clientes.find(c => (c.nome || '').trim().toLowerCase() === (l.entidade_nome || '').trim().toLowerCase());
            if (foundClient && foundClient.cnpj_cpf) docCliente = foundClient.cnpj_cpf;
        }
        if (!docCliente && state.fornecedores) {
            const foundForn = state.fornecedores.find(f => (f.nome || '').trim().toLowerCase() === (l.entidade_nome || '').trim().toLowerCase());
            if (foundForn && (foundForn.cnpj || foundForn.doc || foundForn.cnpj_cpf)) docCliente = foundForn.cnpj || foundForn.doc || foundForn.cnpj_cpf;
        }
        document.getElementById('viewCNPJ').innerText = docCliente ? `CNPJ/CPF: ${maskCnpjCpf(docCliente)}` : 'CNPJ/CPF: Não informado';

        // Categoria
        const cat = state.categorias.find(c => c.id === l.categoria_id);
        document.getElementById('viewCategoria').innerText = `Categoria: ${cat ? `${cat.codigo} - ${cat.nome}` : '-'}`;

        // Documentos & Tipos
        document.getElementById('viewDoc').innerText = `NF: ${l.num_nf || '-'}${l.serie_nf ? ' (Série ' + l.serie_nf + ')' : ''}`;
        document.getElementById('viewTipoNotaVal').innerText = l.tipo_nota || '-';
        document.getElementById('viewFormaPagamentoVal').innerText = l.forma_pagamento || '-';

        // Datas e Prazos
        document.getElementById('viewEmissaoVal').innerText = formatDate(l.data_emissao);
        document.getElementById('viewCompetenciaVal').innerText = l.data_competencia ? l.data_competencia.substring(0, 7) : '-';
        document.getElementById('viewPrazoVal').innerText = l.prazo_pagamento ? `${l.prazo_pagamento} dias` : '-';
        
        const dataPgtoWrapper = document.getElementById('viewDataPagamentoWrapper');
        if (l.data_pagamento || l.status === 'PAGO') {
            dataPgtoWrapper.style.display = 'block';
            document.getElementById('viewDataPagamentoVal').innerText = formatDate(l.data_pagamento) || 'Baixado';
        } else {
            dataPgtoWrapper.style.display = 'none';
        }

        // Observações
        const obsEl = document.getElementById('viewObs');
        const obsWrapper = document.getElementById('viewObsWrapper');
        if (l.observacoes) {
            obsEl.innerText = l.observacoes;
            obsWrapper.style.display = 'block';
        } else {
            obsWrapper.style.display = 'none';
        }

        // Detalhamento de Tributos
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

        // Abrir modal
        modal.classList.add('active');
        if (window.lucide) lucide.createIcons();

        // 2. Carregar Itens e Parcelas (Assíncrono)
        try {
            const { data: itens } = await supabaseClient.from('fin_lancamento_itens').select('*').eq('lancamento_id', id);
            const { data: parcelas } = await supabaseClient.from('fin_lancamento_parcelas').select('*').eq('lancamento_id', id).order('numero_parcela');

            const itemsList = document.getElementById('viewItemsList');
            if (itens && itens.length > 0) {
                itemsList.innerHTML = itens.map(i => `
                    <tr>
                        <td style="padding: 0.8rem;">
                            <div style="font-weight:700;">${i.descricao || 'Item sem descrição'}</div>
                            <div style="font-size:0.75rem; opacity:0.7;">${i.tipo || 'SERVICO'}</div>
                        </td>
                        <td style="padding: 0.8rem; text-align:center;">${i.quantidade}</td>
                        <td style="padding: 0.8rem; text-align:right;">${formatCurrency(i.valor_unitario)}</td>
                        <td style="padding: 0.8rem; text-align:right; font-weight:800;">${formatCurrency(i.quantidade * i.valor_unitario)}</td>
                    </tr>
                `).join('');
            } else {
                itemsList.innerHTML = `
                    <tr>
                        <td style="padding: 0.8rem;">
                            <div style="font-weight:700;">${l.descricao || 'Lançamento Geral'}</div>
                            <div style="font-size:0.75rem; opacity:0.7;">SINTÉTICO</div>
                        </td>
                        <td style="padding: 0.8rem; text-align:center;">1</td>
                        <td style="padding: 0.8rem; text-align:right;">${formatCurrency(l.valor_total)}</td>
                        <td style="padding: 0.8rem; text-align:right; font-weight:800;">${formatCurrency(l.valor_total)}</td>
                    </tr>
                `;
            }

            const parcWrapper = document.getElementById('viewParcelasWrapper');
            const parcList = document.getElementById('viewParcelasList');
            if (parcelas && parcelas.length > 0) {
                parcWrapper.style.display = 'block';
                parcList.innerHTML = parcelas.map(p => `
                    <div class="info-card" style="padding:0.8rem; border-left: 3px solid ${p.status === 'PAGO' ? '#10b981' : '#f59e0b'};">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                            <span style="font-weight:800; font-size:0.8rem;">Parc #${p.numero_parcela}</span>
                            <span class="status-badge status-${(p.status || 'pendente').toLowerCase()}" style="font-size:0.65rem; padding:2px 6px;">${p.status}</span>
                        </div>
                        <div style="font-weight:800; font-size:0.95rem;">${formatCurrency(p.valor)}</div>
                        <div style="font-size:0.75rem; opacity:0.7; margin-top:2px;">Venc: ${formatDate(p.data_vencimento)}</div>
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
            <div class="conc-item" style="display:flex; justify-content:space-between; align-items:center; padding:1.2rem; border-bottom:1px solid #e2e8f0; background:#ffffff; border-radius:12px; margin-bottom:0.8rem; border:1px solid #e2e8f0; box-shadow:0 1px 3px rgba(0,0,0,0.04);">
                <div style="display:flex; align-items:center; gap:1.2rem;">
                    <div style="width:40px; height:40px; border-radius:10px; background:rgba(5, 150, 105, 0.1); display:flex; align-items:center; justify-content:center; color:#059669;">
                        <i data-lucide="landmark"></i>
                    </div>
                    <div>
                        <div style="font-weight:700; font-size:1rem; color:#0f172a;">${c.nome}</div>
                        <div style="font-size:0.75rem; color:#64748b">${c.banco || 'BANCO'} | Ag: ${c.agencia} | CC: ${c.numero_conta}</div>
                        ${c.pix ? `<div style="font-size:0.65rem; color:#059669; font-weight:700; margin-top:4px;">PIX: ${c.pix}</div>` : ''}
                    </div>
                </div>
                <div style="text-align:right; display:flex; align-items:center; gap:1.5rem;">
                    <div>
                        <div style="font-size:0.65rem; color:#64748b; text-transform:uppercase; font-weight:800;">Saldo Disponível</div>
                        <div style="font-weight:900; font-size:1.4rem; color:${(parseFloat(c.saldo_atual)||0) >= 0 ? '#059669' : '#dc2626'};">${formatCurrency(c.saldo_atual)}</div>
                    </div>
                    <div class="table-actions" style="display:flex; gap:0.4rem;">
                        <button class="btn-edit" style="background:#dbeafe; color:#2563eb; padding:8px; border-radius:8px; border:1px solid #bfdbfe; cursor:pointer;" onclick="openBankAccountModal('${c.id}')"><i data-lucide="edit-2" style="width:16px;"></i></button>
                        <button class="btn-delete" style="background:#fee2e2; color:#dc2626; padding:8px; border-radius:8px; border:1px solid #fca5a5; cursor:pointer;" onclick="deleteBankItem('${c.id}')"><i data-lucide="trash" style="width:16px;"></i></button>
                    </div>
                </div>
            </div>
        `).join('');
    }

    // 3. Plano de Contas (Hierárquico)
    const planoList = document.getElementById('planoContasTree');
    if (planoList) {
        const query = (document.getElementById('planoSearch')?.value || '').toLowerCase().trim();
        const filteredCategorias = state.categorias.filter(c => {
            if (!query) return true;
            return c.codigo.toLowerCase().includes(query) || c.nome.toLowerCase().includes(query);
        });
        
        planoList.innerHTML = filteredCategorias.map(c => {
            const level = c.codigo.split('.').length;
            const indent = (level - 1) * 20;
            return `
                <div style="padding: 0.8rem; border-bottom: 1px solid #f1f5f9; display:flex; justify-content:space-between; align-items:center; padding-left: ${indent + 10}px; background:#ffffff;">
                    <div>
                        <strong style="color:#059669">${c.codigo}</strong> <span style="color:#0f172a; font-weight:600;">${c.nome}</span>
                        <span class="badge secondary" style="font-size:0.65rem; margin-left:10px; background:#e2e8f0; color:#334155;">G${level}</span>
                    </div>
                    <div class="table-actions" style="display:flex; gap:0.4rem;">
                        <button class="btn-edit" style="padding:6px; background:#dbeafe; color:#2563eb; border-radius:6px; border:1px solid #bfdbfe; cursor:pointer;" onclick="openPlanoModal('${c.id}')"><i data-lucide="edit" style="width:14px;"></i></button>
                        <button class="btn-delete" style="padding:6px; background:#fee2e2; color:#dc2626; border-radius:6px; border:1px solid #fca5a5; cursor:pointer;" onclick="deletePlanoItem('${c.id}')"><i data-lucide="trash" style="width:14px;"></i></button>
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
                <div style="padding: 0.8rem; border-bottom: 1px solid #f1f5f9; display:flex; justify-content:space-between; align-items:center; padding-left: ${indent + 10}px; background:#ffffff;">
                    <div>
                        <strong style="color:#059669">${c.codigo}</strong> <span style="color:#0f172a; font-weight:600;">${c.nome}</span>
                    </div>
                    <div class="table-actions" style="display:flex; gap:0.4rem;">
                        <button class="btn-edit" style="padding:6px; background:#dbeafe; color:#2563eb; border-radius:6px; border:1px solid #bfdbfe; cursor:pointer;" onclick="openCustoModal('${c.id}')"><i data-lucide="edit" style="width:14px;"></i></button>
                        <button class="btn-delete" style="padding:6px; background:#fee2e2; color:#dc2626; border-radius:6px; border:1px solid #fca5a5; cursor:pointer;" onclick="deleteCustoItem('${c.id}')"><i data-lucide="trash" style="width:14px;"></i></button>
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

    // 6. Espécie de Nota
    const especiesNotaList = document.getElementById('especiesNotaList');
    if (especiesNotaList) {
        especiesNotaList.innerHTML = state.especiesNota.map(e => `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.02);">
                <td style="padding: 0.8rem; font-weight:700;">${e.nome}</td>
                <td style="padding: 0.8rem; text-align: right;">
                    <div class="table-actions">
                        <button class="btn-edit" style="padding:4px;" onclick="openEspecieNotaModal('${e.id}')"><i data-lucide="edit-2" style="width:14px;"></i></button>
                        <button class="btn-delete" style="padding:4px; color:#ff4757;" onclick="deleteEspecieNotaItem('${e.id}')"><i data-lucide="trash" style="width:14px;"></i></button>
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
            if (typeof registrarLog === 'function') registrarLog('financeiro', 'ALTERAÇÃO', `DETALHE: Editou fornecedor: ${data.nome}`);
        } else {
            const { error } = await supabaseClient.from('fornecedores').insert([data]);
            if (error) throw error;
            if (typeof registrarLog === 'function') registrarLog('financeiro', 'INCLUSÃO', `DETALHE: Cadastrou fornecedor: ${data.nome}`);
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
        const f = state.fornecedores.find(item => item.id === id);
        const { error } = await supabaseClient.from('fornecedores').delete().eq('id', id);
        if (error) throw error;
        if (typeof registrarLog === 'function') registrarLog('financeiro', 'EXCLUSÃO', `DETALHE: Excluiu fornecedor: ${f ? f.nome : id}`);
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

    if (!parent) {
        // Grau 1 (G1): 01, 02, 03...
        const g1Cats = (state.categorias || []).filter(c => !c.parent_id && c.codigo && !c.codigo.includes('.'));
        const codes = g1Cats.map(c => parseInt(c.codigo, 10)).filter(n => !isNaN(n));
        const nextNum = Math.max(...codes, 0) + 1;
        document.getElementById('planoCodigo').value = nextNum.toString().padStart(2, '0');
        return;
    }

    const parentLevel = parentCode.split('.').length; // 1 = G1, 2 = G2, 3 = G3...
    const targetLevel = parentLevel + 1; // 2 = G2, 3 = G3, 4 = G4...

    // Buscar TODAS as contas existentes do mesmo nível (targetLevel) no sistema para manter a sequência global contínua
    const sameLevelCats = (state.categorias || []).filter(c => c.codigo && c.codigo.split('.').length === targetLevel);

    // Extrair o último bloco numérico de cada conta para achar o maior número global já utilizado no sistema
    const globalLastNumbers = sameLevelCats.map(c => {
        const parts = c.codigo.split('.');
        const lastPart = parts[parts.length - 1];
        return parseInt(lastPart, 10);
    }).filter(n => !isNaN(n));

    const globalNextNum = Math.max(...globalLastNumbers, 0) + 1;

    let padLen = 4;
    if (sameLevelCats.length > 0) {
        // Mantém a mesma quantidade de dígitos usada pelas contas do mesmo nível no sistema
        const sampleLastPart = sameLevelCats[0].codigo.split('.').pop();
        padLen = sampleLastPart.length;
    } else {
        if (targetLevel === 2) padLen = 3;      // G2: 3 dígitos (Ex: 011, 012)
        else if (targetLevel >= 3) padLen = 4;  // G3, G4: 4 dígitos (Ex: 0089, 0090)
    }

    const code = `${parentCode}.${globalNextNum.toString().padStart(padLen, '0')}`;
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
            if (typeof registrarLog === 'function') registrarLog('financeiro', 'ALTERAÇÃO', `DETALHE: Editou conta no plano: ${data.codigo} - ${data.nome}`);
        } else {
            const { error } = await supabaseClient.from('fin_plano_contas').insert([data]);
            if (error) throw error;
            if (typeof registrarLog === 'function') registrarLog('financeiro', 'INCLUSÃO', `DETALHE: Cadastrou conta no plano: ${data.codigo} - ${data.nome}`);
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
        const item = state.categorias.find(c => c.id === id);
        const { error } = await supabaseClient.from('fin_plano_contas').delete().eq('id', id);
        if (error) throw error;
        if (typeof registrarLog === 'function') registrarLog('financeiro', 'EXCLUSÃO', `DETALHE: Excluiu conta do plano: ${item ? item.codigo + ' - ' + item.nome : id}`);
        await loadInitialData();
        renderConfig();
        updateDropdowns();
        showToast('Conta excluída!', 'success');
    } catch (e) { 
        let errMsg = e.message || String(e);
        if (errMsg.includes('violates foreign key constraint')) {
            if (errMsg.includes('on table "compras"')) {
                errMsg = 'Esta conta não pode ser excluída porque já está vinculada a um ou mais lançamentos no módulo de Compras.';
            } else if (errMsg.includes('on table "fin_lancamentos"')) {
                errMsg = 'Esta conta não pode ser excluída porque já possui lançamentos financeiros vinculados a ela.';
            } else {
                errMsg = 'Esta conta não pode ser excluída porque está sendo usada em outros registros do sistema.';
            }
        }
        showToast('Erro: ' + errMsg, 'error'); 
    }
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
            if (typeof registrarLog === 'function') registrarLog('financeiro', 'ALTERAÇÃO', `DETALHE: Editou centro de custo: ${data.codigo} - ${data.nome}`);
        } else {
            const { error } = await supabaseClient.from('fin_centros_custo').insert([data]);
            if (error) throw error;
            if (typeof registrarLog === 'function') registrarLog('financeiro', 'INCLUSÃO', `DETALHE: Cadastrou centro de custo: ${data.codigo} - ${data.nome}`);
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
        const item = state.centrosCusto.find(cc => cc.id === id);
        const { error } = await supabaseClient.from('fin_centros_custo').delete().eq('id', id);
        if (error) throw error;
        if (typeof registrarLog === 'function') registrarLog('financeiro', 'EXCLUSÃO', `DETALHE: Excluiu centro de custo: ${item ? item.codigo + ' - ' + item.nome : id}`);
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
            if (typeof registrarLog === 'function') registrarLog('financeiro', 'ALTERAÇÃO', `DETALHE: Editou conta bancária: ${data.nome}`);
        } else {
            const { error } = await supabaseClient.from('fin_contas_bancarias').insert([data]);
            if (error) throw error;
            if (typeof registrarLog === 'function') registrarLog('financeiro', 'INCLUSÃO', `DETALHE: Cadastrou conta bancária: ${data.nome} (Saldo Inicial: R$ ${data.saldo_inicial})`);
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
        const item = state.contas.find(c => c.id === id);
        const { error } = await supabaseClient.from('fin_contas_bancarias').delete().eq('id', id);
        if (error) throw error;
        if (typeof registrarLog === 'function') registrarLog('financeiro', 'EXCLUSÃO', `DETALHE: Excluiu conta bancária: ${item ? item.nome : id}`);
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
            if (typeof registrarLog === 'function') registrarLog('financeiro', 'ALTERAÇÃO', `DETALHE: Editou forma de pagamento: ${data.nome}`);
        } else {
            const { error } = await supabaseClient.from('formas_pagamento').insert([data]);
            if (error) throw error;
            if (typeof registrarLog === 'function') registrarLog('financeiro', 'INCLUSÃO', `DETALHE: Cadastrou forma de pagamento: ${data.nome}`);
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
        const item = state.formasPagamento.find(f => f.id === id);
        const { error } = await supabaseClient.from('formas_pagamento').delete().eq('id', id);
        if (error) throw error;
        if (typeof registrarLog === 'function') registrarLog('financeiro', 'EXCLUSÃO', `DETALHE: Excluiu forma de pagamento: ${item ? item.nome : id}`);
        await loadInitialData();
        renderConfig();
        updateDropdowns();
        showToast('Forma excluída!', 'success');
    } catch (e) { showToast('Erro: ' + e.message, 'error'); }
}

// === CRUD ESPÉCIE DE NOTA ===
function openEspecieNotaModal(id = null) {
    if (typeof canDo === 'function' && !canDo('financeiro_config', id ? 'edit' : 'add')) {
        showToast('Você não tem permissão para esta ação.', 'error');
        return;
    }
    const modal = document.getElementById('especieNotaModal');
    const form = document.getElementById('especieNotaForm');
    const title = document.getElementById('especieNotaModalTitle');

    form.reset();
    document.getElementById('especieNotaId').value = id || '';

    if (id) {
        const item = state.especiesNota.find(e => e.id === id);
        if (item) {
            title.innerText = 'Editar Espécie de Nota';
            document.getElementById('especieNotaNome').value = item.nome;
        }
    } else {
        title.innerText = 'Cadastrar Espécie de Nota';
    }

    modal.classList.add('active');
}

async function handleEspecieNotaSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('especieNotaId').value;
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    delete data.id;

    try {
        if (id) {
            const { error } = await supabaseClient.from('especies_nota').update(data).eq('id', id);
            if (error) throw error;
            if (typeof registrarLog === 'function') registrarLog('financeiro', 'ALTERAÇÃO', `DETALHE: Editou espécie de nota: ${data.nome}`);
        } else {
            const { error } = await supabaseClient.from('especies_nota').insert([data]);
            if (error) throw error;
            if (typeof registrarLog === 'function') registrarLog('financeiro', 'INCLUSÃO', `DETALHE: Cadastrou espécie de nota: ${data.nome}`);
        }

        showToast('Espécie de Nota salva!', 'success');
        closeModal('especieNotaModal');
        await loadInitialData();
        renderConfig();
        updateDropdowns();
    } catch (err) {
        showToast('Erro: ' + err.message, 'error');
    }
}

async function deleteEspecieNotaItem(id) {
    const item = state.especiesNota.find(e => e.id === id);
    if (!item) return;

    if (!confirm(`Deseja realmente excluir a espécie de nota "${item.nome}"?`)) return;

    try {
        const { error } = await supabaseClient.from('especies_nota').delete().eq('id', id);
        if (error) throw error;

        if (typeof registrarLog === 'function') registrarLog('financeiro', 'EXCLUSÃO', `DETALHE: Excluiu espécie de nota: ${item.nome}`);
        showToast('Espécie de Nota excluída!', 'success');
        await loadInitialData();
        renderConfig();
        updateDropdowns();
    } catch (err) {
        showToast('Erro: ' + err.message, 'error');
    }
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
        
        if (typeof registrarLog === 'function') registrarLog('financeiro', 'ALTERAÇÃO', `DETALHE: Realizou baixa em lote de ${countSucesso} lançamentos (Conta: ${conta.nome})`);

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
            const detalhesExcluidos = [];
            
            for (const id of ids) {
                const l = state.lancamentos.find(item => item.id === id);
                if (l) {
                    if (l.compra_id) comprasParaReverter.add(l.compra_id);
                    const cod = l.codigo_sequencial ? `Cód: ${l.codigo_sequencial}` : 'S/C';
                    const valStr = formatCurrency(l.valor_total || 0);
                    detalhesExcluidos.push(`[${cod}] ${l.tipo || ''}: ${l.descricao || 'Sem descrição'} (${l.entidade_nome || 'Favorecido N/I'} - ${valStr})`);
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

            if (typeof registrarLog === 'function') {
                const descLog = `DETALHE: Excluiu ${countSucesso} lançamento(s) em lote:\n• ` + detalhesExcluidos.join('\n• ');
                registrarLog('financeiro', 'EXCLUSÃO EM LOTE', descLog);
            }
            
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
        if (typeof registrarLog === 'function') registrarLog('financeiro', 'ALTERAÇÃO', `DETALHE: Conciliou lançamento (${l.tipo}): ${l.descricao} (Valor: R$ ${l.valor_total})`);
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
        if (typeof registrarLog === 'function') registrarLog('financeiro', 'INCLUSÃO', `DETALHE: Lançamento rápido e conciliação criada pelo extrato: ${record.descricao} (Valor: R$ ${record.valor_total})`);
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

// ─────────────────────────────────────────────────────────────────────────────
// 🌿 LOGICA DE AUTOCOMPLETE PARA ENTRADA DE NOTAS (COMPRAS DESIGN HARMONIZADO)
// ─────────────────────────────────────────────────────────────────────────────

let currentFinAutocompleteIndex = -1;

function positionFinDropdown(inputEl, resultsDiv) {
    const rect = inputEl.getBoundingClientRect();
    const stylePos = window.getComputedStyle(resultsDiv).position;
    if (stylePos === 'fixed') {
        resultsDiv.style.top   = (rect.bottom + 4) + 'px';
        resultsDiv.style.left  = rect.left + 'px';
    } else {
        resultsDiv.style.top   = (rect.bottom + window.scrollY + 4) + 'px';
        resultsDiv.style.left  = (rect.left + window.scrollX) + 'px';
    }
    resultsDiv.style.width = rect.width + 'px';
}

window.addEventListener('scroll', () => {
    document.querySelectorAll('.autocomplete-wrapper').forEach(wrapper => {
        const resultsDiv = wrapper.querySelector('.autocomplete-results');
        const input = wrapper.querySelector('input');
        if (resultsDiv && resultsDiv.style.display !== 'none' && input) {
            positionFinDropdown(input, resultsDiv);
        }
    });
}, { passive: true });

window.handleFinAutocompleteKeydown = (e, inputEl) => {
    const resultsDiv = inputEl.parentElement.querySelector('.autocomplete-results');
    if (!resultsDiv || resultsDiv.style.display === 'none') return;

    const items = resultsDiv.querySelectorAll('.autocomplete-item');
    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        currentFinAutocompleteIndex++;
        if (currentFinAutocompleteIndex >= items.length) currentFinAutocompleteIndex = 0;
        updateFinAutocompleteHighlight(items);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        currentFinAutocompleteIndex--;
        if (currentFinAutocompleteIndex < 0) currentFinAutocompleteIndex = items.length - 1;
        updateFinAutocompleteHighlight(items);
    } else if (e.key === 'Enter') {
        if (currentFinAutocompleteIndex >= 0) {
            e.preventDefault();
            items[currentFinAutocompleteIndex].click();
            currentFinAutocompleteIndex = -1;
        }
    } else if (e.key === 'Escape') {
        e.preventDefault();
        resultsDiv.style.display = 'none';
        currentFinAutocompleteIndex = -1;
    }
};

function updateFinAutocompleteHighlight(items) {
    items.forEach((item, idx) => {
        if (idx === currentFinAutocompleteIndex) {
            item.style.background = 'rgba(45, 158, 107, 0.2)';
            item.scrollIntoView({ block: 'nearest' });
        } else {
            item.style.background = 'transparent';
        }
    });
}

window.handleFinEntidadeSearch = (el) => {
    currentFinAutocompleteIndex = -1;
    const query = el.value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const resultsDiv = el.parentElement.querySelector('.autocomplete-results');
    const hiddenId = document.getElementById('entryEntidade');
    
    if (el.value.trim() === '') {
        if (hiddenId) hiddenId.value = '';
    }

    // Busca unificada de fornecedores e clientes
    const allPartners = [
        ...(state.fornecedores || []).map(f => ({ id: f.nome, nome: f.nome, doc: f.cnpj_cpf, desc: 'Fornecedor' })),
        ...(state.clientes || []).map(c => ({ id: c.nome, nome: c.nome, doc: c.cnpj_cpf, desc: 'Cliente' }))
    ];

    const matches = query.length === 0
        ? allPartners.slice(0, 30)
        : allPartners.filter(p => {
            const nameNorm = (p.nome || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const doc = (p.doc || '').replace(/\D/g, '');
            const cleanQuery = query.replace(/\D/g, '');
            return nameNorm.includes(query) || (cleanQuery.length > 0 && doc.includes(cleanQuery));
          }).slice(0, 30);

    if (matches.length === 0) {
        resultsDiv.innerHTML = '<div class="autocomplete-item" style="color:var(--text-muted); font-size:0.75rem;">Nenhum favorecido encontrado...</div>';
    } else {
        resultsDiv.innerHTML = matches.map(p => `
            <div class="autocomplete-item" onclick="selectFinEntidade('${p.nome.replace(/'/g, "\\'")}', this)">
                <span class="prod-name">${p.nome}</span>
                <span class="prod-meta">${p.desc} ${p.doc ? `• Doc: ${p.doc}` : ''}</span>
            </div>
        `).join('');
    }
    
    positionFinDropdown(el, resultsDiv);
    resultsDiv.style.display = 'block';
};

window.selectFinEntidade = (nome, itemEl) => {
    const wrapper = itemEl.closest('.autocomplete-wrapper');
    const searchInput = document.getElementById('entryEntidadeSearch');
    const hiddenId = document.getElementById('entryEntidade');
    const resultsDiv = wrapper ? wrapper.querySelector('.autocomplete-results') : null;

    if (searchInput) searchInput.value = nome;
    if (hiddenId) hiddenId.value = nome;
    if (resultsDiv) {
        resultsDiv.style.display = 'none';
        resultsDiv.innerHTML = '';
    }
};

window.handleFhistEntidadeSearch = (el) => {
    currentFinAutocompleteIndex = -1;
    const query = el.value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const wrapper = el.closest('.autocomplete-wrapper');
    if (!wrapper) return;
    let resultsDiv = wrapper.querySelector('.autocomplete-results');
    if (!resultsDiv) return;

    const allPartners = [
        ...(state.fornecedores || []).map(f => ({ nome: f.nome, doc: f.cnpj_cpf || f.cpf || f.cnpj || '', type: 'FORNECEDOR' })),
        ...(state.clientes || []).map(c => ({ nome: c.nome, doc: c.cnpj_cpf || c.cpf || c.cnpj || '', type: 'CLIENTE' }))
    ];

    const partnerMap = new Map();
    allPartners.forEach(p => {
        if (!p.nome) return;
        const key = p.nome.toLowerCase().trim();
        if (!partnerMap.has(key) || (p.doc && !partnerMap.get(key).doc)) {
            partnerMap.set(key, p);
        }
    });
    const uniquePartners = Array.from(partnerMap.values()).sort((a,b) => a.nome.localeCompare(b.nome));

    const matches = query.length === 0
        ? uniquePartners.slice(0, 35)
        : uniquePartners.filter(p => {
            const nameNorm = p.nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const docClean = (p.doc || '').replace(/\D/g, '');
            const queryClean = query.replace(/\D/g, '');
            return nameNorm.includes(query) || (queryClean.length > 0 && docClean.includes(queryClean));
          }).slice(0, 35);

    if (matches.length === 0) {
        resultsDiv.innerHTML = '<div class="autocomplete-item" style="color:var(--text-muted); font-size:0.78rem; padding:0.8rem 1rem;">Nenhum favorecido encontrado...</div>';
    } else {
        resultsDiv.innerHTML = matches.map(p => {
            const escName = p.nome.replace(/'/g, "\\'");
            const docStr = p.doc ? ` • DOC: ${p.doc}` : '';
            return `
                <div class="autocomplete-item" onclick="selectFhistEntidade('${escName}', this)">
                    <span class="prod-name" style="font-weight:800; font-size:0.85rem;">${p.nome}</span>
                    <span class="prod-meta" style="font-size:0.7rem; font-weight:700; text-transform:uppercase; margin-top:3px;">${p.type}${docStr}</span>
                </div>
            `;
        }).join('');
    }

    positionFinDropdown(el, resultsDiv);
    resultsDiv.style.display = 'block';
};

window.selectFhistEntidade = (nome, itemEl) => {
    const wrapper = itemEl.closest('.autocomplete-wrapper');
    const input = wrapper ? wrapper.querySelector('input') : null;
    const resultsDiv = wrapper ? wrapper.querySelector('.autocomplete-results') : null;

    if (input) input.value = nome;
    if (resultsDiv) {
        resultsDiv.style.display = 'none';
        resultsDiv.innerHTML = '';
    }
};

window.handleFinCategoriaSearch = (el) => {
    currentFinAutocompleteIndex = -1;
    const query = el.value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const resultsDiv = el.parentElement.querySelector('.autocomplete-results');
    const hiddenId = document.getElementById('entryCategoriaId');
    
    if (el.value.trim() === '') {
        if (hiddenId) hiddenId.value = '';
    }

    let matches = [];
    if (query.length === 0) {
        matches = [...(state.categorias || [])];
        matches.sort((a, b) => {
            const aCod = a.codigo || '';
            const bCod = b.codigo || '';
            return aCod.localeCompare(bCod, undefined, { numeric: true, sensitivity: 'base' });
        });
    } else {
        // 1. Encontrar correspondências diretas
        const directMatches = (state.categorias || []).filter(c => {
            const nameNorm = (c.nome || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const cod = (c.codigo || '').toLowerCase();
            return nameNorm.includes(query) || cod.includes(query);
        });

        // 2. Coletar IDs de correspondências diretas, seus descendentes E todos os seus ancestrais (pais/grupos)
        const matchedIds = new Set();
        directMatches.forEach(dm => {
            matchedIds.add(dm.id);

            // Adiciona ancestrais
            if (dm.codigo) {
                const parts = dm.codigo.split('.');
                for (let i = 1; i < parts.length; i++) {
                    const parentCode = parts.slice(0, i).join('.');
                    const parentCat = (state.categorias || []).find(cat => cat.codigo === parentCode);
                    if (parentCat) {
                        matchedIds.add(parentCat.id);
                    }
                }
            }

            // Adiciona subcategorias descendentes
            if (dm.codigo) {
                (state.categorias || []).forEach(cat => {
                    if (cat.codigo && cat.codigo.startsWith(dm.codigo + '.')) {
                        matchedIds.add(cat.id);
                    }
                });
            }
        });

        matches = (state.categorias || []).filter(c => matchedIds.has(c.id));
        
        // Ordena hierarquicamente por código
        matches.sort((a, b) => {
            const aCod = a.codigo || '';
            const bCod = b.codigo || '';
            return aCod.localeCompare(bCod, undefined, { numeric: true, sensitivity: 'base' });
        });
    }

    if (matches.length === 0) {
        resultsDiv.innerHTML = '<div class="autocomplete-item" style="color:var(--text-muted); font-size:0.75rem;">Nenhuma categoria encontrada...</div>';
    } else {
        resultsDiv.innerHTML = matches.map(c => {
            const label = (c.codigo ? `${c.codigo} - ` : '') + c.nome;
            const level = c.codigo ? c.codigo.split('.').length - 1 : 0;
            const indentStyle = `padding-left: ${1 + level * 1.2}rem;`;
            
            // Check if this category has children (is parent)
            const isParent = (state.categorias || []).some(cat => cat.parent_id === c.id || (cat.codigo && c.codigo && cat.codigo.startsWith(c.codigo + '.')));
            
            if (isParent) {
                return `
                    <div class="autocomplete-item" style="opacity: 0.6; cursor: not-allowed; background: rgba(255,255,255,0.02); font-weight: bold; border-left: 3px solid rgba(255,255,255,0.1); ${indentStyle}" onclick="event.stopPropagation();">
                        <span class="prod-name" style="color: var(--text-muted);">${label} (Grupo)</span>
                    </div>
                `;
            } else {
                return `
                    <div class="autocomplete-item" style="${indentStyle}" onclick="selectFinCategoria('${c.id}', '${label.replace(/'/g, "\\'")}', this)">
                        <span class="prod-name">${label}</span>
                    </div>
                `;
            }
        }).join('');
    }
    
    positionFinDropdown(el, resultsDiv);
    resultsDiv.style.display = 'block';
};

window.selectFinCategoria = (id, label, itemEl) => {
    const wrapper = itemEl.closest('.autocomplete-wrapper');
    const searchInput = document.getElementById('entryCategoriaSearch');
    const hiddenId = document.getElementById('entryCategoriaId');
    const resultsDiv = wrapper.querySelector('.autocomplete-results');

    searchInput.value = label;
    hiddenId.value = id;
    resultsDiv.style.display = 'none';
    resultsDiv.innerHTML = '';
};

// Autocomplete EXCLUSIVO para Contas de Receita (Grupo 03)
window.handleFinReceitaCategoriaSearch = (el) => {
    currentFinAutocompleteIndex = -1;
    const query = el.value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const resultsDiv = el.parentElement.querySelector('.autocomplete-results');
    const hiddenId = document.getElementById('receberCategoriaId');
    
    if (el.value.trim() === '') {
        if (hiddenId) hiddenId.value = '';
    }

    // Filtrar apenas contas da classe RECEITA FINANCEIRA (Grupo 03.12 / 03.012 ou nome 'RECEITA FINANCEIRA')
    const recFinParent = (state.categorias || []).find(c => {
        const name = (c.nome || '').toUpperCase();
        const cod = (c.codigo || '');
        return cod.startsWith('03.12') || cod.startsWith('03.012') || name.includes('RECEITA FINANCEIRA');
    });

    const parentCodePrefix = recFinParent ? recFinParent.codigo : '03.12';

    const receitaCategories = (state.categorias || []).filter(c => {
        if (!c.codigo) return false;
        return c.codigo === parentCodePrefix || c.codigo.startsWith(parentCodePrefix + '.') || (recFinParent && c.parent_id === recFinParent.id);
    });

    let matches = [];
    if (query.length === 0) {
        matches = [...receitaCategories];
    } else {
        matches = receitaCategories.filter(c => {
            const nameNorm = (c.nome || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const cod = (c.codigo || '').toLowerCase();
            return nameNorm.includes(query) || cod.includes(query);
        });
    }

    matches.sort((a, b) => (a.codigo || '').localeCompare(b.codigo || '', undefined, { numeric: true, sensitivity: 'base' }));

    if (matches.length === 0) {
        resultsDiv.innerHTML = '<div class="autocomplete-item" style="color:var(--text-muted); font-size:0.75rem;">Nenhuma conta de Receita Financeira encontrada...</div>';
    } else {
        resultsDiv.innerHTML = matches.map(c => {
            const label = (c.codigo ? `${c.codigo} - ` : '') + c.nome;
            const level = c.codigo ? c.codigo.split('.').length - 1 : 0;
            const indentStyle = `padding-left: ${1 + level * 1.2}rem;`;
            
            const isParent = receitaCategories.some(cat => cat.parent_id === c.id || (cat.codigo && c.codigo && cat.codigo.startsWith(c.codigo + '.')));
            
            if (isParent) {
                return `
                    <div class="autocomplete-item" style="opacity: 0.6; cursor: not-allowed; background: rgba(255,255,255,0.02); font-weight: bold; border-left: 3px solid rgba(255,255,255,0.1); ${indentStyle}" onclick="event.stopPropagation();">
                        <span class="prod-name" style="color: var(--text-muted);">${label} (Grupo)</span>
                    </div>
                `;
            } else {
                return `
                    <div class="autocomplete-item" style="${indentStyle}" onclick="selectFinReceitaCategoria('${c.id}', '${label.replace(/'/g, "\\'")}', this)">
                        <span class="prod-name">${label}</span>
                    </div>
                `;
            }
        }).join('');
    }
    
    positionFinDropdown(el, resultsDiv);
    resultsDiv.style.display = 'block';
};

window.selectFinReceitaCategoria = (id, label, itemEl) => {
    const wrapper = itemEl.closest('.autocomplete-wrapper');
    const searchInput = document.getElementById('receberCategoriaSearch');
    const hiddenId = document.getElementById('receberCategoriaId');
    const resultsDiv = wrapper.querySelector('.autocomplete-results');

    if (searchInput) {
        searchInput.value = label;
        searchInput.style.borderColor = '';
    }
    if (hiddenId) hiddenId.value = id;
    if (resultsDiv) {
        resultsDiv.style.display = 'none';
        resultsDiv.innerHTML = '';
    }
};

// Fecha drop downs ao clicar fora
document.addEventListener('click', (e) => {
    document.querySelectorAll('.autocomplete-wrapper').forEach(wrapper => {
        const resultsDiv = wrapper.querySelector('.autocomplete-results');
        const input = wrapper.querySelector('input[type="text"]');
        if (resultsDiv && input && !input.contains(e.target) && !resultsDiv.contains(e.target)) {
            resultsDiv.style.display = 'none';
        }
    });
});




// ============================================================
//  RELATÓRIOS FINANCEIROS — CONSULTA SOB DEMANDA
// ============================================================

let fhistData = [];
let fhistFiltros = {};
let _fhistSortKey = null, _fhistSortDir = 'asc';

/** Atalhos de período rápido (Este Mês, Mês Passado, Ano Atual) */
function fhistSetPeriod(modo) {
    const dataIni = document.getElementById('fhist-data-ini');
    const dataFim = document.getElementById('fhist-data-fim');
    if (!dataIni || !dataFim) return;

    const hoje = new Date();
    if (modo === 'mes_atual') {
        const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
        dataIni.value = primeiroDia.toISOString().split('T')[0];
        dataFim.value = ultimoDia.toISOString().split('T')[0];
    } else if (modo === 'mes_anterior') {
        const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
        const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
        dataIni.value = primeiroDia.toISOString().split('T')[0];
        dataFim.value = ultimoDia.toISOString().split('T')[0];
    } else if (modo === 'ano_atual') {
        dataIni.value = `${hoje.getFullYear()}-01-01`;
        dataFim.value = `${hoje.getFullYear()}-12-31`;
    } else if (modo === 'limpar') {
        dataIni.value = '';
        dataFim.value = '';
    }
}

/** Popula os selects de categoria, CC e conta ao entrar na aba */
function fhistPopulateSelects() {
    // Categorias
    const selCat = document.getElementById('fhist-categoria');
    if (selCat && selCat.options.length === 1) {
        (state.categorias || []).sort((a,b)=> (a.codigo||'').localeCompare(b.codigo||'')).forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = `${c.codigo ? c.codigo + ' — ' : ''}${c.nome}`;
            selCat.appendChild(opt);
        });
    }
    // Centros de Custo
    const selCC = document.getElementById('fhist-cc');
    if (selCC && selCC.options.length === 1) {
        (state.centrosCusto || []).sort((a,b)=> (a.nome||'').localeCompare(b.nome||'')).forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = `${c.codigo ? c.codigo + ' — ' : ''}${c.nome}`;
            selCC.appendChild(opt);
        });
    }
    // Contas Bancárias
    const selConta = document.getElementById('fhist-conta');
    if (selConta && selConta.options.length === 1) {
        (state.contas || []).forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.nome;
            selConta.appendChild(opt);
        });
    }

    // Populate Select de Favorecido no Relatório
    populateFhistEntidadesSelect();

    if (window.lucide) lucide.createIcons();
}

function populateFhistEntidadesSelect() {
    const selEntidade = document.getElementById('fhist-entidade');
    if (!selEntidade) return;
    const currentVal = selEntidade.value;
    
    const allPartners = [
        ...(state.fornecedores || []).map(f => ({ nome: f.nome, doc: f.cnpj_cpf || f.cpf || f.cnpj || '', type: 'Fornecedor' })),
        ...(state.clientes || []).map(c => ({ nome: c.nome, doc: c.cnpj_cpf || c.cpf || c.cnpj || '', type: 'Cliente' }))
    ];

    const partnerMap = new Map();
    allPartners.forEach(p => {
        if (!p.nome) return;
        const key = p.nome.toLowerCase().trim();
        if (!partnerMap.has(key) || (p.doc && !partnerMap.get(key).doc)) {
            partnerMap.set(key, p);
        }
    });
    const uniquePartners = Array.from(partnerMap.values()).sort((a,b) => a.nome.localeCompare(b.nome));

    let html = '<option value="">Todos os Favorecidos (Clientes e Fornecedores)</option>';
    uniquePartners.forEach(p => {
        const docStr = p.doc ? ` — Doc: ${p.doc}` : '';
        html += `<option value="${p.nome.replace(/"/g, '&quot;')}">${p.nome} [${p.type}]${docStr}</option>`;
    });
    selEntidade.innerHTML = html;
    if (currentVal) selEntidade.value = currentVal;
}

/** Limpa todos os filtros e reset da área de resultado */
function fhistLimpar() {
    ['fhist-tipo','fhist-date-field','fhist-status','fhist-entidade','fhist-data-ini','fhist-data-fim','fhist-categoria','fhist-cc','fhist-conta'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.style.borderColor = '';
        if (el.tagName === 'SELECT') el.selectedIndex = 0;
        else el.value = '';
    });
    fhistData = [];
    fhistFiltros = {};
    const area = document.getElementById('fhist-result-area');
    if (area) area.innerHTML = `
        <div class="glass-table-container">
            <div class="fhist-empty">
                <div class="fhist-empty-icon"><i data-lucide="file-bar-chart"></i></div>
                <div class="fhist-empty-title">Configure os filtros e gere o relatório</div>
                <div class="fhist-empty-sub">Selecione o período (início/fim), tipo de lançamento, status e demais opções, depois clique em <strong>Gerar Relatório</strong> para consultar os dados.</div>
            </div>
        </div>`;
    if (window.lucide) lucide.createIcons();
}

/** Formata data para exibição */
function fhistFmtDate(val) {
    if (!val) return '—';
    try { return new Date(val + 'T00:00:00').toLocaleDateString('pt-BR'); } catch { return val; }
}

/** Formata valor monetário */
function fhistFmtCurrency(val) {
    const n = parseFloat(val);
    if (isNaN(n)) return '—';
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Status badge para financeiro */
function fhistBadge(status) {
    const map = {
        PAGO:      { cls: 'background:rgba(16,185,129,0.15);color:#34d399;border:1px solid rgba(16,185,129,0.25)', label: 'PAGO' },
        ABERTO:    { cls: 'background:rgba(245,158,11,0.15);color:#fcd34d;border:1px solid rgba(245,158,11,0.25)', label: 'ABERTO' },
        CANCELADO: { cls: 'background:rgba(100,116,139,0.15);color:#94a3b8;border:1px solid rgba(100,116,139,0.25)', label: 'CANCELADO' },
        PARCIAL:   { cls: 'background:rgba(14,165,233,0.15);color:#38bdf8;border:1px solid rgba(14,165,233,0.25)', label: 'PARCIAL' },
        ATRASADO:  { cls: 'background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.25)', label: 'ATRASADO' },
    };
    const d = map[status] || { cls: 'background:rgba(99,102,241,0.15);color:#818cf8;border:1px solid rgba(99,102,241,0.25)', label: status || '—' };
    return `<span style="display:inline-flex;align-items:center;padding:0.2rem 0.65rem;border-radius:50px;font-size:0.68rem;font-weight:700;letter-spacing:0.04rem;${d.cls}">${d.label}</span>`;
}

/** Executa a query on-demand no Supabase */
async function fhistGerar() {
    if (!supabaseClient) { console.warn('[fhist] supabaseClient not ready'); return; }

    const tipo      = document.getElementById('fhist-tipo')?.value         || '';
    const dateField = document.getElementById('fhist-date-field')?.value   || 'data_vencimento';
    const dataIni   = document.getElementById('fhist-data-ini')?.value     || '';
    const dataFim   = document.getElementById('fhist-data-fim')?.value     || '';
    const status    = document.getElementById('fhist-status')?.value       || '';
    const entidade  = document.getElementById('fhist-entidade')?.value     || '';
    const catId     = document.getElementById('fhist-categoria')?.value    || '';
    const ccId      = document.getElementById('fhist-cc')?.value           || '';
    const contaId   = document.getElementById('fhist-conta')?.value        || '';

    // Validação de Período Obrigatório
    if (!dataIni || !dataFim) {
        showToast('É obrigatório selecionar o período (Data Início e Data Fim) antes de gerar o relatório.', 'error');
        const elIni = document.getElementById('fhist-data-ini');
        const elFim = document.getElementById('fhist-data-fim');
        if (elIni) elIni.style.borderColor = !dataIni ? '#ef4444' : '';
        if (elFim) elFim.style.borderColor = !dataFim ? '#ef4444' : '';
        if (!dataIni && elIni) elIni.focus();
        else if (!dataFim && elFim) elFim.focus();
        return;
    } else {
        const elIni = document.getElementById('fhist-data-ini');
        const elFim = document.getElementById('fhist-data-fim');
        if (elIni) elIni.style.borderColor = '';
        if (elFim) elFim.style.borderColor = '';
    }

    if (dataIni > dataFim) {
        showToast('A Data Início não pode ser posterior à Data Fim.', 'error');
        return;
    }

    fhistFiltros = { tipo, dateField, dataIni, dataFim, status, entidade, catId, ccId, contaId };

    const btn = document.getElementById('btn-fhist-gerar');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="fhist-spinner"></span> Consultando...'; }
    const area = document.getElementById('fhist-result-area');
    if (area) area.innerHTML = '<div class="glass-table-container"><div class="fhist-empty"><span class="fhist-spinner"></span><div class="fhist-empty-title" style="margin-top:0">Buscando dados...</div></div></div>';

    try {
        let query = supabaseClient.from('fin_lancamentos').select('*');

        if (tipo)    query = query.eq('tipo', tipo);
        if (status)  query = query.eq('status', status);
        if (dataIni) query = query.gte(dateField, dataIni);
        if (dataFim) query = query.lte(dateField, dataFim);
        if (entidade) query = query.ilike('entidade_nome', `%${entidade}%`);
        if (catId)   query = query.eq('categoria_id', catId);
        if (ccId)    query = query.eq('centro_custo_id', ccId);
        if (contaId) query = query.eq('conta_id', contaId);

        const { data, error } = await query.order(dateField, { ascending: false }).limit(2000);
        if (error) throw error;

        fhistData = data || [];
        fhistRenderTabela();

    } catch (err) {
        console.error('[fhist]', err);
        if (area) area.innerHTML = `
            <div class="glass-table-container">
                <div class="fhist-empty">
                    <div class="fhist-empty-icon" style="background:rgba(239,68,68,0.1);border-color:rgba(239,68,68,0.2)"><i data-lucide="alert-triangle" style="color:#ef4444"></i></div>
                    <div class="fhist-empty-title">Erro ao consultar dados</div>
                    <div class="fhist-empty-sub">${err.message || 'Verifique os filtros e tente novamente.'}</div>
                </div>
            </div>`;
        if (window.lucide) lucide.createIcons();
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="file-text" style="width:16px"></i> Gerar Relatório'; if (window.lucide) lucide.createIcons(); }
    }
}

/** Renderiza tabela de resultados */
function fhistRenderTabela() {
    const area = document.getElementById('fhist-result-area');
    if (!area) return;

    if (!fhistData.length) {
        area.innerHTML = `
            <div class="glass-table-container">
                <div class="fhist-empty">
                    <div class="fhist-empty-icon" style="background:rgba(245,158,11,0.08);border-color:rgba(245,158,11,0.2)"><i data-lucide="search-x" style="color:#f59e0b"></i></div>
                    <div class="fhist-empty-title">Nenhum lançamento encontrado</div>
                    <div class="fhist-empty-sub">Tente ajustar os filtros e gerar novamente.</div>
                </div>
            </div>`;
        if (window.lucide) lucide.createIcons();
        return;
    }

    // KPI totais da consulta
    const totalPagar   = fhistData.filter(l=>l.tipo==='PAGAR').reduce((s,l)=>s+(parseFloat(l.valor_total)||0),0);
    const totalReceber = fhistData.filter(l=>l.tipo==='RECEBER').reduce((s,l)=>s+(parseFloat(l.valor_total)||0),0);
    const totalPago    = fhistData.reduce((s,l)=>s+(parseFloat(l.valor_pago)||0),0);
    const saldo        = totalReceber - totalPagar;

    const kpis = `
        <div class="fhist-kpi-strip">
            <div class="fhist-kpi qtd"><div class="fhist-kpi-label">Lançamentos</div><div class="fhist-kpi-value">${fhistData.length}</div></div>
            <div class="fhist-kpi pagar"><div class="fhist-kpi-label">Total a Pagar</div><div class="fhist-kpi-value">${fhistFmtCurrency(totalPagar)}</div></div>
            <div class="fhist-kpi receber"><div class="fhist-kpi-label">Total a Receber</div><div class="fhist-kpi-value">${fhistFmtCurrency(totalReceber)}</div></div>
            <div class="fhist-kpi"><div class="fhist-kpi-label">Total Pago/Recebido</div><div class="fhist-kpi-value" style="color:#94a3b8">${fhistFmtCurrency(totalPago)}</div></div>
            <div class="fhist-kpi saldo"><div class="fhist-kpi-label">Saldo Resultado</div><div class="fhist-kpi-value" style="color:${saldo>=0?'#10b981':'#ef4444'}">${fhistFmtCurrency(saldo)}</div></div>
        </div>`;

    // Chips de filtros ativos
    const dateFieldLabels = { data_vencimento:'Vencimento', data_pagamento:'Pagamento', data_emissao:'Emissão', data_competencia:'Competência' };
    const chips = Object.entries(fhistFiltros).filter(([,v])=>v).map(([k,v]) => {
        const labelMap = { tipo:'Tipo', dateField:'Campo Data', dataIni:'De', dataFim:'Até', status:'Status', entidade:'Entidade', catId:'Categoria', ccId:'C. Custo', contaId:'Conta' };
        let display = v;
        if (k === 'tipo') display = v === 'PAGAR' ? 'Contas a Pagar' : 'Contas a Receber';
        if (k === 'dateField') display = dateFieldLabels[v] || v;
        if (k === 'catId') { const c = (state.categorias||[]).find(x=>x.id===v); display = c ? `${c.codigo||''} ${c.nome}`.trim() : v; }
        if (k === 'ccId')  { const c = (state.centrosCusto||[]).find(x=>x.id===v); display = c ? c.nome : v; }
        if (k === 'contaId') { const c = (state.contas||[]).find(x=>x.id===v); display = c ? c.nome : v; }
        return `<span class="fhist-chip">● ${labelMap[k]||k}: <strong>${display}</strong></span>`;
    }).join('');

    const sortIco = `<i data-lucide="chevrons-up-down" style="width:11px;opacity:0.25;vertical-align:middle;margin-left:3px;"></i>`;
    const thead = `<thead><tr>
        <th onclick="fhistSort('codigo_sequencial')" style="cursor:pointer">Cód.${sortIco}</th>
        <th onclick="fhistSort('tipo')" style="cursor:pointer">Tipo${sortIco}</th>
        <th onclick="fhistSort('data_vencimento')" style="cursor:pointer">Vencimento${sortIco}</th>
        <th onclick="fhistSort('data_pagamento')" style="cursor:pointer">Pagamento${sortIco}</th>
        <th onclick="fhistSort('entidade_nome')" style="cursor:pointer">Favorecido${sortIco}</th>
        <th onclick="fhistSort('descricao')" style="cursor:pointer">Descrição${sortIco}</th>
        <th onclick="fhistSort('valor_total')" style="cursor:pointer;text-align:right">Valor Total${sortIco}</th>
        <th onclick="fhistSort('valor_pago')" style="cursor:pointer;text-align:right">Valor Pago${sortIco}</th>
        <th onclick="fhistSort('status')" style="cursor:pointer">Status${sortIco}</th>
    </tr></thead>`;

    // Lógica de Paginação do Relatório
    const totalRecords = fhistData.length;
    const totalPages = Math.ceil(totalRecords / financialPageSize) || 1;
    if (currentPageFhist > totalPages) currentPageFhist = totalPages;
    if (currentPageFhist < 1) currentPageFhist = 1;

    const startIdx = (currentPageFhist - 1) * financialPageSize;
    const endIdx = startIdx + financialPageSize;
    const pageRecords = fhistData.slice(startIdx, endIdx);

    const tbody = `<tbody>${pageRecords.map(l => {
        const hoje = new Date(); hoje.setHours(0,0,0,0);
        const venc = l.data_vencimento ? new Date(l.data_vencimento+'T00:00:00') : null;
        const isAtrasado = venc && venc < hoje && l.status === 'ABERTO';
        const statusDisplay = isAtrasado ? 'ATRASADO' : l.status;
        const tipoIcon = l.tipo === 'PAGAR'
            ? '<i data-lucide="arrow-up-circle" style="width:13px;color:#ef4444;vertical-align:middle"></i>'
            : '<i data-lucide="arrow-down-circle" style="width:13px;color:#10b981;vertical-align:middle"></i>';
        return `<tr>
            <td style="font-weight:800;color:#6366f1;font-family:'JetBrains Mono',monospace;font-size:0.78rem">${l.codigo_sequencial||'—'}</td>
            <td>${tipoIcon} <span style="font-size:0.78rem;font-weight:600">${l.tipo==='PAGAR'?'Pagar':'Receber'}</span></td>
            <td>${fhistFmtDate(l.data_vencimento)}</td>
            <td style="color:${l.data_pagamento?'#10b981':'#94a3b8'}">${fhistFmtDate(l.data_pagamento)}</td>
            <td style="font-weight:600">${l.entidade_nome||'—'}</td>
            <td style="font-size:0.83rem;color:#94a3b8;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${(l.descricao||'').replace(/"/g,'&quot;')}">${l.descricao||'—'}</td>
            <td style="text-align:right;font-weight:700;color:${l.tipo==='PAGAR'?'#ef4444':'#10b981'}">${fhistFmtCurrency(l.valor_total)}</td>
            <td style="text-align:right;color:#94a3b8">${fhistFmtCurrency(l.valor_pago)}</td>
            <td>${fhistBadge(statusDisplay)}</td>
        </tr>`;
    }).join('')}</tbody>`;

    // Botões de navegação de páginas do relatório
    let pageButtonsHtml = '';
    const maxButtons = 5;
    let startPage = Math.max(1, currentPageFhist - Math.floor(maxButtons / 2));
    let endPage = Math.min(totalPages, startPage + maxButtons - 1);
    if (endPage - startPage + 1 < maxButtons) {
        startPage = Math.max(1, endPage - maxButtons + 1);
    }
    for (let i = startPage; i <= endPage; i++) {
        pageButtonsHtml += `<button class="page-num ${i === currentPageFhist ? 'active' : ''}" onclick="setPageFhist(${i})">${i}</button>`;
    }

    const paginationFooter = `
        <div class="pagination-footer" style="margin-top:1rem">
            <div class="pagination-info">Mostrando ${startIdx + 1}-${Math.min(endIdx, totalRecords)} de ${totalRecords} registros</div>
            <div class="pagination-controls">
                <button class="btn-page" onclick="changePageFhist(-1)" ${currentPageFhist <= 1 ? 'disabled' : ''}>Anterior</button>
                <div class="page-numbers">${pageButtonsHtml}</div>
                <button class="btn-page" onclick="changePageFhist(1)" ${currentPageFhist >= totalPages ? 'disabled' : ''}>Próxima</button>
            </div>
        </div>`;

    area.innerHTML = `
        ${kpis}
        ${chips ? `<div class="fhist-chips">${chips}</div>` : ''}
        <div class="fhist-result-header">
            <div class="fhist-result-count"><strong>${fhistData.length}</strong> lançamento(s) encontrado(s)</div>
            <div style="display:flex;gap:0.5rem">
                <button class="btn-secondary-new" onclick="fhistExcelExport()" style="font-size:0.8rem;padding:0.5rem 1rem;display:flex;align-items:center;gap:0.4rem">
                    <i data-lucide="file-spreadsheet" style="width:14px"></i> Excel
                </button>
                <button class="btn-secondary-new" onclick="fhistPdfExport()" style="font-size:0.8rem;padding:0.5rem 1rem;display:flex;align-items:center;gap:0.4rem">
                    <i data-lucide="file-text" style="width:14px"></i> PDF
                </button>
            </div>
        </div>
        <div class="glass-table-container" style="overflow-x:auto">
            <table style="width:100%;border-collapse:collapse;font-size:0.85rem">${thead}${tbody}</table>
        </div>
        ${paginationFooter}`;
    if (window.lucide) lucide.createIcons();
}

function changePageFhist(delta) {
    currentPageFhist += delta;
    fhistRenderTabela();
}

function setPageFhist(page) {
    currentPageFhist = page;
    fhistRenderTabela();
}

/** Ordena a tabela por coluna (toggle) */
function fhistSort(key) {
    _fhistSortDir = _fhistSortKey === key ? (_fhistSortDir === 'asc' ? 'desc' : 'asc') : 'asc';
    _fhistSortKey = key;
    fhistData.sort((a,b) => {
        let vA = a[key], vB = b[key];
        if (['valor_total','valor_pago','valor_tributo_total'].includes(key)) { vA=parseFloat(vA)||0; vB=parseFloat(vB)||0; }
        else { vA=(vA||'').toString().toLowerCase(); vB=(vB||'').toString().toLowerCase(); }
        return vA<vB ? (_fhistSortDir==='asc'?-1:1) : vA>vB ? (_fhistSortDir==='asc'?1:-1) : 0;
    });
    fhistRenderTabela();
}

/** Exporta para Excel */
function fhistExcelExport() {
    if (!fhistData.length) return;
    if (typeof XLSX === 'undefined') { alert('Biblioteca Excel não carregada.'); return; }
    const rows = fhistData.map(l => ({
        Código: l.codigo_sequencial, Tipo: l.tipo,
        Vencimento: fhistFmtDate(l.data_vencimento), Pagamento: fhistFmtDate(l.data_pagamento),
        Favorecido: l.entidade_nome, Descrição: l.descricao,
        'Valor Total': parseFloat(l.valor_total)||0, 'Valor Pago': parseFloat(l.valor_pago)||0,
        Status: l.status, 'NF/Doc': l.num_nf
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Histórico Financeiro');
    XLSX.writeFile(wb, `historico_financeiro_${new Date().toISOString().slice(0,10)}.xlsx`);
}

/** Exporta para PDF */
function fhistPdfExport() {
    if (!fhistData.length) return;
    if (typeof window.jspdf === 'undefined') { alert('Biblioteca PDF não carregada.'); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(13);
    doc.text('Histórico Financeiro — FrotaLink', 14, 15);
    doc.setFontSize(9);
    doc.setTextColor(150);
    doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')} • ${fhistData.length} registros`, 14, 21);
    doc.autoTable({
        head: [['Cód.','Tipo','Vencimento','Pagamento','Favorecido','Descrição','Valor Total','Valor Pago','Status']],
        body: fhistData.map(l => [
            l.codigo_sequencial||'', l.tipo,
            fhistFmtDate(l.data_vencimento), fhistFmtDate(l.data_pagamento),
            l.entidade_nome||'', l.descricao||'',
            fhistFmtCurrency(l.valor_total), fhistFmtCurrency(l.valor_pago), l.status
        ]),
        startY: 26,
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [99,102,241], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [15,23,42] },
        theme: 'striped'
    });
    doc.save(`historico_financeiro_${new Date().toISOString().slice(0,10)}.pdf`);
}

/** Exibe o modal de histórico de alterações da nota */
async function showRecordHistory(id) {
    const l = state.lancamentos.find(item => item.id === id);
    if (!l) return;

    // Preencher Header Card
    const refCode = document.getElementById('histRefCode');
    const desc = document.getElementById('histDesc');
    const entidade = document.getElementById('histEntidade');
    const valor = document.getElementById('histValor');
    const badge = document.getElementById('histStatusBadge');

    if (refCode) refCode.innerText = l.codigo_sequencial || ('Ref: ' + l.id.substring(0, 8));
    if (desc) desc.innerText = `${l.num_nf ? 'NF ' + l.num_nf + ' - ' : ''}${l.descricao || '-'}`;
    if (entidade) entidade.innerText = l.entidade_nome || '-';
    
    const bruto = parseFloat(l.valor_total) || 0;
    const tributos = parseFloat(l.valor_tributo_total) || 0;
    const liquido = bruto - tributos;
    const valFinal = l.tipo === 'RECEBER' ? liquido : bruto;
    if (valor) valor.innerText = formatCurrency(valFinal);

    if (badge) {
        badge.innerText = l.status;
        badge.className = `status-badge status-${l.status.toLowerCase()}`;
    }

    const container = document.getElementById('histTimelineContainer');
    if (container) {
        container.innerHTML = `<div style="text-align:center; padding:2rem; color:var(--text-muted);"><i data-lucide="loader" class="spin" style="width:24px;"></i> Carregando histórico de alterações...</div>`;
    }
    if (window.lucide) lucide.createIcons();

    const modal = document.getElementById('historyModal');
    if (modal) modal.classList.add('active');

    try {
        // Buscar logs do banco de dados na tabela logs_atividade
        const { data: dbLogs } = await supabaseClient
            .from('logs_atividade')
            .select('*')
            .eq('modulo', 'financeiro')
            .or(`descricao.ilike.%${l.codigo_sequencial}%,descricao.ilike.%${l.descricao.substring(0, 15)}%,descricao.ilike.%${l.id}%`)
            .order('created_at', { ascending: false });

        let historyItems = [];

        if (dbLogs && dbLogs.length > 0) {
            historyItems = dbLogs.map(log => ({
                date: new Date(log.created_at),
                user: log.usuario_email || 'Usuário',
                action: log.acao || 'ALTERAÇÃO',
                desc: log.descricao || ''
            }));
        }

        const loggedUser = window.currentUser?.user_metadata?.nome_completo || window.currentUser?.email || localStorage.getItem('user_email') || 'Operador';

        // Se houver registros específicos em observações (ex: estornos, divergências), incorporar
        if (l.observacoes) {
            const lines = l.observacoes.split('\n');
            lines.forEach(line => {
                if (line.includes('[MOTIVO DIVERGÊNCIA BAIXA') || line.includes('[MOTIVO ESTORNO/REVERSÃO')) {
                    let parsedUser = loggedUser;
                    const matchUser = line.match(/por (.*?)]:/);
                    if (matchUser && matchUser[1]) {
                        parsedUser = matchUser[1].trim();
                    }

                    historyItems.push({
                        date: new Date(l.updated_at || l.created_at || Date.now()),
                        user: parsedUser,
                        action: line.includes('ESTORNO') ? 'ESTORNO' : 'DIVERGÊNCIA BAIXA',
                        desc: line
                    });
                }
            });
        }

        // Adicionar evento inicial de cadastro se não houver registros
        if (historyItems.length === 0) {
            historyItems.push({
                date: new Date(l.created_at || Date.now()),
                user: loggedUser,
                action: 'INCLUSÃO',
                desc: `Lançamento ${l.tipo} criado: ${l.descricao} (Valor: ${formatCurrency(l.valor_total)})`
            });
        }

        // Ordenar por data decrescente
        historyItems.sort((a, b) => b.date - a.date);

        if (container) {
            container.innerHTML = historyItems.map(item => {
                const dateStr = item.date.toLocaleDateString('pt-BR') + ' às ' + item.date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                let iconName = 'edit-3';
                let badgeBg = 'rgba(99, 102, 241, 0.15)';
                let badgeColor = '#6366f1';

                if (item.action.includes('INCLUSÃO') || item.action.includes('CRIADO')) {
                    iconName = 'plus-circle';
                    badgeBg = 'rgba(16, 185, 129, 0.15)';
                    badgeColor = '#10b981';
                } else if (item.action.includes('ESTORNO') || item.action.includes('REVERSÃO')) {
                    iconName = 'rotate-ccw';
                    badgeBg = 'rgba(239, 68, 68, 0.15)';
                    badgeColor = '#ef4444';
                } else if (item.action.includes('BAIXA') || item.action.includes('PAGAMENTO')) {
                    iconName = 'check-circle';
                    badgeBg = 'rgba(245, 158, 11, 0.15)';
                    badgeColor = '#f59e0b';
                }

                return `
                    <div style="display:flex; gap:0.9rem; align-items:flex-start; background:rgba(255,255,255,0.03); border:1px solid var(--border-card); border-radius:10px; padding:0.8rem 1rem;">
                        <div style="background:${badgeBg}; color:${badgeColor}; border-radius:8px; padding:0.5rem; display:flex; align-items:center; justify-content:center; margin-top:2px;">
                            <i data-lucide="${iconName}" style="width:18px; height:18px;"></i>
                        </div>
                        <div style="flex:1;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.2rem;">
                                <span style="font-size:0.72rem; font-weight:800; color:${badgeColor}; background:${badgeBg}; padding:2px 8px; border-radius:12px;">${item.action}</span>
                                <span style="font-size:0.75rem; opacity:0.8;">${dateStr}</span>
                            </div>
                            <div style="font-size:0.82rem; font-weight:600; color:var(--text-main); margin-top:0.3rem; line-height:1.4;">${item.desc}</div>
                            <div style="font-size:0.72rem; opacity:0.7; margin-top:0.3rem;">Usuário: <strong>${item.user}</strong></div>
                        </div>
                    </div>
                `;
            }).join('');
            if (window.lucide) lucide.createIcons();
        }
    } catch (err) {
        console.error('Erro ao buscar histórico:', err);
        if (container) {
            container.innerHTML = `<div style="color:#ef4444; font-size:0.85rem; padding:1rem; text-align:center;">Erro ao carregar histórico: ${err.message}</div>`;
        }
    }
}

window.showRecordHistory = showRecordHistory;

// =============================================================================
// 🏦 MOVIMENTAÇÕES ENTRE BANCOS
// =============================================================================

/**
 * Renderiza a sub-aba completa de movimentações entre bancos:
 * cards de saldo, selects do formulário, tabela de pagamentos e histórico.
 */
window.renderBancoSubTab = async function() {
    _renderBancoSaldoCards();
    _populateTransfSelects();
    _populatePgBancoFilter();
    renderPagamentosPorBanco();
    await renderHistoricoTransferencias();
};

/** Renderiza cards de saldo por banco */
function _renderBancoSaldoCards() {
    const container = document.getElementById('banco-saldo-cards');
    if (!container) return;
    const contas = state.contas || [];
    if (!contas.length) {
        container.innerHTML = `<div style="color: #64748b; font-size:0.85rem;">Nenhuma conta bancária cadastrada.</div>`;
        return;
    }
    container.innerHTML = contas.map(c => {
        const saldo = parseFloat(c.saldo_atual) || 0;
        const saldoColor = saldo >= 0 ? '#059669' : '#dc2626';
        return `
        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-left: 4px solid #059669; border-radius: 12px; padding: 1rem 1.1rem; display:flex; flex-direction:column; gap:0.25rem; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <div style="font-size:0.68rem; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color: #64748b;">${c.banco || 'BANCO'}</div>
            <div style="font-size:0.85rem; font-weight:700; color: #0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${c.nome}">${c.nome}</div>
            <div style="font-size:0.7rem; color: #64748b;">Ag: ${c.agencia || '-'} | CC: ${c.numero_conta || c.conta || '-'}</div>
            <div style="font-size:1.15rem; font-weight:800; color:${saldoColor}; margin-top:0.25rem;">${formatCurrency(saldo)}</div>
        </div>`;
    }).join('');
}

/** Popula os selects de origem/destino do formulário de transferência */
function _populateTransfSelects() {
    const contas = state.contas || [];
    const opts = contas.map(c => `<option value="${c.id}">${c.nome} (${c.banco || ''} | Saldo: ${formatCurrency(c.saldo_atual)})</option>`).join('');
    const origemSel = document.getElementById('transf-origem');
    const destinoSel = document.getElementById('transf-destino');
    if (origemSel) origemSel.innerHTML = `<option value="">Selecione a origem...</option>${opts}`;
    if (destinoSel) destinoSel.innerHTML = `<option value="">Selecione o destino...</option>${opts}`;
    // Preencher data padrão = hoje
    const dataInput = document.getElementById('transf-data');
    if (dataInput && !dataInput.value) {
        dataInput.value = new Date().toISOString().slice(0, 10);
    }
}

/** Popula o filtro de banco na tabela Pagamentos por Banco */
function _populatePgBancoFilter() {
    const sel = document.getElementById('pgbanco-filter-banco');
    if (!sel) return;
    const contas = state.contas || [];
    const opts = contas.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
    sel.innerHTML = `<option value="">Todos os Bancos</option>${opts}`;
}

/**
 * Salva uma nova transferência entre bancos:
 * - Insere registro em fin_transferencias_bancarias
 * - Debita da conta origem e credita na conta destino
 */
window.saveTransferencia = async function() {
    const origemId  = document.getElementById('transf-origem')?.value;
    const destinoId = document.getElementById('transf-destino')?.value;
    const valor     = parseFloat(document.getElementById('transf-valor')?.value);
    const data      = document.getElementById('transf-data')?.value;
    const descricao = document.getElementById('transf-descricao')?.value?.trim();

    if (!origemId)  { showToast('Selecione a conta de origem.', 'error');  return; }
    if (!destinoId) { showToast('Selecione a conta de destino.', 'error'); return; }
    if (origemId === destinoId) { showToast('Origem e destino não podem ser iguais.', 'error'); return; }
    if (!valor || valor <= 0)  { showToast('Informe um valor válido.', 'error'); return; }
    if (!data) { showToast('Informe a data da transferência.', 'error'); return; }

    const contaOrigem  = (state.contas || []).find(c => c.id === origemId);
    const contaDestino = (state.contas || []).find(c => c.id === destinoId);
    if (!contaOrigem || !contaDestino) { showToast('Conta não encontrada.', 'error'); return; }

    if ((parseFloat(contaOrigem.saldo_atual) || 0) < valor) {
        if (!confirm(`Saldo insuficiente na conta "${contaOrigem.nome}" (Saldo atual: ${formatCurrency(contaOrigem.saldo_atual)}). Deseja continuar mesmo assim?`)) return;
    }

    try {
        // 1. Registrar a transferência
        const { error: errTransf } = await supabaseClient.from('fin_transferencias_bancarias').insert([{
            conta_origem_id:    origemId,
            conta_destino_id:   destinoId,
            valor:              valor,
            data_transferencia: data,
            descricao:          descricao || null
        }]);
        if (errTransf) throw errTransf;

        // 2. Atualizar saldo origem (debitar)
        const novoSaldoOrigem = (parseFloat(contaOrigem.saldo_atual) || 0) - valor;
        const { error: errO } = await supabaseClient.from('fin_contas_bancarias').update({ saldo_atual: novoSaldoOrigem }).eq('id', origemId);
        if (errO) throw errO;

        // 3. Atualizar saldo destino (creditar)
        const novoSaldoDestino = (parseFloat(contaDestino.saldo_atual) || 0) + valor;
        const { error: errD } = await supabaseClient.from('fin_contas_bancarias').update({ saldo_atual: novoSaldoDestino }).eq('id', destinoId);
        if (errD) throw errD;

        // 4. Atualizar state local
        contaOrigem.saldo_atual  = novoSaldoOrigem;
        contaDestino.saldo_atual = novoSaldoDestino;

        // 5. Limpar form
        document.getElementById('transf-origem').value    = '';
        document.getElementById('transf-destino').value   = '';
        document.getElementById('transf-valor').value     = '';
        document.getElementById('transf-descricao').value = '';

        showToast(`Transferência de ${formatCurrency(valor)} realizada com sucesso!`, 'success');

        // 6. Atualizar UI
        _renderBancoSaldoCards();
        _populateTransfSelects();
        await renderHistoricoTransferencias();

    } catch (err) {
        console.error('[saveTransferencia] Erro:', err);
        showToast('Erro ao registrar transferência: ' + (err.message || err), 'error');
    }
};

/**
 * Remove uma transferência e estorna os saldos das contas.
 */
window.deleteTransferencia = async function(id) {
    if (!confirm('Deseja estornar esta transferência? Os saldos das contas serão revertidos.')) return;

    try {
        // Buscar a transferência para saber os valores
        const { data: transf, error: errFetch } = await supabaseClient
            .from('fin_transferencias_bancarias')
            .select('*')
            .eq('id', id)
            .single();
        if (errFetch || !transf) throw errFetch || new Error('Transferência não encontrada.');

        // Buscar contas
        const { data: contas, error: errC } = await supabaseClient
            .from('fin_contas_bancarias')
            .select('*')
            .in('id', [transf.conta_origem_id, transf.conta_destino_id]);
        if (errC) throw errC;

        const contaOrigem  = (contas || []).find(c => c.id === transf.conta_origem_id);
        const contaDestino = (contas || []).find(c => c.id === transf.conta_destino_id);

        // Estornar: crédita na origem, débita no destino
        if (contaOrigem) {
            await supabaseClient.from('fin_contas_bancarias').update({
                saldo_atual: (parseFloat(contaOrigem.saldo_atual) || 0) + transf.valor
            }).eq('id', contaOrigem.id);
            const localO = (state.contas || []).find(c => c.id === contaOrigem.id);
            if (localO) localO.saldo_atual = (parseFloat(localO.saldo_atual) || 0) + transf.valor;
        }
        if (contaDestino) {
            await supabaseClient.from('fin_contas_bancarias').update({
                saldo_atual: (parseFloat(contaDestino.saldo_atual) || 0) - transf.valor
            }).eq('id', contaDestino.id);
            const localD = (state.contas || []).find(c => c.id === contaDestino.id);
            if (localD) localD.saldo_atual = (parseFloat(localD.saldo_atual) || 0) - transf.valor;
        }

        // Deletar o registro
        const { error: errDel } = await supabaseClient.from('fin_transferencias_bancarias').delete().eq('id', id);
        if (errDel) throw errDel;

        showToast('Transferência estornada com sucesso.', 'success');
        _renderBancoSaldoCards();
        _populateTransfSelects();
        await renderHistoricoTransferencias();

    } catch (err) {
        console.error('[deleteTransferencia] Erro:', err);
        showToast('Erro ao estornar transferência: ' + (err.message || err), 'error');
    }
};

/**
 * Renderiza a tabela "Pagamentos por Banco" filtrando os lançamentos
 * do state pelo banco, tipo e período selecionados.
 */
window.renderPagamentosPorBanco = function() {
    const tbody   = document.getElementById('pgbanco-tbody');
    const footer  = document.getElementById('pgbanco-footer');
    if (!tbody) return;

    const bancoId  = document.getElementById('pgbanco-filter-banco')?.value  || '';
    const tipoFil  = document.getElementById('pgbanco-filter-tipo')?.value   || '';
    const periodo  = document.getElementById('pgbanco-filter-periodo')?.value || 'current_month';

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    function inPeriod(dateStr) {
        if (!dateStr) return false;
        const d = new Date(dateStr + 'T00:00:00');
        if (periodo === 'all') return true;
        if (periodo === 'current_month') {
            return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
        }
        if (periodo === 'last_month') {
            const lm = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            return d.getFullYear() === lm.getFullYear() && d.getMonth() === lm.getMonth();
        }
        const days = parseInt(periodo);
        if (!isNaN(days)) {
            const cutoff = new Date(today);
            cutoff.setDate(cutoff.getDate() - days);
            return d >= cutoff && d <= today;
        }
        return true;
    }

    let items = (state.lancamentos || []).filter(l => {
        if (bancoId && l.conta_bancaria_id !== bancoId) return false;
        if (tipoFil && l.tipo !== tipoFil) return false;
        const dateRef = l.data_vencimento || l.previsao_pagamento;
        return inPeriod(dateRef);
    });

    // ordenar por data decrescente
    items = items.sort((a, b) => {
        const da = new Date(a.data_vencimento || a.previsao_pagamento || 0);
        const db = new Date(b.data_vencimento || b.previsao_pagamento || 0);
        return db - da;
    });

    if (!items.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="table-empty">Nenhum lançamento encontrado para o período/filtro selecionado.</td></tr>`;
        if (footer) footer.innerHTML = '';
        return;
    }

    const STATUS_MAP = { ABERTO: 'Aberto', PAGO: 'Pago', PARCIAL: 'Parcial', CANCELADO: 'Cancelado', ATRASADO: 'Atrasado' };
    const STATUS_COLOR = { ABERTO: '#d97706', PAGO: '#059669', PARCIAL: '#2563eb', CANCELADO: '#64748b', ATRASADO: '#dc2626' };
    const STATUS_BG    = { ABERTO: '#fef3c7', PAGO: '#d1fae5', PARCIAL: '#dbeafe', CANCELADO: '#f1f5f9', ATRASADO: '#fee2e2' };

    let totalPagar = 0, totalReceber = 0;

    tbody.innerHTML = items.map(l => {
        const conta = (state.contas || []).find(c => c.id === l.conta_bancaria_id);
        const bancoNome = conta ? conta.nome : '—';
        const dateStr = l.data_vencimento || l.previsao_pagamento || '';
        const valor = parseFloat(l.valor_total) || 0;
        if (l.tipo === 'PAGAR')   totalPagar   += valor;
        if (l.tipo === 'RECEBER') totalReceber += valor;
        const statusColor = STATUS_COLOR[l.status] || '#64748b';
        const statusBg    = STATUS_BG[l.status] || '#f1f5f9';
        const tipoColor   = l.tipo === 'PAGAR' ? '#dc2626' : '#059669';
        return `<tr>
            <td style="font-size:0.78rem; font-weight:600; color: #0f172a;">${bancoNome}</td>
            <td style="font-size:0.78rem; color: #334155;">${dateStr ? formatDate(dateStr) : '—'}</td>
            <td style="font-size:0.78rem; color: #334155;">${l.entidade_nome || '—'}</td>
            <td style="font-size:0.78rem; color: #334155; max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${l.descricao || ''}">${l.descricao || '—'}</td>
            <td><span style="font-size:0.7rem; font-weight:700; color:${tipoColor};">${l.tipo}</span></td>
            <td style="text-align:right; font-weight:700; font-size:0.82rem; color: #0f172a;">${formatCurrency(valor)}</td>
            <td><span style="font-size:0.68rem; font-weight:700; color:${statusColor}; background:${statusBg}; padding:2px 8px; border-radius:6px;">${STATUS_MAP[l.status] || l.status}</span></td>
        </tr>`;
    }).join('');

    if (footer) {
        footer.innerHTML = `
            <span>A Pagar: <span style="color:#dc2626;">${formatCurrency(totalPagar)}</span></span>
            <span>A Receber: <span style="color:#059669;">${formatCurrency(totalReceber)}</span></span>
            <span>Saldo: <span style="color:${(totalReceber - totalPagar) >= 0 ? '#059669' : '#dc2626'};">${formatCurrency(totalReceber - totalPagar)}</span></span>
        `;
    }
};

/**
 * Renderiza o histórico de transferências bancárias buscando da View Otimizada no Supabase.
 */
window.renderHistoricoTransferencias = async function() {
    const tbody = document.getElementById('transf-hist-tbody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="6" class="table-empty">Carregando...</td></tr>`;

    try {
        if (!supabaseClient) throw new Error('Supabase não inicializado.');

        // Busca da View Otimizada no banco com nomes de contas resolvidos
        const { data: transferencias, error } = await supabaseClient
            .from('view_transferencias_detalhada')
            .select('*')
            .order('data_transferencia', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(200);

        if (error) throw error;

        if (!transferencias || !transferencias.length) {
            tbody.innerHTML = `<tr><td colspan="6" class="table-empty" style="color: #64748b;">Nenhuma transferência registrada.</td></tr>`;
            return;
        }

        tbody.innerHTML = transferencias.map(t => {
            const origemNome  = t.conta_origem_nome || '—';
            const destinoNome = t.conta_destino_nome || '—';
            const dataFmt = t.data_transferencia ? formatDate(t.data_transferencia) : '—';

            return `<tr>
                <td style="font-size:0.78rem; white-space:nowrap; color: #334155;">${dataFmt}</td>
                <td style="font-size:0.78rem; font-weight:600; color: #0f172a;">${origemNome}</td>
                <td style="font-size:0.78rem; font-weight:600; color: #059669;">${destinoNome}</td>
                <td style="text-align:right; font-weight:800; color: #059669; font-size:0.88rem;">${formatCurrency(t.valor)}</td>
                <td style="font-size:0.75rem; color: #64748b; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${t.descricao || ''}">${t.descricao || '—'}</td>
                <td style="text-align:center;">
                    <button onclick="deleteTransferencia('${t.id}')" title="Estornar transferência"
                        style="background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; border-radius:6px; padding:3px 8px; cursor:pointer; font-size:0.7rem; font-weight:700; display:inline-flex; align-items:center; gap:4px; transition:all 0.2s;"
                        onmouseover="this.style.background='#fecaca'" onmouseout="this.style.background='#fee2e2'">
                        <i data-lucide="undo-2" style="width:11px;height:11px;"></i> Estornar
                    </button>
                </td>
            </tr>`;
        }).join('');

        if (window.lucide) lucide.createIcons();

    } catch (err) {
        console.error('[renderHistoricoTransferencias] Erro:', err);
        tbody.innerHTML = `<tr><td colspan="6" class="table-empty" style="color: #dc2626;">Erro ao carregar: ${err.message || err}</td></tr>`;
    }
};
