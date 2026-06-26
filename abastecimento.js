// Configuration
let supabaseClient = null;

// State management
let state = {
    vehicles: [],
    drivers: [],
    suppliers: [],
    posts: [],
    postCategories: [],
    fuelTypes: [],
    fuelingRecords: [],
    sort: {
        fuel: { col: 'data', dir: 'desc' }
    },
    editingId: null,
    highlightId: null,
    highlightField: null,
    dismissedAlerts: [],
    currentSetupTab: 'posts',
    charts: {
        fuel: null,
        ranking: null
    },
    currentPage: 1,
    pageSize: 1000,
    activeAlertFilter: null,
    fuelFilters: {
        categoria: '',
        posto: '',
        veiculo: '',
        combustivel: '',
        importacao_id: '',
        periodo: 'all',
        data_inicio: null,
        data_fim: null
    },
    imports: [],
    compMode: 'veiculo'
};

// --- Global Utilities ---
const generateUUID = () => {
    try {
        return crypto.randomUUID();
    } catch (e) {
        return 'f' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    }
};

const cleanNumber = (val) => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    
    let s = String(val).replace('R$', '').trim();
    
    // Se tiver vírgula e ponto (ex: 1.250,50), remove o ponto e troca vírgula por ponto
    if (s.includes(',') && s.includes('.')) {
        s = s.replace(/\./g, '').replace(',', '.');
    } 
    // Se tiver apenas vírgula (ex: 57,30), troca por ponto
    else if (s.includes(',')) {
        s = s.replace(',', '.');
    }
    // Se tiver apenas ponto (ex: 57.30), o parseFloat já entende corretamente, não mexemos.
    
    return parseFloat(s) || 0;
};

// --- UI Opening Handlers (Moved to top for availability) ---
window.openFuelModal = (id = null) => {
    console.log('Solicitação para abrir modal de abastecimento. ID:', id);
    if (id) {
        if (!canDo('abastecimento_lancamentos', 'edit')) {
            alert('Você não tem permissão para editar abastecimentos.');
            return;
        }
    } else {
        if (!canDo('abastecimento_lancamentos', 'add')) {
            alert('Você não tem permissão para registrar abastecimentos.');
            return;
        }
    }
    try {
        const modal = document.getElementById('modalFuel');
        const form = document.getElementById('fuelForm');
        const title = document.getElementById('fuelModalTitle');

        if (!modal || !form) {
            alert('Erro crítico: Modal de abastecimento não encontrado no HTML.');
            return;
        }

        form.reset();
        state.editingId = id;
        if (title) title.innerText = id ? 'Editar Abastecimento' : 'Novo Abastecimento';

        if (id) {
            const f = state.fuelingRecords.find(r => r.id === id);
            if (f) {
                if (document.getElementById('fuel_veiculo')) document.getElementById('fuel_veiculo').value = f.veiculo_id;
                if (document.getElementById('fuel_data')) document.getElementById('fuel_data').value = f.data;
                if (document.getElementById('fuel_horario')) document.getElementById('fuel_horario').value = f.horario || '';
                if (document.getElementById('fuel_motorista')) document.getElementById('fuel_motorista').value = f.motorista_id || '';
                if (document.getElementById('fuel_km')) document.getElementById('fuel_km').value = f.km_atual;
                if (document.getElementById('fuel_litros')) document.getElementById('fuel_litros').value = f.litros;
                if (document.getElementById('fuel_total')) document.getElementById('fuel_total').value = f.valor_total;
                if (document.getElementById('fuel_unitario')) document.getElementById('fuel_unitario').value = f.valor_unitario;
                if (document.getElementById('fuel_posto')) document.getElementById('fuel_posto').value = f.posto_id || '';
                if (document.getElementById('fuel_posto_categoria')) document.getElementById('fuel_posto_categoria').value = f.categoria_id || '';
                if (document.getElementById('fuel_combustivel')) document.getElementById('fuel_combustivel').value = f.tipo_combustivel || '';
                if (document.getElementById('fuel_obs')) document.getElementById('fuel_obs').value = f.observacoes || '';
                
                if (window.handleFuelPostoChange) window.handleFuelPostoChange();
            }
        } else {
            if (document.getElementById('fuel_data')) document.getElementById('fuel_data').value = new Date().toISOString().split('T')[0];
            if (document.getElementById('fuel_horario')) document.getElementById('fuel_horario').value = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        }
        
        modal.classList.add('active');
        if (window.handleFuelVehicleChange) window.handleFuelVehicleChange();
        
    } catch (err) {
        console.error('Falha ao abrir modal:', err);
    }
};

// --- Excel Import/Export Handling ---

window.downloadFuelTemplate = () => {
    const headers = [
        ["Placa", "Data", "Horário", "Condutor", "Posto", "Cidade", "Estado", "Categoria Posto", "Tipo Combustível", "Litros", "Valor Total", "KM Atual"]
    ];
    const ws = XLSX.utils.aoa_to_sheet(headers);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Modelo Abastecimento");
    XLSX.writeFile(wb, "modelo_abastecimento_frotalink.xlsx");
};

window.triggerFuelImport = () => {
    document.getElementById('fuelExcelInput').click();
};

window.exportFuelToPDF = () => {
    const { jsPDF } = window.jspdf;
    const doc = jsPDF('l', 'mm', 'a4'); // Landscape
    
    const records = getFilteredRecords();
    
    if (records.length === 0) {
        showToast('Nenhum registro para exportar!', 'warning');
        return;
    }

    // Header do PDF
    doc.setFontSize(18);
    doc.setTextColor(40, 40, 40);
    doc.text('Relatório de Abastecimentos - FrotaLink', 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    const dateStr = new Date().toLocaleString('pt-BR');
    doc.text(`Gerado em: ${dateStr}`, 14, 28);
    
    if (state.activeAlertFilter) {
        doc.setFont('helvetica', 'bold');
        doc.text(`Filtro Ativo: ${state.activeAlertFilter}`, 14, 34);
    }

    const tableData = records.map(r => {
        const prev = state.fuelingRecords
            .filter(pr => pr.veiculo_id === r.veiculo_id && pr.id !== r.id)
            .sort((a, b) => smartParseDate(b.data, b.horario) - smartParseDate(a.data, a.horario))
            .find(pr => smartParseDate(pr.data, pr.horario) < smartParseDate(r.data, r.horario));
        
        const kmRodado = prev ? (r.km_atual - prev.km_atual) : 0;
        const media = (kmRodado > 0 && r.litros > 0) ? (kmRodado / r.litros).toFixed(2) : '0.00';

        // Formatar Data para DD/MM/AAAA
        let formattedDate = r.data;
        if (formattedDate && formattedDate.includes('-')) {
            const [y, m, d] = formattedDate.split('-');
            formattedDate = `${d}/${m}/${y}`;
        }
        const fullDateStr = `${formattedDate} ${r.horario || ''}`.trim();

        // Mapear Posto e Categoria
        const postoObj = state.posts.find(p => p.id === r.posto_id);
        const catObj = state.postCategories.find(c => c.id === r.categoria_id);
        const postoInfo = postoObj ? `${postoObj.nome}${catObj ? ` (${catObj.descricao})` : ''}` : (r.posto_id || '-');

        return [
            fullDateStr,
            r.veiculos?.placa || '-',
            r.km_atual.toLocaleString('pt-BR'),
            kmRodado.toLocaleString('pt-BR'),
            r.litros.toLocaleString('pt-BR'),
            r.tipo_combustivel || '-',
            media,
            `R$ ${r.valor_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
            postoInfo
        ];
    });

    doc.autoTable({
        startY: 40,
        head: [['Data/Hora', 'Placa', 'KM Atual', 'KM Rod.', 'Litros', 'Combust.', 'Média', 'Total', 'Posto']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [99, 102, 241], textColor: 255 },
        styles: { fontSize: 8 },
        alternateRowStyles: { fillColor: [245, 247, 250] }
    });

    doc.save(`Abastecimentos_Filtrados_${new Date().getTime()}.pdf`);
    showToast('PDF gerado com sucesso!', 'success');
};

// Helper to parse dates safely (handles YYYY-MM-DD and DD/MM/YYYY)
window.filterByPlate = (plate) => {
    if (!plate) return;
    
    // 1. Update search input
    const searchInput = document.getElementById('fuelSearch');
    if (searchInput) searchInput.value = plate;

    // We no longer set state.fuelFilters.veiculo here to avoid the "sticky dropdown" issue
    // reported by the user. The search input is enough to filter the records.

    state.currentPage = 1;
    renderFuelTable();
};

function smartParseDate(dateStr, timeStr = '00:00:00') {
    if (!dateStr) return new Date(0);
    if (dateStr instanceof Date) return dateStr;
    
    // Normalize date to YYYY-MM-DD
    let normalizedDate = String(dateStr).trim();
    if (normalizedDate.includes('/')) {
        const [d, m, y] = normalizedDate.split('/');
        normalizedDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    // Normalize time to 24h (HH:mm:ss)
    let normalizedTime = String(timeStr || '00:00:00').trim().toUpperCase();
    if (normalizedTime.includes('AM') || normalizedTime.includes('PM')) {
        const isPM = normalizedTime.includes('PM');
        let timePart = normalizedTime.replace(/AM|PM/i, '').trim();
        let [h, m, s] = timePart.split(':');
        h = parseInt(h);
        if (isPM && h < 12) h += 12;
        if (!isPM && h === 12) h = 0;
        normalizedTime = `${String(h).padStart(2, '0')}:${m || '00'}:${s || '00'}`;
    }
    
    // Fix: if date is YYYY-MM-DD and time is HH:MM, append :00
    if (normalizedTime.split(':').length === 2) normalizedTime += ':00';
    
    const parsed = new Date(`${normalizedDate}T${normalizedTime}`);
    return isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

// Helper to format time to HH:MM (24h)
function formatTime24h(dateStr, timeStr) {
    const date = smartParseDate(dateStr, timeStr);
    if (date.getTime() === 0) return '--:--';
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
}

// --- Dashboard Logic ---

window.switchMainTab = (tab) => {
    // Reset all tabs components
    document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
    
    // Deactivate all sections
    const sections = ['fuelSection', 'dashboardSection', 'setupSection', 'importsSection', 'comparativoSection'];
    sections.forEach(s => {
        const el = document.getElementById(s);
        if (el) el.classList.remove('active');
    });

    // Activate selected tab item
    const tabEl = document.querySelector(`.tab-item[onclick*="'${tab}'"]`);
    if (tabEl) tabEl.classList.add('active');

    // Activate selected section
    let sectionId;
    if (tab === 'dashboard') sectionId = 'dashboardSection';
    else if (tab === 'comparativo') sectionId = 'comparativoSection';
    else if (tab === 'fuel') sectionId = 'fuelSection';
    else if (tab === 'imports') sectionId = 'importsSection';
    else if (tab === 'setup') sectionId = 'setupSection';

    const sectionEl = document.getElementById(sectionId);
    if (sectionEl) {
        sectionEl.classList.add('active');
        const statsRow = document.getElementById('statsRow');
        
        if (tab === 'dashboard') {
            initDashboard();
            if (statsRow) statsRow.style.display = 'none';
        } else if (tab === 'comparativo') {
            if (statsRow) statsRow.style.display = 'none';
            initComparativo();
        } else if (tab === 'setup') {
            if (statsRow) statsRow.style.display = 'none';
            renderSetupTables();
        } else if (tab === 'imports') {
            if (statsRow) statsRow.style.display = 'none';
            renderImportsTable();
        } else {
            if (statsRow) statsRow.style.display = 'grid';
            renderFuelTable();
        }

    }
};

window.switchSetupTab = (tab) => {
    state.currentSetupTab = tab;
    document.querySelectorAll('#setupSection .tab-item').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.setup-content').forEach(c => c.classList.remove('active'));

    const tabEl = document.querySelector(`#setupSection .tab-item[onclick*="'${tab}'"]`);
    if (tabEl) tabEl.classList.add('active');

    const contentEl = document.getElementById(`setup_${tab}`);
    if (contentEl) contentEl.classList.add('active');

    renderSetupTables();
};

function initDashboard() {
    const dashStart = document.getElementById('dash_start');
    const dashEnd = document.getElementById('dash_end');
    
    if (dashStart && !dashStart.value) {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0); // Last day of month
        
        // Se preferir que o 'end' seja hoje em vez do último dia do mês:
        // const end = now;

        dashStart.value = start.toISOString().split('T')[0];
        dashEnd.value = now.toISOString().split('T')[0]; // Set end to today
        updatePresetUI('preset_curr');
    }
    
    updateDashboard();
}

function updatePresetUI(activeId) {
    document.querySelectorAll('.date-presets button').forEach(btn => {
        btn.classList.remove('active-preset');
    });
    if (activeId) {
        const activeBtn = document.getElementById(activeId);
        if (activeBtn) activeBtn.classList.add('active-preset');
    }
}

window.setDashRange = (days) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    
    document.getElementById('dash_start').value = start.toISOString().split('T')[0];
    document.getElementById('dash_end').value = end.toISOString().split('T')[0];
    
    updatePresetUI(`preset_${days}`);
    updateDashboard();
};

window.setDashPreviousMonth = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    
    document.getElementById('dash_start').value = start.toISOString().split('T')[0];
    document.getElementById('dash_end').value = end.toISOString().split('T')[0];
    
    updatePresetUI('preset_prev');
    updateDashboard();
};

window.setDashCurrentMonth = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    
    document.getElementById('dash_start').value = start.toISOString().split('T')[0];
    document.getElementById('dash_end').value = now.toISOString().split('T')[0];
    
    updatePresetUI('preset_curr');
    updateDashboard();
};

window.updateDashboard = (manualChange = false) => {
    if (manualChange) {
        updatePresetUI(null);
    }

    const startStr = document.getElementById('dash_start').value;
    const endStr = document.getElementById('dash_end').value;
    
    // 1. Get filter values
    const filterVeiculo = document.getElementById('dash_filter_veiculo').value;
    const filterMotorista = document.getElementById('dash_filter_motorista').value;
    const filterCombustivel = document.getElementById('dash_filter_combustivel').value;
    const filterPosto = document.getElementById('dash_filter_posto').value;
    const filterCategoria = document.getElementById('dash_filter_categoria').value;
    const filterModelo = document.getElementById('dash_filter_modelo').value;
    const startDate = startStr ? new Date(startStr + 'T00:00:00') : null;
    const endDate = endStr ? new Date(endStr + 'T23:59:59') : null;
    
    // 2. Filter records
    const filters = {
        veiculo: document.getElementById('dash_filter_veiculo').value,
        motorista: document.getElementById('dash_filter_motorista').value,
        combustivel: document.getElementById('dash_filter_combustivel').value,
        posto: document.getElementById('dash_filter_posto').value,
        categoria: document.getElementById('dash_filter_categoria').value,
        modelo: document.getElementById('dash_filter_modelo').value,
        classificacao: document.getElementById('dash_filter_classificacao').value
    };

    const records = state.fuelingRecords.filter(f => {
        const d = smartParseDate(f.data, f.horario);
        if (startDate && d < startDate) return false;
        if (endDate && d > endDate) return false;
        
        if (filters.veiculo && f.veiculo_id !== filters.veiculo) return false;
        if (filters.motorista && f.motorista_id !== filters.motorista) return false;
        if (filters.combustivel && f.tipo_combustivel?.toUpperCase() !== filters.combustivel.toUpperCase()) return false;
        if (filters.posto && f.posto_id !== filters.posto) return false; 
        if (filters.categoria && f.categoria_id !== filters.categoria) return false;
        
        if (filters.modelo) {
            const vehicle = state.vehicles.find(v => v.id === f.veiculo_id);
            const vModel = vehicle ? `${vehicle.marca} ${vehicle.modelo}`.trim().toUpperCase() : '';
            if (vModel !== filters.modelo.toUpperCase()) return false;
        }

        if (filters.classificacao) {
            const vehicle = state.vehicles.find(v => v.id === f.veiculo_id);
            if (vehicle?.classificacao?.toUpperCase() !== filters.classificacao.toUpperCase()) return false;
        }
        
        return true;
    });

    // 3. Update filter options based on current filtered data (Intelligent Filtering)
    updateFilterOptionsDynamically(records, filters);

    // KPI Calc
    let totalSpent = 0;
    let totalSpentParaMedia = 0;
    let totalLitros = 0;
    let totalM3 = 0;
    let totalKm = 0;
    let totalLitrosParaMedia = 0;
    
    // Group by vehicle for KM calc across result set
    const vehicleGroups = {};
    records.forEach(r => {
        totalSpent += r.valor_total || 0;
        
        const fuel = (r.tipo_combustivel || '').toUpperCase();
        const isGas = fuel === 'GNV' || fuel === 'GÁS' || fuel.includes('GÁS NATURAL') || fuel.includes('GAS NATURAL');
        
        if (isGas) {
            totalM3 += r.litros || 0;
        } else {
            totalLitros += r.litros || 0;
        }
        
        if (!vehicleGroups[r.veiculo_id]) vehicleGroups[r.veiculo_id] = [];
        vehicleGroups[r.veiculo_id].push(r);
    });
    
    let sumAveragesForDash = 0;
    let validEntriesCountForDash = 0;

    Object.values(vehicleGroups).forEach(group => {
        if (group.length < 2) return;
        group.sort((a,b) => smartParseDate(a.data, a.horario) - smartParseDate(b.data, b.horario));
        
        const vId = group[0].veiculo_id;
        const vehicle = state.vehicles.find(v => v.id === vId);
        const isIgnored = vehicle?.ignorar_media || group[0].veiculos?.ignorar_media;
        if (isIgnored) return; 

        // Total KM for the group (KPI still needs this)
        const kmGroup = group[group.length - 1].km_atual - group[0].km_atual;
        if (kmGroup > 0) totalKm += kmGroup;

        // Individual entries logic for "Average of Averages"
        group.forEach((curr, idx) => {
            const prev = group[idx - 1];
            if (prev) {
                const diff = parseFloat(curr.km_atual) - parseFloat(prev.km_atual);
                const litros = parseFloat(curr.litros) || 0;
                
                if (diff > 0 && litros > 0) {
                    const entryAvg = diff / litros;
                    const vehicleFuel = (curr.veiculos?.tipo_combustivel || vehicle?.tipo_combustivel || '').trim().toLowerCase();
                    const entryFuel = (curr.tipo_combustivel || '').trim().toLowerCase();

                    if (vehicleFuel && entryFuel === vehicleFuel) {
                        sumAveragesForDash += entryAvg;
                        validEntriesCountForDash++;
                    }
                    
                    // Always add to total spent/liters para media de custo se não for ignorado
                    totalLitrosParaMedia += litros;
                    totalSpentParaMedia += (parseFloat(curr.valor_total) || 0);
                }
            }
        });
    });

    document.getElementById('kpi_total_spent').innerText = totalSpent.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    document.getElementById('kpi_total_litros').innerText = totalLitros.toLocaleString('pt-BR') + ' L';
    document.getElementById('kpi_total_m3').innerText = totalM3.toLocaleString('pt-BR') + ' m³';
    document.getElementById('kpi_total_km').innerText = totalKm.toLocaleString('pt-BR') + ' km';
    document.getElementById('dash_avg_consumption').innerText = validEntriesCountForDash > 0 ? (sumAveragesForDash / validEntriesCountForDash).toFixed(2) + ' km/l' : '---';
    document.getElementById('kpi_avg_cost_km').innerText = totalKm > 0 ? (totalSpentParaMedia / totalKm).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '---';

    renderDashboardCharts(records);
    renderPostoAnalyst(records);
};

