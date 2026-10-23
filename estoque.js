let supabaseClient = null;

let inventoryData = [];
let filteredData = [];
let showLowStockOnly = false;
let selectedApplications = [];
let clientesData = [];
let prestadoresData = [];
let historyData = [];

function logEstoque(acao, descricao) {
    if (typeof window.registrarLog === 'function') {
        window.registrarLog('estoque', acao, descricao);
    } else if (typeof registrarLog === 'function') {
        registrarLog('estoque', acao, descricao);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    initSupabase();
    await loadInventory();
    await loadSetup(); // Carregar categorias e unidades para os selects
    setupEventListeners();
    updateKPIs();
});

function initSupabase() {
    if (window.supabase) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        updateConnectionStatus(true);
    } else {
        console.error('Supabase library not loaded');
        updateConnectionStatus(false);
    }
}

function updateConnectionStatus(online) {
    const statusEl = document.getElementById('connectionStatus');
    if (!statusEl) return;
    const indicator = statusEl.querySelector('.status-indicator');
    const text = statusEl.querySelector('span');
    
    if (online) {
        indicator.style.background = '#10b981';
        text.innerText = 'Sistema Online';
    } else {
        indicator.style.background = '#ef4444';
        text.innerText = 'Offline';
    }
}

async function loadInventory() {
    try {
        const { data, error } = await supabaseClient
            .from('estoque')
            .select('*')
            .order('nome', { ascending: true });

        if (error) throw error;
        inventoryData = data || [];
        applyFilters();
    } catch (err) {
        console.error('Erro ao carregar estoque:', err);
        // Fallback for demo if table doesn't exist
        if (inventoryData.length === 0) {
            inventoryData = [
                { id: '1', nome: 'DISCO FREIO', marca: 'COBREQ', ref: 'REF-54', categoria: 'MECÂNICA', aplicacao: 'Multiveículos (Universal)', estoque_atual: 10, estoque_minimo: 5, unidade: 'CJ', valor_custo: 10.00, valor_venda: 15.00, status: 'ATIVO' },
                { id: '2', nome: 'Pastilha Freio', marca: 'BOSCH', ref: 'REF-P094', categoria: 'MECÂNICA', aplicacao: 'VIRTUS 1.6 MSI 2020, POLO 2020', estoque_atual: 4, estoque_minimo: 5, unidade: 'JG', valor_custo: 21.33, valor_venda: 25.00, status: 'ATIVO' },
                { id: '3', nome: 'TEste', marca: 'TESTE', ref: 'REF-1558', categoria: 'OUTROS', aplicacao: 'Multiveículos (Universal)', estoque_atual: 15, estoque_minimo: 5, unidade: 'CJ', valor_custo: 15.00, valor_venda: 25.00, status: 'ATIVO' }
            ];
            applyFilters();
        }
    }
}

function applyFilters() {
    const searchTerm = document.getElementById('inventory_search')?.value.toLowerCase().trim() || '';
    const categoryFilter = document.getElementById('filter_category')?.value || '';
    const statusFilter = document.getElementById('filter_status')?.value || 'TODOS';

    filteredData = inventoryData.filter(item => {
        const itemStatus = (item.status || 'ATIVO').toUpperCase();

        // Se o status do item for INATIVO e o filtro de status não pedir explicitamente "TODOS" ou "INATIVO", oculta da lista
        if (itemStatus === 'INATIVO' && statusFilter !== 'TODOS' && statusFilter !== 'INATIVO') return false;

        const matchesSearch = !searchTerm || 
                             (item.nome || '').toLowerCase().includes(searchTerm) || 
                             (item.marca || '').toLowerCase().includes(searchTerm) || 
                             (item.ref || '').toLowerCase().includes(searchTerm) ||
                             (item.codigo_barras || '').toLowerCase().includes(searchTerm) ||
                             (item.codigo_interno || '').toLowerCase().includes(searchTerm) ||
                             (item.aplicacao || '').toLowerCase().includes(searchTerm) ||
                             (item.categoria || '').toLowerCase().includes(searchTerm);
        
        const matchesCategory = categoryFilter === '' || item.categoria === categoryFilter;
        const matchesStatus = statusFilter === 'TODOS' || itemStatus === statusFilter.toUpperCase();
        const matchesLowStock = !showLowStockOnly || (Number(item.estoque_atual || 0) <= Number(item.estoque_minimo || 0));

        return matchesSearch && matchesCategory && matchesStatus && matchesLowStock;
    });

    renderInventory(filteredData);
    updateKPIs();
}

function filterInventory() {
    applyFilters();
}

function toggleLowStockOnly() {
    showLowStockOnly = !showLowStockOnly;
    const btn = document.getElementById('btn_low_stock_toggle');
    if (btn) {
        if (showLowStockOnly) {
            btn.classList.add('active');
            btn.style.background = '#f59e0b';
            btn.style.color = '#ffffff';
        } else {
            btn.classList.remove('active');
            btn.style.background = '';
            btn.style.color = '';
        }
    }
    applyFilters();
}

window.filterInventory = filterInventory;
window.toggleLowStockOnly = toggleLowStockOnly;
window.applyFilters = applyFilters;

