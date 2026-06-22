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
let propostaAtual = null;

// --- Helpers ---
function dataAtualISO() {
    return new Date().toISOString().split('T')[0];
}

function highlightElement(el) {
    if (!el) return;
    el.style.borderColor = '#ef4444';
    el.style.boxShadow = '0 0 0 2px rgba(239, 68, 68, 0.2)';
    const resetFn = () => {
        el.style.borderColor = '';
        el.style.boxShadow = '';
        el.removeEventListener('input', resetFn);
    };
    el.addEventListener('input', resetFn);
}

function formatarDataExtenso(dateStr) {
    if (!dateStr) return '';
    try {
        const parts = dateStr.split('-');
        if (parts.length !== 3) return dateStr;
        const year = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1;
        const day = parseInt(parts[2]);
        const meses = [
            'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
            'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
        ];
        return `${day} de ${meses[month]} de ${year}`;
    } catch (e) {
        return dateStr;
    }
}

function fmtMoeda(val) {
    if (val === undefined || val === null || isNaN(val)) return 'R$ 0,00';
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDataBR(dateStr) {
    if (!dateStr) return '';
    try {
        const parts = dateStr.split('-');
        if (parts.length !== 3) return dateStr;
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    } catch (e) {
        return dateStr;
    }
}

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
            closeHistoricoModal();
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
            acoes:       `<td style="text-align:right;"><div style="display:flex;gap:8px;justify-content:flex-end;"><button class="action-btn-mini" onclick="openHistoricoModal('${c.id}')" title="Histórico"><i data-lucide="history"></i></button><button class="action-btn-mini" onclick="openContratoModal('${c.id}')" title="Editar"><i data-lucide="edit-2"></i></button><button class="action-btn-mini" onclick="deleteContrato('${c.id}')" style="color:#ef4444;" title="Excluir"><i data-lucide="trash-2"></i></button></div></td>`
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

    // Título dinâmico
    document.getElementById('modalTitle').innerText = id ? 'Proposta / Contrato' : 'Nova Proposta';

    // Reset estado da proposta
    propostaAtual = { contratoId: id, propostaId: id, step: 0, itens: [], historico: [] };

    // Preenche campos de contrato existente
    if (id) {
        const c = contratos.find(x => x.id === id);
        if (c) {
            document.getElementById('cliente_nome').value          = c.cliente_nome || '';
            document.getElementById('cliente_cnpj_cpf').value      = maskCnpjCpf(c.cliente_cnpj_cpf || '');
            document.getElementById('cliente_email').value         = c.cliente_email || '';
            document.getElementById('cliente_telefone').value      = maskTelefone(c.cliente_telefone || '');
            document.getElementById('vigencia').value              = c.vigencia || '';
            document.getElementById('descricao_contrato').value    = c.descricao_contrato || '';
            document.getElementById('versao_contrato').value       = c.versao_contrato || '';
            document.getElementById('referencia').value            = c.referencia || '';
            document.getElementById('data_assinatura').value       = c.data_assinatura || '';
            document.getElementById('prazo_meses').value           = c.prazo_meses || '';
            document.getElementById('data_vencimento').value       = c.data_vencimento || '';
            document.getElementById('tipo_demanda_id').value       = c.tipo_demanda_id || '';
            document.getElementById('tabela_preco_id').value       = c.tabela_preco_id || '';
            document.getElementById('status_id').value             = c.status_id || '';
            document.getElementById('nome_responsavel').value      = c.nome_responsavel || '';
            document.getElementById('contato_responsavel').value   = maskTelefone(c.contato_responsavel || '');
            document.getElementById('observacao').value            = c.observacao || '';

            // Campos de proposta
            document.getElementById('objeto_proposta').value       = c.objeto_proposta      || '';
            document.getElementById('endereco_proposta').value     = c.endereco_proposta    || '';
            document.getElementById('cep_proposta').value          = c.cep_proposta         || '';
            document.getElementById('contato_proposta').value      = c.contato_proposta     || c.nome_responsavel || '';
            document.getElementById('assinatura_proposta').value   = c.assinatura_proposta  || 'New Cargo Transporte e Logística Ltda';
            document.getElementById('prop_data_proposta').value    = c.data_proposta        || dataAtualISO();
            document.getElementById('prop_validade_dias').value    = c.validade_dias        || 30;
            document.getElementById('prop_data_validade').value    = c.data_validade        || '';
            document.getElementById('prop_periodo_medicao').value  = c.periodo_medicao      || '';
            document.getElementById('prop_forma_pagamento').value  = c.forma_pagamento      || '';
            document.getElementById('prop_observacoes').value      = c.observacoes_proposta
                || 'Permanecemos à disposição para quaisquer esclarecimentos que se façam necessários.';

            propostaAtual.step = c.proposta_step ?? 0;

            // Carrega itens e histórico do Supabase
            const modal = document.getElementById('contratoModal');
            modal.classList.add('active');
            const painel = document.querySelector('#contratoModal form');
            painel.style.opacity = '0.4';
            painel.style.pointerEvents = 'none';

            try {
                await Promise.all([
                    loadItensProposta(id),
                    loadHistoricoProposta(id)
                ]);
            } catch (err) {
                console.warn('Erro ao carregar dados da proposta:', err.message);
                propostaAtual.itens = [{ id: null, descricao: '', unidade: '', quantidade: 0, preco_unit: 0 }];
            } finally {
                painel.style.opacity = '1';
                painel.style.pointerEvents = '';
            }
        }
    } else {
        // Nova proposta — inicializar campos
        document.getElementById('prop_data_proposta').value  = dataAtualISO();
        document.getElementById('prop_validade_dias').value  = 30;
        document.getElementById('assinatura_proposta').value = 'New Cargo Transporte e Logística Ltda';
        document.getElementById('prop_observacoes').value    = 'Permanecemos à disposição para quaisquer esclarecimentos que se façam necessários.';
        propostaAtual.itens = [{ id: null, descricao: '', unidade: '', quantidade: 0, preco_unit: 0 }];
    }

    calcularValidadeProposta();
    renderItensProposta();
    updateTimelineUI(propostaAtual.step);
    renderHistoricoProposta();

    document.getElementById('contratoModal').classList.add('active');
    if (window.lucide) lucide.createIcons();
};

