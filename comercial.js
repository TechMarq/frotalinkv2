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
let prestadores = [];
let config = {
    status: [],
    demandas: [],
    tabelas: [],
    tipos_veiculo: []
};
let currentTab = 'dashboard';
let currentSort = { key: 'cliente', dir: 'asc' };
let editId = null;
let propostaAtual = null;
let propostaOriginal = null;
let empresaLogoUrl = null;
let empresaPdfBgUrl = null;

// --- Helpers ---
function getCurrentUserDisplayName() {
    if (window.currentUserAccess && window.currentUserAccess.nome_completo) {
        return window.currentUserAccess.nome_completo;
    }
    if (window.currentUser && window.currentUser.user_metadata && window.currentUser.user_metadata.nome_completo) {
        return window.currentUser.user_metadata.nome_completo;
    }
    const cachedName = localStorage.getItem('user_name');
    if (cachedName) return cachedName;

    if (window.currentUser && window.currentUser.email) {
        return window.currentUser.email;
    }
    if (window.currentUserAccess && window.currentUserAccess.email) {
        return window.currentUserAccess.email;
    }
    const cachedEmail = localStorage.getItem('user_email');
    if (cachedEmail) return cachedEmail;

    return 'Sistema';
}

function dataAtualISO() {
    return new Date().toISOString().split('T')[0];
}

function clearHighlights(scope = document) {
    scope.querySelectorAll('.field-error').forEach(el => {
        el.classList.remove('field-error');
        el.style.borderColor = '';
        el.style.boxShadow = '';
    });
}

function highlightElement(el) {
    if (!el) return;
    el.classList.add('field-error');
    const resetFn = () => {
        el.classList.remove('field-error');
        el.style.borderColor = '';
        el.style.boxShadow = '';
        el.removeEventListener('input', resetFn);
        el.removeEventListener('change', resetFn);
    };
    el.addEventListener('input', resetFn);
    el.addEventListener('change', resetFn);
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
    await loadPrestadores();
    
    // Carrega dados de identidade visual da empresa em segundo plano
    obterLogoEmpresa().then(dados => {
        if (dados) {
            empresaLogoUrl = dados.logo_url;
            empresaPdfBgUrl = dados.pdf_bg_url;
        }
    });

    setupEventListeners();
    updateDashboard();
    
    if (window.lucide) lucide.createIcons();
});

async function obterLogoEmpresa() {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return null;
        
        const { data: access } = await supabaseClient
            .from('user_access')
            .select('empresa_id')
            .eq('email', session.user.email)
            .single();
            
        if (!access || !access.empresa_id) return null;
        
        const { data: empresa } = await supabaseClient
            .from('empresas')
            .select('logo_url, pdf_bg_url')
            .eq('id', access.empresa_id)
            .single();
            
        return empresa || null;
    } catch (e) {
        console.warn('Erro ao obter logo da empresa:', e);
        return null;
    }
}

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

function verificarDuplicidadeCnpjCpf() {
    const input = document.getElementById('cliente_cnpj_cpf');
    const feedback = document.getElementById('cnpj_cpf_feedback');
    if (!input || !feedback) return;

    const val = input.value;
    const cleanedInput = val.replace(/\D/g, '');
    
    if (cleanedInput.length < 11) {
        feedback.style.display = 'none';
        input.style.borderColor = '';
        input.style.boxShadow = '';
        return;
    }

    const duplicate = contratos.find(c => {
        if (editId && c.id === editId) return false;
        const cleanedDb = (c.cliente_cnpj_cpf || '').replace(/\D/g, '');
        return cleanedDb === cleanedInput;
    });

    if (duplicate) {
        input.style.borderColor = '#ef4444';
        input.style.boxShadow = '0 0 0 2px rgba(239, 68, 68, 0.2)';
        feedback.style.color = '#f87171';
        feedback.innerHTML = `⚠️ CNPJ/CPF já cadastrado no cliente: <strong>${duplicate.cliente_nome}</strong>`;
        feedback.style.display = 'block';
    } else {
        input.style.borderColor = '';
        input.style.boxShadow = '';
        feedback.style.display = 'none';
    }
}

function setupEventListeners() {
    // Contract Form
    document.getElementById('contratoForm').addEventListener('submit', handleSaveContrato);
    document.getElementById('contratoForm').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.ctrlKey && e.target.tagName !== 'TEXTAREA') {
            e.preventDefault();
        }
    });
    
    // Search
    document.getElementById('contratoSearch').addEventListener('input', () => {
        renderContratos();
    });
    
    const pSearch = document.getElementById('prestadorSearch');
    if (pSearch) {
        pSearch.addEventListener('input', () => {
            renderPrestadores();
        });
    }

    // Admin Form
    document.getElementById('adminForm').addEventListener('submit', handleSaveAdmin);

    // Máscaras
    applyMask(document.getElementById('cliente_cnpj_cpf'), maskCnpjCpf);
    applyMask(document.getElementById('cliente_telefone'), maskTelefone);
    applyMask(document.getElementById('contato_responsavel'), maskTelefone);
    
    const pCpf = document.getElementById('p_cpf');
    if (pCpf) applyMask(pCpf, maskCnpjCpf);
    const pCnpj = document.getElementById('p_cnpj');
    if (pCnpj) applyMask(pCnpj, maskCnpjCpf);
    const pDoc = document.getElementById('p_cpf_cnpj_doc_veicular');
    if (pDoc) applyMask(pDoc, maskCnpjCpf);

    // Validação de duplicidade CNPJ/CPF em tempo real/blur
    const inputCnpjCpf = document.getElementById('cliente_cnpj_cpf');
    if (inputCnpjCpf) {
        inputCnpjCpf.addEventListener('blur', verificarDuplicidadeCnpjCpf);
        inputCnpjCpf.addEventListener('input', (e) => {
            const cleaned = e.target.value.replace(/\D/g, '');
            if (cleaned.length === 11 || cleaned.length === 14) {
                verificarDuplicidadeCnpjCpf();
            } else {
                const feedback = document.getElementById('cnpj_cpf_feedback');
                if (feedback) feedback.style.display = 'none';
                inputCnpjCpf.style.borderColor = '';
                inputCnpjCpf.style.boxShadow = '';
            }
        });
    }

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeContratoModal();
            closeAdminModal();
            closeHistoricoModal();
            closePrestadorModal();
        }
        
        // F2 -> Novo Cadastro (Proposta, Proposta Particular ou Prestador dependendo da aba)
        if (e.key === 'F2') {
            e.preventDefault();
            if (currentTab === 'prestadores') {
                const pModal = document.getElementById('prestadorModal');
                if (pModal && !pModal.classList.contains('active')) {
                    openPrestadorModal(null);
                }
            } else if (currentTab === 'particulares') {
                const modal = document.getElementById('contratoModal');
                if (modal && !modal.classList.contains('active')) {
                    openContratoModal(null, false, 'proposta_particular');
                }
            } else {
                const modal = document.getElementById('contratoModal');
                if (modal && !modal.classList.contains('active')) {
                    openContratoModal(null);
                }
            }
        }
        
        // Ctrl + Enter -> Salvar (se modal ativo)
        if (e.ctrlKey && e.key === 'Enter') {
            const pModal = document.getElementById('prestadorModal');
            if (pModal && pModal.classList.contains('active')) {
                e.preventDefault();
                const pForm = document.getElementById('prestadorForm');
                if (pForm) pForm.requestSubmit();
                return;
            }

            const modal = document.getElementById('contratoModal');
            if (modal && modal.classList.contains('active')) {
                e.preventDefault();
                const form = document.getElementById('contratoForm');
                if (form) form.requestSubmit();
            }
        }
    });
}

