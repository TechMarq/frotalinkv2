const ADMIN_PASSWORD = "M@nu2398";

// --- Configuração Supabase ---
let supabaseClient = null;

// --- Estado Global ---
const state = {
    manutencoes: [],
    vehicles: [],
    oficinas: [],
    acoes: [],
    tipos: [],
    editingId: null,
    currentMaintItems: [],
    currentSetupTab: 'fornecedores',
    charts: {},
    showRowColors: false, // 🎨 Controle de visualização de cores nas linhas
    statusFilter: 'TODOS'
};

// --- Global Utilities ---
const cleanNumber = (val) => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    let s = String(val).replace('R$', '').trim();
    if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
    else if (s.includes(',')) s = s.replace(',', '.');
    return parseFloat(s) || 0;
};

const showToast = (msg, type = 'success') => {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toastMsg');
    if (!toast || !toastMsg) return;
    toastMsg.innerText = msg;
    toast.className = `toast active ${type}`;
    setTimeout(() => toast.classList.remove('active'), 3000);
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    if (typeof window.showLoader === 'function') window.showLoader();
    if (window.supabase) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        updateStatus('Conectado', 'success');
        await loadInitialData();
        setupFormListeners();
    } else {
        updateStatus('Erro Supabase', 'error');
    }
    if (typeof window.hideLoader === 'function') window.hideLoader();
});

function updateStatus(text, type) {
    const status = document.getElementById('connectionStatus');
    if (status) {
        status.querySelector('span').innerText = text;
        status.querySelector('.status-indicator').style.background = type === 'success' ? '#10b981' : '#ef4444';
    }
}

async function loadInitialData() {
    try {
        const { data: v } = await supabaseClient.from('veiculos').select('*').order('placa');
        const { data: o } = await supabaseClient.from('fornecedores').select('*').order('nome');
        const { data: a } = await supabaseClient.from('manutencao_acoes').select('*').order('descricao');
        const { data: t } = await supabaseClient.from('manutencao_tipos').select('*').order('descricao');

        let mData = null;
        let mError = null;

        // Tenta buscar usando o novo esquema (tipo_id nos itens)
        const resNew = await supabaseClient
            .from('manutencoes')
            .select(`
                *,
                veiculos:veiculo_id (placa, modelo),
                fornecedores:oficina_id (nome),
                manutencao_itens (
                    *,
                    manutencao_acoes:acao_id (descricao),
                    manutencao_tipos:tipo_id (descricao)
                )
            `)
            .order('data', { ascending: false });

        if (resNew.error) {
            console.warn('[Manutenção] Falha ao buscar no novo esquema (migração pendente?):', resNew.error.message);
            // Fallback para o esquema antigo (tipo_id no cabeçalho)
            const resOld = await supabaseClient
                .from('manutencoes')
                .select(`
                    *,
                    veiculos:veiculo_id (placa, modelo),
                    fornecedores:oficina_id (nome),
                    manutencao_tipos:tipo_id (descricao),
                    manutencao_itens (
                        *,
                        manutencao_acoes:acao_id (descricao)
                    )
                `)
                .order('data', { ascending: false });

            if (resOld.error) {
                mError = resOld.error;
            } else {
                mData = resOld.data;
                // Mapeia o tipo do cabeçalho para os itens temporariamente para exibição
                mData.forEach(m => {
                    if (m.manutencao_itens) {
                        m.manutencao_itens.forEach(i => {
                            if (!i.manutencao_tipos && m.manutencao_tipos) {
                                i.manutencao_tipos = { descricao: m.manutencao_tipos.descricao };
                            }
                            // Também popula tipo_id no item temporariamente para edição se necessário
                            if (!i.tipo_id && m.tipo_id) {
                                i.tipo_id = m.tipo_id;
                            }
                        });
                    }
                });
            }
        } else {
            mData = resNew.data;
        }

        if (mError || !mData) {
            console.error('Erro na busca de manutenções:', mError);
            const { data: pureM } = await supabaseClient.from('manutencoes').select('*').order('data', { ascending: false });
            state.manutencoes = pureM || [];
        } else {
            state.manutencoes = mData || [];
        }

        state.vehicles = v || [];
        state.oficinas = o || [];
        state.acoes = a || [];
        state.tipos = t || [];

        // --- Injeção do KM Atual Baseado no Último Abastecimento (com paginação) ---
        try {
            let allAbastecimentos = [];
            let from = 0, to = 999, finished = false;

            while (!finished) {
                const { data: pageData, error: kmError } = await supabaseClient
                    .from('abastecimentos')
                    .select('veiculo_id, km_atual, data, horario')
                    .order('data', { ascending: true })
                    .order('horario', { ascending: true })
                    .range(from, to);

                if (kmError || !pageData || pageData.length === 0) {
                    finished = true;
                } else {
                    allAbastecimentos = allAbastecimentos.concat(pageData);
                    if (pageData.length < 1000) finished = true;
                    else { from += 1000; to += 1000; }
                }
            }

            const kmMap = {};
            allAbastecimentos.forEach(ab => {
                const kmVal = parseFloat(ab.km_atual) || 0;
                kmMap[ab.veiculo_id] = kmVal;
            });

            state.vehicles.forEach(veh => {
                veh.km_atual = kmMap[veh.id] || parseFloat(veh.km_atual) || 0;
            });

            console.log('[Manutenção] KM injetado em', Object.keys(kmMap).length, 'veículos.');
        } catch (kmErr) {
            console.error('Erro ao buscar KM para alertas:', kmErr);
            // Fallback: usa km_atual da tabela veiculos
            state.vehicles.forEach(veh => {
                veh.km_atual = parseFloat(veh.km_atual) || 0;
            });
        }

        populateDropdowns();
        renderMaintTable();
        calculateMaintStats();
        renderMaintAlerts();
        renderSetupTables();
    } catch (err) {
        console.error('Erro crítico ao carregar dados:', err);
        showToast('Erro ao carregar dados: ' + err.message, 'error');
    }
}

function renderSetupTables() {
    if (state.currentSetupTab === 'acoes') {
        const tbody = document.getElementById('setup_acoes_list');
        if (tbody) {
            tbody.innerHTML = state.acoes.map(a => `
                <tr>
                    <td data-label="Descrição da Ação">${a.descricao}</td>
                    <td data-label="Ações" style="text-align: right; padding-right: 2rem;">
                        <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                            <button class="btn-action edit" onclick="openAcaoModal('${a.id}')" data-perm="manutencao_cadastros:edit"><i data-lucide="edit-3" style="width: 14px;"></i></button>
                            <button class="btn-action delete" onclick="deleteSetupRecord('manutencao_acoes', '${a.id}')" data-perm="manutencao_cadastros:delete"><i data-lucide="trash-2" style="width: 14px;"></i></button>
                        </div>
                    </td>
                </tr>
            `).join('');
        }
    } else if (state.currentSetupTab === 'tipos') {
        const BADGE_COLORS = {
            'PREVENTIVA': { bg: 'rgba(16, 185, 129, 0.30)', color: '#10b981', border: 'rgba(16, 185, 129, 0.6)' },
            'CORRETIVA':  { bg: 'rgba(239, 68, 68, 0.30)',  color: '#ef4444', border: 'rgba(239, 68, 68, 0.6)' },
            'BATERIA':    { bg: 'rgba(59, 130, 246, 0.30)', color: '#3b82f6', border: 'rgba(59, 130, 246, 0.6)' },
            'FUNILARIA':  { bg: 'rgba(249, 115, 22, 0.30)', color: '#f97316', border: 'rgba(249, 115, 22, 0.6)' },
            'PNEU':       { bg: 'rgba(234, 179, 8, 0.30)',  color: '#eab308', border: 'rgba(234, 179, 8, 0.6)' },
            'ESTETICA':   { bg: 'rgba(236, 72, 153, 0.30)', color: '#ec4899', border: 'rgba(236, 72, 153, 0.6)' },
        };
        const tbody = document.getElementById('setup_tipos_list');
        if (tbody) {
            tbody.innerHTML = state.tipos.map(t => {
                const key = (t.descricao || '').toUpperCase();
                const c = BADGE_COLORS[key] || { bg: 'rgba(99,102,241,0.1)', color: '#6366f1', border: 'rgba(99,102,241,0.2)' };
                return `
                <tr>
                    <td data-label="Descrição do Tipo">
                        <span class="type-badge" style="background: ${c.bg}; color: ${c.color}; border: 1px solid ${c.border}; font-weight: 800;">
                            ${t.descricao}
                        </span>
                    </td>
                    <td data-label="Ações" style="text-align: right; padding-right: 2rem;">
                        <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                            <button class="btn-action edit" onclick="openTipoModal('${t.id}')" data-perm="manutencao_cadastros:edit"><i data-lucide="edit-3" style="width: 14px;"></i></button>
                            <button class="btn-action delete" onclick="deleteSetupRecord('manutencao_tipos', '${t.id}')" data-perm="manutencao_cadastros:delete"><i data-lucide="trash-2" style="width: 14px;"></i></button>
                        </div>
                    </td>
                </tr>
            `}).join('');
        }
    }
    if (window.lucide) lucide.createIcons();
}