window.renderDashboardCharts = (records) => {
    if (!window.Chart) return;
    
    // Register the plugin globally for this function
    Chart.register(ChartDataLabels);

    // --- Cleanup ---
    if (state.charts) {
        Object.values(state.charts).forEach(c => c?.destroy && c.destroy());
    }
    state.charts = {};

    // --- 1. Evolution Chart (Lines) ---
    const dailyData = {};
    records.forEach(r => {
        const d = r.data.split('T')[0];
        if (!dailyData[d]) dailyData[d] = { spent: 0, qty: 0 };
        dailyData[d].spent += r.valor_total || 0;
        dailyData[d].qty += r.litros || 0;
    });

    const dates = Object.keys(dailyData).sort();
    const ctxMain = document.getElementById('mainFuelChart')?.getContext('2d');
    if (ctxMain) {
        state.charts.main = new Chart(ctxMain, {
            type: 'line',
            data: {
                labels: dates.map(d => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')),
                datasets: [
                    {
                        label: 'Gasto (R$)',
                        data: dates.map(d => dailyData[d].spent),
                        borderColor: '#6366f1',
                        backgroundColor: 'rgba(99, 102, 241, 0.1)',
                        fill: true,
                        tension: 0.4,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Quantidade Total',
                        data: dates.map(d => dailyData[d].qty),
                        borderColor: '#ec4899',
                        borderWidth: 2,
                        fill: false,
                        tension: 0.4,
                        pointRadius: 3,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: { ticks: { color: '#94a3b8' }, grid: { display: false } },
                    y: { 
                        type: 'linear', 
                        position: 'left', 
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#94a3b8', callback: (val) => 'R$ ' + val }
                    },
                    y1: { 
                        type: 'linear', 
                        position: 'right', 
                        grid: { drawOnChartArea: false },
                        ticks: { color: '#ec4899' }
                    }
                },
                plugins: { 
                    datalabels: { display: false },
                    legend: { labels: { color: '#e2e8f0', usePointStyle: true } },
                    tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.9)', padding: 12 }
                }
            }
        });
    }

    // --- 2. Fuel Type Chart (Doughnut) ---
    const fuelTypes = {};
    records.forEach(r => {
        const type = r.tipo_combustivel || 'Não Inf.';
        fuelTypes[type] = (fuelTypes[type] || 0) + (r.valor_total || 0);
    });

    const ctxFuel = document.getElementById('fuelTypeChart')?.getContext('2d');
    if (ctxFuel) {
        state.charts.fuelType = new Chart(ctxFuel, {
            type: 'doughnut',
            data: {
                labels: Object.keys(fuelTypes),
                datasets: [{
                    data: Object.values(fuelTypes),
                    backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { 
                    legend: { position: 'right', labels: { color: '#e2e8f0' } },
                    datalabels: {
                        color: '#fff',
                        font: { weight: 'bold', size: 10 },
                        formatter: (value, ctx) => {
                            const sum = ctx.dataset.data.reduce((a, b) => a + b, 0);
                            const perc = (value * 100 / sum).toFixed(1) + "%";
                            return perc;
                        }
                    }
                }
            }
        });
    }

    // --- 3. Vehicle Ranking (Spending) ---
    const vehicleSpend = {};
    records.forEach(r => {
        const label = r.veiculos?.placa || 'Desconhecido';
        vehicleSpend[label] = (vehicleSpend[label] || 0) + (r.valor_total || 0);
    });

    const sortedVehicles = Object.entries(vehicleSpend)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    const ctxVeh = document.getElementById('rankingVehiclesChart')?.getContext('2d');
    if (ctxVeh) {
        state.charts.rankingVehicles = new Chart(ctxVeh, {
            type: 'bar',
            data: {
                labels: sortedVehicles.map(v => v[0]),
                datasets: [{
                    label: 'Total Gasto (R$)',
                    data: sortedVehicles.map(v => v[1]),
                    backgroundColor: '#6366f1',
                    borderRadius: 5
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                scales: { 
                    x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                    y: { ticks: { color: '#cbd5e1' } }
                },
                plugins: {
                    datalabels: {
                        anchor: 'end',
                        align: 'end',
                        color: '#6366f1',
                        font: { weight: 'bold' },
                        formatter: (val) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
                    }
                }
            }
        });
    }

    // --- 4. Driver Ranking ---
    const driverSpend = {};
    records.forEach(r => {
        const label = r.motoristas?.nome_completo || 'Sem Condutor';
        driverSpend[label] = (driverSpend[label] || 0) + (r.valor_total || 0);
    });

    const sortedDrivers = Object.entries(driverSpend)
        .sort((a,b) => b[1] - a[1])
        .slice(0, 10);

    const ctxDri = document.getElementById('rankingDriversChart')?.getContext('2d');
    if (ctxDri) {
        state.charts.rankingDrivers = new Chart(ctxDri, {
            type: 'bar',
            data: {
                labels: sortedDrivers.map(d => d[0]),
                datasets: [{
                    label: 'Gasto por Condutor (R$)',
                    data: sortedDrivers.map(d => d[1]),
                    backgroundColor: '#a855f7',
                    borderRadius: 5
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                scales: { 
                    x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                    y: { ticks: { color: '#cbd5e1' } }
                },
                plugins: {
                    datalabels: {
                        anchor: 'end',
                        align: 'end',
                        color: '#a855f7',
                        font: { weight: 'bold' },
                        formatter: (val) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
                    }
                }
            }
        });
    }

    // --- 5. Efficiency Rank (HTML) ---
    const container = document.getElementById('efficiencyRankContainer');
    if (container) {
        const vehicleGroups = {};
        records.forEach(r => {
            if (!vehicleGroups[r.veiculo_id]) vehicleGroups[r.veiculo_id] = [];
            vehicleGroups[r.veiculo_id].push(r);
        });

        const efficiencyList = [];
        Object.keys(vehicleGroups).forEach(vid => {
            const grp = vehicleGroups[vid];
            if (grp.length < 2) return;
            
            // --- Ignorar veículos marcados para não controlar média ---
            const vehicle = state.vehicles.find(v => v.id === vid);
            const isIgnored = vehicle?.ignorar_media || grp[0].veiculos?.ignorar_media;
            if (isIgnored) return; 

            grp.sort((a,b) => smartParseDate(a.data, a.horario) - smartParseDate(b.data, b.horario));
            const km = grp[grp.length - 1].km_atual - grp[0].km_atual;
            const qty = grp.reduce((acc, curr) => acc + curr.litros, 0);
            if (km > 0 && qty > 0) {
                efficiencyList.push({
                    placa: grp[0].veiculos?.placa || vid,
                    media: km / qty
                });
            }
        });

        const topEff = efficiencyList.sort((a,b) => b.media - a.media).slice(0, 5);
        
        if (topEff.length === 0) {
            container.innerHTML = '<div style="opacity: 0.5; text-align: center; padding: 2rem;">Dados insuficientes para ranking de eficiência</div>';
        } else {
            container.innerHTML = topEff.map((item, idx) => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.6rem 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <div style="display: flex; align-items: center; gap: 0.8rem;">
                        <span style="width: 25px; height: 25px; display: flex; align-items: center; justify-content: center; background: rgba(16, 185, 129, 0.1); color: #10b981; border-radius: 50%; font-size: 0.7rem; font-weight: 800;">${idx+1}º</span>
                        <span style="font-weight: 600;">${item.placa}</span>
                    </div>
                    <span style="color: var(--success); font-weight: 800;">${item.media.toFixed(2)} km/L</span>
                </div>
            `).join('');
        }
    }
}

function renderPostoAnalyst(records) {
    const analystContainer = document.getElementById('postoAnalystContainer');
    const recommendationContainer = document.getElementById('postoRecommendationContainer');
    if (!analystContainer || !recommendationContainer) return;

    // 1. Agrupar dados
    const byFuelType = {};
    const byPosto = {};
    const fuelTypeVolume = {};

    records.forEach(r => {
        const type = r.tipo_combustivel || 'Não Inf.';
        const val = parseFloat(r.valor_total) || 0;
        const qty = parseFloat(r.litros) || 0;
        const pId = r.postos?.nome || r.posto_id || 'Não Inf.';

        if (!byFuelType[type]) byFuelType[type] = { totalVal: 0, totalQty: 0, stations: {} };
        byFuelType[type].totalVal += val;
        byFuelType[type].totalQty += qty;
        fuelTypeVolume[type] = (fuelTypeVolume[type] || 0) + qty;

        if (!byFuelType[type].stations[pId]) byFuelType[type].stations[pId] = { val: 0, qty: 0 };
        byFuelType[type].stations[pId].val += val;
        byFuelType[type].stations[pId].qty += qty;

        if (!byPosto[pId]) byPosto[pId] = { fuels: {} };
        if (!byPosto[pId].fuels[type]) byPosto[pId].fuels[type] = { val: 0, qty: 0 };
        byPosto[pId].fuels[type].val += val;
        byPosto[pId].fuels[type].qty += qty;
    });

    const fuelTypeAverages = {};
    for (const type in byFuelType) {
        if (byFuelType[type].totalQty > 0) {
            fuelTypeAverages[type] = byFuelType[type].totalVal / byFuelType[type].totalQty;
        }
    }

    const stationBenefits = [];
    for (const pId in byPosto) {
        let strategicScore = 0;
        let totalVolume = 0;
        let fuelsHandled = [];
        for (const type in byPosto[pId].fuels) {
            const fData = byPosto[pId].fuels[type];
            if (fData.qty > 0) {
                const stationAvg = fData.val / fData.qty;
                const globalAvg = fuelTypeAverages[type] || stationAvg;
                strategicScore += (globalAvg - stationAvg) * fData.qty;
                totalVolume += fData.qty;
                fuelsHandled.push(type);
            }
        }
        stationBenefits.push({ name: pId, score: strategicScore, volume: totalVolume, fuels: fuelsHandled });
    }

    // 2. Tabela de Comparativo
    const sortedFuelTypes = Object.keys(byFuelType).sort((a, b) => fuelTypeVolume[b] - fuelTypeVolume[a]);
    let tableHtml = `
        <table class="analyst-table">
            <thead>
                <tr>
                    <th>Combustível</th>
                    <th>Melhor Opção</th>
                    <th>Pior Opção</th>
                </tr>
            </thead>
            <tbody>
    `;

    sortedFuelTypes.forEach(type => {
        const stats = [];
        const stations = byFuelType[type].stations;
        for (const name in stations) {
            if (stations[name].qty > 0) {
                stats.push({ name, avg: stations[name].val / stations[name].qty });
            }
        }
        if (stats.length === 0) return;
        stats.sort((a, b) => a.avg - b.avg);
        const best = stats[0];
        const worst = stats[stats.length - 1];

        tableHtml += `
            <tr>
                <td class="fuel-name-cell">${type}</td>
                <td>
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                        <span style="font-weight: 600; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px;">${best.name}</span>
                        <div class="price-chip best">
                            <i data-lucide="trending-down" style="width:10px;"></i>
                            <span>R$ ${best.avg.toFixed(3)}</span>
                        </div>
                    </div>
                </td>
                <td>
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                        <span style="font-weight: 600; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px;">${worst.name}</span>
                        <div class="price-chip worst">
                            <i data-lucide="trending-up" style="width:10px;"></i>
                            <span>R$ ${worst.avg.toFixed(3)}</span>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    });
    tableHtml += `</tbody></table>`;

    // 3. Cards de Recomendação Estratégica
    const totalGlobalVolume = stationBenefits.reduce((sum, s) => sum + s.volume, 0) || 1;
    stationBenefits.sort((a, b) => b.score - a.score);
    
    const topStation = stationBenefits.find(s => s.score > 0.01);
    
    // Para o alerta, focamos em postos "não costumeiros" (volume < 20%) que são caros
    const smallStations = stationBenefits.filter(s => (s.volume / totalGlobalVolume) * 100 < 20);
    const worstStation = [...smallStations].sort((a, b) => a.score - b.score).find(s => s.score < -0.01);
    
    let recommendationHtml = '';

    if (topStation) {
        recommendationHtml += `
            <div class="recommendation-card-new">
                <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;">
                    <div style="background: rgba(251, 191, 36, 0.1); width: 42px; height: 42px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <i data-lucide="crown" style="width: 24px; height: 24px; color: #fbbf24; fill: #fbbf24;"></i>
                    </div>
                    <div>
                        <div style="font-size: 0.6rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">Sugestão Estratégica</div>
                        <h2 style="font-size: 1rem; color: #fff; margin: 0; line-height: 1.2;">${topStation.name}</h2>
                    </div>
                </div>

                <p style="font-size: 0.7rem; color: var(--text-muted); line-height: 1.4; margin-bottom: 1rem;">
                    Este posto apresentou o melhor desempenho financeiro global para sua frota, considerando o volume de <strong>${topStation.volume.toLocaleString('pt-BR')} unidades</strong>.
                </p>

                <div style="display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 1rem;">
                    ${topStation.fuels.map(f => `<span style="font-size: 0.55rem; background: rgba(255,255,255,0.05); color: #fff; padding: 0.15rem 0.5rem; border-radius: 4px; border: 1px solid rgba(255,255,255,0.05);">${f}</span>`).join('')}
                </div>

                <div style="padding: 0.75rem; background: rgba(99, 102, 241, 0.1); border-radius: 10px; display: flex; align-items: center; gap: 0.8rem;">
                    <i data-lucide="target" style="color: var(--primary); width: 18px;"></i>
                    <span style="font-size: 0.75rem; font-weight: 700; color: #fff;">Prioridade Operacional Máxima</span>
                </div>
            </div>
        `;
    }

    if (worstStation && worstStation.name !== topStation?.name) {
        recommendationHtml += `
            <div class="recommendation-card-new attention" style="background: linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(245, 158, 11, 0.05) 100%); border: 1px solid rgba(239, 68, 68, 0.2);">
                <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;">
                    <div style="background: rgba(239, 68, 68, 0.1); width: 42px; height: 42px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <i data-lucide="alert-triangle" style="width: 24px; height: 24px; color: #ef4444;"></i>
                    </div>
                    <div>
                        <div style="font-size: 0.6rem; color: #ef4444; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">Posto sob Alerta</div>
                        <h2 style="font-size: 1rem; color: #fff; margin: 0; line-height: 1.2;">${worstStation.name}</h2>
                    </div>
                </div>

                <p style="font-size: 0.7rem; color: var(--text-muted); line-height: 1.4; margin-bottom: 1rem;">
                    Este posto apresentou preços elevados em relação à média, com volume relevante de <strong>${worstStation.volume.toLocaleString('pt-BR')} unidades</strong>. Recomenda-se reduzir o uso.
                </p>

                <div style="padding: 0.75rem; background: rgba(239, 68, 68, 0.1); border-radius: 10px; display: flex; align-items: center; gap: 0.8rem;">
                    <i data-lucide="eye" style="color: #ef4444; width: 18px;"></i>
                    <span style="font-size: 0.75rem; font-weight: 700; color: #fff;">Atenção Operacional Crítica</span>
                </div>
            </div>
        `;
    }

    analystContainer.innerHTML = tableHtml;
    recommendationContainer.innerHTML = recommendationHtml;
    
    if (window.lucide) lucide.createIcons();
}

// Helpers for Units (Quantity and Media)
function getFuelUnit(type) {
    if (!type) return 'L';
    const t = type.toUpperCase();
    return (t.includes('GÁS NATURAL') || t.includes('GAS NATURAL')) ? 'm³' : 'L';
}

function getFuelMediaUnit(type) {
    if (!type) return 'km/l';
    const t = type.toUpperCase();
    return (t.includes('GÁS NATURAL') || t.includes('GAS NATURAL')) ? 'km/m³' : 'km/l';
}

// Helper para buscar valor em objeto de forma flexível (case-insensitive e trim)
function getVal(row, aliases) {
    const keys = Object.keys(row);
    for (const alias of aliases) {
        const foundKey = keys.find(k => k.trim().toLowerCase() === alias.toLowerCase());
        if (foundKey) return row[foundKey];
    }
    return null;
}

window.handleFuelImport = (event) => {

    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { 
            type: 'array',
            cellDates: true,
            dateNF: 'yyyy-mm-dd'
        });
        const sheetName = workbook.SheetNames[0];
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { raw: false });

        if (rows.length === 0) {
            showToast("O arquivo está vazio", "error");
            return;
        }

        // --- PASS 0: HEADER VALIDATION ---
        const requiredHeaders = [
            { key: 'Placa', aliases: ['Placa', 'Veiculo', 'Veículo'] },
            { key: 'Data', aliases: ['Data', 'Data Abastecimento'] },
            { key: 'Horário', aliases: ['Horário', 'Horario', 'Hora'] },
            { key: 'Condutor', aliases: ['Condutor', 'Motorista', 'Nome'] },
            { key: 'Posto', aliases: ['Posto', 'Estabelecimento', 'Nome Fantasia', 'Local', 'Unidade', 'Loja', 'Posto/Loja'] },
            { key: 'Categoria', aliases: ['Categoria', 'Categoria Posto', 'Grupo'] },
            { key: 'Tipo Combustível', aliases: ['Tipo Combustível', 'Combustível', 'Combustivel', 'Produto'] },
            { key: 'Litros', aliases: ['Litros', 'Quantidade', 'Volume'] },
            { key: 'Valor Total', aliases: ['Valor Total', 'Total', 'Valor', 'Importe'] },
            { key: 'KM Atual', aliases: ['KM Atual', 'KM', 'Odômetro', 'Odom'] }
        ];

        const missingHeaders = [];
        const firstRow = rows[0];
        requiredHeaders.forEach(req => {
            if (getVal(firstRow, req.aliases) === null) {
                missingHeaders.push(req.key);
            }
        });

        if (missingHeaders.length > 0) {
            alert("ERRO DE MODELO DA PLANILHA!\n\nImportação bloqueada porque as seguintes colunas obrigatórias não foram encontradas:\n- " + missingHeaders.join('\n- ') + "\n\nPor favor, utilize o modelo oficial disponível no botão 'Modelo'.");
            event.target.value = '';
            return;
        }

        showToast(`Validando ${rows.length} registros...`, 'info');


        // --- PASS 1: VALIDATION ---
        const missing = {
            vehicles: new Set(),
            drivers: new Set(),
            posts: new Set(),
            categories: new Set(),
            fuelTypes: new Set()
        };

        for (const row of rows) {
            // Check Vehicle
            const placa = String(getVal(row, ['Placa', 'Veiculo', 'Veículo']) || '').trim().toUpperCase();
            if (placa && !state.vehicles.find(v => v.placa.toUpperCase() === placa)) {
                missing.vehicles.add(placa);
            }

            // Check Driver
            const driverName = String(getVal(row, ['Condutor', 'Motorista', 'Nome']) || '').trim();
            if (driverName && !state.drivers.find(d => d.nome_completo.toLowerCase() === driverName.toLowerCase())) {
                missing.drivers.add(driverName);
            }

            // Check Post
            const postoName = String(getVal(row, ['Posto', 'Estabelecimento', 'Nome Fantasia', 'Local', 'Unidade', 'Loja', 'Posto/Loja']) || '').trim();
            if (postoName && !state.posts.find(p => p.nome.toLowerCase() === postoName.toLowerCase())) {
                missing.posts.add(postoName);
            }

            // Check Category
            const categoryName = String(getVal(row, ['Categoria', 'Categoria Posto', 'Grupo']) || '').trim().toUpperCase();
            if (categoryName && !state.postCategories.find(c => c.descricao.toUpperCase() === categoryName)) {
                missing.categories.add(categoryName);
            }

            // Check Fuel Type
            const fuelName = String(getVal(row, ['Tipo Combustível', 'Combustível', 'Combustivel', 'Produto']) || '').trim();
            if (fuelName && !state.fuelTypes.find(f => f.descricao.toLowerCase() === fuelName.toLowerCase())) {
                missing.fuelTypes.add(fuelName);
            }
        }


        // --- Check if anything is missing ---
        let errorMsg = "";
        if (missing.vehicles.size > 0) errorMsg += `Veículos não cadastrados: ${Array.from(missing.vehicles).join(', ')}\n`;
        if (missing.drivers.size > 0) errorMsg += `Motoristas não cadastrados: ${Array.from(missing.drivers).join(', ')}\n`;
        if (missing.posts.size > 0) errorMsg += `Postos não cadastrados: ${Array.from(missing.posts).join(', ')}\n`;
        if (missing.categories.size > 0) errorMsg += `Categorias não cadastradas: ${Array.from(missing.categories).join(', ')}\n`;
        if (missing.fuelTypes.size > 0) errorMsg += `Tipos de combustível não cadastrados: ${Array.from(missing.fuelTypes).join(', ')}\n`;

        if (errorMsg) {
            alert("IMPORTAÇÃO BLOQUEADA!\n\nMotivo:\n" + errorMsg);
            event.target.value = '';
            return;
        }

        // --- PASS 2: DATA PREPARATION ---
        const toProcess = [];
        let totalVal = 0;

        for (const row of rows) {
            const vehicle = state.vehicles.find(v => v.placa.toUpperCase() === String(getVal(row, ['Placa', 'Veiculo', 'Veículo']) || '').trim().toUpperCase());
            const driver = state.drivers.find(d => d.nome_completo.toLowerCase() === String(getVal(row, ['Condutor', 'Motorista', 'Nome']) || '').trim().toLowerCase());
            const posto = state.posts.find(p => p.nome.toLowerCase() === String(getVal(row, ['Posto', 'Estabelecimento', 'Nome Fantasia', 'Local', 'Unidade', 'Loja', 'Posto/Loja']) || '').trim().toLowerCase());
            const category = state.postCategories.find(c => c.descricao.toUpperCase() === String(getVal(row, ['Categoria', 'Categoria Posto', 'Grupo']) || '').trim().toUpperCase());
            const fuelType = state.fuelTypes.find(f => f.descricao.toLowerCase() === String(getVal(row, ['Tipo Combustível', 'Combustível', 'Combustivel', 'Produto']) || '').trim().toLowerCase());

            const recordData = {
                id: generateUUID(),
                veiculo_id: vehicle.id,
                data: getVal(row, ['Data', 'Data Abastecimento']) || new Date().toISOString().split('T')[0],
                horario: getVal(row, ['Horário', 'Horario', 'Hora']) || '12:00',
                motorista_id: driver ? driver.id : null,
                km_atual: cleanNumber(getVal(row, ['KM Atual', 'KM', 'Odômetro', 'Odom']) || 0),
                litros: cleanNumber(getVal(row, ['Litros', 'Quantidade', 'Volume']) || 0),
                valor_total: cleanNumber(getVal(row, ['Valor Total', 'Total', 'Valor', 'Importe']) || 0),
                valor_unitario: 0, 
                cidade_posto: getVal(row, ['Cidade', 'Localidade']) || (posto ? posto.cidade : ''),
                estado_posto: getVal(row, ['Estado', 'UF']) || (posto ? posto.estado : ''),
                tipo_combustivel: fuelType ? fuelType.descricao : (getVal(row, ['Tipo Combustível', 'Combustível', 'Combustivel']) || 'N/A'),
                posto_id: posto ? posto.id : null,
                categoria_id: category ? category.id : null,
                observacoes: "Importado via Excel"
            };


            if (recordData.litros > 0) {
                recordData.valor_unitario = recordData.valor_total / recordData.litros;
            }
            
            totalVal += recordData.valor_total;
            toProcess.push(recordData);
        }

        // --- PASS 3: INSERTION ---
        showToast(`Importando ${toProcess.length} registros...`, 'info');
        
        let importId = null;
        let displayId = 'IMP-00000';

        if (supabaseClient) {
            // Gerar Display ID e Criar Registro de Importação
            const { data: lastImp } = await supabaseClient.from('importacoes_abastecimento').select('display_id').order('display_id', { ascending: false }).limit(1);
            let nextNum = 1;
            if (lastImp && lastImp.length > 0 && lastImp[0].display_id.includes('-')) {
                const parts = lastImp[0].display_id.split('-');
                const lastNum = parseInt(parts[1]);
                if (!isNaN(lastNum)) nextNum = lastNum + 1;
            }
            displayId = `IMP-${String(nextNum).padStart(5, '0')}`;

            const { data: newImp, error: impError } = await supabaseClient.from('importacoes_abastecimento').insert([{
                display_id: displayId,
                nome_arquivo: file.name,
                total_registros: toProcess.length,
                total_valor: totalVal
            }]).select();

            if (impError) {
                showToast('Erro ao criar registro de importação: ' + impError.message, 'error');
                return;
            }
            importId = newImp[0].id;

            // Adicionar o vínculo nos registros
            const finalData = toProcess.map(row => ({ ...row, importacao_id: importId }));

            const { error } = await supabaseClient.from('abastecimentos').insert(finalData);
            if (error) {
                showToast('Erro ao inserir abastecimentos: ' + error.message, 'error');
                // Opcional: deletar a importação órfã
                await supabaseClient.from('importacoes_abastecimento').delete().eq('id', importId);
                return;
            }
            await loadInitialData();
        } else {
            // Local Mode
            importId = generateUUID();
            displayId = `IMP-${String(state.imports.length + 1).padStart(5, '0')}`;
            
            const newImp = {
                id: importId,
                display_id: displayId,
                data_importacao: new Date().toISOString(),
                nome_arquivo: file.name,
                total_registros: toProcess.length,
                total_valor: totalVal,
                created_at: new Date().toISOString()
            };
            state.imports.unshift(newImp);

            toProcess.forEach(r => {
                const veiculo = state.vehicles.find(v => v.id === r.veiculo_id);
                const motorista = state.drivers.find(d => d.id === r.motorista_id);
                const posto = state.posts.find(p => p.id === r.posto_id);
                const categoria = state.postCategories.find(c => c.id === r.categoria_id);
                
                state.fuelingRecords.unshift({
                    ...r,
                    importacao_id: importId,
                    veiculos: veiculo ? { placa: veiculo.placa, modelo: veiculo.modelo, classificacao: veiculo.classificacao } : null,
                    motoristas: motorista ? { nome_completo: motorista.nome_completo } : null,
                    postos: posto ? { nome: posto.nome } : null,
                    categorias_posto: categoria ? { descricao: categoria.descricao } : null
                });
            });
            saveLocalData();
            refreshUI();
        }

        showToast(`Sucesso! ${toProcess.length} registros importados sob ID ${displayId}`, 'success');
        event.target.value = ''; // Reset input
        
        if (window.registrarLog) {
            window.registrarLog('abastecimento', 'IMPORTAÇÃO', `Importou ${toProcess.length} registros sob o lote ${displayId}`);
        }

        // Redirecionar para a aba de importações para mostrar o registro
        switchMainTab('imports');
    };
    reader.readAsArrayBuffer(file);
};

// --- Imports Management Functions ---

window.renderImportsTable = () => {
    const tbody = document.getElementById('importsList');
    if (!tbody) return;

    const searchTerm = document.getElementById('importSearch')?.value.toLowerCase() || '';
    
    let filtered = state.imports.filter(imp => {
        return (imp.display_id || '').toLowerCase().includes(searchTerm) || 
               (imp.nome_arquivo && imp.nome_arquivo.toLowerCase().includes(searchTerm));
    });

    // Ordenação decrescente por data/id
    filtered.sort((a, b) => new Date(b.created_at || b.data_importacao) - new Date(a.created_at || a.data_importacao));

    tbody.innerHTML = filtered.map(imp => {
        const date = new Date(imp.data_importacao || imp.created_at);
        return `
            <tr>
                <td style="font-weight: 700; color: var(--primary-light);">${imp.display_id}</td>
                <td>
                    <div style="font-weight: 600;">${date.toLocaleDateString('pt-BR')}</div>
                    <div style="font-size: 0.7rem; color: var(--text-muted);">${date.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}</div>
                </td>
                <td style="font-size: 0.85rem; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${imp.nome_arquivo || ''}">
                    ${imp.nome_arquivo || '---'}
                </td>
                <td style="text-align: center; font-weight: 600;">${imp.total_registros}</td>
                <td style="text-align: center; font-weight: 600; color: var(--primary-light);">
                    ${(imp.total_valor || 0).toLocaleString('pt-BR', {style:'currency', currency:'BRL'})}
                </td>
                <td style="text-align: center;">
                    <div style="display: flex; gap: 0.5rem; justify-content: center;">
                        <button class="btn-action edit" onclick="viewImportRecords('${imp.id}')" title="Ver Registros" data-perm="abastecimento_importacoes:view">
                            <i data-lucide="eye" style="width: 14px;"></i>
                        </button>
                        <button class="btn-action delete" onclick="deleteImportBatch('${imp.id}', '${imp.display_id}')" title="Excluir Lote" data-perm="abastecimento_importacoes:delete">
                            <i data-lucide="trash-2" style="width: 14px;"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    if (window.lucide) lucide.createIcons();
};

window.viewImportRecords = (importId) => {
    // Limpar filtros e busca para mostrar apenas o lote
    state.fuelFilters = { categoria: '', posto: '', veiculo: '', combustivel: '', importacao_id: importId };
    
    const searchInput = document.getElementById('fuelSearch');
    if (searchInput) searchInput.value = '';

    ['categoria', 'posto', 'veiculo', 'combustivel'].forEach(id => {
        const el = document.getElementById('fuel_filter_' + id);
        if (el) el.value = '';
    });

    state.currentPage = 1;
    switchMainTab('fuel');
    showToast('Mostrando registros da importação selecionada', 'info');
};


window.deleteImportBatch = async (importId, displayId) => {
    if (!canDo('abastecimento_importacoes', 'delete')) {
        alert('Você não tem permissão para excluir importações.');
        return;
    }
    const verificationCode = Math.floor(1000 + Math.random() * 9000);
    const userInput = prompt(`⚠️ AVISO CRÍTICO ⚠️\n\nVocê está prestes a excluir PERMANENTEMENTE todos os registros vinculados à importação ${displayId}.\n\nPara confirmar esta ação, digite o código de segurança abaixo:\n\nCÓDIGO: ${verificationCode}`);
    
    if (userInput === null) return; // Usuário cancelou

    if (userInput !== String(verificationCode)) {
        alert("Código incorreto! Operação de exclusão cancelada por segurança.");
        return;
    }

    const motivo = prompt("Por favor, informe o motivo da exclusão deste lote de importação:");
    if (motivo === null) return; // Cancelado
    if (motivo.trim() === "") {
        alert("O motivo da exclusão é obrigatório para auditoria!");
        return;
    }
    const motivoTxt = motivo.trim();

    if (supabaseClient) {
        const { error } = await supabaseClient.from('importacoes_abastecimento').delete().eq('id', importId);
        if (error) {
            showToast('Erro ao excluir lote: ' + error.message, 'error');
        } else {
            showToast(`Lote ${displayId} e seus registros excluídos!`, 'success');
            if (window.registrarLog) {
                window.registrarLog('abastecimento', 'EXCLUSÃO', `Excluiu lote de importação ${displayId}. Motivo: ${motivoTxt}`);
            }
            await loadInitialData();
            renderImportsTable();
        }
    } else {
        // Local Mode
        state.fuelingRecords = state.fuelingRecords.filter(r => r.importacao_id !== importId);
        state.imports = state.imports.filter(imp => imp.id !== importId);
        saveLocalData();
        refreshUI();
        renderImportsTable();
        showToast(`Lote ${displayId} excluído localmente`, 'success');
        if (window.registrarLog) {
            window.registrarLog('abastecimento', 'EXCLUSÃO', `Excluiu lote de importação ${displayId} (Modo Local). Motivo: ${motivoTxt}`);
        }
    }
};

// Demo Data for local testing
const MOCK_DATA = {
    vehicles: [
        { id: 'v1', placa: 'ABC-1234', modelo: 'Gol G8', marca: 'VW', classificacao: 'PROPRIO' },
        { id: 'v2', placa: 'XYZ-9876', modelo: 'Hilux SRV', marca: 'TOYOTA', classificacao: 'ALUGADO' },
        { id: 'v3', placa: 'KJH-5522', modelo: 'F-4000', marca: 'FORD', classificacao: 'TERCEIRO' },
        { id: 'v4', placa: 'MOT-0001', modelo: 'S10 High Country', marca: 'GM', classificacao: 'DIRETORIA' }
    ],
    drivers: [
        { id: 'd1', nome_completo: 'João Silva de Oliveira' },
        { id: 'd2', nome_completo: 'Maria Santos Ferreira' },
        { id: 'd3', nome_completo: 'Carlos Pereira Souza' }
    ],
    suppliers: [
        { id: 's1', nome: 'Posto Ipiranga Rota 10', categoria: 'POSTO', cidade: 'São Paulo', estado: 'SP' },
        { id: 's2', nome: 'Auto Posto Shell Central', categoria: 'POSTO', cidade: 'Campinas', estado: 'SP' }
    ],
    fuelingRecords: [
        { id: 'f1', veiculo_id: 'v1', data: new Date(Date.now() - 86400000 * 15).toISOString(), km_atual: 10500, litros: 42.5, valor_total: 235.50, posto_id: 's1', tipo_combustivel: 'Gasolina Comum', cidade_posto: 'São Paulo', estado_posto: 'SP', veiculos: {placa: 'ABC-1234', modelo: 'Gol G8', classificacao: 'PROPRIO'}, fornecedores: {nome: 'Posto Ipiranga Rota 10'} },
        { id: 'f2', veiculo_id: 'v1', data: new Date(Date.now() - 86400000 * 7).toISOString(), km_atual: 11200, litros: 45.0, valor_total: 248.85, posto_id: 's2', tipo_combustivel: 'Gasolina Aditivada', cidade_posto: 'Campinas', estado_posto: 'SP', veiculos: {placa: 'ABC-1234', modelo: 'Gol G8', classificacao: 'PROPRIO'}, fornecedores: {nome: 'Auto Posto Shell Central'} },
        { id: 'f3', veiculo_id: 'v2', data: new Date(Date.now() - 86400000 * 10).toISOString(), km_atual: 45200, litros: 75.0, valor_total: 465.00, posto_id: 's1', tipo_combustivel: 'Diesel S10', cidade_posto: 'São Paulo', estado_posto: 'SP', veiculos: {placa: 'XYZ-9876', modelo: 'Hilux SRV', classificacao: 'ALUGADO'}, fornecedores: {nome: 'Posto Ipiranga Rota 10'} }
    ]
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    if (window.supabase && SUPABASE_URL && SUPABASE_KEY) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        updateStatus('Conectado', 'success');
        loadInitialData();
        setupFormListeners();
    } else {
        updateStatus('Modo Demo Local', 'warn');
        loadMockData();
        setupFormListeners();
        console.log('Sistema operando com dados fictícios para teste local.');
    }
});

function loadMockData() {
    // Check if we have modified local data
    const localData = JSON.parse(localStorage.getItem('frotalink_local_mock_data'));
    if (localData) {
        state = { 
            ...state, 
            ...localData,
            sort: localData.sort || state.sort,
            // Garantir que carregamos os alertas ignorados mais recentes, mesmo se o mock estiver desatualizado
            dismissedAlerts: JSON.parse(localStorage.getItem('frotalink_dismissedAlerts') || '[]')
        };
    } else {
        const defaults = JSON.parse(JSON.stringify(MOCK_DATA));
        state = { ...state, ...defaults };
        state.dismissedAlerts = JSON.parse(localStorage.getItem('frotalink_dismissedAlerts') || '[]');
        saveLocalData();
    }
    
    refreshUI();
}

function saveLocalData() {
    localStorage.setItem('frotalink_local_mock_data', JSON.stringify(state));
}

async function saveDismissedAlerts() {
    localStorage.setItem('frotalink_dismissedAlerts', JSON.stringify(state.dismissedAlerts || []));
    
    // Persistir no Supabase se disponível
    if (supabaseClient && state.dismissedAlerts && state.dismissedAlerts.length > 0) {
        try {
            const toSave = state.dismissedAlerts.map(key => ({ alert_key: key }));
            // Usamos upsert para evitar erros de duplicata
            await supabaseClient.from('alertas_fuel_ignorados').upsert(toSave);
        } catch (e) {
            console.warn("Falha ao persistir alertas ignorados no Supabase:", e);
        }
    }
}

function refreshUI() {
    renderFuelTable();
    calculateStats();
    populateDropdowns();
    applyColumnPrefs();
    checkFuelAlerts();
}

function updateStatus(text, type) {
    const statusDiv = document.getElementById('connectionStatus');
    if (!statusDiv) return;
    
    statusDiv.innerHTML = `
        <div class="status-indicator ${type}"></div>
        <span>${text}</span>
    `;
}

async function loadInitialData() {
    if (!supabaseClient) return;
    try {
        console.log('Iniciando carregamento de dados do Supabase...');
        
        // Carregar dados de suporte
        const baseResults = await Promise.all([
            supabaseClient.from('veiculos').select('id, placa, modelo, marca, classificacao, ignorar_media, tipo_combustivel').order('placa'),
            supabaseClient.from('motoristas').select('id, nome_completo'),
            supabaseClient.from('postos').select('*').order('nome'),
            supabaseClient.from('categorias_posto').select('*').order('descricao'),
            supabaseClient.from('tipos_combustivel').select('*').order('descricao'),
        ]);

        state.vehicles = baseResults[0].data || [];
        state.drivers = baseResults[1].data || [];
        state.posts = baseResults[2].data || [];
        state.postCategories = baseResults[3].data || [];
        state.fuelTypes = baseResults[4].data || [];
        
        // Carregar Histórico de Importações
        const { data: impData } = await supabaseClient.from('importacoes_abastecimento').select('*').order('created_at', { ascending: false });
        state.imports = impData || [];
        
        // Carregar alertas ignorados persistidos localmente e no Supabase
        let localDismissed = JSON.parse(localStorage.getItem('frotalink_dismissedAlerts') || '[]');
        try {
            const { data: cloudIgnored } = await supabaseClient.from('alertas_fuel_ignorados').select('alert_key');
            if (cloudIgnored) {
                const cloudKeys = cloudIgnored.map(c => c.alert_key);
                localDismissed = [...new Set([...localDismissed, ...cloudKeys])];
            }
        } catch (e) { console.warn("Erro ao carregar alertas ignorados do Supabase:", e); }
        state.dismissedAlerts = localDismissed;

        // Carregar TODOS os abastecimentos (Bypassing 1000 limit)
        let allAbastecimentos = [];
        let from = 0;
        let to = 999;
        let finished = false;

        while (!finished) {
            const { data, error } = await supabaseClient
                .from('abastecimentos')
                .select('*, veiculos(placa, modelo, classificacao, ignorar_media, tipo_combustivel), motoristas(nome_completo), postos(nome), categorias_posto(descricao)')
                .order('km_atual', { ascending: false })
                .range(from, to);

            if (error) throw error;
            
            if (!data || data.length === 0) {
                finished = true;
            } else {
                allAbastecimentos = allAbastecimentos.concat(data);
                if (data.length < 1000) {
                    finished = true;
                } else {
                    from += 1000;
                    to += 1000;
                }
            }
        }

        console.log(`Total de abastecimentos carregados: ${allAbastecimentos.length}`);
        state.fuelingRecords = allAbastecimentos;

        renderFuelTable();
        calculateStats();
        populateDropdowns();
        renderSetupTables();
        checkFuelAlerts();

    } catch (err) {
        console.error('Falha crítica ao carregar dados:', err);
        showToast('Erro ao carregar dados: ' + err.message, 'error');
    }
}

function populateDropdowns() {
    const vSelects = [
        document.getElementById('fuel_veiculo'), 
        document.getElementById('dash_filter_veiculo')
    ];
    const dSelects = [
        document.getElementById('fuel_motorista'), 
        document.getElementById('dash_filter_motorista')
    ];
    const sFuelSelects = [
        document.getElementById('fuel_posto'),
        document.getElementById('dash_filter_posto')
    ];
    const catSelect = document.getElementById('fuel_posto_categoria');
    const fuelTypeSelect = document.getElementById('fuel_combustivel');

    const vOptions = state.vehicles.map(v => `<option value="${v.id}">${v.placa} - ${v.modelo}</option>`).join('');
    vSelects.forEach(s => {
        if (s) {
            const label = s.id.startsWith('dash') ? 'Todas as Placas' : 'Selecione...';
            s.innerHTML = `<option value="">${label}</option>` + vOptions;
        }
    });

    const dOptions = state.drivers.map(d => `<option value="${d.id}">${d.nome_completo}</option>`).join('');
    dSelects.forEach(s => {
        if (s) {
            const label = s.id.startsWith('dash') ? 'Todos os Condutores' : 'Selecione o motorista...';
            s.innerHTML = `<option value="">${label}</option>` + dOptions;
        }
    });

    const postOptions = state.posts.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');
    sFuelSelects.forEach(s => {
        if (s) {
            const label = s.id.startsWith('dash') ? 'Todos os Postos' : 'Selecione o posto...';
            s.innerHTML = `<option value="">${label}</option>` + postOptions;
        }
    });

    if (catSelect) {
        catSelect.innerHTML = '<option value="">Selecione...</option>' + 
            state.postCategories.map(c => `<option value="${c.id}">${c.descricao}</option>`).join('');
    }

    if (fuelTypeSelect) {
        fuelTypeSelect.innerHTML = '<option value="">Selecione...</option>' + 
            state.fuelTypes.map(f => `<option value="${f.descricao}">${f.descricao}</option>`).join('');
    }

    // New Dashboard Filters
    const dashCatSelect = document.getElementById('dash_filter_categoria');
    if (dashCatSelect) {
        dashCatSelect.innerHTML = '<option value="">Todas as Categorias</option>' +
            state.postCategories.map(c => `<option value="${c.id}">${c.descricao}</option>`).join('');
    }

    const dashModelSelect = document.getElementById('dash_filter_modelo');
    if (dashModelSelect) {
        // Obter modelos únicos (Marca + Modelo)
        const models = [...new Set(state.vehicles.map(v => `${v.marca} ${v.modelo}`.trim()))].sort();
        dashModelSelect.innerHTML = '<option value="">Todos os Modelos</option>' +
            models.map(m => `<option value="${m}">${m}</option>`).join('');
    }

    // New Fuel List Filters (Intelligent)
    const fCatFilter = document.getElementById('fuel_filter_categoria');
    if (fCatFilter) {
        fCatFilter.innerHTML = '<option value="">Todas as Categorias</option>' +
            state.postCategories.map(c => `<option value="${c.id}">${c.descricao}</option>`).join('');
    }

    const fPostFilter = document.getElementById('fuel_filter_posto');
    if (fPostFilter) {
        fPostFilter.innerHTML = '<option value="">Todos os Postos</option>' +
            '<option value="NULL_POSTO">NÃO INFORMADO</option>' +
            state.posts.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');
    }

    const fVehFilter = document.getElementById('fuel_filter_veiculo');
    if (fVehFilter) {
        const sortedVeh = [...state.vehicles].sort((a, b) => a.placa.localeCompare(b.placa));
        fVehFilter.innerHTML = '<option value="">Todas as Placas</option>' +
            sortedVeh.map(v => `<option value="${v.id}">${v.placa}</option>`).join('');
    }

    const fFuelFilter = document.getElementById('fuel_filter_combustivel');
    if (fFuelFilter) {
        fFuelFilter.innerHTML = '<option value="">Todos os Tipos</option>' +
            state.fuelTypes.map(f => `<option value="${f.descricao}">${f.descricao}</option>`).join('');
    }

    // Populate Comparativo Selectors
    if (window.handleCompTipoChange) {
        window.handleCompTipoChange(1, true);
        window.handleCompTipoChange(2, true);
        window.handleCompTipoChange(3, true);
    }
}

// Fuel Handlers
window.handleFuelVehicleChange = async () => {
    const vId = document.getElementById('fuel_veiculo').value;
    const catInput = document.getElementById('fuel_veiculo_categoria');
    if (!vId) {
        catInput.value = '';
        return;
    }

    let vehicle = state.vehicles.find(v => v.id === vId);
    catInput.value = vehicle?.classificacao || 'N/A';
    window.calculateFuelMedia();
};

// Fuel Handlers Moved or Integrated

window.handleFuelPostoChange = () => {
    const pId = document.getElementById('fuel_posto').value;
    if (!pId) {
        document.getElementById('fuel_cidade_posto').value = '';
        document.getElementById('fuel_estado_posto').value = '';
        return;
    }
    const posto = state.posts.find(p => p.id === pId);
    if (posto) {
        document.getElementById('fuel_cidade_posto').value = posto.cidade || '';
        document.getElementById('fuel_estado_posto').value = posto.estado || '';
    }
};

window.calculateFuelPrices = () => {
    const litros = parseFloat(document.getElementById('fuel_litros').value) || 0;
    const total = parseFloat(document.getElementById('fuel_total').value) || 0;
    const unitarioInput = document.getElementById('fuel_unitario');
    
    if (litros > 0 && total > 0) {
        const unitario = total / litros;
        unitarioInput.value = unitario.toFixed(3);
        document.getElementById('fuel_subtotal').value = total.toFixed(2);
    } else {
        unitarioInput.value = '';
    }
};

window.calculateFuelMedia = () => {
    const vId = document.getElementById('fuel_veiculo').value;
    const currentKm = parseFloat(document.getElementById('fuel_km').value) || 0;
    const litros = parseFloat(document.getElementById('fuel_litros').value) || 0;
    const fuelType = document.getElementById('fuel_combustivel')?.value || '';
    const mediaInput = document.getElementById('fuel_media');
    const mediaLabel = document.getElementById('fuel_media_label');

    const unit = getFuelMediaUnit(fuelType);
    if (mediaLabel) {
        mediaLabel.innerText = `Média Calculada (${unit.toUpperCase()})`;
    }

    if (!vId || currentKm <= 0 || litros <= 0) {
        mediaInput.value = '';
        return;
    }

    const prev = state.fuelingRecords
        .filter(r => r.veiculo_id === vId && r.id !== state.editingId)
        .sort((a, b) => b.km_atual - a.km_atual)[0];

    if (prev && currentKm > prev.km_atual) {
        const kmDiff = currentKm - prev.km_atual;
        const media = kmDiff / litros;
        mediaInput.value = media.toFixed(2) + ' ' + unit;
    } else {
        mediaInput.value = '---';
    }
};

function getFilteredRecords() {
    const searchTerm = document.getElementById('fuelSearch')?.value.toLowerCase() || '';
    let filteredRecords = [...state.fuelingRecords];
    
    if (searchTerm) {
        const matchingImportIds = state.imports
            .filter(imp => (imp.display_id || '').toLowerCase().includes(searchTerm))
            .map(imp => imp.id);

        filteredRecords = filteredRecords.filter(f => 
            (f.veiculos?.placa || '').toLowerCase().includes(searchTerm) ||
            (f.veiculo_id || '').toLowerCase().includes(searchTerm) ||
            (f.motoristas?.nome_completo || '').toLowerCase().includes(searchTerm) ||
            (searchTerm.length > 3 && (
                (f.postos?.nome || '').toLowerCase().includes(searchTerm) ||
                (f.cidade_posto || '').toLowerCase().includes(searchTerm)
            )) ||
            (f.tipo_combustivel || '').toLowerCase().includes(searchTerm) ||
            (f.importacao_id || '').toLowerCase().includes(searchTerm) ||
            matchingImportIds.includes(f.importacao_id)
        );
    }

    if (state.activeAlertFilter) {
        // Filtrar apenas pelos alertas ATIVOS (não ignorados)
        const activeAlerts = checkFuelAlerts(false);
        const targetIds = activeAlerts
            .filter(a => a.title === state.activeAlertFilter)
            .map(a => a.id);
        filteredRecords = filteredRecords.filter(f => targetIds.includes(f.id));
    }

    // Intelligent Fuel Filters
    const ff = state.fuelFilters;
    if (ff.categoria) {
        filteredRecords = filteredRecords.filter(f => f.categoria_id === ff.categoria);
    }
    if (ff.posto) {
        if (ff.posto === 'NULL_POSTO') {
            filteredRecords = filteredRecords.filter(f => !f.posto_id);
        } else {
            filteredRecords = filteredRecords.filter(f => f.posto_id === ff.posto);
        }
    }
    if (ff.veiculo) {
        filteredRecords = filteredRecords.filter(f => f.veiculo_id === ff.veiculo);
    }
    if (ff.combustivel) {
        filteredRecords = filteredRecords.filter(f => (f.tipo_combustivel || '').toLowerCase() === ff.combustivel.toLowerCase());
    }
    if (ff.importacao_id) {
        filteredRecords = filteredRecords.filter(f => f.importacao_id === ff.importacao_id);
    }

    // Date Period Filtering
    if (ff.data_inicio || ff.data_fim) {
        const start = ff.data_inicio ? new Date(ff.data_inicio + 'T00:00:00') : null;
        const end = ff.data_fim ? new Date(ff.data_fim + 'T23:59:59') : null;
        
        filteredRecords = filteredRecords.filter(f => {
            const d = smartParseDate(f.data, f.horario);
            if (start && d < start) return false;
            if (end && d > end) return false;
            return true;
        });
    }

    return filteredRecords;
}

window.handleIntelligentFilter = (origin) => {
    // 1. Capture current values
    const catEl = document.getElementById('fuel_filter_categoria');
    const postEl = document.getElementById('fuel_filter_posto');
    const vehEl = document.getElementById('fuel_filter_veiculo');

    if (!catEl || !postEl || !vehEl) return;

    state.fuelFilters.categoria = catEl.value;
    state.fuelFilters.posto = postEl.value;
    state.fuelFilters.veiculo = vehEl.value;
    state.fuelFilters.combustivel = document.getElementById('fuel_filter_combustivel')?.value || '';

    const ff = state.fuelFilters;
    console.log('Filtro inteligente acionado:', { origin, filters: ff });

    // 2. Dynamic Update of other dropdowns based on logic
    // If Category changed, we MUST restrict Posto options
    if (origin === 'categoria') {
        const ff = state.fuelFilters;
        
        // Logica mais robusta:
        // 1. Postos que tem essa categoria_id explicitamente no cadastro
        const postsByMetadata = ff.categoria 
            ? state.posts.filter(p => String(p.categoria_id || '') === String(ff.categoria))
            : state.posts;

        // 2. Postos que ja foram usados com essa categoria no historico de abastecimentos
        const postIdsFromHistory = ff.categoria
            ? [...new Set(state.fuelingRecords
                .filter(r => String(r.categoria_id || '') === String(ff.categoria))
                .map(r => r.posto_id))]
            : [];
        
        const postsByHistory = state.posts.filter(p => postIdsFromHistory.includes(p.id));

        // Unir as duas listas e remover duplicados
        const combined = [...new Set([...postsByMetadata, ...postsByHistory])];
        const filteredPosts = combined.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
        
        const currentPosto = postEl.value;
        postEl.innerHTML = '<option value="">Todos os Postos</option>' + 
            '<option value="NULL_POSTO" ' + (currentPosto === 'NULL_POSTO' ? 'selected' : '') + '>NÃO INFORMADO</option>' +
            filteredPosts.map(p => `<option value="${p.id}" ${String(p.id) === String(currentPosto) ? 'selected' : ''}>${p.nome}</option>`).join('');
        
        // Se o posto que estava selecionado não existe na nova lista, reseta ele no state
        if (ff.posto && !filteredPosts.find(p => String(p.id) === String(ff.posto))) {
            state.fuelFilters.posto = '';
        }
    }

    // Limpar filtro de importação ao interagir com outros filtros manuais
    if (origin !== 'importacao') {
        state.fuelFilters.importacao_id = '';
    }

    // Dynamic Update of Vehicle dropdown (Always update when Category or Posto changes)
    if (origin === 'categoria' || origin === 'posto') {
        const ff = state.fuelFilters;
        
        // Filtrar veículos com base no histórico que batem com Categoria e Posto
        let filteredVehicles = state.vehicles;
        
        if (ff.categoria || ff.posto) {
            const matchingRecords = state.fuelingRecords.filter(r => {
                if (ff.categoria && String(r.categoria_id || '') !== String(ff.categoria)) return false;
                if (ff.posto && String(r.posto_id || '') !== String(ff.posto)) return false;
                return true;
            });
            
            const vehicleIdsFromRecords = [...new Set(matchingRecords.map(r => r.veiculo_id))];
            filteredVehicles = state.vehicles.filter(v => vehicleIdsFromRecords.includes(v.id));
        }

        const sortedVehicles = filteredVehicles.sort((a, b) => (a.placa || '').localeCompare(b.placa || ''));
        const currentVeh = vehEl.value;
        
        vehEl.innerHTML = '<option value="">Todas as Placas</option>' + 
            sortedVehicles.map(v => `<option value="${v.id}" ${String(v.id) === String(currentVeh) ? 'selected' : ''}>${v.placa}</option>`).join('');
        
        // Se o veículo que estava selecionado não existe na nova lista, reseta ele no state
        if (ff.veiculo && !sortedVehicles.find(v => String(v.id) === String(ff.veiculo))) {
            console.log('Veículo selecionado anteriormente não possui registros para os novos filtros. Resetando.');
            state.fuelFilters.veiculo = '';
        }
    }

    // 3. Reset pagination and render
    state.currentPage = 1;
    renderFuelTable();
};

window.clearFuelFilters = () => {
    state.fuelFilters = { 
        categoria: '', 
        posto: '', 
        veiculo: '', 
        combustivel: '', 
        importacao_id: '',
        periodo: 'all',
        data_inicio: null,
        data_fim: null
    };
    
    // Reset search if any
    const search = document.getElementById('fuelSearch');
    if (search) search.value = '';
    
    // Reset dropdowns
    if (document.getElementById('fuel_filter_categoria')) document.getElementById('fuel_filter_categoria').value = '';
    if (document.getElementById('fuel_filter_posto')) document.getElementById('fuel_filter_posto').value = '';
    if (document.getElementById('fuel_filter_veiculo')) document.getElementById('fuel_filter_veiculo').value = '';
    if (document.getElementById('fuel_filter_combustivel')) document.getElementById('fuel_filter_combustivel').value = '';
    if (document.getElementById('fuel_filter_periodo')) document.getElementById('fuel_filter_periodo').value = 'all';
    
    const customRange = document.getElementById('custom_date_range');
    if (customRange) customRange.style.display = 'none';
    
    // Repopulate dropdowns to full lists
    const postoSel = document.getElementById('fuel_filter_posto');
    if (postoSel) {
        postoSel.innerHTML = '<option value="">Todos os Postos</option>' + 
            state.posts.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');
    }
    
    const vehSel = document.getElementById('fuel_filter_veiculo');
    if (vehSel) {
        const sortedVeh = [...state.vehicles].sort((a, b) => (a.placa || '').localeCompare(b.placa || ''));
        vehSel.innerHTML = '<option value="">Todas as Placas</option>' + 
            sortedVeh.map(v => `<option value="${v.id}">${v.placa}</option>`).join('');
    }
    
    state.currentPage = 1;
    renderFuelTable();
};

window.handlePeriodChange = (period) => {
    state.fuelFilters.periodo = period;
    const customRange = document.getElementById('custom_date_range');
    
    if (period === 'custom') {
        if (customRange) customRange.style.display = 'flex';
        return; // Don't render until dates are picked
    } else {
        if (customRange) customRange.style.display = 'none';
    }

    let start = null;
    let end = new Date();

    if (period === '7') {
        start = new Date();
        start.setDate(end.getDate() - 7);
    } else if (period === '15') {
        start = new Date();
        start.setDate(end.getDate() - 15);
    } else if (period === '30') {
        start = new Date();
        start.setDate(end.getDate() - 30);
    } else if (period === 'last_month') {
        const now = new Date();
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0);
    }

    state.fuelFilters.data_inicio = start ? start.toISOString().split('T')[0] : null;
    state.fuelFilters.data_fim = end ? end.toISOString().split('T')[0] : null;

    state.currentPage = 1;
    renderFuelTable();
};

window.handleDateChange = () => {
    state.fuelFilters.data_inicio = document.getElementById('fuel_filter_start').value;
    state.fuelFilters.data_fim = document.getElementById('fuel_filter_end').value;
    state.currentPage = 1;
    renderFuelTable();
};

function renderFuelTable() {
    const tbody = document.getElementById('fuelList');
    if (!tbody) return;

    const activeAlerts = checkFuelAlerts(false);

    const searchTerm = document.getElementById('fuelSearch')?.value.toLowerCase() || '';
    
    // Toggle clear button visibility
    const btnClear = document.getElementById('clearFuelSearch');
    if (btnClear) btnClear.style.display = searchTerm ? 'flex' : 'none';

    let filteredRecords = getFilteredRecords();

    // Sync search state for pagination reset
    if (searchTerm) {
        if (state.lastSearch !== searchTerm) {
            state.currentPage = 1;
            state.lastSearch = searchTerm;
        }
    } else {
        state.lastSearch = '';
    }

    // Sync alert filter state for pagination reset
    if (state.activeAlertFilter) {
        if (state.lastAlertFilter !== state.activeAlertFilter) {
            state.currentPage = 1;
            state.lastAlertFilter = state.activeAlertFilter;
        }
    } else {
        state.lastAlertFilter = null;
    }

    const sort = state.sort?.fuel || { col: 'data', dir: 'desc' };
    filteredRecords.sort((a, b) => {
        let valA, valB;
        if (sort.col === 'data') {
            valA = smartParseDate(a.data, a.horario).getTime();
            valB = smartParseDate(b.data, b.horario).getTime();
        } else if (sort.col === 'veiculo') {
            valA = (a.veiculos?.placa || '').toLowerCase();
            valB = (b.veiculos?.placa || '').toLowerCase();
        } else if (sort.col === 'km') {
            valA = parseFloat(a.km_atual) || 0;
            valB = parseFloat(b.km_atual) || 0;
        } else if (sort.col === 'litros') {
            valA = parseFloat(a.litros) || 0;
            valB = parseFloat(b.litros) || 0;
        } else if (sort.col === 'valor') {
            valA = parseFloat(a.valor_total) || 0;
            valB = parseFloat(b.valor_total) || 0;
        } else if (sort.col === 'rodado') {
            const prevA = state.fuelingRecords
                .filter(r => r.veiculo_id === a.veiculo_id && r.id !== a.id)
                .sort((x, y) => smartParseDate(y.data, y.horario) - smartParseDate(x.data, x.horario))
                .find(r => smartParseDate(r.data, r.horario) < smartParseDate(a.data, a.horario));
            const prevB = state.fuelingRecords
                .filter(r => r.veiculo_id === b.veiculo_id && r.id !== b.id)
                .sort((x, y) => smartParseDate(y.data, y.horario) - smartParseDate(x.data, x.horario))
                .find(r => smartParseDate(r.data, r.horario) < smartParseDate(b.data, b.horario));
            
            valA = prevA ? (a.km_atual - prevA.km_atual) : 0;
            valB = prevB ? (b.km_atual - prevB.km_atual) : 0;
        } else {
            valA = String(a[sort.col] || '').toLowerCase();
            valB = String(b[sort.col] || '').toLowerCase();
        }

        if (valA < valB) return sort.dir === 'asc' ? -1 : 1;
        if (valA > valB) return sort.dir === 'asc' ? 1 : -1;
        return 0;
    });

    updateSortIcons('fuel');

    // --- Pagination Logic ---
    const totalRecords = filteredRecords.length;
    const totalPages = Math.ceil(totalRecords / state.pageSize) || 1;
    if (state.currentPage > totalPages) state.currentPage = totalPages;
    
    const startIdx = (state.currentPage - 1) * state.pageSize;
    const endIdx = startIdx + state.pageSize;
    const pageRecords = filteredRecords.slice(startIdx, endIdx);
    
    updatePaginationUI(totalRecords, startIdx, endIdx);

    // Reset bulk selection UI on render
    const selectAllCb = document.getElementById('selectAllFuel');
    if (selectAllCb) selectAllCb.checked = false;
    const btnBulk = document.getElementById('btnBulkDelete');
    if (btnBulk) btnBulk.style.display = 'none';

    tbody.innerHTML = pageRecords.map((f, index) => {
        const fDate = smartParseDate(f.data, f.horario);
        const previousRecord = state.fuelingRecords
            .filter(r => r.veiculo_id === f.veiculo_id && r.id !== f.id)
            .sort((a, b) => smartParseDate(b.data, b.horario) - smartParseDate(a.data, a.horario))
            .find(r => smartParseDate(r.data, r.horario) < fDate);
            
        // Buscar display_id da importação
        const importRecord = state.imports.find(i => i.id === f.importacao_id);
        const importDisplayId = importRecord ? importRecord.display_id : null;

        let avgValue = 0;

        let avg = '---';
        if (previousRecord) {
            const kmDiff = f.km_atual - previousRecord.km_atual;
            if (kmDiff > 0 && f.litros > 0) {
                avgValue = kmDiff / f.litros;
                avg = avgValue.toFixed(2) + ' ' + getFuelMediaUnit(f.tipo_combustivel);
            }
        }

        const isOutlier = avgValue > 0 && (avgValue < 8 || avgValue > 18);
        
        const unitVal = parseFloat(f.valor_unitario) || (f.litros > 0 ? (parseFloat(f.valor_total) / parseFloat(f.litros)) : 0);

        const recordAlerts = activeAlerts.filter(a => a.id === f.id);
        let alertIconHtml = '';
        if (recordAlerts.length > 0) {
            let severityColor = '#3b82f6';
            let iconName = 'info';
            let tooltipText = recordAlerts.map(a => a.title.replace(/[^\w\s\(\)\[\]\u00C0-\u00FF]/g, '').trim()).join(', ');
            
            if (recordAlerts.some(a => a.type === 'danger')) {
                severityColor = '#ef4444';
                iconName = 'alert-triangle';
            } else if (recordAlerts.some(a => a.type === 'warning')) {
                severityColor = '#f59e0b';
                iconName = 'alert-circle';
            }
            
            alertIconHtml = `
                <span class="row-alert-icon" title="${tooltipText}" style="color: ${severityColor}; display: inline-flex; align-items: center; margin-right: 0.35rem; cursor: help;" onclick="event.stopPropagation(); toggleFuelNotiPanel();">
                    <i data-lucide="${iconName}" style="width: 15px; height: 15px; stroke-width: 2.5;"></i>
                </span>
            `;
        }

        return `
            <tr>
                <td style="text-align: center;">
                    <input type="checkbox" class="fuel-checkbox" value="${f.id}" onchange="updateSelectedUI()">
                </td>
                <td data-label="Data / Hora" data-column="data">
                    <div style="font-weight: 600; display: flex; align-items: center; gap: 0.25rem;">
                        ${alertIconHtml}
                        ${fDate.toLocaleDateString('pt-BR')}
                    </div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">${formatTime24h(f.data, f.horario)}</div>
                </td>
                <td data-label="Veículo / Cat." data-column="veiculo">
                    <div style="font-weight: 700; cursor: pointer; color: var(--primary-light); text-decoration: underline; text-underline-offset: 2px;" onclick="filterByPlate('${f.veiculos?.placa || ''}')" title="Filtrar este veículo">
                        ${f.veiculos?.placa || '---'}
                    </div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">${f.veiculos?.modelo || ''}</div>
                    <div style="font-size: 0.7rem; color: #818cf8; font-weight: 600; margin-top: 4px; display: flex; align-items: center; gap: 4px;">
                        <i data-lucide="user" style="width: 12px; height: 12px;"></i>
                        ${f.motoristas?.nome_completo || 'NÃO INFORMADO'}
                    </div>
                    <span class="type-badge" style="background: rgba(99, 102, 241, 0.1); color: var(--primary); font-size: 0.65rem; border: none; margin-top: 4px;">${f.veiculos?.classificacao || '---'}</span>
                </td>
                <td data-label="KM Atual" data-column="km" class="${state.highlightId === f.id && state.highlightField === 'km' ? 'highlight-alert' : ''}">${f.km_atual.toLocaleString('pt-BR')} km</td>
                <td data-label="KM Rodado" data-column="rodado" style="font-weight: 600; color: ${previousRecord && (f.km_atual - previousRecord.km_atual) < 0 ? '#ef4444' : 'inherit'};">
                    ${previousRecord ? (f.km_atual - previousRecord.km_atual).toLocaleString('pt-BR') + ' km' : '---'}
                </td>
                <td data-label="Quantidade" data-column="litros">${f.litros.toLocaleString('pt-BR')} ${getFuelUnit(f.tipo_combustivel)}</td>
                <td data-label="Combustível" data-column="combustivel"><div style="font-size: 0.8rem; font-weight: 600;">${f.tipo_combustivel || '---'}</div></td>
                <td data-label="Média" data-column="media" style="color: ${isOutlier ? '#f59e0b' : 'var(--primary)'}; font-weight: 700;" class="${state.highlightId === f.id && state.highlightField === 'media' ? 'highlight-alert' : ''}">${avg}</td>
                <td data-label="Valor Total" data-column="valor" style="font-weight: 600;" class="${state.highlightId === f.id && state.highlightField === 'valor' ? 'highlight-alert' : ''}">
                    <div>${f.valor_total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                    <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 4px; font-weight: normal;">
                        ${unitVal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 3 })} / ${getFuelUnit(f.tipo_combustivel)}
                    </div>
                </td>
                <td data-label="Posto / Local" data-column="posto">
                    <div style="font-weight: 600; font-size: 0.85rem;">${f.postos?.nome || 'Não inf.' }</div>
                    <div style="font-size: 0.7rem; color: var(--text-muted);">${f.cidade_posto || ''} ${f.estado_posto ? '- '+f.estado_posto : ''}</div>
                    <div style="margin-top: 4px; display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">
                        <span class="type-badge" style="background: rgba(255,255,255,0.03); color: var(--text-muted); border: 1px solid rgba(255,255,255,0.08); font-size: 0.6rem; padding: 0.1rem 0.4rem;">
                            ${f.categorias_posto?.descricao || 'N/I'}
                        </span>
                        ${importDisplayId ? `
                            <span class="type-badge" style="background: rgba(99, 102, 241, 0.15); color: #818cf8; border: 1px solid rgba(99, 102, 241, 0.2); font-size: 0.6rem; padding: 0.1rem 0.4rem; font-weight: 600;">
                                ${importDisplayId}
                            </span>
                        ` : ''}
                    </div>
                </td>

                <td data-label="Ações" class="actions-cell" style="vertical-align: middle;">
                    <div style="display: flex; gap: 0.5rem; align-items: center; justify-content: center; height: 100%;">
                        <button class="btn-action edit" onclick="openFuelModal('${f.id}')" title="Editar" data-perm="abastecimento_lancamentos:edit">
                            <i data-lucide="edit-3" style="width: 16px;"></i>
                        </button>
                        <button class="btn-action delete" onclick="deleteRecord('abastecimentos', '${f.id}')" title="Excluir" data-perm="abastecimento_lancamentos:delete">
                            <i data-lucide="circle-x" style="width: 16px;"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
    
    if (window.lucide) lucide.createIcons();
    calculateStats(filteredRecords);
}

function calculateStats(filteredRecords = null) {
    const visibleRecords = filteredRecords || state.fuelingRecords;

    // 1. Gasto (Seleção)
    const selectionFuelCost = visibleRecords.reduce((acc, curr) => acc + (parseFloat(curr.valor_total) || 0), 0);
    const costElement = document.getElementById('selectionFuelCost');
    if (costElement) {
        costElement.innerText = selectionFuelCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    // 2. Média (Seleção)
    const calcAvg = (records) => {
        let sumAverages = 0;
        let validEntriesCount = 0;
        
        const vehicleGroups = {};
        records.forEach(r => {
            if (!vehicleGroups[r.veiculo_id]) vehicleGroups[r.veiculo_id] = [];
            vehicleGroups[r.veiculo_id].push(r);
        });

        for (const vid in vehicleGroups) {
            const group = vehicleGroups[vid].sort((a, b) => smartParseDate(a.data, a.horario) - smartParseDate(b.data, b.horario));
            
            // Check if vehicle is ignored
            const vehicle = state.vehicles.find(v => v.id === vid);
            const isIgnored = vehicle?.ignorar_media || group[0]?.veiculos?.ignorar_media;
            if (isIgnored) continue;

            group.forEach((curr, idx) => {
                const prev = group[idx - 1];
                if (prev) {
                    const diff = parseFloat(curr.km_atual) - parseFloat(prev.km_atual);
                    const litros = parseFloat(curr.litros) || 0;
                    
                    if (diff > 0 && litros > 0) {
                        const entryAvg = diff / litros;
                        
                        const vehicleFuel = (curr.veiculos?.tipo_combustivel || '').trim().toLowerCase();
                        const entryFuel = (curr.tipo_combustivel || '').trim().toLowerCase();
                        
                        if (vehicleFuel && entryFuel === vehicleFuel) {
                            sumAverages += entryAvg;
                            validEntriesCount++;
                        }
                    }
                }
            });
        }
        return validEntriesCount > 0 ? (sumAverages / validEntriesCount).toFixed(2) : '---';
    };

    const selectionAvg = calcAvg(visibleRecords);
    const selectionElement = document.getElementById('selectionAverage');
    if (selectionElement) selectionElement.innerText = selectionAvg + ' km/l';

    // 3. Total de Registros (Seleção)
    const totalCountElement = document.getElementById('totalRecordsCount');
    if (totalCountElement) totalCountElement.innerText = visibleRecords.length;
}

function setupFormListeners() {
    const fuelForm = document.getElementById('fuelForm');

    if (fuelForm) {
        fuelForm.onsubmit = async (e) => {
            e.preventDefault();
            const isEditing = !!state.editingId;
            if (isEditing) {
                if (!canDo('abastecimento_lancamentos', 'edit')) {
                    alert('Você não tem permissão para editar abastecimentos.');
                    return;
                }
            } else {
                if (!canDo('abastecimento_lancamentos', 'add')) {
                    alert('Você não tem permissão para registrar abastecimentos.');
                    return;
                }
            }
            const existing = isEditing ? state.fuelingRecords.find(r => r.id === state.editingId) : null;
            
            let motivoAlteracao = "";
            if (isEditing) {
                const motivo = prompt("Por favor, informe o motivo da alteração deste registro de abastecimento:");
                if (motivo === null) return; // Cancelado
                if (motivo.trim() === "") {
                    alert("O motivo da alteração é obrigatório para auditoria!");
                    return;
                }
                motivoAlteracao = motivo.trim();
            }
            
            const data = {
                id: isEditing ? state.editingId : crypto.randomUUID ? crypto.randomUUID() : generateUUID(),
                veiculo_id: document.getElementById('fuel_veiculo').value,
                data: document.getElementById('fuel_data').value,
                horario: document.getElementById('fuel_horario').value,
                motorista_id: document.getElementById('fuel_motorista').value || null,
                km_atual: cleanNumber(document.getElementById('fuel_km').value),
                litros: cleanNumber(document.getElementById('fuel_litros').value),
                valor_unitario: cleanNumber(document.getElementById('fuel_unitario').value),
                valor_subtotal: cleanNumber(document.getElementById('fuel_subtotal').value),
                valor_desconto: cleanNumber(document.getElementById('fuel_desconto').value) || 0,
                valor_total: cleanNumber(document.getElementById('fuel_total').value),
                posto_id: document.getElementById('fuel_posto').value || null,
                categoria_id: document.getElementById('fuel_posto_categoria').value || null,
                tipo_combustivel: document.getElementById('fuel_combustivel').value || '',
                observacoes: document.getElementById('fuel_obs')?.value || '',
                importacao_id: existing ? existing.importacao_id : null
            };

            // Validação manual extra
            const requiredFields = [
                { id: 'fuel_veiculo', label: 'Veículo' },
                { id: 'fuel_data', label: 'Data' },
                { id: 'fuel_horario', label: 'Horário' },
                { id: 'fuel_motorista', label: 'Motorista' },
                { id: 'fuel_posto', label: 'Posto' },
                { id: 'fuel_cidade_posto', label: 'Cidade do Posto' },
                { id: 'fuel_estado_posto', label: 'Estado (UF)' },
                { id: 'fuel_posto_categoria', label: 'Categoria do Posto' },
                { id: 'fuel_combustivel', label: 'Tipo de Combustível' },
                { id: 'fuel_km', label: 'KM Atual' },
                { id: 'fuel_litros', label: 'Quantidade' },
                { id: 'fuel_total', label: 'Valor Total' }
            ];

            for (const field of requiredFields) {
                const val = document.getElementById(field.id).value;
                if (!val || val.trim() === '') {
                    showToast(`O campo "${field.label}" é obrigatório.`, 'error');
                    document.getElementById(field.id).focus();
                    return;
                }
            }


            if (supabaseClient) {
                const { error } = isEditing 
                    ? await supabaseClient.from('abastecimentos').update(data).eq('id', data.id)
                    : await supabaseClient.from('abastecimentos').insert([data]);
                
                if (error) {
                    showToast('Erro ao salvar no Supabase: ' + error.message, 'error');
                    return;
                }
                await loadInitialData();
            } else {
                const veiculo = state.vehicles.find(v => v.id === data.veiculo_id);
                const motorista = state.drivers.find(d => d.id === data.motorista_id);
                const posto = state.posts.find(p => p.id === data.posto_id);
                const categoria = state.postCategories.find(c => c.id === data.categoria_id);
                
                const richData = {
                    ...data,
                    veiculos: veiculo ? { placa: veiculo.placa, modelo: veiculo.modelo, classificacao: veiculo.classificacao } : null,
                    motoristas: motorista ? { nome_completo: motorista.nome_completo } : null,
                    postos: posto ? { nome: posto.nome } : null,
                    categorias_posto: categoria ? { descricao: categoria.descricao } : null
                };
                
                if (isEditing) {
                    const idx = state.fuelingRecords.findIndex(r => r.id === data.id);
                    if (idx !== -1) state.fuelingRecords[idx] = richData;
                } else {
                    state.fuelingRecords.unshift(richData);
                }
                saveLocalData();
                refreshUI();
            }

            showToast(isEditing ? 'Abastecimento atualizado!' : 'Abastecimento registrado!', 'success');
            
            if (window.registrarLog) {
                const vObj = state.vehicles.find(v => v.id === data.veiculo_id);
                const placaStr = vObj ? vObj.placa : (data.veiculo_id || '');
                const acao = isEditing ? 'ALTERAÇÃO' : 'INCLUSÃO';
                
                let changes = [];
                if (isEditing && existing) {
                    if (existing.veiculo_id !== data.veiculo_id) {
                        const oldV = state.vehicles.find(v => v.id === existing.veiculo_id)?.placa || existing.veiculo_id;
                        const newV = state.vehicles.find(v => v.id === data.veiculo_id)?.placa || data.veiculo_id;
                        changes.push(`Veículo de "${oldV}" para "${newV}"`);
                    }
                    if (existing.data !== data.data) {
                        changes.push(`Data de "${existing.data}" para "${data.data}"`);
                    }
                    if (existing.horario !== data.horario) {
                        changes.push(`Horário de "${existing.horario}" para "${data.horario}"`);
                    }
                    if (existing.motorista_id !== data.motorista_id) {
                        const oldM = state.drivers.find(d => d.id === existing.motorista_id)?.nome_completo || 'Nenhum';
                        const newM = state.drivers.find(d => d.id === data.motorista_id)?.nome_completo || 'Nenhum';
                        changes.push(`Motorista de "${oldM}" para "${newM}"`);
                    }
                    if (cleanNumber(existing.km_atual) !== cleanNumber(data.km_atual)) {
                        changes.push(`KM de ${existing.km_atual} para ${data.km_atual}`);
                    }
                    if (cleanNumber(existing.litros) !== cleanNumber(data.litros)) {
                        changes.push(`Litros de ${existing.litros} para ${data.litros}`);
                    }
                    if (cleanNumber(existing.valor_unitario) !== cleanNumber(data.valor_unitario)) {
                        changes.push(`Valor Unitário de R$ ${existing.valor_unitario} para R$ ${data.valor_unitario}`);
                    }
                    if (cleanNumber(existing.valor_total) !== cleanNumber(data.valor_total)) {
                        changes.push(`Valor Total de R$ ${existing.valor_total} para R$ ${data.valor_total}`);
                    }
                    if (existing.posto_id !== data.posto_id) {
                        const oldP = state.posts.find(p => p.id === existing.posto_id)?.nome || 'Nenhum';
                        const newP = state.posts.find(p => p.id === data.posto_id)?.nome || 'Nenhum';
                        changes.push(`Posto de "${oldP}" para "${newP}"`);
                    }
                    if (existing.tipo_combustivel !== data.tipo_combustivel) {
                        changes.push(`Combustível de "${existing.tipo_combustivel}" para "${data.tipo_combustivel}"`);
                    }
                }

                const formatarDataBR = (d) => {
                    if (!d) return '';
                    const pts = d.split('-');
                    return pts.length === 3 ? `${pts[2]}/${pts[1]}/${pts[0]}` : d;
                };
                const dataBR = formatarDataBR(data.data);
                const horarioBR = data.horario || '';

                let descricao = '';
                if (isEditing) {
                    const changesStr = changes.length > 0 ? `Alterações: ${changes.join(', ')}` : 'Sem alterações.';
                    descricao = `DETALHE: Alterou abastecimento do veículo ${placaStr} na data ${dataBR} às ${horarioBR} no valor de R$ ${data.valor_total} | ALTERACAO: ${changesStr} | MOTIVO: ${motivoAlteracao}`;
                } else {
                    descricao = `DETALHE: Registrou novo abastecimento do veículo ${placaStr} na data ${dataBR} às ${horarioBR} no valor de R$ ${data.valor_total}`;
                }

                window.registrarLog('abastecimento', acao, descricao);
            }

            fuelForm.reset();
            document.getElementById('modalFuel').classList.remove('active');
            state.editingId = null;
        };
    }

    const postForm = document.getElementById('postForm');
    if (postForm) postForm.onsubmit = (e) => handleSetupSubmit(e, 'postos', 'modalPost');

    const categoryForm = document.getElementById('categoryForm');
    if (categoryForm) categoryForm.onsubmit = (e) => handleSetupSubmit(e, 'categorias_posto', 'modalCategory');

    const fuelTypeForm = document.getElementById('fuelTypeForm');
    if (fuelTypeForm) fuelTypeForm.onsubmit = (e) => handleSetupSubmit(e, 'tipos_combustivel', 'modalFuelType');
}

// Setup Management Logic
window.renderSetupTables = () => {
    const postsList = document.getElementById('setup_posts_list');
    const categoriesList = document.getElementById('setup_categories_list');
    const fuelTypesList = document.getElementById('setup_fuelTypes_list');

    if (postsList) {
        postsList.innerHTML = state.posts.map(p => `
            <tr>
                <td style="font-weight: 600;">${p.nome}</td>
                <td>${p.cidade || '---'}</td>
                <td>${p.estado || '---'}</td>
                <td style="text-align: right;">
                    <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                        <button class="btn-action edit" onclick="openPostModal('${p.id}')" data-perm="abastecimento_postos:edit"><i data-lucide="edit-3" style="width: 14px;"></i></button>
                        <button class="btn-action delete" onclick="deleteSetupRecord('postos', '${p.id}')" data-perm="abastecimento_postos:delete"><i data-lucide="trash-2" style="width: 14px;"></i></button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    if (categoriesList) {
        categoriesList.innerHTML = state.postCategories.map(c => `
            <tr>
                <td style="font-weight: 600;">${c.descricao}</td>
                <td style="text-align: right;">
                    <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                        <button class="btn-action edit" onclick="openCategoryModal('${c.id}')" data-perm="abastecimento_postos:edit"><i data-lucide="edit-3" style="width: 14px;"></i></button>
                        <button class="btn-action delete" onclick="deleteSetupRecord('categorias_posto', '${c.id}')" data-perm="abastecimento_postos:delete"><i data-lucide="trash-2" style="width: 14px;"></i></button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    if (fuelTypesList) {
        fuelTypesList.innerHTML = state.fuelTypes.map(f => `
            <tr>
                <td style="font-weight: 600;">${f.descricao}</td>
                <td>${f.unidade || 'L'}</td>
                <td style="text-align: right;">
                    <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                        <button class="btn-action edit" onclick="openFuelTypeModal('${f.id}')" data-perm="abastecimento_postos:edit"><i data-lucide="edit-3" style="width: 14px;"></i></button>
                        <button class="btn-action delete" onclick="deleteSetupRecord('tipos_combustivel', '${f.id}')" data-perm="abastecimento_postos:delete"><i data-lucide="trash-2" style="width: 14px;"></i></button>
                    </div>
                </td>
            </tr>
        `).join('');
    }
    
    if (window.lucide) lucide.createIcons();
};

window.openPostModal = (id = null) => {
    if (!canDo('abastecimento_postos', id ? 'edit' : 'add')) {
        alert(`Você não tem permissão para ${id ? 'editar' : 'cadastrar'} postos.`);
        return;
    }
    const form = document.getElementById('postForm');
    form.reset();
    document.getElementById('post_id').value = id || '';
    document.getElementById('postModalTitle').innerText = id ? 'Editar Posto' : 'Cadastrar Posto';
    
    if (id) {
        const p = state.posts.find(x => x.id === id);
        if (p) {
            document.getElementById('post_nome').value = p.nome;
            document.getElementById('post_cidade').value = p.cidade || '';
            document.getElementById('post_estado').value = p.estado || '';
        }
    }
    document.getElementById('modalPost').classList.add('active');
};

window.openCategoryModal = (id = null) => {
    if (!canDo('abastecimento_postos', id ? 'edit' : 'add')) {
        alert(`Você não tem permissão para ${id ? 'editar' : 'cadastrar'} categorias.`);
        return;
    }
    const form = document.getElementById('categoryForm');
    form.reset();
    document.getElementById('category_id').value = id || '';
    document.getElementById('categoryModalTitle').innerText = id ? 'Editar Categoria' : 'Cadastrar Categoria';
    
    if (id) {
        const c = state.postCategories.find(x => x.id === id);
        if (c) document.getElementById('category_desc').value = c.descricao;
    }
    document.getElementById('modalCategory').classList.add('active');
};

window.openFuelTypeModal = (id = null) => {
    if (!canDo('abastecimento_postos', id ? 'edit' : 'add')) {
        alert(`Você não tem permissão para ${id ? 'editar' : 'cadastrar'} tipos de combustível.`);
        return;
    }
    const form = document.getElementById('fuelTypeForm');
    form.reset();
    document.getElementById('fuelType_id').value = id || '';
    document.getElementById('fuelTypeModalTitle').innerText = id ? 'Editar Tipo de Combustível' : 'Cadastrar Tipo de Combustível';
    
    if (id) {
        const f = state.fuelTypes.find(x => x.id === id);
        if (f) {
            document.getElementById('fuelType_desc').value = f.descricao;
            document.getElementById('fuelType_unit').value = f.unidade || 'L';
        }
    }
    document.getElementById('modalFuelType').classList.add('active');
};

async function handleSetupSubmit(e, table, modalId) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);
    const id = formData.get('id');
    const isEditing = !!id;

    if (!canDo('abastecimento_postos', isEditing ? 'edit' : 'add')) {
        alert(`Você não tem permissão para ${isEditing ? 'editar' : 'cadastrar'} neste painel.`);
        return;
    }

    let data = {};
    if (table === 'postos') {
        data = { nome: document.getElementById('post_nome').value, cidade: document.getElementById('post_cidade').value, estado: document.getElementById('post_estado').value };
    } else if (table === 'categorias_posto') {
        data = { descricao: document.getElementById('category_desc').value };
    } else if (table === 'tipos_combustivel') {
        data = { descricao: document.getElementById('fuelType_desc').value, unidade: document.getElementById('fuelType_unit').value };
    }

    if (supabaseClient) {
        const { error } = isEditing 
            ? await supabaseClient.from(table).update(data).eq('id', id)
            : await supabaseClient.from(table).insert([data]);
        
        if (error) {
            showToast('Erro: ' + error.message, 'error');
            return;
        }
        await loadInitialData();
    } else {
        // Local Mode
        const newItem = { id: id || crypto.randomUUID ? crypto.randomUUID() : generateUUID(), ...data };
        const listName = table === 'postos' ? 'posts' : (table === 'categorias_posto' ? 'postCategories' : 'fuelTypes');
        
        if (isEditing) {
            const idx = state[listName].findIndex(x => x.id === id);
            if (idx !== -1) state[listName][idx] = newItem;
        } else {
            state[listName].push(newItem);
        }
        saveLocalData();
        refreshUI();
    }

    showToast('Cadastro salvo com sucesso!', 'success');
    document.getElementById(modalId).classList.remove('active');
}

window.deleteSetupRecord = async (table, id) => {
    if (!canDo('abastecimento_postos', 'delete')) {
        alert('Você não tem permissão para excluir este cadastro.');
        return;
    }
    if (!confirm('Deseja realmente excluir este cadastro?')) return;
    
    if (supabaseClient) {
        const { error } = await supabaseClient.from(table).delete().eq('id', id);
        if (error) {
            showToast('Erro ao excluir: ' + error.message, 'error');
        } else {
            showToast('Cadastro excluído!', 'success');
            await loadInitialData();
        }
    } else {
        const listName = table === 'postos' ? 'posts' : (table === 'categorias_posto' ? 'postCategories' : 'fuelTypes');
        state[listName] = state[listName].filter(x => x.id !== id);
        saveLocalData();
        refreshUI();
        showToast('Cadastro excluído localmente', 'success');
    }
};

// --- Column Visibility Handling ---

window.toggleColumnPanel = (type) => {
    const panels = document.querySelectorAll('.column-toggle-panel');
    const targetId = 'columnPanelFuel';
    
    panels.forEach(p => {
        if (p.id !== targetId) p.classList.remove('active');
    });
    
    const target = document.getElementById(targetId);
    if (target) {
        target.classList.toggle('active');
    }
};

window.toggleColumn = (tableType, colName, isVisible) => {
    const table = document.getElementById('fuelTable');
    if (!table) return;

    const cells = table.querySelectorAll(`[data-column="${colName}"]`);
    cells.forEach(c => {
        c.style.display = isVisible ? '' : 'none';
    });

    const prefsKey = `frotalink_cols_fuel`;
    const prefs = JSON.parse(localStorage.getItem(prefsKey) || '{}');
    prefs[colName] = isVisible;
    localStorage.setItem(prefsKey, JSON.stringify(prefs));
};

function applyColumnPrefs() {
    const prefsKey = `frotalink_cols_fuel`;
    const prefs = JSON.parse(localStorage.getItem(prefsKey) || '{}');
    const panel = document.getElementById('columnPanelFuel');
    
    if (panel) {
        Object.keys(prefs).forEach(colName => {
            const isVisible = prefs[colName];
            const checkbox = panel.querySelector(`input[onchange*="'${colName}'"]`);
            if (checkbox) checkbox.checked = isVisible;
            
            const table = document.getElementById('fuelTable');
            if (table) {
                const cells = table.querySelectorAll(`[data-column="${colName}"]`);
                cells.forEach(c => {
                    if (c) c.style.display = isVisible ? '' : 'none';
                });
            }
        });
    }
}

// --- Sorting Handling ---

window.handleSort = (type, column) => {
    const current = state.sort.fuel;
    if (current.col === column) {
        current.dir = current.dir === 'asc' ? 'desc' : 'asc';
    } else {
        state.sort.fuel = { col: column, dir: 'desc' };
    }
    
    renderFuelTable();
};

function updateSortIcons(type) {
    const table = document.getElementById('fuelTable');
    if (!table) return;

    const current = state.sort.fuel;
    const headers = table.querySelectorAll('th[data-col]');
    
    headers.forEach(h => {
        h.classList.remove('active-sort');
        const iconContainer = h.querySelector('.sort-icon');
        if (iconContainer) {
            iconContainer.innerHTML = '<i data-lucide="chevrons-up-down" style="width: 14px;"></i>';
        }
        
        if (h.getAttribute('data-col') === current.col) {
            h.classList.add('active-sort');
            if (iconContainer) {
                const icon = current.dir === 'asc' ? 'chevron-up' : 'chevron-down';
                iconContainer.innerHTML = `<i data-lucide="${icon}" style="width: 14px;"></i>`;
            }
        }
    });
    
    if (window.lucide) lucide.createIcons();
}

// Close panels when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.btn-icon') && !e.target.closest('.column-toggle-panel')) {
        document.querySelectorAll('.column-toggle-panel').forEach(p => p.classList.remove('active'));
    }
});

window.deleteRecord = async (table, id) => {
    if (!canDo('abastecimento_lancamentos', 'delete')) {
        alert('Você não tem permissão para excluir abastecimentos.');
        return;
    }
    const motivo = prompt("Deseja realmente excluir este registro? Por favor, informe o motivo para a exclusão:");
    if (motivo === null) return; // Cancelado
    if (motivo.trim() === "") {
        alert("O motivo da exclusão é obrigatório para auditoria!");
        return;
    }
    const motivoTxt = motivo.trim();
    
    const formatarDataBR = (d) => {
        if (!d) return '';
        const pts = d.split('-');
        return pts.length === 3 ? `${pts[2]}/${pts[1]}/${pts[0]}` : d;
    };
    
    const rec = state.fuelingRecords.find(r => r.id === id);
    const dataBR = rec ? formatarDataBR(rec.data) : '';
    const horarioBR = rec ? (rec.horario || '') : '';
    const placaStr = rec ? (rec.veiculos?.placa || rec.veiculo_id || '') : '';
    const valorStr = rec ? (rec.valor_total || 0) : '';

    const descLog = rec 
        ? `DETALHE: Excluiu abastecimento do veículo ${placaStr} na data ${dataBR} às ${horarioBR} no valor de R$ ${valorStr} | MOTIVO: ${motivoTxt}`
        : `DETALHE: Excluiu abastecimento ID: ${id} | MOTIVO: ${motivoTxt}`;

    if (supabaseClient) {
        const { error } = await supabaseClient.from(table).delete().eq('id', id);
        if (error) {
            showToast('Erro ao excluir do Supabase: ' + error.message, 'error');
        } else {
            showToast('Registro excluído com sucesso', 'success');
            if (window.registrarLog) {
                window.registrarLog('abastecimento', 'EXCLUSÃO', descLog);
            }
            await loadInitialData();
        }
    } else {
        state.fuelingRecords = state.fuelingRecords.filter(r => r.id !== id);
        saveLocalData();
        refreshUI();
        showToast('Registro excluído localmente', 'success');
        if (window.registrarLog) {
            window.registrarLog('abastecimento', 'EXCLUSÃO', descLog + ' (Modo Local)');
        }
    }
};

// --- Bulk Selection & Deletion ---

window.toggleSelectAll = (isChecked) => {
    document.querySelectorAll('.fuel-checkbox').forEach(cb => {
        cb.checked = isChecked;
    });
    updateSelectedUI();
};

window.updateSelectedUI = () => {
    const selected = document.querySelectorAll('.fuel-checkbox:checked');
    const btn = document.getElementById('btnBulkDelete');
    const countSpan = document.getElementById('selectedCount');
    const selectAllCb = document.getElementById('selectAllFuel');
    
    const total = document.querySelectorAll('.fuel-checkbox').length;
    
    if (selectAllCb) {
        selectAllCb.checked = selected.length === total && total > 0;
    }
    
    if (btn && countSpan) {
        if (selected.length > 0) {
            btn.style.display = 'flex';
            countSpan.innerText = selected.length;
        } else {
            btn.style.display = 'none';
        }
    }
};

window.deleteSelectedRecords = async () => {
    // Regex para validar se a string é um UUID válido
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    const allSelected = Array.from(document.querySelectorAll('.fuel-checkbox:checked')).map(cb => cb.value);
    const selected = allSelected.filter(id => uuidRegex.test(id));
    const rejected = allSelected.filter(id => !uuidRegex.test(id));

    if (rejected.length > 0) {
        console.warn('IDs ignorados por formato inválido:', rejected);
    }

    if (selected.length === 0) {
        showToast('Nenhum registro com ID válido (UUID) selecionado', 'error');
        return;
    }

    if (!confirm(`Deseja realmente excluir os ${selected.length} registros selecionados?`)) return;
    const motivo = prompt("Por favor, informe o motivo para a exclusão em lote dos registros selecionados:");
    if (motivo === null) return; // Cancelado
    if (motivo.trim() === "") {
        alert("O motivo da exclusão é obrigatório para auditoria!");
        return;
    }
    const motivoTxt = motivo.trim();

    try {
        if (supabaseClient) {
            console.log('Iniciando exclusão em massa para:', selected);
            const { error } = await supabaseClient
                .from('abastecimentos')
                .delete()
                .in('id', selected);

            if (error) {
                console.warn('Falha na exclusão em massa, tentando individualmente...', error);
                
                let successCount = 0;
                let failCount = 0;
                
                for (const id of selected) {
                    const { error: singleError } = await supabaseClient.from('abastecimentos').delete().eq('id', id);
                    if (!singleError) {
                        successCount++;
                    } else {
                        console.error(`Erro ao excluir ID ${id}:`, singleError);
                        failCount++;
                    }
                }

                if (successCount > 0) {
                    showToast(`${successCount} registros excluídos. ${failCount} falharam.`, 'success');
                    if (window.registrarLog) {
                        window.registrarLog('abastecimento', 'EXCLUSÃO EM LOTE', `Excluiu ${successCount} de ${selected.length} abastecimentos em lote. Motivo: ${motivoTxt}`);
                    }
                    await loadInitialData();
                } else {
                    throw new Error('Não foi possível excluir nenhum dos registros selecionados.');
                }
            } else {
                showToast(`${selected.length} registros excluídos com sucesso!`, 'success');
                if (window.registrarLog) {
                    window.registrarLog('abastecimento', 'EXCLUSÃO EM LOTE', `Excluiu ${selected.length} abastecimentos em lote. Motivo: ${motivoTxt}`);
                }
                await loadInitialData();
            }
        } else {
            // Local Mode
            state.fuelingRecords = state.fuelingRecords.filter(r => !selected.includes(r.id));
            saveLocalData();
            refreshUI();
            showToast(`${selected.length} registros excluídos localmente!`, 'success');
            if (window.registrarLog) {
                window.registrarLog('abastecimento', 'EXCLUSÃO EM LOTE', `Excluiu ${selected.length} abastecimentos em lote (Modo Local). Motivo: ${motivoTxt}`);
            }
        }
    } catch (err) {
        console.error('Erro crítico na operação:', err);
        showToast('Erro: ' + (err.message || 'Falha na exclusão'), 'error');
    }
};

function showToast(msg, type) {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toastMsg');
    if (!toast || !toastMsg) return;

    toastMsg.innerText = msg;
    toast.className = `toast active ${type}`;
    
    setTimeout(() => {
        toast.classList.remove('active');
    }, 4000);
}

// --- Fuel Alerts Logic ---

window.toggleFuelNotiPanel = () => {
    const panel = document.getElementById('fuelNotiPanel');
    if (panel) panel.classList.toggle('active');
};

window.checkFuelAlerts = (includeDismissed = false) => {
    const alerts = [];
    const records = [...state.fuelingRecords].sort((a, b) => smartParseDate(a.data, a.horario) - smartParseDate(b.data, b.horario));
    
    const vehicleGroups = {};
    records.forEach(r => {
        if (!vehicleGroups[r.veiculo_id]) vehicleGroups[r.veiculo_id] = [];
        vehicleGroups[r.veiculo_id].push(r);
    });

    for (const vid in vehicleGroups) {
        const group = vehicleGroups[vid];
        const vehicle = state.vehicles.find(v => v.id === vid);
        const isIgnored = vehicle?.ignorar_media || (group.length > 0 && group[0].veiculos?.ignorar_media);

        group.forEach((f, idx) => {
            const previousRecord = group[idx - 1];
            const plate = f.veiculos?.placa || 'Veículo';

            // 1. Incompatible Fuel Alert
            const vehicleFuelType = vehicle?.tipo_combustivel || f.veiculos?.tipo_combustivel;
            if (vehicleFuelType && f.tipo_combustivel && vehicleFuelType.trim().toUpperCase() !== f.tipo_combustivel.trim().toUpperCase()) {
                alerts.push({
                    type: 'danger',
                    title: 'Combustível Incompatível ⛽',
                    desc: `${plate}: Registrado (${vehicleFuelType}) vs Abastecido (${f.tipo_combustivel})`,
                    date: smartParseDate(f.data, f.horario).toLocaleDateString('pt-BR'),
                    id: f.id,
                    field: 'combustivel'
                });
            }
            
            if (previousRecord) {
                const kmDiff = f.km_atual - previousRecord.km_atual;
                if (kmDiff > 0 && f.litros > 0) {
                    const avg = kmDiff / f.litros;
                    if (avg < 8 && !isIgnored) {
                        alerts.push({
                            type: 'warning',
                            title: 'Média Baixa 📉',
                            desc: `${plate}: ${avg.toFixed(2)} km/l (Abaixo de 8)`,
                            date: smartParseDate(f.data, f.horario).toLocaleDateString('pt-BR'),
                            id: f.id,
                            field: 'media'
                        });
                    } else if (avg > 18 && !isIgnored) {
                        alerts.push({
                            type: 'info',
                            title: 'Média Atípica (Alta) 📈',
                            desc: `${plate}: ${avg.toFixed(2)} km/l (Acima de 18)`,
                            date: smartParseDate(f.data, f.horario).toLocaleDateString('pt-BR'),
                            id: f.id,
                            field: 'media'
                        });
                    }
                }
                
                if (f.km_atual < previousRecord.km_atual && !isIgnored) {
                    alerts.push({
                        type: 'danger',
                        title: 'Regressão de KM ⚠️',
                        desc: `${plate}: Odom. atual (${f.km_atual}) < Anterior (${previousRecord.km_atual})`,
                        date: smartParseDate(f.data, f.horario).toLocaleDateString('pt-BR'),
                        id: f.id,
                        field: 'km'
                    });
                }
            }

            const duplicates = group.filter(r => 
                r.data === f.data && 
                r.horario === f.horario && 
                r.km_atual === f.km_atual && 
                r.id !== f.id
            );
            if (duplicates.length > 0) {
                alerts.push({
                    type: 'warning',
                    title: 'Registro Duplicado 📑',
                    desc: `${plate}: Mesmo Horário e KM detectados`,
                    date: smartParseDate(f.data, f.horario).toLocaleDateString('pt-BR'),
                    id: f.id,
                    field: 'km'
                });
            }

            if (f.valor_total > 1500) {
                alerts.push({
                    type: 'info',
                    title: 'Abastecimento Elevado 💰',
                    desc: `${plate}: Gasto de R$ ${f.valor_total.toLocaleString('pt-BR')}`,
                    date: smartParseDate(f.data, f.horario).toLocaleDateString('pt-BR'),
                    id: f.id,
                    field: 'valor'
                });
            }

            if (f.valor_unitario && f.valor_unitario > 0 && f.valor_unitario < 3) {
                alerts.push({
                    type: 'danger',
                    title: 'Valor Unitário Baixo ⚠️',
                    desc: `${plate}: Preço unitário de R$ ${f.valor_unitario.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 3})}`,
                    date: smartParseDate(f.data, f.horario).toLocaleDateString('pt-BR'),
                    id: f.id,
                    field: 'unitario'
                });
            }
        });
    }

    alerts.reverse();
    const activeAlerts = alerts.filter(a => {
        const key = `${a.id}_${a.title}`;
        return !state.dismissedAlerts || !state.dismissedAlerts.includes(key);
    });

    const counts = {
        danger: activeAlerts.filter(a => a.type === 'danger').length,
        warning: activeAlerts.filter(a => a.type === 'warning').length,
        total: activeAlerts.length
    };

    renderAlertFilterBar(activeAlerts);
    updateFuelNotiUI(activeAlerts);
    
    // Se includeDismissed for true, retornamos a lista COMPLETA (incluindo os ignorados)
    // Se for false (padrão), retornamos apenas os ATIVOS.
    return includeDismissed ? alerts : activeAlerts;
};

window.renderAlertFilterBar = (alerts) => {
    const container = document.getElementById('alertFilterBar');
    if (!container) return;

    if (alerts.length === 0) {
        container.innerHTML = '';
        return;
    }

    // Agrupar por título para contar
    const counts = {};
    const icons = {};
    const types = {};

    alerts.forEach(a => {
        counts[a.title] = (counts[a.title] || 0) + 1;
        types[a.title] = a.type;
        // Mapear ícones baseados no título (removendo emoji para o Lucide)
        if (a.title.includes('Combustível')) icons[a.title] = 'fuel';
        else if (a.title.includes('Média Baixa')) icons[a.title] = 'trending-down';
        else if (a.title.includes('Atípica')) icons[a.title] = 'trending-up';
        else if (a.title.includes('Regressão')) icons[a.title] = 'chevrons-down';
        else if (a.title.includes('Duplicado')) icons[a.title] = 'copy';
        else if (a.title.includes('Elevado')) icons[a.title] = 'dollar-sign';
        else if (a.title.includes('Unitário Baixo')) icons[a.title] = 'alert-triangle';
        else icons[a.title] = 'alert-circle';
    });

    let html = `
        <div class="alert-chip ${!state.activeAlertFilter ? 'active' : ''}" onclick="setAlertFilter(null)">
            <i data-lucide="layout-grid"></i>
            <span>Todos</span>
            <span class="count">${state.fuelingRecords.length}</span>
        </div>
    `;

    Object.keys(counts).forEach(title => {
        const isActive = state.activeAlertFilter === title;
        html += `
            <div class="alert-chip ${types[title]} ${isActive ? 'active' : ''}" onclick="setAlertFilter('${title}')">
                <i data-lucide="${icons[title]}"></i>
                <span>${title.replace(/[^\w\s\(\)\[\]\u00C0-\u00FF]/g, '').trim()}</span>
                <span class="count">${counts[title]}</span>
            </div>
        `;
    });

    container.innerHTML = html;
    if (window.lucide) lucide.createIcons();
};

window.setAlertFilter = (title) => {
    // Toggle: if clicking the active one, clear filter
    if (state.activeAlertFilter === title) {
        state.activeAlertFilter = null;
    } else {
        state.activeAlertFilter = title;
    }
    
    renderFuelTable();
    // Render bar again to update active state
    checkFuelAlerts(); 
};

function updateFuelNotiUI(alerts) {
    const badge = document.getElementById('fuelNotiBadge');
    const list = document.getElementById('fuelNotiList');
    if (!badge || !list) return;

    if (alerts.length > 0) {
        badge.innerText = alerts.length;
        badge.style.display = 'flex';

        let headerHtml = '';
        if (state.activeAlertFilter) {
            const filteredCount = alerts.filter(a => a.title === state.activeAlertFilter).length;
            if (filteredCount > 0) {
                headerHtml = `
                    <div style="padding: 0.6rem 1rem; border-bottom: 1px solid var(--border-card); display: flex; justify-content: space-between; align-items: center; background: rgba(239, 68, 68, 0.08); border-radius: 8px; margin-bottom: 0.5rem;">
                        <span style="font-size: 0.75rem; color: #f87171; font-weight: 700;">Lote: ${state.activeAlertFilter.replace(/[^\w\s\(\)\[\]\u00C0-\u00FF]/g, '').trim()}</span>
                        <button onclick="dismissAllVisibleAlerts()" style="padding: 0.3rem 0.6rem; font-size: 0.7rem; background: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 0.25rem;">
                            Limpar Histórico
                        </button>
                    </div>
                `;
            }
        }

        list.innerHTML = headerHtml + alerts.map(a => `
            <div class="noti-item noti-type-${a.type}" onclick="focusFuelItem('${a.id}', '${a.field}')">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div class="noti-item-title">${a.title}</div>
                    <button class="noti-item-dismiss" onclick="event.stopPropagation(); dismissAlert('${a.id}', '${a.title}')" title="Remover alerta" style="background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:1.1rem; padding:0 5px;">&times;</button>
                </div>
                <div class="noti-item-desc">${a.desc}</div>
                <div class="noti-date">${a.date}</div>
            </div>
        `).join('');
    } else {
        badge.style.display = 'none';
        list.innerHTML = '<div class="noti-empty">Tudo sob controle ✨</div>';
    }
}

window.dismissAlert = async (id, title) => {
    if (state.activeAlertFilter === title) {
        await window.dismissAllVisibleAlerts();
        return;
    }

    if (!confirm('Deseja realmente remover este alerta? (Ele não aparecerá novamente para este registro)')) return;
    
    const key = `${id}_${title}`;
    if (!state.dismissedAlerts) state.dismissedAlerts = [];
    state.dismissedAlerts.push(key);
    
    await saveDismissedAlerts();
    if (!supabaseClient) saveLocalData(); // Persistir a exclusão no mock se necessário
    if (window.registrarLog) {
        window.registrarLog('abastecimento', 'LIMPEZA ALERTA', `Removeu alerta "${title}" do abastecimento ID ${id}`);
    }
    checkFuelAlerts(); // Atualizar a lista
    renderFuelTable(); // Forçar re-render para remover o estilo de alerta da linha na tabela
};

window.dismissAllVisibleAlerts = async () => {
    // Pegar alertas que ESTÃO aparecendo no painel (respeitando o filtro de chip atual)
    const activeAlerts = checkFuelAlerts(false); 
    
    const toDismiss = state.activeAlertFilter 
        ? activeAlerts.filter(a => a.title === state.activeAlertFilter)
        : activeAlerts;

    if (toDismiss.length === 0) {
        showToast('Nenhum alerta para remover.', 'warning');
        return;
    }

    const msg = state.activeAlertFilter 
        ? `Deseja remover todos os ${toDismiss.length} alertas do tipo "${state.activeAlertFilter}"?`
        : `Deseja remover TODOS os ${toDismiss.length} alertas ativos?`;

    if (!confirm(msg)) return;

    if (!state.dismissedAlerts) state.dismissedAlerts = [];
    
    toDismiss.forEach(a => {
        const key = `${a.id}_${a.title}`;
        if (!state.dismissedAlerts.includes(key)) {
            state.dismissedAlerts.push(key);
        }
    });

    await saveDismissedAlerts();
    if (!supabaseClient) saveLocalData();
    if (window.registrarLog) {
        const filterStr = state.activeAlertFilter ? ` do tipo "${state.activeAlertFilter}"` : '';
        window.registrarLog('abastecimento', 'LIMPEZA ALERTA EMLOTE', `Limpou ${toDismiss.length} alertas${filterStr}`);
    }
    checkFuelAlerts();
    renderFuelTable(); // Atualizar a tabela
    showToast(`${toDismiss.length} alertas removidos!`, 'success');
};

window.focusFuelItem = (id, field = null) => {
    const searchInput = document.getElementById('fuelSearch');
    const record = state.fuelingRecords.find(r => r.id === id);
    
    state.highlightId = id;
    state.highlightField = field;
    state.activeAlertFilter = null; // Clear filter to show the focused item
    
    if (record && searchInput) {
        searchInput.value = record.veiculos?.placa || record.veiculo_id;
        renderFuelTable();
        
        // Scroll até a informação grifada
        setTimeout(() => {
            const el = document.querySelector('.highlight-alert');
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 100);
    }
    
    // Remover o highlight após 5 segundos
    setTimeout(() => {
        state.highlightId = null;
        state.highlightField = null;
        renderFuelTable();
    }, 5000);
    
    toggleFuelNotiPanel();
};

// --- Pagination Utilities ---

window.changePage = (dir) => {
    state.currentPage += dir;
    if (state.currentPage < 1) state.currentPage = 1;
    renderFuelTable();
};

window.goToPage = (page) => {
    state.currentPage = page;
    renderFuelTable();
};

function updatePaginationUI(total, start, end) {
    const pStart = document.getElementById('pageStart');
    const pEnd = document.getElementById('pageEnd');
    const pTotal = document.getElementById('pageTotal');
    const pNumbers = document.getElementById('pageNumbers');
    
    if (!pStart || !pEnd || !pTotal || !pNumbers) return;
    
    pStart.innerText = total > 0 ? start + 1 : 0;
    pEnd.innerText = Math.min(end, total);
    pTotal.innerText = total;
    
    const totalPages = Math.ceil(total / state.pageSize) || 1;
    let html = '';
    
    // Limit page numbers shown if too many
    if (totalPages <= 10) {
        for (let i = 1; i <= totalPages; i++) {
            const activeClass = i === state.currentPage ? 'active-preset' : '';
            html += `<button onclick="goToPage(${i})" class="btn-icon ${activeClass}" style="width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 8px; background: rgba(255,255,255,0.05); font-size: 0.75rem; border: 1px solid var(--border-card);">${i}</button>`;
        }
    } else {
        // Show current, first, last and ellipses
        const pages = [1, state.currentPage - 1, state.currentPage, state.currentPage + 1, totalPages];
        const uniquePages = [...new Set(pages)].filter(p => p > 0 && p <= totalPages).sort((a,b) => a - b);
        
        let lastP = 0;
        uniquePages.forEach(p => {
            if (lastP && p - lastP > 1) html += '<span style="color:var(--text-muted);">...</span>';
            const activeClass = p === state.currentPage ? 'active-preset' : '';
            html += `<button onclick="goToPage(${p})" class="btn-icon ${activeClass}" style="width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 8px; background: rgba(255,255,255,0.05); font-size: 0.75rem; border: 1px solid var(--border-card);">${p}</button>`;
            lastP = p;
        });
    }
    
    pNumbers.innerHTML = html;
}

window.clearDashFilters = () => {
    document.getElementById('dash_filter_veiculo').value = '';
    document.getElementById('dash_filter_motorista').value = '';
    document.getElementById('dash_filter_combustivel').value = '';
    document.getElementById('dash_filter_posto').value = '';
    document.getElementById('dash_filter_categoria').value = '';
    document.getElementById('dash_filter_modelo').value = '';
    document.getElementById('dash_filter_classificacao').value = '';
    
    // Reset dates to current month
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    document.getElementById('dash_start').value = start.toISOString().split('T')[0];
    document.getElementById('dash_end').value = now.toISOString().split('T')[0];
    
    updatePresetUI('preset_curr');
    updateDashboard();
};

function updateFilterOptionsDynamically(currentRecords, currentFilters) {
    // Intelligent filtering: each dropdown shows only options available based on the OTHER filters
    
    const selects = {
        veiculo: { el: document.getElementById('dash_filter_veiculo'), label: 'Todas as Placas', key: 'veiculo_id' },
        classificacao: { el: document.getElementById('dash_filter_classificacao'), label: 'Todas', key: 'classificacao' },
        motorista: { el: document.getElementById('dash_filter_motorista'), label: 'Todos os Condutores', key: 'motorista_id' },
        combustivel: { el: document.getElementById('dash_filter_combustivel'), label: 'Todos os Tipos', key: 'tipo_combustivel' },
        posto: { el: document.getElementById('dash_filter_posto'), label: 'Todos os Postos', key: 'posto_id' },
        categoria: { el: document.getElementById('dash_filter_categoria'), label: 'Todas as Categorias', key: 'categoria_id' },
        modelo: { el: document.getElementById('dash_filter_modelo'), label: 'Todos os Modelos', key: 'modelo' }
    };

    Object.keys(selects).forEach(key => {
        const item = selects[key];
        if (!item.el) return;

        // Determine relevant records for this specific dropdown
        // (records filtered by all other dropdowns + dates)
        const otherRecords = state.fuelingRecords.filter(f => {
            const startStr = document.getElementById('dash_start').value;
            const endStr = document.getElementById('dash_end').value;
            const startDate = startStr ? new Date(startStr + 'T00:00:00') : null;
            const endDate = endStr ? new Date(endStr + 'T23:59:59') : null;
            const d = smartParseDate(f.data, f.horario);
            if (startDate && d < startDate) return false;
            if (endDate && d > endDate) return false;

            if (key !== 'veiculo' && currentFilters.veiculo && f.veiculo_id !== currentFilters.veiculo) return false;
            if (key !== 'motorista' && currentFilters.motorista && f.motorista_id !== currentFilters.motorista) return false;
            if (key !== 'combustivel' && currentFilters.combustivel && f.tipo_combustivel?.toUpperCase() !== currentFilters.combustivel.toUpperCase()) return false;
            if (key !== 'posto' && currentFilters.posto && f.posto_id !== currentFilters.posto) return false;
            if (key !== 'categoria' && currentFilters.categoria && f.categoria_id !== currentFilters.categoria) return false;
            if (key !== 'modelo' && currentFilters.modelo) {
                const vehicle = state.vehicles.find(v => v.id === f.veiculo_id);
                const vModel = vehicle ? `${vehicle.marca} ${vehicle.modelo}`.trim().toUpperCase() : '';
                if (vModel !== currentFilters.modelo.toUpperCase()) return false;
            }
            if (key !== 'classificacao' && currentFilters.classificacao) {
                const vehicle = state.vehicles.find(v => v.id === f.veiculo_id);
                if (vehicle?.classificacao?.toUpperCase() !== currentFilters.classificacao.toUpperCase()) return false;
            }
            return true;
        });

        const currentValue = item.el.value;
        let availableOptions = [];
        
        if (key === 'modelo') {
            availableOptions = [...new Set(otherRecords.map(r => {
                const v = state.vehicles.find(veh => veh.id === r.veiculo_id);
                return v ? `${v.marca} ${v.modelo}`.trim() : null;
            }))].filter(Boolean);
        } else if (key === 'classificacao') {
            availableOptions = [...new Set(otherRecords.map(r => {
                const v = state.vehicles.find(veh => veh.id === r.veiculo_id);
                return v?.classificacao?.toUpperCase() || null;
            }))].filter(Boolean);
        } else {
            availableOptions = [...new Set(otherRecords.map(r => r[item.key]))].filter(Boolean);
        }

        // Rebuild options
        let html = `<option value="">${item.label}</option>`;
        if (key === 'veiculo') {
            const list = state.vehicles.filter(v => availableOptions.includes(v.id)).sort((a,b) => a.placa.localeCompare(b.placa));
            html += list.map(v => `<option value="${v.id}" ${v.id === currentValue ? 'selected' : ''}>${v.placa} - ${v.modelo}</option>`).join('');
        } else if (key === 'motorista') {
            const list = state.drivers.filter(d => availableOptions.includes(d.id)).sort((a,b) => a.nome_completo.localeCompare(b.nome_completo));
            html += list.map(d => `<option value="${d.id}" ${d.id === currentValue ? 'selected' : ''}>${d.nome_completo}</option>`).join('');
        } else if (key === 'posto') {
            const list = state.posts.filter(p => availableOptions.includes(p.id)).sort((a,b) => a.nome.localeCompare(b.nome));
            html += list.map(p => `<option value="${p.id}" ${p.id === currentValue ? 'selected' : ''}>${p.nome}</option>`).join('');
        } else if (key === 'categoria') {
            const list = state.postCategories.filter(c => availableOptions.includes(c.id)).sort((a,b) => a.descricao.localeCompare(b.descricao));
            html += list.map(c => `<option value="${c.id}" ${c.id === currentValue ? 'selected' : ''}>${c.descricao}</option>`).join('');
        } else {
            const list = availableOptions.sort();
            html += list.map(v => `<option value="${v}" ${v === currentValue ? 'selected' : ''}>${v}</option>`).join('');
        }

        item.el.innerHTML = html;
        item.el.value = currentValue; // Ensure selection persists
    });
    
    if (window.lucide) lucide.createIcons();
}

window.clearFuelSearch = () => {
    const searchInput = document.getElementById('fuelSearch');
    if (searchInput) {
        searchInput.value = '';
        
        // Also clear intelligent filters to ensure "consequentemente limpar o filtro"
        state.fuelFilters = { categoria: '', posto: '', veiculo: '', combustivel: '', importacao_id: '' };
        
        // Reset dropdowns in UI
        ['categoria', 'posto', 'veiculo', 'combustivel'].forEach(id => {
            const el = document.getElementById('fuel_filter_' + id);
            if (el) el.value = '';
        });

        state.currentPage = 1;
        renderFuelTable();
    }
};

// --- CUSTOS & COMPARATIVO MODULE ---

window.switchCustosSubTab = (tab) => {
    // Reset buttons
    ['btnSubTabCustoTotal', 'btnSubTabComparativo'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.classList.remove('active');
            btn.style.background = 'transparent';
            btn.style.color = 'var(--text-muted)';
            btn.style.border = 'none'; // Or '1px solid transparent' if jumping occurs
        }
    });

    const activeBtn = document.getElementById(tab === 'custo_total' ? 'btnSubTabCustoTotal' : 'btnSubTabComparativo');
    if (activeBtn) {
        activeBtn.classList.add('active');
        activeBtn.style.background = 'rgba(99, 102, 241, 0.1)';
        activeBtn.style.color = 'var(--primary-light)';
        activeBtn.style.border = '1px solid rgba(99, 102, 241, 0.2)';
    }

    // Toggle contents
    document.getElementById('subtab_custo_total').style.display = tab === 'custo_total' ? 'block' : 'none';
    document.getElementById('subtab_comparativo').style.display = tab === 'comparativo' ? 'block' : 'none';

    // Se estiver em comparativo e não tivermos inicializado as combos (se for o caso), chamamos update
    updateComparativo();
};

window.initComparativo = () => {
    // Inicializar datas se não existirem
    const endInput = document.getElementById('comp_filter_end');
    const startInput = document.getElementById('comp_filter_start');
    
    if (!endInput.value || !startInput.value) {
        window.handleCompPeriodChange('30');
    } else {
        updateComparativo();
    }
};

window.handleCompPeriodChange = (period) => {
    const customRange = document.getElementById('comp_custom_date_range');
    const startInput = document.getElementById('comp_filter_start');
    const endInput = document.getElementById('comp_filter_end');
    
    const now = new Date();
    let startDate = new Date();
    let endDate = new Date();

    if (period === 'all' || period.startsWith('km_')) {
        startInput.value = '';
        endInput.value = '';
        customRange.style.display = 'none';
        updateComparativo();
        return;
    } else if (period === 'custom') {
        customRange.style.display = 'flex';
        return; // wait for user to select dates and click update
    }

    customRange.style.display = 'none';

    if (period === '7') {
        startDate.setDate(now.getDate() - 7);
    } else if (period === '15') {
        startDate.setDate(now.getDate() - 15);
    } else if (period === '30') {
        startDate.setDate(now.getDate() - 30);
    } else if (period === 'current_month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (period === 'last_month') {
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0);
    }

    startInput.value = startDate.toISOString().split('T')[0];
    endInput.value = endDate.toISOString().split('T')[0];
    
    updateComparativo();
};

window.setCompMode = (mode) => {
    state.compMode = mode;
    document.querySelectorAll('.comp-mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-mode') === mode);
    });
    window.handleCompTipoChange(1, true);
    window.handleCompTipoChange(2, true);
    window.handleCompTipoChange(3, true);
    updateComparativo();
};

