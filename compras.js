// ============================================================
console.log("🛠️ Compras.js: INICIANDO CARREGAMENTO...");

const ADMIN_PASSWORD = "M@nu2398";

let compras = [];
let currentPage = 1;
const pageSize = 200;
let editId = null;
let config = {
    fornecedores: [],
    tiposPgto: [],
    centrosCusto: [],
    especiesNota: [],
    categorias: []
};

let isAdmin = true;
let currentTab = 'compras';
let currentSubTab = 'fornecedores';
let inventoryProducts = []; 
let vehicles = []; 
let drivers = []; 
let maintActions = []; 
let maintTypes = []; 
let charts = {
    evolucao: null,
    mix: null,
    centroCusto: null,
    topFornecedores: null,
    veiculos: null,
    pecas: null
};
// Global Supabase Client
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;
let currentCCBreakdown = { sortedCCs: [], ccMap: {}, grandTotalItems: 0 };

const COL_DEFS = {
    compras: [
        { key: 'data', label: 'Data', visible: true },
        { key: 'numeroNota', label: 'Nº Nota', visible: true },
        { key: 'especie', label: 'Espécie', visible: true },
        { key: 'fornecedor', label: 'Fornecedor', visible: true },
        { key: 'placa', label: 'Placa', visible: true },
        { key: 'itens_count', label: 'Qtd Itens', visible: true },
        { key: 'valorTotal', label: 'Valor Total', visible: true },
        { key: 'pagamento', label: 'Pagamento', visible: true },
        { key: 'centro', label: 'Centro Custo', visible: false },
        { key: 'actions', label: 'Ações', visible: true }
    ],
    generic: [
        { key: 'id', label: 'ID', visible: true },
        { key: 'nome', label: 'Nome / Descrição', visible: true },
        { key: 'actions', label: 'Ações', visible: true }
    ]
};

let currentSort = { key: 'data', dir: 'desc' };

document.addEventListener('DOMContentLoaded', async () => {
    await loadInventoryProducts(); 
    await loadVehicles(); 
    await loadDrivers();
    await loadSuppliers(); 
    await loadMaintenanceConfigs(); 
    await loadConfigFromSupabase(); 
    await loadCompras(); 
    updateDropdowns();
    
    // Initialize "All" filter by default
    const datePreset = document.getElementById('filterDatePreset');
    if (datePreset) {
        datePreset.value = 'all';
        handleDatePresetChange(datePreset);
    } else {
        renderCompras();
        updateDashboard();
    }
    
    document.getElementById('compraForm').addEventListener('submit', handleSaveCompra);
    document.getElementById('compraSearch').addEventListener('input', renderCompras);
    document.getElementById('genericSearch').addEventListener('input', () => renderGenericTab(currentSubTab));
    document.getElementById('fornecedorForm').addEventListener('submit', handleSaveFornecedor);
    document.getElementById('custoForm').addEventListener('submit', handleSaveCusto);
    document.getElementById('genericForm').addEventListener('submit', handleSaveGeneric);
    
    // Vencimento automático para pagamento FATURADO (dia 10 do mês seguinte)
    const updateVencimentoFaturado = () => {
        const selectedPgtoId = document.getElementById('tipoPgtoId').value;
        const pgto = (config.tiposPgto || []).find(p => p.id == selectedPgtoId);
        if (pgto && pgto.nome && pgto.nome.toUpperCase().includes('FATURADO')) {
            const dataCompraValue = document.getElementById('dataCompra').value;
            if (dataCompraValue) {
                const parts = dataCompraValue.split('-');
                const year = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10);
                
                let nextMonth = month + 1;
                let nextYear = year;
                if (nextMonth > 12) {
                    nextMonth = 1;
                    nextYear++;
                }
                
                const monthStr = String(nextMonth).padStart(2, '0');
                document.getElementById('vencimentoNota').value = `${nextYear}-${monthStr}-10`;
            }
        }
    };
    document.getElementById('tipoPgtoId').addEventListener('change', updateVencimentoFaturado);
    document.getElementById('dataCompra').addEventListener('change', updateVencimentoFaturado);
    
    // Aplicar máscaras de CPF/CNPJ e Telefone no Fornecedor
    applyMask(document.getElementById('fDoc'), maskCnpjCpf);
    applyMask(document.getElementById('fTel'), maskTelefone);
    
    if (window.lucide) lucide.createIcons();

    // Verificação proativa de duplicidade
    document.getElementById('numNota').addEventListener('change', window.checkDuplicateNota);
    document.getElementById('fornecedorId').addEventListener('change', window.checkDuplicateNota);

    // Atalhos de Teclado Globais
    window.addEventListener('keydown', (e) => {
        // F2: Lançar Compra
        if (e.key === 'F2') {
            e.preventDefault();
            const modal = document.getElementById('compraModal');
            if (modal && !modal.classList.contains('active')) {
                openCompraModal();
            }
            return;
        }

        const activeModal = document.querySelector('.modal-overlay.active');
        if (!activeModal) return;

        // ESC: Sair/Fechar
        if (e.key === 'Escape') {
            // Se for o modal de visualizar (leitura), fecha sempre
            if (activeModal.id === 'viewCompraModal') {
                closeViewModal();
                return;
            }

            // Para modais de formulário, só fecha se estiver vazio
            const form = activeModal.querySelector('form');
            let hasData = false;
            if (form) {
                const inputs = form.querySelectorAll('input:not([type="hidden"]), select, textarea');
                inputs.forEach(i => {
                    if (i.value && i.value !== i.defaultValue && i.type !== 'radio' && i.type !== 'checkbox') hasData = true;
                    if ((i.type === 'radio' || i.type === 'checkbox') && i.checked !== i.defaultChecked) hasData = true;
                });
                
                // Especial para Itens da Nota
                if (activeModal.id === 'compraModal') {
                    const rows = document.querySelectorAll('.item-row');
                    if (rows.length > 1) hasData = true; // Mais de um item já é dado
                    const firstRow = rows[0];
                    if (firstRow) {
                        const q = firstRow.querySelector('.item-qtd')?.value;
                        const u = firstRow.querySelector('.item-unit')?.value;
                        if ((q && q > 0) || (u && u > 0)) hasData = true;
                    }
                }
            }

            if (!hasData || confirm("Há dados preenchidos no formulário. Tem certeza de que deseja sair e perder as alterações não salvas?")) {
                if (activeModal.id === 'compraModal') closeCompraModal();
                else if (activeModal.id === 'fornecedorModal') closeFornecedorModal();
                else if (activeModal.id === 'custoModal') closeCustoModal();
                else if (activeModal.id === 'genericModal') closeGenericModal();
            }
        }

        // CTRL + ENTER: Salvar
        if (e.key === 'Enter' && e.ctrlKey) {
            const saveBtn = activeModal.querySelector('.btn-save');
            if (saveBtn && !saveBtn.disabled && activeModal.id !== 'viewCompraModal') {
                e.preventDefault();
                saveBtn.click();
            }
        } else if (e.key === 'Enter') {
            // Impedir envio do formulário com Enter simples, permitindo apenas se autocomplete estiver aberto para seleção
            const isAutocompleteOpen = document.querySelector('.autocomplete-results[style*="block"]');
            if (!isAutocompleteOpen) {
                e.preventDefault();
            }
        }
    });
});


async function loadInventoryProducts() {
    console.log("📦 Carregando produtos do estoque...");
    if (supabaseClient) {
        try {
            const { data, error } = await supabaseClient.from('estoque').select('*').order('nome');
            if (error) throw error;
            if (data) {
                inventoryProducts = data;
                console.log(`✅ ${data.length} produtos carregados do Supabase.`);
                return;
            }
        } catch (e) { 
            console.error("❌ Erro ao buscar estoque no Supabase:", e); 
        }
    }
}

window.refreshInventoryProducts = async (btn) => {
    const icon = btn.querySelector('i');
    if (icon) icon.classList.add('spin-animation');
    btn.disabled = true;
    
    await loadInventoryProducts();
    
    setTimeout(() => {
        if (icon) icon.classList.remove('spin-animation');
        btn.disabled = false;
        alert('Lista de produtos atualizada!');
    }, 500);
};

async function loadVehicles() {
    if (window.supabase) {
        try {
            const { data, error } = await supabaseClient.from('veiculos').select('id, placa').order('placa').limit(2000);
            if (!error && data) {
                vehicles = data;
                console.log(`✅ ${data.length} veículos carregados do Supabase.`);
                return;
            }
        } catch (e) { console.error("Error loading vehicles:", e); }
    }
}

async function loadDrivers() {
    if (window.supabase) {
        try {
            const { data, error } = await supabaseClient.from('motoristas').select('id, nome_completo').order('nome_completo');
            if (!error && data) {
                drivers = data;
                console.log(`✅ ${data.length} condutores carregados do Supabase.`);
                return;
            }
        } catch (e) { console.error("Error loading drivers:", e); }
    }
}

async function loadSuppliers() {
    if (supabaseClient) {
        try {
            const { data, error } = await supabaseClient.from('fornecedores').select('*').order('nome');
            if (!error && data && data.length > 0) {
                // Merge with local config or prioritize Supabase
                // For now, let's update the config.fornecedores with Supabase data
                // but keep local ones that might not be in Supabase yet
                const supabaseIds = new Set(data.map(f => f.id));
                const localOnly = config.fornecedores.filter(f => !supabaseIds.has(f.id));
                config.fornecedores = [...data, ...localOnly];
                console.log(`✅ ${data.length} fornecedores carregados do Supabase.`);
                updateDropdowns();
            }
        } catch (e) { console.error("Error loading suppliers:", e); }
    }
}

async function loadMaintenanceConfigs() {
    if (supabaseClient) {
        try {
            const { data: a } = await supabaseClient.from('manutencao_acoes').select('*').order('descricao');
            const { data: t } = await supabaseClient.from('manutencao_tipos').select('*').order('descricao');
            maintActions = a || [];
            maintTypes = t || [];
            console.log(`✅ ${maintActions.length} ações e ${maintTypes.length} tipos de manutenção carregados.`);
        } catch (e) { console.error("Error loading maintenance configs:", e); }
    }
}

async function loadConfigFromSupabase() {
    const client = window.authClient || supabaseClient;
    if (!client) return;
    try {
        console.log("⚙️ Sincronizando configurações com o banco...");
        const { data: forns } = await client.from('fornecedores').select('*').order('nome');
        const { data: pgtos } = await client.from('formas_pagamento').select('*').order('nome');
        const { data: custos } = await client.from('centros_custo').select('*').order('codigo');
        const { data: esps } = await client.from('especies_nota').select('*').order('nome');
        const { data: cats, error: catsErr } = await client.from('fin_plano_contas').select('*').order('codigo');

        if (catsErr) {
            console.error("❌ Erro ao buscar fin_plano_contas:", catsErr);
        } else {
            console.log(`✅ ${cats ? cats.length : 0} categorias de despesas carregadas do Plano de Contas.`);
        }

        if (forns) config.fornecedores = forns;
        if (pgtos) config.tiposPgto = pgtos;
        if (custos) {
            config.centrosCusto = custos.map(c => ({
                id: c.id,
                nome: c.nome,
                cod: c.codigo,
                parentId: c.parent_id
            }));
        }
        if (esps) config.especiesNota = esps;
        if (cats) config.categorias = cats;
        
        console.log("⚙️ Configurações sincronizadas com Supabase.");
    } catch (err) {
        console.error("❌ Erro ao carregar configs do Supabase:", err);
    }
}

async function loadCompras() {
    const client = window.authClient || supabaseClient;
    if (!client) return;
    console.log("📡 Carregando compras do Supabase...");
    
    try {
        // 1. Fetch main records
        const { data: cloudCompras, error: cErr } = await client.from('compras').select('*');
        if (cErr) throw cErr;

        // 2. Fetch children
        const { data: cloudItens } = await client.from('compra_itens').select('*');
        const { data: cloudAdds } = await client.from('compra_adicionais').select('*');
        const { data: cloudParcs } = await client.from('compra_parcelas').select('*');

        // 3. Map to internal format
        const mappedCompras = (cloudCompras || []).map(c => {
            return {
                ...c,
                id: c.id,
                data: c.data_emissao,
                numeroNota: c.numero_nota,
                especieId: c.especie_id,
                fornecedorId: c.fornecedor_id,
                formaPgtoId: c.forma_pagamento_id,
                categoriaId: c.categoria_id,
                vencimento: c.data_vencimento,
                valorTotal: parseFloat(c.valor_total),
                qtdParcelas: c.qtd_parcelas,
                financeiro: c.financeiro_parcelado,
                integradoFinanceiro: c.integrado_financeiro,
                dataIntegracao: c.data_integracao,
                itens: (cloudItens || []).filter(it => it.compra_id === c.id).map(it => ({
                    tipo: it.tipo,
                    produto: it.produto,
                    marca: it.marca,
                    quantidade: parseFloat(it.quantidade),
                    valorUnitario: parseFloat(it.valor_unitario),
                    estoque: it.estoque,
                    veiculoId: it.vinculo_veiculo_id,
                    pessoa: it.vinculo_pessoa,
                    produtoId: it.produto_id,
                    centroCustoId: it.centro_custo_id,
                    // Maintenance Fields
                    maintControl: it.maint_control || false,
                    maintTipoId: it.maint_tipo_id || '',
                    maintAcaoId: it.maint_acao_id || '',
                    maintKm: it.maint_km || '',
                    maintControle: it.maint_controle || 'NENHUMA',
                    maintIntervaloKm: it.maint_intervalo_km || '',
                    maintIntervaloMeses: it.maint_intervalo_meses || '',
                    maintGarantia: it.maint_garantia || false,
                    maintMesesGarantia: it.maint_meses_garantia || ''
                })),
                adicionais: (cloudAdds || []).filter(ad => ad.compra_id === c.id).map(ad => ({
                    descricao: ad.descricao,
                    valor: parseFloat(ad.valor)
                })),
                parcelasData: (cloudParcs || []).filter(p => p.compra_id === c.id).map(p => ({
                    data: p.data_vencimento,
                    valor: parseFloat(p.valor)
                })),
                observacoes: c.observacoes
            };
        });

        // 4. RECOVERY LOGIC: Check for "orphaned" maintenance records that have a Purchase ID
        const { data: maintItems, error: mErr } = await client.from('manutencao_itens').select('*, manutencoes(*)').filter('descricao', 'ilike', '%[ID:%');
        
        if (mErr) console.warn("⚠️ Erro ao buscar manutenções para recuperação:", mErr);

        if (maintItems && maintItems.length > 0) {
            const purchaseIdsInCloud = new Set(mappedCompras.map(c => c.id));
            const purchaseIdsInLocal = new Set(compras.map(c => c.id));
            
            maintItems.forEach(mi => {
                const match = mi.descricao.match(/\[ID:([^\]]+)\]/);
                if (match) {
                    const pId = match[1];
                    // Skip if already in cloud or local
                    if (!purchaseIdsInCloud.has(pId) && !purchaseIdsInLocal.has(pId)) {
                        console.log(`🩹 Recuperando compra órfã detectada em manutenção: ${pId}`);
                        
                        // Handle case where manutencoes might be an array or object
                        const m = Array.isArray(mi.manutencoes) ? mi.manutencoes[0] : mi.manutencoes;
                        
                        if (m) {
                            mappedCompras.push({
                                id: pId,
                                data: m.data,
                                numeroNota: 'RECUPERADA',
                                fornecedorId: m.oficina_id || m.fornecedor_id, // Try both
                                valorTotal: parseFloat(mi.valor_servicos || 0) + parseFloat(mi.valor_pecas || 0),
                                itens: [{
                                    produto: mi.descricao.replace(/\[ID:[^\]]+\]/, '').trim(),
                                    quantidade: 1,
                                    valorUnitario: parseFloat(mi.valor_servicos || 0) + parseFloat(mi.valor_pecas || 0),
                                    tipo: 'servico'
                                }],
                                recuperada: true
                            });
                            purchaseIdsInCloud.add(pId); // Avoid duplicates for same ID
                        }
                    }
                }
            });
        }

        // 5. Update local state
        compras = mappedCompras;
        console.log(`✅ ${mappedCompras.length} compras carregadas do Supabase.`);
    } catch (err) {
        console.error("❌ Erro ao carregar compras do Supabase:", err);
    }
}