function ordenarStatusLogico(statusList) {
    const ordem = [
        'PROPOSTA ABERTA',
        'EM ANÁLISE',
        'ATIVO',
        'REVISÃO',
        'FINALIZADO',
        'VENCIDO',
        'CANCELADO'
    ];
    return [...statusList].sort((a, b) => {
        const normA = (a.nome || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
        const normB = (b.nome || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
        const idxA = ordem.findIndex(o => normA.includes(o.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()));
        const idxB = ordem.findIndex(o => normB.includes(o.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()));
        const rankA = idxA === -1 ? 99 : idxA;
        const rankB = idxB === -1 ? 99 : idxB;
        return rankA - rankB;
    });
}

// --- Funções de Dados ---
async function loadConfig() {
    try {
        const [resStatus, resDemanda, resTabela] = await Promise.all([
            supabaseClient.from('com_status').select('*'),
            supabaseClient.from('com_tipos_demanda').select('*').order('nome'),
            supabaseClient.from('com_tabelas_preco').select('*').order('nome')
        ]);

        config.status = ordenarStatusLogico(resStatus.data || []);
        config.demandas = resDemanda.data || [];
        config.tabelas = resTabela.data || [];

        // Tipos de veículo: busca do Supabase com fallback seguro para localStorage
        let tvList = null;
        try {
            const resTv = await supabaseClient.from('com_tipos_veiculo').select('*').order('nome');
            if (resTv && resTv.data && resTv.data.length > 0) {
                tvList = resTv.data;
            }
        } catch (e) {
            console.warn("Tabela com_tipos_veiculo não disponível no Supabase, usando fallback:", e);
        }

        if (!tvList || tvList.length === 0) {
            try {
                const local = localStorage.getItem('com_tipos_veiculo_fallback');
                if (local) tvList = JSON.parse(local);
            } catch(e) {}
            if (!tvList || tvList.length === 0) {
                tvList = [
                    { id: 'van', nome: 'Van' },
                    { id: 'sedan', nome: 'Sedan' }
                ];
                try {
                    localStorage.setItem('com_tipos_veiculo_fallback', JSON.stringify(tvList));
                } catch(e) {}
            }
        }
        config.tipos_veiculo = tvList;

        populateDropdowns();
        renderAdminLists();
    } catch (err) {
        console.error("Erro ao carregar configurações:", err);
    }
}

async function loadContratos() {
    try {
        // VIEW: view_com_contratos_status já inclui status_nome, tabela_preco_nome e tipo_demanda_nome
        const { data, error } = await supabaseClient
            .from('view_com_contratos_status')
            .select('*');
        
        if (error) throw error;
        contratos = data || [];
        renderContratos();
        renderParticulares();
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
    fn('filterStatusParticular', config.status, 'Todos os Status');
    fn('filterVeiculoParticular', config.tipos_veiculo, 'Todos os Veículos');
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
    if (tabName === 'prestadores') renderPrestadores();
    if (tabName === 'particulares') renderParticulares();
    
    if (window.lucide) lucide.createIcons();
};

window.switchSubTab = (subId) => {
    document.querySelectorAll('.sub-view').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.sub-tab-item').forEach(t => t.classList.remove('active'));

    const targetSubView = document.getElementById(`subview-${subId}`);
    if (targetSubView) targetSubView.classList.add('active');
    
    const btn = document.querySelector(`.sub-tab-item[onclick*="${subId}"]`);
    if (btn) btn.classList.add('active');
    
    renderAdminLists();
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

    const statusVencidoObj = config.status.find(s => s.nome.toUpperCase().includes('VENCIDO'));

    let filtered = contratos.filter(c => {
        // Separação estrita: propostas particulares ficam na aba exclusiva
        if (c.proposta_versao === 3) return false;

        const clienteNome = c.cliente_nome || '';
        const clienteCnpj = c.cliente_cnpj_cpf || '';
        const descricao = c.descricao_contrato || '';
        
        const matchesSearch = clienteNome.toLowerCase().includes(searchTerm) || 
                              clienteCnpj.toLowerCase().includes(searchTerm) || 
                              descricao.toLowerCase().includes(searchTerm);
        
        // Se o contrato estiver vencido por data, o status lógico vira "VENCIDO"
        const isVencido = c.data_vencimento && new Date(c.data_vencimento + 'T00:00:00') < today;
        let logicalStatusId = c.status_id;
        if (isVencido && statusVencidoObj) {
            logicalStatusId = statusVencidoObj.id;
        }

        const matchesStatus = !filterStatus || logicalStatusId === filterStatus;
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
        let vencColor = 'var(--text-main)';

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

        const getStatusColor = (statusNome) => {
            if (!statusNome) return '#f59e0b';
            const nomeNorm = statusNome.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            if (nomeNorm.includes('ATIVO') || nomeNorm.includes('APROVADA') || nomeNorm.includes('CONTRATO')) return '#10b981'; // Verde (Ativo/Aprovado)
            if (nomeNorm.includes('ABERTA') || nomeNorm.includes('RASCUNHO')) return '#3b82f6'; // Azul (Aberto/Rascunho)
            if (nomeNorm.includes('ANALISE') || nomeNorm.includes('REVISAO')) return '#f59e0b'; // Laranja/Amarelo (Em Análise/Revisão)
            if (nomeNorm.includes('VENCIDO')) return '#ef4444'; // Vermelho (Vencido)
            if (nomeNorm.includes('CANCELADO')) return '#6b7280'; // Cinza (Cancelado)
            return '#f59e0b'; // Padrão
        };
        const isVencido = c.data_vencimento && new Date(c.data_vencimento + 'T00:00:00') < today;
        const statusColor = isVencido ? '#ef4444' : getStatusColor(c.status_nome);

        // Mapa de células por key
        const cellMap = {
            cliente:     `<td data-label="Cliente" onclick="openContratoModal('${c.id}', true)" style="cursor:pointer;" title="Clique para visualizar os dados"><div style="font-weight:800;color:var(--primary);font-size:0.75rem;">${c.cliente_nome || 'N/A'}</div><div style="font-size:0.67rem;color:var(--text-muted);">${c.vigencia || '-'}</div></td>`,
            cnpj:        `<td data-label="CNPJ" style="font-size:0.72rem;font-family:'JetBrains Mono',monospace;">${c.cliente_cnpj_cpf || '-'}</td>`,
            descricao:   `<td data-label="Descrição"><div style="font-size:0.73rem;">${c.descricao_contrato || '-'}</div><div style="font-size:0.67rem;color:var(--primary);font-weight:700;">VERSÃO: ${c.versao_contrato || '-'}</div></td>`,
            versao:      `<td data-label="Versão" style="text-align:center;"><span style="font-size:0.72rem;font-weight:700;color:var(--primary);">${c.versao_contrato || '-'}</span></td>`,
            referencia:  `<td data-label="Referência"><span style="font-family:'JetBrains Mono',monospace;font-size:0.72rem;">${c.referencia || '-'}</span></td>`,
            vigencia:    `<td data-label="Vigência" style="font-size:0.72rem;">${c.vigencia || '-'}</td>`,
            demanda:     `<td data-label="Demanda" style="font-size:0.72rem;">${c.tipo_demanda_nome || '-'}</td>`,
            tabela:      `<td data-label="Tabela" style="font-size:0.72rem;">${c.tabela_preco_nome || '-'}</td>`,
            assinatura:  `<td data-label="Assinatura" style="font-size:0.72rem;text-align:center;">${c.data_assinatura ? new Date(c.data_assinatura + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}</td>`,
            prazo:       `<td data-label="Prazo" style="font-size:0.72rem;text-align:center;">${c.prazo_meses ? c.prazo_meses + ' meses' : '-'}</td>`,
            vencimento:  `<td data-label="Vencimento"><div style="font-size:0.74rem;font-weight:700;color:${vencColor};display:flex;align-items:center;flex-wrap:wrap;gap:4px;">${c.data_vencimento ? new Date(c.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}${alertIcon}</div><div style="font-size:0.65rem;color:var(--text-muted);">${c.prazo_meses || 0} meses</div></td>`,
            status:      `<td data-label="Status" style="text-align:center;"><span style="background:${statusColor}22;color:${statusColor};padding:0.15rem 0.45rem;border-radius:6px;font-size:0.62rem;font-weight:800;border:1px solid ${statusColor}44;display:inline-block;white-space:nowrap;">${isVencido ? 'VENCIDO' : (c.status_nome || 'N/A')}</span></td>`,
            email:       `<td data-label="Email"><span style="font-size:0.72rem;">${c.cliente_email || '-'}</span></td>`,
            telefone:    `<td data-label="Telefone" style="font-size:0.72rem;">${c.cliente_telefone || '-'}</td>`,
            responsavel: `<td data-label="Responsável" style="font-size:0.72rem;">${c.nome_responsavel || '-'}</td>`,
            contato:     `<td data-label="Contato Resp." style="font-size:0.72rem;">${c.contato_responsavel || '-'}</td>`,
            observacao:  `<td data-label="Observações"><span style="font-size:0.72rem;color:var(--text-muted);max-width:180px;display:inline-block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${(c.observacao || '').replace(/"/g,"'")}">${c.observacao || '-'}</span></td>`,
            acoes:       `<td style="text-align:right;white-space:nowrap;"><div style="display:flex;gap:4px;justify-content:flex-end;"><button class="action-btn-mini" onclick="openHistoricoModal('${c.id}')" title="Histórico"><i data-lucide="history"></i></button><button class="action-btn-mini" onclick="openContratoModal('${c.id}')" title="Editar"><i data-lucide="edit-2"></i></button><button class="action-btn-mini" onclick="deleteContrato('${c.id}')" style="color:#ef4444;" title="Excluir"><i data-lucide="trash-2"></i></button></div></td>`
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

// ===== COLUNAS PROPOSTAS PARTICULARES =====
const COL_DEFS_PARTICULARES = [
    { key: 'cliente', label: 'Cliente', pinned: false, defaultVisible: true },
    { key: 'cnpj', label: 'CNPJ / CPF', pinned: false, defaultVisible: true },
    { key: 'roteiro', label: 'Roteiro & Veículo', pinned: false, defaultVisible: true },
    { key: 'data', label: 'Data', pinned: false, defaultVisible: true },
    { key: 'valor', label: 'Valor Total', pinned: false, defaultVisible: true },
    { key: 'status', label: 'Status', pinned: false, defaultVisible: true },
    { key: 'acoes', label: 'Ações', pinned: true, defaultVisible: true }
];

const COL_STORAGE_KEY_PARTICULARES = 'frotalink_comercial_cols_particulares_v1';
let colConfigParticular = loadColConfigParticular();

function loadColConfigParticular() {
    try {
        const saved = localStorage.getItem(COL_STORAGE_KEY_PARTICULARES);
        if (saved) {
            const parsed = JSON.parse(saved);
            const validKeys = COL_DEFS_PARTICULARES.map(c => c.key);
            if (parsed.order && parsed.order.every(k => validKeys.includes(k))) {
                return parsed;
            }
        }
    } catch (_) {}
    return {
        order: COL_DEFS_PARTICULARES.map(c => c.key),
        visible: Object.fromEntries(COL_DEFS_PARTICULARES.map(c => [c.key, c.defaultVisible]))
    };
}

function saveColConfigParticular() {
    localStorage.setItem(COL_STORAGE_KEY_PARTICULARES, JSON.stringify(colConfigParticular));
}

window.toggleColOrganizerParticular = () => {
    const panel = document.getElementById('colOrganizerPanelParticular');
    if (!panel) return;
    panel.classList.toggle('open');
    renderColChipsParticular();
    if (window.lucide) lucide.createIcons();
};

window.resetColConfigParticular = () => {
    colConfigParticular = {
        order: COL_DEFS_PARTICULARES.map(c => c.key),
        visible: Object.fromEntries(COL_DEFS_PARTICULARES.map(c => [c.key, c.defaultVisible]))
    };
    saveColConfigParticular();
    renderColChipsParticular();
    renderParticulares();
    if (window.lucide) lucide.createIcons();
};

function renderColChipsParticular() {
    const container = document.getElementById('colChipsContainerParticular');
    if (!container) return;
    container.innerHTML = colConfigParticular.order.map((key) => {
        const def = COL_DEFS_PARTICULARES.find(c => c.key === key);
        if (!def) return '';
        const isVis = colConfigParticular.visible[key] !== false;
        const isPinned = def.pinned;
        return `
            <div class="col-chip ${isVis ? 'visible' : 'hidden'} ${isPinned ? 'pinned' : ''}"
                data-key="${key}" draggable="${!isPinned}">
                <i data-lucide="${isPinned ? 'pin' : 'grip-vertical'}" style="width:12px;opacity:0.6;"></i>
                <span>${def.label}</span>
                ${!isPinned ? `
                    <button class="chip-eye-btn" onclick="toggleColVisParticular('${key}')" title="${isVis ? 'Ocultar' : 'Exibir'}">
                        <i data-lucide="${isVis ? 'eye' : 'eye-off'}" style="width:13px;"></i>
                    </button>
                ` : ''}
            </div>
        `;
    }).join('');
    setupDragDropParticular();
    if (window.lucide) lucide.createIcons();
}

window.toggleColVisParticular = (key) => {
    colConfigParticular.visible[key] = !colConfigParticular.visible[key];
    saveColConfigParticular();
    renderColChipsParticular();
    renderParticulares();
};

function setupDragDropParticular() {
    const chips = document.querySelectorAll('#colChipsContainerParticular .col-chip[draggable="true"]');
    let dragSrc = null;

    chips.forEach(chip => {
        chip.addEventListener('dragstart', function(e) {
            dragSrc = this;
            e.dataTransfer.effectAllowed = 'move';
            this.classList.add('dragging');
        });
        chip.addEventListener('dragover', function(e) {
            e.preventDefault();
            this.classList.add('drag-over');
        });
        chip.addEventListener('dragleave', function() {
            this.classList.remove('drag-over');
        });
        chip.addEventListener('drop', function(e) {
            e.preventDefault();
            this.classList.remove('drag-over');
            if (dragSrc && dragSrc !== this) {
                const srcKey = dragSrc.dataset.key;
                const tgtKey = this.dataset.key;
                const order = [...colConfigParticular.order];
                const fromIdx = order.indexOf(srcKey);
                const toIdx = order.indexOf(tgtKey);
                order.splice(fromIdx, 1);
                order.splice(toIdx, 0, srcKey);
                colConfigParticular.order = order;
                saveColConfigParticular();
                renderColChipsParticular();
                renderParticulares();
            }
        });
        chip.addEventListener('dragend', function() {
            this.classList.remove('dragging');
            document.querySelectorAll('#colChipsContainerParticular .col-chip').forEach(c => c.classList.remove('drag-over'));
        });
    });
}

function renderAlertBannerParticular() {
    const banner = document.getElementById('alertBannerParticular');
    if (!banner) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in30Days = new Date(today);
    in30Days.setDate(today.getDate() + 30);

    const particulares = (contratos || []).filter(c => c.proposta_versao === 3);

    const vencidos = particulares.filter(c => {
        const dStr = c.data_validade || c.data_vencimento;
        if (!dStr) return false;
        return new Date(dStr + 'T00:00:00') < today;
    });

    const aVencer = particulares.filter(c => {
        const dStr = c.data_validade || c.data_vencimento;
        if (!dStr) return false;
        const d = new Date(dStr + 'T00:00:00');
        return d >= today && d <= in30Days;
    });

    if (vencidos.length === 0 && aVencer.length === 0) {
        banner.style.display = 'none';
        return;
    }

    banner.style.display = 'block';

    let html = `
    <div class="alerts-toggle-row" style="display:flex; gap:0.6rem; align-items:center; margin-bottom: 0.6rem; flex-wrap:wrap;">
    `;

    if (vencidos.length > 0) {
        html += `
        <button type="button" onclick="toggleAlertDetailsParticular('vencidos')" class="alert-chip-toggle danger-toggle" style="cursor:pointer; display:inline-flex; align-items:center; gap:0.5rem; padding:0.45rem 1rem; border-radius:30px; font-weight:800; font-size:0.72rem; border:1px solid rgba(239,68,68,0.25); background:rgba(239,68,68,0.06); color:#ef4444; transition:all 0.2s; outline:none; font-family:'Inter', sans-serif;">
            <i data-lucide="alert-triangle" style="width:14px;height:14px;"></i>
            <span>${vencidos.length} proposta(s) particular(es) VENCIDA(S)</span>
            <i data-lucide="chevron-down" id="vencidosChevronParticular" style="width:14px;height:14px;transition: transform 0.2s;"></i>
        </button>
        `;
    }

    if (aVencer.length > 0) {
        html += `
        <button type="button" onclick="toggleAlertDetailsParticular('avencer')" class="alert-chip-toggle warning-toggle" style="cursor:pointer; display:inline-flex; align-items:center; gap:0.5rem; padding:0.45rem 1rem; border-radius:30px; font-weight:800; font-size:0.72rem; border:1px solid rgba(245,158,11,0.25); background:rgba(245,158,11,0.06); color:#f59e0b; transition:all 0.2s; outline:none; font-family:'Inter', sans-serif;">
            <i data-lucide="clock" style="width:14px;height:14px;"></i>
            <span>${aVencer.length} proposta(s) particular(es) vencem em 30 dias</span>
            <i data-lucide="chevron-down" id="avencerChevronParticular" style="width:14px;height:14px;transition: transform 0.2s;"></i>
        </button>
        `;
    }

    html += `</div>`;

    if (vencidos.length > 0) {
        html += `
        <div id="vencidosDetailsPanelParticular" class="comercial-alert-banner alert-danger-banner" style="display:none;align-items:flex-start;gap:0.8rem;padding:0.9rem 1.2rem;border-radius:12px;margin-bottom:0.6rem;animation:fadeIn 0.2s ease;">
            <div style="flex:1;">
                <div class="banner-desc" style="font-size:0.72rem;line-height:1.5;">${vencidos.map(c => `<strong>${c.cliente_nome || 'Cliente'}</strong> (${fmtDataBR(c.data_validade || c.data_vencimento)})`).join(' &nbsp;·&nbsp; ')}</div>
            </div>
        </div>`;
    }

    if (aVencer.length > 0) {
        html += `
        <div id="avencerDetailsPanelParticular" class="comercial-alert-banner alert-warning-banner" style="display:none;align-items:flex-start;gap:0.8rem;padding:0.9rem 1.2rem;border-radius:12px;margin-bottom:0.6rem;animation:fadeIn 0.2s ease;">
            <div style="flex:1;">
                <div class="banner-desc" style="font-size:0.72rem;line-height:1.5;">${aVencer.map(c => `<strong>${c.cliente_nome || 'Cliente'}</strong> (${fmtDataBR(c.data_validade || c.data_vencimento)})`).join(' &nbsp;·&nbsp; ')}</div>
            </div>
        </div>`;
    }

    banner.innerHTML = html;
    if (window.lucide) lucide.createIcons();
}

window.toggleAlertDetailsParticular = (tipo) => {
    const panelId = tipo === 'vencidos' ? 'vencidosDetailsPanelParticular' : 'avencerDetailsPanelParticular';
    const chevronId = tipo === 'vencidos' ? 'vencidosChevronParticular' : 'avencerChevronParticular';
    const panel = document.getElementById(panelId);
    const chevron = document.getElementById(chevronId);
    if (!panel) return;

    const isVisible = panel.style.display !== 'none';
    panel.style.display = isVisible ? 'none' : 'flex';
    if (chevron) {
        chevron.style.transform = isVisible ? 'rotate(0deg)' : 'rotate(180deg)';
    }
};

window.exportExcelParticulares = () => {
    const filtered = (contratos || []).filter(c => c.proposta_versao === 3);
    const headers = ['Cliente', 'CNPJ / CPF', 'Roteiro', 'Veículo', 'Data', 'Valor Total (R$)', 'Status'];
    
    const rows = filtered.map(c => {
        const itens = (window.particularesItensMap && window.particularesItensMap[c.id]) || [];
        const roteiros = itens.map(it => `${it.origem || ''} ➔ ${it.destino || ''}`).join('; ');
        const veiculos = itens.map(it => it.v3?.tipo_veiculo || it.tipo_veiculo || '').filter(Boolean).join(', ');
        let totalVal = 0;
        itens.forEach(it => {
            totalVal += (it.v3?.total_item ?? (((it.total_km || 0) * (it.valor_km || 0))));
        });
        const dataStr = c.data_proposta ? fmtDataBR(c.data_proposta) : (c.data_assinatura ? fmtDataBR(c.data_assinatura) : '-');
        return [
            c.cliente_nome || '',
            c.cliente_cnpj_cpf || '',
            roteiros || '-',
            veiculos || '-',
            dataStr,
            totalVal,
            c.status_nome || '-'
        ];
    });

    const wsData = [headers, ...rows];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    ws['!cols'] = headers.map((h, i) => ({
        wch: Math.min(Math.max(h.length, ...rows.map(r => String(r[i] || '').length)) + 4, 45)
    }));

    XLSX.utils.book_append_sheet(wb, ws, 'Propostas Particulares');
    const d = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
    XLSX.writeFile(wb, `FrotaLink_Propostas_Particulares_${d}.xlsx`);
};

window.exportPdfParticulares = () => {
    const { jsPDF } = window.jspdf;
    const filtered = (contratos || []).filter(c => c.proposta_versao === 3);
    const headers = ['Cliente', 'CNPJ / CPF', 'Roteiro', 'Veículo', 'Data', 'Valor Total', 'Status'];
    
    const rows = filtered.map(c => {
        const itens = (window.particularesItensMap && window.particularesItensMap[c.id]) || [];
        const roteiros = itens.map(it => `${it.origem || ''} -> ${it.destino || ''}`).join('; ');
        const veiculos = itens.map(it => it.v3?.tipo_veiculo || it.tipo_veiculo || '').filter(Boolean).join(', ');
        let totalVal = 0;
        itens.forEach(it => {
            totalVal += (it.v3?.total_item ?? (((it.total_km || 0) * (it.valor_km || 0))));
        });
        const dataStr = c.data_proposta ? fmtDataBR(c.data_proposta) : (c.data_assinatura ? fmtDataBR(c.data_assinatura) : '-');
        return [
            c.cliente_nome || '',
            c.cliente_cnpj_cpf || '',
            roteiros || '-',
            veiculos || '-',
            dataStr,
            fmtMoeda(totalVal),
            c.status_nome || '-'
        ];
    });

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pw = doc.internal.pageSize.width;

    // Cabeçalho
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pw, 24, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('FrotaLink — Relatório de Propostas Particulares', 14, 10);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    const dateLabel = new Date().toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' });
    doc.text(`Gerado em ${dateLabel}  •  ${filtered.length} registro(s)`, 14, 18);

    doc.autoTable({
        head: [headers],
        body: rows,
        startY: 28,
        styles: {
            font: 'helvetica',
            fontSize: 8,
            cellPadding: { top: 3, right: 4, bottom: 3, left: 4 },
            textColor: [30, 41, 59],
            lineColor: [226, 232, 240],
            lineWidth: 0.15,
            overflow: 'linebreak',
        },
        headStyles: {
            fillColor: [45, 158, 107],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 8.5,
            halign: 'left',
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        bodyStyles: { fillColor: [255, 255, 255] }
    });

    const d = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
    doc.save(`FrotaLink_Propostas_Particulares_${d}.pdf`);
};

window.renderParticulares = async () => {
    const body = document.getElementById('particularesTableBody');
    if (!body) return;

    renderAlertBannerParticular();

    const searchTerm = (document.getElementById('particularSearch')?.value || '').toLowerCase();
    const filterStatus = document.getElementById('filterStatusParticular')?.value || '';
    const filterVeiculo = document.getElementById('filterVeiculoParticular')?.value || '';

    // Filtra apenas propostas particulares (versao 3)
    let filtered = (contratos || []).filter(c => c.proposta_versao === 3);

    // Carrega itens v3 em cache caso necessário
    if (!window.particularesItensMap) window.particularesItensMap = {};
    const idsToFetch = filtered.filter(c => !window.particularesItensMap[c.id]).map(c => c.id);
    if (idsToFetch.length > 0) {
        try {
            const { data: itensDB } = await supabaseClient
                .from('com_proposta_itens')
                .select('*')
                .in('contrato_id', idsToFetch)
                .order('ordem', { ascending: true });
            
            if (itensDB) {
                itensDB.forEach(it => {
                    if (!window.particularesItensMap[it.contrato_id]) {
                        window.particularesItensMap[it.contrato_id] = [];
                    }
                    let parsedV3 = null;
                    if (it.descricao && it.descricao.startsWith('{') && it.descricao.endsWith('}')) {
                        try { parsedV3 = JSON.parse(it.descricao); } catch(e){}
                    }
                    window.particularesItensMap[it.contrato_id].push({
                        ...it,
                        v3: parsedV3
                    });
                });
            }
        } catch (e) {
            console.warn('Erro ao carregar itens de propostas particulares:', e);
        }
    }

    filtered = filtered.filter(c => {
        const clienteNome = (c.cliente_nome || '').toLowerCase();
        const clienteCnpj = (c.cliente_cnpj_cpf || '').toLowerCase();
        const itens = window.particularesItensMap[c.id] || [];
        
        let matchVeiculo = true;
        if (filterVeiculo) {
            matchVeiculo = itens.some(it => {
                const veic = it.v3?.tipo_veiculo || '';
                return veic.toLowerCase() === filterVeiculo.toLowerCase();
            });
        }

        const matchSearch = clienteNome.includes(searchTerm) || 
                            clienteCnpj.includes(searchTerm) ||
                            itens.some(it => (it.origem || '').toLowerCase().includes(searchTerm) || (it.destino || '').toLowerCase().includes(searchTerm) || (it.v3?.tipo_veiculo || '').toLowerCase().includes(searchTerm));

        const matchStatus = !filterStatus || c.status_id === filterStatus;

        return matchSearch && matchStatus && matchVeiculo;
    });

    const visibleKeys = colConfigParticular.order.filter(k => colConfigParticular.visible[k] !== false);
    const headerRow = document.getElementById('particularesHeader');
    if (headerRow) {
        const widths = {
            cliente: 'width: 220px;',
            cnpj: 'width: 150px;',
            roteiro: '',
            data: 'width: 110px; text-align: center;',
            valor: 'width: 130px; text-align: right;',
            status: 'width: 140px; text-align: center;',
            acoes: 'width: 150px; text-align: right;'
        };
        headerRow.innerHTML = visibleKeys.map(k => {
            const def = COL_DEFS_PARTICULARES.find(c => c.key === k);
            return `<th style="${widths[k] || ''}">${def ? def.label : k}</th>`;
        }).join('');
    }

    if (filtered.length === 0) {
        body.innerHTML = `<tr><td colspan="${visibleKeys.length || 7}" style="text-align:center;padding:2.5rem;color:var(--text-muted);font-style:italic;">Nenhuma proposta particular encontrada.</td></tr>`;
        return;
    }

    const getStatusColor = (statusNome) => {
        if (!statusNome) return '#3b82f6';
        const nomeNorm = statusNome.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (nomeNorm.includes('ATIVO') || nomeNorm.includes('APROVADA') || nomeNorm.includes('CONTRATO')) return '#10b981';
        if (nomeNorm.includes('ABERTA') || nomeNorm.includes('RASCUNHO')) return '#3b82f6';
        if (nomeNorm.includes('ANALISE') || nomeNorm.includes('REVISAO')) return '#f59e0b';
        if (nomeNorm.includes('CANCELADO')) return '#6b7280';
        return '#3b82f6';
    };

    body.innerHTML = filtered.map(c => {
        const itens = window.particularesItensMap[c.id] || [];
        let roteiroHtml = '<span style="color:var(--text-muted);font-style:italic;">Sem itens cadastrados</span>';
        let totalCalculado = 0;

        if (itens.length > 0) {
            const rotasResumo = itens.map(it => {
                const orig = it.origem || '-';
                const dest = it.destino || '-';
                const tipoV = it.v3?.tipo_veiculo || 'Veículo';
                const km = it.v3?.km_calculado || it.total_km || 0;
                const itemTot = it.v3?.total_item ?? (((it.total_km || 0) * (it.valor_km || 0)));
                totalCalculado += itemTot;
                return `<div><strong>${orig} ➔ ${dest}</strong> <span style="display:inline-block;background:rgba(45,158,107,0.12);color:var(--primary);padding:1px 6px;border-radius:4px;font-size:0.65rem;font-weight:700;margin-left:4px;">${tipoV}</span> <span style="font-size:0.68rem;color:var(--text-muted);">(${km} KM)</span></div>`;
            }).join('');
            roteiroHtml = rotasResumo;
        }

        const dataStr = c.data_proposta ? fmtDataBR(c.data_proposta) : (c.data_assinatura ? fmtDataBR(c.data_assinatura) : '-');
        const statusColor = getStatusColor(c.status_nome);

        const cells = {
            cliente: `<td onclick="openContratoModal('${c.id}', true)" style="cursor:pointer;" title="Clique para visualizar os dados">
                <div style="font-weight:800;color:var(--primary);font-size:0.78rem;">${c.cliente_nome || 'N/A'}</div>
                <div style="font-size:0.67rem;color:var(--text-muted);">${c.contato_proposta || c.nome_responsavel || '-'}</div>
            </td>`,
            cnpj: `<td style="font-size:0.74rem;font-family:'JetBrains Mono',monospace;">${c.cliente_cnpj_cpf || '-'}</td>`,
            roteiro: `<td style="font-size:0.73rem;">${roteiroHtml}</td>`,
            data: `<td style="text-align:center;font-size:0.74rem;">${dataStr}</td>`,
            valor: `<td style="text-align:right;font-size:0.80rem;font-weight:800;color:var(--primary);font-family:'JetBrains Mono',monospace;">${fmtMoeda(totalCalculado)}</td>`,
            status: `<td style="text-align:center;">
                <span style="background:${statusColor}22;color:${statusColor};padding:0.2rem 0.5rem;border-radius:6px;font-size:0.65rem;font-weight:800;border:1px solid ${statusColor}44;display:inline-block;white-space:nowrap;">
                    ${c.status_nome || 'PROPOSTA ABERTA'}
                </span>
            </td>`,
            acoes: `<td style="text-align:right;white-space:nowrap;">
                <div style="display:flex;gap:4px;justify-content:flex-end;">
                    <button class="action-btn-mini" onclick="openHistoricoModal('${c.id}')" title="Histórico"><i data-lucide="history"></i></button>
                    <button class="action-btn-mini" onclick="abrirPdfParticular('${c.id}')" title="Gerar / Imprimir PDF"><i data-lucide="printer"></i></button>
                    <button class="action-btn-mini" onclick="openContratoModal('${c.id}')" title="Editar"><i data-lucide="edit-2"></i></button>
                    <button class="action-btn-mini" onclick="deleteContrato('${c.id}')" style="color:#ef4444;" title="Excluir"><i data-lucide="trash-2"></i></button>
                </div>
            </td>`
        };

        return `<tr>${visibleKeys.map(k => cells[k] || '').join('')}</tr>`;
    }).join('');

    if (window.lucide) lucide.createIcons();
};

window.abrirPdfParticular = async (id) => {
    await openContratoModal(id, true);
    gerarDocumentoProposta();
};

function renderTableHeader() {
    const tr = document.getElementById('contractsHeader');
    if (!tr) return;

    const defaultWidths = {
        cliente: 'min-width: 160px;',
        cnpj: 'width: 120px;',
        descricao: 'min-width: 140px;',
        versao: 'width: 75px; text-align: center;',
        referencia: 'width: 90px;',
        vigencia: 'width: 90px;',
        demanda: 'width: 110px;',
        tabela: 'width: 110px;',
        assinatura: 'width: 80px; text-align: center;',
        prazo: 'width: 80px; text-align: center;',
        vencimento: 'width: 95px;',
        status: 'width: 90px; text-align: center;',
        email: 'width: 120px;',
        telefone: 'width: 100px;',
        responsavel: 'width: 110px;',
        contato: 'width: 100px;',
        observacao: 'width: 130px;',
        acoes: 'width: 85px; text-align: right;'
    };

    tr.innerHTML = colConfig.order
        .filter(k => colConfig.visible[k] !== false)
        .map(k => {
            const def = COL_DEFS.find(d => d.key === k);
            if (!def) return '';
            const wStyle = defaultWidths[k] || '';
            if (def.sortKey) {
                return `<th onclick="handleSort('${def.sortKey}')" style="cursor:pointer; ${wStyle}">${def.label} <i data-lucide="chevrons-up-down" style="width:12px;opacity:0.4;"></i></th>`;
            }
            return `<th style="${wStyle}">${def.label}</th>`;
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
    
    // Container flex para os chips clicáveis
    let html = `
    <div class="alerts-toggle-row" style="display:flex; gap:0.6rem; align-items:center; margin-bottom: 0.6rem; flex-wrap:wrap;">
    `;

    if (vencidos.length > 0) {
        html += `
        <button type="button" onclick="toggleAlertDetails('vencidos')" class="alert-chip-toggle danger-toggle" style="cursor:pointer; display:inline-flex; align-items:center; gap:0.5rem; padding:0.45rem 1rem; border-radius:30px; font-weight:800; font-size:0.72rem; border:1px solid rgba(239,68,68,0.25); background:rgba(239,68,68,0.06); color:#ef4444; transition:all 0.2s; outline:none; font-family:'Inter', sans-serif;">
            <i data-lucide="alert-triangle" style="width:14px;height:14px;"></i>
            <span>${vencidos.length} contrato(s) VENCIDO(S)</span>
            <i data-lucide="chevron-down" id="vencidosChevron" style="width:14px;height:14px;transition: transform 0.2s;"></i>
        </button>
        `;
    }

    if (aVencer.length > 0) {
        html += `
        <button type="button" onclick="toggleAlertDetails('avencer')" class="alert-chip-toggle warning-toggle" style="cursor:pointer; display:inline-flex; align-items:center; gap:0.5rem; padding:0.45rem 1rem; border-radius:30px; font-weight:800; font-size:0.72rem; border:1px solid rgba(245,158,11,0.25); background:rgba(245,158,11,0.06); color:#f59e0b; transition:all 0.2s; outline:none; font-family:'Inter', sans-serif;">
            <i data-lucide="clock" style="width:14px;height:14px;"></i>
            <span>${aVencer.length} contrato(s) vencem em 30 dias</span>
            <i data-lucide="chevron-down" id="avencerChevron" style="width:14px;height:14px;transition: transform 0.2s;"></i>
        </button>
        `;
    }

    html += `</div>`;

    // Painéis de detalhes ocultos por padrão (display: none)
    if (vencidos.length > 0) {
        html += `
        <div id="vencidosDetailsPanel" class="comercial-alert-banner alert-danger-banner" style="display:none;align-items:flex-start;gap:0.8rem;padding:0.9rem 1.2rem;border-radius:12px;margin-bottom:0.6rem;animation:fadeIn 0.2s ease;">
            <div style="flex:1;">
                <div class="banner-desc" style="font-size:0.72rem;line-height:1.5;">${vencidos.map(c => `<strong>${c.cliente_nome}</strong> (${c.data_vencimento ? new Date(c.data_vencimento+'T12:00:00').toLocaleDateString('pt-BR') : '-'})`).join(' &nbsp;·&nbsp; ')}</div>
            </div>
        </div>`;
    }

    if (aVencer.length > 0) {
        html += `
        <div id="avencerDetailsPanel" class="comercial-alert-banner alert-warning-banner" style="display:none;align-items:flex-start;gap:0.8rem;padding:0.9rem 1.2rem;border-radius:12px;margin-bottom:0.6rem;animation:fadeIn 0.2s ease;">
            <div style="flex:1;">
                <div class="banner-desc" style="font-size:0.72rem;line-height:1.5;">${aVencer.map(c => { const d = new Date(c.data_vencimento+'T00:00:00'); const dias = Math.ceil((d - new Date().setHours(0,0,0,0)) / 86400000); return `<strong>${c.cliente_nome}</strong> (${dias}d)`; }).join(' &nbsp;·&nbsp; ')}</div>
            </div>
        </div>`;
    }

    banner.innerHTML = html;
    if (window.lucide) lucide.createIcons();
}

window.toggleAlertDetails = (type) => {
    const panel = document.getElementById(type + 'DetailsPanel');
    const chevron = document.getElementById(type + 'Chevron');
    if (!panel) return;

    if (panel.style.display === 'none') {
        panel.style.display = 'flex';
        if (chevron) {
            chevron.style.transform = 'rotate(180deg)';
        }
    } else {
        panel.style.display = 'none';
        if (chevron) {
            chevron.style.transform = 'rotate(0deg)';
        }
    }
};

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
    today.setHours(0, 0, 0, 0);
    const in30Days = new Date(today);
    in30Days.setDate(today.getDate() + 30);

    const statusVencidoObj = config.status.find(s => s.nome.toUpperCase().includes('VENCIDO'));

    const totalContratos = contratos.length;
    
    // Contratos vencidos (por data ou por status)
    const vencidos = contratos.filter(c => {
        const isVencidoData = c.data_vencimento && new Date(c.data_vencimento + 'T00:00:00') < today;
        const isVencidoStatus = statusVencidoObj && c.status_id === statusVencidoObj.id;
        return isVencidoData || isVencidoStatus;
    });

    // Contratos vencendo em 30 dias (e não vencidos)
    const vencendo = contratos.filter(c => {
        if (!c.data_vencimento) return false;
        const d = new Date(c.data_vencimento + 'T00:00:00');
        const isVencidoData = d < today;
        return !isVencidoData && d <= in30Days;
    });

    // Contratos ativos (não vencidos por data)
    const ativos = contratos.filter(c => {
        const isVencidoData = c.data_vencimento && new Date(c.data_vencimento + 'T00:00:00') < today;
        return !isVencidoData;
    });

    // Valor Total da Carteira (soma dos valores declarados)
    const valorTotal = contratos.reduce((acc, c) => acc + (parseFloat(c.valor_contrato) || 0), 0);

    // Prazo Médio (em meses)
    const prazosValidos = contratos.filter(c => c.prazo_meses && c.prazo_meses > 0);
    const prazoMedio = prazosValidos.length > 0 
        ? Math.round(prazosValidos.reduce((acc, c) => acc + (parseInt(c.prazo_meses) || 0), 0) / prazosValidos.length)
        : 0;

    // Atualiza KPIs no DOM
    const elTotal = document.getElementById('dash_total_contratos');
    if (elTotal) elTotal.innerText = totalContratos;

    const elAtivos = document.getElementById('dash_contratos_ativos');
    if (elAtivos) elAtivos.innerText = ativos.length;

    const elVencendo = document.getElementById('dash_vencendo');
    if (elVencendo) elVencendo.innerText = vencendo.length;

    const elVencidos = document.getElementById('dash_vencidos');
    if (elVencidos) elVencidos.innerText = vencidos.length;

    const elValorTotal = document.getElementById('dash_valor_total');
    if (elValorTotal) elValorTotal.innerText = valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const elPrazoMedio = document.getElementById('dash_prazo_medio');
    if (elPrazoMedio) elPrazoMedio.innerText = `${prazoMedio} meses`;

    renderCharts();
}

function renderCharts() {
    const isDark = (window.currentThemeId || 'green_pastel') === 'dark';
    const textColor = isDark ? '#94a3b8' : '#5a7a6a';
    const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
    const primaryColor = isDark ? '#6366f1' : '#2d9e6b';

    // 1. Gráfico: Contratos por Vigência
    const ctxVig = document.getElementById('chartVigencia');
    if (ctxVig) {
        const vigMap = {};
        contratos.forEach(c => {
            const v = c.vigencia || 'Não Informada';
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
                    label: 'Quantidade',
                    data: dataVig,
                    backgroundColor: primaryColor,
                    borderRadius: 8
                }]
            },
            options: {
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { 
                    y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: textColor, precision: 0 } },
                    x: { grid: { display: false }, ticks: { color: textColor } }
                }
            }
        });
    }

    // 2. Gráfico: Mix por Tipo de Demanda
    const ctxDem = document.getElementById('chartDemanda');
    if (ctxDem) {
        const demMap = {};
        contratos.forEach(c => {
            const d = c.tipo_demanda_nome || 'Não Informada';
            demMap[d] = (demMap[d] || 0) + 1;
        });

        if (window.myChartDem) window.myChartDem.destroy();
        window.myChartDem = new Chart(ctxDem, {
            type: 'doughnut',
            data: {
                labels: Object.keys(demMap),
                datasets: [{
                    data: Object.values(demMap),
                    backgroundColor: ['#2d9e6b', '#6366f1', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6']
                }]
            },
            options: {
                maintainAspectRatio: false,
                plugins: { 
                    legend: { position: 'bottom', labels: { color: textColor, boxWidth: 12, padding: 15 } } 
                }
            }
        });
    }

    // 3. Gráfico: Distribuição por Tabela de Preço
    const ctxTab = document.getElementById('chartTabelaPreco');
    if (ctxTab) {
        const tabMap = {};
        contratos.forEach(c => {
            const t = c.tabela_preco_nome || 'Padrão';
            tabMap[t] = (tabMap[t] || 0) + 1;
        });

        if (window.myChartTab) window.myChartTab.destroy();
        window.myChartTab = new Chart(ctxTab, {
            type: 'pie',
            data: {
                labels: Object.keys(tabMap),
                datasets: [{
                    data: Object.values(tabMap),
                    backgroundColor: ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899']
                }]
            },
            options: {
                maintainAspectRatio: false,
                plugins: { 
                    legend: { position: 'bottom', labels: { color: textColor, boxWidth: 12, padding: 15 } } 
                }
            }
        });
    }

    // 4. Gráfico: Cronograma de Vencimentos (Por Mês/Ano)
    const ctxVenc = document.getElementById('chartVencimentosCronograma');
    if (ctxVenc) {
        const vencMap = {};
        contratos.forEach(c => {
            if (c.data_vencimento) {
                const dateParts = c.data_vencimento.split('-');
                if (dateParts.length >= 2) {
                    const monthYear = `${dateParts[1]}/${dateParts[0]}`;
                    vencMap[monthYear] = (vencMap[monthYear] || 0) + 1;
                }
            } else {
                vencMap['Sem Data'] = (vencMap['Sem Data'] || 0) + 1;
            }
        });

        const sortedKeys = Object.keys(vencMap).sort((a, b) => {
            if (a === 'Sem Data') return 1;
            if (b === 'Sem Data') return -1;
            const [mA, yA] = a.split('/');
            const [mB, yB] = b.split('/');
            return (yA + mA) - (yB + mB);
        });

        if (window.myChartVenc) window.myChartVenc.destroy();
        window.myChartVenc = new Chart(ctxVenc, {
            type: 'bar',
            data: {
                labels: sortedKeys,
                datasets: [{
                    label: 'Vencimentos',
                    data: sortedKeys.map(k => vencMap[k]),
                    backgroundColor: '#f59e0b',
                    borderRadius: 8
                }]
            },
            options: {
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { 
                    y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: textColor, precision: 0 } },
                    x: { grid: { display: false }, ticks: { color: textColor } }
                }
            }
        });
    }
}

// --- Modais e CRUD ---
window.openContratoModal = async (id = null, readOnly = false, forceCreationType = null) => {
    const action = id ? 'edit' : 'add';
    if (!readOnly && typeof canDo === 'function' && !canDo('comercial_contratos', action)) {
        alert("Você não tem permissão para esta ação.");
        return;
    }
    editId = id;
    const form = document.getElementById('contratoForm');
    form.reset();

    // Reset feedback de duplicidade CNPJ/CPF
    const feedbackCnpj = document.getElementById('cnpj_cpf_feedback');
    if (feedbackCnpj) feedbackCnpj.style.display = 'none';
    const inputCnpj = document.getElementById('cliente_cnpj_cpf');
    if (inputCnpj) {
        inputCnpj.style.borderColor = '';
        inputCnpj.style.boxShadow = '';
    }

    // Título dinâmico
    document.getElementById('modalTitle').innerText = readOnly ? 'Visualizar Contrato / Proposta' : (id ? 'Proposta / Contrato' : 'Nova Proposta');

    // Reset estado da proposta e limpa marcas de erro
    const modal = document.getElementById('contratoModal');
    clearHighlights(modal);
    propostaAtual = { contratoId: id, propostaId: id, step: 0, itens: [], historico: [], proposta_versao: 1 };

    const typeWrapper = document.getElementById('creationTypeWrapper');
    const selectType = document.getElementById('creation_type');

    // Preenche campos de contrato existente
    if (id) {
        if (typeWrapper) typeWrapper.style.display = 'none';
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

            // Sincroniza o step com base no status real do contrato
            const currentStatusObj = config.status.find(s => s.id === c.status_id);
            const statusNorm = currentStatusObj ? currentStatusObj.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() : '';

            if (statusNorm.includes('ABERTA')) {
                propostaAtual.step = 0;
            } else if (statusNorm.includes('ANALISE')) {
                propostaAtual.step = 1;
            } else if (statusNorm.includes('ATIVO') || statusNorm.includes('APROVAD') || statusNorm.includes('CONTRATO') || statusNorm.includes('FINALIZADO')) {
                propostaAtual.step = 2;
            } else {
                propostaAtual.step = c.proposta_step ?? 0;
            }
            propostaAtual.proposta_versao = c.proposta_versao ?? 1;

            // Carrega itens e histórico do Supabase
            if (modal) modal.classList.add('active');
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
                
                // Clone do estado original para auditar alterações
                propostaOriginal = {
                    header: { ...c },
                    itens: (propostaAtual.itens || []).map(it => ({ ...it }))
                };
            }

            // Controle de visibilidade de seções conforme versão
            const secEndereco = document.getElementById('secaoDadosPropostaEndereco');
            const secValidade = document.getElementById('secaoValidadeCondicoes');
            const secContrato = document.getElementById('secaoDadosContrato');

            if (c.proposta_versao === 3) {
                if (secEndereco) secEndereco.style.display = 'none';
                if (secValidade) secValidade.style.display = 'none';
                if (secContrato) secContrato.style.display = 'none';
            } else {
                if (secEndereco) secEndereco.style.display = 'block';
                if (secValidade) secValidade.style.display = 'block';
                if (secContrato) secContrato.style.display = propostaAtual.step === 2 ? 'block' : 'none';
            }
        }
    } else {
        if (typeWrapper) typeWrapper.style.display = 'flex';
        const initialType = forceCreationType || (currentTab === 'particulares' ? 'proposta_particular' : (selectType?.value || 'proposta_particular'));
        if (selectType) selectType.value = initialType;

        // Nova proposta — inicializar campos
        document.getElementById('prop_data_proposta').value  = dataAtualISO();
        document.getElementById('prop_validade_dias').value  = 30;
        document.getElementById('assinatura_proposta').value = 'New Cargo Transporte e Logística Ltda';
        document.getElementById('prop_observacoes').value    = 'Permanecemos à disposição para quaisquer esclarecimentos que se façam necessários.';

        propostaAtual.itens_v1 = [{ id: null, descricao: '', unidade: '', quantidade: 0, preco_unit: 0 }];
        propostaAtual.itens_v2 = [{
            id: null,
            origem: '',
            destino: '',
            qtd_veiculos: 1,
            total_km: 0,
            valor_km: 0,
            valor_veiculo: 0,
            habilitar_volta: false
        }];
        propostaAtual.itens_v3 = [{
            id: null,
            origem: '',
            destino: '',
            tipo_veiculo: (config.tipos_veiculo && config.tipos_veiculo[0]?.nome) || 'Van',
            qtd_km: 0,
            margem_km_pct: 0,
            km_calculado: 0,
            valor_km: 0,
            pedagio: 0,
            espera: 0,
            alimentacao: 0,
            pernoite: 0,
            estacionamento: 0,
            total_km_valor: 0,
            total_insumos: 0,
            total_item: 0
        }];

        if (initialType === 'proposta_particular') {
            propostaAtual.itens = propostaAtual.itens_v3;
            propostaAtual.proposta_versao = 3;
        } else {
            propostaAtual.itens = propostaAtual.itens_v1;
            propostaAtual.proposta_versao = 1;
        }
    }

    calcularValidadeProposta();
    setPropostaVersao(propostaAtual.proposta_versao, false);
    renderItensProposta();
    
    if (!id) {
        const curType = selectType?.value || 'proposta_particular';
        window.handleCreationTypeChange(curType);
    } else {
        // Mantém a Linha do Tempo e botões de etapas sempre visíveis em todas as etapas (inclusive em Aprovada/Contrato)
        const timeline = document.getElementById('propostaTimelineBar');
        const btnAvancar = document.getElementById('btnAvancarProposta');
        const btnGerar = document.getElementById('btnGerarDocumentoProposta');
        const propFieldsGroup = document.getElementById('propostaCamposExclusivosGroup');
        if (timeline) timeline.style.display = 'block';
        if (btnAvancar) btnAvancar.style.display = 'flex';
        if (btnGerar) btnGerar.style.display = 'flex';
        if (propFieldsGroup) propFieldsGroup.style.display = 'flex';
    }

    updateTimelineUI(propostaAtual.step);
    renderHistoricoProposta();

    // Controle de modo de apenas leitura (visualização)
    const btnSave = document.getElementById('btnSaveContrato');
    const btnAvancar = document.getElementById('btnAvancarProposta');
    const allInputs = form.querySelectorAll('input, select, textarea, button:not([onclick="closeContratoModal()"])');

    if (readOnly) {
        allInputs.forEach(el => {
            el.disabled = true;
        });
        if (btnSave) btnSave.style.display = 'none';
        if (btnAvancar) btnAvancar.style.display = 'none';
    } else {
        allInputs.forEach(el => {
            el.disabled = false;
        });
        if (btnSave) btnSave.style.display = 'inline-flex';
    }

    // Snapshot do estado inicial do formulário para auditoria precisa de alterações
    propostaOriginal = {
        header: getPropostaFormPayload(),
        itens: (propostaAtual.itens || []).map(it => ({ ...it }))
    };

    document.getElementById('contratoModal').classList.add('active');
    if (window.lucide) lucide.createIcons();
    
    // Auto-foca no campo Nome/Razão Social se não for apenas leitura
    if (!readOnly) {
        setTimeout(() => {
            const inputNome = document.getElementById('cliente_nome');
            if (inputNome) inputNome.focus();
        }, 100);
    }
};

window.handleStatusChange = (statusId) => {
    const stObj = config.status.find(s => s.id === statusId);
    if (!stObj) return;
    const norm = stObj.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    if (norm.includes('ABERTA')) {
        propostaAtual.step = 0;
    } else if (norm.includes('ANALISE')) {
        propostaAtual.step = 1;
    } else if (norm.includes('ATIVO') || norm.includes('APROVAD') || norm.includes('CONTRATO') || norm.includes('FINALIZADO')) {
        propostaAtual.step = 2;
    }
    updateTimelineUI(propostaAtual.step);
};

window.handleCreationTypeChange = (type) => {
    const timeline = document.getElementById('propostaTimelineBar');
    const btnAvancar = document.getElementById('btnAvancarProposta');
    const btnGerar = document.getElementById('btnGerarDocumentoProposta');
    const propFieldsGroup = document.getElementById('propostaCamposExclusivosGroup');
    const secEndereco = document.getElementById('secaoDadosPropostaEndereco');
    const secValidade = document.getElementById('secaoValidadeCondicoes');
    const secContrato = document.getElementById('secaoDadosContrato');

    if (type === 'proposta_particular') {
        propostaAtual.step = 0;
        if (timeline) timeline.style.display = 'block';
        if (btnAvancar) btnAvancar.style.display = 'flex';
        if (btnGerar) btnGerar.style.display = 'flex';
        if (propFieldsGroup) propFieldsGroup.style.display = 'flex';

        if (secEndereco) secEndereco.style.display = 'none';
        if (secValidade) secValidade.style.display = 'none';
        if (secContrato) secContrato.style.display = 'none';

        setPropostaVersao(3);

        const statusAberta = config.status.find(s =>
            s.nome.toUpperCase().includes('PROPOSTA ABERTA') ||
            s.nome.toUpperCase().includes('ABERTA')
        );
        const selectStatus = document.getElementById('status_id');
        if (statusAberta && selectStatus) {
            selectStatus.value = statusAberta.id;
        }
    } else if (type === 'contrato_direto') {
        propostaAtual.step = 2;
        if (timeline) timeline.style.display = 'none';
        if (btnAvancar) btnAvancar.style.display = 'none';
        if (btnGerar) btnGerar.style.display = 'none';
        if (propFieldsGroup) propFieldsGroup.style.display = 'flex';

        if (secEndereco) secEndereco.style.display = 'block';
        if (secValidade) secValidade.style.display = 'block';
        if (secContrato) secContrato.style.display = 'block';

        if (propostaAtual.proposta_versao === 3) {
            setPropostaVersao(1);
        }

        const statusAtivo = config.status.find(s => {
            const n = s.nome.toUpperCase();
            return n.includes('ATIVO') || n.includes('APROVAD') || n.includes('CONTRATO');
        });
        const selectStatus = document.getElementById('status_id');
        if (statusAtivo && selectStatus) {
            selectStatus.value = statusAtivo.id;
        }
    } else {
        // Nova Proposta Comercial (Funil / Etapas)
        propostaAtual.step = 0;
        if (timeline) timeline.style.display = 'block';
        if (btnAvancar) btnAvancar.style.display = 'flex';
        if (btnGerar) btnGerar.style.display = 'flex';
        if (propFieldsGroup) propFieldsGroup.style.display = 'flex';

        if (secEndereco) secEndereco.style.display = 'block';
        if (secValidade) secValidade.style.display = 'block';
        if (secContrato) secContrato.style.display = 'none';

        if (propostaAtual.proposta_versao === 3) {
            setPropostaVersao(1);
        }

        const statusAberta = config.status.find(s =>
            s.nome.toUpperCase().includes('PROPOSTA ABERTA') ||
            s.nome.toUpperCase().includes('ABERTA')
        );
        const selectStatus = document.getElementById('status_id');
        if (statusAberta && selectStatus) {
            selectStatus.value = statusAberta.id;
        }
    }
    
    updateTimelineUI(propostaAtual.step);
};

window.closeContratoModal = (force = false) => {
    const modal = document.getElementById('contratoModal');
    if (modal && modal.classList.contains('active')) {
        const form = document.getElementById('contratoForm');
        const isReadOnly = document.getElementById('modalTitle')?.innerText.includes('Visualizar');
        if (!force && !isReadOnly && !confirm('Deseja realmente fechar a proposta? Quaisquer dados preenchidos e não salvos serão perdidos.')) {
            return;
        }
        if (form) {
            form.querySelectorAll('input, select, textarea, button').forEach(el => el.disabled = false);
        }
        modal.classList.remove('active');
    }
};

function getPropostaFormPayload() {
    const statusId = document.getElementById('status_id')?.value || null;
    let stepCalc = propostaAtual.step;
    const selStatusObj = config.status.find(s => s.id === statusId);
    if (selStatusObj) {
        const norm = selStatusObj.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
        if (norm.includes('ABERTA')) stepCalc = 0;
        else if (norm.includes('ANALISE')) stepCalc = 1;
        else if (norm.includes('ATIVO') || norm.includes('APROVAD') || norm.includes('CONTRATO') || norm.includes('FINALIZADO')) stepCalc = 2;
    }

    return {
        cliente_nome:         document.getElementById('cliente_nome')?.value || '',
        cliente_cnpj_cpf:     document.getElementById('cliente_cnpj_cpf')?.value || '',
        cliente_email:        document.getElementById('cliente_email')?.value || '',
        cliente_telefone:     document.getElementById('cliente_telefone')?.value || '',
        vigencia:             document.getElementById('vigencia')?.value || '',
        descricao_contrato:   document.getElementById('descricao_contrato')?.value || '',
        versao_contrato:      document.getElementById('versao_contrato')?.value || '',
        referencia:           document.getElementById('referencia')?.value || '',
        data_assinatura:      document.getElementById('data_assinatura')?.value || null,
        prazo_meses:          parseInt(document.getElementById('prazo_meses')?.value) || 0,
        data_vencimento:      document.getElementById('data_vencimento')?.value || null,
        tipo_demanda_id:      document.getElementById('tipo_demanda_id')?.value || null,
        tabela_preco_id:      document.getElementById('tabela_preco_id')?.value || null,
        status_id:            statusId,
        nome_responsavel:     document.getElementById('nome_responsavel')?.value || '',
        contato_responsavel:  document.getElementById('contato_responsavel')?.value || '',
        observacao:           document.getElementById('observacao')?.value || '',
        proposta_step:        stepCalc,
        objeto_proposta:      document.getElementById('objeto_proposta')?.value || '',
        endereco_proposta:    document.getElementById('endereco_proposta')?.value || '',
        cep_proposta:         document.getElementById('cep_proposta')?.value || '',
        contato_proposta:     document.getElementById('contato_proposta')?.value || '',
        assinatura_proposta:  document.getElementById('assinatura_proposta')?.value || '',
        data_proposta:        document.getElementById('prop_data_proposta')?.value || null,
        validade_dias:        parseInt(document.getElementById('prop_validade_dias')?.value) || 30,
        data_validade:        document.getElementById('prop_data_validade')?.value || null,
        periodo_medicao:      document.getElementById('prop_periodo_medicao')?.value || '',
        forma_pagamento:      document.getElementById('prop_forma_pagamento')?.value || '',
        observacoes_proposta: document.getElementById('prop_observacoes')?.value || '',
        proposta_versao:      propostaAtual.proposta_versao || 1
    };
}

async function handleSaveContrato(e) {
    e.preventDefault();
    const btn = document.getElementById('btnSaveContrato');
    btn.disabled = true;
    const origText = btn.innerHTML;
    btn.innerHTML = 'SALVANDO...';

    const payload = getPropostaFormPayload();

    // Limpa realces vermelhos anteriores
    clearHighlights(document.getElementById('propostaModal') || document);

    let hasErrors = false;

    const checkRequired = (elId, value) => {
        const el = document.getElementById(elId);
        if (!el) return;
        const isVisible = !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length || el.offsetParent !== null);
        if (isVisible && (!value || !String(value).trim())) {
            highlightElement(el);
            hasErrors = true;
        }
    };

    checkRequired('cliente_nome', payload.cliente_nome);
    checkRequired('cliente_cnpj_cpf', payload.cliente_cnpj_cpf);
    checkRequired('nome_responsavel', payload.nome_responsavel);

    // Se a proposta estiver aprovada/contrato (step === 2), os campos do contrato tornam-se obrigatórios
    if (propostaAtual.step === 2) {
        checkRequired('descricao_contrato', payload.descricao_contrato);
        checkRequired('versao_contrato', payload.versao_contrato);
        checkRequired('vigencia', payload.vigencia);
        checkRequired('tipo_demanda_id', payload.tipo_demanda_id);
        checkRequired('data_assinatura', payload.data_assinatura);
        checkRequired('prazo_meses', payload.prazo_meses);
        checkRequired('tabela_preco_id', payload.tabela_preco_id);
    }


    if (hasErrors) {
        const firstErrorEl = document.querySelector('#propostaModal .field-error, .field-error');
        if (firstErrorEl) {
            firstErrorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => { try { firstErrorEl.focus(); } catch(e){} }, 300);
        }
        if (typeof showToast === 'function') {
            showToast("Preencha todos os campos obrigatórios em destaque vermelho.", "error");
        }
        alert("Preencha todos os campos obrigatórios em destaque vermelho.");
        btn.disabled = false;
        btn.innerHTML = origText;
        return;
    }

    // Duplicidade de CNPJ/CPF
    const cnpjCpf = (payload.cliente_cnpj_cpf || '').replace(/\D/g, '');
    if (cnpjCpf) {
        const duplicate = contratos.find(c => {
            const existingCnpjCpf = (c.cliente_cnpj_cpf || '').replace(/\D/g, '');
            return existingCnpjCpf === cnpjCpf && c.id !== editId;
        });
        if (duplicate) {
            alert(`Erro: Já existe uma proposta ou contrato cadastrado com o CNPJ/CPF ${payload.cliente_cnpj_cpf} (Cliente: ${duplicate.cliente_nome}).`);
            btn.disabled = false;
            btn.innerHTML = origText;
            return;
        }
    }

    // Validação de itens da proposta tornada opcional conforme solicitado

    try {
        let res, savedId;
        if (editId) {
            const motivo = prompt("Informe o motivo da alteração deste contrato/proposta:");
            if (motivo === null) {
                btn.disabled = false;
                btn.innerHTML = origText;
                return;
            }
            const motivoTr = motivo.trim();
            if (!motivoTr) {
                alert("O motivo da alteração é obrigatório.");
                btn.disabled = false;
                btn.innerHTML = origText;
                return;
            }
            
            const diffsHeader = detectarAlteracoesHeader(propostaOriginal ? propostaOriginal.header : {}, payload);
            const diffsItens = detectarAlteracoesItens(propostaOriginal ? propostaOriginal.itens : [], propostaAtual.itens, propostaAtual.proposta_versao);
            const todasAlteracoes = [...diffsHeader, ...diffsItens];
            
            const currentUserLabel = getCurrentUserDisplayName();
            let labelHistorico = `Dados da proposta atualizados\nPor: ${currentUserLabel}\nMotivo: ${motivoTr}`;
            if (todasAlteracoes.length > 0) {
                labelHistorico += `\n\nAlterações:\n${todasAlteracoes.join('\n')}`;
            }

            res = await supabaseClient.from('com_contratos').update(payload).eq('id', editId);
            if (res.error) throw res.error;
            savedId = editId;

            // Histórico de atualização com o motivo
            await supabaseClient.from('com_proposta_historico').insert([{
                contrato_id: savedId,
                step: propostaAtual.step,
                label: labelHistorico,
                data: dataAtualISO()
            }]);

            if (window.registrarLog) {
                window.registrarLog('comercial', 'ALTERAÇÃO', `Atualizou proposta/contrato ID ${savedId} de ${payload.cliente_nome}`);
            }
        } else {
            // Nova proposta ou novo contrato ativo direto
            const creationType = document.getElementById('creation_type')?.value || 'proposta';
            const currentUserLabel = getCurrentUserDisplayName();
            
            if (creationType === 'contrato_direto') {
                payload.proposta_step = 2;
                const statusAtivo = config.status.find(s => {
                    const n = s.nome.toUpperCase();
                    return n.includes('ATIVO') || n.includes('APROVAD') || n.includes('CONTRATO');
                });
                if (statusAtivo && !payload.status_id) {
                    payload.status_id = statusAtivo.id;
                    const selectStatus = document.getElementById('status_id');
                    if (selectStatus) selectStatus.value = statusAtivo.id;
                }

                const { data: inserted, error: errIns } = await supabaseClient
                    .from('com_contratos').insert([payload]).select().single();
                if (errIns) throw errIns;
                savedId = inserted.id;
                res = { error: null };

                // Histórico inicial de contrato ativo direto
                await supabaseClient.from('com_proposta_historico').insert([{
                    contrato_id: savedId,
                    step: 2,
                    label: `Contrato Ativo Criado Diretamente (Sem fluxo de Proposta)\nPor: ${currentUserLabel}`,
                    data: dataAtualISO()
                }]);

                if (window.registrarLog) {
                    window.registrarLog('comercial', 'INCLUSÃO', `Criou novo contrato ativo diretamente para ${payload.cliente_nome}`);
                }
            } else {
                // Nova proposta convencional (inicia em step 0)
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
                    label: `Proposta Aberta\nPor: ${currentUserLabel}`,
                    data: dataAtualISO()
                }]);

                if (window.registrarLog) {
                    window.registrarLog('comercial', 'INCLUSÃO', `Criou nova proposta comercial para ${payload.cliente_nome}`);
                }
            }
        }

        if (res.error) throw res.error;

        // Salva apenas itens preenchidos da proposta (se houver)
        await supabaseClient.from('com_proposta_itens').delete().eq('contrato_id', savedId);
        const validItens = (propostaAtual.itens || []).filter(it => {
            if (propostaAtual.proposta_versao === 3) {
                return (it.origem && it.origem.trim()) || (it.destino && it.destino.trim()) || (it.qtd_km > 0) || (it.valor_km > 0) || (it.pedagio > 0) || (it.espera > 0) || (it.alimentacao > 0) || (it.pernoite > 0) || (it.estacionamento > 0);
            } else if (propostaAtual.proposta_versao === 2) {
                return (it.origem && it.origem.trim()) || (it.destino && it.destino.trim()) || (it.qtd_veiculos > 0) || (it.total_km > 0);
            } else {
                return (it.descricao && it.descricao.trim()) || (it.unidade && it.unidade.trim()) || (it.quantidade > 0) || (it.preco_unit > 0);
            }
        });

        if (validItens.length > 0) {
            const itensPayload = validItens.map((it, idx) => {
                if (propostaAtual.proposta_versao === 3) {
                    const qtdKm = parseFloat(it.qtd_km) || 0;
                    const margemPct = parseFloat(it.margem_km_pct) || 0;
                    const kmCalc = Math.round((qtdKm * (1 + (margemPct / 100))) * 100) / 100;
                    const vKm = parseFloat(it.valor_km) || 0;
                    const totKmVal = Math.round((kmCalc * vKm) * 100) / 100;
                    const ped = parseFloat(it.pedagio) || 0;
                    const esp = parseFloat(it.espera) || 0;
                    const alm = parseFloat(it.alimentacao) || 0;
                    const per = parseFloat(it.pernoite) || 0;
                    const est = parseFloat(it.estacionamento) || 0;
                    const totIns = Math.round((ped + esp + alm + per + est) * 100) / 100;
                    const totItem = Math.round((totKmVal + totIns) * 100) / 100;

                    const v3Data = {
                        tipo_veiculo: it.tipo_veiculo || '',
                        qtd_km: qtdKm,
                        margem_km_pct: margemPct,
                        km_calculado: kmCalc,
                        valor_km: vKm,
                        pedagio: ped,
                        espera: esp,
                        alimentacao: alm,
                        pernoite: per,
                        estacionamento: est,
                        total_km_valor: totKmVal,
                        total_insumos: totIns,
                        total_item: totItem,
                        origem: it.origem || '',
                        destino: it.destino || ''
                    };

                    return {
                        contrato_id: savedId,
                        ordem:       idx + 1,
                        descricao:   JSON.stringify(v3Data),
                        unidade:     'KM',
                        quantidade:  kmCalc || qtdKm || 1,
                        preco_unit:  vKm || 0,
                        origem:      it.origem     || '',
                        destino:     it.destino    || '',
                        qtd_veiculos: 1,
                        total_km:    kmCalc || qtdKm || 0,
                        valor_km:    vKm || 0,
                        valor_veiculo: totKmVal || 0,
                        habilitar_volta: false
                    };
                } else if (propostaAtual.proposta_versao === 2) {
                    const descRota = (it.origem && it.destino) ? `${it.origem} ➔ ${it.destino}` : (it.origem || it.destino || 'Rota Comercial');
                    return {
                        contrato_id: savedId,
                        ordem:       idx + 1,
                        descricao:   it.descricao || descRota,
                        unidade:     it.unidade || 'KM',
                        quantidade:  (it.quantidade !== null && it.quantidade !== undefined && it.quantidade > 0) ? it.quantidade : (it.total_km || 1),
                        preco_unit:  (it.preco_unit !== null && it.preco_unit !== undefined && it.preco_unit > 0) ? it.preco_unit : (it.valor_km || 0),
                        origem:      it.origem     || '',
                        destino:     it.destino    || '',
                        qtd_veiculos: it.qtd_veiculos || 1,
                        total_km:    it.total_km    || 0,
                        valor_km:    it.valor_km    || 0,
                        valor_veiculo: it.valor_veiculo || 0,
                        habilitar_volta: !!it.habilitar_volta
                    };
                } else {
                    return {
                        contrato_id: savedId,
                        ordem:       idx + 1,
                        descricao:   it.descricao  || 'Item Proposta',
                        unidade:     it.unidade    || 'UN',
                        quantidade:  it.quantidade || 0,
                        preco_unit:  it.preco_unit || 0,
                        origem:      null,
                        destino:     null,
                        qtd_veiculos: null,
                        total_km:    null,
                        valor_km:    null,
                        valor_veiculo: null,
                        habilitar_volta: null
                    };
                }
            });
            const { error: errItens } = await supabaseClient.from('com_proposta_itens').insert(itensPayload);
            if (errItens) console.warn('Erro ao salvar itens:', errItens.message);
        }

        propostaAtual.contratoId = savedId;
        propostaAtual.propostaId = savedId;
        editId = savedId;

        await loadContratos();
        closeContratoModal(true);
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
    
    window.openPinModal(async () => {
        try {
            const { error } = await supabaseClient.from('com_contratos').delete().eq('id', id);
            if (error) throw error;
            await loadContratos();
            if (window.registrarLog) {
                window.registrarLog('comercial', 'EXCLUSÃO', `Excluiu proposta/contrato ID ${id}`);
            }
            alert("Contrato/Proposta excluído.");
        } catch (err) {
            alert("Erro ao excluir: " + err.message);
        }
    });
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
    const listTiposVeiculo = document.getElementById('list_tipos_veiculo');

    const renderItem = (item, table) => `
        <div class="admin-item-card" style="display: flex; justify-content: space-between; align-items: center; background: #ffffff; border: 1px solid #e2e8f0; padding: 0.85rem 1.2rem; border-radius: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.04); transition: all 0.2s ease;">
            <span style="font-size: 0.88rem; font-weight: 700; color: #1e293b;">${item.nome}</span>
            <button onclick="deleteAdminItem('${table}', '${item.id}')" title="Excluir" style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25); color: #ef4444; cursor: pointer; padding: 0.4rem 0.65rem; border-radius: 8px; display: inline-flex; align-items: center; gap: 0.4rem; font-weight: 700; font-size: 0.75rem; transition: all 0.2s;"><i data-lucide="trash-2" style="width: 14px; height: 14px;"></i> Excluir</button>
        </div>
    `;

    if (listTabelas) listTabelas.innerHTML = (config.tabelas || []).map(i => renderItem(i, 'com_tabelas_preco')).join('');
    if (listDemandas) listDemandas.innerHTML = (config.demandas || []).map(i => renderItem(i, 'com_tipos_demanda')).join('');
    if (listStatus) listStatus.innerHTML = (config.status || []).map(i => renderItem(i, 'com_status')).join('');
    if (listTiposVeiculo) listTiposVeiculo.innerHTML = (config.tipos_veiculo || []).map(i => renderItem(i, 'com_tipos_veiculo')).join('');

    if (window.lucide) lucide.createIcons();
}

