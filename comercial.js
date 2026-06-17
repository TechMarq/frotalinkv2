// --- Configuração Supabase ---
let supabaseClient = null;
try {
    if (typeof supabase !== 'undefined') {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
} catch (e) {
    console.error('Falha ao inicializar Supabase:', e);
}

// --- Estado Global ---
let contratos = [];
let config = {
    status: [],
    demandas: [],
    tabelas: []
};
let currentTab = 'dashboard';
let currentSort = { key: 'cliente', dir: 'asc' };
let editId = null;

// --- Definição de Colunas ---
const COL_DEFS = [
    // Visíveis por padrão
    { key: 'cliente',    label: 'Cliente',           sortKey: 'cliente',         pinned: false, defaultVisible: true  },
    { key: 'cnpj',       label: 'CNPJ / CPF',        sortKey: null,              pinned: false, defaultVisible: true  },
    { key: 'descricao',  label: 'Descrição',         sortKey: null,              pinned: false, defaultVisible: true  },
    { key: 'versao',     label: 'Versão',            sortKey: null,              pinned: false, defaultVisible: false },
    { key: 'referencia', label: 'Referência',        sortKey: null,              pinned: false, defaultVisible: false },
    { key: 'vigencia',   label: 'Vigência',          sortKey: null,              pinned: false, defaultVisible: false },
    { key: 'demanda',    label: 'Tipo de Demanda',   sortKey: null,              pinned: false, defaultVisible: false },
    { key: 'tabela',     label: 'Tabela de Preço',   sortKey: null,              pinned: false, defaultVisible: false },
    { key: 'assinatura', label: 'Assinatura',        sortKey: 'data_assinatura', pinned: false, defaultVisible: true  },
    { key: 'prazo',      label: 'Prazo (Meses)',     sortKey: null,              pinned: false, defaultVisible: false },
    { key: 'vencimento', label: 'Vencimento',        sortKey: 'data_vencimento', pinned: false, defaultVisible: true  },
    { key: 'status',     label: 'Status',            sortKey: null,              pinned: false, defaultVisible: true  },
    { key: 'email',      label: 'Email',             sortKey: null,              pinned: false, defaultVisible: false },
    { key: 'telefone',   label: 'Telefone',          sortKey: null,              pinned: false, defaultVisible: false },
    { key: 'responsavel',label: 'Responsável',       sortKey: null,              pinned: false, defaultVisible: false },
    { key: 'contato',    label: 'Contato Resp.',     sortKey: null,              pinned: false, defaultVisible: false },
    { key: 'observacao', label: 'Observações',       sortKey: null,              pinned: false, defaultVisible: false },
    { key: 'acoes',      label: 'Ações',             sortKey: null,              pinned: true,  defaultVisible: true  },
];

const COL_STORAGE_KEY = 'frotalink_comercial_cols_v2';
let colConfig = loadColConfig();

function loadColConfig() {
    try {
        const saved = localStorage.getItem(COL_STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            // valida integridade: todas as chaves devem existir
            const validKeys = COL_DEFS.map(c => c.key);
            if (parsed.order && parsed.order.every(k => validKeys.includes(k))) {
                return parsed;
            }
        }
    } catch (_) {}
    return getDefaultColConfig();
}

function getDefaultColConfig() {
    return {
        order: COL_DEFS.map(c => c.key),
        visible: Object.fromEntries(COL_DEFS.map(c => [c.key, c.defaultVisible]))
    };
}

function saveColConfig() {
    localStorage.setItem(COL_STORAGE_KEY, JSON.stringify(colConfig));
}

// --- Inicialização ---
document.addEventListener('DOMContentLoaded', async () => {
    await loadConfig();
    await loadContratos();
    
    setupEventListeners();
    updateDashboard();
    
    if (window.lucide) lucide.createIcons();
});

// --- Máscaras de Input ---
function maskCnpjCpf(value) {
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

function setupEventListeners() {
    // Contract Form
    document.getElementById('contratoForm').addEventListener('submit', handleSaveContrato);
    
    // Search
    document.getElementById('contratoSearch').addEventListener('input', () => {
        renderContratos();
    });

    // Admin Form
    document.getElementById('adminForm').addEventListener('submit', handleSaveAdmin);

    // Máscaras
    applyMask(document.getElementById('cliente_cnpj_cpf'), maskCnpjCpf);
    applyMask(document.getElementById('cliente_telefone'), maskTelefone);
    applyMask(document.getElementById('contato_responsavel'), maskTelefone);

    // Closing modal on ESC
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeContratoModal();
            closeAdminModal();
        }
    });
}

