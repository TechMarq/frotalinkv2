/**
 * auth.js — Módulo de Autenticação Compartilhado
 * FrotaLink / FrotaLink
 *
 * Inclua este script no <head> de TODAS as páginas HTML:
 *   <script src="auth.js"></script>
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 *
 * IMPORTANTE: auth.js deve ser carregado ANTES do supabase-js ou junto com ele.
 * Por isso, use um DOMContentLoaded listener interno para aguardar o supabase.
 */

// ============================================================
//  CONFIGURAÇÃO — EDITE AQUI
// ============================================================

const AUTH_CONFIG = {
    supabaseUrl: 'https://ffgwqsrfmmcqwjjkbrsq.supabase.co',
    supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmZ3dxc3JmbW1jcXdqamticnNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NDA3MDEsImV4cCI6MjA5MDAxNjcwMX0.bLHIvQENAcGZ0i0zk85oW7NPvGuMtJey7RqzORcqf0U',

    // Páginas que NÃO precisam de autenticação
    publicPages: ['login.html', 'empresa_setup.html'],

    // Mapa de módulos para páginas (para verificar permissão)
    moduleMap: {
        'index.html': 'frota',
        'abastecimento.html': 'abastecimento',
        'manutencao.html': 'manutencao',
        'compras.html': 'compras',
        'estoque.html': 'estoque',
        'fechamento.html': 'fechamento',
        'financeiro.html': 'financeiro',
        'comercial.html': 'comercial',
        'dp.html': 'dp',      // Departamento Pessoal
        'home.html': null,    // Home sempre acessível a autenticados
        'admin.html': 'admin', // Apenas role=admin
        'auditoria.html': 'admin'
    }
};

// ============================================================
//  ESTADO GLOBAL
// ============================================================

window.authClient         = null;
window.currentUser        = null;
window.currentUserRole    = null;
window.currentUserModules = [];
window.currentUserAccess  = null;
window.currentEmpresaId   = null;  // ← NOVO: empresa vinculada ao usuário
window.currentEmpresa     = null;  // ← NOVO: dados completos da empresa

// ============================================================
//  INICIALIZAÇÃO
// ============================================================

(function initAuth() {
    // Aguarda o supabase-js estar disponível
    function waitForSupabase(callback, attempts = 0) {
        if (typeof supabase !== 'undefined') {
            callback();
        } else if (attempts < 50) {
            setTimeout(() => waitForSupabase(callback, attempts + 1), 100);
        } else {
            console.error('[Auth] Supabase não carregou. Verifique a CDN.');
        }
    }

    waitForSupabase(async () => {
        window.authClient = supabase.createClient(AUTH_CONFIG.supabaseUrl, AUTH_CONFIG.supabaseKey);

        const currentPage = getCurrentPage();

        // Páginas públicas: não verificar auth
        if (AUTH_CONFIG.publicPages.some(p => currentPage.endsWith(p))) {
            return;
        }

        // Verificar sessão ativa
        const { data: { session }, error } = await window.authClient.auth.getSession();

        if (!session) {
            redirectToLogin('Sua sessão expirou. Faça login para continuar.');
            return;
        }

        window.currentUser = session.user;

        // Verificar permissão de acesso na tabela user_access
        const { data: accessData, error: accessError } = await window.authClient
            .from('user_access')
            .select('*')
            .eq('email', session.user.email)
            .eq('active', true)
            .single();

        if (accessError || !accessData) {
            await window.authClient.auth.signOut();
            redirectToLogin('Acesso não autorizado. Contate o administrador.');
            return;
        }

        window.currentUserRole    = accessData.role;
        window.currentUserModules = accessData.modules || [];
        if (!window.currentUserModules.includes('dp')) {
            window.currentUserModules.push('dp');
        }
        window.currentUserAccess  = accessData;
        window.currentUserPermissions = accessData.permissions || {};
        // Se for admin, garantir permissões completas para o módulo 'dp' em memória
        if (accessData.role === 'admin') {
            if (!window.currentUserPermissions['dp']) window.currentUserPermissions['dp'] = { view: true, create: true, edit: true, delete: true };
        }
        window.currentEmpresaId   = accessData.empresa_id || null;

        // ── NOVO: Carregar dados da empresa ──────────────────────────────
        if (window.currentEmpresaId) {
            const { data: empresaData } = await window.authClient
                .from('empresas')
                .select('*')
                .eq('id', window.currentEmpresaId)
                .single();

            window.currentEmpresa = empresaData || null;

            // Se admin e empresa ainda não completou o setup → redirecionar para onboarding
            if (
                accessData.role === 'admin' &&
                empresaData &&
                empresaData.setup_completo === false &&
                !currentPage.endsWith('empresa_setup.html')
            ) {
                window.location.href = 'empresa_setup.html';
                return;
            }
        } else if (accessData.role === 'admin' && !currentPage.endsWith('empresa_setup.html')) {
            // Admin sem empresa vinculada → redirecionar para criar empresa
            window.location.href = 'empresa_setup.html';
            return;
        }
        // ─────────────────────────────────────────────────────────────────

        // Verificar se é primeiro acesso ou se foi solicitado reset pelo administrador (temp_reset = true)
        const isTempPassword = session.user.user_metadata?.is_temporary_password === true || accessData.temp_reset === true;
        if (isTempPassword) {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => showForceChangePasswordOverlay());
            } else {
                showForceChangePasswordOverlay();
            }
            return;
        }

        // Verificar permissão para o módulo desta página
        const requiredModule = AUTH_CONFIG.moduleMap[currentPage];

        if (requiredModule === 'admin' && accessData.role !== 'admin') {
            if (currentPage.endsWith('auditoria.html')) {
                const perms = accessData.permissions || {};
                const hasAuditoriaAccess = Object.keys(perms).some(key => key.endsWith('_auditoria') && perms[key].view);
                if (!hasAuditoriaAccess) {
                    redirectToLogin('Acesso restrito ao administrador ou usuários autorizados.');
                    return;
                }
            } else {
                redirectToLogin('Acesso restrito ao administrador.');
                return;
            }
        }

        if (requiredModule && requiredModule !== 'admin') {
            const hasViewPerm = window.currentUserRole === 'admin' || 
                (window.currentUserPermissions[requiredModule] && window.currentUserPermissions[requiredModule].view) ||
                Object.keys(window.currentUserPermissions).some(key => 
                    (key.startsWith(requiredModule + '_') || key === requiredModule) && window.currentUserPermissions[key].view
                );
            
            if (!hasViewPerm) {
                // Sem permissão para este módulo
                showNoPermissionOverlay(requiredModule);
                return;
            }
        }

        // Injetar UI de usuário logado quando o DOM estiver pronto
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                injectAuthUI();
                if (requiredModule && requiredModule !== 'admin') {
                    applyPermissions(requiredModule);
                }
            });
        } else {
            injectAuthUI();
            if (requiredModule && requiredModule !== 'admin') {
                applyPermissions(requiredModule);
            }
        }
    });
})();

