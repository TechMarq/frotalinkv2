// ============================================================
//  operacao.js — Centro de Operações Unificado | FrotaLink
//  Consolidação de Frota Própria Alocada e Prestadores Comerciais
// ============================================================

let sb = null;
let todosItensOperacao = [];
let itensFiltrados = [];
let tabAtual = 'todos'; // 'todos' | 'frota' | 'prestadores'

let ordenacaoAtual = {
    coluna: 'origem',
    direcao: 'desc' // 'desc' para que CASA apareça antes de AGREGADO
};

// ─── INICIALIZAÇÃO ───
document.addEventListener('DOMContentLoaded', () => {
    function aguardarAuth(tentativas = 0) {
        if (window.authClient) {
            sb = window.authClient;
            initOperacao();
        } else if (tentativas < 25) {
            setTimeout(() => aguardarAuth(tentativas + 1), 150);
        } else if (window.supabase) {
            sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
            initOperacao();
        }
    }
    aguardarAuth();

    // Event Listeners
    const searchInput = document.getElementById('search-operacao');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            aplicarFiltros();
        });
    }

    const btnRefresh = document.getElementById('btn-refresh-ops');
    if (btnRefresh) {
        btnRefresh.addEventListener('click', () => {
            btnRefresh.classList.add('spinning');
            setTimeout(() => btnRefresh.classList.remove('spinning'), 800);
            carregarOperacao();
        });
    }

    const btnExport = document.getElementById('btn-export-excel');
    if (btnExport) {
        btnExport.addEventListener('click', exportarParaExcel);
    }

    // Tecla ESC para fechar modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') fecharModalDetalhes();
    });
});

async function initOperacao() {
    await carregarOperacao();
}

function mostrarLoading(show) {
    const el = document.getElementById('loading-overlay');
    if (el) el.style.display = show ? 'flex' : 'none';
}