function renderInventory(data = filteredData) {
    const tableBody = document.getElementById('inventory_body');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    const canEdit = typeof canDo === 'function' ? canDo('estoque_inventario', 'edit') : true;
    const canDel = typeof canDo === 'function' ? canDo('estoque_inventario', 'delete') : true;

    const thAcoes = document.getElementById('th_acoes_inventario');
    if (thAcoes) {
        thAcoes.style.display = (!canEdit && !canDel) ? 'none' : '';
    }

    data.forEach(item => {
        const isLowStock = item.estoque_atual <= item.estoque_minimo;
        const row = document.createElement('tr');
        
        row.className = 'inventory_row_clickable';
        row.innerHTML = `
            <td data-label="Produto & Marca">
                <div class="product-info">
                    <span class="product-name" onclick="openProductViewModal('${item.id}')" style="cursor: pointer; color: var(--primary-light); text-decoration: underline;">${item.nome}</span>
                    <span class="product-meta">${item.marca} - ${item.ref || 'S/ REF'}</span>
                </div>
            </td>
            <td data-label="Aplicação"><span style="color: var(--text-muted); font-size: 0.8rem;">${item.aplicacao || 'N/A'}</span></td>
            <td data-label="Estoque">
                <div style="display: flex; flex-direction: column;">
                    <span style="font-weight: 700; color: ${isLowStock ? '#d97706' : '#059669'}">${item.estoque_atual} ${item.unidade || ''}</span>
                    <span style="font-size: 0.65rem; color: var(--text-muted);">MÍN: ${item.estoque_minimo}</span>
                </div>
            </td>
            <td data-label="Vlr. Custo"><span style="font-size: 0.85rem;">R$ ${item.valor_custo?.toLocaleString('pt-BR', {minimumFractionDigits: 2}) || '0,00'}</span></td>
            <td data-label="Vlr. Venda" style="color: #10b981; font-weight: 700;">R$ ${item.valor_venda?.toLocaleString('pt-BR', {minimumFractionDigits: 2}) || '0,00'}</td>
            ${(!canEdit && !canDel) ? '' : `
            <td data-label="Ações" style="text-align: right;">
                <div class="table-actions" style="display: flex; gap: 0.4rem; justify-content: flex-end;">
                    ${canEdit ? `
                    <button class="action-btn" onclick="event.stopPropagation(); editProduct('${item.id}')" title="Editar" style="background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.2); color: var(--primary-light); padding: 0.5rem; border-radius: 8px; cursor: pointer;">
                        <i data-lucide="edit-3" style="width: 14px;"></i>
                    </button>` : ''}
                    ${canDel ? `
                    <button class="action-btn" onclick="event.stopPropagation(); deleteProduct('${item.id}')" title="Excluir" style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); color: #ef4444; padding: 0.5rem; border-radius: 8px; cursor: pointer;">
                        <i data-lucide="trash-2" style="width: 14px;"></i>
                    </button>` : ''}
                </div>
            </td>`}
        `;
        tableBody.appendChild(row);
    });
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function updateKPIs() {
    // Considerar apenas produtos ATIVOS no calculo das estatísticas
    const activeProducts = inventoryData.filter(item => (item.status || 'ATIVO').toUpperCase() !== 'INATIVO');
    const totalSku = activeProducts.length;
    const lowStockCount = activeProducts.filter(item => (Number(item.estoque_atual) || 0) <= (Number(item.estoque_minimo) || 0)).length;
    const totalValue = activeProducts.reduce((acc, item) => acc + ((Number(item.estoque_atual) || 0) * (Number(item.valor_custo) || 0)), 0);

    const skuEl = document.getElementById('stat_total_sku');
    const lowEl = document.getElementById('stat_low_stock');
    const valEl = document.getElementById('stat_total_value');

    if (skuEl) skuEl.innerText = totalSku;
    if (lowEl) lowEl.innerText = lowStockCount;
    if (valEl) valEl.innerText = `R$ ${totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const cardLowStock = document.getElementById('card_low_stock');
    const msgEl = document.getElementById('stat_alert_msg');

    if (cardLowStock) {
        if (lowStockCount > 0) {
            cardLowStock.classList.add('alert');
            if (msgEl) msgEl.innerText = `Atenção: ${lowStockCount} itens com estoque baixo.`;
        } else {
            cardLowStock.classList.remove('alert');
            if (msgEl) msgEl.innerText = `Mantenha seu estoque abastecido.`;
        }
    }
}

// Modal & Form Logic
function openProductModal() {
    document.getElementById('productForm').reset();
    document.getElementById('product_id').value = '';
    document.getElementById('modalTitle').innerText = 'Cadastrar Novo Produto';
    document.getElementById('productModal').classList.add('active');
}

function closeProductModal() {
    document.getElementById('productModal').classList.remove('active');
}

function editProduct(id) {
    if (typeof canDo === 'function' && !canDo('estoque_inventario', 'edit')) {
        alert('Sem permissão para editar produtos.');
        return;
    }
    const item = inventoryData.find(p => p.id === id);
    if (!item) return;

    // Preencher formulário da Aba "Novo Produto"
    document.getElementById('mp_id').value = item.id;
    document.getElementById('mp_nome').value = item.nome;
    document.getElementById('mp_marca').value = item.marca;
    document.getElementById('mp_ref').value = item.ref || '';
    document.getElementById('mp_barras').value = item.codigo_barras || '';
    document.getElementById('mp_interno').value = item.codigo_interno || '';
    document.getElementById('mp_categoria').value = item.categoria || '';
    document.getElementById('mp_unidade').value = item.unidade || 'UN';
    
    // Tratamento de Múltiplas Aplicações
    const appStr = item.aplicacao || '';
    selectedApplications = appStr ? appStr.split('; ').filter(a => a) : [];
    renderApplications();

    document.getElementById('mp_descricao').value = item.descricao || '';
    document.getElementById('mp_estoque_atual').value = item.estoque_atual || 0;
    document.getElementById('mp_estoque_minimo').value = item.estoque_minimo || 5;
    document.getElementById('mp_valor_custo').value = item.valor_custo || 0;
    document.getElementById('mp_valor_venda').value = item.valor_venda || 0;

    // Localização
    document.getElementById('mp_local_setor').value = item.local_setor || '';
    document.getElementById('mp_local_rua').value = item.local_rua || '';
    document.getElementById('mp_local_prateleira').value = item.local_prateleira || '';
    document.getElementById('mp_local_nivel').value = item.local_nivel || '';
    document.getElementById('mp_local_gaveta').value = item.local_gaveta || '';

    // Bloquear campos críticos na edição e aplicar fundo cinza claro no campo todo
    ['mp_barras', 'mp_interno', 'mp_estoque_atual'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.disabled = true;
            el.style.background = '#d1d5db';
            el.style.backgroundColor = '#d1d5db';
            el.style.borderColor = '#9ca3af';
            el.style.color = '#374151';
        }
    });
    const btnGen = document.getElementById('btn_gen_internal_code');
    if (btnGen) {
        btnGen.disabled = true;
        btnGen.style.background = '#d1d5db';
        btnGen.style.backgroundColor = '#d1d5db';
        btnGen.style.borderColor = '#9ca3af';
    }

    // Atualizar título
    document.getElementById('newProductTitle').innerText = 'Editar Produto';
    
    switchTab('new');
}

function prepareNewProduct() {
    if (typeof canDo === 'function' && !canDo('estoque_inventario', 'add')) {
        alert('Sem permissão para adicionar produtos.');
        return;
    }
    const form = document.getElementById('form_new_product');
    if (form) form.reset();
    
    document.getElementById('mp_id').value = '';
    document.getElementById('newProductTitle').innerText = 'Dados do Produto';
    
    // Resetar Aplicações
    selectedApplications = [];
    renderApplications();

    // Habilitar campos para novo cadastro e restaurar fundo padrão
    ['mp_barras', 'mp_interno', 'mp_estoque_atual'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.disabled = false;
            el.style.background = '';
            el.style.backgroundColor = '';
            el.style.borderColor = '';
            el.style.color = '';
        }
    });
    const btnGen = document.getElementById('btn_gen_internal_code');
    if (btnGen) {
        btnGen.disabled = false;
        btnGen.style.background = '';
        btnGen.style.backgroundColor = '';
        btnGen.style.borderColor = '';
    }
    
    switchTab('new');
}

// Global modal security resolver
let currentSecurityConfirmResolver = null;
let currentSecurityGeneratedCode = '';

/**
 * Exibe o modal de confirmação de segurança idêntico ao padrão do sistema.
 * Gera um código de 6 dígitos e aguarda a digitação correta nos inputs.
 */
function requestSecurityConfirmation() {
    return new Promise((resolve) => {
        currentSecurityConfirmResolver = resolve;
        
        // Gerar código aleatório de 6 dígitos
        currentSecurityGeneratedCode = Math.floor(100000 + Math.random() * 900000).toString();
        
        const displayBox = document.getElementById('secConfirmDisplayCode');
        if (displayBox) displayBox.innerText = currentSecurityGeneratedCode;

        // Limpar inputs de PIN
        const inputs = document.querySelectorAll('.sec-pin-input');
        inputs.forEach(inp => {
            inp.value = '';
            inp.style.borderColor = 'transparent';
        });

        const errorMsg = document.getElementById('secConfirmErrorMsg');
        if (errorMsg) errorMsg.style.display = 'none';

        const modal = document.getElementById('modalSecurityConfirm');
        if (modal) {
            // Mover para o body se estiver aninhado em containers com contextos de empilhamento
            if (modal.parentElement !== document.body) {
                document.body.appendChild(modal);
            }
            modal.style.setProperty('display', 'flex', 'important');
            modal.style.setProperty('z-index', '999999', 'important');
            modal.style.setProperty('position', 'fixed', 'important');
            modal.style.setProperty('top', '0', 'important');
            modal.style.setProperty('left', '0', 'important');
            modal.style.setProperty('right', '0', 'important');
            modal.style.setProperty('bottom', '0', 'important');
            modal.style.setProperty('background', 'rgba(0,0,0,0.85)', 'important');
            modal.style.setProperty('backdrop-filter', 'blur(8px)', 'important');
            modal.style.setProperty('align-items', 'center', 'important');
            modal.style.setProperty('justify-content', 'center', 'important');
            modal.classList.add('active');
            // Focar o primeiro input após animação/render
            setTimeout(() => { if (inputs[0]) inputs[0].focus(); }, 100);
        }
        if (window.lucide) lucide.createIcons();
    });
}

window.requestSecurityConfirmation = requestSecurityConfirmation;

window.closeSecurityConfirmModal = function() {
    const modal = document.getElementById('modalSecurityConfirm');
    if (modal) {
        modal.style.setProperty('display', 'none', 'important');
        modal.classList.remove('active');
    }
    if (currentSecurityConfirmResolver) {
        currentSecurityConfirmResolver(false);
        currentSecurityConfirmResolver = null;
    }
};

window.secPinInputHandler = function(input, index) {
    const inputs = document.querySelectorAll('.sec-pin-input');
    const val = input.value.replace(/[^0-9]/g, '');
    input.value = val;

    if (val) {
        input.style.borderColor = '#10b981';
        if (index < inputs.length - 1) {
            inputs[index + 1].focus();
        }
    } else {
        input.style.borderColor = 'transparent';
    }

    // Se todos preenchidos, focar no botão de submissão
    const fullCode = Array.from(inputs).map(i => i.value).join('');
    if (fullCode.length === 6 && index === 5) {
        const btn = document.getElementById('btnSecConfirmSubmit');
        if (btn) btn.focus();
    }
};

window.secPinKeyDownHandler = function(input, event, index) {
    const inputs = document.querySelectorAll('.sec-pin-input');
    if (event.key === 'Backspace' && !input.value && index > 0) {
        inputs[index - 1].focus();
    }
};

window.secConfirmSubmit = function() {
    const inputs = document.querySelectorAll('.sec-pin-input');
    const enteredCode = Array.from(inputs).map(i => i.value).join('');
    const errorMsg = document.getElementById('secConfirmErrorMsg');

    if (enteredCode === currentSecurityGeneratedCode) {
        if (errorMsg) errorMsg.style.display = 'none';
        const modal = document.getElementById('modalSecurityConfirm');
        if (modal) {
            modal.style.setProperty('display', 'none', 'important');
            modal.classList.remove('active');
        }
        if (currentSecurityConfirmResolver) {
            currentSecurityConfirmResolver(true);
            currentSecurityConfirmResolver = null;
        }
    } else {
        if (errorMsg) {
            errorMsg.innerText = 'Código incorreto! Tente novamente.';
            errorMsg.style.display = 'block';
        }
        inputs.forEach(i => {
            i.value = '';
            i.style.borderColor = '#ef4444';
        });
        if (inputs[0]) inputs[0].focus();
    }
};

async function deleteProduct(id) {
    if (typeof canDo === 'function' && !canDo('estoque_inventario', 'delete')) {
        showAlertModal({
            title: 'Acesso Negado',
            message: 'Você não possui permissão para excluir produtos do inventário.',
            type: 'error'
        });
        return;
    }

    const item = inventoryData.find(p => p.id === id);
    const isInactive = item && (item.status || '').toUpperCase() === 'INATIVO';

    // Solicitar confirmação com código de segurança de 6 dígitos no padrão do sistema
    const confirmed = await requestSecurityConfirmation();
    if (!confirmed) return; // Cancelou ou fechou

    try {
        // Tentar exclusão física do banco
        const { error } = await supabaseClient
            .from('estoque')
            .delete()
            .eq('id', id);

        if (!error) {
            logEstoque('EXCLUSÃO', `DETALHE: Excluiu produto permanentemente do estoque (ID: ${id})`);
            await loadInventory();
            if (typeof showToast === 'function') showToast('Produto excluído permanentemente!', 'success');
            return;
        }

        console.warn('Erro ao deletar fisicamente:', error);

        // Helper para apagar/desvincular registros de chave estrangeira
        const forceDeleteWithHistory = async () => {
            try {
                // Remover ou desvincular registros vinculados ao produto
                await supabaseClient.from('estoque_movimentacoes').delete().eq('item_id', id);
                await supabaseClient.from('venda_itens').update({ produto_id: null }).eq('produto_id', id);
                await supabaseClient.from('compra_itens').update({ produto_id: null }).eq('produto_id', id);

                const { error: forceErr } = await supabaseClient
                    .from('estoque')
                    .delete()
                    .eq('id', id);

                if (forceErr) throw forceErr;

                logEstoque('EXCLUSÃO_FORÇADA', `DETALHE: Forçou exclusão de produto com vínculos (ID: ${id})`);
                await loadInventory();
                if (typeof showToast === 'function') showToast('Produto e seus vínculos foram excluídos permanentemente!', 'success');
            } catch (err) {
                console.error('Erro ao forçar exclusão:', err);
                showAlertModal({
                    title: 'Erro na Exclusão Forçada',
                    message: 'Não foi possível apagar o produto mesmo após desvincular movimentações:<br><br><code>' + (err.message || err) + '</code>',
                    type: 'error'
                });
            }
        };

        if (isInactive) {
            // Se o item JÁ ESTÁ INATIVO, dar a opção direta de forçar exclusão permanente
            const forcarExclusao = await showConfirmModal({
                title: 'Excluir Produto Inativo com Histórico',
                message: 'Este produto já está <b>INATIVO</b>, porém possui movimentações registradas.<br><br>Deseja <b>FORÇAR A EXCLUSÃO DEFINITIVA</b>? Isso desvinculará seu histórico e apagará o produto permanentemente do sistema.',
                type: 'warning',
                confirmText: 'SIM, EXCLUIR DEFINITIVAMENTE',
                cancelText: 'VOLTAR'
            });

            if (forcarExclusao) {
                await forceDeleteWithHistory();
            }
            return;
        } else {
            // Se o item é ATIVO, oferecer inativar ou forçar exclusão
            const desejaInativar = await showConfirmModal({
                title: 'Impossível Excluir Registros com Histórico',
                message: 'Este produto possui movimentações registradas.<br><br>Escolha uma opção:',
                type: 'warning',
                confirmText: 'SIM, INATIVAR PRODUTO',
                cancelText: 'FORÇAR EXCLUSÃO DEFINITIVA'
            });

            if (desejaInativar) {
                const { error: updateErr } = await supabaseClient
                    .from('estoque')
                    .update({ status: 'INATIVO' })
                    .eq('id', id);

                if (updateErr) throw updateErr;
                logEstoque('ALTERAÇÃO', `DETALHE: Inativou produto no estoque (ID: ${id})`);
                await loadInventory();
                if (typeof showToast === 'function') showToast('Produto inativado com sucesso!', 'success');
            } else {
                // Usuário clicou em FORÇAR EXCLUSÃO DEFINITIVA
                const confirmaForcar = await showConfirmModal({
                    title: 'Atenção: Exclusão Permanente',
                    message: 'Tem certeza que deseja apagar permanentemente este produto e desvincular todo o seu histórico?',
                    type: 'danger',
                    confirmText: 'SIM, EXCLUIR TUDO',
                    cancelText: 'VOLTAR'
                });

                if (confirmaForcar) {
                    await forceDeleteWithHistory();
                }
            }
            return;
        }

    } catch (err) {
        console.error('Erro de exclusão:', err);
        showAlertModal({
            title: 'Erro na Exclusão',
            message: 'Não foi possível excluir o produto do banco de dados:<br><br><code>' + (err.message || err) + '</code>',
            type: 'error'
        });
        await loadInventory();
    }
}

async function saveProduct(event) {
    if (event) event.preventDefault();
    
    const productId = document.getElementById('mp_id').value;
    const item = inventoryData.find(p => p.id === productId);
    // Verificar permissão: add para novo, edit para existente
    if (typeof canDo === 'function') {
        if (!productId && !canDo('estoque_inventario', 'add')) {
            alert('Sem permissão para adicionar produtos.');
            return;
        }
        if (productId && !canDo('estoque_inventario', 'edit')) {
            alert('Sem permissão para editar produtos.');
            return;
        }
    }

    if (selectedApplications.length === 0) {
        alert('Por favor, adicione pelo menos uma Aplicação Veicular.');
        document.getElementById('mp_aplicacao').focus();
        return;
    }

    const product = {
        nome: document.getElementById('mp_nome').value,
        marca: document.getElementById('mp_marca').value,
        ref: document.getElementById('mp_ref').value,
        codigo_barras: document.getElementById('mp_barras').value,
        codigo_interno: document.getElementById('mp_interno').value,
        categoria: document.getElementById('mp_categoria').value,
        unidade: document.getElementById('mp_unidade').value,
        aplicacao: selectedApplications.join('; '),
        descricao: document.getElementById('mp_descricao').value,
        estoque_atual: parseFloat(document.getElementById('mp_estoque_atual').value) || 0,
        estoque_minimo: parseFloat(document.getElementById('mp_estoque_minimo').value) || 5,
        valor_custo: parseFloat(document.getElementById('mp_valor_custo').value) || 0,
        valor_venda: parseFloat(document.getElementById('mp_valor_venda').value) || 0,
        local_setor: document.getElementById('mp_local_setor').value,
        local_rua: document.getElementById('mp_local_rua').value,
        local_prateleira: document.getElementById('mp_local_prateleira').value,
        local_nivel: document.getElementById('mp_local_nivel').value,
        local_gaveta: document.getElementById('mp_local_gaveta').value,
        status: 'ATIVO'
    };

    try {
        let result;
        if (productId) {
            const currentStock = item ? item.estoque_atual : product.estoque_atual;
            delete product.estoque_atual; // Garante que o saldo de estoque só pode ser alterado por movimentação/reajuste oficial
            result = await supabaseClient.from('estoque').update(product).eq('id', productId);
            if (!result.error) {
                logEstoque('ALTERAÇÃO', `DETALHE: Alterou produto no estoque: ${product.nome} (Marca: ${product.marca}, Ref: ${product.ref || 'S/R'}) - Saldo Mantido: ${currentStock} ${product.unidade}, Custo: R$ ${product.valor_custo}, Venda: R$ ${product.valor_venda}`);
            }
        } else {
            result = await supabaseClient.from('estoque').insert([product]);
            if (!result.error) {
                logEstoque('INCLUSÃO', `DETALHE: Cadastrou novo produto no estoque: ${product.nome} (Marca: ${product.marca}, Ref: ${product.ref || 'S/R'}, Saldo Inicial: ${product.estoque_atual} ${product.unidade})`);
            }
        }

        if (result.error) throw result.error;

        alert('Produto salvo com sucesso!');
        prepareNewProduct(); // Reseta e habilita campos
        switchTab('list');
        await loadInventory();
    } catch (err) {
        console.error('Erro ao salvar produto:', err);
        alert('Erro ao salvar produto: ' + (err.message || 'Verifique o console'));
    }
}

function setupEventListeners() {
    const invSearchInput = document.getElementById('inventory_search');
    if (invSearchInput) {
        invSearchInput.addEventListener('input', applyFilters);
        invSearchInput.addEventListener('keyup', applyFilters);
    }
    const catFilterInput = document.getElementById('filter_category');
    if (catFilterInput) {
        catFilterInput.addEventListener('change', applyFilters);
    }
    const statusFilterInput = document.getElementById('filter_status');
    if (statusFilterInput) {
        statusFilterInput.addEventListener('change', applyFilters);
    }

    const barrasInput = document.getElementById('mp_barras');
    if (barrasInput) {
        barrasInput.addEventListener('change', checkDuplicateBarcode);
        barrasInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                checkDuplicateBarcode();
            }
        });
    }

    const vendaSearchInput = document.getElementById('v_search_input');
    if (vendaSearchInput) {
        vendaSearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); // Evita que envie o form geral
                const query = vendaSearchInput.value.trim();
                if (query.length > 0) {
                    const activeItems = inventoryData.filter(item => item.status !== 'INATIVO');
                    const filtered = activeItems.filter(item => 
                        item.nome.toLowerCase().includes(query.toLowerCase()) || 
                        (item.ref && item.ref.toLowerCase().includes(query.toLowerCase())) ||
                        (item.marca && item.marca.toLowerCase().includes(query.toLowerCase())) ||
                        (item.codigo_barras && item.codigo_barras.toLowerCase().includes(query.toLowerCase())) ||
                        (item.codigo_interno && item.codigo_interno.toLowerCase().includes(query.toLowerCase()))
                    );
                    
                    if (filtered.length > 0) {
                        const exact = filtered.find(item => 
                            (item.codigo_barras && item.codigo_barras.toLowerCase() === query.toLowerCase()) ||
                            (item.codigo_interno && item.codigo_interno.toLowerCase() === query.toLowerCase())
                        );
                        const selected = exact || filtered[0];
                        selectVendaProduct(selected.id);
                        const qtyInput = document.getElementById('v_quantidade');
                        if (qtyInput) {
                            qtyInput.focus();
                            qtyInput.select();
                        }
                    }
                }
            }
        });
    }

    const vendaQtyInput = document.getElementById('v_quantidade');
    if (vendaQtyInput) {
        vendaQtyInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addItemToVendaList();
            }
        });
    }

    const searchHistory = document.getElementById('search_history');
    if (searchHistory) {
        searchHistory.addEventListener('input', () => {
            if (typeof applyHistoryFilters === 'function') applyHistoryFilters();
        });
    }
    const filterType = document.getElementById('filter_type');
    if (filterType) {
        filterType.addEventListener('change', () => {
            if (typeof applyHistoryFilters === 'function') applyHistoryFilters();
        });
    }
    const filterPeriod = document.getElementById('filter_period');
    if (filterPeriod) {
        filterPeriod.addEventListener('change', () => {
            if (typeof applyHistoryFilters === 'function') applyHistoryFilters();
        });
    }
    const filterStart = document.getElementById('history_filter_start');
    if (filterStart) {
        filterStart.addEventListener('change', () => {
            if (typeof applyHistoryFilters === 'function') applyHistoryFilters();
        });
    }
    const filterEnd = document.getElementById('history_filter_end');
    if (filterEnd) {
        filterEnd.addEventListener('change', () => {
            if (typeof applyHistoryFilters === 'function') applyHistoryFilters();
        });
    }

    // Atalhos Globais de Teclado (ESC para fechar, Ctrl + S / Ctrl + Enter para salvar)
    window.addEventListener('keydown', (e) => {
        const vModal = document.getElementById('vendaModal');
        const pModal = document.getElementById('productModal');
        const pvModal = document.getElementById('productViewModal');
        const scanModal = document.getElementById('barcodeScannerModal');

        const isScanActive = scanModal && (scanModal.style.display === 'flex' || scanModal.classList.contains('active'));
        const isVendaActive = vModal && vModal.classList.contains('active');
        const isProdActive = pModal && pModal.classList.contains('active');
        const isViewActive = pvModal && pvModal.classList.contains('active');

        // ESC: Fechar Modal
        if (e.key === 'Escape') {
            if (isScanActive) {
                closeBarcodeScanner();
                return;
            }
            if (isVendaActive) {
                const searchResults = document.getElementById('v_search_results');
                if (searchResults && searchResults.style.display === 'block') {
                    searchResults.style.display = 'none';
                    return;
                }
                if (vendaItems && vendaItems.length > 0) {
                    if (confirm('Há itens adicionados no carrinho de saída. Tem certeza de que deseja sair e descartar?')) {
                        closeVendaModal();
                    }
                } else {
                    closeVendaModal();
                }
                return;
            }

            if (isProdActive) {
                closeProductModal();
                return;
            }

            if (isViewActive) {
                closeProductViewModal();
                return;
            }
        }

        // CTRL + S ou CTRL + ENTER: Salvar / Confirmar
        if ((e.ctrlKey && (e.key === 's' || e.key === 'S')) || (e.ctrlKey && e.key === 'Enter')) {
            if (isVendaActive) {
                e.preventDefault();
                const btnConfirm = document.getElementById('btn_confirm_venda');
                if (btnConfirm && !btnConfirm.disabled) {
                    saveVenda(e);
                } else if (vendaItems && vendaItems.length === 0) {
                    alert('Adicione pelo menos um produto ao carrinho antes de confirmar a saída.');
                }
                return;
            }

            if (isProdActive) {
                e.preventDefault();
                saveProduct(e);
                return;
            }
        }
    });
}

function checkDuplicateBarcode() {
    const barcode = document.getElementById('mp_barras').value.trim();
    if (!barcode) return;

    // Se já estivermos editando um produto (mp_id preenchido), não bloqueia se for o mesmo
    const currentId = document.getElementById('mp_id').value;
    
    const existing = inventoryData.find(p => p.codigo_barras === barcode);
    
    if (existing && existing.id !== currentId) {
        // Notificar e abrir apenas a VISUALIZAÇÃO
        alert(`SISTEMA: Já existe uma peça com este código de barras!\n\nProduto: ${existing.nome}\nMarca: ${existing.marca}\nRef: ${existing.ref}\n\nO sistema abrirá os detalhes deste produto. Use o botão 'EDITAR' dentro da visualização se precisar fazer alterações.`);
        
        // Limpa o campo no formulário de cadastro para não gerar confusão
        document.getElementById('mp_barras').value = '';
        
        // Abre a modal de visualização (onde não é possível editar sem clicar em EDITAR)
        openProductViewModal(existing.id);
    }
}

let currentViewingId = null;

async function openProductViewModal(id) {
    const item = inventoryData.find(p => p.id === id);
    if (!item) return;

    currentViewingId = id;

    // Popula Dados Básicos
    document.getElementById('view_prod_nome').innerText = item.nome;
    document.getElementById('view_prod_ref').innerText = item.ref || '---';
    document.getElementById('view_prod_categoria').innerText = item.categoria || 'SEM CATEGORIA';
    document.getElementById('view_prod_marca').innerText = item.marca || '---';
    document.getElementById('view_prod_aplicacao').innerText = item.aplicacao || 'Multiveículos (Universal)';
    document.getElementById('view_prod_ref_code').innerText = item.ref || '---';
    document.getElementById('view_prod_data').innerText = new Date(item.created_at).toLocaleDateString('pt-BR');
    
    // Localização formatada
    const locParts = [];
    if (item.local_setor) locParts.push(`Set: ${item.local_setor}`);
    if (item.local_rua) locParts.push(`Rua: ${item.local_rua}`);
    if (item.local_prateleira) locParts.push(`Prat: ${item.local_prateleira}`);
    if (item.local_nivel) locParts.push(`Niv: ${item.local_nivel}`);
    if (item.local_gaveta) locParts.push(`Gav: ${item.local_gaveta}`);
    
    document.getElementById('view_prod_localizacao').innerText = locParts.length > 0 ? locParts.join(' | ') : 'NÃO DEFINIDA';
    
    document.getElementById('view_prod_custo').innerText = `R$ ${item.valor_custo?.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    document.getElementById('view_prod_venda').innerText = `R$ ${item.valor_venda?.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    
    document.getElementById('view_prod_saldo_final').innerText = `${item.estoque_atual} ${item.unidade}`;
    document.getElementById('view_prod_unidade_label').innerText = item.unidade || 'UN';
    
    // Reset campos de ajuste
    document.getElementById('adjust_new_qty').value = item.estoque_atual;
    document.getElementById('adjust_reason').value = '';

    // Configura botões de ação e permissões
    const canEdit = typeof canDo === 'function' ? canDo('estoque_inventario', 'edit') : true;
    const canDelete = typeof canDo === 'function' ? canDo('estoque_inventario', 'delete') : true;
    const canAjuste = typeof canDo === 'function' ? (canDo('estoque_ajuste', 'edit') || canDo('estoque_ajuste', 'add') || canDo('estoque_ajuste', 'view')) : true;

    const adjustForm = document.querySelector('#productViewModal .adjust-form');
    if (adjustForm) adjustForm.style.display = canAjuste ? 'block' : 'none';

    const btnEdit = document.getElementById('btn_view_edit_trigger');
    if (btnEdit) {
        btnEdit.style.display = canEdit ? '' : 'none';
        btnEdit.onclick = () => { closeProductViewModal(); editProduct(id); };
    }

    const btnDelete = document.getElementById('btn_view_delete_trigger');
    if (btnDelete) {
        btnDelete.style.display = canDelete ? '' : 'none';
        btnDelete.onclick = () => { deleteProduct(id).then(() => closeProductViewModal()); };
    }

    // Abre Modal
    document.getElementById('productViewModal').classList.add('active');
    document.body.classList.add('product-view-modal-open');

    // Carrega Histórico Específico
    await loadProductHistory(id);
}

function closeProductViewModal() {
    document.getElementById('productViewModal').classList.remove('active');
    document.body.classList.remove('product-view-modal-open');
    currentViewingId = null;
}

function getCurrentUserEmail() {
    if (window.currentUser && window.currentUser.email) {
        return window.currentUser.email.toLowerCase();
    }
    if (window.currentUserAccess && window.currentUserAccess.email) {
        return window.currentUserAccess.email.toLowerCase();
    }
    const localEmail = localStorage.getItem('user_email');
    if (localEmail) return localEmail.toLowerCase();
    return '';
}

async function loadProductHistory(productId) {
    const tbody = document.getElementById('view_prod_history_body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 2rem;">Carregando histórico...</td></tr>';

    try {
        const { data, error } = await supabaseClient
            .from('estoque_movimentacoes')
            .select('*')
            .eq('item_id', productId)
            .order('created_at', { ascending: false })
            .order('data', { ascending: false })
            .limit(25);

        if (error) throw error;

        // Recuperar o item para ter o saldo atual de referência
        const item = inventoryData.find(p => p.id === productId);
        if (!item) {
            console.warn('Produto não encontrado para cálculo de saldo histórico.');
            return;
        }

        // Ordena estritamente por timestamp real de criação (mais recente no topo)
        let sortedData = (data || []).slice().sort((a, b) => {
            const timeA = new Date(a.created_at || a.data).getTime();
            const timeB = new Date(b.created_at || b.data).getTime();
            return timeB - timeA;
        });

        tbody.innerHTML = '';
        if (sortedData && sortedData.length > 0) {
            // Cálculo de Saldo Progressivo (do mais recente para o mais antigo)
            let runningSaldo = item.estoque_atual;
            
            sortedData.forEach(h => {
                const row = document.createElement('tr');
                const date = new Date(h.data).toLocaleDateString('pt-BR');
                const isEstorno = h.tipo === 'ESTORNO';
                const isAjuste = h.motivo && h.motivo.startsWith('[AJUSTE]');
                
                let displayTipo = h.tipo;
                let color = '#10b981'; // ENTRADA
                
                if (isAjuste) {
                    displayTipo = 'AJUSTE';
                    color = '#3b82f6';
                } else if (h.tipo === 'SAIDA') {
                    color = '#ef4444';
                } else if (isEstorno) {
                    color = '#f59e0b';
                }
                
                // O saldo mostrado é o saldo APÓS a operação
                const rowSaldo = runningSaldo;
                
                // Retrocede o saldo para a linha anterior
                if (h.tipo === 'ENTRADA' || h.tipo === 'ESTORNO') {
                    runningSaldo -= h.quantidade;
                } else {
                    runningSaldo += h.quantidade;
                }
                
                const isCancelled = h.motivo && h.motivo.includes('[CANCELADA]');

                // Detectar se há código de venda no motivo
                let vendaCodigo = null;
                if (h.motivo && h.motivo.includes('VENDA:')) {
                    const match = h.motivo.match(/VENDA:\s*([A-Za-z0-9_-]+)/i);
                    if (match) vendaCodigo = match[1].trim();
                }

                // Detectar se há referência a compra/nota
                let compraNumNota = null;
                if (h.motivo && (h.motivo.includes('COMPRA:') || h.motivo.includes('COMPRA (') || h.motivo.includes('AJUSTE DE NOTA #') || h.motivo.includes('SUBSTITUIÇÃO NOTA #'))) {
                    const matchNota = h.motivo.match(/Nota\s*#([A-Za-z0-9_-]+)/i);
                    if (matchNota) compraNumNota = matchNota[1].trim();
                }

                let cellContent = '';
                if (isAjuste && !compraNumNota) {
                    const reasonClean = h.motivo.replace('[AJUSTE] ', '');
                    const userEmail = (h.responsavel && h.responsavel.includes('@')) ? h.responsavel : '';
                    cellContent = `
                        <div style="font-size: 0.75rem; color: #334155; font-weight: 600;">${reasonClean}</div>
                        ${userEmail ? `<div style="font-size: 0.68rem; color: #94a3b8; font-weight: 500; margin-top: 2px;">por ${userEmail}</div>` : ''}
                    `;
                } else if (vendaCodigo) {
                    const motivoParts = (h.motivo || '').split(' | ');
                    const mainPart = motivoParts[0] || '';
                    const salePart = motivoParts[1] || `VENDA: ${vendaCodigo}`;
                    cellContent = `
                        <div style="font-size: 0.75rem; color: #334155; font-weight: 600;">${mainPart}</div>
                        <div style="margin-top: 4px;">
                            <span onclick="closeProductViewModal(); editSaleByCodigo('${vendaCodigo}');" title="Clique para abrir e visualizar/editar a venda ${vendaCodigo}" style="display: inline-flex; align-items: center; gap: 4px; color: #059669; background: #ecfdf5; border: 1px solid #a7f3d0; padding: 2px 8px; border-radius: 6px; font-weight: 800; font-size: 0.72rem; cursor: pointer; text-decoration: none; transition: all 0.2s;" onmouseover="this.style.background='#d1fae5'; this.style.borderColor='#059669';" onmouseout="this.style.background='#ecfdf5'; this.style.borderColor='#a7f3d0';">
                                <i data-lucide="shopping-cart" style="width: 12px; height: 12px;"></i>
                                ${salePart}
                            </span>
                        </div>
                    `;
                } else if (compraNumNota) {
                    const motivoParts = (h.motivo || '').split(' | ');
                    const mainPart = motivoParts[0] || '';
                    const fornPart = motivoParts[1] ? `<div style="color: #059669; font-weight: 700; font-size: 0.72rem; margin-top: 4px; line-height: 1.2;">${motivoParts[1]}</div>` : '';
                    cellContent = `
                        <div>
                            <span onclick="openCompraDetailsFromStock('${compraNumNota}')" title="Clique para abrir os detalhes da Nota #${compraNumNota}" style="display: inline-flex; align-items: center; gap: 5px; color: #0284c7; background: #f0f9ff; border: 1px solid #bae6fd; padding: 3px 8px; border-radius: 6px; font-weight: 800; font-size: 0.72rem; cursor: pointer; text-decoration: none; transition: all 0.2s;" onmouseover="this.style.background='#e0f2fe'; this.style.borderColor='#0284c7';" onmouseout="this.style.background='#f0f9ff'; this.style.borderColor='#bae6fd';">
                                <i data-lucide="file-text" style="width: 12px; height: 12px; color: #0284c7;"></i>
                                ${mainPart}
                            </span>
                        </div>
                        ${fornPart}
                    `;
                } else {
                    cellContent = (h.motivo || '---').replace(' | ', '<br><span style="color:#059669; font-weight:700;">');
                }

                row.innerHTML = `
                    <td style="color: #334155; font-size: 0.75rem; font-weight: 600; padding: 0.75rem 0.5rem; border-bottom: 1px solid #f1f5f9;">${date}</td>
                    <td style="padding: 0.75rem 0.5rem; border-bottom: 1px solid #f1f5f9;"><span style="color: ${isCancelled ? '#9ca3af' : color}; font-weight: 800; font-size: 0.72rem; ${isCancelled ? 'text-decoration: line-through;' : ''}">${displayTipo}</span></td>
                    <td style="font-weight: 800; color: #0f172a; text-align: center; padding: 0.75rem 0.5rem; border-bottom: 1px solid #f1f5f9; ${isCancelled ? 'text-decoration: line-through; opacity: 0.5;' : ''}">${Math.round(h.quantidade)}</td>
                    <td style="font-weight: 900; color: #059669; text-align: center; font-size: 0.85rem; padding: 0.75rem 0.5rem; border-bottom: 1px solid #f1f5f9;">${Math.round(rowSaldo)}</td>
                    <td style="color: #0f172a; font-weight: 700; padding: 0.75rem 0.5rem; border-bottom: 1px solid #f1f5f9; ${isCancelled ? 'text-decoration: line-through;' : ''}">R$ ${parseFloat(h.valor_unitario || 0).toFixed(2)}</td>
                    <td style="font-size: 0.75rem; color: ${isCancelled ? '#ef4444' : '#475569'}; font-weight: ${isCancelled ? '700' : '500'}; padding: 0.75rem 0.5rem; border-bottom: 1px solid #f1f5f9;">
                        ${cellContent}
                    </td>
                `;
                tbody.appendChild(row);
            });
            if (window.lucide) lucide.createIcons();
        } else {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 2rem; color: #64748b; font-weight: 600;">Nenhuma movimentação registrada.</td></tr>';
        }
    } catch (err) {
        console.error('Erro ao carregar histórico do produto:', err);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 2rem; color: #ef4444;">Erro ao carregar histórico.</td></tr>';
    }
}

async function saveQuickAdjustment() {
    const canAjuste = typeof canDo === 'function' ? (canDo('estoque_ajuste', 'edit') || canDo('estoque_ajuste', 'add') || canDo('estoque_ajuste', 'view')) : true;
    if (!canAjuste) {
        alert('Você não possui permissão para ajustar saldo / inventário de estoque.');
        return;
    }
    const id = currentViewingId;
    if (!id) return;

    const item = inventoryData.find(p => p.id === id);
    if (!item) return;

    const newQty = parseFloat(document.getElementById('adjust_new_qty').value);
    const reason = document.getElementById('adjust_reason').value.trim();

    if (isNaN(newQty)) {
        alert('Por favor, informe um saldo válido.');
        return;
    }

    if (!reason) {
        alert('Por favor, informe o MOTIVO do ajuste de estoque.');
        return;
    }

    const diff = newQty - item.estoque_atual;
    if (diff === 0) {
        alert('O novo saldo é igual ao atual. Nenhuma alteração necessária.');
        return;
    }

    const absoluteDiff = Math.abs(diff);
    const dbTipo = diff > 0 ? 'ENTRADA' : 'SAIDA';
    const userEmail = getCurrentUserEmail();

    try {
        const movementObj = {
            item_id: id,
            tipo: dbTipo,
            quantidade: absoluteDiff,
            motivo: `[AJUSTE] ${reason}`,
            responsavel: userEmail || 'operador@frotalink.com',
            valor_unitario: item.valor_custo,
            data: new Date().toISOString(),
            empresa_id: window.currentEmpresaId || null,
            ...(dbTipo === 'SAIDA' ? { plano_contas_codigo: '04.018.0091', plano_contas_nome: 'SAIDAS DE ESTOQUE' } : {})
        };

        // 1. Registrar Movimentação
        const { error: moveError } = await supabaseClient
            .from('estoque_movimentacoes')
            .insert([movementObj]);

        if (moveError) throw moveError;

        // 2. Atualizar Saldo no Item
        const { error: itemError } = await supabaseClient
            .from('estoque')
            .update({ estoque_atual: newQty })
            .eq('id', id);

        if (itemError) throw itemError;

        logEstoque('ALTERAÇÃO', `DETALHE: Reajuste manual de saldo do produto "${item.nome}": Saldo anterior: ${item.estoque_atual} ${item.unidade} ➡️ Novo saldo: ${newQty} ${item.unidade} (${diff > 0 ? '+' : ''}${diff}). Motivo: ${reason}`);

        alert('Saldo reajustado com sucesso!');
        await loadInventory();
        if (typeof loadHistory === 'function') await loadHistory(true);
        await openProductViewModal(id); // Refresh view
    } catch (err) {
        console.error('Erro ao salvar ajuste:', err);
        alert('Erro ao processar ajuste.');
    }
}



async function loadHistory(forceReload = false) {
    try {
        if (historyData.length === 0 || forceReload) {
            let query = supabaseClient
                .from('estoque_movimentacoes')
                .select(`
                    *,
                    estoque (nome, ref, codigo_interno)
                `)
                .order('created_at', { ascending: false })
                .order('data', { ascending: false });

            const { data, error } = await query;
            if (error) throw error;
            
            // Ordena estritamente por timestamp real de criação (mais recente no topo)
            historyData = (data || []).slice().sort((a, b) => {
                const timeA = new Date(a.created_at || a.data).getTime();
                const timeB = new Date(b.created_at || b.data).getTime();
                return timeB - timeA;
            });
        }

        applyHistoryFilters();
    } catch (err) {
        console.error('Erro ao carregar histórico:', err);
    }
}

let historyViewMode = 'venda'; // 'venda' ou 'item'
let historyCurrentPage = 1;
let historyPageSize = 15;
let filteredHistoryRecords = []; // Holds items ready for rendering (grouped sales or per-item)

function setHistoryViewMode(mode) {
    historyViewMode = mode;
    const btnVenda = document.getElementById('btn_history_mode_venda');
    const btnItem = document.getElementById('btn_history_mode_item');
    if (btnVenda && btnItem) {
        if (mode === 'venda') {
            btnVenda.style.background = '#059669';
            btnVenda.style.color = '#ffffff';
            btnVenda.style.fontWeight = '800';
            btnItem.style.background = 'transparent';
            btnItem.style.color = '#64748b';
            btnItem.style.fontWeight = '700';
        } else {
            btnItem.style.background = '#059669';
            btnItem.style.color = '#ffffff';
            btnItem.style.fontWeight = '800';
            btnVenda.style.background = 'transparent';
            btnVenda.style.color = '#64748b';
            btnVenda.style.fontWeight = '700';
        }
    }
    historyCurrentPage = 1;
    applyHistoryFilters();
}

function changeHistoryPageSize(newSize) {
    historyPageSize = parseInt(newSize, 10) || 15;
    historyCurrentPage = 1;
    renderCurrentHistoryPage();
}

function prevHistoryPage() {
    if (historyCurrentPage > 1) {
        historyCurrentPage--;
        renderCurrentHistoryPage();
    }
}

function nextHistoryPage() {
    const totalPages = Math.ceil(filteredHistoryRecords.length / historyPageSize) || 1;
    if (historyCurrentPage < totalPages) {
        historyCurrentPage++;
        renderCurrentHistoryPage();
    }
}

function goToHistoryPage(page) {
    historyCurrentPage = page;
    renderCurrentHistoryPage();
}

function applyHistoryFilters() {
    const searchTerm = (document.getElementById('search_history')?.value || '').toLowerCase().trim();
    const typeFilter = document.getElementById('filter_type')?.value || '';
    const periodFilter = document.getElementById('filter_period')?.value || 'mes';

    // Exibir/ocultar datas customizadas
    const customRangeDiv = document.getElementById('history_custom_date_range');
    if (customRangeDiv) {
        customRangeDiv.style.display = periodFilter === 'custom' ? 'flex' : 'none';
    }

    // 1. Filtragem base por data e tipo
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const matchedRaw = (historyData || []).filter(h => {
        const itemDate = new Date(h.data || h.created_at);

        // Período
        let matchesPeriod = true;
        if (periodFilter === 'hoje') {
            const todayStr = now.toISOString().split('T')[0];
            const itemStr = itemDate.toISOString().split('T')[0];
            matchesPeriod = todayStr === itemStr;
        } else if (periodFilter === 'semana') {
            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(now.getDate() - 7);
            matchesPeriod = itemDate >= oneWeekAgo;
        } else if (periodFilter === 'mes') {
            matchesPeriod = itemDate.getMonth() === currentMonth && itemDate.getFullYear() === currentYear;
        } else if (periodFilter === 'custom') {
            const startVal = document.getElementById('history_filter_start')?.value;
            const endVal = document.getElementById('history_filter_end')?.value;
            if (startVal) {
                const startDate = new Date(startVal + 'T00:00:00');
                if (itemDate < startDate) matchesPeriod = false;
            }
            if (endVal) {
                const endDate = new Date(endVal + 'T23:59:59');
                if (itemDate > endDate) matchesPeriod = false;
            }
        }

        if (!matchesPeriod) return false;

        // Tipo filter
        if (typeFilter) {
            const isAjuste = h.motivo && h.motivo.startsWith('[AJUSTE]');
            let displayTipo = h.tipo;
            if (isAjuste) displayTipo = 'AJUSTE';
            if (displayTipo !== typeFilter) return false;
        }

        return true;
    });

    // 2. Atualizar cards de estatísticas (baseado no mês atual ou filtrado)
    updateHistoryStats(matchedRaw);

    // 3. Montar registros de acordo com historyViewMode ('venda' ou 'item')
    if (historyViewMode === 'venda') {
        filteredHistoryRecords = buildGroupedSalesHistory(matchedRaw, searchTerm);
    } else {
        filteredHistoryRecords = buildItemHistory(matchedRaw, searchTerm);
    }

    historyCurrentPage = 1;
    renderCurrentHistoryPage();
    updateHistoryFilterDropdowns(searchTerm, typeFilter, periodFilter);
}

// Agrupamento inteligente por venda
function buildGroupedSalesHistory(rawData, searchTerm) {
    const salesMap = new Map();
    const nonSalesList = [];

    rawData.forEach(h => {
        const motivo = h.motivo || '';
        const isVenda = motivo.includes('VENDA:');
        let vendaCodigo = null;

        if (isVenda) {
            const match = motivo.match(/VENDA:\s*([A-Za-z0-9\-_]+)/i);
            if (match && match[1]) {
                vendaCodigo = match[1].trim().toUpperCase();
            }
        }

        if (vendaCodigo) {
            if (!salesMap.has(vendaCodigo)) {
                // Extrai tipo de saída e destino
                let tipoLabel = 'Saída Simples';
                if (motivo.toLowerCase().includes('ordem de serviço') || motivo.toLowerCase().includes('o.s.') || motivo.includes('OS:')) {
                    tipoLabel = 'O.S.';
                } else if (motivo.toLowerCase().includes('externa')) {
                    tipoLabel = 'Externa';
                }

                // Destino (veículo ou cliente)
                let destino = 'Não Informado';
                const destMatch = motivo.match(/PLACA:\s*([A-Za-z0-9\-_]+)/i);
                if (destMatch && destMatch[1]) {
                    destino = `Placa: ${destMatch[1].toUpperCase()}`;
                } else {
                    const parts = motivo.split('|');
                    if (parts.length > 0) {
                        destino = parts[0].replace(/SAÍDA:\s*/i, '').trim();
                    }
                }

                salesMap.set(vendaCodigo, {
                    isGroup: true,
                    codigo: vendaCodigo,
                    data: h.data || h.created_at,
                    created_at: h.created_at || h.data,
                    tipoLabel: tipoLabel,
                    destino: destino,
                    responsavel: h.responsavel || '---',
                    isCancelled: motivo.includes('[CANCELADA]'),
                    itens: [],
                    total_qtd: 0,
                    total_valor: 0,
                    total_lucro: 0,
                    searchIndex: ''
                });
            }

            const group = salesMap.get(vendaCodigo);
            const qtd = Math.abs(parseFloat(h.quantidade) || 0);
            const vlr = parseFloat(h.valor_unitario) || 0;
            const lucro = parseFloat(h.lucro) || 0;

            group.itens.push({
                item_id: h.item_id,
                nome: h.estoque?.nome || 'Item Removido',
                ref: h.estoque?.ref || '---',
                cod_int: h.estoque?.codigo_interno || '---',
                quantidade: qtd,
                valor_unitario: vlr,
                tipo: h.tipo,
                isEstorno: h.tipo === 'ESTORNO'
            });

            if (h.tipo === 'SAIDA') {
                group.total_qtd += qtd;
                group.total_valor += (qtd * vlr);
                group.total_lucro += lucro;
            } else if (h.tipo === 'ESTORNO') {
                // Reduz valor ou marca estorno
                group.total_lucro -= lucro;
            }

            // Atualiza data se houver registro mais recente
            const currentGroupTime = new Date(group.created_at).getTime();
            const itemTime = new Date(h.created_at || h.data).getTime();
            if (itemTime > currentGroupTime) {
                group.created_at = h.created_at || h.data;
                group.data = h.data || h.created_at;
            }
        } else {
            // Movimentação Avulsa (Compra, Ajuste, etc.)
            const isAjuste = motivo.startsWith('[AJUSTE]');
            let displayTipo = h.tipo;
            if (isAjuste) displayTipo = 'AJUSTE';

            nonSalesList.push({
                isGroup: false,
                raw: h,
                data: h.data || h.created_at,
                created_at: h.created_at || h.data,
                tipo: displayTipo,
                motivo: motivo,
                responsavel: h.responsavel || '---',
                item_id: h.item_id,
                item_nome: h.estoque?.nome || 'Item Removido',
                item_ref: h.estoque?.ref || '---',
                item_cod_int: h.estoque?.codigo_interno || '---',
                quantidade: parseFloat(h.quantidade) || 0,
                saldo_apos: h.saldo_apos,
                valor_unitario: parseFloat(h.valor_unitario) || 0,
                lucro: parseFloat(h.lucro) || 0,
                isCancelled: motivo.includes('[CANCELADA]')
            });
        }
    });

    // Combina vendas e movimentos avulsos
    const combined = [...salesMap.values(), ...nonSalesList];

    // Ordenação cronológica decrescente
    combined.sort((a, b) => new Date(b.created_at || b.data) - new Date(a.created_at || a.data));

    // Filtragem por SearchTerm
    if (!searchTerm) return combined;

    return combined.filter(rec => {
        if (rec.isGroup) {
            if (rec.codigo.toLowerCase().includes(searchTerm)) return true;
            if (rec.destino.toLowerCase().includes(searchTerm)) return true;
            if (rec.responsavel.toLowerCase().includes(searchTerm)) return true;
            return rec.itens.some(it => 
                (it.nome || '').toLowerCase().includes(searchTerm) ||
                (it.ref || '').toLowerCase().includes(searchTerm) ||
                (it.cod_int || '').toLowerCase().includes(searchTerm)
            );
        } else {
            return (rec.item_nome || '').toLowerCase().includes(searchTerm) ||
                   (rec.motivo || '').toLowerCase().includes(searchTerm) ||
                   (rec.responsavel || '').toLowerCase().includes(searchTerm) ||
                   (rec.item_ref || '').toLowerCase().includes(searchTerm);
        }
    });
}

// Lista detalhada por item (visão analítica original)
function buildItemHistory(rawData, searchTerm) {
    const list = rawData.map(h => {
        const motivo = h.motivo || '';
        const isAjuste = motivo.startsWith('[AJUSTE]');
        let displayTipo = h.tipo;
        if (isAjuste) displayTipo = 'AJUSTE';

        let vendaCodigo = null;
        if (motivo.includes('VENDA:')) {
            const match = motivo.match(/VENDA:\s*([A-Za-z0-9\-_]+)/i);
            if (match && match[1]) vendaCodigo = match[1].trim().toUpperCase();
        }

        return {
            isGroup: false,
            raw: h,
            data: h.data || h.created_at,
            created_at: h.created_at || h.data,
            tipo: displayTipo,
            motivo: motivo,
            vendaCodigo: vendaCodigo,
            responsavel: h.responsavel || '---',
            item_id: h.item_id,
            item_nome: h.estoque?.nome || 'Item Removido',
            item_ref: h.estoque?.ref || '---',
            item_cod_int: h.estoque?.codigo_interno || '---',
            quantidade: parseFloat(h.quantidade) || 0,
            saldo_apos: h.saldo_apos,
            valor_unitario: parseFloat(h.valor_unitario) || 0,
            lucro: parseFloat(h.lucro) || 0,
            isCancelled: motivo.includes('[CANCELADA]')
        };
    });

    list.sort((a, b) => new Date(b.created_at || b.data) - new Date(a.created_at || a.data));

    if (!searchTerm) return list;

    return list.filter(rec => 
        (rec.item_nome || '').toLowerCase().includes(searchTerm) ||
        (rec.motivo || '').toLowerCase().includes(searchTerm) ||
        (rec.responsavel || '').toLowerCase().includes(searchTerm) ||
        (rec.item_ref || '').toLowerCase().includes(searchTerm) ||
        (rec.vendaCodigo && rec.vendaCodigo.toLowerCase().includes(searchTerm))
    );
}

function renderCurrentHistoryPage() {
    const thead = document.getElementById('history_thead');
    const tbody = document.getElementById('history_body');
    if (!tbody || !thead) return;

    tbody.innerHTML = '';

    // 1. Configurar Cabeçalho de acordo com a visão selecionada
    if (historyViewMode === 'venda') {
        thead.innerHTML = `
            <tr>
                <th style="padding: 0.9rem 0.8rem; width: 95px; font-size: 0.72rem; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; vertical-align: middle; white-space: nowrap;">DATA</th>
                <th style="padding: 0.9rem 0.8rem; width: 135px; font-size: 0.72rem; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; vertical-align: middle; white-space: nowrap;">CÓDIGO / TIPO</th>
                <th style="padding: 0.9rem 0.8rem; width: 140px; font-size: 0.72rem; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; vertical-align: middle; white-space: nowrap;">DESTINO / DETALHES</th>
                <th style="padding: 0.9rem 0.8rem; min-width: 250px; font-size: 0.72rem; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; vertical-align: middle;">RESUMO DOS ITENS</th>
                <th style="padding: 0.9rem 0.8rem; width: 90px; font-size: 0.72rem; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; vertical-align: middle; text-align: center; white-space: nowrap;">QTD TOTAL</th>
                <th style="padding: 0.9rem 0.8rem; width: 105px; font-size: 0.72rem; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; vertical-align: middle; white-space: nowrap;">VALOR TOTAL</th>
                <th style="padding: 0.9rem 0.8rem; width: 90px; font-size: 0.72rem; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; vertical-align: middle; white-space: nowrap;">LUCRO</th>
                <th style="padding: 0.9rem 0.8rem; width: 135px; font-size: 0.72rem; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; vertical-align: middle; white-space: nowrap;">RESPONSÁVEL</th>
                <th style="padding: 0.9rem 0.8rem; width: 115px; font-size: 0.72rem; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; vertical-align: middle; text-align: right; white-space: nowrap;">AÇÃO</th>
            </tr>
        `;
    } else {
        thead.innerHTML = `
            <tr>
                <th style="padding: 0.9rem 0.8rem; width: 95px; font-size: 0.72rem; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; vertical-align: middle; white-space: nowrap;">DATA</th>
                <th style="padding: 0.9rem 0.8rem; min-width: 180px; font-size: 0.72rem; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; vertical-align: middle;">PRODUTO</th>
                <th style="padding: 0.9rem 0.8rem; width: 110px; font-size: 0.72rem; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; vertical-align: middle; white-space: nowrap;">LOTE / REF</th>
                <th style="padding: 0.9rem 0.8rem; width: 90px; font-size: 0.72rem; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; vertical-align: middle; white-space: nowrap;">TIPO</th>
                <th style="padding: 0.9rem 0.8rem; width: 90px; font-size: 0.72rem; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; vertical-align: middle; text-align: center; white-space: nowrap;">QUANTIDADE</th>
                <th style="padding: 0.9rem 0.8rem; width: 85px; font-size: 0.72rem; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; vertical-align: middle; text-align: center; white-space: nowrap;">SALDO</th>
                <th style="padding: 0.9rem 0.8rem; width: 105px; font-size: 0.72rem; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; vertical-align: middle; white-space: nowrap;">VLR. UNITÁRIO</th>
                <th style="padding: 0.9rem 0.8rem; width: 90px; font-size: 0.72rem; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; vertical-align: middle; white-space: nowrap;">LUCRO</th>
                <th style="padding: 0.9rem 0.8rem; min-width: 160px; font-size: 0.72rem; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; vertical-align: middle;">MOTIVO / FORNECEDOR</th>
                <th style="padding: 0.9rem 0.8rem; width: 135px; font-size: 0.72rem; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; vertical-align: middle; white-space: nowrap;">RESPONSÁVEL</th>
                <th style="padding: 0.9rem 0.8rem; width: 90px; font-size: 0.72rem; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; vertical-align: middle; text-align: right; white-space: nowrap;">AÇÃO</th>
            </tr>
        `;
    }

    const totalRecords = filteredHistoryRecords.length;
    if (totalRecords === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="${historyViewMode === 'venda' ? 9 : 11}" style="text-align: center; padding: 3rem 1rem; color: #94a3b8; font-weight: 700; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px;">
                    <i data-lucide="inbox" style="width: 38px; height: 38px; margin: 0 auto 0.5rem; display: block; opacity: 0.5;"></i>
                    Nenhuma movimentação encontrada para os filtros selecionados.
                </td>
            </tr>
        `;
        renderHistoryPagination(0, 1, 0, 0);
        if (window.lucide) lucide.createIcons();
        return;
    }

    // 2. Paginação: Slice dos registros
    const totalPages = Math.ceil(totalRecords / historyPageSize) || 1;
    if (historyCurrentPage > totalPages) historyCurrentPage = totalPages;
    if (historyCurrentPage < 1) historyCurrentPage = 1;

    const startIdx = (historyCurrentPage - 1) * historyPageSize;
    const endIdx = Math.min(startIdx + historyPageSize, totalRecords);
    const pageRecords = filteredHistoryRecords.slice(startIdx, endIdx);

    // 3. Renderização das Linhas
    if (historyViewMode === 'venda') {
        pageRecords.forEach(rec => {
            const row = document.createElement('tr');
            row.style.background = '#ffffff';
            row.style.boxShadow = '0 1px 3px rgba(0,0,0,0.03)';
            row.style.borderRadius = '10px';
            row.style.transition = 'all 0.15s ease';
            row.onmouseover = () => row.style.background = '#f8fafc';
            row.onmouseout = () => row.style.background = '#ffffff';

            const dateStr = new Date(rec.data).toLocaleDateString('pt-BR');

            // Formatação do Responsável
            const rawResp = rec.responsavel || '---';
            let cleanResp = rawResp.includes('@') ? rawResp.split('@')[0] : rawResp;
            cleanResp = cleanResp.replace(/[._]/g, ' ').trim();
            if (!cleanResp) cleanResp = 'Sistema';

            const respCellHtml = `
                <div style="display: flex; align-items: center; gap: 6px;" title="${rawResp}">
                    <div style="width: 22px; height: 22px; border-radius: 50%; background: #f1f5f9; border: 1px solid #cbd5e1; display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: #475569; font-size: 0.65rem; font-weight: 800; text-transform: uppercase;">
                        ${cleanResp.charAt(0)}
                    </div>
                    <span style="font-size: 0.74rem; font-weight: 700; color: #475569; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 105px; text-transform: capitalize;">
                        ${cleanResp}
                    </span>
                </div>
            `;

            if (rec.isGroup) {
                // Monta resumo dos itens
                let itemsSummaryHtml = '';
                if (rec.itens && rec.itens.length > 0) {
                    itemsSummaryHtml = rec.itens.map(it => `
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                            <span style="font-weight: 700; color: #1e293b; font-size: 0.78rem; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 240px;" title="${it.nome}">
                                ${it.nome}
                            </span>
                            <span style="font-size: 0.72rem; font-weight: 800; color: ${it.isEstorno ? '#d97706' : '#dc2626'}; white-space: nowrap; background: #ffffff; padding: 1px 6px; border-radius: 4px; border: 1px solid #e2e8f0;">
                                ${it.isEstorno ? 'Estorno ' : ''}${Math.round(it.quantidade)} un
                            </span>
                        </div>
                    `).join('');
                } else {
                    itemsSummaryHtml = '<span style="font-size: 0.75rem; color: #94a3b8;">Nenhum item</span>';
                }

                row.innerHTML = `
                    <td data-label="DATA" style="padding: 0.85rem 0.8rem; vertical-align: middle; border: 1px solid #e2e8f0; border-right: none; border-radius: 10px 0 0 10px; white-space: nowrap;">
                        <span style="font-size: 0.82rem; font-weight: 700; color: #475569;">${dateStr}</span>
                    </td>
                    <td data-label="CÓDIGO / TIPO" style="padding: 0.85rem 0.8rem; vertical-align: middle; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; white-space: nowrap;">
                        <div style="display: flex; flex-direction: column; gap: 4px; align-items: flex-start;">
                            <button type="button" onclick="editSaleByCodigo('${rec.codigo}')" 
                                style="white-space: nowrap; background: #ecfdf5; border: 1px solid #a7f3d0; color: #059669; border-radius: 8px; padding: 4px 9px; font-size: 0.8rem; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; transition: all 0.2s;"
                                onmouseover="this.style.background='#d1fae5'" onmouseout="this.style.background='#ecfdf5'">
                                <i data-lucide="shopping-cart" style="width: 13px; height: 13px;"></i>
                                ${rec.codigo}
                            </button>
                            <span style="white-space: nowrap; font-size: 0.65rem; font-weight: 800; color: #dc2626; background: #fef2f2; border: 1px solid #fecaca; padding: 0.15rem 0.5rem; border-radius: 6px; text-transform: uppercase;">
                                ${rec.tipoLabel}
                            </span>
                        </div>
                    </td>
                    <td data-label="DESTINO / DETALHES" style="padding: 0.85rem 0.8rem; vertical-align: middle; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;">
                        <div style="display: inline-flex; align-items: center; gap: 5px; background: #f8fafc; border: 1px solid #e2e8f0; padding: 3px 8px; border-radius: 6px; font-weight: 800; font-size: 0.78rem; color: #1e293b; white-space: nowrap;">
                            <i data-lucide="truck" style="width: 13px; height: 13px; color: #059669; flex-shrink: 0;"></i>
                            <span>${rec.destino.replace(/placa:\s*/i, 'Placa: ')}</span>
                        </div>
                    </td>
                    <td data-label="RESUMO DOS ITENS" style="padding: 0.6rem 0.8rem; vertical-align: middle; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;">
                        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px 10px; display: flex; flex-direction: column; gap: 4px;">
                            ${itemsSummaryHtml}
                        </div>
                    </td>
                    <td data-label="QTD TOTAL" style="padding: 0.85rem 0.8rem; vertical-align: middle; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; text-align: center; white-space: nowrap;">
                        <span style="font-weight: 900; font-size: 0.95rem; color: #dc2626;">${Math.round(rec.total_qtd)} un</span>
                    </td>
                    <td data-label="VALOR TOTAL" style="padding: 0.85rem 0.8rem; vertical-align: middle; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; white-space: nowrap;">
                        <span style="font-weight: 800; font-size: 0.88rem; color: #0f172a;">R$ ${rec.total_valor.toFixed(2)}</span>
                    </td>
                    <td data-label="LUCRO" style="padding: 0.85rem 0.8rem; vertical-align: middle; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; white-space: nowrap;">
                        <span style="font-size: 0.82rem; font-weight: 800; color: #059669;">${rec.total_lucro > 0 ? 'R$ ' + rec.total_lucro.toFixed(2) : '---'}</span>
                    </td>
                    <td data-label="RESPONSÁVEL" style="padding: 0.85rem 0.8rem; vertical-align: middle; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; white-space: nowrap;">
                        ${respCellHtml}
                    </td>
                    <td data-label="AÇÃO" style="padding: 0.85rem 0.8rem; vertical-align: middle; border: 1px solid #e2e8f0; border-left: none; border-radius: 0 10px 10px 0; text-align: right; white-space: nowrap;">
                        <button type="button" onclick="editSaleByCodigo('${rec.codigo}')" 
                            style="white-space: nowrap; background: #059669; color: #ffffff; border: none; border-radius: 8px; padding: 7px 12px; font-size: 0.75rem; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; transition: all 0.2s; box-shadow: 0 1px 3px rgba(5,150,105,0.25);"
                            onmouseover="this.style.background='#047857'" onmouseout="this.style.background='#059669'">
                            <i data-lucide="edit-3" style="width: 13px; height: 13px;"></i> Ver Venda
                        </button>
                    </td>
                `;
            } else {
                // Linha de movimentação Avulsa (Compra, Ajuste, etc.)
                const typeColor = rec.tipo === 'ENTRADA' ? '#059669' : (rec.tipo === 'AJUSTE' ? '#2563eb' : '#d97706');
                const bgColor = rec.tipo === 'ENTRADA' ? '#ecfdf5' : (rec.tipo === 'AJUSTE' ? '#eff6ff' : '#fffbeb');
                const borderColor = rec.tipo === 'ENTRADA' ? '#a7f3d0' : (rec.tipo === 'AJUSTE' ? '#bfdbfe' : '#fde68a');

                row.innerHTML = `
                    <td data-label="DATA" style="padding: 0.85rem 0.8rem; vertical-align: middle; border: 1px solid #e2e8f0; border-right: none; border-radius: 10px 0 0 10px; white-space: nowrap;">
                        <span style="font-size: 0.82rem; font-weight: 700; color: #475569;">${dateStr}</span>
                    </td>
                    <td data-label="CÓDIGO / TIPO" style="padding: 0.85rem 0.8rem; vertical-align: middle; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; white-space: nowrap;">
                        <span style="white-space: nowrap; font-size: 0.68rem; font-weight: 800; color: ${typeColor}; background: ${bgColor}; border: 1px solid ${borderColor}; padding: 0.25rem 0.6rem; border-radius: 6px; text-transform: uppercase;">
                            ${rec.tipo}
                        </span>
                    </td>
                    <td data-label="DESTINO / DETALHES" style="padding: 0.85rem 0.8rem; vertical-align: middle; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;">
                        <div style="font-size: 0.76rem; color: #475569; font-weight: 600; line-height: 1.3;">
                            ${(rec.motivo || 'Movimentação Avulsa').replace('[AJUSTE]', '').trim()}
                        </div>
                    </td>
                    <td data-label="RESUMO DOS ITENS" style="padding: 0.6rem 0.8rem; vertical-align: middle; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;">
                        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px 10px; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                            <div style="display: flex; flex-direction: column; min-width: 0;">
                                <span onclick="openProductViewModal('${rec.item_id}')" style="font-weight: 800; color: #059669; font-size: 0.8rem; cursor: pointer; text-decoration: underline; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 240px;" title="${rec.item_nome}">
                                    ${rec.item_nome}
                                </span>
                                <span style="font-size: 0.65rem; color: #94a3b8; font-weight: 600;">INT: ${rec.item_cod_int} | REF: ${rec.item_ref}</span>
                            </div>
                            <span style="font-size: 0.72rem; font-weight: 800; color: ${typeColor}; white-space: nowrap; background: #ffffff; padding: 1px 6px; border-radius: 4px; border: 1px solid #e2e8f0;">
                                ${Math.round(rec.quantidade)} un
                            </span>
                        </div>
                    </td>
                    <td data-label="QTD TOTAL" style="padding: 0.85rem 0.8rem; vertical-align: middle; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; text-align: center; white-space: nowrap;">
                        <span style="font-weight: 900; font-size: 0.95rem; color: ${typeColor};">${Math.round(rec.quantidade)} un</span>
                    </td>
                    <td data-label="VALOR TOTAL" style="padding: 0.85rem 0.8rem; vertical-align: middle; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; white-space: nowrap;">
                        <span style="font-weight: 800; font-size: 0.88rem; color: #0f172a;">R$ ${(rec.quantidade * rec.valor_unitario).toFixed(2)}</span>
                    </td>
                    <td data-label="LUCRO" style="padding: 0.85rem 0.8rem; vertical-align: middle; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; white-space: nowrap;">
                        <span style="font-size: 0.82rem; font-weight: 800; color: #059669;">${rec.lucro > 0 ? 'R$ ' + rec.lucro.toFixed(2) : '---'}</span>
                    </td>
                    <td data-label="RESPONSÁVEL" style="padding: 0.85rem 0.8rem; vertical-align: middle; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; white-space: nowrap;">
                        ${respCellHtml}
                    </td>
                    <td data-label="AÇÃO" style="padding: 0.85rem 0.8rem; vertical-align: middle; border: 1px solid #e2e8f0; border-left: none; border-radius: 0 10px 10px 0; text-align: right; white-space: nowrap;">
                        <button type="button" onclick="openProductViewModal('${rec.item_id}')" 
                            style="white-space: nowrap; background: #f8fafc; color: #334155; border: 1px solid #cbd5e1; border-radius: 8px; padding: 7px 12px; font-size: 0.75rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; transition: all 0.2s;"
                            onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='#f8fafc'">
                            <i data-lucide="eye" style="width: 13px; height: 13px;"></i> Ver Item
                        </button>
                    </td>
                `;
            }

            tbody.appendChild(row);
        });
    } else {
        // Modo por Item (visão detalhada)
        const saldoMap = {};
        inventoryData.forEach(p => saldoMap[p.id] = p.estoque_atual);

        pageRecords.forEach(rec => {
            const h = rec.raw;
            const row = document.createElement('tr');
            row.style.background = '#ffffff';
            row.style.boxShadow = '0 1px 3px rgba(0,0,0,0.03)';
            row.style.borderRadius = '10px';
            row.style.transition = 'all 0.15s ease';
            row.onmouseover = () => row.style.background = '#f8fafc';
            row.onmouseout = () => row.style.background = '#ffffff';

            const dateStr = new Date(rec.data).toLocaleDateString('pt-BR');
            const isSaida = h.tipo === 'SAIDA';
            const isEstorno = h.tipo === 'ESTORNO';
            const isAjuste = rec.tipo === 'AJUSTE';
            const isVenda = !!rec.vendaCodigo;

            const currentSaldo = saldoMap[h.item_id] || 0;
            const rowSaldo = currentSaldo;
            if (h.tipo === 'ENTRADA' || h.tipo === 'ESTORNO') {
                saldoMap[h.item_id] -= h.quantidade;
            } else {
                saldoMap[h.item_id] += h.quantidade;
            }

            let typeColor = '#059669';
            if (isAjuste) typeColor = '#2563eb';
            else if (isSaida) typeColor = '#dc2626';
            else if (isEstorno) typeColor = '#d97706';

            // Formatação do Responsável
            const rawResp = h.responsavel || '---';
            let cleanResp = rawResp.includes('@') ? rawResp.split('@')[0] : rawResp;
            cleanResp = cleanResp.replace(/[._]/g, ' ').trim();
            if (!cleanResp) cleanResp = 'Sistema';

            const respCellHtml = `
                <div style="display: flex; align-items: center; gap: 6px;" title="${rawResp}">
                    <div style="width: 22px; height: 22px; border-radius: 50%; background: #f1f5f9; border: 1px solid #cbd5e1; display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: #475569; font-size: 0.65rem; font-weight: 800; text-transform: uppercase;">
                        ${cleanResp.charAt(0)}
                    </div>
                    <span style="font-size: 0.74rem; font-weight: 700; color: #475569; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 105px; text-transform: capitalize;">
                        ${cleanResp}
                    </span>
                </div>
            `;

            row.innerHTML = `
                <td data-label="DATA" style="padding: 0.85rem 0.8rem; vertical-align: middle; border: 1px solid #e2e8f0; border-right: none; border-radius: 10px 0 0 10px; white-space: nowrap;">
                    <span style="font-size: 0.82rem; font-weight: 700; color: #475569;">${dateStr}</span>
                </td>
                <td data-label="PRODUTO" style="padding: 0.85rem 0.8rem; vertical-align: middle; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; ${rec.isCancelled ? 'opacity: 0.5;' : ''}">
                    <div style="display: flex; flex-direction: column;">
                        <span class="product-name" onclick="openProductViewModal('${h.item_id}')" style="font-weight: 800; color: #059669; font-size: 0.85rem; cursor: pointer; text-decoration: underline; ${rec.isCancelled ? 'text-decoration: line-through;' : ''}">${rec.item_nome}</span>
                        <span style="font-size: 0.65rem; color: #94a3b8; font-weight: 600;">INT: ${rec.item_cod_int}</span>
                    </div>
                </td>
                <td data-label="LOTE / REF" style="padding: 0.85rem 0.8rem; vertical-align: middle; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; white-space: nowrap; ${rec.isCancelled ? 'opacity: 0.5;' : ''}">
                    <span style="font-size: 0.75rem; color: #64748b; font-weight: 600; ${rec.isCancelled ? 'text-decoration: line-through;' : ''}">${rec.item_ref}</span>
                </td>
                <td data-label="TIPO" style="padding: 0.85rem 0.8rem; vertical-align: middle; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; white-space: nowrap;">
                    <span style="font-size: 0.65rem; font-weight: 800; color: ${rec.isCancelled ? '#9ca3af' : typeColor}; background: ${rec.isCancelled ? '#9ca3af20' : typeColor + '15'}; padding: 0.25rem 0.55rem; border-radius: 6px; text-transform: uppercase; ${rec.isCancelled ? 'text-decoration: line-through;' : ''}">
                        ${rec.isCancelled ? 'CANCELADA' : rec.tipo}
                    </span>
                </td>
                <td data-label="QUANTIDADE" style="padding: 0.85rem 0.8rem; vertical-align: middle; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; text-align: center; white-space: nowrap;">
                    <span style="font-weight: 900; font-size: 0.95rem; color: ${rec.isCancelled ? '#9ca3af' : (isSaida ? '#dc2626' : (isAjuste ? '#2563eb' : '#059669'))}; ${rec.isCancelled ? 'text-decoration: line-through; opacity: 0.5;' : ''}">${Math.round(h.quantidade)}</span>
                </td>
                <td data-label="SALDO" style="padding: 0.85rem 0.8rem; vertical-align: middle; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; text-align: center; white-space: nowrap;">
                    <span style="font-weight: 900; font-size: 1rem; color: #059669;">${Math.round(rowSaldo)}</span>
                </td>
                <td data-label="VLR. UNITÁRIO" style="padding: 0.85rem 0.8rem; vertical-align: middle; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; white-space: nowrap; ${rec.isCancelled ? 'opacity: 0.5;' : ''}">
                    <span style="font-size: 0.82rem; font-weight: 700; color: #475569; ${rec.isCancelled ? 'text-decoration: line-through;' : ''}">R$ ${parseFloat(h.valor_unitario || 0).toFixed(2)}</span>
                </td>
                <td data-label="LUCRO" style="padding: 0.85rem 0.8rem; vertical-align: middle; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; white-space: nowrap;">
                    <span style="font-size: 0.82rem; font-weight: 800; color: #059669; ${rec.isCancelled ? 'text-decoration: line-through; opacity: 0.5;' : ''}">${h.lucro > 0 ? 'R$ ' + parseFloat(h.lucro).toFixed(2) : '---'}</span>
                </td>
                <td data-label="MOTIVO / FORNECEDOR" style="padding: 0.85rem 0.8rem; vertical-align: middle; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;">
                    <span style="font-size: 0.76rem; color: ${rec.isCancelled ? '#ef4444' : (isVenda ? '#059669' : '#475569')}; font-weight: 600; line-height: 1.3; ${isVenda ? 'cursor: pointer; text-decoration: underline;' : ''} ${rec.isCancelled ? 'text-decoration: none !important;' : ''}" 
                          ${isVenda ? `onclick="editSaleByCodigo('${rec.vendaCodigo}')"` : ''}>
                        ${(h.motivo || 'N/A').replace(' | ', '<br><span style="color:#059669; font-weight:800; font-style:normal;">')}</span>
                    </span>
                </td>
                <td data-label="RESPONSÁVEL" style="padding: 0.85rem 0.8rem; vertical-align: middle; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; white-space: nowrap;">
                    ${respCellHtml}
                </td>
                <td data-label="AÇÕES" style="padding: 0.85rem 0.8rem; vertical-align: middle; border: 1px solid #e2e8f0; border-left: none; border-radius: 0 10px 10px 0; text-align: right; white-space: nowrap;">
                    ${isVenda ? `
                        <button type="button" onclick="editSaleByCodigo('${rec.vendaCodigo}')" 
                            style="white-space: nowrap; background: #ecfdf5; border: 1px solid #a7f3d0; color: #059669; border-radius: 8px; padding: 5px 10px; font-size: 0.75rem; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
                            <i data-lucide="edit-3" style="width: 12px; height: 12px;"></i> Venda
                        </button>
                    ` : ''}
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    renderHistoryPagination(totalRecords, totalPages, startIdx, endIdx);
    if (window.lucide) lucide.createIcons();
}

function renderHistoryPagination(totalRecords, totalPages, startIdx, endIdx) {
    const infoEl = document.getElementById('history_pagination_info');
    const prevBtn = document.getElementById('btn_history_prev');
    const nextBtn = document.getElementById('btn_history_next');
    const pageNumbersEl = document.getElementById('history_page_numbers');

    if (infoEl) {
        if (totalRecords === 0) {
            infoEl.innerText = 'Mostrando 0 registros';
        } else {
            infoEl.innerText = `Mostrando ${startIdx + 1} a ${endIdx} de ${totalRecords} registros`;
        }
    }

    if (prevBtn) {
        prevBtn.disabled = historyCurrentPage <= 1;
        prevBtn.style.opacity = historyCurrentPage <= 1 ? '0.5' : '1';
        prevBtn.style.cursor = historyCurrentPage <= 1 ? 'not-allowed' : 'pointer';
    }

    if (nextBtn) {
        nextBtn.disabled = historyCurrentPage >= totalPages;
        nextBtn.style.opacity = historyCurrentPage >= totalPages ? '0.5' : '1';
        nextBtn.style.cursor = historyCurrentPage >= totalPages ? 'not-allowed' : 'pointer';
    }

    if (pageNumbersEl) {
        pageNumbersEl.innerHTML = '';
        if (totalPages <= 1) return;

        // Limita botões numéricos ao redor da página atual
        let startPage = Math.max(1, historyCurrentPage - 2);
        let endPage = Math.min(totalPages, historyCurrentPage + 2);

        if (startPage > 1) {
            const firstBtn = createPageBtn(1);
            pageNumbersEl.appendChild(firstBtn);
            if (startPage > 2) {
                const dots = document.createElement('span');
                dots.innerText = '...';
                dots.style.padding = '0 4px';
                dots.style.color = '#94a3b8';
                dots.style.alignSelf = 'center';
                pageNumbersEl.appendChild(dots);
            }
        }

        for (let i = startPage; i <= endPage; i++) {
            pageNumbersEl.appendChild(createPageBtn(i));
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                const dots = document.createElement('span');
                dots.innerText = '...';
                dots.style.padding = '0 4px';
                dots.style.color = '#94a3b8';
                dots.style.alignSelf = 'center';
                pageNumbersEl.appendChild(dots);
            }
            const lastBtn = createPageBtn(totalPages);
            pageNumbersEl.appendChild(lastBtn);
        }
    }
}

function createPageBtn(page) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.innerText = page;
    const isCurrent = page === historyCurrentPage;

    btn.style.height = '34px';
    btn.style.minWidth = '34px';
    btn.style.padding = '0 6px';
    btn.style.borderRadius = '8px';
    btn.style.fontSize = '0.78rem';
    btn.style.fontWeight = '800';
    btn.style.cursor = 'pointer';
    btn.style.transition = 'all 0.2s';

    if (isCurrent) {
        btn.style.background = '#059669';
        btn.style.color = '#ffffff';
        btn.style.border = 'none';
        btn.style.boxShadow = '0 2px 4px rgba(5,150,105,0.2)';
    } else {
        btn.style.background = '#f8fafc';
        btn.style.color = '#334155';
        btn.style.border = '1px solid #cbd5e1';
        btn.onmouseover = () => btn.style.background = '#f1f5f9';
        btn.onmouseout = () => btn.style.background = '#f8fafc';
    }

    btn.onclick = () => goToHistoryPage(page);
    return btn;
}

function updateHistoryFilterDropdowns(searchTerm, typeFilter, periodFilter) {
    const filterTypeSelect = document.getElementById('filter_type');
    const filterPeriodSelect = document.getElementById('filter_period');
    if (!filterTypeSelect || !filterPeriodSelect) return;

    const currentType = filterTypeSelect.value;
    const currentPeriod = filterPeriodSelect.value;

    // --- Update Type Options ---
    const availableTypes = new Set();
    (historyData || []).forEach(h => {
        const matchesSearch = !searchTerm || 
            (h.estoque?.nome || '').toLowerCase().includes(searchTerm) || 
            (h.motivo || '').toLowerCase().includes(searchTerm) ||
            (h.responsavel || '').toLowerCase().includes(searchTerm);

        let matchesPeriod = true;
        const now = new Date();
        const itemDate = new Date(h.data || h.created_at);
        if (periodFilter === 'hoje') {
            const todayStr = now.toISOString().split('T')[0];
            const itemStr = itemDate.toISOString().split('T')[0];
            matchesPeriod = todayStr === itemStr;
        } else if (periodFilter === 'semana') {
            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(now.getDate() - 7);
            matchesPeriod = itemDate >= oneWeekAgo;
        } else if (periodFilter === 'mes') {
            matchesPeriod = itemDate.getMonth() === now.getMonth() && itemDate.getFullYear() === now.getFullYear();
        } else if (periodFilter === 'custom') {
            const startVal = document.getElementById('history_filter_start')?.value;
            const endVal = document.getElementById('history_filter_end')?.value;
            if (startVal) {
                const startDate = new Date(startVal + 'T00:00:00');
                if (itemDate < startDate) matchesPeriod = false;
            }
            if (endVal) {
                const endDate = new Date(endVal + 'T23:59:59');
                if (itemDate > endDate) matchesPeriod = false;
            }
        }

        if (matchesSearch && matchesPeriod) {
            const isAjuste = h.motivo && h.motivo.startsWith('[AJUSTE]');
            let displayTipo = h.tipo;
            if (isAjuste) displayTipo = 'AJUSTE';
            availableTypes.add(displayTipo);
        }
    });

    const allTypeOptions = [
        { value: '', text: 'Tipos' },
        { value: 'ENTRADA', text: 'Entrada' },
        { value: 'SAIDA', text: 'Saída' },
        { value: 'ESTORNO', text: 'Estorno' },
        { value: 'AJUSTE', text: 'Ajuste' }
    ];

    filterTypeSelect.innerHTML = '';
    allTypeOptions.forEach(opt => {
        if (opt.value === '' || availableTypes.has(opt.value) || opt.value === currentType) {
            const option = document.createElement('option');
            option.value = opt.value;
            option.text = opt.text;
            if (opt.value !== '' && !availableTypes.has(opt.value)) {
                option.text += ' (Sem registros)';
                option.disabled = true;
            }
            filterTypeSelect.appendChild(option);
        }
    });
    filterTypeSelect.value = currentType;

    // --- Update Period Options ---
    const availablePeriods = new Set(['todos', 'custom']);
    (historyData || []).forEach(h => {
        const matchesSearch = !searchTerm || 
            (h.estoque?.nome || '').toLowerCase().includes(searchTerm) || 
            (h.motivo || '').toLowerCase().includes(searchTerm) ||
            (h.responsavel || '').toLowerCase().includes(searchTerm);

        const isAjuste = h.motivo && h.motivo.startsWith('[AJUSTE]');
        let displayTipo = h.tipo;
        if (isAjuste) displayTipo = 'AJUSTE';

        let matchesType = true;
        if (typeFilter) {
            matchesType = displayTipo === typeFilter;
        }

        if (matchesSearch && matchesType) {
            const now = new Date();
            const itemDate = new Date(h.data || h.created_at);
            
            const todayStr = now.toISOString().split('T')[0];
            const itemStr = itemDate.toISOString().split('T')[0];
            if (todayStr === itemStr) availablePeriods.add('hoje');

            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(now.getDate() - 7);
            if (itemDate >= oneWeekAgo) availablePeriods.add('semana');

            if (itemDate.getMonth() === now.getMonth() && itemDate.getFullYear() === now.getFullYear()) {
                availablePeriods.add('mes');
            }
        }
    });

    const allPeriodOptions = [
        { value: 'todos', text: 'Todo Período' },
        { value: 'mes', text: 'Este Mês' },
        { value: 'semana', text: 'Esta Semana' },
        { value: 'hoje', text: 'Hoje' },
        { value: 'custom', text: 'Personalizado' }
    ];

    filterPeriodSelect.innerHTML = '';
    allPeriodOptions.forEach(opt => {
        if (availablePeriods.has(opt.value) || opt.value === currentPeriod) {
            const option = document.createElement('option');
            option.value = opt.value;
            option.text = opt.text;
            if (opt.value !== 'todos' && opt.value !== 'custom' && !availablePeriods.has(opt.value)) {
                option.text += ' (Sem registros)';
                option.disabled = true;
            }
            filterPeriodSelect.appendChild(option);
        }
    });
    filterPeriodSelect.value = currentPeriod;
}

function updateHistoryStats(data) {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const thisMonth = (data || []).filter(h => {
        const d = new Date(h.data || h.created_at);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    const entradas = thisMonth.filter(h => h.tipo === 'ENTRADA' && !(h.motivo && h.motivo.includes('[CANCELADA]'))).reduce((acc, h) => acc + (parseFloat(h.quantidade) || 0), 0);
    const saidas = thisMonth.filter(h => h.tipo === 'SAIDA' && !(h.motivo && h.motivo.includes('[CANCELADA]'))).reduce((acc, h) => acc + (parseFloat(h.quantidade) || 0), 0);
    const lucro = thisMonth.filter(h => h.tipo === 'SAIDA' && !(h.motivo && h.motivo.includes('[CANCELADA]'))).reduce((acc, h) => acc + (parseFloat(h.lucro) || 0), 0);

    const elEntradas = document.getElementById('stat_entradas');
    const elSaidas = document.getElementById('stat_saidas');
    const elLucro = document.getElementById('stat_lucro');

    if (elEntradas) elEntradas.innerText = `${Math.round(entradas)} itens`;
    if (elSaidas) elSaidas.innerText = `${Math.round(saidas)} itens`;
    if (elLucro) elLucro.innerText = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(lucro);
}


async function undoMovement(id) {
    if (typeof canDo === 'function' && !canDo('estoque_historico', 'delete')) {
        alert('Você não possui permissão para estornar movimentações do histórico.');
        return;
    }
    if (!confirm('Deseja estornar esta movimentação? O saldo do produto será revertido.')) return;
    
    try {
        const { data: mov, error: err1 } = await supabaseClient.from('estoque_movimentacoes').select('*').eq('id', id).single();
        if (err1) throw err1;

        const userEmail = getCurrentUserEmail();
        // Inverter tipo para estorno
        const estornoObj = {
            item_id: mov.item_id,
            tipo: 'ESTORNO',
            quantidade: mov.quantidade,
            valor_unitario: mov.valor_unitario,
            lucro: -mov.lucro,
            motivo: `ESTORNO: ${mov.motivo}`,
            responsavel: userEmail || 'SISTEMA',
            data: new Date().toISOString()
        };

        await supabaseClient.from('estoque_movimentacoes').insert([estornoObj]);

        // Reverter saldo no produto
        const { data: prod } = await supabaseClient.from('estoque').select('estoque_atual').eq('id', mov.item_id).single();
        const newBalance = mov.tipo === 'ENTRADA' ? (prod.estoque_atual - mov.quantidade) : (prod.estoque_atual + mov.quantidade);
        
        await supabaseClient.from('estoque').update({ estoque_atual: newBalance }).eq('id', mov.item_id);

        logEstoque('ALTERAÇÃO', `DETALHE: Estornou movimentação de estoque (ID: ${id}) de ${mov.quantidade} unidade(s) - Motivo original: ${mov.motivo}`);
        alert('Estorno realizado com sucesso!');
        await loadHistory(true);
        await loadInventory();
    } catch (err) {
        console.error(err);
        alert('Erro ao estornar.');
    }
}

function switchTab(tab) {
    document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
    document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));

    const section = document.getElementById(`section_${tab}`);
    if (section) section.style.display = 'block';

    if (tab === 'history') loadHistory(true);
    if (tab === 'setup') loadSetup();

    const items = document.querySelectorAll('.tab-item');
    items.forEach(item => {
        if (item.getAttribute('onclick').includes(tab)) {
            item.classList.add('active');
        }
    });

    if (tab === 'new') {
        setTimeout(() => {
            const barrasInput = document.getElementById('mp_barras');
            if (barrasInput) barrasInput.focus();
        }, 100);
    }

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// Auxiliares Logic
async function loadSetup(forceSelect = {}) {
    console.log("Iniciando carregamento dos dados auxiliares...");
    if (!supabaseClient) {
        console.error("Supabase Client não inicializado!");
        return;
    }

    try {
        // Carregar Categorias
        const { data: cats, error: err1 } = await supabaseClient.from('estoque_categorias').select('*').order('nome');
        if (err1) {
            console.error("Erro ao buscar Categorias:", err1);
        } else {
            console.log("Categorias carregadas:", cats?.length);
            renderCategories(cats || []);
        }

        // Carregar Marcas
        let loadedBrands = [];
        try {
            const { data: brands, error: errBrands } = await supabaseClient.from('estoque_marcas').select('*').order('nome');
            if (errBrands) throw errBrands;
            loadedBrands = brands || [];
            renderBrands(loadedBrands);
        } catch (eB) {
            console.warn("Tabela estoque_marcas vazia/erro. Usando fallback de marcas.", eB);
            const localB = localStorage.getItem('estoque_marcas');
            loadedBrands = localB ? JSON.parse(localB) : [
                { id: 'b1', nome: 'COBREQ' },
                { id: 'b2', nome: 'BOSCH' },
                { id: 'b3', nome: 'MAHLE' },
                { id: 'b4', nome: 'FRAM' },
                { id: 'b5', nome: 'SPACER' }
            ];
            renderBrands(loadedBrands);
        }

        // Carregar Unidades
        const { data: units, error: err2 } = await supabaseClient.from('estoque_unidades').select('*').order('nome');
        if (err2) {
            console.error("Erro ao buscar Unidades:", err2);
        } else {
            console.log("Unidades carregadas:", units?.length);
            renderUnits(units || []);
        }

        // Carregar Modelos
        const { data: models, error: err3 } = await supabaseClient.from('estoque_modelos').select('*').order('modelo');
        if (err3) {
            console.error("Erro ao buscar Modelos:", err3);
        } else {
            console.log("Modelos carregados:", models?.length);
            renderModels(models || []);
        }

        // Carregar Clientes
        try {
            const { data: cData, error: errC } = await supabaseClient.from('estoque_clientes').select('*').order('nome');
            if (errC) throw errC;
            clientesData = cData || [];
        } catch (e) {
            console.warn("Tabela estoque_clientes não encontrada ou erro ao carregar. Usando localStorage fallback.", e);
            const local = localStorage.getItem('estoque_clientes');
            clientesData = local ? JSON.parse(local) : [
                { id: '1', nome: 'Consumidor Final', documento: '000.000.000-00', telefone: '(00) 00000-0000', email: 'consumidor@frotalink.com' }
            ];
        }

        // Carregar Prestadores Comerciais (Agregados)
        try {
            const { data: pData, error: errP } = await supabaseClient
                .from('com_prestadores')
                .select('id, nome_prestador, cpf, cnpj, status, placa, modelo')
                .order('nome_prestador');
            if (errP) throw errP;
            prestadoresData = pData || [];
            if (prestadoresData.length > 0) {
                localStorage.setItem('com_prestadores', JSON.stringify(prestadoresData));
            }
        } catch (e) {
            console.warn("Tabela com_prestadores não acessível online no estoque. Buscando cache local:", e);
            const localP = localStorage.getItem('com_prestadores');
            prestadoresData = localP ? JSON.parse(localP) : [];
        }

        renderClientes(clientesData);
        updateSelectClientes(clientesData);
        
        // Se for um modelo recém-cadastrado, incluir automaticamente nas aplicações do produto
        if (forceSelect && forceSelect.modelo) {
            const modStr = forceSelect.modelo.trim();
            if (modStr && !selectedApplications.includes(modStr)) {
                selectedApplications.push(modStr);
                renderApplications();
            }
        }

        // Atualizar os campos Select do formulário preservando dados e selecionando novos
        updateSelects(cats || [], units || [], models || [], loadedBrands, forceSelect);
        
        console.log("Processo de carregamento auxiliar finalizado.");
    } catch (err) {
        console.error('Erro crítico no loadSetup:', err);
    }
}

function renderCategories(cats) {
    const list = document.getElementById('categories_list');
    if (!list) return;
    list.innerHTML = cats.map(c => `
        <div class="styled-item-box" style="background: #ffffff; padding: 0.85rem 1rem; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; border: 1px solid #cbd5e1; box-shadow: 0 1px 2px rgba(0,0,0,0.04);">
            <span style="font-weight: 700; font-size: 0.85rem; text-transform: uppercase; color: #0f172a;">${c.nome}</span>
            <button onclick="deleteCategory('${c.id}')" style="background: #fee2e2; border: 1px solid #fca5a5; color: #dc2626; border-radius: 6px; cursor: pointer; padding: 0.3rem 0.5rem; display: inline-flex; align-items: center;">
                <i data-lucide="x" style="width: 14px; height: 14px;"></i>
            </button>
        </div>
    `).join('');
    lucide.createIcons();
}

function renderModels(models) {
    const list = document.getElementById('models_list');
    if (!list) return;
    list.innerHTML = models.map(m => `
        <div class="styled-item-box" style="background: #ffffff; padding: 0.85rem 1rem; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; border: 1px solid #cbd5e1; box-shadow: 0 1px 2px rgba(0,0,0,0.04);">
            <div style="display: flex; flex-direction: column;">
                <span style="font-weight: 800; font-size: 0.85rem; color: #0f172a; text-transform: uppercase;">${m.marca || ''} ${m.modelo}</span>
                <span style="font-size: 0.7rem; color: #475569; font-weight: 600;">${m.potencia || '---'} | ${m.ano || '---'}</span>
            </div>
            <button onclick="deleteModel('${m.id}')" style="background: #fee2e2; border: 1px solid #fca5a5; color: #dc2626; border-radius: 6px; cursor: pointer; padding: 0.3rem 0.5rem; display: inline-flex; align-items: center;">
                <i data-lucide="x" style="width: 14px; height: 14px;"></i>
            </button>
        </div>
    `).join('');
    lucide.createIcons();
}

function renderUnits(units) {
    const list = document.getElementById('units_list');
    if (!list) return;
    list.innerHTML = units.map(u => `
        <div class="styled-item-box" style="background: #ffffff; padding: 0.85rem 1rem; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; border: 1px solid #cbd5e1; box-shadow: 0 1px 2px rgba(0,0,0,0.04);">
            <span style="font-weight: 700; font-size: 0.85rem; text-transform: uppercase; color: #0f172a;">${u.nome} - ${u.sigla}</span>
            <button onclick="deleteUnit('${u.id}')" style="background: #fee2e2; border: 1px solid #fca5a5; color: #dc2626; border-radius: 6px; cursor: pointer; padding: 0.3rem 0.5rem; display: inline-flex; align-items: center;">
                <i data-lucide="x" style="width: 14px; height: 14px;"></i>
            </button>
        </div>
    `).join('');
    lucide.createIcons();
}

function renderClientes(clientes) {
    const list = document.getElementById('clientes_list');
    if (!list) return;
    list.innerHTML = clientes.map(c => `
        <div class="styled-item-box" style="background: #ffffff; padding: 0.85rem 1rem; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; border: 1px solid #cbd5e1; box-shadow: 0 1px 2px rgba(0,0,0,0.04);">
            <div style="display: flex; flex-direction: column; gap: 0.25rem; align-items: flex-start;">
                <span style="font-weight: 800; font-size: 0.85rem; color: #0f172a; text-transform: uppercase;">${c.nome}</span>
                <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; font-size: 0.7rem; color: #475569; font-weight: 600;">
                    ${c.documento ? `<span>Doc: ${c.documento}</span>` : ''}
                    ${c.telefone ? `<span>Tel: ${c.telefone}</span>` : ''}
                    ${c.email ? `<span>Email: ${c.email}</span>` : ''}
                </div>
            </div>
            <button onclick="deleteCliente('${c.id}')" style="background: #fee2e2; border: 1px solid #fca5a5; color: #dc2626; border-radius: 6px; cursor: pointer; padding: 0.3rem 0.5rem; display: inline-flex; align-items: center;">
                <i data-lucide="x" style="width: 14px; height: 14px;"></i>
            </button>
        </div>
    `).join('');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderBrands(brands) {
    const list = document.getElementById('brands_list');
    if (!list) return;
    list.innerHTML = brands.map(b => `
        <div class="styled-item-box" style="background: #ffffff; padding: 0.85rem 1rem; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; border: 1px solid #cbd5e1; box-shadow: 0 1px 2px rgba(0,0,0,0.04);">
            <span style="font-weight: 700; font-size: 0.85rem; text-transform: uppercase; color: #0f172a;">${b.nome}</span>
            <button onclick="deleteBrand('${b.id}')" style="background: #fee2e2; border: 1px solid #fca5a5; color: #dc2626; border-radius: 6px; cursor: pointer; padding: 0.3rem 0.5rem; display: inline-flex; align-items: center;">
                <i data-lucide="x" style="width: 14px; height: 14px;"></i>
            </button>
        </div>
    `).join('');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}



async function addCategory() {
    if (typeof canDo === 'function' && !canDo('estoque_cadastros', 'add')) return;
    const nome = document.getElementById('new_category_name').value.trim();
    if (!nome) return;
    try {
        const catUpper = nome.toUpperCase();
        await supabaseClient.from('estoque_categorias').insert([{ nome: catUpper }]);
        logEstoque('INCLUSÃO', `DETALHE: Cadastrou categoria de estoque: ${catUpper}`);
        document.getElementById('new_category_name').value = '';
        await loadSetup({ categoria: catUpper });
    } catch (err) { console.error(err); }
}

async function addModel() {
    if (typeof canDo === 'function' && !canDo('estoque_cadastros', 'add')) return;
    const modelo = document.getElementById('new_model_nome').value.trim();
    const marca = document.getElementById('new_model_marca').value.trim();
    const potencia = document.getElementById('new_model_potencia').value.trim();
    const ano = document.getElementById('new_model_ano').value.trim();
    
    if (!modelo) return;
    try {
        const marcaUpper = marca ? marca.toUpperCase() : '';
        const modeloUpper = modelo.toUpperCase();
        await supabaseClient.from('estoque_modelos').insert([{ marca: marcaUpper, modelo: modeloUpper, potencia, ano }]);
        const appName = `${marcaUpper} ${modeloUpper}`.trim();
        logEstoque('INCLUSÃO', `DETALHE: Cadastrou modelo de aplicação: ${appName}`);
        document.getElementById('new_model_nome').value = '';
        document.getElementById('new_model_marca').value = '';
        document.getElementById('new_model_potencia').value = '';
        document.getElementById('new_model_ano').value = '';
        await loadSetup({ modelo: appName });
    } catch (err) { console.error(err); }
}

async function addUnit() {
    if (typeof canDo === 'function' && !canDo('estoque_cadastros', 'add')) return;
    const nome = document.getElementById('new_unit_name').value.trim();
    if (!nome) return;
    try {
        const sigla = nome.substring(0,2).toUpperCase();
        await supabaseClient.from('estoque_unidades').insert([{ nome, sigla }]);
        logEstoque('INCLUSÃO', `DETALHE: Cadastrou unidade de estoque: ${nome}`);
        document.getElementById('new_unit_name').value = '';
        await loadSetup({ unidade: sigla || nome });
    } catch (err) { console.error(err); }
}



async function deleteCategory(id) {
    if (typeof canDo === 'function' && !canDo('estoque_cadastros', 'delete')) return;
    if (!confirm('Excluir?')) return;
    try {
        await supabaseClient.from('estoque_categorias').delete().eq('id', id);
        logEstoque('EXCLUSÃO', `DETALHE: Excluiu categoria de estoque (ID: ${id})`);
        await loadSetup();
    } catch (err) { console.error(err); }
}

async function deleteModel(id) {
    if (typeof canDo === 'function' && !canDo('estoque_cadastros', 'delete')) return;
    if (!confirm('Excluir?')) return;
    try {
        await supabaseClient.from('estoque_modelos').delete().eq('id', id);
        logEstoque('EXCLUSÃO', `DETALHE: Excluiu modelo de aplicação (ID: ${id})`);
        await loadSetup();
    } catch (err) { console.error(err); }
}

async function deleteUnit(id) {
    if (typeof canDo === 'function' && !canDo('estoque_cadastros', 'delete')) return;
    if (!confirm('Excluir?')) return;
    try {
        await supabaseClient.from('estoque_unidades').delete().eq('id', id);
        logEstoque('EXCLUSÃO', `DETALHE: Excluiu unidade de estoque (ID: ${id})`);
        await loadSetup();
    } catch (err) { console.error(err); }
}

async function addCliente() {
    if (typeof canDo === 'function' && !canDo('estoque_cadastros', 'add')) return;
    const nome = document.getElementById('new_cliente_nome').value.trim();
    const documento = document.getElementById('new_cliente_documento').value.trim();
    const telefone = document.getElementById('new_cliente_telefone').value.trim();
    const email = document.getElementById('new_cliente_email').value.trim();
    
    if (!nome) {
        alert('Por favor, informe pelo menos o Nome / Razão Social.');
        return;
    }

    const newCliente = { nome, documento, telefone, email };

    try {
        if (supabaseClient) {
            const { data, error } = await supabaseClient.from('estoque_clientes').insert([newCliente]).select();
            if (error) throw error;
            logEstoque('INCLUSÃO', `DETALHE: Cadastrou cliente no estoque: ${nome}`);
        } else {
            throw new Error("Supabase Client não inicializado");
        }
    } catch (err) {
        console.warn("Erro ao salvar cliente no Supabase. Salvando localmente.", err);
        newCliente.id = 'local_' + Date.now();
        clientesData.push(newCliente);
        localStorage.setItem('estoque_clientes', JSON.stringify(clientesData));
    }

    // Reset inputs
    document.getElementById('new_cliente_nome').value = '';
    document.getElementById('new_cliente_documento').value = '';
    document.getElementById('new_cliente_telefone').value = '';
    document.getElementById('new_cliente_email').value = '';

    await loadSetup();
}

async function deleteCliente(id) {
    if (typeof canDo === 'function' && !canDo('estoque_cadastros', 'delete')) return;
    if (!confirm('Tem certeza que deseja excluir este cliente?')) return;

    try {
        if (supabaseClient && !id.toString().startsWith('local_')) {
            const { error } = await supabaseClient.from('estoque_clientes').delete().eq('id', id);
            if (error) throw error;
            logEstoque('EXCLUSÃO', `DETALHE: Excluiu cliente do estoque (ID: ${id})`);
        } else {
            throw new Error("Local item or no Supabase connection");
        }
    } catch (err) {
        console.warn("Erro ao deletar do Supabase. Atualizando localmente.", err);
        clientesData = clientesData.filter(c => c.id !== id);
        localStorage.setItem('estoque_clientes', JSON.stringify(clientesData));
    }

    await loadSetup();
}

function updateSelectClientes(clientes) {
    const input = document.getElementById('v_cliente_nome');
    if (input) {
        input.value = '';
    }
}

function selectVendaCliente(nome) {
    const input = document.getElementById('v_cliente_nome');
    if (input) {
        input.value = nome;
    }
    const resultsDiv = document.getElementById('v_cliente_search_results');
    if (resultsDiv) {
        resultsDiv.style.display = 'none';
    }
}
window.selectVendaCliente = selectVendaCliente;

function searchVendaCliente(query) {
    const resultsDiv = document.getElementById('v_cliente_search_results');
    if (!resultsDiv) return;

    const q = (query || '').trim().toLowerCase();

    // 1. Normalizar Clientes do Estoque
    const clientesList = (clientesData || []).map(c => ({
        tipoOrigem: 'CLIENTE',
        nome: c.nome,
        documento: c.documento || '',
        infoSecundaria: c.telefone ? `Tel: ${c.telefone}` : (c.email || '')
    }));

    // 2. Normalizar Prestadores do Comercial
    const prestadoresList = (prestadoresData || []).map(p => ({
        tipoOrigem: 'PRESTADOR',
        nome: p.nome_prestador,
        documento: p.cpf || p.cnpj || '',
        infoSecundaria: p.placa ? `Placa: ${p.placa}${p.modelo ? ' (' + p.modelo + ')' : ''}` : (p.status ? `Status: ${p.status}` : '')
    }));

    // 3. Unir e filtrar por termo de busca
    const allEntities = [...prestadoresList, ...clientesList];
    const filtered = q === ''
        ? allEntities
        : allEntities.filter(e => 
            e.nome.toLowerCase().includes(q) || 
            (e.documento && e.documento.toLowerCase().includes(q)) ||
            (e.infoSecundaria && e.infoSecundaria.toLowerCase().includes(q))
        );

    if (filtered.length === 0) {
        resultsDiv.innerHTML = `<div class="search-item" style="padding: 0.8rem; font-size: 0.8rem; color: var(--text-muted); cursor: pointer;" onclick="selectVendaCliente('${query.replace(/'/g, "\\'")}')">
            <span class="name" style="font-weight: 700; color: var(--primary);">Usar termo digitado: "${query}"</span>
        </div>`;
    } else {
        resultsDiv.innerHTML = filtered.slice(0, 40).map(e => {
            const isPrestador = e.tipoOrigem === 'PRESTADOR';
            const badgeBg = isPrestador ? 'rgba(2, 132, 199, 0.12)' : 'rgba(16, 185, 129, 0.12)';
            const badgeColor = isPrestador ? '#0284c7' : '#059669';
            const badgeBorder = isPrestador ? 'rgba(2, 132, 199, 0.25)' : 'rgba(16, 185, 129, 0.25)';
            const badgeLabel = isPrestador ? 'Prestador Comercial' : 'Cliente Balcão';

            return `
                <div class="search-item" style="padding: 0.75rem 0.9rem; border-bottom: 1px solid rgba(226, 232, 240, 0.6); cursor: pointer; transition: background 0.15s ease;"
                     onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'"
                     onclick="selectVendaCliente('${e.nome.replace(/'/g, "\\'")}')">
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                        <span class="name" style="font-weight: 700; font-size: 0.82rem; color: #0f172a;">${e.nome}</span>
                        <span style="font-size: 0.62rem; font-weight: 800; padding: 2px 7px; border-radius: 12px; background: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${badgeBorder}; white-space: nowrap; text-transform: uppercase;">
                            ${badgeLabel}
                        </span>
                    </div>
                    <div class="info" style="font-size: 0.68rem; color: #64748b; font-weight: 600; margin-top: 3px;">
                        ${e.documento ? `Doc: ${e.documento}` : ''} ${e.infoSecundaria ? ` | ${e.infoSecundaria}` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }
    resultsDiv.style.display = 'block';
}

async function addBrand() {
    if (typeof canDo === 'function' && !canDo('estoque_cadastros', 'add')) return;
    const nome = document.getElementById('new_brand_name').value.trim();
    if (!nome) return;
    try {
        const brandUpper = nome.toUpperCase();
        await supabaseClient.from('estoque_marcas').insert([{ nome: brandUpper }]);
        logEstoque('INCLUSÃO', `DETALHE: Cadastrou marca no estoque: ${brandUpper}`);
        document.getElementById('new_brand_name').value = '';
        await loadSetup({ marca: brandUpper });
    } catch (err) { console.error(err); }
}

async function deleteBrand(id) {
    if (typeof canDo === 'function' && !canDo('estoque_cadastros', 'delete')) return;
    if (!confirm('Excluir esta marca?')) return;
    try {
        await supabaseClient.from('estoque_marcas').delete().eq('id', id);
        logEstoque('EXCLUSÃO', `DETALHE: Excluiu marca do estoque (ID: ${id})`);
        await loadSetup();
    } catch (err) { console.error(err); }
}

function updateSelects(cats, units, models, brands = [], forceSelect = {}) {
    const mpCatSelect = document.getElementById('mp_categoria');
    const mpUnitSelect = document.getElementById('mp_unidade');
    const mpModelSelect = document.getElementById('mp_aplicacao');
    const mpBrandSelect = document.getElementById('mp_marca');

    // Preservar valores atualmente selecionados nos campos para não resetar enquanto o usuário preenche o produto
    const prevCat = mpCatSelect ? mpCatSelect.value : '';
    const prevUnit = mpUnitSelect ? mpUnitSelect.value : '';
    const prevBrand = mpBrandSelect ? mpBrandSelect.value : '';

    const catOptions = '<option value="">Selecione...</option>' + 
            cats.map(c => `<option value="${c.nome}">${c.nome}</option>`).join('');
    
    const unitOptions = units.map(u => `<option value="${u.sigla || u.nome}">${u.nome}</option>`).join('');
    
    const modelOptions = '<option value="">Selecione o modelo...</option>' + 
            '<option value="Multiveículos">Multiveículos (Universal)</option>' +
            models.map(m => `<option value="${m.marca} ${m.modelo}">${m.marca} ${m.modelo} (${m.ano || '---'})</option>`).join('');

    const brandOptions = '<option value="">Selecione...</option>' +
            brands.map(b => `<option value="${b.nome}">${b.nome}</option>`).join('');

    if (mpCatSelect) {
        mpCatSelect.innerHTML = catOptions;
        const targetCat = (forceSelect && forceSelect.categoria !== undefined) ? forceSelect.categoria : prevCat;
        if (targetCat) mpCatSelect.value = targetCat;
    }

    if (mpUnitSelect) {
        mpUnitSelect.innerHTML = unitOptions;
        const targetUnit = (forceSelect && forceSelect.unidade !== undefined) ? forceSelect.unidade : prevUnit;
        if (targetUnit) {
            const matchingOpt = Array.from(mpUnitSelect.options).find(o => 
                o.value.toUpperCase() === targetUnit.toUpperCase() || 
                o.text.toUpperCase() === targetUnit.toUpperCase()
            );
            if (matchingOpt) {
                mpUnitSelect.value = matchingOpt.value;
            } else {
                mpUnitSelect.value = targetUnit;
            }
        }
    }

    if (mpModelSelect) {
        mpModelSelect.innerHTML = modelOptions;
    }

    if (mpBrandSelect) {
        mpBrandSelect.innerHTML = brandOptions;
        const targetBrand = (forceSelect && forceSelect.marca !== undefined) ? forceSelect.marca : prevBrand;
        if (targetBrand) mpBrandSelect.value = targetBrand;
    }

    // Manter atualizado também o filtro de categorias da listagem principal
    const filterCat = document.getElementById('filter_category');
    if (filterCat) {
        const prevFilter = filterCat.value;
        filterCat.innerHTML = '<option value="">Todas Categorias</option>' + 
            cats.map(c => `<option value="${c.nome}">${c.nome}</option>`).join('');
        if (prevFilter) filterCat.value = prevFilter;
    }
}

function generateInternalCode() {
    const random = Math.floor(1000 + Math.random() * 9000);
    const code = `STK-${new Date().getFullYear()}-${random}`;
    document.getElementById('mp_interno').value = code;
}

// --- Funções para Múltiplas Aplicações ---
function handleApplicationSelect(select) {
    const value = select.value;
    if (!value) return;
    
    if (!selectedApplications.includes(value)) {
        selectedApplications.push(value);
        renderApplications();
    }
    
    // Resetar select para o placeholder
    select.value = '';
}

function removeApplication(index) {
    selectedApplications.splice(index, 1);
    renderApplications();
}

function renderApplications() {
    const container = document.getElementById('aplicacoes_chips');
    if (!container) return;
    
    container.innerHTML = selectedApplications.map((app, index) => `
        <div class="app-chip" style="background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.2); color: var(--primary-light); padding: 0.5rem 1rem; border-radius: 12px; font-size: 0.75rem; font-weight: 700; display: flex; align-items: center; gap: 0.6rem; animation: fadeIn 0.3s ease;">
            <span>${app}</span>
            <button type="button" onclick="removeApplication(${index})" style="background: rgba(239, 68, 68, 0.1); border: none; color: #ef4444; cursor: pointer; width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; transition: 0.2s;">
                <i data-lucide="x" style="width: 12px;"></i>
            </button>
        </div>
    `).join('');
    
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// --- Enhanced Sales / Output Module Logic ---
let currentVendaId = null;
let vendaItems = [];
let vehiclesData = [];
let stockMaintTypes = [];
let stockMaintActions = [];
let stockDrivers = [];
let vItemCurrentLinkType = 'veiculo';
let vItemMaintControlActive = false;

// Formatador de KM padronizado
if (!window.formatKM) {
    window.formatKM = function(val) {
        if (val === undefined || val === null || val === '') return '';
        const clean = val.toString().replace(/\D/g, '');
        if (!clean) return '';
        return parseInt(clean, 10).toLocaleString('pt-BR');
    };
}

async function loadStockMaintenanceConfigs() {
    if (!supabaseClient) return;
    try {
        const [tRes, aRes, dRes] = await Promise.all([
            supabaseClient.from('manutencao_tipos').select('*').order('descricao'),
            supabaseClient.from('manutencao_acoes').select('*').order('descricao'),
            supabaseClient.from('motoristas').select('id, nome_completo, cpf').order('nome_completo')
        ]);
        if (tRes.data) stockMaintTypes = tRes.data;
        if (aRes.data) stockMaintActions = aRes.data;
        if (dRes.data) stockDrivers = dRes.data;
        populateStockMaintSelects();
    } catch (e) {
        console.error("Erro ao carregar configurações de manutenção no estoque:", e);
    }
}

async function getLatestVehicleKm(veiculoId) {
    if (!veiculoId) return null;
    try {
        const { data, error } = await supabaseClient
            .from('manutencoes')
            .select('km_atual')
            .eq('veiculo_id', veiculoId)
            .order('data_manutencao', { ascending: false })
            .limit(1);
        if (data && data.length > 0 && data[0].km_atual) {
            return data[0].km_atual;
        }
    } catch (e) {
        console.warn('Erro ao buscar último KM do veículo:', e);
    }
    return null;
}
window.getLatestVehicleKm = getLatestVehicleKm;

function formatKMInput(el) {
    if (!el) return;
    const clean = (el.value || '').replace(/\D/g, '');
    if (!clean) {
        el.value = '';
        return;
    }
    el.value = parseInt(clean, 10).toLocaleString('pt-BR');
}
window.formatKMInput = formatKMInput;

async function loadVehicles() {
    try {
        const select = document.getElementById('v_veiculo_id');
        if (select) select.innerHTML = '<option value="">Carregando veículos...</option>';
        
        const { data, error } = await supabaseClient
            .from('veiculos')
            .select('id, placa, modelo, marca')
            .order('placa', { ascending: true });

        if (error) throw error;
        vehiclesData = data || [];

        if (select) {
            select.innerHTML = '<option value="">Nenhum / Definir veículos por item</option>';
            vehiclesData.forEach(v => {
                const option = document.createElement('option');
                option.value = v.id;
                option.innerText = `${v.placa} - ${v.marca || ''} ${v.modelo || ''}`.trim();
                select.appendChild(option);
            });
        }
    } catch (err) {
        console.error('Erro ao carregar veículos:', err);
        const select = document.getElementById('v_veiculo_id');
        if (select) select.innerHTML = '<option value="">Erro ao carregar</option>';
    }
}

async function openVendaModal() {
    if (typeof canDo === 'function' && !canDo('estoque_vendas', 'add')) {
        alert('Sem permissão para registrar vendas / saída de estoque.');
        return;
    }
    try {
        if (typeof closeProductViewModal === 'function') {
            closeProductViewModal();
        }

        const form = document.getElementById('vendaForm');
        if (form && typeof form.reset === 'function') {
            form.reset();
        } else if (form) {
            const inputs = form.querySelectorAll('input, select, textarea');
            inputs.forEach(input => {
                if (input.type === 'checkbox' || input.type === 'radio') input.checked = false;
                else if (input.id !== 'v_selected_product_id') input.value = '';
            });
        }
        
        // Set current date
        const today = new Date().toISOString().split('T')[0];
        const dateInput = document.getElementById('v_data_venda');
        if (dateInput) dateInput.value = today;
        
        // Carregar veículos e configs de manutenção
        if (typeof loadVehicles === 'function') {
            await loadVehicles();
        }
        if (typeof loadStockMaintenanceConfigs === 'function') {
            await loadStockMaintenanceConfigs();
        }

        vendaItems = [];
        const container = document.getElementById('v_itens_container');
        if (container) container.innerHTML = '';
        addVendaItemRow({}, false);
        
        currentVendaId = null; // Reset ID de edição
        const btnConfirm = document.getElementById('btn_confirm_venda');
        if (btnConfirm) {
            btnConfirm.innerText = 'CONFIRMAR SAÍDA';
            btnConfirm.style.background = '#059669';
        }
        
        const btnDelete = document.getElementById('btn_delete_venda_edit');
        if (btnDelete) btnDelete.style.display = 'none';

        toggleVendaTypeFields();
        if (typeof updateSelectClientes === 'function') updateSelectClientes(clientesData);
        if (typeof calculateVendaTotal === 'function') calculateVendaTotal();
        
        const vModal = document.getElementById('vendaModal');
        if (vModal) {
            vModal.style.display = 'block';
            vModal.style.opacity = '1';
            vModal.style.visibility = 'visible';
            vModal.style.zIndex = '10010';
            vModal.classList.add('active');
            document.body.classList.add('venda-modal-open');

            // Foco inicial imediato no campo 'Tipo de Saída'
            setTimeout(() => {
                const tipoEl = document.getElementById('v_tipo');
                if (tipoEl) tipoEl.focus();
            }, 100);
        }
    } catch (err) {
        console.error('Erro ao abrir modal de saída/venda:', err);
    }
}

function closeVendaModal() {
    if (typeof closeBarcodeScanner === 'function') {
        closeBarcodeScanner();
    }
    const vModal = document.getElementById('vendaModal');
    if (vModal) {
        vModal.classList.remove('active');
        vModal.style.display = 'none';
        vModal.style.opacity = '0';
        vModal.style.visibility = 'hidden';
    }
    document.body.classList.remove('venda-modal-open');
}

// Garantir vínculo no escopo global window
window.openVendaModal = openVendaModal;
window.closeVendaModal = closeVendaModal;

function toggleVendaTypeFields() {
    const tipoEl = document.getElementById('v_tipo');
    const tipo = tipoEl ? tipoEl.value : 'SIMPLES';
    
    const groupPlaca = document.getElementById('group_v_placa');
    if (groupPlaca) groupPlaca.style.display = tipo === 'SIMPLES' ? 'flex' : 'none';

    const groupOS = document.getElementById('group_v_os');
    if (groupOS) groupOS.style.display = tipo === 'OS' ? 'flex' : 'none';

    const groupCliente = document.getElementById('group_v_cliente');
    if (groupCliente) groupCliente.style.display = tipo === 'EXTERNA' ? 'flex' : 'none';
    
    const pagDiv = document.getElementById('group_v_pagamento');
    const obsWrapper = document.getElementById('wrapper_v_observacoes');
    
    if (tipo === 'EXTERNA') {
        if (pagDiv) pagDiv.style.display = 'block';
        if (obsWrapper) {
            obsWrapper.classList.remove('span-4');
            obsWrapper.classList.add('span-2');
        }
    } else {
        if (pagDiv) pagDiv.style.display = 'none';
        if (obsWrapper) {
            obsWrapper.classList.remove('span-2');
            obsWrapper.classList.add('span-4');
        }
    }
}

function addVendaItemRow(data = {}, shouldFocus = true) {
    const container = document.getElementById('v_itens_container');
    if (!container) return;

    const rowId = 'v_row_' + Date.now() + Math.random().toString(36).substr(2, 5);
    const card = document.createElement('div');
    card.className = 'v-item-card';
    card.id = rowId;

    // Buscar dados do produto pré-selecionado (se houver)
    const selectedProd = inventoryData.find(p => p.id === data.produto_id) || null;
    const prodDisplay = selectedProd ? `${selectedProd.nome} ${selectedProd.marca ? `(${selectedProd.marca})` : ''}` : (data.nome || '');
    const stockQty = selectedProd ? selectedProd.estoque_atual : null;
    const stockUnit = selectedProd ? (selectedProd.unidade || 'UN') : (data.unidade || 'UN');

    const isPessoa = data.vinculo_tipo === 'pessoa' || (!!data.vinculo_pessoa && !data.vinculo_veiculo_id);
    const selectedVeh = vehiclesData.find(v => v.id === data.vinculo_veiculo_id) || null;
    const vehDisplay = selectedVeh ? selectedVeh.placa : (data.vinculo_veiculo_placa || '');
    const maintActive = !!data.maint_control;

    const qtd = data.quantidade !== undefined ? data.quantidade : 1;
    const unitPrice = data.valor_unitario !== undefined ? data.valor_unitario : (selectedProd?.valor_venda || 0);
    const subtotal = qtd * unitPrice;

    card.innerHTML = `
        <!-- Linha 1: Produto, Qtd, Preço Unitário, Subtotal, Excluir -->
        <div class="v-item-line-1">
            <div class="autocomplete-wrapper" style="position: relative; min-width: 0;">
                <div style="position: relative; display: flex; align-items: center;">
                    <i data-lucide="search" style="position: absolute; left: 10px; width: 14px; height: 14px; color: #94a3b8; pointer-events: none;"></i>
                    <input type="text" class="v-item-prod-search" placeholder="Buscar peça ou ler código de barras..." value="${prodDisplay}" oninput="handleVendaProdSearch(this)" onfocus="handleVendaProdSearch(this)" autocomplete="off" style="width: 100%; height: 38px; padding-left: 32px; padding-right: 135px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 0.82rem; font-weight: 600; color: #0f172a;">
                    <span class="v-item-stock-tag" style="position: absolute; right: 42px; font-size: 0.65rem; font-weight: 700; color: #059669; background: #ecfdf5; padding: 2px 6px; border-radius: 6px; border: 1px solid #a7f3d0; ${stockQty !== null ? '' : 'display:none;'}">Estoque: ${stockQty !== null ? stockQty : 0} ${stockUnit}</span>
                    <button type="button" class="btn-scan-item-row" onclick="openBarcodeScanner('${rowId}')" title="Bipar código de barras com a câmera" style="position: absolute; right: 6px; width: 30px; height: 28px; background: #ecfdf5; border: 1px solid #a7f3d0; color: #059669; border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0;">
                        <i data-lucide="scan-barcode" style="width: 16px; height: 16px;"></i>
                    </button>
                </div>
                <input type="hidden" class="v-item-prod-id" value="${data.produto_id || ''}">
                <input type="hidden" class="v-item-prod-nome" value="${data.nome || (selectedProd ? selectedProd.nome : '')}">
                <input type="hidden" class="v-item-prod-unidade" value="${stockUnit}">
                <input type="hidden" class="v-item-prod-custo" value="${selectedProd?.valor_custo || data.valor_custo || 0}">
                <div class="autocomplete-results"></div>
            </div>

            <div class="v-item-calc-group">
                <div>
                    <span class="v-mobile-mini-label">Qtd</span>
                    <input type="number" class="v-item-qtd" min="1" step="1" placeholder="QTD" value="${qtd}" oninput="updateVendaCardSubtotal(this)" style="width: 100%; height: 38px; text-align: center; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 0.82rem; font-weight: 700; color: #0f172a;">
                </div>

                <div style="position: relative;">
                    <span class="v-mobile-mini-label">Unitário</span>
                    <div style="position: relative;">
                        <span style="position: absolute; left: 8px; top: 50%; transform: translateY(-50%); color: #64748b; font-size: 0.68rem; font-weight: 700;">R$</span>
                        <input type="number" class="v-item-unit" min="0" step="0.01" placeholder="0,00" value="${unitPrice || ''}" oninput="updateVendaCardSubtotal(this)" style="width: 100%; height: 38px; padding-left: 24px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 0.82rem; font-weight: 700; color: #0f172a;">
                    </div>
                </div>

                <div>
                    <span class="v-mobile-mini-label">Subtotal</span>
                    <input type="text" class="v-item-subtotal" readonly placeholder="R$ 0,00" value="${subtotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}" style="width: 100%; height: 38px; text-align: right; background: #f0fdf4; border: 1px solid #a7f3d0; border-radius: 8px; font-size: 0.85rem; font-weight: 800; color: #059669; padding: 0 0.6rem;">
                </div>

                <div style="text-align: center;">
                    <span class="v-mobile-mini-label">&nbsp;</span>
                    <button type="button" class="btn-remove-v-item" onclick="removeVendaItemCard('${rowId}')" title="Excluir Item" style="width: 38px; height: 38px; background: #fee2e2; border: 1px solid #fecaca; color: #ef4444; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;">
                        <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
                    </button>
                </div>
            </div>
        </div>

        <!-- Linha 2: Vínculo (Placa/Pessoa) e Toggle Manutenção -->
        <div class="v-item-line-2">
            <div style="display: flex; align-items: center; gap: 0.6rem; flex: 1; min-width: 280px;">
                <label style="font-size: 0.72rem; font-weight: 700; color: #475569; min-width: 65px;">Vincular a:</label>
                <div class="vinculo-btns" style="display: flex; gap: 4px;">
                    <button type="button" class="btn-vinculo-type btn-v-veic ${!isPessoa ? 'active' : ''}" onclick="setVendaCardLinkType(this, 'veiculo')" title="Vincular a Veículo" style="height: 34px; padding: 0 10px; border-radius: 6px; border: 1px solid ${!isPessoa ? '#059669' : '#cbd5e1'}; background: ${!isPessoa ? '#059669' : '#f1f5f9'}; color: ${!isPessoa ? '#fff' : '#64748b'}; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                        <i data-lucide="truck" style="width: 14px; height: 14px;"></i>
                    </button>
                    <button type="button" class="btn-vinculo-type btn-v-pess ${isPessoa ? 'active' : ''}" onclick="setVendaCardLinkType(this, 'pessoa')" title="Vincular a Pessoa/Motorista" style="height: 34px; padding: 0 10px; border-radius: 6px; border: 1px solid ${isPessoa ? '#059669' : '#cbd5e1'}; background: ${isPessoa ? '#059669' : '#f1f5f9'}; color: ${isPessoa ? '#fff' : '#64748b'}; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                        <i data-lucide="user-plus" style="width: 14px; height: 14px;"></i>
                    </button>
                </div>

                <!-- Busca Veículo (Placa) -->
                <div class="v-item-veic-wrapper autocomplete-wrapper" style="flex: 1; position: relative; ${isPessoa ? 'display: none;' : ''}">
                    <input type="text" class="v-item-veic-search" placeholder="BUSCAR PLACA..." value="${vehDisplay}" oninput="handleVendaCardVehicleSearch(this)" onfocus="handleVendaCardVehicleSearch(this)" autocomplete="off" style="width: 100%; height: 34px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.78rem; font-weight: 700; color: #0f172a; padding: 0 0.6rem; text-transform: uppercase;">
                    <input type="hidden" class="v-item-veic-id" value="${data.vinculo_veiculo_id || ''}">
                    <div class="autocomplete-results"></div>
                </div>

                <!-- Busca Pessoa -->
                <div class="v-item-pess-wrapper autocomplete-wrapper" style="flex: 1; position: relative; ${isPessoa ? '' : 'display: none;'}">
                    <input type="text" class="v-item-pess-search" placeholder="NOME DO MOTORISTA / PESSOA..." value="${data.vinculo_pessoa || ''}" oninput="handleVendaCardDriverSearch(this)" onfocus="handleVendaCardDriverSearch(this)" autocomplete="off" style="width: 100%; height: 34px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.78rem; font-weight: 600; color: #0f172a; padding: 0 0.6rem;">
                    <div class="autocomplete-results"></div>
                </div>
            </div>

            <!-- Toggle Controlar Manutenção -->
            <div style="display: flex; align-items: center; gap: 0.6rem;">
                <label style="font-size: 0.72rem; font-weight: 700; color: #475569;">Controlar Manutenção?</label>
                <div class="v-maint-switch-wrap" style="display: flex; align-items: center; gap: 0.4rem; cursor: pointer; user-select: none;" onclick="toggleVendaCardMaint(this)">
                    <div class="v-maint-switch-track" style="width: 40px; height: 22px; background: ${maintActive ? '#059669' : '#cbd5e1'}; border-radius: 12px; position: relative; transition: all 0.2s;">
                        <div class="v-maint-switch-knob" style="width: 16px; height: 16px; background: #ffffff; border-radius: 50%; position: absolute; top: 3px; left: ${maintActive ? '21px' : '3px'}; transition: all 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.2);"></div>
                    </div>
                    <span class="v-maint-switch-label" style="font-size: 0.68rem; font-weight: 800; color: ${maintActive ? '#059669' : '#64748b'};">${maintActive ? 'SIM' : 'NÃO'}</span>
                    <input type="hidden" class="v-item-maint-active" value="${maintActive ? 'true' : 'false'}">
                </div>
            </div>
        </div>

        <!-- Linha 3: Painel de Manutenção Expansível -->
        <div class="v-item-maint-panel" style="display: ${maintActive ? 'grid' : 'none'};">
            <div class="form-group" style="margin-bottom: 0;">
                <label style="font-size: 0.65rem; font-weight: 800; color: #475569; text-transform: uppercase;">Tipo Manutenção*</label>
                <select class="v-item-maint-tipo" style="height: 36px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.78rem; font-weight: 700; color: #0f172a; padding: 0 0.5rem;">
                    <option value="">SELECIONE...</option>
                    ${(stockMaintTypes || []).map(t => `<option value="${t.id}" ${data.maint_tipo_id === t.id ? 'selected' : ''}>${t.descricao}</option>`).join('')}
                </select>
            </div>

            <div class="form-group" style="margin-bottom: 0;">
                <label style="font-size: 0.65rem; font-weight: 800; color: #475569; text-transform: uppercase;">Ação / Categoria*</label>
                <select class="v-item-maint-acao" style="height: 36px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.78rem; font-weight: 700; color: #0f172a; padding: 0 0.5rem;">
                    <option value="">SELECIONE...</option>
                    ${(stockMaintActions || []).map(a => `<option value="${a.id}" ${data.maint_acao_id === a.id ? 'selected' : ''}>${a.descricao}</option>`).join('')}
                </select>
            </div>

            <div class="form-group" style="margin-bottom: 0;">
                <label style="font-size: 0.65rem; font-weight: 800; color: #475569; text-transform: uppercase;">KM Atual*</label>
                <input type="text" class="v-item-maint-km" placeholder="EX: 105.000" value="${data.maint_km ? window.formatKM(data.maint_km) : ''}" oninput="formatKMInput(this)" style="height: 36px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.78rem; font-weight: 700; color: #0f172a; padding: 0 0.5rem;">
            </div>

            <div class="form-group" style="margin-bottom: 0;">
                <label style="font-size: 0.65rem; font-weight: 800; color: #475569; text-transform: uppercase;">Status*</label>
                <select class="v-item-maint-status" style="height: 36px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.78rem; font-weight: 700; color: #0f172a; padding: 0 0.5rem;">
                    <option value="CONCLUIDO" ${(data.maint_status || 'CONCLUIDO') === 'CONCLUIDO' ? 'selected' : ''}>CONCLUÍDO</option>
                    <option value="PENDENTE" ${data.maint_status === 'PENDENTE' ? 'selected' : ''}>PENDENTE</option>
                </select>
            </div>

            <div class="form-group" style="margin-bottom: 0;">
                <label style="font-size: 0.65rem; font-weight: 800; color: #475569; text-transform: uppercase;">Controle de Troca</label>
                <select class="v-item-maint-controle" onchange="handleCardMaintControleChange(this)" style="height: 36px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.78rem; font-weight: 700; color: #0f172a; padding: 0 0.5rem;">
                    <option value="NENHUMA" ${(data.maint_controle || 'NENHUMA') === 'NENHUMA' ? 'selected' : ''}>NÃO CONTROLA</option>
                    <option value="KM" ${data.maint_controle === 'KM' ? 'selected' : ''}>POR KM</option>
                    <option value="DATA" ${data.maint_controle === 'DATA' ? 'selected' : ''}>POR DATA</option>
                </select>
            </div>

            <!-- Condicionais de KM e Data -->
            <div class="v-card-maint-km-extra" style="grid-column: span 2; display: ${data.maint_controle === 'KM' ? 'block' : 'none'};">
                <label style="font-size: 0.65rem; font-weight: 800; color: #475569; text-transform: uppercase;">Intervalo KM</label>
                <input type="text" class="v-item-maint-intervalo-km" placeholder="Ex: 10.000" value="${data.maint_intervalo_km ? window.formatKM(data.maint_intervalo_km) : ''}" oninput="formatKMInput(this)" style="width: 100%; height: 36px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.78rem; font-weight: 700; color: #0f172a; padding: 0 0.5rem;">
            </div>

            <div class="v-card-maint-data-extra" style="grid-column: span 2; display: ${data.maint_controle === 'DATA' ? 'block' : 'none'};">
                <label style="font-size: 0.65rem; font-weight: 800; color: #475569; text-transform: uppercase;">Meses de Intervalo</label>
                <input type="number" class="v-item-maint-intervalo-meses" min="1" placeholder="Ex: 6" value="${data.maint_intervalo_meses || ''}" style="width: 100%; height: 36px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.78rem; font-weight: 700; color: #0f172a; padding: 0 0.5rem;">
            </div>

            <!-- Garantia -->
            <div class="form-group" style="margin-bottom: 0;">
                <label style="font-size: 0.65rem; font-weight: 800; color: #475569; text-transform: uppercase;">Garantia?</label>
                <select class="v-item-maint-garantia" onchange="handleCardMaintGarantiaChange(this)" style="height: 36px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.78rem; font-weight: 700; color: #0f172a; padding: 0 0.5rem;">
                    <option value="false" ${!data.maint_garantia ? 'selected' : ''}>NÃO</option>
                    <option value="true" ${data.maint_garantia ? 'selected' : ''}>SIM</option>
                </select>
            </div>

            <div class="v-card-maint-garantia-extra" style="display: ${data.maint_garantia ? 'block' : 'none'};">
                <label style="font-size: 0.65rem; font-weight: 800; color: #475569; text-transform: uppercase;">Meses Garantia</label>
                <input type="number" class="v-item-maint-meses-garantia" min="1" placeholder="Ex: 3" value="${data.maint_meses_garantia || ''}" style="width: 100%; height: 36px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.78rem; font-weight: 700; color: #0f172a; padding: 0 0.5rem;">
            </div>
        </div>
    `;

    container.appendChild(card);
    if (window.lucide) lucide.createIcons();

    updateVendaItemsCount();
    calculateVendaTotal();

    if (shouldFocus) {
        setTimeout(() => {
            const input = card.querySelector('.v-item-prod-search');
            if (input) input.focus();
        }, 50);
    }
}
window.addVendaItemRow = addVendaItemRow;

function removeVendaItemCard(rowId) {
    const el = document.getElementById(rowId);
    if (el) {
        el.remove();
        updateVendaItemsCount();
        calculateVendaTotal();

        // Se remover o último, cria um novo em branco para manter a tela amigável
        const container = document.getElementById('v_itens_container');
        if (container && container.querySelectorAll('.v-item-card').length === 0) {
            addVendaItemRow({}, false);
        }
    }
}
window.removeVendaItemCard = removeVendaItemCard;

function updateVendaItemsCount() {
    const cards = document.querySelectorAll('#v_itens_container .v-item-card');
    const badge = document.getElementById('v_items_count_badge');
    if (badge) {
        badge.innerText = `${cards.length} item(s)`;
    }
}
window.updateVendaItemsCount = updateVendaItemsCount;

function updateVendaCardSubtotal(inputEl) {
    const card = inputEl.closest('.v-item-card');
    if (!card) return;
    const qtd = parseFloat(card.querySelector('.v-item-qtd').value) || 0;
    const unit = parseFloat(card.querySelector('.v-item-unit').value) || 0;
    const subtotal = qtd * unit;
    const subtotalEl = card.querySelector('.v-item-subtotal');
    if (subtotalEl) {
        subtotalEl.value = subtotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }
    calculateVendaTotal();
}
window.updateVendaCardSubtotal = updateVendaCardSubtotal;

function setVendaCardLinkType(btnEl, type) {
    const card = btnEl.closest('.v-item-card');
    if (!card) return;
    const btnVeic = card.querySelector('.btn-v-veic');
    const btnPess = card.querySelector('.btn-v-pess');
    const wrapVeic = card.querySelector('.v-item-veic-wrapper');
    const wrapPess = card.querySelector('.v-item-pess-wrapper');

    if (type === 'veiculo') {
        if (btnVeic) {
            btnVeic.style.background = '#059669';
            btnVeic.style.borderColor = '#059669';
            btnVeic.style.color = '#ffffff';
            btnVeic.classList.add('active');
        }
        if (btnPess) {
            btnPess.style.background = '#f1f5f9';
            btnPess.style.borderColor = '#cbd5e1';
            btnPess.style.color = '#64748b';
            btnPess.classList.remove('active');
        }
        if (wrapVeic) wrapVeic.style.display = 'block';
        if (wrapPess) wrapPess.style.display = 'none';
    } else {
        if (btnPess) {
            btnPess.style.background = '#059669';
            btnPess.style.borderColor = '#059669';
            btnPess.style.color = '#ffffff';
            btnPess.classList.add('active');
        }
        if (btnVeic) {
            btnVeic.style.background = '#f1f5f9';
            btnVeic.style.borderColor = '#cbd5e1';
            btnVeic.style.color = '#64748b';
            btnVeic.classList.remove('active');
        }
        if (wrapVeic) wrapVeic.style.display = 'none';
        if (wrapPess) wrapPess.style.display = 'block';
    }
}
window.setVendaCardLinkType = setVendaCardLinkType;

function toggleVendaCardMaint(switchWrap) {
    const card = switchWrap.closest('.v-item-card');
    if (!card) return;
    const track = card.querySelector('.v-maint-switch-track');
    const knob = card.querySelector('.v-maint-switch-knob');
    const label = card.querySelector('.v-maint-switch-label');
    const hidden = card.querySelector('.v-item-maint-active');
    const panel = card.querySelector('.v-item-maint-panel');

    const isCurrentlyActive = hidden.value === 'true';
    const nextActive = !isCurrentlyActive;
    hidden.value = nextActive ? 'true' : 'false';

    if (nextActive) {
        track.style.background = '#059669';
        knob.style.left = '21px';
        label.innerText = 'SIM';
        label.style.color = '#059669';
        panel.style.display = 'grid';
        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Se já tem veículo selecionado e o campo KM estiver vazio, sugere o último KM automaticamente!
        const vehId = card.querySelector('.v-item-veic-id')?.value;
        const kmInput = card.querySelector('.v-item-maint-km');
        if (vehId && kmInput && !kmInput.value) {
            getLatestVehicleKm(vehId).then(km => {
                if (km && !kmInput.value) kmInput.value = window.formatKM(km);
            });
        }
    } else {
        track.style.background = '#cbd5e1';
        knob.style.left = '3px';
        label.innerText = 'NÃO';
        label.style.color = '#64748b';
        panel.style.display = 'none';
    }
}
window.toggleVendaCardMaint = toggleVendaCardMaint;

function handleCardMaintControleChange(selectEl) {
    const card = selectEl.closest('.v-item-card');
    if (!card) return;
    const val = selectEl.value;
    const kmExtra = card.querySelector('.v-card-maint-km-extra');
    const dataExtra = card.querySelector('.v-card-maint-data-extra');
    if (kmExtra) kmExtra.style.display = val === 'KM' ? 'block' : 'none';
    if (dataExtra) dataExtra.style.display = val === 'DATA' ? 'block' : 'none';
}
window.handleCardMaintControleChange = handleCardMaintControleChange;

function handleCardMaintGarantiaChange(selectEl) {
    const card = selectEl.closest('.v-item-card');
    if (!card) return;
    const extra = card.querySelector('.v-card-maint-garantia-extra');
    if (extra) extra.style.display = selectEl.value === 'true' ? 'block' : 'none';
}
window.handleCardMaintGarantiaChange = handleCardMaintGarantiaChange;

// Autocomplete Busca de Produtos no Card
function handleVendaProdSearch(inputEl) {
    const wrapper = inputEl.closest('.autocomplete-wrapper');
    const resultsDiv = wrapper.querySelector('.autocomplete-results');
    const query = (inputEl.value || '').toLowerCase().trim();

    const activeItems = (inventoryData || []).filter(item => item.status !== 'INATIVO');

    const filtered = query.length === 0
        ? activeItems.slice(0, 30)
        : activeItems.filter(item => 
            (item.nome && item.nome.toLowerCase().includes(query)) || 
            (item.ref && item.ref.toLowerCase().includes(query)) ||
            (item.marca && item.marca.toLowerCase().includes(query)) ||
            (item.codigo_barras && item.codigo_barras.toLowerCase().includes(query)) ||
            (item.codigo_interno && item.codigo_interno.toLowerCase().includes(query))
        ).slice(0, 25);

    if (filtered.length === 0) {
        resultsDiv.innerHTML = '<div class="autocomplete-item" style="color: #64748b;">Nenhum produto ativo encontrado</div>';
    } else {
        resultsDiv.innerHTML = filtered.map(item => `
            <div class="autocomplete-item" onclick="selectVendaCardProduct('${item.id}', '${item.nome.replace(/'/g, "\\'")}', '${(item.marca || '').replace(/'/g, "\\'")}', ${parseFloat(item.valor_venda || 0)}, ${parseFloat(item.estoque_atual || 0)}, '${item.unidade || 'UN'}', ${parseFloat(item.valor_custo || 0)}, this)">
                <div>
                    <div style="font-weight: 700; color: #0f172a;">${item.nome} ${item.marca ? `(${item.marca})` : ''}</div>
                    <div style="font-size: 0.7rem; color: #64748b;">Ref: ${item.ref || 'S/R'} | Cód: ${item.codigo_interno || item.codigo_barras || '--'}</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-weight: 800; color: #059669;">R$ ${parseFloat(item.valor_venda || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</div>
                    <div style="font-size: 0.7rem; color: #475569;">Saldo: <b>${item.estoque_atual} ${item.unidade || 'UN'}</b></div>
                </div>
            </div>
        `).join('');
    }
    resultsDiv.style.display = 'block';
}
window.handleVendaProdSearch = handleVendaProdSearch;

function selectVendaCardProduct(id, nome, marca, valVenda, estoqueAtual, unidade, valorCusto, itemEl) {
    if (!itemEl) return;
    const card = itemEl.classList?.contains('v-item-card') ? itemEl : (itemEl.closest ? itemEl.closest('.v-item-card') : null);
    if (!card) return;

    const searchInput = card.querySelector('.v-item-prod-search');
    const hiddenId = card.querySelector('.v-item-prod-id');
    const hiddenNome = card.querySelector('.v-item-prod-nome');
    const hiddenUnidade = card.querySelector('.v-item-prod-unidade');
    const hiddenCusto = card.querySelector('.v-item-prod-custo');
    const stockTag = card.querySelector('.v-item-stock-tag');
    const unitInput = card.querySelector('.v-item-unit');
    const resultsDiv = card.querySelector('.autocomplete-results');

    searchInput.value = `${nome} ${marca ? `(${marca})` : ''}`.trim();
    hiddenId.value = id;
    hiddenNome.value = nome;
    hiddenUnidade.value = unidade;
    hiddenCusto.value = valorCusto || 0;

    if (stockTag) {
        stockTag.innerText = `Estoque: ${estoqueAtual} ${unidade}`;
        stockTag.style.display = 'block';
    }

    if (unitInput) {
        unitInput.value = valVenda;
    }

    if (resultsDiv) {
        resultsDiv.style.display = 'none';
        resultsDiv.innerHTML = '';
    }

    updateVendaCardSubtotal(unitInput);
}
window.selectVendaCardProduct = selectVendaCardProduct;

// =========================================================================
// SCANNER DE CÓDIGO DE BARRAS VIA CÂMERA (HTML5-QRCODE + HAPTIC & AUDIO)
// =========================================================================
let html5QrCodeInstance = null;
let currentScannerTargetCardId = null;
let currentCameraFacing = "environment"; // "environment" (traseira) ou "user" (frontal)
let isScanningActive = false;

async function openBarcodeScanner(targetCardId = null) {
    currentScannerTargetCardId = targetCardId;
    const modal = document.getElementById('barcodeScannerModal');
    if (modal) {
        modal.style.display = 'flex';
        modal.style.zIndex = '20000';
        modal.classList.add('active');
        if (window.lucide) lucide.createIcons();
    }
    const manualInput = document.getElementById('manual_barcode_input');
    if (manualInput) manualInput.value = '';

    await startCameraScanner();
}
window.openBarcodeScanner = openBarcodeScanner;

async function startCameraScanner() {
    const statusEl = document.getElementById('scanner_status_msg');
    try {
        if (statusEl) {
            statusEl.innerText = "Iniciando câmera...";
            statusEl.style.color = "#94a3b8";
        }

        if (html5QrCodeInstance) {
            try {
                await html5QrCodeInstance.stop();
            } catch (e) {}
            html5QrCodeInstance = null;
        }

        if (typeof Html5Qrcode === 'undefined') {
            if (statusEl) {
                statusEl.innerText = "Biblioteca do scanner indisponível. Use 'Tirar Foto' ou digite abaixo.";
                statusEl.style.color = "#ef4444";
            }
            return;
        }

        html5QrCodeInstance = new Html5Qrcode("scanner_reader_container");
        isScanningActive = true;

        const config = {
            fps: 20,
            qrbox: { width: 260, height: 160 },
            aspectRatio: 1.0,
            experimentalFeatures: {
                useBarCodeDetectorIfSupported: true
            }
        };

        const cameraConfig = { facingMode: currentCameraFacing };

        await html5QrCodeInstance.start(
            cameraConfig,
            config,
            (decodedText) => {
                onBarcodeDetected(decodedText);
            },
            () => {
                // frame sem leitura ignorado silenciosamente
            }
        );

        // Garantir atributos no video para iOS WebKit/Safari
        const videoEl = document.querySelector('#scanner_reader_container video');
        if (videoEl) {
            videoEl.setAttribute('playsinline', 'true');
            videoEl.setAttribute('webkit-playsinline', 'true');
            videoEl.muted = true;
            videoEl.style.width = '100%';
            videoEl.style.height = '100%';
            videoEl.style.objectFit = 'cover';
        }

        if (statusEl) {
            statusEl.innerText = "Aponte para o código de barras...";
            statusEl.style.color = "#10b981";
        }
    } catch (err) {
        console.error('Erro ao iniciar câmera para scanner:', err);
        if (statusEl) {
            statusEl.innerText = "Câmera ao vivo indisponível. Toque em 'Tirar Foto da Peça' acima.";
            statusEl.style.color = "#f59e0b";
        }
    }
}
window.startCameraScanner = startCameraScanner;

// Disparar Câmera Nativa em Modo FOTO (Alta Resolução / Macro)
async function triggerBarcodePhotoCapture() {
    if (html5QrCodeInstance && isScanningActive) {
        try {
            await html5QrCodeInstance.stop();
        } catch (e) {}
        isScanningActive = false;
    }
    const fileInput = document.getElementById('barcode_file_input');
    if (fileInput) {
        fileInput.click();
    }
}
window.triggerBarcodePhotoCapture = triggerBarcodePhotoCapture;

// Processar a foto capturada pela câmera nativa
async function handleBarcodeImageUpload(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) {
        // Se o usuário cancelou a foto, reinicia a câmera ao vivo
        await startCameraScanner();
        return;
    }

    const statusEl = document.getElementById('scanner_status_msg');
    if (statusEl) {
        statusEl.innerText = "Analisando foto da peça...";
        statusEl.style.color = "#38bdf8";
    }

    try {
        if (!html5QrCodeInstance) {
            html5QrCodeInstance = new Html5Qrcode("scanner_reader_container");
        }
        
        // Ler código da imagem diretamente via scanFile
        const decodedText = await html5QrCodeInstance.scanFile(file, true);
        if (decodedText) {
            isScanningActive = true;
            onBarcodeDetected(decodedText);
        } else {
            throw new Error("Código não localizado na foto");
        }
    } catch (err) {
        console.warn('Erro ao decodificar código da foto:', err);
        if (statusEl) {
            statusEl.innerText = "Código não detectado na foto. Tente aproximar ou use o campo manual.";
            statusEl.style.color = "#f59e0b";
        }
        setTimeout(() => {
            if (!isScanningActive) startCameraScanner();
        }, 2200);
    } finally {
        event.target.value = '';
    }
}
window.handleBarcodeImageUpload = handleBarcodeImageUpload;

async function toggleCameraFacing() {
    currentCameraFacing = (currentCameraFacing === "environment") ? "user" : "environment";
    await startCameraScanner();
}
window.toggleCameraFacing = toggleCameraFacing;

async function closeBarcodeScanner() {
    isScanningActive = false;
    if (html5QrCodeInstance) {
        try {
            await html5QrCodeInstance.stop();
        } catch (e) {}
        html5QrCodeInstance = null;
    }
    const modal = document.getElementById('barcodeScannerModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
    const fileInput = document.getElementById('barcode_file_input');
    if (fileInput) fileInput.value = '';
}
window.closeBarcodeScanner = closeBarcodeScanner;

function playScanBeep() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, audioCtx.currentTime); // Beep agradável 1200 Hz
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.08);
    } catch (e) {}

    if (navigator.vibrate) {
        try { navigator.vibrate(80); } catch (e) {}
    }
}
window.playScanBeep = playScanBeep;