window.openAdminModal = (table) => {
    if (typeof canDo === 'function' && !canDo('comercial_cadastros', 'add')) {
        alert("Você não tem permissão para esta ação.");
        return;
    }
    document.getElementById('adminTable').value = table.startsWith('com_') ? table : `com_${table}`;
    document.getElementById('adminValue').value = '';
    const labelTable = table.replace('com_', '').replace('_', ' ').toUpperCase();
    document.getElementById('adminModalTitle').innerText = `Cadastrar em ${labelTable}`;
    document.getElementById('adminModal').classList.add('active');
};

window.closeAdminModal = () => {
    document.getElementById('adminModal').classList.remove('active');
};

async function handleSaveAdmin(e) {
    e.preventDefault();
    const table = document.getElementById('adminTable').value;
    const nome = document.getElementById('adminValue').value.trim();
    if (!nome) return;

    try {
        const { error } = await supabaseClient.from(table).insert([{ nome }]);
        if (error) {
            if (table === 'com_tipos_veiculo') {
                const local = config.tipos_veiculo || [];
                local.push({ id: 'tv_' + Date.now(), nome });
                localStorage.setItem('com_tipos_veiculo_fallback', JSON.stringify(local));
                config.tipos_veiculo = local;
            } else {
                throw error;
            }
        }
        if (window.registrarLog) {
            window.registrarLog('comercial', 'INCLUSÃO', `Cadastrou item "${nome}" na tabela ${table}`);
        }
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
        if (error) {
            if (table === 'com_tipos_veiculo') {
                config.tipos_veiculo = (config.tipos_veiculo || []).filter(x => x.id !== id);
                localStorage.setItem('com_tipos_veiculo_fallback', JSON.stringify(config.tipos_veiculo));
            } else {
                throw error;
            }
        }
        if (window.registrarLog) {
            window.registrarLog('comercial', 'EXCLUSÃO', `Excluiu item ID ${id} da tabela ${table}`);
        }
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
        demanda:     c.tipo_demanda_nome || '',
        tabela:      c.tabela_preco_nome || '',
        assinatura:  c.data_assinatura ? new Date(c.data_assinatura + 'T12:00:00').toLocaleDateString('pt-BR') : '',
        prazo:       c.prazo_meses ? `${c.prazo_meses} meses` : '',
        vencimento:  c.data_vencimento ? new Date(c.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR') : '',
        status:      isVencido ? 'VENCIDO' : (c.status_nome || ''),
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
    // Exporta todas as colunas existentes, exceto 'acoes'
    const keys    = COL_DEFS.map(d => d.key).filter(k => k !== 'acoes');
    const headers = keys.map(k => COL_DEFS.find(d => d.key === k)?.label || k);
    
    // Exporta todos os registros (desconsiderando filtros da tela)
    const data    = contratos;
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

window.setPropostaVersao = (version, render = true) => {
    propostaAtual.proposta_versao = version;
    const btn1 = document.getElementById('btnVersao1');
    const btn2 = document.getElementById('btnVersao2');
    const btn3 = document.getElementById('btnVersao3');
    
    if (btn1 && btn2) {
        btn1.style.background = version === 1 ? 'var(--primary)' : 'none';
        btn1.style.color = version === 1 ? '#fff' : 'var(--text-muted)';
        btn2.style.background = version === 2 ? 'var(--primary)' : 'none';
        btn2.style.color = version === 2 ? '#fff' : 'var(--text-muted)';
        if (btn3) {
            btn3.style.background = version === 3 ? 'var(--primary)' : 'none';
            btn3.style.color = version === 3 ? '#fff' : 'var(--text-muted)';
        }
    }

    const tableWrapper = document.getElementById('propostaItensTableWrapper');
    const cardsV3 = document.getElementById('propostaItensCardsV3');
    const resumoV3 = document.getElementById('propostaResumoBarV3');
    const totalGroup = document.getElementById('propostaTotalGroup');

    if (version === 3) {
        if (tableWrapper) tableWrapper.style.display = 'none';
        if (cardsV3) {
            cardsV3.style.display = 'flex';
            cardsV3.style.flexDirection = 'column';
        }
        if (resumoV3) resumoV3.style.display = 'flex';
        if (totalGroup) totalGroup.style.display = 'none';
    } else {
        if (tableWrapper) tableWrapper.style.display = 'block';
        if (cardsV3) cardsV3.style.display = 'none';
        if (resumoV3) resumoV3.style.display = 'none';
        if (totalGroup) totalGroup.style.display = 'flex';

        // Ajusta o cabeçalho
        const header = document.getElementById('propostaItensHeader');
        if (header) {
            if (version === 1) {
                header.innerHTML = `
                    <tr style="background:rgba(255,255,255,0.04);">
                        <th style="padding:0.50rem 0.45rem;text-align:center;color:var(--text-muted);font-size:0.68rem;font-weight:800;width:34px;">#</th>
                        <th style="padding:0.50rem 0.45rem;text-align:left;color:var(--text-muted);font-size:0.68rem;font-weight:800;">Descrição</th>
                        <th style="padding:0.50rem 0.45rem;text-align:center;color:var(--text-muted);font-size:0.68rem;font-weight:800;width:75px;">Unidade</th>
                        <th style="padding:0.50rem 0.45rem;text-align:right;color:var(--text-muted);font-size:0.68rem;font-weight:800;width:75px;">Qtd.</th>
                        <th style="padding:0.50rem 0.45rem;text-align:right;color:var(--text-muted);font-size:0.68rem;font-weight:800;width:95px;">Preço Unit.</th>
                        <th style="padding:0.50rem 0.45rem;text-align:right;color:var(--text-muted);font-size:0.68rem;font-weight:800;width:95px;">Total</th>
                        <th style="width:36px;"></th>
                    </tr>
                `;
            } else {
                header.innerHTML = `
                    <tr style="background:rgba(255,255,255,0.04);">
                        <th style="padding:0.50rem 0.45rem;text-align:center;color:var(--text-muted);font-size:0.68rem;font-weight:800;width:34px;">#</th>
                        <th style="padding:0.50rem 0.45rem;text-align:left;color:var(--text-muted);font-size:0.68rem;font-weight:800;min-width:110px;">Origem</th>
                        <th style="padding:0.50rem 0.45rem;text-align:left;color:var(--text-muted);font-size:0.68rem;font-weight:800;min-width:110px;">Destino</th>
                        <th style="padding:0.50rem 0.45rem;text-align:right;color:var(--text-muted);font-size:0.68rem;font-weight:800;width:70px;">Qtd. Veíc.</th>
                        <th style="padding:0.50rem 0.45rem;text-align:right;color:var(--text-muted);font-size:0.68rem;font-weight:800;width:75px;">Total KM</th>
                        <th style="padding:0.50rem 0.45rem;text-align:right;color:var(--text-muted);font-size:0.68rem;font-weight:800;width:80px;">Valor KM</th>
                        <th style="padding:0.50rem 0.45rem;text-align:right;color:var(--text-muted);font-size:0.68rem;font-weight:800;width:85px;">Valor Veíc.</th>
                        <th style="padding:0.50rem 0.45rem;text-align:center;color:var(--text-muted);font-size:0.68rem;font-weight:800;width:55px;">Volta?</th>
                        <th style="padding:0.50rem 0.45rem;text-align:right;color:var(--text-muted);font-size:0.68rem;font-weight:800;width:95px;">Total</th>
                        <th style="width:36px;"></th>
                    </tr>
                `;
            }
        }
    }

    if (render) {
        if (version === 3) {
            propostaAtual.itens = propostaAtual.itens_v3;
        } else if (version === 2) {
            propostaAtual.itens = propostaAtual.itens_v2;
        } else {
            propostaAtual.itens = propostaAtual.itens_v1;
        }
        renderItensProposta();
    }
};

window.addItemProposta = () => {
    if (propostaAtual.proposta_versao === 3) {
        if (!propostaAtual.itens_v3) propostaAtual.itens_v3 = [];
        propostaAtual.itens_v3.push({
            id: null,
            origem: '',
            destino: '',
            tipo_veiculo: (config.tipos_veiculo && config.tipos_veiculo[0]?.nome) || 'Van',
            qtd_km: 0,
            margem_km_pct: 0,
            km_calculado: 0,
            valor_km: 0,
            pedagio: 0,
            espera: 0,
            alimentacao: 0,
            pernoite: 0,
            estacionamento: 0,
            total_km_valor: 0,
            total_insumos: 0,
            total_item: 0
        });
        propostaAtual.itens = propostaAtual.itens_v3;
    } else if (propostaAtual.proposta_versao === 2) {
        if (!propostaAtual.itens_v2) propostaAtual.itens_v2 = [];
        propostaAtual.itens_v2.push({
            id: null,
            origem: '',
            destino: '',
            qtd_veiculos: 1,
            total_km: 0,
            valor_km: 0,
            valor_veiculo: 0,
            habilitar_volta: false
        });
        propostaAtual.itens = propostaAtual.itens_v2;
    } else {
        if (!propostaAtual.itens_v1) propostaAtual.itens_v1 = [];
        propostaAtual.itens_v1.push({ id: null, descricao: '', unidade: '', quantidade: 0, preco_unit: 0 });
        propostaAtual.itens = propostaAtual.itens_v1;
    }
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

    if (propostaAtual.proposta_versao === 2) {
        if (field === 'habilitar_volta') {
            propostaAtual.itens[idx][field] = !!value;
        } else if (field === 'origem' || field === 'destino') {
            propostaAtual.itens[idx][field] = value;
        } else {
            propostaAtual.itens[idx][field] = parseFloat(value) || 0;
        }

        // Recalcula valor por veículo
        const item = propostaAtual.itens[idx];
        item.valor_veiculo = (item.total_km || 0) * (item.valor_km || 0);

        // Atualiza a linha no DOM
        const tr = document.querySelector(`#propostaItensBody tr[data-idx="${idx}"]`);
        if (tr) {
            const veiculoCell = tr.querySelector('.row-veiculo-val');
            if (veiculoCell) veiculoCell.innerText = fmtMoeda(item.valor_veiculo);

            const rowTotal = item.valor_veiculo * (item.qtd_veiculos || 1) * (item.habilitar_volta ? 2 : 1);
            const totalCell = tr.querySelector('.row-total-val');
            if (totalCell) totalCell.innerText = fmtMoeda(rowTotal);
        }
    } else {
        propostaAtual.itens[idx][field] = (field === 'quantidade' || field === 'preco_unit')
            ? parseFloat(value) || 0
            : value;

        // Atualiza o total da linha no DOM
        const tr = document.querySelector(`#propostaItensBody tr[data-idx="${idx}"]`);
        if (tr) {
            const item = propostaAtual.itens[idx];
            const rowTotal = (item.quantidade || 0) * (item.preco_unit || 0);
            const totalCell = tr.querySelector('.row-total-val');
            if (totalCell) totalCell.innerText = fmtMoeda(rowTotal);
        }
    }

    calcularTotalProposta();
};

window.updateItemPropostaV3 = (idx, field, value) => {
    if (!propostaAtual.itens[idx]) return;
    const it = propostaAtual.itens[idx];

    if (field === 'origem' || field === 'destino' || field === 'tipo_veiculo') {
        it[field] = value;
    } else {
        it[field] = parseFloat(value) || 0;
    }

    // Cálculos
    const qtdKm = parseFloat(it.qtd_km) || 0;
    const margemPct = parseFloat(it.margem_km_pct) || 0;
    it.km_calculado = Math.round((qtdKm * (1 + (margemPct / 100))) * 100) / 100;

    const valorKm = parseFloat(it.valor_km) || 0;
    it.total_km_valor = Math.round((it.km_calculado * valorKm) * 100) / 100;

    const ped = parseFloat(it.pedagio) || 0;
    const esp = parseFloat(it.espera) || 0;
    const alm = parseFloat(it.alimentacao) || 0;
    const per = parseFloat(it.pernoite) || 0;
    const est = parseFloat(it.estacionamento) || 0;
    it.total_insumos = Math.round((ped + esp + alm + per + est) * 100) / 100;

    it.total_item = Math.round((it.total_km_valor + it.total_insumos) * 100) / 100;

    // Atualiza elementos no card
    const card = document.querySelector(`.v3-card[data-idx="${idx}"]`);
    if (card) {
        const kmCalcEl = card.querySelector('.v3-km-calculado-display');
        if (kmCalcEl) kmCalcEl.innerText = `${it.km_calculado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} KM`;

        const subKmEl = card.querySelector('.v3-subtotal-km-display');
        if (subKmEl) subKmEl.innerText = fmtMoeda(it.total_km_valor);

        const subInsEl = card.querySelector('.v3-subtotal-insumos-display');
        if (subInsEl) subInsEl.innerText = fmtMoeda(it.total_insumos);

        const totItemEl = card.querySelector('.v3-total-item-display');
        if (totItemEl) totItemEl.innerText = fmtMoeda(it.total_item);
    }

    calcularTotalProposta();
};

function calcularTotalProposta() {
    let total = 0;
    if (propostaAtual.proposta_versao === 3) {
        const totalKmValor = (propostaAtual.itens || []).reduce((acc, it) => acc + (it.total_km_valor || 0), 0);
        const totalInsumos = (propostaAtual.itens || []).reduce((acc, it) => acc + (it.total_insumos || 0), 0);
        const totalGeral = totalKmValor + totalInsumos;

        const elKm = document.getElementById('v3ResumoTotalKm');
        if (elKm) elKm.innerText = fmtMoeda(totalKmValor);

        const elIns = document.getElementById('v3ResumoTotalInsumos');
        if (elIns) elIns.innerText = fmtMoeda(totalInsumos);

        const elTot = document.getElementById('v3ResumoTotalGeral');
        if (elTot) elTot.innerText = fmtMoeda(totalGeral);

        const elMainTot = document.getElementById('propostaTotal');
        if (elMainTot) elMainTot.innerText = fmtMoeda(totalGeral);
        return;
    } else if (propostaAtual.proposta_versao === 2) {
        total = (propostaAtual.itens || []).reduce((acc, it) => {
            const valorVeic = (it.total_km || 0) * (it.valor_km || 0);
            return acc + (valorVeic * (it.qtd_veiculos || 1) * (it.habilitar_volta ? 2 : 1));
        }, 0);
    } else {
        total = (propostaAtual.itens || []).reduce((acc, it) => acc + ((it.quantidade || 0) * (it.preco_unit || 0)), 0);
    }
    const el = document.getElementById('propostaTotal');
    if (el) el.innerText = fmtMoeda(total);
}

function renderItensProposta() {
    if (propostaAtual.proposta_versao === 3) {
        const containerV3 = document.getElementById('propostaItensCardsV3');
        if (!containerV3) return;

        containerV3.innerHTML = (propostaAtual.itens || []).map((it, idx) => {
            // Garante cálculos corretos ao renderizar
            const qtdKm = parseFloat(it.qtd_km) || 0;
            const margemPct = parseFloat(it.margem_km_pct) || 0;
            it.km_calculado = Math.round((qtdKm * (1 + (margemPct / 100))) * 100) / 100;
            const valorKm = parseFloat(it.valor_km) || 0;
            it.total_km_valor = Math.round((it.km_calculado * valorKm) * 100) / 100;
            const ped = parseFloat(it.pedagio) || 0;
            const esp = parseFloat(it.espera) || 0;
            const alm = parseFloat(it.alimentacao) || 0;
            const per = parseFloat(it.pernoite) || 0;
            const est = parseFloat(it.estacionamento) || 0;
            it.total_insumos = Math.round((ped + esp + alm + per + est) * 100) / 100;
            it.total_item = Math.round((it.total_km_valor + it.total_insumos) * 100) / 100;

            const veiculoSelect = `
                <div style="display:flex; gap:0.4rem; align-items:center;">
                    <select class="item-input v3-tipo-veiculo-select" data-idx="${idx}" onchange="handleTipoVeiculoChange(${idx}, this.value)" style="flex:1; height:36px; border-radius:8px; font-weight:700; color:var(--text-main); background:rgba(255,255,255,0.85); border:1px solid #cbd5e1;">
                        <option value="">Selecione o Veículo</option>
                        ${(config.tipos_veiculo || []).map(tv => `<option value="${tv.nome}" ${it.tipo_veiculo === tv.nome ? 'selected' : ''}>${tv.nome}</option>`).join('')}
                        <option value="__ADD_NOVO__" style="color:var(--primary); font-weight:800;">+ Adicionar novo tipo...</option>
                    </select>
                    <button type="button" class="btn-quick-add-tv" onclick="abrirModalRapidoTipoVeiculo(${idx})" title="Cadastrar novo Tipo de Veículo" style="height:36px; width:36px; min-width:36px; display:inline-flex; align-items:center; justify-content:center; border-radius:8px; border:1px solid rgba(45,158,107,0.35); background:rgba(45,158,107,0.12); color:#2d9e6b; cursor:pointer; font-weight:bold; transition:all 0.2s;">
                        <i data-lucide="plus" style="width:16px; height:16px;"></i>
                    </button>
                </div>
            `;

            return `
                <div class="v3-card" data-idx="${idx}" style="background:#ffffff; border:1px solid #cbd5e1; border-radius:12px; padding:1.2rem; margin-bottom:1rem; box-shadow:0 2px 6px rgba(0,0,0,0.03); transition:all 0.2s;">
                    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #f1f5f9; padding-bottom:0.75rem; margin-bottom:1rem;">
                        <div style="display:flex; align-items:center; gap:0.6rem;">
                            <span style="background:var(--primary); color:#fff; font-size:0.72rem; font-weight:900; padding:2px 8px; border-radius:6px;">ITEM ${idx + 1}</span>
                            <span style="font-size:0.85rem; font-weight:800; color:#1e293b;">Roteiro, Veículo & Insumos</span>
                        </div>
                        <button type="button" class="action-btn-mini" onclick="removeItemProposta(${idx})" title="Remover Item" style="color:#ef4444; border:1px solid rgba(239,68,68,0.25); background:rgba(239,68,68,0.05); border-radius:8px; padding:0.35rem 0.6rem; cursor:pointer;">
                            <i data-lucide="trash-2" style="width:14px; height:14px;"></i>
                        </button>
                    </div>

                    <!-- Linha 1: Origem, Destino e Tipo Veículo -->
                    <div style="display:grid; grid-template-columns: 1fr 1fr 230px; gap:0.8rem; margin-bottom:0.9rem;">
                        <div>
                            <label style="font-size:0.68rem; font-weight:800; color:#64748b; text-transform:uppercase; margin-bottom:0.25rem; display:block;">Origem</label>
                            <input class="item-input" type="text" placeholder="Ex: Resende / RJ" value="${(it.origem || '').replace(/"/g, '&quot;')}" oninput="updateItemPropostaV3(${idx}, 'origem', this.value)" style="width:100%; height:36px; border-radius:8px; border:1px solid #cbd5e1; padding:0 0.75rem; font-size:0.82rem;">
                        </div>
                        <div>
                            <label style="font-size:0.68rem; font-weight:800; color:#64748b; text-transform:uppercase; margin-bottom:0.25rem; display:block;">Destino</label>
                            <input class="item-input" type="text" placeholder="Ex: São Bernardo do Campo / SP" value="${(it.destino || '').replace(/"/g, '&quot;')}" oninput="updateItemPropostaV3(${idx}, 'destino', this.value)" style="width:100%; height:36px; border-radius:8px; border:1px solid #cbd5e1; padding:0 0.75rem; font-size:0.82rem;">
                        </div>
                        <div>
                            <label style="font-size:0.68rem; font-weight:800; color:#64748b; text-transform:uppercase; margin-bottom:0.25rem; display:block;">Tipo de Veículo</label>
                            ${veiculoSelect}
                        </div>
                    </div>

                    <!-- Linha 2: KM, % Margem KM, KM Calculado e Valor KM -->
                    <div style="display:grid; grid-template-columns: 140px 140px 160px 150px; gap:0.8rem; margin-bottom:0.9rem; background:#f8fafc; padding:0.85rem; border-radius:10px; border:1px solid #e2e8f0; align-items:center;">
                        <div>
                            <label style="font-size:0.68rem; font-weight:800; color:#475569; text-transform:uppercase; margin-bottom:0.25rem; display:block;">Qtd em KM</label>
                            <input class="item-input" type="number" min="0" step="0.1" placeholder="Ex: 332" value="${it.qtd_km || ''}" oninput="updateItemPropostaV3(${idx}, 'qtd_km', this.value)" style="width:100%; height:34px; border-radius:8px; border:1px solid #cbd5e1; padding:0 0.6rem; font-weight:700; text-align:right;">
                        </div>
                        <div>
                            <label style="font-size:0.68rem; font-weight:800; color:#475569; text-transform:uppercase; margin-bottom:0.25rem; display:block;">% Margem KM</label>
                            <div style="position:relative;">
                                <input class="item-input" type="number" min="0" step="1" placeholder="Ex: 10" value="${it.margem_km_pct || ''}" oninput="updateItemPropostaV3(${idx}, 'margem_km_pct', this.value)" style="width:100%; height:34px; border-radius:8px; border:1px solid #cbd5e1; padding:0 1.5rem 0 0.6rem; font-weight:700; text-align:right;">
                                <span style="position:absolute; right:0.55rem; top:50%; transform:translateY(-50%); font-size:0.75rem; font-weight:800; color:#64748b;">%</span>
                            </div>
                        </div>
                        <div>
                            <label style="font-size:0.68rem; font-weight:800; color:#2d9e6b; text-transform:uppercase; margin-bottom:0.25rem; display:block;">KM c/ Margem</label>
                            <div class="v3-km-calculado-display" style="height:34px; display:flex; align-items:center; justify-content:center; background:#e8f7ee; border:1px solid #a7f3d0; border-radius:8px; font-weight:900; font-size:0.85rem; color:#065f46; font-family:'JetBrains Mono',monospace;">
                                ${it.km_calculado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} KM
                            </div>
                        </div>
                        <div>
                            <label style="font-size:0.68rem; font-weight:800; color:#475569; text-transform:uppercase; margin-bottom:0.25rem; display:block;">Valor KM Rodado</label>
                            <input class="item-input" type="number" min="0" step="0.01" placeholder="R$ 0,00" value="${it.valor_km || ''}" oninput="updateItemPropostaV3(${idx}, 'valor_km', this.value)" style="width:100%; height:34px; border-radius:8px; border:1px solid #cbd5e1; padding:0 0.6rem; font-weight:700; text-align:right;">
                        </div>
                    </div>

                    <!-- Linha 3: Insumos (Pedágio, Espera, Alimentação, Pernoite, Estacionamento) -->
                    <div style="margin-bottom:0.9rem;">
                        <label style="font-size:0.68rem; font-weight:800; color:#64748b; text-transform:uppercase; margin-bottom:0.35rem; display:block;">Insumos da Viagem (Valores em R$)</label>
                        <div style="display:grid; grid-template-columns: repeat(5, 1fr); gap:0.6rem;">
                            <div>
                                <span style="font-size:0.64rem; font-weight:700; color:#64748b; display:block; margin-bottom:0.2rem;">Pedágio</span>
                                <input class="item-input" type="number" min="0" step="0.01" placeholder="0,00" value="${it.pedagio || ''}" oninput="updateItemPropostaV3(${idx}, 'pedagio', this.value)" style="width:100%; height:32px; border-radius:6px; border:1px solid #cbd5e1; padding:0 0.5rem; text-align:right; font-size:0.78rem;">
                            </div>
                            <div>
                                <span style="font-size:0.64rem; font-weight:700; color:#64748b; display:block; margin-bottom:0.2rem;">Espera</span>
                                <input class="item-input" type="number" min="0" step="0.01" placeholder="0,00" value="${it.espera || ''}" oninput="updateItemPropostaV3(${idx}, 'espera', this.value)" style="width:100%; height:32px; border-radius:6px; border:1px solid #cbd5e1; padding:0 0.5rem; text-align:right; font-size:0.78rem;">
                            </div>
                            <div>
                                <span style="font-size:0.64rem; font-weight:700; color:#64748b; display:block; margin-bottom:0.2rem;">Alimentação</span>
                                <input class="item-input" type="number" min="0" step="0.01" placeholder="0,00" value="${it.alimentacao || ''}" oninput="updateItemPropostaV3(${idx}, 'alimentacao', this.value)" style="width:100%; height:32px; border-radius:6px; border:1px solid #cbd5e1; padding:0 0.5rem; text-align:right; font-size:0.78rem;">
                            </div>
                            <div>
                                <span style="font-size:0.64rem; font-weight:700; color:#64748b; display:block; margin-bottom:0.2rem;">Pernoite</span>
                                <input class="item-input" type="number" min="0" step="0.01" placeholder="0,00" value="${it.pernoite || ''}" oninput="updateItemPropostaV3(${idx}, 'pernoite', this.value)" style="width:100%; height:32px; border-radius:6px; border:1px solid #cbd5e1; padding:0 0.5rem; text-align:right; font-size:0.78rem;">
                            </div>
                            <div>
                                <span style="font-size:0.64rem; font-weight:700; color:#64748b; display:block; margin-bottom:0.2rem;">Estacionamento</span>
                                <input class="item-input" type="number" min="0" step="0.01" placeholder="0,00" value="${it.estacionamento || ''}" oninput="updateItemPropostaV3(${idx}, 'estacionamento', this.value)" style="width:100%; height:32px; border-radius:6px; border:1px solid #cbd5e1; padding:0 0.5rem; text-align:right; font-size:0.78rem;">
                            </div>
                        </div>
                    </div>

                    <!-- Rodapé do Card com os 3 Totais em Destaque -->
                    <div style="display:flex; justify-content:space-between; align-items:center; background:#f1f5f9; padding:0.7rem 1.1rem; border-radius:8px; border:1px solid #e2e8f0; flex-wrap:wrap; gap:0.6rem;">
                        <div style="display:flex; align-items:center; gap:1.5rem; font-size:0.75rem;">
                            <div>
                                <span style="color:#64748b; font-weight:700;">Valor total por KM: </span>
                                <strong class="v3-subtotal-km-display" style="color:#1e293b; font-family:'JetBrains Mono',monospace;">${fmtMoeda(it.total_km_valor)}</strong>
                            </div>
                            <span style="color:#cbd5e1;">|</span>
                            <div>
                                <span style="color:#64748b; font-weight:700;">Valor total Insumos: </span>
                                <strong class="v3-subtotal-insumos-display" style="color:#1e293b; font-family:'JetBrains Mono',monospace;">${fmtMoeda(it.total_insumos)}</strong>
                            </div>
                        </div>
                        <div style="font-size:0.82rem;">
                            <span style="color:#065f46; font-weight:800;">Total do Item: </span>
                            <strong class="v3-total-item-display" style="color:#2d9e6b; font-size:1.05rem; font-weight:900; font-family:'JetBrains Mono',monospace;">${fmtMoeda(it.total_item)}</strong>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        calcularTotalProposta();
        if (window.lucide) lucide.createIcons();
        return;
    }

    const tbody = document.getElementById('propostaItensBody');
    if (!tbody) return;

    if (propostaAtual.proposta_versao === 2) {
        tbody.innerHTML = (propostaAtual.itens || []).map((item, idx) => {
            const valorVeiculo = (item.total_km || 0) * (item.valor_km || 0);
            const total = valorVeiculo * (item.qtd_veiculos || 1) * (item.habilitar_volta ? 2 : 1);
            return `
                <tr data-idx="${idx}">
                    <td style="text-align:center;font-weight:800;color:var(--primary);font-size:0.75rem;">${idx + 1}</td>
                    <td><input class="item-input" type="text" placeholder="Origem"
                        value="${(item.origem || '').replace(/"/g, '&quot;')}"
                        oninput="updateItemProposta(${idx},'origem',this.value)"></td>
                    <td><input class="item-input" type="text" placeholder="Destino"
                        value="${(item.destino || '').replace(/"/g, '&quot;')}"
                        oninput="updateItemProposta(${idx},'destino',this.value)"></td>
                    <td><input class="item-input" type="number" placeholder="1" min="1" style="width: 65px; text-align: right;"
                        value="${item.qtd_veiculos ?? 1}"
                        oninput="updateItemProposta(${idx},'qtd_veiculos',this.value)"></td>
                    <td><input class="item-input" type="number" placeholder="0" min="0" style="width: 70px; text-align: right;"
                        value="${item.total_km || ''}"
                        oninput="updateItemProposta(${idx},'total_km',this.value)"></td>
                    <td><input class="item-input" type="number" placeholder="0,00" min="0" step="0.01" style="width: 75px; text-align: right;"
                        value="${item.valor_km || ''}"
                        oninput="updateItemProposta(${idx},'valor_km',this.value)"></td>
                    <td class="row-veiculo-val" style="font-weight:600;font-size:0.73rem;color:var(--text-muted);text-align:right;padding-right:0.4rem;white-space:nowrap;">
                        ${fmtMoeda(valorVeiculo)}
                    </td>
                    <td style="text-align:center;">
                        <input type="checkbox" ${item.habilitar_volta ? 'checked' : ''} 
                            onchange="updateItemProposta(${idx},'habilitar_volta',this.checked)"
                            style="cursor:pointer; width:15px; height:15px; accent-color:var(--primary);">
                    </td>
                    <td class="row-total-val" style="font-weight:700;font-size:0.74rem;color:#fff;white-space:nowrap;text-align:right;padding-right:0.4rem;">
                        ${fmtMoeda(total)}
                    </td>
                    <td style="text-align:right;"><button class="btn-remove-item" onclick="removeItemProposta(${idx})" title="Remover">
                        <i data-lucide="trash-2" style="width:12px;"></i>
                    </button></td>
                </tr>
            `;
        }).join('');
    } else {
        tbody.innerHTML = (propostaAtual.itens || []).map((item, idx) => `
            <tr data-idx="${idx}">
                <td style="text-align:center;font-weight:800;color:var(--primary);font-size:0.75rem;">${idx + 1}</td>
                <td><input class="item-input" type="text" placeholder="Descrição do serviço/produto"
                    value="${(item.descricao || '').replace(/"/g, '&quot;')}"
                    oninput="updateItemProposta(${idx},'descricao',this.value)"></td>
                <td><input class="item-input" type="text" placeholder="KM, Hrs, Un"
                    value="${(item.unidade || '').replace(/"/g, '&quot;')}"
                    oninput="updateItemProposta(${idx},'unidade',this.value)"></td>
                <td><input class="item-input" type="number" placeholder="0" min="0" style="width: 70px; text-align: right;"
                    value="${item.quantidade || ''}"
                    oninput="updateItemProposta(${idx},'quantidade',this.value)"></td>
                <td><input class="item-input" type="number" placeholder="0,00" min="0" step="0.01" style="width: 85px; text-align: right;"
                    value="${item.preco_unit || ''}"
                    oninput="updateItemProposta(${idx},'preco_unit',this.value)"></td>
                <td class="row-total-val" style="font-weight:700;font-size:0.74rem;color:#fff;white-space:nowrap;text-align:right;padding-right:0.4rem;">
                    ${fmtMoeda((item.quantidade || 0) * (item.preco_unit || 0))}
                </td>
                <td style="text-align:right;"><button class="btn-remove-item" onclick="removeItemProposta(${idx})" title="Remover">
                    <i data-lucide="trash-2" style="width:12px;"></i>
                </button></td>
            </tr>
        `).join('');
    }

    calcularTotalProposta();
}

// Carrega itens do banco → propostaAtual.itens
async function loadItensProposta(contratoId) {
    const { data, error } = await supabaseClient
        .from('com_proposta_itens')
        .select('*')
        .eq('contrato_id', contratoId)
        .order('ordem', { ascending: true });

    if (error) throw error;
    
    const formatted = data && data.length > 0 ? data.map(item => {
        let v3Parsed = null;
        if (item.descricao && item.descricao.startsWith('{') && item.descricao.endsWith('}')) {
            try { v3Parsed = JSON.parse(item.descricao); } catch(e){}
        }
        return {
            id: item.id,
            descricao: item.descricao || '',
            unidade: item.unidade || '',
            quantidade: item.quantidade || 0,
            preco_unit: item.preco_unit || 0,
            origem: item.origem || v3Parsed?.origem || '',
            destino: item.destino || v3Parsed?.destino || '',
            qtd_veiculos: item.qtd_veiculos || 1,
            total_km: item.total_km || v3Parsed?.km_calculado || 0,
            valor_km: item.valor_km || v3Parsed?.valor_km || 0,
            valor_veiculo: item.valor_veiculo || v3Parsed?.total_km_valor || 0,
            habilitar_volta: !!item.habilitar_volta,
            // Campos V3
            tipo_veiculo: v3Parsed?.tipo_veiculo || (config.tipos_veiculo && config.tipos_veiculo[0]?.nome) || 'Van',
            qtd_km: v3Parsed?.qtd_km ?? (item.total_km || 0),
            margem_km_pct: v3Parsed?.margem_km_pct ?? 0,
            km_calculado: v3Parsed?.km_calculado ?? (item.total_km || 0),
            pedagio: v3Parsed?.pedagio ?? 0,
            espera: v3Parsed?.espera ?? 0,
            alimentacao: v3Parsed?.alimentacao ?? 0,
            pernoite: v3Parsed?.pernoite ?? 0,
            estacionamento: v3Parsed?.estacionamento ?? 0,
            total_km_valor: v3Parsed?.total_km_valor ?? 0,
            total_insumos: v3Parsed?.total_insumos ?? 0,
            total_item: v3Parsed?.total_item ?? 0
        };
    }) : [];

    const defaultV1 = [{ id: null, descricao: '', unidade: '', quantidade: 0, preco_unit: 0 }];
    const defaultV2 = [{
        id: null,
        origem: '',
        destino: '',
        qtd_veiculos: 1,
        total_km: 0,
        valor_km: 0,
        valor_veiculo: 0,
        habilitar_volta: false
    }];
    const defaultV3 = [{
        id: null,
        origem: '',
        destino: '',
        tipo_veiculo: (config.tipos_veiculo && config.tipos_veiculo[0]?.nome) || 'Van',
        qtd_km: 0,
        margem_km_pct: 0,
        km_calculado: 0,
        valor_km: 0,
        pedagio: 0,
        espera: 0,
        alimentacao: 0,
        pernoite: 0,
        estacionamento: 0,
        total_km_valor: 0,
        total_insumos: 0,
        total_item: 0
    }];

    if (propostaAtual.proposta_versao === 3) {
        propostaAtual.itens_v3 = formatted.length > 0 ? formatted : defaultV3;
        propostaAtual.itens_v1 = defaultV1;
        propostaAtual.itens_v2 = defaultV2;
        propostaAtual.itens = propostaAtual.itens_v3;
    } else if (propostaAtual.proposta_versao === 2) {
        propostaAtual.itens_v2 = formatted.length > 0 ? formatted : defaultV2;
        propostaAtual.itens_v1 = defaultV1;
        propostaAtual.itens_v3 = defaultV3;
        propostaAtual.itens = propostaAtual.itens_v2;
    } else {
        propostaAtual.itens_v1 = formatted.length > 0 ? formatted : defaultV1;
        propostaAtual.itens_v2 = defaultV2;
        propostaAtual.itens_v3 = defaultV3;
        propostaAtual.itens = propostaAtual.itens_v1;
    }
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

    const curStatusId = document.getElementById('status_id')?.value;
    const curStatusObj = config.status.find(s => s.id === curStatusId);
    const statusNome = curStatusObj ? curStatusObj.nome.toUpperCase() : '';
    const statusNorm = curStatusObj ? curStatusObj.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() : '';

    const badge = document.getElementById('propostaStatusBadge');
    if (badge) {
        if (statusNorm.includes('CANCELADO')) {
            badge.className = 'proposta-status-badge badge-cancelado';
            badge.innerText = 'CANCELADO';
            badge.style.background = 'rgba(239, 68, 68, 0.12)';
            badge.style.color = '#ef4444';
            badge.style.border = '1px solid rgba(239, 68, 68, 0.3)';
        } else if (statusNorm.includes('VENCIDO')) {
            badge.className = 'proposta-status-badge badge-vencido';
            badge.innerText = 'VENCIDO';
            badge.style.background = 'rgba(245, 158, 11, 0.12)';
            badge.style.color = '#f59e0b';
            badge.style.border = '1px solid rgba(245, 158, 11, 0.3)';
        } else if (statusNorm.includes('REVISAO')) {
            badge.className = 'proposta-status-badge badge-revisao';
            badge.innerText = 'REVISÃO';
            badge.style.background = 'rgba(168, 85, 247, 0.12)';
            badge.style.color = '#a855f7';
            badge.style.border = '1px solid rgba(168, 85, 247, 0.3)';
        } else if (statusNorm.includes('FINALIZADO')) {
            badge.className = 'proposta-status-badge badge-finalizado';
            badge.innerText = 'FINALIZADO';
            badge.style.background = 'rgba(100, 116, 139, 0.12)';
            badge.style.color = '#64748b';
            badge.style.border = '1px solid rgba(100, 116, 139, 0.3)';
        } else {
            badge.removeAttribute('style');
            badge.className = `proposta-status-badge ${badgeClasses[step] || 'badge-aberta'}`;
            badge.innerText = badgeLabels[step] || 'PROPOSTA ABERTA';
        }
    }

    const btnTexto  = document.getElementById('btnAvancarTexto');
    const btnAvancar = document.getElementById('btnAvancarProposta');
    const btnGerar   = document.getElementById('btnGerarDocumentoProposta');

    if (btnTexto) {
        if (statusNorm.includes('CANCELADO') || statusNorm.includes('FINALIZADO') || statusNorm.includes('VENCIDO')) {
            btnTexto.innerText = statusNome;
        } else {
            btnTexto.innerText = avancarTextos[step] || 'Avançar Etapa';
        }
    }

    if (btnAvancar) {
        if (!propostaAtual.propostaId) {
            btnAvancar.disabled      = true;
            btnAvancar.style.opacity = '0.5';
            btnAvancar.style.cursor  = 'default';
            btnAvancar.title         = 'Salve a proposta primeiro';
        } else if (statusNorm.includes('CANCELADO') || statusNorm.includes('FINALIZADO') || statusNorm.includes('VENCIDO')) {
            btnAvancar.disabled      = true;
            btnAvancar.style.opacity = '0.5';
            btnAvancar.style.cursor  = 'default';
            btnAvancar.title         = `Contrato com status ${statusNome}`;
        } else {
            btnAvancar.disabled      = step >= 2;
            btnAvancar.style.opacity = step >= 2 ? '0.6' : '1';
            btnAvancar.style.cursor  = step >= 2 ? 'default' : 'pointer';
            btnAvancar.title         = step >= 2 ? 'Proposta já aprovada / Contrato ativo' : '';
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
        secaoContrato.style.display = (step === 2 || statusNorm.includes('ATIVO') || statusNorm.includes('CONTRATO') || statusNorm.includes('FINALIZADO') || statusNorm.includes('VENCIDO')) ? '' : 'none';
    }

    if (window.lucide) lucide.createIcons();
}

function getHistoryIconName(label) {
    if (!label) return 'clock';
    const l = label.toLowerCase();
    if (l.includes('criado') || l.includes('aberta') || l.includes('inclusão')) return 'file-plus';
    if (l.includes('análise') || l.includes('analise')) return 'search';
    if (l.includes('aprovad') || l.includes('ativo')) return 'check-circle-2';
    if (l.includes('alter') || l.includes('atualiz') || l.includes('revisão')) return 'edit-3';
    if (l.includes('cancel')) return 'x-circle';
    return 'clock';
}

function formatHistoryDateTime(createdAt, dataFallback) {
    if (createdAt) {
        try {
            const dt = new Date(createdAt);
            if (!isNaN(dt.getTime())) {
                const dia = String(dt.getDate()).padStart(2, '0');
                const mes = String(dt.getMonth() + 1).padStart(2, '0');
                const ano = dt.getFullYear();
                const hora = String(dt.getHours()).padStart(2, '0');
                const min = String(dt.getMinutes()).padStart(2, '0');
                return `${dia}/${mes}/${ano} às ${hora}:${min}`;
            }
        } catch (_) {}
    }
    return fmtDataBR(dataFallback);
}

function formatHistoryLabel(label) {
    if (!label) return '';
    let result = '';
    
    // Check if there is "Alterações:" in the label
    let mainText = label;
    let autorText = '';
    let motivoText = '';
    let alteracoesText = '';
    
    if (label.includes('\n\nAlterações:\n')) {
        const parts = label.split('\n\nAlterações:\n');
        mainText = parts[0];
        alteracoesText = parts[1];
    } else if (label.includes('\nAlterações:\n')) {
        const parts = label.split('\nAlterações:\n');
        mainText = parts[0];
        alteracoesText = parts[1];
    }
    
    if (mainText.includes('\nPor:')) {
        const parts = mainText.split('\nPor:');
        mainText = parts[0];
        autorText = parts[1];
    }

    if (mainText.includes('\nMotivo:')) {
        const parts = mainText.split('\nMotivo:');
        mainText = parts[0];
        motivoText = parts[1];
    } else if (autorText && autorText.includes('\nMotivo:')) {
        const parts = autorText.split('\nMotivo:');
        autorText = parts[0];
        motivoText = parts[1];
    }
    
    result = `<span class="historico-title-text">${mainText}</span>`;
    
    if (autorText) {
        result += `
            <div class="historico-autor-badge">
                <i data-lucide="user-check" style="width:13px;height:13px;"></i>
                <span>Por: <strong>${autorText.trim()}</strong></span>
            </div>
        `;
    }

    if (motivoText) {
        result += `
            <div class="historico-motivo-box">
                <strong>Motivo:</strong> ${motivoText.trim()}
            </div>
        `;
    }
    
    if (alteracoesText) {
        // Format each line as an item
        const lines = alteracoesText.split('\n').map(l => `<div style="margin-bottom: 4px; line-height: 1.4;">${l}</div>`).join('');
        result += `
            <div class="historico-alteracoes-box">
                <strong><i data-lucide="list-checks" style="width:14px;"></i> O que foi alterado exatamente:</strong>
                ${lines}
            </div>
        `;
    }
    
    return result;
}

function detectarAlteracoesHeader(oldH, newH) {
    const alteracoes = [];
    const fieldsMap = {
        cliente_nome: 'Cliente',
        cliente_cnpj_cpf: 'CNPJ/CPF',
        cliente_email: 'Email',
        cliente_telefone: 'Telefone',
        nome_responsavel: 'Responsável',
        contato_responsavel: 'Contato do Responsável',
        descricao_contrato: 'Descrição do Contrato',
        versao_contrato: 'Versão do Contrato',
        referencia: 'Referência',
        vigencia: 'Vigência',
        tipo_demanda_id: 'Tipo de Demanda',
        tabela_preco_id: 'Tabela de Preço',
        data_assinatura: 'Data de Assinatura',
        prazo_meses: 'Prazo (meses)',
        data_vencimento: 'Data de Vencimento',
        observacao: 'Observação do Contrato',
        objeto_proposta: 'Objeto da Proposta',
        endereco_proposta: 'Endereço da Proposta',
        cep_proposta: 'CEP da Proposta',
        contato_proposta: 'Contato da Proposta',
        assinatura_proposta: 'Assinatura da Proposta',
        data_proposta: 'Data da Proposta',
        validade_dias: 'Validade (dias)',
        data_validade: 'Data de Validade',
        periodo_medicao: 'Período de Medição',
        forma_pagamento: 'Forma de Pagamento',
        observacoes_proposta: 'Observações da Proposta'
    };

    const phoneOrCnpjKeys = ['cliente_cnpj_cpf', 'cliente_telefone', 'contato_responsavel'];

    for (const key in fieldsMap) {
        let oldVal = oldH[key];
        let newVal = newH[key];
        
        // Normaliza nulos/indefinidos
        if (oldVal === undefined || oldVal === null) oldVal = '';
        if (newVal === undefined || newVal === null) newVal = '';

        const strOld = String(oldVal).trim();
        const strNew = String(newVal).trim();

        // Se for telefone ou CNPJ/CPF, compara apenas os dígitos numéricos
        if (phoneOrCnpjKeys.includes(key)) {
            const digitsOld = strOld.replace(/\D/g, '');
            const digitsNew = strNew.replace(/\D/g, '');
            if (digitsOld === digitsNew) continue;
        } else {
            if (strOld === strNew) continue;
        }

        alteracoes.push(`- Alterou ${fieldsMap[key]} de "${strOld || 'vazio'}" para "${strNew || 'vazio'}"`);
    }
    return alteracoes;
}

function detectarAlteracoesItens(oldItens, newItens, versao) {
    const alteracoes = [];
    const maxLen = Math.max(oldItens.length, newItens.length);
    
    for (let i = 0; i < maxLen; i++) {
        const oldIt = oldItens[i];
        const newIt = newItens[i];
        
        if (!oldIt && newIt) {
            if (versao === 3) {
                alteracoes.push(`- Adicionou Item ${i + 1}: ${newIt.origem || 'vazio'} ➔ ${newIt.destino || 'vazio'} (${newIt.tipo_veiculo || 'Veículo'}, ${newIt.km_calculado || newIt.qtd_km || 0} KM, R$ ${newIt.valor_km || 0}/KM)`);
            } else if (versao === 2) {
                alteracoes.push(`- Adicionou Item ${i + 1}: ${newIt.origem || 'vazio'} x ${newIt.destino || 'vazio'} (${newIt.qtd_veiculos} veíc., ${newIt.total_km} KM, R$ ${newIt.valor_km}/KM)`);
            } else {
                alteracoes.push(`- Adicionou Item ${i + 1}: ${newIt.descricao || 'vazio'} (${newIt.quantidade} ${newIt.unidade || 'un'}, R$ ${newIt.preco_unit}/un)`);
            }
        } else if (oldIt && !newIt) {
            if (versao === 3) {
                alteracoes.push(`- Removeu Item ${i + 1}: ${oldIt.origem || 'vazio'} ➔ ${oldIt.destino || 'vazio'}`);
            } else if (versao === 2) {
                alteracoes.push(`- Removeu Item ${i + 1}: ${oldIt.origem || 'vazio'} x ${oldIt.destino || 'vazio'}`);
            } else {
                alteracoes.push(`- Removeu Item ${i + 1}: ${oldIt.descricao || 'vazio'}`);
            }
        } else if (oldIt && newIt) {
            const itemDiffs = [];
            if (versao === 3) {
                if (oldIt.origem !== newIt.origem) itemDiffs.push(`origem de "${oldIt.origem || 'vazio'}" para "${newIt.origem || 'vazio'}"`);
                if (oldIt.destino !== newIt.destino) itemDiffs.push(`destino de "${oldIt.destino || 'vazio'}" para "${newIt.destino || 'vazio'}"`);
                if (oldIt.tipo_veiculo !== newIt.tipo_veiculo) itemDiffs.push(`veículo de "${oldIt.tipo_veiculo || 'vazio'}" para "${newIt.tipo_veiculo || 'vazio'}"`);
                if (Number(oldIt.qtd_km) !== Number(newIt.qtd_km)) itemDiffs.push(`KM de "${oldIt.qtd_km || 0}" para "${newIt.qtd_km || 0}"`);
                if (Number(oldIt.margem_km_pct) !== Number(newIt.margem_km_pct)) itemDiffs.push(`margem de "${oldIt.margem_km_pct || 0}%" para "${newIt.margem_km_pct || 0}%"`);
                if (Number(oldIt.valor_km) !== Number(newIt.valor_km)) itemDiffs.push(`valor KM de "R$ ${oldIt.valor_km || 0}" para "R$ ${newIt.valor_km || 0}"`);
            } else if (versao === 2) {
                if (oldIt.origem !== newIt.origem) itemDiffs.push(`origem de "${oldIt.origem || 'vazio'}" para "${newIt.origem || 'vazio'}"`);
                if (oldIt.destino !== newIt.destino) itemDiffs.push(`destino de "${oldIt.destino || 'vazio'}" para "${newIt.destino || 'vazio'}"`);
                if (Number(oldIt.qtd_veiculos) !== Number(newIt.qtd_veiculos)) itemDiffs.push(`qtd. veículos de "${oldIt.qtd_veiculos || 0}" para "${newIt.qtd_veiculos || 0}"`);
                if (Number(oldIt.total_km) !== Number(newIt.total_km)) itemDiffs.push(`total KM de "${oldIt.total_km || 0}" para "${newIt.total_km || 0}"`);
                if (Number(oldIt.valor_km) !== Number(newIt.valor_km)) itemDiffs.push(`valor por KM de "R$ ${oldIt.valor_km || 0}" para "R$ ${newIt.valor_km || 0}"`);
                if (!!oldIt.habilitar_volta !== !!newIt.habilitar_volta) itemDiffs.push(`ida e volta de "${oldIt.habilitar_volta ? 'sim' : 'não'}" para "${newIt.habilitar_volta ? 'sim' : 'não'}"`);
            } else {
                if (oldIt.descricao !== newIt.descricao) itemDiffs.push(`descrição de "${oldIt.descricao || 'vazio'}" para "${newIt.descricao || 'vazio'}"`);
                if (oldIt.unidade !== newIt.unidade) itemDiffs.push(`unidade de "${oldIt.unidade || 'vazio'}" para "${newIt.unidade || 'vazio'}"`);
                if (Number(oldIt.quantidade) !== Number(newIt.quantidade)) itemDiffs.push(`quantidade de "${oldIt.quantidade || 0}" para "${newIt.quantidade || 0}"`);
                if (Number(oldIt.preco_unit) !== Number(newIt.preco_unit)) itemDiffs.push(`preço unitário de "R$ ${oldIt.preco_unit || 0}" para "R$ ${newIt.preco_unit || 0}"`);
            }
            if (itemDiffs.length > 0) {
                alteracoes.push(`- Item ${i + 1} alterou: ${itemDiffs.join(', ')}`);
            }
        }
    }
    return alteracoes;
}

function renderHistoricoProposta() {
    const container = document.getElementById('propostaHistoricoList');
    if (!container) return;

    if (propostaAtual.historico.length === 0) {
        container.innerHTML = `<div style="font-size:0.68rem;color:var(--text-muted);font-style:italic;">Nenhum registro ainda.</div>`;
        return;
    }

    container.innerHTML = propostaAtual.historico.map(h => {
        const dateStr = formatHistoryDateTime(h.created_at, h.data);
        return `
            <div class="history-entry">
                <div class="history-dot"></div>
                <div class="history-text">
                    ${formatHistoryLabel(h.label)}
                    <div style="font-size:0.65rem; color:var(--text-muted); margin-top:3px; font-weight:600;">${dateStr}</div>
                </div>
            </div>
        `;
    }).join('');
    if (window.lucide) lucide.createIcons();
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
        const currentUserLabel = getCurrentUserDisplayName();
        const { data: inserted, error } = await supabaseClient
            .from('com_proposta_historico')
            .insert([{
                contrato_id: contratoId,
                step: propostaAtual.step,
                label: `${txt}\nPor: ${currentUserLabel}`,
                data: dataAtualISO()
            }])
            .select()
            .single();

        if (error) throw error;

        if (window.registrarLog) {
            window.registrarLog('comercial', 'INCLUSÃO', `Adicionou observação manual no histórico da proposta ID ${contratoId}: "${txt}"`);
        }

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
        observacoes_proposta: document.getElementById('prop_observacoes')?.value     || '',
        proposta_versao:      propostaAtual.proposta_versao || 1
    };

    const { error: errUpdate } = await supabaseClient
        .from('com_contratos')
        .update(payload)
        .eq('id', contratoId);

    if (errUpdate) throw errUpdate;

    // Deleta itens antigos e re-insere
    await supabaseClient.from('com_proposta_itens').delete().eq('contrato_id', contratoId);

    const validItens = (propostaAtual.itens || []).filter(it => {
        if (propostaAtual.proposta_versao === 3) {
            return (it.origem && it.origem.trim()) || (it.destino && it.destino.trim()) || (it.qtd_km > 0) || (it.valor_km > 0) || (it.pedagio > 0) || (it.espera > 0) || (it.alimentacao > 0) || (it.pernoite > 0) || (it.estacionamento > 0);
        } else if (propostaAtual.proposta_versao === 2) {
            return (it.origem && it.origem.trim()) || (it.destino && it.destino.trim()) || (it.qtd_veiculos > 0) || (it.total_km > 0);
        } else {
            return (it.descricao && it.descricao.trim()) || (it.unidade && it.unidade.trim()) || (it.quantidade > 0) || (it.preco_unit > 0);
        }
    });

    if (validItens.length > 0) {
        const itensPayload = validItens.map((it, idx) => {
            if (propostaAtual.proposta_versao === 3) {
                const qtdKm = parseFloat(it.qtd_km) || 0;
                const margemPct = parseFloat(it.margem_km_pct) || 0;
                const kmCalc = Math.round((qtdKm * (1 + (margemPct / 100))) * 100) / 100;
                const vKm = parseFloat(it.valor_km) || 0;
                const totKmVal = Math.round((kmCalc * vKm) * 100) / 100;
                const ped = parseFloat(it.pedagio) || 0;
                const esp = parseFloat(it.espera) || 0;
                const alm = parseFloat(it.alimentacao) || 0;
                const per = parseFloat(it.pernoite) || 0;
                const est = parseFloat(it.estacionamento) || 0;
                const totIns = Math.round((ped + esp + alm + per + est) * 100) / 100;
                const totItem = Math.round((totKmVal + totIns) * 100) / 100;

                const v3Data = {
                    tipo_veiculo: it.tipo_veiculo || '',
                    qtd_km: qtdKm,
                    margem_km_pct: margemPct,
                    km_calculado: kmCalc,
                    valor_km: vKm,
                    pedagio: ped,
                    espera: esp,
                    alimentacao: alm,
                    pernoite: per,
                    estacionamento: est,
                    total_km_valor: totKmVal,
                    total_insumos: totIns,
                    total_item: totItem,
                    origem: it.origem || '',
                    destino: it.destino || ''
                };

                return {
                    contrato_id: contratoId,
                    ordem:       idx + 1,
                    descricao:   JSON.stringify(v3Data),
                    unidade:     'KM',
                    quantidade:  kmCalc || qtdKm || 1,
                    preco_unit:  vKm || 0,
                    origem:      it.origem     || '',
                    destino:     it.destino    || '',
                    qtd_veiculos: 1,
                    total_km:    kmCalc || qtdKm || 0,
                    valor_km:    vKm || 0,
                    valor_veiculo: totKmVal || 0,
                    habilitar_volta: false
                };
            } else if (propostaAtual.proposta_versao === 2) {
                const descRota = (it.origem && it.destino) ? `${it.origem} ➔ ${it.destino}` : (it.origem || it.destino || 'Rota Comercial');
                return {
                    contrato_id: contratoId,
                    ordem:       idx + 1,
                    descricao:   it.descricao || descRota,
                    unidade:     it.unidade || 'KM',
                    quantidade:  (it.quantidade !== null && it.quantidade !== undefined && it.quantidade > 0) ? it.quantidade : (it.total_km || 1),
                    preco_unit:  (it.preco_unit !== null && it.preco_unit !== undefined && it.preco_unit > 0) ? it.preco_unit : (it.valor_km || 0),
                    origem:      it.origem     || '',
                    destino:     it.destino    || '',
                    qtd_veiculos: it.qtd_veiculos || 1,
                    total_km:    it.total_km    || 0,
                    valor_km:    it.valor_km    || 0,
                    valor_veiculo: it.valor_veiculo || 0,
                    habilitar_volta: !!it.habilitar_volta
                };
            } else {
                return {
                    contrato_id: contratoId,
                    ordem:       idx + 1,
                    descricao:   it.descricao  || 'Item Proposta',
                    unidade:     it.unidade    || 'UN',
                    quantidade:  it.quantidade || 0,
                    preco_unit:  it.preco_unit || 0,
                    origem:      null,
                    destino:     null,
                    qtd_veiculos: null,
                    total_km:    null,
                    valor_km:    null,
                    valor_veiculo: null,
                    habilitar_volta: null
                };
            }
        });

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

    const motivo = prompt(`Informe o motivo para alterar a etapa para "${labels[novoStep]}":`);
    if (motivo === null) return;
    const motivoTr = motivo.trim();
    if (!motivoTr) {
        alert("O motivo da alteração é obrigatório.");
        return;
    }

    const btnAvancar = document.getElementById('btnAvancarProposta');
    if (btnAvancar) { btnAvancar.disabled = true; btnAvancar.style.opacity = '0.5'; }

    try {
        // Salva dados atuais primeiro
        propostaAtual.step = novoStep;
        await _persistirProposta();

        // Registra no histórico
        const currentUserLabel = getCurrentUserDisplayName();
        const { data: novoHist, error: errHist } = await supabaseClient
            .from('com_proposta_historico')
            .insert([{
                contrato_id: propostaAtual.contratoId,
                step:        novoStep,
                label:       `${labels[novoStep]}\nPor: ${currentUserLabel}\nMotivo: ${motivoTr}`,
                data:        dataAtualISO()
            }])
            .select()
            .single();

        if (errHist) throw errHist;
        propostaAtual.historico.unshift(novoHist);

        if (window.registrarLog) {
            window.registrarLog('comercial', 'ALTERAÇÃO', `Avançou proposta/contrato ID ${propostaAtual.contratoId} para etapa: ${labels[novoStep]}`);
        }

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
    const assinatura     = document.getElementById('prop_assinatura')?.value      || 'New Cargo Transporte e Logística Ltda';

    let totalGlobal = 0;
    let itensRows = '';

    const saudacao = contatoNome ? `Prezado(a) ${contatoNome},` : (clienteNome ? `Prezado(a) ${clienteNome},` : 'Prezado(a) Senhor(a),');

    const logoHtml = empresaLogoUrl
        ? `<img src="${empresaLogoUrl}" style="max-height: 55px; max-width: 220px; object-fit: contain;">`
        : `
            <div class="doc-logo-text" style="font-size:24pt; font-weight:bold; color:#107c41; font-style:italic; font-family: 'Times New Roman', Times, serif;">New Cargo</div>
            <div class="doc-logo-sub" style="font-size:9pt; color:#666; font-style:italic; font-family: Arial, sans-serif;">Transporte &amp; Logística</div>
        `;

    let html = '';

    // ================================================================
    // VERSÃO 3: PROPOSTA PARTICULAR (LAYOUT EXECUTIVO - PRINT 2)
    // ================================================================
    if (propostaAtual.proposta_versao === 3) {
        totalGlobal = (propostaAtual.itens || []).reduce((acc, it) => {
            const totItem = it.total_item ?? (((it.total_km_valor || 0) + (it.total_insumos || 0)));
            return acc + (totItem || 0);
        }, 0);

        const veiculosContagem = {};
        (propostaAtual.itens || []).forEach(it => {
            const tv = it.tipo_veiculo || 'Veículo Executivo';
            veiculosContagem[tv] = (veiculosContagem[tv] || 0) + 1;
        });
        const veiculosTexto = Object.entries(veiculosContagem)
            .map(([tv, count]) => `${String(count).padStart(2, '0')} ${tv}.`)
            .join('<br>') || '01 Veículo Executivo.';

        const roteiroListaHtml = (propostaAtual.itens || []).map(it => {
            const orig = it.origem || 'Origem';
            const dest = it.destino || 'Destino';
            return `<li style="margin-bottom: 4px;">${orig} =&gt; ${dest} (ida e retorno)</li>`;
        }).join('') || '<li>Origem =&gt; Destino (ida e retorno)</li>';

        html = `
            <div class="doc-header-top" style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1rem;">
                <div class="doc-logo-area" style="min-height:55px; display:flex; flex-direction:column;">
                    ${logoHtml}
                </div>
            </div>

            <div class="doc-title-block" style="text-align:center; margin-bottom:1.4rem;">
                <h2 style="font-size:12.5pt; font-weight:bold; letter-spacing:0.5px; text-transform:uppercase; margin:0; color:#1a2e25; font-family:Arial, sans-serif;">PROPOSTA DE PRESTAÇÃO DE SERVIÇOS</h2>
                <h3 style="font-size:11.5pt; font-weight:bold; letter-spacing:0.5px; text-transform:uppercase; margin:3px 0 0 0; color:#1a2e25; font-family:Arial, sans-serif;">TRANSPORTE EXECUTIVO DE PASSAGEIROS</h3>
            </div>

            <div style="margin-bottom:1.2rem; font-family:Arial, sans-serif; font-size:9.5pt; line-height:1.45; color:#000;">
                <p style="margin:0;">Resende/RJ, ${formatarDataExtenso(dataProposta)}</p>
                <p style="margin:2px 0 0 0; font-weight:bold;">New Cargo Transporte e Logística LTDA</p>
                <p style="margin:2px 0 0 0;">Rua Álvaro Pego de Farias, 137 - Paraíso, Resende – RJ</p>
                <p style="margin:2px 0 0 0;">CEP: 27535-060</p>
            </div>

            <p style="font-family:Arial, sans-serif; font-size:9.5pt; margin:1rem 0 0.5rem 0; font-weight:normal; color:#000;">${saudacao}</p>
            <p style="font-family:Arial, sans-serif; font-size:9.5pt; line-height:1.5; text-align:justify; margin-bottom:1.2rem; color:#000;">
                A New Cargo Transporte e Logística Ltda. tem a satisfação de apresentar sua proposta comercial para a prestação de serviços de transporte executivo, elaborada com base nas informações e requisitos previamente compartilhados por meio do Pedido de Cotação.
            </p>

            <div style="font-family:Arial, sans-serif; font-size:9.5pt; line-height:1.55; margin-bottom:1.2rem; color:#000;">
                <p style="margin:0 0 0.5rem 0;"><strong>Escopo do Atendimento:</strong><br>Tipo de Atendimento: À disposição</p>
                
                <p style="margin:0.6rem 0 0.4rem 0;"><strong>Veículos:</strong><br>${veiculosTexto}</p>
                
                <p style="margin:0.6rem 0 0.2rem 0;"><strong>Roteiro:</strong></p>
                <ul style="margin:0 0 0.6rem 1.4rem; padding:0;">
                    ${roteiroListaHtml}
                </ul>
                
                <p style="margin:0.6rem 0 0.2rem 0;"><strong>Valores:</strong></p>
                <ul style="margin:0 0 0.6rem 1.4rem; padding:0;">
                    <li>Valor da viagem: R$ ${totalGlobal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</li>
                </ul>
                
                <p style="margin:0.6rem 0 0.2rem 0;"><strong>Observação:</strong></p>
                <ul style="margin:0 0 0.6rem 1.4rem; padding:0;">
                    <li style="text-align:justify;">Por se tratar um atendimento á disposição, as horas de espera já estão contabilizadas no valor informado. Caso o atendimento ultrapasse o tempo de espera previsto, será cobrado um adicional de R$ 44,22 (quarenta e quatro reais e vinte e dois centavos), a partir de 45 minutos excedentes.</li>
                </ul>
                
                <p style="margin:0.6rem 0 0.2rem 0;"><strong>Condições de Pagamento:</strong></p>
                <ul style="margin:0 0 0.6rem 1.4rem; padding:0;">
                    <li>Cartão de Crédito ou Débito: pagamento antecipado, com envio do comprovante até 24 horas</li>
                </ul>
            </div>

            <p style="font-family:Arial, sans-serif; font-size:9.5pt; line-height:1.5; margin:1.2rem 0; text-align:justify; color:#000;">
                Permanecemos à disposição para quaisquer esclarecimentos adicionais e esperamos ter a oportunidade de estabelecer uma parceria sólida e duradoura.
            </p>

            <div style="margin-top:1.6rem; font-family:Arial, sans-serif; font-size:9.5pt; line-height:1.4; color:#000;">
                <p style="margin:0;">Atenciosamente,</p>
                <p style="margin:3px 0 0 0; font-weight:bold;">${assinatura || 'New Cargo Transporte e Logística Ltda'}</p>
            </div>

            <div class="doc-footer-bar" style="position:absolute; bottom:14mm; left:16mm; right:16mm; font-size:7.5pt; text-align:center; color:#fff; background:#107c41; border-radius:20px; padding:5px 12px; font-family:Arial, sans-serif;">
                Rua Álvaro Pego de Farias, 137 - Paraíso, Resende - RJ, 27535-060 | (24)3381-8000 | https://www.veritaslocacao.com.br | CNPJ: 19.737.004/0001-85
            </div>
            <div class="doc-page-num" style="position:absolute; bottom:7mm; right:16mm; font-size:8pt; color:#666; font-family:Arial, sans-serif;">Página 01 de 01</div>
        `;

    } else {
        // ================================================================
        // VERSÕES 1 E 2: PROPOSTAS CONVENCIONAIS (TABULARES)
        // ================================================================
        if (propostaAtual.proposta_versao === 2) {
            totalGlobal = (propostaAtual.itens || []).reduce((acc, it) => {
                const valorVeic = (it.total_km || 0) * (it.valor_km || 0);
                return acc + (valorVeic * (it.qtd_veiculos || 1) * (it.habilitar_volta ? 2 : 1));
            }, 0);

            itensRows = (propostaAtual.itens || []).map((it, idx) => {
                const valorVeiculo = (it.total_km || 0) * (it.valor_km || 0);
                const total = valorVeiculo * (it.qtd_veiculos || 1) * (it.habilitar_volta ? 2 : 1);
                return `<tr>
                    <td style="text-align:center;">${idx + 1}</td>
                    <td>
                        <strong>Origem:</strong> ${it.origem || '-'}<br>
                        <strong>Destino:</strong> ${it.destino || '-'}<br>
                        <span style="font-size: 8pt; color: #666;">
                            Rota: ${(it.total_km || 0).toLocaleString('pt-BR')} KM | 
                            Valor/KM: R$ ${(it.valor_km || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} 
                            ${it.habilitar_volta ? ' (Ida e Volta)' : ''}
                        </span>
                    </td>
                    <td style="text-align:center;">${(it.qtd_veiculos || 1).toLocaleString('pt-BR')} Veículo(s)</td>
                    <td>
                        <div style="display:flex; justify-content:space-between; width:100%; font-family:monospace; font-size:10pt;">
                            <span>R$</span>
                            <span>${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                    </td>
                </tr>`;
            }).join('');
        } else {
            totalGlobal = (propostaAtual.itens || []).reduce(
                (a, it) => a + ((it.quantidade || 0) * (it.preco_unit || 0)), 0
            );

            itensRows = (propostaAtual.itens || []).map((it, idx) => {
                const total = (it.quantidade || 0) * (it.preco_unit || 0);
                return `<tr>
                    <td style="text-align:center;">${idx + 1}</td>
                    <td>${it.descricao || '-'}</td>
                    <td style="text-align:center;">${(it.quantidade || 0).toLocaleString('pt-BR')} ${it.unidade || ''}</td>
                    <td>
                        <div style="display:flex; justify-content:space-between; width:100%; font-family:monospace; font-size:10pt;">
                            <span>R$</span>
                            <span>${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                    </td>
                </tr>`;
            }).join('');
        }

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

        const fixedIntro = 'A New Cargo Transporte e Logística Ltda. tem o prazer de apresentar a presente proposta comercial para a prestação de serviços de transporte executivo, conforme as condições e especificações descritas no Termo de Referência.';
        const objetoTexto = objeto ? `<p class="doc-intro" style="margin-top: 10px;"><strong>Objetivo / Escopo:</strong> ${objeto}</p>` : '';
        const validadeTexto = `${validadeDias} dias`;

        html = `
            <div class="doc-header-top">
                <div class="doc-logo-area" style="min-height:55px; display:flex; align-items:center;">
                    ${logoHtml}
                </div>
            </div>

            <div class="doc-title-block">
                <h2>Proposta de Prestação de Serviços</h2>
                <h3>Transporte Executivo de Passageiros</h3>
            </div>

            <div class="doc-destinatario">
                <p><strong>${localidadeData}</strong></p>
                <p><strong>NEW CARGO TRANSPORTE E LOGISTICA LTDA</strong></p>
                <p>Rua São Domingos da Calçada, 157, Paraíso</p>
                <p>CEP.: 27535-020</p>
            </div>

            <p class="doc-greeting">${saudacao}</p>
            <p class="doc-intro">${fixedIntro}</p>
            ${objetoTexto}

            <table class="doc-itens-table">
                <thead>
                    <tr>
                        <th style="width:50px; text-align:center;">ITEM</th>
                        <th>DESCRIÇÃO DO OBJETO</th>
                        <th style="width:150px; text-align:center;">QUANTIDADE</th>
                        <th style="width:150px; text-align:center;">VALOR TOTAL (R$)</th>
                    </tr>
                </thead>
                <tbody>${itensRows}</tbody>
                <tfoot>
                    <tr>
                        <td colspan="3" style="text-align:right; font-weight:bold; font-size:10.5pt; text-transform:uppercase; border-right:none !important;">GLOBAL</td>
                        <td style="font-weight:bold; font-size:10.5pt; border-left:none !important;">
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
    }

    const paperEl = document.getElementById('docPropostaPaper');
    if (paperEl) {
        paperEl.innerHTML = html;
        if (empresaPdfBgUrl) {
            paperEl.style.backgroundImage = `url('${empresaPdfBgUrl}')`;
            paperEl.style.backgroundSize = '100% 100%';
            paperEl.style.backgroundPosition = 'center';
            paperEl.style.backgroundRepeat = 'no-repeat';
        } else {
            paperEl.style.backgroundImage = 'none';
        }
    }
    document.getElementById('documentoPropostaOverlay').classList.add('active');
    if (window.lucide) lucide.createIcons();
};

window.fecharDocumentoProposta = () => {
    document.getElementById('documentoPropostaOverlay').classList.remove('active');
};

window.baixarPdfProposta = async () => {
    const element = document.getElementById('docPropostaPaper');
    if (!element) return;

    const cliente = (document.getElementById('cliente_nome')?.value || propostaAtual.cliente_nome || 'Cliente')
        .trim().replace(/[^a-zA-Z0-9_\-]/g, '_');
    const dataRef = new Date().toISOString().slice(0, 10);
    const filename = `Proposta_${cliente || 'Comercial'}_${dataRef}.pdf`;

    const btn = document.querySelector('.doc-btn-download');
    const origHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-2" class="spin" style="width:14px;"></i> Baixando...';
    }

    try {
        if (window.html2pdf) {
            const opt = {
                margin: 0,
                filename: filename,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: {
                    scale: 2,
                    useCORS: true,
                    logging: false,
                    scrollY: 0,
                    scrollX: 0
                },
                jsPDF: {
                    unit: 'mm',
                    format: 'a4',
                    orientation: 'portrait'
                }
            };
            await html2pdf().set(opt).from(element).save();
        } else {
            window.print();
        }
    } catch (err) {
        console.error("Erro ao gerar PDF:", err);
        window.print();
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = origHtml;
            if (window.lucide) lucide.createIcons();
        }
    }
};