function populateDropdowns() {
    const tSel = document.getElementById('maint_tipo');
    const filterPlaca = document.getElementById('maintFilterPlaca');

    if (tSel) {
        tSel.innerHTML = '<option value="">Selecione o tipo...</option>' +
            state.tipos.map(t => `<option value="${t.id}">${t.descricao}</option>`).join('');
    }
    if (filterPlaca) {
        filterPlaca.innerHTML = '<option value="" style="background: #1e293b; color: white;">Todas as Placas</option>' + 
            state.vehicles.map(v => `<option value="${v.placa}" style="background: #1e293b; color: white;">${v.placa}</option>`).join('');
    }
}

// --- Table & Stats ---
window.filterByStatus = (status, btnEl) => {
    state.statusFilter = status;
    document.querySelectorAll('.status-filter-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.style.background = 'transparent';
        btn.style.color = 'var(--text-muted)';
    });
    btnEl.classList.add('active');
    btnEl.style.background = 'var(--primary)';
    btnEl.style.color = 'white';
    renderMaintTable();
};

function renderMaintTable() {
    const tbody = document.getElementById('maintList');
    if (!tbody) return;

    const search = document.getElementById('maintSearch')?.value.toLowerCase() || '';
    const placaFilter = document.getElementById('maintFilterPlaca')?.value.toUpperCase() || '';

    const filtered = state.manutencoes.filter(m => {
        const placa = (m.veiculos?.placa || '').toUpperCase();
        if (placaFilter && placa !== placaFilter) return false;

        const hasItemMatch = (m.manutencao_itens || []).some(item => 
            (item.descricao || '').toLowerCase().includes(search) ||
            (item.manutencao_acoes?.descricao || '').toLowerCase().includes(search)
        );

        const textMatches = (m.veiculos?.placa || '').toLowerCase().includes(search) ||
               (m.fornecedores?.nome || '').toLowerCase().includes(search) ||
               (m.descricao_servico || '').toLowerCase().includes(search) ||
               hasItemMatch;

        if (!textMatches) return false;

        // Status Filter Logic
        if (state.statusFilter !== 'TODOS') {
            const isConcluido = m.status === 'CONCLUIDO';
            const vehicle = state.vehicles.find(v => v.id === m.veiculo_id);
            const currentKm = vehicle?.km_atual || 0;
            const items = m.manutencao_itens || [];

            let highestAlert = 0; // 0: ok, 1: warning, 2: danger
            items.forEach(i => {
                if (!isConcluido && i.proxima_troca_km) {
                    const limit = parseFloat(i.proxima_troca_km);
                    if (currentKm >= limit) {
                        highestAlert = 2;
                    } else if (currentKm >= (limit - 2000) && highestAlert < 2) {
                        highestAlert = 1;
                    }
                }
            });

            const isOverdue = !isConcluido && items.some(i => {
                if (!i.proxima_troca_km) return false;
                return currentKm >= parseFloat(i.proxima_troca_km);
            });

            if (state.statusFilter === 'VENCIDO') {
                return isOverdue;
            } else if (state.statusFilter === 'PROXIMO') {
                return !isConcluido && highestAlert === 1;
            } else if (state.statusFilter === 'PENDENTE') {
                return !isConcluido && !isOverdue && highestAlert !== 1;
            }
        }

        return true;
    });

    tbody.innerHTML = filtered.map(m => {
        const items = m.manutencao_itens || [];
        const vehicle = state.vehicles.find(v => v.id === m.veiculo_id);
        const currentKm = vehicle?.km_atual || 0;

        const isConcluido = m.status === 'CONCLUIDO';

        let alertHtml = '';
        let highestAlert = 0; // 0: ok, 1: warning, 2: danger

        // Verificar alertas nos itens - Só considera se NÃO estiver concluído ou se tiver garantia
        items.forEach(i => {
            // Controle de Troca (KM/DATA) só alerta se PENDENTE
            if (!isConcluido && i.proxima_troca_km) {
                const limit = parseFloat(i.proxima_troca_km);
                if (currentKm >= limit) {
                    highestAlert = 2;
                } else if (currentKm >= (limit - 2000) && highestAlert < 2) {
                    highestAlert = 1;
                }
            }

            // Garantia alerta independente do status do serviço original (pois é um controle separado)
            // Implementação futura de alerta de garantia pode entrar aqui
        });

        if (highestAlert === 2) {
            alertHtml = `<i data-lucide="alert-triangle" class="pulse-red" style="width: 14px; color: #ef4444;" title="VENCIDO (KM Atual: ${currentKm.toLocaleString('pt-BR')} km)"></i>`;
        } else if (highestAlert === 1) {
            alertHtml = `<i data-lucide="alert-circle" style="width: 14px; color: #f59e0b;" title="PRÓXIMO AO VENCIMENTO (KM Atual: ${currentKm.toLocaleString('pt-BR')} km)"></i>`;
        }

        // Formatação dos itens agrupados para caber na tabela
        const servicosHtml = items.map(i => {
            const tipoLabel = i.manutencao_tipos?.descricao ? ` [${i.manutencao_tipos.descricao}]` : '';
            return `
                <div style="margin-bottom: 4px; line-height: 1.2;">
                    <span style="color: var(--primary); font-weight: 700; font-size: 0.7rem; text-transform: uppercase;">${i.manutencao_acoes?.descricao || 'S/A'}${tipoLabel}</span><br>
                    <span style="font-size: 0.75rem; color: #cbd5e1;">${i.descricao || 'S/D'}</span>
                </div>
            `;
        }).join('');

        const proxKmText = items.map(i => i.proxima_troca_km ? parseFloat(i.proxima_troca_km).toLocaleString('pt-BR') : '---').join('<br>');
        
        const kmFaltanteHtml = items.map(i => {
            if (!i.proxima_troca_km) return '---';
            const limit = parseFloat(i.proxima_troca_km);
            const faltante = limit - currentKm;
            
            let color = '#10b981'; // verde
            if (faltante <= 0) color = '#ef4444'; // vermelho (vencido)
            else if (faltante <= 2000) color = '#f59e0b'; // laranja (próximo)
            
            return `<div style="color: ${color}; font-weight: 800; font-size: 0.8rem;">${faltante.toLocaleString('pt-BR')} km</div>`;
        }).join('');

        const isOverdue = !isConcluido && items.some(i => {
            if (!i.proxima_troca_km) return false;
            return currentKm >= parseFloat(i.proxima_troca_km);
        });

        let statusLabel, statusBg, statusColor, statusBorder;
        if (isConcluido) {
            statusLabel = 'Concluído';
            statusBg = 'rgba(16, 185, 129, 0.1)';
            statusColor = '#10b981';
            statusBorder = 'rgba(16, 185, 129, 0.2)';
        } else if (isOverdue) {
            statusLabel = 'Atrasado';
            statusBg = 'rgba(239, 68, 68, 0.15)';
            statusColor = '#ef4444';
            statusBorder = 'rgba(239, 68, 68, 0.3)';
        } else {
            statusLabel = 'Pendente';
            statusBg = 'rgba(245, 158, 11, 0.1)';
            statusColor = '#f59e0b';
            statusBorder = 'rgba(245, 158, 11, 0.2)';
        }

        const statusHtml = `
            <div style="display: flex; flex-direction: column; align-items: center;">
                <div class="status-badge" 
                     style="cursor: pointer; padding: 0.4rem 0.8rem; border-radius: 8px; font-size: 0.65rem; font-weight: 800; text-align: center; text-transform: uppercase; 
                            background: ${statusBg}; 
                            color: ${statusColor}; 
                            border: 1px solid ${statusBorder};"
                     onclick="toggleMaintStatus('${m.id}', '${m.status}')">
                    ${statusLabel}
                </div>
                ${m.autorizacao_motivo ? `
                    <div style="font-size: 0.65rem; color: #ef4444; margin-top: 6px; display: flex; align-items: center; gap: 4px; cursor: help; font-weight: 700;" 
                         title="MOTIVO: ${m.autorizacao_motivo}">
                        <i data-lucide="shield-check" style="width: 12px; height: 12px;"></i> ANTECIPADO
                    </div>
                ` : ''}
            </div>
        `;

        const garantiaHtml = items.map(i => {
            if (!i.possui_garantia) return '<div style="color: #64748b; font-size: 0.7rem;">NÃO</div>';
            const origem = i.origem_garantia === 'ESTOQUE' ? 'ESTOQUE' : (i.origem_garantia === 'OFICINA' ? 'OFICINA' : 'FORNEC.');
            const dateStr = i.vencimento_garantia ? new Date(i.vencimento_garantia + 'T12:00:00').toLocaleDateString('pt-BR') : '';
            return `
                <div style="color: #10b981; font-weight: 800; font-size: 0.7rem;" title="Origem: ${i.origem_garantia}">
                    ${origem}${dateStr ? '<br><span style="font-size:0.6rem; opacity:0.8">' + dateStr + '</span>' : ''}
                </div>`;
        }).join('');

        const TYPE_COLORS = {
            'PREVENTIVA': { bg: 'rgba(16, 185, 129, 0.30)', border: 'rgba(16, 185, 129, 0.6)', text: '#10b981' },
            'CORRETIVA':  { bg: 'rgba(239, 68, 68, 0.30)',  border: 'rgba(239, 68, 68, 0.6)',  text: '#ef4444' },
            'BATERIA':    { bg: 'rgba(59, 130, 246, 0.30)', border: 'rgba(59, 130, 246, 0.6)', text: '#3b82f6' },
            'FUNILARIA':  { bg: 'rgba(249, 115, 22, 0.30)', border: 'rgba(249, 115, 22, 0.6)', text: '#f97316' },
            'PNEU':       { bg: 'rgba(234, 179, 8, 0.30)',  border: 'rgba(234, 179, 8, 0.6)',  text: '#eab308' },
            'ESTETICA':   { bg: 'rgba(236, 72, 153, 0.30)', border: 'rgba(236, 72, 153, 0.6)', text: '#ec4899' },
        };
        const typeDesc = (m.manutencao_tipos?.descricao || '').toUpperCase();
        const typeColor = TYPE_COLORS[typeDesc] || { bg: 'transparent', border: 'rgba(255,255,255,0.02)', text: '#94a3b8' };

        // Aplica estilo apenas se a visualização colorida estiver ativa
        const rowStyle = state.showRowColors 
            ? `style="background: ${typeColor.bg}; border-left: 3px solid ${typeColor.border}; border-bottom: 1px solid rgba(255,255,255,0.02);"` 
            : `style="border-bottom: 1px solid rgba(255,255,255,0.02);"`;

        return `
            <tr ${rowStyle}>
                <td data-label="Veículo" style="font-weight: 800; color: #f59e0b;">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        ${alertHtml}
                        ${m.veiculos?.placa || '---'}
                    </div>
                </td>
                <td data-label="Data" style="font-size: 0.8rem; font-weight: 500;">${m.data ? new Date(m.data + 'T12:00:00').toLocaleDateString('pt-BR') : '---'}</td>
                <td data-label="Fornecedor / Oficina" style="font-size: 0.8rem; font-weight: 600; color: #94a3b8;">${m.fornecedores?.nome || '---'}</td>
                <td data-label="Serviço / Itens">${servicosHtml || '---'}</td>
                <td data-label="KM Troca" style="font-weight: 600; font-size: 0.8rem;">${m.km_atual ? parseFloat(m.km_atual).toLocaleString('pt-BR') : '---'}</td>
                <td data-label="Próxima Troca" style="font-weight: 700; color: #6366f1; font-size: 0.8rem;">${proxKmText || '---'}</td>
                <td data-label="KM Faltante">${kmFaltanteHtml || '---'}</td>
                <td data-label="Status">${statusHtml}</td>
                <td data-label="Garantia">${garantiaHtml || '---'}</td>
                <td data-label="Ações">
                    <div style="display: flex; gap: 0.5rem; justify-content: center;">
                        <button class="btn-action edit" onclick="openMaintModal('${m.id}')" data-perm="manutencao_os:edit"><i data-lucide="edit-3" style="width: 14px;"></i></button>
                        <button class="btn-action delete" onclick="deleteMaint('${m.id}')" data-perm="manutencao_os:delete"><i data-lucide="trash-2" style="width: 14px;"></i></button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    if (window.lucide) lucide.createIcons();
}

function calculateMaintStats() {
    const totalCount = state.manutencoes.length;
    let preventive = 0;
    let corrective = 0;
    
    state.manutencoes.forEach(m => {
        (m.manutencao_itens || []).forEach(i => {
            const desc = (i.manutencao_tipos?.descricao || '').toUpperCase();
            if (desc === 'PREVENTIVA') preventive++;
            else if (desc === 'CORRETIVA') corrective++;
        });
    });

    // 1: Total Serviços
    const totalCountEl = document.getElementById('totalMaintCount');
    if (totalCountEl) totalCountEl.innerText = totalCount;

    // 2 & 3: Percentuais
    const totalItems = preventive + corrective;
    const preventiveEl = document.getElementById('preventivePerc');
    if (preventiveEl) preventiveEl.innerText = totalItems > 0 ? ((preventive / totalItems) * 100).toFixed(0) + '%' : '0%';

    const correctiveEl = document.getElementById('correctivePerc');
    if (correctiveEl) correctiveEl.innerText = totalItems > 0 ? ((corrective / totalItems) * 100).toFixed(0) + '%' : '0%';

    // 4: Alertas Ativos
    let activeAlerts = 0;
    state.manutencoes.forEach(m => {
        if (m.status === 'CONCLUIDO') return;
        const vehicle = state.vehicles.find(v => v.id === m.veiculo_id);
        const currentKm = vehicle?.km_atual || 0;
        const items = m.manutencao_itens || [];

        let hasAlert = false;
        items.forEach(i => {
            if (i.proxima_troca_km) {
                const limit = parseFloat(i.proxima_troca_km);
                if (currentKm >= (limit - 2000)) hasAlert = true;
            }
        });
        if (hasAlert) activeAlerts++;
    });
    const alertsCountEl = document.getElementById('activeAlertsCount');
    if (alertsCountEl) alertsCountEl.innerText = activeAlerts;
}

function initDashboard() {
    if (state.charts.maint) state.charts.maint.destroy();
    if (state.charts.type) state.charts.type.destroy();
    if (state.charts.topVehicles) state.charts.topVehicles.destroy();
    if (state.charts.topSuppliers) state.charts.topSuppliers.destroy();

    // --- 1. Volume Mensal (Quantidade) ---
    const monthlyData = {};
    state.manutencoes.forEach(m => {
        const month = m.data ? m.data.substring(0, 7) : 'S/D';
        monthlyData[month] = (monthlyData[month] || 0) + 1;
    });

    const months = Object.keys(monthlyData).sort();
    const ctxMaint = document.getElementById('maintChart')?.getContext('2d');
    if (ctxMaint) {
        state.charts.maint = new Chart(ctxMaint, {
            type: 'line',
            data: {
                labels: months,
                datasets: [{
                    label: 'Qtd. Serviços',
                    data: months.map(m => monthlyData[m]),
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    }

    // --- 2. Distribuição por Tipo ---
    const types = {};
    state.manutencoes.forEach(m => {
        (m.manutencao_itens || []).forEach(i => {
            const type = i.manutencao_tipos?.descricao || 'OUTRO';
            types[type] = (types[type] || 0) + 1;
        });
    });

    const ctxType = document.getElementById('maintTypeChart')?.getContext('2d');
    if (ctxType) {
        state.charts.type = new Chart(ctxType, {
            type: 'doughnut',
            data: {
                labels: Object.keys(types),
                datasets: [{
                    data: Object.values(types),
                    backgroundColor: ['#10b981', '#ef4444', '#f59e0b', '#6366f1']
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
        });
    }

    // --- 3. Top Veículos (Frequência) ---
    const vehicleFreq = {};
    state.manutencoes.forEach(m => {
        const plate = m.veiculos?.placa || 'S/P';
        vehicleFreq[plate] = (vehicleFreq[plate] || 0) + 1;
    });

    const topPlates = Object.keys(vehicleFreq).sort((a, b) => vehicleFreq[b] - vehicleFreq[a]).slice(0, 5);
    const ctxTopVeh = document.getElementById('topVehiclesChart')?.getContext('2d');
    if (ctxTopVeh) {
        state.charts.topVehicles = new Chart(ctxTopVeh, {
            type: 'bar',
            data: {
                labels: topPlates,
                datasets: [{
                    label: 'Qtd. Atendimentos',
                    data: topPlates.map(p => vehicleFreq[p]),
                    backgroundColor: 'rgba(99, 102, 241, 0.8)',
                    borderRadius: 8
                }]
            },
            options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    }

    // --- 4. Top Oficinas (Frequência) ---
    const supplierFreq = {};
    state.manutencoes.forEach(m => {
        const name = m.fornecedores?.nome || 'S/O';
        supplierFreq[name] = (supplierFreq[name] || 0) + 1;
    });

    const topOffices = Object.keys(supplierFreq).sort((a, b) => supplierFreq[b] - supplierFreq[a]).slice(0, 5);
    const ctxTopSupp = document.getElementById('topSuppliersChart')?.getContext('2d');
    if (ctxTopSupp) {
        state.charts.topSuppliers = new Chart(ctxTopSupp, {
            type: 'bar',
            data: {
                labels: topOffices,
                datasets: [{
                    label: 'Qtd. Serviços',
                    data: topOffices.map(o => supplierFreq[o]),
                    backgroundColor: 'rgba(16, 185, 129, 0.8)',
                    borderRadius: 8
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    }
}

function toggleNotiPanel() {
    const panel = document.getElementById('notiPanel');
    if (panel) panel.classList.toggle('active');
}

window.toggleMaintStatus = async (id, currentStatus) => {
    if (currentStatus === 'CONCLUIDO') {
        return await applyStatusChange(id, 'PENDENTE');
    }

    const m = state.manutencoes.find(x => x.id === id);
    if (!m) return;

    const vehicle = state.vehicles.find(v => v.id === m.veiculo_id);
    const currentKm = vehicle?.km_atual || 0;
    const items = m.manutencao_itens || [];

    const earlyItems = [];
    items.forEach(i => {
        if (i.proxima_troca_km) {
            const limit = parseFloat(i.proxima_troca_km);
            const remaining = limit - currentKm;
            // Se faltar MAIS de 2000km para a troca, exige autorização
            if (remaining > 2000) {
                earlyItems.push({
                    desc: i.manutencao_acoes?.descricao || i.descricao || 'Item',
                    remaining
                });
            }
        }
    });

    if (earlyItems.length > 0) {
        const body = document.getElementById('authModalBody');
        const idInput = document.getElementById('auth_maint_id');
        const motivoInput = document.getElementById('auth_motivo');

        if (idInput && motivoInput && body) {
            idInput.value = id;
            motivoInput.value = '';
            body.innerHTML = `
                <div style="display: flex; gap: 0.8rem; align-items: flex-start;">
                    <i data-lucide="shield-alert" style="color: #ef4444; flex-shrink: 0;"></i>
                    <div>
                        <p style="margin: 0; font-weight: 700; color: #ef4444; font-size: 0.95rem;">Atenção: Manutenção Antecipada</p>
                        <p style="margin: 5px 0 0; font-size: 0.85rem; color: var(--text-muted);">Os itens abaixo possuem vida útil restante:</p>
                    </div>
                </div>
                <ul style="margin: 1rem 0 1rem 2.5rem; padding: 0; color: white; font-size: 0.85rem;">
                    ${earlyItems.map(item => `<li style="margin-bottom: 5px;"><strong>${item.desc}</strong>: faltam <span style="color: #ef4444; font-weight: 800;">${item.remaining.toLocaleString('pt-BR')} km</span></li>`).join('')}
                </ul>
                <p style="margin: 0; font-size: 0.8rem; opacity: 0.8;">Justifique o motivo para autorizar a conclusão antecipada.</p>
            `;
            document.getElementById('modalAuth').classList.add('active');
            if (window.lucide) lucide.createIcons();
        }
    } else {
        await applyStatusChange(id, 'CONCLUIDO');
    }
};

async function applyStatusChange(id, newStatus, motivo = null) {
    try {
        const updateData = { status: newStatus };

        if (newStatus === 'PENDENTE') {
            // Se voltar para Pendente, limpamos o histórico de autorização
            updateData.autorizacao_motivo = null;
            updateData.autorizado_em = null;
        } else if (motivo) {
            // Campos dedicados salvando a autorização
            updateData.autorizacao_motivo = motivo;
            updateData.autorizado_em = new Date().toISOString();
        }

        const { error } = await supabaseClient.from('manutencoes').update(updateData).eq('id', id);
        if (error) throw error;

        showToast(newStatus === 'CONCLUIDO' ? 'Manutenção autorizada e concluída!' : 'Status alterado para Pendente.');
        if (document.getElementById('modalAuth')) document.getElementById('modalAuth').classList.remove('active');
        await loadInitialData();
    } catch (err) {
        showToast('Erro ao salvar status: ' + err.message, 'error');
    }
}

function renderMaintAlerts() {
    const list = document.getElementById('notiList');
    const badge = document.getElementById('notiBadge');
    if (!list || !badge) return;

    const alerts = [];
    state.manutencoes.forEach(m => {
        // Ignorar se já estiver concluído (exceto talvez por garantia no futuro)
        if (m.status === 'CONCLUIDO') return;

        const vehicle = state.vehicles.find(v => v.id === m.veiculo_id);
        const currentKm = vehicle?.km_atual || 0;
        const items = m.manutencao_itens || [];

        items.forEach(i => {
            if (i.proxima_troca_km) {
                const limit = parseFloat(i.proxima_troca_km);
                const diff = limit - currentKm;

                if (diff <= 0) {
                    alerts.push({
                        type: 'danger',
                        plate: m.veiculos?.placa || 'S/P',
                        item: i.descricao || 'Serviço',
                        acao: i.manutencao_acoes?.descricao || '',
                        currentKm,
                        limit,
                        diff: Math.abs(diff)
                    });
                } else if (diff <= 2000) {
                    alerts.push({
                        type: 'warning',
                        plate: m.veiculos?.placa || 'S/P',
                        item: i.descricao || 'Serviço',
                        acao: i.manutencao_acoes?.descricao || '',
                        currentKm,
                        limit,
                        diff
                    });
                }
            }
        });
    });

    if (alerts.length === 0) {
        badge.style.display = 'none';
        list.innerHTML = '<div class="noti-empty">Nenhum alerta pendente ✨</div>';
        return;
    }

    badge.innerText = alerts.length;
    badge.style.display = 'flex';

    alerts.sort((a, b) => (a.type === 'danger' ? -1 : 1));

    list.innerHTML = alerts.map(a => `
        <div class="noti-item" style="border-left: 4px solid ${a.type === 'danger' ? '#ef4444' : '#f59e0b'}; cursor: pointer;" 
             onclick="filterByPlate('${a.plate}')">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 5px;">
                <span style="font-weight: 800; color: white;">${a.plate}</span>
                <span style="font-size: 0.65rem; font-weight: 800; text-transform: uppercase; color: ${a.type === 'danger' ? '#ef4444' : '#f59e0b'};">
                    ${a.type === 'danger' ? 'Vencido' : 'Próximo'}
                </span>
            </div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">
                <strong>${a.acao}</strong>: ${a.item}
            </div>
            <div style="font-size: 0.7rem; margin-top: 5px; color: var(--text-muted);">
                Faltam: <span style="color: ${a.type === 'danger' ? '#ef4444' : '#f59e0b'}; font-weight: bold;">
                    ${a.type === 'danger' ? `${a.diff.toLocaleString('pt-BR')} km excedidos` : `${a.diff.toLocaleString('pt-BR')} km`}
                </span>
            </div>
        </div>
    `).join('');

    if (window.lucide) lucide.createIcons();
}

function filterByPlate(plate) {
    const searchInput = document.getElementById('maintSearch');
    if (searchInput) {
        searchInput.value = plate;
        renderMaintTable();
        toggleNotiPanel();
    }
}

window.toggleRowColors = () => {
    state.showRowColors = !state.showRowColors;
    const btn = document.getElementById('toggleColorBtn');
    if (btn) {
        btn.style.background = state.showRowColors ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.05)';
        btn.style.borderColor = state.showRowColors ? 'var(--primary)' : 'var(--border-card)';
        btn.style.color = state.showRowColors ? 'var(--primary)' : 'white';
    }
    renderMaintTable();
    showToast(state.showRowColors ? 'Cores das linhas ativadas' : 'Cores das linhas desativadas');
};

document.addEventListener('click', (e) => {
    const panel = document.getElementById('notiPanel');
    const btn = document.getElementById('notiBtn');
    if (panel && panel.classList.contains('active') && !panel.contains(e.target) && !btn.contains(e.target)) {
        panel.classList.remove('active');
    }
});

// --- Modal & Form ---
window.openMaintModal = async (id = null) => {
    if (typeof window.showLoader === 'function') window.showLoader();
    try {
        if (id) {
            if (!canDo('manutencao_os', 'edit')) {
                alert('Você não tem permissão para editar manutenções.');
                return;
            }
        } else {
            if (!canDo('manutencao_os', 'add')) {
                alert('Você não tem permissão para registrar manutenções.');
                return;
            }
        }
        state.editingId = id;
        state.currentMaintItems = [];
        state.editingStatus = 'PENDENTE'; // Reset status
        const form = document.getElementById('maintForm');
        const title = document.getElementById('maintModalTitle');
        form.reset();

        if (id) {
            title.innerText = 'Editar Manutenção';
            const m = state.manutencoes.find(x => x.id === id);
            if (m) {
                const veh = state.vehicles.find(v => v.id === m.veiculo_id);
                document.getElementById('maint_veiculo').value = m.veiculo_id;
                document.getElementById('maint_veiculo_search').value = veh ? `${veh.placa} - ${veh.modelo}` : '';

                document.getElementById('maint_data').value = m.data;

                const forn = state.oficinas.find(o => o.id === m.oficina_id);
                document.getElementById('maint_oficina').value = m.oficina_id;
                document.getElementById('maint_oficina_search').value = forn ? forn.nome : '';

                document.getElementById('maint_km').value = m.km_atual;
                state.editingStatus = m.status;

                const { data: items } = await supabaseClient.from('manutencao_itens').select('*').eq('manutencao_id', id);
                state.currentMaintItems = items || [];
            }
        } else {
            title.innerText = 'Registrar Manutenção';
            document.getElementById('maint_veiculo_search').value = '';
            document.getElementById('maint_veiculo').value = '';
            document.getElementById('maint_oficina_search').value = '';
            document.getElementById('maint_oficina').value = '';
            document.getElementById('maint_data').value = new Date().toISOString().split('T')[0];
            addMaintItem();
        }

        renderMaintItems();
        document.getElementById('modalMaint').classList.add('active');
        setTimeout(() => {
            const input = document.getElementById('maint_veiculo_search');
            if (input) input.focus();
        }, 150);
    } finally {
        if (typeof window.hideLoader === 'function') window.hideLoader();
    }
};

window.addMaintItem = () => {
    const newId = 'temp_' + Date.now();
    state.currentMaintItems.push({
        id: newId,
        descricao: '',
        tipo_id: '',
        acao_id: '',
        valor_pecas: 0,
        valor_servicos: 0,
        controle_proxima_troca: 'NENHUMA',
        intervalo_km: null,
        intervalo_meses: null,
        possui_garantia: false,
        meses_garantia: null,
        origem_garantia: '',
        origem_garantia_fornecedor_id: null
    });
    renderMaintItems();
    
    // Foca na descrição do novo item adicionado
    setTimeout(() => {
        const input = document.getElementById(`maint_desc_${newId}`);
        if (input) input.focus();
    }, 50);
};

window.removeMaintItem = (id) => {
    state.currentMaintItems = state.currentMaintItems.filter(item => item.id !== id);
    renderMaintItems();
};

function renderMaintItems() {
    const container = document.getElementById('maint_items_container');
    if (!container) return;

    // Salva o elemento ativo antes de renderizar para manter o foco
    const activeId = document.activeElement ? document.activeElement.id : null;
    let cursorPosition = null;

    if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
        try {
            cursorPosition = {
                start: document.activeElement.selectionStart,
                end: document.activeElement.selectionEnd
            };
        } catch (e) {
            // Alguns tipos de input (ex: number) não suportam selectionStart
        }
    }

    container.innerHTML = state.currentMaintItems.map((item, index) => `
        <div class="item-card" style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-card); border-radius: 12px; padding: 0.8rem; position: relative; animation: fadeIn 0.3s ease-out;">
            <button type="button" onclick="removeMaintItem('${item.id}')" style="position: absolute; top: 0.5rem; right: 0.5rem; background: rgba(239, 68, 68, 0.1); color: #ef4444; border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                <i data-lucide="x" style="width: 14px;"></i>
            </button>

            <div class="form-grid" style="grid-template-columns: 2fr 1fr 1fr; gap: 0.6rem;">
                <div class="form-group">
                    <label>Descrição do Item / Serviço</label>
                    <input type="text" id="maint_desc_${item.id}" value="${item.descricao || ''}" oninput="updateItemField('${item.id}', 'descricao', this.value)" placeholder="Ex: Óleo 5W30">
                </div>
                <div class="form-group">
                    <label>Tipo de Manutenção</label>
                    <select id="maint_tipo_${item.id}" onchange="updateItemField('${item.id}', 'tipo_id', this.value)">
                        <option value="">Selecione...</option>
                        ${state.tipos.map(t => `<option value="${t.id}" ${item.tipo_id === t.id ? 'selected' : ''}>${t.descricao}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Ação</label>
                    <select id="maint_acao_${item.id}" onchange="updateItemField('${item.id}', 'acao_id', this.value)">
                        <option value="">Selecione...</option>
                        ${state.acoes.map(a => `<option value="${a.id}" ${item.acao_id === a.id ? 'selected' : ''}>${a.descricao}</option>`).join('')}
                    </select>
                </div>
            </div>

            <div class="form-grid" style="grid-template-columns: repeat(4, 1fr); margin-top: 0.6rem; gap: 0.6rem; background: rgba(0,0,0,0.2); padding: 0.6rem; border-radius: 8px;">
                <div class="form-group">
                    <label style="font-size: 0.7rem;">Controle de Troca</label>
                    <select id="maint_control_${item.id}" style="font-size: 0.75rem; height: 35px;" onchange="updateItemField('${item.id}', 'controle_proxima_troca', this.value); renderMaintItems();">
                        <option value="NENHUMA" ${item.controle_proxima_troca === 'NENHUMA' ? 'selected' : ''}>NÃO</option>
                        <option value="KM" ${item.controle_proxima_troca === 'KM' ? 'selected' : ''}>KM</option>
                        <option value="DATA" ${item.controle_proxima_troca === 'DATA' ? 'selected' : ''}>DATA</option>
                    </select>
                </div>

                ${item.controle_proxima_troca === 'KM' ? `
                    <div class="form-group">
                        <label style="font-size: 0.7rem;">Intervalo KM / Prev.</label>
                        <input type="number" id="maint_km_${item.id}" value="${item.intervalo_km || ''}" oninput="updateItemField('${item.id}', 'intervalo_km', this.value)" style="height: 35px; margin-bottom: 5px;">
                        <div id="prediction_km_${item.id}" style="font-size: 0.75rem; font-weight: bold; color: var(--primary);">${calculateItemPrediction(item, 'KM')}</div>
                    </div>
                ` : ''}

                ${item.controle_proxima_troca === 'DATA' ? `
                    <div class="form-group">
                        <label style="font-size: 0.7rem;">Meses / Prev.</label>
                        <input type="number" id="maint_months_${item.id}" value="${item.intervalo_meses || ''}" oninput="updateItemField('${item.id}', 'intervalo_meses', this.value)" style="height: 35px; margin-bottom: 5px;">
                        <div id="prediction_date_${item.id}" style="font-size: 0.75rem; font-weight: bold; color: var(--primary);">${calculateItemPrediction(item, 'DATA')}</div>
                    </div>
                ` : ''}

                <div class="form-group">
                    <label style="font-size: 0.7rem;">Garantia?</label>
                    <select id="maint_warranty_${item.id}" style="font-size: 0.75rem; height: 35px;" onchange="updateItemField('${item.id}', 'possui_garantia', this.value === 'true'); renderMaintItems();">
                        <option value="false" ${!item.possui_garantia ? 'selected' : ''}>NÃO</option>
                        <option value="true" ${item.possui_garantia ? 'selected' : ''}>SIM</option>
                    </select>
                </div>

                ${item.possui_garantia ? `
                    <div class="form-group">
                        <label style="font-size: 0.7rem;">Meses / Vence em</label>
                        <input type="number" id="maint_w_months_${item.id}" value="${item.meses_garantia || ''}" oninput="updateItemField('${item.id}', 'meses_garantia', this.value)" style="height: 35px; margin-bottom: 5px;">
                        <div id="prediction_warranty_${item.id}" style="font-size: 0.75rem; font-weight: bold; color: var(--accent);">${calculateItemPrediction(item, 'GARANTIA')}</div>
                    </div>
                    <div class="form-group" style="grid-column: span 2;">
                        <label style="font-size: 0.7rem;">Origem da Garantia</label>
                        <select id="maint_w_origin_${item.id}" style="font-size: 0.75rem; height: 35px;" onchange="handleWarrantyOriginChange('${item.id}', this.value); renderMaintItems();">
                            <option value="">Selecione a origem...</option>
                            <option value="ESTOQUE" ${item.origem_garantia === 'ESTOQUE' ? 'selected' : ''}>Estoque</option>
                            <option value="OFICINA" ${item.origem_garantia === 'OFICINA' ? 'selected' : ''}>Própria Oficina</option>
                            <optgroup label="Fornecedores">
                                ${state.oficinas.map(o => `<option value="${o.id}" ${item.origem_garantia_fornecedor_id === o.id ? 'selected' : ''}>${o.nome}</option>`).join('')}
                            </optgroup>
                        </select>
                    </div>
                ` : ''}
            </div>
        </div>
    `).join('');

    if (window.lucide) lucide.createIcons();

    // Restaura o foco do cursor no elemento que estava ativo
    if (activeId) {
        const activeEl = document.getElementById(activeId);
        if (activeEl) {
            activeEl.focus();
            if (cursorPosition && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
                try {
                    activeEl.setSelectionRange(cursorPosition.start, cursorPosition.end);
                } catch (e) {}
            }
        }
    }
}

function calculateItemPrediction(item, type) {
    const kmInput = document.getElementById('maint_km');
    const currentKm = kmInput ? parseFloat(kmInput.value) || 0 : 0;
    const dateInput = document.getElementById('maint_data')?.value;
    if (!dateInput) return '---';
    const currentDate = new Date(dateInput + 'T12:00:00');

    if (type === 'KM') {
        const interval = parseFloat(item.intervalo_km) || 0;
        return interval > 0 ? (currentKm + interval).toLocaleString('pt-BR') + ' KM' : '---';
    }

    if (type === 'DATA' || type === 'GARANTIA') {
        const months = parseInt(type === 'DATA' ? item.intervalo_meses : item.meses_garantia) || 0;
        if (months <= 0) return '---';
        const d = new Date(currentDate);
        d.setMonth(d.getMonth() + months);
        return d.toLocaleDateString('pt-BR');
    }
    return '---';
}

window.updateItemField = (id, field, value) => {
    const item = state.currentMaintItems.find(i => i.id === id);
    if (item) {
        item[field] = value;
        // Atualiza a previsão dinamicamente sem forçar re-render total do DOM (evita travar o tab)
        if (field === 'intervalo_km') {
            const el = document.getElementById(`prediction_km_${id}`);
            if (el) el.innerText = calculateItemPrediction(item, 'KM');
        } else if (field === 'intervalo_meses') {
            const el = document.getElementById(`prediction_date_${id}`);
            if (el) el.innerText = calculateItemPrediction(item, 'DATA');
        } else if (field === 'meses_garantia') {
            const el = document.getElementById(`prediction_warranty_${id}`);
            if (el) el.innerText = calculateItemPrediction(item, 'GARANTIA');
        }
    }
};

window.handleWarrantyOriginChange = (id, value) => {
    const item = state.currentMaintItems.find(i => i.id === id);
    if (!item) return;

    if (value === 'ESTOQUE' || value === 'OFICINA' || value === '') {
        item.origem_garantia = value;
        item.origem_garantia_fornecedor_id = null;
    } else {
        item.origem_garantia = 'FORNECEDOR';
        item.origem_garantia_fornecedor_id = value;
    }
};

window.switchMainTab = (tab) => {
    // Remove active da aba e esconde todas as seções principais
    document.querySelectorAll('.tab-item').forEach(btn => btn.classList.remove('active'));
    
    const sections = ['maintSection', 'dashboardSection', 'setupSection'];
    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('active');
    });

    const btn = document.querySelector(`[onclick="switchMainTab('${tab}')"]`);
    if (btn) btn.classList.add('active');

    if (tab === 'maint') {
        document.getElementById('maintSection').classList.add('active');
        document.getElementById('statsRow').style.display = 'grid';
    } else if (tab === 'dashboard') {
        document.getElementById('dashboardSection').classList.add('active');
        document.getElementById('statsRow').style.display = 'grid';
        initDashboard();
    } else if (tab === 'setup') {
        document.getElementById('setupSection').classList.add('active');
        document.getElementById('statsRow').style.display = 'none';
        switchSetupTab('acoes');
    }
};