// --- Máscaras de Input ---
function maskCnpjCpf(value) {
    if (!value) return '';
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
    if (!value) return '';
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
    if (!inputEl) return;
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

// --- Modal Fornecedor ---

window.openFornecedorModal = (id = null) => {
    const modal = document.getElementById('fornecedorModal');
    const form = document.getElementById('fornecedorForm');
    modal.classList.add('active');
    form.reset();
    document.getElementById('editFornecedorId').value = '';

    if (id) {
        const f = config.fornecedores.find(x => x.id == id);
        if (f) {
            document.getElementById('editFornecedorId').value = f.id;
            document.getElementById('fNome').value = f.nome || '';
            document.getElementById('fDoc').value = maskCnpjCpf(f.cnpj || f.doc || f.cnpj_cpf || '');
            document.getElementById('fIE').value = f.ie || '';
            document.getElementById('fRua').value = f.rua || f.endereco || '';
            document.getElementById('fCidade').value = f.cidade || '';
            document.getElementById('fTel').value = maskTelefone(f.tel || f.contato || '');
            document.getElementById('fEmail').value = f.email || '';
        }
    }
    if (window.lucide) lucide.createIcons();
};

window.closeFornecedorModal = () => {
    document.getElementById('fornecedorModal').classList.remove('active');
};

async function handleSaveFornecedor(e) {
    e.preventDefault();
    const id = document.getElementById('editFornecedorId').value;
    const isEditing = !!id;
    if (!canDo('compras_cadastros', isEditing ? 'edit' : 'add')) {
        alert(`Você não tem permissão para ${isEditing ? 'editar' : 'cadastrar'} fornecedores.`);
        return;
    }
    const data = {
        nome: document.getElementById('fNome').value,
        cnpj_cpf: document.getElementById('fDoc').value,
        endereco: document.getElementById('fRua').value,
        cidade: document.getElementById('fCidade').value,
        contato: document.getElementById('fTel').value,
        email: document.getElementById('fEmail').value
    };

    if (supabaseClient) {
        try {
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
            const { data: saved, error } = (id && isUuid) 
                ? await supabaseClient.from('fornecedores').update(data).eq('id', id).select().single()
                : await supabaseClient.from('fornecedores').insert([data]).select().single();

            if (error) throw error;
            
            if (id && isUuid) {
                const idx = config.fornecedores.findIndex(x => x.id == id);
                if (idx !== -1) config.fornecedores[idx] = saved;
            } else {
                config.fornecedores.push(saved);
                const searchInput = document.getElementById('fornecedorSearch');
                const hiddenInput = document.getElementById('fornecedorId');
                if (searchInput && hiddenInput) {
                    searchInput.value = saved.nome;
                    hiddenInput.value = saved.id;
                    if (window.checkDuplicateNota) window.checkDuplicateNota();
                }
            }
            alert('Fornecedor salvo com sucesso!');
        } catch (err) {
            console.error("Erro ao salvar no Supabase:", err);
            alert("Erro ao salvar: " + err.message);
            return;
        }
    }
    
    updateDropdowns();
    closeFornecedorModal();
    if (currentSubTab === 'fornecedores') renderGenericTab('fornecedores');
}

// --- Modal Custo ---
window.openCustoModal = (id = null) => {
    const modal = document.getElementById('custoModal');
    const form = document.getElementById('custoForm');
    modal.classList.add('active');
    form.reset();
    document.getElementById('editCustoId').value = '';
    
    const selectPai = document.getElementById('cCustoPai');
    const mainCCTypes = config.centrosCusto.filter(c => !c.parentId);
    selectPai.innerHTML = '<option value="">Selecione o Centro Principal...</option>' + 
        mainCCTypes.map(c => `<option value="${c.id}">${c.cod} - ${c.nome}</option>`).join('');

    if (id) {
        const c = config.centrosCusto.find(x => x.id == id);
        if (c) {
            document.getElementById('editCustoId').value = c.id;
            document.getElementById('cCustoNome').value = c.nome || '';
            const t = c.parentId ? 'sub' : 'main';
            document.querySelector(`input[name="custoTipo"][value="${t}"]`).checked = true;
            if(t === 'sub') {
                selectPai.value = c.parentId;
            }
        }
    } else {
        document.querySelector(`input[name="custoTipo"][value="main"]`).checked = true;
    }
    
    handleCustoTypeChange();
};

window.closeCustoModal = () => {
    document.getElementById('custoModal').classList.remove('active');
};

window.handleCustoTypeChange = () => {
    const isSub = document.querySelector('input[name="custoTipo"]:checked').value === 'sub';
    document.getElementById('groupCustoPai').style.display = isSub ? 'flex' : 'none';
    generateCustoCode();
};

window.generateCustoCode = () => {
    const isSub = document.querySelector('input[name="custoTipo"]:checked').value === 'sub';
    const idEdit = document.getElementById('editCustoId').value;
    
    if(idEdit) {
        const c = config.centrosCusto.find(x => x.id == idEdit);
        if(c && c.cod) {
            document.getElementById('cCustoCodigo').value = c.cod;
            return;
        }
    }

    if (!isSub) {
        let maxMain = 0;
        config.centrosCusto.forEach(c => {
            if(!c.parentId && c.cod) {
                const n = parseInt(c.cod, 10);
                if(!isNaN(n) && n > maxMain) maxMain = n;
            }
        });
        const next = (maxMain + 1).toString().padStart(2, '0');
        document.getElementById('cCustoCodigo').value = next;
    } else {
        const paiId = document.getElementById('cCustoPai').value;
        if(!paiId) {
            document.getElementById('cCustoCodigo').value = '';
            return;
        }
        const pai = config.centrosCusto.find(c => c.id == paiId);
        if(!pai) return;
        
        let maxSub = 0;
        config.centrosCusto.forEach(c => {
            if(c.parentId === paiId && c.cod) {
                const parts = c.cod.split('.');
                if(parts.length > 1) {
                    const n = parseInt(parts[1], 10);
                    if(!isNaN(n) && n > maxSub) maxSub = n;
                }
            }
        });
        const nextSub = (maxSub + 1).toString().padStart(4, '0');
        document.getElementById('cCustoCodigo').value = pai.cod + '.' + nextSub;
    }
};

async function handleSaveCusto(e) {
    e.preventDefault();
    const id = document.getElementById('editCustoId').value;
    const isEditing = !!id;
    if (!canDo('compras_cadastros', isEditing ? 'edit' : 'add')) {
        alert(`Você não tem permissão para ${isEditing ? 'editar' : 'cadastrar'} centros de custo.`);
        return;
    }
    const isSub = document.querySelector('input[name="custoTipo"]:checked').value === 'sub';
    const paiId = document.getElementById('cCustoPai').value;
    
    if (isSub && !paiId) {
        alert("Selecione o Centro de Custo Principal.");
        return;
    }

    const data = {
        codigo: document.getElementById('cCustoCodigo').value,
        nome: document.getElementById('cCustoNome').value,
        parent_id: isSub ? (paiId || null) : null
    };

    if (supabaseClient) {
        try {
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
            const { data: saved, error } = (id && isUuid)
                ? await supabaseClient.from('centros_custo').update(data).eq('id', id).select().single()
                : await supabaseClient.from('centros_custo').insert([data]).select().single();

            if (error) throw error;

            if (id && isUuid) {
                const idx = config.centrosCusto.findIndex(x => x.id == id);
                if (idx !== -1) {
                    config.centrosCusto[idx] = { ...saved, cod: saved.codigo, parentId: saved.parent_id };
                }
            } else {
                config.centrosCusto.push({ ...saved, cod: saved.codigo, parentId: saved.parent_id });
            }
            alert('Centro de Custo salvo com sucesso!');
        } catch (err) {
            console.error("Erro ao salvar no Supabase:", err);
            alert("Erro ao salvar: " + err.message);
            return;
        }
    }
    
    config.centrosCusto.sort((a,b) => (a.cod || '').localeCompare(b.cod || ''));

    closeCustoModal();
    updateDropdowns(); // Refresh all dropdowns including in item rows
    if (currentSubTab === 'custo') renderGenericTab('custo');
}

async function handleSaveGeneric(e) {
    e.preventDefault();
    const id = document.getElementById('genericEditId').value;
    const isEditing = !!id;
    if (!canDo('compras_cadastros', isEditing ? 'edit' : 'add')) {
        alert(`Você não tem permissão para ${isEditing ? 'editar' : 'cadastrar'} neste painel.`);
        return;
    }
    const tab = document.getElementById('genericEditTab').value; // 'pagamento' ou 'especie'
    const nome = document.getElementById('genericInputNome').value.trim();

    if (!nome) return;

    let table = '';
    let configKey = '';
    if (tab === 'pagamento') {
        table = 'formas_pagamento';
        configKey = 'tiposPgto';
    } else if (tab === 'especie') {
        table = 'especies_nota';
        configKey = 'especiesNota';
    }

    if (supabaseClient && table) {
        try {
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
            const data = { nome: nome };
            
            const { data: saved, error } = (id && isUuid)
                ? await supabaseClient.from(table).update(data).eq('id', id).select().single()
                : await supabaseClient.from(table).insert([data]).select().single();

            if (error) throw error;

            if (id && isUuid) {
                const idx = config[configKey].findIndex(x => x.id == id);
                if (idx !== -1) config[configKey][idx] = saved;
            } else {
                config[configKey].push(saved);
            }
            alert(`${tab === 'pagamento' ? 'Forma de Pagamento' : 'Espécie'} salva com sucesso!`);
        } catch (err) {
            console.error("Erro ao salvar no Supabase:", err);
            alert("Erro ao salvar: " + err.message);
            return;
        }
    }

    updateDropdowns();
    document.getElementById('genericModal').classList.remove('active');
    renderGenericTab(tab);
}


// --- Gestão de Abas ---

window.switchTab = (tabName) => {
    currentTab = tabName;
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    // Select the button based on the tabName
    const targetBtn = Array.from(document.querySelectorAll('.tab-btn')).find(btn => {
        const onClick = btn.getAttribute('onclick');
        return onClick && onClick.includes(`'${tabName}'`);
    });
    
    if (targetBtn) targetBtn.classList.add('active');
    document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
    
    if (tabName === 'compras') {
        document.getElementById('view-compras').classList.add('active');
        renderCompras();
    } else if (tabName === 'dashboard') {
        document.getElementById('view-dashboard').classList.add('active');
        updateDashboard();
        if (window.lucide) lucide.createIcons();
    } else if (tabName === 'cadastro') {
        document.getElementById('view-generic').classList.add('active');
        switchSubTab(currentSubTab);
    } else if (tabName === 'integracao') {
        document.getElementById('view-integracao').classList.add('active');
        if (window.renderIntegracao) window.renderIntegracao();
    }
};

window.switchSubTab = (subTab) => {
    currentSubTab = subTab;
    document.querySelectorAll('.sub-tab-btn').forEach(btn => btn.classList.remove('active'));
    
    const targetBtn = Array.from(document.querySelectorAll('.sub-tab-btn')).find(btn => {
        const onClick = btn.getAttribute('onclick');
        return onClick && onClick.includes(`'${subTab}'`);
    });
    
    if (targetBtn) targetBtn.classList.add('active');
    renderGenericTab(subTab);
};

function renderGenericTab(tab) {
    const list = document.getElementById('genericTable');
    const thead = document.getElementById('thead-generic');
    if (!list || !thead) return;

    let data = [];
    let title = "";
    let extraCol = "";

    if (tab === 'fornecedores') { 
        data = config.fornecedores; 
        title = "Fornecedor"; 
        extraCol = "<th>Documento</th><th>Cidade</th>";
    }
    else if (tab === 'custo') { 
        data = config.centrosCusto; 
        title = "Centro de Custo"; 
        extraCol = "<th>Código</th>";
    }
    else if (tab === 'pagamento') { data = config.tiposPgto; title = "Forma de Pagamento"; }
    else if (tab === 'especie') { data = config.especiesNota || []; title = "Espécie de Nota"; }

    thead.innerHTML = `<tr><th>ID</th><th>Nome / Descrição</th>${extraCol}<th style="text-align:right">Ações</th></tr>`;

    const search = document.getElementById('genericSearch').value.toLowerCase();
    const filtered = data.filter(d => (d.nome || '').toLowerCase().includes(search));

    document.getElementById('btnGenericAdd').onclick = () => quickAdd(tab);
    document.getElementById('btnGenericAdd').innerHTML = `<i data-lucide="plus"></i> Cadastrar ${title}`;

    list.innerHTML = filtered.map(d => {
        let cells = `<td data-label="ID">#${d.id}</td><td data-label="Nome / Descrição" style="font-weight:700;">${(d.parentId ? '<span style="color:var(--text-muted); font-size:0.8rem; margin-right:0.3rem;">↳</span>' : '') + d.nome}</td>`;
        if (tab === 'fornecedores') {
            cells += `<td data-label="Documento">${d.cnpj_cpf || d.doc || '-'}</td><td data-label="Cidade">${d.cidade || '-'}</td>`;
        } else if (tab === 'custo') {
            cells += `<td data-label="Código"><span class="cod-badge">${d.cod || '-'}</span></td>`;
        }
        return `
            <tr>
                ${cells}
                <td data-label="Ações">
                    <div class="table-actions" style="display:flex; gap:0.5rem; justify-content: flex-end;">
                        <button class="btn-edit" onclick="editGeneric('${tab}', '${d.id}', '${d.nome}')" data-perm="compras_cadastros:edit" style="background:none; border:none; color:var(--text-muted); cursor:pointer;"><i data-lucide="edit-2" style="width:14px;"></i></button>
                        <button class="btn-delete" onclick="deleteGeneric('${tab}', '${d.id}')" data-perm="compras_cadastros:delete" style="background:none; border:none; color:#ef4444; cursor:pointer;"><i data-lucide="trash-2" style="width:14px;"></i></button>
                    </div>
                </td>
            </tr>`;
    }).join('');
    if (window.lucide) lucide.createIcons();
}

// ... Rest of common logic (editGeneric, deleteGeneric, saveConfig, loadColConfig, saveColConfig, toggleColPanel, renderColPanel, toggleColVisibility, resetColumns, Drag & Drop)

window.editGeneric = (tab, id, oldName) => {
    if (tab === 'fornecedores') { openFornecedorModal(id); return; }
    if (tab === 'custo') { openCustoModal(id); return; }
    
    // Para outros (ex: pagamento, especie), usamos o modal genérico
    const modal = document.getElementById('genericModal');
    document.getElementById('genericEditId').value = id;
    document.getElementById('genericEditTab').value = tab;
    document.getElementById('genericInputNome').value = oldName;
    
    let title = 'Item';
    if (tab === 'pagamento') title = 'Forma de Pagamento';
    else if (tab === 'especie') title = 'Espécie de Nota';
    
    document.getElementById('genericModalTitle').innerText = 'Editar ' + title;
    document.getElementById('genericSaveBtn').innerText = 'SALVAR ' + title.toUpperCase();
    modal.classList.add('active');
};

window.deleteGeneric = async (tab, id) => {
    if (!canDo('compras_cadastros', 'delete')) {
        alert('Você não tem permissão para excluir itens de cadastro.');
        return;
    }
    if (!confirm('Deseja excluir este item?')) return;
    
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    if (supabaseClient && isUUID) {
        try {
            let table = '';
            if (tab === 'fornecedores') table = 'fornecedores';
            else if (tab === 'custo') table = 'centros_custo';
            else if (tab === 'pagamento') table = 'formas_pagamento';
            else if (tab === 'especie') table = 'especies_nota';

            if (table) {
                const { error } = await supabaseClient.from(table).delete().eq('id', id);
                if (error) {
                    if (error.code === '23503') {
                        let detail = "Existem vínculos ativos que impedem a exclusão.";
                        if (error.message.includes("oficina_id_fkey") || error.message.includes("fornecedor_id_fkey")) {
                            detail = "Existem registros (Veículos, Compras ou Manutenções) vinculados a este item.";
                        } else if (error.message.includes("especie_id_fkey")) {
                            detail = "Existem NOTAS FISCAIS vinculadas a esta espécie.";
                        } else if (error.message.includes("centro_custo_id_fkey")) {
                            detail = "Existem ITENS DE NOTA vinculados a este centro de custo.";
                        } else if (error.message.includes("forma_pagamento_id_fkey")) {
                            detail = "Existem COMPRAS vinculadas a esta forma de pagamento.";
                        }
                        
                        alert(`⚠️ Atenção: Não é possível excluir este item.\n\n${detail}\n\nRemova os vínculos antes de tentar excluir novamente.`);
                    } else {
                        alert("Erro ao excluir no banco de dados: " + error.message);
                    }
                    return;
                }
            }
        } catch (err) {
            console.error("Erro na exclusão remota:", err);
            alert("Erro ao excluir: " + err.message);
            return;
        }
    }


    if (tab === 'fornecedores') config.fornecedores = config.fornecedores.filter(x => x.id != id);
    else if (tab === 'custo') config.centrosCusto = config.centrosCusto.filter(x => x.id != id);
    else if (tab === 'pagamento') config.tiposPgto = config.tiposPgto.filter(x => x.id != id);
    else if (tab === 'especie') config.especiesNota = (config.especiesNota || []).filter(x => x.id != id);
    
    updateDropdowns();
    renderGenericTab(tab);
};

function saveConfig() {
    updateDropdowns();
}

function loadColConfig() { /* No longer loading locally */ }

function saveColConfig() { /* No longer saving locally */ }

window.toggleColPanel = (tab) => {
    const panel = document.getElementById('colPanel-' + tab);
    const isOpen = panel.style.display !== 'none';
    panel.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) renderColPanel(tab);
};

function renderColPanel(tab) {
    const list = document.getElementById('colList-' + tab);
    list.innerHTML = COL_DEFS[tab].map((col, idx) => `
        <div class="col-chip ${col.visible ? '' : 'hidden-col'}" draggable="true" data-tab="${tab}" data-idx="${idx}" ondragstart="onChipDragStart(event)" ondragover="onChipDragOver(event)" ondrop="onChipDrop(event)" ondragleave="onChipDragLeave(event)">
            <span class="col-chip-grip"><i data-lucide="grip-vertical" style="width:12px;"></i></span>
            <span class="col-chip-label">${col.label}</span>
            <button class="col-chip-eye" onclick="toggleColVisibility('${tab}', ${idx})"><i data-lucide="${col.visible ? 'eye' : 'eye-off'}" style="width:14px;"></i></button>
        </div>
    `).join('');
    if (window.lucide) lucide.createIcons();
}

window.toggleColVisibility = (tab, idx) => {
    COL_DEFS[tab][idx].visible = !COL_DEFS[tab][idx].visible;
    saveColConfig();
    renderColPanel(tab);
    renderCompras();
};

window.resetColumns = (tab) => {
    if (confirm('Restaurar visualização?')) { location.reload(); }
};

let dragSrcIdx = null;
window.onChipDragStart = (e) => { dragSrcIdx = parseInt(e.currentTarget.dataset.idx); e.dataTransfer.effectAllowed = 'move'; };
window.onChipDragOver = (e) => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); };
window.onChipDragLeave = (e) => { e.currentTarget.classList.remove('drag-over'); };
window.onChipDrop = (e) => {
    e.preventDefault();
    const tab = e.currentTarget.dataset.tab;
    const targetIdx = parseInt(e.currentTarget.dataset.idx);
    if (dragSrcIdx === targetIdx) return;
    const cols = COL_DEFS[tab];
    const [moved] = cols.splice(dragSrcIdx, 1);
    cols.splice(targetIdx, 0, moved);
    saveColConfig();
    renderColPanel(tab);
    renderCompras();
};

// --- Modal ---

window.openCompraModal = async (id = null) => {
    if (id) {
        if (!canDo('compras_historico', 'edit')) {
            alert('Você não tem permissão para editar compras.');
            return;
        }
    } else {
        if (!canDo('compras_historico', 'add')) {
            alert('Você não tem permissão para lançar compras.');
            return;
        }
    }
    await loadInventoryProducts();
    await loadVehicles();
    await loadDrivers();
    const modal = document.getElementById('compraModal');
    const form = document.getElementById('compraForm');
    modal.classList.add('active');
    form.reset();
    const fId = document.getElementById('fornecedorId');
    const fSearch = document.getElementById('fornecedorSearch');
    if (fId) fId.value = '';
    if (fSearch) fSearch.value = '';
    const catId = document.getElementById('categoriaId');
    const catSearch = document.getElementById('categoriaSearch');
    if (catId) catId.value = '';
    if (catSearch) catSearch.value = '';
    document.getElementById('itemsContainer').innerHTML = '';
    document.getElementById('additionalContainer').innerHTML = '';
    document.getElementById('parcelasContainer').innerHTML = '';
    document.getElementById('parcelasSection').style.display = 'none';
    document.getElementById('toggleParcelas').classList.remove('active');
    document.getElementById('qtdParcWrapper').style.opacity = '0.5';
    document.getElementById('qtdParcWrapper').style.pointerEvents = 'none';

    if (id) {
        editId = id;
        const c = compras.find(item => item.id == id);
        if (c) populateModal(c);
    } else {
        editId = null;
        const uniqueId = 'NC-' + Date.now().toString().slice(-6);
        document.getElementById('labelCodUnico').innerText = 'COD: ' + uniqueId;
        document.getElementById('labelCodUnico').dataset.value = uniqueId;
        addItemRow();
        document.getElementById('dataCompra').valueAsDate = new Date();
        const vInput = document.getElementById('vencimentoNota');
        vInput.disabled = false;
        vInput.valueAsDate = new Date();
        if (vInput.parentElement) {
            vInput.parentElement.style.opacity = '1';
            vInput.parentElement.style.pointerEvents = 'auto';
        }
    }
    calculateTotal();

    setTimeout(() => {
        const dataInput = document.getElementById('dataCompra');
        if (dataInput) dataInput.focus();
    }, 100);
};

