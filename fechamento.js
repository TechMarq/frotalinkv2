let supabaseClient = null;
const state = {
    vehicles: [],
    fueling: [],
    maintenance: [],
    fornecedores: [],
    closingData: {}, // Grouped data: { ownerName: { plate: { fuel: [], maint: [], total: 0 } } }
    supplierClosingData: {}, // Grouped data for suppliers: { supplierName: { purchases: [], total: 0 } }
    fuelClosingData: {}, // Grouped data for fuel stations: { stationIdOrName: { nome: '', categoria: '', records: [], totalVal: 0, totalLitros: 0, totalGas: 0 } }
    selectedPlate: null,
    selectedSupplier: null,
    selectedPosto: null,
    periodLabel: '',
    currentModuleTab: 'veiculos',
    supplierSort: { col: 'data_emissao', dir: 'asc' } // Sort state for supplier detail table
};

// --- Period Toggle ---
function togglePeriodType() {
    const type = document.getElementById('period_type').value;
    if (type === 'month') {
        document.getElementById('group-period-month').style.display = 'block';
        document.getElementById('group-period-start').style.display = 'none';
        document.getElementById('group-period-end').style.display = 'none';
    } else {
        document.getElementById('group-period-month').style.display = 'none';
        document.getElementById('group-period-start').style.display = 'block';
        document.getElementById('group-period-end').style.display = 'block';
    }
}
window.togglePeriodType = togglePeriodType;

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    if (window.supabase) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        await loadInitialData();
        
        // Add listener to period change to update supplier filter
        document.getElementById('filter_period').addEventListener('change', async () => {
            if (state.currentModuleTab === 'fornecedores') {
                await updateIntelligentSupplierFilter();
            }
        });
        document.getElementById('filter_start_date').addEventListener('change', async () => {
            if (state.currentModuleTab === 'fornecedores') {
                await updateIntelligentSupplierFilter();
            }
        });
        document.getElementById('filter_end_date').addEventListener('change', async () => {
            if (state.currentModuleTab === 'fornecedores') {
                await updateIntelligentSupplierFilter();
            }
        });
    }
});

async function updateIntelligentSupplierFilter() {
    const periodType = document.getElementById('period_type')?.value || 'month';
    let startDate, endDate;

    if (periodType === 'month') {
        const period = document.getElementById('filter_period').value;
        if (!period) return;
        const [year, month] = period.split('-').map(Number);
        const lastDay = new Date(year, month, 0).getDate();
        startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    } else {
        startDate = document.getElementById('filter_start_date').value;
        endDate = document.getElementById('filter_end_date').value;
        if (!startDate || !endDate) return;
    }

    showLoading(true, 'Atualizando lista de fornecedores...');
    try {
        // Light fetch only for suppliers with faturado in period
        const { data: activePurchases, error } = await supabaseClient
            .from('compras')
            .select('fornecedores:fornecedor_id(nome), formas_pagamento:forma_pagamento_id(nome)')
            .gte('data_emissao', startDate)
            .lte('data_emissao', endDate);

        if (error) throw error;

        const faturadoIds = (state.formasPagamento || [])
            .filter(f => f.nome.toUpperCase().trim().includes('FATURADO'))
            .map(f => f.id);

        const activeNames = [...new Set(activePurchases.filter(p => {
            const joinedNome = (p.formas_pagamento?.nome || '').toUpperCase().trim();
            const pgtoId = p.forma_pagamento_id;
            return joinedNome.includes('FATURADO') || (pgtoId && faturadoIds.includes(pgtoId));
        }).map(p => p.fornecedores?.nome))].filter(Boolean).sort();

        // Save current selection for restoration
        const currentSelected = Array.from(document.querySelectorAll('#fornDropdown input:checked')).map(cb => cb.value);

        // Populate filter with these names
        const dropdown = document.getElementById('fornDropdown');
        if (dropdown) {
            dropdown.innerHTML = activeNames.map(s => `
                <div class="multiselect-option" onclick="toggleOption(this, event)">
                    <input type="checkbox" value="${s}" ${currentSelected.includes(s) ? 'checked' : ''} onchange="updateMultiselectDisplay(event, 'forn')">
                    <label>${s}</label>
                </div>
            `).join('');
            
            if (activeNames.length === 0) {
                dropdown.innerHTML = '<div style="padding: 1rem; font-size: 0.7rem; color: var(--text-muted); text-align: center;">Nenhum fornecedor faturado neste mês.</div>';
            }
            updateMultiselectDisplay(null, 'forn');
        }
    } catch (e) {
        console.error(e);
    } finally {
        showLoading(false);
    }
}

async function loadInitialData() {
    try {
        const [vRes, fRes, pRes, postosRes, catsRes, driversRes] = await Promise.all([
            supabaseClient.from('veiculos').select('*').order('placa'),
            supabaseClient.from('fornecedores').select('id, nome'),
            supabaseClient.from('formas_pagamento').select('id, nome'),
            supabaseClient.from('postos').select('*').order('nome'),
            supabaseClient.from('categorias_posto').select('*').order('descricao'),
            supabaseClient.from('motoristas').select('id, nome_completo').order('nome_completo')
        ]);

        state.vehicles = vRes.data || [];
        state.fornecedores = fRes.data || [];
        state.formasPagamento = pRes.data || [];
        state.postos = postosRes.data || [];
        state.postCategories = catsRes.data || [];
        state.drivers = driversRes.data || [];

        // Build a mapping of postos to their categories based on fueling history
        let postToCategoryMap = {};
        try {
            const { data: relations, error } = await supabaseClient
                .from('abastecimentos')
                .select('posto_id, categoria_id')
                .not('posto_id', 'is', null)
                .not('categoria_id', 'is', null);
            if (!error && relations) {
                relations.forEach(r => {
                    const pId = String(r.posto_id);
                    if (!postToCategoryMap[pId]) postToCategoryMap[pId] = new Set();
                    postToCategoryMap[pId].add(String(r.categoria_id));
                });
            }
        } catch (e) {
            console.warn("Erro ao mapear categorias dos postos:", e);
        }
        state.postToCategoryMap = postToCategoryMap;

        // Load Clients with fallback
        let clientsData = [];
        try {
            const { data, error } = await supabaseClient.from('estoque_clientes').select('*').order('nome');
            if (error) throw error;
            clientsData = data || [];
        } catch (e) {
            console.warn("Tabela estoque_clientes não encontrada no fechamento. Usando fallback local.");
            const local = localStorage.getItem('estoque_clientes');
            clientsData = local ? JSON.parse(local) : [];
        }
        state.estoqueClientes = clientsData;

        // Load Products with fallback
        let productsData = [];
        try {
            const { data, error } = await supabaseClient.from('estoque').select('id, nome').order('nome');
            if (error) throw error;
            productsData = data || [];
        } catch (e) {
            console.warn("Tabela estoque não encontrada no fechamento. Usando fallback local.");
            const local = localStorage.getItem('estoque');
            productsData = local ? JSON.parse(local) : [];
        }
        state.products = productsData;

        populateFilters();
    } catch (err) {
        console.error('Erro ao carregar dados iniciais:', err);
    }
}

function populateFilters() {
    populateClassificacoes();
    populateProprietarios();
    populateFornecedoresFilter();
    populatePostoFilters();
}

window.populatePostoFilters = () => {
    const catDropdown = document.getElementById('catPostoDropdown');
    if (catDropdown) {
        catDropdown.innerHTML = state.postCategories.map(c => `
            <div class="multiselect-option" onclick="toggleOption(this, event)">
                <input type="checkbox" value="${c.id}" onchange="updatePostoFilterOptions(event); updateMultiselectDisplay(event, 'catPosto');">
                <label>${c.descricao}</label>
            </div>
        `).join('');
    }
    
    updateMultiselectDisplay(null, 'catPosto');
    updatePostoFilterOptions();
}

window.updatePostoFilterOptions = (event) => {
    if (event) event.stopPropagation();
    
    const selectedCats = Array.from(document.querySelectorAll('#catPostoDropdown input:checked')).map(cb => cb.value);
    
    const filteredPostos = selectedCats.length > 0
        ? state.postos.filter(p => {
            const cats = state.postToCategoryMap[String(p.id)];
            return cats && selectedCats.some(catId => cats.has(String(catId)));
        })
        : state.postos;
        
    const postoDropdown = document.getElementById('postoDropdown');
    if (postoDropdown) {
        const currentSelected = Array.from(document.querySelectorAll('#postoDropdown input:checked')).map(cb => cb.value);
        
        postoDropdown.innerHTML = filteredPostos.map(p => `
            <div class="multiselect-option" onclick="toggleOption(this, event)">
                <input type="checkbox" value="${p.id}" ${currentSelected.includes(String(p.id)) ? 'checked' : ''} onchange="updateMultiselectDisplay(event, 'posto')">
                <label>${p.nome}</label>
            </div>
        `).join('');
        
        if (filteredPostos.length === 0) {
            postoDropdown.innerHTML = '<div style="padding: 1rem; font-size: 0.7rem; color: var(--text-muted); text-align: center;">Nenhum posto encontrado para as categorias selecionadas.</div>';
        }
    }
    
    updateMultiselectDisplay(null, 'catPosto');
    updateMultiselectDisplay(null, 'posto');
}

function populateClassificacoes() {
    const dropdown = document.getElementById('classificacaoDropdown');
    if (!dropdown) return;
    const classes = [...new Set(state.vehicles.map(v => v.classificacao))].filter(Boolean).sort();
    
    dropdown.innerHTML = classes.map(c => `
        <div class="multiselect-option" onclick="toggleOption(this, event)">
            <input type="checkbox" value="${c}" onchange="populateProprietarios(); updateMultiselectDisplay(event, 'classificacao');">
            <label>${c}</label>
        </div>
    `).join('') + `
        <div class="multiselect-option" onclick="toggleOption(this, event)">
            <input type="checkbox" value="SAIDA_ESTOQUE" onchange="populateProprietarios(); updateMultiselectDisplay(event, 'classificacao');">
            <label>Saída / Venda Estoque</label>
        </div>
        <div class="multiselect-option" onclick="toggleOption(this, event)">
            <input type="checkbox" value="VINCULO_PESSOA" onchange="populateProprietarios(); updateMultiselectDisplay(event, 'classificacao');">
            <label>Vínculo Pessoa (Compras)</label>
        </div>
    `;
    
    updateMultiselectDisplay(null, 'classificacao');
}

window.populateProprietarios = () => {
    const selectedClasses = Array.from(document.querySelectorAll('#classificacaoDropdown input:checked')).map(cb => cb.value);
    const dropdown = document.getElementById('propDropdown');
    if (!dropdown) return;
    
    let props = [];
    if (selectedClasses.includes('SAIDA_ESTOQUE')) {
        props = [...new Set((state.estoqueClientes || []).map(c => c.nome))].filter(Boolean);
    }
    
    if (selectedClasses.includes('VINCULO_PESSOA')) {
        props = [...props, ...new Set((state.drivers || []).map(d => d.nome_completo))].filter(Boolean);
    }
    
    const hasVehiclesClasses = selectedClasses.filter(c => c !== 'SAIDA_ESTOQUE' && c !== 'VINCULO_PESSOA');
    if (hasVehiclesClasses.length > 0) {
        const filteredVehicles = state.vehicles.filter(v => hasVehiclesClasses.includes(v.classificacao));
        props = [...props, ...new Set(filteredVehicles.map(v => v.proprietario))].filter(Boolean);
    } else if (!selectedClasses.includes('SAIDA_ESTOQUE') && !selectedClasses.includes('VINCULO_PESSOA')) {
        props = [...props, ...new Set(state.vehicles.map(v => v.proprietario))].filter(Boolean);
    }

    props.sort();

    const currentSelected = Array.from(document.querySelectorAll('#propDropdown input:checked')).map(cb => cb.value);

    dropdown.innerHTML = props.map(p => `
        <div class="multiselect-option" onclick="toggleOption(this, event)">
            <input type="checkbox" value="${p}" ${currentSelected.includes(p) ? 'checked' : ''} onchange="updateMultiselectDisplay(event, 'prop')">
            <label>${p}</label>
        </div>
    `).join('');
    
    updateMultiselectDisplay(null, 'prop');
}

// --- Multiselect Logic ---
window.toggleMultiselect = (trigger) => {
    const dropdown = trigger.nextElementSibling;
    dropdown.classList.toggle('show');
    trigger.classList.toggle('active');
};

window.populateFornecedoresFilter = (activeOnly = false) => {
    const dropdown = document.getElementById('fornDropdown');
    if (!dropdown) return;

    let suppliers = [];
    if (activeOnly && Object.keys(state.supplierClosingData).length > 0) {
        suppliers = Object.keys(state.supplierClosingData).sort();
    } else {
        // Show ALL suppliers initially so user can choose before generating
        suppliers = [...new Set(state.fornecedores.map(f => f.nome))].filter(Boolean).sort();
    }
    
    // Save current selection if any
    const currentSelected = Array.from(document.querySelectorAll('#fornDropdown input:checked')).map(cb => cb.value);

    dropdown.innerHTML = suppliers.map(s => `
        <div class="multiselect-option" onclick="toggleOption(this, event)">
            <input type="checkbox" value="${s}" ${currentSelected.includes(s) ? 'checked' : ''} onchange="updateMultiselectDisplay(event, 'forn')">
            <label>${s}</label>
        </div>
    `).join('');
    
    if (suppliers.length === 0) {
        dropdown.innerHTML = '<div style="padding: 1rem; font-size: 0.7rem; color: var(--text-muted); text-align: center;">Nenhum fornecedor cadastrado.</div>';
    }
    
    updateMultiselectDisplay(null, 'forn');
}