window.switchSetupTab = (tab) => {
    state.currentSetupTab = tab;
    document.querySelectorAll('#setupSection .tab-item').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.setup-content').forEach(v => v.classList.remove('active'));

    const btn = document.querySelector(`[onclick="switchSetupTab('${tab}')"]`);
    if (btn) btn.classList.add('active');

    document.getElementById(`setup_${tab}`).classList.add('active');
    renderSetupTables();
};

function setupFormListeners() {
    const maintForm = document.getElementById('maintForm');
    if (maintForm) {
        maintForm.onsubmit = async (e) => {
            e.preventDefault();
            const isEditing = !!state.editingId;
            if (isEditing) {
                if (!canDo('manutencao_os', 'edit')) {
                    alert('Você não tem permissão para editar manutenções.');
                    return;
                }
            } else {
                if (!canDo('manutencao_os', 'add')) {
                    alert('Você não tem permissão para registrar manutenções.');
                    return;
                }
            }
            const currentKm = parseFloat(document.getElementById('maint_km').value) || 0;
            const currentDate = document.getElementById('maint_data').value;

            const header = {
                veiculo_id: document.getElementById('maint_veiculo').value || null,
                data: currentDate,
                oficina_id: document.getElementById('maint_oficina').value || null,
                km_atual: currentKm,
                status: state.editingStatus || 'PENDENTE'
            };

            try {
                const { data: savedHeader, error: hError } = state.editingId
                    ? await supabaseClient.from('manutencoes').update(header).eq('id', state.editingId).select().single()
                    : await supabaseClient.from('manutencoes').insert([header]).select().single();

                if (hError) throw hError;

                if (state.editingId) {
                    await supabaseClient.from('manutencao_itens').delete().eq('manutencao_id', state.editingId);
                }

                const itemsToSave = state.currentMaintItems.map(item => {
                    let proxima_troca_km = null;
                    let proxima_troca_data = null;
                    let vencimento_garantia = null;

                    if (item.controle_proxima_troca === 'KM') {
                        const interval = parseFloat(item.intervalo_km) || 0;
                        if (interval > 0) proxima_troca_km = currentKm + interval;
                    } else if (item.controle_proxima_troca === 'DATA') {
                        const months = parseInt(item.intervalo_meses) || 0;
                        if (months > 0) {
                            const d = new Date(currentDate + 'T12:00:00');
                            d.setMonth(d.getMonth() + months);
                            proxima_troca_data = d.toISOString().split('T')[0];
                        }
                    }

                    if (item.possui_garantia) {
                        const months = parseInt(item.meses_garantia) || 0;
                        if (months > 0) {
                            const d = new Date(currentDate + 'T12:00:00');
                            d.setMonth(d.getMonth() + months);
                            vencimento_garantia = d.toISOString().split('T')[0];
                        }
                    }

                    return {
                        manutencao_id: savedHeader.id,
                        descricao: item.descricao,
                        tipo_id: item.tipo_id && item.tipo_id !== '' ? item.tipo_id : null,
                        acao_id: item.acao_id && item.acao_id !== '' ? item.acao_id : null,
                        valor_pecas: 0,
                        valor_servicos: 0,
                        controle_proxima_troca: item.controle_proxima_troca,
                        intervalo_km: parseFloat(item.intervalo_km) || null,
                        intervalo_meses: parseInt(item.intervalo_meses) || null,
                        proxima_troca_km,
                        proxima_troca_data,
                        possui_garantia: item.possui_garantia,
                        meses_garantia: parseInt(item.meses_garantia) || null,
                        vencimento_garantia,
                        origem_garantia: item.origem_garantia,
                        origem_garantia_fornecedor_id: item.origem_garantia_fornecedor_id
                    };
                });

                let { error: iError } = await supabaseClient.from('manutencao_itens').insert(itemsToSave);
                
                // Se falhar porque a coluna tipo_id não existe na tabela do banco ainda (migração pendente)
                if (iError && (iError.message.includes('tipo_id') || iError.message.includes('schema cache'))) {
                    console.warn('[Manutenção] Novo esquema de itens falhou no insert (coluna tipo_id ausente). Tentando fallback para esquema antigo...');
                    
                    const itemsFallback = itemsToSave.map(item => {
                        const copy = { ...item };
                        delete copy.tipo_id;
                        return copy;
                    });
                    
                    const fallbackRes = await supabaseClient.from('manutencao_itens').insert(itemsFallback);
                    if (fallbackRes.error) throw fallbackRes.error;
                    
                    // Salva o tipo do primeiro item no cabeçalho antigo
                    const firstItemTipoId = state.currentMaintItems.find(item => item.tipo_id && item.tipo_id !== '')?.tipo_id || null;
                    if (firstItemTipoId) {
                        await supabaseClient.from('manutencoes').update({ tipo_id: firstItemTipoId }).eq('id', savedHeader.id);
                    }
                } else if (iError) {
                    throw iError;
                }

                showToast('Manutenção salva com sucesso!');
                closeMaintModal(true);
                await loadInitialData();
            } catch (err) {
                showToast('Erro ao salvar: ' + err.message, 'error');
            }
        };
    }

    const authForm = document.getElementById('authForm');
    if (authForm) {
        authForm.onsubmit = async (e) => {
            e.preventDefault();
            const id = document.getElementById('auth_maint_id').value;
            const motivo = document.getElementById('auth_motivo').value;
            if (id && motivo) {
                await applyStatusChange(id, 'CONCLUIDO', motivo);
            }
        };
    }

    const acaoForm = document.getElementById('acaoForm');
    if (acaoForm) acaoForm.onsubmit = (e) => handleSetupSubmit(e, 'manutencao_acoes', 'modalAcao');

    const tipoForm = document.getElementById('tipoForm');
    if (tipoForm) tipoForm.onsubmit = (e) => handleSetupSubmit(e, 'manutencao_tipos', 'modalTipo');

    const fornecedorForm = document.getElementById('fornecedorForm');
    if (fornecedorForm) fornecedorForm.onsubmit = (e) => handleSetupSubmit(e, 'fornecedores', 'modalFornecedor');

    // Keyboard shortcuts & Enter key prevention on inputs
    window.addEventListener('keydown', (e) => {
        // Esc -> Fecha todas as modais
        if (e.key === 'Escape') {
            const maintModal = document.getElementById('modalMaint');
            if (maintModal && maintModal.classList.contains('active')) {
                closeMaintModal(false);
            } else {
                closeModal('modalAcao');
                closeModal('modalTipo');
                closeModal('modalFornecedor');
                closeModal('modalAuth');
            }
        }

        // F2 -> Registrar Manutenção
        if (e.key === 'F2') {
            e.preventDefault();
            const modal = document.getElementById('modalMaint');
            if (modal && !modal.classList.contains('active')) {
                openMaintModal(null);
            }
        }

        // Ctrl + Enter -> Salvar Manutenção (se modal ativo)
        if (e.ctrlKey && e.key === 'Enter') {
            const modal = document.getElementById('modalMaint');
            if (modal && modal.classList.contains('active')) {
                e.preventDefault();
                const form = document.getElementById('maintForm');
                if (form) {
                    if (typeof form.requestSubmit === 'function') {
                        form.requestSubmit();
                    } else {
                        form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
                    }
                }
            }
        }
    });

    const maintFormElement = document.getElementById('maintForm');
    if (maintFormElement) {
        maintFormElement.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.ctrlKey && e.target.tagName !== 'TEXTAREA') {
                e.preventDefault();
            }
        });
    }
}