window.closeContratoModal = () => {
    document.getElementById('contratoModal').classList.remove('active');
};

async function handleSaveContrato(e) {
    e.preventDefault();
    const btn = document.getElementById('btnSaveContrato');
    btn.disabled = true;
    const origText = btn.innerHTML;
    btn.innerHTML = 'SALVANDO...';

    const payload = {
        // Campos do contrato existentes
        cliente_nome:         document.getElementById('cliente_nome').value,
        cliente_cnpj_cpf:     document.getElementById('cliente_cnpj_cpf').value,
        cliente_email:        document.getElementById('cliente_email').value,
        cliente_telefone:     document.getElementById('cliente_telefone').value,
        vigencia:             document.getElementById('vigencia').value,
        descricao_contrato:   document.getElementById('descricao_contrato').value,
        versao_contrato:      document.getElementById('versao_contrato').value,
        referencia:           document.getElementById('referencia').value,
        data_assinatura:      document.getElementById('data_assinatura').value || null,
        prazo_meses:          parseInt(document.getElementById('prazo_meses').value) || 0,
        data_vencimento:      document.getElementById('data_vencimento').value || null,
        tipo_demanda_id:      document.getElementById('tipo_demanda_id').value || null,
        tabela_preco_id:      document.getElementById('tabela_preco_id').value || null,
        status_id:            document.getElementById('status_id').value || null,
        nome_responsavel:     document.getElementById('nome_responsavel').value,
        contato_responsavel:  document.getElementById('contato_responsavel').value,
        observacao:           document.getElementById('observacao').value,
        // Campos da proposta
        proposta_step:        propostaAtual.step,
        objeto_proposta:      document.getElementById('objeto_proposta').value,
        endereco_proposta:    document.getElementById('endereco_proposta').value,
        cep_proposta:         document.getElementById('cep_proposta').value,
        contato_proposta:     document.getElementById('contato_proposta').value,
        assinatura_proposta:  document.getElementById('assinatura_proposta').value,
        data_proposta:        document.getElementById('prop_data_proposta').value || null,
        validade_dias:        parseInt(document.getElementById('prop_validade_dias').value) || 30,
        data_validade:        document.getElementById('prop_data_validade').value || null,
        periodo_medicao:      document.getElementById('prop_periodo_medicao').value,
        forma_pagamento:      document.getElementById('prop_forma_pagamento').value,
        observacoes_proposta: document.getElementById('prop_observacoes').value
    };

    // Limpa realces vermelhos anteriores
    document.querySelectorAll('.com-input, .item-input').forEach(el => {
        el.style.borderColor = '';
        el.style.boxShadow = '';
    });

    let hasErrors = false;

    if (!payload.cliente_nome?.trim()) {
        highlightElement(document.getElementById('cliente_nome'));
        hasErrors = true;
    }
    if (!payload.cliente_cnpj_cpf?.trim()) {
        highlightElement(document.getElementById('cliente_cnpj_cpf'));
        hasErrors = true;
    }
    if (!payload.nome_responsavel?.trim()) {
        highlightElement(document.getElementById('nome_responsavel'));
        hasErrors = true;
    }
    if (!payload.objeto_proposta?.trim()) {
        highlightElement(document.getElementById('objeto_proposta'));
        hasErrors = true;
    }
    if (!payload.periodo_medicao?.trim()) {
        highlightElement(document.getElementById('prop_periodo_medicao'));
        hasErrors = true;
    }
    if (!payload.forma_pagamento?.trim()) {
        highlightElement(document.getElementById('prop_forma_pagamento'));
        hasErrors = true;
    }

    // Se a proposta estiver aprovada/contrato (step === 2), os campos do contrato tornam-se obrigatórios
    if (propostaAtual.step === 2) {
        if (!payload.descricao_contrato?.trim()) {
            highlightElement(document.getElementById('descricao_contrato'));
            hasErrors = true;
        }
        if (!payload.versao_contrato?.trim()) {
            highlightElement(document.getElementById('versao_contrato'));
            hasErrors = true;
        }
        if (!payload.referencia?.trim()) {
            highlightElement(document.getElementById('referencia'));
            hasErrors = true;
        }
        if (!payload.vigencia?.trim()) {
            highlightElement(document.getElementById('vigencia'));
            hasErrors = true;
        }
        if (!payload.tipo_demanda_id) {
            highlightElement(document.getElementById('tipo_demanda_id'));
            hasErrors = true;
        }
        if (!payload.data_assinatura) {
            highlightElement(document.getElementById('data_assinatura'));
            hasErrors = true;
        }
        if (!payload.prazo_meses || payload.prazo_meses <= 0) {
            highlightElement(document.getElementById('prazo_meses'));
            hasErrors = true;
        }
        if (!payload.tabela_preco_id) {
            highlightElement(document.getElementById('tabela_preco_id'));
            hasErrors = true;
        }
    }


    if (hasErrors) {
        alert("Preencha todos os campos obrigatórios em destaque vermelho.");
        btn.disabled = false;
        btn.innerHTML = origText;
        return;
    }

    if (!propostaAtual.itens || propostaAtual.itens.length === 0) {
        alert("Adicione pelo menos 1 item na proposta.");
        btn.disabled = false;
        btn.innerHTML = origText;
        return;
    }

    let itemError = false;
    propostaAtual.itens.forEach((it, idx) => {
        const tr = document.querySelector(`#propostaItensBody tr[data-idx="${idx}"]`);
        if (!tr) return;

        const inputs = tr.querySelectorAll('.item-input');
        const descInput  = inputs[0];
        const unInput    = inputs[1];
        const qtdInput   = inputs[2];
        const precoInput = inputs[3];

        if (!it.descricao?.trim()) { highlightElement(descInput); itemError = true; }
        if (!it.unidade?.trim())   { highlightElement(unInput); itemError = true; }
        if ((it.quantidade || 0) <= 0) { highlightElement(qtdInput); itemError = true; }
        if ((it.preco_unit || 0) <= 0) { highlightElement(precoInput); itemError = true; }
    });

    if (itemError) {
        alert("Preencha todos os campos dos itens da proposta com valores válidos destacados em vermelho.");
        btn.disabled = false;
        btn.innerHTML = origText;
        return;
    }

    try {
        let res, savedId;
        if (editId) {
            res = await supabaseClient.from('com_contratos').update(payload).eq('id', editId);
            if (res.error) throw res.error;
            savedId = editId;

            // Histórico de atualização
            await supabaseClient.from('com_proposta_historico').insert([{
                contrato_id: savedId,
                step: propostaAtual.step,
                label: 'Dados da proposta atualizados',
                data: dataAtualISO()
            }]);
        } else {
            // Nova proposta: inicializa com step=0, status_id de proposta aberta e grava histórico inicial
            payload.proposta_step = 0;
            const statusAberta = config.status.find(s =>
                s.nome.toUpperCase().includes('PROPOSTA ABERTA') ||
                s.nome.toUpperCase().includes('ABERTA')
            );
            if (statusAberta) {
                payload.status_id = statusAberta.id;
                const selectStatus = document.getElementById('status_id');
                if (selectStatus) selectStatus.value = statusAberta.id;
            }
            const { data: inserted, error: errIns } = await supabaseClient
                .from('com_contratos').insert([payload]).select().single();
            if (errIns) throw errIns;
            savedId = inserted.id;
            res = { error: null };

            // Histórico inicial
            await supabaseClient.from('com_proposta_historico').insert([{
                contrato_id: savedId,
                step: 0,
                label: 'Proposta Aberta',
                data: dataAtualISO()
            }]);
        }

        if (res.error) throw res.error;

        // Salva itens da proposta
        await supabaseClient.from('com_proposta_itens').delete().eq('contrato_id', savedId);
        if (propostaAtual.itens.length > 0) {
            const itensPayload = propostaAtual.itens.map((it, idx) => ({
                contrato_id: savedId,
                ordem:       idx + 1,
                descricao:   it.descricao  || '',
                unidade:     it.unidade    || '',
                quantidade:  it.quantidade || 0,
                preco_unit:  it.preco_unit || 0
            }));
            const { error: errItens } = await supabaseClient.from('com_proposta_itens').insert(itensPayload);
            if (errItens) console.warn('Erro ao salvar itens:', errItens.message);
        }

        propostaAtual.contratoId = savedId;
        propostaAtual.propostaId = savedId;
        editId = savedId;

        await loadContratos();
        closeContratoModal();
    } catch (err) {
        console.error("Erro ao salvar:", err);
        alert("Erro ao salvar: " + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = origText;
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


window.calcularValidadeProposta = () => {
    const dataProposta = document.getElementById('prop_data_proposta').value;
    const dias = parseInt(document.getElementById('prop_validade_dias').value);
    if (dataProposta && !isNaN(dias) && dias > 0) {
        const d = new Date(dataProposta + 'T12:00:00');
        d.setDate(d.getDate() + dias);
        document.getElementById('prop_data_validade').value = d.toISOString().split('T')[0];
    } else {
        document.getElementById('prop_data_validade').value = '';
    }
};

// -------------------------------------------------------------------
// CRUD LOCAL DE ITENS (renderização)
// -------------------------------------------------------------------

window.addItemProposta = () => {
    propostaAtual.itens.push({ id: null, descricao: '', unidade: '', quantidade: 0, preco_unit: 0 });
    renderItensProposta();
    if (window.lucide) lucide.createIcons();
};

window.removeItemProposta = (idx) => {
    if (propostaAtual.itens.length <= 1) {
        alert('A proposta deve ter pelo menos um item.');
        return;
    }
    propostaAtual.itens.splice(idx, 1);
    renderItensProposta();
    if (window.lucide) lucide.createIcons();
};

window.updateItemProposta = (idx, field, value) => {
    if (!propostaAtual.itens[idx]) return;
    propostaAtual.itens[idx][field] = (field === 'quantidade' || field === 'preco_unit')
        ? parseFloat(value) || 0
        : value;

    // Atualiza o total da linha no DOM sem re-renderizar para não perder o foco
    const tr = document.querySelector(`#propostaItensBody tr[data-idx="${idx}"]`);
    if (tr) {
        const item = propostaAtual.itens[idx];
        const rowTotal = (item.quantidade || 0) * (item.preco_unit || 0);
        const totalCell = tr.querySelector('.row-total-val');
        if (totalCell) {
            totalCell.innerText = fmtMoeda(rowTotal);
        }
    }

    calcularTotalProposta();
};

function calcularTotalProposta() {
    const total = propostaAtual.itens.reduce((acc, it) => acc + ((it.quantidade || 0) * (it.preco_unit || 0)), 0);
    const el = document.getElementById('propostaTotal');
    if (el) el.innerText = fmtMoeda(total);
}

function renderItensProposta() {
    const tbody = document.getElementById('propostaItensBody');
    if (!tbody) return;

    tbody.innerHTML = propostaAtual.itens.map((item, idx) => `
        <tr data-idx="${idx}">
            <td style="text-align:center;font-weight:800;color:var(--primary);font-size:0.8rem;">${idx + 1}</td>
            <td><input class="item-input" type="text" placeholder="Descrição do serviço/produto"
                value="${(item.descricao || '').replace(/"/g, '&quot;')}"
                oninput="updateItemProposta(${idx},'descricao',this.value)"></td>
            <td><input class="item-input" type="text" placeholder="KM, Hrs, Un"
                value="${(item.unidade || '').replace(/"/g, '&quot;')}"
                oninput="updateItemProposta(${idx},'unidade',this.value)"></td>
            <td><input class="item-input" type="number" placeholder="0" min="0" style="width: 90px; text-align: right;"
                value="${item.quantidade || ''}"
                oninput="updateItemProposta(${idx},'quantidade',this.value)"></td>
            <td><input class="item-input" type="number" placeholder="0,00" min="0" step="0.01" style="width: 110px; text-align: right;"
                value="${item.preco_unit || ''}"
                oninput="updateItemProposta(${idx},'preco_unit',this.value)"></td>
            <td class="row-total-val" style="font-weight:700;color:#fff;white-space:nowrap;text-align:right;padding-right:0.5rem;">
                ${fmtMoeda((item.quantidade || 0) * (item.preco_unit || 0))}
            </td>
            <td><button class="btn-remove-item" onclick="removeItemProposta(${idx})" title="Remover">
                <i data-lucide="trash-2" style="width:12px;"></i>
            </button></td>
        </tr>
    `).join('');

    calcularTotalProposta();
    if (window.lucide) lucide.createIcons();
}

// Carrega itens do banco → propostaAtual.itens
async function loadItensProposta(contratoId) {
    const { data, error } = await supabaseClient
        .from('com_proposta_itens')
        .select('*')
        .eq('contrato_id', contratoId)
        .order('ordem', { ascending: true });

    if (error) throw error;
    propostaAtual.itens = data && data.length > 0 ? data : [{ id: null, descricao: '', unidade: '', quantidade: 0, preco_unit: 0 }];
}

async function loadHistoricoProposta(contratoId) {
    const { data, error } = await supabaseClient
        .from('com_proposta_historico')
        .select('*')
        .eq('contrato_id', contratoId)
        .order('created_at', { ascending: false });

    if (error) throw error;
    propostaAtual.historico = data || [];
}

// -------------------------------------------------------------------
// LINHA DO TEMPO
// -------------------------------------------------------------------

function updateTimelineUI(step) {
    const badgeLabels   = ['PROPOSTA ABERTA', 'EM ANÁLISE', 'APROVADA'];
    const badgeClasses  = ['badge-aberta', 'badge-analise', 'badge-aprovada'];
    const avancarTextos = ['Enviar para Análise', 'Aprovar Proposta', '✓ Aprovada'];

    const badge = document.getElementById('propostaStatusBadge');
    if (badge) {
        badge.className = `proposta-status-badge ${badgeClasses[step]}`;
        badge.innerText = badgeLabels[step];
    }

    const btnTexto  = document.getElementById('btnAvancarTexto');
    const btnAvancar = document.getElementById('btnAvancarProposta');
    const btnGerar   = document.getElementById('btnGerarDocumentoProposta');

    if (btnTexto)  btnTexto.innerText = avancarTextos[step];

    if (btnAvancar) {
        if (!propostaAtual.propostaId) {
            btnAvancar.disabled      = true;
            btnAvancar.style.opacity = '0.5';
            btnAvancar.style.cursor  = 'default';
            btnAvancar.title         = 'Salve a proposta primeiro';
        } else {
            btnAvancar.disabled      = step >= 2;
            btnAvancar.style.opacity = step >= 2 ? '0.5' : '1';
            btnAvancar.style.cursor  = step >= 2 ? 'default' : 'pointer';
            btnAvancar.title         = '';
        }
    }

    if (btnGerar) {
        if (!propostaAtual.propostaId) {
            btnGerar.disabled      = true;
            btnGerar.style.opacity = '0.5';
            btnGerar.style.cursor  = 'default';
            btnGerar.title         = 'Salve a proposta primeiro';
        } else {
            btnGerar.disabled      = false;
            btnGerar.style.opacity = '1';
            btnGerar.style.cursor  = 'pointer';
            btnGerar.title         = '';
        }
    }

    for (let i = 0; i <= 2; i++) {
        const el = document.getElementById(`tlStep${i}`);
        if (!el) continue;
        el.classList.remove('active', 'done');
        if (i < step)       el.classList.add('done');
        else if (i === step) el.classList.add('active');
    }

    for (let i = 0; i <= 1; i++) {
        const conn = document.getElementById(`tlConn${i}`);
        if (conn) conn.classList.toggle('done', i < step);
    }

    // Preenche datas nas etapas a partir do histórico
    propostaAtual.historico.forEach(h => {
        const el = document.getElementById(`tlDate${h.step}`);
        if (el) el.innerText = fmtDataBR(h.data);
    });

    const manualContainer = document.getElementById('propostaManualHistoricoContainer');
    const manualFallback = document.getElementById('propostaManualHistoricoFallback');
    if (manualContainer && manualFallback) {
        if (propostaAtual.contratoId || editId) {
            manualContainer.style.display = 'flex';
            manualFallback.style.display = 'none';
        } else {
            manualContainer.style.display = 'none';
            manualFallback.style.display = 'block';
        }
    }

    const secaoContrato = document.getElementById('secaoDadosContrato');
    if (secaoContrato) {
        secaoContrato.style.display = (step === 2) ? '' : 'none';
    }

    if (window.lucide) lucide.createIcons();
}

function renderHistoricoProposta() {
    const container = document.getElementById('propostaHistoricoList');
    if (!container) return;

    if (propostaAtual.historico.length === 0) {
        container.innerHTML = `<div style="font-size:0.68rem;color:var(--text-muted);font-style:italic;">Nenhum registro ainda.</div>`;
        return;
    }

    container.innerHTML = propostaAtual.historico.map(h => `
        <div class="history-entry">
            <div class="history-dot"></div>
            <div class="history-text"><strong>${h.label}</strong><br>${fmtDataBR(h.data)}</div>
        </div>
    `).join('');
}

window.adicionarHistoricoManual = async () => {
    const txtEl = document.getElementById('manual_historico_texto');
    if (!txtEl) return;
    const txt = txtEl.value.trim();
    if (!txt) {
        alert('Digite uma observação para registrar no histórico.');
        return;
    }
    const contratoId = propostaAtual.contratoId || editId;
    if (!contratoId) {
        alert('Salve a proposta antes de adicionar observações manuais.');
        return;
    }

    try {
        const { data: inserted, error } = await supabaseClient
            .from('com_proposta_historico')
            .insert([{
                contrato_id: contratoId,
                step: propostaAtual.step,
                label: txt,
                data: dataAtualISO()
            }])
            .select()
            .single();

        if (error) throw error;

        propostaAtual.historico.unshift(inserted);
        txtEl.value = '';
        renderHistoricoProposta();
    } catch (err) {
        console.error('Erro ao adicionar histórico manual:', err);
        alert('Erro ao registrar no histórico: ' + err.message);
    }
};

// -------------------------------------------------------------------
// SALVAR PROPOSTA (Supabase) — "Salvar Rascunho"
// -------------------------------------------------------------------

window.salvarPropostaLocal = async (silencioso = false) => {
    if (!propostaAtual.propostaId) return;

    const btn = silencioso ? null : document.getElementById('btnSalvarProposta');
    if (btn) {
        btn.disabled = true;
        const orig = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="loader" style="width:14px;"></i> Salvando...';
        if (window.lucide) lucide.createIcons();

        try {
            await _persistirProposta();
            btn.innerHTML = '<i data-lucide="check" style="width:14px;"></i> Salvo!';
            btn.style.color = '#10b981';
            if (window.lucide) lucide.createIcons();
            setTimeout(() => {
                btn.innerHTML = orig;
                btn.style.color = '';
                btn.disabled = false;
                if (window.lucide) lucide.createIcons();
            }, 1800);
        } catch (err) {
            alert('Erro ao salvar: ' + err.message);
            btn.innerHTML = orig;
            btn.disabled = false;
        }
    } else {
        // Silencioso (chamado internamente ao avançar etapa)
        await _persistirProposta();
    }
};

// Persiste proposta + itens no Supabase
async function _persistirProposta() {
    const contratoId = propostaAtual.contratoId;
    if (!contratoId) return;

    // Atualiza campos de proposta diretamente em com_contratos
    const payload = {
        proposta_step:        propostaAtual.step,
        objeto_proposta:      document.getElementById('objeto_proposta')?.value      || '',
        endereco_proposta:    document.getElementById('endereco_proposta')?.value    || '',
        cep_proposta:         document.getElementById('cep_proposta')?.value         || '',
        contato_proposta:     document.getElementById('contato_proposta')?.value     || '',
        assinatura_proposta:  document.getElementById('assinatura_proposta')?.value  || '',
        data_proposta:        document.getElementById('prop_data_proposta')?.value   || null,
        validade_dias:        parseInt(document.getElementById('prop_validade_dias')?.value) || 30,
        data_validade:        document.getElementById('prop_data_validade')?.value   || null,
        periodo_medicao:      document.getElementById('prop_periodo_medicao')?.value || '',
        forma_pagamento:      document.getElementById('prop_forma_pagamento')?.value || '',
        observacoes_proposta: document.getElementById('prop_observacoes')?.value     || ''
    };

    const { error: errUpdate } = await supabaseClient
        .from('com_contratos')
        .update(payload)
        .eq('id', contratoId);

    if (errUpdate) throw errUpdate;

    // Deleta itens antigos e re-insere
    await supabaseClient.from('com_proposta_itens').delete().eq('contrato_id', contratoId);

    if (propostaAtual.itens.length > 0) {
        const itensPayload = propostaAtual.itens.map((it, idx) => ({
            contrato_id: contratoId,
            ordem:       idx + 1,
            descricao:   it.descricao  || '',
            unidade:     it.unidade    || '',
            quantidade:  it.quantidade || 0,
            preco_unit:  it.preco_unit || 0
        }));

        const { error: errItens } = await supabaseClient
            .from('com_proposta_itens')
            .insert(itensPayload);

        if (errItens) throw errItens;
    }
}

window.avancarEtapaProposta = async () => {
    if (propostaAtual.step >= 2 || !propostaAtual.propostaId) return;

    const labels   = ['Proposta Aberta', 'Em Análise', 'Aprovada / Contrato'];
    const novoStep = propostaAtual.step + 1;

    const btnAvancar = document.getElementById('btnAvancarProposta');
    if (btnAvancar) { btnAvancar.disabled = true; btnAvancar.style.opacity = '0.5'; }

    try {
        // Salva dados atuais primeiro
        propostaAtual.step = novoStep;
        await _persistirProposta();

        // Registra no histórico
        const { data: novoHist, error: errHist } = await supabaseClient
            .from('com_proposta_historico')
            .insert([{
                contrato_id: propostaAtual.contratoId,
                step:        novoStep,
                label:       labels[novoStep],
                data:        dataAtualISO()
            }])
            .select()
            .single();

        if (errHist) throw errHist;
        propostaAtual.historico.unshift(novoHist);

        // Atualiza status do contrato no Supabase conforme o step avançado
        let statusTarget = null;
        const norm = (str) => (str || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
        if (novoStep === 1) {
            statusTarget = config.status.find(s => norm(s.nome).includes('ANALISE'));
        } else if (novoStep === 2) {
            statusTarget = config.status.find(s => {
                const n = norm(s.nome);
                return n.includes('ATIVO') || n.includes('APROVAD') || n.includes('CONTRATO');
            });
        }

        if (statusTarget) {
            await supabaseClient
                .from('com_contratos')
                .update({ status_id: statusTarget.id })
                .eq('id', propostaAtual.contratoId);

            // Sincroniza o select de status no DOM para que o "SALVAR" subsequente não o reverta
            const selectStatus = document.getElementById('status_id');
            if (selectStatus) {
                selectStatus.value = statusTarget.id;
            }

            await loadContratos();
        }

        updateTimelineUI(propostaAtual.step);
        renderHistoricoProposta();
        if (window.lucide) lucide.createIcons();

    } catch (err) {
        console.error('Erro ao avançar etapa:', err);
        alert('Erro ao avançar etapa: ' + err.message);
        propostaAtual.step = novoStep - 1; // rollback local
    } finally {
        updateTimelineUI(propostaAtual.step);
    }
};

// -------------------------------------------------------------------
// GERAR DOCUMENTO DA PROPOSTA
// -------------------------------------------------------------------

window.gerarDocumentoProposta = () => {
    const clienteNome    = document.getElementById('cliente_nome')?.value         || '';
    const clienteCnpj    = document.getElementById('cliente_cnpj_cpf')?.value     || '';
    const endereco       = document.getElementById('endereco_proposta')?.value    || '';
    const cep            = document.getElementById('cep_proposta')?.value         || '';
    const contatoNome    = document.getElementById('contato_proposta')?.value     || '';
    const objeto         = document.getElementById('objeto_proposta')?.value      || '';
    const dataProposta   = document.getElementById('prop_data_proposta')?.value   || dataAtualISO();
    const validadeDias   = document.getElementById('prop_validade_dias')?.value   || 30;
    const dataValidade   = document.getElementById('prop_data_validade')?.value   || '';
    const periodoMedicao = document.getElementById('prop_periodo_medicao')?.value || '';
    const formaPagamento = document.getElementById('prop_forma_pagamento')?.value || '';
    const observacoes    = document.getElementById('prop_observacoes')?.value     || '';
    const assinatura     = document.getElementById('prop_assinatura')?.value      || '';

    const totalGlobal = propostaAtual.itens.reduce(
        (a, it) => a + ((it.quantidade || 0) * (it.preco_unit || 0)), 0
    );

    const itensRows = propostaAtual.itens.map((it, idx) => {
        const total = (it.quantidade || 0) * (it.preco_unit || 0);
        return `<tr>
            <td style="text-align:center;">${idx + 1}</td>
            <td>${it.descricao || '-'}</td>
            <td style="text-align:center;">${it.unidade || '-'}</td>
            <td style="text-align:center;">${(it.quantidade || 0).toLocaleString('pt-BR')}</td>
            <td>
                <div style="display:flex; justify-content:space-between; width:100%; font-family:monospace; font-size:10pt;">
                    <span>R$</span>
                    <span>${(it.preco_unit || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
            </td>
            <td>
                <div style="display:flex; justify-content:space-between; width:100%; font-family:monospace; font-size:10pt;">
                    <span>R$</span>
                    <span>${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
            </td>
        </tr>`;
    }).join('');

    const bullets = [];
    if (periodoMedicao) bullets.push(`Período de medição: ${periodoMedicao};`);
    if (formaPagamento) bullets.push(`Condição de pagamento: ${formaPagamento}.`);
    const bulletsHtml = bullets.length > 0
        ? `<ul>${bullets.map(b => `<li>${b}</li>`).join('')}</ul>` : '';

    // Localidade + data por extenso
    let localidadeData = formatarDataExtenso(dataProposta);
    if (endereco && endereco.includes(',')) {
        const partes = endereco.split(',');
        localidadeData = `${partes[partes.length - 1].trim()}, ${localidadeData}`;
    } else {
        localidadeData = `Resende/RJ, ${localidadeData}`;
    }

    const addressLines = [
        clienteNome ? `<p><strong>${clienteNome}</strong></p>` : '',
        endereco    ? `<p>${endereco}</p>` : '',
        cep         ? `<p>CEP: ${cep}</p>` : ''
    ].filter(Boolean).join('');

    const saudacao   = contatoNome ? `Prezado ${contatoNome},` : 'Prezado(a) Senhor(a),';
    const fixedIntro = 'A New Cargo Transporte e Logística Ltda. tem o prazer de apresentar a presente proposta comercial para a prestação de serviços de transporte executivo, conforme as condições e especificações descritas no Termo de Referência.';
    const objetoTexto = objeto ? `<p class="doc-intro" style="margin-top: 10px;"><strong>Objetivo / Escopo:</strong> ${objeto}</p>` : '';
    const validadeTexto = dataValidade
        ? `${validadeDias} dias`
        : `${validadeDias} dias`;

    const html = `
        <div class="doc-header-top">
            <div class="doc-logo-area">
                <div class="doc-logo-text" style="font-size:24pt; font-weight:bold; color:#107c41; font-style:italic; font-family: 'Times New Roman', Times, serif;">New Cargo</div>
                <div class="doc-logo-sub" style="font-size:9pt; color:#666; font-style:italic; font-family: Arial, sans-serif;">Transporte &amp; Logística</div>
            </div>
        </div>

        <div class="doc-title-block">
            <h2>Proposta de Prestação de Serviços</h2>
            <h3>Transporte Executivo de Passageiros</h3>
        </div>

        <div class="doc-destinatario">
            <p><strong>${localidadeData}</strong></p>
            ${addressLines}
        </div>

        <p class="doc-greeting">${saudacao}</p>
        <p class="doc-intro">${fixedIntro}</p>
        ${objetoTexto}

        <table class="doc-itens-table">
            <thead>
                <tr>
                    <th style="width:50px; text-align:center;">ITEM</th>
                    <th>DESCRIÇÃO DO OBJETO</th>
                    <th style="width:90px; text-align:center;">UNIDADE</th>
                    <th style="width:100px; text-align:center;">QUANTIDADE</th>
                    <th style="width:130px; text-align:center;">PREÇO<br>UNITÁRIO (R$)</th>
                    <th style="width:130px; text-align:center;">TOTAL (R$)</th>
                </tr>
            </thead>
            <tbody>${itensRows}</tbody>
            <tfoot>
                <tr>
                    <td colspan="4" style="text-align:right; font-weight:bold; font-size:10.5pt; text-transform:uppercase; border-right:none !important;">GLOBAL</td>
                    <td colspan="2" style="font-weight:bold; font-size:10.5pt; border-left:none !important;">
                        <div style="display:flex; justify-content:space-between; width:100%; font-family:monospace;">
                            <span>R$</span>
                            <span>${totalGlobal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                    </td>
                </tr>
            </tfoot>
        </table>

        <div class="doc-validade">
            <strong>Validade da proposta: ${validadeTexto}</strong>
        </div>

        ${bullets.length > 0 ? `<div class="doc-pagamento"><strong>Condições de pagamento:</strong>${bulletsHtml}</div>` : ''}
        ${observacoes ? `<p class="doc-closing" style="text-align:justify;">${observacoes}</p>` : ''}

        <p class="doc-closing" style="margin-top:35px;">Atenciosamente,</p>
        <p class="doc-closing" style="font-weight:bold; margin-top:5px;">${assinatura}</p>

        <div class="doc-footer-bar">
            Rua São Domingos da Calçada, 157, Paraíso, Resende/RJ, 27535-020 | (24) 3381-8000 | @veritas.locacao | CNPJ: 19.737.004/0004-85
        </div>
        <div class="doc-page-num">Página 01 de 01</div>
    `;

    document.getElementById('docPropostaPaper').innerHTML = html;
    document.getElementById('documentoPropostaOverlay').classList.add('active');
    if (window.lucide) lucide.createIcons();
};

window.fecharDocumentoProposta = () => {
    document.getElementById('documentoPropostaOverlay').classList.remove('active');
};

window.imprimirProposta = () => {
    const overlay = document.getElementById('documentoPropostaOverlay');
    const toolbar = overlay.querySelector('.doc-toolbar');
    toolbar.style.display = 'none';
    window.print();
    setTimeout(() => { toolbar.style.display = ''; }, 500);
};

window.openHistoricoModal = async (id) => {
    const c = contratos.find(x => x.id === id);
    if (!c) return;

    document.getElementById('historicoModalSubtitle').innerText = `${c.cliente_nome || 'Contrato'} — ${c.descricao_contrato || 'Sem descrição'}`;
    const listEl = document.getElementById('historicoModalList');
    listEl.innerHTML = `<div style="font-size:0.8rem;color:var(--text-muted);font-style:italic;text-align:center;padding:1.5rem 0;">Carregando histórico...</div>`;
    
    document.getElementById('historicoModal').classList.add('active');

    try {
        const { data, error } = await supabaseClient
            .from('com_proposta_historico')
            .select('*')
            .eq('contrato_id', id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!data || data.length === 0) {
            listEl.innerHTML = `<div style="font-size:0.8rem;color:var(--text-muted);font-style:italic;text-align:center;padding:1.5rem 0;">Nenhum registro encontrado no histórico.</div>`;
            return;
        }

        listEl.innerHTML = data.map(h => `
            <div style="display:flex; gap:0.8rem; align-items:flex-start; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); padding:1rem; border-radius:12px;">
                <div style="width:8px; height:8px; border-radius:50%; background:var(--primary); flex-shrink:0; margin-top:5px;"></div>
                <div style="flex:1;">
                    <div style="font-size:0.8rem; font-weight:800; color:#fff; line-height:1.4;">${h.label}</div>
                    <div style="font-size:0.68rem; color:var(--text-muted); margin-top:0.4rem; font-weight:600;">${fmtDataBR(h.data)}</div>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error('Erro ao carregar histórico:', err);
        listEl.innerHTML = `<div style="font-size:0.8rem;color:#ef4444;text-align:center;padding:1.5rem 0;">Erro ao carregar: ${err.message}</div>`;
    }

    if (window.lucide) lucide.createIcons();
};

window.closeHistoricoModal = () => {
    document.getElementById('historicoModal').classList.remove('active');
};