window.toggleOption = (optionDiv, event) => {
    if (event.target.tagName === 'INPUT') return; 
    const cb = optionDiv.querySelector('input');
    cb.checked = !cb.checked;
    
    // Detect type based on parent dropdown ID
    const dropdown = optionDiv.closest('.multiselect-dropdown');
    let type = 'prop';
    if (dropdown) {
        if (dropdown.id === 'fornDropdown') type = 'forn';
        else if (dropdown.id === 'catPostoDropdown') type = 'catPosto';
        else if (dropdown.id === 'postoDropdown') type = 'posto';
        else if (dropdown.id === 'classificacaoDropdown') type = 'classificacao';
    }
    
    // For catPosto, also refresh the posto list based on selected categories
    if (type === 'catPosto') {
        updatePostoFilterOptions();
    }
    
    if (type === 'classificacao') {
        populateProprietarios();
    }
    
    updateMultiselectDisplay(null, type);
};

window.updateMultiselectDisplay = (event, type = 'prop') => {
    if (event) event.stopPropagation();
    
    let prefix = 'prop';
    if (type === 'forn') prefix = 'forn';
    else if (type === 'catPosto') prefix = 'catPosto';
    else if (type === 'posto') prefix = 'posto';
    else if (type === 'classificacao') prefix = 'classificacao';
    
    // Read label text instead of checkbox value (value can be a UUID/ID)
    const selectedOptions = Array.from(document.querySelectorAll(`#${prefix}Dropdown input:checked`));
    const selectedLabels = selectedOptions.map(cb => {
        const lbl = cb.nextElementSibling;
        return lbl ? lbl.textContent.trim() : cb.value;
    });
    const label = document.getElementById(`${prefix}SelectedLabel`);
    
    if (!label) return;
    
    if (selectedLabels.length === 0) {
        if (prefix === 'classificacao') {
            label.innerHTML = 'Todas';
        } else {
            label.innerHTML = 'Todos';
        }
    } else if (selectedLabels.length === 1) {
        label.innerHTML = selectedLabels[0];
    } else {
        label.innerHTML = `${selectedLabels.length} Selecionados <span class="multiselect-badge">${selectedLabels.length}</span>`;
    }

    // Refresh view immediately on change
    if (type === 'forn' && state.currentModuleTab === 'fornecedores') {
        renderSupplierSummary();
        updateSupplierKPIs();
    }
};

// Close multiselect on click outside
document.addEventListener('click', (e) => {
    const multiselectIds = ['prop', 'forn', 'catPosto', 'posto', 'classificacao'];
    multiselectIds.forEach(prefix => {
        const container = document.getElementById(`${prefix}Multiselect`);
        const dropdown = document.getElementById(`${prefix}Dropdown`);
        if (container && dropdown && !container.contains(e.target)) {
            dropdown.classList.remove('show');
            const trigger = container.querySelector('.multiselect-trigger');
            if (trigger) trigger.classList.remove('active');
        }
    });
});

// --- Logic ---

window.switchModuleTab = (tabId) => {
    state.currentModuleTab = tabId;
    
    // UI Update
    document.querySelectorAll('.tabs-header .tab-item').forEach(t => t.classList.remove('active'));
    document.getElementById(`tab-${tabId}`).classList.add('active');
    
    document.querySelectorAll('.module-view').forEach(v => v.classList.remove('active'));
    document.getElementById(`view-${tabId}`).classList.add('active');
    
    // Manage filter visibility
    const vehicleFilters = ['group-classificacao', 'group-proprietario'];
    vehicleFilters.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = (tabId === 'veiculos') ? 'flex' : 'none';
    });

    const supplierFilters = ['group-fornecedor'];
    supplierFilters.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = (tabId === 'fornecedores') ? 'flex' : 'none';
    });

    const fuelFilters = ['group-categoria-posto', 'group-posto-combustivel'];
    fuelFilters.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = (tabId === 'abastecimento') ? 'flex' : 'none';
    });

    if (tabId === 'veiculos') {
        renderSummary();
        updateKPIs();
    } else if (tabId === 'fornecedores') {
        updateIntelligentSupplierFilter();
        renderSupplierSummary();
        updateSupplierKPIs();
    } else if (tabId === 'abastecimento') {
        renderFuelSummary();
        updateFuelKPIs();
    }
    
    if (window.lucide) lucide.createIcons();
};

function showLoading(show, text = 'Processando...') {
    const overlay = document.getElementById('loadingOverlay');
    const textEl = document.getElementById('loadingText');
    if (overlay) {
        overlay.style.display = show ? 'flex' : 'none';
        if (textEl) textEl.innerText = text;
    }
}

