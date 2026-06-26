// State management
let auditState = {
    logs: [],
    filteredLogs: [],
    currentPage: 1,
    pageSize: 15,
    totalRecords: 0
};

let supabaseClient = null;

// Initialize
function startInit() {
    // Wait for auth to complete loading user details and permissions
    const checkAuthInterval = setInterval(async () => {
        if (window.currentUser && window.currentUserPermissions) {
            clearInterval(checkAuthInterval);
            initAuditoria();
        }
    }, 100);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startInit);
} else {
    startInit();
}

async function initAuditoria() {
    // 1. Initialize Supabase Client
    if (window.authClient) {
        supabaseClient = window.authClient;
    } else if (window.supabase && window.SUPABASE_URL && window.SUPABASE_KEY) {
        supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
    }

    // Set default dates (past 30 days)
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);

    document.getElementById('auditStartDate').value = thirtyDaysAgo.toISOString().split('T')[0];
    document.getElementById('auditEndDate').value = today.toISOString().split('T')[0];

    // Filtrar opções de módulo no dropdown se não for admin
    if (window.currentUserRole !== 'admin') {
        const select = document.getElementById('auditModule');
        if (select) {
            const allowed = [];
            const perms = window.currentUserPermissions || {};
            Object.keys(perms).forEach(key => {
                if (key.endsWith('_auditoria') && perms[key].view) {
                    allowed.push(key.replace('_auditoria', ''));
                }
            });
            Array.from(select.options).forEach(opt => {
                if (opt.value && !allowed.includes(opt.value)) {
                    opt.style.display = 'none';
                }
            });
        }
    }

    // Load logs
    await loadLogs();
    
    // Initialize Lucide icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

async function loadLogs() {
    const searchVal = document.getElementById('auditSearch').value.trim();
    const moduleFilter = document.getElementById('auditModule').value;
    const actionFilter = document.getElementById('auditAction').value;
    const startDate = document.getElementById('auditStartDate').value;
    const endDate = document.getElementById('auditEndDate').value;

    const companyId = window.currentEmpresaId;

    if (supabaseClient) {
        try {
            let query = supabaseClient
                .from('logs_atividade')
                .select('*', { count: 'exact' });

            if (companyId) {
                query = query.eq('empresa_id', companyId);
            }

            // Determinar módulos permitidos para auditoria (caso usuário normal)
            const isAdmin = window.currentUserRole === 'admin';
            let allowedModules = [];
            if (!isAdmin) {
                const perms = window.currentUserPermissions || {};
                Object.keys(perms).forEach(key => {
                    if (key.endsWith('_auditoria') && perms[key].view) {
                        allowedModules.push(key.replace('_auditoria', ''));
                    }
                });
            }

            if (!isAdmin) {
                if (allowedModules.length === 0) {
                    // Sem permissão de auditoria alguma.
                    auditState.logs = [];
                    auditState.totalRecords = 0;
                    renderLogsTable();
                    return;
                }
                if (moduleFilter) {
                    if (!allowedModules.includes(moduleFilter)) {
                        auditState.logs = [];
                        auditState.totalRecords = 0;
                        renderLogsTable();
                        return;
                    }
                    query = query.eq('modulo', moduleFilter);
                } else {
                    query = query.in('modulo', allowedModules);
                }
            } else {
                if (moduleFilter) {
                    query = query.eq('modulo', moduleFilter);
                }
            }

            if (actionFilter) {
                query = query.eq('acao', actionFilter);
            }

            if (startDate) {
                query = query.gte('data_hora', new Date(startDate + 'T00:00:00').toISOString());
            }

            if (endDate) {
                query = query.lte('data_hora', new Date(endDate + 'T23:59:59').toISOString());
            }

            if (searchVal) {
                query = query.or(`usuario_email.ilike.%${searchVal}%,descricao.ilike.%${searchVal}%,acao.ilike.%${searchVal}%`);
            }

            // Order and Paginate
            query = query.order('data_hora', { ascending: false });

            const from = (auditState.currentPage - 1) * auditState.pageSize;
            const to = from + auditState.pageSize - 1;
            query = query.range(from, to);

            const { data, count, error } = await query;

            if (error) {
                console.error('[Auditoria] Erro ao carregar logs:', error.message);
                loadLocalLogsFallback(searchVal, moduleFilter, actionFilter, startDate, endDate);
            } else {
                auditState.logs = data || [];
                auditState.totalRecords = count || 0;
                renderLogsTable();
            }
        } catch (e) {
            console.error('[Auditoria] Falha de conexão ao carregar logs:', e);
            loadLocalLogsFallback(searchVal, moduleFilter, actionFilter, startDate, endDate);
        }
    } else {
        loadLocalLogsFallback(searchVal, moduleFilter, actionFilter, startDate, endDate);
    }
}