// --- Funções de Dados ---
async function loadConfig() {
    try {
        const [resStatus, resDemanda, resTabela] = await Promise.all([
            supabaseClient.from('com_status').select('*').order('nome'),
            supabaseClient.from('com_tipos_demanda').select('*').order('nome'),
            supabaseClient.from('com_tabelas_preco').select('*').order('nome')
        ]);

        config.status = resStatus.data || [];
        config.demandas = resDemanda.data || [];
        config.tabelas = resTabela.data || [];

        populateDropdowns();
        renderAdminLists();
    } catch (err) {
        console.error("Erro ao carregar configurações:", err);
    }
}

async function loadContratos() {
    try {
        const { data, error } = await supabaseClient
            .from('com_contratos')
            .select(`
                *,
                status:com_status(nome),
                tabela:com_tabelas_preco(nome),
                demanda:com_tipos_demanda(nome)
            `);
        
        if (error) throw error;
        contratos = data || [];
        renderContratos();
        updateDashboard();
    } catch (err) {
        console.error("Erro ao carregar contratos:", err);
    }
}

function populateDropdowns() {
    const fn = (id, list, label = 'Selecione...') => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = `<option value="">${label}</option>` + 
            list.map(item => `<option value="${item.id}">${item.nome}</option>`).join('');
    };

    fn('tipo_demanda_id', config.demandas);
    fn('tabela_preco_id', config.tabelas);
    fn('status_id', config.status);
    
    // Filters
    fn('filterStatus', config.status, 'Todos os Status');
    fn('filterDemanda', config.demandas, 'Todas as Demandas');
}



// --- Cálculo de Vencimento ---
window.calculateExpiration = () => {
    const dataAssinatura = document.getElementById('data_assinatura').value;
    const prazoMeses = parseInt(document.getElementById('prazo_meses').value);
    
    if (dataAssinatura && !isNaN(prazoMeses) && prazoMeses > 0) {
        const date = new Date(dataAssinatura + 'T12:00:00');
        date.setMonth(date.getMonth() + prazoMeses);
        document.getElementById('data_vencimento').value = date.toISOString().split('T')[0];
    } else {
        document.getElementById('data_vencimento').value = '';
    }
};

// --- Navegação ---
window.switchTab = (tabName) => {
    currentTab = tabName;
    document.querySelectorAll('.tab-item').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('onclick').includes(tabName));
    });
    document.querySelectorAll('.view-section').forEach(view => {
        view.classList.toggle('active', view.id === `view-${tabName}`);
    });
    
    if (tabName === 'dashboard') updateDashboard();
    if (tabName === 'admin') renderAdminLists();
    
    if (window.lucide) lucide.createIcons();
};

window.switchSubTab = (subId) => {
    document.querySelectorAll('.sub-view').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.sub-tab-item').forEach(t => t.classList.remove('active'));

    document.getElementById(`subview-${subId}`).classList.add('active');
    event.currentTarget.classList.add('active');
    
    if (window.lucide) lucide.createIcons();
};