window.openViewModal = (id) => {
    const c = compras.find(item => item.id == id);
    if (!c) return;

    const modal = document.getElementById('viewCompraModal');
    modal.classList.add('active');

    document.getElementById('viewCodUnico').innerText = 'COD: ' + c.id;
    document.getElementById('viewData').innerText = new Date(c.data + 'T12:00:00').toLocaleDateString('pt-BR');
    document.getElementById('viewNumNota').innerText = '#' + c.numeroNota;
    
    const vencText = c.vencimento ? new Date(c.vencimento + 'T12:00:00').toLocaleDateString('pt-BR') : 'N/A';
    document.getElementById('viewVencimento').innerText = vencText;
    
    const esp = (config.especiesNota || []).find(e => e.id == c.especieId);
    document.getElementById('viewEspecie').innerText = esp ? esp.nome : '-';
    
    const forn = (config.fornecedores || []).find(f => f.id == c.fornecedorId);
    document.getElementById('viewFornecedor').innerText = forn ? forn.nome : 'NÃO IDENTIFICADO';
    
    const pgto = (config.tiposPgto || []).find(p => p.id == c.formaPgtoId);
    document.getElementById('viewFormaPgto').innerText = pgto ? pgto.nome : '-';

    document.getElementById('viewTotalValue').innerText = `R$ ${parseFloat(c.valorTotal).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;

    // Items
    const itemsList = document.getElementById('viewItemsList');
    itemsList.innerHTML = (c.itens || c.items || []).map(it => {
        const isS = it.tipo === 'servico';
        const label = isS ? 'S' : 'P';
        const color = isS ? '#f59e0b' : '#10b981';
        
        const cc = config.centrosCusto.find(x => x.id == it.centroCustoId);
        const ccName = cc ? cc.nome : 'SEM CC';

        let linkInfo = '';
        if (it.veiculoId) {
            const v = vehicles.find(veh => veh.id == it.veiculoId);
            if (v) linkInfo = `<span style="background:rgba(255,255,255,0.05); padding:2px 6px; border-radius:4px; font-size:0.6rem;">🚗 ${v.placa}</span>`;
        } else if (it.pessoa) {
            linkInfo = `<span style="background:rgba(255,255,255,0.05); padding:2px 6px; border-radius:4px; font-size:0.6rem;">👤 ${it.pessoa}</span>`;
        }

        return `
            <div class="view-item-card">
                <div style="display:flex; align-items:center; gap:12px;">
                    <span style="color:${color}; font-weight:900; font-size:0.65rem; border:1px solid ${color}44; width:20px; height:20px; display:flex; align-items:center; justify-content:center; border-radius:5px; background:${color}11;">${label}</span>
                    <div>
                        <p style="font-weight:700; font-size:0.85rem; color:#fff;">${it.produto}</p>
                        <div style="display:flex; gap:8px; align-items:center; margin-top:2px;">
                            <p style="font-size:0.65rem; color:var(--text-muted); text-transform:uppercase;">QTD: ${it.quantidade} | Unit: R$ ${parseFloat(it.valorUnitario).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
                            <span style="color:var(--primary); font-size:0.6rem; font-weight:800;">[${ccName}]</span>
                            ${linkInfo}
                        </div>
                    </div>
                </div>
                <p style="font-weight:800; color:#fff;">R$ ${(it.quantidade * it.valorUnitario).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
            </div>
        `;
    }).join('');

    // Adicionais
    const adSection = document.getElementById('viewAdicionaisSection');
    const adList = document.getElementById('viewAdicionaisList');
    if (c.adicionais && c.adicionais.length > 0) {
        adSection.style.display = 'block';
        adList.innerHTML = c.adicionais.map(ad => `
            <div style="display:flex; justify-content:space-between; background:rgba(99,102,241,0.05); padding:0.6rem 1rem; border-radius:8px; border:1px solid rgba(99,102,241,0.1);">
                <span style="font-size:0.8rem; font-weight:600; color:#818cf8;">${ad.descricao}</span>
                <span style="font-size:0.8rem; font-weight:800; color:#fff;">+ R$ ${parseFloat(ad.valor).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
            </div>
        `).join('');
    } else {
        adSection.style.display = 'none';
    }

    // Parcelas
    const parcSection = document.getElementById('viewParcelasSection');
    const parclist = document.getElementById('viewParcelasList');
    if (c.parcelasData && c.parcelasData.length > 0) {
        parcSection.style.display = 'block';
        parclist.innerHTML = c.parcelasData.map((p, idx) => `
            <div class="view-parc-badge">
                <p style="font-size:0.6rem; opacity:0.7; margin-bottom:2px;">PARCELA ${idx + 1}</p>
                <p style="font-weight:800;">R$ ${parseFloat(p.valor).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
                <p style="font-size:0.65rem; margin-top:2px;">📅 ${new Date(p.data + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
            </div>
        `).join('');
    } else {
        parcSection.style.display = 'none';
    }

    // Obs
    const obsSection = document.getElementById('viewObsSection');
    if (c.observacoes) {
        obsSection.style.display = 'block';
        document.getElementById('viewObservacoes').innerText = c.observacoes;
    } else {
        obsSection.style.display = 'none';
    }

    // Edit Button
    document.getElementById('btnEditFromView').onclick = () => {
        closeViewModal();
        openCompraModal(c.id);
    };

    if (window.lucide) lucide.createIcons();
};

window.closeViewModal = () => { document.getElementById('viewCompraModal').classList.remove('active'); };

window.closeCompraModal = () => { document.getElementById('compraModal').classList.remove('active'); editId = null; };

window.closeFornecedorModal = () => { document.getElementById('fornecedorModal').classList.remove('active'); };

function populateModal(c) {
    document.getElementById('labelCodUnico').innerText = 'COD: ' + c.id;
    document.getElementById('labelCodUnico').dataset.value = c.id;
    document.getElementById('dataCompra').value = c.data;
    document.getElementById('numNota').value = c.numeroNota;
    document.getElementById('especieId').value = c.especieId || '';
    document.getElementById('categoriaId').value = c.categoriaId || '';
    const cat = (config.categorias || []).find(x => x.id == c.categoriaId);
    document.getElementById('categoriaSearch').value = cat ? ((cat.codigo ? `${cat.codigo} - ` : '') + cat.nome) : '';
    document.getElementById('fornecedorId').value = c.fornecedorId;
    const forn = (config.fornecedores || []).find(f => f.id == c.fornecedorId);
    document.getElementById('fornecedorSearch').value = forn ? forn.nome : '';
    document.getElementById('tipoPgtoId').value = c.formaPgtoId || '';
    document.getElementById('vencimentoNota').value = c.vencimento || '';

    const itns = c.items || c.itens || [];
    if (itns.length > 0) itns.forEach(it => addItemRow(it, false));
    else addItemRow(null, false);

    if (c.adicionais?.length > 0) c.adicionais.forEach(ad => addAdditionalRow(ad));

    if (c.financeiro) {
        const toggle = document.getElementById('toggleParcelas');
        toggle.classList.add('active');
        document.getElementById('parcelasSection').style.display = 'block';
        document.getElementById('qtdParcelas').value = c.qtdParcelas || 1;
        document.getElementById('qtdParcWrapper').style.opacity = '1';
        document.getElementById('qtdParcWrapper').style.pointerEvents = 'auto';

        // Anular e desabilitar vencimento principal se for parcelado
        const vInput = document.getElementById('vencimentoNota');
        vInput.value = '';
        vInput.disabled = true;
        if (vInput.parentElement) vInput.parentElement.style.opacity = '0.5';

        (c.parcelasData || []).forEach((p, idx) => {
            const container = document.getElementById('parcelasContainer');
            const row = document.createElement('div');
            row.className = 'parcela-row';
            row.style = "display: grid; grid-template-columns: 100px 1fr 1fr 30px; gap: 1.5rem; align-items: center; margin-bottom: 0.8rem; background: rgba(0, 0, 0, 0.2); padding: 0.8rem; border-radius: 10px;";
            row.innerHTML = `<div style="font-weight: 700; color: var(--primary)">Parcela ${idx + 1}</div><input type="date" class="parc-date compra-input" value="${p.data}" onchange="calculateTotal()"><input type="number" step="0.01" class="parc-val compra-input" value="${p.valor}" onchange="calculateTotal()"><i data-lucide="info" style="width:14px; opacity: 0.5"></i>`;
            container.appendChild(row);
        });
    }
}

function addItemRow(data = {}, shouldFocus = true) {
    if (!data) data = {};
    const container = document.getElementById('itemsContainer');
    const rowId = 'row_' + Date.now() + Math.random().toString(36).substr(2, 5);
    
    const isPessoa = !!data.pessoa;
    const selectedVeh = vehicles.find(v => v.id == data.veiculoId) || null;
    const vehDisplay = selectedVeh ? selectedVeh.placa : '';

    const row = document.createElement('div');
    row.className = 'item-row';
    row.id = rowId;

    const selectedProd = inventoryProducts.find(p => p.id == data.produtoId) || null;
    let prodDisplay = selectedProd ? `${selectedProd.nome} (${selectedProd.marca || ''})` : (data.produto || '');

    row.innerHTML = `
        <div class="item-type-toggle" style="display:flex; margin-bottom:0.8rem; background:rgba(0,0,0,0.2); width:fit-content; border-radius:8px; padding:0.2rem; gap:0.2rem;">
            <button type="button" class="type-btn ${data.tipo === 'servico' ? '' : 'active'}" onclick="setItemType(this, 'peca')" style="padding:0.4rem 1rem; border-radius:6px; border:none; font-size:0.65rem; font-weight:800; cursor:pointer; background:${data.tipo === 'servico' ? 'transparent' : 'var(--primary)'}; color:${data.tipo === 'servico' ? 'var(--text-muted)' : '#fff'}">PEÇA</button>
            <button type="button" class="type-btn ${data.tipo === 'servico' ? 'active' : ''}" onclick="setItemType(this, 'servico')" style="padding:0.4rem 1rem; border-radius:6px; border:none; font-size:0.65rem; font-weight:800; cursor:pointer; background:${data.tipo === 'servico' ? 'var(--primary)' : 'transparent'}; color:${data.tipo === 'servico' ? '#fff' : 'var(--text-muted)'}">SERVIÇO</button>
        </div>
        <div class="item-line-1">
            <div style="display:flex; gap:0.5rem; flex:3; min-width:0;">
                <!-- Peça View -->
                <div class="autocomplete-wrapper peca-input-group" style="flex:1; display:${data.tipo === 'servico' ? 'none' : 'block'}">
                    <i data-lucide="search" class="search-icon-inside"></i>
                    <input type="text" class="item-produto-search compra-input" placeholder="Buscar peça no estoque..." value="${prodDisplay}" oninput="handleProductSearch(this)" onfocus="handleProductSearch(this)" onkeydown="handleAutocompleteKeydown(event, this)" autocomplete="off">
                    <input type="hidden" class="item-produto" value="${data.produtoId || ''}">
                    <div class="autocomplete-results"></div>
                </div>
                <!-- Serviço View -->
                <div class="servico-input-group" style="flex:1; display:${data.tipo === 'servico' ? 'block' : 'none'}">
                    <input type="text" class="item-servico-desc compra-input" placeholder="Descrição do serviço ou despesa..." style="width:100%" value="${data.produto || ''}" autocomplete="off">
                </div>
                
                <div class="product-actions-group" style="display:${data.tipo === 'servico' ? 'none' : 'flex'}; gap:0.3rem;">
                    <button type="button" class="btn-plus" onclick="refreshInventoryProducts(this)" title="Recarregar produtos"><i data-lucide="refresh-cw" style="width:14px;"></i></button>
                    <button type="button" class="btn-plus" onclick="window.open('estoque.html')" title="Cadastrar novo produto"><i data-lucide="external-link" style="width:14px;"></i></button>
                </div>
            </div>
            <input type="number" class="item-qtd compra-input" placeholder="QTD" value="${data.quantidade || ''}" oninput="updateRowTotal(this)" style="text-align:center">
            <input type="number" class="item-unit compra-input" placeholder="VALOR UNIT." step="0.01" value="${data.valorUnitario || ''}" oninput="updateRowTotal(this)">
            <input type="text" class="item-total-row compra-input" placeholder="TOTAL" readonly style="background:rgba(255,255,255,0.05); font-weight:bold; color:#818cf8; text-align:right;">
            <button type="button" class="btn-plus" style="background:#ef444422; border:1px solid #ef444444; color:#ef4444; width:36px; height:36px; padding:0; display:flex; align-items:center; justify-content:center; border-radius:10px;" onclick="document.getElementById('${rowId}').remove(); calculateTotal();">
                <i data-lucide="trash-2" style="width:16px;"></i>
            </button>
        </div>
        <div class="item-line-2">
            <div class="input-group estoque-toggle-wrapper" style="flex-direction:row; align-items:center; gap:1rem; display:${data.tipo === 'servico' ? 'none' : 'flex'}">
                <label style="font-size:0.7rem; color:var(--text-muted);">Estoque?</label>
                <div class="switch-wrap">
                    <div class="stock-toggle ${data.estoque ? 'active' : ''}" tabindex="0" onclick="toggleRowStock(this)" onkeydown="if(event.key === ' ' || event.key === 'Enter') { event.preventDefault(); toggleRowStock(this); }"></div>
                    <span style="font-size:0.6rem; font-weight:700; color:var(--text-muted);">${data.estoque ? 'SIM' : 'NÃO'}</span>
                </div>
            </div>
            <div class="item-venda-section" style="display:${data.estoque ? 'flex' : 'none'}; flex-direction:row; align-items:center; gap:0.8rem; flex:1;">
                <label style="font-size:0.7rem; color:#10b981; font-weight:700; white-space:nowrap;">VALOR VENDA:</label>
                <input type="number" class="item-venda compra-input" step="0.01" placeholder="0,00" style="height:36px; border-color:#10b98144; color:#10b981; font-weight:700;" value="${data.valorVenda || ''}">
            </div>
            <div class="input-group" style="flex:1; min-width:180px;">
                <div class="input-with-btn">
                    <select class="item-cc compra-input" style="font-size:0.7rem; height:36px; width:100%;">
                        <option value="">Centro de Custo...</option>
                        ${config.centrosCusto.filter(cc => !!cc.parentId).sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR')).map(cc => `<option value="${cc.id}" ${data.centroCustoId === cc.id ? 'selected' : ''}>${cc.nome}</option>`).join('')}
                    </select>
                    <button type="button" class="btn-plus" onclick="quickAdd('custo')" style="width:32px; height:32px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:var(--text-muted);" title="Adicionar Centro de Custo"><i data-lucide="plus" style="width:14px;"></i></button>
                </div>
            </div>
        </div>

        <div class="item-line-3" style="display:${(!data.estoque || data.tipo === 'servico') ? 'grid' : 'none'};">
            <div class="item-vinculo-section" style="flex-direction:row; align-items:center; gap:1.5rem; flex:2; display:${data.estoque ? 'none' : 'flex'}">
                <label style="font-size:0.7rem; color:var(--text-muted); min-width:60px;">Vincular a:</label>
                <div class="vinculo-btns">
                    <button type="button" class="btn-vinculo ${!isPessoa ? '' : 'inactive'}" style="background:${!isPessoa ? '#4f46e5' : '#1e293b'}" onclick="setLinkType(this, 'veiculo')"><i data-lucide="truck" style="width:14px;"></i></button>
                    <button type="button" class="btn-vinculo ${isPessoa ? '' : 'inactive'}" style="background:${isPessoa ? '#4f46e5' : '#1e293b'}" onclick="setLinkType(this, 'pessoa')"><i data-lucide="user-plus" style="width:14px;"></i></button>
                </div>
                <div class="autocomplete-wrapper item-veiculo-wrapper" style="flex:1; ${isPessoa ? 'display:none' : ''}">
                    <input type="text" class="item-veiculo-search compra-input" placeholder="Buscar placa..." value="${vehDisplay}" oninput="handleVehicleSearch(this)" onfocus="handleVehicleSearch(this)" onkeydown="handleAutocompleteKeydown(event, this)" autocomplete="off">
                    <input type="hidden" class="item-veiculo" value="${data.veiculoId || ''}">
                    <div class="autocomplete-results"></div>
                </div>
                <div class="autocomplete-wrapper item-pessoa-wrapper" style="flex:1; ${isPessoa ? '' : 'display:none'}">
                    <input type="text" class="item-pessoa compra-input" placeholder="Nome da Pessoa" value="${data.pessoa || ''}" oninput="handleDriverSearch(this)" onfocus="handleDriverSearch(this)" onkeydown="handleAutocompleteKeydown(event, this)" autocomplete="off">
                    <div class="autocomplete-results"></div>
                </div>
            </div>
            
            <div class="maint-toggle-wrapper" style="display:${(data.tipo === 'servico' || (data.tipo !== 'servico' && !data.estoque)) ? 'flex' : 'none'}; align-items:center; gap:0.8rem;">
                <label style="font-size:0.7rem; color:var(--text-muted);">Controlar Manutenção?</label>
                <div class="switch-wrap">
                    <div class="stock-toggle maint-control-toggle ${data.maintControl ? 'active' : ''}" tabindex="0" onclick="toggleMaintControl(this)" onkeydown="if(event.key === ' ' || event.key === 'Enter') { event.preventDefault(); toggleMaintControl(this); }"></div>
                    <span style="font-size:0.6rem; font-weight:700; color:var(--text-muted);">${data.maintControl ? 'SIM' : 'NÃO'}</span>
                </div>
            </div>
        </div>

        <!-- PAINEL DE MANUTENÇÃO (Similar ao módulo de Manutenção) -->
        <div class="maint-details-panel" style="display:${data.maintControl ? 'grid' : 'none'}; grid-template-columns: 1.5fr 1fr 1fr 1fr; gap: 1rem; margin-top: 1.2rem; padding: 1.2rem; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; animation: fadeIn 0.3s ease;">
            <div class="input-group">
                <label style="font-size:0.6rem;">Tipo de Manutenção</label>
                <select class="maint-tipo-id compra-input" style="font-size:0.75rem;">
                    <option value="">Selecione...</option>
                    ${maintTypes.map(t => `<option value="${t.id}" ${data.maintTipoId === t.id ? 'selected' : ''}>${t.descricao}</option>`).join('')}
                </select>
            </div>
            <div class="input-group">
                <label style="font-size:0.6rem;">Ação / Categoria</label>
                <select class="maint-acao-id compra-input" style="font-size:0.75rem;">
                    <option value="">Selecione...</option>
                    ${maintActions.map(a => `<option value="${a.id}" ${data.maintAcaoId === a.id ? 'selected' : ''}>${a.descricao}</option>`).join('')}
                </select>
            </div>
            <div class="input-group">
                <label style="font-size:0.6rem;">KM Atual</label>
                <input type="number" class="maint-km compra-input" placeholder="Ex: 105000" value="${data.maintKm || ''}" style="font-size:0.75rem;">
            </div>
            <div class="input-group">
                <label style="font-size:0.6rem;">Controle de Troca</label>
                <select class="maint-controle-troca compra-input" style="font-size:0.75rem;" onchange="handleMaintControleChange(this)">
                    <option value="NENHUMA" ${data.maintControle === 'NENHUMA' ? 'selected' : ''}>NÃO CONTROLA</option>
                    <option value="KM" ${data.maintControle === 'KM' ? 'selected' : ''}>POR KM</option>
                    <option value="DATA" ${data.maintControle === 'DATA' ? 'selected' : ''}>POR DATA</option>
                </select>
            </div>

            <!-- Campos Condicionais de Troca -->
            <div class="maint-km-extra" style="display:${data.maintControle === 'KM' ? 'block' : 'none'};">
                <label style="font-size:0.6rem;">Intervalo KM</label>
                <input type="number" class="maint-intervalo-km compra-input" placeholder="Ex: 10000" value="${data.maintIntervaloKm || ''}" style="font-size:0.75rem;">
            </div>
            <div class="maint-data-extra" style="display:${data.maintControle === 'DATA' ? 'block' : 'none'};">
                <label style="font-size:0.6rem;">Meses de Intervalo</label>
                <input type="number" class="maint-intervalo-meses compra-input" placeholder="Ex: 6" value="${data.maintIntervaloMeses || ''}" style="font-size:0.75rem;">
            </div>

            <div class="input-group">
                <label style="font-size:0.6rem;">Garantia?</label>
                <select class="maint-possui-garantia compra-input" style="font-size:0.75rem;" onchange="handleMaintGarantiaChange(this)">
                    <option value="false" ${!data.maintGarantia ? 'selected' : ''}>NÃO</option>
                    <option value="true" ${data.maintGarantia ? 'selected' : ''}>SIM</option>
                </select>
            </div>
            <div class="maint-garantia-extra" style="display:${data.maintGarantia ? 'block' : 'none'};">
                <label style="font-size:0.6rem;">Meses Garantia</label>
                <input type="number" class="maint-meses-garantia compra-input" placeholder="Ex: 3" value="${data.maintMesesGarantia || ''}" style="font-size:0.75rem;">
            </div>
        </div>
    `;
    container.appendChild(row);
    updateRowTotal(row.querySelector('.item-qtd'));
    if (window.lucide) lucide.createIcons();
    window.updateVinculoDisplay(row);
    calculateTotal();

    if (shouldFocus) {
        setTimeout(() => {
            const activeBtn = row.querySelector('.type-btn.active') || row.querySelector('.type-btn');
            if (activeBtn) {
                activeBtn.focus();
            }
        }, 50);
    }
}

window.toggleRowStock = (el) => {
    el.classList.toggle('active');
    const isStock = el.classList.contains('active');
    el.nextElementSibling.innerText = isStock ? 'SIM' : 'NÃO';
    const row = el.closest('.item-row');
    
    const vin = row.querySelector('.item-vinculo-section');
    const ven = row.querySelector('.item-venda-section');
    const line3 = row.querySelector('.item-line-3');

    if (isStock) {
        vin.style.display = 'none';
        ven.style.display = 'flex';
        row.querySelector('.maint-toggle-wrapper').style.display = 'none';
        row.querySelector('.maint-details-panel').style.display = 'none';
        if (line3) line3.style.display = 'none';
    } else {
        vin.style.display = 'flex';
        ven.style.display = 'none';
        row.querySelector('.maint-toggle-wrapper').style.display = 'flex';
        if (row.querySelector('.maint-control-toggle').classList.contains('active')) {
            row.querySelector('.maint-details-panel').style.display = 'grid';
        }
        if (line3) line3.style.display = 'grid';
        window.updateVinculoDisplay(row);
    }
};

window.setItemType = (btn, type) => {
    const row = btn.closest('.item-row');
    const pecaGroup = row.querySelector('.peca-input-group');
    const servGroup = row.querySelector('.servico-input-group');
    const prodActions = row.querySelector('.product-actions-group');
    const estWrapper = row.querySelector('.estoque-toggle-wrapper');
    const vdaWrapper = row.querySelector('.item-venda-section');
    const stockToggle = row.querySelector('.stock-toggle');
    const vinculoSection = row.querySelector('.item-vinculo-section');
    const line3 = row.querySelector('.item-line-3');

    // Reset buttons
    btn.parentElement.querySelectorAll('.type-btn').forEach(b => {
        b.classList.remove('active');
        b.style.background = 'transparent';
        b.style.color = 'var(--text-muted)';
    });
    btn.classList.add('active');
    btn.style.background = 'var(--primary)';
    btn.style.color = '#fff';

    if (type === 'peca') {
        pecaGroup.style.display = 'block';
        servGroup.style.display = 'none';
        prodActions.style.display = 'flex';
        estWrapper.style.display = 'flex';
        
        // Restore stock toggle state logic
        if (stockToggle.classList.contains('active')) {
            vdaWrapper.style.display = 'flex';
            vinculoSection.style.display = 'none';
            row.querySelector('.maint-toggle-wrapper').style.display = 'none';
            row.querySelector('.maint-details-panel').style.display = 'none';
            if (line3) line3.style.display = 'none';
        } else {
            vdaWrapper.style.display = 'none';
            vinculoSection.style.display = 'flex';
            row.querySelector('.maint-toggle-wrapper').style.display = 'flex';
            if (row.querySelector('.maint-control-toggle').classList.contains('active')) {
                row.querySelector('.maint-details-panel').style.display = 'grid';
            }
            if (line3) line3.style.display = 'grid';
            window.updateVinculoDisplay(row);
        }
    } else {
        pecaGroup.style.display = 'none';
        servGroup.style.display = 'block';
        prodActions.style.display = 'none';
        estWrapper.style.display = 'none';
        vdaWrapper.style.display = 'none';
        vinculoSection.style.display = 'flex'; // Services always need a link
        row.querySelector('.maint-toggle-wrapper').style.display = 'flex';
        if (row.querySelector('.maint-control-toggle').classList.contains('active')) {
            row.querySelector('.maint-details-panel').style.display = 'grid';
        }
        if (line3) line3.style.display = 'grid';
        window.updateVinculoDisplay(row);
    }
    calculateTotal();
};

window.toggleMaintControl = (el) => {
    el.classList.toggle('active');
    const isActive = el.classList.contains('active');
    el.nextElementSibling.innerText = isActive ? 'SIM' : 'NÃO';
    const row = el.closest('.item-row');
    const panel = row.querySelector('.maint-details-panel');
    panel.style.display = isActive ? 'grid' : 'none';
    
    window.updateVinculoDisplay(row);
};

window.updateVinculoDisplay = (row) => {
    const isPessoa = !row.querySelector('.vinculo-btns button:last-child').classList.contains('inactive');
    const maintActive = row.querySelector('.maint-control-toggle')?.classList.contains('active');
    
    const vehWrapper = row.querySelector('.item-veiculo-wrapper');
    const pesWrapper = row.querySelector('.item-pessoa-wrapper');
    
    if (!vehWrapper || !pesWrapper) return;
    
    if (isPessoa) {
        pesWrapper.style.display = 'block';
        if (maintActive) {
            vehWrapper.style.display = 'block';
            vehWrapper.querySelector('.item-veiculo-search').placeholder = "Placa da manutenção...";
        } else {
            vehWrapper.style.display = 'none';
            // Clear vehicle inputs when maintenance is inactive and vinculo is Pessoa
            vehWrapper.querySelector('.item-veiculo-search').value = '';
            vehWrapper.querySelector('.item-veiculo').value = '';
        }
    } else {
        pesWrapper.style.display = 'none';
        vehWrapper.style.display = 'block';
        vehWrapper.querySelector('.item-veiculo-search').placeholder = "Buscar placa...";
    }
};

window.handleMaintControleChange = (el) => {
    const row = el.closest('.item-row');
    const val = el.value;
    row.querySelector('.maint-km-extra').style.display = val === 'KM' ? 'block' : 'none';
    row.querySelector('.maint-data-extra').style.display = val === 'DATA' ? 'block' : 'none';
};

window.handleMaintGarantiaChange = (el) => {
    const row = el.closest('.item-row');
    row.querySelector('.maint-garantia-extra').style.display = el.value === 'true' ? 'block' : 'none';
};

window.setLinkType = (btn, type) => {
    const parent = btn.parentElement;
    const row = btn.closest('.item-row');
    parent.querySelectorAll('.btn-vinculo').forEach(b => b.classList.add('inactive'));
    btn.classList.remove('inactive');
    
    if (type === 'veiculo') {
        btn.style.background = '#4f46e5';
        if (btn.nextElementSibling) btn.nextElementSibling.style.background = '#1e293b';
    } else {
        btn.style.background = '#4f46e5';
        if (btn.previousElementSibling) btn.previousElementSibling.style.background = '#1e293b';
    }
    
    window.updateVinculoDisplay(row);
};

let currentAutocompleteIndex = -1;

// Posiciona dropdown com position:fixed, quebrando overflow do modal
function positionDropdown(inputEl, resultsDiv) {
    const rect = inputEl.getBoundingClientRect();
    resultsDiv.style.top    = (rect.bottom + 4) + 'px';
    resultsDiv.style.left   = rect.left + 'px';
    resultsDiv.style.width  = rect.width + 'px';
}

window.handleAutocompleteKeydown = (e, inputEl) => {
    const resultsDiv = inputEl.parentElement.querySelector('.autocomplete-results');
    if (!resultsDiv || resultsDiv.style.display === 'none') return;

    const items = resultsDiv.querySelectorAll('.autocomplete-item');
    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        currentAutocompleteIndex++;
        if (currentAutocompleteIndex >= items.length) currentAutocompleteIndex = 0;
        updateAutocompleteHighlight(items);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        currentAutocompleteIndex--;
        if (currentAutocompleteIndex < 0) currentAutocompleteIndex = items.length - 1;
        updateAutocompleteHighlight(items);
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

function updateAutocompleteHighlight(items) {
    items.forEach((item, idx) => {
        if (idx === currentAutocompleteIndex) {
            item.style.background = 'rgba(99, 102, 241, 0.2)';
            item.scrollIntoView({ block: 'nearest' });
        } else {
            item.style.background = 'transparent';
        }
    });
}

window.handleVehicleSearch = (el) => {
    currentAutocompleteIndex = -1;
    const query = el.value.toUpperCase().trim();
    const resultsDiv = el.parentElement.querySelector('.autocomplete-results');
    
    // Se vazio (foco sem texto), mostra todos os veículos disponíveis
    const matches = query.length === 0
        ? vehicles.slice(0, 50)
        : vehicles.filter(v => v.placa.toUpperCase().includes(query)).slice(0, 20);

    if (matches.length === 0) {
        resultsDiv.innerHTML = '<div class="autocomplete-item" style="color:var(--text-muted); font-size:0.75rem;">Nenhum veículo encontrado...</div>';
    } else {
        resultsDiv.innerHTML = matches.map(v => `
            <div class="autocomplete-item" onclick="selectVehicle('${v.id}', '${v.placa}', this)">
                <span class="prod-name">${v.placa}</span>
            </div>
        `).join('');
    }
    
    positionDropdown(el, resultsDiv);
    resultsDiv.style.display = 'block';
};

window.selectVehicle = (id, placa, itemEl) => {
    const wrapper = itemEl.closest('.autocomplete-wrapper');
    const searchInput = wrapper.querySelector('.item-veiculo-search');
    const hiddenId = wrapper.querySelector('.item-veiculo');
    const resultsDiv = wrapper.querySelector('.autocomplete-results');

    searchInput.value = placa;
    hiddenId.value = id;
    resultsDiv.style.display = 'none';
    resultsDiv.innerHTML = '';
};

window.handleDriverSearch = (el) => {
    currentAutocompleteIndex = -1;
    const query = el.value.toUpperCase().trim();
    const resultsDiv = el.parentElement.querySelector('.autocomplete-results');
    
    if (query.length === 0) {
        resultsDiv.innerHTML = '';
        resultsDiv.style.display = 'none';
        return;
    }

    const matches = drivers.filter(d => 
        (d.nome_completo || '').toUpperCase().includes(query)
    ).slice(0, 10);

    if (matches.length === 0) {
        resultsDiv.innerHTML = '<div class="autocomplete-item" style="color:var(--text-muted); font-size:0.75rem;">Nenhum condutor encontrado...</div>';
    } else {
        resultsDiv.innerHTML = matches.map(d => `
            <div class="autocomplete-item" onclick="selectDriver('${d.id}', '${(d.nome_completo || '').replace(/'/g, "\\'")}', this)">
                <span class="prod-name">${d.nome_completo}</span>
            </div>
        `).join('');
    }
    
    positionDropdown(el, resultsDiv);
    resultsDiv.style.display = 'block';
};

window.selectDriver = (id, nomeCompleto, itemEl) => {
    const wrapper = itemEl.closest('.autocomplete-wrapper');
    const searchInput = wrapper.querySelector('.item-pessoa');
    const resultsDiv = wrapper.querySelector('.autocomplete-results');

    searchInput.value = nomeCompleto;
    resultsDiv.style.display = 'none';
    resultsDiv.innerHTML = '';
};

window.handleFornecedorSearch = (el) => {
    currentAutocompleteIndex = -1;
    const query = el.value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const resultsDiv = el.parentElement.querySelector('.autocomplete-results');
    const hiddenId = el.parentElement.querySelector('#fornecedorId');
    
    if (el.value.trim() === '') {
        if (hiddenId) hiddenId.value = '';
    }

    const matches = query.length === 0
        ? (config.fornecedores || []).slice(0, 30)
        : (config.fornecedores || []).filter(f => {
            const nameNorm = (f.nome || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const doc = (f.cnpj_cpf || f.cnpj || f.doc || '').replace(/\D/g, '');
            const cleanQuery = query.replace(/\D/g, '');
            return nameNorm.includes(query) || (cleanQuery.length > 0 && doc.includes(cleanQuery));
          }).slice(0, 30);

    if (matches.length === 0) {
        resultsDiv.innerHTML = '<div class="autocomplete-item" style="color:var(--text-muted); font-size:0.75rem;">Nenhum fornecedor encontrado...</div>';
    } else {
        resultsDiv.innerHTML = matches.map(f => `
            <div class="autocomplete-item" onclick="selectFornecedor('${f.id}', '${f.nome.replace(/'/g, "\\'")}', this)">
                <span class="prod-name">${f.nome}</span>
                ${(f.cnpj_cpf || f.cnpj || f.doc) ? `<span class="prod-meta">Doc: ${f.cnpj_cpf || f.cnpj || f.doc}</span>` : ''}
            </div>
        `).join('');
    }
    
    positionDropdown(el, resultsDiv);
    resultsDiv.style.display = 'block';
};

window.selectFornecedor = (id, nome, itemEl) => {
    const wrapper = itemEl.closest('.autocomplete-wrapper');
    const searchInput = wrapper.querySelector('#fornecedorSearch');
    const hiddenId = wrapper.querySelector('#fornecedorId');
    const resultsDiv = wrapper.querySelector('.autocomplete-results');

    searchInput.value = nome;
    hiddenId.value = id;
    resultsDiv.style.display = 'none';
    resultsDiv.innerHTML = '';
    
    // Trigger duplicate check
    if (window.checkDuplicateNota) window.checkDuplicateNota();
};

window.handleCategoriaSearch = (el) => {
    currentAutocompleteIndex = -1;
    const query = el.value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const resultsDiv = el.parentElement.querySelector('.autocomplete-results');
    const hiddenId = el.parentElement.querySelector('#categoriaId');
    
    if (el.value.trim() === '') {
        if (hiddenId) hiddenId.value = '';
    }

    let matches = [];
    if (query.length === 0) {
        matches = (config.categorias || []).slice(0, 200);
    } else {
        // 1. Encontrar correspondências diretas
        const directMatches = (config.categorias || []).filter(c => {
            const nameNorm = (c.nome || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const cod = (c.codigo || '').toLowerCase();
            return nameNorm.includes(query) || cod.includes(query);
        });

        // 2. Incluir as subcategorias associadas a essas correspondências
        matches = (config.categorias || []).filter(c => {
            return directMatches.some(dm => {
                return c.id === dm.id || (c.codigo && dm.codigo && c.codigo.startsWith(dm.codigo + '.'));
            });
        }).slice(0, 200);
    }

    if (matches.length === 0) {
        resultsDiv.innerHTML = '<div class="autocomplete-item" style="color:var(--text-muted); font-size:0.75rem;">Nenhuma categoria encontrada...</div>';
    } else {
        resultsDiv.innerHTML = matches.map(c => {
            const label = (c.codigo ? `${c.codigo} - ` : '') + c.nome;
            return `
                <div class="autocomplete-item" onclick="selectCategoria('${c.id}', '${label.replace(/'/g, "\\'")}', this)">
                    <span class="prod-name">${label}</span>
                </div>
            `;
        }).join('');
    }
    
    positionDropdown(el, resultsDiv);
    resultsDiv.style.display = 'block';
};

window.selectCategoria = (id, label, itemEl) => {
    const wrapper = itemEl.closest('.autocomplete-wrapper');
    const searchInput = wrapper.querySelector('#categoriaSearch');
    const hiddenId = wrapper.querySelector('#categoriaId');
    const resultsDiv = wrapper.querySelector('.autocomplete-results');

    searchInput.value = label;
    hiddenId.value = id;
    resultsDiv.style.display = 'none';
    resultsDiv.innerHTML = '';
};

window.handleProductSearch = (el) => {
    currentAutocompleteIndex = -1;
    const query = el.value.toLowerCase().trim();
    const resultsDiv = el.parentElement.querySelector('.autocomplete-results');
    
    if (query.length === 0) {
        resultsDiv.innerHTML = '';
        resultsDiv.style.display = 'none';
        return;
    }

    const matches = inventoryProducts.filter(p => 
        p.nome.toLowerCase().includes(query) || 
        (p.ref && p.ref.toLowerCase().includes(query)) ||
        (p.marca && p.marca.toLowerCase().includes(query)) ||
        (p.codigo_barras && p.codigo_barras.toLowerCase().includes(query)) ||
        (p.codigo_interno && p.codigo_interno.toLowerCase().includes(query))
    ).slice(0, 10);

    if (matches.length === 0) {
        resultsDiv.innerHTML = '<div class="autocomplete-item" style="color:var(--text-muted); font-size:0.75rem;">Nenhum produto encontrado...</div>';
    } else {
        resultsDiv.innerHTML = matches.map(p => `
            <div class="autocomplete-item" onclick="selectProduct('${p.id}', '${p.nome.replace(/'/g, "\\'")}', '${(p.marca || '').replace(/'/g, "\\'")}', this)">
                <span class="prod-name">${p.nome}</span>
                <span class="prod-meta">${p.marca || 'SEM MARCA'} | SKU: ${p.ref || '---'} | EAN: ${p.codigo_barras || '---'}</span>
                <span class="prod-meta" style="color:var(--primary); font-weight:600; margin-top:0.1rem;">APP: ${p.aplicacao || 'UNIVERSAL'}</span>
                <span class="prod-meta">ESTOQUE ATUAL: ${p.estoque_atual} ${p.unidade || ''}</span>
            </div>
        `).join('');
    }
    
    positionDropdown(el, resultsDiv);
    resultsDiv.style.display = 'block';
};

window.selectProduct = (id, nome, marca, itemEl) => {
    const wrapper = itemEl.closest('.autocomplete-wrapper');
    const searchInput = wrapper.querySelector('.item-produto-search');
    const hiddenId = wrapper.querySelector('.item-produto');
    const resultsDiv = wrapper.querySelector('.autocomplete-results');

    searchInput.value = `${nome} ${marca ? `(${marca})` : ''}`;
    hiddenId.value = id;
    resultsDiv.style.display = 'none';
    resultsDiv.innerHTML = '';
};

// Close autocomplete when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.autocomplete-wrapper')) {
        document.querySelectorAll('.autocomplete-results').forEach(el => el.style.display = 'none');
    }
});

window.addAdditionalRow = () => {
    const container = document.getElementById('additionalContainer');
    const rowId = 'add_' + Date.now() + Math.random();
    const row = document.createElement('div');
    row.style = "display: grid; grid-template-columns: 2fr 1fr auto; gap: 1rem; align-items: center; background:rgba(255,255,255,0.02); padding:0.8rem; border-radius:10px;";
    row.id = rowId;
    row.innerHTML = `<input type="text" class="add-desc compra-input" placeholder="Ex: Frete"> <input type="number" step="0.01" class="add-val compra-input" value="0" onchange="calculateTotal()"> <button type="button" class="btn-plus" style="background:none; border:none; color:#64748b;" onclick="document.getElementById('${rowId}').remove(); calculateTotal();"><i data-lucide="x"></i></button>`;
    container.appendChild(row);
    if (window.lucide) lucide.createIcons();
};

window.toggleParcelasSection = (el) => {
    el.classList.toggle('active');
    const visible = el.classList.contains('active');
    document.getElementById('parcelasSection').style.display = visible ? 'block' : 'none';
    const qtyWrapper = document.getElementById('qtdParcWrapper');
    qtyWrapper.style.opacity = visible ? '1' : '0.5';
    qtyWrapper.style.pointerEvents = visible ? 'auto' : 'none';

    // Anular campo de vencimento principal para evitar conflito
    const vencimentoInput = document.getElementById('vencimentoNota');
    if (visible) {
        vencimentoInput.value = '';
        vencimentoInput.disabled = true;
        if (vencimentoInput.parentElement) {
            vencimentoInput.parentElement.style.opacity = '0.5';
            vencimentoInput.parentElement.style.pointerEvents = 'none';
        }
    } else {
        vencimentoInput.disabled = false;
        if (vencimentoInput.parentElement) {
            vencimentoInput.parentElement.style.opacity = '1';
            vencimentoInput.parentElement.style.pointerEvents = 'auto';
        }
        // Restaura a data de hoje se estiver vazio
        if (!vencimentoInput.value) {
            vencimentoInput.valueAsDate = new Date();
        }
    }

    if (visible) generateInstallments();
    calculateTotal();
};

window.generateInstallments = () => {
    const container = document.getElementById('parcelasContainer');
    const qty = parseInt(document.getElementById('qtdParcelas').value) || 1;
    const totalNota = calculateTotal();
    const baseValue = (totalNota / qty).toFixed(2);
    container.innerHTML = '';
    const dateOrigin = new Date(document.getElementById('dataCompra').value || new Date());
    for (let i = 1; i <= qty; i++) {
        const dueDate = new Date(dateOrigin);
        dueDate.setMonth(dueDate.getMonth() + i);
        const row = document.createElement('div');
        row.className = 'parcela-row';
        row.style = "display: grid; grid-template-columns: 100px 1fr 1fr 30px; gap: 1.5rem; align-items: center; margin-bottom: 0.8rem; background: rgba(0, 0, 0, 0.2); padding: 0.8rem; border-radius: 10px;";
        row.innerHTML = `<div style="font-weight: 700; color: var(--primary)">Parcela ${i}</div><input type="date" class="parc-date compra-input" value="${dueDate.toISOString().split('T')[0]}" onchange="calculateTotal()"><input type="number" step="0.01" class="parc-val compra-input" value="${baseValue}" onchange="calculateTotal()"><i data-lucide="info" style="width:14px; opacity: 0.5"></i>`;
        container.appendChild(row);
    }
    if (window.lucide) lucide.createIcons();
    calculateTotal();
};

function updateRowTotal(el) {
    const row = el.closest('.item-row');
    const qtd = parseFloat(row.querySelector('.item-qtd').value) || 0;
    const unit = parseFloat(row.querySelector('.item-unit').value) || 0;
    const total = qtd * unit;
    row.querySelector('.item-total-row').value = total.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    calculateTotal();
}

function calculateTotal() {
    let subtotalPecas = 0;
    let subtotalServicos = 0;
    let subtotalAdicionais = 0;

    document.querySelectorAll('.item-row').forEach(row => {
        const typeBtn = row.querySelector('.type-btn.active');
        const isServico = typeBtn?.innerText.trim().toUpperCase() === 'SERVIÇO';
        
        const q = parseFloat(row.querySelector('.item-qtd').value) || 0;
        const u = parseFloat(row.querySelector('.item-unit').value) || 0;
        const total = q * u;
        
        if (isServico) subtotalServicos += total;
        else subtotalPecas += total;
    });

    document.querySelectorAll('.add-val').forEach(input => {
        subtotalAdicionais += parseFloat(input.value) || 0;
    });

    const totalGeral = subtotalPecas + subtotalServicos + subtotalAdicionais;

    document.getElementById('summaryText').innerHTML = `
        <div style="display:flex; gap:1.2rem; font-size:0.65rem; color:var(--text-muted); font-weight:800; margin-top:0.3rem; text-transform:uppercase;">
            <span>PEÇAS: R$ ${subtotalPecas.toFixed(2)}</span>
            <span>SERVIÇOS: R$ ${subtotalServicos.toFixed(2)}</span>
            <span>OUTROS: R$ ${subtotalAdicionais.toFixed(2)}</span>
        </div>
        <div style="margin-top:0.2rem; font-size:0.8rem; opacity:0.7;">
            ${document.querySelectorAll('.item-row').length} itens + ${document.querySelectorAll('.add-val').length} adicionais
        </div>
    `;
    
    document.getElementById('totalNotaVisual').innerText = totalGeral.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const toggleP = document.getElementById('toggleParcelas');
    if (toggleP?.classList.contains('active')) {
        let sumParc = 0;
        document.querySelectorAll('.parc-val').forEach(inp => sumParc += parseFloat(inp.value) || 0);
        document.getElementById('sumParcelas').innerText = sumParc.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
        const isValid = Math.abs(totalGeral - sumParc) < 1;
        document.getElementById('validationMsg').style.display = isValid ? 'none' : 'block';
        document.getElementById('btnSaveCompra').disabled = !isValid;
        document.getElementById('btnSaveCompra').style.opacity = isValid ? '1' : '0.5';
    } else {
        document.getElementById('btnSaveCompra').disabled = false;
        document.getElementById('btnSaveCompra').style.opacity = '1';
    }
    return totalGeral;
}

window.checkDuplicateNota = () => {
    const numNota = document.getElementById('numNota')?.value.trim();
    const fornecedorId = document.getElementById('fornecedorId')?.value;
    
    if (!numNota || !fornecedorId) return;

    const isDuplicate = compras.some(c => 
        c.fornecedorId === fornecedorId && 
        String(c.numeroNota).trim() === numNota && 
        c.id != editId
    );

    if (isDuplicate) {
        const fornObj = config.fornecedores.find(f => f.id == fornecedorId);
        alert(`⚠️ Atenção: Já existe uma nota lançada com o número "${numNota}" para o fornecedor "${fornObj ? fornObj.nome : 'selecionado'}".`);
    }
};

async function handleSaveCompra(e) {
    if (e) e.preventDefault();
    const isEditing = !!editId;
    if (isEditing) {
        if (!canDo('compras_historico', 'edit')) {
            alert('Você não tem permissão para editar compras.');
            return;
        }
    } else {
        if (!canDo('compras_historico', 'add')) {
            alert('Você não tem permissão para lançar compras.');
            return;
        }
    }
    console.log("🚀 CLIQUE NO BOTÃO SALVAR DETECTADO!");
    
    try {
        const parseBr = (val) => {
            if (!val) return 0;
            let str = val.toString().replace(/\s/g, '');
            if (str.includes(',')) {
                str = str.replace(/\./g, '').replace(',', '.');
            }
            return parseFloat(str) || 0;
        };

        // 1. Header Validation
        const dataCompra = document.getElementById('dataCompra').value;
        const numNota = document.getElementById('numNota').value.trim();
        const especieId = document.getElementById('especieId').value;
        const fornecedorId = document.getElementById('fornecedorId').value;
        
        console.log("📝 Dados do Cabeçalho:", { dataCompra, numNota, especieId, fornecedorId });

        if (!dataCompra || !numNota || !especieId || !fornecedorId) {
            alert('⚠️ Preencha todos os campos: Data, Nº Nota, Espécie e Fornecedor.');
            return;
        }

        // 2. Duplicate Validation (Same supplier + Same invoice number)
        const isDuplicate = compras.some(c => 
            c.fornecedorId === fornecedorId && 
            String(c.numeroNota).trim() === numNota && 
            c.id != editId
        );

        if (isDuplicate) {
            const fornObj = config.fornecedores.find(f => f.id == fornecedorId);
            alert(`⚠️ Atenção: Já existe uma nota lançada com o número "${numNota}" para o fornecedor "${fornObj ? fornObj.nome : 'selecionado'}".`);
            return;
        }

        const finalTotal = calculateTotal();
        console.log("💰 Total Calculado:", finalTotal);

        const items = [];
        const itemRows = document.querySelectorAll('.item-row');
        console.log("📦 Qtd de Linhas de Itens:", itemRows.length);

        if (itemRows.length === 0) {
            alert('Adicione pelo menos um item.');
            return;
        }

        let itemsValid = true;
        let itemErrorMsg = '';

        itemRows.forEach((r, idx) => {
            const typeBtn = r.querySelector('.type-btn.active');
            const isServico = typeBtn?.innerText.trim().toUpperCase() === 'SERVIÇO';
            
            const prodId = isServico ? null : r.querySelector('.item-produto').value;
            const manualProdDesc = isServico ? null : r.querySelector('.item-produto-search').value.trim();
            const servDesc = isServico ? r.querySelector('.item-servico-desc').value.trim() : null;
            const qtd = parseBr(r.querySelector('.item-qtd').value);
            const unit = parseBr(r.querySelector('.item-unit').value);
            const centroCustoId = r.querySelector('.item-cc').value;

            console.log(`🔹 Item ${idx + 1}:`, { isServico, prodId, manualProdDesc, qtd, unit, centroCustoId });

            if (!isServico && !prodId && !manualProdDesc) {
                itemsValid = false;
                itemErrorMsg = `O item ${idx + 1} (Peça) está sem descrição ou produto selecionado.`;
            } else if (isServico && !servDesc) {
                itemsValid = false;
                itemErrorMsg = `O item ${idx + 1} (Serviço) está sem descrição.`;
            } else if (!centroCustoId) {
                itemsValid = false;
                itemErrorMsg = `O item ${idx + 1} está sem Centro de Custo selecionado.`;
            } else if (qtd <= 0 || unit <= 0) {
                itemsValid = false;
                itemErrorMsg = `O item ${idx + 1} deve ter quantidade e valor unitário maiores que zero.`;
            }

            if (itemsValid) {
                const stockT = r.querySelector('.stock-toggle');
                items.push({
                    tipo: isServico ? 'servico' : 'peca',
                    produtoId: prodId,
                    descricaoServico: isServico ? servDesc : manualProdDesc,
                    quantidade: qtd,
                    valorUnitario: unit,
                    valorVenda: isServico ? 0 : parseBr(r.querySelector('.item-venda').value),
                    estoque: isServico ? false : (stockT ? (stockT.classList.contains('active') && !!prodId) : false),
                    pessoa: r.querySelector('.item-pessoa')?.value || '',
                    veiculoId: r.querySelector('.item-veiculo')?.value || '',
                    centroCustoId, // New: item-level CC
                    produto: isServico ? servDesc : manualProdDesc,
                    // Maintenance Fields
                    maintControl: r.querySelector('.maint-control-toggle')?.classList.contains('active') || false,
                    maintTipoId: r.querySelector('.maint-tipo-id')?.value || '',
                    maintAcaoId: r.querySelector('.maint-acao-id')?.value || '',
                    maintKm: r.querySelector('.maint-km')?.value || '',
                    maintControle: r.querySelector('.maint-controle-troca')?.value || 'NENHUMA',
                    maintIntervaloKm: r.querySelector('.maint-intervalo-km')?.value || '',
                    maintIntervaloMeses: r.querySelector('.maint-intervalo-meses')?.value || '',
                    maintGarantia: r.querySelector('.maint-possui-garantia')?.value === 'true',
                    maintMesesGarantia: r.querySelector('.maint-meses-garantia')?.value || ''
                });
            }
        });

        if (!itemsValid) {
            alert(itemErrorMsg);
            return;
        }

        const formaPgtoId = document.getElementById('tipoPgtoId').value;
        const vencimento = document.getElementById('vencimentoNota').value;
        if (!formaPgtoId) {
            alert('Selecione a forma de pagamento.');
            return;
        }

        // Validate Maintenance Fields
        for (const row of itemRows) {
            const typeBtn = row.querySelector('.type-btn.active');
            const isServico = typeBtn?.innerText.trim().toUpperCase() === 'SERVIÇO';
            const isMaintActive = row.querySelector('.maint-control-toggle')?.classList.contains('active');
            
            if (isMaintActive) {
                const placa = row.querySelector('.item-veiculo-search')?.value;
                const veiculoId = row.querySelector('.item-veiculo')?.value;
                const tipoId = row.querySelector('.maint-tipo-id')?.value;
                const acaoId = row.querySelector('.maint-acao-id')?.value;
                
                if (!veiculoId) {
                    alert(`O serviço "${row.querySelector('.item-servico-desc').value}" está marcado para controle de manutenção, mas não possui um veículo vinculado.`);
                    return;
                }
                if (!tipoId || !acaoId) {
                    alert(`Preencha o Tipo e a Ação de manutenção para o serviço "${row.querySelector('.item-servico-desc').value}".`);
                    return;
                }
            }
        }

        const toggleP = document.getElementById('toggleParcelas');
        const isParcelado = toggleP?.classList.contains('active') || false;
        const qtdParcelas = parseInt(document.getElementById('qtdParcelas').value) || 1;
        let parcelasData = [];

        if (isParcelado) {
            const parcRows = document.querySelectorAll('.parcela-row');
            let sumParc = 0;
            let parcsValid = true;

            parcRows.forEach(row => {
                const d = row.querySelector('.parc-date').value;
                const v = parseBr(row.querySelector('.parc-val').value);
                if (!d || v <= 0) parcsValid = false;
                sumParc += v;
                parcelasData.push({ data: d, valor: v });
            });

            if (!parcsValid) {
                alert('Verifique as datas e valores das parcelas.');
                return;
            }

            if (Math.abs(finalTotal - sumParc) >= 1) { 
                alert(`A soma das parcelas (R$ ${sumParc.toFixed(2)}) não coincide com o total (R$ ${finalTotal.toFixed(2)}).`);
                return;
            }
        }

        const labelEl = document.getElementById('labelCodUnico');
        const labelText = labelEl.innerText || "";
        const codUnico = labelText.includes(': ') ? labelText.split(': ')[1] : labelText;

        const categoriaId = document.getElementById('categoriaId').value;

        const compraData = {
            id: editId || codUnico, 
            codUnico,
            data: dataCompra,
            numeroNota: numNota,
            especieId,
            fornecedorId,
            formaPgtoId,
            categoriaId,
            vencimento,
            itens: items,
            parcelasData,
            valorTotal: finalTotal,
            financeiro: isParcelado,
            qtdParcelas: qtdParcelas,
            adicionais: Array.from(document.querySelectorAll('.add-val')).map(inp => ({
                descricao: inp.previousElementSibling?.value || 'Adicional',
                valor: parseBr(inp.value)
            })),
            observacoes: document.getElementById('obsCompra')?.value || ''
        };

        // Extract maintenance data from items
        const maintRecords = [];
        itemRows.forEach((row, idx) => {
            const typeBtn = row.querySelector('.type-btn.active');
            const isServico = typeBtn?.innerText.trim().toUpperCase() === 'SERVIÇO';
            const isMaintActive = row.querySelector('.maint-control-toggle')?.classList.contains('active');
            
            if (isMaintActive) {
                const itemData = items[idx];
                maintRecords.push({
                    veiculo_id: row.querySelector('.item-veiculo').value,
                    tipo_id: row.querySelector('.maint-tipo-id').value,
                    acao_id: row.querySelector('.maint-acao-id').value,
                    km_atual: row.querySelector('.maint-km').value || 0,
                    controle_proxima_troca: row.querySelector('.maint-controle-troca').value,
                    intervalo_km: row.querySelector('.maint-intervalo-km')?.value || null,
                    intervalo_meses: row.querySelector('.maint-intervalo-meses')?.value || null,
                    possui_garantia: row.querySelector('.maint-possui-garantia').value === 'true',
                    meses_garantia: row.querySelector('.maint-meses-garantia')?.value || null,
                    descricao: isServico ? row.querySelector('.item-servico-desc').value : row.querySelector('.item-produto-search').value,
                    valor_pecas: isServico ? 0 : itemData.valorUnitario * itemData.quantidade,
                    valor_servicos: isServico ? itemData.valorUnitario * itemData.quantidade : 0,
                    oficina_id: compraData.fornecedorId 
                });
            }
        });

        if (editId) {
            console.log("🔄 Revertendo estoque anterior...");
            const oldCompra = compras.find(c => c.id == editId);
            if (oldCompra) {
                const successInv = await rollbackInventory(oldCompra);
                if (!successInv) return;
                await rollbackMaintenance(oldCompra); 
            }
            const idx = compras.findIndex(item => item.id == editId);
            if (idx !== -1) compras[idx] = compraData;
        } else {
            compras.push(compraData);
        }

        if (supabaseClient) {
            console.log("🌐 Sincronizando com Supabase...");
            
            // 1. Sync the Purchase itself
            try {
                const isUuid = (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
                
                const dbCompra = {
                    id: String(compraData.id),
                    data_emissao: compraData.data,
                    numero_nota: compraData.numeroNota,
                    especie_id: isUuid(compraData.especieId) ? compraData.especieId : null,
                    fornecedor_id: isUuid(compraData.fornecedorId) ? compraData.fornecedorId : null,
                    forma_pagamento_id: isUuid(compraData.formaPgtoId) ? compraData.formaPgtoId : null,
                    categoria_id: isUuid(compraData.categoriaId) ? compraData.categoriaId : null,
                    data_vencimento: compraData.vencimento || null,
                    valor_total: compraData.valorTotal,
                    financeiro_parcelado: compraData.financeiro,
                    qtd_parcelas: compraData.qtdParcelas,
                    observacoes: compraData.observacoes
                };

                console.log("📤 Enviando para Supabase:", dbCompra);
                const { error: compError } = await supabaseClient.from('compras').upsert([dbCompra]);
                if (compError) {
                    console.error("❌ Erro ao salvar compra:", compError);
                    alert("Erro ao salvar compra no banco de dados: " + compError.message);
                    return;
                }

                // 2. Sync Items
                await supabaseClient.from('compra_itens').delete().eq('compra_id', dbCompra.id);
                const dbItems = compraData.itens.map(it => ({
                    compra_id: dbCompra.id,
                    tipo: it.tipo || 'peca',
                    produto: it.produto,
                    marca: it.marca || '',
                    quantidade: it.quantidade,
                    valor_unitario: it.valorUnitario,
                    estoque: it.estoque || false,
                    vinculo_veiculo_id: isUuid(it.veiculoId) ? it.veiculoId : null,
                    vinculo_pessoa: it.pessoa || '',
                    produto_id: isUuid(it.produtoId) ? it.produtoId : null,
                    centro_custo_id: isUuid(it.centroCustoId) ? it.centroCustoId : null,
                    // Maintenance Fields
                    maint_control: it.maintControl || false,
                    maint_tipo_id: isUuid(it.maintTipoId) ? it.maintTipoId : null,
                    maint_acao_id: isUuid(it.maintAcaoId) ? it.maintAcaoId : null,
                    maint_km: parseFloat(it.maintKm) || null,
                    maint_controle: it.maintControle || 'NENHUMA',
                    maint_intervalo_km: parseFloat(it.maintIntervaloKm) || null,
                    maint_intervalo_meses: parseInt(it.maintIntervaloMeses) || null,
                    maint_garantia: it.maintGarantia || false,
                    maint_meses_garantia: parseInt(it.maintMesesGarantia) || null
                }));
                if (dbItems.length > 0) {
                    const { error: itemsError } = await supabaseClient.from('compra_itens').insert(dbItems);
                    if (itemsError) {
                        console.error("❌ Erro ao salvar itens:", itemsError);
                        alert("Erro ao salvar itens da compra: " + itemsError.message);
                        return; // Stop here if items failed
                    }
                }

                // 3. Sync Additionals
                await supabaseClient.from('compra_adicionais').delete().eq('compra_id', dbCompra.id);
                const dbAdds = (compraData.adicionais || []).map(ad => ({
                    compra_id: dbCompra.id,
                    descricao: ad.descricao,
                    valor: ad.valor
                }));
                if (dbAdds.length > 0) {
                    const { error: addsError } = await supabaseClient.from('compra_adicionais').insert(dbAdds);
                    if (addsError) console.error("❌ Erro adicionais:", addsError);
                }

                // 4. Sync Installments
                await supabaseClient.from('compra_parcelas').delete().eq('compra_id', dbCompra.id);
                const dbParcs = (compraData.parcelasData || []).map((p, idx) => ({
                    compra_id: dbCompra.id,
                    numero_parcela: idx + 1,
                    data_vencimento: p.data,
                    valor: p.valor,
                    status: 'PENDENTE'
                }));
                if (dbParcs.length > 0) {
                    const { error: parcsError } = await supabaseClient.from('compra_parcelas').insert(dbParcs);
                    if (parcsError) console.error("❌ Erro parcelas:", parcsError);
                }

                alert("✅ Compra salva e sincronizada com sucesso!");

            } catch (err) {
                console.error("❌ Erro crítico ao sincronizar:", err);
                alert("Ocorreu um erro inesperado ao salvar: " + err.message);
            }

            const fornObj = config.fornecedores.find(f => f.id == compraData.fornecedorId) || {};
            const fornNome = fornObj.nome || 'Fornecedor';
    
            for (const it of compraData.itens) {
                if (it.estoque && it.produtoId) {
                    try {
                        await supabaseClient.from('estoque_movimentacoes').insert([{
                            item_id: it.produtoId,
                            tipo: 'ENTRADA',
                            quantidade: it.quantidade,
                            motivo: `COMPRA: Nota #${compraData.numeroNota} | ${fornNome}`,
                            responsavel: 'SISTEMA COMPRAS',
                            valor_unitario: it.valorUnitario,
                            data: new Date().toISOString()
                        }]);

                        const { data: prod } = await supabaseClient.from('estoque').select('estoque_atual').eq('id', it.produtoId).single();
                        if (prod) {
                            const newStock = (parseFloat(prod.estoque_atual) || 0) + it.quantidade;
                            await supabaseClient.from('estoque').update({ 
                                estoque_atual: newStock,
                                valor_custo: it.valorUnitario,
                                valor_venda: it.valorVenda || 0
                            }).eq('id', it.produtoId);
                        }
                    } catch (err) { console.error("❌ Erro Supabase Item:", err); }
                }
            }

            // --- INTEGRATION: CREATE MAINTENANCE RECORDS ---
            if (maintRecords.length > 0) {
                console.log("🛠️ Criando registros de manutenção...");
                for (const m of maintRecords) {
                    try {
                        const isUuid = (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
                        
                        const vehOk = isUuid(m.veiculo_id);
                        const fornOk = isUuid(fornObj.id || m.oficina_id);

                        if (!vehOk || !fornOk) {
                            const motivo = !vehOk ? `o Veículo (${m.veiculo_id})` : `o Fornecedor (${fornObj.id || m.oficina_id})`;
                            console.warn("⚠️ Pulando integração de manutenção: ID não é um UUID válido.", { veiculo: m.veiculo_id, oficina: fornObj.id || m.oficina_id });
                            alert(`⚠️ Atenção: O item "${m.descricao}" não pôde ser integrado à Manutenção porque ${motivo} é um cadastro local (não sincronizado com a nuvem).`);
                            continue;
                        }

                        const typeObj = maintTypes.find(t => t.id == m.tipo_id);
                        const typeDesc = typeObj ? typeObj.descricao.toUpperCase() : 'CORRETIVA';

                        // 1. Insert main maintenance record
                        const { data: newMaint, error: maintError } = await supabaseClient.from('manutencoes').insert([{
                            veiculo_id: m.veiculo_id,
                            oficina_id: fornObj.id || m.oficina_id,
                            tipo_id: m.tipo_id || null,
                            data: compraData.data,
                            km_atual: parseFloat(m.km_atual) || 0,
                            status: 'PENDENTE' // Updated to PENDENTE as requested
                        }]).select().single();

                        if (maintError) {
                            console.error("❌ Erro ao criar cabeçalho de manutenção:", maintError);
                            alert("Erro ao criar registro de manutenção: " + maintError.message);
                            continue;
                        }

                        // 2. Insert maintenance item
                        if (newMaint) {
                            const currentKm = parseFloat(m.km_atual) || 0;
                            const intervalKm = parseFloat(m.intervalo_km) || 0;
                            const intervalMonths = parseInt(m.intervalo_meses) || 0;
                            const warrantyMonths = parseInt(m.meses_garantia) || 0;

                            const proxima_troca_km = m.controle_proxima_troca === 'KM' ? (currentKm + intervalKm) : null;
                            
                            let proxima_troca_data = null;
                            if (m.controle_proxima_troca === 'DATA' && intervalMonths > 0) {
                                const baseDate = new Date(compraData.data);
                                baseDate.setMonth(baseDate.getMonth() + intervalMonths);
                                proxima_troca_data = baseDate.toISOString().split('T')[0];
                            }

                            let vencimento_garantia = null;
                            if (m.possui_garantia && warrantyMonths > 0) {
                                const baseDate = new Date(compraData.data);
                                baseDate.setMonth(baseDate.getMonth() + warrantyMonths);
                                vencimento_garantia = baseDate.toISOString().split('T')[0];
                            }

                            const { error: itemError } = await supabaseClient.from('manutencao_itens').insert([{
                                manutencao_id: newMaint.id,
                                acao_id: m.acao_id || null,
                                descricao: `[ID:${compraData.id}] ${m.descricao}`, // Changed to unique internal ID
                                valor_pecas: 0,
                                valor_servicos: parseFloat(m.valor_servicos) || 0,
                                possui_garantia: m.possui_garantia,
                                meses_garantia: warrantyMonths || null,
                                vencimento_garantia: vencimento_garantia,
                                origem_garantia: 'OFICINA', // Linked to the supplier/office
                                origem_garantia_fornecedor_id: fornObj.id || m.oficina_id,
                                controle_proxima_troca: m.controle_proxima_troca,
                                intervalo_km: intervalKm || null,
                                intervalo_meses: intervalMonths || null,
                                proxima_troca_km: proxima_troca_km,
                                proxima_troca_data: proxima_troca_data
                            }]);

                            if (itemError) {
                                console.error("❌ Erro ao criar item de manutenção:", itemError);
                                alert("Erro ao criar detalhe da manutenção: " + itemError.message);
                            }
                        }
                    } catch (err) {
                        console.error("❌ Erro inesperado na manutenção:", err);
                    }
                }
            }
        }

        console.log("✅ FIM DO PROCESSO!");
        closeCompraModal();
        renderCompras();
        updateDashboard();

    } catch (error) {
        console.error("🔴 ERRO CRÍTICO NO SALVAMENTO:", error);
        alert("Erro crítico: " + error.message);
    }
}