window.imprimirProposta = () => {
    window.print();
};

// ===== CADASTRO RÁPIDO DE TIPO DE VEÍCULO (NO MODAL DE PROPOSTA) =====
window.abrirModalRapidoTipoVeiculo = (idx) => {
    window._quickTvTargetIdx = (idx !== undefined && idx !== null) ? idx : null;
    const input = document.getElementById('quickTipoVeiculoNome');
    if (input) input.value = '';
    const modal = document.getElementById('quickTipoVeiculoModal');
    if (modal) modal.classList.add('active');
    setTimeout(() => { if (input) input.focus(); }, 100);
    if (window.lucide) lucide.createIcons();
};

window.fecharModalRapidoTipoVeiculo = () => {
    const modal = document.getElementById('quickTipoVeiculoModal');
    if (modal) modal.classList.remove('active');
    if (window._quickTvTargetIdx !== null && window._quickTvTargetIdx !== undefined) {
        const item = propostaAtual.itens[window._quickTvTargetIdx];
        const select = document.querySelector(`.v3-tipo-veiculo-select[data-idx="${window._quickTvTargetIdx}"]`);
        if (select && item) {
            select.value = item.tipo_veiculo || '';
        }
    }
    window._quickTvTargetIdx = null;
};

window.handleTipoVeiculoChange = (idx, val) => {
    if (val === '__ADD_NOVO__') {
        abrirModalRapidoTipoVeiculo(idx);
    } else {
        updateItemPropostaV3(idx, 'tipo_veiculo', val);
    }
};

