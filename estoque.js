let supabaseClient = null;

let inventoryData = [];
let filteredData = [];
let showLowStockOnly = false;
let selectedApplications = [];
let clientesData = [];
let historyData = [];

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
    const searchTerm = document.getElementById('inventory_search').value.toLowerCase();
    const categoryFilter = document.getElementById('filter_category').value;
    const statusFilter = document.getElementById('filter_status').value;

    filteredData = inventoryData.filter(item => {
        const matchesSearch = (item.nome || '').toLowerCase().includes(searchTerm) || 
                             (item.marca || '').toLowerCase().includes(searchTerm) || 
                             (item.ref || '').toLowerCase().includes(searchTerm) ||
                             (item.codigo_barras || '').toLowerCase().includes(searchTerm) ||
                             (item.codigo_interno || '').toLowerCase().includes(searchTerm);
        
        const matchesCategory = categoryFilter === '' || item.categoria === categoryFilter;
        const matchesStatus = statusFilter === 'TODOS' || item.status === statusFilter;
        const matchesLowStock = !showLowStockOnly || (item.estoque_atual <= item.estoque_minimo);

        return matchesSearch && matchesCategory && matchesStatus && matchesLowStock;
    });

    renderInventory(filteredData);
}

function renderInventory(data = filteredData) {
    const tableBody = document.getElementById('inventory_body');
    if (!tableBody) return;
    tableBody.innerHTML = '';

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
                    <span style="font-weight: 700; color: ${isLowStock ? 'var(--accent)' : '#fff'}">${item.estoque_atual} ${item.unidade || ''}</span>
                    <span style="font-size: 0.65rem; color: var(--text-muted);">MÍN: ${item.estoque_minimo}</span>
                </div>
            </td>
            <td data-label="Vlr. Custo"><span style="font-size: 0.85rem;">R$ ${item.valor_custo?.toLocaleString('pt-BR', {minimumFractionDigits: 2}) || '0,00'}</span></td>
            <td data-label="Vlr. Venda" style="color: #10b981; font-weight: 700;">R$ ${item.valor_venda?.toLocaleString('pt-BR', {minimumFractionDigits: 2}) || '0,00'}</td>
            <td data-label="Ações" style="text-align: right;">
                <div class="table-actions" style="display: flex; gap: 0.4rem; justify-content: flex-end;">
                    <button class="action-btn" onclick="editProduct('${item.id}')" title="Editar" style="background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.2); color: var(--primary-light); padding: 0.5rem; border-radius: 8px; cursor: pointer;">
                        <i data-lucide="edit-3" style="width: 14px;"></i>
                    </button>
                    <button class="action-btn" onclick="deleteProduct('${item.id}')" title="Excluir" style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); color: #ef4444; padding: 0.5rem; border-radius: 8px; cursor: pointer;">
                        <i data-lucide="trash-2" style="width: 14px;"></i>
                    </button>
                </div>
            </td>
        `;
        tableBody.appendChild(row);
    });
    lucide.createIcons();
    updateKPIs();
}

function filterInventory() {
    applyFilters();
}

function toggleLowStockOnly() {
    showLowStockOnly = !showLowStockOnly;
    const btn = document.getElementById('btn_low_stock_toggle');
    if (showLowStockOnly) {
        btn.style.background = 'var(--accent)';
        btn.style.color = '#fff';
    } else {
        btn.style.background = 'rgba(245, 158, 11, 0.1)';
        btn.style.color = 'var(--accent)';
    }
    applyFilters();
}

function updateKPIs() {
    const totalSku = inventoryData.length;
    const lowStockCount = inventoryData.filter(item => item.estoque_atual <= item.estoque_minimo).length;
    const totalValue = inventoryData.reduce((acc, item) => acc + (item.estoque_atual * item.valor_custo), 0);

    document.getElementById('stat_total_sku').innerText = totalSku;
    document.getElementById('stat_low_stock').innerText = lowStockCount;
    document.getElementById('stat_total_value').innerText = `R$ ${totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

    const cardLowStock = document.getElementById('card_low_stock');
    if (lowStockCount > 0) {
        cardLowStock.classList.add('alert');
        document.getElementById('stat_alert_msg').innerText = `Atenção: ${lowStockCount} itens com estoque baixo.`;
    } else {
        cardLowStock.classList.remove('alert');
        document.getElementById('stat_alert_msg').innerText = `Mantenha seu estoque abastecido.`;
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

    // Bloquear campos críticos na edição
    document.getElementById('mp_barras').disabled = true;
    document.getElementById('mp_interno').disabled = true;

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

    // Habilitar campos críticos para novo cadastro
    document.getElementById('mp_barras').disabled = false;
    document.getElementById('mp_interno').disabled = false;
    
    switchTab('new');
}

async function deleteProduct(id) {
    if (typeof canDo === 'function' && !canDo('estoque_inventario', 'delete')) {
        alert('Sem permissão para excluir produtos.');
        return;
    }
    if (!confirm('Tem certeza que deseja excluir este produto?')) return;

    try {
        const { error } = await supabaseClient
            .from('estoque')
            .delete()
            .eq('id', id);

        if (error) throw error;
        await loadInventory();
    } catch (err) {
        console.error('Erro ao deletar:', err);
        // Fallback demo
        inventoryData = inventoryData.filter(p => p.id !== id);
        applyFilters();
    }
}

async function saveProduct(event) {
    if (event) event.preventDefault();
    
    const productId = document.getElementById('mp_id').value;
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
            result = await supabaseClient.from('estoque').update(product).eq('id', productId);
        } else {
            result = await supabaseClient.from('estoque').insert([product]);
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
                    const filtered = inventoryData.filter(item => 
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

    // Configura botões de ação
    document.getElementById('btn_view_edit_trigger').onclick = () => { closeProductViewModal(); editProduct(id); };
    document.getElementById('btn_view_delete_trigger').onclick = () => { deleteProduct(id).then(() => closeProductViewModal()); };

    // Abre Modal
    document.getElementById('productViewModal').classList.add('active');

    // Carrega Histórico Específico
    await loadProductHistory(id);
}

function closeProductViewModal() {
    document.getElementById('productViewModal').classList.remove('active');
    currentViewingId = null;
}

async function loadProductHistory(productId) {
    const tbody = document.getElementById('view_prod_history_body');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem;">Carregando histórico...</td></tr>';

    try {
        const { data, error } = await supabaseClient
            .from('estoque_movimentacoes')
            .select('*')
            .eq('item_id', productId)
            .order('data', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(10);

        if (error) throw error;

        // Recuperar o item para ter o saldo atual de referência
        const item = inventoryData.find(p => p.id === productId);
        if (!item) {
            console.warn('Produto não encontrado para cálculo de saldo histórico.');
            return;
        }

        tbody.innerHTML = '';
        if (data && data.length > 0) {
            // Cálculo de Saldo Progressivo
            let runningSaldo = item.estoque_atual;
            
            data.forEach(h => {
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
                
                row.innerHTML = `
                    <td style="color: var(--text-muted); font-size: 0.75rem;">${date}</td>
                    <td><span style="color: ${isCancelled ? '#9ca3af' : color}; font-weight: 800; font-size: 0.7rem; ${isCancelled ? 'text-decoration: line-through;' : ''}">${displayTipo}</span></td>
                    <td style="font-weight: 700; text-align: center; ${isCancelled ? 'text-decoration: line-through; opacity: 0.5;' : ''}">${Math.round(h.quantidade)}</td>
                    <td style="font-weight: 900; color: var(--accent); text-align: center; font-size: 0.85rem;">${Math.round(rowSaldo)}</td>
                    <td style="color: var(--text-muted); ${isCancelled ? 'text-decoration: line-through;' : ''}">R$ ${parseFloat(h.valor_unitario || 0).toFixed(2)}</td>
                    <td style="font-size: 0.7rem; color: ${isCancelled ? '#ef4444' : 'var(--text-muted)'}; font-weight: ${isCancelled ? '700' : 'normal'};">
                        ${isAjuste ? h.motivo.replace('[AJUSTE] ', '') : (h.motivo || '---').replace(' | ', '<br><span style="color:var(--primary); font-weight:700;">')}</span>
                    </td>
                `;
                tbody.appendChild(row);
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem; color: var(--text-muted);">Nenhuma movimentação registrada.</td></tr>';
        }
    } catch (err) {
        console.error('Erro ao carregar histórico do produto:', err);
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem; color: #ef4444;">Erro ao carregar histórico.</td></tr>';
    }
}

async function saveQuickAdjustment() {
    if (typeof canDo === 'function' && !canDo('estoque_inventario', 'edit')) {
        alert('Sem permissão para ajustar saldo de estoque.');
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
    const dbTipo = diff > 0 ? 'ENTRADA' : 'SAIDA'; // Use compatible types for DB check constraint

    try {
        const movementObj = {
            item_id: id,
            tipo: dbTipo,
            quantidade: absoluteDiff,
            motivo: `[AJUSTE] ${reason}`,
            responsavel: 'SISTEMA (AJUSTE)',
            valor_unitario: item.valor_custo,
            data: new Date().toISOString()
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
                .order('data', { ascending: false })
                .order('created_at', { ascending: false });

            const { data, error } = await query;
            if (error) throw error;
            historyData = data || [];
        }

        applyHistoryFilters();
    } catch (err) {
        console.error('Erro ao carregar histórico:', err);
    }
}

function applyHistoryFilters() {
    const searchTerm = document.getElementById('search_history')?.value?.toLowerCase() || '';
    const typeFilter = document.getElementById('filter_type')?.value || '';
    const periodFilter = document.getElementById('filter_period')?.value || 'todos';

    // Toggle custom range display
    const customRangeDiv = document.getElementById('history_custom_date_range');
    if (customRangeDiv) {
        customRangeDiv.style.display = periodFilter === 'custom' ? 'flex' : 'none';
    }

    let filtered = historyData.filter(h => {
        // Search Term
        const matchesSearch = !searchTerm || 
            (h.estoque?.nome || '').toLowerCase().includes(searchTerm) || 
            (h.motivo || '').toLowerCase().includes(searchTerm) ||
            (h.responsavel || '').toLowerCase().includes(searchTerm);

        // Type
        const isAjuste = h.motivo && h.motivo.startsWith('[AJUSTE]');
        let displayTipo = h.tipo;
        if (isAjuste) displayTipo = 'AJUSTE';

        let matchesType = true;
        if (typeFilter) {
            matchesType = displayTipo === typeFilter;
        }

        // Period
        let matchesPeriod = true;
        const now = new Date();
        const itemDate = new Date(h.data);
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

        return matchesSearch && matchesType && matchesPeriod;
    });

    updateHistoryStats(filtered);
    renderHistory(filtered);
    updateHistoryFilterDropdowns(searchTerm, typeFilter, periodFilter);
}

function updateHistoryFilterDropdowns(searchTerm, typeFilter, periodFilter) {
    const filterTypeSelect = document.getElementById('filter_type');
    const filterPeriodSelect = document.getElementById('filter_period');
    if (!filterTypeSelect || !filterPeriodSelect) return;

    const currentType = filterTypeSelect.value;
    const currentPeriod = filterPeriodSelect.value;

    // --- Update Type Options ---
    const availableTypes = new Set();
    historyData.forEach(h => {
        const matchesSearch = !searchTerm || 
            (h.estoque?.nome || '').toLowerCase().includes(searchTerm) || 
            (h.motivo || '').toLowerCase().includes(searchTerm) ||
            (h.responsavel || '').toLowerCase().includes(searchTerm);

        let matchesPeriod = true;
        const now = new Date();
        const itemDate = new Date(h.data);
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
    historyData.forEach(h => {
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
            const itemDate = new Date(h.data);
            
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

    const thisMonth = data.filter(h => {
        const d = new Date(h.data);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    const entradas = thisMonth.filter(h => h.tipo === 'ENTRADA' && !(h.motivo && h.motivo.includes('[CANCELADA]'))).reduce((acc, h) => acc + h.quantidade, 0);
    const saidas = thisMonth.filter(h => h.tipo === 'SAIDA' && !(h.motivo && h.motivo.includes('[CANCELADA]'))).reduce((acc, h) => acc + h.quantidade, 0);
    const lucro = thisMonth.filter(h => h.tipo === 'SAIDA' && !(h.motivo && h.motivo.includes('[CANCELADA]'))).reduce((acc, h) => acc + (h.lucro || 0), 0);

    document.getElementById('stat_entradas').innerText = `${Math.round(entradas)} itens`;
    document.getElementById('stat_saidas').innerText = `${Math.round(saidas)} itens`;
    document.getElementById('stat_lucro').innerText = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(lucro);
}

function renderHistory(history) {
    const tbody = document.getElementById('history_body');
    if (!tbody) return;
    tbody.innerHTML = '';

    // Agrupar por item_id para calcular saldos progressivos
    const saldoMap = {};
    inventoryData.forEach(p => saldoMap[p.id] = p.estoque_atual);

    history.forEach(h => {
        const row = document.createElement('tr');
        row.style.background = 'rgba(255,255,255,0.01)';
        row.style.marginBottom = '0.5rem';

        const date = new Date(h.data).toLocaleDateString('pt-BR');
        const isSaida = h.tipo === 'SAIDA';
        const isEstorno = h.tipo === 'ESTORNO';
        const isAjuste = h.motivo && h.motivo.startsWith('[AJUSTE]');
        const isVenda = h.motivo && h.motivo.includes('VENDA:');
        
        // Cálculo de Saldo para este item específico
        const currentSaldo = saldoMap[h.item_id] || 0;
        const rowSaldo = currentSaldo;
        
        // Atualiza o mapa para a próxima linha (retrocedendo)
        if (h.tipo === 'ENTRADA' || h.tipo === 'ESTORNO') {
            saldoMap[h.item_id] -= h.quantidade;
        } else {
            saldoMap[h.item_id] += h.quantidade;
        }

        let vendaCodigo = null;
        if (isVenda) {
            const parts = h.motivo.split('VENDA:');
            if (parts.length > 1) {
                // Pega apenas a primeira palavra após 'VENDA:' para ignorar '(EDITADO)' ou outros textos
                vendaCodigo = parts[1].trim().split(' ')[0];
            }
        }

        let displayTipo = h.tipo;
        let typeColor = '#10b981'; // Entrada
        
        if (isAjuste) {
            displayTipo = 'AJUSTE';
            typeColor = '#3b82f6';
        } else if (isSaida) {
            typeColor = '#ef4444';
        } else if (isEstorno) {
            typeColor = '#f59e0b';
        }

        const isCancelled = h.motivo && h.motivo.includes('[CANCELADA]');

        row.innerHTML = `
            <td data-label="DATA" style="padding: 1.2rem 1rem; border-radius: 12px 0 0 12px;">
                <span style="font-size: 0.85rem; font-weight: 500; color: var(--text-muted);">${date}</span>
            </td>
            <td data-label="PRODUTO" style="${isCancelled ? 'opacity: 0.5;' : ''}">
                <div style="display: flex; flex-direction: column;">
                    <span class="product-name" onclick="openProductViewModal('${h.item_id}')" style="font-weight: 800; color: var(--primary-light); font-size: 0.9rem; cursor: pointer; text-decoration: underline; ${isCancelled ? 'text-decoration: line-through;' : ''}">${h.estoque?.nome || 'Item Removido'}</span>
                    <span style="font-size: 0.65rem; color: var(--text-muted); font-weight: 600;">INT: ${h.estoque?.codigo_interno || '---'}</span>
                </div>
            </td>
            <td data-label="LOTE / REF" style="${isCancelled ? 'opacity: 0.5;' : ''}">
                <span style="font-size: 0.7rem; color: var(--text-muted); font-weight: 600; ${isCancelled ? 'text-decoration: line-through;' : ''}">${h.estoque?.ref || '---'}</span>
            </td>
            <td data-label="TIPO">
                <span style="font-size: 0.65rem; font-weight: 800; color: ${isCancelled ? '#9ca3af' : typeColor}; background: ${isCancelled ? '#9ca3af20' : typeColor + '15'}; padding: 0.3rem 0.6rem; border-radius: 6px; text-transform: uppercase; ${isCancelled ? 'text-decoration: line-through;' : ''}">
                    ${isCancelled ? 'CANCELADA' : displayTipo}
                </span>
            </td>
            <td data-label="QUANTIDADE" style="text-align: center;">
                <span style="font-weight: 900; font-size: 1rem; color: #fff; ${isCancelled ? 'text-decoration: line-through; opacity: 0.5;' : ''}">${Math.round(h.quantidade)}</span>
            </td>
            <td data-label="SALDO" style="text-align: center;">
                <span style="font-weight: 900; font-size: 1.1rem; color: #10b981;">${Math.round(rowSaldo)}</span>
            </td>
            <td data-label="VLR. UNITÁRIO" style="${isCancelled ? 'opacity: 0.5;' : ''}">
                <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-muted); ${isCancelled ? 'text-decoration: line-through;' : ''}">R$ ${parseFloat(h.valor_unitario || 0).toFixed(2)}</span>
            </td>
            <td data-label="LUCRO">
                <span style="font-size: 0.85rem; font-weight: 800; color: ${isCancelled ? '#9ca3af' : '#10b981'}; ${isCancelled ? 'text-decoration: line-through; opacity: 0.5;' : ''}">${h.lucro > 0 ? 'R$ ' + parseFloat(h.lucro).toFixed(2) : '---'}</span>
            </td>
            <td data-label="MOTIVO / FORNECEDOR">
                <span style="font-size: 0.75rem; color: ${isCancelled ? '#ef4444' : (isVenda ? 'var(--primary-light)' : 'var(--text-muted)')}; font-style: italic; ${isVenda ? 'cursor: pointer; text-decoration: underline; font-weight: 700;' : ''} ${isCancelled ? 'text-decoration: none !important;' : ''}" 
                      ${isVenda ? `onclick="editSaleByCodigo('${vendaCodigo}')"` : ''}>
                    ${(h.motivo || 'N/A').replace(' | ', '<br><span style="color:var(--primary); font-weight:800; font-style:normal;">')}</span>
                </span>
            </td>
            <td data-label="RESPONSÁVEL">
                <span style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">${h.responsavel}</span>
            </td>
            <td data-label="Ações" style="padding-right: 1rem; border-radius: 0 12px 12px 0; text-align: right;">
                <!-- Deletion disabled to preserve audit trail -->
            </td>
        `;
        tbody.appendChild(row);
    });
    lucide.createIcons();
}

async function undoMovement(id) {
    if (!confirm('Deseja estornar esta movimentação? O saldo do produto será revertido.')) return;
    
    try {
        const { data: mov, error: err1 } = await supabaseClient.from('estoque_movimentacoes').select('*').eq('id', id).single();
        if (err1) throw err1;

        // Inverter tipo para estorno
        const estornoObj = {
            item_id: mov.item_id,
            tipo: 'ESTORNO',
            quantidade: mov.quantidade,
            valor_unitario: mov.valor_unitario,
            lucro: -mov.lucro,
            motivo: `ESTORNO: ${mov.motivo}`,
            responsavel: 'SISTEMA',
            data: new Date().toISOString()
        };

        await supabaseClient.from('estoque_movimentacoes').insert([estornoObj]);

        // Reverter saldo no produto
        const { data: prod } = await supabaseClient.from('estoque').select('estoque_atual').eq('id', mov.item_id).single();
        const newBalance = mov.tipo === 'ENTRADA' ? (prod.estoque_atual - mov.quantidade) : (prod.estoque_atual + mov.quantidade);
        
        await supabaseClient.from('estoque').update({ estoque_atual: newBalance }).eq('id', mov.item_id);

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
async function loadSetup() {
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
        const { data: brands, error: errBrands } = await supabaseClient.from('estoque_marcas').select('*').order('nome');
        if (errBrands) {
            console.error("Erro ao buscar Marcas:", errBrands);
        } else {
            console.log("Marcas carregadas:", brands?.length);
            renderBrands(brands || []);
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
        renderClientes(clientesData);
        updateSelectClientes(clientesData);
        
        // Atualizar os campos Select do formulário
        updateSelects(cats || [], units || [], models || [], brands || []);
        
        console.log("Processo de carregamento auxiliar finalizado.");
    } catch (err) {
        console.error('Erro crítico no loadSetup:', err);
    }
}

function renderCategories(cats) {
    const list = document.getElementById('categories_list');
    if (!list) return;
    list.innerHTML = cats.map(c => `
        <div class="styled-item-box" style="background: rgba(255,255,255,0.02); padding: 1rem; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; border: 1px solid rgba(255,255,255,0.05);">
            <span style="font-weight: 700; font-size: 0.85rem; text-transform: uppercase; color: #fff;">${c.nome}</span>
            <button onclick="deleteCategory('${c.id}')" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 0.2rem;">
                <i data-lucide="x" style="width: 14px;"></i>
            </button>
        </div>
    `).join('');
    lucide.createIcons();
}

function renderModels(models) {
    const list = document.getElementById('models_list');
    if (!list) return;
    list.innerHTML = models.map(m => `
        <div class="styled-item-box" style="background: rgba(255,255,255,0.02); padding: 1rem; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; border: 1px solid rgba(255,255,255,0.05);">
            <div style="display: flex; flex-direction: column;">
                <span style="font-weight: 800; font-size: 0.85rem; color: #fff; text-transform: uppercase;">${m.marca || ''} ${m.modelo}</span>
                <span style="font-size: 0.65rem; color: var(--text-muted); font-weight: 600;">${m.potencia || '---'} | ${m.ano || '---'}</span>
            </div>
            <button onclick="deleteModel('${m.id}')" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 0.2rem;">
                <i data-lucide="x" style="width: 14px;"></i>
            </button>
        </div>
    `).join('');
    lucide.createIcons();
}

function renderUnits(units) {
    const list = document.getElementById('units_list');
    if (!list) return;
    list.innerHTML = units.map(u => `
        <div class="styled-item-box" style="background: rgba(255,255,255,0.02); padding: 1rem; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; border: 1px solid rgba(255,255,255,0.05);">
            <span style="font-weight: 700; font-size: 0.85rem; text-transform: uppercase; color: #fff;">${u.nome} - ${u.sigla}</span>
            <button onclick="deleteUnit('${u.id}')" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 0.2rem;">
                <i data-lucide="x" style="width: 14px;"></i>
            </button>
        </div>
    `).join('');
    lucide.createIcons();
}



async function addCategory() {
    if (typeof canDo === 'function' && !canDo('estoque_cadastros', 'add')) return;
    const nome = document.getElementById('new_category_name').value.trim();
    if (!nome) return;
    try {
        await supabaseClient.from('estoque_categorias').insert([{ nome }]);
        document.getElementById('new_category_name').value = '';
        await loadSetup();
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
        await supabaseClient.from('estoque_modelos').insert([{ marca, modelo, potencia, ano }]);
        document.getElementById('new_model_nome').value = '';
        document.getElementById('new_model_marca').value = '';
        document.getElementById('new_model_potencia').value = '';
        document.getElementById('new_model_ano').value = '';
        await loadSetup();
    } catch (err) { console.error(err); }
}

async function addUnit() {
    if (typeof canDo === 'function' && !canDo('estoque_cadastros', 'add')) return;
    const nome = document.getElementById('new_unit_name').value.trim();
    if (!nome) return;
    try {
        await supabaseClient.from('estoque_unidades').insert([{ nome, sigla: nome.substring(0,2).toUpperCase() }]);
        document.getElementById('new_unit_name').value = '';
        await loadSetup();
    } catch (err) { console.error(err); }
}



async function deleteCategory(id) {
    if (typeof canDo === 'function' && !canDo('estoque_cadastros', 'delete')) return;
    if (!confirm('Excluir?')) return;
    try {
        await supabaseClient.from('estoque_categorias').delete().eq('id', id);
        await loadSetup();
    } catch (err) { console.error(err); }
}

async function deleteModel(id) {
    if (typeof canDo === 'function' && !canDo('estoque_cadastros', 'delete')) return;
    if (!confirm('Excluir?')) return;
    try {
        await supabaseClient.from('estoque_modelos').delete().eq('id', id);
        await loadSetup();
    } catch (err) { console.error(err); }
}

async function deleteUnit(id) {
    if (typeof canDo === 'function' && !canDo('estoque_cadastros', 'delete')) return;
    if (!confirm('Excluir?')) return;
    try {
        await supabaseClient.from('estoque_unidades').delete().eq('id', id);
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

function renderClientes(clientes) {
    const list = document.getElementById('clientes_list');
    if (!list) return;
    list.innerHTML = clientes.map(c => `
        <div class="styled-item-box" style="background: rgba(255,255,255,0.02); padding: 1rem; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; border: 1px solid rgba(255,255,255,0.05);">
            <div style="display: flex; flex-direction: column; gap: 0.25rem; align-items: flex-start;">
                <span style="font-weight: 800; font-size: 0.85rem; color: #fff; text-transform: uppercase;">${c.nome}</span>
                <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; font-size: 0.65rem; color: var(--text-muted); font-weight: 600;">
                    ${c.documento ? `<span>Doc: ${c.documento}</span>` : ''}
                    ${c.telefone ? `<span>Tel: ${c.telefone}</span>` : ''}
                    ${c.email ? `<span>Email: ${c.email}</span>` : ''}
                </div>
            </div>
            <button onclick="deleteCliente('${c.id}')" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 0.2rem; display: flex; align-items: center; justify-content: center; transition: 0.2s;">
                <i data-lucide="x" style="width: 14px;"></i>
            </button>
        </div>
    `).join('');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function updateSelectClientes(clientes) {
    const input = document.getElementById('v_cliente_nome');
    if (input) {
        input.value = '';
    }
}

function searchVendaCliente(query) {
    const resultsDiv = document.getElementById('v_cliente_search_results');
    if (!resultsDiv) return;

    // Se a query for vazia, mostra todos os clientes cadastrados
    const filtered = query.trim() === '' 
        ? clientesData 
        : clientesData.filter(c => c.nome.toLowerCase().includes(query.toLowerCase()));

    if (filtered.length === 0) {
        resultsDiv.innerHTML = `<div class="search-item" style="padding: 0.8rem; font-size: 0.8rem; color: var(--text-muted); cursor: pointer;" onclick="selectVendaCliente('${query.replace(/'/g, "\\'")}')">
            <span class="name" style="font-weight: 700; color: var(--primary);">Usar termo digitado: "${query}"</span>
        </div>`;
    } else {
        resultsDiv.innerHTML = filtered.map(c => `
            <div class="search-item" style="padding: 0.8rem; border-bottom: 1px solid rgba(255,255,255,0.02); cursor: pointer; transition: 0.2s;" onclick="selectVendaCliente('${c.nome.replace(/'/g, "\\'")}')">
                <span class="name" style="font-weight: 700; font-size: 0.8rem; display: block; color: #fff;">${c.nome}</span>
                <span class="info" style="font-size: 0.65rem; color: var(--text-muted); font-weight: 600;">
                    ${c.documento ? `Doc: ${c.documento}` : ''} ${c.telefone ? ` | Tel: ${c.telefone}` : ''}
                </span>
            </div>
        `).join('');
    }
    resultsDiv.style.display = 'block';
}

function selectVendaCliente(nome) {
    const input = document.getElementById('v_cliente_nome');
    if (input) input.value = nome;
    
    const resultsDiv = document.getElementById('v_cliente_search_results');
    if (resultsDiv) resultsDiv.style.display = 'none';
}

// Fechar dropdowns de pesquisa ao clicar fora
document.addEventListener('click', (e) => {
    const resultsDiv = document.getElementById('v_cliente_search_results');
    const input = document.getElementById('v_cliente_nome');
    if (resultsDiv && input && !input.contains(e.target) && !resultsDiv.contains(e.target)) {
        resultsDiv.style.display = 'none';
    }
});



function renderBrands(brands) {
    const list = document.getElementById('brands_list');
    if (!list) return;
    list.innerHTML = brands.map(b => `
        <div class="styled-item-box" style="background: rgba(255,255,255,0.02); padding: 1rem; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; border: 1px solid rgba(255,255,255,0.05);">
            <span style="font-weight: 700; font-size: 0.85rem; text-transform: uppercase; color: #fff;">${b.nome}</span>
            <button onclick="deleteBrand('${b.id}')" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 0.2rem;">
                <i data-lucide="x" style="width: 14px;"></i>
            </button>
        </div>
    `).join('');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function addBrand() {
    if (typeof canDo === 'function' && !canDo('estoque_cadastros', 'add')) return;
    const nome = document.getElementById('new_brand_name').value.trim();
    if (!nome) return;
    try {
        await supabaseClient.from('estoque_marcas').insert([{ nome: nome.toUpperCase() }]);
        document.getElementById('new_brand_name').value = '';
        await loadSetup();
    } catch (err) { console.error(err); }
}

async function deleteBrand(id) {
    if (typeof canDo === 'function' && !canDo('estoque_cadastros', 'delete')) return;
    if (!confirm('Excluir esta marca?')) return;
    try {
        await supabaseClient.from('estoque_marcas').delete().eq('id', id);
        await loadSetup();
    } catch (err) { console.error(err); }
}

function updateSelects(cats, units, models, brands = []) {
    const mpCatSelect = document.getElementById('mp_categoria');
    const mpUnitSelect = document.getElementById('mp_unidade');
    const mpModelSelect = document.getElementById('mp_aplicacao');
    const mpBrandSelect = document.getElementById('mp_marca');

    const catOptions = '<option value="">Selecione...</option>' + 
            cats.map(c => `<option value="${c.nome}">${c.nome}</option>`).join('');
    
    const unitOptions = units.map(u => `<option value="${u.sigla || u.nome}">${u.nome}</option>`).join('');
    
    const modelOptions = '<option value="">Selecione o modelo...</option>' + 
            '<option value="Multiveículos">Multiveículos (Universal)</option>' +
            models.map(m => `<option value="${m.marca} ${m.modelo}">${m.marca} ${m.modelo} (${m.ano || '---'})</option>`).join('');

    const brandOptions = '<option value="">Selecione...</option>' +
            brands.map(b => `<option value="${b.nome}">${b.nome}</option>`).join('');

    if (mpCatSelect) mpCatSelect.innerHTML = catOptions;
    if (mpUnitSelect) mpUnitSelect.innerHTML = unitOptions;
    if (mpModelSelect) mpModelSelect.innerHTML = modelOptions;
    if (mpBrandSelect) mpBrandSelect.innerHTML = brandOptions;
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

async function loadVehicles() {
    try {
        const select = document.getElementById('v_veiculo_id');
        if (!select) return;
        
        select.innerHTML = '<option value="">Carregando veículos...</option>';
        
        const { data, error } = await supabaseClient
            .from('veiculos')
            .select('id, placa, modelo, marca')
            .order('placa', { ascending: true });

        if (error) throw error;
        vehiclesData = data;

        select.innerHTML = '<option value="">Selecione uma placa...</option>';
        data.forEach(v => {
            const option = document.createElement('option');
            option.value = v.id;
            option.innerText = `${v.placa} - ${v.marca} ${v.modelo}`;
            select.appendChild(option);
        });
    } catch (err) {
        console.error('Erro ao carregar veículos:', err);
        const select = document.getElementById('v_veiculo_id');
        if (select) select.innerHTML = '<option value="">Erro ao carregar</option>';
    }
}

async function openVendaModal() {
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
    document.getElementById('v_data_venda').value = today;
    
    vendaItems = [];
    renderVendaItems();
    
    // Reset search UI
    document.getElementById('v_btn_add_item').style.display = 'none';
    document.getElementById('v_search_results').style.display = 'none';
    document.getElementById('v_selected_product_id').value = '';
    
    currentVendaId = null; // Reset ID de edição
    document.getElementById('btn_confirm_venda').innerText = 'CONFIRMAR SAÍDA';
    document.getElementById('btn_confirm_venda').style.background = '#10b981';
    document.getElementById('btn_delete_venda_edit').style.display = 'none';

    toggleVendaTypeFields();
    updateSelectClientes(clientesData);
    calculateVendaTotal();
    
    document.getElementById('vendaModal').classList.add('active');
    
    // Carregar veículos e retornar a promessa
    return await loadVehicles();
}

function closeVendaModal() {
    document.getElementById('vendaModal').classList.remove('active');
}

function toggleVendaTypeFields() {
    const tipo = document.getElementById('v_tipo').value;
    
    document.getElementById('group_v_placa').style.display = tipo === 'SIMPLES' ? 'flex' : 'none';
    document.getElementById('group_v_os').style.display = tipo === 'OS' ? 'flex' : 'none';
    document.getElementById('group_v_cliente').style.display = tipo === 'EXTERNA' ? 'flex' : 'none';
    
    const pagDiv = document.getElementById('group_v_pagamento');
    const obsWrapper = document.getElementById('wrapper_v_observacoes');
    
    if (tipo === 'EXTERNA') {
        pagDiv.style.display = 'block';
        obsWrapper.classList.replace('span-4', 'span-2');
    } else {
        pagDiv.style.display = 'none';
        obsWrapper.classList.replace('span-2', 'span-4');
    }
}

function searchVendaProduct(query) {
    const resultsDiv = document.getElementById('v_search_results');
    if (!query || query.length < 2) {
        resultsDiv.style.display = 'none';
        return;
    }

    const filtered = inventoryData.filter(item => 
        item.nome.toLowerCase().includes(query.toLowerCase()) || 
        (item.ref && item.ref.toLowerCase().includes(query.toLowerCase())) ||
        (item.marca && item.marca.toLowerCase().includes(query.toLowerCase())) ||
        (item.codigo_barras && item.codigo_barras.toLowerCase().includes(query.toLowerCase())) ||
        (item.codigo_interno && item.codigo_interno.toLowerCase().includes(query.toLowerCase()))
    );

    // Check for exact barcode/internal code match to auto-select
    const exactMatch = inventoryData.find(item => 
        (item.codigo_barras && item.codigo_barras.toLowerCase() === query.trim().toLowerCase()) || 
        (item.codigo_interno && item.codigo_interno.toLowerCase() === query.trim().toLowerCase())
    );

    if (exactMatch) {
        selectVendaProduct(exactMatch.id);
        resultsDiv.style.display = 'none';
        const qtyInput = document.getElementById('v_quantidade');
        if (qtyInput) {
            qtyInput.focus();
            qtyInput.select();
        }
        return;
    }

    if (filtered.length === 0) {
        resultsDiv.innerHTML = '<div class="search-item"><span class="name">Nenhum produto encontrado</span></div>';
    } else {
        resultsDiv.innerHTML = filtered.map(item => `
            <div class="search-item" onclick="selectVendaProduct('${item.id}')">
                <span class="name">${item.nome} (${item.marca || 'S/M'})</span>
                <span class="info">${item.codigo_barras ? `Barras: ${item.codigo_barras} | ` : ''}Ref: ${item.ref || 'S/R'} | Estoque: ${item.estoque_atual} ${item.unidade} | R$ ${parseFloat(item.valor_venda).toLocaleString('pt-BR')}</span>
            </div>
        `).join('');
    }
    resultsDiv.style.display = 'block';
}

function selectVendaProduct(id) {
    const item = inventoryData.find(p => p.id === id);
    if (!item) return;

    document.getElementById('v_selected_product_id').value = item.id;
    document.getElementById('v_search_input').value = item.nome;
    document.getElementById('v_search_results').style.display = 'none';
    
    // Fill values
    document.getElementById('v_valor_unitario').value = item.valor_venda || 0;
    
    // Show Info
    const infoDiv = document.getElementById('v_product_selection_info');
    document.getElementById('v_info_name').innerText = `${item.nome} (${item.marca || 'S/M'})`;
    document.getElementById('v_info_stock').innerText = `Estoque: ${item.estoque_atual} ${item.unidade}`;
    document.getElementById('v_info_price').innerText = `R$ ${parseFloat(item.valor_venda).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    
    // Visual Feedback: dynamic animation
    if (!document.getElementById('pulse-green-style')) {
        const style = document.createElement('style');
        style.id = 'pulse-green-style';
        style.innerHTML = `
            @keyframes pulseGreen {
                0% { background: rgba(16, 185, 129, 0.4); border-color: rgba(16, 185, 129, 0.8); transform: scale(1.02); }
                100% { background: rgba(16, 185, 129, 0.05); border-color: rgba(16, 185, 129, 0.1); transform: scale(1); }
            }
        `;
        document.head.appendChild(style);
    }
    
    infoDiv.style.display = 'block';
    infoDiv.style.animation = 'none';
    void infoDiv.offsetHeight; // trigger reflow
    infoDiv.style.animation = 'pulseGreen 0.6s ease-out';
    infoDiv.style.transition = 'transform 0.2s ease, background 0.2s ease, border-color 0.2s ease';
    
    document.getElementById('v_btn_add_item').style.display = 'flex';
    updateVendaItemPreview();
}

function updateVendaItemPreview() {
    const qty = parseFloat(document.getElementById('v_quantidade').value) || 0;
    const price = parseFloat(document.getElementById('v_valor_unitario').value) || 0;
    
    const descTipo = document.getElementById('v_item_desconto_tipo').value;
    const descValor = parseFloat(document.getElementById('v_item_desconto_valor').value) || 0;
    const acresTipo = document.getElementById('v_item_acrescimo_tipo').value;
    const acresValor = parseFloat(document.getElementById('v_item_acrescimo_valor').value) || 0;

    let subtotal = qty * price;
    let adjustment = 0;

    // Desconto
    if (descValor > 0) {
        if (descTipo === 'PORCENTAGEM') {
            adjustment -= (subtotal * (descValor / 100));
        } else {
            adjustment -= descValor;
        }
    }

    // Acréscimo
    if (acresValor > 0) {
        if (acresTipo === 'PORCENTAGEM') {
            adjustment += (subtotal * (acresValor / 100));
        } else {
            adjustment += acresValor;
        }
    }

    const finalSubtotal = subtotal + adjustment;
    document.getElementById('v_info_price').innerText = `R$ ${finalSubtotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
};

function addItemToVendaList() {
    const productId = document.getElementById('v_selected_product_id').value;
    const item = inventoryData.find(p => p.id === productId);
    const qtd = parseFloat(document.getElementById('v_quantidade').value) || 0;
    const unitVal = parseFloat(document.getElementById('v_valor_unitario').value) || 0;

    if (!item || qtd <= 0) {
        alert('Selecione um produto e informe uma quantidade válida.');
        return;
    }

    // Calcula ajustes do item
    let subtotal = qtd * unitVal;
    let adjustment = 0;

    const descTipo = document.getElementById('v_item_desconto_tipo').value;
    const descVal = parseFloat(document.getElementById('v_item_desconto_valor').value) || 0;
    if (descTipo === 'PORCENTAGEM') adjustment -= (subtotal * (descVal / 100));
    else adjustment -= descVal;

    const acrTipo = document.getElementById('v_item_acrescimo_tipo').value;
    const acrVal = parseFloat(document.getElementById('v_item_acrescimo_valor').value) || 0;
    if (acrTipo === 'PORCENTAGEM') adjustment += (subtotal * (acrVal / 100));
    else adjustment += acrVal;

    const finalSubtotal = subtotal + adjustment;

    // Check if already in list
    const existing = vendaItems.find(i => i.produto_id === productId);
    if (existing) {
        existing.quantidade += qtd;
        existing.subtotal += finalSubtotal;
        existing.adjustment += adjustment;
    } else {
        vendaItems.push({
            produto_id: item.id,
            nome: item.nome,
            quantidade: qtd,
            valor_unitario: unitVal,
            adjustment: adjustment,
            subtotal: finalSubtotal,
            unidade: item.unidade,
            valor_custo: item.valor_custo,
            desconto_tipo: descTipo,
            desconto_valor: descVal,
            acrescimo_tipo: acrTipo,
            acrescimo_valor: acrVal
        });
    }

    // Reset Item selection and adjustments
    document.getElementById('v_selected_product_id').value = '';
    document.getElementById('v_search_input').value = '';
    document.getElementById('v_quantidade').value = 1;
    document.getElementById('v_item_desconto_valor').value = 0;
    document.getElementById('v_item_acrescimo_valor').value = 0;
    document.getElementById('v_product_selection_info').style.display = 'none';
    document.getElementById('v_btn_add_item').style.display = 'none';

    renderVendaItems();
    const searchInput = document.getElementById('v_search_input');
    if (searchInput) {
        searchInput.focus();
    }
}

function editVendaItem(index) {
    const item = vendaItems[index];
    if (!item) return;

    // Popula campos de adição com os dados do item
    document.getElementById('v_selected_product_id').value = item.produto_id;
    document.getElementById('v_search_input').value = item.nome;
    document.getElementById('v_quantidade').value = item.quantidade;
    document.getElementById('v_valor_unitario').value = item.valor_unitario;
    
    document.getElementById('v_item_desconto_tipo').value = item.desconto_tipo || 'PORCENTAGEM';
    document.getElementById('v_item_desconto_valor').value = item.desconto_valor || 0;
    document.getElementById('v_item_acrescimo_tipo').value = item.acrescimo_tipo || 'PORCENTAGEM';
    document.getElementById('v_item_acrescimo_valor').value = item.acrescimo_valor || 0;

    // Mostra info do produto
    const infoDiv = document.getElementById('v_product_selection_info');
    document.getElementById('v_info_name').innerText = item.nome;
    document.getElementById('v_info_stock').innerText = `Estoque: -- ${item.unidade}`;
    document.getElementById('v_info_price').innerText = `R$ ${item.valor_unitario.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    infoDiv.style.display = 'block';
    document.getElementById('v_btn_add_item').style.display = 'flex';

    // Remove do carrinho para ser "re-adicionado" após edição
    vendaItems.splice(index, 1);
    renderVendaItems();
    updateVendaItemPreview();
}

function removeItemFromVenda(index) {
    if (confirm('Deseja remover este item do carrinho?')) {
        vendaItems.splice(index, 1);
        renderVendaItems();
    }
}

function renderVendaItems() {
    const tbody = document.getElementById('v_items_tbody');
    if (vendaItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">Nenhum item adicionado ao carrinho.</td></tr>';
        document.getElementById('btn_confirm_venda').disabled = true;
        document.getElementById('btn_confirm_venda').style.opacity = '0.5';
    } else {
        tbody.innerHTML = vendaItems.map((item, index) => `
            <tr>
                <td style="font-weight: 700;">${item.nome}</td>
                <td style="text-align: center;">${item.quantidade} ${item.unidade}</td>
                <td style="text-align: right;">R$ ${item.valor_unitario.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                <td style="text-align: right; color: ${item.adjustment < 0 ? '#ef4444' : '#10b981'};">
                    ${item.adjustment < 0 ? '-' : '+'} R$ ${Math.abs(item.adjustment).toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                </td>
                <td style="text-align: right; font-weight: 700; color: #10b981;">R$ ${item.subtotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                <td style="text-align: center;">
                    <div style="display: flex; gap: 0.5rem; justify-content: center;">
                        <button type="button" onclick="editVendaItem(${index})" style="background: rgba(59, 130, 246, 0.1); border: none; color: #3b82f6; cursor: pointer; width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center;">
                            <i data-lucide="pencil" style="width: 16px;"></i>
                        </button>
                        <button type="button" onclick="removeItemFromVenda(${index})" style="background: rgba(239, 68, 68, 0.1); border: none; color: #ef4444; cursor: pointer; width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center;">
                            <i data-lucide="trash-2" style="width: 16px;"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
        document.getElementById('btn_confirm_venda').disabled = false;
        document.getElementById('btn_confirm_venda').style.opacity = '1';
        document.getElementById('btn_confirm_venda').style.cursor = 'pointer';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
    calculateVendaTotal();
}


let lastCalculatedVendaTotal = 0;

function calculateVendaTotal() {
    const finalTotal = vendaItems.reduce((acc, item) => acc + item.subtotal, 0);
    const bruteTotal = vendaItems.reduce((acc, item) => acc + (item.quantidade * item.valor_unitario), 0);
    
    document.getElementById('v_total_bruto').innerText = bruteTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    lastCalculatedVendaTotal = finalTotal;
    document.getElementById('v_total_final').innerText = finalTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

async function saveVenda(event) {
    if (event) event.preventDefault();
    if (vendaItems.length === 0) return;

    const tipo = document.getElementById('v_tipo').value;
    const veiculoId = document.getElementById('v_veiculo_id').value;
    const veiculo = vehiclesData.find(v => v.id === veiculoId);
    const dataVenda = document.getElementById('v_data_venda').value;

    const totalAjuste = vendaItems.reduce((acc, i) => acc + i.adjustment, 0);

    const vendaObj = {
        tipo: tipo,
        data: dataVenda + 'T12:00:00Z', // Use midday to avoid timezone shifts
        veiculo_id: veiculoId || null,
        placa: veiculo ? veiculo.placa : null,
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
        observacoes: document.getElementById('v_observacoes').value
    };

    try {
        let newVenda;
        
        if (currentVendaId) {
            // 1. Reverter estoque dos itens antigos
            const { data: oldItems, error: oldErr } = await supabaseClient.from('venda_itens').select('*').eq('venda_id', currentVendaId);
            if (oldErr) throw oldErr;

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

            // Fallback: Se não havia itens em venda_itens, buscar no histórico para estornar antes de salvar novo estado
            if (!oldItems || oldItems.length === 0) {
                console.log('Edição: Revertendo estoque via histórico (fallback)...');
                const { data: hItens } = await supabaseClient
                    .from('estoque_movimentacoes')
                    .select('*')
                    .ilike('motivo', `%VENDA: ${newVenda ? newVenda.codigo : currentVendaId}%`); // Tenta pelo ID ou código se disponível
                
                if (hItens && hItens.length > 0) {
                    for (const h of hItens) {
                        const { data: p } = await supabaseClient.from('estoque').select('estoque_atual').eq('id', h.item_id).single();
                        if (p) {
                            await supabaseClient.from('estoque')
                                .update({ estoque_atual: (p.estoque_atual || 0) + h.quantidade })
                                .eq('id', h.item_id);
                        }
                    }
                }
            }

            // 2. Deletar itens antigos da venda
            await supabaseClient.from('venda_itens').delete().eq('venda_id', currentVendaId);

            // 3. Atualizar registro da venda
            const { data: vData, error: vErr } = await supabaseClient
                .from('vendas')
                .update(vendaObj)
                .eq('id', currentVendaId)
                .select();
            if (vErr) throw vErr;
            newVenda = vData[0];
        } else {
            // Criar Nova Venda
            const { data: vData, error: vErr } = await supabaseClient
                .from('vendas')
                .insert([vendaObj])
                .select();
            if (vErr) throw vErr;
            newVenda = vData[0];
        }

        // 2. Criar Novos Itens e Atualizar Estoque Atualizado
        for (const item of vendaItems) {
            // Item da Venda
            await supabaseClient.from('venda_itens').insert([{
                venda_id: newVenda.id,
                produto_id: item.produto_id,
                quantidade: item.quantidade,
                valor_unitario: item.valor_unitario,
                desconto_tipo: item.desconto_tipo,
                desconto_valor: item.desconto_valor,
                acrescimo_tipo: item.acrescimo_tipo,
                acrescimo_valor: item.acrescimo_valor,
                subtotal: item.subtotal
            }]);

            // Movimentação (Se for edição, o estorno já foi feito ao carregar ou ao salvar?)
            // Aqui estamos criando novas movimentações. Idealmente deveríamos limpar as antigas também.
            if (currentVendaId) {
                // Opcional: deletar as movimentações antigas vinculadas a esta venda no motivo
                await supabaseClient.from('estoque_movimentacoes')
                    .delete()
                    .ilike('motivo', `%VENDA: ${newVenda.codigo}%`);
            }

            await supabaseClient.from('estoque_movimentacoes').insert([{
                item_id: item.produto_id,
                tipo: 'SAIDA',
                quantidade: item.quantidade,
                valor_unitario: item.valor_unitario,
                lucro: (item.valor_unitario - item.valor_custo) * item.quantidade + item.adjustment,
                motivo: `SAÍDA: ${tipo}${tipo === 'SIMPLES' && vendaObj.placa ? ' - PLACA: ' + vendaObj.placa : (tipo === 'OS' && vendaObj.os_id ? ' - OS: #' + vendaObj.os_id : (tipo === 'EXTERNA' && vendaObj.cliente_nome ? ' - CLIENTE: ' + vendaObj.cliente_nome : ''))} | VENDA: ${newVenda.codigo}${currentVendaId ? ' (EDITADO)' : ''}`,
                responsavel: 'SISTEMA',
                data: dataVenda + 'T12:00:00Z'
            }]);

            // Saldo Final
            const prod = inventoryData.find(p => p.id === item.produto_id);
            if (prod) {
                // Buscar saldo atualizado do banco para evitar drift
                const { data: pReal } = await supabaseClient.from('estoque').select('estoque_atual').eq('id', item.produto_id).single();
                await supabaseClient.from('estoque')
                    .update({ estoque_atual: (pReal.estoque_atual || 0) - item.quantidade })
                    .eq('id', item.produto_id);
            }
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
                .ilike('motivo', `%VENDA: ${vendaCodigo}%`);
            
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
        
        // Configurar botões de edição e exclusão
        document.getElementById('btn_edit_sale').onclick = () => editSale(vendaData.id);
        document.getElementById('btn_delete_sale').onclick = () => deleteSale(vendaData.id);

        document.getElementById('receiptModal').classList.add('active');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (err) {
        console.error('Erro ao abrir recibo:', err);
        alert('Erro ao carregar dados do recibo.');
    }
}

async function deleteSale(vendaId) {
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
                .ilike('motivo', `%VENDA: ${venda.codigo}%`);
            
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

                // C. Criar Registro de ESTORNO no histórico (Auditoria)
                await supabaseClient.from('estoque_movimentacoes').insert([{
                    item_id: item.produto_id,
                    tipo: 'ESTORNO',
                    quantidade: qtyToReturn,
                    valor_unitario: item.valor_unitario,
                    motivo: `ESTORNO DE VENDA: ${venda.codigo} (CANCELAMENTO)`,
                    responsavel: 'SISTEMA (CANCELAMENTO)',
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
            alert('Venda cancelada e estoque revertido com sucesso! O registro de auditoria foi mantido.');
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
                    .ilike('motivo', `%VENDA: ${venda.codigo}%`);
                
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
                acrescimo_valor: item.acrescimo_valor || 0
            });
        }

        console.log('vendaItems populado:', vendaItems.length);

        // Renderizar itens
        renderVendaItems();
        
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
            document.getElementById('btn_delete_venda_edit').style.display = 'block';
            
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

function confirmDeleteFromEdit() {
    if (currentVendaId) {
        deleteSale(currentVendaId);
        closeVendaModal();
    }
}