async function rollbackInventory(compra) {
    if (!supabaseClient) return true;
    
    console.log("🔍 Iniciando rollback para nota:", compra.numeroNota);
    for (const it of (compra.items || compra.itens || [])) {
        if (it.estoque && it.produtoId) {
            try {
                const { data: movements, error: mvError } = await supabaseClient
                    .from('estoque_movimentacoes')
                    .select('*')
                    .eq('item_id', it.produtoId)
                    .ilike('motivo', `COMPRA: Nota #${compra.numeroNota}%`)
                    .eq('tipo', 'ENTRADA')
                    .order('created_at', { ascending: false })
                    .limit(1);

                if (mvError) throw mvError;
                
                console.log(`🔍 Rollback: ${movements?.length || 0} movimentos encontrados para o item ${it.produtoId}`);
                if (movements && movements.length > 0) {
                    const entryMv = movements[0];

                    const { data: laterMvs, error: laterError } = await supabaseClient
                        .from('estoque_movimentacoes')
                        .select('id, tipo, motivo')
                        .eq('item_id', it.produtoId)
                        .gt('created_at', entryMv.created_at)
                        .eq('tipo', 'SAIDA');

                    if (laterError) throw laterError;

                    if (laterMvs && laterMvs.length > 0) {
                        alert(`BLOQUEIO DE SEGURANÇA: O produto "${it.produtoNome || 'Item'}" já possui saídas registradas após esta entrada. Não é possível alterar/excluir esta nota sem remover as saídas primeiro.`);
                        return false;
                    }

                    await supabaseClient.from('estoque_movimentacoes').insert([{
                        item_id: it.produtoId,
                        tipo: 'ESTORNO',
                        quantidade: parseFloat(it.quantidade),
                        motivo: `AJUSTE/EDIÇÃO NOTA: #${compra.numeroNota}`,
                        responsavel: 'SISTEMA COMPRAS (REVERSÃO)',
                        valor_unitario: parseFloat(it.valorUnitario),
                        data: new Date().toISOString()
                    }]);

                    const { data: prod } = await supabaseClient.from('estoque').select('estoque_atual').eq('id', it.produtoId).single();
                    if (prod) {
                        const rolledBackStock = (parseFloat(prod.estoque_atual) || 0) - parseFloat(it.quantidade);
                        await supabaseClient.from('estoque').update({ estoque_atual: rolledBackStock }).eq('id', it.produtoId);
                    }
                }
            } catch (err) {
                console.error("❌ Erro Rollback Item:", err);
            }
        }
    }
    return true;
}