function loadLocalLogsFallback(searchVal, moduleFilter, actionFilter, startDate, endDate) {
    // Local storage fallback (Mock mode)
    let localLogs = JSON.parse(localStorage.getItem('frotalink_audit_logs') || '[]');

    // Filter by company id if exists
    if (window.currentEmpresaId) {
        localLogs = localLogs.filter(log => log.empresa_id === window.currentEmpresaId);
    }

    // Filter by allowed modules if not admin
    const isAdmin = window.currentUserRole === 'admin';
    if (!isAdmin) {
        const allowedModules = [];
        const perms = window.currentUserPermissions || {};
        Object.keys(perms).forEach(key => {
            if (key.endsWith('_auditoria') && perms[key].view) {
                allowedModules.push(key.replace('_auditoria', ''));
            }
        });
        
        if (allowedModules.length === 0) {
            auditState.totalRecords = 0;
            auditState.logs = [];
            renderLogsTable();
            return;
        }

        if (moduleFilter) {
            if (!allowedModules.includes(moduleFilter)) {
                auditState.totalRecords = 0;
                auditState.logs = [];
                renderLogsTable();
                return;
            }
            localLogs = localLogs.filter(log => log.modulo === moduleFilter);
        } else {
            localLogs = localLogs.filter(log => allowedModules.includes(log.modulo));
        }
    } else {
        if (moduleFilter) {
            localLogs = localLogs.filter(log => log.modulo === moduleFilter);
        }
    }

    // Filter by action
    if (actionFilter) {
        localLogs = localLogs.filter(log => log.acao === actionFilter);
    }

    // Filter by date range
    if (startDate) {
        const startMs = new Date(startDate + 'T00:00:00').getTime();
        localLogs = localLogs.filter(log => new Date(log.data_hora).getTime() >= startMs);
    }
    if (endDate) {
        const endMs = new Date(endDate + 'T23:59:59').getTime();
        localLogs = localLogs.filter(log => new Date(log.data_hora).getTime() <= endMs);
    }

    // Filter by search text
    if (searchVal) {
        const lowerSearch = searchVal.toLowerCase();
        localLogs = localLogs.filter(log => 
            (log.usuario_email && log.usuario_email.toLowerCase().includes(lowerSearch)) ||
            (log.descricao && log.descricao.toLowerCase().includes(lowerSearch)) ||
            (log.acao && log.acao.toLowerCase().includes(lowerSearch))
        );
    }

    // Sort by date desc
    localLogs.sort((a, b) => new Date(b.data_hora) - new Date(a.data_hora));

    auditState.totalRecords = localLogs.length;

    // Slice for pagination
    const from = (auditState.currentPage - 1) * auditState.pageSize;
    const to = from + auditState.pageSize;
    auditState.logs = localLogs.slice(from, to);

    renderLogsTable();
}