// --- Renderização ---
function renderContratos() {
    const body = document.getElementById('contractsTableBody');
    if (!body) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in30Days = new Date(today);
    in30Days.setDate(today.getDate() + 30);

    const searchTerm = document.getElementById('contratoSearch').value.toLowerCase();
    const filterStatus = document.getElementById('filterStatus').value;
    const filterDemanda = document.getElementById('filterDemanda').value;

    let filtered = contratos.filter(c => {
        const clienteNome = c.cliente_nome || '';
        const clienteCnpj = c.cliente_cnpj_cpf || '';
        const descricao = c.descricao_contrato || '';
        
        const matchesSearch = clienteNome.toLowerCase().includes(searchTerm) || 
                              clienteCnpj.toLowerCase().includes(searchTerm) || 
                              descricao.toLowerCase().includes(searchTerm);
        
        const matchesStatus = !filterStatus || c.status_id === filterStatus;
        const matchesDemanda = !filterDemanda || c.tipo_demanda_id === filterDemanda;

        return matchesSearch && matchesStatus && matchesDemanda;
    });

    // Ordenação
    filtered.sort((a, b) => {
        let valA, valB;
        if (currentSort.key === 'cliente') {
            valA = (a.cliente_nome || '').toLowerCase();
            valB = (b.cliente_nome || '').toLowerCase();
        } else {
            valA = a[currentSort.key] || '';
            valB = b[currentSort.key] || '';
        }

        if (valA < valB) return currentSort.dir === 'asc' ? -1 : 1;
        if (valA > valB) return currentSort.dir === 'asc' ? 1 : -1;
        return 0;
    });

    // Renderiza thead dinamicamente
    renderTableHeader();

    // Renderiza tbody
    body.innerHTML = filtered.map(c => {
        let alertIcon = '';
        let rowHighlight = '';
        let vencColor = '#fff';

        if (c.data_vencimento) {
            const dVenc = new Date(c.data_vencimento + 'T00:00:00');
            if (dVenc < today) {
                alertIcon = `<span title="Contrato VENCIDO" style="display:inline-flex;align-items:center;justify-content:center;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.4);border-radius:6px;padding:0.2rem 0.4rem;margin-left:0.4rem;vertical-align:middle;animation:pulse-alert 1.5s ease-in-out infinite;"><i data-lucide="alert-triangle" style="width:13px;color:#ef4444;"></i></span>`;
                rowHighlight = 'border-left: 3px solid #ef4444;';
                vencColor = '#ef4444';
            } else if (dVenc <= in30Days) {
                const diasRestantes = Math.ceil((dVenc - today) / (1000 * 60 * 60 * 24));
                alertIcon = `<span title="Vence em ${diasRestantes} dia(s)" style="display:inline-flex;align-items:center;justify-content:center;background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.4);border-radius:6px;padding:0.2rem 0.4rem;margin-left:0.4rem;vertical-align:middle;"><i data-lucide="clock" style="width:13px;color:#f59e0b;"></i></span>`;
                rowHighlight = 'border-left: 3px solid #f59e0b;';
                vencColor = '#f59e0b';
            }
        }

        const isVencido = c.data_vencimento && new Date(c.data_vencimento + 'T00:00:00') < today;
        const statusColor = isVencido ? '#ef4444' : (c.status?.nome === 'ATIVO' ? '#10b981' : '#f59e0b');

        // Mapa de células por key
        const cellMap = {
            cliente:     `<td data-label="Cliente"><div style="font-weight:800;color:#fff;">${c.cliente_nome || 'N/A'}</div><div style="font-size:0.7rem;color:var(--text-muted);">${c.vigencia || '-'}</div></td>`,
            cnpj:        `<td data-label="CNPJ">${c.cliente_cnpj_cpf || '-'}</td>`,
            descricao:   `<td data-label="Descrição"><div>${c.descricao_contrato || '-'}</div><div style="font-size:0.7rem;color:var(--primary);font-weight:700;">VERSÃO: ${c.versao_contrato || '-'}</div></td>`,
            versao:      `<td data-label="Versão"><span style="font-size:0.75rem;font-weight:700;color:var(--primary);">${c.versao_contrato || '-'}</span></td>`,
            referencia:  `<td data-label="Referência"><span style="font-family:'JetBrains Mono',monospace;font-size:0.75rem;">${c.referencia || '-'}</span></td>`,
            vigencia:    `<td data-label="Vigência">${c.vigencia || '-'}</td>`,
            demanda:     `<td data-label="Demanda">${c.demanda?.nome || '-'}</td>`,
            tabela:      `<td data-label="Tabela">${c.tabela?.nome || '-'}</td>`,
            assinatura:  `<td data-label="Assinatura">${c.data_assinatura ? new Date(c.data_assinatura + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}</td>`,
            prazo:       `<td data-label="Prazo">${c.prazo_meses ? c.prazo_meses + ' meses' : '-'}</td>`,
            vencimento:  `<td data-label="Vencimento"><div style="font-weight:700;color:${vencColor};display:flex;align-items:center;flex-wrap:wrap;gap:4px;">${c.data_vencimento ? new Date(c.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}${alertIcon}</div><div style="font-size:0.65rem;color:var(--text-muted);">${c.prazo_meses || 0} meses</div></td>`,
            status:      `<td data-label="Status"><span style="background:${statusColor}22;color:${statusColor};padding:0.2rem 0.6rem;border-radius:6px;font-size:0.65rem;font-weight:800;border:1px solid ${statusColor}44;">${isVencido ? 'VENCIDO' : (c.status?.nome || 'N/A')}</span></td>`,
            email:       `<td data-label="Email"><span style="font-size:0.78rem;">${c.cliente_email || '-'}</span></td>`,
            telefone:    `<td data-label="Telefone">${c.cliente_telefone || '-'}</td>`,
            responsavel: `<td data-label="Responsável">${c.nome_responsavel || '-'}</td>`,
            contato:     `<td data-label="Contato Resp.">${c.contato_responsavel || '-'}</td>`,
            observacao:  `<td data-label="Observações"><span style="font-size:0.75rem;color:var(--text-muted);max-width:200px;display:inline-block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${(c.observacao || '').replace(/"/g,"'")}">${c.observacao || '-'}</span></td>`,
            acoes:       `<td style="text-align:right;"><div style="display:flex;gap:8px;justify-content:flex-end;"><button class="action-btn-mini" onclick="openContratoModal('${c.id}')"><i data-lucide="edit-2"></i></button><button class="action-btn-mini" onclick="deleteContrato('${c.id}')" style="color:#ef4444;"><i data-lucide="trash-2"></i></button></div></td>`
        };

        const visibleCells = colConfig.order
            .filter(k => colConfig.visible[k] !== false)
            .map(k => cellMap[k] || '')
            .join('');

        return `<tr style="${rowHighlight}">${visibleCells}</tr>`;
    }).join('');

    renderAlertBanner();
    updateTabBadge();
    renderColChips();

    if (window.lucide) lucide.createIcons();
}