async function handleSetupSubmit(e, table, modalId) {
    e.preventDefault();
    const id = e.target.querySelector('[id$="_id"]').value;
    const isEditing = !!id;

    if (!canDo('manutencao_cadastros', isEditing ? 'edit' : 'add')) {
        alert(`Você não tem permissão para ${isEditing ? 'editar' : 'cadastrar'} neste painel.`);
        return;
    }

    let data = {};
    if (table === 'manutencao_acoes') {
        data = { descricao: document.getElementById('acao_desc').value };
    } else if (table === 'manutencao_tipos') {
        data = { descricao: document.getElementById('tipo_desc').value };
    } else if (table === 'fornecedores') {
        data = { 
            nome: document.getElementById('fornecedor_nome').value,
            cidade: document.getElementById('fornecedor_cidade').value,
            estado: document.getElementById('fornecedor_estado').value
        };
    }

    try {
        const { error } = isEditing 
            ? await supabaseClient.from(table).update(data).eq('id', id)
            : await supabaseClient.from(table).insert([data]);
        
        if (error) throw error;

        showToast('Cadastro salvo com sucesso!', 'success');
        document.getElementById(modalId).classList.remove('active');
        await loadInitialData();
    } catch (err) {
        showToast('Erro ao salvar: ' + err.message, 'error');
    }
}