/**
 * Verifica permissão granular para uma ação específica em um módulo
 */
function canDo(modulo, acao) {
    if (window.currentUserRole === 'admin') return true;
    
    let targetMod = modulo;
    if (targetMod === 'dp') {
        targetMod = 'dp_funcionarios';
    }
    if (targetMod === 'abastecimento_importacoes' && window.currentUserPermissions) {
        if (!window.currentUserPermissions['abastecimento_importacoes'] && window.currentUserPermissions['abastecimento_integracoes']) {
            targetMod = 'abastecimento_integracoes';
        }
    }
    if (targetMod === 'compras_historico') {
        targetMod = 'compras_notas';
    }
    
    let targetAcao = acao;
    if (targetAcao === 'create') {
        targetAcao = 'add';
    }
    
    if (!window.currentUserPermissions || !window.currentUserPermissions[targetMod]) return false;
    
    // As chaves no JSON podem ser 'view', 'add', 'edit', 'delete'
    return !!window.currentUserPermissions[targetMod][targetAcao];
}
window.canDo = canDo;

/**
 * Oculta/remove elementos de acordo com as permissões do módulo atual
 */
function applyPermissions(modulo) {
    if (window.currentUserRole === 'admin') return;

    function runHiding() {
        // 1. Ocultar elementos com data-perm específica (ex: data-perm="frota_veiculos:delete")
        document.querySelectorAll('[data-perm]').forEach(el => {
            const permVal = el.getAttribute('data-perm');
            if (permVal.includes(':')) {
                const [mod, action] = permVal.split(':');
                if (!canDo(mod, action)) {
                    el.style.display = 'none';
                } else {
                    el.style.display = ''; // restabelece se tiver permissão
                }
            } else {
                // Compatibilidade com o formato anterior data-perm="add/edit/delete"
                if (!canDo(modulo, permVal)) {
                    el.style.display = 'none';
                } else {
                    el.style.display = '';
                }
            }
        });

        // 2. Bloqueio de Adicionar Geral (compatibilidade)
        if (!canDo(modulo, 'add')) {
            document.querySelectorAll('[id*="btn-novo"], [id*="btn-adicionar"], [class*="btn-novo"], [class*="btn-adicionar"]').forEach(el => {
                if (!el.hasAttribute('data-perm')) el.style.display = 'none';
            });
        }
        
        // 3. Bloqueio de Editar Geral (compatibilidade)
        if (!canDo(modulo, 'edit')) {
            document.querySelectorAll('.btn-action.edit, .action-btn-edit, [class*="btn-editar"], [id*="btn-editar"]').forEach(el => {
                if (!el.hasAttribute('data-perm')) el.style.display = 'none';
            });
        }
        
        // 4. Bloqueio de Excluir Geral (compatibilidade)
        if (!canDo(modulo, 'delete')) {
            document.querySelectorAll('.btn-action.delete, .action-btn-delete, [class*="btn-excluir"], [id*="btn-excluir"]').forEach(el => {
                if (!el.hasAttribute('data-perm')) el.style.display = 'none';
            });
        }

        // 5. Regras Específicas para o Módulo de Compras (sem alterar a estrutura do HTML)
        if (modulo === 'compras') {
            // A. Controle de abas
            document.querySelectorAll('.tab-btn').forEach(el => {
                const onClick = el.getAttribute('onclick') || '';
                if (onClick.includes('dashboard') || onClick.includes('compras')) {
                    if (!canDo('compras_historico', 'view')) el.style.display = 'none';
                    else el.style.display = '';
                } else if (onClick.includes('cadastro')) {
                    if (!canDo('compras_cadastros', 'view')) el.style.display = 'none';
                    else el.style.display = '';
                }
            });

            // B. Botão de Lançar Compra
            document.querySelectorAll('button[onclick*="openCompraModal"]').forEach(el => {
                if (!canDo('compras_historico', 'add')) el.style.display = 'none';
                else el.style.display = '';
            });

            // C. Botão de Cadastrar Novo
            const btnGenericAdd = document.getElementById('btnGenericAdd');
            if (btnGenericAdd) {
                if (!canDo('compras_cadastros', 'add')) btnGenericAdd.style.display = 'none';
                else btnGenericAdd.style.display = '';
            }

            // D. Botões de ação do Histórico de Compras (Editar / Excluir)
            document.querySelectorAll('.action-btn-mini').forEach(el => {
                const title = el.getAttribute('title') || '';
                if (title.includes('Editar')) {
                    if (!canDo('compras_historico', 'edit')) el.style.display = 'none';
                    else el.style.display = '';
                } else if (title.includes('Excluir')) {
                    if (!canDo('compras_historico', 'delete')) el.style.display = 'none';
                    else el.style.display = '';
                }
            });

            // E. Botões de ação do Cadastro (Editar / Excluir)
            document.querySelectorAll('.btn-edit, .btn-delete').forEach(el => {
                if (el.classList.contains('btn-edit')) {
                    if (!canDo('compras_cadastros', 'edit')) el.style.display = 'none';
                    else el.style.display = '';
                } else if (el.classList.contains('btn-delete')) {
                    if (!canDo('compras_cadastros', 'delete')) el.style.display = 'none';
                    else el.style.display = '';
                }
            });
        }

        // 6. Regras Específicas para o Módulo de Estoque (por aba)
        if (modulo === 'estoque') {

            // ── Verificação de acesso total ao módulo ──────────────────────
            const hasAnyEstoque = canDo('estoque_inventario', 'view') ||
                                  canDo('estoque_historico',  'view') ||
                                  canDo('estoque_vendas',     'view') ||
                                  canDo('estoque_cadastros',  'view');

            // ── A. Controle das abas (tab-items) ──────────────────────────
            document.querySelectorAll('.tab-item').forEach(el => {
                const onClick = el.getAttribute('onclick') || '';

                // Aba "Lista de Itens" → switchTab('list')
                if (onClick.includes("switchTab('list')")) {
                    if (!canDo('estoque_inventario', 'view')) el.style.display = 'none';
                    else el.style.display = '';
                }
                // Aba "Histórico de Movimentação" → switchTab('history')
                if (onClick.includes("switchTab('history')")) {
                    if (!canDo('estoque_historico', 'view')) el.style.display = 'none';
                    else el.style.display = '';
                }
                // Aba "Novo Produto" → prepareNewProduct()
                if (onClick.includes('prepareNewProduct')) {
                    if (!canDo('estoque_inventario', 'add')) el.style.display = 'none';
                    else el.style.display = '';
                }
                // Aba "Cadastros Auxiliares" → switchTab('setup')
                if (onClick.includes("switchTab('setup')")) {
                    if (!canDo('estoque_cadastros', 'view')) el.style.display = 'none';
                    else el.style.display = '';
                }
            });

            // ── B. Sections — ocultar conteúdo se sem permissão de view ───
            const sectionList = document.getElementById('section_list');
            if (sectionList && !canDo('estoque_inventario', 'view')) {
                sectionList.style.display = 'none';
            }
            const sectionHistory = document.getElementById('section_history');
            if (sectionHistory && !canDo('estoque_historico', 'view')) {
                sectionHistory.style.display = 'none';
            }
            const sectionNew = document.getElementById('section_new');
            if (sectionNew && !canDo('estoque_inventario', 'add')) {
                sectionNew.style.display = 'none';
            }
            const sectionSetup = document.getElementById('section_setup');
            if (sectionSetup && !canDo('estoque_cadastros', 'view')) {
                sectionSetup.style.display = 'none';
            }

            // ── C. Botão "Novo Produto" e "Vendas/Saída" na barra de filtros
            document.querySelectorAll('button[onclick*="prepareNewProduct"]').forEach(el => {
                if (!canDo('estoque_inventario', 'add')) el.style.display = 'none';
                else el.style.display = '';
            });
            document.querySelectorAll('button[onclick*="openVendaModal"]').forEach(el => {
                if (!canDo('estoque_vendas', 'add')) el.style.display = 'none';
                else el.style.display = '';
            });

            // ── D. Modal de produto: Editar / Excluir ─────────────────────
            const btnViewEdit = document.getElementById('btn_view_edit_trigger');
            if (btnViewEdit) {
                if (!canDo('estoque_inventario', 'edit')) btnViewEdit.style.display = 'none';
                else btnViewEdit.style.display = '';
            }
            const btnViewDelete = document.getElementById('btn_view_delete_trigger');
            if (btnViewDelete) {
                if (!canDo('estoque_inventario', 'delete')) btnViewDelete.style.display = 'none';
                else btnViewDelete.style.display = '';
            }

            // ── E. Ajuste de Inventário (Reajuste de Saldo) ───────────────
            document.querySelectorAll('.adjust-form').forEach(el => {
                if (!canDo('estoque_inventario', 'edit')) el.style.display = 'none';
                else el.style.display = '';
            });
            document.querySelectorAll('button[onclick*="saveQuickAdjustment"]').forEach(el => {
                if (!canDo('estoque_inventario', 'edit')) el.style.display = 'none';
                else el.style.display = '';
            });

            // ── F. Cadastros Auxiliares: botões de adicionar ───────────────
            ['addBrand', 'addCategory', 'addUnit', 'addModel', 'addCliente'].forEach(fn => {
                document.querySelectorAll(`button[onclick*="${fn}"]`).forEach(el => {
                    if (!canDo('estoque_cadastros', 'add')) el.style.display = 'none';
                    else el.style.display = '';
                });
            });

            // ── G. Cadastros Auxiliares: botões de excluir ─────────────────
            ['deleteCategory', 'deleteModel', 'deleteUnit', 'deleteBrand', 'deleteCliente'].forEach(fn => {
                document.querySelectorAll(`button[onclick*="${fn}"]`).forEach(el => {
                    if (!canDo('estoque_cadastros', 'delete')) el.style.display = 'none';
                    else el.style.display = '';
                });
            });

            // ── H. Ações da Tabela de Itens (Lista de Itens) ─────────────
            const hasEdit = canDo('estoque_inventario', 'edit');
            const hasDelete = canDo('estoque_inventario', 'delete');

            const thAcoes = document.getElementById('th_acoes_inventario');
            if (thAcoes) {
                if (!hasEdit && !hasDelete) {
                    thAcoes.style.display = 'none';
                } else {
                    thAcoes.style.display = '';
                }
            }

            document.querySelectorAll('td[data-label="Ações"]').forEach(el => {
                if (!hasEdit && !hasDelete) {
                    el.style.display = 'none';
                } else {
                    el.style.display = '';
                }
            });

            document.querySelectorAll('button[onclick*="editProduct"]').forEach(el => {
                if (!hasEdit) el.style.display = 'none';
                else el.style.display = '';
            });

            document.querySelectorAll('button[onclick*="deleteProduct"]').forEach(el => {
                if (!hasDelete) el.style.display = 'none';
                else el.style.display = '';
            });
        }
        // 7. Regras Específicas para o Módulo de Financeiro (por aba)
        if (modulo === 'financeiro') {

            // ── A. Abas de Lançamentos ────────────────────────────────────
            const submodules = {
                dashboard: 'financeiro_dashboard',
                pagar: 'financeiro_pagar',
                receber: 'financeiro_receber',
                fluxo: 'financeiro_fluxo',
                dre: 'financeiro_dre',
                conciliacao: 'financeiro_conciliacao',
                config: 'financeiro_config'
            };

            Object.entries(submodules).forEach(([tabId, subkey]) => {
                document.querySelectorAll(`button[onclick*="switchMainTab('${tabId}')"]`).forEach(el => {
                    if (!canDo(subkey, 'view')) el.style.display = 'none';
                    else el.style.display = '';
                });
                const section = document.getElementById(`tab-${tabId}`);
                if (section) {
                    if (!canDo(subkey, 'view')) {
                        section.style.display = 'none';
                        section.classList.remove('active');
                    }
                }
            });

            // Auto switch to first allowed tab if active one is hidden
            const activeTabButton = document.querySelector('.tabs-header .tab-item.active');
            if (activeTabButton && activeTabButton.style.display === 'none') {
                const firstVisible = Array.from(document.querySelectorAll('.tabs-header .tab-item')).find(el => el.style.display !== 'none');
                if (firstVisible) {
                    firstVisible.click();
                }
            }

            // ── B. Botões de adicionar Lançamentos ────────────────────────
            document.querySelectorAll('button[onclick*="openEntryModal"], button[onclick*="openReceberModal"]').forEach(el => {
                const onclickAttr = el.getAttribute('onclick') || '';
                if (onclickAttr.includes("'PAGAR'") || onclickAttr.includes('"PAGAR"') || onclickAttr.includes('openEntryModal')) {
                    if (!canDo('financeiro_pagar', 'add')) el.style.display = 'none';
                    else el.style.display = '';
                }
                if (onclickAttr.includes("'RECEBER'") || onclickAttr.includes('"RECEBER"') || onclickAttr.includes('openReceberModal')) {
                    if (!canDo('financeiro_receber', 'add')) el.style.display = 'none';
                    else el.style.display = '';
                }
            });

            // ── C. Ações da Tabela de Contas a Pagar (PAGAR) ─────────────────
            const hasPagarEdit = canDo('financeiro_pagar', 'edit');
            const hasPagarDelete = canDo('financeiro_pagar', 'delete');
            const tablePagar = document.getElementById('table-pagar');
            if (tablePagar) {
                const thAcoes = tablePagar.querySelector('thead th:last-child');
                if (thAcoes) {
                    thAcoes.style.display = (!hasPagarEdit && !hasPagarDelete) ? 'none' : '';
                }
                tablePagar.querySelectorAll('tbody tr').forEach(tr => {
                    const actionsCell = tr.querySelector('.actions-cell');
                    if (actionsCell) {
                        actionsCell.style.display = (!hasPagarEdit && !hasPagarDelete) ? 'none' : '';
                    }
                    tr.querySelectorAll('.btn-action.edit, .btn-action.pay, .btn-action.duplicate').forEach(btn => {
                        btn.style.display = hasPagarEdit ? '' : 'none';
                    });
                    tr.querySelectorAll('.btn-action.delete').forEach(btn => {
                        btn.style.display = hasPagarDelete ? '' : 'none';
                    });
                });
            }

            // ── D. Ações da Tabela de Contas a Receber (RECEBER) ─────────────
            const hasReceberEdit = canDo('financeiro_receber', 'edit');
            const hasReceberDelete = canDo('financeiro_receber', 'delete');
            const tableReceber = document.getElementById('table-receber');
            if (tableReceber) {
                const thAcoes = tableReceber.querySelector('thead th:last-child');
                if (thAcoes) {
                    thAcoes.style.display = (!hasReceberEdit && !hasReceberDelete) ? 'none' : '';
                }
                tableReceber.querySelectorAll('tbody tr').forEach(tr => {
                    const actionsCell = tr.querySelector('.actions-cell');
                    if (actionsCell) {
                        actionsCell.style.display = (!hasReceberEdit && !hasReceberDelete) ? 'none' : '';
                    }
                    tr.querySelectorAll('.btn-action.edit, .btn-action.pay').forEach(btn => {
                        btn.style.display = hasReceberEdit ? '' : 'none';
                    });
                    tr.querySelectorAll('.btn-action.delete').forEach(btn => {
                        btn.style.display = hasReceberDelete ? '' : 'none';
                    });
                });
            }

            // ── E. Botão de Excluir Lançamento no Modal (Delete Action) ──────
            const btnDeleteEntry = document.getElementById('btnDeleteEntry');
            if (btnDeleteEntry) {
                const entryTipo = document.getElementById('entryTipo')?.value;
                if (entryTipo === 'RECEBER') {
                    btnDeleteEntry.style.display = canDo('financeiro_receber', 'delete') ? '' : 'none';
                } else {
                    btnDeleteEntry.style.display = canDo('financeiro_pagar', 'delete') ? '' : 'none';
                }
            }

            // ── F. Conciliação Actions ─────────────────────────────────────
            document.querySelectorAll('button[onclick*="handleOFXUpload"], button[onclick*="ofdImport"]').forEach(el => {
                if (!canDo('financeiro_conciliacao', 'add')) el.style.display = 'none';
                else el.style.display = '';
            });

            // ── G. Botões de adicionar e editar Cadastros ─────────────────
            ['openFornecedorModal', 'openBankAccountModal', 'openPlanoModal', 'openCustoModal', 'openFormaModal'].forEach(fn => {
                document.querySelectorAll(`button[onclick*="${fn}"]`).forEach(el => {
                    const onclickAttr = el.getAttribute('onclick') || '';
                    const isEdit = /\([^)]+\)/.test(onclickAttr) && !onclickAttr.includes('()');
                    if (isEdit) {
                        if (!canDo('financeiro_config', 'edit')) el.style.display = 'none';
                        else el.style.display = '';
                    } else {
                        if (!canDo('financeiro_config', 'add')) el.style.display = 'none';
                        else el.style.display = '';
                    }
                });
            });

            // ── H. Botões de excluir Cadastros ───────────────────────────
            ['deleteFornecedor', 'deletePlanoItem', 'deleteCustoItem', 'deleteBankItem', 'deleteFormaItem'].forEach(fn => {
                document.querySelectorAll(`button[onclick*="${fn}"]`).forEach(el => {
                    if (!canDo('financeiro_config', 'delete')) el.style.display = 'none';
                    else el.style.display = '';
                });
            });
        }

        // 8. Regras Específicas para o Módulo de Comercial
        if (modulo === 'comercial') {
            // A. Controle de Abas
            document.querySelectorAll('.tab-item').forEach(el => {
                const onClick = el.getAttribute('onclick') || '';
                if (onClick.includes("'contratos'")) {
                    if (!canDo('comercial_contratos', 'view')) el.style.display = 'none';
                    else el.style.display = '';
                } else if (onClick.includes("'admin'")) {
                    if (!canDo('comercial_cadastros', 'view')) el.style.display = 'none';
                    else el.style.display = '';
                }
            });

            // B. Ocultar seções se sem permissão de view
            const secContratos = document.getElementById('view-contratos');
            if (secContratos && !canDo('comercial_contratos', 'view')) {
                secContratos.style.display = 'none';
                secContratos.classList.remove('active');
            }
            const secAdmin = document.getElementById('view-admin');
            if (secAdmin && !canDo('comercial_cadastros', 'view')) {
                secAdmin.style.display = 'none';
                secAdmin.classList.remove('active');
            }

            // Auto switch to first allowed tab if active one is hidden
            const activeTabButton = document.querySelector('.tabs-header .tab-item.active');
            if (activeTabButton && activeTabButton.style.display === 'none') {
                const firstVisible = Array.from(document.querySelectorAll('.tabs-header .tab-item')).find(el => el.style.display !== 'none');
                if (firstVisible) {
                    firstVisible.click();
                }
            }

            // C. Novo e Editar Contrato
            document.querySelectorAll('button[onclick*="openContratoModal"]').forEach(el => {
                const onclickAttr = el.getAttribute('onclick') || '';
                const isEdit = /\([^)]+\)/.test(onclickAttr) && !onclickAttr.includes('()');
                if (isEdit) {
                    if (!canDo('comercial_contratos', 'edit')) el.style.display = 'none';
                    else el.style.display = '';
                } else {
                    if (!canDo('comercial_contratos', 'add')) el.style.display = 'none';
                    else el.style.display = '';
                }
            });

            // E. Excluir Contrato (em tabelas)
            document.querySelectorAll('button[onclick*="deleteContrato"]').forEach(el => {
                if (!canDo('comercial_contratos', 'delete')) el.style.display = 'none';
                else el.style.display = '';
            });

            // F. Adicionar Cadastros
            document.querySelectorAll('button[onclick*="openAdminModal"]').forEach(el => {
                if (!canDo('comercial_cadastros', 'add')) el.style.display = 'none';
                else el.style.display = '';
            });

            // G. Excluir Cadastros
            document.querySelectorAll('button[onclick*="deleteAdminItem"]').forEach(el => {
                if (!canDo('comercial_cadastros', 'delete')) el.style.display = 'none';
                else el.style.display = '';
            });
        }
    }

    // Executa imediatamente
    runHiding();

    // Como tabelas muitas vezes carregam via chamadas assíncronas do Supabase, rodamos um MutationObserver
    // para monitorar alterações na página e reaplicar as regras de permissão
    const observer = new MutationObserver(() => {
        runHiding();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

/**
 * Overlay para forçar alteração de senha no primeiro acesso
 */
function showForceChangePasswordOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'auth-force-password';
    overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 99999;
        background: #0f172a;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        font-family: 'Inter', system-ui, sans-serif;
        color: #f8fafc;
        background-image:
            radial-gradient(at 50% 0%, hsla(225, 39%, 30%, 1) 0, transparent 50%);
    `;
    overlay.innerHTML = `
        <div style="background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 16px; padding: 2.5rem; width: 100%; max-width: 420px; backdrop-filter: blur(20px);
            box-shadow: 0 25px 50px rgba(0,0,0,0.5);">
            <div style="text-align:center; margin-bottom: 1.5rem;">
                <div style="width: 60px; height: 60px; background: rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.25);
                    border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem; font-size: 1.6rem;">
                    🔑
                </div>
                <h2 style="font-size: 1.3rem; font-weight: 800; margin-bottom: 0.5rem;
                    background: linear-gradient(to right, #818cf8, #c084fc);
                    -webkit-background-clip: text; background-clip: text;
                    -webkit-text-fill-color: transparent;">
                    Primeiro Acesso
                </h2>
                <p style="color: #94a3b8; font-size: 0.85rem; line-height: 1.5;">
                    Por questões de segurança corporativa, você precisa definir uma nova senha antes de continuar.
                </p>
            </div>

            <div id="password-alert" style="display:none; padding: 0.75rem; border-radius: 8px; font-size: 0.8rem; margin-bottom: 1rem; text-align:center;"></div>

            <form id="forcePasswordForm" onsubmit="handleForcePasswordChange(event)" style="display:flex; flex-direction:column; gap: 1rem;">
                <div style="display:flex; flex-direction:column; gap: 0.4rem;">
                    <label style="font-size: 0.8rem; font-weight: 600; color: #94a3b8;">Nova Senha</label>
                    <input type="password" id="force-new-password" placeholder="Mínimo 6 caracteres" required style="
                        width: 100%; padding: 0.75rem 1rem; background: rgba(255,255,255,0.04);
                        border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; color: white; font-size: 0.9rem; outline:none;">
                </div>
                <div style="display:flex; flex-direction:column; gap: 0.4rem;">
                    <label style="font-size: 0.8rem; font-weight: 600; color: #94a3b8;">Confirmar Nova Senha</label>
                    <input type="password" id="force-confirm-password" placeholder="Digite a senha novamente" required style="
                        width: 100%; padding: 0.75rem 1rem; background: rgba(255,255,255,0.04);
                        border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; color: white; font-size: 0.9rem; outline:none;">
                </div>

                <button type="submit" id="forcePasswordBtn" style="
                    margin-top: 0.5rem; width: 100%; padding: 0.8rem; background: #4f46e5; color: white;
                    border: none; border-radius: 8px; font-size: 0.9rem; font-weight: 700; cursor: pointer;
                    transition: background 0.2s;">
                    Salvar e Entrar
                </button>
            </form>

            <button onclick="authLogout()" style="
                display: block; margin: 1.5rem auto 0; background: transparent; border: none;
                color: #94a3b8; cursor: pointer; font-size: 0.8rem; text-decoration: underline;">
                Sair / Voltar ao login
            </button>
        </div>
    `;
    document.body.appendChild(overlay);
}

/**
 * Trata o envio da nova senha obrigatória
 */
async function handleForcePasswordChange(e) {
    e.preventDefault();
    const newPassword = document.getElementById('force-new-password').value;
    const confirmPassword = document.getElementById('force-confirm-password').value;
    const alertBox = document.getElementById('password-alert');
    const btn = document.getElementById('forcePasswordBtn');

    if (newPassword.length < 6) {
        showAlertBox(alertBox, 'A senha precisa ter no mínimo 6 caracteres.', 'error');
        return;
    }

    if (newPassword !== confirmPassword) {
        showAlertBox(alertBox, 'As senhas não coincidem.', 'error');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Salvando...';

    try {
        // 1. Atualizar a senha e remover a flag de is_temporary_password do user_metadata no Auth
        const { error } = await window.authClient.auth.updateUser({
            password: newPassword,
            data: { is_temporary_password: false }
        });

        if (error) throw error;

        // 2. Desativar a flag temp_reset na tabela user_access do banco
        const { error: dbError } = await window.authClient
            .from('user_access')
            .update({ temp_reset: false })
            .eq('email', window.currentUser.email);

        if (dbError) console.error('Erro ao limpar flag temp_reset no banco:', dbError);

        showAlertBox(alertBox, 'Senha alterada com sucesso! Redirecionando...', 'success');
        
        // 3. Recarregar a página para liberar o acesso ao sistema
        setTimeout(() => {
            window.location.reload();
        }, 1200);

    } catch (err) {
        showAlertBox(alertBox, 'Erro ao atualizar senha: ' + err.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Salvar e Entrar';
    }
}

function showAlertBox(el, text, type) {
    el.textContent = text;
    el.style.display = 'block';
    if (type === 'error') {
        el.style.cssText = 'display:block; padding: 0.75rem; border-radius: 8px; font-size: 0.8rem; margin-bottom: 1rem; text-align:center; background: rgba(239,68,68,0.1); color: #fca5a5; border: 1px solid rgba(239,68,68,0.2);';
    } else {
        el.style.cssText = 'display:block; padding: 0.75rem; border-radius: 8px; font-size: 0.8rem; margin-bottom: 1rem; text-align:center; background: rgba(16,185,129,0.1); color: #6ee7b7; border: 1px solid rgba(16,185,129,0.2);';
    }
}

// ============================================================
//  FUNÇÕES UTILITÁRIAS
// ============================================================

function getCurrentPage() {
    return window.location.pathname.split('/').pop() || 'home.html';
}

function redirectToLogin(message) {
    if (message) {
        sessionStorage.setItem('auth_message', message);
    }
    const currentPage = getCurrentPage();
    if (!AUTH_CONFIG.publicPages.some(p => currentPage.endsWith(p))) {
        window.location.href = 'login.html';
    }
}

/**
 * Logout global — chame de qualquer página
 */
async function authLogout() {
    if (window.authClient) {
        await window.authClient.auth.signOut();
    }
    sessionStorage.setItem('auth_message', 'Você saiu com sucesso.');
    window.location.href = 'login.html';
}

/**
 * Verifica se o usuário atual tem acesso a um módulo específico
 */
function hasModuleAccess(moduleName) {
    if (window.currentUserRole === 'admin') return true;
    return window.currentUserModules.includes(moduleName);
}

/**
 * Retorna o nome de exibição da empresa atual
 */
function getEmpresaNome() {
    if (window.currentEmpresa) {
        return window.currentEmpresa.nome_fantasia || window.currentEmpresa.razao_social || 'Minha Empresa';
    }
    return 'Minha Empresa';
}

/**
 * Exibe overlay de sem permissão (em vez de redirecionar)
 */
function showNoPermissionOverlay(moduleName) {
    const overlay = document.createElement('div');
    overlay.id = 'auth-no-permission';
    overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 99999;
        background: #0f172a;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        font-family: 'Inter', system-ui, sans-serif;
        color: #f8fafc;
    `;
    overlay.innerHTML = `
        <div style="text-align:center; max-width: 420px; padding: 2rem;">
            <div style="font-size: 4rem; margin-bottom: 1rem;">🔒</div>
            <h2 style="font-size: 1.5rem; font-weight: 800; margin-bottom: 0.5rem;
                background: linear-gradient(to right, #818cf8, #c084fc);
                -webkit-background-clip: text; background-clip: text;
                -webkit-text-fill-color: transparent;">
                Acesso Restrito
            </h2>
            <p style="color: #94a3b8; margin-bottom: 2rem; line-height: 1.6;">
                Você não tem permissão para acessar o módulo <strong style="color:#818cf8">${moduleName}</strong>.<br>
                Contate o administrador do sistema.
            </p>
            <a href="home.html" style="
                display: inline-flex; align-items: center; gap: 0.5rem;
                background: #4f46e5; color: white; padding: 0.75rem 1.5rem;
                border-radius: 8px; text-decoration: none; font-weight: 600;
                transition: background 0.2s;">
                ← Voltar ao Hub
            </a>
            <button onclick="authLogout()" style="
                display: block; margin: 1rem auto 0;
                background: transparent; border: none; color: #94a3b8;
                cursor: pointer; font-size: 0.85rem; text-decoration: underline;">
                Sair da conta
            </button>
        </div>
    `;
    document.body.appendChild(overlay);
}

// ============================================================
//  INJEÇÃO DE UI (Avatar + Logout no header)
// ============================================================

function injectAuthUI() {
    if (!window.currentUser) return;

    const email      = window.currentUser.email || '';
    const role       = window.currentUserRole || 'user';
    const initials   = email.substring(0, 2).toUpperCase();
    const empresaNome = getEmpresaNome();
    const isAdmin    = role === 'admin';

    // Criar elemento de UI do usuário
    const authWidget = document.createElement('div');
    authWidget.id = 'auth-user-widget';
    authWidget.style.cssText = `
        position: fixed;
        top: 1rem;
        right: 1rem;
        z-index: 9999;
        display: flex;
        align-items: center;
        gap: 0.5rem;
    `;

    authWidget.innerHTML = `
        <div id="auth-user-dropdown" style="position: relative;">
            <button id="auth-user-btn" onclick="toggleAuthDropdown()" style="
                display: flex; align-items: center; gap: 0.5rem;
                background: rgba(30, 41, 59, 0.9); backdrop-filter: blur(12px);
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 50px; padding: 0.4rem 0.8rem 0.4rem 0.4rem;
                color: #f8fafc; cursor: pointer; font-family: inherit; font-size: 0.85rem;
                transition: all 0.2s; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
                <span style="
                    width: 30px; height: 30px; border-radius: 50%;
                    background: linear-gradient(135deg, #818cf8, #c084fc);
                    display: flex; align-items: center; justify-content: center;
                    font-size: 0.75rem; font-weight: 700; color: white; flex-shrink: 0;">
                    ${initials}
                </span>
                <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 0.05rem;">
                    <span style="max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.8rem; line-height: 1.2;">${email}</span>
                    <span style="font-size: 0.65rem; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 130px;">${empresaNome}</span>
                </div>
                ${isAdmin ? '<span style="background: rgba(99,102,241,0.2); color: #818cf8; font-size: 0.65rem; font-weight: 700; padding: 0.1rem 0.4rem; border-radius: 4px; text-transform: uppercase;">Admin</span>' : ''}
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
            </button>
            <div id="auth-dropdown-menu" style="
                display: none;
                position: absolute; top: calc(100% + 8px); right: 0;
                background: #1e293b; border: 1px solid rgba(255,255,255,0.1);
                border-radius: 12px; padding: 0.5rem; min-width: 210px;
                box-shadow: 0 8px 24px rgba(0,0,0,0.4); backdrop-filter: blur(12px);">
                <div style="padding: 0.6rem 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.05); margin-bottom: 0.25rem;">
                    <div style="font-size: 0.7rem; color: #64748b; text-transform: uppercase; font-weight: 600; margin-bottom: 0.2rem;">Empresa</div>
                    <div style="font-size: 0.85rem; color: #f8fafc; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${empresaNome}</div>
                    <div style="font-size: 0.72rem; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 0.1rem;">${email}</div>
                </div>
                <a href="home.html" style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; border-radius: 8px; color: #94a3b8; text-decoration: none; font-size: 0.85rem; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
                    🏠 Hub Principal
                </a>
                ${isAdmin ? `
                <a href="admin.html" style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; border-radius: 8px; color: #818cf8; text-decoration: none; font-size: 0.85rem; transition: background 0.2s;" onmouseover="this.style.background='rgba(99,102,241,0.1)'" onmouseout="this.style.background='transparent'">
                    🛡️ Painel Admin
                </a>
                <a href="empresa_setup.html" style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; border-radius: 8px; color: #a5b4fc; text-decoration: none; font-size: 0.85rem; transition: background 0.2s;" onmouseover="this.style.background='rgba(99,102,241,0.08)'" onmouseout="this.style.background='transparent'">
                    🏢 Minha Empresa
                </a>` : ''}
                <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.05); margin: 0.25rem 0;">
                <button onclick="authLogout()" style="
                    display: flex; align-items: center; gap: 0.5rem; width: 100%;
                    padding: 0.5rem 0.75rem; border-radius: 8px; color: #f87171;
                    background: transparent; border: none; cursor: pointer;
                    font-size: 0.85rem; font-family: inherit; transition: background 0.2s; text-align: left;"
                    onmouseover="this.style.background='rgba(239,68,68,0.1)'"
                    onmouseout="this.style.background='transparent'">
                    🚪 Sair
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(authWidget);

    // Fechar dropdown ao clicar fora
    document.addEventListener('click', (e) => {
        const btn  = document.getElementById('auth-user-btn');
        const menu = document.getElementById('auth-dropdown-menu');
        if (menu && btn && !btn.contains(e.target) && !menu.contains(e.target)) {
            menu.style.display = 'none';
        }
    });
}

function toggleAuthDropdown() {
    const menu = document.getElementById('auth-dropdown-menu');
    if (!menu) return;
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

async function registrarLog(modulo, acao, descricao) {
    const userEmail = window.currentUser?.email || 'sistema@frotalink.com.br';
    const empresaId = window.currentEmpresaId || null;

    console.log(`[AuditLog] Log registrado: [${modulo}] ${acao} - ${descricao} (${userEmail})`);

    // 1. Se estiver usando o Supabase
    if (window.authClient) {
        try {
            const { error } = await window.authClient
                .from('logs_atividade')
                .insert({
                    empresa_id: empresaId,
                    usuario_email: userEmail,
                    modulo: modulo,
                    acao: acao,
                    descricao: descricao
                });
            if (error) {
                console.warn('[AuditLog] Erro ao salvar log no Supabase:', error.message);
            }
        } catch (e) {
            console.warn('[AuditLog] Erro de conexão ao salvar log no Supabase:', e);
        }
    }

    // 2. Fallback no LocalStorage (Mock / Modo Local)
    try {
        const localLogs = JSON.parse(localStorage.getItem('frotalink_audit_logs') || '[]');
        localLogs.push({
            id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
            empresa_id: empresaId,
            usuario_email: userEmail,
            modulo: modulo,
            acao: acao,
            descricao: descricao,
            data_hora: new Date().toISOString()
        });
        if (localLogs.length > 500) {
            localLogs.shift();
        }
        localStorage.setItem('frotalink_audit_logs', JSON.stringify(localLogs));
    } catch (e) {
        console.error('[AuditLog] Falha ao gravar log no localStorage:', e);
    }
}
window.registrarLog = registrarLog;

// ============================================================
//  GLOBAL LOADING OVERLAY INJECTION
// ============================================================
(function() {
    function injectLoader() {
        if (document.getElementById('global-loading-screen')) return;
        
        // Inject styles dynamically so they work on pages that don't load style.css (like home.html)
        if (!document.getElementById('global-loading-styles')) {
            const style = document.createElement('style');
            style.id = 'global-loading-styles';
            style.textContent = `
                .global-loading-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100vw;
                    height: 100vh;
                    background: rgba(15, 23, 42, 0.85);
                    backdrop-filter: blur(8px);
                    -webkit-backdrop-filter: blur(8px);
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    z-index: 999999;
                    opacity: 1;
                    visibility: visible;
                    transition: opacity 0.3s ease, visibility 0.3s ease;
                }
                .global-loading-overlay.hidden {
                    opacity: 0;
                    visibility: hidden;
                    pointer-events: none;
                }
                .global-loading-logo {
                    max-width: 400px;
                    max-height: 400px;
                    width: 90%;
                    height: auto;
                    object-fit: contain;
                    user-select: none;
                    pointer-events: none;
                }
            `;
            document.head.appendChild(style);
        }
        
        const loaderDiv = document.createElement('div');
        loaderDiv.id = 'global-loading-screen';
        loaderDiv.className = 'global-loading-overlay';
        loaderDiv.innerHTML = `
            <img src="img/logo.frotalink.carre.gif.gif" class="global-loading-logo" alt="Carregando..." />
        `;
        document.body.appendChild(loaderDiv);
    }

    let autoHideTimer = null;

    window.showLoader = function() {
        if (autoHideTimer) {
            clearTimeout(autoHideTimer);
            autoHideTimer = null;
        }
        const el = document.getElementById('global-loading-screen');
        if (el) {
            el.classList.remove('hidden');
        } else {
            injectLoader();
        }
    };

    window.hideLoader = function() {
        if (autoHideTimer) {
            clearTimeout(autoHideTimer);
            autoHideTimer = null;
        }
        const el = document.getElementById('global-loading-screen');
        if (el) {
            el.classList.add('hidden');
        }
    };

    // Auto-inject on load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            injectLoader();
            // Automatically hide loader after 500ms to guarantee page is visible
            autoHideTimer = setTimeout(window.hideLoader, 500);
        });
    } else {
        injectLoader();
        autoHideTimer = setTimeout(window.hideLoader, 500);
    }
})();

