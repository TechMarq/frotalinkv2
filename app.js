const ADMIN_PASSWORD = "M@nu2398";

// --- Configuração Supabase ---
let client = null;
try {
    console.log('Tentando inicializar Supabase...');
    if (typeof supabase !== 'undefined') {
        client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        console.log('Cliente Supabase inicializado com sucesso!');
    } else {
        console.error('Erro: A biblioteca Supabase não foi carregada corretamente via CDN.');
    }
} catch (e) {
    console.error('Falha crítica ao inicializar Supabase:', e);
}

// --- Elementos DOM ---
const vehicleList = document.getElementById('vehicleList');
const searchInput = document.getElementById('searchInput');

// Modais e Forms
const addModal = document.getElementById('addModal');
const addForm = document.getElementById('addForm');
const driverModal = document.getElementById('driverModal');
const driverForm = document.getElementById('driverForm');
const editModal = document.getElementById('editModal');
const editForm = document.getElementById('editForm');

// Dropdowns
const driverSelect = document.getElementById('addCondutorPrincipalId');

// --- Estado Global ---
let vehicles = [];
let drivers = [];
let oficinas = [];
let fuelTypes = [];
let maintLogs = [];
let isAdmin = true;
let currentSort = {
    dashboard: { key: 'placa', dir: 'asc' },
    vehicles: { key: 'placa', dir: 'asc' },
    drivers: { key: 'nome_completo', dir: 'asc' }
};
let currentStatusFilter = null; // MANUTENCAO, GARAGEM, DISPONIVEL
let currentClassificationFilters = []; // Multi-select: PROPRIO, TERCEIRO, etc.
let whatsappConfig = { api_type: 'evolution', api_url: '', instance: '', apikey: '' };
let whatsappDestinatarios = [];
let inativoMotivos = [];

// ============================================================
//  COLUMN MANAGER
// ============================================================

const COL_DEFS = {
    dashboard: [
        { key: 'placa', label: 'Placa', visible: true },
        { key: 'modelo', label: 'Modelo', visible: true },
        { key: 'km_atual', label: 'KM Atual', visible: true },
        { key: 'condutor', label: 'Alocação Atual', visible: true },
        { key: 'whats', label: 'WhatsApp', visible: true },
    ],
    vehicles: [
        { key: 'placa', label: 'Placa', visible: true },
        { key: 'marca_modelo', label: 'Marca/Modelo', visible: true },
        { key: 'proprietario', label: 'Proprietário', visible: true },
        { key: 'venc_seguro', label: 'Venc. Seguro', visible: true },
        { key: 'seguradora', label: 'Seguradora', visible: false },
        { key: 'numero_apolice', label: 'Nº Apólice', visible: false },
        { key: 'valor_premio', label: 'Valor Prêmio', visible: false },
        { key: 'valor_franquia', label: 'Valor Franquia', visible: false },
        { key: 'forma_pagamento', label: 'Forma Pgto.', visible: false },
        { key: 'corretor_seguro', label: 'Corretor', visible: false },
        { key: 'proponente_seguro', label: 'Proponente', visible: false },
        { key: 'endosso_proposta', label: 'Endosso', visible: false },
        { key: 'ci_seguro', label: 'CI Seguro', visible: false },
        { key: 'parcelas_pagamento', label: 'Parcelas', visible: false },
        { key: 'forma_pagamento', label: 'Forma Pgto.', visible: false },
        { key: 'classificacao', label: 'Classificação', visible: false },
        { key: 'tipo_combustivel', label: 'Combustível', visible: true },
        { key: 'status', label: 'Status', visible: false },
        { key: 'cor', label: 'Cor', visible: false },
        { key: 'ano_fabricacao', label: 'Ano Fab.', visible: false },
        { key: 'ano_modelo', label: 'Ano Modelo', visible: false },
        { key: 'renavam', label: 'RENAVAM', visible: false },
        { key: 'chassi', label: 'Chassi', visible: false },
        { key: 'numero_motor', label: 'Nº Motor', visible: false },
        { key: 'codigo_fipe', label: 'Cód. FIPE', visible: false },
        { key: 'valor_fipe_mes', label: 'Valor FIPE', visible: false },
        { key: 'nome_documento', label: 'Nome Doc.', visible: false },
        { key: 'cpf_cnpj', label: 'CPF/CNPJ', visible: false },
        { key: 'condutor_principal', label: 'Condutor Seguro', visible: true },
        { key: 'motorista_alocado', label: 'Alocação Atual', visible: true },
        { key: 'data_aquisicao_nf', label: 'Dt. Aquisição', visible: false },
        { key: 'data_saida_nf', label: 'Dt. Saída', visible: false },
        { key: 'fornecedor_aquisicao', label: 'Fornecedor', visible: false },
        { key: 'actions', label: 'Ações', visible: true },
    ],
    drivers: [
        { key: 'nome_completo', label: 'Nome Completo', visible: true },
        { key: 'cpf', label: 'CPF', visible: true },
        { key: 'cnh_cat', label: 'CNH / Categoria', visible: true },
        { key: 'vencimento_cnh', label: 'Vencimento CNH', visible: true },
        { key: 'idade', label: 'Idade', visible: true },
        { key: 'vinculos_seguro', label: 'Qtd. Seguros Principal', visible: true },
        { key: 'contato_whatsapp', label: 'WhatsApp', visible: false },
        { key: 'data_nascimento', label: 'Nascimento', visible: false },
        { key: 'status', label: 'Status', visible: true },
        { key: 'actions', label: 'Ações', visible: true },
    ],
};

const LS_KEY = 'frotalink_cols_v1';

function loadColConfig() {
    try {
        const saved = localStorage.getItem(LS_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            ['dashboard', 'vehicles', 'drivers'].forEach(tab => {
                if (parsed[tab]) {
                    // Merge: preserve new keys, respect saved order+visibility
                    const savedKeys = parsed[tab].map(c => c.key);
                    const existingKeys = COL_DEFS[tab].map(c => c.key);
                    // Build ordered list from saved, then append any new keys not yet saved
                    const merged = [
                        ...parsed[tab].filter(c => existingKeys.includes(c.key)),
                        ...COL_DEFS[tab].filter(c => !savedKeys.includes(c.key))
                    ];
                    COL_DEFS[tab] = merged;
                }
            });
        }
    } catch (e) { /* ignore */ }
}

function saveColConfig() {
    localStorage.setItem(LS_KEY, JSON.stringify(COL_DEFS));
}

function getActiveCols(tab) {
    return COL_DEFS[tab].filter(c => c.visible);
}

// ---------- Panel UI ----------

function toggleColPanel(tab) {
    const panel = document.getElementById('colPanel-' + tab);
    if (!panel) return;
    const isOpen = panel.style.display !== 'none';
    panel.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) renderColPanel(tab);
}

function renderColPanel(tab) {
    const list = document.getElementById('colList-' + tab);
    if (!list) return;

    list.innerHTML = COL_DEFS[tab].map((col, idx) => `
        <div class="col-chip ${col.visible ? '' : 'hidden-col'}"
             draggable="true"
             data-tab="${tab}"
             data-idx="${idx}"
             id="chip-${tab}-${idx}"
             ondragstart="onChipDragStart(event)"
             ondragover="onChipDragOver(event)"
             ondrop="onChipDrop(event)"
             ondragleave="onChipDragLeave(event)"
             ondragend="onChipDragEnd(event)">
            <span class="col-chip-grip">⠿</span>
            <span>${col.label}</span>
            <button class="col-chip-eye" title="${col.visible ? 'Ocultar coluna' : 'Mostrar coluna'}"
                    onclick="toggleColVisibility('${tab}', ${idx})" type="button">
                ${col.visible ? '👁' : '🚫'}
            </button>
        </div>
    `).join('');
}

function toggleColVisibility(tab, idx) {
    COL_DEFS[tab][idx].visible = !COL_DEFS[tab][idx].visible;
    saveColConfig();
    renderColPanel(tab);
    renderAll();
}

function resetColumns(tab) {
    localStorage.removeItem(LS_KEY);
    // Re-read from the original defaults
    const origDefs = {
        dashboard: [
            { key: 'placa', label: 'Placa', visible: true },
            { key: 'modelo', label: 'Modelo', visible: true },
            { key: 'km_atual', label: 'KM Atual', visible: true },
            { key: 'condutor', label: 'Condutor Atual', visible: true },
            { key: 'whats', label: 'WhatsApp', visible: true },
        ],
        vehicles: [
            { key: 'placa', label: 'Placa', visible: true },
            { key: 'marca_modelo', label: 'Marca/Modelo', visible: true },
            { key: 'proprietario', label: 'Proprietário', visible: true },
            { key: 'venc_seguro', label: 'Venc. Seguro', visible: true },
            { key: 'seguradora', label: 'Seguradora', visible: false },
            { key: 'numero_apolice', label: 'Nº Apólice', visible: false },
            { key: 'valor_premio', label: 'Valor Prêmio', visible: false },
            { key: 'valor_franquia', label: 'Valor Franquia', visible: false },
            { key: 'corretor_seguro', label: 'Corretor', visible: false },
            { key: 'proponente_seguro', label: 'Proponente', visible: false },
            { key: 'endosso_proposta', label: 'Endosso', visible: false },
            { key: 'ci_seguro', label: 'CI Seguro', visible: false },
            { key: 'parcelas_pagamento', label: 'Parcelas', visible: false },
            { key: 'forma_pagamento', label: 'Forma Pgto.', visible: false },
            { key: 'classificacao', label: 'Classificação', visible: false },
            { key: 'status', label: 'Status', visible: false },
            { key: 'cor', label: 'Cor', visible: false },
            { key: 'ano_fabricacao', label: 'Ano Fab.', visible: false },
            { key: 'ano_modelo', label: 'Ano Modelo', visible: false },
            { key: 'renavam', label: 'RENAVAM', visible: false },
            { key: 'chassi', label: 'Chassi', visible: false },
            { key: 'numero_motor', label: 'Nº Motor', visible: false },
            { key: 'codigo_fipe', label: 'Cód. FIPE', visible: false },
            { key: 'valor_fipe_mes', label: 'Valor FIPE', visible: false },
            { key: 'nome_documento', label: 'Nome Doc.', visible: false },
            { key: 'cpf_cnpj', label: 'CPF/CNPJ', visible: false },
            { key: 'data_aquisicao_nf', label: 'Dt. Aquisição', visible: false },
            { key: 'data_saida_nf', label: 'Dt. Saída', visible: false },
            { key: 'fornecedor_aquisicao', label: 'Fornecedor', visible: false },
            { key: 'actions', label: 'Ações', visible: true },
        ],
        drivers: [
            { key: 'nome_completo', label: 'Nome Completo', visible: true },
            { key: 'cpf', label: 'CPF', visible: true },
            { key: 'cnh_cat', label: 'CNH / Categoria', visible: true },
            { key: 'vencimento_cnh', label: 'Vencimento CNH', visible: true },
            { key: 'idade', label: 'Idade', visible: true },
            { key: 'contato_whatsapp', label: 'WhatsApp', visible: false },
            { key: 'data_nascimento', label: 'Nascimento', visible: false },
            { key: 'status', label: 'Status', visible: true },
            { key: 'actions', label: 'Ações', visible: true },
        ],
    };
    COL_DEFS[tab] = origDefs[tab];
    saveColConfig();
    renderColPanel(tab);
    renderAll();
}

// ---------- Drag & Drop ----------

let dragSrcTab = null;
let dragSrcIdx = null;

function onChipDragStart(e) {
    dragSrcTab = e.currentTarget.dataset.tab;
    dragSrcIdx = parseInt(e.currentTarget.dataset.idx);
    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function onChipDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('drag-over');
}

function onChipDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

function onChipDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    document.querySelectorAll('.col-chip').forEach(c => c.classList.remove('drag-over'));
}

function onChipDrop(e) {
    e.preventDefault();
    const targetIdx = parseInt(e.currentTarget.dataset.idx);
    const targetTab = e.currentTarget.dataset.tab;

    if (dragSrcTab !== targetTab || dragSrcIdx === targetIdx) return;

    const cols = COL_DEFS[targetTab];
    const [moved] = cols.splice(dragSrcIdx, 1);
    cols.splice(targetIdx, 0, moved);

    saveColConfig();
    renderColPanel(targetTab);
    renderAll();
}

// ---------- Dynamic thead render ----------

function renderThead(tab) {
    const thead = document.getElementById('thead-' + tab);
    if (!thead) return;
    const active = getActiveCols(tab);
    const sort = currentSort[tab];

    thead.innerHTML = '<tr>' + active.map(c => {
        const isSorted = sort.key === c.key;
        const icon = isSorted ? (sort.dir === 'asc' ? 'chevron-up' : 'chevron-down') : 'chevrons-up-down';
        const isSortable = c.key !== 'actions';

        return `
            <th ${isSortable ? `onclick="handleSort('${tab}', '${c.key}')" style="cursor:pointer; user-select:none;"` : ''} 
                class="${isSortable ? 'sortable-header' : ''} ${isSorted ? 'active-sort' : ''} ${c.key === 'actions' ? 'col-actions' : ''}">
                <div style="display: flex; align-items: center; gap: 0.4rem; justify-content: ${c.key === 'actions' ? 'center' : 'flex-start'}">
                    ${c.label}
                    ${isSortable ? `<i data-lucide="${icon}" style="width:12px; height:12px; opacity:${isSorted ? 1 : 0.4}"></i>` : ''}
                </div>
            </th>`;
    }).join('') + '</tr>';
    if (window.lucide) lucide.createIcons();
}

function handleSort(tab, key) {
    if (currentSort[tab].key === key) {
        currentSort[tab].dir = currentSort[tab].dir === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort[tab].key = key;
        currentSort[tab].dir = 'asc';
    }
    renderAll();
}

// --- Funções de UI ---