async function rollbackMaintenance(compra) {
    if (!supabaseClient) return true;
    
    console.log("🔍 Limpando manutenções anteriores da nota ID:", compra.id);
    try {
        // Find items linked to this purchase using the unique internal ID
        const tag = `[ID:${compra.id}]`;
        
        const { data: items, error: itemError } = await supabaseClient
            .from('manutencao_itens')
            .select('id, manutencao_id')
            .filter('descricao', 'ilike', `%${tag}%`);

        if (itemError) throw itemError;

        if (items && items.length > 0) {
            const maintIds = [...new Set(items.map(it => it.manutencao_id))];
            
            // Delete items
            await supabaseClient.from('manutencao_itens').delete().in('id', items.map(it => it.id));
            
            // Delete parent maintenance if they have no more items
            for (const mId of maintIds) {
                const { data: remaining } = await supabaseClient.from('manutencao_itens').select('id').eq('manutencao_id', mId).limit(1);
                if (!remaining || remaining.length === 0) {
                    await supabaseClient.from('manutencoes').delete().eq('id', mId);
                }
            }
            console.log(`✅ ${items.length} itens de manutenção removidos.`);
        }
    } catch (err) {
        console.error("❌ Erro ao limpar manutenções:", err);
    }
    return true;
}

function renderThead() {
    const table = document.getElementById('comprasTable');
    if (!table) return;
    const thead = table.previousElementSibling || table.parentElement.querySelector('thead');
    if (!thead) return;
    const activeCols = COL_DEFS.compras.filter(c => c.visible);
    
    thead.innerHTML = `<tr>${activeCols.map(c => {
        const isCurrent = currentSort.key === c.key;
        const canSort = c.key !== 'actions';
        
        // Icon logic: if current, show dir. if not, show subtle up-down to indicate sortable
        let icon = '';
        if (canSort) {
            if (isCurrent) {
                icon = currentSort.dir === 'asc' 
                    ? '<i data-lucide="chevron-up" style="width:14px; color:var(--primary);"></i>' 
                    : '<i data-lucide="chevron-down" style="width:14px; color:var(--primary);"></i>';
            } else {
                icon = '<i data-lucide="chevrons-up-down" style="width:12px; opacity:0.2;"></i>';
            }
        }
        
        return `<th ${canSort ? `onclick="handleSort('${c.key}')" style="cursor:pointer; user-select:none; transition: all 0.2s;"` : ''} class="${isCurrent ? 'active-sort' : ''}">
            <div style="display:flex; align-items:center; gap:0.5rem; justify-content: ${c.key === 'actions' ? 'flex-end' : 'flex-start'}">
                ${c.label}
                <span class="sort-icon-wrapper" style="display:flex; align-items:center;">${icon}</span>
            </div>
        </th>`;
    }).join('')}</tr>`;
    if (window.lucide) lucide.createIcons();
}