function fmtDataBR(dateStr) {
    if (!dateStr) return '-';
    const parts = dateStr.slice(0, 10).split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function limparTelefone(tel) {
    if (!tel) return '';
    return String(tel).replace(/\D/g, '');
}

function formatarTelefone(tel) {
    const clean = limparTelefone(tel);
    if (!clean) return '-';
    if (clean.length === 11) {
        return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
    }
    if (clean.length === 10) {
        return `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`;
    }
    return tel;
}

// ─── CARREGAMENTO DOS DADOS NO SUPABASE ───
async function carregarOperacao() {
    mostrarLoading(true);
    try {
        const hoje = new Date().toISOString().slice(0, 10);
        const em30 = new Date();
        em30.setDate(em30.getDate() + 30);
        const em30Str = em30.toISOString().slice(0, 10);

        // Consultas diretas e seguras sem depender de foreign keys no PostgREST
        const [veicRes, prestRes, motRes] = await Promise.allSettled([
            sb.from('veiculos').select('*').order('placa', { ascending: true }),
            sb.from('com_prestadores').select('*').order('nome_prestador', { ascending: true }),
            sb.from('motoristas').select('*').order('nome_completo', { ascending: true })
        ]);

        const veiculos = (veicRes.status === 'fulfilled' && veicRes.value.data) ? veicRes.value.data : [];
        const prestadores = (prestRes.status === 'fulfilled' && prestRes.value.data) ? prestRes.value.data : [];
        const motoristas = (motRes.status === 'fulfilled' && motRes.value.data) ? motRes.value.data : [];

        // Mapa de motoristas por ID para vinculação imediata
        const motoristaMap = {};
        motoristas.forEach(m => {
            if (m && m.id) motoristaMap[m.id] = m;
        });

        const itens = [];

        // 1. Processar Veículos da Frota Própria (CASA)
        // Regra: Veículos da Frota entram com sua REAL alocação (Manutenção, Garagem, Disponível ou com Condutor Alocado)
        // Apenas veículos com status estritamente INATIVO são desconsiderados.
        const frotaVeiculos = veiculos.filter(v => {
            const statusUpper = (v.status || 'ATIVO').toUpperCase();
            return statusUpper !== 'INATIVO';
        });

        let frotaAlocadosCount = 0;

        frotaVeiculos.forEach(v => {
            const statusAloc = (v.status_alocacao || '').toUpperCase();
            const m1Id = v.motorista_alocado_id;
            const m2Id = v.motorista_alocado_2_id;
            const m1 = m1Id ? motoristaMap[m1Id] : null;
            const m2 = m2Id ? motoristaMap[m2Id] : null;

            let isAlocado = false;
            let statusLabel = 'ATIVO';
            let statusClass = 'status-pill-ativo';
            let condutorNomeDisplay = '-';
            let condutorSubDisplay = '';
            let condutor1Data = {
                nome: '-',
                telefone: '',
                cnh: '-',
                catCnh: '-',
                vencCnh: '',
                cpf: '-'
            };

            if (statusAloc === 'MANUTENCAO') {
                isAlocado = false;
                statusLabel = 'MANUTENÇÃO';
                statusClass = 'status-pill-manut';
                condutorNomeDisplay = 'Em Manutenção';
                if (v.manutencao_oficina_id) {
                    condutorSubDisplay = `Oficina: ${v.manutencao_oficina_id}`;
                }
                condutor1Data.nome = condutorNomeDisplay;
            } else if (statusAloc === 'GARAGEM') {
                isAlocado = false;
                statusLabel = 'GARAGEM';
                statusClass = 'status-pill-garagem';
                condutorNomeDisplay = 'Em Garagem';
                condutor1Data.nome = condutorNomeDisplay;
            } else if (statusAloc === 'DISPONIVEL') {
                isAlocado = false;
                statusLabel = 'DISPONÍVEL';
                statusClass = 'status-pill-disponivel';
                condutorNomeDisplay = 'Disponível';
                condutor1Data.nome = condutorNomeDisplay;
            } else if (m1 && m1.nome_completo) {
                // Efetivamente alocado com condutor operacional
                isAlocado = true;
                frotaAlocadosCount++;
                statusLabel = 'ATIVO';
                statusClass = 'status-pill-ativo';
                condutorNomeDisplay = m1.nome_completo;
                condutor1Data = {
                    nome: m1.nome_completo,
                    telefone: m1.contato_whatsapp || '',
                    cnh: m1.registro_cnh || '-',
                    catCnh: m1.categoria_cnh || '-',
                    vencCnh: m1.vencimento_cnh || '',
                    cpf: m1.cpf || '-'
                };
            } else if (m2 && m2.nome_completo) {
                isAlocado = true;
                frotaAlocadosCount++;
                statusLabel = 'ATIVO';
                statusClass = 'status-pill-ativo';
                condutorNomeDisplay = m2.nome_completo;
                condutor1Data = {
                    nome: m2.nome_completo,
                    telefone: m2.contato_whatsapp || '',
                    cnh: m2.registro_cnh || '-',
                    catCnh: m2.categoria_cnh || '-',
                    vencCnh: m2.vencimento_cnh || '',
                    cpf: m2.cpf || '-'
                };
            } else {
                // Sem motorista alocado e sem flag especial
                isAlocado = false;
                statusLabel = 'DISPONÍVEL';
                statusClass = 'status-pill-disponivel';
                condutorNomeDisplay = 'Disponível';
                condutor1Data.nome = condutorNomeDisplay;
            }

            const alertas = [];
            if (isAlocado) {
                if (m1 && m1.vencimento_cnh) {
                    if (m1.vencimento_cnh < hoje) alertas.push(`CNH 1º Condutor Vencida (${fmtDataBR(m1.vencimento_cnh)})`);
                    else if (m1.vencimento_cnh <= em30Str) alertas.push(`CNH 1º Condutor Vencendo (${fmtDataBR(m1.vencimento_cnh)})`);
                }
                if (m2 && m2.vencimento_cnh) {
                    if (m2.vencimento_cnh < hoje) alertas.push(`CNH 2º Condutor Vencida (${fmtDataBR(m2.vencimento_cnh)})`);
                    else if (m2.vencimento_cnh <= em30Str) alertas.push(`CNH 2º Condutor Vencendo (${fmtDataBR(m2.vencimento_cnh)})`);
                }
            }
            if (v.vencimento_seguro) {
                if (v.vencimento_seguro < hoje) alertas.push(`Seguro do Veículo Vencido (${fmtDataBR(v.vencimento_seguro)})`);
                else if (v.vencimento_seguro <= em30Str) alertas.push(`Seguro Vencendo em 30d (${fmtDataBR(v.vencimento_seguro)})`);
            }

            itens.push({
                id: v.id,
                origem: 'FROTA',
                origemBadgeClass: 'badge-frota',
                origemLabel: 'CASA',
                placa: v.placa || '-',
                temPlaca: Boolean(v.placa && v.placa.trim() && v.placa.trim().toUpperCase() !== 'SEM PLACA'),
                marca: v.marca || '',
                modelo: v.modelo || '',
                veiculoDesc: `${v.marca || ''} ${v.modelo || ''}`.trim() || 'Veículo da Casa',
                ano: v.ano_modelo || v.ano_fabricacao || '-',
                cor: v.cor || '-',
                isAlocado: isAlocado,
                subtextAlocacao: condutorSubDisplay,
                condutor1: condutor1Data,
                condutor2: (isAlocado && m2 && m1) ? {
                    nome: m2.nome_completo || '2º Condutor',
                    telefone: m2.contato_whatsapp || '',
                    cnh: m2.registro_cnh || '-',
                    catCnh: m2.categoria_cnh || '-',
                    vencCnh: m2.vencimento_cnh || '',
                    cpf: m2.cpf || '-'
                } : null,
                temDupla: Boolean(isAlocado && m1 && m2 && m1.nome_completo && m2.nome_completo),
                regimeContrato: 'Casa (CLT)',
                status: statusLabel,
                statusClass: statusClass,
                alertas: [],
                temAlerta: false,
                // Campos extras para modal
                fipe: v.valor_fipe_mes || 0,
                seguroApolice: v.numero_apolice || v.apolice_seguro || '-',
                seguroVenc: v.vencimento_seguro || '',
                raw: v
            });
        });

        // 2. Processar Prestadores de Serviços (Comercial / Agregados)
        prestadores.forEach(p => {
            const rawStatus = (p.status || 'ativo').toLowerCase();
            const isAtivo = rawStatus.includes('ativo');
            const statusLabel = isAtivo ? 'ATIVO' : 'INATIVO';
            const statusClass = isAtivo ? 'status-pill-ativo' : 'status-pill-manut';

            const docFiscal = p.tipo_contrato === 'CNPJ' ? (p.cnpj || p.cpf || '-') : (p.cpf || p.cnpj || '-');
            const temPlaca = Boolean(p.placa && p.placa.trim() && p.placa.trim().toUpperCase() !== 'SEM PLACA');
            const placaStr = temPlaca ? p.placa.trim().toUpperCase() : 'Sem Placa';

            itens.push({
                id: p.id,
                origem: 'PRESTADOR',
                origemBadgeClass: 'badge-prestador',
                origemLabel: 'AGREGADO',
                placa: placaStr,
                temPlaca: temPlaca,
                marca: p.marca || '',
                modelo: p.modelo || '',
                veiculoDesc: `${p.marca || ''} ${p.modelo || ''}`.trim() || 'Veículo Agregado',
                ano: p.ano_modelo || p.ano_fabricacao || '-',
                cor: p.cor || '-',
                condutor1: {
                    nome: p.nome_prestador || 'Agregado',
                    telefone: p.nome_documento || '',
                    cnh: '-',
                    catCnh: '-',
                    vencCnh: '',
                    cpf: docFiscal
                },
                condutor2: null,
                temDupla: false,
                regimeContrato: `Agregado (${p.tipo_contrato || 'Contrato'})`,
                status: statusLabel,
                statusClass: statusClass,
                alertas: [],
                temAlerta: false,
                // Campos extras para modal
                rastreador: p.rastreador || 'N/A',
                seguroApp: p.seguro_app || 'N/A',
                comodato: p.comodato_locacao || 'N/A',
                veiculoCompartilhado: p.veiculo_compartilhado || 'N/A',
                vistoriaProxima: p.data_proxima_vistoria || '',
                linkDocumentos: p.link_documentos || '',
                observacao: p.observacao || '',
                pendenciaDescricao: p.pendencia_descricao || '',
                raw: p
            });
        });

        todosItensOperacao = itens;
        atualizarKPIs(frotaAlocadosCount, frotaVeiculos.length, prestadores.length);
        aplicarFiltros();

    } catch (err) {
        console.error('[Operação] Erro ao carregar dados operacionais:', err);
    } finally {
        mostrarLoading(false);
    }
}

// ─── CÁLCULO E RENDERIZAÇÃO DOS KPIS DO TOPO ───
function atualizarKPIs(frotaAlocadosCount, totalFrotaCount, prestadoresCount) {
    const totalGeral = todosItensOperacao.length;

    // Motoristas da Frota
    let motoristasFrota = 0;
    let duplasCount = 0;
    todosItensOperacao.filter(it => it.origem === 'FROTA').forEach(it => {
        if (it.isAlocado && it.condutor1 && it.condutor1.nome && it.condutor1.nome !== 'Sem titular designado') motoristasFrota++;
        if (it.temDupla) {
            motoristasFrota++;
            duplasCount++;
        }
    });

    const prestadoresAtivos = todosItensOperacao.filter(it => it.origem === 'PRESTADOR' && it.status === 'ATIVO').length;
    const totalAlertas = todosItensOperacao.filter(it => it.temAlerta).length;

    // Elementos DOM
    const setElem = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    setElem('kpi-ops-total', totalGeral);
    setElem('kpi-ops-frota', totalFrotaCount);
    setElem('kpi-ops-frota-sub', `${frotaAlocadosCount} alocados em atividade`);

    setElem('kpi-ops-motoristas', motoristasFrota);
    setElem('kpi-ops-prestadores', prestadoresAtivos);
    setElem('kpi-ops-duplas', duplasCount);
    setElem('kpi-ops-alertas', totalAlertas);

    // Contadores das Abas
    setElem('tab-count-todos', totalGeral);
    setElem('tab-count-frota', totalFrotaCount);
    setElem('tab-count-prestadores', todosItensOperacao.filter(it => it.origem === 'PRESTADOR').length);
}

// ─── NAVEGAÇÃO DE ABAS (Pill Tabs) ───
window.switchOpsTab = function(tabName) {
    tabAtual = tabName;
    document.querySelectorAll('.tabs-header .tab-item').forEach(btn => btn.classList.remove('active'));
    
    // Ativa botão correspondente
    const activeBtn = Array.from(document.querySelectorAll('.tabs-header .tab-item')).find(b => {
        const span = b.querySelector('span');
        if (!span) return false;
        if (tabName === 'todos') return span.textContent.includes('Consolidada');
        if (tabName === 'frota') return span.textContent.includes('Casa');
        if (tabName === 'prestadores') return span.textContent.includes('Agregados');
        return false;
    });
    if (activeBtn) activeBtn.classList.add('active');

    // Sincroniza o select de origem caso o usuário prefira
    const filterOrigem = document.getElementById('filter-origem');
    if (filterOrigem) {
        if (tabName === 'frota') filterOrigem.value = 'FROTA';
        else if (tabName === 'prestadores') filterOrigem.value = 'PRESTADOR';
        else filterOrigem.value = 'todos';
    }

    aplicarFiltros();
};

// ─── FILTRAGEM E BUSCA MULTIFATORIAL ───
window.aplicarFiltros = function() {
    const searchVal = (document.getElementById('search-operacao')?.value || '').toLowerCase().trim();
    const filterOrigem = document.getElementById('filter-origem')?.value || 'todos';
    const filterStatus = document.getElementById('filter-status')?.value || 'todos';

    itensFiltrados = todosItensOperacao.filter(it => {
        // Filtro da Aba Atual
        if (tabAtual === 'frota' && it.origem !== 'FROTA') return false;
        if (tabAtual === 'prestadores' && it.origem !== 'PRESTADOR') return false;

        // Filtro de Origem no Select
        if (filterOrigem !== 'todos' && it.origem !== filterOrigem) return false;

        // Filtro de Status
        if (filterStatus === 'ativos' && !it.isAlocado) return false;
        if (filterStatus === 'manutencao' && it.status !== 'MANUTENÇÃO') return false;
        if (filterStatus === 'garagem' && it.status !== 'GARAGEM') return false;
        if (filterStatus === 'disponivel' && it.status !== 'DISPONÍVEL') return false;
        if (filterStatus === 'inativos' && it.status !== 'INATIVO') return false;
        if (filterStatus === 'duplas' && !it.temDupla) return false;

        // Busca textual
        if (searchVal) {
            const searchable = [
                it.placa,
                it.marca,
                it.modelo,
                it.veiculoDesc,
                it.condutor1?.nome,
                it.condutor1?.cpf,
                it.condutor1?.telefone,
                it.condutor1?.cnh,
                it.condutor2?.nome,
                it.condutor2?.cpf,
                it.regimeContrato,
                it.status
            ].map(s => String(s || '').toLowerCase()).join(' ');

            return searchable.includes(searchVal);
        }

        return true;
    });

    ordenarItens();
    renderTabela();
};

window.limparFiltros = function() {
    const searchEl = document.getElementById('search-operacao');
    if (searchEl) searchEl.value = '';
    const selOrigem = document.getElementById('filter-origem');
    if (selOrigem) selOrigem.value = 'todos';
    const selStatus = document.getElementById('filter-status');
    if (selStatus) selStatus.value = 'todos';
    ordenacaoAtual = {
        coluna: 'origem',
        direcao: 'desc'
    };

    switchOpsTab('todos');
};

// ─── ORDENAÇÃO SEMÂNTICA (Standard UI Pattern) ───
window.sortTable = function(coluna) {
    if (ordenacaoAtual.coluna === coluna) {
        ordenacaoAtual.direcao = ordenacaoAtual.direcao === 'asc' ? 'desc' : 'asc';
    } else {
        ordenacaoAtual.coluna = coluna;
        ordenacaoAtual.direcao = 'asc';
    }
    ordenarItens();
    renderTabela();
};

function ordenarItens() {
    const { coluna, direcao } = ordenacaoAtual;
    const factor = direcao === 'asc' ? 1 : -1;

    itensFiltrados.sort((a, b) => {
        let valA, valB;
        switch (coluna) {
            case 'origem':
                valA = a.origemLabel || '';
                valB = b.origemLabel || '';
                break;
            case 'placa':
                valA = a.placa || '';
                valB = b.placa || '';
                break;
            case 'condutor':
                valA = a.condutor1?.nome || '';
                valB = b.condutor1?.nome || '';
                break;
            case 'status':
                valA = a.status || '';
                valB = b.status || '';
                break;
            default:
                valA = a.origemLabel || '';
                valB = b.origemLabel || '';
        }

        const cmp = (valA || '').toString().localeCompare((valB || '').toString(), 'pt-BR', { numeric: true }) * factor;
        
        // Se empatar na coluna selecionada (ex: ambos são CASA ou ambos são AGREGADO),
        // desempatar pelo nome do condutor em ordem alfabética crescente (A-Z)
        if (cmp === 0) {
            const nomeA = a.condutor1?.nome || '';
            const nomeB = b.condutor1?.nome || '';
            return nomeA.localeCompare(nomeB, 'pt-BR', { numeric: true });
        }

        return cmp;
    });
}

// ─── RENDERIZAÇÃO DA TABELA ───
function renderTabela() {
    const tbody = document.getElementById('operacao-table-body');
    const counter = document.getElementById('table-info-counter');
    if (!tbody) return;

    if (counter) {
        counter.textContent = `Mostrando ${itensFiltrados.length} de ${todosItensOperacao.length} registros operacionais`;
    }

    if (itensFiltrados.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 3.5rem; color: var(--text-muted);">
                    <i data-lucide="inbox" style="width:36px;height:36px;opacity:0.3;margin-bottom:0.6rem;display:block;margin-inline:auto;"></i>
                    Nenhum veículo ou prestador encontrado com os filtros selecionados.
                </td>
            </tr>`;
        if (window.lucide) lucide.createIcons();
        return;
    }

    tbody.innerHTML = itensFiltrados.map((it, idx) => {
        // Condutor 1 Info
        const c1 = it.condutor1 || {};
        const c1Nome = c1.nome || '-';
        const c1Tel = formatarTelefone(c1.telefone);
        const c1CnhInfo = c1.cnh && c1.cnh !== '-' ? `CNH: ${c1.cnh} (${c1.catCnh || 'B'})` : '';

        // Condutor 2 Info (quando Frota) ou Detalhes Contratuais (quando Prestador)
        let col2Html = '';
        if (it.origem === 'FROTA') {
            if (it.temDupla && it.condutor2) {
                const c2 = it.condutor2;
                col2Html = `
                    <div>
                        <div class="ops-dupla-nome">
                            <i data-lucide="user-plus" style="width:12px;height:12px;"></i>
                            <span>${c2.nome}</span>
                        </div>
                        <div class="ops-cell-sub">${formatarTelefone(c2.telefone)}</div>
                    </div>`;
            } else {
                col2Html = `<span class="ops-cell-muted">Sem 2º condutor</span>`;
            }
        } else {
            // Prestador: dados de comodato, rastreador, etc.
            const extras = [];
            if (it.rastreador === 'Sim') extras.push('Rastreador ✓');
            if (it.comodato === 'Sim') extras.push('Comodato ✓');
            if (it.seguroApp === 'Sim') extras.push('Seguro APP ✓');
            col2Html = `
                <div>
                    <div class="ops-extra-badges">${extras.join(' • ') || 'Agregado Direto'}</div>
                    ${it.vistoriaProxima ? `<div class="ops-cell-sub">Próx. Vistoria: ${fmtDataBR(it.vistoriaProxima)}</div>` : ''}
                </div>`;
        }

        // Alertas Badges
        const alertasHtml = it.alertas.map(al => `
            <div class="alert-tag-mini" title="${al}">
                <i data-lucide="alert-circle" style="width:11px;height:11px;"></i>
                <span>${al}</span>
            </div>
        `).join('');

        // Placa pill
        const platePillHtml = it.temPlaca
            ? `<span class="plate-pill">${it.placa}</span>`
            : `<span class="plate-pill-pending"><i data-lucide="help-circle" style="width:11px;height:11px;vertical-align:-1px;"></i> Sem Placa</span>`;

        // Ações: WhatsApp, Detalhes e Drive
        const cleanTel = limparTelefone(c1.telefone || it.condutor2?.telefone);
        const btnWhats = cleanTel ? `
            <a href="https://wa.me/55${cleanTel}?text=${encodeURIComponent(`Olá ${c1Nome}, mensagem operacional sobre o veículo ${it.placa} via FrotaLink:`)}" 
               target="_blank" rel="noopener noreferrer" class="btn-action-icon btn-whatsapp" title="Conversar no WhatsApp">
                <i data-lucide="message-circle" style="width:15px;height:15px;"></i>
            </a>` : `
            <button class="btn-action-icon btn-disabled" title="Sem telefone de WhatsApp cadastrado">
                <i data-lucide="message-circle" style="width:15px;height:15px;"></i>
            </button>`;

        const btnDrive = (it.origem === 'PRESTADOR' && it.linkDocumentos) ? `
            <a href="${it.linkDocumentos}" target="_blank" rel="noopener noreferrer" class="btn-action-icon btn-drive" title="Abrir pasta de documentos no Drive">
                <i data-lucide="folder-git-2" style="width:15px;height:15px;"></i>
            </a>` : '';

        return `
            <tr>
                <td class="td-idx">${idx + 1}</td>
                
                <!-- Origem -->
                <td>
                    <span class="badge-origem ${it.origemBadgeClass}">
                        <i data-lucide="${it.origem === 'FROTA' ? 'truck' : 'handshake'}" style="width:12px;height:12px;"></i>
                        <span>${it.origem === 'FROTA' ? 'CASA' : 'AGREGADO'}</span>
                    </span>
                </td>

                <!-- Veículo / Placa -->
                <td>
                    ${platePillHtml}
                    <div class="ops-veic-desc">
                        ${it.veiculoDesc}
                    </div>
                </td>

                <!-- Condutor Titular / Prestador -->
                <td>
                    <div class="ops-condutor-nome ${!it.isAlocado && it.origem === 'FROTA' ? 'ops-cell-status-driver' : ''}">${c1Nome}</div>
                    ${!it.isAlocado && it.subtextAlocacao ? `<div class="ops-cell-sub">${it.subtextAlocacao}</div>` : ''}
                    ${it.isAlocado || it.origem === 'PRESTADOR' ? (c1Tel !== '-' ? `<div class="ops-cell-sub">${c1Tel}</div>` : '') : ''}
                    ${it.isAlocado || it.origem === 'PRESTADOR' ? (c1CnhInfo ? `<div class="cnh-tag"><i data-lucide="id-card" style="width:11px;height:11px;"></i><span>${c1CnhInfo}</span></div>` : '') : ''}
                </td>

                <!-- 2º Condutor ou Detalhes -->
                <td>${col2Html}</td>

                <!-- Status -->
                <td>
                    <span class="status-pill-ops ${it.statusClass}">${it.status}</span>
                </td>

                <!-- Ações (Apenas WhatsApp) -->
                <td style="text-align: center;">
                    <div class="row-actions" style="justify-content: center;">
                        ${btnWhats}
                    </div>
                </td>
            </tr>`;
    }).join('');

    if (window.lucide) lucide.createIcons();
}

// ─── MODAL DE FICHA OPERACIONAL DETALHADA ───
window.abrirModalDetalhes = function(id) {
    const item = todosItensOperacao.find(it => String(it.id) === String(id));
    if (!item) return;

    const modal = document.getElementById('modal-detalhes-ops');
    const titleEl = document.getElementById('modal-ops-title');
    const bodyEl = document.getElementById('modal-ops-body');
    if (!modal || !bodyEl) return;

    if (titleEl) {
        titleEl.textContent = `Ficha Operacional — ${item.placa} (${item.origemLabel})`;
    }

    const c1 = item.condutor1 || {};
    const c2 = item.condutor2 || null;

    let especificoHtml = '';
    if (item.origem === 'FROTA') {
        especificoHtml = `
            <div class="info-section">
                <div class="info-section-title">
                    <i data-lucide="shield"></i> Seguro do Veículo & Patrimônio
                </div>
                <div class="info-grid-3">
                    <div>
                        <div class="info-field-label">Valor Tabela FIPE</div>
                        <div class="info-field-val" style="color:#2d9e6b; font-weight:800;">R$ ${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(item.fipe || 0)}</div>
                    </div>
                    <div>
                        <div class="info-field-label">Vencimento do Seguro</div>
                        <div class="info-field-val">${fmtDataBR(item.seguroVenc)}</div>
                    </div>
                    <div>
                        <div class="info-field-label">Apólice</div>
                        <div class="info-field-val">${item.seguroApolice}</div>
                    </div>
                </div>
            </div>`;
    } else {
        especificoHtml = `
            <div class="info-section">
                <div class="info-section-title">
                    <i data-lucide="file-contract"></i> Dados Contratuais & Vistoria (Prestador)
                </div>
                <div class="info-grid-3">
                    <div>
                        <div class="info-field-label">Regime</div>
                        <div class="info-field-val">${item.regimeContrato}</div>
                    </div>
                    <div>
                        <div class="info-field-label">Próxima Vistoria</div>
                        <div class="info-field-val">${fmtDataBR(item.vistoriaProxima)}</div>
                    </div>
                    <div>
                        <div class="info-field-label">Rastreador Instalado</div>
                        <div class="info-field-val">${item.rastreador}</div>
                    </div>
                </div>
                <div class="info-grid-2" style="margin-top:0.75rem;">
                    <div>
                        <div class="info-field-label">Seguro APP</div>
                        <div class="info-field-val">${item.seguroApp}</div>
                    </div>
                    <div>
                        <div class="info-field-label">Comodato / Locação</div>
                        <div class="info-field-val">${item.comodato}</div>
                    </div>
                </div>
                ${item.linkDocumentos ? `
                    <div style="margin-top:0.85rem; padding-top:0.75rem; border-top:1px solid var(--border-card);">
                        <a href="${item.linkDocumentos}" target="_blank" rel="noopener noreferrer" 
                           style="color:var(--primary); font-weight:700; font-size:0.85rem; display:inline-flex; align-items:center; gap:0.4rem; text-decoration:none;">
                            <i data-lucide="external-link" style="width:14px;height:14px;"></i> Abrir Pasta de Documentos no Google Drive / Nuvem
                        </a>
                    </div>` : ''}
                ${item.observacao ? `
                    <div style="margin-top:0.85rem; font-size:0.82rem; color:var(--text-muted); background:var(--bg-main); padding:0.6rem 0.8rem; border-radius:8px; border:1px solid var(--border-card);">
                        <strong style="color:var(--text-main);">Observações:</strong> ${item.observacao}
                    </div>` : ''}
            </div>`;
    }

    const modalPlateHtml = item.temPlaca
        ? `<span class="plate-pill">${item.placa}</span>`
        : `<span class="plate-pill-pending">Sem Placa</span>`;

    bodyEl.innerHTML = `
        <!-- Seção 1: Dados do Veículo -->
        <div class="info-section">
            <div class="info-section-title">
                <i data-lucide="truck"></i> Identificação Veicular
            </div>
            <div class="info-grid-3">
                <div>
                    <div class="info-field-label">Placa</div>
                    <div class="info-field-val">${modalPlateHtml}</div>
                </div>
                <div>
                    <div class="info-field-label">Marca / Modelo</div>
                    <div class="info-field-val">${item.veiculoDesc}</div>
                </div>
                <div>
                    <div class="info-field-label">Ano / Cor</div>
                    <div class="info-field-val">${item.ano} • ${item.cor}</div>
                </div>
            </div>
            <div class="info-grid-2" style="margin-top:0.75rem;">
                <div>
                    <div class="info-field-label">Origem Operacional</div>
                    <div class="info-field-val">
                        <span class="badge-origem ${item.origemBadgeClass}">${item.origemLabel}</span>
                    </div>
                </div>
                <div>
                    <div class="info-field-label">Status Atual</div>
                    <div class="info-field-val">
                        <span class="status-pill-ops ${item.statusClass}">${item.status}</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Seção 2: Condutor Titular / Prestador -->
        <div class="info-section">
            <div class="info-section-title">
                <i data-lucide="user"></i> Condutor Titular / Responsável
            </div>
            <div class="info-grid-2">
                <div>
                    <div class="info-field-label">Nome Completo</div>
                    <div class="info-field-val">${c1.nome || '-'}</div>
                </div>
                <div>
                    <div class="info-field-label">CPF / CNPJ</div>
                    <div class="info-field-val">${c1.cpf || '-'}</div>
                </div>
            </div>
            <div class="info-grid-3" style="margin-top:0.75rem;">
                <div>
                    <div class="info-field-label">Telefone / WhatsApp</div>
                    <div class="info-field-val">${formatarTelefone(c1.telefone)}</div>
                </div>
                <div>
                    <div class="info-field-label">Nº Registro CNH</div>
                    <div class="info-field-val">${c1.cnh || '-'} (${c1.catCnh || '-'})</div>
                </div>
                <div>
                    <div class="info-field-label">Validade CNH</div>
                    <div class="info-field-val">${fmtDataBR(c1.vencCnh)}</div>
                </div>
            </div>
        </div>

        <!-- Seção 3: Segundo Condutor (quando houver) -->
        ${c2 ? `
            <div class="info-section" style="border-color:rgba(59, 130, 246, 0.3);">
                <div class="info-section-title" style="color:#2563eb;">
                    <i data-lucide="user-plus"></i> Segundo Condutor Alocado (Equipe Dupla)
                </div>
                <div class="info-grid-2">
                    <div>
                        <div class="info-field-label">Nome Completo</div>
                        <div class="info-field-val">${c2.nome}</div>
                    </div>
                    <div>
                        <div class="info-field-label">Telefone / WhatsApp</div>
                        <div class="info-field-val">${formatarTelefone(c2.telefone)}</div>
                    </div>
                </div>
                <div class="info-grid-2" style="margin-top:0.75rem;">
                    <div>
                        <div class="info-field-label">Registro CNH</div>
                        <div class="info-field-val">${c2.cnh || '-'} (${c2.catCnh || '-'})</div>
                    </div>
                    <div>
                        <div class="info-field-label">Validade CNH</div>
                        <div class="info-field-val">${fmtDataBR(c2.vencCnh)}</div>
                    </div>
                </div>
            </div>
        ` : ''}

        <!-- Seção 4: Dados Específicos (Seguro ou Vistoria) -->
        ${especificoHtml}

        <!-- Seção 5: Alertas e Pendências (se houver) -->
        ${item.temAlerta ? `
            <div class="info-section" style="border-color:#fca5a5; background:#fef2f2;">
                <div class="info-section-title" style="color:#dc2626;">
                    <i data-lucide="alert-triangle"></i> Atenção Operacional
                </div>
                <ul style="padding-left:1.2rem; font-size:0.84rem; color:#b91c1c; display:flex; flex-direction:column; gap:0.3rem; font-weight:600;">
                    ${item.alertas.map(a => `<li>${a}</li>`).join('')}
                </ul>
            </div>
        ` : ''}
    `;

    modal.classList.add('active');
    if (window.lucide) lucide.createIcons();
};

window.fecharModalDetalhes = function(e) {
    if (e && e.target !== e.currentTarget && !e.target.closest('.modal-close')) return;
    const modal = document.getElementById('modal-detalhes-ops');
    if (modal) modal.classList.remove('active');
};

// ─── EXPORTAÇÃO PARA EXCEL VIA XLSX ───
function exportarParaExcel() {
    if (!window.XLSX) {
        alert('Biblioteca XLSX não carregada. Tente recarregar a página.');
        return;
    }

    if (itensFiltrados.length === 0) {
        alert('Nenhum registro para exportar com os filtros atuais.');
        return;
    }

    const dataToExport = itensFiltrados.map((it, i) => ({
        '#': i + 1,
        'Origem': it.origemLabel,
        'Placa': it.placa,
        'Veículo': it.veiculoDesc,
        'Ano': it.ano,
        'Condutor Titular / Prestador': it.condutor1?.nome || '-',
        'Telefone Titular': formatarTelefone(it.condutor1?.telefone),
        'CPF/CNPJ': it.condutor1?.cpf || '-',
        'CNH': it.condutor1?.cnh || '-',
        'Categoria CNH': it.condutor1?.catCnh || '-',
        'Validade CNH': fmtDataBR(it.condutor1?.vencCnh),
        'Segundo Condutor': it.condutor2?.nome || '-',
        'Telefone 2º Condutor': formatarTelefone(it.condutor2?.telefone),
        'Regime Contratual': it.regimeContrato,
        'Status Operacional': it.status,
        'Alertas Operacionais': it.alertas.join('; ') || 'Nenhum'
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Operação');

    const hojeStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Operacao_FrotaLink_${hojeStr}.xlsx`);
}