function switchView(viewName) {
    // Alternar botões
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('onclick').includes(viewName)) btn.classList.add('active');
    });

    // Alternar seções
    document.querySelectorAll('.view-section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(viewName + 'View').classList.add('active');
}

function renderAll() {
    renderVehicles();
    renderFullVehicles();
    renderFullDrivers();
    checkNotifications(); // 🔔 Atualiza notificações sempre que renderizar
    updateUnlinkedDrivers(); // 👥 Atualiza motoristas sem veículo
    updateMaintenanceDropdown();
    // ⚠️ fetchWhatsAppConfig() removido daqui para evitar duplicidade de notificações.
    // É carregado apenas uma vez no init e ao salvar/abrir as configs.
}

// ============================================================
//  NOTIFICAÇÕES
// ============================================================

function toggleNotiPanel() {
    const panel = document.getElementById('notiPanel');
    if (panel) panel.classList.toggle('active');
}

function checkNotifications() {
    if (!drivers.length && !vehicles.length) return;

    const alerts = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Considerar apenas a data

    // CNH Alerts (Drivers) - 2 meses antes (60 dias aprox)
    drivers.forEach(d => {
        if (!d.vencimento_cnh) return;
        const venc = new Date(d.vencimento_cnh + 'T00:00:00'); // Garantir timezone local
        const diffTime = venc - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
            alerts.push({
                type: 'expired',
                title: 'CNH Vencida 🔴',
                desc: `Motorista: ${d.nome_completo}`,
                date: formatDate(d.vencimento_cnh),
                itemType: 'driver',
                id: d.id,
                diffDays: diffDays
            });
        } else if (diffDays <= 60) {
            alerts.push({
                type: 'warning',
                title: 'CNH a Vencer 🟠',
                desc: `Motorista: ${d.nome_completo} em ${diffDays} dias`,
                date: formatDate(d.vencimento_cnh),
                itemType: 'driver',
                id: d.id,
                diffDays: diffDays
            });
        }
    });

    // Seguro Alerts (Vehicles) - 1 mês antes (30 dias aprox)
    vehicles.forEach(v => {
        if (!v.vencimento_seguro) return;
        const venc = new Date(v.vencimento_seguro + 'T00:00:00');
        const diffTime = venc - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
            alerts.push({
                type: 'expired',
                title: 'Seguro Vencido 🔴',
                desc: `Veículo: ${v.placa} (${v.modelo})`,
                date: formatDate(v.vencimento_seguro),
                itemType: 'vehicle',
                id: v.id,
                diffDays: diffDays
            });
        } else if (diffDays <= 30) {
            alerts.push({
                type: 'warning',
                title: 'Seguro a Vencer 🟠',
                desc: `Veículo: ${v.placa} em ${diffDays} dias`,
                date: formatDate(v.vencimento_seguro),
                itemType: 'vehicle',
                id: v.id,
                diffDays: diffDays
            });
        }
    });

    // Ordenar alertas: primeiro os vencidos (negativos menores), depois os mais próximos (positivos menores)
    alerts.sort((a, b) => a.diffDays - b.diffDays);

    updateNotiUI(alerts);
}

function updateNotiUI(alerts) {
    const badge = document.getElementById('notiBadge');
    const list = document.getElementById('notiList');
    if (!badge || !list) return;

    if (alerts.length > 0) {
        badge.innerText = alerts.length;
        badge.style.display = 'flex';

        list.innerHTML = alerts.map(a => `
            <div class="noti-item noti-type-${a.type}" onclick="focusNotiItem('${a.itemType}', '${a.id}')">
                <div class="noti-item-title">${a.title}</div>
                <div class="noti-item-desc">${a.desc}</div>
                <div class="noti-date">Data: ${a.date}</div>
            </div>
        `).join('');
    } else {
        badge.style.display = 'none';
        list.innerHTML = '<div class="noti-empty">Nenhuma pendência encontrada ✨</div>';
    }
}

function focusNotiItem(type, id) {
    if (type === 'driver') {
        switchView('drivers');
        const searchInput = document.getElementById('searchInput');
        const driver = drivers.find(d => d.id === id);
        if (driver && searchInput) {
            searchInput.value = driver.nome_completo;
            renderAll();
        }
    } else {
        switchView('vehicles');
        const searchInput = document.getElementById('searchInput');
        const vehicle = vehicles.find(v => v.id === id);
        if (vehicle && searchInput) {
            searchInput.value = vehicle.placa;
            renderAll();
        }
    }
    toggleNotiPanel();
}

// --- Motoristas Sem Veículo ---

function toggleUnlinkedPanel() {
    const panel = document.getElementById('unlinkedPanel');
    if (panel) panel.classList.toggle('active');
}

function updateUnlinkedDrivers() {
    const badge = document.getElementById('unlinkedBadge');
    const list = document.getElementById('unlinkedList');
    if (!badge || !list) return;

    // Motoristas ativos que não estão em NENHUMA alocação de veículo (incluindo principal se o carro não estiver em status especial)
    const occupiedDriverIds = vehicles
        .filter(v => v.status === 'ATIVO' || !v.status)
        .map(v => {
            if (v.motorista_alocado_id) return v.motorista_alocado_id;
            if (!['MANUTENCAO', 'GARAGEM', 'DISPONIVEL'].includes((v.status_alocacao || '').toUpperCase()) && v.condutor_principal_id) {
                return v.condutor_principal_id;
            }
            return null;
        })
        .filter(id => id);

    const unlinked = drivers.filter(d => d.status === 'ATIVO' && !occupiedDriverIds.includes(d.id));

    if (unlinked.length > 0) {
        badge.innerText = unlinked.length;
        badge.style.display = 'flex';

        list.innerHTML = unlinked.map(d => `
            <div class="noti-item" onclick="focusUnlinkedDriver('${d.id}')" style="border-left: 4px solid #818cf8;">
                <div class="noti-item-title" style="color: #818cf8;">Motorista Disponível</div>
                <div class="noti-item-desc">${d.nome_completo}</div>
                <div class="noti-date">CPF: ${d.cpf || '-'}</div>
            </div>
        `).join('');
    } else {
        badge.style.display = 'none';
        list.innerHTML = '<div class="noti-empty">Todos os motoristas estão alocados ✨</div>';
    }
}

function focusUnlinkedDriver(id) {
    switchView('drivers');
    const searchInput = document.getElementById('searchInput');
    const driver = drivers.find(d => d.id === id);
    if (driver && searchInput) {
        searchInput.value = driver.nome_completo;
        renderAll();
    }
    toggleUnlinkedPanel();
}

// ============================================================
//  DETALHAMENTO (POP-UPS)
// ============================================================