async function generateClosing() {
    const periodType = document.getElementById('period_type')?.value || 'month';
    let startDate, endDate;

    if (periodType === 'month') {
        const period = document.getElementById('filter_period').value;
        if (!period) {
            alert('Por favor, selecione o período.');
            return;
        }
        const [year, month] = period.split('-').map(Number);
        const lastDay = new Date(year, month, 0).getDate();
        startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        state.periodLabel = new Date(year, month - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();
    } else {
        startDate = document.getElementById('filter_start_date').value;
        endDate = document.getElementById('filter_end_date').value;
        if (!startDate || !endDate) {
            alert('Por favor, selecione as datas de início e fim.');
            return;
        }
        const formatD = (dStr) => {
            const [y, m, d] = dStr.split('-');
            return `${d}/${m}/${y}`;
        };
        state.periodLabel = `${formatD(startDate)} ATÉ ${formatD(endDate)}`;
    }

    console.log('Filtrando de:', startDate, 'até:', endDate);
    
    const selectedClasses = Array.from(document.querySelectorAll('#classificacaoDropdown input:checked')).map(cb => cb.value);
    const selectedProps = Array.from(document.querySelectorAll('#propDropdown input:checked')).map(cb => cb.value);
    const selectedCats = Array.from(document.querySelectorAll('#catPostoDropdown input:checked')).map(cb => cb.value);
    const selectedPostos = Array.from(document.querySelectorAll('#postoDropdown input:checked')).map(cb => cb.value);

    showLoading(true, 'Buscando registros do período...');

    try {
        // Fetch everything for the period using a helper to bypass the 1000 record limit
        const fetchAllRecords = async (table, selectStr, start, end, dateCol = 'data') => {
            let all = [];
            let from = 0;
            const step = 1000;
            let done = false;
            while (!done) {
                const { data, error } = await supabaseClient
                    .from(table)
                    .select(selectStr)
                    .gte(dateCol, start)
                    .lte(dateCol, end)
                    .range(from, from + step - 1);
                
                if (error) throw error;
                all = all.concat(data || []);
                if (!data || data.length < step) done = true;
                else from += step;
            }
            return all;
        };

        let [fuel, maint, purchases, driverRes] = await Promise.all([
            fetchAllRecords('abastecimentos', '*, veiculos:veiculo_id(*), postos:posto_id(nome), categorias_posto:categoria_id(descricao)', startDate, endDate),
            fetchAllRecords('manutencoes', '*, veiculos:veiculo_id(*), manutencao_itens(*), fornecedores:oficina_id(nome)', startDate, endDate),
            fetchAllRecords('compras', '*, fornecedores:fornecedor_id(nome), formas_pagamento:forma_pagamento_id(nome), compra_itens(*)', startDate, endDate, 'data_emissao'),
            supabaseClient.from('motoristas').select('id, nome_completo')
        ]);
        const drivers = driverRes.data || [];

        // Fetch sales from 'vendas' table with local fallback if table does not exist or fails
        let sales = [];
        try {
            // Fetch raw sales first without joins to prevent relation join errors
            const rawSales = await fetchAllRecords('vendas', '*', startDate, endDate, 'data');
            
            if (rawSales.length > 0) {
                const saleIds = rawSales.map(s => s.id);
                let rawItems = [];
                // Chunk to stay safe
                for (let i = 0; i < saleIds.length; i += 500) {
                    const chunk = saleIds.slice(i, i + 500);
                    const { data, error } = await supabaseClient
                        .from('venda_itens')
                        .select('*')
                        .in('venda_id', chunk);
                    if (data) rawItems = rawItems.concat(data);
                }
                
                // Fallback: If any sale has 0 items in rawItems, fetch from estoque_movimentacoes directly (matches RLS safety)
                const hasMissingItems = rawSales.some(s => {
                    const items = rawItems.filter(it => it.venda_id === s.id);
                    return items.length === 0;
                });
                
                if (hasMissingItems) {
                    console.log('Fechamento fallback: Buscando itens do histórico de movimentações...');
                    const movs = await fetchAllRecords('estoque_movimentacoes', '*', startDate, endDate, 'data');
                    
                    rawSales.forEach(s => {
                        const items = rawItems.filter(it => it.venda_id === s.id);
                        if (items.length === 0) {
                            // Recover items from movements that match this sale's code
                            const matchingMovs = movs.filter(m => m.motivo && m.motivo.includes(`VENDA: ${s.codigo}`) && (m.tipo === 'SAIDA' || m.tipo === 'ESTORNO'));
                            const recovered = matchingMovs.map(m => ({
                                venda_id: s.id,
                                produto_id: m.item_id,
                                quantidade: m.quantidade,
                                valor_unitario: m.valor_unitario,
                                subtotal: (parseFloat(m.quantidade) || 0) * (parseFloat(m.valor_unitario) || 0)
                            }));
                            rawItems = rawItems.concat(recovered);
                        }
                    });
                }
                
                // Map items to sales
                rawSales.forEach(s => {
                    s.venda_itens = rawItems.filter(it => it.venda_id === s.id);
                });
            }
            sales = rawSales;
        } catch (e) {
            console.warn("Erro ao buscar vendas do banco. Buscando do localStorage fallback.", e);
            const local = localStorage.getItem('vendas');
            if (local) {
                const parsed = JSON.parse(local);
                sales = parsed.filter(s => {
                    const sDate = s.data.split('T')[0];
                    return sDate >= startDate && sDate <= endDate;
                });
            }
        }
        // Filter out cancelled sales
        sales = (sales || []).filter(s => s.status !== 'CANCELADA');
        
        console.log('Total Bruto Abastecimentos:', fuel.length);
        console.log('Total Bruto Saídas Estoque:', sales.length);

        // Map driver names manually to avoid join errors
        const driverMap = {};
        drivers.forEach(d => driverMap[d.id] = d.nome_completo);
        fuel.forEach(f => {
            f.motorista_nome = driverMap[f.motorista_id] || 'NÃO INFORMADO';
        });

        // Apply filters in memory
        const relevantVehicles = state.vehicles.filter(v => {
            let ok = true;
            const hasVehiclesClasses = selectedClasses.filter(c => c !== 'SAIDA_ESTOQUE');
            if (hasVehiclesClasses.length > 0) {
                if (!hasVehiclesClasses.includes(v.classificacao)) ok = false;
            }
            if (selectedProps.length > 0) {
                if (!selectedProps.includes(v.proprietario)) ok = false;
            }
            return ok;
        });
        const vehicleIds = relevantVehicles.map(v => v.id);

        console.log('Veículos Relevantes:', vehicleIds.length);

        fuel = fuel.filter(f => vehicleIds.includes(f.veiculo_id));
        maint = maint.filter(m => vehicleIds.includes(m.veiculo_id));

        if (selectedCats.length > 0) {
            fuel = fuel.filter(f => f.categoria_id && selectedCats.includes(String(f.categoria_id)));
        }
        if (selectedPostos.length > 0) {
            fuel = fuel.filter(f => f.posto_id && selectedPostos.includes(String(f.posto_id)));
        }

        // Filter purchases and their items
        const filteredPurchases = purchases.filter(p => {
            return (p.compra_itens || []).some(it => {
                if (it.vinculo_pessoa) {
                    return selectedClasses.includes('VINCULO_PESSOA');
                }
                return vehicleIds.includes(it.vinculo_veiculo_id);
            });
        });

        console.log('Abastecimentos após filtro de veículos:', fuel.length);
        console.log('Compras após filtro de veículos:', filteredPurchases.length);

        processData(fuel, maint, relevantVehicles, filteredPurchases, sales);
        processSupplierData(purchases);
        processFuelClosingData(fuel);

        if (state.currentModuleTab === 'veiculos') {
            renderSummary();
            updateKPIs();
        } else if (state.currentModuleTab === 'fornecedores') {
            updateIntelligentSupplierFilter();
            renderSupplierSummary();
            updateSupplierKPIs();
        } else if (state.currentModuleTab === 'abastecimento') {
            renderFuelSummary();
            updateFuelKPIs();
        }
        
        document.getElementById('btnExportPDF').style.display = 'flex';
        document.getElementById('btnExportFuelPDF').style.display = 'flex';
        
    } catch (err) {
        console.error('Erro ao gerar fechamento:', err);
        alert('Erro ao processar dados. Verifique o console.');
    } finally {
        showLoading(false);
    }
}

function processData(fuel, maint, vehicles, purchases, sales) {
    const grouped = {};
    const selectedClasses = Array.from(document.querySelectorAll('#classificacaoDropdown input:checked')).map(cb => cb.value);
    const selectedProps = Array.from(document.querySelectorAll('#propDropdown input:checked')).map(cb => cb.value);

    // Build product ID -> Name map
    const productMap = {};
    if (state.products) {
        state.products.forEach(p => productMap[p.id] = p.nome);
    }

    const shouldProcessEstoque = selectedClasses.includes('SAIDA_ESTOQUE');
    const shouldProcessPessoa = selectedClasses.includes('VINCULO_PESSOA');
    const hasVehicleClasses = selectedClasses.filter(c => c !== 'SAIDA_ESTOQUE' && c !== 'VINCULO_PESSOA').length > 0;
    const shouldProcessVehicles = (selectedClasses.length === 0) || hasVehicleClasses;

    if (shouldProcessEstoque) {
        // Group ONLY by client sales (estoque)
        sales.forEach(s => {
            if (s.tipo !== 'EXTERNA' || !s.cliente_nome) return;
            const owner = s.cliente_nome;
            if (selectedProps.length > 0 && !selectedProps.includes(owner)) return;

            if (!grouped[owner]) grouped[owner] = {};
            
            const subKey = "VENDA ESTOQUE";
            if (!grouped[owner][subKey]) {
                grouped[owner][subKey] = {
                    id: s.id,
                    fuel: [],
                    maint: [],
                    estoque: [],
                    totalFuel: 0,
                    totalMaint: 0,
                    totalEstoque: 0,
                    total: 0
                };
            }

            (s.venda_itens || []).forEach(it => {
                const pName = productMap[it.produto_id] || it.produto_nome || 'Produto';
                const val = (parseFloat(it.quantidade) || 0) * (parseFloat(it.valor_unitario) || 0);
                grouped[owner][subKey].estoque.push({
                    data: s.data,
                    produto: pName,
                    quantidade: it.quantidade,
                    valor_unitario: it.valor_unitario,
                    valor: val,
                    codigo: s.codigo
                });
                grouped[owner][subKey].totalEstoque += val;
                grouped[owner][subKey].total += val;
            });
        });
    }

    if (shouldProcessPessoa) {
        // Group by person (Vínculo Pessoa)
        purchases.forEach(p => {
            (p.compra_itens || []).forEach(it => {
                if (!it.vinculo_pessoa) return;
                const owner = it.vinculo_pessoa;
                if (selectedProps.length > 0 && !selectedProps.includes(owner)) return;

                if (!grouped[owner]) grouped[owner] = {};
                
                const subKey = "VÍNCULO PESSOA";
                if (!grouped[owner][subKey]) {
                    grouped[owner][subKey] = {
                        id: null,
                        fuel: [],
                        maint: [],
                        estoque: [],
                        totalFuel: 0,
                        totalMaint: 0,
                        totalEstoque: 0,
                        total: 0
                    };
                }
                const val = (parseFloat(it.quantidade) || 0) * (parseFloat(it.valor_unitario) || 0);
                
                grouped[owner][subKey].maint.push({
                    data: p.data_emissao,
                    quantidade: parseFloat(it.quantidade) || 1,
                    servicos: `${it.produto}${it.marca ? ' ('+it.marca+')' : ''}`,
                    tipo: it.tipo === 'servico' ? 'SERVIÇO (COMPRAS)' : 'PEÇA (COMPRAS)',
                    fornecedor: p.fornecedores?.nome || 'Fornecedor não inf.',
                    valor: val
                });
                
                grouped[owner][subKey].totalMaint += val;
                grouped[owner][subKey].total += val;
            });
        });
    }

    if (shouldProcessVehicles) {
        // Traditional vehicle grouping
        vehicles.forEach(v => {
            const owner = v.proprietario || 'NÃO INFORMADO';
            if (!grouped[owner]) grouped[owner] = {};
            grouped[owner][v.placa] = {
                id: v.id,
                fuel: [],
                maint: [],
                estoque: [],
                totalFuel: 0,
                totalMaint: 0,
                totalEstoque: 0,
                total: 0
            };
        });

        // Add Fueling
        fuel.forEach(f => {
            const plate = f.veiculos?.placa;
            const owner = f.veiculos?.proprietario || 'NÃO INFORMADO';
            if (grouped[owner] && grouped[owner][plate]) {
                grouped[owner][plate].fuel.push(f);
                grouped[owner][plate].totalFuel += (parseFloat(f.valor_total) || 0);
                grouped[owner][plate].total += (parseFloat(f.valor_total) || 0);
            }
        });

        // Add Purchases linked to vehicles (module COMPRAS only)
        purchases.forEach(p => {
            (p.compra_itens || []).forEach(it => {
                if (it.vinculo_pessoa) return; // Skip person links under vehicle costs
                if (!it.vinculo_veiculo_id) return;
                
                const vehicle = vehicles.find(v => v.id === it.vinculo_veiculo_id);
                if (!vehicle) return;

                const plate = vehicle.placa;
                const owner = vehicle.proprietario || 'NÃO INFORMADO';

                if (grouped[owner] && grouped[owner][plate]) {
                    const val = (parseFloat(it.quantidade) || 0) * (parseFloat(it.valor_unitario) || 0);
                    
                    grouped[owner][plate].maint.push({
                        data: p.data_emissao,
                        quantidade: parseFloat(it.quantidade) || 1,
                        servicos: `${it.produto}${it.marca ? ' ('+it.marca+')' : ''}`,
                        tipo: it.tipo === 'servico' ? 'SERVIÇO (COMPRAS)' : 'PEÇA (COMPRAS)',
                        fornecedor: p.fornecedores?.nome || 'Fornecedor não inf.',
                        valor: val
                    });
                    
                    grouped[owner][plate].totalMaint += val;
                    grouped[owner][plate].total += val;
                }
            });
        });

        // Add Stock sales/outputs linked to vehicles (SIMPLES or OS)
        sales.forEach(s => {
            if (s.tipo === 'EXTERNA') return;
            (s.venda_itens || []).forEach(it => {
                let vehicle = null;
                if (s.veiculo_id) {
                    vehicle = vehicles.find(v => v.id === s.veiculo_id);
                } else if (s.placa) {
                    vehicle = vehicles.find(v => v.placa === s.placa);
                }

                if (!vehicle) return;

                const plate = vehicle.placa;
                const owner = vehicle.proprietario || 'NÃO INFORMADO';

                if (grouped[owner] && grouped[owner][plate]) {
                    const pName = productMap[it.produto_id] || it.produto_nome || 'Produto';
                    const val = (parseFloat(it.quantidade) || 0) * (parseFloat(it.valor_unitario) || 0);
                    
                    grouped[owner][plate].estoque.push({
                        data: s.data,
                        produto: pName,
                        quantidade: it.quantidade,
                        valor_unitario: it.valor_unitario,
                        valor: val,
                        codigo: s.codigo
                    });
                    
                    grouped[owner][plate].totalEstoque += val;
                    grouped[owner][plate].total += val;
                }
            });
        });
    }

    state.closingData = grouped;
}

function processSupplierData(purchases) {
    console.log(`🔍 Processando ${purchases.length} compras para aba fornecedores...`);
    const grouped = {};
    
    // Get the IDs of categories that mean FATURADO
    const faturadoIds = (state.formasPagamento || [])
        .filter(f => f.nome.toUpperCase().trim().includes('FATURADO'))
        .map(f => f.id);
    
    console.log('IDs identificados como FATURADO:', faturadoIds);

    // Filter only INVOICED (FATURADO) purchases - Robust check
    const faturadas = purchases.filter(p => {
        // 1. Try relational join name
        const joinedNome = (p.formas_pagamento?.nome || '').toUpperCase().trim();
        if (joinedNome.includes('FATURADO')) return true;

        // 2. Try matching by ID against pre-loaded config
        const pgtoId = p.forma_pagamento_id || p.formaPgtoId;
        if (pgtoId && faturadoIds.includes(pgtoId)) return true;

        // 3. Try raw string fields (fallback for migrated data)
        const rawPgto = (p.pagamento || p.forma_pagamento || '');
        const pgtoNome = rawPgto.toString().toUpperCase().trim();
        return pgtoNome.includes('FATURADO');
    });
    
    console.log(`📈 Total de compras faturadas encontradas: ${faturadas.length}`);

    faturadas.forEach(p => {
        const supplier = p.fornecedores?.nome || p.fornecedor_nome || 'NÃO INFORMADO';
        if (!grouped[supplier]) {
            grouped[supplier] = {
                purchases: [],
                total: 0
            };
        }
        
        const totalNota = parseFloat(p.valorTotal || p.valor_total || 0);
        grouped[supplier].purchases.push(p);
        grouped[supplier].total += totalNota;
    });
    
    state.supplierClosingData = grouped;
}

function processFuelClosingData(fuel) {
    const grouped = {};
    fuel.forEach(f => {
        const postoNome = f.postos?.nome || f.cidade_posto || 'NÃO INFORMADO';
        const categoriaDesc = f.categorias_posto?.descricao || 'NÃO INFORMADA';
        const key = `${postoNome} - ${categoriaDesc}`;

        if (!grouped[key]) {
            grouped[key] = {
                posto: postoNome,
                categoria: categoriaDesc,
                records: [],
                totalVal: 0,
                totalLitros: 0,
                totalGas: 0
            };
        }

        grouped[key].records.push(f);
        grouped[key].totalVal += (parseFloat(f.valor_total) || 0);

        const fuelType = (f.tipo_combustivel || '').toUpperCase();
        const isGas = fuelType === 'GNV' || fuelType === 'GÁS' || fuelType.includes('GÁS NATURAL') || fuelType.includes('GAS NATURAL');
        if (isGas) {
            grouped[key].totalGas += (parseFloat(f.litros) || 0);
        } else {
            grouped[key].totalLitros += (parseFloat(f.litros) || 0);
        }
    });

    state.fuelClosingData = grouped;
}

function updateFuelKPIs() {
    let totalVal = 0;
    let totalLitros = 0;
    let totalGas = 0;
    const postosSet = new Set();

    Object.values(state.fuelClosingData).forEach(data => {
        totalVal += data.totalVal;
        totalLitros += data.totalLitros;
        totalGas += data.totalGas;
        postosSet.add(data.posto);
    });

    const format = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const kpiVal = document.getElementById('kpi_fuel_total_val');
    if (kpiVal) kpiVal.innerText = format(totalVal);

    const kpiPostos = document.getElementById('kpi_fuel_posto_count');
    if (kpiPostos) kpiPostos.innerText = `${postosSet.size} Postos`;

    const kpiLitros = document.getElementById('kpi_fuel_vol_litros');
    if (kpiLitros) kpiLitros.innerText = `${totalLitros.toLocaleString('pt-BR')} L`;

    const kpiGas = document.getElementById('kpi_fuel_vol_gas');
    if (kpiGas) kpiGas.innerText = `${totalGas.toLocaleString('pt-BR')} m³`;
}

function renderFuelSummary() {
    const list = document.getElementById('fuelSummaryList');
    if (!list) return;

    if (Object.keys(state.fuelClosingData).length === 0) {
        list.innerHTML = '<div class="empty-state"><p>Nenhum faturamento de abastecimento encontrado para este período.</p></div>';
        return;
    }

    let html = '<div class="summary-header"><h2>Postos e Categorias</h2></div>';
    const keys = Object.keys(state.fuelClosingData).sort((a, b) => state.fuelClosingData[b].totalVal - state.fuelClosingData[a].totalVal);

    keys.forEach(key => {
        const data = state.fuelClosingData[key];
        html += `
            <div class="plate-item ${state.selectedPosto === key ? 'active' : ''}" onclick="selectPosto('${key}')" style="margin-bottom: 0.5rem;">
                <div class="owner-info">
                    <span class="owner-name" style="font-size: 0.85rem;">${data.posto}</span>
                    <span style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase;">${data.categoria}</span>
                </div>
                <span class="owner-total" style="font-size: 0.9rem;">${data.totalVal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
            </div>
        `;
    });

    list.innerHTML = html;
}

function selectPosto(key) {
    state.selectedPosto = key;
    renderFuelSummary();

    const data = state.fuelClosingData[key];
    const detailArea = document.getElementById('fuelDetailArea');

    let html = `
        <div class="detail-header">
            <div class="detail-title">
                <h3>${data.posto}</h3>
                <p>Categoria: ${data.categoria} | Fechamento de Abastecimento</p>
            </div>
            <div style="text-align: right;">
                <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Total Abastecido</span>
                <div style="font-size: 2rem; font-weight: 900; color: var(--primary-light);">${data.totalVal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
            </div>
        </div>

        <div class="section-block">
            <h4><i data-lucide="list" style="width: 14px;"></i> Abastecimentos no Período (${data.records.length})</h4>
            <table class="mobile-cards">
                <thead>
                    <tr>
                        <th>Data / Hora</th>
                        <th>Veículo</th>
                        <th>Tipo</th>
                        <th>Quantidade</th>
                        <th class="val-col">Valor Unit.</th>
                        <th class="val-col">Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.records.sort((a,b) => new Date(a.data) - new Date(b.data)).map(f => {
                        const dateFormatted = new Date(f.data + 'T' + (f.horario || '12:00:00')).toLocaleDateString('pt-BR');
                        const unit = (f.tipo_combustivel || '').toUpperCase().includes('GÁS') ? 'm³' : 'L';
                        const valTotal = parseFloat(f.valor_total) || 0;
                        const qty = parseFloat(f.litros) || 0;
                        const unitPrice = qty > 0 ? (valTotal / qty) : 0;
                        return `
                            <tr>
                                <td data-label="Data / Hora">${dateFormatted} ${f.horario || ''}</td>
                                <td data-label="Veículo" style="font-weight: 700;">${f.veiculos?.placa || '---'}</td>
                                <td data-label="Tipo"><span class="status-pill pill-fuel">${f.tipo_combustivel || '---'}</span></td>
                                <td data-label="Quantidade">${qty.toLocaleString('pt-BR')} ${unit}</td>
                                <td data-label="Valor Unit." class="val-col">R$ ${unitPrice.toFixed(3)}</td>
                                <td data-label="Total" class="val-col" style="font-weight: 800; color: var(--primary-light);">R$ ${valTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;

    detailArea.innerHTML = html;
    lucide.createIcons();
}

function updateKPIs() {
    let totalGeral = 0;
    let totalFuel = 0;
    let totalMaint = 0;
    let totalEstoque = 0;
    let plateCount = 0;
    let fuelCount = 0;
    let maintCount = 0;
    let estoqueCount = 0;

    Object.values(state.closingData).forEach(plates => {
        Object.values(plates).forEach(p => {
            totalGeral += p.total;
            totalFuel += p.totalFuel;
            totalMaint += p.totalMaint;
            totalEstoque += (p.totalEstoque || 0);
            plateCount++;
            fuelCount += p.fuel.length;
            maintCount += p.maint.length;
            estoqueCount += (p.estoque || []).length;
        });
    });

    const format = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    document.getElementById('kpi_total_geral').innerText = format(totalGeral);
    document.getElementById('kpi_total_fuel').innerText = format(totalFuel);
    document.getElementById('kpi_total_maint').innerText = format(totalMaint);
    
    const kpiTotalEstoque = document.getElementById('kpi_total_estoque');
    if (kpiTotalEstoque) kpiTotalEstoque.innerText = format(totalEstoque);

    document.getElementById('kpi_avg_plate').innerText = format(plateCount > 0 ? totalGeral / plateCount : 0);
    
    const selectedClasses = Array.from(document.querySelectorAll('#classificacaoDropdown input:checked')).map(cb => cb.value);
    const hasEstoque = selectedClasses.includes('SAIDA_ESTOQUE');
    const hasPessoa = selectedClasses.includes('VINCULO_PESSOA');
    const hasVehicles = selectedClasses.filter(c => c !== 'SAIDA_ESTOQUE' && c !== 'VINCULO_PESSOA').length > 0;
    
    let label = 'Veículos';
    if ((hasEstoque || hasPessoa) && hasVehicles) {
        label = 'Veículos / Clientes / Pessoas';
    } else if (hasEstoque && hasPessoa) {
        label = 'Clientes / Pessoas';
    } else if (hasEstoque) {
        label = 'Clientes';
    } else if (hasPessoa) {
        label = 'Pessoas';
    }
    document.getElementById('kpi_plate_count').innerText = `${plateCount} ${label}`;
    
    document.getElementById('kpi_fuel_count').innerText = `${fuelCount} Registros`;
    document.getElementById('kpi_maint_count').innerText = `${maintCount} Ordens`;

    const kpiEstoqueCount = document.getElementById('kpi_estoque_count');
    if (kpiEstoqueCount) kpiEstoqueCount.innerText = `${estoqueCount} Saídas`;
}

function updateSupplierKPIs() {
    let totalFaturado = 0;
    let totalNotas = 0;
    let maxVolume = 0;
    let maxSupplier = '-';
    
    // Get selected suppliers from filter
    const selectedForns = Array.from(document.querySelectorAll('#fornDropdown input:checked')).map(cb => cb.value);
    let suppliers = Object.keys(state.supplierClosingData);
    
    if (selectedForns.length > 0) {
        suppliers = suppliers.filter(s => selectedForns.includes(s));
    }
    
    suppliers.forEach(sName => {
        const data = state.supplierClosingData[sName];
        totalFaturado += data.total;
        totalNotas += data.purchases.length;
        
        if (data.total > maxVolume) {
            maxVolume = data.total;
            maxSupplier = sName;
        }
    });
    
    const format = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    
    const kpiTotal = document.getElementById('kpi_forn_total');
    if (kpiTotal) kpiTotal.innerText = format(totalFaturado);
    
    const kpiCount = document.getElementById('kpi_forn_count');
    if (kpiCount) kpiCount.innerText = `${suppliers.length} Fornecedores`;
    
    const kpiNotas = document.getElementById('kpi_forn_notas_total');
    if (kpiNotas) kpiNotas.innerText = totalNotas;
    
    const kpiMax = document.getElementById('kpi_forn_max');
    if (kpiMax) kpiMax.innerText = format(maxVolume);
    
    const kpiMaxLabel = document.getElementById('kpi_forn_max_label');
    if (kpiMaxLabel) kpiMaxLabel.innerText = maxSupplier;
}

function renderSummary() {
    const list = document.getElementById('summaryList');
    if (!list) return;

    if (Object.keys(state.closingData).length === 0) {
        list.innerHTML = '<div class="empty-state"><p>Nenhum dado encontrado para este período/filtro.</p></div>';
        return;
    }

    const selectedClasses = Array.from(document.querySelectorAll('#classificacaoDropdown input:checked')).map(cb => cb.value);
    const isSaidaEstoqueOnly = selectedClasses.length === 1 && selectedClasses[0] === 'SAIDA_ESTOQUE';
    const isPessoaOnly = selectedClasses.length === 1 && selectedClasses[0] === 'VINCULO_PESSOA';
    
    let html = '';
    if (isSaidaEstoqueOnly) {
        html = '<div class="summary-header"><h2>Resumo por Cliente</h2></div>';
    } else if (isPessoaOnly) {
        html = '<div class="summary-header"><h2>Resumo por Pessoa</h2></div>';
    } else if (selectedClasses.includes('SAIDA_ESTOQUE') || selectedClasses.includes('VINCULO_PESSOA')) {
        html = '<div class="summary-header"><h2>Resumo por Proprietário / Outros</h2></div>';
    } else {
        html = '<div class="summary-header"><h2>Resumo por Proprietário</h2></div>';
    }

    // Sort owners alphabetically
    const owners = Object.keys(state.closingData).sort();

    owners.forEach(owner => {
        const plates = state.closingData[owner];
        const ownerTotal = Object.values(plates).reduce((acc, p) => acc + p.total, 0);

        html += `
            <div class="owner-group">
                <div class="owner-header" onclick="toggleOwnerGroup(this)">
                    <div class="owner-info">
                        <span class="owner-name">${owner}</span>
                        <span style="font-size: 0.7rem; color: var(--text-muted);">${plates["VENDA ESTOQUE"] ? 'Venda Estoque' : (plates["VÍNCULO PESSOA"] ? 'Vínculo Pessoa' : `${Object.keys(plates).length} veículo(s)`)}</span>
                    </div>
                    <span class="owner-total">${ownerTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                </div>
                <div class="plate-list">
                    ${Object.keys(plates).sort().map(plate => {
                        const data = plates[plate];
                        return `
                            <div class="plate-item ${state.selectedPlate === plate ? 'active' : ''}" onclick="selectPlate('${plate}', '${owner}')">
                                <span class="plate-label">${plate}</span>
                                <span class="plate-value">${data.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    });

    list.innerHTML = html;
    lucide.createIcons();
}

function selectPlate(plate, owner) {
    state.selectedPlate = plate;
    renderSummary(); // Refresh list to show active state

    const data = state.closingData[owner][plate];
    const detailArea = document.getElementById('detailArea');

    let detailSubtitle = '';
    if (plate === 'VENDA ESTOQUE') {
        detailSubtitle = `Cliente: ${owner} | Venda Externa de Estoque`;
    } else if (plate === 'VÍNCULO PESSOA') {
        detailSubtitle = `Pessoa: ${owner} | Custo sem vínculo a veículo (Compras)`;
    } else {
        const vehicle = state.vehicles.find(v => v.id === data.id || v.placa === plate);
        if (vehicle) {
            detailSubtitle = `${vehicle?.marca || ''} ${vehicle?.modelo || ''} | ${owner} | ${vehicle?.classificacao || 'S/C'}`;
        } else {
            detailSubtitle = `Custo para Pessoa | ${owner}`;
        }
    }

    let html = `
        <div class="detail-header">
            <div class="detail-title">
                <h3>${plate}</h3>
                <p>${detailSubtitle}</p>
            </div>
            <div style="text-align: right;">
                <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Custo Total</span>
                <div style="font-size: 2rem; font-weight: 900; color: var(--primary-light);">${data.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
            </div>
        </div>
    `;

    if (plate !== 'VENDA ESTOQUE' && plate !== 'VÍNCULO PESSOA') {
        // Hierarchical Fueling by Driver
        const fuelByDriver = {};
        data.fuel.forEach(f => {
            const dName = f.motorista_nome || 'NÃO INFORMADO';
            if (!fuelByDriver[dName]) fuelByDriver[dName] = { records: [], total: 0 };
            fuelByDriver[dName].records.push(f);
            fuelByDriver[dName].total += (parseFloat(f.valor_total) || 0);
        });

        html += `
            <div class="section-block">
                <h4><i data-lucide="fuel" style="width: 14px;"></i> Abastecimentos por Condutor (${data.fuel.length})</h4>
                <div class="hierarchical-list">
                    ${data.fuel.length === 0 ? '<p style="text-align:center; color:var(--text-muted); padding: 1rem;">Nenhum abastecimento no período.</p>' : 
                        Object.keys(fuelByDriver).sort().map(dName => {
                            const group = fuelByDriver[dName];
                            return `
                                <div class="driver-group" style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-card); border-radius: 10px; margin-bottom: 0.5rem; overflow: hidden;">
                                    <div class="driver-header" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'" 
                                         style="padding: 1rem; cursor: pointer; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-card);">
                                        <div style="display: flex; align-items: center; gap: 0.8rem;">
                                            <i data-lucide="user" style="width: 16px; color: var(--primary-light);"></i>
                                            <span style="font-weight: 800; font-size: 0.9rem;">${dName}</span>
                                            <span style="font-size: 0.7rem; color: var(--text-muted); background: rgba(255,255,255,0.05); padding: 0.1rem 0.4rem; border-radius: 4px;">${group.records.length} abast.</span>
                                        </div>
                                        <span style="font-weight: 800; color: #fff;">${group.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                                    </div>
                                    <div class="driver-details" style="display: none; padding: 0.5rem;">
                                        <table class="mobile-cards" style="font-size: 0.75rem;">
                                            <thead>
                                                <tr>
                                                    <th>Data</th>
                                                    <th>Tipo</th>
                                                    <th>Litros</th>
                                                    <th class="val-col">Valor Unit.</th>
                                                    <th class="val-col">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${group.records.sort((a,b) => new Date(a.data) - new Date(b.data)).map(f => `
                                                    <tr>
                                                        <td data-label="Data">${new Date(f.data + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                                                        <td data-label="Tipo"><span class="status-pill pill-fuel" style="font-size: 0.6rem;">${f.tipo_combustivel}</span></td>
                                                        <td data-label="Litros">${f.litros} L</td>
                                                        <td data-label="Valor Unit." class="val-col">R$ ${(f.valor_total / f.litros).toFixed(2)}</td>
                                                        <td data-label="Total" class="val-col" style="font-weight: 700;">R$ ${parseFloat(f.valor_total).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                                                    </tr>
                                                `).join('')}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            `;
                        }).join('')
                    }
                    ${data.fuel.length > 0 ? `
                        <div style="display: flex; justify-content: space-between; padding: 1rem; background: rgba(16, 185, 129, 0.1); border-radius: 10px; margin-top: 0.5rem;">
                            <span style="font-weight: 800; font-size: 0.9rem;">Total Abastecimento Placa</span>
                            <span style="font-weight: 900; color: #10b981; font-size: 1.1rem;">${data.totalFuel.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    if (plate !== 'VENDA ESTOQUE') {
        // Manutenções Section
        html += `
            <div class="section-block">
                <h4><i data-lucide="wrench" style="width: 14px;"></i> Manutenções (${data.maint.length})</h4>
                <table class="mobile-cards">
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th style="text-align: center;">Qtd</th>
                            <th>Serviços / Itens</th>
                            <th>Fornecedor</th>
                            <th class="val-col">Valor</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.maint.length === 0 ? '<tr><td colspan="5" data-label="Aviso" style="text-align:center; color:var(--text-muted);">Nenhuma manutenção no período.</td></tr>' : 
                            data.maint.sort((a,b) => new Date(a.data) - new Date(b.data)).map(m => {
                                return `
                                    <tr>
                                        <td data-label="Data">${new Date(m.data + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                                        <td data-label="Qtd" style="text-align: center; font-weight: 700;">${m.quantidade || 1}</td>
                                        <td data-label="Serviços / Itens">
                                            <div style="font-weight: 700;">${m.servicos}</div>
                                            <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase;">${m.tipo}</div>
                                        </td>
                                        <td data-label="Fornecedor">${m.fornecedor}</td>
                                        <td data-label="Valor" class="val-col" style="font-weight: 700;">R$ ${m.valor.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                                    </tr>
                                  `;
                            }).join('')
                        }
                    </tbody>
                </table>
                ${data.maint.length > 0 ? `
                    <div style="display: flex; justify-content: space-between; padding: 1rem; background: rgba(245, 158, 11, 0.1); border-radius: 10px; margin-top: 0.8rem;">
                        <span style="font-weight: 800; font-size: 0.9rem;">Subtotal Manutenção</span>
                        <span style="font-weight: 900; color: #f59e0b; font-size: 1.1rem;">${data.totalMaint.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                    </div>
                ` : ''}
            </div>
        `;
    }

    // Saídas / Venda de Estoque Section
    const listEstoque = data.estoque || [];
    html += `
        <div class="section-block">
            <h4><i data-lucide="package" style="width: 14px;"></i> Saídas e Vendas de Estoque (${listEstoque.length})</h4>
            <table class="mobile-cards">
                <thead>
                    <tr>
                        <th>Data</th>
                        <th>Cód. Venda</th>
                        <th>Produto / SKU</th>
                        <th style="text-align: center;">Qtd</th>
                        <th class="val-col">Valor Unit.</th>
                        <th class="val-col">Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${listEstoque.length === 0 ? '<tr><td colspan="6" data-label="Aviso" style="text-align:center; color:var(--text-muted);">Nenhuma movimentação de estoque no período.</td></tr>' : 
                        listEstoque.sort((a,b) => new Date(a.data) - new Date(b.data)).map(e => {
                            return `
                                <tr>
                                    <td data-label="Data">${new Date(e.data).toLocaleDateString('pt-BR')}</td>
                                    <td data-label="Cód. Venda"><span class="status-pill pill-fuel" style="font-size: 0.65rem; background: rgba(99, 102, 241, 0.1); color: var(--primary-light); border-color: rgba(99, 102, 241, 0.2);">${e.codigo || 'S/C'}</span></td>
                                    <td data-label="Produto / SKU" style="font-weight: 700;">${e.produto}</td>
                                    <td data-label="Qtd" style="text-align: center; font-weight: 700;">${parseFloat(e.quantidade)}</td>
                                    <td data-label="Valor Unit." class="val-col">R$ ${parseFloat(e.valor_unitario).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                                    <td data-label="Total" class="val-col" style="font-weight: 800; color: var(--primary-light);">R$ ${parseFloat(e.valor).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                                </tr>
                            `;
                        }).join('')
                    }
                </tbody>
            </table>
            ${listEstoque.length > 0 ? `
                <div style="display: flex; justify-content: space-between; padding: 1rem; background: rgba(99, 102, 241, 0.1); border-radius: 10px; margin-top: 0.8rem;">
                    <span style="font-weight: 800; font-size: 0.9rem;">Subtotal Estoque</span>
                    <span style="font-weight: 900; color: var(--primary-light); font-size: 1.1rem;">${data.totalEstoque.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                </div>
            ` : ''}
        </div>
    `;

    detailArea.innerHTML = html;
    lucide.createIcons();
}

function renderSupplierSummary() {
    const list = document.getElementById('fornSummaryList');
    if (!list) return;

    if (Object.keys(state.supplierClosingData).length === 0) {
        list.innerHTML = '<div class="empty-state"><p>Nenhum faturamento encontrado para este período.</p></div>';
        return;
    }

    let html = '<div class="summary-header"><h2>Fornecedores Faturados</h2></div>';
    
    const selectedForns = Array.from(document.querySelectorAll('#fornDropdown input:checked')).map(cb => cb.value);
    
    let suppliers = Object.keys(state.supplierClosingData);
    
    // Applying filter
    if (selectedForns.length > 0) {
        suppliers = suppliers.filter(s => selectedForns.includes(s));
    }

    suppliers.sort((a,b) => state.supplierClosingData[b].total - state.supplierClosingData[a].total);

    suppliers.forEach(sName => {
        const data = state.supplierClosingData[sName];
        html += `
            <div class="plate-item ${state.selectedSupplier === sName ? 'active' : ''}" onclick="selectSupplier('${sName}')" style="margin-bottom: 0.5rem;">
                <div class="owner-info">
                    <span class="owner-name" style="font-size: 0.85rem;">${sName}</span>
                    <span style="font-size: 0.7rem; color: var(--text-muted);">${data.purchases.length} nota(s)</span>
                </div>
                <span class="owner-total" style="font-size: 0.9rem;">${data.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
            </div>
        `;
    });

    list.innerHTML = html;
}

function selectSupplier(sName) {
    state.selectedSupplier = sName;
    renderSupplierSummary();

    const data = state.supplierClosingData[sName];
    const detailArea = document.getElementById('fornDetailArea');

    let html = `
        <div class="detail-header">
            <div class="detail-title">
                <h3>${sName}</h3>
                <p>Fechamento de Fornecedor | ${state.periodLabel}</p>
            </div>
            <div style="text-align: right;">
                <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Total Faturado</span>
                <div style="font-size: 2rem; font-weight: 900; color: var(--primary-light);">${data.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
            </div>
        </div>

        <div class="section-block">
            <h4><i data-lucide="file-text" style="width: 14px;"></i> Notas Faturadas (${data.purchases.length})</h4>
            <table class="mobile-cards" id="fornDetailTable">
                <thead>
                    <tr>
                        <th class="sortable-th" onclick="sortSupplierTable('data_emissao', '${sName}')">
                            <span>Data</span><span class="sort-icon" id="sort-icon-data_emissao">${state.supplierSort.col === 'data_emissao' ? (state.supplierSort.dir === 'asc' ? '↑' : '↓') : '↕'}</span>
                        </th>
                        <th class="sortable-th" onclick="sortSupplierTable('numero_nota', '${sName}')">
                            <span>Nº Nota</span><span class="sort-icon" id="sort-icon-numero_nota">${state.supplierSort.col === 'numero_nota' ? (state.supplierSort.dir === 'asc' ? '↑' : '↓') : '↕'}</span>
                        </th>
                        <th class="sortable-th" onclick="sortSupplierTable('especie', '${sName}')">
                            <span>Espécie</span><span class="sort-icon" id="sort-icon-especie">${state.supplierSort.col === 'especie' ? (state.supplierSort.dir === 'asc' ? '↑' : '↓') : '↕'}</span>
                        </th>
                        <th class="sortable-th" onclick="sortSupplierTable('centro_custo', '${sName}')">
                            <span>Centro Custo</span><span class="sort-icon" id="sort-icon-centro_custo">${state.supplierSort.col === 'centro_custo' ? (state.supplierSort.dir === 'asc' ? '↑' : '↓') : '↕'}</span>
                        </th>
                        <th class="sortable-th val-col" onclick="sortSupplierTable('valor_total', '${sName}')">
                            <span>Valor Total</span><span class="sort-icon" id="sort-icon-valor_total">${state.supplierSort.col === 'valor_total' ? (state.supplierSort.dir === 'asc' ? '↑' : '↓') : '↕'}</span>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    ${getSortedPurchases(data.purchases).map(p => `
                        <tr onclick="toggleFornItems('${p.id}')" style="cursor: pointer;">
                            <td data-label="Data">${new Date(p.data_emissao + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                            <td data-label="Nº Nota" style="font-weight: 700;">${p.numeroNota || p.numero_nota || '-'}</td>
                            <td data-label="Espécie">${p.especie || '-'}</td>
                            <td data-label="Centro Custo">${p.centro || p.centro_custo || '-'}</td>
                            <td data-label="Valor Total" class="val-col" style="font-weight: 800; color: var(--primary-light);">R$ ${parseFloat(p.valorTotal || p.valor_total).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                        </tr>
                        <tr id="items-${p.id}" style="display: none; background: rgba(0,0,0,0.15);">
                            <td colspan="5" style="padding: 1rem;">
                                <div style="font-size: 0.7rem; font-weight: 800; color: var(--text-muted); margin-bottom: 0.5rem; text-transform: uppercase;">Itens da Nota:</div>
                                <table style="font-size: 0.75rem; background: none; border: none;">
                                    <thead>
                                        <tr style="background: none;">
                                            <th style="border: none;">Produto/Serviço</th>
                                            <th style="border: none; text-align: center;">Placa</th>
                                            <th style="border: none;">Qtd</th>
                                            <th style="border: none; text-align: right;">Unit.</th>
                                            <th style="border: none; text-align: right;">Subtotal</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${(p.compra_itens || []).map(it => {
                                            const plate = it.vinculo_pessoa || state.vehicles.find(v => v.id === it.vinculo_veiculo_id)?.placa || '-';
                                            return `
                                                <tr style="background: none; border-color: rgba(255,255,255,0.05);">
                                                    <td style="border: none;">${it.produto} ${it.marca ? '['+it.marca+']' : ''}</td>
                                                    <td style="border: none; text-align: center;"><span class="status-pill" style="font-size: 0.6rem; padding: 2px 4px;">${plate}</span></td>
                                                    <td style="border: none;">${it.quantidade} ${it.unidade || ''}</td>
                                                    <td style="border: none; text-align: right;">R$ ${parseFloat(it.valor_unitario).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                                                    <td style="border: none; text-align: right; font-weight: 700;">R$ ${(it.quantidade * it.valor_unitario).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                                                </tr>
                                            `;
                                        }).join('')}
                                    </tbody>
                                </table>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <!-- NEW: Consolidation / Discount Section -->
        <div class="section-block" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); margin-top: 1.5rem; padding: 1.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.2rem;">
                <h4 style="margin:0;"><i data-lucide="calculator" style="width: 14px;"></i> Consolidação de Valores</h4>
                <div style="background: rgba(99, 102, 241, 0.1); padding: 0.4rem 0.8rem; border-radius: 6px; font-size: 0.75rem; color: var(--primary-light); font-weight: 700;">
                    Valor Bruto: ${data.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </div>
            </div>

            <div id="discounts_container">
                ${(data.discounts || [{}]).map((dsc, idx) => `
                    <div class="discount-row" style="display: grid; grid-template-columns: 2fr 1fr 1fr auto; gap: 0.8rem; align-items: end; margin-bottom: 1rem;">
                        <div class="input-group">
                            <label>Descrição</label>
                            <input type="text" class="dsc-desc" placeholder="Ex: Antecipação" value="${dsc.desc || ''}" oninput="updateAllDiscounts('${sName}')">
                        </div>
                        <div class="input-group">
                            <label>Tipo</label>
                            <select class="dsc-type" onchange="updateAllDiscounts('${sName}')">
                                <option value="FIXO" ${dsc.type === 'FIXO' ? 'selected' : ''}>R$ (Valor Fixo)</option>
                                <option value="PERC" ${dsc.type === 'PERC' ? 'selected' : ''}>% (Percentual)</option>
                            </select>
                        </div>
                        <div class="input-group">
                            <label>Valor</label>
                            <input type="number" class="dsc-value" placeholder="0.00" value="${dsc.value || ''}" oninput="updateAllDiscounts('${sName}')">
                        </div>
                        <button class="btn-icon" style="color: #ef4444; background: rgba(239, 68, 68, 0.1); border: none; padding: 10px; border-radius: 6px; cursor: pointer; margin-bottom: 2px;" onclick="removeDiscountRow('${sName}', ${idx})">
                            <i data-lucide="trash-2" style="width: 14px;"></i>
                        </button>
                    </div>
                `).join('')}
            </div>

            <button class="btn-secondary" style="font-size: 0.7rem; padding: 0.5rem 0.8rem; margin-top: 0.5rem;" onclick="addDiscountRow('${sName}')">
                <i data-lucide="plus" style="width: 12px;"></i> Adicionar outro desconto
            </button>

            <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 1.5rem; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 1.5rem;">
                <div style="display: flex; gap: 0.8rem;">
                    <button class="btn-export" onclick="exportToPDF()" style="padding: 0.6rem 1rem; font-size: 0.7rem; background: var(--warning); border: none; border-radius: 6px; cursor: pointer; color: white; display: flex; align-items: center; gap: 5px;">
                        <i data-lucide="file-text" style="width: 14px;"></i> PDF Consolidado
                    </button>
                    <button class="btn-export secondary" onclick="exportDetailedReportPDF()" style="padding: 0.6rem 1rem; font-size: 0.7rem; background: var(--success); border: none; border-radius: 6px; cursor: pointer; color: white; display: flex; align-items: center; gap: 5px;">
                        <i data-lucide="file-check" style="width: 14px;"></i> Relatório Detalhado
                    </button>
                </div>
                <div style="text-align: right;">
                    <span style="font-size: 0.7rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Valor Líquido a Pagar</span>
                    <div id="liquido_total" style="font-size: 2.2rem; font-weight: 900; color: #10b981;">
                        ${(data.total - (data.discountAmount || 0)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </div>
                    ${(data.totalDiscount || 0) > 0 ? `<span id="discount_hint" style="font-size: 0.75rem; color: #ef4444; font-weight: 600;">Total descontado: ${data.totalDiscount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>` : ''}
                </div>
            </div>
        </div>
    `;

    detailArea.innerHTML = html;
    lucide.createIcons();
}

// ============================================================
//  SORT FUNCTIONS — Supplier Detail Table
// ============================================================

function getSortedPurchases(purchases) {
    const { col, dir } = state.supplierSort;
    return [...purchases].sort((a, b) => {
        let valA, valB;
        switch (col) {
            case 'data_emissao':
                valA = new Date(a.data_emissao);
                valB = new Date(b.data_emissao);
                break;
            case 'numero_nota':
                valA = parseInt(a.numeroNota || a.numero_nota || 0) || (a.numeroNota || a.numero_nota || '').toLowerCase();
                valB = parseInt(b.numeroNota || b.numero_nota || 0) || (b.numeroNota || b.numero_nota || '').toLowerCase();
                break;
            case 'especie':
                valA = (a.especie || '').toLowerCase();
                valB = (b.especie || '').toLowerCase();
                break;
            case 'centro_custo':
                valA = (a.centro || a.centro_custo || '').toLowerCase();
                valB = (b.centro || b.centro_custo || '').toLowerCase();
                break;
            case 'valor_total':
                valA = parseFloat(a.valorTotal || a.valor_total || 0);
                valB = parseFloat(b.valorTotal || b.valor_total || 0);
                break;
            default:
                valA = new Date(a.data_emissao);
                valB = new Date(b.data_emissao);
        }
        if (valA < valB) return dir === 'asc' ? -1 : 1;
        if (valA > valB) return dir === 'asc' ? 1 : -1;
        return 0;
    });
}

window.sortSupplierTable = (col, sName) => {
    if (state.supplierSort.col === col) {
        state.supplierSort.dir = state.supplierSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
        state.supplierSort.col = col;
        state.supplierSort.dir = 'asc';
    }
    selectSupplier(sName);
};

// Discount Management Functions
window.addDiscountRow = (sName) => {
    const data = state.supplierClosingData[sName];
    if (!data.discounts) data.discounts = [{ desc: '', type: 'FIXO', value: 0 }];
    data.discounts.push({ desc: '', type: 'FIXO', value: 0 });
    selectSupplier(sName); // Re-render this part
}

window.removeDiscountRow = (sName, idx) => {
    const data = state.supplierClosingData[sName];
    data.discounts.splice(idx, 1);
    if (data.discounts.length === 0) data.discounts = [{ desc: '', type: 'FIXO', value: 0 }];
    selectSupplier(sName);
    updateAllDiscounts(sName);
}

window.updateAllDiscounts = (sName) => {
    const data = state.supplierClosingData[sName];
    const container = document.getElementById('discounts_container');
    const rows = container.querySelectorAll('.discount-row');
    
    data.discounts = [];
    let totalDiscount = 0;

    rows.forEach(row => {
        const desc = row.querySelector('.dsc-desc').value;
        const type = row.querySelector('.dsc-type').value;
        const val = parseFloat(row.querySelector('.dsc-value').value) || 0;
        
        let amount = 0;
        if (type === 'PERC') {
            amount = data.total * (val / 100);
        } else {
            amount = val;
        }

        data.discounts.push({ desc, type, value: val, amount });
        totalDiscount += amount;
    });
    
    data.totalDiscount = totalDiscount;
    const liquido = data.total - totalDiscount;
    
    const liquidoEl = document.getElementById('liquido_total');
    if (liquidoEl) {
        liquidoEl.innerText = liquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        
        // Update hint
        let hint = document.getElementById('discount_hint');
        if (totalDiscount > 0) {
            if (!hint) {
                hint = document.createElement('span');
                hint.id = "discount_hint";
                hint.style.cssText = "font-size: 0.75rem; color: #ef4444; font-weight: 600;";
                liquidoEl.parentNode.appendChild(hint);
            }
            hint.innerText = `Total descontado: ${totalDiscount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
        } else if (hint) {
            hint.remove();
        }
    }
}

window.toggleFornItems = (id) => {
    const el = document.getElementById(`items-${id}`);
    if (el) el.style.display = el.style.display === 'none' ? 'table-row' : 'none';
};

function toggleOwnerGroup(header) {
    const list = header.nextElementSibling;
    list.style.display = list.style.display === 'none' ? 'flex' : 'none';
}

// --- PDF Export ---
function exportToPDF() {
    if (state.currentModuleTab === 'fornecedores') {
        exportSupplierConsolidatedPDF();
        return;
    }
    if (state.currentModuleTab === 'abastecimento') {
        exportFuelConsolidatedPDF();
        return;
    }
    const { jsPDF } = window.jspdf;
    const doc = jsPDF('p', 'mm', 'a4');
    
    const margin = 15;
    let y = 20;

    const title = `FECHAMENTO - ${state.periodLabel}`;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(title, margin, y);
    
    y += 8;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, margin, y);
    
    const selectedClasses = Array.from(document.querySelectorAll('#classificacaoDropdown input:checked')).map(cb => cb.value);
    const filterClass = selectedClasses.length > 0 ? selectedClasses.join(', ') : 'TODAS';
    const selectedProps = Array.from(document.querySelectorAll('#propDropdown input:checked')).map(cb => cb.value);
    
    y += 5;
    doc.text(`Filtro Classificação: ${filterClass}`, margin, y);
    if (selectedProps.length > 0) {
        y += 5;
        doc.text(`Proprietários: ${selectedProps.join(', ')}`, margin, y);
    }

    y += 12;

    // Table of Summary
    const summaryRows = [];
    let grandTotal = 0;

    Object.keys(state.closingData).sort().forEach(owner => {
        const plates = state.closingData[owner];
        const ownerTotal = Object.values(plates).reduce((acc, p) => acc + p.total, 0);
        grandTotal += ownerTotal;

        // Header for Owner
        summaryRows.push([
            { content: owner.toUpperCase(), colSpan: 5, styles: { fillColor: [230, 230, 230], fontStyle: 'bold' } }
        ]);

        Object.keys(plates).sort().forEach(plate => {
            const data = plates[plate];
            summaryRows.push([
                plate,
                data.totalFuel.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
                data.totalMaint.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
                (data.totalEstoque || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
                data.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
            ]);
        });

        summaryRows.push([
            { content: 'SUBTOTAL', colSpan: 4, styles: { fontStyle: 'bold', halign: 'right' } },
            { content: ownerTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), styles: { fontStyle: 'bold' } }
        ]);
    });

    summaryRows.push([
        { content: 'TOTAL GERAL DO PERÍODO', colSpan: 4, styles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'right' } },
        { content: grandTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), styles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: 'bold' } }
    ]);

    doc.autoTable({
        startY: y,
        head: [['IDENTIFICAÇÃO', 'ABASTECIMENTO (R$)', 'MANUTENÇÃO (R$)', 'ESTOQUE (R$)', 'TOTAL (R$)']],
        body: summaryRows,
        theme: 'grid',
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] },
        styles: { fontSize: 8 },
        columnStyles: {
            1: { halign: 'right' },
            2: { halign: 'right' },
            3: { halign: 'right' },
            4: { halign: 'right' }
        }
    });

    doc.save(`FECHAMENTO_${state.periodLabel.replace(' ','_')}_${selectedClasses.join('_') || 'TODAS'}.pdf`);
}

function exportSupplierConsolidatedPDF() {
    const { jsPDF } = window.jspdf;
    const doc = jsPDF('p', 'mm', 'a4');
    const margin = 15;
    const pageWidth = doc.internal.pageSize.width;
    let y = 20;

    // Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(30, 41, 59);
    doc.text(`CONSOLIDADO FORNECEDORES`, margin, y);
    
    y += 7;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`${state.periodLabel.toUpperCase()} | Gerado em: ${new Date().toLocaleString('pt-BR')}`, margin, y);

    const selectedForns = Array.from(document.querySelectorAll('#fornDropdown input:checked')).map(cb => cb.value);
    let suppliersToExport = Object.keys(state.supplierClosingData);
    if (selectedForns.length > 0) suppliersToExport = suppliersToExport.filter(s => selectedForns.includes(s));
    suppliersToExport.sort((a,b) => state.supplierClosingData[b].total - state.supplierClosingData[a].total);

    // KPI Section in PDF (Mock UI Cards)
    y += 12;
    let grandBruto = 0;
    let grandLiquid = 0;
    let grandNotes = 0;

    suppliersToExport.forEach(s => {
        const d = state.supplierClosingData[s];
        grandBruto += d.total;
        grandLiquid += (d.total - (d.totalDiscount || 0));
        grandNotes += d.purchases.length;
    });

    const cardWidth = (pageWidth - (margin * 2) - 10) / 3;
    
    // Card 1: Total Bruto
    doc.setFillColor(30, 41, 59);
    doc.roundedRect(margin, y, cardWidth, 20, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.text('TOTAL BRUTO', margin + 5, y + 6);
    doc.setFontSize(11);
    doc.text(grandBruto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), margin + 5, y + 13);
    
    // Card 2: Notas
    doc.setFillColor(16, 185, 129); // Success Green
    doc.roundedRect(margin + cardWidth + 5, y, cardWidth, 20, 2, 2, 'F');
    doc.text('TOTAL DE NOTAS', margin + cardWidth + 10, y + 6);
    doc.setFontSize(11);
    doc.text(`${grandNotes} Faturadas`, margin + cardWidth + 10, y + 13);

    // Card 3: Valor Líquido
    doc.setFillColor(79, 70, 229); // Indigo
    doc.roundedRect(margin + (cardWidth * 2) + 10, y, cardWidth, 20, 2, 2, 'F');
    doc.text('TOTAL LÍQUIDO A PAGAR', margin + (cardWidth * 2) + 15, y + 6);
    doc.setFontSize(11);
    doc.text(grandLiquid.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), margin + (cardWidth * 2) + 15, y + 13);

    y += 30;
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('RELAÇÃO DE NOTAS E LANÇAMENTOS POR FORNECEDOR', margin, y);

    suppliersToExport.forEach((sName, index) => {
        const data = state.supplierClosingData[sName];
        
        // Supplier Section Header
        y += 8;
        if (y > 270) { doc.addPage(); y = 20; }
        
        doc.setFillColor(241, 245, 249);
        doc.rect(margin, y, pageWidth - (margin * 2), 7, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.text(sName.toUpperCase(), margin + 2, y + 4.5);
        y += 7.5;

        // Table of Notes for this supplier
        const noteRows = getSortedPurchases(data.purchases).map(p => {
             return [
                new Date(p.data_emissao + 'T12:00:00').toLocaleDateString('pt-BR'),
                p.numeroNota || p.numero_nota || '-',
                p.especie || '-',
                parseFloat(p.valorTotal || p.valor_total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
            ];
        });

        doc.autoTable({
            startY: y,
            head: [['DATA', 'Nº NOTA', 'ESPÉCIE', 'VALOR TOTAL (R$)']],
            body: noteRows,
            theme: 'grid',
            headStyles: { fillColor: [71, 85, 105], fontSize: 7, cellPadding: 1 },
            styles: { fontSize: 7, cellPadding: 1 },
            columnStyles: { 3: { halign: 'right' } },
            margin: { left: margin },
            tableWidth: pageWidth - (margin * 2)
        });

        y = doc.lastAutoTable.finalY + 4;

        // Supplier Sub-summary
        if (y > 270) { doc.addPage(); y = 20; }
        doc.setFontSize(7.5);
        const liquid = data.total - (data.totalDiscount || 0);
        doc.text(`Subtotal Bruto: R$ ${data.total.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`, pageWidth - margin, y, { align: 'right' });
        
        if (data.totalDiscount > 0) {
            (data.discounts || []).forEach(dsc => {
                if (dsc.amount > 0) {
                    y += 3.5;
                    doc.setTextColor(239, 68, 68);
                    doc.text(`${dsc.desc || 'Desconto'}: - R$ ${dsc.amount.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`, pageWidth - margin, y, { align: 'right' });
                }
            });
            doc.setTextColor(30, 41, 59);
        }
        
        y += 4.5;
        doc.setFont('helvetica', 'bold');
        doc.text(`LÍQUIDO A PAGAR (${sName}): R$ ${liquid.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`, pageWidth - margin, y, { align: 'right' });
        y += 6;
    });

    const finalY = (y > 270) ? 20 : y + 10;
    if (y > 270) doc.addPage();
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.text('Documento gerado automaticamente pelo sistema de fechamento FrotaLink.', margin, finalY);

    doc.save(`CONSOLIDADO_FORNECEDORES_${state.periodLabel.replace(' ','_')}.pdf`);
}

function exportDetailedReportPDF() {
    const modal = document.getElementById('modalExportOptions');
    if (modal) {
        modal.style.display = 'flex';
        if (window.lucide) lucide.createIcons();
    }
}

window.closeExportModal = () => {
    const modal = document.getElementById('modalExportOptions');
    if (modal) modal.style.display = 'none';
};

window.triggerDetailedExport = (format) => {
    closeExportModal();
    if (format === 'PDF') {
        generateDetailedReportPDF();
    } else if (format === 'EXCEL') {
        exportDetailedReportExcel();
    }
};

function generateDetailedReportPDF() {
    if (state.currentModuleTab === 'fornecedores') {
        exportSupplierDetailedPDF();
        return;
    }
    if (state.currentModuleTab === 'abastecimento') {
        exportFuelDetailedPDF();
        return;
    }
    const { jsPDF } = window.jspdf;
    const doc = jsPDF('p', 'mm', 'a4');
    const margin = 15;
    let y = 20;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59);
    doc.text(`RELATÓRIO DETALHADO DE CUSTOS - ${state.periodLabel}`, margin, y);
    
    y += 8;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, margin, y);
    
    const selectedClasses = Array.from(document.querySelectorAll('#classificacaoDropdown input:checked')).map(cb => cb.value);
    const filterClassSelected = selectedClasses.length > 0 ? selectedClasses.join(', ') : 'TODAS';
    y += 5;
    doc.text(`Filtro Classificação: ${filterClassSelected}`, margin, y);
    
    // Filter owners based on selected ones in propDropdown
    const selectedProps = Array.from(document.querySelectorAll('#propDropdown input:checked')).map(cb => {
        const lbl = cb.nextElementSibling;
        return lbl ? lbl.textContent.trim().toUpperCase() : cb.value.toUpperCase();
    });
    
    let ownersToExport = Object.keys(state.closingData);
    if (selectedProps.length > 0) {
        ownersToExport = ownersToExport.filter(owner => selectedProps.includes(owner.toUpperCase()));
    }

    // Calculate Grand Total for selected owners
    let grandTotal = 0;
    ownersToExport.forEach(owner => {
        const plates = state.closingData[owner];
        Object.values(plates).forEach(data => {
            grandTotal += (parseFloat(data.total) || 0);
        });
    });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(79, 70, 229); // Indigo
    doc.text(`VALOR TOTAL GERAL: R$ ${grandTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, margin + 110, y);
    
    y += 10;

    // Iterate through filtered Owners & Plates
    ownersToExport.sort().forEach(owner => {
        const plates = state.closingData[owner];
        Object.keys(plates).sort().forEach(plate => {
            const data = plates[plate];
            
            // Check page overflow
            if (y > 230) {
                doc.addPage();
                y = 20;
            }

            // Print Major Header
            doc.setFillColor(30, 41, 59);
            doc.rect(margin, y, 180, 10, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(255, 255, 255);
            doc.text(`${plate} | PROPRIETÁRIO: ${owner.toUpperCase()}`, margin + 5, y + 6.5);
            
            // Right-aligned cost
            const totalStr = `TOTAL: R$ ${data.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
            doc.text(totalStr, margin + 175 - doc.getTextWidth(totalStr), y + 6.5);
            
            y += 15;

            // SECTION 1: Abastecimentos
            if (data.fuel && data.fuel.length > 0) {
                if (y > 250) { doc.addPage(); y = 20; }
                
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(9);
                doc.setTextColor(99, 102, 241); // var(--primary-light) blue
                doc.text(`ABASTECIMENTOS POR CONDUTOR (${data.fuel.length})`, margin, y);
                y += 4;

                const fuelByDriver = {};
                data.fuel.forEach(f => {
                    const dName = f.motorista_nome || 'NÃO INFORMADO';
                    if (!fuelByDriver[dName]) fuelByDriver[dName] = { count: 0, total: 0 };
                    fuelByDriver[dName].count++;
                    fuelByDriver[dName].total += (parseFloat(f.valor_total) || 0);
                });

                const fuelRows = Object.keys(fuelByDriver).sort().map(dName => {
                    const group = fuelByDriver[dName];
                    return [
                        dName,
                        `${group.count} abast.`,
                        group.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
                    ];
                });

                // Add subtotal row
                fuelRows.push([
                    { content: 'Total Abastecimento Placa', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold', fillColor: [241, 245, 249] } },
                    { content: data.totalFuel.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), styles: { fontStyle: 'bold', fillColor: [209, 250, 229], textColor: [5, 150, 105] } }
                ]);

                doc.autoTable({
                    startY: y,
                    head: [['CONDUTOR', 'QTD ABAST.', 'TOTAL (R$)']],
                    body: fuelRows,
                    theme: 'grid',
                    headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255] },
                    styles: { fontSize: 7.5, cellPadding: 2 },
                    columnStyles: {
                        1: { halign: 'center' },
                        2: { halign: 'right' }
                    }
                });

                y = doc.lastAutoTable.finalY + 8;
            }

            // SECTION 2: Manutenções
            if (data.maint && data.maint.length > 0) {
                if (y > 250) { doc.addPage(); y = 20; }
                
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(9);
                doc.setTextColor(99, 102, 241); // var(--primary-light) blue
                doc.text(`MANUTENÇÕES (${data.maint.length})`, margin, y);
                y += 4;

                const maintRows = data.maint.sort((a,b) => new Date(a.data) - new Date(b.data)).map(m => {
                    return [
                        new Date(m.data + 'T12:00:00').toLocaleDateString('pt-BR'),
                        `${m.servicos} (${m.tipo})`,
                        m.fornecedor,
                        m.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
                    ];
                });

                // Add subtotal row
                maintRows.push([
                    { content: 'Subtotal Manutenção', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold', fillColor: [241, 245, 249] } },
                    { content: data.totalMaint.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), styles: { fontStyle: 'bold', fillColor: [254, 243, 199], textColor: [217, 119, 6] } }
                ]);

                doc.autoTable({
                    startY: y,
                    head: [['DATA', 'SERVIÇOS / ITENS', 'FORNECEDOR', 'VALOR (R$)']],
                    body: maintRows,
                    theme: 'grid',
                    headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255] },
                    styles: { fontSize: 7.5, cellPadding: 2 },
                    columnStyles: {
                        3: { halign: 'right' }
                    }
                });

                y = doc.lastAutoTable.finalY + 8;
            }

            // SECTION 3: Saídas e Vendas de Estoque
            if (data.estoque && data.estoque.length > 0) {
                if (y > 250) { doc.addPage(); y = 20; }
                
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(9);
                doc.setTextColor(99, 102, 241); // var(--primary-light) blue
                doc.text(`SAÍDAS E VENDAS DE ESTOQUE (${data.estoque.length})`, margin, y);
                y += 4;

                const estoqueRows = data.estoque.sort((a,b) => new Date(a.data) - new Date(b.data)).map(e => {
                    return [
                        new Date(e.data).toLocaleDateString('pt-BR'),
                        e.codigo || 'S/C',
                        e.produto,
                        parseFloat(e.quantidade),
                        parseFloat(e.valor_unitario).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
                        parseFloat(e.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
                    ];
                });

                // Add subtotal row
                estoqueRows.push([
                    { content: 'Subtotal Estoque', colSpan: 5, styles: { halign: 'right', fontStyle: 'bold', fillColor: [241, 245, 249] } },
                    { content: data.totalEstoque.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), styles: { fontStyle: 'bold', fillColor: [224, 231, 255], textColor: [79, 70, 229] } }
                ]);

                doc.autoTable({
                    startY: y,
                    head: [['DATA', 'CÓD. VENDA', 'PRODUTO / SKU', 'QTD', 'VALOR UNIT.', 'TOTAL (R$)']],
                    body: estoqueRows,
                    theme: 'grid',
                    headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255] },
                    styles: { fontSize: 7.5, cellPadding: 2 },
                    columnStyles: {
                        5: { halign: 'right' }
                    }
                });

                y = doc.lastAutoTable.finalY + 12;
            } else {
                y += 4;
            }
        });
    });

    doc.save(`RELATORIO_DETALHADO_${state.periodLabel.replace(' ','_')}.pdf`);
}