window.openAcaoModal = (id = null) => {
    if (!canDo('manutencao_cadastros', id ? 'edit' : 'add')) {
        alert(`Você não tem permissão para ${id ? 'editar' : 'cadastrar'} ações.`);
        return;
    }
    const form = document.getElementById('acaoForm');
    form.reset();
    document.getElementById('acao_id').value = id || '';
    document.getElementById('acaoModalTitle').innerText = id ? 'Editar Ação' : 'Cadastrar Ação';
    
    if (id) {
        const a = state.acoes.find(x => x.id === id);
        if (a) document.getElementById('acao_desc').value = a.descricao;
    }
    document.getElementById('modalAcao').classList.add('active');
};

window.openTipoModal = (id = null) => {
    if (!canDo('manutencao_cadastros', id ? 'edit' : 'add')) {
        alert(`Você não tem permissão para ${id ? 'editar' : 'cadastrar'} tipos.`);
        return;
    }
    const form = document.getElementById('tipoForm');
    form.reset();
    document.getElementById('tipo_id').value = id || '';
    document.getElementById('tipoModalTitle').innerText = id ? 'Editar Tipo' : 'Cadastrar Tipo';
    
    if (id) {
        const t = state.tipos.find(x => x.id === id);
        if (t) document.getElementById('tipo_desc').value = t.descricao;
    }
    document.getElementById('modalTipo').classList.add('active');
};