function openVehicleDetail(id) {
    const v = vehicles.find(item => item.id === id);
    if (!v) return;

    const modal = document.getElementById('vehicleDetailModal');
    const content = document.getElementById('vehicleDetailContent');
    const title = document.getElementById('vehicleDetailTitle');

    if (!modal || !content || !title) return;

    title.innerText = `Detalhes: ${v.placa}`;

    content.innerHTML = `
        <div class="detail-item"><strong>Marca/Modelo:</strong> ${v.marca || ''} ${v.modelo}</div>
        <div class="detail-item"><strong>Placa:</strong> ${v.placa}</div>
        <div class="detail-item"><strong>RENAVAM:</strong> ${v.renavam || '-'}</div>
        <div class="detail-item"><strong>Cor:</strong> ${v.cor || '-'}</div>
        <div class="detail-item"><strong>Ano:</strong> ${v.ano_fabricacao || '-'}/${v.ano_modelo || '-'}</div>
        <div class="detail-item"><strong>Proprietário:</strong> ${v.proprietario || '-'}</div>
        <div class="detail-item"><strong>Combustível Predominante:</strong> ${v.tipo_combustivel || '-'}</div>
        <div class="detail-item"><strong>Classificação:</strong> ${v.classificacao || '-'}</div>
        <div class="detail-item"><strong>Status:</strong> <span class="badge ${v.status === 'ATIVO' ? 'success' : 'danger'}">${v.status || 'ATIVO'}</span></div>
        ${v.status === 'INATIVO' ? `
        <div class="form-section-header" style="color: #ff4757;">Dados da Inativação</div>
        <div class="detail-item"><strong>Motivo:</strong> ${v.inativo_motivo || '-'}</div>
        <div class="detail-item"><strong>Data:</strong> ${formatDate(v.inativo_data)}</div>
        <div class="detail-item"><strong>Beneficiário/Destino:</strong> ${v.inativo_beneficiario || '-'}</div>
        <div class="detail-item"><strong>Valor:</strong> ${v.inativo_valor ? 'R$ ' + Number(v.inativo_valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-'}</div>
        ` : ''}
        
        <div class="form-section-header">Seguro</div>
        <div class="detail-item"><strong>Seguradora:</strong> ${v.seguradora || '-'}</div>
        <div class="detail-item"><strong>Vencimento:</strong> ${formatDate(v.vencimento_seguro)}</div>
        <div class="detail-item"><strong>Apólice:</strong> ${v.numero_apolice || '-'}</div>
        <div class="detail-item"><strong>Corretor:</strong> ${v.corretor_seguro || '-'}</div>
        <div class="detail-item"><strong>Valor Prêmio:</strong> ${v.valor_premio ? 'R$ ' + Number(v.valor_premio).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-'}</div>
        <div class="detail-item"><strong>Parcelas:</strong> ${v.parcelas_pagamento || '-'}</div>
        <div class="detail-item" style="background: rgba(99,102,241,0.05); border: 1px solid rgba(99,102,241,0.15); border-radius: 8px; padding: 0.6rem 0.8rem; margin-top: 0.2rem;">
            <strong style="color: #818cf8;">Valor por Parcela:</strong> ${(v.valor_premio && v.parcelas_pagamento && v.parcelas_pagamento > 0) ? '<span style="color:#818cf8; font-weight:800;">R$ ' + (v.valor_premio / v.parcelas_pagamento).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</span>' : '-'}
        </div>
        <div class="detail-item"><strong>Valor Franquia:</strong> ${v.valor_franquia ? 'R$ ' + Number(v.valor_franquia).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-'}</div>
        <div class="detail-item"><strong>Proponente:</strong> ${v.proponente_seguro || '-'}</div>
        <div class="detail-item"><strong>Endosso/Proposta:</strong> ${v.endosso_proposta || '-'}</div>
        <div class="detail-item"><strong>CI Seguro:</strong> ${v.ci_seguro || '-'}</div>
        
        <div class="form-section-header">Técnico</div>
        <div class="detail-item"><strong>Chassi:</strong> ${v.chassi || '-'}</div>
        <div class="detail-item"><strong>Motor:</strong> ${v.numero_motor || '-'}</div>
        <div class="detail-item"><strong>FIPE:</strong> ${v.codigo_fipe || '-'} / R$ ${Number(v.valor_fipe_mes || 0).toLocaleString('pt-BR')}</div>
        <div class="detail-item"><strong>Controle de Média:</strong> ${v.ignorar_media ? '<span class="badge danger">IGNORADO</span>' : '<span class="badge success">ATIVO</span>'}</div>
    `;

    modal.style.display = 'flex';
}

function closeVehicleDetail() {
    const modal = document.getElementById('vehicleDetailModal');
    if (modal) modal.style.display = 'none';
}

function openDriverDetail(id) {
    if (!id || id === 'garagem' || id === 'manutencao' || id === 'disponivel') return;

    const d = drivers.find(item => item.id === id);
    if (!d) return;

    const modal = document.getElementById('driverDetailModal');
    const content = document.getElementById('driverDetailContent');
    const title = document.getElementById('driverDetailTitle');

    if (!modal || !content || !title) return;

    title.innerText = d.nome_completo;

    content.innerHTML = `
        <div class="detail-item"><strong>Nome:</strong> ${d.nome_completo}</div>
        <div class="detail-item"><strong>CPF:</strong> ${d.cpf || '-'}</div>
        <div class="detail-item"><strong>WhatsApp:</strong> ${d.contato_whatsapp || '-'}</div>
        <div class="detail-item"><strong>Idade:</strong> ${calcAge(d.data_nascimento)}</div>
        <div class="detail-item"><strong>Nascimento:</strong> ${formatDate(d.data_nascimento)}</div>
        
        <div class="form-section-header">Habilitação</div>
        <div class="detail-item"><strong>Registro CNH:</strong> ${d.registro_cnh || '-'}</div>
        <div class="detail-item"><strong>Categoria:</strong> ${d.categoria_cnh || '-'}</div>
        <div class="detail-item"><strong>Vencimento:</strong> ${formatDate(d.vencimento_cnh)}</div>
        
        <div class="form-section-header">Status atual</div>
        <div class="detail-item"><strong>Status:</strong> <span class="badge ${d.status === 'ATIVO' ? 'success' : 'danger'}">${d.status}</span></div>
    `;

    modal.style.display = 'flex';
}

function closeDriverDetail() {
    const modal = document.getElementById('driverDetailModal');
    if (modal) modal.style.display = 'none';
}

// Fechar painel ao clicar fora
document.addEventListener('click', (e) => {
    const panel = document.getElementById('notiPanel');
    const btn = document.getElementById('notiBtn');
    if (panel && panel.classList.contains('active') && !panel.contains(e.target) && !btn.contains(e.target)) {
        panel.classList.remove('active');
    }

    const uPanel = document.getElementById('unlinkedPanel');
    const uBtn = document.getElementById('unlinkedDriversBtn');
    if (uPanel && uPanel.classList.contains('active') && !uPanel.contains(e.target) && !uBtn.contains(e.target)) {
        uPanel.classList.remove('active');
    }

    // Também fechar modais de detalhe ao clicar no overlay
    const vModal = document.getElementById('vehicleDetailModal');
    const dModal = document.getElementById('driverDetailModal');
    if (e.target === vModal) closeVehicleDetail();
    if (e.target === dModal) closeDriverDetail();
});



function formatDate(dateStr) {
    if (!dateStr) return '-';
    // Se a data já vier formatada ou for nula, retornar padrão
    try {
        const [year, month, day] = dateStr.split('-');
        if (!day) return dateStr; // Caso não seja no formato YYYY-MM-DD
        return `${day}/${month}/${year}`;
    } catch (e) {
        return dateStr;
    }
}

function openEditModal(id) {
    const v = vehicles.find(v => v.id === id);
    if (!v) return;

    document.getElementById('editId').value = v.id;
    document.getElementById('editPlaca').value = v.placa;

    // Descobrir quais motoristas já estão ocupados em outros veículos
    const occupiedDriverIds = vehicles
        .filter(veh => veh.condutor_principal_id && veh.id !== id)
        .map(veh => veh.condutor_principal_id);

    const select = document.getElementById('editMotoristaSelect');
    if (select) {
        let options = '<option value="">Desvincular (Nenhum)</option>';

        drivers.forEach(d => {
            const isOccupied = occupiedDriverIds.includes(d.id);
            if (!isOccupied && d.status === 'ATIVO') {
                const isCurrent = d.id === v.condutor_principal_id;
                options += `<option value="${d.id}" ${isCurrent ? 'selected' : ''}>${d.nome_completo} (${d.cpf || 'Sem CPF'})</option>`;
            }
        });

        select.innerHTML = options;
    }

    editModal.style.display = 'flex';
}

async function handleEditAllocation(e) {
    e.preventDefault();
    if (!client) return;

    const vehicleId = document.getElementById('editId').value;
    const newDriverId = document.getElementById('editMotoristaSelect').value || null;

    try {
        const { error } = await client
            .from('veiculos')
            .update({ condutor_principal_id: newDriverId })
            .eq('id', vehicleId);

        if (error) throw error;

        closeModal();
        fetchVehicles();
        alert('Alocação atualizada com sucesso!');
    } catch (err) {
        console.error('Erro na alocação:', err);
        alert('Falha ao atualizar alocação: ' + err.message);
    }
}

function calculateAge() {
    const birthday = document.getElementById('driverNascimento').value;
    if (!birthday) return;
    const today = new Date();
    const birthDate = new Date(birthday);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    document.getElementById('driverIdade').value = age + ' anos';
}

function renderVehicles() {
    const searchTerm = searchInput.value.toLowerCase();
    const list = document.getElementById('vehicleList');
    if (!list) return;

    renderThead('dashboard');

    // Filtra apenas veículos ativos para o Dashboard de alocação
    // Exclui INATIVO e ATIVO - NÃO ALOCAR
    const activeVehicles = vehicles.filter(v => (v.status === 'ATIVO' || !v.status));
    updateStatusCounts();

    const searchWords = searchTerm.split(/\s+/).filter(w => w);
    const filtered = activeVehicles.filter(v => {
        // Filtro por Status rápido (Botões)
        if (currentStatusFilter) {
            let currentStatus = (v.status_alocacao || 'DISPONIVEL').toUpperCase();
            if (currentStatus === 'DISPONÍVEL') currentStatus = 'DISPONIVEL';
            
            // Se possuir motorista alocado, não está disponível
            const hasDriver = !!v.motorista_alocado_id;
            if (currentStatus === 'DISPONIVEL' && hasDriver) {
                currentStatus = 'ALOCADO';
            }
            
            let filterVal = currentStatusFilter.toUpperCase();
            if (filterVal === 'DISPONÍVEL') filterVal = 'DISPONIVEL';
            if (currentStatus !== filterVal) return false;
        }

        const isMainStatus = ['GARAGEM', 'MANUTENCAO', 'DISPONIVEL'].includes((v.status_alocacao || '').toUpperCase());
        const condutorAtual = v.motorista_alocado ? v.motorista_alocado.nome_completo : (isMainStatus ? v.status_alocacao : 'DISPONÍVEL');
        
        // Texto consolidado para busca (Null-safe)
        const searchableText = [
            v.placa,
            v.modelo,
            condutorAtual,
            v.chassi
        ].map(val => (val || '').toLowerCase()).join(' ');

        return searchWords.every(word => searchableText.includes(word));
    });

    const activeCols = getActiveCols('dashboard');
    const sort = currentSort.dashboard;

    // Sorteia os dados filtrados
    filtered.sort((a, b) => {
        let valA, valB;
        if (sort.key === 'condutor') {
            const isMainA = ['GARAGEM', 'MANUTENCAO', 'DISPONIVEL'].includes((a.status_alocacao || '').toUpperCase());
            const nameA = a.motorista_alocado ? a.motorista_alocado.nome_completo : (isMainA ? a.status_alocacao : 'DISPONÍVEL');
            
            const isMainB = ['GARAGEM', 'MANUTENCAO', 'DISPONIVEL'].includes((b.status_alocacao || '').toUpperCase());
            const nameB = b.motorista_alocado ? b.motorista_alocado.nome_completo : (isMainB ? b.status_alocacao : 'DISPONÍVEL');

            valA = (nameA || '').toLowerCase();
            valB = (nameB || '').toLowerCase();
        } else if (typeof a[sort.key] === 'number') {
            valA = a[sort.key] || 0;
            valB = b[sort.key] || 0;
            return sort.dir === 'asc' ? valA - valB : valB - valA;
        } else {
            valA = (a[sort.key] || '').toString().toLowerCase();
            valB = (b[sort.key] || '').toString().toLowerCase();
        }
        if (valA < valB) return sort.dir === 'asc' ? -1 : 1;
        if (valA > valB) return sort.dir === 'asc' ? 1 : -1;
        return 0;
    });

    if (activeVehicles.length === 0) {
        list.innerHTML = `<tr><td colspan="${activeCols.length}" style="text-align:center; padding: 2rem;">Vazio ou sem veículos ativos...</td></tr>`;
        return;
    }

    // Descobrir quais motoristas já estão ocupados (ativos apenas)
    const occupiedDriverIds = vehicles
        .filter(v => (v.status === 'ATIVO' || !v.status) && v.motorista_alocado_id)
        .map(v => v.motorista_alocado_id);

    const activeDrivers = drivers.filter(d => d.status === 'ATIVO');

    list.innerHTML = filtered.map(v => {
        const specialStatus = JSON.parse(localStorage.getItem('vehicleStatus')) || {};
        const currentSpecial = specialStatus[v.id];
        let options = '<option value="">-- Vincular Motorista --</option>';
        options += `<option value="MANUTENCAO" ${v.status_alocacao === 'MANUTENCAO' ? 'selected' : ''}>Manutenção</option>`;
        options += `<option value="GARAGEM" ${v.status_alocacao === 'GARAGEM' ? 'selected' : ''}>Garagem</option>`;
        options += `<option value="DISPONIVEL" ${v.status_alocacao === 'DISPONIVEL' ? 'selected' : ''}>Disponível</option>`;
        activeDrivers.forEach(d => {
            const isCurrent = d.id === v.motorista_alocado_id;
            const isOccupiedByAnother = occupiedDriverIds.includes(d.id) && !isCurrent;
            
            if (!isOccupiedByAnother) {
                options += `<option value="${d.id}" ${isCurrent ? 'selected' : ''}>${d.nome_completo}</option>`;
            }
        });

        const cells = activeCols.map(col => {
            switch (col.key) {
                case 'placa':
                    return `<td><span class="plate" onclick="event.stopPropagation(); openVehicleDetail('${v.id}')" style="cursor: pointer; transition: transform 0.2s; display: inline-block;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">${v.placa}</span></td>`;
                case 'modelo': return `<td>${v.modelo}</td>`;
                case 'km_atual': 
                    const displayKm = (v.km_atual || 0).toLocaleString('pt-BR');
                    return `<td><span style="font-weight: 700; color: var(--text-main);">${displayKm} <small style="color: var(--text-muted); font-weight: 400;">km</small></span></td>`;
                case 'condutor':
                    if (isAdmin) {
                        const statusAlocUpper = (v.status_alocacao || '').toUpperCase();
                        const currentVal = v.motorista_alocado_id || statusAlocUpper;
                        const sClass = getStatusClass(currentVal);
                        const isMaint = currentVal === 'MANUTENCAO';
                        
                        const logs = v.veiculo_situacoes_log || [];
                        const sortedLogs = [...logs].sort((a, b) => new Date(b.data) - new Date(a.data)).slice(0, 2);
                        const situacaoHtml = sortedLogs.length > 0 
                            ? sortedLogs.map(l => `• ${formatDate(l.data)}: ${l.descricao}`).join('<br>')
                            : '-';

                        const hasLogs = logs.length > 0;
                        const showInfo = isAdmin || isMaint || hasLogs;
                        const infoColor = isMaint ? '#f87171' : '#60a5fa'; // Red for maint, Blue for history
                        
                        const maintInfo = showInfo ? `
                            <div class="maint-tooltip-trigger" style="font-size: 0.7rem; color: ${infoColor}; margin-top: 4px; display: flex; align-items: center; gap: 4px; cursor: pointer; position: relative;" onclick="event.stopPropagation(); openMaintenanceModal('${v.id}')">
                                <i data-lucide="info" style="width: 12px; height: 12px;"></i>
                                <span>${isMaint ? (v.fornecedores?.nome || v.manutencao_oficina_id || 'Oficina não inf.') : (hasLogs ? 'Ver Histórico' : 'Registrar Ocorrência')}</span>
                                <div class="maint-tooltip">
                                    ${isMaint ? `<strong>Oficina:</strong> ${v.fornecedores?.nome || v.manutencao_oficina_id || '-'}<br>
                                    <strong>Motivo:</strong> ${v.manutencao_motivo || '-'}<br>` : ''}
                                    <strong>Últimas Situações:</strong><br>
                                    ${situacaoHtml}
                                </div>
                            </div>
                        ` : '';
                        const hasEditPerm = canDo('frota_alocacoes', 'edit');
                        const disabledAttr = hasEditPerm ? '' : 'disabled';
                        return `<td>
                            <select class="direct-select ${sClass}" ${disabledAttr} onchange="updateVehicleDriver('${v.id}', this.value); renderAll();">${options}</select>
                            ${maintInfo}
                        </td>`;
                    } else {
                        const statusAloc = (v.status_alocacao || '').toUpperCase();
                        const isMaint = statusAloc === 'MANUTENCAO';
                        const isMainStatus = ['GARAGEM', 'MANUTENCAO', 'DISPONIVEL'].includes(statusAloc);
                        const driverName = v.motorista_alocado ? v.motorista_alocado.nome_completo : (isMainStatus ? statusAloc : 'DISPONÍVEL');
                        const isClickable = !!v.motorista_alocado_id;
                        const sClass = getStatusClass(v.motorista_alocado_id || statusAloc);
                        
                        const logs = v.veiculo_situacoes_log || [];
                        const sortedLogs = [...logs].sort((a, b) => new Date(b.data) - new Date(a.data)).slice(0, 2);
                        const situacaoHtml = sortedLogs.length > 0 
                            ? sortedLogs.map(l => `• ${formatDate(l.data)}: ${l.descricao}`).join('<br>')
                            : '-';

                        const hasLogs = logs.length > 0;
                        const showInfo = isMaint || hasLogs;
                        const infoColor = isMaint ? '#f87171' : '#60a5fa';
                        
                        const maintDetail = showInfo ? `
                            <div class="maint-tooltip-trigger" style="font-size: 0.7rem; color: ${infoColor}; margin-top: 4px; display: flex; align-items: center; gap: 4px; cursor: pointer; position: relative;" onclick="event.stopPropagation(); openMaintenanceModal('${v.id}')">
                                <i data-lucide="info" style="width: 12px; height: 12px;"></i>
                                <span>${isMaint ? (v.fornecedores?.nome || v.manutencao_oficina_id || 'Oficina não inf.') : 'Histórico'}</span>
                                <div class="maint-tooltip">
                                    ${isMaint ? `<strong>Oficina:</strong> ${v.fornecedores?.nome || v.manutencao_oficina_id || '-'}<br>
                                    <strong>Motivo:</strong> ${v.manutencao_motivo || '-'}<br>` : ''}
                                    <strong>Situação:</strong><br>
                                    ${situacaoHtml}
                                </div>
                            </div>
                        ` : '';

                        return `<td>
                            <span class="${isClickable ? 'clickable-driver' : ''} ${sClass}" 
                                  onclick="${isClickable ? `event.stopPropagation(); openDriverDetail('${v.motorista_alocado_id}')` : ''}"
                                  style="${isClickable ? 'cursor: pointer; font-weight: 600;' : 'font-weight: 600;'}">
                                ${driverName.toUpperCase()}
                            </span>
                            ${maintDetail}
                        </td>`;
                    }
                case 'whats':
                    if (v.motorista_alocado && v.motorista_alocado.contato_whatsapp) {
                        const raw = v.motorista_alocado.contato_whatsapp;
                        const number = raw.replace(/\D/g, '');
                        return `
            <td class="contact">
                <a href="https://wa.me/${number}" target="_blank">
                    ${raw}
                </a>
            </td>
        `;
                    } else {
                        return `<td class="contact">-</td>`;
                    }
            }
        }).join('');

        return `<tr data-id="${v.id}">${cells}</tr>`;
    }).join('');

    // Aplica as cores nos selects após renderizar tudo
    document.querySelectorAll('.direct-select').forEach(select => {
        applySelectColor(select);
    });
    
    if (window.lucide) lucide.createIcons();
}

function toggleStatusFilter(status) {
    if (currentStatusFilter === status) {
        currentStatusFilter = null;
    } else {
        currentStatusFilter = status;
    }
    
    // Atualiza visual dos botões
    document.querySelectorAll('.filter-chip').forEach(btn => btn.classList.remove('active'));
    if (currentStatusFilter) {
        const activeBtn = document.getElementById(`filter-${currentStatusFilter}`);
        if (activeBtn) activeBtn.classList.add('active');
    }
    
    renderVehicles();
}

function toggleClassificationFilter(classif) {
    const index = currentClassificationFilters.indexOf(classif);
    if (index > -1) {
        currentClassificationFilters.splice(index, 1);
        document.getElementById(`filter-full-${classif}`).classList.remove('active');
    } else {
        currentClassificationFilters.push(classif);
        document.getElementById(`filter-full-${classif}`).classList.add('active');
    }
    
    renderFullVehicles();
}

const KNOWN_CLASSIFICATIONS = ['PROPRIO', 'TERCEIRO', 'ALUGADO', 'DIRETORIA', 'ESPECIAL', 'OUTRO'];

function updateClassificationCounts() {
    const counts = {
        PROPRIO: 0,
        TERCEIRO: 0,
        ALUGADO: 0,
        DIRETORIA: 0,
        ESPECIAL: 0,
        OUTRO: 0
    };

    vehicles.forEach(v => {
        const classif = v.classificacao;
        if (classif && counts.hasOwnProperty(classif)) {
            counts[classif]++;
        } else {
            // null, empty or unknown classification → bucket as OUTRO
            counts.OUTRO++;
        }
    });

    for (const [key, value] of Object.entries(counts)) {
        const el = document.getElementById(`count-${key}`);
        if (el) el.innerText = value;
    }
}

function updateStatusCounts() {
    const counts = {
        MANUTENCAO: 0,
        GARAGEM: 0,
        DISPONIVEL: 0
    };

    // Filtra apenas veículos ativos para o Dashboard de alocação (Exclui INATIVO e ATIVO - NÃO ALOCAR)
    const activeVehicles = vehicles.filter(v => (v.status === 'ATIVO' || !v.status));

    activeVehicles.forEach(v => {
        let status = (v.status_alocacao || 'DISPONIVEL').toUpperCase();
        if (status === 'DISPONÍVEL') status = 'DISPONIVEL';
        
        // Se possuir motorista alocado, não está disponível
        const hasDriver = !!v.motorista_alocado_id;
        if (status === 'DISPONIVEL' && hasDriver) {
            status = 'ALOCADO';
        }

        if (counts.hasOwnProperty(status)) {
            counts[status]++;
        }
    });

    for (const [key, value] of Object.entries(counts)) {
        const el = document.getElementById(`count-status-${key}`);
        if (el) el.innerText = value;
    }
}

async function updateVehicleDriver(vehicleId, driverId) {
    if (!client) return;

    // Se for manutenção, abre o modal antes de salvar o status básico
    if (driverId === "MANUTENCAO") {
        openMaintenanceModal(vehicleId, "MANUTENCAO");
        return; // O salvamento será feito pelo modal
    }

    try {
        let updateData = {};

        if (driverId === "GARAGEM" || driverId === "DISPONIVEL") {
            updateData = {
                motorista_alocado_id: null,
                status_alocacao: driverId
            };
        } else {
            updateData = {
                motorista_alocado_id: driverId || null,
                status_alocacao: null
            };
        }

        const { error } = await client
            .from('veiculos')
            .update(updateData)
            .eq('id', vehicleId);

        if (error) {
            console.error(error);
            alert('Erro ao atualizar');
        }

        fetchVehicles(); // Recarrega para atualizar a UI
    } catch (err) {
        console.error(err);
    }
}

// --- Maintenance Status Handlers ---

function openMaintenanceModal(vehicleId, intendedStatus = null) {
    const v = vehicles.find(item => item.id === vehicleId);
    if (!v) return;

    document.getElementById('maintVehicleId').value = vehicleId;
    document.getElementById('maintPendingStatus').value = intendedStatus || '';
    document.getElementById('maintOficinaSelect').value = v.fornecedores?.nome || v.manutencao_oficina_id || '';
    document.getElementById('maintMotivo').value = v.manutencao_motivo || '';
    
    // Reset novo log
    document.getElementById('newLogDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('newLogDesc').value = '';

    document.getElementById('maintenanceModal').style.display = 'flex';
    fetchMaintLogs(vehicleId);
}

function closeMaintenanceModal() {
    document.getElementById('maintPendingStatus').value = '';
    document.getElementById('maintenanceModal').style.display = 'none';
    renderAll(); 
}

async function fetchMaintLogs(vehicleId) {
    const container = document.getElementById('maintLogHistory');
    if (!container) return;

    try {
        const { data, error } = await client
            .from('veiculo_situacoes_log')
            .select('*')
            .eq('veiculo_id', vehicleId)
            .order('data', { ascending: false });

        if (error) throw error;

        maintLogs = data || [];
        renderMaintLogs();
    } catch (err) {
        console.error('Erro ao buscar logs:', err);
        container.innerHTML = '<p style="color: var(--danger);">Erro ao carregar histórico.</p>';
    }
}

function renderMaintLogs() {
    const container = document.getElementById('maintLogHistory');
    if (!container) return;

    if (maintLogs.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-muted); font-size: 0.9rem;">Nenhum registro encontrado.</p>';
        return;
    }

    // Garante ordem: mais recente primeiro
    const sortedLogs = [...maintLogs].sort((a, b) => new Date(b.data) - new Date(a.data));

    container.innerHTML = sortedLogs.map(log => `
        <div class="maint-log-item" style="display: flex; gap: 1rem; padding: 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.05); align-items: flex-start;">
            <div class="maint-log-date" style="font-weight: 700; color: var(--primary); min-width: 100px;">${formatDate(log.data)}</div>
            <div class="maint-log-desc" style="flex: 1; font-size: 0.9rem;">${log.descricao}</div>
            <div class="maint-log-actions" style="display: flex; gap: 0.5rem; align-items: center;">
                <button type="button" class="btn-edit" onclick="sendMaintLogNotification('${log.id}', event)" title="Enviar notificação WhatsApp" style="padding: 4px; visibility: visible; color: #25D366; border-color: rgba(37,211,102,0.3); background: rgba(37,211,102,0.08);">
                    <i data-lucide="send" style="width: 14px;"></i>
                </button>
                <button type="button" class="btn-edit" onclick="editMaintLog('${log.id}')" title="Editar" style="padding: 4px; visibility: visible;">
                    <i data-lucide="edit-2" style="width: 14px;"></i>
                </button>
                <button type="button" class="btn-edit btn-delete" onclick="deleteMaintLog('${log.id}')" title="Excluir" style="padding: 4px; visibility: visible;">
                    <i data-lucide="trash-2" style="width: 14px;"></i>
                </button>
            </div>
        </div>
    `).join('');
    if (window.lucide) lucide.createIcons();
}

async function sendMaintLogNotification(logId, event) {
    const log = maintLogs.find(l => l.id === logId);
    if (!log) return;

    const vehicleId = document.getElementById('maintVehicleId').value;
    const v = vehicles.find(item => item.id === vehicleId);
    const placa = v ? v.placa : '?';

    const oficinaNome = document.getElementById('maintOficinaSelect').value || 'Não informado';
    const motivo = document.getElementById('maintMotivo').value || 'Não informado';

    let statusMsgText = '';
    if (v) {
        const ns = (v.status_alocacao || '').toUpperCase();
        if (['MANUTENCAO', 'GARAGEM', 'DISPONIVEL'].includes(ns)) {
            statusMsgText = ns;
        } else if (v.motorista_alocado) {
            statusMsgText = v.motorista_alocado.nome_completo;
        } else {
            statusMsgText = 'DISPONÍVEL';
        }
    }

    const msg = `🚗 *FROTALINK - ATUALIZAÇÃO DO VEÍCULO* 🚗\n\n*${placa}*\n\n📅 *Data:* ${formatDate(log.data)}\n📝 *Histórico:* ${log.descricao}\n\n🔧 *Status Atual:* ${statusMsgText.toUpperCase()}\n📍 *Local:* ${oficinaNome}\n⚠️ *Motivo:* ${motivo}\n\n----------------------------------------------`;

    const btn = event?.currentTarget;
    if (btn && btn.disabled) return;
    if (btn) btn.disabled = true;

    try {
        await sendWhatsAppNotification(msg);
        alert('✅ Notificação enviada!');
    } catch (err) {
        console.error(err);
        alert('❌ Erro ao enviar notificação.');
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function addMaintLog() {
    const vehicleId = document.getElementById('maintVehicleId').value;
    const data = document.getElementById('newLogDate').value;
    const desc = document.getElementById('newLogDesc').value;

    if (!desc) return alert('Descreva a situação.');

    try {
        const { error } = await client
            .from('veiculo_situacoes_log')
            .insert([{ veiculo_id: vehicleId, data, descricao: desc }]);

        if (error) throw error;

        document.getElementById('newLogDesc').value = '';
        fetchMaintLogs(vehicleId);
        fetchVehicles(); // 🔄 Atualiza o dashboard para mostrar a nova situação imediatamente
    } catch (err) {
        alert('Erro ao salvar log: ' + err.message);
    }
}

async function deleteMaintLog(logId) {
    if (!confirm('Excluir este registro do histórico?')) return;
    try {
        const { error } = await client.from('veiculo_situacoes_log').delete().eq('id', logId);
        if (error) throw error;
        const vehicleId = document.getElementById('maintVehicleId').value;
        fetchMaintLogs(vehicleId);
        fetchVehicles(); // 🔄 Atualiza o dashboard
    } catch (err) {
        alert('Erro ao excluir: ' + err.message);
    }
}

async function editMaintLog(logId) {
    const log = maintLogs.find(l => l.id === logId);
    if (!log) return;

    const novaDesc = prompt('Editar descrição:', log.descricao);
    if (novaDesc === null || novaDesc === log.descricao) return;

    try {
        const { error } = await client
            .from('veiculo_situacoes_log')
            .update({ descricao: novaDesc })
            .eq('id', logId);

        if (error) throw error;
        const vehicleId = document.getElementById('maintVehicleId').value;
        fetchMaintLogs(vehicleId);
        fetchVehicles(); // 🔄 Atualiza o dashboard
    } catch (err) {
        alert('Erro ao editar: ' + err.message);
    }
}

async function handleMaintenanceSubmit(e) {
    e.preventDefault();
    if (!client) return;

    const vehicleId = document.getElementById('maintVehicleId').value;
    const oficinaInput = document.getElementById('maintOficinaSelect');
    const oficinaNome = oficinaInput ? oficinaInput.value : 'Não informado';
    const motivo = document.getElementById('maintMotivo').value;

    try {
        const v = vehicles.find(item => item.id === vehicleId);
        const currentStatus = v ? v.status_alocacao : null;
        const pendingStatus = document.getElementById('maintPendingStatus').value;
        
        let newStatus = pendingStatus || currentStatus;

        const { error } = await client
            .from('veiculos')
            .update({
                status_alocacao: newStatus,
                motorista_alocado_id: newStatus === 'MANUTENCAO' ? null : (v ? v.motorista_alocado_id : null),
                manutencao_oficina_id: oficinaNome || null,
                manutencao_motivo: motivo
            })
            .eq('id', vehicleId);

        if (error) throw error;

        alert('Informações atualizadas com sucesso!');
        document.getElementById('maintPendingStatus').value = '';
        document.getElementById('maintenanceModal').style.display = 'none';
        fetchVehicles();
    } catch (err) {
        console.error('Erro ao salvar manutenção:', err);
        alert('Falha ao salvar: ' + err.message);
    }
}

function updateMaintenanceDropdown() {
    const select = document.getElementById('maintOficinaSelect');
    if (!select || select.tagName !== 'SELECT') return;
    
    const currentVal = select.value;
    
    let options = '<option value="">Selecione uma oficina...</option>';
    oficinas.forEach(o => {
        options += `<option value="${o.id}">${o.nome} (${o.cidade || 'Sem cidade'})</option>`;
    });
    select.innerHTML = options;

    if (currentVal) select.value = currentVal;
}

async function fetchOficinas() {
    if (!client) return;
    try {
        const { data, error } = await client
            .from('fornecedores')
            .select('*')
            .eq('categoria', 'OFICINA')
            .order('nome');
        
        if (error) throw error;
        oficinas = data || [];
        updateMaintenanceDropdown();
    } catch (err) {
        console.error('Erro ao buscar oficinas:', err);
    }
}

function updateDriverDropdown() {
    if (driverSelect) {
        driverSelect.innerHTML = '<option value="">Selecione um motorista...</option>' +
            drivers.map(d => `<option value="${d.id}">${d.nome_completo} (${d.cpf})</option>`).join('');
    }
}

function renderFullVehicles() {
    const list = document.getElementById('fullVehicleList');
    if (!list) return;

    updateClassificationCounts(); // 📊 Atualiza os contadores de classificação
    renderThead('vehicles');

    const searchTerm = searchInput.value.toLowerCase();

    const searchWords = searchTerm.split(/\s+/).filter(w => w);
    const filtered = vehicles.filter(v => {
        // Filtro por Classificação (Multi-seleção)
        if (currentClassificationFilters.length > 0) {
            // Treat null/empty/unknown classification as 'OUTRO'
            const effectiveClass = (v.classificacao && KNOWN_CLASSIFICATIONS.includes(v.classificacao))
                ? v.classificacao
                : 'OUTRO';
            if (!currentClassificationFilters.includes(effectiveClass)) return false;
        }

        const searchableText = [
            v.placa,
            v.modelo,
            v.marca,
            v.chassi,
            v.motoristas?.nome_completo,
            v.motorista_alocado?.nome_completo,
            v.seguradora,
            v.numero_apolice,
            v.corretor_seguro
        ].map(val => (val || '').toLowerCase()).join(' ');

        return searchWords.every(word => searchableText.includes(word));
    });

    const activeCols = getActiveCols('vehicles');
    const sort = currentSort.vehicles;

    // Sorteia os dados filtrados
    filtered.sort((a, b) => {
        let valA, valB;
        if (sort.key === 'condutor_principal') {
            valA = (a.motoristas?.nome_completo || '').toLowerCase();
            valB = (b.motoristas?.nome_completo || '').toLowerCase();
        } else if (sort.key === 'motorista_alocado') {
            valA = (a.motorista_alocado?.nome_completo || '').toLowerCase();
            valB = (b.motorista_alocado?.nome_completo || '').toLowerCase();
        } else if (sort.key === 'marca_modelo') {
            valA = (a.marca || '') + (a.modelo || '');
            valB = (b.marca || '') + (b.modelo || '');
            valA = valA.toLowerCase(); valB = valB.toLowerCase();
        } else {
            valA = (a[sort.key] || '').toString().toLowerCase();
            valB = (b[sort.key] || '').toString().toLowerCase();
        }
        if (valA < valB) return sort.dir === 'asc' ? -1 : 1;
        if (valA > valB) return sort.dir === 'asc' ? 1 : -1;
        return 0;
    });

    const actionsHtml = (id) => `
        <div class="table-actions">
            <button class="btn-edit" onclick="editVehicle('${id}')" title="Editar" data-perm="frota_veiculos:edit">
                <i data-lucide="edit-2" style="width: 16px;"></i>
            </button>
            <button class="btn-edit btn-delete" onclick="deleteVehicle('${id}')" title="Excluir" data-perm="frota_veiculos:delete">
                <i data-lucide="x-circle" style="width: 16px;"></i>
            </button>
        </div>`;

    list.innerHTML = filtered.map(v => {
        const cells = activeCols.map(col => {
            switch (col.key) {
                case 'placa': return `<td><span class="plate">${v.placa}</span></td>`;
                case 'marca_modelo': return `<td>${v.marca || ''} ${v.modelo}</td>`;
                case 'proprietario': return `<td>${v.proprietario || '-'}</td>`;
                case 'venc_seguro': return `<td>${formatDate(v.vencimento_seguro)}</td>`;
                case 'seguradora': return `<td>${v.seguradora || '-'}</td>`;
                case 'numero_apolice': return `<td>${v.numero_apolice || '-'}</td>`;
                case 'valor_premio': return `<td>${v.valor_premio ? 'R$ ' + Number(v.valor_premio).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-'}</td>`;
                case 'valor_franquia': return `<td>${v.valor_franquia ? 'R$ ' + Number(v.valor_franquia).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-'}</td>`;
                case 'forma_pagamento': return `<td>${v.forma_pagamento || '-'}</td>`;
                case 'corretor_seguro': return `<td>${v.corretor_seguro || '-'}</td>`;
                case 'proponente_seguro': return `<td>${v.proponente_seguro || '-'}</td>`;
                case 'endosso_proposta': return `<td>${v.endosso_proposta || '-'}</td>`;
                case 'ci_seguro': return `<td>${v.ci_seguro || '-'}</td>`;
                case 'parcelas_pagamento': return `<td>${v.parcelas_pagamento || '-'}</td>`;
                case 'classificacao': return `<td>${v.classificacao || '-'}</td>`;
                case 'tipo_combustivel': return `<td><span style="font-size: 0.75rem; font-weight: 600; background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 4px;">${v.tipo_combustivel || '-'}</span></td>`;
                case 'condutor_principal': return `<td><span style="font-size:0.85rem; font-weight:600;">${v.motoristas ? v.motoristas.nome_completo : '-'}</span></td>`;
                case 'motorista_alocado': 
                    const statusAlocUpper = (v.status_alocacao || '').toUpperCase();
                    const isMain = ['GARAGEM', 'MANUTENCAO', 'DISPONIVEL'].includes(statusAlocUpper);
                    const dName = v.motorista_alocado ? v.motorista_alocado.nome_completo : (isMain ? statusAlocUpper : 'DISPONÍVEL');
                    return `<td><span style="font-size:0.85rem; font-weight:600; color: var(--primary);">${dName}</span></td>`;
                case 'status': 
                    let bClass = 'danger';
                    if (v.status === 'ATIVO' || !v.status) bClass = 'success';
                    else if (v.status === 'ATIVO - NÃO ALOCAR') bClass = 'warning';
                    return `<td><span class="badge ${bClass}">${v.status || 'ATIVO'}</span></td>`;
                case 'cor': return `<td>${v.cor || '-'}</td>`;
                case 'ano_fabricacao': return `<td>${v.ano_fabricacao || '-'}</td>`;
                case 'ano_modelo': return `<td>${v.ano_modelo || '-'}</td>`;
                case 'renavam': return `<td>${v.renavam || '-'}</td>`;
                case 'chassi': return `<td>${v.chassi || '-'}</td>`;
                case 'numero_motor': return `<td>${v.numero_motor || '-'}</td>`;
                case 'codigo_fipe': return `<td>${v.codigo_fipe || '-'}</td>`;
                case 'valor_fipe_mes': return `<td>${v.valor_fipe_mes ? 'R$ ' + Number(v.valor_fipe_mes).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-'}</td>`;
                case 'nome_documento': return `<td>${v.nome_documento || '-'}</td>`;
                case 'cpf_cnpj': return `<td>${v.cpf_cnpj || '-'}</td>`;
                case 'data_aquisicao_nf': return `<td>${formatDate(v.data_aquisicao_nf)}</td>`;
                case 'data_saida_nf': return `<td>${formatDate(v.data_saida_nf)}</td>`;
                case 'fornecedor_aquisicao': return `<td>${v.fornecedor_aquisicao || '-'}</td>`;
                case 'actions': return `<td>${actionsHtml(v.id)}</td>`;
                default: return `<td>-</td>`;
            }
        }).join('');
        return `<tr>${cells}</tr>`;
    }).join('');
    if (window.lucide) lucide.createIcons();
}

function renderFullDrivers() {
    const list = document.getElementById('fullDriverList');
    if (!list) return;

    renderThead('drivers');

    const searchTerm = searchInput.value.toLowerCase();
    const searchWords = searchTerm.split(/\s+/).filter(w => w);
    const filtered = drivers.filter(d => {
        const searchableText = [
            d.nome_completo,
            d.cpf,
            d.registro_cnh
        ].map(val => (val || '').toLowerCase()).join(' ');

        return searchWords.every(word => searchableText.includes(word));
    });

    const activeCols = getActiveCols('drivers');
    const sort = currentSort.drivers;

    // Sorteia os dados filtrados
    filtered.sort((a, b) => {
        let valA, valB;
        if (sort.key === 'idade') {
            valA = a.data_nascimento || '';
            valB = b.data_nascimento || '';
            // Ordem invertida para idade (data de nascimento)
            if (valA > valB) return sort.dir === 'asc' ? -1 : 1;
            if (valA < valB) return sort.dir === 'asc' ? 1 : -1;
        } else if (sort.key === 'vinculos_seguro') {
            valA = vehicles.filter(v => v.condutor_principal_id === a.id).length;
            valB = vehicles.filter(v => v.condutor_principal_id === b.id).length;
            if (valA < valB) return sort.dir === 'asc' ? -1 : 1;
            if (valA > valB) return sort.dir === 'asc' ? 1 : -1;
        } else {
            valA = (a[sort.key] || '').toString().toLowerCase();
            valB = (b[sort.key] || '').toString().toLowerCase();
        }
        if (valA < valB) return sort.dir === 'asc' ? -1 : 1;
        if (valA > valB) return sort.dir === 'asc' ? 1 : -1;
        return 0;
    });

    const actionsHtml = (id) => `
        <div class="table-actions">
            <button class="btn-edit" onclick="editDriver('${id}')" title="Editar" data-perm="frota_motoristas:edit">
                <i data-lucide="edit-2" style="width: 16px;"></i>
            </button>
            <button class="btn-edit btn-delete" onclick="deleteDriver('${id}')" title="Excluir" data-perm="frota_motoristas:delete">
                <i data-lucide="x-circle" style="width: 16px;"></i>
            </button>
        </div>`;

    list.innerHTML = filtered.map(d => {
        // Calcula vínculos de seguro manualmente para garantir que sempre funcione
        const vinculosCount = vehicles.filter(v => v.condutor_principal_id === d.id).length;

        const cells = activeCols.map(col => {
            switch (col.key) {
                case 'nome_completo': return `<td class="driver">${d.nome_completo}</td>`;
                case 'cpf': return `<td>${d.cpf || '-'}</td>`;
                case 'cnh_cat': return `<td>${d.registro_cnh || '-'} (${d.categoria_cnh || '-'})</td>`;
                case 'vencimento_cnh': return `<td>${formatDate(d.vencimento_cnh)}</td>`;
                case 'idade': return `<td>${calcAge(d.data_nascimento)}</td>`;
                case 'vinculos_seguro': return `<td style="font-weight:700;">${vinculosCount} veícs.</td>`;
                case 'contato_whatsapp': return `<td>${d.contato_whatsapp || '-'}</td>`;
                case 'data_nascimento': return `<td>${formatDate(d.data_nascimento)}</td>`;
                case 'status': 
                    let bdClass = 'danger';
                    if (d.status === 'ATIVO') bdClass = 'success';
                    else if (d.status === 'ATIVO - NÃO ALOCAR') bdClass = 'warning';
                    return `<td><span class="badge ${bdClass}">${d.status}</span></td>`;
                case 'actions': return `<td>${actionsHtml(d.id)}</td>`;
                default: return `<td>-</td>`;
            }
        }).join('');
        return `<tr>${cells}</tr>`;
    }).join('');
    if (window.lucide) lucide.createIcons();
}

// Helper: calcula idade a partir da data de nascimento
function calcAge(birthDateStr) {
    if (!birthDateStr) return '-';
    const today = new Date();
    const birth = new Date(birthDateStr);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age + ' anos';
}

// --- Funções Supabase ---

async function fetchDrivers() {
    if (!client) return;
    try {
        console.log('Buscando motoristas...');
        // Tenta buscar da View que tem o contador de seguros caso exista
        let { data, error } = await client.from('view_motoristas_vinculos').select('*').order('nome_completo');
        
        if (error) {
            console.warn('View de vínculos não encontrada, tentando tabela simples...', error.message);
            const fallback = await client.from('motoristas').select('*').order('nome_completo');
            if (fallback.error) throw fallback.error;
            data = fallback.data;
        }
        
        drivers = data || [];
        updateDriverDropdown();
        renderAll();
    } catch (err) {
        console.error('Erro ao buscar motoristas:', err);
    }
}

async function fetchVehicles() {
    if (!client) return;
    try {
        console.log('Buscando veículos...');
        // Seleção robusta que busca tanto o seguro quanto a alocação
        // Removido o join 'fornecedores:manutencao_oficina_id(nome)' que causava erro se a coluna fosse texto puro
        let { data, error } = await client
            .from('veiculos')
            .select(`
                *, 
                motoristas:condutor_principal_id(nome_completo, contato_whatsapp), 
                motorista_alocado:motorista_alocado_id(nome_completo, contato_whatsapp),
                veiculo_situacoes_log(id, data, descricao)
            `)
            .order('placa', { ascending: true });

        if (error) {
            console.warn('Erro na busca principal, tentando fallback com logs...', error.message);
            const fallback = await client
                .from('veiculos')
                .select(`
                    *, 
                    motoristas:condutor_principal_id(nome_completo, contato_whatsapp),
                    motorista_alocado:motorista_alocado_id(nome_completo, contato_whatsapp),
                    veiculo_situacoes_log(id, data, descricao)
                `)
                .order('placa', { ascending: true });
            
            if (fallback.error) throw fallback.error;
            data = fallback.data;
        }

        vehicles = data || [];

        // --- Injeção do KM Atual Baseado no Último Abastecimento ---
        try {
            let allAbastecimentos = [];
            let from = 0;
            let to = 999;
            let finished = false;

            while (!finished) {
                const { data, error: kmError } = await client
                    .from('abastecimentos')
                    .select('veiculo_id, km_atual, data, horario')
                    .order('data', { ascending: true })
                    .order('horario', { ascending: true })
                    .range(from, to);

                if (kmError) {
                    console.warn('Erro ao buscar KM dos abastecimentos:', kmError);
                    finished = true;
                } else if (!data || data.length === 0) {
                    finished = true;
                } else {
                    allAbastecimentos = allAbastecimentos.concat(data);
                    if (data.length < 1000) finished = true;
                    else { from += 1000; to += 1000; }
                }
            }

            if (allAbastecimentos.length > 0) {
                const kmMap = {};
                allAbastecimentos.forEach(ab => {
                    const kmVal = parseFloat(ab.km_atual) || 0;
                    kmMap[ab.veiculo_id] = kmVal;
                });

                vehicles.forEach(v => {
                    v.km_atual = kmMap[v.id] || v.km_atual || 0;
                });
                console.log('KM Atual injetado nos veículos (cronológico):', Object.keys(kmMap).length, 'vínculos encontrados.');
            }
        } catch (kmErr) {
            console.error('Falha na injeção de KM:', kmErr);
        }

        renderAll();
    } catch (err) {
        console.error('Erro ao buscar veículos:', err);
    }
}

// --- Funções de Exportação e Importação ---

async function fetchFuelTypes() {
    if (!client) return;
    try {
        const { data, error } = await client
            .from('tipos_combustivel')
            .select('*')
            .order('descricao');
        if (error) throw error;
        fuelTypes = data || [];
        updateFuelTypeDropdown();
    } catch (err) {
        console.error('Erro ao buscar combustíveis:', err);
    }
}

function updateFuelTypeDropdown() {
    const select = document.getElementById('addTipoCombustivel');
    if (!select) return;
    
    if (fuelTypes.length === 0) {
        select.innerHTML = '<option value="">Nenhum cadastrado</option>';
        return;
    }

    select.innerHTML = fuelTypes.map(f => `<option value="${f.descricao}">${f.descricao}</option>`).join('');
}

function exportFleetToExcel() {
    if (vehicles.length === 0) return alert('Não há dados para exportar.');

    // Exportar TODOS os campos cadastrados
    const exportData = vehicles.map(v => ({
        'Placa': v.placa,
        'Marca': v.marca,
        'Modelo': v.modelo,
        'Status': v.status,
        'Proprietário': v.proprietario,
        'RENAVAM': v.renavam,
        'Chassi': v.chassi,
        'Nº Motor': v.numero_motor,
        'Ano Fabricação': v.ano_fabricacao,
        'Ano Modelo': v.ano_modelo,
        'Cor': v.cor,
        'Seguradora': v.seguradora,
        'Venc. Seguro': formatDate(v.vencimento_seguro),
        'Proponente': v.proponente_seguro,
        'Corretor': v.corretor_seguro,
        'Nº Apólice': v.numero_apolice,
        'Valor Franquia': v.valor_franquia,
        'Valor Prêmio': v.valor_premio,
        'Parcelas': v.parcelas_pagamento,
        'Forma Pagamento': v.forma_pagamento,
        'Código FIPE': v.codigo_fipe,
        'Valor FIPE': v.valor_fipe_mes,
        'CPF/CNPJ Documento': v.cpf_cnpj,
        'Nome no Documento': v.nome_documento,
        'Fornecedor': v.fornecedor_aquisicao,
        'Data Aquisição': formatDate(v.data_aquisicao_nf),
        'Data Saída': formatDate(v.data_saida_nf),
        'Classificação': v.classificacao,
        'Alocação Atual': v.motorista_alocado ? v.motorista_alocado.nome_completo : (['GARAGEM', 'MANUTENCAO', 'DISPONIVEL'].includes((v.status_alocacao || '').toUpperCase()) ? v.status_alocacao : (v.motoristas ? v.motoristas.nome_completo : 'DISPONÍVEL'))
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Frota_Completa");
    XLSX.writeFile(wb, `Frota_Veritas_Completa_${new Date().toLocaleDateString()}.xlsx`);
}

function exportFleetToPDF() {
    if (vehicles.length === 0) return alert('Não há dados para exportar.');

    const { jsPDF } = window.jspdf;
    
    // 1. Aplicar a mesma filtragem da visualização
    const searchTerm = searchInput.value.toLowerCase();
    const searchWords = searchTerm.split(/\s+/).filter(w => w);
    let filtered = vehicles.filter(v => {
        const searchableText = [
            v.placa,
            v.modelo,
            v.marca,
            v.motoristas?.nome_completo,
            v.motorista_alocado?.nome_completo,
            v.seguradora,
            v.numero_apolice,
            v.corretor_seguro
        ].map(val => (val || '').toLowerCase()).join(' ');

        return searchWords.every(word => searchableText.includes(word));
    });

    // 2. Aplicar a mesma ordenação
    const sort = currentSort.vehicles;
    filtered.sort((a, b) => {
        let valA, valB;
        if (sort.key === 'condutor_principal') {
            valA = (a.motoristas?.nome_completo || '').toLowerCase();
            valB = (b.motoristas?.nome_completo || '').toLowerCase();
        } else if (sort.key === 'motorista_alocado') {
            valA = (a.motorista_alocado?.nome_completo || '').toLowerCase();
            valB = (b.motorista_alocado?.nome_completo || '').toLowerCase();
        } else if (sort.key === 'marca_modelo') {
            valA = (a.marca || '') + (a.modelo || '');
            valB = (b.marca || '') + (b.modelo || '');
            valA = valA.toLowerCase(); valB = valB.toLowerCase();
        } else {
            valA = (a[sort.key] || '').toString().toLowerCase();
            valB = (b[sort.key] || '').toString().toLowerCase();
        }
        if (valA < valB) return sort.dir === 'asc' ? -1 : 1;
        if (valA > valB) return sort.dir === 'asc' ? 1 : -1;
        return 0;
    });

    // 3. Obter colunas ativas (removendo ações)
    const activeCols = getActiveCols('vehicles').filter(c => c.key !== 'actions');
    
    // Determinar orientação baseada no número de colunas
    const doc = new jsPDF(activeCols.length > 7 ? 'l' : 'p', 'mm', 'a4');

    doc.setFontSize(18);
    doc.text("Relatório Geral da Frota - VERITAS", 14, 20);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleString()}`, 14, 28);
    if (searchTerm) {
        doc.text(`Filtro aplicado: "${searchTerm}"`, 14, 33);
    }

    const head = [activeCols.map(c => c.label)];
    const body = filtered.map(v => {
        return activeCols.map(col => {
            switch (col.key) {
                case 'placa': return v.placa;
                case 'marca_modelo': return `${v.marca || ''} ${v.modelo}`;
                case 'proprietario': return v.proprietario || '-';
                case 'venc_seguro': return formatDate(v.vencimento_seguro);
                case 'seguradora': return v.seguradora || '-';
                case 'numero_apolice': return v.numero_apolice || '-';
                case 'valor_premio': return v.valor_premio ? 'R$ ' + Number(v.valor_premio).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-';
                case 'valor_franquia': return v.valor_franquia ? 'R$ ' + Number(v.valor_franquia).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-';
                case 'forma_pagamento': return v.forma_pagamento || '-';
                case 'corretor_seguro': return v.corretor_seguro || '-';
                case 'classificacao': return v.classificacao || '-';
                case 'status': return v.status || 'ATIVO';
                case 'cor': return v.cor || '-';
                case 'ano_fabricacao': return v.ano_fabricacao || '-';
                case 'ano_modelo': return v.ano_modelo || '-';
                case 'renavam': return v.renavam || '-';
                case 'chassi': return v.chassi || '-';
                case 'codigo_fipe': return v.codigo_fipe || '-';
                case 'condutor_principal': return v.motoristas ? v.motoristas.nome_completo : '-';
                case 'motorista_alocado': 
                    const statusAlocUpper = (v.status_alocacao || '').toUpperCase();
                    const isMain = ['GARAGEM', 'MANUTENCAO', 'DISPONIVEL'].includes(statusAlocUpper);
                    return v.motorista_alocado ? v.motorista_alocado.nome_completo : (isMain ? statusAlocUpper : (v.motoristas ? v.motoristas.nome_completo : 'DISPONÍVEL'));
                case 'data_aquisicao_nf': return formatDate(v.data_aquisicao_nf);
                case 'data_saida_nf': return formatDate(v.data_saida_nf);
                case 'numero_motor': return v.numero_motor || '-';
                case 'proponente_seguro': return v.proponente_seguro || '-';
                case 'endosso_proposta': return v.endosso_proposta || '-';
                case 'ci_seguro': return v.ci_seguro || '-';
                case 'parcelas_pagamento': return v.parcelas_pagamento || '-';
                case 'valor_fipe_mes': return v.valor_fipe_mes ? 'R$ ' + Number(v.valor_fipe_mes).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-';
                case 'nome_documento': return v.nome_documento || '-';
                case 'cpf_cnpj': return v.cpf_cnpj || '-';
                case 'fornecedor_aquisicao': return v.fornecedor_aquisicao || '-';
                default: return '-';
            }
        });
    });

    doc.autoTable({
        startY: searchTerm ? 38 : 35,
        head: head,
        body: body,
        theme: 'striped',
        headStyles: { fillColor: [79, 70, 229] },
        styles: { fontSize: 8, cellPadding: 2 }
    });

    doc.save(`Frota_Veritas_${new Date().toISOString().split('T')[0]}.pdf`);
}

function exportDriversToExcel() {
    if (drivers.length === 0) return alert('Não há motoristas para exportar.');

    const exportData = drivers.map(d => ({
        'Nome Completo': d.nome_completo,
        'CPF': d.cpf || '',
        'Idade': calcAge(d.data_nascimento),
        'Data Nascimento': formatDate(d.data_nascimento),
        'WhatsApp': d.contato_whatsapp || '',
        'Registro CNH': d.registro_cnh || '',
        'Categoria CNH': d.categoria_cnh || '',
        'Vencimento CNH': formatDate(d.vencimento_cnh),
        'Status': d.status || 'ATIVO',
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Equipe_Completa");
    XLSX.writeFile(wb, `Equipe_Veritas_${new Date().toLocaleDateString()}.xlsx`);
}

function exportDriversToPDF() {
    if (drivers.length === 0) return alert('Não há motoristas para exportar.');

    const { jsPDF } = window.jspdf;
    
    // 1. Aplicar a mesma filtragem da visualização
    const searchTerm = searchInput.value.toLowerCase();
    const searchWords = searchTerm.split(/\s+/).filter(w => w);
    let filtered = drivers.filter(d => {
        const searchableText = [
            d.nome_completo,
            d.cpf,
            d.registro_cnh
        ].map(val => (val || '').toLowerCase()).join(' ');

        return searchWords.every(word => searchableText.includes(word));
    });

    // 2. Aplicar a mesma ordenação
    const sort = currentSort.drivers;
    filtered.sort((a, b) => {
        let valA, valB;
        if (sort.key === 'idade') {
            valA = a.data_nascimento || '';
            valB = b.data_nascimento || '';
            if (valA > valB) return sort.dir === 'asc' ? -1 : 1;
            if (valA < valB) return sort.dir === 'asc' ? 1 : -1;
        } else if (sort.key === 'vinculos_seguro') {
            valA = vehicles.filter(v => v.condutor_principal_id === a.id).length;
            valB = vehicles.filter(v => v.condutor_principal_id === b.id).length;
            if (valA < valB) return sort.dir === 'asc' ? -1 : 1;
            if (valA > valB) return sort.dir === 'asc' ? 1 : -1;
        } else {
            valA = (a[sort.key] || '').toString().toLowerCase();
            valB = (b[sort.key] || '').toString().toLowerCase();
        }
        if (valA < valB) return sort.dir === 'asc' ? -1 : 1;
        if (valA > valB) return sort.dir === 'asc' ? 1 : -1;
        return 0;
    });

    // 3. Obter colunas ativas (removendo ações)
    const activeCols = getActiveCols('drivers').filter(c => c.key !== 'actions');
    
    // Determinar orientação
    const doc = new jsPDF(activeCols.length > 7 ? 'l' : 'p', 'mm', 'a4');

    doc.setFontSize(18);
    doc.text("Relatório de Equipe - VERITAS", 14, 20);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleString()}`, 14, 28);
    if (searchTerm) {
        doc.text(`Filtro aplicado: "${searchTerm}"`, 14, 33);
    }

    const head = [activeCols.map(c => c.label)];
    const body = filtered.map(d => {
        const vinculosCount = vehicles.filter(v => v.condutor_principal_id === d.id).length;
        return activeCols.map(col => {
            switch (col.key) {
                case 'nome_completo': return d.nome_completo;
                case 'cpf': return d.cpf || '-';
                case 'cnh_cat': return `${d.registro_cnh || '-'} (${d.categoria_cnh || '-'})`;
                case 'vencimento_cnh': return formatDate(d.vencimento_cnh);
                case 'idade': return calcAge(d.data_nascimento);
                case 'vinculos_seguro': return `${vinculosCount} veícs.`;
                case 'contato_whatsapp': return d.contato_whatsapp || '-';
                case 'data_nascimento': return formatDate(d.data_nascimento);
                case 'status': return d.status || 'ATIVO';
                default: return '-';
            }
        });
    });

    doc.autoTable({
        startY: searchTerm ? 38 : 35,
        head: head,
        body: body,
        theme: 'striped',
        headStyles: { fillColor: [79, 70, 229] },
        styles: { fontSize: 9, cellPadding: 2 }
    });

    doc.save(`Equipe_Veritas_${new Date().toISOString().split('T')[0]}.pdf`);
}

function importFleetFromExcel(input) {
    if (!isAdmin) return alert('Modo Edição deve estar ativo para importar dados.');

    const file = input.files[0];
    if (!file || !client) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);

            if (jsonData.length === 0) return alert('O arquivo está vazio.');

            // Mapear colunas do Excel para o Banco (exemplo básico)
            const vehiclesToInsert = jsonData.map(row => ({
                placa: (row['Placa'] || row['placa'] || '').toUpperCase(),
                modelo: row['Modelo'] || row['modelo'] || 'Não Informado',
                marca: row['Marca'] || row['marca'] || '',
                proprietario: row['Proprietário'] || row['proprietario'] || '',
                status: 'ATIVO',
                classificacao: 'CASA'
            })).filter(v => v.placa !== '');

            console.log('Importando:', vehiclesToInsert);

            const { error } = await client.from('veiculos').upsert(vehiclesToInsert, { onConflict: 'placa' });

            if (error) throw error;

            alert(`${vehiclesToInsert.length} veículos importados/atualizados com sucesso!`);
            fetchVehicles();
        } catch (err) {
            console.error('Erro na importação:', err);
            alert('Falha ao importar Excel. Verifique se as colunas estão corretas (Placa, Modelo, Marca).');
        } finally {
            input.value = ''; // Reset input
        }
    };
    reader.readAsArrayBuffer(file);
}

// --- Handlers de Cadastro ---

async function handleAddVehicle(e) {
    e.preventDefault();
    if (!client) {
        alert('Supabase não configurado. Adicione sua URL e Key no topo do app.js');
        return;
    }

    const vehicleId = document.getElementById('addVehicleId').value;
    if (vehicleId && !canDo('frota_veiculos', 'edit')) {
        alert('Você não tem permissão para editar veículos.');
        return;
    }
    if (!vehicleId && !canDo('frota_veiculos', 'add')) {
        alert('Você não tem permissão para cadastrar novos veículos.');
        return;
    }

    const getVal = (id) => {
        const el = document.getElementById(id);
        return el && el.value.trim() !== '' ? el.value.trim() : null;
    };

    const getNum = (id) => {
        const val = document.getElementById(id).value;
        return val !== '' ? parseFloat(val) : 0;
    };

    const getInt = (id) => {
        const val = document.getElementById(id).value;
        return val !== '' ? parseInt(val) : null;
    };

    // Pega a placa ou gera erro se nula
    const rawPlaca = getVal('addPlaca');
    if (!rawPlaca) {
        alert('A Placa é obrigatória para o cadastro.');
        return;
    }

    const vehicleData = {
        placa: rawPlaca.toUpperCase(),
        renavam: getVal('addRenavam'),
        proprietario: getVal('addProprietario'),
        classificacao: getVal('addClassificacao'),
        tipo_combustivel: getVal('addTipoCombustivel'),
        seguradora: getVal('addSeguradora'),
        vencimento_seguro: getVal('addVencimentoSeguro'),
        proponente_seguro: getVal('addProponenteSeguro'),
        condutor_principal_id: getVal('addCondutorPrincipalId'),
        corretor_seguro: getVal('addCorretorSeguro'),
        numero_apolice: getVal('addNumeroApolice'),
        endosso_proposta: getVal('addEndosso'),
        ci_seguro: getVal('addCiSeguro'),
        valor_franquia: getNum('addValorFranquia'),
        valor_premio: getNum('addValorPremio'),
        forma_pagamento: getVal('addFormaPagamento'),
        parcelas_pagamento: getInt('addParcelas'),
        nome_documento: getVal('addNomeDocumento'),
        cpf_cnpj: getVal('addCpfCnpj'),
        codigo_fipe: getVal('addCodigoFipe'),
        valor_fipe_mes: getNum('addValorFipeMes'),
        chassi: getVal('addChassi'),
        numero_motor: getVal('addNumeroMotor'),
        ano_fabricacao: getInt('addAnoFabricacao'),
        ano_modelo: getInt('addAnoModelo'),
        marca: getVal('addMarca'),
        modelo: getVal('addModelo') || 'Sem Modelo', // Deixar pelo menos um nome pra tabela
        cor: getVal('addCor'),
        data_aquisicao_nf: getVal('addDataAquisicaoNF'),
        data_saida_nf: getVal('addDataSaidaNF'),
        fornecedor_aquisicao: getVal('addFornecedorAquisicao'),
        status: getVal('addStatus') || 'ATIVO',
        inativo_motivo: getVal('addStatus') === 'INATIVO' ? getVal('addInativoMotivo') : null,
        inativo_data: getVal('addStatus') === 'INATIVO' ? getVal('addInativoData') : null,
        inativo_beneficiario: getVal('addStatus') === 'INATIVO' ? getVal('addInativoBeneficiario') : null,
        inativo_valor: getVal('addStatus') === 'INATIVO' ? getNum('addInativoValor') : null,
        ignorar_media: document.getElementById('addIgnorarMedia').checked
    };

    console.log('Tentando salvar veículo:', vehicleData);

    try {
        const id = document.getElementById('addVehicleId').value;
        let result;

        if (id) {
            // Update
            result = await client.from('veiculos').update(vehicleData).eq('id', id);
        } else {
            // Insert
            result = await client.from('veiculos').insert([vehicleData]);
        }

        if (result.error) throw result.error;

        closeAddModal();
        fetchVehicles();
        alert(id ? 'Veículo atualizado!' : 'Veículo cadastrado!');
    } catch (err) {
        console.error('Falha na operação:', err);
        alert('Erro ao cadastrar veículo: ' + (err.message || 'Verifique o console (F12) para detalhes.'));
    }
}

async function handleAddDriver(e) {
    e.preventDefault();
    if (!client) return;

    const driverId = document.getElementById('driverId').value;
    if (driverId && !canDo('frota_motoristas', 'edit')) {
        alert('Você não tem permissão para editar motoristas.');
        return;
    }
    if (!driverId && !canDo('frota_motoristas', 'add')) {
        alert('Você não tem permissão para cadastrar novos motoristas.');
        return;
    }

    const getVal = (id) => {
        const el = document.getElementById(id);
        return el && el.value.trim() !== '' ? el.value.trim() : null;
    };

    const nome = getVal('driverNome');
    if (!nome) {
        alert('O Nome Completo é necessário.');
        return;
    }

    const driverData = {
        nome_completo: nome,
        contato_whatsapp: getVal('driverWhats'),
        cpf: getVal('driverCpf'),
        registro_cnh: getVal('driverCnh'),
        vencimento_cnh: getVal('driverCnhVenc'),
        categoria_cnh: getVal('driverCategoria'),
        data_nascimento: getVal('driverNascimento'),
        status: getVal('driverStatus') || 'ATIVO'
    };

    console.log('Tentando salvar motorista:', driverData);

    try {
        const id = document.getElementById('driverId').value;
        let result;

        if (id) {
            // Update
            result = await client.from('motoristas').update(driverData).eq('id', id);
        } else {
            // Insert
            result = await client.from('motoristas').insert([driverData]);
        }

        if (result.error) throw result.error;

        closeDriverModal();
        fetchDrivers();
        alert(id ? 'Motorista atualizado com sucesso!' : 'Motorista cadastrado com sucesso!');
    } catch (err) {
        console.error('Falha na operação:', err);
        alert('Erro ao salvar motorista: ' + (err.message || 'Erro de conexão ou CPF duplicado.'));
    }
}

// --- Funções de Exclusão ---
async function deleteVehicle(id) {
    if (!canDo('frota_veiculos', 'delete')) { alert('Você não tem permissão para excluir veículos.'); return; }
    if (!confirm('Deseja realmente excluir este veículo? Esta ação não pode ser desfeita.')) return;

    try {
        const { error } = await client.from('veiculos').delete().eq('id', id);
        if (error) throw error;
        alert('Veículo excluído com sucesso!');
        fetchVehicles();
    } catch (err) {
        alert('Erro ao excluir: ' + err.message);
    }
}

async function deleteDriver(id) {
    if (!canDo('frota_motoristas', 'delete')) { alert('Você não tem permissão para excluir motoristas.'); return; }
    if (!confirm('Deseja realmente excluir este motorista?')) return;

    try {
        const { error } = await client.from('motoristas').delete().eq('id', id);
        if (error) throw error;
        alert('Motorista excluído com sucesso!');
        fetchDrivers();
    } catch (err) {
        alert('Erro ao excluir: Verifique se ele não está vinculado a algum veículo.');
    }
}

// --- Funções de Edição (Preenchimento) ---
function editVehicle(id) {
    const v = vehicles.find(item => item.id === id);
    if (!v) return;

    document.getElementById('vehicleModalTitle').innerText = 'Editar Veículo';
    document.getElementById('addVehicleId').value = v.id;
    document.getElementById('addPlaca').value = v.placa;
    document.getElementById('addRenavam').value = v.renavam || '';
    document.getElementById('addProprietario').value = v.proprietario || '';
    document.getElementById('addClassificacao').value = v.classificacao || 'CASA';
    document.getElementById('addTipoCombustivel').value = v.tipo_combustivel || 'DIESEL S-10';
    document.getElementById('addSeguradora').value = v.seguradora || '';
    document.getElementById('addVencimentoSeguro').value = v.vencimento_seguro || '';
    document.getElementById('addProponenteSeguro').value = v.proponente_seguro || '';
    document.getElementById('addCondutorPrincipalId').value = v.condutor_principal_id || '';
    document.getElementById('addCorretorSeguro').value = v.corretor_seguro || '';
    document.getElementById('addNumeroApolice').value = v.numero_apolice || '';
    document.getElementById('addEndosso').value = v.endosso_proposta || '';
    document.getElementById('addCiSeguro').value = v.ci_seguro || '';
    document.getElementById('addValorFranquia').value = v.valor_franquia || 0;
    document.getElementById('addValorPremio').value = v.valor_premio || 0;
    document.getElementById('addFormaPagamento').value = v.forma_pagamento || 'BOLETO';
    document.getElementById('addParcelas').value = v.parcelas_pagamento || 0;
    document.getElementById('addNomeDocumento').value = v.nome_documento || '';
    document.getElementById('addCpfCnpj').value = v.cpf_cnpj || '';
    document.getElementById('addCodigoFipe').value = v.codigo_fipe || '';
    document.getElementById('addValorFipeMes').value = v.valor_fipe_mes || 0;
    document.getElementById('addChassi').value = v.chassi || '';
    document.getElementById('addNumeroMotor').value = v.numero_motor || '';
    document.getElementById('addAnoFabricacao').value = v.ano_fabricacao || '';
    document.getElementById('addAnoModelo').value = v.ano_modelo || '';
    document.getElementById('addMarca').value = v.marca || 'VW';
    document.getElementById('addModelo').value = v.modelo || '';
    document.getElementById('addCor').value = v.cor || 'BRANCO';
    document.getElementById('addDataAquisicaoNF').value = v.data_aquisicao_nf || '';
    document.getElementById('addDataSaidaNF').value = v.data_saida_nf || '';
    document.getElementById('addFornecedorAquisicao').value = v.fornecedor_aquisicao || '';
    document.getElementById('addStatus').value = v.status || 'ATIVO';
    document.getElementById('addInativoMotivo').value = v.inativo_motivo || '';
    document.getElementById('addInativoData').value = v.inativo_data || '';
    document.getElementById('addInativoBeneficiario').value = v.inativo_beneficiario || '';
    document.getElementById('addInativoValor').value = v.inativo_valor || '';
    toggleInativoFields();
    calcularValorParcela();
    document.getElementById('addIgnorarMedia').checked = v.ignorar_media || false;

    addModal.style.display = 'flex';
}

function editDriver(id) {
    const d = drivers.find(item => item.id === id);
    if (!d) return;

    document.getElementById('driverModalTitle').innerText = 'Editar Motorista';
    document.getElementById('driverId').value = d.id;
    document.getElementById('driverNome').value = d.nome_completo;
    document.getElementById('driverWhats').value = d.contato_whatsapp || '';
    document.getElementById('driverCpf').value = d.cpf || '';
    document.getElementById('driverCnh').value = d.registro_cnh || '';
    document.getElementById('driverCnhVenc').value = d.vencimento_cnh || '';
    document.getElementById('driverCategoria').value = d.categoria_cnh || 'B';
    document.getElementById('driverNascimento').value = d.data_nascimento || '';
    document.getElementById('driverStatus').value = d.status || 'ATIVO';

    calculateAge();
    driverModal.style.display = 'flex';
}

// --- Modal Helpers ---

function toggleInativoFields() {
    const statusSelect = document.getElementById('addStatus');
    const inativoFields = document.getElementById('inativoFields');
    if (statusSelect && inativoFields) {
        if (statusSelect.value === 'INATIVO') {
            inativoFields.style.display = 'block';
        } else {
            inativoFields.style.display = 'none';
            // Clear values when not inactive
            document.getElementById('addInativoMotivo').value = '';
            document.getElementById('addInativoData').value = '';
            document.getElementById('addInativoBeneficiario').value = '';
            document.getElementById('addInativoValor').value = '';
        }
    }
}

/**
 * 📊 Calcula Valor por Parcela = Valor Prêmio / Qtd. Parcelas (Seguro)
 */
function calcularValorParcela() {
    const premio = parseFloat(document.getElementById('addValorPremio')?.value) || 0;
    const parcelas = parseInt(document.getElementById('addParcelas')?.value) || 0;
    const resultEl = document.getElementById('addValorParcelaSeguro');
    if (!resultEl) return;

    if (premio > 0 && parcelas > 0) {
        const valorParcela = premio / parcelas;
        resultEl.value = 'R$ ' + valorParcela.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } else {
        resultEl.value = '';
    }
}

function openAddModal() {
    document.getElementById('vehicleModalTitle').innerText = 'Cadastrar Novo Veículo';
    document.getElementById('addVehicleId').value = '';
    addForm.reset();
    toggleInativoFields();
    const parcelaEl = document.getElementById('addValorParcelaSeguro');
    if (parcelaEl) parcelaEl.value = '';
    addModal.style.display = 'flex';
}

function closeAddModal() { addModal.style.display = 'none'; addForm.reset(); }

function openDriverModal() {
    document.getElementById('driverModalTitle').innerText = 'Cadastrar Novo Motorista';
    document.getElementById('driverId').value = '';
    driverForm.reset();
    document.getElementById('driverIdade').value = '';
    driverModal.style.display = 'flex';
}
function closeDriverModal() { driverModal.style.display = 'none'; driverForm.reset(); }
function closeModal() { editModal.style.display = 'none'; } // Generic close for edit

// --- Real-time ---
function subscribeToChanges() {
    if (!client) return;
    client.channel('any').on('postgres_changes', { event: '*', schema: 'public' }, () => {
        fetchVehicles();
        fetchDrivers();
        fetchInativoMotivos();
    }).subscribe();
}

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    // Load saved column preferences first
    loadColConfig();
    if (addForm) addForm.addEventListener('submit', handleAddVehicle);
    if (driverForm) driverForm.addEventListener('submit', handleAddDriver);
    if (editForm) editForm.addEventListener('submit', handleEditAllocation);
    const statusSelect = document.getElementById('addStatus');
    if (statusSelect) statusSelect.addEventListener('change', toggleInativoFields);
    if (document.getElementById('maintenanceForm')) {
        document.getElementById('maintenanceForm').addEventListener('submit', handleMaintenanceSubmit);
    }
    if (searchInput) searchInput.addEventListener('input', renderVehicles);

    // Auto-calculate insurance daily rate
    const premioInput = document.getElementById('addValorPremio');
    if (premioInput) {
        premioInput.addEventListener('input', () => {
            const val = parseFloat(premioInput.value) || 0;
            const daily = (val / 365).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            document.getElementById('addValorDiaSeguro').value = daily;
        });
    }

    if (window.lucide) lucide.createIcons();
    fetchDrivers();
    fetchOficinas();
    fetchFuelTypes();
    fetchInativoMotivos();
    fetchVehicles();
    fetchWhatsAppConfig(); // 📱 Carregado UMA VEZ no init (não mais no renderAll)
    subscribeToChanges();

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            const btn = document.getElementById('clearSearch');
            if (btn) btn.style.display = searchInput.value ? 'flex' : 'none';
            renderAll();
        });
    }
});