window.handleSort = (key) => {
    if (currentSort.key === key) {
        currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.key = key;
        currentSort.dir = 'asc';
    }
    renderCompras();
};

function renderCompras() {
    const list = document.getElementById('comprasTable');
    if (!list) return;
    renderThead();
    
    const norm = (str) => (str || '').toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const searchInput = document.getElementById('compraSearch');
    const search = norm(searchInput?.value);
    
    let filtered = compras.filter(c => {
        const fornecedorObj = config.fornecedores.find(f => f.id == c.fornecedorId) || {};
        
        // Coletar placas vinculadas aos itens para busca
        const itemPlacas = (c.itens || c.items || []).map(it => {
            if (it.veiculoId) {
                const v = (vehicles || []).find(veh => veh.id == it.veiculoId);
                return v ? v.placa : '';
            }
            return '';
        }).join(' ');

        const searchable = [
            fornecedorObj.nome, 
            c.numeroNota, 
            (c.itens || c.items || []).map(i => i.produto).join(' '),
            itemPlacas
        ].map(txt => norm(txt)).join(' ');

        return searchable.includes(search);
    });

    // --- APLICAR FILTROS RÁPIDOS ---
    const filterStart = document.getElementById('filterDateStart').value;
    const filterEnd = document.getElementById('filterDateEnd').value;
    const filterEsp = document.getElementById('filterEspecie').value;
    const filterForn = document.getElementById('filterFornecedor').value;
    const filterPlaca = document.getElementById('filterPlaca').value;
    const filterPai = document.getElementById('filterCentroPai').value;
    const filterCusto = document.getElementById('filterCusto').value;
    const filterPgto = document.getElementById('filterPagamento').value;

    filtered = filtered.filter(c => {
        if (filterStart && c.data < filterStart) return false;
        if (filterEnd && c.data > filterEnd) return false;
        if (filterEsp && c.especieId != filterEsp) return false;
        if (filterForn && c.fornecedorId != filterForn) return false;
        if (filterPgto && c.formaPgtoId != filterPgto) return false;
        
        if (filterPlaca) {
            const hasPlaca = (c.itens || []).some(it => it.veiculoId == filterPlaca);
            if (!hasPlaca) return false;
        }

        if (filterPai) {
            const hasPai = (c.itens || []).some(it => {
                const cc = config.centrosCusto.find(x => x.id == it.centroCustoId);
                return cc && cc.parentId == filterPai;
            });
            if (!hasPai) return false;
        }
        
        return true;
    });

    // --- APLICAR ORDENAÇÃO ---
    filtered.sort((a, b) => {
        let valA, valB;

        switch (currentSort.key) {
            case 'data':
                valA = new Date(a.data + 'T12:00:00');
                valB = new Date(b.data + 'T12:00:00');
                break;
            case 'valorTotal':
                valA = parseFloat(a.valorTotal) || 0;
                valB = parseFloat(b.valorTotal) || 0;
                break;
            case 'numeroNota':
                valA = (a.numeroNota || '').toString();
                valB = (b.numeroNota || '').toString();
                return currentSort.dir === 'asc' ? valA.localeCompare(valB, undefined, {numeric: true}) : valB.localeCompare(valA, undefined, {numeric: true});
            case 'fornecedor':
                valA = (config.fornecedores.find(f => f.id == a.fornecedorId)?.nome || '').toLowerCase();
                valB = (config.fornecedores.find(f => f.id == b.fornecedorId)?.nome || '').toLowerCase();
                break;
            case 'especie':
                valA = ((config.especiesNota || []).find(e => e.id == a.especieId)?.nome || '').toLowerCase();
                valB = ((config.especiesNota || []).find(e => e.id == b.especieId)?.nome || '').toLowerCase();
                break;
            case 'pagamento':
                valA = ((config.tiposPgto || []).find(p => p.id == a.formaPgtoId)?.nome || '').toLowerCase();
                valB = ((config.tiposPgto || []).find(p => p.id == b.formaPgtoId)?.nome || '').toLowerCase();
                break;
            case 'itens_count':
                valA = (a.itens || []).length;
                valB = (b.itens || []).length;
                break;
            default:
                valA = (a[currentSort.key] || '').toString().toLowerCase();
                valB = (b[currentSort.key] || '').toString().toLowerCase();
        }

        if (valA < valB) return currentSort.dir === 'asc' ? -1 : 1;
        if (valA > valB) return currentSort.dir === 'asc' ? 1 : -1;
        return 0;
    });

    // Sync KPIs with filtered data
    updateDashboard(filtered);
    updateSelectionKPIs(filtered);

    // --- LOGICA DE PAGINAÇÃO ---
    const totalRecords = filtered.length;
    const totalPages = Math.ceil(totalRecords / pageSize) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    
    const startIdx = (currentPage - 1) * pageSize;
    const endIdx = startIdx + pageSize;
    const pageRecords = filtered.slice(startIdx, endIdx);
    
    updatePaginationUI(totalRecords, startIdx, endIdx);

    list.innerHTML = pageRecords.map(c => {
        const activeCols = COL_DEFS.compras.filter(col => col.visible);
        
        // Helper to generate a consistent color based on string
        const getColor = (str) => {
            if (!str) return '#64748b';
            let hash = 0;
            for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
            return `hsl(${Math.abs(hash) % 360}, 60%, 65%)`;
        };

        const cells = activeCols.map(col => {
            if (col.key === 'data') return `<td data-label="Data">${new Date(c.data + 'T12:00:00').toLocaleDateString('pt-BR')}</td>`;
            if (col.key === 'numeroNota') return `<td data-label="Nota"><span style="font-family:'JetBrains Mono'; font-weight:800; color:var(--primary); cursor:pointer; text-decoration:underline; text-underline-offset:4px; text-decoration-color:rgba(92,96,245,0.3);" onclick="openViewModal('${c.id}')">#${c.numeroNota}</span></td>`;
            
            if (col.key === 'especie') {
                const esp = (config.especiesNota || []).find(e => e.id == c.especieId);
                const nome = esp ? esp.nome : '-';
                const cor = getColor(nome);
                return `<td data-label="Espécie"><span style="background:${cor}22; color:${cor}; padding:0.2rem 0.6rem; border-radius:6px; font-size:0.65rem; font-weight:800; border:1px solid ${cor}44;">${nome}</span></td>`;
            }

            if (col.key === 'fornecedor') return `<td data-label="Fornecedor" style="font-weight:700;">${config.fornecedores.find(f => f.id == c.fornecedorId)?.nome || ''}</td>`;
            
            if (col.key === 'placa') {
                const itns = c.itens || c.items || [];
                const uniquePlacas = [...new Set(itns.map(it => {
                    if (it.pessoa) {
                        return it.pessoa;
                    }
                    if (it.veiculoId) {
                        const v = (vehicles || []).find(veh => veh.id == it.veiculoId);
                        return v ? v.placa : null;
                    }
                    return null;
                }).filter(p => p !== null))];
                
                if (uniquePlacas.length === 0) return `<td data-label="Placa"><span style="color:var(--text-muted); font-size:0.7rem;">-</span></td>`;
                
                return `<td data-label="Placa">
                    <div style="display:flex; flex-wrap:wrap; gap:4px;">
                        ${uniquePlacas.map(p => `<span style="background:rgba(255,255,255,0.05); color:#fff; padding:0.2rem 0.5rem; border-radius:6px; font-size:0.65rem; font-weight:800; border:1px solid rgba(255,255,255,0.1); font-family:'JetBrains Mono';">${p}</span>`).join('')}
                    </div>
                </td>`;
            }

            if (col.key === 'itens_count') {
                const itns = c.itens || c.items || [];
                const summary = itns.map(it => {
                    const isS = it.tipo === 'servico';
                    const label = isS ? 'S' : 'P';
                    const col = isS ? '#f59e0b' : '#10b981';
                    return `<div style="font-size:0.7rem; color:var(--text-muted); display:flex; align-items:center; gap:4px;">
                        <span style="color:${col}; font-weight:900; font-size:0.6rem; border:1px solid ${col}44; width:14px; height:14px; display:flex; align-items:center; justify-content:center; border-radius:3px;">${label}</span>
                        ${it.quantidade}x ${it.produto}
                    </div>`;
                }).join('');
                return `<td data-label="Itens">
                    <div style="font-weight:800; color:var(--primary); margin-bottom:4px;">${itns.length} ite${itns.length > 1 ? 'ns' : 'm'}</div>
                    ${summary}
                </td>`;
            }

            if (col.key === 'valorTotal') return `<td data-label="Valor Total" style="font-weight:800; color:#818cf8; font-size:1rem;">R$ ${parseFloat(c.valorTotal).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>`;
            
            if (col.key === 'pagamento') {
                const pgto = config.tiposPgto.find(p => p.id == c.formaPgtoId);
                const nome = pgto ? pgto.nome : '-';
                const cor = getColor(nome);
                const venc = c.vencimento ? new Date(c.vencimento + 'T12:00:00').toLocaleDateString('pt-BR') : '-';
                const parcInfo = c.parcelasData && c.parcelasData.length > 0 ? `<div style="font-size:0.6rem; color:#10b981; font-weight:800; margin-top:4px;"><i data-lucide="layers" style="width:10px; height:10px; vertical-align:middle;"></i> ${c.parcelasData.length}x PARCELADO</div>` : '';
                return `<td data-label="Pagamento">
                    <span style="background:${cor}22; color:${cor}; padding:0.2rem 0.6rem; border-radius:6px; font-size:0.65rem; font-weight:800; border:1px solid ${cor}44;">${nome}</span>
                    <div style="font-size:0.7rem; color:var(--text-muted); margin-top:4px; font-weight:600;">Venc: ${venc}</div>
                    ${parcInfo}
                </td>`;
            }

            if (col.key === 'actions') return `<td data-label="Ações">
                <div style="display:flex; gap:0.5rem;">
                    <button class="action-btn-mini" onclick="openCompraModal('${c.id}')" title="Editar" data-perm="compras_historico:edit" style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:#fff; border-radius:6px; cursor:pointer; width:28px; height:28px; display:flex; align-items:center; justify-content:center;"><i data-lucide="edit-2" style="width:14px;"></i></button>
                    <button class="action-btn-mini" onclick="deleteCompra('${c.id}')" title="Excluir" data-perm="compras_historico:delete" style="background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.2); color:#ef4444; border-radius:6px; cursor:pointer; width:28px; height:28px; display:flex; align-items:center; justify-content:center;"><i data-lucide="trash-2" style="width:14px;"></i></button>
                </div>
            </td>`;
            return `<td data-label="-">-</td>`;
        }).join('');
        return `<tr>${cells}</tr>`;
    }).join('');
    if (window.lucide) lucide.createIcons();
}

function updateDropdowns() {
    const fn = (id, list, formatFn, placeholder = 'Selecione...') => { 
        const el = document.getElementById(id);
        if(el) {
            el.innerHTML = `<option value="">${placeholder}</option>` + list.map(x => {
                const text = formatFn ? formatFn(x) : x.nome;
                return `<option value="${x.id}">${text}</option>`;
            }).join('');
        }
    };
    fn('centroCustoId', config.centrosCusto.filter(c => c.parentId), c => (c.cod ? `${c.cod} - ` : '') + '↳ ' + c.nome);
    fn('tipoPgtoId', config.tiposPgto);
    fn('especieId', config.especiesNota || []);

    // Initial populate of Quick Filters
    updateFilterOptionsDynamically();
    updateDashFilterOptionsDynamically();

    // Set default dashboard period (Current Month)
    const btnMonth = Array.from(document.querySelectorAll('.preset-btn')).find(b => b.innerText.includes('Mês Atual'));
    if (btnMonth) {
        setDashPeriod('month', btnMonth);
    } else {
        applyDashboardFilters();
    }

    // New: Update all item cost centers in rows to reflect new data
    document.querySelectorAll('.item-cc').forEach(sel => {
        const currentVal = sel.value;
        const list = config.centrosCusto.filter(cc => !!cc.parentId);
        sel.innerHTML = '<option value="">Centro de Custo...</option>' + 
            list.map(cc => `<option value="${cc.id}" ${currentVal == cc.id ? 'selected' : ''}>${cc.nome}</option>`).join('');
    });
}

function updateDashboard(records = null) {
    const dataToUse = records || compras;
    const total = dataToUse.reduce((acc, curr) => acc + (parseFloat(curr.valorTotal) || 0), 0);
    const count = dataToUse.length;
    const avg = count > 0 ? total / count : 0;
    
    const now = new Date();
    const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    
    const vencimentosHoje = dataToUse.filter(c => {
        if (c.vencimento === todayStr) return true;
        if (c.parcelasData && c.parcelasData.length > 0) {
            return c.parcelasData.some(p => p.data === todayStr);
        }
        return false;
    }).length;

    if (document.getElementById('dash_total_compras')) 
        document.getElementById('dash_total_compras').innerText = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    
    if (document.getElementById('dash_count_compras')) 
        document.getElementById('dash_count_compras').innerText = count;
        
    if (document.getElementById('dash_avg_compra')) 
        document.getElementById('dash_avg_compra').innerText = avg.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        
    if (document.getElementById('dash_vencimentos_hoje')) {
        document.getElementById('dash_vencimentos_hoje').innerText = vencimentosHoje;
        const card = document.getElementById('card_vencimentos');
        if (card) {
            if (vencimentosHoje > 0) {
                card.style.borderLeft = '4px solid #ef4444';
                document.getElementById('dash_vencimentos_hoje').style.color = '#ef4444';
            } else {
                card.style.borderLeft = '1px solid var(--border-color)';
                document.getElementById('dash_vencimentos_hoje').style.color = 'white';
            }
        }
    }

    if (currentTab === 'dashboard') {
        renderCharts(dataToUse);
    }
    
    if (window.lucide) lucide.createIcons();
}