function onBarcodeDetected(rawCode) {
    if (!isScanningActive) return;
    const code = (rawCode || '').trim();
    if (!code) return;

    // Pausar novas leituras no mesmo scan
    isScanningActive = false;
    playScanBeep();

    const statusEl = document.getElementById('scanner_status_msg');
    if (statusEl) {
        statusEl.innerText = `Lido: ${code} - Processando...`;
        statusEl.style.color = "#10b981";
    }

    // Busca no inventário por codigo_barras, codigo_interno ou ref (case-insensitive)
    const codeLower = code.toLowerCase();
    const item = (inventoryData || []).find(p => 
        (p.codigo_barras && String(p.codigo_barras).toLowerCase() === codeLower) ||
        (p.codigo_interno && String(p.codigo_interno).toLowerCase() === codeLower) ||
        (p.ref && String(p.ref).toLowerCase() === codeLower)
    );

    setTimeout(() => {
        closeBarcodeScanner();
        applyScannedBarcode(code, item);
    }, 250);
}
window.onBarcodeDetected = onBarcodeDetected;

function submitManualBarcode() {
    const input = document.getElementById('manual_barcode_input');
    if (!input) return;
    const code = (input.value || '').trim();
    if (!code) return;
    input.value = '';
    onBarcodeDetected(code);
}
window.submitManualBarcode = submitManualBarcode;