function renderTableHeader() {
    const tr = document.getElementById('contractsHeader');
    if (!tr) return;

    tr.innerHTML = colConfig.order
        .filter(k => colConfig.visible[k] !== false)
        .map(k => {
            const def = COL_DEFS.find(d => d.key === k);
            if (!def) return '';
            if (def.sortKey) {
                return `<th onclick="handleSort('${def.sortKey}')" style="cursor:pointer;">${def.label} <i data-lucide="chevrons-up-down" style="width:14px;opacity:0.3;"></i></th>`;
            }
            const align = k === 'acoes' ? 'text-align:right;' : '';
            return `<th style="${align}">${def.label}</th>`;
        }).join('');
}

function renderAlertBanner() {
    const banner = document.getElementById('alertBanner');
    if (!banner) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in30Days = new Date(today);
    in30Days.setDate(today.getDate() + 30);

    const vencidos = contratos.filter(c => c.data_vencimento && new Date(c.data_vencimento + 'T00:00:00') < today);
    const aVencer = contratos.filter(c => {
        if (!c.data_vencimento) return false;
        const d = new Date(c.data_vencimento + 'T00:00:00');
        return d >= today && d <= in30Days;
    });

    if (vencidos.length === 0 && aVencer.length === 0) {
        banner.style.display = 'none';
        return;
    }

    banner.style.display = 'block';
    let html = '';

    if (vencidos.length > 0) {
        html += `
        <div style="display:flex;align-items:flex-start;gap:0.8rem;padding:0.9rem 1.2rem;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:12px;margin-bottom:0.6rem;">
            <i data-lucide="alert-triangle" style="width:18px;color:#ef4444;flex-shrink:0;margin-top:1px;"></i>
            <div style="flex:1;">
                <div style="font-size:0.8rem;font-weight:800;color:#ef4444;margin-bottom:0.3rem;">${vencidos.length} contrato(s) VENCIDO(S)</div>
                <div style="font-size:0.72rem;color:var(--text-muted);line-height:1.5;">${vencidos.map(c => `<strong style="color:#fff;">${c.cliente_nome}</strong> (${c.data_vencimento ? new Date(c.data_vencimento+'T12:00:00').toLocaleDateString('pt-BR') : '-'})`).join(' &nbsp;·&nbsp; ')}</div>
            </div>
        </div>`;
    }

    if (aVencer.length > 0) {
        html += `
        <div style="display:flex;align-items:flex-start;gap:0.8rem;padding:0.9rem 1.2rem;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:12px;">
            <i data-lucide="clock" style="width:18px;color:#f59e0b;flex-shrink:0;margin-top:1px;"></i>
            <div style="flex:1;">
                <div style="font-size:0.8rem;font-weight:800;color:#f59e0b;margin-bottom:0.3rem;">${aVencer.length} contrato(s) vencem nos próximos 30 dias</div>
                <div style="font-size:0.72rem;color:var(--text-muted);line-height:1.5;">${aVencer.map(c => { const d = new Date(c.data_vencimento+'T00:00:00'); const dias = Math.ceil((d - new Date().setHours(0,0,0,0)) / 86400000); return `<strong style="color:#fff;">${c.cliente_nome}</strong> (${dias}d)`; }).join(' &nbsp;·&nbsp; ')}</div>
            </div>
        </div>`;
    }

    banner.innerHTML = html;
}

function updateTabBadge() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in30Days = new Date(today);
    in30Days.setDate(today.getDate() + 30);

    const criticalCount = contratos.filter(c => {
        if (!c.data_vencimento) return false;
        const d = new Date(c.data_vencimento + 'T00:00:00');
        return d <= in30Days;
    }).length;

    const badge = document.getElementById('contratosTabBadge');
    if (!badge) return;
    if (criticalCount > 0) {
        badge.textContent = criticalCount;
        badge.style.display = 'inline-flex';
    } else {
        badge.style.display = 'none';
    }
}

function updateDashboard() {
    const today = new Date();
    const in30Days = new Date();
    in30Days.setDate(today.getDate() + 30);

    const ativos = contratos.filter(c => c.status?.nome === 'ATIVO');
    const vencidos = contratos.filter(c => c.data_vencimento && new Date(c.data_vencimento) < today);
    const vencendo = contratos.filter(c => {
        if (!c.data_vencimento) return false;
        const d = new Date(c.data_vencimento);
        return d >= today && d <= in30Days;
    });

    document.getElementById('dash_total_contratos').innerText = contratos.length;
    document.getElementById('dash_ativos').innerText = ativos.length;
    document.getElementById('dash_vencendo').innerText = vencendo.length;
    document.getElementById('dash_vencidos').innerText = vencidos.length;

    renderCharts();
}