function exportSupplierDetailedPDF() {
    const { jsPDF } = window.jspdf;
    const doc = jsPDF('p', 'mm', 'a4');
    const margin = 10; // Reduzi margem para caber mais
    const pageWidth = doc.internal.pageSize.width;
    let y = 15;

    const selectedForns = Array.from(document.querySelectorAll('#fornDropdown input:checked')).map(cb => cb.value);
    let suppliersToExport = Object.keys(state.supplierClosingData);
    if (selectedForns.length > 0) suppliersToExport = suppliersToExport.filter(s => selectedForns.includes(s));
    suppliersToExport.sort();

    suppliersToExport.forEach((sName, index) => {
        if (index > 0) {
            doc.addPage();
            y = 15;
        }

        const data = state.supplierClosingData[sName];

        // Header Compacto
        doc.setFillColor(30, 41, 59);
        doc.rect(margin, y, pageWidth - (margin * 2), 10, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(255, 255, 255);
        doc.text(sName.toUpperCase(), margin + 5, y + 6.5);
        
        const netTotal = data.total - (data.totalDiscount || 0);
        const totalStr = `NET TOTAL: R$ ${netTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        doc.text(totalStr, pageWidth - margin - 5 - doc.getTextWidth(totalStr), y + 6.5);
        
        y += 14;
        doc.setTextColor(30, 41, 59);
        doc.setFontSize(8);
        doc.text(`RELATÓRIO DE FECHAMENTO - ${state.periodLabel} | Gerado em ${new Date().toLocaleDateString('pt-BR')}`, margin, y);
        y += 6;

        getSortedPurchases(data.purchases).forEach(p => {
            if (y > 270) {
                doc.addPage();
                y = 15;
            }

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(79, 70, 229);
            doc.text(`NOTA #${p.numeroNota || p.numero_nota || '-'} | DATA: ${new Date(p.data_emissao + 'T12:00:00').toLocaleDateString('pt-BR')} | VALOR: R$ ${parseFloat(p.valorTotal || p.valor_total).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`, margin, y);
            y += 2.5;

            const itemRows = (p.compra_itens || []).map(it => {
                const plate = state.vehicles.find(v => v.id === it.vinculo_veiculo_id)?.placa || '-';
                return [
                    it.produto + (it.marca ? ` [${it.marca}]` : ''),
                    plate,
                    it.quantidade,
                    parseFloat(it.valor_unitario).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
                    (it.quantidade * it.valor_unitario).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
                ];
            });

            doc.autoTable({
                startY: y,
                head: [['ITEM/SERVIÇO', 'PLACA', 'QTD', 'UNIT', 'TOTAL (R$)']],
                body: itemRows,
                theme: 'striped',
                headStyles: { fillColor: [100, 116, 139], fontSize: 6.5, cellPadding: 1 },
                styles: { fontSize: 6, cellPadding: 1 },
                columnStyles: { 1: { halign: 'center', fontStyle: 'bold' }, 2: { halign: 'center' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
                margin: { left: margin },
                tableWidth: pageWidth - (margin * 2)
            });

            y = doc.lastAutoTable.finalY + 5;
        });

        // Summary Footer at end of supplier
        if (y > 250) { doc.addPage(); y = 15; }
        y += 5;
        doc.setDrawColor(200);
        doc.line(margin, y, pageWidth - margin, y);
        y += 8;
        doc.setFontSize(9);
        doc.setTextColor(30, 41, 59);
        doc.text(`RESUMO DE VALORES:`, margin, y);
        y += 5;
        doc.setFontSize(8);
        doc.text(`Valor Bruto Acumulado:`, margin, y);
        doc.text(`R$ ${data.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, pageWidth - margin - 30, y, { align: 'right' });
        
        if (data.totalDiscount > 0) {
            (data.discounts || []).forEach(dsc => {
                if (dsc.amount > 0) {
                    y += 4;
                    doc.setTextColor(239, 68, 68);
                    doc.text(`${dsc.desc || 'Desconto'}:`, margin, y);
                    doc.text(`- R$ ${dsc.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, pageWidth - margin - 30, y, { align: 'right' });
                }
            });
            doc.setTextColor(30, 41, 59);
        }

        y += 6;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(`VALOR LÍQUIDO A PAGAR:`, margin, y);
        doc.setTextColor(16, 185, 129);
        doc.text(`R$ ${netTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, pageWidth - margin - 30, y, { align: 'right' });
    });

    doc.save(`DETALHADO_FORNECEDORES_${state.periodLabel.replace(' ','_')}.pdf`);
}

function exportFuelConsolidatedPDF() {
    const { jsPDF } = window.jspdf;
    const doc = jsPDF('p', 'mm', 'a4');
    const margin = 15;
    const pageWidth = doc.internal.pageSize.width;
    let y = 20;

    // Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(30, 41, 59);
    doc.text(`FECHAMENTO ABASTECE - POSTOS`, margin, y);
    
    y += 7;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`${state.periodLabel.toUpperCase()} | Gerado em: ${new Date().toLocaleString('pt-BR')}`, margin, y);

    const keys = Object.keys(state.fuelClosingData).sort((a, b) => state.fuelClosingData[b].totalVal - state.fuelClosingData[a].totalVal);

    // KPI Section in PDF (Mock UI Cards)
    y += 12;
    let grandBruto = 0;
    let grandLitros = 0;
    let grandGas = 0;

    keys.forEach(k => {
        const d = state.fuelClosingData[k];
        grandBruto += d.totalVal;
        grandLitros += d.totalLitros;
        grandGas += d.totalGas;
    });

    const cardWidth = (pageWidth - (margin * 2) - 10) / 3;
    
    // Card 1: Total
    doc.setFillColor(30, 41, 59);
    doc.roundedRect(margin, y, cardWidth, 20, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.text('TOTAL ABASTECIDO', margin + 5, y + 6);
    doc.setFontSize(11);
    doc.text(grandBruto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), margin + 5, y + 13);
    
    // Card 2: Litros
    doc.setFillColor(79, 70, 229);
    doc.roundedRect(margin + cardWidth + 5, y, cardWidth, 20, 2, 2, 'F');
    doc.text('VOL. LÍQUIDOS (L)', margin + cardWidth + 10, y + 6);
    doc.setFontSize(11);
    doc.text(`${grandLitros.toLocaleString('pt-BR')} L`, margin + cardWidth + 10, y + 13);

    // Card 3: Gás
    doc.setFillColor(16, 185, 129);
    doc.roundedRect(margin + (cardWidth * 2) + 10, y, cardWidth, 20, 2, 2, 'F');
    doc.text('VOL. GNV (m³)', margin + (cardWidth * 2) + 15, y + 6);
    doc.setFontSize(11);
    doc.text(`${grandGas.toLocaleString('pt-BR')} m³`, margin + (cardWidth * 2) + 15, y + 13);

    y += 30;
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('CONCILIAÇÃO POR POSTO E CATEGORIA', margin, y);

    y += 8;

    const rows = keys.map(k => {
        const d = state.fuelClosingData[k];
        return [
            d.posto,
            d.categoria.toUpperCase(),
            d.records.length.toString(),
            `${d.totalLitros.toLocaleString('pt-BR')} L`,
            `${d.totalGas.toLocaleString('pt-BR')} m³`,
            d.totalVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
        ];
    });

    rows.push([
        { content: 'TOTAL GERAL', colSpan: 5, styles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'right' } },
        { content: grandBruto.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), styles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: 'bold' } }
    ]);

    doc.autoTable({
        startY: y,
        head: [['POSTO', 'CATEGORIA', 'ABASTECIMENTOS', 'VOL. LÍQUIDOS', 'VOL. GÁS', 'TOTAL (R$)']],
        body: rows,
        theme: 'grid',
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] },
        styles: { fontSize: 8 },
        columnStyles: {
            2: { halign: 'center' },
            3: { halign: 'right' },
            4: { halign: 'right' },
            5: { halign: 'right' }
        }
    });

    doc.save(`CONSOLIDADO_ABASTECIMENTO_${state.periodLabel.replace(' ','_')}.pdf`);
}

function exportFuelDetailedPDF() {
    const { jsPDF } = window.jspdf;
    const doc = jsPDF('p', 'mm', 'a4');
    const margin = 10;
    const pageWidth = doc.internal.pageSize.width;
    let y = 15;

    // Filter keys by selected post categories and selected posts in dropdowns
    const selectedCats = Array.from(document.querySelectorAll('#catPostoDropdown input:checked')).map(cb => {
        const lbl = cb.nextElementSibling;
        return lbl ? lbl.textContent.trim().toUpperCase() : cb.value.toUpperCase();
    });
    const selectedPostos = Array.from(document.querySelectorAll('#postoDropdown input:checked')).map(cb => {
        const lbl = cb.nextElementSibling;
        return lbl ? lbl.textContent.trim().toUpperCase() : cb.value.toUpperCase();
    });

    let keys = Object.keys(state.fuelClosingData);
    if (selectedCats.length > 0) {
        keys = keys.filter(k => selectedCats.includes(state.fuelClosingData[k].categoria.toUpperCase()));
    }
    if (selectedPostos.length > 0) {
        keys = keys.filter(k => selectedPostos.includes(state.fuelClosingData[k].posto.toUpperCase()));
    }
    keys.sort();

    keys.forEach((key, index) => {
        if (index > 0) {
            doc.addPage();
            y = 15;
        }

        const data = state.fuelClosingData[key];

        // Header
        doc.setFillColor(30, 41, 59);
        doc.rect(margin, y, pageWidth - (margin * 2), 10, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(255, 255, 255);
        doc.text(`${data.posto.toUpperCase()} (${data.categoria.toUpperCase()})`, margin + 5, y + 6.5);
        
        const totalStr = `TOTAL: R$ ${data.totalVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        doc.text(totalStr, pageWidth - margin - 5 - doc.getTextWidth(totalStr), y + 6.5);
        
        y += 14;
        doc.setTextColor(30, 41, 59);
        doc.setFontSize(8);
        doc.text(`RELATÓRIO DETALHADO DE ABASTECIMENTOS - ${state.periodLabel} | Gerado em ${new Date().toLocaleDateString('pt-BR')}`, margin, y);
        y += 6;

        const recordsRows = data.records.sort((a,b) => new Date(a.data) - new Date(b.data)).map(f => {
            const valTotal = parseFloat(f.valor_total) || 0;
            const qty = parseFloat(f.litros) || 0;
            const unit = (f.tipo_combustivel || '').toUpperCase().includes('GÁS') ? 'm³' : 'L';
            const unitPrice = qty > 0 ? (valTotal / qty) : 0;
            return [
                new Date(f.data + 'T' + (f.horario || '12:00:00')).toLocaleDateString('pt-BR') + ' ' + (f.horario || ''),
                f.veiculos?.placa || '---',
                f.tipo_combustivel || '---',
                `${qty.toLocaleString('pt-BR')} ${unit}`,
                `R$ ${unitPrice.toFixed(3)}`,
                valTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
            ];
        });

        doc.autoTable({
            startY: y,
            head: [['DATA/HORA', 'VEÍCULO', 'COMBUSTÍVEL', 'QUANTIDADE', 'V. UNIT', 'TOTAL (R$)']],
            body: recordsRows,
            theme: 'striped',
            headStyles: { fillColor: [100, 116, 139], fontSize: 7, cellPadding: 2 },
            styles: { fontSize: 6.5, cellPadding: 2 },
            columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
            margin: { left: margin },
            tableWidth: pageWidth - (margin * 2)
        });

        y = doc.lastAutoTable.finalY + 8;
        
        if (y > 250) { doc.addPage(); y = 15; }
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(`RESUMO DO POSTO:`, margin, y);
        y += 5;
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(`Volume Líquido Total: ${data.totalLitros.toLocaleString('pt-BR')} L`, margin, y);
        y += 4;
        doc.text(`Volume GNV Total: ${data.totalGas.toLocaleString('pt-BR')} m³`, margin, y);
        y += 5;
        doc.setFont('helvetica', 'bold');
        doc.text(`VALOR TOTAL ACUMULADO: R$ ${data.totalVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, margin, y);
    });

    doc.save(`DETALHADO_ABASTECIMENTO_POSTOS_${state.periodLabel.replace(' ','_')}.pdf`);
}

function exportDetailedReportExcel() {
    if (state.currentModuleTab === 'fornecedores') {
        exportSupplierDetailedExcel();
        return;
    }
    if (state.currentModuleTab === 'abastecimento') {
        exportFuelDetailedExcel();
        return;
    }
    
    // Caso de Custo Veicular
    const wb = XLSX.utils.book_new();
    
    const fuelData = [];
    const maintData = [];
    const estoqueData = [];

    // Filter owners based on selected ones in propDropdown
    const selectedProps = Array.from(document.querySelectorAll('#propDropdown input:checked')).map(cb => {
        const lbl = cb.nextElementSibling;
        return lbl ? lbl.textContent.trim().toUpperCase() : cb.value.toUpperCase();
    });
    
    let ownersToExport = Object.keys(state.closingData);
    if (selectedProps.length > 0) {
        ownersToExport = ownersToExport.filter(owner => selectedProps.includes(owner.toUpperCase()));
    }
    
    ownersToExport.sort().forEach(owner => {
        const plates = state.closingData[owner];
        Object.keys(plates).sort().forEach(plate => {
            const data = plates[plate];
            
            if (data.fuel && data.fuel.length > 0) {
                data.fuel.sort((a,b) => new Date(a.data) - new Date(b.data)).forEach(f => {
                    const total = parseFloat(f.valor_total) || 0;
                    const qty = parseFloat(f.litros) || 0;
                    fuelData.push({
                        'DATA': new Date(f.data + 'T12:00:00').toLocaleDateString('pt-BR'),
                        'PLACA': plate,
                        'PROPRIETÁRIO': owner.toUpperCase(),
                        'CONDUTOR': f.motorista_nome || 'NÃO INFORMADO',
                        'TIPO COMBUSTÍVEL': f.tipo_combustivel,
                        'LITROS': qty,
                        'V. UNIT.': qty > 0 ? (total / qty) : 0,
                        'TOTAL (R$)': total
                    });
                });
            }
            
            if (data.maint && data.maint.length > 0) {
                data.maint.sort((a,b) => new Date(a.data) - new Date(b.data)).forEach(m => {
                    maintData.push({
                        'DATA': new Date(m.data + 'T12:00:00').toLocaleDateString('pt-BR'),
                        'PLACA': plate,
                        'PROPRIETÁRIO': owner.toUpperCase(),
                        'SERVIÇOS / ITENS': `${m.servicos} (${m.tipo})`,
                        'FORNECEDOR': m.fornecedor,
                        'VALOR (R$)': m.valor
                    });
                });
            }
            
            if (data.estoque && data.estoque.length > 0) {
                data.estoque.sort((a,b) => new Date(a.data) - new Date(b.data)).forEach(e => {
                    estoqueData.push({
                        'DATA': new Date(e.data).toLocaleDateString('pt-BR'),
                        'PLACA': plate,
                        'PROPRIETÁRIO': owner.toUpperCase(),
                        'CÓD. VENDA': e.codigo || 'S/C',
                        'PRODUTO / SKU': e.produto,
                        'QTD': parseFloat(e.quantidade) || 0,
                        'VALOR UNIT.': parseFloat(e.valor_unitario) || 0,
                        'TOTAL (R$)': parseFloat(e.valor) || 0
                    });
                });
            }
        });
    });
    
    if (fuelData.length > 0) {
        const ws = XLSX.utils.json_to_sheet(fuelData);
        XLSX.utils.book_append_sheet(wb, ws, "Abastecimentos");
    }
    if (maintData.length > 0) {
        const ws = XLSX.utils.json_to_sheet(maintData);
        XLSX.utils.book_append_sheet(wb, ws, "Manutenções");
    }
    if (estoqueData.length > 0) {
        const ws = XLSX.utils.json_to_sheet(estoqueData);
        XLSX.utils.book_append_sheet(wb, ws, "Saídas Estoque");
    }
    
    if (wb.SheetNames.length === 0) {
        alert("Nenhum dado encontrado para exportar!");
        return;
    }
    
    XLSX.writeFile(wb, `RELATORIO_DETALHADO_VEICULOS_${state.periodLabel.replace(' ','_')}.xlsx`);
}

function exportSupplierDetailedExcel() {
    const selectedForns = Array.from(document.querySelectorAll('#fornDropdown input:checked')).map(cb => cb.value);
    let suppliersToExport = Object.keys(state.supplierClosingData);
    if (selectedForns.length > 0) suppliersToExport = suppliersToExport.filter(s => selectedForns.includes(s));
    suppliersToExport.sort();
    
    const excelRows = [];
    
    suppliersToExport.forEach(sName => {
        const data = state.supplierClosingData[sName];
        data.purchases.forEach(p => {
            (p.compra_itens || []).forEach(it => {
                const plate = state.vehicles.find(v => v.id === it.vinculo_veiculo_id)?.placa || '-';
                excelRows.push({
                    'FORNECEDOR': sName.toUpperCase(),
                    'NOTA': p.numeroNota || p.numero_nota || '-',
                    'DATA EMISSÃO': new Date(p.data_emissao + 'T12:00:00').toLocaleDateString('pt-BR'),
                    'ITEM/SERVIÇO': it.produto + (it.marca ? ` [${it.marca}]` : ''),
                    'PLACA': plate,
                    'QTD': parseFloat(it.quantidade) || 0,
                    'UNIT': parseFloat(it.valor_unitario) || 0,
                    'TOTAL (R$)': (parseFloat(it.quantidade) || 0) * (parseFloat(it.valor_unitario) || 0)
                });
            });
        });
    });
    
    if (excelRows.length === 0) {
        alert("Nenhum registro para exportar!");
        return;
    }
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelRows);
    XLSX.utils.book_append_sheet(wb, ws, "Fornecedores Detalhado");
    XLSX.writeFile(wb, `DETALHADO_FORNECEDORES_${state.periodLabel.replace(' ','_')}.xlsx`);
}

function exportFuelDetailedExcel() {
    // Filter keys by selected categories and selected posts in dropdowns
    const selectedCats = Array.from(document.querySelectorAll('#catPostoDropdown input:checked')).map(cb => {
        const lbl = cb.nextElementSibling;
        return lbl ? lbl.textContent.trim().toUpperCase() : cb.value.toUpperCase();
    });
    const selectedPostos = Array.from(document.querySelectorAll('#postoDropdown input:checked')).map(cb => {
        const lbl = cb.nextElementSibling;
        return lbl ? lbl.textContent.trim().toUpperCase() : cb.value.toUpperCase();
    });

    let keys = Object.keys(state.fuelClosingData);
    if (selectedCats.length > 0) {
        keys = keys.filter(k => selectedCats.includes(state.fuelClosingData[k].categoria.toUpperCase()));
    }
    if (selectedPostos.length > 0) {
        keys = keys.filter(k => selectedPostos.includes(state.fuelClosingData[k].posto.toUpperCase()));
    }
    keys.sort();

    const excelRows = [];
    
    keys.forEach(key => {
        const data = state.fuelClosingData[key];
        data.records.forEach(f => {
            const valTotal = parseFloat(f.valor_total) || 0;
            const qty = parseFloat(f.litros) || 0;
            const unit = (f.tipo_combustivel || '').toUpperCase().includes('GÁS') ? 'm³' : 'L';
            const unitPrice = qty > 0 ? (valTotal / qty) : 0;
            excelRows.push({
                'POSTO': data.posto.toUpperCase(),
                'CATEGORIA': data.categoria.toUpperCase(),
                'DATA/HORA': new Date(f.data + 'T' + (f.horario || '12:00:00')).toLocaleDateString('pt-BR') + ' ' + (f.horario || ''),
                'VEÍCULO': f.veiculos?.placa || '---',
                'COMBUSTÍVEL': f.tipo_combustivel || '---',
                'QUANTIDADE': `${qty} ${unit}`,
                'V. UNIT': unitPrice,
                'TOTAL (R$)': valTotal
            });
        });
    });
    
    if (excelRows.length === 0) {
        alert("Nenhum abastecimento encontrado para exportar!");
        return;
    }
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelRows);
    XLSX.utils.book_append_sheet(wb, ws, "Postos Detalhado");
    XLSX.writeFile(wb, `DETALHADO_ABASTECIMENTO_POSTOS_${state.periodLabel.replace(' ','_')}.xlsx`);
}