window.handleCompTipoChange = (col, skipUpdate = false) => {
    const tipo = state.compMode || 'veiculo';
    const alvo = document.getElementById(`comp_alvo_${col}`);
    const label = document.getElementById(`comp_label_${col}`);
    if (!alvo || !label) return;

    let html = '<option value="">Selecione...</option>';

    if (tipo === 'veiculo') {
        label.innerText = 'Selecione a Placa';
        const sortedVeh = [...state.vehicles].sort((a,b) => a.placa.localeCompare(b.placa));
        html += sortedVeh.map(v => `<option value="${v.id}">${v.placa} - ${v.modelo}</option>`).join('');
    } else if (tipo === 'motorista') {
        label.innerText = 'Selecione o Condutor';
        const sortedD = [...state.drivers].sort((a,b) => a.nome_completo.localeCompare(b.nome_completo));
        html += sortedD.map(d => `<option value="${d.id}">${d.nome_completo}</option>`).join('');
    } else if (tipo === 'modelo') {
        label.innerText = 'Selecione o Modelo';
        const models = [...new Set(state.vehicles.map(v => `${v.marca} ${v.modelo}`.trim()))].sort();
        html += models.map(m => `<option value="${m}">${m}</option>`).join('');
    }

    alvo.innerHTML = html;
    if (!skipUpdate) updateComparativo();
};