window.openFornecedorModal = (id = null) => {
    const form = document.getElementById('fornecedorForm');
    form.reset();
    document.getElementById('fornecedor_id').value = id || '';
    document.getElementById('fornecedorModalTitle').innerText = id ? 'Editar Fornecedor' : 'Cadastrar Fornecedor';
    
    if (id) {
        const f = state.oficinas.find(x => x.id === id);
        if (f) {
            document.getElementById('fornecedor_nome').value = f.nome;
            document.getElementById('fornecedor_cidade').value = f.cidade || '';
            document.getElementById('fornecedor_estado').value = f.estado || '';
        }
    }
    document.getElementById('modalFornecedor').classList.add('active');
};

window.deleteSetupRecord = async (table, id) => {
    if (!canDo('manutencao_cadastros', 'delete')) {
        alert('Você não tem permissão para excluir este cadastro.');
        return;
    }
    if (!confirm('Deseja realmente excluir este cadastro?')) return;
    
    try {
        const { error } = await supabaseClient.from(table).delete().eq('id', id);
        if (error) throw error;

        showToast('Cadastro excluído!', 'success');
        await loadInitialData();
    } catch (err) {
        showToast('Erro ao excluir: ' + err.message, 'error');
    }
};

window.closeModal = (id) => {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('active');
};