window.salvarRapidoTipoVeiculo = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const input = document.getElementById('quickTipoVeiculoNome');
    const nome = input ? input.value.trim() : '';
    if (!nome) return;

    const btn = document.getElementById('btnSalvarQuickTv');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-2" class="spin" style="width:14px;"></i> Salvando...';
    }

    try {
        let savedItem = null;
        try {
            const { data, error } = await supabaseClient
                .from('com_tipos_veiculo')
                .insert([{ nome }])
                .select();
            if (error) throw error;
            if (data && data[0]) savedItem = data[0];
        } catch (dbErr) {
            console.warn("Supabase com_tipos_veiculo insert error, usando fallback local:", dbErr);
            savedItem = { id: 'tv_' + Date.now(), nome };
            const local = JSON.parse(localStorage.getItem('com_tipos_veiculo_fallback') || '[]');
            local.push(savedItem);
            localStorage.setItem('com_tipos_veiculo_fallback', JSON.stringify(local));
        }

        if (!config.tipos_veiculo) config.tipos_veiculo = [];
        if (!config.tipos_veiculo.some(x => x.nome.toLowerCase() === nome.toLowerCase())) {
            config.tipos_veiculo.push(savedItem || { id: 'tv_' + Date.now(), nome });
        }

        // Atualiza a lista na aba de cadastros caso esteja carregada
        const listTiposVeiculo = document.getElementById('list_tipos_veiculo');
        if (listTiposVeiculo && typeof renderItemConfig === 'function') {
            listTiposVeiculo.innerHTML = config.tipos_veiculo.map(i => renderItemConfig(i, 'com_tipos_veiculo')).join('');
        }

        // Atualiza o item alvo na proposta
        const targetIdx = window._quickTvTargetIdx;
        if (targetIdx !== null && targetIdx !== undefined && propostaAtual.itens[targetIdx]) {
            propostaAtual.itens[targetIdx].tipo_veiculo = nome;
        }

        // Atualiza todos os selects de tipo_veiculo abertos sem perder dados já digitados nos cards
        document.querySelectorAll('.v3-tipo-veiculo-select').forEach(sel => {
            const currentVal = sel.value;
            const thisIdx = parseInt(sel.getAttribute('data-idx'));
            sel.innerHTML = `
                <option value="">Selecione o Veículo</option>
                ${config.tipos_veiculo.map(tv => `<option value="${tv.nome}">${tv.nome}</option>`).join('')}
                <option value="__ADD_NOVO__" style="color:var(--primary); font-weight:800;">+ Adicionar novo tipo...</option>
            `;
            if (thisIdx === targetIdx) {
                sel.value = nome;
            } else if (currentVal && currentVal !== '__ADD_NOVO__') {
                sel.value = currentVal;
            }
        });

        // Atualiza o filtro de veículos da aba de propostas particulares
        const filterTv = document.getElementById('filterVeiculoParticular');
        if (filterTv) {
            const currentFilter = filterTv.value;
            filterTv.innerHTML = `<option value="">Todos os Veículos</option>` + 
                config.tipos_veiculo.map(tv => `<option value="${tv.nome}">${tv.nome}</option>`).join('');
            filterTv.value = currentFilter;
        }

        fecharModalRapidoTipoVeiculo();
    } catch (err) {
        alert("Erro ao cadastrar tipo de veículo: " + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="check" style="width:14px;"></i> Salvar e Usar';
        }
        if (window.lucide) lucide.createIcons();
    }
};