function updateSelectionKPIs(records) {
    const total = records.reduce((acc, curr) => acc + (parseFloat(curr.valorTotal) || 0), 0);
    const count = records.length;

    const totalEl = document.getElementById('sel_total_valor');
    const countEl = document.getElementById('sel_total_notas');
    const breakdownEl = document.getElementById('sel_cc_breakdown');

    if (totalEl) totalEl.innerText = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    if (countEl) countEl.innerText = count;

    if (breakdownEl) {
        if (count === 0) {
            breakdownEl.innerHTML = '<div style="color: var(--text-muted); font-size: 0.7rem; text-align: center;">Nenhum dado para analisar</div>';
            return;
        }

        // Calculate breakdown by Parent Cost Center
        const ccMap = {};
        let grandTotalItems = 0;

        records.forEach(c => {
            (c.itens || []).forEach(it => {
                if (it.centroCustoId) {
                    const cc = config.centrosCusto.find(x => x.id == it.centroCustoId);
                    if (cc) {
                        // Find the parent
                        let parent = cc;
                        if (cc.parentId) {
                            const foundParent = config.centrosCusto.find(x => x.id == cc.parentId);
                            if (foundParent) parent = foundParent;
                        }
                        const name = parent.nome;
                        const val = (parseFloat(it.quantidade) || 0) * (parseFloat(it.valorUnitario) || 0);
                        ccMap[name] = (ccMap[name] || 0) + val;
                        grandTotalItems += val;
                    }
                }
            });
        });

        const sortedCCs = Object.keys(ccMap).sort((a, b) => ccMap[b] - ccMap[a]);
        
        // Store globally for the detail modal
        currentCCBreakdown = { sortedCCs, ccMap, grandTotalItems };

        if (sortedCCs.length === 0 || grandTotalItems === 0) {
            breakdownEl.innerHTML = '<div style="color: var(--text-muted); font-size: 0.7rem; text-align: center;">Sem informações de centro de custo</div>';
            if (breakdownEl.parentElement) breakdownEl.parentElement.title = "";
            return;
        }

        const colors = ['#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e'];

        const tooltipText = sortedCCs.map(name => {
            const val = ccMap[name];
            const pct = (val / grandTotalItems) * 100;
            return `${name}: ${pct.toFixed(1)}% (R$ ${val.toLocaleString('pt-BR', {minimumFractionDigits: 2})})`;
        }).join('\n');
        if (breakdownEl.parentElement) breakdownEl.parentElement.title = tooltipText;

        breakdownEl.innerHTML = sortedCCs.slice(0, 3).map((name, i) => {
            const val = ccMap[name];
            const pct = (val / grandTotalItems) * 100;
            const color = colors[i % colors.length];
            
            return `
                <div style="display: flex; flex-direction: column; gap: 4px;">
                    <div style="display: flex; justify-content: space-between; font-size: 0.65rem; font-weight: 700; color: #fff;">
                        <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 70%;">${name}</span>
                        <span>${pct.toFixed(1)}%</span>
                    </div>
                    <div style="height: 4px; background: rgba(255,255,255,0.05); border-radius: 2px; overflow: hidden;">
                        <div style="height: 100%; width: ${pct}%; background: ${color}; box-shadow: 0 0 8px ${color}44;"></div>
                    </div>
                </div>
            `;
        }).join('');
        
        if (sortedCCs.length > 3) {
             breakdownEl.innerHTML += `<div style="font-size: 0.6rem; color: var(--text-muted); text-align: right; margin-top: 2px;">+ ${sortedCCs.length - 3} outros centros</div>`;
        }
    }
}

window.openCCDetailModal = () => {
    const listEl = document.getElementById('ccDetailList');
    const totalEl = document.getElementById('ccDetailGrandTotal');
    const modal = document.getElementById('ccDetailModal');

    if (!listEl || !totalEl || !modal) return;

    totalEl.innerText = currentCCBreakdown.grandTotalItems.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const colors = ['#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e'];

    listEl.innerHTML = currentCCBreakdown.sortedCCs.map((name, i) => {
        const val = currentCCBreakdown.ccMap[name];
        const pct = (val / currentCCBreakdown.grandTotalItems) * 100;
        const color = colors[i % colors.length];

        return `
            <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); padding: 1rem; border-radius: 12px; display: flex; flex-direction: column; gap: 0.8rem;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div style="display: flex; flex-direction: column;">
                        <span style="font-size: 0.85rem; font-weight: 800; color: #fff;">${name}</span>
                        <span style="font-size: 0.7rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase; margin-top: 0.2rem;">Centro de Custo Pai</span>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 1.1rem; font-weight: 900; color: #fff;">R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                        <div style="font-size: 0.75rem; font-weight: 800; color: ${color};">${pct.toFixed(1)}% do total</div>
                    </div>
                </div>
                <div style="height: 6px; background: rgba(0,0,0,0.2); border-radius: 3px; overflow: hidden;">
                    <div style="height: 100%; width: ${pct}%; background: ${color}; box-shadow: 0 0 10px ${color}66;"></div>
                </div>
            </div>
        `;
    }).join('');

    modal.classList.add('active');
};

window.closeCCDetailModal = () => {
    document.getElementById('ccDetailModal').classList.remove('active');
};