function renderCharts() {
    const ctxVig = document.getElementById('chartVigencia');
    if (!ctxVig) return;

    // Vigência (Example group by 5 top)
    const vigMap = {};
    contratos.forEach(c => {
        const v = c.vigencia || 'N/D';
        vigMap[v] = (vigMap[v] || 0) + 1;
    });
    
    const labelsVig = Object.keys(vigMap);
    const dataVig = Object.values(vigMap);

    if (window.myChartVig) window.myChartVig.destroy();
    window.myChartVig = new Chart(ctxVig, {
        type: 'bar',
        data: {
            labels: labelsVig,
            datasets: [{
                label: 'Qtd Contratos',
                data: dataVig,
                backgroundColor: '#6366f1'
            }]
        },
        options: {
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } } }
        }
    });

    // Demanda
    const ctxDem = document.getElementById('chartDemanda');
    if (!ctxDem) return;

    const demMap = {};
    contratos.forEach(c => {
        const d = c.demanda?.nome || 'N/D';
        demMap[d] = (demMap[d] || 0) + 1;
    });

    if (window.myChartDem) window.myChartDem.destroy();
    window.myChartDem = new Chart(ctxDem, {
        type: 'pie',
        data: {
            labels: Object.keys(demMap),
            datasets: [{
                data: Object.values(demMap),
                backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#ef4444']
            }]
        },
        options: {
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } }
        }
    });
}

// --- Modais e CRUD ---
window.openContratoModal = async (id = null) => {
    const action = id ? 'edit' : 'add';
    if (typeof canDo === 'function' && !canDo('comercial_contratos', action)) {
        alert("Você não tem permissão para esta ação.");
        return;
    }
    editId = id;
    const form = document.getElementById('contratoForm');
    form.reset();
    document.getElementById('modalTitle').innerText = id ? 'Editar Contrato' : 'Novo Contrato';
    
    if (id) {
        const c = contratos.find(x => x.id === id);
        if (c) {
            document.getElementById('cliente_nome').value = c.cliente_nome || '';
            document.getElementById('cliente_cnpj_cpf').value = maskCnpjCpf(c.cliente_cnpj_cpf || '');
            document.getElementById('cliente_email').value = c.cliente_email || '';
            document.getElementById('cliente_telefone').value = maskTelefone(c.cliente_telefone || '');
            document.getElementById('vigencia').value = c.vigencia || '';
            document.getElementById('descricao_contrato').value = c.descricao_contrato || '';
            document.getElementById('versao_contrato').value = c.versao_contrato || '';
            document.getElementById('referencia').value = c.referencia || '';
            document.getElementById('data_assinatura').value = c.data_assinatura || '';
            document.getElementById('prazo_meses').value = c.prazo_meses || '';
            document.getElementById('data_vencimento').value = c.data_vencimento || '';
            document.getElementById('tipo_demanda_id').value = c.tipo_demanda_id || '';
            document.getElementById('tabela_preco_id').value = c.tabela_preco_id || '';
            document.getElementById('status_id').value = c.status_id || '';
            document.getElementById('nome_responsavel').value = c.nome_responsavel || '';
            document.getElementById('contato_responsavel').value = maskTelefone(c.contato_responsavel || '');
            document.getElementById('observacao').value = c.observacao || '';
        }
    }

    document.getElementById('contratoModal').classList.add('active');
};

window.closeContratoModal = () => {
    document.getElementById('contratoModal').classList.remove('active');
};