window.deleteMaint = async (id) => {
    if (!canDo('manutencao_os', 'delete')) {
        alert('Você não tem permissão para excluir manutenções.');
        return;
    }
    if (!confirm('Excluir esta ordem de serviço?')) return;
    const { error } = await supabaseClient.from('manutencoes').delete().eq('id', id);
    if (!error) {
        showToast('OS excluída!');
        await loadInitialData();
    }
};

function exportMaintToExcel() {
    console.log('Exportando manutenções para Excel...');
    alert('Função de exportação será implementada em breve.');
}

let currentAutocompleteIndex = -1;

window.handleMaintVehicleSearch = (el) => {
    currentAutocompleteIndex = -1;
    const query = el.value.toLowerCase().trim();
    const resultsDiv = document.getElementById('maint_veiculo_results');
    if (!resultsDiv) return;

    const filtered = state.vehicles.filter(v => 
        (v.placa || '').toLowerCase().includes(query) || 
        (v.modelo || '').toLowerCase().includes(query)
    );

    if (filtered.length === 0) {
        resultsDiv.innerHTML = '<div style="padding: 0.8rem; color: var(--text-muted); font-size: 0.85rem;">Nenhum veículo encontrado</div>';
    } else {
        resultsDiv.innerHTML = filtered.map(v => `
            <div class="autocomplete-item" style="padding: 0.6rem 0.8rem; cursor: pointer; border-bottom: 1px solid rgba(255, 255, 255, 0.03); transition: background 0.2s;" 
                 onclick="selectMaintVehicle('${v.id}', '${v.placa} - ${v.modelo}')">
                <span style="font-weight: 700; color: white; display: block; font-size: 0.85rem;">${v.placa}</span>
                <span style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase;">${v.modelo}</span>
            </div>
        `).join('');
    }

    resultsDiv.style.display = 'block';
};