function getStatusClass(val) {
    if (!val) return '';
    const s = val.toString().toUpperCase();
    if (s === 'GARAGEM') return 'status-garagem';
    if (s === 'MANUTENCAO') return 'status-manutencao';
    if (s === 'DISPONIVEL') return 'status-disponivel';
    // Se for um UUID (comprimento típico > 20)
    if (s.length > 20) return 'status-vinc';
    return '';
}

// applySelectColor mantido para compatibilidade, mas agora usa classes CSS
function applySelectColor(select) {
    const val = select.value;
    select.className = 'direct-select ' + getStatusClass(val);
}

function clearSearch() {
    if (searchInput) {
        searchInput.value = '';
        renderAll();
        const btn = document.getElementById('clearSearch');
        if (btn) btn.style.display = 'none';
    }
}

function toggleApiFields() {
    const type = document.getElementById('wa_api_type').value;
    document.getElementById('fields_evolution').style.display = type === 'evolution' ? 'grid' : 'none';
    document.getElementById('fields_callmebot').style.display = type === 'callmebot' ? 'block' : 'none';
    document.getElementById('group_wa_new_apikey').style.display = type === 'callmebot' ? 'block' : 'none';
}

// ============================================================
//  AUTOMAÇÃO WHATSAPP
// ============================================================