async function handleSaveContrato(e) {
    e.preventDefault();
    const btn = document.getElementById('btnSaveContrato');
    btn.disabled = true;
    btn.innerText = 'SALVANDO...';

    const payload = {
        cliente_nome: document.getElementById('cliente_nome').value,
        cliente_cnpj_cpf: document.getElementById('cliente_cnpj_cpf').value,
        cliente_email: document.getElementById('cliente_email').value,
        cliente_telefone: document.getElementById('cliente_telefone').value,
        vigencia: document.getElementById('vigencia').value,
        descricao_contrato: document.getElementById('descricao_contrato').value,
        versao_contrato: document.getElementById('versao_contrato').value,
        referencia: document.getElementById('referencia').value,
        data_assinatura: document.getElementById('data_assinatura').value || null,
        prazo_meses: parseInt(document.getElementById('prazo_meses').value) || 0,
        data_vencimento: document.getElementById('data_vencimento').value || null,
        tipo_demanda_id: document.getElementById('tipo_demanda_id').value || null,
        tabela_preco_id: document.getElementById('tabela_preco_id').value || null,
        status_id: document.getElementById('status_id').value || null,
        nome_responsavel: document.getElementById('nome_responsavel').value,
        contato_responsavel: document.getElementById('contato_responsavel').value,
        observacao: document.getElementById('observacao').value
    };

    if (!payload.cliente_nome) {
        alert("Preencha o nome do cliente.");
        btn.disabled = false;
        btn.innerText = 'SALVAR CONTRATO';
        return;
    }

    try {
        let res;
        if (editId) {
            res = await supabaseClient.from('com_contratos').update(payload).eq('id', editId);
        } else {
            res = await supabaseClient.from('com_contratos').insert([payload]);
        }

        if (res.error) throw res.error;
        
        await loadContratos();
        closeContratoModal();
        alert("Contrato salvo com sucesso!");
    } catch (err) {
        console.error("Erro ao salvar contrato:", err);
        alert("Erro ao salvar: " + err.message);
    } finally {
        btn.disabled = false;
        btn.innerText = 'SALVAR CONTRATO';
    }
}

window.deleteContrato = async (id) => {
    if (typeof canDo === 'function' && !canDo('comercial_contratos', 'delete')) {
        alert("Você não tem permissão para esta ação.");
        return;
    }
    if (!confirm("Deseja realmente excluir este contrato?")) return;
    try {
        const { error } = await supabaseClient.from('com_contratos').delete().eq('id', id);
        if (error) throw error;
        await loadContratos();
        alert("Contrato excluído.");
    } catch (err) {
        alert("Erro ao excluir: " + err.message);
    }
};

window.handleSort = (key) => {
    if (currentSort.key === key) {
        currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.key = key;
        currentSort.dir = 'asc';
    }
    renderContratos();
};

// ===== ORGANIZADOR DE COLUNAS =====
window.toggleColOrganizer = () => {
    const panel = document.getElementById('colOrganizerPanel');
    panel.classList.toggle('open');
    renderColChips();
    if (window.lucide) lucide.createIcons();
};

window.resetColConfig = () => {
    colConfig = getDefaultColConfig();
    saveColConfig();
    renderColChips();
    renderContratos();
    if (window.lucide) lucide.createIcons();
};

function renderColChips() {
    const container = document.getElementById('colChipsContainer');
    if (!container) return;

    container.innerHTML = colConfig.order.map(key => {
        const def = COL_DEFS.find(d => d.key === key);
        if (!def) return '';
        const isVisible = colConfig.visible[key] !== false;
        const isPinned = def.pinned;
        const eyeIcon = isVisible ? 'eye' : 'eye-off';

        return `
        <div class="col-chip ${!isVisible ? 'hidden-col' : ''} ${isPinned ? 'pinned-col' : ''}"
             data-key="${key}"
             draggable="${!isPinned}"
             ondragstart="colDragStart(event)"
             ondragover="colDragOver(event)"
             ondrop="colDrop(event)"
             ondragleave="colDragLeave(event)"
             ondragend="colDragEnd(event)">
            ${!isPinned ? `<span class="col-chip-drag"><i data-lucide="grip-vertical" style="width:13px;"></i></span>` : ''}
            <span>${def.label}</span>
            ${!isPinned ? `<button class="col-chip-eye ${!isVisible ? 'eye-off' : ''}" onclick="toggleColVisibility('${key}')" title="${isVisible ? 'Ocultar' : 'Mostrar'}"><i data-lucide="${eyeIcon}" style="width:13px;"></i></button>` : `<i data-lucide="lock" style="width:11px;opacity:0.5;"></i>`}
        </div>`;
    }).join('');

    if (window.lucide) lucide.createIcons();
}

window.toggleColVisibility = (key) => {
    colConfig.visible[key] = colConfig.visible[key] === false ? true : false;
    saveColConfig();
    renderColChips();
    renderContratos();
    if (window.lucide) lucide.createIcons();
};

let dragSrcKey = null;

window.colDragStart = (e) => {
    const chip = e.currentTarget;
    dragSrcKey = chip.dataset.key;
    chip.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
};

window.colDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const chip = e.currentTarget;
    if (chip.dataset.key !== dragSrcKey) chip.classList.add('drag-over');
};

window.colDragLeave = (e) => {
    e.currentTarget.classList.remove('drag-over');
};