window.sortCustoTotal = (key) => {
    if (!state.custoTotalSort) state.custoTotalSort = { key: 'totalGasto', dir: 'desc' };
    if (state.custoTotalSort.key === key) {
        state.custoTotalSort.dir = state.custoTotalSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
        state.custoTotalSort.key = key;
        state.custoTotalSort.dir = 'desc';
    }
    updateComparativo();
};

window.renderCustoTotalList = (baseRecords, mode, maxKmDiff) => {
    const container = document.getElementById('custoTotalResults');
    if (!container) return;

    let groups = {};

    baseRecords.forEach(r => {
        let key = '';
        if (mode === 'veiculo') key = r.veiculo_id;
        else if (mode === 'motorista') key = r.motorista_id || 'N/A';
        else if (mode === 'modelo') {
            const v = state.vehicles.find(veh => veh.id === r.veiculo_id);
            key = v ? `${v.marca} ${v.modelo}`.trim() : 'Desconhecido';
        }
        if (!groups[key]) groups[key] = [];
        groups[key].push(r);
    });

    if (!state.custoTotalSort) {
        state.custoTotalSort = { key: 'totalGasto', dir: 'desc' };
    }

    const sortConfig = state.custoTotalSort;
    
    const getSortIcon = (key) => {
        if (sortConfig.key === key) {
            return `<i data-lucide="chevron-${sortConfig.dir === 'asc' ? 'up' : 'down'}" style="width: 14px; color: var(--primary);"></i>`;
        }
        return `<i data-lucide="chevrons-up-down" style="width: 14px; opacity: 0.3;"></i>`;
    };

    let tableHtml = `
        <style>
            .th-sortable {
                padding: 1rem;
                border-bottom: 1px solid rgba(255,255,255,0.05);
                color: var(--text-muted);
                font-size: 0.75rem;
                text-transform: uppercase;
                cursor: pointer;
                transition: color 0.2s, background 0.2s;
                white-space: nowrap;
            }
            .th-sortable:hover {
                color: #fff;
                background: rgba(255,255,255,0.02);
            }
            .th-sort-inner {
                display: flex;
                align-items: center;
                gap: 0.4rem;
            }
            .th-sort-inner.right {
                justify-content: flex-end;
            }
        </style>
        <div class="data-table-wrapper" style="overflow-x: auto;">
            <table class="data-table" style="width: 100%; min-width: 1000px; text-align: left; border-collapse: collapse;">
                <thead>
                    <tr>
                        <th class="th-sortable" onclick="sortCustoTotal('entityName')">
                            <div class="th-sort-inner">Referência ${getSortIcon('entityName')}</div>
                        </th>
                        <th style="padding: 1rem; border-bottom: 1px solid rgba(255,255,255,0.05); color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase;">Combustíveis</th>
                        <th style="padding: 1rem; border-bottom: 1px solid rgba(255,255,255,0.05); color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase;">Condutores</th>
                        <th class="th-sortable" onclick="sortCustoTotal('totalGasto')">
                            <div class="th-sort-inner right">Total Gasto ${getSortIcon('totalGasto')}</div>
                        </th>
                        <th class="th-sortable" onclick="sortCustoTotal('totalLitros')">
                            <div class="th-sort-inner right">Qtd. Litros ${getSortIcon('totalLitros')}</div>
                        </th>
                        <th class="th-sortable" onclick="sortCustoTotal('kmRodado')">
                            <div class="th-sort-inner right">KM Rodado ${getSortIcon('kmRodado')}</div>
                        </th>
                        <th class="th-sortable" onclick="sortCustoTotal('media')">
                            <div class="th-sort-inner right">Média ${getSortIcon('media')}</div>
                        </th>
                        <th class="th-sortable" onclick="sortCustoTotal('custoKm')">
                            <div class="th-sort-inner right">Custo/KM ${getSortIcon('custoKm')}</div>
                        </th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    let hasData = false;
    const computedRows = [];

    Object.keys(groups).forEach(key => {
        let vRecords = groups[key];
        vRecords.sort((a,b) => smartParseDate(a.data, a.horario) - smartParseDate(b.data, b.horario));

        if (maxKmDiff !== null) {
            const byVeh = {};
            vRecords.forEach(r => {
                if (!byVeh[r.veiculo_id]) byVeh[r.veiculo_id] = [];
                byVeh[r.veiculo_id].push(r);
            });
            const filtered = [];
            for (const vId in byVeh) {
                const recs = byVeh[vId];
                if (recs.length === 0) continue;
                const maxKm = Math.max(...recs.map(r => parseFloat(r.km_atual) || 0));
                recs.forEach(r => {
                    const km = parseFloat(r.km_atual) || 0;
                    if (km >= (maxKm - maxKmDiff) && km <= maxKm) {
                        filtered.push(r);
                    }
                });
            }
            vRecords = filtered;
            vRecords.sort((a,b) => smartParseDate(a.data, a.horario) - smartParseDate(b.data, b.horario));
        }

        if (vRecords.length === 0) return;
        hasData = true;

        let entityName = '';
        let entitySubtitle = '';
        let iconName = 'car';

        if (mode === 'veiculo') {
            const vehicle = state.vehicles.find(v => v.id === key);
            if (vehicle) {
                entityName = vehicle.placa;
                entitySubtitle = `${vehicle.modelo} ${vehicle.classificacao ? '• ' + vehicle.classificacao : ''}`;
            }
        } else if (mode === 'motorista') {
            const driver = state.drivers.find(d => d.id === key);
            if (driver) {
                entityName = driver.nome_completo;
            } else {
                entityName = 'NÃO INFORMADO';
            }
            entitySubtitle = 'Condutor / Motorista';
            iconName = 'user';
        } else if (mode === 'modelo') {
            entityName = key;
            entitySubtitle = 'Modelo de Veículo';
        }

        let totalGasto = 0;
        let totalLitros = 0;
        let kmRodado = 0;
        let media = 0;
        let custoKm = 0;

        const fuelBreakdown = {};
        const driverBreakdown = {};

        vRecords.forEach(r => {
            const gastoVal = parseFloat(r.valor_total) || 0;
            const litrosVal = parseFloat(r.litros) || 0;

            totalGasto += gastoVal;
            totalLitros += litrosVal;

            const fType = r.tipo_combustivel || 'NÃO INFORMADO';
            if (!fuelBreakdown[fType]) fuelBreakdown[fType] = 0;
            fuelBreakdown[fType] += litrosVal;

            const mId = r.motorista_id || 'N/A';
            if (!driverBreakdown[mId]) {
                const driverObj = state.drivers.find(d => d.id === mId);
                driverBreakdown[mId] = {
                    name: driverObj ? driverObj.nome_completo : (r.motoristas?.nome_completo || 'NÃO INFORMADO'),
                    litros: 0
                };
            }
            driverBreakdown[mId].litros += litrosVal;
        });

        if (mode === 'veiculo' && vRecords.length >= 2) {
            kmRodado = vRecords[vRecords.length - 1].km_atual - vRecords[0].km_atual;
        } else if ((mode === 'motorista' || mode === 'modelo') && vRecords.length > 0) {
            const vehiclesMap = {};
            vRecords.forEach(r => {
                if (!vehiclesMap[r.veiculo_id]) vehiclesMap[r.veiculo_id] = [];
                vehiclesMap[r.veiculo_id].push(r);
            });
            for (const v_id in vehiclesMap) {
                const recs = vehiclesMap[v_id].sort((a,b) => smartParseDate(a.data, a.horario) - smartParseDate(b.data, b.horario));
                if (recs.length >= 2) {
                    kmRodado += recs[recs.length - 1].km_atual - recs[0].km_atual;
                }
            }
        }

        if (kmRodado > 0 && totalLitros > 0) {
            media = kmRodado / totalLitros;
            custoKm = totalGasto / kmRodado;
        } else if (totalGasto > 0 && totalLitros > 0) {
            custoKm = totalGasto / totalLitros;
        }

        const fuelHtml = Object.entries(fuelBreakdown)
            .sort((a,b) => b[1] - a[1])
            .map(([k,v]) => `<div style="font-size: 0.75rem; color: var(--text-muted);"><span style="color: #fff;">${k}:</span> ${v.toLocaleString('pt-BR')} L</div>`)
            .join('');

        const driverHtml = Object.values(driverBreakdown)
            .sort((a,b) => b.litros - a.litros)
            .map(d => `<div style="font-size: 0.75rem; color: var(--text-muted);"><span style="color: #fff;" title="${d.name}">${d.name.length > 15 ? d.name.substring(0,15) + '..' : d.name}:</span> ${d.litros.toLocaleString('pt-BR')} L</div>`)
            .join('');

        computedRows.push({
            entityName,
            entitySubtitle,
            iconName,
            totalGasto,
            totalLitros,
            kmRodado,
            media,
            custoKm,
            fuelHtml,
            driverHtml
        });
    });

    if (!hasData) {
        container.innerHTML = `<div style="grid-column: 1 / -1; padding: 2rem; text-align: center; color: var(--text-muted); font-size: 0.9rem; background: rgba(0,0,0,0.2); border-radius: 12px; border: 1px dashed rgba(255,255,255,0.1);">Nenhum dado encontrado para o período selecionado.</div>`;
        return;
    }

    computedRows.sort((a, b) => {
        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];

        if (typeof valA === 'string') {
            valA = valA.toLowerCase();
            valB = (valB || '').toString().toLowerCase();
            const res = valA.localeCompare(valB, undefined, {numeric: true});
            return sortConfig.dir === 'asc' ? res : -res;
        } else {
            if (valA < valB) return sortConfig.dir === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.dir === 'asc' ? 1 : -1;
            return 0;
        }
    });

    computedRows.forEach(row => {
        tableHtml += `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 0.2s;">
                <td style="padding: 1rem; vertical-align: top;">
                    <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.2rem;">
                        <i data-lucide="${row.iconName}" style="color: var(--primary); width: 14px;"></i>
                        <span style="font-weight: 700; font-size: 0.95rem; color: #fff;">${row.entityName}</span>
                    </div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; margin-left: 1.3rem;">
                        ${row.entitySubtitle}
                    </div>
                </td>
                <td style="padding: 1rem; vertical-align: top;">
                    ${row.fuelHtml || '-'}
                </td>
                <td style="padding: 1rem; vertical-align: top;">
                    ${row.driverHtml || '-'}
                </td>
                <td style="padding: 1rem; text-align: right; font-weight: 700; color: #fff; font-size: 0.95rem; vertical-align: top;">
                    ${row.totalGasto.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}
                </td>
                <td style="padding: 1rem; text-align: right; font-weight: 700; color: #fff; font-size: 0.95rem; vertical-align: top;">
                    ${row.totalLitros.toLocaleString('pt-BR')} L/m³
                </td>
                <td style="padding: 1rem; text-align: right; font-weight: 700; color: #fff; font-size: 0.95rem; vertical-align: top;">
                    ${row.kmRodado > 0 ? row.kmRodado.toLocaleString('pt-BR') + ' km' : '---'}
                </td>
                <td style="padding: 1rem; text-align: right; font-weight: 800; color: ${row.media > 0 ? 'var(--success)' : '#fff'}; font-size: 1rem; vertical-align: top;">
                    ${row.media > 0 ? row.media.toFixed(2) + ' km/l' : '---'}
                </td>
                <td style="padding: 1rem; text-align: right; font-weight: 800; color: ${row.custoKm > 0 ? '#ef4444' : '#fff'}; font-size: 1rem; vertical-align: top;">
                    ${row.custoKm > 0 ? row.custoKm.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'}) : '---'}
                </td>
            </tr>
        `;
    });

    tableHtml += `
                </tbody>
            </table>
        </div>
    `;

    container.innerHTML = tableHtml;
    if (window.lucide) lucide.createIcons();
};

window.updateComparativo = () => {
    const startStr = document.getElementById('comp_filter_start').value;
    const endStr = document.getElementById('comp_filter_end').value;
    const startDate = startStr ? new Date(startStr + 'T00:00:00') : null;
    const endDate = endStr ? new Date(endStr + 'T23:59:59') : null;

    const periodVal = document.getElementById('comp_filter_periodo').value;
    const maxKmDiff = periodVal.startsWith('km_') ? parseInt(periodVal.replace('km_', ''), 10) : null;

    // Filter base records by date only
    const periodRecords = state.fuelingRecords.filter(f => {
        const d = smartParseDate(f.data, f.horario);
        if (startDate && d < startDate) return false;
        if (endDate && d > endDate) return false;
        return true;
    });

    // RENDER CUSTO TOTAL LIST
    const checkedClasses = Array.from(document.querySelectorAll('.filter-classificacao-ct:checked')).map(cb => cb.value.toUpperCase());
    const filteredForCustoTotal = periodRecords.filter(r => {
        const vehicle = state.vehicles.find(v => v.id === r.veiculo_id);
        const classif = vehicle ? (vehicle.classificacao || '').toUpperCase() : '';
        return checkedClasses.includes(classif);
    });
    renderCustoTotalList(filteredForCustoTotal, state.compMode || 'veiculo', maxKmDiff);

    [1, 2, 3].forEach(col => {
        const tipo = state.compMode || 'veiculo';
        const alvoId = document.getElementById(`comp_alvo_${col}`).value;
        const container = document.getElementById(`comp_results_${col}`);
        
        if (!alvoId) {
            container.innerHTML = `<div style="padding: 2rem; text-align: center; color: var(--text-muted); font-size: 0.8rem; background: rgba(0,0,0,0.2); border-radius: 12px; border: 1px dashed rgba(255,255,255,0.1);">Selecione um alvo para visualizar os dados</div>`;
            return;
        }

        let entityName = '';
        let entitySubtitle = '';
        let iconName = 'car';
        
        let vRecords = [];

        if (tipo === 'veiculo') {
            const vehicle = state.vehicles.find(v => v.id === alvoId);
            if (vehicle) {
                entityName = vehicle.placa;
                entitySubtitle = `${vehicle.modelo} ${vehicle.classificacao ? '• ' + vehicle.classificacao : ''}`;
            }
            vRecords = periodRecords.filter(r => r.veiculo_id === alvoId);
        } else if (tipo === 'motorista') {
            const driver = state.drivers.find(d => d.id === alvoId);
            if (driver) {
                entityName = driver.nome_completo;
                entitySubtitle = 'Condutor / Motorista';
                iconName = 'user';
            }
            vRecords = periodRecords.filter(r => r.motorista_id === alvoId);
        } else if (tipo === 'modelo') {
            entityName = alvoId;
            entitySubtitle = 'Modelo de Veículo';
            vRecords = periodRecords.filter(r => {
                const v = state.vehicles.find(veh => veh.id === r.veiculo_id);
                return v && `${v.marca} ${v.modelo}`.trim() === alvoId;
            });
        }

        vRecords.sort((a,b) => smartParseDate(a.data, a.horario) - smartParseDate(b.data, b.horario));

        if (maxKmDiff !== null) {
            const byVeh = {};
            vRecords.forEach(r => {
                if (!byVeh[r.veiculo_id]) byVeh[r.veiculo_id] = [];
                byVeh[r.veiculo_id].push(r);
            });
            
            const filtered = [];
            for (const vId in byVeh) {
                const recs = byVeh[vId];
                if (recs.length === 0) continue;
                const maxKm = Math.max(...recs.map(r => parseFloat(r.km_atual) || 0));
                recs.forEach(r => {
                    const km = parseFloat(r.km_atual) || 0;
                    if (km >= (maxKm - maxKmDiff) && km <= maxKm) {
                        filtered.push(r);
                    }
                });
            }
            vRecords = filtered;
            vRecords.sort((a,b) => smartParseDate(a.data, a.horario) - smartParseDate(b.data, b.horario));
        }

        if (vRecords.length === 0) {
            container.innerHTML = `
                <div style="background: rgba(30, 41, 59, 0.5); padding: 1rem; border-radius: 12px; border: 1px solid var(--border-card);">
                    <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                        <i data-lucide="${iconName}" style="color: var(--primary); width: 16px;"></i>
                        <span style="font-weight: 700; font-size: 0.85rem;">${entityName}</span>
                    </div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">Nenhum abastecimento neste período.</div>
                </div>`;
            return;
        }

        let totalGasto = 0;
        let totalLitros = 0;
        let kmRodado = 0;
        let media = 0;
        let custoKm = 0;
        
        const fuelBreakdown = {};
        const driverBreakdown = {};
        const vehicleBreakdown = {};

        vRecords.forEach(r => {
            const gastoVal = parseFloat(r.valor_total) || 0;
            const litrosVal = parseFloat(r.litros) || 0;

            totalGasto += gastoVal;
            totalLitros += litrosVal;
            const fType = r.tipo_combustivel || 'N/A';
            if (!fuelBreakdown[fType]) {
                fuelBreakdown[fType] = { litros: 0, gasto: 0 };
            }
            fuelBreakdown[fType].litros += litrosVal;
            fuelBreakdown[fType].gasto += gastoVal;

            // Driver breakdown
            const mId = r.motorista_id || 'N/A';
            if (!driverBreakdown[mId]) {
                const driverObj = state.drivers.find(d => d.id === mId);
                driverBreakdown[mId] = {
                    name: driverObj ? driverObj.nome_completo : (r.motoristas?.nome_completo || 'NÃO INFORMADO'),
                    litros: 0,
                    gasto: 0
                };
            }
            driverBreakdown[mId].litros += litrosVal;
            driverBreakdown[mId].gasto += gastoVal;

            // Vehicle breakdown
            const vId = r.veiculo_id || 'N/A';
            if (!vehicleBreakdown[vId]) {
                const vehicleObj = state.vehicles.find(v => v.id === vId);
                vehicleBreakdown[vId] = {
                    placa: vehicleObj ? vehicleObj.placa : (r.veiculos?.placa || 'PLACA N/A'),
                    modelo: vehicleObj ? vehicleObj.modelo : (r.veiculos?.modelo || ''),
                    litros: 0,
                    gasto: 0
                };
            }
            vehicleBreakdown[vId].litros += litrosVal;
            vehicleBreakdown[vId].gasto += gastoVal;
        });

        if (tipo === 'veiculo' && vRecords.length >= 2) {
            kmRodado = vRecords[vRecords.length - 1].km_atual - vRecords[0].km_atual;
        } else if ((tipo === 'motorista' || tipo === 'modelo') && vRecords.length > 0) {
            // Se for modelo ou motorista, somar a diferença de km por veículo que ele operou
            const vehiclesMap = {};
            vRecords.forEach(r => {
                if (!vehiclesMap[r.veiculo_id]) vehiclesMap[r.veiculo_id] = [];
                vehiclesMap[r.veiculo_id].push(r);
            });
            for (const v_id in vehiclesMap) {
                const recs = vehiclesMap[v_id].sort((a,b) => smartParseDate(a.data, a.horario) - smartParseDate(b.data, b.horario));
                if (recs.length >= 2) {
                    kmRodado += recs[recs.length - 1].km_atual - recs[0].km_atual;
                }
            }
        }

        if (kmRodado > 0 && totalLitros > 0) {
            media = kmRodado / totalLitros;
            custoKm = totalGasto / kmRodado;
        } else if (totalGasto > 0 && totalLitros > 0) {
            custoKm = totalGasto / totalLitros; // fallback se n tiver km
        }

        // Prepare Fuel Breakdown HTML
        let fuelHtml = '<div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px dashed rgba(255,255,255,0.1);">';
        fuelHtml += '<div style="font-size: 0.65rem; color: var(--primary); font-weight: 700; text-transform: uppercase; margin-bottom: 0.2rem;">Detalhamento por Combustível</div>';
        for (const ft in fuelBreakdown) {
            fuelHtml += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 0.3rem;">
                    <span style="font-size: 0.7rem; color: var(--text-muted); flex: 1;">${ft}</span>
                    <div style="text-align: right;">
                        <div style="font-size: 0.7rem; font-weight: 700; color: #fff;">${fuelBreakdown[ft].litros.toLocaleString('pt-BR')} L/m³</div>
                        <div style="font-size: 0.65rem; color: var(--text-muted);">${fuelBreakdown[ft].gasto.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</div>
                    </div>
                </div>
            `;
        }
        fuelHtml += '</div>';

        let extraBreakdownHtml = '';
        
        // 1. If 'veiculo' or 'modelo', show usage by Drivers (Condutores)
        if (tipo === 'veiculo' || tipo === 'modelo') {
            extraBreakdownHtml += `
                <div style="margin-top: 0.8rem; padding-top: 0.8rem; border-top: 1px dashed rgba(255,255,255,0.1);">
                    <div style="font-size: 0.65rem; color: var(--primary); font-weight: 700; text-transform: uppercase; margin-bottom: 0.3rem; letter-spacing: 0.3px;">Uso por Condutores</div>
            `;
            const sortedDrivers = Object.values(driverBreakdown).sort((a,b) => b.gasto - a.gasto);
            sortedDrivers.forEach(d => {
                extraBreakdownHtml += `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 0.3rem;">
                        <span style="font-size: 0.7rem; color: var(--text-muted); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 140px;" title="${d.name}">${d.name}</span>
                        <div style="text-align: right;">
                            <div style="font-size: 0.7rem; font-weight: 700; color: #fff;">${d.litros.toLocaleString('pt-BR')} L/m³</div>
                            <div style="font-size: 0.65rem; color: var(--text-muted);">${d.gasto.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</div>
                        </div>
                    </div>
                `;
            });
            extraBreakdownHtml += `</div>`;
        }

        // 2. If 'motorista' or 'modelo', show usage by Vehicles (Placas)
        if (tipo === 'motorista' || tipo === 'modelo') {
            extraBreakdownHtml += `
                <div style="margin-top: 0.8rem; padding-top: 0.8rem; border-top: 1px dashed rgba(255,255,255,0.1);">
                    <div style="font-size: 0.65rem; color: #10b981; font-weight: 700; text-transform: uppercase; margin-bottom: 0.3rem; letter-spacing: 0.3px;">Uso por Placas</div>
            `;
            const sortedVehs = Object.values(vehicleBreakdown).sort((a,b) => b.gasto - a.gasto);
            sortedVehs.forEach(v => {
                extraBreakdownHtml += `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 0.3rem;">
                        <div style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 140px;">
                            <span style="font-size: 0.7rem; font-weight: 700; color: #fff;">${v.placa}</span>
                            <span style="font-size: 0.65rem; color: var(--text-muted); display: block;">${v.modelo}</span>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 0.7rem; font-weight: 700; color: #fff;">${v.litros.toLocaleString('pt-BR')} L/m³</div>
                            <div style="font-size: 0.65rem; color: var(--text-muted);">${v.gasto.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</div>
                        </div>
                    </div>
                `;
            });
            extraBreakdownHtml += `</div>`;
        }

        container.innerHTML = `
            <div style="background: linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.8) 100%); padding: 1rem; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);">
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.2rem;">
                    <i data-lucide="${iconName}" style="color: var(--primary); width: 16px;"></i>
                    <span style="font-weight: 800; font-size: 0.9rem; color: white;">${entityName}</span>
                </div>
                <div style="font-size: 0.7rem; color: var(--text-muted); margin-bottom: 1rem; text-transform: uppercase;">
                    ${entitySubtitle}
                </div>

                <div style="display: grid; gap: 0.8rem;">
                    <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <span style="font-size: 0.75rem; color: var(--text-muted);">Total Gasto</span>
                        <span style="font-weight: 700; color: #fff; font-size: 0.9rem;">${totalGasto.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <span style="font-size: 0.75rem; color: var(--text-muted);">Qtd. Litros/m³</span>
                        <span style="font-weight: 700; color: #fff; font-size: 0.9rem;">${totalLitros.toLocaleString('pt-BR')} L/m³</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <span style="font-size: 0.75rem; color: var(--text-muted);">KM Rodado</span>
                        <span style="font-weight: 700; color: #fff; font-size: 0.9rem;">${kmRodado > 0 ? kmRodado.toLocaleString('pt-BR') + ' km' : '---'}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <span style="font-size: 0.75rem; color: var(--text-muted);">Média Consumo</span>
                        <span class="comp-media" data-val="${media}" style="font-weight: 800; color: ${media > 0 ? 'var(--success)' : '#fff'}; font-size: 1rem;">${media > 0 ? media.toFixed(2) + ' km/l' : '---'}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 0.5rem;">
                        <span style="font-size: 0.75rem; color: var(--text-muted);">Custo por KM</span>
                        <span class="comp-custo" data-val="${custoKm}" style="font-weight: 800; color: ${custoKm > 0 ? '#ef4444' : '#fff'}; font-size: 1rem;">${custoKm > 0 ? custoKm.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'}) : '---'}</span>
                    </div>
                </div>
                
                ${fuelHtml}
                ${extraBreakdownHtml}
                
                <div style="font-size: 0.65rem; color: var(--text-muted); margin-top: 1rem; text-align: center; opacity: 0.7;">
                    ${vRecords.length} abastecimento(s) no período
                </div>
            </div>`;

        // --- NOVO: Relação de Abastecimentos Detalhada ---
        let listHtml = `
            <div style="margin-top: 1rem; background: rgba(30, 41, 59, 0.4); border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); overflow: hidden; animation: fadeIn 0.5s ease-out;">
                <div style="padding: 0.8rem 1rem; background: rgba(255,255,255,0.02); border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <i data-lucide="history" style="width: 14px; color: var(--primary);"></i>
                        <span style="font-size: 0.7rem; font-weight: 800; color: #fff; text-transform: uppercase; letter-spacing: 0.5px;">Últimos Abastecimentos</span>
                    </div>
                    <span style="font-size: 0.6rem; color: var(--text-muted); background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 4px;">Top 20</span>
                </div>
                <div style="max-height: 400px; overflow-y: auto; scrollbar-width: thin;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.7rem;">
                        <thead style="position: sticky; top: 0; z-index: 5; background: #1e293b;">
                            <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
                                <th style="padding: 0.6rem 0.5rem; text-align: left; color: var(--text-muted); font-weight: 600;">Data</th>
                                <th style="padding: 0.6rem 0.5rem; text-align: left; color: var(--text-muted); font-weight: 600;">KM Atual</th>
                                <th style="padding: 0.6rem 0.5rem; text-align: left; color: var(--text-muted); font-weight: 600;">KM Rod.</th>
                                <th style="padding: 0.6rem 0.5rem; text-align: left; color: var(--text-muted); font-weight: 600;">Combust.</th>
                                <th style="padding: 0.6rem 0.5rem; text-align: left; color: var(--text-muted); font-weight: 600;">Lts/m³</th>
                                <th style="padding: 0.6rem 0.5rem; text-align: left; color: var(--text-muted); font-weight: 600;">Média</th>
                                <th style="padding: 0.6rem 0.5rem; text-align: right; color: var(--text-muted); font-weight: 600;">Total</th>
                            </tr>
                        </thead>
                        <tbody>
        `;

        // Exibir os últimos 20 registros (já que vRecords está em ordem crescente, pegamos o final invertido)
        const recentRecords = [...vRecords].reverse().slice(0, 20);
        
        recentRecords.forEach((r, idx) => {
            // Cálculo de média pontual para esta linha específica
            let lineMedia = '---';
            let lineKmRodado = '---';
            const sortedAll = vRecords; // Já está ordenado por data crescente
            const currentRecordIdx = sortedAll.findIndex(rec => rec.id === r.id);
            
            if (currentRecordIdx > 0) {
                const prev = sortedAll[currentRecordIdx - 1];
                // Garantir que a média seja calculada apenas entre abastecimentos do mesmo veículo
                if (prev.veiculo_id === r.veiculo_id) {
                    const diff = (parseFloat(r.km_atual) || 0) - (parseFloat(prev.km_atual) || 0);
                    const lts = parseFloat(r.litros) || 0;
                    if (diff > 0) {
                        lineKmRodado = diff.toLocaleString('pt-BR');
                        if (lts > 0) {
                            lineMedia = (diff / lts).toFixed(2);
                        }
                    }
                }
            }

            let formattedDate = r.data;
            if (formattedDate && formattedDate.includes('-')) {
                const [y, m, d] = formattedDate.split('-');
                formattedDate = `${d}/${m}`;
            }

            const fuelType = (r.tipo_combustivel || 'N/A').replace('GASOLINA ', 'GAS. ').replace('DIESEL ', 'D. ');

            listHtml += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.03); transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
                    <td style="padding: 0.6rem 0.5rem; color: var(--text-muted);">${formattedDate}</td>
                    <td style="padding: 0.6rem 0.5rem; color: #e2e8f0; font-weight: 500;">${(parseFloat(r.km_atual) || 0).toLocaleString('pt-BR')}</td>
                    <td style="padding: 0.6rem 0.5rem; color: var(--primary-light); font-weight: 600;">${lineKmRodado}</td>
                    <td style="padding: 0.6rem 0.5rem; color: var(--text-muted); font-size: 0.65rem;">${fuelType}</td>
                    <td style="padding: 0.6rem 0.5rem; color: #e2e8f0;">${(parseFloat(r.litros) || 0).toLocaleString('pt-BR')}</td>
                    <td style="padding: 0.6rem 0.5rem; font-weight: 700; color: ${lineMedia !== '---' ? 'var(--success)' : 'rgba(255,255,255,0.3)'};">${lineMedia}</td>
                    <td style="padding: 0.6rem 0.5rem; text-align: right; font-weight: 700; color: #fff;">${(parseFloat(r.valor_total) || 0).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL', minimumFractionDigits: 2})}</td>
                </tr>
            `;
        });

        if (vRecords.length > 20) {
            listHtml += `
                <tr>
                    <td colspan="7" style="padding: 0.8rem; text-align: center; color: var(--text-muted); font-size: 0.65rem; font-style: italic; background: rgba(0,0,0,0.1);">
                        ... e mais ${vRecords.length - 20} registros ocultos.
                    </td>
                </tr>
            `;
        }

        listHtml += `
                        </tbody>
                    </table>
                </div>
            </div>
        `;


        container.innerHTML += listHtml;
    });


    if (window.lucide) lucide.createIcons();
    highlightBestComparativo();
};

function highlightBestComparativo() {
    // Collect medias
    const medias = [];
    document.querySelectorAll('.comp-media').forEach(el => {
        const val = parseFloat(el.getAttribute('data-val') || 0);
        if (val > 0) medias.push({ el, val });
    });
    if (medias.length > 1) {
        medias.sort((a,b) => b.val - a.val);
        // Highlight best media
        medias.forEach(m => m.el.style.textShadow = 'none');
        medias[0].el.style.textShadow = '0 0 10px rgba(16, 185, 129, 0.5)';
        medias[0].el.innerHTML += ' <i data-lucide="award" style="width: 14px; display: inline-block; vertical-align: middle;"></i>';
    }

    // Collect custoKm
    const custos = [];
    document.querySelectorAll('.comp-custo').forEach(el => {
        const val = parseFloat(el.getAttribute('data-val') || 0);
        if (val > 0) custos.push({ el, val });
    });
    if (custos.length > 1) {
        custos.sort((a,b) => a.val - b.val);
        // Highlight lowest cost
        custos.forEach(c => c.el.style.textShadow = 'none');
        custos[0].el.style.textShadow = '0 0 10px rgba(16, 185, 129, 0.5)';
        custos[0].el.style.color = 'var(--success)'; // override red
        custos[0].el.innerHTML += ' <i data-lucide="award" style="width: 14px; display: inline-block; vertical-align: middle;"></i>';
    }
    
    if (window.lucide) lucide.createIcons();
}

window.exportCustoTotalToPDF = (baseRecords, mode, maxKmDiff, startStr, endStr) => {
    const { jsPDF } = window.jspdf;
    const doc = jsPDF('l', 'mm', 'a4'); // Landscape

    // Fundo do Header
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 35, 'F');

    // Título Principal
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('FROTALINK | Relatório de Custo Total', 15, 20);

    // Subtítulo e Filtros Aplicados
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184); // grey

    let dateRangeText = 'Todo o período';
    if (maxKmDiff !== null) {
        dateRangeText = `Últimos ${maxKmDiff.toLocaleString('pt-BR')} km`;
    } else if (startStr || endStr) {
        const formatD = (s) => {
            if (!s) return '';
            const [y,m,d] = s.split('-');
            return `${d}/${m}/${y}`;
        };
        dateRangeText = `${formatD(startStr) || 'Início'} até ${formatD(endStr) || 'Fim'}`;
    }
    const modeText = mode === 'veiculo' ? 'Placa' : mode === 'modelo' ? 'Modelo de Veículo' : 'Condutor';
    doc.text(`Período de Filtro: ${dateRangeText}   |   Agrupamento: ${modeText}`, 15, 28);

    let groups = {};
    baseRecords.forEach(r => {
        let key = '';
        if (mode === 'veiculo') key = r.veiculo_id;
        else if (mode === 'motorista') key = r.motorista_id || 'N/A';
        else if (mode === 'modelo') {
            const v = state.vehicles.find(veh => veh.id === r.veiculo_id);
            key = v ? `${v.marca} ${v.modelo}`.trim() : 'Desconhecido';
        }
        if (!groups[key]) groups[key] = [];
        groups[key].push(r);
    });

    const computedRows = [];
    Object.keys(groups).forEach(key => {
        let vRecords = groups[key];
        vRecords.sort((a,b) => smartParseDate(a.data, a.horario) - smartParseDate(b.data, b.horario));

        if (maxKmDiff !== null) {
            const byVeh = {};
            vRecords.forEach(r => {
                if (!byVeh[r.veiculo_id]) byVeh[r.veiculo_id] = [];
                byVeh[r.veiculo_id].push(r);
            });
            const filtered = [];
            for (const vId in byVeh) {
                const recs = byVeh[vId];
                if (recs.length === 0) continue;
                const maxKm = Math.max(...recs.map(r => parseFloat(r.km_atual) || 0));
                recs.forEach(r => {
                    const km = parseFloat(r.km_atual) || 0;
                    if (km >= (maxKm - maxKmDiff) && km <= maxKm) {
                        filtered.push(r);
                    }
                });
            }
            vRecords = filtered;
            vRecords.sort((a,b) => smartParseDate(a.data, a.horario) - smartParseDate(b.data, b.horario));
        }

        if (vRecords.length === 0) return;

        let entityName = '';
        if (mode === 'veiculo') {
            const vehicle = state.vehicles.find(v => v.id === key);
            entityName = vehicle ? vehicle.placa : 'Desconhecido';
        } else if (mode === 'motorista') {
            const driver = state.drivers.find(d => d.id === key);
            entityName = driver ? driver.nome_completo : 'NÃO INFORMADO';
        } else if (mode === 'modelo') {
            entityName = key;
        }

        let totalGasto = 0;
        let totalLitros = 0;
        let kmRodado = 0;
        let media = 0;
        let custoKm = 0;

        const fuelBreakdown = {};
        const driverBreakdown = {};

        vRecords.forEach(r => {
            const gastoVal = parseFloat(r.valor_total) || 0;
            const litrosVal = parseFloat(r.litros) || 0;

            totalGasto += gastoVal;
            totalLitros += litrosVal;

            const fType = r.tipo_combustivel || 'NÃO INFORMADO';
            if (!fuelBreakdown[fType]) fuelBreakdown[fType] = 0;
            fuelBreakdown[fType] += litrosVal;

            const mId = r.motorista_id || 'N/A';
            if (!driverBreakdown[mId]) {
                const driverObj = state.drivers.find(d => d.id === mId);
                driverBreakdown[mId] = {
                    name: driverObj ? driverObj.nome_completo : (r.motoristas?.nome_completo || 'NÃO INFORMADO'),
                    litros: 0
                };
            }
            driverBreakdown[mId].litros += litrosVal;
        });

        if (mode === 'veiculo' && vRecords.length >= 2) {
            kmRodado = vRecords[vRecords.length - 1].km_atual - vRecords[0].km_atual;
        } else if ((mode === 'motorista' || mode === 'modelo') && vRecords.length > 0) {
            const vehiclesMap = {};
            vRecords.forEach(r => {
                if (!vehiclesMap[r.veiculo_id]) vehiclesMap[r.veiculo_id] = [];
                vehiclesMap[r.veiculo_id].push(r);
            });
            for (const v_id in vehiclesMap) {
                const recs = vehiclesMap[v_id].sort((a,b) => smartParseDate(a.data, a.horario) - smartParseDate(b.data, b.horario));
                if (recs.length >= 2) {
                    kmRodado += recs[recs.length - 1].km_atual - recs[0].km_atual;
                }
            }
        }

        if (kmRodado > 0 && totalLitros > 0) {
            media = kmRodado / totalLitros;
            custoKm = totalGasto / kmRodado;
        } else if (totalGasto > 0 && totalLitros > 0) {
            custoKm = totalGasto / totalLitros;
        }

        const fuelStr = Object.entries(fuelBreakdown)
            .sort((a,b) => b[1] - a[1])
            .map(([k,v]) => `${k}: ${v.toLocaleString('pt-BR')} L`)
            .join('\n');

        const driverStr = Object.values(driverBreakdown)
            .sort((a,b) => b.litros - a.litros)
            .map(d => `${d.name.length > 15 ? d.name.substring(0,15) + '..' : d.name}: ${d.litros.toLocaleString('pt-BR')} L`)
            .join('\n');

        computedRows.push({
            entityName,
            fuelStr: fuelStr || '-',
            driverStr: driverStr || '-',
            totalGasto,
            totalLitros,
            kmRodado,
            media,
            custoKm
        });
    });

    if (state.custoTotalSort) {
        const sortConfig = state.custoTotalSort;
        computedRows.sort((a, b) => {
            let valA = a[sortConfig.key];
            let valB = b[sortConfig.key];

            if (typeof valA === 'string') {
                valA = valA.toLowerCase();
                valB = (valB || '').toString().toLowerCase();
                const res = valA.localeCompare(valB, undefined, {numeric: true});
                return sortConfig.dir === 'asc' ? res : -res;
            } else {
                if (valA < valB) return sortConfig.dir === 'asc' ? -1 : 1;
                if (valA > valB) return sortConfig.dir === 'asc' ? 1 : -1;
                return 0;
            }
        });
    }

    const rows = computedRows.map(row => [
        row.entityName,
        row.fuelStr,
        row.driverStr,
        row.totalGasto.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'}),
        `${row.totalLitros.toLocaleString('pt-BR')} L/m³`,
        row.kmRodado > 0 ? `${row.kmRodado.toLocaleString('pt-BR')} km` : '---',
        row.media > 0 ? `${row.media.toFixed(2)} km/l` : '---',
        row.custoKm > 0 ? row.custoKm.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'}) : '---'
    ]);

    if (rows.length === 0) {
        showToast('Nenhum dado encontrado para gerar o PDF.', 'warning');
        return;
    }

    doc.autoTable({
        startY: 42,
        head: [['Referência', 'Combustíveis (Qtd.)', 'Condutores (Qtd.)', 'Total Gasto', 'Qtd. Litros', 'KM Rodado', 'Média', 'Custo/KM']],
        body: rows,
        theme: 'grid',
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 3, textColor: [51, 65, 85] },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
            0: { fontStyle: 'bold', textColor: [15, 23, 42], cellWidth: 35 },
            1: { cellWidth: 35 },
            2: { cellWidth: 40 },
            3: { halign: 'right' },
            4: { halign: 'right' },
            5: { halign: 'right' },
            6: { halign: 'right', fontStyle: 'bold', textColor: [16, 185, 129] },
            7: { halign: 'right', fontStyle: 'bold', textColor: [239, 68, 68] }
        }
    });

    // Rodapé Geral da Página
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text('Relatório de Custos Totais - FrotaLink | Inteligência em Gestão de Frota.', 15, doc.internal.pageSize.getHeight() - 10);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, doc.internal.pageSize.getWidth() - 15, doc.internal.pageSize.getHeight() - 10, { align: 'right' });

    // Salvar PDF
    doc.save(`Custo_Total_Abastecimento_${new Date().getTime()}.pdf`);
    showToast('PDF de custo total baixado com sucesso!', 'success');
};

window.exportComparativoToPDF = () => {
    const startStr = document.getElementById('comp_filter_start').value;
    const endStr = document.getElementById('comp_filter_end').value;
    const startDate = startStr ? new Date(startStr + 'T00:00:00') : null;
    const endDate = endStr ? new Date(endStr + 'T23:59:59') : null;

    const periodVal = document.getElementById('comp_filter_periodo').value;
    const maxKmDiff = periodVal.startsWith('km_') ? parseInt(periodVal.replace('km_', ''), 10) : null;

    const tipo = state.compMode || 'veiculo';

    // Filtrar os registros base por data
    const periodRecords = state.fuelingRecords.filter(f => {
        const d = smartParseDate(f.data, f.horario);
        if (startDate && d < startDate) return false;
        if (endDate && d > endDate) return false;
        return true;
    });

    // INTELLIGENT ROUTING BASED ON ACTIVE SUB-TAB
    const isCustoTotalActive = document.getElementById('subtab_custo_total').style.display === 'block';
    if (isCustoTotalActive) {
        // Filter by Classificacao Checkboxes
        const checkedClasses = Array.from(document.querySelectorAll('.filter-classificacao-ct:checked')).map(cb => cb.value.toUpperCase());
        const filteredRecords = periodRecords.filter(r => {
            const vehicle = state.vehicles.find(v => v.id === r.veiculo_id);
            const classif = vehicle ? (vehicle.classificacao || '').toUpperCase() : '';
            return checkedClasses.includes(classif);
        });

        exportCustoTotalToPDF(filteredRecords, tipo, maxKmDiff, startStr, endStr);
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = jsPDF('l', 'mm', 'a4'); // Landscape A4 (297mm x 210mm)

    let bestMediaVal = 0;
    let bestMediaCol = -1;
    let bestCustoVal = Infinity;
    let bestCustoCol = -1;

    const colData = [null, null, null, null]; // 1-based index

    [1, 2, 3].forEach(col => {
        const alvoId = document.getElementById(`comp_alvo_${col}`).value;
        if (!alvoId) return;

        let vRecords = [];
        let entityName = '';
        let entitySubtitle = '';

        if (tipo === 'veiculo') {
            const vehicle = state.vehicles.find(v => v.id === alvoId);
            if (vehicle) {
                entityName = vehicle.placa;
                entitySubtitle = `${vehicle.modelo} ${vehicle.classificacao ? '• ' + vehicle.classificacao : ''}`;
            }
            vRecords = periodRecords.filter(r => r.veiculo_id === alvoId);
        } else if (tipo === 'motorista') {
            const driver = state.drivers.find(d => d.id === alvoId);
            if (driver) {
                entityName = driver.nome_completo;
                entitySubtitle = 'Condutor / Motorista';
            }
            vRecords = periodRecords.filter(r => r.motorista_id === alvoId);
        } else if (tipo === 'modelo') {
            entityName = alvoId;
            entitySubtitle = 'Modelo de Veículo';
            vRecords = periodRecords.filter(r => {
                const v = state.vehicles.find(veh => veh.id === r.veiculo_id);
                return v && `${v.marca} ${v.modelo}`.trim() === alvoId;
            });
        }

        vRecords.sort((a,b) => smartParseDate(a.data, a.horario) - smartParseDate(b.data, b.horario));

        if (maxKmDiff !== null) {
            const byVeh = {};
            vRecords.forEach(r => {
                if (!byVeh[r.veiculo_id]) byVeh[r.veiculo_id] = [];
                byVeh[r.veiculo_id].push(r);
            });
            
            const filtered = [];
            for (const vId in byVeh) {
                const recs = byVeh[vId];
                if (recs.length === 0) continue;
                const maxKm = Math.max(...recs.map(r => parseFloat(r.km_atual) || 0));
                recs.forEach(r => {
                    const km = parseFloat(r.km_atual) || 0;
                    if (km >= (maxKm - maxKmDiff) && km <= maxKm) {
                        filtered.push(r);
                    }
                });
            }
            vRecords = filtered;
            vRecords.sort((a,b) => smartParseDate(a.data, a.horario) - smartParseDate(b.data, b.horario));
        }

        if (vRecords.length === 0) {
            colData[col] = {
                empty: true,
                entityName,
                entitySubtitle
            };
            return;
        }

        let totalGasto = 0;
        let totalLitros = 0;
        let kmRodado = 0;

        const fuelBreakdown = {};
        const driverBreakdown = {};
        const vehicleBreakdown = {};
        vRecords.forEach(r => {
            const gastoVal = parseFloat(r.valor_total) || 0;
            const litrosVal = parseFloat(r.litros) || 0;

            totalGasto += gastoVal;
            totalLitros += litrosVal;
            const fType = r.tipo_combustivel || 'NÃO INFORMADO';
            if (!fuelBreakdown[fType]) fuelBreakdown[fType] = { litros: 0, gasto: 0 };
            fuelBreakdown[fType].litros += litrosVal;
            fuelBreakdown[fType].gasto += gastoVal;

            // Driver breakdown
            const mId = r.motorista_id || 'N/A';
            if (!driverBreakdown[mId]) {
                const driverObj = state.drivers.find(d => d.id === mId);
                driverBreakdown[mId] = {
                    name: driverObj ? driverObj.nome_completo : (r.motoristas?.nome_completo || 'NÃO INFORMADO'),
                    litros: 0,
                    gasto: 0
                };
            }
            driverBreakdown[mId].litros += litrosVal;
            driverBreakdown[mId].gasto += gastoVal;

            // Vehicle breakdown
            const vId = r.veiculo_id || 'N/A';
            if (!vehicleBreakdown[vId]) {
                const vehicleObj = state.vehicles.find(v => v.id === vId);
                vehicleBreakdown[vId] = {
                    placa: vehicleObj ? vehicleObj.placa : (r.veiculos?.placa || 'PLACA N/A'),
                    modelo: vehicleObj ? vehicleObj.modelo : (r.veiculos?.modelo || ''),
                    litros: 0,
                    gasto: 0
                };
            }
            vehicleBreakdown[vId].litros += litrosVal;
            vehicleBreakdown[vId].gasto += gastoVal;
        });

        if (tipo === 'veiculo' && vRecords.length >= 2) {
            kmRodado = vRecords[vRecords.length - 1].km_atual - vRecords[0].km_atual;
        } else if ((tipo === 'motorista' || tipo === 'modelo') && vRecords.length > 0) {
            const vehiclesMap = {};
            vRecords.forEach(r => {
                if (!vehiclesMap[r.veiculo_id]) vehiclesMap[r.veiculo_id] = [];
                vehiclesMap[r.veiculo_id].push(r);
            });
            for (const v_id in vehiclesMap) {
                const recs = vehiclesMap[v_id].sort((a,b) => smartParseDate(a.data, a.horario) - smartParseDate(b.data, b.horario));
                if (recs.length >= 2) {
                    kmRodado += recs[recs.length - 1].km_atual - recs[0].km_atual;
                }
            }
        }

        let media = 0;
        let custoKm = 0;
        if (kmRodado > 0 && totalLitros > 0) {
            media = kmRodado / totalLitros;
            custoKm = totalGasto / kmRodado;
        } else if (totalGasto > 0 && totalLitros > 0) {
            custoKm = totalGasto / totalLitros;
        }

        colData[col] = {
            empty: false,
            entityName,
            entitySubtitle,
            totalGasto,
            totalLitros,
            kmRodado,
            media,
            custoKm,
            fuelBreakdown,
            driverBreakdown,
            vehicleBreakdown,
            recordsCount: vRecords.length
        };

        if (media > 0 && media > bestMediaVal) {
            bestMediaVal = media;
            bestMediaCol = col;
        }
        if (custoKm > 0 && custoKm < bestCustoVal) {
            bestCustoVal = custoKm;
            bestCustoCol = col;
        }
    });

    if (!colData[1] && !colData[2] && !colData[3]) {
        showToast('Selecione pelo menos um item para exportar o PDF comparativo.', 'warning');
        return;
    }

    // Fundo do Header
    doc.setFillColor(15, 23, 42); // #0f172a (dark style)
    doc.rect(0, 0, 297, 35, 'F');

    // Título Principal
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('FROTALINK | Relatório Comparativo de Abastecimento', 15, 20);

    // Subtítulo e Filtros Aplicados
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184); // grey

    let dateRangeText = 'Todo o período';
    if (maxKmDiff !== null) {
        dateRangeText = `Últimos ${maxKmDiff.toLocaleString('pt-BR')} km`;
    } else if (startStr || endStr) {
        const formatD = (s) => {
            if (!s) return '';
            const [y,m,d] = s.split('-');
            return `${d}/${m}/${y}`;
        };
        dateRangeText = `${formatD(startStr) || 'Início'} até ${formatD(endStr) || 'Fim'}`;
    }
    const modeText = tipo === 'veiculo' ? 'Placa' : tipo === 'modelo' ? 'Modelo de Veículo' : 'Condutor';
    doc.text(`Período de Filtro: ${dateRangeText}   |   Comparação por: ${modeText}`, 15, 28);

    // Renderizar os 3 Cards Lado a Lado
    const cardY = 42;
    const cardWidth = 84;
    const cardHeight = 150;
    const gap = 7.5;
    const startX = 15;

    [1, 2, 3].forEach(col => {
        const x = startX + (col - 1) * (cardWidth + gap);
        const data = colData[col];

        if (!data) {
            // Desenhar card de coluna não selecionada
            doc.setFillColor(30, 41, 59, 0.2);
            doc.setDrawColor(51, 65, 85, 0.4);
            doc.setLineWidth(0.3);
            doc.roundedRect(x, cardY, cardWidth, cardHeight, 3, 3, 'FD');

            doc.setFontSize(9);
            doc.setFont('helvetica', 'italic');
            doc.setTextColor(100, 116, 139);
            doc.text('Coluna não selecionada', x + cardWidth / 2, cardY + cardHeight / 2, { align: 'center' });
            return;
        }

        if (data.empty) {
            // Desenhar card ativo mas sem dados
            doc.setFillColor(30, 41, 59, 0.6);
            doc.setDrawColor(51, 65, 85);
            doc.setLineWidth(0.3);
            doc.roundedRect(x, cardY, cardWidth, cardHeight, 3, 3, 'FD');

            // Header do Card
            doc.setFillColor(15, 23, 42);
            doc.roundedRect(x + 0.3, cardY + 0.3, cardWidth - 0.6, 22, 2.5, 2.5, 'F');

            doc.setFontSize(10.5);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(255, 255, 255);
            doc.text(data.entityName || 'N/A', x + 6, cardY + 10);

            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(148, 163, 184);
            doc.text(data.entitySubtitle || '', x + 6, cardY + 17);

            // Mensagem de vazio
            doc.setFontSize(8.5);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(148, 163, 184);
            doc.text('Nenhum abastecimento no período', x + cardWidth / 2, cardY + cardHeight / 2, { align: 'center' });
            return;
        }

        // Desenhar card ativo
        doc.setFillColor(30, 41, 59); // #1e293b
        doc.setDrawColor(51, 65, 85);
        doc.setLineWidth(0.3);
        doc.roundedRect(x, cardY, cardWidth, cardHeight, 3, 3, 'FD');

        // Header do Card
        doc.setFillColor(15, 23, 42);
        doc.roundedRect(x + 0.3, cardY + 0.3, cardWidth - 0.6, 22, 2.5, 2.5, 'F');

        doc.setFontSize(10.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text(data.entityName, x + 6, cardY + 10);

        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(148, 163, 184);
        doc.text(data.entitySubtitle, x + 6, cardY + 17);

        // Linhas de Métricas
        const rowHeight = 11;
        let rowY = cardY + 32;

        const drawRow = (label, valStr, isHighlighted = false, isBest = false) => {
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(148, 163, 184);
            doc.text(label, x + 8, rowY);

            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            if (isHighlighted) {
                if (isBest) {
                    doc.setTextColor(16, 185, 129); // #10b981 (Success Green)
                } else {
                    doc.setTextColor(255, 255, 255);
                }
            } else {
                doc.setTextColor(255, 255, 255);
            }

            let printVal = valStr;
            if (isBest) printVal += ' (Melhor)';
            doc.text(printVal, x + cardWidth - 8, rowY, { align: 'right' });

            // Divisor sutil
            doc.setDrawColor(51, 65, 85);
            doc.setLineWidth(0.15);
            doc.line(x + 6, rowY + 3.5, x + cardWidth - 6, rowY + 3.5);

            rowY += rowHeight;
        };

        drawRow('Total Gasto', data.totalGasto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
        drawRow('Qtd. Litros/m³', `${data.totalLitros.toLocaleString('pt-BR')} L/m³`);
        drawRow('KM Rodado', data.kmRodado > 0 ? `${data.kmRodado.toLocaleString('pt-BR')} km` : '---');
        drawRow('Média Consumo', data.media > 0 ? `${data.media.toFixed(2)} km/l` : '---', true, col === bestMediaCol);
        drawRow('Custo por KM', data.custoKm > 0 ? data.custoKm.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '---', true, col === bestCustoCol);

        // Detalhamento de Combustível Header
        rowY += 2;
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(129, 140, 248); // Indigo #818cf8
        doc.text('DETALHAMENTO POR COMBUSTÍVEL', x + 8, rowY);
        rowY += 5;

        // Lista de Combustíveis Consumidos
        for (const ft in data.fuelBreakdown) {
            doc.setFontSize(7);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(148, 163, 184);
            doc.text(ft, x + 8, rowY);

            doc.setFont('helvetica', 'bold');
            doc.setTextColor(255, 255, 255);
            const litersStr = `${data.fuelBreakdown[ft].litros.toLocaleString('pt-BR')} L/m³`;
            doc.text(litersStr, x + cardWidth - 8, rowY, { align: 'right' });

            rowY += 3;
            doc.setFontSize(6.5);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(148, 163, 184);
            const spentStr = data.fuelBreakdown[ft].gasto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            doc.text(spentStr, x + cardWidth - 8, rowY, { align: 'right' });

            rowY += 4.5;
        }

        // USO POR CONDUTORES
        if ((tipo === 'veiculo' || tipo === 'modelo') && data.driverBreakdown) {
            rowY += 1.5;
            doc.setFontSize(7.5);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(129, 140, 248); // Indigo #818cf8
            doc.text('USO POR CONDUTORES', x + 8, rowY);
            rowY += 4.5;

            const sortedDrivers = Object.values(data.driverBreakdown).sort((a,b) => b.gasto - a.gasto);
            sortedDrivers.forEach(d => {
                doc.setFontSize(7);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(148, 163, 184);
                let dName = d.name;
                if (dName.length > 22) dName = dName.substring(0, 20) + '..';
                doc.text(dName, x + 8, rowY);

                doc.setFont('helvetica', 'bold');
                doc.setTextColor(255, 255, 255);
                const litersStr = `${d.litros.toLocaleString('pt-BR')} L/m³`;
                doc.text(litersStr, x + cardWidth - 8, rowY, { align: 'right' });

                rowY += 3;
                doc.setFontSize(6.5);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(148, 163, 184);
                const spentStr = d.gasto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                doc.text(spentStr, x + cardWidth - 8, rowY, { align: 'right' });

                rowY += 4.5;
            });
        }

        // USO POR PLACAS
        if ((tipo === 'motorista' || tipo === 'modelo') && data.vehicleBreakdown) {
            rowY += 1.5;
            doc.setFontSize(7.5);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(16, 185, 129); // #10b981 (Success Green)
            doc.text('USO POR PLACAS', x + 8, rowY);
            rowY += 4.5;

            const sortedVehs = Object.values(data.vehicleBreakdown).sort((a,b) => b.gasto - a.gasto);
            sortedVehs.forEach(v => {
                doc.setFontSize(7);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(148, 163, 184);
                let vLabel = `${v.placa} ${v.modelo ? '(' + v.modelo.substring(0, 10) + ')' : ''}`;
                if (vLabel.length > 22) vLabel = vLabel.substring(0, 20) + '..';
                doc.text(vLabel, x + 8, rowY);

                doc.setFont('helvetica', 'bold');
                doc.setTextColor(255, 255, 255);
                const litersStr = `${v.litros.toLocaleString('pt-BR')} L/m³`;
                doc.text(litersStr, x + cardWidth - 8, rowY, { align: 'right' });

                rowY += 3;
                doc.setFontSize(6.5);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(148, 163, 184);
                const spentStr = v.gasto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                doc.text(spentStr, x + cardWidth - 8, rowY, { align: 'right' });

                rowY += 4.5;
            });
        }

        // Rodapé interno do card
        doc.setFontSize(7);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(148, 163, 184);
        doc.text(`${data.recordsCount} abastecimento(s) no período`, x + cardWidth / 2, cardY + cardHeight - 5, { align: 'center' });
    });

    // Rodapé Geral da Página
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text('Relatório Comparativo de Abastecimento - FrotaLink | Inteligência em Gestão de Frota.', 15, 198);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 282, 198, { align: 'right' });

    // Salvar PDF
    doc.save(`Comparativo_Abastecimento_${new Date().getTime()}.pdf`);
    showToast('PDF comparativo baixado com sucesso!', 'success');
};