async function fetchWhatsAppConfig() {
    if (!client) return;
    try {
        const { data: config } = await client.from('whatsapp_config').select('*').single();
        if (config) whatsappConfig = config;

        const { data: dests } = await client.from('whatsapp_destinatarios').select('*').order('nome');
        whatsappDestinatarios = dests || [];
    } catch (err) {
        console.warn('Erro ao carregar configs de WhatsApp:', err);
    }
}

function openWhatsAppConfig() {
    document.getElementById('wa_api_type').value = whatsappConfig.api_type || 'evolution';
    document.getElementById('wa_api_url').value = whatsappConfig.api_url || '';
    document.getElementById('wa_instance').value = whatsappConfig.instance || '';
    document.getElementById('wa_apikey').value = whatsappConfig.apikey || '';
    
    toggleApiFields();
    renderWhatsAppDestinatarios();
    document.getElementById('whatsappConfigModal').style.display = 'flex';
}

function closeWhatsAppConfig() {
    document.getElementById('whatsappConfigModal').style.display = 'none';
}

function renderWhatsAppDestinatarios() {
    const list = document.getElementById('wa_numbers_list');
    if (!list) return;

    if (whatsappDestinatarios.length === 0) {
        list.innerHTML = '<p style="text-align: center; color: var(--text-muted); font-size: 0.8rem; padding: 1rem;">Nenhum número cadastrado.</p>';
        return;
    }

    list.innerHTML = whatsappDestinatarios.map((d, idx) => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.05);">
            <div>
                <div style="font-weight: 600; font-size: 0.9rem;">${d.nome}</div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">${d.numero}</div>
            </div>
            <button onclick="removeWhatsAppNumber('${d.id}')" style="background: none; border: none; color: var(--danger); cursor: pointer; padding: 0.5rem;">
                <i data-lucide="trash-2" style="width: 16px;"></i>
            </button>
        </div>
    `).join('');
    if (window.lucide) lucide.createIcons();
}

async function addWhatsAppNumber() {
    const nome = document.getElementById('wa_new_name').value;
    const numero = document.getElementById('wa_new_number').value;
    const apikey = document.getElementById('wa_new_apikey').value;

    if (!numero) return alert('Informe o número de WhatsApp.');

    try {
        const { data, error } = await client
            .from('whatsapp_destinatarios')
            .insert([{ nome, numero, ativo: true, apikey }])
            .select();

        if (error) throw error;
        
        whatsappDestinatarios.push(data[0]);
        document.getElementById('wa_new_name').value = '';
        document.getElementById('wa_new_number').value = '';
        document.getElementById('wa_new_apikey').value = '';
        renderWhatsAppDestinatarios();
    } catch (err) {
        alert('Erro ao adicionar número: ' + err.message);
    }
}

async function removeWhatsAppNumber(id) {
    if (!confirm('Remover este destinatário?')) return;
    try {
        const { error } = await client.from('whatsapp_destinatarios').delete().eq('id', id);
        if (error) throw error;
        whatsappDestinatarios = whatsappDestinatarios.filter(d => d.id !== id);
        renderWhatsAppDestinatarios();
    } catch (err) {
        alert('Erro ao remover: ' + err.message);
    }
}

async function saveWhatsAppConfig() {
    const api_type = document.getElementById('wa_api_type').value;
    const api_url = document.getElementById('wa_api_url').value;
    const instance = document.getElementById('wa_instance').value;
    const apikey = document.getElementById('wa_apikey').value;

    try {
        const { error } = await client
            .from('whatsapp_config')
            .upsert({ 
                id: whatsappConfig.id || undefined, 
                api_type: api_type,
                api_url: api_url,
                instance: instance,
                apikey: apikey
            });

        if (error) throw error;
        whatsappConfig.api_type = api_type;
        whatsappConfig.api_url = api_url;
        whatsappConfig.instance = instance;
        whatsappConfig.apikey = apikey;

        alert('Configurações salvas com sucesso!');
        closeWhatsAppConfig();
    } catch (err) {
        alert('Erro ao salvar: ' + err.message);
    }
}

async function sendWhatsAppNotification(message) {
    console.log('Tentando disparar notificação WhatsApp...', { 
        tipo: whatsappConfig.api_type, 
        destinatarios: whatsappDestinatarios.length 
    });

    if (whatsappDestinatarios.length === 0) {
        console.warn('Nenhum destinatário ativo cadastrado.');
        return;
    }

    const destinatariosAtivos = whatsappDestinatarios.filter(d => d.ativo);
    
    if (whatsappConfig.api_type === 'callmebot') {
        for (const destinatario of destinatariosAtivos) {
            const cleanNumber = destinatario.numero.replace(/\D/g, '');
            const targetKey = destinatario.apikey;
            
            if (!targetKey || targetKey.trim() === '') {
                console.warn(`Pulando ${destinatario.nome}: Sem API Key individual.`);
                continue;
            }

            const url = `https://api.callmebot.com/whatsapp.php?phone=${cleanNumber}&text=${encodeURIComponent(message)}&apikey=${targetKey}`;
            
            console.log(`Enviando via CallMeBot para: ${cleanNumber}`);
            // Removido Image().src para evitar envio duplo (o fetch já é suficiente)
            fetch(url, { mode: 'no-cors' }).catch(() => {});
        }
    } else {
        // Evolution API
        if (!whatsappConfig.api_url || !whatsappConfig.instance || !whatsappConfig.apikey) {
            console.error('Erro: Configurações da Evolution API incompletas.');
            return;
        }
        const endpoint = `${whatsappConfig.api_url}/message/sendText/${whatsappConfig.instance}`;
        
        for (const destinatario of destinatariosAtivos) {
            try {
                const cleanNumber = destinatario.numero.replace(/\D/g, '');
                console.log(`Enviando via Evolution para: ${cleanNumber}`);
                
                fetch(endpoint, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json', 
                        'apikey': whatsappConfig.apikey 
                    },
                    body: JSON.stringify({ number: cleanNumber, text: message })
                }).then(res => {
                    if (!res.ok) console.error('Evolution API retornou erro:', res.status);
                }).catch(err => console.error('Erro de rede na Evolution API:', err));
            } catch (err) {
                console.error(`Erro inesperado no envio Evolution:`, err);
            }
        }
    }
}