window.colDrop = (e) => {
    e.preventDefault();
    const targetKey = e.currentTarget.dataset.key;
    e.currentTarget.classList.remove('drag-over');

    if (!dragSrcKey || dragSrcKey === targetKey) return;

    const srcDef = COL_DEFS.find(d => d.key === dragSrcKey);
    const tgtDef = COL_DEFS.find(d => d.key === targetKey);
    if (srcDef?.pinned || tgtDef?.pinned) return; // não mover pinados

    const order = [...colConfig.order];
    const srcIdx = order.indexOf(dragSrcKey);
    const tgtIdx = order.indexOf(targetKey);
    order.splice(srcIdx, 1);
    order.splice(tgtIdx, 0, dragSrcKey);
    colConfig.order = order;
    saveColConfig();
    renderColChips();
    renderContratos();
    if (window.lucide) lucide.createIcons();
};

window.colDragEnd = (e) => {
    e.currentTarget.classList.remove('dragging');
    document.querySelectorAll('.col-chip').forEach(c => c.classList.remove('drag-over'));
    dragSrcKey = null;
};

// --- Admin Sub-Lists ---
function renderAdminLists() {
    const listTabelas = document.getElementById('list_tabelas_preco');
    const listDemandas = document.getElementById('list_tipos_demanda');
    const listStatus = document.getElementById('list_status');

    const renderItem = (item, table) => `
        <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.02); padding: 0.5rem 0.8rem; border-radius: 8px;">
            <span style="font-size: 0.8rem; font-weight: 600;">${item.nome}</span>
            <button onclick="deleteAdminItem('${table}', '${item.id}')" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 0.2rem;"><i data-lucide="trash-2" style="width: 14px;"></i></button>
        </div>
    `;

    if (listTabelas) listTabelas.innerHTML = config.tabelas.map(i => renderItem(i, 'com_tabelas_preco')).join('');
    if (listDemandas) listDemandas.innerHTML = config.demandas.map(i => renderItem(i, 'com_tipos_demanda')).join('');
    if (listStatus) listStatus.innerHTML = config.status.map(i => renderItem(i, 'com_status')).join('');

    if (window.lucide) lucide.createIcons();
}

window.openAdminModal = (table) => {
    if (typeof canDo === 'function' && !canDo('comercial_cadastros', 'add')) {
        alert("Você não tem permissão para esta ação.");
        return;
    }
    document.getElementById('adminTable').value = `com_${table}`;
    document.getElementById('adminValue').value = '';
    document.getElementById('adminModalTitle').innerText = `Cadastrar em ${table.replace('_', ' ').toUpperCase()}`;
    document.getElementById('adminModal').classList.add('active');
};

window.closeAdminModal = () => {
    document.getElementById('adminModal').classList.remove('active');
};

async function handleSaveAdmin(e) {
    e.preventDefault();
    const table = document.getElementById('adminTable').value;
    const nome = document.getElementById('adminValue').value;

    try {
        const { error } = await supabaseClient.from(table).insert([{ nome }]);
        if (error) throw error;
        await loadConfig();
        closeAdminModal();
    } catch (err) {
        alert("Erro ao salvar: " + err.message);
    }
}

async function deleteAdminItem(table, id) {
    if (typeof canDo === 'function' && !canDo('comercial_cadastros', 'delete')) {
        alert("Você não tem permissão para esta ação.");
        return;
    }
    if (!confirm("Excluir este item? Isso pode afetar contratos existentes.")) return;
    try {
        const { error } = await supabaseClient.from(table).delete().eq('id', id);
        if (error) throw error;
        await loadConfig();
    } catch (err) {
        alert("Erro ao excluir: " + (err.code === '23503' ? 'Este item está sendo usado em um contrato e não pode ser excluído.' : err.message));
    }
}

// ===== EXPORTAÇÃO =====

// Colunas visíveis na ordem atual, sem "acoes"
function getExportColumns() {
    return colConfig.order.filter(k => colConfig.visible[k] !== false && k !== 'acoes');
}