function applyScannedBarcode(code, item) {
    let card = null;

    if (currentScannerTargetCardId) {
        card = document.getElementById(currentScannerTargetCardId);
    }

    if (!card) {
        // Se não foi especificado card, verifica se o último card existente está vazio
        const cards = document.querySelectorAll('#v_itens_container .v-item-card');
        if (cards.length > 0) {
            const lastCard = cards[cards.length - 1];
            const prodId = lastCard.querySelector('.v-item-prod-id')?.value;
            const prodSearch = lastCard.querySelector('.v-item-prod-search')?.value;
            if (!prodId && (!prodSearch || prodSearch.trim() === '')) {
                card = lastCard;
            }
        }
    }

    // Se ainda não encontrou card vazio, cria uma nova linha
    if (!card) {
        addVendaItemRow({}, false);
        const cards = document.querySelectorAll('#v_itens_container .v-item-card');
        card = cards[cards.length - 1];
    }

    if (!card) return;

    if (item) {
        // Encontrou o produto no estoque!
        selectVendaCardProduct(
            item.id,
            item.nome,
            item.marca || '',
            parseFloat(item.valor_venda || 0),
            parseFloat(item.estoque_atual || 0),
            item.unidade || 'UN',
            parseFloat(item.valor_custo || 0),
            card
        );

        // Foca automaticamente no campo de quantidade para confirmação manual
        setTimeout(() => {
            const qtdInput = card.querySelector('.v-item-qtd');
            if (qtdInput) {
                qtdInput.focus();
                qtdInput.select();
            }
        }, 150);
    } else {
        // Produto não encontrado no estoque: preenche o texto da busca com o código lido
        const searchInput = card.querySelector('.v-item-prod-search');
        if (searchInput) {
            searchInput.value = code;
            handleVendaProdSearch(searchInput);
            searchInput.focus();
        }

        if (typeof showAlertModal === 'function') {
            showAlertModal({
                title: 'Código Não Cadastrado',
                message: `O código de barras "${code}" não foi localizado em nenhum produto ativo. O código foi preenchido na busca para você conferir ou cadastrar.`,
                type: 'warning',
                confirmText: 'ENTENDI'
            });
        } else {
            alert(`Nenhum produto cadastrado com o código "${code}". O código foi preenchido na busca.`);
        }
    }
}
window.applyScannedBarcode = applyScannedBarcode;