// --- Workshop Quick Add ---
window.openWorkshopModal = () => {
    document.getElementById('workshopModal').style.display = 'flex';
};

window.closeWorkshopModal = () => {
    document.getElementById('workshopModal').style.display = 'none';
};

window.saveWorkshop = async (e) => {
    e.preventDefault();
    const nome = document.getElementById('ws_nome').value;
    const cidade = document.getElementById('ws_cidade').value;
    const estado = document.getElementById('ws_estado').value;

    try {
        const { data, error } = await client
            .from('fornecedores')
            .insert([{ nome, cidade, estado, categoria: 'OFICINA' }])
            .select()
            .single();

        if (error) throw error;

        alert('Oficina cadastrada com sucesso!');
        document.getElementById('workshopForm').reset();
        closeWorkshopModal();

        // Atualizar lista e selecionar nova
        await fetchOficinas();
        document.getElementById('maintOficinaSelect').value = data.nome || nome;
    } catch (err) {
        console.error('Erro ao salvar oficina:', err);
        alert('Falha ao salvar oficina: ' + err.message);
    }
};
// --- Fuel Type Quick Add ---
window.openFuelTypeModal = () => {
    document.getElementById('fuelTypeModal').style.display = 'flex';
};

window.closeFuelTypeModal = () => {
    document.getElementById('fuelTypeModal').style.display = 'none';
};