// Valor texto por campo para exportação
function getCellValue(c, key) {
    const today = new Date(); today.setHours(0,0,0,0);
    const isVencido = c.data_vencimento && new Date(c.data_vencimento + 'T00:00:00') < today;
    const map = {
        cliente:     c.cliente_nome || '',
        cnpj:        c.cliente_cnpj_cpf || '',
        descricao:   c.descricao_contrato || '',
        versao:      c.versao_contrato || '',
        referencia:  c.referencia || '',
        vigencia:    c.vigencia || '',
        demanda:     c.demanda?.nome || '',
        tabela:      c.tabela?.nome || '',
        assinatura:  c.data_assinatura ? new Date(c.data_assinatura + 'T12:00:00').toLocaleDateString('pt-BR') : '',
        prazo:       c.prazo_meses ? `${c.prazo_meses} meses` : '',
        vencimento:  c.data_vencimento ? new Date(c.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR') : '',
        status:      isVencido ? 'VENCIDO' : (c.status?.nome || ''),
        email:       c.cliente_email || '',
        telefone:    c.cliente_telefone || '',
        responsavel: c.nome_responsavel || '',
        contato:     c.contato_responsavel || '',
        observacao:  c.observacao || '',
    };
    return map[key] ?? '';
}

// Dados filtrados/ordenados exatamente como na tela
function getVisibleData() {
    const today = new Date(); today.setHours(0,0,0,0);
    const in30Days = new Date(today); in30Days.setDate(today.getDate() + 30);
    const searchTerm = document.getElementById('contratoSearch').value.toLowerCase();
    const filterStatus  = document.getElementById('filterStatus').value;
    const filterDemanda = document.getElementById('filterDemanda').value;

    let filtered = contratos.filter(c => {
        const matchesSearch =
            (c.cliente_nome || '').toLowerCase().includes(searchTerm) ||
            (c.cliente_cnpj_cpf || '').toLowerCase().includes(searchTerm) ||
            (c.descricao_contrato || '').toLowerCase().includes(searchTerm);
        const matchesStatus  = !filterStatus  || c.status_id === filterStatus;
        const matchesDemanda = !filterDemanda || c.tipo_demanda_id === filterDemanda;
        return matchesSearch && matchesStatus && matchesDemanda;
    });

    filtered.sort((a, b) => {
        let valA, valB;
        if (currentSort.key === 'cliente') {
            valA = (a.cliente_nome || '').toLowerCase();
            valB = (b.cliente_nome || '').toLowerCase();
        } else {
            valA = a[currentSort.key] || '';
            valB = b[currentSort.key] || '';
        }
        if (valA < valB) return currentSort.dir === 'asc' ? -1 : 1;
        if (valA > valB) return currentSort.dir === 'asc' ? 1 : -1;
        return 0;
    });

    return filtered;
}

// --- EXCEL ---
window.exportExcel = () => {
    const keys    = getExportColumns();
    const headers = keys.map(k => COL_DEFS.find(d => d.key === k)?.label || k);
    const data    = getVisibleData();
    const rows    = data.map(c => keys.map(k => getCellValue(c, k)));

    const wsData = [headers, ...rows];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Largura automática
    ws['!cols'] = headers.map((h, i) => ({
        wch: Math.min(Math.max(h.length, ...rows.map(r => String(r[i] || '').length)) + 4, 50)
    }));

    XLSX.utils.book_append_sheet(wb, ws, 'Contratos');
    const d = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
    XLSX.writeFile(wb, `FrotaLink_Contratos_${d}.xlsx`);
};

// --- PDF ---
window.exportPdf = () => {
    const { jsPDF } = window.jspdf;
    const keys    = getExportColumns();
    const headers = keys.map(k => COL_DEFS.find(d => d.key === k)?.label || k);
    const data    = getVisibleData();
    const rows    = data.map(c => keys.map(k => getCellValue(c, k)));

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pw  = doc.internal.pageSize.width;

    // Cabeçalho
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pw, 24, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('FrotaLink — Relatório de Contratos', 14, 10);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    const dateLabel = new Date().toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' });
    doc.text(`Gerado em ${dateLabel}  •  ${data.length} registro(s)`, 14, 18);

    doc.autoTable({
        head: [headers],
        body: rows,
        startY: 28,
        styles: {
            font: 'helvetica',
            fontSize: 7.5,
            cellPadding: { top: 3, right: 4, bottom: 3, left: 4 },
            textColor: [30, 41, 59],
            lineColor: [226, 232, 240],
            lineWidth: 0.15,
            overflow: 'linebreak',
        },
        headStyles: {
            fillColor: [99, 102, 241],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 8,
            halign: 'left',
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        bodyStyles:         { fillColor: [255, 255, 255] },
        didParseCell: (hook) => {
            if (hook.section !== 'body') return;
            const key = keys[hook.column.index];
            const val = String(hook.cell.raw || '');
            if (key === 'status') {
                if (val === 'VENCIDO') {
                    hook.cell.styles.textColor = [239, 68, 68];
                    hook.cell.styles.fontStyle = 'bold';
                } else if (val === 'ATIVO') {
                    hook.cell.styles.textColor = [16, 185, 129];
                    hook.cell.styles.fontStyle = 'bold';
                }
            }
            if (key === 'vencimento') {
                const rec = data[hook.row.index];
                if (rec?.data_vencimento) {
                    const dv = new Date(rec.data_vencimento + 'T00:00:00');
                    const now = new Date(); now.setHours(0,0,0,0);
                    if (dv < now) hook.cell.styles.textColor = [239, 68, 68];
                }
            }
        },
        margin: { top: 28, left: 14, right: 14 },
    });

    // Rodapé paginação
    const total = doc.internal.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184);
        doc.text(`Página ${i} de ${total}`, pw - 14, doc.internal.pageSize.height - 6, { align: 'right' });
    }

    const d = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
    doc.save(`FrotaLink_Contratos_${d}.pdf`);
};