window.openHistoricoModal = async (id) => {
    const c = contratos.find(x => x.id === id);
    if (!c) return;

    document.getElementById('historicoModalSubtitle').innerText = `${c.cliente_nome || 'Contrato'} — ${c.descricao_contrato || 'Sem descrição'}`;
    const listEl = document.getElementById('historicoModalList');
    listEl.innerHTML = `<div style="font-size:0.85rem;color:var(--text-muted);font-style:italic;text-align:center;padding:2rem 0;">Carregando histórico...</div>`;
    
    document.getElementById('historicoModal').classList.add('active');

    try {
        const { data, error } = await supabaseClient
            .from('com_proposta_historico')
            .select('*')
            .eq('contrato_id', id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!data || data.length === 0) {
            listEl.innerHTML = `<div style="font-size:0.85rem;color:var(--text-muted);font-style:italic;text-align:center;padding:2rem 0;">Nenhum registro encontrado no histórico deste contrato.</div>`;
            return;
        }

        listEl.innerHTML = data.map(h => {
            const iconName = getHistoryIconName(h.label);
            const dateStr = formatHistoryDateTime(h.created_at, h.data);
            return `
                <div class="historico-card">
                    <div class="historico-icon-box">
                        <i data-lucide="${iconName}" style="width:18px;height:18px;"></i>
                    </div>
                    <div class="historico-content">
                        <div class="historico-header-row">
                            <div style="flex:1;">${formatHistoryLabel(h.label)}</div>
                            <div class="historico-date-badge">
                                <i data-lucide="clock" style="width:12px;height:12px;"></i>
                                ${dateStr}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error('Erro ao carregar histórico:', err);
        listEl.innerHTML = `<div style="font-size:0.85rem;color:#ef4444;text-align:center;padding:2rem 0;">Erro ao carregar histórico: ${err.message}</div>`;
    }

    if (window.lucide) lucide.createIcons();
};

window.closeHistoricoModal = () => {
    document.getElementById('historicoModal').classList.remove('active');
};

let pinCallback = null;
let currentPinChallenge = "";

window.openPinModal = function(callback) {
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
};

window.movePinFocus = function(input) {
    if (input.value.length === 1) {
        const next = input.nextElementSibling;
        if (next && next.classList.contains('pin-field')) {
            next.focus();
        }
    }
};

window.confirmPin = function() {
    let pin = "";
    document.querySelectorAll('.pin-field').forEach(input => pin += input.value);
    
    if (pin === currentPinChallenge) {
        const modal = document.getElementById('pinModal');
        if (modal) modal.classList.remove('active');
        if (typeof pinCallback === 'function') pinCallback();
        pinCallback = null;
    } else {
        document.querySelectorAll('.pin-field').forEach(input => {
            input.classList.add('error');
            input.value = '';
        });
        const first = document.querySelector('.pin-field[data-index="0"]');
        if (first) first.focus();
        alert('Código Incorreto! Tente novamente.');
    }
};

window.addEventListener('themechange', () => {
    if (currentTab === 'dashboard') {
        renderCharts();
    }
});

// ============================================================
//  MÓDULO PRESTADORES (AGREGADOS)
// ============================================================

async function loadPrestadores() {
    if (!supabaseClient) return;
    try {
        const { data, error } = await supabaseClient
            .from('com_prestadores')
            .select('*')
            .order('nome_prestador', { ascending: true });

        if (error) throw error;
        prestadores = data || [];
        renderPrestadores();
    } catch (err) {
        console.error('Erro ao carregar prestadores:', err);
    }
}

function renderPrestadores() {
    const tbody = document.getElementById('prestadoresTableBody');
    if (!tbody) return;

    const searchTerm = (document.getElementById('prestadorSearch')?.value || '').toLowerCase();
    const filterStatus = document.getElementById('filterPrestadorStatus')?.value || '';
    const filterTipoContrato = document.getElementById('filterPrestadorTipoContrato')?.value || '';

    const filtered = prestadores.filter(p => {
        if (filterStatus && p.status !== filterStatus) return false;
        if (filterTipoContrato && p.tipo_contrato !== filterTipoContrato) return false;

        if (searchTerm) {
            const searchable = [
                p.nome_prestador,
                p.cpf,
                p.cnpj,
                p.razao_social,
                p.placa,
                p.modelo,
                p.marca
            ].map(v => (v || '').toLowerCase()).join(' ');

            return searchable.includes(searchTerm);
        }
        return true;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 3rem; color: var(--text-muted);">
                    Nenhum prestador encontrado.
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(p => {
        const docFormatted = p.tipo_contrato === 'CNPJ' ? (p.cnpj || '-') : (p.cpf || '-');
        
        let statusStyle = 'background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.3);';
        if (p.status === 'Congelado') statusStyle = 'background:rgba(245,158,11,0.15);color:#f59e0b;border:1px solid rgba(245,158,11,0.3);';
        if (p.status === 'Inativo') statusStyle = 'background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3);';

        const pendenciaBadge = p.tem_pendencia 
            ? `<span style="font-size: 0.65rem; font-weight:800; padding:1px 6px; border-radius:10px; background:rgba(239,68,68,0.15); color:#ef4444; border:1px solid rgba(239,68,68,0.3);" title="${p.pendencia_descricao || 'Com pendência'}">SIM</span>`
            : `<span style="font-size: 0.68rem; font-weight:700; color:var(--text-muted);">NÃO</span>`;

        const actionDriveBtn = p.link_documentos
            ? `<a href="${p.link_documentos}" target="_blank" rel="noopener noreferrer" class="action-btn-mini" title="Abrir pasta de documentos (Google Drive)" style="background: rgba(59,130,246,0.15); color: #3b82f6; border: 1px solid rgba(59,130,246,0.3); display: inline-flex; align-items: center; justify-content: center; text-decoration: none;">
                <i data-lucide="folder-git-2"></i>
               </a>`
            : `<button class="action-btn-mini" onclick="alert('Nenhuma pasta de documentos cadastrada para este prestador.')" title="Sem pasta cadastrada" style="opacity: 0.35; cursor: not-allowed; border: 1px solid rgba(255,255,255,0.1); background: transparent; color: var(--text-muted);">
                <i data-lucide="folder"></i>
               </button>`;

        return `
            <tr>
                <td style="font-weight: 700; font-size: 0.74rem;">${p.nome_prestador}</td>
                <td style="text-align: center;"><span style="font-size:0.65rem; font-weight:800; background:rgba(99,102,241,0.12); color:var(--primary); padding:1px 6px; border-radius:4px; display:inline-block;">${p.tipo_contrato || '-'}</span></td>
                <td style="font-size:0.72rem; font-family:'JetBrains Mono',monospace;">${docFormatted}</td>
                <td style="text-align: center;"><span class="proposta-status-badge" style="font-size:0.62rem; padding:2px 6px; ${statusStyle}">${p.status || 'Ativo'}</span></td>
                <td style="font-size:0.72rem;">${p.marca || ''} ${p.modelo || ''} <span style="font-family:'JetBrains Mono',monospace; font-weight:800; color:var(--primary); margin-left:4px;">(${p.placa || '-'})</span></td>
                <td style="text-align: center; font-size:0.72rem;">${fmtDataBR(p.data_proxima_vistoria)}</td>
                <td style="text-align: center;">${pendenciaBadge}</td>
                <td style="text-align: right; white-space: nowrap;">
                    <div style="display: flex; gap: 4px; justify-content: flex-end; align-items: center;">
                        ${actionDriveBtn}
                        <button class="action-btn-mini" onclick="openPrestadorModal('${p.id}')" title="Editar Prestador">
                            <i data-lucide="edit-2"></i>
                        </button>
                        <button class="action-btn-mini" onclick="deletePrestador('${p.id}')" title="Excluir Prestador" style="background: rgba(239,68,68,0.1); color: #ef4444;">
                            <i data-lucide="trash-2"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
    }).join('');

    if (window.lucide) lucide.createIcons();
}

// Controls visual dynamics in modal
window.toggleTipoContratoCampos = () => {
    const tipo = document.getElementById('p_tipo_contrato')?.value;
    const gCpf = document.getElementById('group_p_cpf');
    const gCnpj = document.getElementById('group_p_cnpj');
    const gRazao = document.getElementById('group_p_razao_social');

    if (tipo === 'CNPJ') {
        if (gCpf) gCpf.style.display = 'none';
        if (gCnpj) gCnpj.style.display = 'flex';
        if (gRazao) gRazao.style.display = 'flex';
    } else {
        if (gCpf) gCpf.style.display = 'flex';
        if (gCnpj) gCnpj.style.display = 'none';
        if (gRazao) gRazao.style.display = 'none';
    }
};

window.togglePendenciaCampo = () => {
    const checked = document.getElementById('p_tem_pendencia')?.checked;
    const label = document.getElementById('p_pendencia_label');
    const gDesc = document.getElementById('group_p_pendencia_descricao');

    if (label) label.innerText = checked ? 'Sim' : 'Não';
    if (label) label.style.color = checked ? '#ef4444' : 'var(--text-muted)';
    if (gDesc) gDesc.style.display = checked ? 'flex' : 'none';
};

window.toggleMotivoStatusCampo = () => {
    const status = document.getElementById('p_status')?.value;
    const gMotivo = document.getElementById('group_p_motivo_status');
    if (gMotivo) {
        gMotivo.style.display = (status === 'Congelado' || status === 'Inativo') ? 'flex' : 'none';
    }
};

window.calcularProximaVistoria = () => {
    const dtVistoria = document.getElementById('p_data_vistoria')?.value;
    const prazoDias = parseInt(document.getElementById('p_prazo_proxima_vistoria_dias')?.value);
    const outProx = document.getElementById('p_data_proxima_vistoria');

    if (dtVistoria && !isNaN(prazoDias) && prazoDias > 0) {
        const date = new Date(dtVistoria + 'T12:00:00');
        date.setDate(date.getDate() + prazoDias);
        if (outProx) outProx.value = date.toISOString().split('T')[0];
    } else {
        if (outProx) outProx.value = '';
    }
};

window.openPrestadorModal = (id = null) => {
    if (typeof canDo === 'function') {
        const action = id ? 'edit' : 'add';
        if (!canDo('comercial_prestadores', action)) {
            alert('Você não tem permissão para esta ação.');
            return;
        }
    }

    const modal = document.getElementById('prestadorModal');
    const form = document.getElementById('prestadorForm');
    if (!modal || !form) return;

    form.reset();
    document.getElementById('prestadorEditId').value = id || '';
    document.getElementById('prestadorModalTitle').innerText = id ? 'Editar Prestador Agregado' : 'Novo Prestador Agregado';

    if (id) {
        const p = prestadores.find(x => x.id === id);
        if (p) {
            document.getElementById('p_data_inicio_contrato').value = p.data_inicio_contrato || '';
            document.getElementById('p_nome_prestador').value = p.nome_prestador || '';
            document.getElementById('p_tipo_contrato').value = p.tipo_contrato || 'CPF';
            document.getElementById('p_cpf').value = p.cpf || '';
            document.getElementById('p_cnpj').value = p.cnpj || '';
            document.getElementById('p_razao_social').value = p.razao_social || '';
            document.getElementById('p_contrato_formalizado').value = p.contrato_formalizado || 'Nao';
            document.getElementById('p_comodato_locacao').value = p.comodato_locacao || 'NA';
            document.getElementById('p_veiculo_compartilhado').value = p.veiculo_compartilhado || 'Nao';
            document.getElementById('p_link_documentos').value = p.link_documentos || '';
            document.getElementById('p_tem_pendencia').checked = !!p.tem_pendencia;
            document.getElementById('p_pendencia_descricao').value = p.pendencia_descricao || '';
            document.getElementById('p_status').value = p.status || 'Ativo';
            document.getElementById('p_motivo_status').value = p.motivo_status || '';
            document.getElementById('p_observacao').value = p.observacao || '';
            document.getElementById('p_placa').value = p.placa || '';
            document.getElementById('p_exercicio').value = p.exercicio || '';
            document.getElementById('p_ano_fabricacao').value = p.ano_fabricacao || '';
            document.getElementById('p_ano_modelo').value = p.ano_modelo || '';
            document.getElementById('p_marca').value = p.marca || '';
            document.getElementById('p_modelo').value = p.modelo || '';
            document.getElementById('p_cor').value = p.cor || '';
            document.getElementById('p_nome_documento').value = p.nome_documento || '';
            document.getElementById('p_cpf_cnpj_doc_veicular').value = p.cpf_cnpj_doc_veicular || '';
            document.getElementById('p_rastreador').value = p.rastreador || 'Nao';
            document.getElementById('p_seguro_app').value = p.seguro_app || 'Nao';
            document.getElementById('p_data_vistoria').value = p.data_vistoria || '';
            document.getElementById('p_prazo_proxima_vistoria_dias').value = p.prazo_proxima_vistoria_dias || '';
            document.getElementById('p_data_proxima_vistoria').value = p.data_proxima_vistoria || '';
        }
    } else {
        document.getElementById('p_data_inicio_contrato').value = dataAtualISO();
    }

    toggleTipoContratoCampos();
    togglePendenciaCampo();
    toggleMotivoStatusCampo();

    modal.classList.add('active');
};

window.closePrestadorModal = () => {
    const modal = document.getElementById('prestadorModal');
    if (modal) modal.classList.remove('active');
};

window.handleSavePrestador = async (e) => {
    e.preventDefault();
    if (!supabaseClient) return alert('Supabase não conectado.');

    const editId = document.getElementById('prestadorEditId').value;
    if (typeof canDo === 'function') {
        const action = editId ? 'edit' : 'add';
        if (!canDo('comercial_prestadores', action)) {
            alert('Você não tem permissão para salvar prestadores.');
            return;
        }
    }

    const tipoContrato = document.getElementById('p_tipo_contrato').value;
    const statusVal = document.getElementById('p_status').value;
    const temPendencia = document.getElementById('p_tem_pendencia').checked;

    const payload = {
        data_inicio_contrato: document.getElementById('p_data_inicio_contrato').value || null,
        nome_prestador: document.getElementById('p_nome_prestador').value.trim(),
        tipo_contrato: tipoContrato,
        cpf: (tipoContrato === 'CLT' || tipoContrato === 'CPF') ? document.getElementById('p_cpf').value.trim() : null,
        cnpj: (tipoContrato === 'CNPJ') ? document.getElementById('p_cnpj').value.trim() : null,
        razao_social: (tipoContrato === 'CNPJ') ? document.getElementById('p_razao_social').value.trim() : null,
        contrato_formalizado: document.getElementById('p_contrato_formalizado').value,
        comodato_locacao: document.getElementById('p_comodato_locacao').value,
        veiculo_compartilhado: document.getElementById('p_veiculo_compartilhado').value,
        link_documentos: document.getElementById('p_link_documentos')?.value.trim() || null,
        tem_pendencia: temPendencia,
        pendencia_descricao: temPendencia ? document.getElementById('p_pendencia_descricao').value.trim() : null,
        status: statusVal,
        motivo_status: (statusVal === 'Congelado' || statusVal === 'Inativo') ? document.getElementById('p_motivo_status').value.trim() : null,
        observacao: document.getElementById('p_observacao').value.trim() || null,
        placa: document.getElementById('p_placa').value.trim().toUpperCase(),
        exercicio: document.getElementById('p_exercicio').value.trim() || null,
        ano_fabricacao: parseInt(document.getElementById('p_ano_fabricacao').value) || null,
        ano_modelo: parseInt(document.getElementById('p_ano_modelo').value) || null,
        marca: document.getElementById('p_marca').value.trim() || null,
        modelo: document.getElementById('p_modelo').value.trim() || null,
        cor: document.getElementById('p_cor').value.trim() || null,
        nome_documento: document.getElementById('p_nome_documento').value.trim() || null,
        cpf_cnpj_doc_veicular: document.getElementById('p_cpf_cnpj_doc_veicular').value.trim() || null,
        rastreador: document.getElementById('p_rastreador').value,
        seguro_app: document.getElementById('p_seguro_app').value,
        data_vistoria: document.getElementById('p_data_vistoria').value || null,
        prazo_proxima_vistoria_dias: parseInt(document.getElementById('p_prazo_proxima_vistoria_dias').value) || null,
        data_proxima_vistoria: document.getElementById('p_data_proxima_vistoria').value || null
    };

    try {
        let res;
        if (editId) {
            res = await supabaseClient.from('com_prestadores').update(payload).eq('id', editId);
        } else {
            res = await supabaseClient.from('com_prestadores').insert([payload]);
        }

        if (res.error) throw res.error;

        closePrestadorModal();
        await loadPrestadores();
    } catch (err) {
        console.error('Erro ao salvar prestador:', err);
        alert('Falha ao salvar prestador: ' + err.message);
    }
};

window.deletePrestador = async (id) => {
    if (typeof canDo === 'function' && !canDo('comercial_prestadores', 'delete')) {
        alert('Você não tem permissão para excluir prestadores.');
        return;
    }

    const p = prestadores.find(x => x.id === id);
    const nome = p ? p.nome_prestador : 'este prestador';
    
    if (!confirm(`Tem certeza que deseja excluir o prestador "${nome}"?`)) return;

    try {
        const { error } = await supabaseClient
            .from('com_prestadores')
            .delete()
            .eq('id', id);

        if (error) throw error;
        await loadPrestadores();
    } catch (err) {
        console.error('Erro ao excluir prestador:', err);
        alert('Falha ao excluir prestador: ' + err.message);
    }
};