function formatLogDescription(desc) {
    if (!desc) return '';
    
    // Check if it contains structured tokens
    const hasDetail = desc.includes('DETALHE:');
    const hasAlteracao = desc.includes('ALTERACAO:');
    const hasMotivo = desc.includes('MOTIVO:');
    
    if (!hasDetail && !hasAlteracao && !hasMotivo) {
        return desc; // Fallback
    }
    
    let html = '';
    
    // Parse DETALHE
    if (hasDetail) {
        const start = desc.indexOf('DETALHE:') + 8;
        const end = hasAlteracao ? desc.indexOf('| ALTERACAO:') : (hasMotivo ? desc.indexOf('| MOTIVO:') : desc.length);
        const detailPart = desc.substring(start, end).trim();
        html += `<div style="color: #cbd5e1; margin-bottom: 5px; line-height: 1.4;"><strong>Registro:</strong> ${detailPart}</div>`;
    }
    
    // Parse ALTERACAO
    if (hasAlteracao) {
        const start = desc.indexOf('ALTERACAO:') + 10;
        const end = hasMotivo ? desc.indexOf('| MOTIVO:') : desc.length;
        const alteracaoPart = desc.substring(start, end).trim();
        html += `<div style="color: #fbbf24; margin-bottom: 5px; font-weight: 500; line-height: 1.4;"><strong>Modificações:</strong> ${alteracaoPart}</div>`;
    }
    
    // Parse MOTIVO
    if (hasMotivo) {
        const start = desc.indexOf('MOTIVO:') + 7;
        const motivoPart = desc.substring(start).trim();
        html += `<div style="color: #38bdf8; font-weight: 500; line-height: 1.4;"><strong>Motivo:</strong> ${motivoPart}</div>`;
    }
    
    return html;
}

function renderLogsTable() {
    const tbody = document.getElementById('auditList');
    if (!tbody) return;

    if (auditState.logs.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5">
                    <div class="empty-state">
                        <i data-lucide="info" style="width: 48px; height: 48px;"></i>
                        <h3>Nenhum log encontrado</h3>
                        <p>Ajuste os filtros ou realize novas ações no sistema para gerar registros.</p>
                    </div>
                </td>
            </tr>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
        updatePaginationUI();
        return;
    }

    tbody.innerHTML = auditState.logs.map(log => {
        const dateObj = new Date(log.data_hora);
        const formattedDate = dateObj.toLocaleString('pt-BR');
        const badgeClass = getBadgeClass(log.acao);
        const moduleBadgeClass = 'badge-modulo';

        return `
            <tr>
                <td><strong>${formattedDate}</strong></td>
                <td><span style="font-family: monospace; color: #a5b4fc;">${log.usuario_email || 'sistema@frotalink.com'}</span></td>
                <td><span class="badge ${moduleBadgeClass}">${log.modulo}</span></td>
                <td><span class="badge ${badgeClass}">${log.acao}</span></td>
                <td>${formatLogDescription(log.descricao)}</td>
            </tr>
        `;
    }).join('');

    updatePaginationUI();
}

function getBadgeClass(action) {
    if (!action) return 'badge-default';
    const act = action.toUpperCase();
    if (act.includes('INCLUSÃO')) return 'badge-inclusao';
    if (act.includes('ALTERAÇÃO') || act.includes('EDIÇÃO')) return 'badge-alteracao';
    if (act.includes('EXCLUSÃO')) return 'badge-exclusao';
    if (act.includes('IMPORTAÇÃO')) return 'badge-importacao';
    if (act.includes('ALERTA')) return 'badge-limpeza';
    return 'badge-default';
}

function updatePaginationUI() {
    const from = auditState.totalRecords === 0 ? 0 : (auditState.currentPage - 1) * auditState.pageSize + 1;
    const to = Math.min(auditState.currentPage * auditState.pageSize, auditState.totalRecords);

    document.getElementById('paginationInfo').innerText = `Mostrando ${from}-${to} de ${auditState.totalRecords} registros`;

    document.getElementById('btnPrevPage').disabled = auditState.currentPage === 1;
    document.getElementById('btnNextPage').disabled = to >= auditState.totalRecords;
}

function handleFilterChange() {
    auditState.currentPage = 1;
    loadLogs();
}

function prevPage() {
    if (auditState.currentPage > 1) {
        auditState.currentPage--;
        loadLogs();
    }
}

function nextPage() {
    const maxPage = Math.ceil(auditState.totalRecords / auditState.pageSize);
    if (auditState.currentPage < maxPage) {
        auditState.currentPage++;
        loadLogs();
    }
}