window.selectMaintVehicle = (id, label) => {
    const inputSearch = document.getElementById('maint_veiculo_search');
    const inputHidden = document.getElementById('maint_veiculo');
    const resultsDiv = document.getElementById('maint_veiculo_results');
    if (inputSearch && inputHidden) {
        inputSearch.value = label;
        inputHidden.value = id;
    }
    if (resultsDiv) resultsDiv.style.display = 'none';
    currentAutocompleteIndex = -1;
};

window.handleMaintOficinaSearch = (el) => {
    currentAutocompleteIndex = -1;
    const query = el.value.toLowerCase().trim();
    const resultsDiv = document.getElementById('maint_oficina_results');
    if (!resultsDiv) return;

    const filtered = state.oficinas.filter(o => 
        (o.nome || '').toLowerCase().includes(query) ||
        (o.nome_fantasia || '').toLowerCase().includes(query)
    );

    if (filtered.length === 0) {
        resultsDiv.innerHTML = '<div style="padding: 0.8rem; color: var(--text-muted); font-size: 0.85rem;">Nenhuma oficina encontrada</div>';
    } else {
        resultsDiv.innerHTML = filtered.map(o => {
            const hasFantasia = o.nome_fantasia && o.nome_fantasia.toLowerCase() !== o.nome.toLowerCase();
            const subtitle = hasFantasia ? `<span style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; display: block; margin-top: 2px;">Fantasia: ${o.nome_fantasia}</span>` : '';
            return `
                <div class="autocomplete-item" style="padding: 0.6rem 0.8rem; cursor: pointer; border-bottom: 1px solid rgba(255, 255, 255, 0.03); transition: background 0.2s;" 
                     onclick="selectMaintOficina('${o.id}', '${o.nome}')">
                    <span style="font-weight: 700; color: white; display: block; font-size: 0.85rem;">${o.nome}</span>
                    ${subtitle}
                </div>
            `;
        }).join('');
    }

    resultsDiv.style.display = 'block';
};

window.selectMaintOficina = (id, label) => {
    const inputSearch = document.getElementById('maint_oficina_search');
    const inputHidden = document.getElementById('maint_oficina');
    const resultsDiv = document.getElementById('maint_oficina_results');
    if (inputSearch && inputHidden) {
        inputSearch.value = label;
        inputHidden.value = id;
    }
    if (resultsDiv) resultsDiv.style.display = 'none';
    currentAutocompleteIndex = -1;
};

window.handleMaintAutocompleteKeydown = (e, inputEl) => {
    const resultsDiv = inputEl.parentElement.querySelector('.autocomplete-results');
    if (!resultsDiv || resultsDiv.style.display === 'none') return;

    const items = resultsDiv.querySelectorAll('.autocomplete-item');
    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        currentAutocompleteIndex++;
        if (currentAutocompleteIndex >= items.length) currentAutocompleteIndex = 0;
        updateMaintAutocompleteHighlight(items);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        currentAutocompleteIndex--;
        if (currentAutocompleteIndex < 0) currentAutocompleteIndex = items.length - 1;
        updateMaintAutocompleteHighlight(items);
    } else if (e.key === 'Enter' || (e.key === ' ' && currentAutocompleteIndex >= 0)) {
        if (currentAutocompleteIndex >= 0) {
            e.preventDefault();
            items[currentAutocompleteIndex].click();
            currentAutocompleteIndex = -1;
        }
    } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        resultsDiv.style.display = 'none';
        currentAutocompleteIndex = -1;
    }
};

function updateMaintAutocompleteHighlight(items) {
    items.forEach((item, idx) => {
        if (idx === currentAutocompleteIndex) {
            item.style.background = 'rgba(99, 102, 241, 0.2)';
            item.scrollIntoView({ block: 'nearest' });
        } else {
            item.style.background = 'transparent';
        }
    });
}

// Global click handler to close autocompletes when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.autocomplete-wrapper')) {
        const divs = document.querySelectorAll('.autocomplete-results');
        divs.forEach(div => div.style.display = 'none');
    }
});

window.closeMaintModal = (force = false) => {
    const modal = document.getElementById('modalMaint');
    if (!modal || !modal.classList.contains('active')) return;

    if (!force && !confirm('Deseja realmente fechar a manutenção? Quaisquer dados preenchidos e não salvos serão perdidos.')) {
        return;
    }
    modal.classList.remove('active');
};