// Autocomplete Busca de Veículos no Card
function handleVendaCardVehicleSearch(inputEl) {
    const wrapper = inputEl.closest('.autocomplete-wrapper');
    const resultsDiv = wrapper.querySelector('.autocomplete-results');
    const query = (inputEl.value || '').toUpperCase().trim();

    const filtered = query.length === 0
        ? (vehiclesData || []).slice(0, 30)
        : (vehiclesData || []).filter(v => 
            (v.placa && v.placa.toUpperCase().includes(query)) ||
            (v.modelo && v.modelo.toUpperCase().includes(query)) ||
            (v.marca && v.marca.toUpperCase().includes(query))
        ).slice(0, 20);

    if (filtered.length === 0) {
        resultsDiv.innerHTML = '<div class="autocomplete-item" style="color: #64748b;">Nenhum veículo encontrado...</div>';
    } else {
        resultsDiv.innerHTML = filtered.map(v => `
            <div class="autocomplete-item" onclick="selectVendaCardVehicle('${v.id}', '${v.placa}', this)">
                <span style="font-weight: 800; color: #0f172a;">${v.placa}</span>
                <span style="font-size: 0.72rem; color: #64748b;">${v.marca || ''} ${v.modelo || ''}</span>
            </div>
        `).join('');
    }
    resultsDiv.style.display = 'block';
}
window.handleVendaCardVehicleSearch = handleVendaCardVehicleSearch;