function renderCharts(data) {
    if (!window.Chart) return;

    // 1. Evolução (Últimos 6 meses)
    const months = [];
    const monthlyValues = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const monthYear = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
        months.push(monthYear);
        
        const mStart = new Date(d.getFullYear(), d.getMonth(), 1);
        const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        
        const mTotal = data.filter(c => {
            const cDate = new Date(c.data + 'T12:00:00');
            return cDate >= mStart && cDate <= mEnd;
        }).reduce((acc, curr) => acc + (parseFloat(curr.valorTotal) || 0), 0);
        
        monthlyValues.push(mTotal);
    }

    renderChart('chartEvolucao', 'evolucao', {
        type: 'line',
        data: {
            labels: months,
            datasets: [{
                label: 'Total Gasto (R$)',
                data: monthlyValues,
                borderColor: '#818cf8',
                backgroundColor: 'rgba(129, 140, 248, 0.2)',
                fill: true,
                tension: 0.4,
                borderWidth: 3,
                pointBackgroundColor: '#818cf8',
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', font: { size: 10 } } },
                x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 10 } } }
            }
        }
    });

    // 2. Mix (Peças vs Serviços)
    let totalPecas = 0;
    let totalServicos = 0;
    data.forEach(c => {
        (c.itens || []).forEach(it => {
            const val = (parseFloat(it.quantidade) || 0) * (parseFloat(it.valorUnitario) || 0);
            if (it.tipo === 'servico') totalServicos += val;
            else totalPecas += val;
        });
    });

    renderChart('chartMix', 'mix', {
        type: 'doughnut',
        data: {
            labels: ['Peças', 'Serviços'],
            datasets: [{
                data: [totalPecas, totalServicos],
                backgroundColor: ['#10b981', '#f59e0b'],
                borderWidth: 0,
                hoverOffset: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { color: '#94a3b8', padding: 20, font: { size: 11, weight: '600' } } }
            },
            cutout: '70%'
        }
    });

    // 3. Centro de Custo
    const ccMap = {};
    data.forEach(c => {
        (c.itens || []).forEach(it => {
            if (it.centroCustoId) {
                const cc = config.centrosCusto.find(x => x.id == it.centroCustoId);
                const name = cc ? cc.nome : 'Outros';
                ccMap[name] = (ccMap[name] || 0) + ((parseFloat(it.quantidade) || 0) * (parseFloat(it.valorUnitario) || 0));
            }
        });
    });
    const ccLabels = Object.keys(ccMap).sort((a,b) => ccMap[b] - ccMap[a]).slice(0, 5);
    const ccData = ccLabels.map(l => ccMap[l]);

    renderChart('chartCentroCusto', 'centroCusto', {
        type: 'polarArea',
        data: {
            labels: ccLabels,
            datasets: [{
                data: ccData,
                backgroundColor: ['#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { color: '#94a3b8', boxWidth: 10, font: { size: 9 } } }
            },
            scales: { r: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { display: false } } }
        }
    });

    // 4. Top Fornecedores
    const fornMap = {};
    data.forEach(c => {
        const forn = config.fornecedores.find(f => f.id == c.fornecedorId);
        const name = forn ? forn.nome : 'Não Identificado';
        fornMap[name] = (fornMap[name] || 0) + (parseFloat(c.valorTotal) || 0);
    });
    const fornLabels = Object.keys(fornMap).sort((a,b) => fornMap[b] - fornMap[a]).slice(0, 10);
    const fornData = fornLabels.map(l => fornMap[l]);

    renderChart('chartTopFornecedores', 'topFornecedores', {
        type: 'bar',
        data: {
            labels: fornLabels,
            datasets: [{
                label: 'Total Gasto (R$)',
                data: fornData,
                backgroundColor: 'rgba(92, 96, 245, 0.7)',
                borderRadius: 8,
                hoverBackgroundColor: '#5c60f5'
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', font: { size: 10 } } },
                y: { grid: { display: false }, ticks: { color: '#fff', font: { size: 10, weight: '700' } } }
            }
        }
    });

    // 5. Custo por Veículo
    const vehMap = {};
    data.forEach(c => {
        (c.itens || []).forEach(it => {
            if (it.veiculoId) {
                const v = vehicles.find(x => x.id == it.veiculoId);
                const plate = v ? v.placa : 'Desconhecido';
                vehMap[plate] = (vehMap[plate] || 0) + ((parseFloat(it.quantidade) || 0) * (parseFloat(it.valorUnitario) || 0));
            }
        });
    });
    const vehLabels = Object.keys(vehMap).sort((a,b) => vehMap[b] - vehMap[a]).slice(0, 10);
    const vehData = vehLabels.map(l => vehMap[l]);

    renderChart('chartVeiculos', 'veiculos', {
        type: 'bar',
        data: {
            labels: vehLabels,
            datasets: [{
                label: 'Gasto por Veículo (R$)',
                data: vehData,
                backgroundColor: 'rgba(168, 85, 247, 0.7)',
                borderRadius: 8,
                hoverBackgroundColor: '#a855f7'
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', font: { size: 10 } } },
                y: { grid: { display: false }, ticks: { color: '#fff', font: { size: 10, weight: '700' } } }
            }
        }
    });

    // 6. Top Peças
    const prodMap = {};
    data.forEach(c => {
        (c.itens || []).forEach(it => {
            if (it.tipo !== 'servico') {
                const name = it.produto || 'Item não identificado';
                prodMap[name] = (prodMap[name] || 0) + ((parseFloat(it.quantidade) || 0) * (parseFloat(it.valorUnitario) || 0));
            }
        });
    });
    const prodLabels = Object.keys(prodMap).sort((a,b) => prodMap[b] - prodMap[a]).slice(0, 5);
    const prodData = prodLabels.map(l => prodMap[l]);

    renderChart('chartPecas', 'pecas', {
        type: 'pie',
        data: {
            labels: prodLabels,
            datasets: [{
                data: prodData,
                backgroundColor: ['#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { color: '#94a3b8', boxWidth: 10, font: { size: 9 } } }
            }
        }
    });
}

function renderChart(canvasId, chartKey, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    
    if (charts[chartKey]) {
        charts[chartKey].destroy();
    }
    
    charts[chartKey] = new Chart(canvas, config);
}

window.quickAdd = (type) => {
    if (type === 'fornecedores' || type === 'fornecedor') { openFornecedorModal(); return; }
    if (type === 'custo') { openCustoModal(); return; }
    
    // Para outros (pagamento, especie), usamos o modal genérico
    const modal = document.getElementById('genericModal');
    document.getElementById('genericEditId').value = '';
    document.getElementById('genericEditTab').value = type === 'pgto' ? 'pagamento' : type;
    document.getElementById('genericInputNome').value = '';
    
    let title = 'Item';
    if (type === 'pagamento' || type === 'pgto') title = 'Forma de Pagamento';
    else if (type === 'especie') title = 'Espécie de Nota';
    
    document.getElementById('genericModalTitle').innerText = 'Cadastrar ' + title;
    document.getElementById('genericSaveBtn').innerText = 'SALVAR ' + title.toUpperCase();
    modal.classList.add('active');
};

window.handleSearchInput = (el) => {
    const btn = document.getElementById('clearSearchBtn');
    if (btn) btn.style.display = el.value ? 'block' : 'none';
    renderCompras();
};

window.clearSearch = () => {
    const input = document.getElementById('compraSearch');
    if (input) input.value = '';
    const btn = document.getElementById('clearSearchBtn');
    if (btn) btn.style.display = 'none';
    renderCompras();
};

window.clearAllFilters = () => {
    if (document.getElementById('filterDatePreset')) {
        document.getElementById('filterDatePreset').value = 'all';
        handleDatePresetChange(document.getElementById('filterDatePreset'));
    }
    document.getElementById('filterEspecie').value = '';
    document.getElementById('filterFornecedor').value = '';
    document.getElementById('filterPlaca').value = '';
    document.getElementById('filterCentroPai').value = '';
    document.getElementById('filterCusto').value = '';
    document.getElementById('filterPagamento').value = '';
    document.getElementById('compraSearch').value = '';
    const clearBtn = document.getElementById('clearSearchBtn');
    if (clearBtn) clearBtn.style.display = 'none';
    currentPage = 1;
    
    // Reset dropdowns to initial state
    updateDropdowns(); 
    renderCompras();
};

window.handleIntelligentFilter = (originId) => {
    currentPage = 1;
    renderCompras();
    updateFilterOptionsDynamically(originId);
};

function updateFilterOptionsDynamically(originId = null) {
    const fStart = document.getElementById('filterDateStart')?.value;
    const fEnd = document.getElementById('filterDateEnd')?.value;
    const fEsp = document.getElementById('filterEspecie')?.value;
    const fForn = document.getElementById('filterFornecedor')?.value;
    const fPlaca = document.getElementById('filterPlaca')?.value;
    const fPai = document.getElementById('filterCentroPai')?.value;
    const fCusto = document.getElementById('filterCusto')?.value;
    const fPgto = document.getElementById('filterPagamento')?.value;

    const filters = {
        start: fStart,
        end: fEnd,
        especie: fEsp,
        fornecedor: fForn,
        placa: fPlaca,
        pai: fPai,
        custo: fCusto,
        pagamento: fPgto
    };

    const selects = {
        filterEspecie: { key: 'especieId', list: config.especiesNota || [], label: 'Todas as Espécies' },
        filterFornecedor: { key: 'fornecedorId', list: config.fornecedores || [], label: 'Todos os Fornecedores' },
        filterPlaca: { key: 'veiculoId', list: vehicles || [], label: 'Todas as Placas', isVehicle: true },
        filterCentroPai: { key: 'parentId', list: config.centrosCusto.filter(c => !c.parentId) || [], label: 'Todos os Centros', isParent: true },
        filterPagamento: { key: 'formaPgtoId', list: config.tiposPgto || [], label: 'Todas as Formas' },
        filterCusto: { key: 'centroCustoId', list: config.centrosCusto.filter(c => !!c.parentId) || [], label: 'Todos os Subcentros', isItem: true }
    };

    Object.keys(selects).forEach(id => {
        const item = selects[id];
        const el = document.getElementById(id);
        if (!el) return;

        const currentVal = el.value;

        const availableRecords = compras.filter(c => {
            if (filters.start && c.data < filters.start) return false;
            if (filters.end && c.data > filters.end) return false;
            if (id !== 'filterEspecie' && filters.especie && c.especieId != filters.especie) return false;
            if (id !== 'filterFornecedor' && filters.fornecedor && c.fornecedorId != filters.fornecedor) return false;
            if (id !== 'filterPagamento' && filters.pagamento && c.formaPgtoId != filters.pagamento) return false;
            
            // Filtro Placa
            if (id !== 'filterPlaca' && filters.placa) {
                const hasPlaca = (c.itens || []).some(it => it.veiculoId == filters.placa);
                if (!hasPlaca) return false;
            }

            // Filtro Pai
            if (id !== 'filterCentroPai' && filters.pai) {
                const hasPai = (c.itens || []).some(it => {
                    const cc = config.centrosCusto.find(x => x.id == it.centroCustoId);
                    return cc && cc.parentId == filters.pai;
                });
                if (!hasPai) return false;
            }

            if (id !== 'filterCusto' && filters.custo) {
                 const hasCusto = (c.itens || []).some(it => it.centroCustoId == filters.custo);
                 if (!hasCusto) return false;
            }
            return true;
        });

        let availableIds = [];
        if (item.isItem) {
             availableRecords.forEach(r => {
                 (r.itens || []).forEach(it => {
                     if (it.centroCustoId) availableIds.push(it.centroCustoId);
                 });
             });
        } else if (item.isParent) {
             availableRecords.forEach(r => {
                 (r.itens || []).forEach(it => {
                     const cc = config.centrosCusto.find(x => x.id == it.centroCustoId);
                     if (cc && cc.parentId) availableIds.push(cc.parentId);
                 });
             });
        } else if (item.isVehicle) {
             availableRecords.forEach(r => {
                 (r.itens || []).forEach(it => {
                     if (it.veiculoId) availableIds.push(it.veiculoId);
                 });
             });
        } else {
             availableIds = availableRecords.map(r => r[item.key]);
        }
        const uniqueIds = [...new Set(availableIds.map(String))];

        let html = `<option value="">${item.label}</option>`;
        item.list.forEach(opt => {
            let visible = uniqueIds.includes(String(opt.id));
            
            // Subcentro filter: if Parent is selected, only show children of that parent
            if (id === 'filterCusto' && filters.pai && opt.parentId != filters.pai) {
                visible = false;
            }

            if (String(opt.id) === String(currentVal) || visible) {
                const text = (item.isItem || item.isParent || item.isVehicle) 
                    ? (opt.cod ? `${opt.cod} - ` : '') + (item.isItem ? '↳ ' : '') + (item.isVehicle ? opt.placa : opt.nome) 
                    : opt.nome;
                html += `<option value="${opt.id}" ${String(opt.id) === String(currentVal) ? 'selected' : ''}>${text}</option>`;
            }
        });
        el.innerHTML = html;
    });
}

window.setDashPeriod = (days, btn) => {
    const end = new Date();
    const start = new Date();
    
    if (days === 'month') {
        start.setDate(1);
    } else {
        start.setDate(end.getDate() - days);
    }

    document.getElementById('dash_date_start').value = start.toISOString().split('T')[0];
    document.getElementById('dash_date_end').value = end.toISOString().split('T')[0];

    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    applyDashboardFilters();
};

window.applyDashboardFilters = () => {
    const start = document.getElementById('dash_date_start').value;
    const end = document.getElementById('dash_date_end').value;
    const esp = document.getElementById('dash_filter_especie').value;
    const forn = document.getElementById('dash_filter_fornecedor').value;
    const placa = document.getElementById('dash_filter_placa').value;
    const pai = document.getElementById('dash_filter_centro_pai').value;
    const cc = document.getElementById('dash_filter_custo').value;
    const pgto = document.getElementById('dash_filter_pagamento').value;

    const filtered = compras.filter(c => {
        if (start && c.data < start) return false;
        if (end && c.data > end) return false;
        if (esp && c.especieId != esp) return false;
        if (forn && c.fornecedorId != forn) return false;
        if (pgto && c.formaPgtoId != pgto) return false;
        
        if (placa) {
            const hasPlaca = (c.itens || []).some(it => it.veiculoId == placa);
            if (!hasPlaca) return false;
        }

        if (pai) {
            const hasPai = (c.itens || []).some(it => {
                const ccObj = config.centrosCusto.find(x => x.id == it.centroCustoId);
                return ccObj && ccObj.parentId == pai;
            });
            if (!hasPai) return false;
        }

        if (cc) {
            const hasCC = (c.itens || []).some(it => it.centroCustoId == cc);
            if (!hasCC) return false;
        }
        return true;
    });

    updateDashboard(filtered);
    updateDashFilterOptionsDynamically();
};

window.handleDashIntelligentFilter = (originId) => {
    applyDashboardFilters();
};

window.clearDashboardFilters = () => {
    document.getElementById('dash_filter_especie').value = '';
    document.getElementById('dash_filter_fornecedor').value = '';
    document.getElementById('dash_filter_placa').value = '';
    document.getElementById('dash_filter_centro_pai').value = '';
    document.getElementById('dash_filter_custo').value = '';
    document.getElementById('dash_filter_pagamento').value = '';
    
    const btnMonth = Array.from(document.querySelectorAll('.preset-btn')).find(b => b.innerText.includes('Mês Atual'));
    if (btnMonth) setDashPeriod('month', btnMonth);
    else applyDashboardFilters();
};

function updateDashFilterOptionsDynamically(originId = null) {
    const start = document.getElementById('dash_date_start')?.value;
    const end = document.getElementById('dash_date_end')?.value;
    const fEsp = document.getElementById('dash_filter_especie')?.value;
    const fForn = document.getElementById('dash_filter_fornecedor')?.value;
    const fPlaca = document.getElementById('dash_filter_placa')?.value;
    const fPai = document.getElementById('dash_filter_centro_pai')?.value;
    const fCusto = document.getElementById('dash_filter_custo')?.value;
    const fPgto = document.getElementById('dash_filter_pagamento')?.value;

    const filters = { especie: fEsp, fornecedor: fForn, placa: fPlaca, pai: fPai, custo: fCusto, pagamento: fPgto };

    const selects = {
        dash_filter_especie: { key: 'especieId', list: config.especiesNota || [], label: 'Todas as Espécies' },
        dash_filter_fornecedor: { key: 'fornecedorId', list: config.fornecedores || [], label: 'Todos os Fornecedores' },
        dash_filter_placa: { key: 'veiculoId', list: vehicles || [], label: 'Todas as Placas', isVehicle: true },
        dash_filter_centro_pai: { key: 'parentId', list: config.centrosCusto.filter(c => !c.parentId) || [], label: 'Todos os Centros', isParent: true },
        dash_filter_pagamento: { key: 'formaPgtoId', list: config.tiposPgto || [], label: 'Todas as Formas' },
        dash_filter_custo: { key: 'centroCustoId', list: config.centrosCusto.filter(c => !!c.parentId) || [], label: 'Todos os Subcentros', isItem: true }
    };

    Object.keys(selects).forEach(id => {
        const item = selects[id];
        const el = document.getElementById(id);
        if (!el) return;

        const currentVal = el.value;

        // Base filtering for pruning: apply other filters + date range
        const availableRecords = compras.filter(c => {
            if (start && c.data < start) return false;
            if (end && c.data > end) return false;
            
            if (id !== 'dash_filter_especie' && filters.especie && c.especieId != filters.especie) return false;
            if (id !== 'dash_filter_fornecedor' && filters.fornecedor && c.fornecedorId != filters.fornecedor) return false;
            if (id !== 'dash_filter_pagamento' && filters.pagamento && c.formaPgtoId != filters.pagamento) return false;
            
            // Filtro Placa
            if (id !== 'dash_filter_placa' && filters.placa) {
                const hasPlaca = (c.itens || []).some(it => it.veiculoId == filters.placa);
                if (!hasPlaca) return false;
            }

            // Filtro Pai
            if (id !== 'dash_filter_centro_pai' && filters.pai) {
                const hasPai = (c.itens || []).some(it => {
                    const cc = config.centrosCusto.find(x => x.id == it.centroCustoId);
                    return cc && cc.parentId == filters.pai;
                });
                if (!hasPai) return false;
            }

            if (id !== 'dash_filter_custo' && filters.custo) {
                 const hasCusto = (c.itens || []).some(it => it.centroCustoId == filters.custo);
                 if (!hasCusto) return false;
            }
            return true;
        });

        let availableIds = [];
        if (item.isItem) {
             availableRecords.forEach(r => {
                 (r.itens || []).forEach(it => {
                     if (it.centroCustoId) availableIds.push(it.centroCustoId);
                 });
             });
        } else if (item.isParent) {
             availableRecords.forEach(r => {
                 (r.itens || []).forEach(it => {
                     const cc = config.centrosCusto.find(x => x.id == it.centroCustoId);
                     if (cc && cc.parentId) availableIds.push(cc.parentId);
                 });
             });
        } else if (item.isVehicle) {
             availableRecords.forEach(r => {
                 (r.itens || []).forEach(it => {
                     if (it.veiculoId) availableIds.push(it.veiculoId);
                 });
             });
        } else {
             availableIds = availableRecords.map(r => r[item.key]);
        }
        const uniqueIds = [...new Set(availableIds.map(String))];

        let html = `<option value="">${item.label}</option>`;
        item.list.forEach(opt => {
            let visible = uniqueIds.includes(String(opt.id));

            // Subcentro filter: if Parent is selected, only show children of that parent
            if (id === 'dash_filter_custo' && filters.pai && opt.parentId != filters.pai) {
                visible = false;
            }

            if (String(opt.id) === String(currentVal) || visible) {
                const text = (item.isItem || item.isParent || item.isVehicle) 
                    ? (opt.cod ? `${opt.cod} - ` : '') + (item.isItem ? '↳ ' : '') + (item.isVehicle ? opt.placa : opt.nome) 
                    : opt.nome;
                html += `<option value="${opt.id}" ${String(opt.id) === String(currentVal) ? 'selected' : ''}>${text}</option>`;
            }
        });
        el.innerHTML = html;
    });
}

window.changePage = (dir) => {
    currentPage += dir;
    if (currentPage < 1) currentPage = 1;
    renderCompras();
    // Scroll to top of table
    const container = document.querySelector('.table-container');
    if (container) container.scrollTop = 0;
};

window.goToPage = (page) => {
    currentPage = page;
    renderCompras();
    const container = document.querySelector('.table-container');
    if (container) container.scrollTop = 0;
};

function updatePaginationUI(total, start, end) {
    const pInfo = document.getElementById('paginationInfo');
    const pNumbers = document.getElementById('pageNumbers');
    const btnPrev = document.getElementById('btnPrevPage');
    const btnNext = document.getElementById('btnNextPage');
    
    if (!pInfo || !pNumbers) return;
    
    const actualEnd = Math.min(end, total);
    pInfo.innerText = total > 0 ? `Mostrando ${start + 1}-${actualEnd} de ${total} registros` : 'Nenhum registro encontrado';
    
    const totalPages = Math.ceil(total / pageSize) || 1;
    btnPrev.disabled = currentPage === 1;
    btnNext.disabled = currentPage === totalPages;

    let html = '';
    
    // Logic to show page numbers (max 5 around current)
    const pages = [1, currentPage - 1, currentPage, currentPage + 1, totalPages];
    const uniquePages = [...new Set(pages)].filter(p => p > 0 && p <= totalPages).sort((a,b) => a - b);
    
    let lastP = 0;
    uniquePages.forEach(p => {
        if (lastP && p - lastP > 1) html += '<span style="color:var(--text-muted); padding: 0 5px;">...</span>';
        const activeClass = p === currentPage ? 'active' : '';
        html += `<div class="page-num ${activeClass}" onclick="goToPage(${p})">${p}</div>`;
        lastP = p;
    });
    
    pNumbers.innerHTML = html;
}

window.deleteCompra = async (id) => {
    if (!canDo('compras_historico', 'delete')) {
        alert('Você não tem permissão para excluir compras.');
        return;
    }
    const compra = compras.find(c => c.id == id);
    if (!compra) return;

    if (compra.integradoFinanceiro === true || compra.integrado_financeiro === true) {
        alert('Esta nota já está integrada com o financeiro e não pode ser excluída. É necessário excluir os lançamentos financeiros correspondentes para que ela possa ser removida.');
        return;
    }

    if (!confirm(`Deseja realmente excluir a Nota #${compra.numeroNota}? Isso afetará o financeiro e o estoque vinculado.`)) return;

    const success = await rollbackInventory(compra);
    if (!success) return;
    
    // NOVIDADE: Limpar vínculos de manutenção ao excluir a nota
    await rollbackMaintenance(compra);
    
    const idx = compras.findIndex(c => c.id == id);
    if (idx !== -1) {
        compras.splice(idx, 1);

        if (supabaseClient) {
            try {
                const sId = String(id);
                // Cascading delete is set in SQL for items, additions and installments
                await supabaseClient.from('compras').delete().eq('id', sId);
            } catch (err) {
                console.error("❌ Erro ao deletar no Supabase:", err);
            }
        }

        renderCompras();
        updateDashboard();
        alert('Nota excluída com sucesso e estoque revertido.');
    }
};

window.handleDatePresetChange = (el) => {
    const val = el.value;
    const container = document.getElementById('customDateContainer');
    const startInput = document.getElementById('filterDateStart');
    const endInput = document.getElementById('filterDateEnd');
    
    if (!container || !startInput || !endInput) return;

    container.style.display = val === 'custom' ? 'flex' : 'none';
    
    if (val !== 'custom') {
        if (val === 'all') {
            startInput.value = '';
            endInput.value = '';
        } else {
            const today = new Date();
            let start = new Date();
            let end = new Date();
            
            if (val === 'month') {
                start = new Date(today.getFullYear(), today.getMonth(), 1);
                end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            } else if (val === '15days') {
                start.setDate(today.getDate() - 15);
            } else if (val === 'lastMonth') {
                start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                end = new Date(today.getFullYear(), today.getMonth(), 0);
            }
            
            startInput.value = start.toISOString().split('T')[0];
            endInput.value = end.toISOString().split('T')[0];
        }
    }
    
    handleIntelligentFilter('filterDatePreset');
};

console.log("🛠️ Compras.js: CARREGAMENTO CONCLUÍDO COM SUCESSO!");


// ==========================================
// MÓDULO DE INTEGRAÇÃO COM FINANCEIRO
// ==========================================
// Helpers de formatação locais
function formatDateBR(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T12:00:00');
    return date.toLocaleDateString('pt-BR');
}

function formatCurrency(value) {
    return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

let comprasParaIntegracao = [];

async function renderIntegracao() {
    const tbody = document.getElementById('tbodyIntegracao');
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem;">Carregando notas pendentes...</td></tr>';
    
    try {
        console.log("🔍 Buscando notas não integradas diretamente do banco...");
        const { data, error } = await supabaseClient
            .from('compras')
            .select('*')
            .or('integrado_financeiro.eq.false,integrado_financeiro.is.null')
            .order('data_emissao', { ascending: false });
            
        if (error) throw error;
        
        console.log(`🔍 Notas não integradas carregadas: ${data ? data.length : 0} registros`);
        comprasParaIntegracao = data || [];
        
        if (comprasParaIntegracao.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-muted);">Nenhuma nota pendente de integração.</td></tr>';
            return;
        }
        
        tbody.innerHTML = '';
        comprasParaIntegracao.forEach(comp => {
            // Resolver nome do fornecedor localmente
            const forn = config.fornecedores.find(f => f.id === comp.fornecedor_id);
            const fornecedorNome = forn ? forn.nome : 'Sem Fornecedor';
            
            // Resolver forma de pagamento localmente
            const pgto = config.tiposPgto.find(p => p.id === comp.forma_pagamento_id);
            const formaNome = pgto ? pgto.nome : 'N/A';
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><input type="checkbox" class="chk-integracao" value="${comp.id}"></td>
                <td>${formatDateBR(comp.data_emissao)}</td>
                <td style="font-weight: 700;">${comp.numero_nota || 'S/N'}</td>
                <td>${fornecedorNome}</td>
                <td><span class="badge" style="background: rgba(255,255,255,0.1);">${formaNome}</span></td>
                <td>${comp.financeiro_parcelado ? `Sim (${comp.qtd_parcelas}x)` : 'Não'}</td>
                <td style="font-weight: 700; color: #10b981;">${formatCurrency(comp.valor_total)}</td>
            `;
            tbody.appendChild(tr);
        });
        
    } catch (err) {
        console.error('Erro ao buscar notas pendentes:', err);
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem; color: #ef4444;">Erro ao carregar dados: ${err.message || err}</td></tr>`;
    }
}
window.renderIntegracao = renderIntegracao;

window.toggleSelectAllIntegracao = (el) => {
    const isChecked = el ? el.checked : (document.getElementById('chkAllIntegracao')?.checked || false);
    const chks = document.querySelectorAll('.chk-integracao');
    chks.forEach(chk => chk.checked = isChecked);
};

window.integrarAoFinanceiro = async () => {
    const chks = document.querySelectorAll('.chk-integracao:checked');
    if (chks.length === 0) {
        alert('Selecione ao menos uma nota para integrar.');
        return;
    }
    
    if (!confirm(`Confirma a integração de ${chks.length} nota(s) para o Financeiro?`)) return;
    
    const originalText = document.querySelector('#view-integracao .btn-primary').innerHTML;
    document.querySelector('#view-integracao .btn-primary').innerHTML = '<i data-lucide="loader" class="spin"></i> Processando...';
    
    try {
        const ids = Array.from(chks).map(chk => chk.value);
        let notasIntegradasFull = []; 
        
        for (const id of ids) {
            const comp = comprasParaIntegracao.find(c => c.id === id);
            if (!comp) continue;
            
            let lancamentos = [];
            const forn = config.fornecedores.find(f => f.id === comp.fornecedor_id);
            const fornecedorNome = forn ? forn.nome : 'Fornecedor não especificado';
            
            if (comp.financeiro_parcelado) {
                // Buscar parcelas
                const { data: parcelas, error: parcError } = await supabaseClient
                    .from('compra_parcelas')
                    .select('*')
                    .eq('compra_id', id)
                    .order('data_vencimento', { ascending: true });
                    
                if (parcError) throw parcError;
                
                if (parcelas && parcelas.length > 0) {
                    let idx = 1;
                    for (const p of parcelas) {
                        const numParc = p.numero_parcela || idx;
                        lancamentos.push({
                            tipo: 'PAGAR',
                            descricao: `Referente NF ${comp.numero_nota || 'S/N'} (Parc ${numParc}/${comp.qtd_parcelas}) - ${fornecedorNome}`,
                            entidade_nome: fornecedorNome,
                            valor_total: p.valor,
                            data_vencimento: p.data_vencimento,
                            status: 'ABERTO',
                            status_aprovacao: 'PENDENTE',
                            compra_id: comp.id,
                            forma_pagamento: comp.forma_pagamento_id,
                            centro_custo_id: comp.centro_custo_id,
                            categoria_id: comp.categoria_id
                        });
                        idx++;
                    }
                } else if (comp.qtd_parcelas > 1) {
                    // FALLBACK: Se o banco estiver sem registros das parcelas, dividimos o valor total em parcelas mensais
                    console.log(`⚠️ Sem parcelas no banco. Gerando ${comp.qtd_parcelas} parcelas dinamicamente...`);
                    const baseValue = Number((comp.valor_total / comp.qtd_parcelas).toFixed(2));
                    let somaDiferenca = comp.valor_total - (baseValue * comp.qtd_parcelas);
                    
                    const dateOrigin = new Date(comp.data_vencimento || comp.data_emissao || new Date());
                    
                    for (let i = 1; i <= comp.qtd_parcelas; i++) {
                        const dueDate = new Date(dateOrigin);
                        dueDate.setMonth(dueDate.getMonth() + (i - 1)); // Incrementa o mês sequencialmente
                        
                        // Ajusta a diferença de centavos na última parcela
                        const valorParcela = (i === comp.qtd_parcelas) ? Number((baseValue + somaDiferenca).toFixed(2)) : baseValue;
                        
                        lancamentos.push({
                            tipo: 'PAGAR',
                            descricao: `Referente NF ${comp.numero_nota || 'S/N'} (Parc ${i}/${comp.qtd_parcelas}) - ${fornecedorNome}`,
                            entidade_nome: fornecedorNome,
                            valor_total: valorParcela,
                            data_vencimento: dueDate.toISOString().split('T')[0],
                            status: 'ABERTO',
                            status_aprovacao: 'PENDENTE',
                            compra_id: comp.id,
                            forma_pagamento: comp.forma_pagamento_id,
                            centro_custo_id: comp.centro_custo_id,
                            categoria_id: comp.categoria_id
                        });
                    }
                } else {
                     lancamentos.push({
                        tipo: 'PAGAR',
                        descricao: `Referente NF ${comp.numero_nota || 'S/N'} - ${fornecedorNome}`,
                        entidade_nome: fornecedorNome,
                        valor_total: comp.valor_total,
                        data_vencimento: comp.data_vencimento || comp.data_emissao,
                        status: 'ABERTO',
                        status_aprovacao: 'PENDENTE',
                        compra_id: comp.id,
                        forma_pagamento: comp.forma_pagamento_id,
                        centro_custo_id: comp.centro_custo_id,
                        categoria_id: comp.categoria_id
                     });
                }
            } else {
                // A vista
                lancamentos.push({
                    tipo: 'PAGAR',
                    descricao: `Referente NF ${comp.numero_nota || 'S/N'} - ${fornecedorNome}`,
                    entidade_nome: fornecedorNome,
                    valor_total: comp.valor_total,
                    data_vencimento: comp.data_vencimento || comp.data_emissao,
                    status: 'ABERTO',
                    status_aprovacao: 'PENDENTE',
                    compra_id: comp.id,
                    forma_pagamento: comp.forma_pagamento_id,
                    centro_custo_id: comp.centro_custo_id,
                    categoria_id: comp.categoria_id
                });
            }
            
            const { error: finError } = await supabaseClient.from('fin_lancamentos').insert(lancamentos);
            if (finError) throw finError;
            
            const { error: updError } = await supabaseClient.from('compras')
                .update({ integrado_financeiro: true, data_integracao: new Date().toISOString() })
                .eq('id', comp.id);
            if (updError) throw updError;
            
            // Atualizar estado local para refletir na aba imediatamente
            const localComp = compras.find(c => c.id === comp.id);
            if (localComp) {
                localComp.integrado_financeiro = true;
                localComp.integradoFinanceiro = true;
                localComp.data_integracao = new Date().toISOString();
                localComp.dataIntegracao = localComp.data_integracao;
            }
            
            notasIntegradasFull.push({
                nota: comp.numero_nota || 'S/N',
                fornecedor: fornecedorNome,
                data: comp.data_emissao,
                valor: comp.valor_total,
                parcelamento: comp.financeiro_parcelado ? `Sim (${comp.qtd_parcelas}x)` : 'Não'
            });
        }
        
        alert(`Integração de ${notasIntegradasFull.length} nota(s) concluída com sucesso! Gerando termo PDF...`);
        gerarTermoIntegracaoPDF(notasIntegradasFull);
        renderIntegracao();
        
    } catch (err) {
        console.error('Erro na integração:', err);
        alert('Ocorreu um erro ao gerar a integração: ' + err.message);
    } finally {
        document.querySelector('#view-integracao .btn-primary').innerHTML = originalText;
        if (window.lucide) lucide.createIcons();
    }
};

function gerarTermoIntegracaoPDF(notas) {
    if (!window.jspdf) {
        alert('Biblioteca de PDF não carregada.');
        return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'pt', 'a4');

    const pageWidth = doc.internal.pageSize.getWidth();
    let cursorY = 40;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('TERMO DE INTEGRAÇÃO - COMPRAS > FINANCEIRO', pageWidth / 2, cursorY, { align: 'center' });
    
    cursorY += 20;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const dataHora = new Date().toLocaleString('pt-BR');
    doc.text(`Data e Hora da Integração: ${dataHora}`, pageWidth / 2, cursorY, { align: 'center' });
    
    cursorY += 40;
    
    const tableData = notas.map(n => [
        n.nota,
        n.fornecedor,
        formatDateBR(n.data),
        n.parcelamento,
        formatCurrency(n.valor)
    ]);
    
    let totalSoma = notas.reduce((acc, n) => acc + Number(n.valor), 0);
    
    doc.autoTable({
        startY: cursorY,
        head: [['Nº Nota', 'Fornecedor', 'Data Emissão', 'Parcelamento', 'Valor Total']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [92, 96, 245] },
        foot: [['', '', '', 'TOTAL INTEGRADO:', formatCurrency(totalSoma)]],
        footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' }
    });
    
    cursorY = doc.lastAutoTable.finalY + 80;
    
    doc.setLineWidth(0.5);
    
    // Assinatura Compras
    const xCompras = 80;
    doc.line(xCompras, cursorY, xCompras + 150, cursorY);
    doc.setFont('helvetica', 'bold');
    doc.text('Setor de Compras', xCompras + 75, cursorY + 15, { align: 'center' });
    
    // Assinatura Financeiro
    const xFin = pageWidth - 80 - 150;
    doc.line(xFin, cursorY, xFin + 150, cursorY);
    doc.text('Setor Financeiro', xFin + 75, cursorY + 15, { align: 'center' });
    
    doc.save(`Termo_Integracao_Financeiro_${new Date().getTime()}.pdf`);
}