window.saveFuelType = async (e) => {
    e.preventDefault();
    const descricao = document.getElementById('ft_desc').value;
    const unidade = document.getElementById('ft_unidade').value;

    try {
        const { data, error } = await client
            .from('tipos_combustivel')
            .insert([{ descricao, unidade }])
            .select()
            .single();

        if (error) throw error;

        alert('Tipo de combustível cadastrado com sucesso!');
        document.getElementById('fuelTypeForm').reset();
        closeFuelTypeModal();

        await fetchFuelTypes();
        
        // Seleciona o recém-criado
        const select = document.getElementById('addTipoCombustivel');
        if (select) select.value = data.descricao;
        
    } catch (err) {
        console.error('Erro ao salvar combustível:', err);
        alert('Falha ao salvar: ' + err.message);
    }
};
window.testWhatsAppMessage = () => {
    const type = document.getElementById('wa_api_type').value;
    const destinatario = whatsappDestinatarios[0]; // Testa com o primeiro da lista
    
    if (!destinatario) return alert('Cadastre pelo menos um número para testar.');

    const cleanNumber = destinatario.numero.replace(/\D/g, '');
    let testUrl = '';
    const testMsg = "FrotaLink - Teste de conexao bem-sucedido!";

    if (type === 'callmebot') {
        const apikey = document.getElementById('wa_new_apikey').value;
        if (!apikey) return alert('Insira a API Key no campo de cadastro para testar.');
        testUrl = `https://api.callmebot.com/whatsapp.php?phone=${cleanNumber}&text=${encodeURIComponent(testMsg)}&apikey=${apikey}`;
    } else {
        const apiUrl = document.getElementById('wa_api_url').value;
        const instance = document.getElementById('wa_instance').value;
        if (!apiUrl || !instance) return alert('Preencha os campos da Evolution API para testar.');
        
        alert('O teste da Evolution API é feito em background. Verifique seu console (F12).');
        sendWhatsAppNotification(testMsg);
        return;
    }

    if (testUrl) {
        window.open(testUrl, '_blank');
    }
};