function selectVendaCardVehicle(id, placa, itemEl) {
    const card = itemEl.closest('.v-item-card');
    if (!card) return;

    const searchInput = card.querySelector('.v-item-veic-search');
    const hiddenId = card.querySelector('.v-item-veic-id');
    const resultsDiv = card.querySelector('.v-item-veic-wrapper .autocomplete-results');

    searchInput.value = placa;
    hiddenId.value = id;
    resultsDiv.style.display = 'none';
    resultsDiv.innerHTML = '';

    // Sugestão automática de último KM caso esteja vazio
    const kmInput = card.querySelector('.v-item-maint-km');
    if (kmInput && !kmInput.value) {
        getLatestVehicleKm(id).then(km => {
            if (km && !kmInput.value) kmInput.value = window.formatKM(km);
        });
    }
}
window.selectVendaCardVehicle = selectVendaCardVehicle;

// Autocomplete Busca de Condutor/Pessoa no Card
function handleVendaCardDriverSearch(inputEl) {
    const wrapper = inputEl.closest('.autocomplete-wrapper');
    const resultsDiv = wrapper.querySelector('.autocomplete-results');
    const query = (inputEl.value || '').toUpperCase().trim();

    const filtered = query.length === 0
        ? (stockDrivers || []).slice(0, 30)
        : (stockDrivers || []).filter(d => 
            d.nome_completo && d.nome_completo.toUpperCase().includes(query)
        ).slice(0, 20);

    if (filtered.length === 0) {
        resultsDiv.innerHTML = '<div class="autocomplete-item" style="color: #64748b;">Nenhum condutor encontrado...</div>';
    } else {
        resultsDiv.innerHTML = filtered.map(d => `
            <div class="autocomplete-item" onclick="selectVendaCardDriver('${(d.nome_completo || '').replace(/'/g, "\\'")}', this)">
                <span style="font-weight: 700; color: #0f172a;">${d.nome_completo}</span>
            </div>
        `).join('');
    }
    resultsDiv.style.display = 'block';
}
window.handleVendaCardDriverSearch = handleVendaCardDriverSearch;

function selectVendaCardDriver(nome, itemEl) {
    const card = itemEl.closest('.v-item-card');
    if (!card) return;

    const searchInput = card.querySelector('.v-item-pess-search');
    const resultsDiv = card.querySelector('.v-item-pess-wrapper .autocomplete-results');

    searchInput.value = nome;
    resultsDiv.style.display = 'none';
    resultsDiv.innerHTML = '';
}
window.selectVendaCardDriver = selectVendaCardDriver;

// Coletor de itens dos Cards
function collectVendaItemsFromCards() {
    const cards = document.querySelectorAll('#v_itens_container .v-item-card');
    const items = [];

    cards.forEach(card => {
        const prodId = card.querySelector('.v-item-prod-id')?.value;
        const nome = card.querySelector('.v-item-prod-nome')?.value || card.querySelector('.v-item-prod-search')?.value;
        const qtd = parseFloat(card.querySelector('.v-item-qtd')?.value) || 0;
        const unitVal = parseFloat(card.querySelector('.v-item-unit')?.value) || 0;
        const unidade = card.querySelector('.v-item-prod-unidade')?.value || 'UN';
        const valorCusto = parseFloat(card.querySelector('.v-item-prod-custo')?.value) || 0;

        if (!prodId || qtd <= 0) return; // ignora cards em branco vazios

        const btnPess = card.querySelector('.btn-v-pess');
        const isPessoa = btnPess && btnPess.classList.contains('active');
        const vinculoTipo = isPessoa ? 'pessoa' : 'veiculo';
        const vinculoVeiculoId = card.querySelector('.v-item-veic-id')?.value || null;
        const vinculoVeiculoPlaca = card.querySelector('.v-item-veic-search')?.value || '';
        const vinculoPessoa = card.querySelector('.v-item-pess-search')?.value || null;

        const maintControl = card.querySelector('.v-item-maint-active')?.value === 'true';
        const maintTipoId = card.querySelector('.v-item-maint-tipo')?.value || null;
        const maintTipoNome = stockMaintTypes.find(t => t.id === maintTipoId)?.descricao || '';
        const maintAcaoId = card.querySelector('.v-item-maint-acao')?.value || null;
        const maintAcaoNome = stockMaintActions.find(a => a.id === maintAcaoId)?.descricao || '';

        const rawKm = (card.querySelector('.v-item-maint-km')?.value || '').replace(/\D/g, '');
        const maintKm = rawKm ? parseFloat(rawKm) : 0;
        const maintStatus = card.querySelector('.v-item-maint-status')?.value || 'CONCLUIDO';
        const maintControle = card.querySelector('.v-item-maint-controle')?.value || 'NENHUMA';

        const rawIntervaloKm = (card.querySelector('.v-item-maint-intervalo-km')?.value || '').replace(/\D/g, '');
        const maintIntervaloKm = rawIntervaloKm ? parseFloat(rawIntervaloKm) : null;
        const maintIntervaloMeses = parseInt(card.querySelector('.v-item-maint-intervalo-meses')?.value) || null;

        const maintGarantia = card.querySelector('.v-item-maint-garantia')?.value === 'true';
        const maintMesesGarantia = parseInt(card.querySelector('.v-item-maint-meses-garantia')?.value) || null;

        const subtotal = qtd * unitVal;

        items.push({
            produto_id: prodId,
            nome: nome,
            quantidade: qtd,
            valor_unitario: unitVal,
            adjustment: 0,
            subtotal: subtotal,
            unidade: unidade,
            valor_custo: valorCusto,
            desconto_tipo: 'VALOR',
            desconto_valor: 0,
            acrescimo_tipo: 'VALOR',
            acrescimo_valor: 0,
            vinculo_tipo: vinculoTipo,
            vinculo_veiculo_id: vinculoVeiculoId,
            vinculo_veiculo_placa: vinculoVeiculoPlaca,
            vinculo_pessoa: vinculoPessoa,
            maint_control: maintControl,
            maint_tipo_id: maintTipoId,
            maint_tipo_nome: maintTipoNome,
            maint_acao_id: maintAcaoId,
            maint_acao_nome: maintAcaoNome,
            maint_km: maintKm,
            maint_status: maintStatus,
            maint_controle: maintControle,
            maint_intervalo_km: maintIntervaloKm,
            maint_intervalo_meses: maintIntervaloMeses,
            maint_garantia: maintGarantia,
            maint_meses_garantia: maintMesesGarantia
        });
    });

    return items;
}
window.collectVendaItemsFromCards = collectVendaItemsFromCards;

function calculateVendaTotal() {
    const items = collectVendaItemsFromCards();
    const bruteTotal = items.reduce((acc, item) => acc + (item.quantidade * item.valor_unitario), 0);
    const adjustmentTotal = items.reduce((acc, item) => acc + (item.adjustment || 0), 0);
    const finalTotal = items.reduce((acc, item) => acc + item.subtotal, 0);

    lastCalculatedVendaTotal = finalTotal;

    const elBruto = document.getElementById('v_total_bruto');
    const elAjustes = document.getElementById('v_total_ajustes');
    const elLiquido = document.getElementById('v_total_liquido') || document.getElementById('v_total_final');

    if (elBruto) elBruto.innerText = bruteTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    if (elAjustes) elAjustes.innerText = adjustmentTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    if (elLiquido) elLiquido.innerText = finalTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const btnConfirm = document.getElementById('btn_confirm_venda');
    if (btnConfirm) {
        btnConfirm.disabled = items.length === 0;
        btnConfirm.style.opacity = items.length === 0 ? '0.5' : '1';
        btnConfirm.style.cursor = items.length === 0 ? 'not-allowed' : 'pointer';
    }
}
window.calculateVendaTotal = calculateVendaTotal;

async function saveVenda(event) {
    if (event) event.preventDefault();
    vendaItems = collectVendaItemsFromCards();
    if (vendaItems.length === 0) {
        alert('Por favor, informe pelo menos 1 item com produto e quantidade válidos para registrar a saída.');
        return;
    }

    if (typeof canDo === 'function') {
        if (!currentVendaId && !canDo('estoque_vendas', 'add')) {
            alert('Você não possui permissão para registrar novas saídas de estoque.');
            return;
        }
        if (currentVendaId && !canDo('estoque_vendas', 'edit')) {
            alert('Você não possui permissão para editar saídas de estoque.');
            return;
        }
    }

    // Validação: cada item marcado para manutenção deve ter sua própria placa informada
    const itemSemVeiculo = vendaItems.find(i => i.maint_control && !i.vinculo_veiculo_id);
    if (itemSemVeiculo) {
        alert(`O item "${itemSemVeiculo.nome}" está marcado para "Controlar Manutenção", mas nenhuma placa foi vinculada a ele.\n\nPor favor, informe a placa do veículo no card do item.`);
        return;
    }

    const tipo = document.getElementById('v_tipo').value;
    const veiculoId = document.getElementById('v_veiculo_id').value;
    const veiculo = vehiclesData.find(v => v.id === veiculoId);
    const dataVenda = document.getElementById('v_data_venda').value;

    const totalAjuste = vendaItems.reduce((acc, i) => acc + i.adjustment, 0);

    // Se o cabeçalho não tem veículo geral, usa a placa do primeiro item vinculado como referência
    const fallbackPlaca = (vendaItems.find(i => i.vinculo_veiculo_placa)?.vinculo_veiculo_placa) || null;
    const fallbackVeicId = (vendaItems.find(i => i.vinculo_veiculo_id)?.vinculo_veiculo_id) || null;

    const vendaObj = {
        tipo: tipo,
        data: dataVenda + 'T12:00:00Z', // Use midday to avoid timezone shifts
        veiculo_id: veiculoId || fallbackVeicId,
        placa: veiculo ? veiculo.placa : fallbackPlaca,
        os_id: document.getElementById('v_os_id').value || null,
        cliente_nome: document.getElementById('v_cliente_nome').value.trim() || 'Consumidor Final',
        valor_bruto: vendaItems.reduce((acc, i) => acc + (i.quantidade * i.valor_unitario), 0),
        desconto_tipo: 'VALOR',
        desconto_valor: totalAjuste < 0 ? Math.abs(totalAjuste) : 0,
        acrescimo_tipo: 'VALOR',
        acrescimo_valor: totalAjuste > 0 ? totalAjuste : 0,
        valor_total: lastCalculatedVendaTotal,
        status_pagamento: tipo === 'EXTERNA' ? document.getElementById('v_status_pagamento').value : 'PAGO',
        data_pagamento: tipo === 'EXTERNA' ? (document.getElementById('v_data_pagamento').value || null) : new Date().toISOString(),
        observacoes: document.getElementById('v_observacoes').value,
        plano_contas_codigo: '04.018.0091',
        plano_contas_nome: 'SAIDAS DE ESTOQUE'
    };

    try {
        let existingVenda = null;
        let oldItems = [];

        if (currentVendaId) {
            // 0. Buscar a venda atual para garantir o código correto da venda
            const { data: vOld } = await supabaseClient.from('vendas').select('*').eq('id', currentVendaId).single();
            existingVenda = vOld;

            // 1. Buscar itens antigos: primeiro em venda_itens
            const { data: viData, error: oldErr } = await supabaseClient.from('venda_itens').select('*').eq('venda_id', currentVendaId);
            if (oldErr) throw oldErr;
            if (viData && viData.length > 0) {
                oldItems = viData;
            } else {
                // Fallback: se venda_itens estava vazia, recuperar do histórico de movimentações
                const searchCod = existingVenda ? existingVenda.codigo : currentVendaId;
                const { data: hItens } = await supabaseClient
                    .from('estoque_movimentacoes')
                    .select('*')
                    .ilike('motivo', `%VENDA: ${searchCod}%`)
                    .eq('tipo', 'SAIDA');
                if (hItens && hItens.length > 0) {
                    oldItems = hItens.map(h => ({
                        produto_id: h.item_id,
                        quantidade: h.quantidade,
                        valor_unitario: h.valor_unitario
                    }));
                }
            }

            // 2. Reverter (devolver) o saldo em estoque de TODOS os itens antigos
            for (const old of oldItems) {
                const { data: prod } = await supabaseClient.from('estoque').select('estoque_atual').eq('id', old.produto_id).single();
                if (prod) {
                    const currentBalance = parseFloat(prod.estoque_atual || 0);
                    const qtyToReturn = parseFloat(old.quantidade || 0);
                    await supabaseClient.from('estoque')
                        .update({ estoque_atual: currentBalance + qtyToReturn })
                        .eq('id', old.produto_id);
                }
            }

            // 3. Registrar histórico de ESTORNO explícito para itens removidos ou com quantidade reduzida
            const oldQtyMap = {};
            const oldPriceMap = {};
            for (const old of oldItems) {
                if (old.produto_id) {
                    oldQtyMap[old.produto_id] = (oldQtyMap[old.produto_id] || 0) + parseFloat(old.quantidade || 0);
                    if (old.valor_unitario) oldPriceMap[old.produto_id] = old.valor_unitario;
                }
            }

            const newQtyMap = {};
            for (const it of vendaItems) {
                if (it.produto_id) {
                    newQtyMap[it.produto_id] = (newQtyMap[it.produto_id] || 0) + parseFloat(it.quantidade || 0);
                }
            }

            const userEmail = getCurrentUserEmail();
            for (const prodId of Object.keys(oldQtyMap)) {
                const oQty = oldQtyMap[prodId] || 0;
                const nQty = newQtyMap[prodId] || 0;
                if (oQty > nQty) {
                    const diffEstorno = oQty - nQty;
                    const codRef = existingVenda ? existingVenda.codigo : currentVendaId;
                    const motivoEstorno = nQty === 0 
                        ? `ESTORNO DE VENDA: ${codRef} (ITEM EXCLUÍDO NA EDIÇÃO)`
                        : `ESTORNO DE VENDA: ${codRef} (QTD REDUZIDA NA EDIÇÃO: -${diffEstorno})`;
                    
                    await supabaseClient.from('estoque_movimentacoes').insert([{
                        item_id: prodId,
                        tipo: 'ESTORNO',
                        quantidade: diffEstorno,
                        valor_unitario: oldPriceMap[prodId] || 0,
                        motivo: motivoEstorno,
                        responsavel: userEmail ? `${userEmail} (EDIÇÃO)` : 'SISTEMA (EDIÇÃO)',
                        data: new Date().toISOString()
                    }]);
                }
            }

            // 4. Limpar movimentações antigas do tipo SAIDA desta venda
            if (existingVenda) {
                await supabaseClient.from('estoque_movimentacoes')
                    .delete()
                    .ilike('motivo', `%VENDA: ${existingVenda.codigo}%`)
                    .eq('tipo', 'SAIDA');
            }

            // 5. Deletar registros antigos em venda_itens
            await supabaseClient.from('venda_itens').delete().eq('venda_id', currentVendaId);

            // 6. Atualizar registro da venda
            let { data: vData, error: vErr } = await supabaseClient
                .from('vendas')
                .update(vendaObj)
                .eq('id', currentVendaId)
                .select();
                
            if (vErr && (vErr.message.includes('plano_contas_codigo') || vErr.message.includes('plano_contas_nome') || vErr.code === 'PGRST204')) {
                delete vendaObj.plano_contas_codigo;
                delete vendaObj.plano_contas_nome;
                const retryRes = await supabaseClient
                    .from('vendas')
                    .update(vendaObj)
                    .eq('id', currentVendaId)
                    .select();
                vErr = retryRes.error;
                vData = retryRes.data;
            }
            if (vErr) throw vErr;
            newVenda = vData[0];
        } else {
            // Criar Nova Venda
            let { data: vData, error: vErr } = await supabaseClient
                .from('vendas')
                .insert([vendaObj])
                .select();

            if (vErr && (vErr.message.includes('plano_contas_codigo') || vErr.message.includes('plano_contas_nome') || vErr.code === 'PGRST204')) {
                delete vendaObj.plano_contas_codigo;
                delete vendaObj.plano_contas_nome;
                const retryRes = await supabaseClient
                    .from('vendas')
                    .insert([vendaObj])
                    .select();
                vErr = retryRes.error;
                vData = retryRes.data;
            }
            if (vErr) throw vErr;
            newVenda = vData[0];
        }

        // Criar Novos Itens e Atualizar Saldo do Estoque
        for (const item of vendaItems) {
            // Item da Venda com metadados de manutenção
            const itemPayload = {
                venda_id: newVenda.id,
                produto_id: item.produto_id,
                quantidade: item.quantidade,
                valor_unitario: item.valor_unitario,
                subtotal: item.subtotal,
                vinculo_tipo: item.vinculo_tipo || 'veiculo',
                vinculo_veiculo_id: item.vinculo_veiculo_id || null,
                vinculo_pessoa: item.vinculo_pessoa || null,
                maint_control: !!item.maint_control,
                maint_tipo_id: item.maint_tipo_id || null,
                maint_acao_id: item.maint_acao_id || null,
                maint_km: item.maint_km || null,
                maint_status: item.maint_status || 'CONCLUIDO',
                maint_controle: item.maint_controle || 'NENHUMA',
                maint_intervalo_km: item.maint_intervalo_km || null,
                maint_intervalo_meses: item.maint_intervalo_meses || null,
                maint_garantia: !!item.maint_garantia,
                maint_meses_garantia: item.maint_meses_garantia || null
            };

            let { error: itemErr } = await supabaseClient.from('venda_itens').insert([itemPayload]);
            if (itemErr) {
                console.warn("Aviso ao inserir item em venda_itens, tentando fallback básico:", itemErr);
                delete itemPayload.vinculo_tipo;
                delete itemPayload.vinculo_veiculo_id;
                delete itemPayload.vinculo_pessoa;
                delete itemPayload.maint_control;
                delete itemPayload.maint_tipo_id;
                delete itemPayload.maint_acao_id;
                delete itemPayload.maint_km;
                delete itemPayload.maint_status;
                delete itemPayload.maint_controle;
                delete itemPayload.maint_intervalo_km;
                delete itemPayload.maint_intervalo_meses;
                delete itemPayload.maint_garantia;
                delete itemPayload.maint_meses_garantia;
                await supabaseClient.from('venda_itens').insert([itemPayload]);
            }

            // Inserir Movimentação de Saída para o item
            const userEmail = getCurrentUserEmail();
            const moveObj = {
                item_id: item.produto_id,
                tipo: 'SAIDA',
                quantidade: item.quantidade,
                valor_unitario: item.valor_unitario,
                lucro: (item.valor_unitario - item.valor_custo) * item.quantidade + item.adjustment,
                motivo: `SAÍDA: ${tipo}${tipo === 'SIMPLES' && vendaObj.placa ? ' - PLACA: ' + vendaObj.placa : (tipo === 'OS' && vendaObj.os_id ? ' - OS: #' + vendaObj.os_id : (tipo === 'EXTERNA' && vendaObj.cliente_nome ? ' - CLIENTE: ' + vendaObj.cliente_nome : ''))} | VENDA: ${newVenda.codigo}${currentVendaId ? ' (EDITADO)' : ''}`,
                responsavel: userEmail || 'SISTEMA',
                data: dataVenda + 'T12:00:00Z',
                plano_contas_codigo: '04.018.0091',
                plano_contas_nome: 'SAIDAS DE ESTOQUE'
            };

            let { error: moveErr } = await supabaseClient.from('estoque_movimentacoes').insert([moveObj]);
            if (moveErr && (moveErr.message.includes('plano_contas_codigo') || moveErr.message.includes('plano_contas_nome') || moveErr.code === 'PGRST204')) {
                delete moveObj.plano_contas_codigo;
                delete moveObj.plano_contas_nome;
                await supabaseClient.from('estoque_movimentacoes').insert([moveObj]);
            }

            // Atualizar Saldo Final no Estoque
            const { data: pReal } = await supabaseClient.from('estoque').select('estoque_atual').eq('id', item.produto_id).single();
            if (pReal) {
                await supabaseClient.from('estoque')
                    .update({ estoque_atual: (pReal.estoque_atual || 0) - item.quantidade })
                    .eq('id', item.produto_id);
            }
        }

        // Se estiver editando, limpa manutenções antigas vinculadas a esta venda
        if (currentVendaId) {
            try {
                const { data: oldMaintItems } = await supabaseClient
                    .from('manutencao_itens')
                    .select('id, manutencao_id')
                    .ilike('descricao', `%[ID:VENDA-${newVenda.codigo}]%`);
                if (oldMaintItems && oldMaintItems.length > 0) {
                    const mIds = [...new Set(oldMaintItems.map(i => i.manutencao_id))];
                    await supabaseClient.from('manutencao_itens').delete().in('id', oldMaintItems.map(i => i.id));
                    for (const mId of mIds) {
                        const { data: remaining } = await supabaseClient.from('manutencao_itens').select('id').eq('manutencao_id', mId).limit(1);
                        if (!remaining || remaining.length === 0) {
                            await supabaseClient.from('manutencoes').delete().eq('id', mId);
                        }
                    }
                }
            } catch (cleanErr) {
                console.warn("Aviso ao limpar manutenções anteriores na edição:", cleanErr);
            }
        }

        // 3. Sincronização com o Módulo de Manutenção
        const maintItemsToSync = vendaItems.filter(i => i.maint_control);
        if (maintItemsToSync.length > 0) {
            console.log(`🛠️ Sincronizando ${maintItemsToSync.length} item(ns) com Manutenção...`);
            for (const it of maintItemsToSync) {
                try {
                    // O veículo de manutenção é estritamente o veículo selecionado para este item
                    const targetVehId = it.vinculo_veiculo_id;
                    if (!targetVehId) {
                        console.warn("⚠️ Item com controle de manutenção sem veículo vinculado:", it.nome);
                        continue;
                    }

                    const currentKm = parseFloat(it.maint_km) || 0;
                    const intervalKm = parseFloat(it.maint_intervalo_km) || 0;
                    const intervalMonths = parseInt(it.maint_intervalo_meses) || 0;
                    const warrantyMonths = parseInt(it.maint_meses_garantia) || 0;

                    const proxima_troca_km = it.maint_controle === 'KM' ? (currentKm + intervalKm) : null;
                    let proxima_troca_data = null;
                    if (it.maint_controle === 'DATA' && intervalMonths > 0) {
                        const baseDate = new Date(dataVenda);
                        baseDate.setMonth(baseDate.getMonth() + intervalMonths);
                        proxima_troca_data = baseDate.toISOString().split('T')[0];
                    }

                    let vencimento_garantia = null;
                    if (it.maint_garantia && warrantyMonths > 0) {
                        const baseDate = new Date(dataVenda);
                        baseDate.setMonth(baseDate.getMonth() + warrantyMonths);
                        vencimento_garantia = baseDate.toISOString().split('T')[0];
                    }

                    // Cabeçalho manutencoes
                    const maintPayload = {
                        veiculo_id: targetVehId,
                        tipo_id: it.maint_tipo_id || null,
                        data: dataVenda,
                        km_atual: currentKm,
                        status: it.maint_status || 'CONCLUIDO',
                        descricao_servico: `Aplicação de Estoque [ID:VENDA-${newVenda.codigo}]`,
                        observacoes: `Saída de estoque registrada via Módulo de Estoque (Venda #${newVenda.codigo}). Responsável: ${userEmail || 'SISTEMA'}`,
                        empresa_id: window.currentEmpresaId || null
                    };

                    const { data: newMaint, error: maintError } = await supabaseClient.from('manutencoes').insert([maintPayload]).select().single();
                    if (maintError) {
                        console.error("❌ Erro ao criar cabeçalho de manutenção:", maintError);
                        continue;
                    }

                    // Detalhe manutencao_itens
                    if (newMaint) {
                        const itemMaintPayload = {
                            manutencao_id: newMaint.id,
                            acao_id: it.maint_acao_id || null,
                            descricao: `[ID:VENDA-${newVenda.codigo}] ${it.nome}`,
                            quantidade: parseFloat(it.quantidade) || 1,
                            valor_pecas: parseFloat(it.subtotal || (it.quantidade * it.valor_unitario)) || 0,
                            valor_servicos: 0,
                            possui_garantia: !!it.maint_garantia,
                            meses_garantia: warrantyMonths || null,
                            vencimento_garantia: vencimento_garantia,
                            origem_garantia: 'ESTOQUE',
                            controle_proxima_troca: it.maint_controle || 'NENHUMA',
                            intervalo_km: intervalKm || null,
                            intervalo_meses: intervalMonths || null,
                            proxima_troca_km: proxima_troca_km,
                            proxima_troca_data: proxima_troca_data
                        };

                        let { error: itemError } = await supabaseClient.from('manutencao_itens').insert([itemMaintPayload]);
                        if (itemError && itemError.message && (itemError.message.includes('quantidade') || itemError.message.includes('schema cache'))) {
                            delete itemMaintPayload.quantidade;
                            const retryRes = await supabaseClient.from('manutencao_itens').insert([itemMaintPayload]);
                            itemError = retryRes.error;
                        }
                        if (itemError) {
                            console.error("❌ Erro ao criar detalhe de manutenção:", itemError);
                        }
                    }
                } catch (syncEx) {
                    console.error("❌ Erro inesperado ao sincronizar manutenção da venda:", syncEx);
                }
            }
        }

        const descItens = vendaItems.map(i => `${i.nome} (Qtd: ${i.quantidade})`).join(', ');
        const detalheComplemento = vendaObj.placa ? ` - Veículo: ${vendaObj.placa}` : (vendaObj.os_id ? ` - OS: #${vendaObj.os_id}` : (vendaObj.cliente_nome ? ` - Cliente: ${vendaObj.cliente_nome}` : ''));

        if (currentVendaId) {
            logEstoque('ALTERAÇÃO', `DETALHE: Editou saída de estoque [${newVenda.codigo}] (${tipo}): ${descItens} - Valor Total: R$ ${vendaObj.valor_total.toFixed(2)}${detalheComplemento}`);
        } else {
            logEstoque('INCLUSÃO', `DETALHE: Registrou nova saída de estoque [${newVenda.codigo}] (${tipo}): ${descItens} - Valor Total: R$ ${vendaObj.valor_total.toFixed(2)}${detalheComplemento}`);
        }

        alert(currentVendaId ? 'Venda atualizada com sucesso!' : `Saída registrada com sucesso! Código: ${newVenda.codigo}`);
        closeVendaModal();
        currentVendaId = null;
        await loadInventory();
        if (typeof loadHistory === 'function') await loadHistory(true);

    } catch (err) {
        console.error('Erro ao salvar venda:', err);
        alert('Erro ao processar venda: ' + err.message);
    }
}

// --- Logic for Receipt Modal ---

async function openReceiptModal(vendaCodigo) {
    if (!vendaCodigo) return;
    
    try {
        // 1. Buscar Venda pelo Código
        const { data: vendaData, error: vendaErr } = await supabaseClient
            .from('vendas')
            .select('*')
            .eq('codigo', vendaCodigo)
            .single();
            
        if (vendaErr) throw vendaErr;
        
        // 2. Buscar Itens da Venda
        let { data: itens, error: itensErr } = await supabaseClient
            .from('venda_itens')
            .select(`
                *,
                estoque (nome, unidade)
            `)
            .eq('venda_id', vendaData.id);
            
        if (itensErr) throw itensErr;

        if (!itens || itens.length === 0) {
            console.log('Recibo: Itens não encontrados em venda_itens, buscando no histórico...');
            const { data: hItens } = await supabaseClient
                .from('estoque_movimentacoes')
                .select('*, estoque(nome, unidade)')
                .ilike('motivo', `%VENDA: ${vendaCodigo}%`)
                .eq('tipo', 'SAIDA');
            
            if (hItens && hItens.length > 0) {
                itens = hItens.map(h => ({
                    ...h,
                    produto_id: h.item_id,
                    subtotal: h.quantidade * h.valor_unitario
                }));
            }
        }
        
        // 3. Popular Modal
        document.getElementById('receipt_codigo').innerText = vendaData.codigo;
        document.getElementById('receipt_data').innerText = new Date(vendaData.data).toLocaleDateString('pt-BR');
        document.getElementById('receipt_tipo').innerText = `SAÍDA: ${vendaData.tipo}`;
        
        let clienteText = 'Consumidor Final';
        if (vendaData.tipo === 'SIMPLES' && vendaData.placa) clienteText = `Veículo: ${vendaData.placa}`;
        else if (vendaData.tipo === 'OS') clienteText = `Ordem de Serviço: ${vendaData.os_id}`;
        else if (vendaData.tipo === 'EXTERNA') clienteText = vendaData.cliente_nome || 'Consumidor Final';
        
        document.getElementById('receipt_cliente').innerText = clienteText;
        
        const tbody = document.getElementById('receipt_items');
        tbody.innerHTML = itens.map(item => `
            <tr>
                <td>${item.estoque?.nome || 'Item'}</td>
                <td style="text-align: center;">${item.quantidade} ${item.estoque?.unidade || ''}</td>
                <td style="text-align: right;">R$ ${item.subtotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
            </tr>
        `).join('');
        
        document.getElementById('receipt_subtotal').innerText = `R$ ${vendaData.valor_bruto.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        
        const discount = vendaData.desconto_valor || 0;
        const increase = vendaData.acrescimo_valor || 0;
        
        document.getElementById('receipt_discount_row').style.display = discount > 0 ? 'flex' : 'none';
        document.getElementById('receipt_discount').innerText = `- R$ ${discount.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        
        document.getElementById('receipt_increase_row').style.display = increase > 0 ? 'flex' : 'none';
        document.getElementById('receipt_increase').innerText = `+ R$ ${increase.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        
        document.getElementById('receipt_total').innerText = `R$ ${vendaData.valor_total.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        
        document.getElementById('receipt_responsavel').innerText = `Vendedor: Sistema`;
        
        // Configurar botões de edição e exclusão conforme matriz de permissões
        const btnEditSale = document.getElementById('btn_edit_sale');
        if (btnEditSale) {
            btnEditSale.onclick = () => editSale(vendaData.id);
            if (typeof canDo === 'function' && !canDo('estoque_vendas', 'edit')) btnEditSale.style.display = 'none';
            else btnEditSale.style.display = '';
        }
        const btnDeleteSale = document.getElementById('btn_delete_sale');
        if (btnDeleteSale) {
            btnDeleteSale.onclick = () => deleteSale(vendaData.id);
            if (typeof canDo === 'function' && !canDo('estoque_vendas', 'delete')) btnDeleteSale.style.display = 'none';
            else btnDeleteSale.style.display = '';
        }

        document.getElementById('receiptModal').classList.add('active');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (err) {
        console.error('Erro ao abrir recibo:', err);
        alert('Erro ao carregar dados do recibo.');
    }
}

async function deleteSale(vendaId) {
    if (typeof canDo === 'function' && !canDo('estoque_vendas', 'delete')) {
        alert('Você não possui permissão para cancelar/excluir saídas de estoque.');
        return;
    }
    if (!confirm('AVISO: Esta venda será marcada como CANCELADA. O estoque será revertido e um registro de ESTORNO será adicionado ao histórico para auditoria. Deseja continuar?')) return;

    try {
        // 1. Buscar dados da venda
        const { data: venda, error: vErr } = await supabaseClient.from('vendas').select('*').eq('id', vendaId).single();
        if (vErr) throw vErr;

        if (venda.status === 'CANCELADA') {
            alert('Esta venda já está cancelada.');
            return;
        }

        // 2. Buscar itens da venda
        let { data: itens, error: itensErr } = await supabaseClient
            .from('venda_itens')
            .select('*, estoque(nome, unidade)')
            .eq('venda_id', vendaId);

        if (itensErr) throw itensErr;

        // Fallback para itens via histórico caso venda_itens esteja vazia
        if (!itens || itens.length === 0) {
            console.log('Cancelamento: Itens não encontrados em venda_itens, buscando no histórico...');
            const { data: hItens } = await supabaseClient
                .from('estoque_movimentacoes')
                .select('*')
                .ilike('motivo', `%VENDA: ${venda.codigo}%`)
                .eq('tipo', 'SAIDA');
            
            if (hItens && hItens.length > 0) {
                itens = hItens.map(h => ({
                    produto_id: h.item_id,
                    quantidade: h.quantidade,
                    valor_unitario: h.valor_unitario
                }));
            }
        }

        if (!itens || itens.length === 0) {
            alert('Não foi possível localizar os itens desta venda para realizar o estorno.');
            return;
        }

        // 3. Reverter Estoque e Gerar Movimentações de Estorno
        for (const item of itens) {
            // A. Buscar saldo atual
            const { data: prod } = await supabaseClient.from('estoque').select('estoque_atual').eq('id', item.produto_id).single();
            if (prod) {
                const currentBalance = parseFloat(prod.estoque_atual || 0);
                const qtyToReturn = parseFloat(item.quantidade || 0);
                
                // B. Atualizar Saldo no Estoque
                await supabaseClient.from('estoque')
                    .update({ estoque_atual: currentBalance + qtyToReturn })
                    .eq('id', item.produto_id);

                const userEmail = getCurrentUserEmail();
                // C. Criar Registro de ESTORNO no histórico (Auditoria)
                await supabaseClient.from('estoque_movimentacoes').insert([{
                    item_id: item.produto_id,
                    tipo: 'ESTORNO',
                    quantidade: qtyToReturn,
                    valor_unitario: item.valor_unitario,
                    motivo: `ESTORNO DE VENDA: ${venda.codigo} (CANCELAMENTO)`,
                    responsavel: userEmail ? `${userEmail} (CANCELAMENTO)` : 'SISTEMA (CANCELAMENTO)',
                    data: venda.data
                }]);
            }
        }

        // 4. Atualizar motivos das movimentações originais para indicar cancelamento
        await supabaseClient.from('estoque_movimentacoes')
            .update({ motivo: `[CANCELADA] VENDA: ${venda.codigo}` })
            .ilike('motivo', `%VENDA: ${venda.codigo}%`)
            .not('tipo', 'eq', 'ESTORNO'); // Não atualizar os estornos que acabamos de criar

        // 5. Marcar Venda como CANCELADA
        // Nota: Certifique-se de ter rodado o SQL para adicionar a coluna 'status'
        const { error: updateErr } = await supabaseClient
            .from('vendas')
            .update({ status: 'CANCELADA' })
            .eq('id', vendaId);

        if (updateErr) {
            console.error('Erro ao atualizar status da venda:', updateErr);
            alert('Venda cancelada no estoque, mas houve um erro ao atualizar o status para CANCELADA. Verifique se a coluna "status" existe no banco.');
        } else {
            logEstoque('EXCLUSÃO', `DETALHE: Cancelou saída de estoque [${venda.codigo}] - Estoque revertido para os produtos e venda marcada como CANCELADA.`);
            alert('Venda cancelada e estoque revertido com sucesso! O registro de auditoria foi mantido.');
        }

        // 6. Limpar manutenções vinculadas a esta venda
        try {
            const { data: linkedMaintItems } = await supabaseClient
                .from('manutencao_itens')
                .select('id, manutencao_id')
                .ilike('descricao', `%[ID:VENDA-${venda.codigo}]%`);

            if (linkedMaintItems && linkedMaintItems.length > 0) {
                const maintIds = [...new Set(linkedMaintItems.map(i => i.manutencao_id))];
                await supabaseClient.from('manutencao_itens').delete().in('id', linkedMaintItems.map(i => i.id));
                for (const mId of maintIds) {
                    const { data: remaining } = await supabaseClient.from('manutencao_itens').select('id').eq('manutencao_id', mId).limit(1);
                    if (!remaining || remaining.length === 0) {
                        await supabaseClient.from('manutencoes').delete().eq('id', mId);
                    }
                }
                console.log(`🧹 ${linkedMaintItems.length} item(ns) de manutenção cancelados junto com a venda.`);
            }
        } catch (cleanMaintErr) {
            console.warn("Aviso ao limpar manutenções da venda cancelada:", cleanMaintErr);
        }

        closeReceiptModal();
        
        // Atualizar interface
        await loadInventory();
        if (typeof loadHistory === 'function') await loadHistory(true);
    } catch (err) {
        console.error('Erro ao cancelar venda:', err);
        alert('Erro ao processar o cancelamento: ' + err.message);
    }
}

async function editSaleByCodigo(vendaCodigo) {
    if (!vendaCodigo) return;
    try {
        console.log('Buscando ID para código:', vendaCodigo);
        const { data, error } = await supabaseClient
            .from('vendas')
            .select('id')
            .eq('codigo', vendaCodigo);
            
        if (error) throw error;
        if (!data || data.length === 0) {
            alert('Venda não encontrada ou já foi excluída.');
            return;
        }
        
        await editSale(data[0].id);
    } catch (err) {
        console.error('Erro ao abrir edição por código:', err);
    }
}

async function editSale(vendaId) {
    if (typeof canDo === 'function' && !canDo('estoque_vendas', 'edit')) {
        alert('Você não possui permissão para editar saídas de estoque.');
        return;
    }
    console.log('--- Iniciando edição da venda ---');
    console.log('Venda ID:', vendaId);
    
    try {
        // 1. Buscar dados da venda
        const { data: venda, error: vErr } = await supabaseClient.from('vendas').select('*').eq('id', vendaId).single();
        if (vErr) throw vErr;
        console.log('Venda encontrada:', venda.codigo);

        // 2. Buscar itens da venda (sem join primeiro para garantir)
        let { data: itensRaw, error: iErr } = await supabaseClient
            .from('venda_itens')
            .select('*')
            .eq('venda_id', vendaId);
        
        if (iErr) throw iErr;
        console.log(`Itens brutos para venda ${vendaId}:`, itensRaw);

        if (!itensRaw || itensRaw.length === 0) {
            console.warn('Nenhum item encontrado para esta venda no banco. Tentando buscar pelo código da venda como fallback...');
            // Fallback: tentar buscar itens se por algum motivo o venda_id não bateu mas o código da venda sim
            const { data: fallbackItens } = await supabaseClient
                .from('venda_itens')
                .select('*')
                .eq('venda_id', venda.id); // venda.id deve ser o mesmo que vendaId, mas por segurança
            
            if (fallbackItens && fallbackItens.length > 0) {
                console.log('Itens encontrados via fallback (venda_id)!');
                itensRaw = fallbackItens;
            } else {
                console.log('Tentando recuperar itens do histórico de movimentações (estoque_movimentacoes)...');
                const { data: historyItens, error: hErr } = await supabaseClient
                    .from('estoque_movimentacoes')
                    .select('*, estoque(nome, unidade, valor_custo)')
                    .ilike('motivo', `%VENDA: ${venda.codigo}%`)
                    .eq('tipo', 'SAIDA');
                
                if (!hErr && historyItens && historyItens.length > 0) {
                    console.log(`Recuperados ${historyItens.length} itens do histórico.`);
                    // Mapear movimentações para o formato de itensRaw
                    itensRaw = historyItens.map(h => ({
                        produto_id: h.item_id,
                        quantidade: h.quantidade,
                        valor_unitario: h.valor_unitario,
                        subtotal: h.quantidade * h.valor_unitario, // Estimado se não houver ajustes
                        desconto_valor: 0,
                        acrescimo_valor: 0
                    }));
                }
            }
        }

        // 3. Abrir Modal de Venda (Aguardando veículos)
        await openVendaModal();
        currentVendaId = vendaId;

        // 4. Mapear itens buscando nomes no inventoryData ou no banco se necessário
        vendaItems = [];
        for (const item of itensRaw) {
            // Tentar achar no inventoryData carregado
            let prodInfo = inventoryData.find(p => p.id === item.produto_id);
            
            // Se não achar no cache, busca rápido no banco
            if (!prodInfo) {
                const { data: pData } = await supabaseClient.from('estoque').select('nome, unidade, valor_custo').eq('id', item.produto_id).single();
                prodInfo = pData;
            }

            const veh = item.vinculo_veiculo_id ? vehiclesData.find(v => v.id === item.vinculo_veiculo_id) : (venda.veiculo_id ? vehiclesData.find(v => v.id === venda.veiculo_id) : null);
            const vehPlaca = veh ? veh.placa : (venda.placa || '');

            vendaItems.push({
                produto_id: item.produto_id,
                nome: prodInfo?.nome || 'Produto Removido',
                quantidade: item.quantidade,
                valor_unitario: item.valor_unitario,
                adjustment: (item.subtotal - (item.quantidade * item.valor_unitario)) || 0,
                subtotal: item.subtotal,
                unidade: prodInfo?.unidade || 'UN',
                valor_custo: prodInfo?.valor_custo || 0,
                desconto_tipo: item.desconto_tipo || 'VALOR',
                desconto_valor: item.desconto_valor || 0,
                acrescimo_tipo: item.acrescimo_tipo || 'VALOR',
                acrescimo_valor: item.acrescimo_valor || 0,
                vinculo_tipo: item.vinculo_tipo || 'veiculo',
                vinculo_veiculo_id: item.vinculo_veiculo_id || null,
                vinculo_veiculo_placa: vehPlaca,
                vinculo_pessoa: item.vinculo_pessoa || '',
                maint_control: !!item.maint_control,
                maint_tipo_id: item.maint_tipo_id || null,
                maint_tipo_nome: stockMaintTypes.find(t => t.id === item.maint_tipo_id)?.descricao || '',
                maint_acao_id: item.maint_acao_id || null,
                maint_acao_nome: stockMaintActions.find(a => a.id === item.maint_acao_id)?.descricao || '',
                maint_km: item.maint_km || null,
                maint_status: item.maint_status || 'CONCLUIDO',
                maint_controle: item.maint_controle || 'NENHUMA',
                maint_intervalo_km: item.maint_intervalo_km || null,
                maint_intervalo_meses: item.maint_intervalo_meses || null,
                maint_garantia: !!item.maint_garantia,
                maint_meses_garantia: item.maint_meses_garantia || null
            });
        }

        console.log('vendaItems populado:', vendaItems.length);

        // Renderizar cards de itens
        const container = document.getElementById('v_itens_container');
        if (container) container.innerHTML = '';
        if (vendaItems.length > 0) {
            vendaItems.forEach(it => addVendaItemRow(it, false));
        } else {
            addVendaItemRow({}, false);
        }
        
        // 5. Preencher campos do cabeçalho
        document.getElementById('v_tipo').value = venda.tipo;
        toggleVendaTypeFields();
        
        setTimeout(() => {
            if (venda.tipo === 'SIMPLES') {
                document.getElementById('v_veiculo_id').value = venda.veiculo_id || '';
            } else if (venda.tipo === 'OS') {
                document.getElementById('v_os_id').value = venda.os_id || '';
            } else if (venda.tipo === 'EXTERNA') {
                const input = document.getElementById('v_cliente_nome');
                if (input) {
                    input.value = venda.cliente_nome || 'Consumidor Final';
                }
                document.getElementById('v_status_pagamento').value = venda.status_pagamento || 'PENDENTE';
                document.getElementById('v_data_pagamento').value = venda.data_pagamento ? venda.data_pagamento.split('T')[0] : '';
            }
            
            document.getElementById('v_data_venda').value = venda.data ? venda.data.split('T')[0] : '';
            document.getElementById('v_observacoes').value = venda.observacoes || '';

            // Mudar texto do botão de salvar
            const saveBtn = document.getElementById('btn_confirm_venda');
            saveBtn.innerText = 'SALVAR ALTERAÇÕES';
            saveBtn.style.background = 'var(--primary)';
            saveBtn.disabled = false;
            saveBtn.style.opacity = '1';
            
            // Mostrar botão de excluir
            const btnDelEdit = document.getElementById('btn_delete_venda_edit');
            if (btnDelEdit) {
                btnDelEdit.style.display = 'inline-flex';
                btnDelEdit.style.alignItems = 'center';
            }
            if (typeof lucide !== 'undefined') lucide.createIcons();
            
            closeReceiptModal();
            console.log('Edição carregada com sucesso.');
        }, 250);

    } catch (err) {
        console.error('Erro fatal na edição:', err);
        alert('Erro ao carregar edição: ' + err.message);
    }
}

function closeReceiptModal() {
    document.getElementById('receiptModal').classList.remove('active');
}

async function confirmDeleteFromEdit() {
    if (currentVendaId) {
        await deleteSale(currentVendaId);
        closeVendaModal();
    }
}
window.confirmDeleteFromEdit = confirmDeleteFromEdit;

// Fechar autocompletes ao clicar fora
document.addEventListener('click', function(e) {
    const resultsDiv = document.getElementById('v_cliente_search_results');
    const input = document.getElementById('v_cliente_nome');
    if (resultsDiv && input && !input.contains(e.target) && !resultsDiv.contains(e.target)) {
        resultsDiv.style.display = 'none';
    }

    // Fechar autocompletes dos cards de itens de saída/venda
    const activeWrapper = e.target.closest('.autocomplete-wrapper');
    document.querySelectorAll('#v_itens_container .autocomplete-results').forEach(res => {
        if (!activeWrapper || !activeWrapper.contains(res)) {
            res.style.display = 'none';
        }
    });
});

// =========================================================================
//  CADASTRO RÁPIDO AUXILIAR EM MODAL (SEM SAIR DA TELA DE PRODUTO)
// =========================================================================

function showToast(msg, type = 'success') {
    let container = document.getElementById('toast_container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast_container';
        container.style.cssText = 'position: fixed; bottom: 2rem; right: 2rem; z-index: 10005; display: flex; flex-direction: column; gap: 0.75rem; pointer-events: none;';
        document.body.appendChild(container);
    }
    const t = document.createElement('div');
    const isSuccess = type === 'success';
    t.style.cssText = `
        background: ${isSuccess ? '#065f46' : '#991b1b'};
        color: #ffffff;
        padding: 0.9rem 1.4rem;
        border-radius: 12px;
        font-family: 'Inter', sans-serif;
        font-size: 0.88rem;
        font-weight: 700;
        box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.15);
        display: flex;
        align-items: center;
        gap: 0.75rem;
        pointer-events: auto;
        animation: toastSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        transition: all 0.3s ease;
    `;
    const iconName = isSuccess ? 'check-circle' : 'alert-triangle';
    t.innerHTML = `<i data-lucide="${iconName}" style="width: 20px; height: 20px; flex-shrink: 0;"></i> <span>${msg}</span>`;
    container.appendChild(t);
    if (window.lucide) lucide.createIcons();
    setTimeout(() => {
        t.style.opacity = '0';
        t.style.transform = 'translateY(12px)';
        setTimeout(() => t.remove(), 300);
    }, 3500);
}
window.showToast = showToast;

function openQuickAuxModal(type) {
    if (typeof canDo === 'function' && !canDo('estoque_cadastros', 'add')) {
        alert('Sem permissão para cadastrar dados auxiliares.');
        return;
    }

    const modal = document.getElementById('modalQuickAuxiliar');
    if (!modal) return;

    // Resetar campos
    document.getElementById('quick_aux_type').value = type;
    document.getElementById('quick_aux_marca_nome').value = '';
    document.getElementById('quick_aux_categoria_nome').value = '';
    document.getElementById('quick_aux_unidade_nome').value = '';
    document.getElementById('quick_aux_unidade_sigla').value = '';
    document.getElementById('quick_aux_modelo_marca').value = '';
    document.getElementById('quick_aux_modelo_nome').value = '';
    document.getElementById('quick_aux_modelo_potencia').value = '';
    document.getElementById('quick_aux_modelo_ano').value = '';

    // Ocultar todos os grupos de campos
    document.getElementById('quickAuxFieldsMarca').style.display = 'none';
    document.getElementById('quickAuxFieldsCategoria').style.display = 'none';
    document.getElementById('quickAuxFieldsUnidade').style.display = 'none';
    document.getElementById('quickAuxFieldsModelo').style.display = 'none';

    const titleEl = document.getElementById('quickAuxTitle');
    const subtitleEl = document.getElementById('quickAuxSubtitle');
    const iconEl = document.getElementById('quickAuxIcon');
    const iconBox = document.getElementById('quickAuxIconBox');

    let focusInputId = '';

    if (type === 'marca') {
        titleEl.innerText = 'Cadastrar Marca';
        subtitleEl.innerText = 'A nova marca será selecionada automaticamente no produto.';
        iconEl.setAttribute('data-lucide', 'tag');
        iconBox.style.background = 'rgba(245, 158, 11, 0.15)';
        iconBox.style.color = '#f59e0b';
        iconBox.style.borderColor = 'rgba(245, 158, 11, 0.3)';
        document.getElementById('quickAuxFieldsMarca').style.display = 'block';
        focusInputId = 'quick_aux_marca_nome';
    } else if (type === 'categoria') {
        titleEl.innerText = 'Cadastrar Categoria';
        subtitleEl.innerText = 'A nova categoria será selecionada automaticamente no produto.';
        iconEl.setAttribute('data-lucide', 'layers');
        iconBox.style.background = 'rgba(99, 102, 241, 0.15)';
        iconBox.style.color = '#818cf8';
        iconBox.style.borderColor = 'rgba(99, 102, 241, 0.3)';
        document.getElementById('quickAuxFieldsCategoria').style.display = 'block';
        focusInputId = 'quick_aux_categoria_nome';
    } else if (type === 'unidade') {
        titleEl.innerText = 'Cadastrar Unidade de Medida';
        subtitleEl.innerText = 'A unidade será selecionada automaticamente no produto.';
        iconEl.setAttribute('data-lucide', 'ruler');
        iconBox.style.background = 'rgba(16, 185, 129, 0.15)';
        iconBox.style.color = '#10b981';
        iconBox.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        document.getElementById('quickAuxFieldsUnidade').style.display = 'block';
        focusInputId = 'quick_aux_unidade_nome';
    } else if (type === 'modelo') {
        titleEl.innerText = 'Cadastrar Aplicação Veicular';
        subtitleEl.innerText = 'O novo modelo será inserido diretamente nas aplicações do produto.';
        iconEl.setAttribute('data-lucide', 'truck');
        iconBox.style.background = 'rgba(236, 72, 153, 0.15)';
        iconBox.style.color = '#ec4899';
        iconBox.style.borderColor = 'rgba(236, 72, 153, 0.3)';
        document.getElementById('quickAuxFieldsModelo').style.display = 'block';
        focusInputId = 'quick_aux_modelo_marca';
    }

    modal.style.display = 'flex';
    if (window.lucide) lucide.createIcons();

    setTimeout(() => {
        if (focusInputId) {
            const el = document.getElementById(focusInputId);
            if (el) el.focus();
        }
    }, 100);
}
window.openQuickAuxModal = openQuickAuxModal;

function closeQuickAuxModal() {
    const modal = document.getElementById('modalQuickAuxiliar');
    if (modal) modal.style.display = 'none';
}
window.closeQuickAuxModal = closeQuickAuxModal;

async function saveQuickAux(event) {
    if (event) event.preventDefault();

    if (typeof canDo === 'function' && !canDo('estoque_cadastros', 'add')) {
        alert('Sem permissão para cadastrar dados auxiliares.');
        return;
    }

    const type = document.getElementById('quick_aux_type').value;
    const btnSubmit = document.getElementById('btnQuickAuxSubmit');
    const originalBtnHTML = btnSubmit ? btnSubmit.innerHTML : '';
    if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = 'Salvando...';
    }

    try {
        if (type === 'marca') {
            const nome = document.getElementById('quick_aux_marca_nome').value.trim();
            if (!nome) {
                alert('Por favor, informe o nome da marca.');
                return;
            }
            const nomeUpper = nome.toUpperCase();
            try {
                await supabaseClient.from('estoque_marcas').insert([{ nome: nomeUpper }]);
            } catch (errSup) {
                console.warn('Erro ao inserir marca no Supabase. Atualizando cache local:', errSup);
                let localB = JSON.parse(localStorage.getItem('estoque_marcas') || '[]');
                if (!localB.find(b => b.nome.toUpperCase() === nomeUpper)) {
                    localB.push({ id: 'loc_' + Date.now(), nome: nomeUpper });
                    localStorage.setItem('estoque_marcas', JSON.stringify(localB));
                }
            }
            if (typeof logEstoque === 'function') {
                logEstoque('INCLUSÃO', `DETALHE: Cadastrou marca no estoque: ${nomeUpper}`);
            }
            await loadSetup({ marca: nomeUpper });
            closeQuickAuxModal();
            showToast(`Marca "${nomeUpper}" cadastrada e selecionada!`, 'success');

        } else if (type === 'categoria') {
            const nome = document.getElementById('quick_aux_categoria_nome').value.trim();
            if (!nome) {
                alert('Por favor, informe o nome da categoria.');
                return;
            }
            const nomeUpper = nome.toUpperCase();
            try {
                await supabaseClient.from('estoque_categorias').insert([{ nome: nomeUpper }]);
            } catch (errSup) {
                console.warn('Erro ao inserir categoria no Supabase:', errSup);
            }
            if (typeof logEstoque === 'function') {
                logEstoque('INCLUSÃO', `DETALHE: Cadastrou categoria no estoque: ${nomeUpper}`);
            }
            await loadSetup({ categoria: nomeUpper });
            closeQuickAuxModal();
            showToast(`Categoria "${nomeUpper}" cadastrada e selecionada!`, 'success');

        } else if (type === 'unidade') {
            const nome = document.getElementById('quick_aux_unidade_nome').value.trim();
            let sigla = document.getElementById('quick_aux_unidade_sigla').value.trim().toUpperCase();
            if (!nome) {
                alert('Por favor, informe o nome da unidade de medida.');
                return;
            }
            if (!sigla) sigla = nome.substring(0, 2).toUpperCase();
            try {
                await supabaseClient.from('estoque_unidades').insert([{ nome, sigla }]);
            } catch (errSup) {
                console.warn('Erro ao inserir unidade no Supabase:', errSup);
            }
            if (typeof logEstoque === 'function') {
                logEstoque('INCLUSÃO', `DETALHE: Cadastrou unidade no estoque: ${nome} (${sigla})`);
            }
            await loadSetup({ unidade: sigla || nome });
            closeQuickAuxModal();
            showToast(`Unidade "${nome}" cadastrada e selecionada!`, 'success');

        } else if (type === 'modelo') {
            const marca = document.getElementById('quick_aux_modelo_marca').value.trim();
            const modelo = document.getElementById('quick_aux_modelo_nome').value.trim();
            const potencia = document.getElementById('quick_aux_modelo_potencia').value.trim();
            const ano = document.getElementById('quick_aux_modelo_ano').value.trim();

            if (!modelo) {
                alert('Por favor, informe o modelo do veículo.');
                return;
            }

            const marcaUpper = marca ? marca.toUpperCase() : '';
            const modeloUpper = modelo.toUpperCase();
            const appFullName = marcaUpper ? `${marcaUpper} ${modeloUpper}` : modeloUpper;

            try {
                await supabaseClient.from('estoque_modelos').insert([{
                    marca: marcaUpper,
                    modelo: modeloUpper,
                    potencia: potencia || '',
                    ano: ano || ''
                }]);
            } catch (errSup) {
                console.warn('Erro ao inserir modelo no Supabase:', errSup);
            }

            if (typeof logEstoque === 'function') {
                logEstoque('INCLUSÃO', `DETALHE: Cadastrou modelo no estoque: ${appFullName}`);
            }

            await loadSetup({ modelo: appFullName });
            closeQuickAuxModal();
            showToast(`Modelo "${appFullName}" cadastrado e adicionado às aplicações!`, 'success');
        }
    } catch (err) {
        console.error('Erro ao salvar no modal rápido:', err);
        alert('Erro ao realizar o cadastro. Verifique os dados.');
    } finally {
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = originalBtnHTML;
            if (window.lucide) lucide.createIcons();
        }
    }
}
window.saveQuickAux = saveQuickAux;

// Fechar modal ao pressionar ESC ou clicar fora da caixa
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        const modal = document.getElementById('modalQuickAuxiliar');
        if (modal && modal.style.display === 'flex') {
            closeQuickAuxModal();
        }
    }
});