// ============================================================
//  MOTIVOS DE INATIVAÇÃO DINÂMICOS
// ============================================================

async function fetchInativoMotivos() {
    if (!client) return;
    try {
        const { data, error } = await client.from('veiculo_motivos_inativacao').select('*').order('nome');
        if (error) throw error;
        inativoMotivos = data || [];
        renderInativoMotivos();
        updateInativoMotivosDropdown();
    } catch (err) {
        console.error('Erro ao buscar motivos de inativação:', err);
    }
}

function renderInativoMotivos() {
    const list = document.getElementById('motivos_inativos_list');
    if (!list) return;

    if (inativoMotivos.length === 0) {
        list.innerHTML = '<div style="text-align: center; color: var(--text-muted); font-size: 0.8rem; padding: 1rem;">Nenhum motivo cadastrado.</div>';
        return;
    }

    list.innerHTML = inativoMotivos.map(m => `
        <div style="background: rgba(255,255,255,0.02); padding: 1rem; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; border: 1px solid rgba(255,255,255,0.05);">
            <span style="font-weight: 700; font-size: 0.85rem; text-transform: uppercase; color: #fff;">${m.nome}</span>
            <button onclick="deleteMotivoInativo('${m.id}')" data-perm="frota_cadastros:delete" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 0.2rem; display: flex; align-items: center;" title="Excluir motivo">
                <i data-lucide="x" style="width: 14px; height: 14px;"></i>
            </button>
        </div>
    `).join('');
    if (window.lucide) lucide.createIcons();
}

function updateInativoMotivosDropdown() {
    const select = document.getElementById('addInativoMotivo');
    if (!select) return;

    const currentVal = select.value;
    select.innerHTML = '<option value="">Selecione...</option>' + 
        inativoMotivos.map(m => `<option value="${m.nome}">${m.nome}</option>`).join('');
    
    if (currentVal && inativoMotivos.some(m => m.nome === currentVal)) {
        select.value = currentVal;
    }
}

async function addMotivoInativo() {
    if (!canDo('frota_cadastros', 'add')) {
        alert('Você não tem permissão para adicionar motivos de inativação.');
        return;
    }
    const input = document.getElementById('new_motivo_inativo');
    if (!input) return;
    const nome = input.value.trim().toUpperCase();
    if (!nome) return alert('Digite um motivo.');

    try {
        const { error } = await client.from('veiculo_motivos_inativacao').insert([{ nome }]);
        if (error) throw error;
        input.value = '';
        await fetchInativoMotivos();
    } catch (err) {
        alert('Erro ao cadastrar motivo: ' + err.message);
    }
}

async function deleteMotivoInativo(id) {
    if (!canDo('frota_cadastros', 'delete')) {
        alert('Você não tem permissão para excluir motivos de inativação.');
        return;
    }
    if (!confirm('Deseja realmente excluir este motivo?')) return;
    try {
        const { error } = await client.from('veiculo_motivos_inativacao').delete().eq('id', id);
        if (error) throw error;
        await fetchInativoMotivos();
    } catch (err) {
        alert('Erro ao excluir: ' + err.message);
    }
}