document.addEventListener('DOMContentLoaded', function() {
    const modal = document.getElementById('modalQuickAuxiliar');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeQuickAuxModal();
            }
        });
    }
});

// History Controls Window Exports
window.setHistoryViewMode = setHistoryViewMode;
window.changeHistoryPageSize = changeHistoryPageSize;
window.prevHistoryPage = prevHistoryPage;
window.nextHistoryPage = nextHistoryPage;
window.goToHistoryPage = goToHistoryPage;
window.applyHistoryFilters = applyHistoryFilters;
window.editSaleByCodigo = editSaleByCodigo;

// =========================================================================
// MODAL DETALHES DA COMPRA DENTRO DO ESTOQUE
// =========================================================================
function formatEstoqueDateBR(dateStr) {
    if (!dateStr) return 'N/A';
    try {
        const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString('pt-BR');
    } catch { return dateStr; }
}

function formatEstoqueDateTimeBR(dateStr) {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch { return dateStr; }
}

window.openCompraDetailsFromStock = async function(numNota) {
    if (!numNota) return;
    try {
        if (!supabaseClient) {
            alert('Conexão com o banco de dados não disponível.');
            return;
        }

        const modal = document.getElementById('viewCompraModalEstoque');
        if (!modal) return;

        // Abrir modal com estado inicial de carregamento
        document.getElementById('viewEstoqueCodUnico').innerText = 'COD: Carregando...';
        document.getElementById('viewEstoqueNumNota').innerText = `#${numNota}`;
        document.getElementById('viewEstoqueItemsList').innerHTML = '<div style="text-align:center; padding: 2.5rem; color: #64748b; font-weight:600;"><i data-lucide="loader-2" class="animate-spin" style="width:24px; height:24px; margin-bottom:8px; display:inline-block;"></i><br>Carregando detalhes da compra...</div>';
        document.getElementById('viewEstoqueActionContainer').innerHTML = '';
        modal.classList.add('active');
        if (window.lucide) lucide.createIcons();

        // 1. Buscar compra pelo número da nota
        const { data: comprasList, error: errCompra } = await supabaseClient
            .from('compras')
            .select(`
                *,
                fornecedores:fornecedor_id(id, nome, fantasia, cnpj),
                especies:especie_id(id, nome),
                formas_pagamento:forma_pagamento_id(id, nome),
                categorias:categoria_id(id, nome, codigo)
            `)
            .eq('numero_nota', numNota)
            .order('created_at', { ascending: false })
            .limit(1);

        if (errCompra || !comprasList || comprasList.length === 0) {
            document.getElementById('viewEstoqueItemsList').innerHTML = `<div style="text-align:center; padding: 2rem; color: #ef4444; font-weight:700;">Nota #${numNota} não foi localizada no banco de dados.</div>`;
            return;
        }

        const c = comprasList[0];

        // 2. Buscar itens da compra vinculados
        const { data: itens } = await supabaseClient
            .from('compra_itens')
            .select(`
                *,
                centros_custo:centro_custo_id(id, nome),
                veiculos:vinculo_veiculo_id(id, placa, modelo),
                manutencao_tipos:maint_tipo_id(id, descricao),
                manutencao_acoes:maint_acao_id(id, descricao)
            `)
            .eq('compra_id', c.id)
            .order('created_at', { ascending: true });

        // 3. Buscar adicionais e descontos
        const { data: adicionais } = await supabaseClient
            .from('compra_adicionais')
            .select('*')
            .eq('compra_id', c.id);

        // 4. Buscar parcelas
        const { data: parcelas } = await supabaseClient
            .from('compra_parcelas')
            .select('*')
            .eq('compra_id', c.id)
            .order('numero_parcela', { ascending: true });

        // Renderizar dados no modal
        renderCompraDetailsModalEstoque(c, itens || [], adicionais || [], parcelas || []);

    } catch (err) {
        console.error('Erro ao abrir compra no estoque:', err);
        alert('Erro ao carregar detalhes da compra: ' + err.message);
    }
};

window.closeCompraDetailsFromStock = function() {
    const modal = document.getElementById('viewCompraModalEstoque');
    if (modal) modal.classList.remove('active');
};

function renderCompraDetailsModalEstoque(c, itens, adicionais, parcelas) {
    document.getElementById('viewEstoqueCodUnico').innerText = 'COD: ' + (c.id || 'N/A');
    document.getElementById('viewEstoqueData').innerText = formatEstoqueDateBR(c.data_emissao || c.data);
    document.getElementById('viewEstoqueNumNota').innerText = '#' + (c.numero_nota || c.numeroNota || 'S/N');
    
    const vencText = c.data_vencimento ? formatEstoqueDateBR(c.data_vencimento) : 'N/A';
    document.getElementById('viewEstoqueVencimento').innerText = vencText;

    const isParcelado = c.financeiro_parcelado || ((c.qtd_parcelas || 1) > 1) || (parcelas && parcelas.length > 0);
    const qtdParc = c.qtd_parcelas || (parcelas ? parcelas.length : 1);
    const elParcelado = document.getElementById('viewEstoqueParcelado');
    if (elParcelado) {
        elParcelado.innerText = isParcelado ? `SIM (${qtdParc}x)` : 'NÃO (À vista)';
        elParcelado.style.color = isParcelado ? '#059669' : '#475569';
    }

    const fornNome = c.fornecedores?.nome || c.fornecedores?.fantasia || 'FORNECEDOR NÃO INFORMADO';
    document.getElementById('viewEstoqueFornecedor').innerText = fornNome;

    document.getElementById('viewEstoqueEspecie').innerText = c.especies?.nome || 'NFE - NOTA FISCAL ELETRONICA';
    document.getElementById('viewEstoqueFormaPgto').innerText = c.formas_pagamento?.nome || 'BOLETO';

    // Plano de contas
    let planoContasFormatted = 'NÃO ESPECIFICADO';
    if (c.categorias) {
        const cod = c.categorias.codigo || c.categorias.cod;
        planoContasFormatted = cod ? `${cod} - ${c.categorias.nome}` : c.categorias.nome;
    }
    document.getElementById('viewEstoquePlanoContas').innerText = planoContasFormatted;

    // Usuário e registro
    const usuarioNome = c.usuario_registro || c.responsavel || 'SISTEMA';
    const regDateStr = c.created_at ? formatEstoqueDateTimeBR(c.created_at) : formatEstoqueDateBR(c.data_emissao);
    
    let alteracaoHtml = '';
    const altUsuarioNome = c.usuario_alteracao || c.alterado_por;
    if (altUsuarioNome) {
        const altDateStr = c.data_alteracao || c.updated_at ? formatEstoqueDateTimeBR(c.data_alteracao || c.updated_at) : '';
        alteracaoHtml = `
            <div style="margin-top: 4px; font-size: 0.78rem; color: #b45309; display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;">
                <span style="display:inline-flex; align-items:center; gap:4px; font-weight:700;"><i data-lucide="edit-3" style="width:13px; height:13px; color:#d97706; vertical-align:middle;"></i> Alterado por: <strong>${altUsuarioNome}</strong></span>
                ${altDateStr ? `<span style="color:#cbd5e1; margin:0 2px;">•</span><span style="color:#64748b; font-weight:600;"><i data-lucide="clock" style="width:12px; height:12px; vertical-align:middle;"></i> ${altDateStr}</span>` : ''}
            </div>
        `;
    }

    document.getElementById('viewEstoqueUsuario').innerHTML = `
        <div style="display:flex; flex-direction:column; gap:2px;">
            <div style="display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap;">
                <span style="display:inline-flex; align-items:center; gap:4px;"><i data-lucide="user-check" style="width:14px; height:14px; color:#059669; vertical-align:middle;"></i> <strong>${usuarioNome}</strong></span>
                <span style="color:#cbd5e1; margin:0 4px;">•</span>
                <span style="color:#475569; font-size:0.82rem; font-weight:600; display:inline-flex; align-items:center; gap:4px;"><i data-lucide="calendar" style="width:13px; height:13px; color:#d97706; vertical-align:middle;"></i> ${regDateStr}</span>
            </div>
            ${alteracaoHtml}
        </div>
    `;

    // Itens da Nota
    const itemsList = document.getElementById('viewEstoqueItemsList');
    if (!itens || itens.length === 0) {
        itemsList.innerHTML = '<div style="text-align:center; padding: 1.5rem; color: #64748b; font-weight: 600;">Nenhum item cadastrado para esta compra.</div>';
    } else {
        itemsList.innerHTML = itens.map(it => {
            const isS = it.tipo === 'servico';
            const label = isS ? 'S' : 'P';
            const color = isS ? '#d97706' : '#059669';
            const ccName = it.centros_custo?.nome || 'SEM CENTRO DE CUSTO';

            let linkInfo = '';
            if (it.veiculos?.placa) {
                linkInfo = `<span style="font-size:0.68rem; background:#ecfdf5; color:#047857; border:1px solid #a7f3d0; padding:2px 8px; border-radius:4px; font-weight:700;">🚗 ${it.veiculos.placa}</span>`;
            } else if (it.vinculo_pessoa) {
                linkInfo = `<span style="font-size:0.68rem; background:#ecfdf5; color:#047857; border:1px solid #a7f3d0; padding:2px 8px; border-radius:4px; font-weight:700;">👤 ${it.vinculo_pessoa}</span>`;
            }

            const isStockLinked = (it.estoque === true || it.estoque === 'true');
            const stockAction = isStockLinked ? `
                <span style="color: #1d4ed8; background: #eff6ff; border: 1px solid #bfdbfe; font-size: 0.7rem; font-weight: 800; padding: 2px 8px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px;">📦 ESTOQUE</span>
            ` : '';

            const qtd = parseFloat(it.quantidade || 0);
            const unit = parseFloat(it.valor_unitario || 0);
            const totalItem = (qtd * unit).toLocaleString('pt-BR', {minimumFractionDigits: 2});

            return `
                <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1rem 1.2rem; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem;">
                        <div style="display: flex; align-items: flex-start; gap: 10px; flex: 1;">
                            <span style="color:${color}; font-weight:900; font-size:0.75rem; border:1px solid ${color}33; width:24px; height:24px; display:inline-flex; align-items:center; justify-content:center; border-radius:6px; background:${color}12; flex-shrink: 0; margin-top: 2px;">${label}</span>
                            <div>
                                <h4 style="font-weight: 800; font-size: 0.95rem; color: #0f172a; margin: 0 0 0.4rem 0; line-height: 1.3;">${it.produto}</h4>
                                <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                                    <span style="font-size: 0.72rem; color: #475569; font-weight: 700; background: #f1f5f9; padding: 2px 8px; border-radius: 4px; border: 1px solid #e2e8f0;">QTD: ${qtd}</span>
                                    <span style="font-size: 0.72rem; color: #475569; font-weight: 700; background: #f1f5f9; padding: 2px 8px; border-radius: 4px; border: 1px solid #e2e8f0;">Unit: R$ ${unit.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                                    <span style="color: #047857; background: #ecfdf5; border: 1px solid #a7f3d0; font-size: 0.7rem; font-weight: 800; padding: 2px 8px; border-radius: 4px;">${ccName}</span>
                                    ${linkInfo}
                                    ${stockAction}
                                </div>
                            </div>
                        </div>
                        <div style="text-align: right; flex-shrink: 0;">
                            <span style="font-size: 0.65rem; color: #64748b; font-weight: 800; text-transform: uppercase; display: block; margin-bottom: 2px;">Valor Subtotal</span>
                            <span style="font-weight: 900; color: #047857; font-size: 1.15rem; line-height: 1;">R$ ${totalItem}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Custos Adicionais & Descontos
    const adSection = document.getElementById('viewEstoqueAdicionaisSection');
    const adList = document.getElementById('viewEstoqueAdicionaisList');
    if (adicionais && adicionais.length > 0) {
        adSection.style.display = 'block';
        adList.innerHTML = adicionais.map(ad => {
            const isDesc = parseFloat(ad.valor || 0) < 0 || (ad.descricao && ad.descricao.includes('[DESCONTO]'));
            const color = isDesc ? '#ef4444' : '#2563eb';
            const bg = isDesc ? '#fef2f2' : '#eff6ff';
            const border = isDesc ? '#fecaca' : '#bfdbfe';
            const valStr = Math.abs(parseFloat(ad.valor || 0)).toLocaleString('pt-BR', {minimumFractionDigits: 2});
            return `
                <div style="display:flex; justify-content:space-between; align-items:center; background:${bg}; border:1px solid ${border}; padding:0.6rem 1rem; border-radius:8px;">
                    <span style="font-weight:700; font-size:0.8rem; color:${color};">${ad.descricao}</span>
                    <span style="font-weight:900; font-size:0.85rem; color:${color};">${isDesc ? '-' : '+'} R$ ${valStr}</span>
                </div>
            `;
        }).join('');
    } else {
        adSection.style.display = 'none';
    }

    // Parcelas
    const parcSection = document.getElementById('viewEstoqueParcelasSection');
    const parcList = document.getElementById('viewEstoqueParcelasList');
    if (parcelas && parcelas.length > 0) {
        parcSection.style.display = 'block';
        parcList.innerHTML = parcelas.map(p => {
            const dateStr = formatEstoqueDateBR(p.data_vencimento);
            const valStr = parseFloat(p.valor || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2});
            return `
                <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 0.8rem; box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
                    <span style="font-size: 0.68rem; font-weight: 800; color: #64748b; text-transform: uppercase;">Parcela #${p.numero_parcela}</span>
                    <h4 style="font-size: 0.95rem; font-weight: 900; color: #047857; margin: 4px 0 2px 0;">R$ ${valStr}</h4>
                    <p style="font-size: 0.72rem; font-weight: 700; color: #d97706; margin: 2px 0 0 0;">📅 ${dateStr}</p>
                </div>
            `;
        }).join('');
    } else {
        parcSection.style.display = 'none';
    }

    // Observações
    const obsSection = document.getElementById('viewEstoqueObsSection');
    if (c.observacoes) {
        obsSection.style.display = 'block';
        document.getElementById('viewEstoqueObservacoes').innerText = c.observacoes;
    } else {
        obsSection.style.display = 'none';
    }

    // Total
    const totalVal = parseFloat(c.valor_total || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2});
    document.getElementById('viewEstoqueTotalValue').innerText = `R$ ${totalVal}`;

    // Ação do Botão
    const isIntegrada = c.integrado_financeiro === true || c.integradoFinanceiro === true;
    const actionContainer = document.getElementById('viewEstoqueActionContainer');
    if (isIntegrada) {
        actionContainer.innerHTML = `
            <button type="button" onclick="alert('⚠️ Esta nota fiscal já está integrada ao setor Financeiro e não pode ser alterada diretamente.\\n\\nPara modificá-la, solicite ao setor Financeiro que estorne/exclua o lançamento correspondente.')"
                style="background: #059669; color: #ffffff; border: none; font-weight: 800; border-radius: 10px; padding: 0.75rem 1.8rem; cursor: not-allowed; box-shadow: 0 4px 12px rgba(5,150,105,0.25); display: flex; align-items: center; gap: 0.5rem; opacity: 0.95;">
                <i data-lucide="lock" style="width:16px; height:16px;"></i>
                NOTA INTEGRADA AO FINANCEIRO (BLOQUEADA)
            </button>
        `;
    } else {
        actionContainer.innerHTML = `
            <button type="button" onclick="window.location.href = 'compras.html?editId=' + encodeURIComponent('${c.id}')"
                style="background: #059669; color: #ffffff; border: none; font-weight: 800; border-radius: 10px; padding: 0.75rem 1.8rem; cursor: pointer; box-shadow: 0 4px 12px rgba(5,150,105,0.25); display: flex; align-items: center; gap: 0.5rem; transition: all 0.2s;"
                onmouseover="this.style.background='#047857';" onmouseout="this.style.background='#059669';">
                <i data-lucide="edit-3" style="width:16px; height:16px;"></i>
                EDITAR COMPRA
            </button>
        `;
    }

    if (window.lucide) lucide.createIcons();
}

// Fechar com ESC
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        const modal = document.getElementById('viewCompraModalEstoque');
        if (modal && modal.classList.contains('active')) {
            closeCompraDetailsFromStock();
        }
    }
});
