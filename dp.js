/**
 * dp.js — Módulo Departamento Pessoal
 * FrotaLink
 *
 * Abas: Dashboard, Funcionários, ASO, Férias, Ponto, EPIs, Uniformes, Benefícios, Contratos, Checklist, Cargos
 */

// ============================================================
//  ESTADO GLOBAL
// ============================================================

let sb = null;
let empresaId = null;

// Dados em memória
let dpFuncionarios = [];
let dpAsos = [];
let dpFerias = [];
let dpPonto = [];
let dpAtestados = [];
let dpEpis = [];
let dpUniformes = [];
let dpBeneficios = [];
let dpContratos = [];
let dpChecklist = [];
let dpCargos = [];

// Paginação
const PER_PAGE = 200;
const pages = {
    funcionarios: 1, asos: 1, ferias: 1, ponto: 1, atestados: 1,
    epis: 1, uniformes: 1, beneficios: 1, contratos: 1, checklist: 1, cargos: 1
};

// Ordenação
const sorts = {
    funcionarios: { key: 'nome_completo', dir: 'asc' },
    asos: { key: 'data_exame', dir: 'desc' },
    ferias: { key: 'periodo_aq_inicio', dir: 'desc' },
    ponto: { key: 'data', dir: 'desc' },
    atestados: { key: 'data_inicio', dir: 'desc' },
    epis: { key: 'data_entrega', dir: 'desc' },
    uniformes: { key: 'data_entrega', dir: 'desc' },
    beneficios: { key: 'tipo', dir: 'asc' },
    contratos: { key: 'data_inicio', dir: 'desc' },
    checklist: { key: 'data_avaliacao', dir: 'desc' },
    cargos: { key: 'nome', dir: 'asc' }
};

// IDs em edição
let editIds = {
    funcionario: null, aso: null, ferias: null, ponto: null, atestado: null,
    epi: null, uniforme: null, beneficio: null, contrato: null, checklist: null, cargo: null
};

// Funcionário em visualização
let fichaFuncId = null;

// Critérios do checklist
const CHECKLIST_CRITERIOS = [
    { key: 'pontualidade',      label: 'Pontualidade' },
    { key: 'assiduidade',       label: 'Assiduidade' },
    { key: 'producao',          label: 'Produção/Volume' },
    { key: 'qualidade',         label: 'Qualidade do Trabalho' },
    { key: 'relacionamento',    label: 'Relacionamento Interpessoal' },
    { key: 'iniciativa',        label: 'Iniciativa' },
    { key: 'disciplina',        label: 'Disciplina' },
    { key: 'apresentacao',      label: 'Apresentação Pessoal' },
    { key: 'conhecimento_tecnico', label: 'Conhecimento Técnico' },
    { key: 'adaptacao',         label: 'Adaptação à Empresa' },
];

// ============================================================
//  INICIALIZAÇÃO
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    // Aguardar auth.js
    function waitAuth(attempts = 0) {
        if (window.authClient) {
            sb = window.authClient;
            empresaId = window.currentEmpresaId;
            init();
        } else if (attempts < 60) {
            setTimeout(() => waitAuth(attempts + 1), 150);
        }
    }
    waitAuth();

    // Preencher filtro de mês atual no ponto
    const hoje = new Date();
    const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
    const mesInput = document.getElementById('ponto-filter-mes');
    if (mesInput) mesInput.value = mesAtual;

    // Estado do formulário aberto para checagem de alterações (dirty check)
    window._estadoInicialModal = '';

    // Atalhos de teclado
    document.addEventListener('keydown', e => {
        // F2: Novo Registro na aba/sub-aba ativa
        if (e.key === 'F2') {
            e.preventDefault();
            abrirNovoRegistroAbaAtiva();
        }
        // Esc: Fechar modal ativo com confirmação
        if (e.key === 'Escape') {
            const openModal = document.querySelector('.dp-modal-overlay.open');
            if (openModal) {
                e.preventDefault();
                fecharModal(openModal.id);
            }
        }
        // Ctrl + Enter: Salvar registro
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            const openModal = document.querySelector('.dp-modal-overlay.open');
            if (openModal) {
                e.preventDefault();
                const saveBtn = openModal.querySelector('.btn-save');
                if (saveBtn) saveBtn.click();
            }
        }
    });

    // Monitorar status do funcionário
    document.getElementById('func-status')?.addEventListener('change', e => {
        const isDesligado = e.target.value === 'DESLIGADO';
        document.getElementById('func-motivo-deslig-wrap').style.display = isDesligado ? 'flex' : 'none';
        document.getElementById('func-data-demissao-wrap').style.display = isDesligado ? 'flex' : 'none';
    });

    // Resultado ASO
    document.getElementById('aso-resultado')?.addEventListener('change', e => {
        const wrap = document.getElementById('aso-restricoes-wrap');
        if (wrap) wrap.style.display = e.target.value === 'APTO_COM_RESTRICOES' ? 'flex' : 'none';
    });

    // Build checklist scores UI
    buildChecklistScores();

    // Injetar dicas visuais de atalhos nos botões
    injetarIndicadoresAtalhos();

    lucide.createIcons();
});

async function init() {
    try {
        await Promise.all([
            loadCargos(),
            loadFuncionarios(),
        ]);
        await Promise.all([
            loadAsos(),
            loadFerias(),
            loadPonto(),
            loadAtestados(),
            loadEpis(),
            loadUniformes(),
            loadBeneficios(),
            loadContratos(),
            loadChecklist(),
        ]);
        renderDashboard();
        renderFuncionarios();
        renderCargos();
        populateFuncSelects();
        lucide.createIcons();
    } catch (err) {
        console.error('[DP] Erro na inicialização:', err);
        toast('Erro ao carregar dados. Verifique a conexão.', 'error');
    }
}

// ============================================================
//  CARREGAMENTO DE DADOS
// ============================================================

async function loadFuncionarios() {
    const { data, error } = await sb.from('dp_funcionarios')
        .select('*')
        .order('nome_completo', { ascending: true });
    if (!error) dpFuncionarios = data || [];
}

async function loadCargos() {
    const { data, error } = await sb.from('dp_cargos')
        .select('*')
        .order('nome', { ascending: true });
    if (!error) dpCargos = data || [];
}

async function loadAsos() {
    const { data, error } = await sb.from('dp_asos')
        .select('*, dp_funcionarios(nome_completo)')
        .order('data_exame', { ascending: false });
    if (!error) {
        dpAsos = (data || []).map(r => ({
            ...r,
            funcionario_nome: r.dp_funcionarios?.nome_completo || ''
        }));
    }
}

async function loadFerias() {
    const { data, error } = await sb.from('dp_ferias')
        .select('*, dp_funcionarios(nome_completo)')
        .order('periodo_aq_inicio', { ascending: false });
    if (!error) {
        dpFerias = (data || []).map(r => ({
            ...r,
            funcionario_nome: r.dp_funcionarios?.nome_completo || ''
        }));
    }
}

async function loadPonto() {
    const { data, error } = await sb.from('dp_ponto')
        .select('*, dp_funcionarios(nome_completo)')
        .order('data', { ascending: false });
    if (!error) {
        dpPonto = (data || []).map(r => ({
            ...r,
            funcionario_nome: r.dp_funcionarios?.nome_completo || ''
        }));
    }
}

async function loadAtestados() {
    const { data, error } = await sb.from('dp_atestados')
        .select('*, dp_funcionarios(nome_completo)')
        .order('data_inicio', { ascending: false });
    if (!error) {
        dpAtestados = (data || []).map(r => ({
            ...r,
            funcionario_nome: r.dp_funcionarios?.nome_completo || ''
        }));
    }
}

async function loadEpis() {
    const { data, error } = await sb.from('dp_epis')
        .select('*, dp_funcionarios(nome_completo)')
        .order('data_entrega', { ascending: false });
    if (!error) {
        dpEpis = (data || []).map(r => ({
            ...r,
            funcionario_nome: r.dp_funcionarios?.nome_completo || ''
        }));
    }
}

async function loadUniformes() {
    const { data, error } = await sb.from('dp_uniformes')
        .select('*, dp_funcionarios(nome_completo)')
        .order('data_entrega', { ascending: false });
    if (!error) {
        dpUniformes = (data || []).map(r => ({
            ...r,
            funcionario_nome: r.dp_funcionarios?.nome_completo || ''
        }));
    }
}

async function loadBeneficios() {
    const { data, error } = await sb.from('dp_beneficios')
        .select('*, dp_funcionarios(nome_completo)')
        .order('tipo', { ascending: true });
    if (!error) {
        dpBeneficios = (data || []).map(r => ({
            ...r,
            funcionario_nome: r.dp_funcionarios?.nome_completo || ''
        }));
    }
}

async function loadContratos() {
    const { data, error } = await sb.from('dp_contratos_exp')
        .select('*, dp_funcionarios(nome_completo)')
        .order('data_inicio', { ascending: false });
    if (!error) {
        dpContratos = (data || []).map(r => ({
            ...r,
            funcionario_nome: r.dp_funcionarios?.nome_completo || ''
        }));
    }
}

async function loadChecklist() {
    const { data, error } = await sb.from('dp_checklist_exp')
        .select('*, dp_funcionarios(nome_completo)')
        .order('data_avaliacao', { ascending: false });
    if (!error) {
        dpChecklist = (data || []).map(r => ({
            ...r,
            funcionario_nome: r.dp_funcionarios?.nome_completo || ''
        }));
    }
}

// ============================================================
//  POPULATE SELECTS
// ============================================================

function populateFuncSelects() {
    const ativos = dpFuncionarios.filter(f => f.status !== 'DESLIGADO');
    const todos = dpFuncionarios;
    const selects = [
        { id: 'aso-func-id', list: ativos },
        { id: 'ferias-func-id', list: ativos },
        { id: 'ponto-func-id', list: ativos },
        { id: 'atestado-func-id', list: ativos },
        { id: 'epi-func-id', list: ativos },
        { id: 'unif-func-id', list: ativos },
        { id: 'benef-func-id', list: ativos },
        { id: 'contr-func-id', list: ativos },
        { id: 'check-func-id', list: ativos },
    ];
    selects.forEach(({ id, list }) => {
        const el = document.getElementById(id);
        if (!el) return;
        const cur = el.value;
        el.innerHTML = '<option value="">Selecione o funcionário</option>';
        list.sort((a, b) => a.nome_completo.localeCompare(b.nome_completo))
            .forEach(f => {
                const opt = document.createElement('option');
                opt.value = f.id;
                opt.textContent = `${f.nome_completo}${f.matricula ? ' [' + f.matricula + ']' : ''}`;
                el.appendChild(opt);
            });
        if (cur) el.value = cur;
    });

    // Populate cargo select no modal funcionário
    const cargoSel = document.getElementById('func-cargo-id');
    if (cargoSel) {
        const cur = cargoSel.value;
        cargoSel.innerHTML = '<option value="">Selecione o cargo</option>';
        dpCargos.filter(c => c.ativo !== false).forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.nome;
            cargoSel.appendChild(opt);
        });
        if (cur) cargoSel.value = cur;
    }

    // Filtros de cargo e setor em funcionários
    const cargosUnicos = [...new Set(dpFuncionarios.map(f => f.cargo_nome).filter(Boolean))].sort();
    const setoresUnicos = [...new Set(dpFuncionarios.map(f => f.setor).filter(Boolean))].sort();
    const selCargo = document.getElementById('func-filter-cargo');
    const selSetor = document.getElementById('func-filter-setor');
    if (selCargo) {
        selCargo.innerHTML = '<option value="">Todos os Cargos</option>';
        cargosUnicos.forEach(c => selCargo.innerHTML += `<option value="${c}">${c}</option>`);
    }
    if (selSetor) {
        selSetor.innerHTML = '<option value="">Todos os Setores</option>';
        setoresUnicos.forEach(s => selSetor.innerHTML += `<option value="${s}">${s}</option>`);
    }
}

// ============================================================
//  DASHBOARD
// ============================================================

function renderDashboard() {
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const em30 = new Date(hoje); em30.setDate(hoje.getDate() + 30);
    const em15 = new Date(hoje); em15.setDate(hoje.getDate() + 15);
    const em60 = new Date(hoje); em60.setDate(hoje.getDate() + 60);

    // KPIs
    const ativos = dpFuncionarios.filter(f => f.status === 'ATIVO');
    document.getElementById('kpi-total-func').textContent = ativos.length;
    document.getElementById('kpi-total-func-sub').textContent = `${dpFuncionarios.filter(f => f.status !== 'DESLIGADO').length} total (com afastados/férias)`;

    // ASOs vencidos / vencendo em 30 dias
    const asosAlert = dpAsos.filter(a => {
        if (!a.data_vencimento) return false;
        const v = new Date(a.data_vencimento + 'T00:00:00');
        return v <= em30;
    });
    document.getElementById('kpi-asos-venc').textContent = asosAlert.length;
    const asoVenc = asosAlert.filter(a => new Date(a.data_vencimento + 'T00:00:00') < hoje).length;
    const asoAVencer = asosAlert.length - asoVenc;
    document.getElementById('kpi-asos-sub').textContent = `${asoVenc} vencidos, ${asoAVencer} a vencer`;

    // Contratos vencendo em 15 dias
    const contrAlerts = dpContratos.filter(c => {
        const dates = [c.data_fim_45, c.data_fim_90].filter(Boolean);
        return dates.some(d => {
            const dt = new Date(d + 'T00:00:00');
            return dt >= hoje && dt <= em15;
        });
    });
    document.getElementById('kpi-contr-venc').textContent = contrAlerts.length;

    // Em férias hoje
    const emFerias = dpFuncionarios.filter(f => f.status === 'FERIAS').length;
    const feriasProg = dpFerias.filter(f => {
        if (!f.data_inicio_gozo || !f.data_fim_gozo) return false;
        const ini = new Date(f.data_inicio_gozo + 'T00:00:00');
        const fim = new Date(f.data_fim_gozo + 'T00:00:00');
        return hoje >= ini && hoje <= fim;
    }).length;
    document.getElementById('kpi-ferias-hoje').textContent = Math.max(emFerias, feriasProg);

    // Afastados
    const afastados = dpAtestados.filter(a => a.status === 'ATIVO').length;
    document.getElementById('kpi-afastados').textContent = afastados;

    // EPIs / CA vencendo em 60 dias
    const episAlert = dpEpis.filter(e => {
        if (!e.ca_vencimento) return false;
        const v = new Date(e.ca_vencimento + 'T00:00:00');
        return v <= em60;
    });
    document.getElementById('kpi-epis-venc').textContent = episAlert.length;

    // Aniversariantes do mês
    const mesAtual = hoje.getMonth() + 1;
    const aniversariantes = dpFuncionarios
        .filter(f => f.data_nascimento && f.status !== 'DESLIGADO')
        .map(f => {
            const d = new Date(f.data_nascimento + 'T00:00:00');
            return { ...f, mesAniv: d.getMonth() + 1, diaAniv: d.getDate() };
        })
        .filter(f => f.mesAniv === mesAtual)
        .sort((a, b) => a.diaAniv - b.diaAniv);

    const anivEl = document.getElementById('dash-aniversariantes');
    if (aniversariantes.length === 0) {
        anivEl.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:1rem;font-size:0.85rem;">Nenhum aniversariante este mês 🎂</div>';
    } else {
        anivEl.innerHTML = aniversariantes.slice(0, 8).map(f => {
            const iniciais = f.nome_completo.split(' ').slice(0, 2).map(n => n[0]).join('');
            const isHoje = f.diaAniv === hoje.getDate();
            return `
                <div class="aniv-item" style="${isHoje ? 'border-color: var(--pink); background: rgba(236,72,153,0.08);' : ''}">
                    <div class="aniv-avatar" style="${isHoje ? 'background: linear-gradient(135deg, #ec4899, #f43f5e);' : ''}">${iniciais}</div>
                    <div class="aniv-info">
                        <div class="aniv-nome">${f.nome_completo}${isHoje ? ' 🎉' : ''}</div>
                        <div class="aniv-data">Dia ${f.diaAniv} • ${f.cargo_nome || f.setor || 'Funcionário'}</div>
                    </div>
                </div>`;
        }).join('');
    }

    // Alertas gerais
    const alertList = document.getElementById('dash-alertas');
    const alertas = [];
    asosAlert.forEach(a => {
        const v = new Date(a.data_vencimento + 'T00:00:00');
        const vencido = v < hoje;
        alertas.push({
            tipo: vencido ? 'danger' : 'warning',
            icone: 'stethoscope',
            msg: `ASO ${a.tipo} de <b>${a.funcionario_nome}</b> ${vencido ? 'VENCIDO' : 'vence em ' + formatDate(a.data_vencimento)}`
        });
    });
    contrAlerts.forEach(c => {
        const periodo = new Date(c.data_fim_45 + 'T00:00:00') >= hoje && new Date(c.data_fim_45 + 'T00:00:00') <= em15 ? '45 dias' : '90 dias';
        alertas.push({
            tipo: 'warning',
            icone: 'file-text',
            msg: `Contrato de experiência (<b>${periodo}</b>) de <b>${c.funcionario_nome}</b> vence em breve`
        });
    });
    episAlert.forEach(e => {
        const v = new Date(e.ca_vencimento + 'T00:00:00');
        const vencido = v < hoje;
        alertas.push({
            tipo: vencido ? 'danger' : 'warning',
            icone: 'hard-hat',
            msg: `CA do EPI <b>${e.nome_epi}</b> (${e.funcionario_nome}) ${vencido ? 'VENCIDO' : 'vencendo'}`
        });
    });
    // Férias vencidas (concessivo expirado)
    dpFerias.filter(f => f.status !== 'CONCLUIDA' && f.status !== 'VENCIDA' && f.periodo_conc_fim && new Date(f.periodo_conc_fim + 'T00:00:00') < hoje).forEach(f => {
        alertas.push({ tipo: 'danger', icone: 'umbrella', msg: `Férias de <b>${f.funcionario_nome}</b> vencidas (período concessivo expirado)` });
    });

    if (alertas.length === 0) {
        alertList.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:1rem;font-size:0.85rem;">✅ Sem alertas críticos no momento</div>';
    } else {
        alertList.innerHTML = alertas.slice(0, 8).map(a => `
            <div class="alert-item" style="${a.tipo === 'danger' ? 'border-color:rgba(239,68,68,0.3);background:rgba(239,68,68,0.05);' : 'border-color:rgba(245,158,11,0.3);background:rgba(245,158,11,0.05);'}">
                <i data-lucide="${a.icone}" style="width:16px;flex-shrink:0;color:${a.tipo === 'danger' ? '#f87171' : '#fcd34d'};"></i>
                <span style="font-size:0.84rem;">${a.msg}</span>
            </div>`).join('');
        lucide.createIcons();
    }

    // Férias programadas
    const feriasProx = dpFerias
        .filter(f => f.data_inicio_gozo && new Date(f.data_inicio_gozo + 'T00:00:00') <= em60 && f.status !== 'CONCLUIDA')
        .sort((a, b) => new Date(a.data_inicio_gozo) - new Date(b.data_inicio_gozo));

    const dashFerProg = document.getElementById('dash-ferias-prog');
    if (feriasProx.length === 0) {
        dashFerProg.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:1rem;font-size:0.85rem;">Nenhuma férias programada para os próximos 60 dias</div>';
    } else {
        dashFerProg.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:0.75rem;">` +
            feriasProx.map(f => {
                const emGozo = hoje >= new Date(f.data_inicio_gozo + 'T00:00:00');
                return `
                <div style="display:flex;align-items:center;gap:0.75rem;padding:0.75rem 1rem;background:rgba(14,165,233,0.05);border:1px solid rgba(14,165,233,0.15);border-radius:10px;">
                    <i data-lucide="umbrella" style="width:18px;color:var(--primary);flex-shrink:0;"></i>
                    <div style="flex:1;">
                        <div style="font-weight:600;font-size:0.88rem;">${f.funcionario_nome}</div>
                        <div style="font-size:0.78rem;color:var(--text-muted);">${formatDate(f.data_inicio_gozo)} → ${formatDate(f.data_fim_gozo)} (${f.dias_gozados || '?'} dias)</div>
                    </div>
                    <span class="badge ${emGozo ? 'badge-ferias' : 'badge-pendente'}">${emGozo ? 'Em Gozo' : 'Programada'}</span>
                </div>`;
            }).join('') + '</div>';
        lucide.createIcons();
    }

    // Banner de alertas críticos no topo da página
    const criticos = alertas.filter(a => a.tipo === 'danger');
    const banner = document.getElementById('dp-alert-banner');
    if (criticos.length > 0 && banner) {
        banner.style.display = 'flex';
        banner.innerHTML = `
            <i data-lucide="alert-triangle" style="width:18px;flex-shrink:0;"></i>
            <span><b>${criticos.length} alerta(s) crítico(s):</b> ${criticos.slice(0,2).map(a => a.msg.replace(/<b>/g,'').replace(/<\/b>/g,'')).join(' | ')}${criticos.length > 2 ? ` e mais ${criticos.length - 2}...` : ''}</span>`;
        banner.className = 'alert-banner';
        lucide.createIcons();
    }
}

// ============================================================
//  RENDER: FUNCIONÁRIOS
// ============================================================

function renderFuncionarios() {
    const search = (document.getElementById('func-search')?.value || '').toLowerCase();
    const filterStatus = document.getElementById('func-filter-status')?.value || '';
    const filterCargo = document.getElementById('func-filter-cargo')?.value || '';
    const filterSetor = document.getElementById('func-filter-setor')?.value || '';

    let list = dpFuncionarios.filter(f => {
        const s = `${f.nome_completo} ${f.cpf || ''} ${f.matricula || ''}`.toLowerCase();
        if (search && !s.includes(search)) return false;
        if (filterStatus && f.status !== filterStatus) return false;
        if (filterCargo && f.cargo_nome !== filterCargo) return false;
        if (filterSetor && f.setor !== filterSetor) return false;
        return true;
    });

    list = semanticSort(list, sorts.funcionarios);
    const { page, total } = paginate('funcionarios', list.length);
    const slice = list.slice((page - 1) * PER_PAGE, page * PER_PAGE);

    const tbody = document.getElementById('func-tbody');
    if (slice.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="table-empty">
            <i data-lucide="users" style="display:block;margin:0 auto 0.5rem;width:32px;height:32px;"></i>
            Nenhum funcionário encontrado</td></tr>`;
        lucide.createIcons(); return;
    }

    tbody.innerHTML = slice.map(f => `
        <tr>
            <td data-label="Matrícula">${f.matricula || '<span style="color:var(--text-muted)">—</span>'}</td>
            <td data-label="Nome" style="font-weight:600;">${f.nome_completo}</td>
            <td data-label="Cargo">${f.cargo_nome || '<span style="color:var(--text-muted)">—</span>'}</td>
            <td data-label="Setor">${f.setor || '<span style="color:var(--text-muted)">—</span>'}</td>
            <td data-label="Admissão">${formatDate(f.data_admissao)}</td>
            <td data-label="Aniversário">${formatBirthday(f.data_nascimento)}</td>
            <td data-label="Status"><span class="badge badge-${(f.status||'').toLowerCase().replace('_','')}">${labelStatus(f.status)}</span></td>
            <td data-label="Ações" style="white-space:nowrap;">
                <button class="btn-icon" onclick="verFicha('${f.id}')" title="Ver Ficha"><i data-lucide="eye"></i></button>
                <button class="btn-icon" onclick="editarFuncionario('${f.id}')" title="Editar"><i data-lucide="pencil"></i></button>
                <button class="btn-icon danger" onclick="deletarRegistro('funcionario','${f.id}')" title="Excluir"><i data-lucide="trash-2"></i></button>
            </td>
        </tr>`).join('');

    renderPagination('func-pagination', 'func-page-info', page, total, list.length, 'renderFuncionarios');
    lucide.createIcons();
}

// ============================================================
//  RENDER: ASO
// ============================================================

function renderAsos() {
    const search = (document.getElementById('aso-search')?.value || '').toLowerCase();
    const filterTipo = document.getElementById('aso-filter-tipo')?.value || '';
    const filterResultado = document.getElementById('aso-filter-resultado')?.value || '';
    const filterVenc = document.getElementById('aso-filter-venc')?.value || '';
    const hoje = new Date(); hoje.setHours(0,0,0,0);

    let list = dpAsos.filter(a => {
        if (search && !a.funcionario_nome.toLowerCase().includes(search)) return false;
        if (filterTipo && a.tipo !== filterTipo) return false;
        if (filterResultado && a.resultado !== filterResultado) return false;
        if (filterVenc && a.data_vencimento) {
            const v = new Date(a.data_vencimento + 'T00:00:00');
            const em30 = new Date(hoje); em30.setDate(hoje.getDate() + 30);
            const em60 = new Date(hoje); em60.setDate(hoje.getDate() + 60);
            if (filterVenc === 'vencido' && v >= hoje) return false;
            if (filterVenc === '30dias' && (v < hoje || v > em30)) return false;
            if (filterVenc === '60dias' && (v < hoje || v > em60)) return false;
        }
        return true;
    });

    list = semanticSort(list, sorts.asos);
    const { page, total } = paginate('asos', list.length);
    const slice = list.slice((page - 1) * PER_PAGE, page * PER_PAGE);

    const tbody = document.getElementById('aso-tbody');
    if (slice.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="table-empty"><i data-lucide="stethoscope" style="display:block;margin:0 auto 0.5rem;width:32px;height:32px;"></i>Nenhum ASO encontrado</td></tr>`;
        lucide.createIcons(); return;
    }

    tbody.innerHTML = slice.map(a => {
        const vencStatus = getVencStatus(a.data_vencimento);
        return `
            <tr>
                <td data-label="Funcionário" style="font-weight:600;">${a.funcionario_nome}</td>
                <td data-label="Tipo"><span class="badge badge-info">${labelAsoTipo(a.tipo)}</span></td>
                <td data-label="Data Exame">${formatDate(a.data_exame)}</td>
                <td data-label="Vencimento">${a.data_vencimento ? `<span class="badge ${vencStatus.cls}">${formatDate(a.data_vencimento)}</span>` : '<span style="color:var(--text-muted)">—</span>'}</td>
                <td data-label="Resultado"><span class="badge badge-${(a.resultado||'').toLowerCase().replace('_com_','_')}">${labelAsoResultado(a.resultado)}</span></td>
                <td data-label="Clínica">${a.clinica || a.medico_nome || '<span style="color:var(--text-muted)">—</span>'}</td>
                <td data-label="Ações" style="white-space:nowrap;">
                    <button class="btn-icon" onclick="editarAso('${a.id}')" title="Editar"><i data-lucide="pencil"></i></button>
                    <button class="btn-icon danger" onclick="deletarRegistro('aso','${a.id}')" title="Excluir"><i data-lucide="trash-2"></i></button>
                </td>
            </tr>`;
    }).join('');

    renderPagination('aso-pagination', 'aso-page-info', page, total, list.length, 'renderAsos');
    lucide.createIcons();
}

// ============================================================
//  RENDER: FÉRIAS
// ============================================================

function renderFerias() {
    const search = (document.getElementById('ferias-search')?.value || '').toLowerCase();
    const filterStatus = document.getElementById('ferias-filter-status')?.value || '';

    let list = dpFerias.filter(f => {
        if (search && !f.funcionario_nome.toLowerCase().includes(search)) return false;
        if (filterStatus && f.status !== filterStatus) return false;
        return true;
    });

    list = semanticSort(list, sorts.ferias);
    const { page, total } = paginate('ferias', list.length);
    const slice = list.slice((page - 1) * PER_PAGE, page * PER_PAGE);

    const tbody = document.getElementById('ferias-tbody');
    if (slice.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="table-empty"><i data-lucide="umbrella" style="display:block;margin:0 auto 0.5rem;width:32px;height:32px;"></i>Nenhum registro de férias encontrado</td></tr>`;
        lucide.createIcons(); return;
    }

    tbody.innerHTML = slice.map(f => {
        const statusMap = { AQUISITIVO: 'info', PROGRAMADA: 'pendente', EM_GOZO: 'ferias', CONCLUIDA: 'ok', VENCIDA: 'vencido' };
        const hoje = new Date(); hoje.setHours(0,0,0,0);
        const concVenc = f.periodo_conc_fim ? new Date(f.periodo_conc_fim + 'T00:00:00') : null;
        const isVencida = concVenc && concVenc < hoje && f.status !== 'CONCLUIDA';
        return `
            <tr ${isVencida ? 'style="background:rgba(239,68,68,0.04);"' : ''}>
                <td data-label="Funcionário" style="font-weight:600;">${f.funcionario_nome}</td>
                <td data-label="Período Aquisitivo">${formatDate(f.periodo_aq_inicio)} → ${formatDate(f.periodo_aq_fim)}</td>
                <td data-label="Limite Concessivo">${concVenc ? `<span style="color:${isVencida?'#f87171':''};">${formatDate(f.periodo_conc_fim)}</span>` : '<span style="color:var(--text-muted)">—</span>'}</td>
                <td data-label="Gozo">${f.data_inicio_gozo ? `${formatDate(f.data_inicio_gozo)} → ${formatDate(f.data_fim_gozo)}` : '<span style="color:var(--text-muted)">Não programado</span>'}</td>
                <td data-label="Dias">${f.dias_gozados || '<span style="color:var(--text-muted)">—</span>'}</td>
                <td data-label="Status"><span class="badge badge-${statusMap[f.status]||'pendente'}">${labelFeriasStatus(f.status)}</span></td>
                <td data-label="Ações" style="white-space:nowrap;">
                    <button class="btn-icon" onclick="editarFerias('${f.id}')" title="Editar"><i data-lucide="pencil"></i></button>
                    <button class="btn-icon danger" onclick="deletarRegistro('ferias','${f.id}')" title="Excluir"><i data-lucide="trash-2"></i></button>
                </td>
            </tr>`;
    }).join('');

    renderPagination('ferias-pagination', 'ferias-page-info', page, total, list.length, 'renderFerias');
    lucide.createIcons();
}

// ============================================================
//  RENDER: PONTO
// ============================================================

function renderPonto() {
    const search = (document.getElementById('ponto-search')?.value || '').toLowerCase();
    const filterTipo = document.getElementById('ponto-filter-tipo')?.value || '';
    const filterMes = document.getElementById('ponto-filter-mes')?.value || '';

    let list = dpPonto.filter(p => {
        if (search && !p.funcionario_nome.toLowerCase().includes(search)) return false;
        if (filterTipo && p.tipo !== filterTipo) return false;
        if (filterMes && p.data && !p.data.startsWith(filterMes)) return false;
        return true;
    });

    list = semanticSort(list, sorts.ponto);
    const { page, total } = paginate('ponto', list.length);
    const slice = list.slice((page - 1) * PER_PAGE, page * PER_PAGE);

    const tbody = document.getElementById('ponto-tbody');
    if (slice.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="table-empty"><i data-lucide="clock" style="display:block;margin:0 auto 0.5rem;width:32px;height:32px;"></i>Nenhuma ocorrência encontrada</td></tr>`;
        lucide.createIcons(); return;
    }

    const tipoColors = { FALTA: 'vencido', ATRASO: 'afastado', HORA_EXTRA: 'ferias', SAIDA_ANTECIPADA: 'pendente' };
    tbody.innerHTML = slice.map(p => `
        <tr>
            <td data-label="Funcionário" style="font-weight:600;">${p.funcionario_nome}</td>
            <td data-label="Data">${formatDate(p.data)}</td>
            <td data-label="Tipo"><span class="badge badge-${tipoColors[p.tipo]||'info'}">${labelPontoTipo(p.tipo)}</span></td>
            <td data-label="Minutos">${p.minutos != null ? p.minutos + ' min' : '<span style="color:var(--text-muted)">—</span>'}</td>
            <td data-label="Justificativa">${p.justificativa || '<span style="color:var(--text-muted)">—</span>'}</td>
            <td data-label="Justificado"><span class="badge ${p.justificado ? 'badge-ok' : 'badge-vencido'}">${p.justificado ? 'Sim' : 'Não'}</span></td>
            <td data-label="Ações" style="white-space:nowrap;">
                <button class="btn-icon" onclick="editarPonto('${p.id}')" title="Editar"><i data-lucide="pencil"></i></button>
                <button class="btn-icon danger" onclick="deletarRegistro('ponto','${p.id}')" title="Excluir"><i data-lucide="trash-2"></i></button>
            </td>
        </tr>`).join('');

    renderPagination('ponto-pagination', 'ponto-page-info', page, total, list.length, 'renderPonto');
    lucide.createIcons();
}

// ============================================================
//  RENDER: ATESTADOS
// ============================================================

function renderAtestados() {
    const search = (document.getElementById('atestado-search')?.value || '').toLowerCase();
    const filterTipo = document.getElementById('atestado-filter-tipo')?.value || '';
    const filterStatus = document.getElementById('atestado-filter-status')?.value || '';

    let list = dpAtestados.filter(a => {
        if (search && !a.funcionario_nome.toLowerCase().includes(search)) return false;
        if (filterTipo && a.tipo !== filterTipo) return false;
        if (filterStatus && a.status !== filterStatus) return false;
        return true;
    });

    list = semanticSort(list, sorts.atestados);
    const { page, total } = paginate('atestados', list.length);
    const slice = list.slice((page - 1) * PER_PAGE, page * PER_PAGE);

    const tbody = document.getElementById('atestado-tbody');
    if (slice.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="table-empty"><i data-lucide="file-heart" style="display:block;margin:0 auto 0.5rem;width:32px;height:32px;"></i>Nenhum atestado encontrado</td></tr>`;
        lucide.createIcons(); return;
    }

    tbody.innerHTML = slice.map(a => `
        <tr>
            <td data-label="Funcionário" style="font-weight:600;">${a.funcionario_nome}</td>
            <td data-label="Tipo"><span class="badge badge-info">${labelAtestadoTipo(a.tipo)}</span></td>
            <td data-label="Início">${formatDate(a.data_inicio)}</td>
            <td data-label="Fim">${a.data_fim ? formatDate(a.data_fim) : '<span style="color:var(--text-muted)">Em aberto</span>'}</td>
            <td data-label="Dias">${a.dias || '<span style="color:var(--text-muted)">—</span>'}</td>
            <td data-label="CID">${a.cid || '<span style="color:var(--text-muted)">—</span>'}</td>
            <td data-label="Status"><span class="badge ${a.status === 'ATIVO' ? 'badge-afastado' : 'badge-ok'}">${a.status}</span></td>
            <td data-label="Ações" style="white-space:nowrap;">
                <button class="btn-icon" onclick="editarAtestado('${a.id}')" title="Editar"><i data-lucide="pencil"></i></button>
                <button class="btn-icon danger" onclick="deletarRegistro('atestado','${a.id}')" title="Excluir"><i data-lucide="trash-2"></i></button>
            </td>
        </tr>`).join('');

    renderPagination('atestado-pagination', 'atestado-page-info', page, total, list.length, 'renderAtestados');
    lucide.createIcons();
}

// ============================================================
//  RENDER: EPIs
// ============================================================

function renderEpis() {
    const search = (document.getElementById('epi-search')?.value || '').toLowerCase();
    const filterMotivo = document.getElementById('epi-filter-motivo')?.value || '';
    const filterCa = document.getElementById('epi-filter-ca')?.value || '';
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const em60 = new Date(hoje); em60.setDate(hoje.getDate() + 60);

    let list = dpEpis.filter(e => {
        const s = `${e.funcionario_nome} ${e.nome_epi}`.toLowerCase();
        if (search && !s.includes(search)) return false;
        if (filterMotivo && e.motivo !== filterMotivo) return false;
        if (filterCa && e.ca_vencimento) {
            const v = new Date(e.ca_vencimento + 'T00:00:00');
            if (filterCa === 'vencido' && v >= hoje) return false;
            if (filterCa === 'vencendo' && (v < hoje || v > em60)) return false;
        }
        return true;
    });

    list = semanticSort(list, sorts.epis);
    const { page, total } = paginate('epis', list.length);
    const slice = list.slice((page - 1) * PER_PAGE, page * PER_PAGE);

    const tbody = document.getElementById('epi-tbody');
    if (slice.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="table-empty"><i data-lucide="hard-hat" style="display:block;margin:0 auto 0.5rem;width:32px;height:32px;"></i>Nenhum EPI encontrado</td></tr>`;
        lucide.createIcons(); return;
    }

    tbody.innerHTML = slice.map(e => {
        const vencStatus = getVencStatus(e.ca_vencimento);
        return `
            <tr>
                <td data-label="Funcionário" style="font-weight:600;">${e.funcionario_nome}</td>
                <td data-label="EPI">${e.nome_epi}</td>
                <td data-label="Nº CA">${e.ca_numero || '<span style="color:var(--text-muted)">—</span>'}</td>
                <td data-label="Venc. CA">${e.ca_vencimento ? `<span class="badge ${vencStatus.cls}">${formatDate(e.ca_vencimento)}</span>` : '<span style="color:var(--text-muted)">—</span>'}</td>
                <td data-label="Entrega">${formatDate(e.data_entrega)}</td>
                <td data-label="Motivo"><span class="badge badge-info">${e.motivo || '—'}</span></td>
                <td data-label="Recebido"><span class="badge ${e.assinatura_recebido ? 'badge-ok' : 'badge-vencido'}">${e.assinatura_recebido ? '✓ Assinou' : 'Pendente'}</span></td>
                <td data-label="Ações" style="white-space:nowrap;">
                    <button class="btn-icon" onclick="editarEpi('${e.id}')" title="Editar"><i data-lucide="pencil"></i></button>
                    <button class="btn-icon danger" onclick="deletarRegistro('epi','${e.id}')" title="Excluir"><i data-lucide="trash-2"></i></button>
                </td>
            </tr>`;
    }).join('');

    renderPagination('epi-pagination', 'epi-page-info', page, total, list.length, 'renderEpis');
    lucide.createIcons();
}

// ============================================================
//  RENDER: UNIFORMES
// ============================================================

function renderUniformes() {
    const search = (document.getElementById('uniforme-search')?.value || '').toLowerCase();
    const filterEstado = document.getElementById('uniforme-filter-estado')?.value || '';

    let list = dpUniformes.filter(u => {
        const s = `${u.funcionario_nome} ${u.item}`.toLowerCase();
        if (search && !s.includes(search)) return false;
        if (filterEstado && u.estado !== filterEstado) return false;
        return true;
    });

    list = semanticSort(list, sorts.uniformes);
    const { page, total } = paginate('uniformes', list.length);
    const slice = list.slice((page - 1) * PER_PAGE, page * PER_PAGE);

    const tbody = document.getElementById('uniforme-tbody');
    if (slice.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="table-empty"><i data-lucide="shirt" style="display:block;margin:0 auto 0.5rem;width:32px;height:32px;"></i>Nenhum uniforme encontrado</td></tr>`;
        lucide.createIcons(); return;
    }

    const estadoColors = { NOVO: 'ok', BOM: 'ferias', DESGASTADO: 'afastado', DANIFICADO: 'vencido' };
    tbody.innerHTML = slice.map(u => `
        <tr>
            <td data-label="Funcionário" style="font-weight:600;">${u.funcionario_nome}</td>
            <td data-label="Item">${u.item}</td>
            <td data-label="Tamanho">${u.tamanho || '<span style="color:var(--text-muted)">—</span>'}</td>
            <td data-label="Qtd">${u.quantidade || 1}</td>
            <td data-label="Entrega">${formatDate(u.data_entrega)}</td>
            <td data-label="Estado"><span class="badge badge-${estadoColors[u.estado]||'info'}">${u.estado}</span></td>
            <td data-label="Motivo">${u.motivo || '<span style="color:var(--text-muted)">—</span>'}</td>
            <td data-label="Ações" style="white-space:nowrap;">
                <button class="btn-icon" onclick="editarUniforme('${u.id}')" title="Editar"><i data-lucide="pencil"></i></button>
                <button class="btn-icon danger" onclick="deletarRegistro('uniforme','${u.id}')" title="Excluir"><i data-lucide="trash-2"></i></button>
            </td>
        </tr>`).join('');

    renderPagination('uniforme-pagination', 'uniforme-page-info', page, total, list.length, 'renderUniformes');
    lucide.createIcons();
}

// ============================================================
//  RENDER: BENEFÍCIOS
// ============================================================

function renderBeneficios() {
    const search = (document.getElementById('benef-search')?.value || '').toLowerCase();
    const filterTipo = document.getElementById('benef-filter-tipo')?.value || '';
    const filterAtivo = document.getElementById('benef-filter-ativo')?.value || '';

    let list = dpBeneficios.filter(b => {
        if (search && !b.funcionario_nome.toLowerCase().includes(search)) return false;
        if (filterTipo && b.tipo !== filterTipo) return false;
        if (filterAtivo !== '' && String(b.ativo) !== filterAtivo) return false;
        return true;
    });

    list = semanticSort(list, sorts.beneficios);
    const { page, total } = paginate('beneficios', list.length);
    const slice = list.slice((page - 1) * PER_PAGE, page * PER_PAGE);

    const tbody = document.getElementById('benef-tbody');
    if (slice.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="table-empty"><i data-lucide="credit-card" style="display:block;margin:0 auto 0.5rem;width:32px;height:32px;"></i>Nenhum benefício encontrado</td></tr>`;
        lucide.createIcons(); return;
    }

    tbody.innerHTML = slice.map(b => `
        <tr>
            <td data-label="Funcionário" style="font-weight:600;">${b.funcionario_nome}</td>
            <td data-label="Benefício"><span class="badge badge-purple">${labelBeneficioTipo(b.tipo)}</span></td>
            <td data-label="Valor Empresa">${b.valor ? 'R$ ' + parseFloat(b.valor).toLocaleString('pt-BR', {minimumFractionDigits:2}) : '<span style="color:var(--text-muted)">—</span>'}</td>
            <td data-label="Desconto Func.">${b.valor_desconto_func ? 'R$ ' + parseFloat(b.valor_desconto_func).toLocaleString('pt-BR', {minimumFractionDigits:2}) : '<span style="color:var(--text-muted)">R$ 0,00</span>'}</td>
            <td data-label="Operadora">${b.operadora || '<span style="color:var(--text-muted)">—</span>'}</td>
            <td data-label="Início">${formatDate(b.data_inicio)}</td>
            <td data-label="Status"><span class="badge ${b.ativo ? 'badge-ativo' : 'badge-desligado'}">${b.ativo ? 'Ativo' : 'Inativo'}</span></td>
            <td data-label="Ações" style="white-space:nowrap;">
                <button class="btn-icon" onclick="editarBeneficio('${b.id}')" title="Editar"><i data-lucide="pencil"></i></button>
                <button class="btn-icon danger" onclick="deletarRegistro('beneficio','${b.id}')" title="Excluir"><i data-lucide="trash-2"></i></button>
            </td>
        </tr>`).join('');

    renderPagination('benef-pagination', 'benef-page-info', page, total, list.length, 'renderBeneficios');
    lucide.createIcons();
}

// ============================================================
//  RENDER: CONTRATOS
// ============================================================

function renderContratos() {
    const search = (document.getElementById('contr-search')?.value || '').toLowerCase();
    const filterStatus = document.getElementById('contr-filter-status')?.value || '';

    let list = dpContratos.filter(c => {
        if (search && !c.funcionario_nome.toLowerCase().includes(search)) return false;
        if (filterStatus && c.status_45 !== filterStatus && c.status_90 !== filterStatus) return false;
        return true;
    });

    list = semanticSort(list, sorts.contratos);
    const { page, total } = paginate('contratos', list.length);
    const slice = list.slice((page - 1) * PER_PAGE, page * PER_PAGE);

    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const tbody = document.getElementById('contr-tbody');
    if (slice.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="table-empty"><i data-lucide="file-text" style="display:block;margin:0 auto 0.5rem;width:32px;height:32px;"></i>Nenhum contrato encontrado</td></tr>`;
        lucide.createIcons(); return;
    }

    const statusBadge = (s) => {
        const map = { PENDENTE: 'pendente', APROVADO: 'ok', REPROVADO: 'vencido', PRORROGADO: 'afastado', EFETIVADO: 'ativo' };
        return `<span class="badge badge-${map[s]||'info'}">${s}</span>`;
    };
    const resultBadge = (r) => {
        if (!r) return '<span style="color:var(--text-muted)">—</span>';
        return r === 'EFETIVADO' ? '<span class="badge badge-ativo">Efetivado</span>' : '<span class="badge badge-vencido">Desligado</span>';
    };

    tbody.innerHTML = slice.map(c => {
        const isAlert45 = c.data_fim_45 && new Date(c.data_fim_45 + 'T00:00:00') <= new Date(hoje.getTime() + 15*86400000) && c.status_45 === 'PENDENTE';
        const isAlert90 = c.data_fim_90 && new Date(c.data_fim_90 + 'T00:00:00') <= new Date(hoje.getTime() + 15*86400000) && c.status_90 === 'PENDENTE';
        return `
            <tr ${isAlert45||isAlert90 ? 'style="background:rgba(245,158,11,0.04);"' : ''}>
                <td data-label="Funcionário" style="font-weight:600;">${c.funcionario_nome}</td>
                <td data-label="Início">${formatDate(c.data_inicio)}</td>
                <td data-label="45 dias">${formatDate(c.data_fim_45)}${isAlert45?' ⚠️':''}</td>
                <td data-label="Status 45">${statusBadge(c.status_45)}</td>
                <td data-label="90 dias">${formatDate(c.data_fim_90)}${isAlert90?' ⚠️':''}</td>
                <td data-label="Status 90">${statusBadge(c.status_90)}</td>
                <td data-label="Resultado">${resultBadge(c.resultado_final)}</td>
                <td data-label="Ações" style="white-space:nowrap;">
                    <button class="btn-icon" onclick="editarContrato('${c.id}')" title="Editar"><i data-lucide="pencil"></i></button>
                    <button class="btn-icon danger" onclick="deletarRegistro('contrato','${c.id}')" title="Excluir"><i data-lucide="trash-2"></i></button>
                </td>
            </tr>`;
    }).join('');

    renderPagination('contr-pagination', 'contr-page-info', page, total, list.length, 'renderContratos');
    lucide.createIcons();
}

// ============================================================
//  RENDER: CHECKLIST
// ============================================================

function renderChecklist() {
    const search = (document.getElementById('check-search')?.value || '').toLowerCase();
    const filterPeriodo = document.getElementById('check-filter-periodo')?.value || '';
    const filterRec = document.getElementById('check-filter-rec')?.value || '';

    let list = dpChecklist.filter(c => {
        if (search && !c.funcionario_nome.toLowerCase().includes(search)) return false;
        if (filterPeriodo && c.periodo !== filterPeriodo) return false;
        if (filterRec && c.recomendacao !== filterRec) return false;
        return true;
    });

    list = semanticSort(list, sorts.checklist);
    const { page, total } = paginate('checklist', list.length);
    const slice = list.slice((page - 1) * PER_PAGE, page * PER_PAGE);

    const tbody = document.getElementById('check-tbody');
    if (slice.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="table-empty"><i data-lucide="clipboard-check" style="display:block;margin:0 auto 0.5rem;width:32px;height:32px;"></i>Nenhuma avaliação encontrada</td></tr>`;
        lucide.createIcons(); return;
    }

    const recMap = { EFETIVADO: 'ativo', PRORROGAR: 'afastado', DESLIGAR: 'vencido' };
    tbody.innerHTML = slice.map(c => {
        const nota = c.nota_media ? parseFloat(c.nota_media).toFixed(1) : '—';
        return `
            <tr>
                <td data-label="Funcionário" style="font-weight:600;">${c.funcionario_nome}</td>
                <td data-label="Período"><span class="badge badge-info">${c.periodo === '45_DIAS' ? '45 dias' : '90 dias'}</span></td>
                <td data-label="Data">${formatDate(c.data_avaliacao)}</td>
                <td data-label="Avaliador">${c.avaliador || '<span style="color:var(--text-muted)">—</span>'}</td>
                <td data-label="Nota" style="font-weight:700;color:${getNota(c.nota_media).color};">${nota} ⭐</td>
                <td data-label="Recomendação">${c.recomendacao ? `<span class="badge badge-${recMap[c.recomendacao]||'info'}">${c.recomendacao}</span>` : '<span style="color:var(--text-muted)">—</span>'}</td>
                <td data-label="Assinaturas">
                    <span title="Funcionário">${c.assinatura_func ? '✅' : '⬜'}</span>
                    <span title="Gestor">${c.assinatura_gestor ? '✅' : '⬜'}</span>
                </td>
                <td data-label="Ações" style="white-space:nowrap;">
                    <button class="btn-icon" onclick="editarChecklist('${c.id}')" title="Editar"><i data-lucide="pencil"></i></button>
                    <button class="btn-icon danger" onclick="deletarRegistro('checklist','${c.id}')" title="Excluir"><i data-lucide="trash-2"></i></button>
                </td>
            </tr>`;
    }).join('');

    renderPagination('check-pagination', 'check-page-info', page, total, list.length, 'renderChecklist');
    lucide.createIcons();
}

// ============================================================
//  RENDER: CARGOS
// ============================================================

function renderCargos() {
    const search = (document.getElementById('cargo-search')?.value || '').toLowerCase();
    const filterNivel = document.getElementById('cargo-filter-nivel')?.value || '';
    const filterAtivo = document.getElementById('cargo-filter-ativo')?.value || '';

    let list = dpCargos.filter(c => {
        const s = `${c.nome} ${c.cbo || ''} ${c.setor || ''}`.toLowerCase();
        if (search && !s.includes(search)) return false;
        if (filterNivel && c.nivel !== filterNivel) return false;
        if (filterAtivo !== '' && String(c.ativo) !== filterAtivo) return false;
        return true;
    });

    list = semanticSort(list, sorts.cargos);
    const { page, total } = paginate('cargos', list.length);
    const slice = list.slice((page - 1) * PER_PAGE, page * PER_PAGE);

    const tbody = document.getElementById('cargo-tbody');
    if (slice.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="table-empty"><i data-lucide="briefcase" style="display:block;margin:0 auto 0.5rem;width:32px;height:32px;"></i>Nenhum cargo encontrado</td></tr>`;
        lucide.createIcons(); return;
    }

    tbody.innerHTML = slice.map(c => `
        <tr>
            <td data-label="Cargo" style="font-weight:600;">${c.nome}</td>
            <td data-label="CBO"><code style="font-family:'JetBrains Mono',monospace;font-size:0.8rem;">${c.cbo || '—'}</code></td>
            <td data-label="Nível"><span class="badge badge-purple">${c.nivel || '—'}</span></td>
            <td data-label="Setor">${c.setor || '<span style="color:var(--text-muted)">—</span>'}</td>
            <td data-label="Salário Base">${c.salario_base ? 'R$ ' + parseFloat(c.salario_base).toLocaleString('pt-BR', {minimumFractionDigits:2}) : '<span style="color:var(--text-muted)">—</span>'}</td>
            <td data-label="Faixa" style="font-size:0.82rem;color:var(--text-muted);">${c.salario_minimo && c.salario_maximo ? `R$ ${parseFloat(c.salario_minimo).toLocaleString('pt-BR',{minimumFractionDigits:0})} – R$ ${parseFloat(c.salario_maximo).toLocaleString('pt-BR',{minimumFractionDigits:0})}` : '—'}</td>
            <td data-label="C.H.">${c.carga_horaria || '—'}h</td>
            <td data-label="Status"><span class="badge ${c.ativo !== false ? 'badge-ativo' : 'badge-desligado'}">${c.ativo !== false ? 'Ativo' : 'Inativo'}</span></td>
            <td data-label="Ações" style="white-space:nowrap;">
                <button class="btn-icon" onclick="verCargo('${c.id}')" title="Detalhes"><i data-lucide="eye"></i></button>
                <button class="btn-icon" onclick="editarCargo('${c.id}')" title="Editar"><i data-lucide="pencil"></i></button>
                <button class="btn-icon danger" onclick="deletarRegistro('cargo','${c.id}')" title="Excluir"><i data-lucide="trash-2"></i></button>
            </td>
        </tr>`).join('');

    renderPagination('cargo-pagination', 'cargo-page-info', page, total, list.length, 'renderCargos');
    lucide.createIcons();
}

function obterEstadoFormulario(modal) {
    if (!modal) return '';
    const inputs = modal.querySelectorAll('input, select, textarea');
    let estado = {};
    inputs.forEach(i => {
        if (i.id) estado[i.id] = i.value;
    });
    return JSON.stringify(estado);
}

function abrirModalPadrao(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.add('open');
    // Salvar estado atual do formulário recém-aberto
    window._estadoInicialModal = obterEstadoFormulario(modal);
    // Focar no primeiro campo disponível (não-readonly)
    setTimeout(() => {
        const primeiro = modal.querySelector('input:not([readonly]):not([type="hidden"]), select:not([readonly]), textarea:not([readonly])');
        if (primeiro) primeiro.focus();
    }, 100);
}

function fecharModal(id, forcar = false) {
    const modal = document.getElementById(id);
    if (!modal) return;
    if (!forcar) {
        const estadoAtual = obterEstadoFormulario(modal);
        if (estadoAtual !== window._estadoInicialModal) {
            if (!confirm('Deseja fechar o formulário? Todas as alterações não salvas serão perdidas.')) {
                return;
            }
        }
    }
    modal.classList.remove('open');
}

function abrirNovoRegistroAbaAtiva() {
    // Achar aba principal ativa
    const activeTab = document.querySelector('.tabs-header > .tab-item.active');
    if (!activeTab) return;
    const tabId = activeTab.id.replace('tab-', '');

    // Se estiver em abas com sub-abas, achar a sub-aba ativa
    if (tabId === 'ponto') {
        const activeSub = document.querySelector('#view-ponto .tab-item.active');
        if (activeSub) {
            const subId = activeSub.id.replace('sub-ponto-', '');
            if (subId === 'banco') abrirModalPonto();
            if (subId === 'atestados') abrirModalAtestado();
        }
    } else if (tabId === 'epis') {
        const activeSub = document.querySelector('#view-epis .tab-item.active');
        if (activeSub) {
            const subId = activeSub.id.replace('sub-epis-', '');
            if (subId === 'epi') abrirModalEpi();
            if (subId === 'uniforme') abrirModalUniforme();
        }
    } else if (tabId === 'contratos') {
        const activeSub = document.querySelector('#view-contratos .tab-item.active');
        if (activeSub) {
            const subId = activeSub.id.replace('sub-contratos-', '');
            if (subId === 'exp') abrirModalContrato();
            if (subId === 'check') abrirModalChecklist();
        }
    } else {
        // Sem sub-abas
        const actions = {
            funcionarios: abrirModalFuncionario,
            aso: abrirModalAso,
            ferias: abrirModalFerias,
            beneficios: abrirModalBeneficio,
            cargos: abrirModalCargo
        };
        if (actions[tabId]) actions[tabId]();
    }
}

function abrirModalFuncionario() {
    editIds.funcionario = null;
    document.getElementById('modal-func-title').textContent = 'Novo Funcionário';
    document.getElementById('form-funcionario').reset();
    document.getElementById('func-motivo-deslig-wrap').style.display = 'none';
    document.getElementById('func-data-demissao-wrap').style.display = 'none';
    abrirModalPadrao('modal-funcionario');
    lucide.createIcons();
}

function abrirModalAso() {
    editIds.aso = null;
    document.getElementById('modal-aso-title').textContent = 'Novo ASO';
    document.getElementById('aso-func-id').value = '';
    document.getElementById('aso-tipo').value = '';
    document.getElementById('aso-data').value = '';
    document.getElementById('aso-periodicidade').value = '';
    document.getElementById('aso-vencimento').value = '';
    document.getElementById('aso-resultado').value = 'APTO';
    document.getElementById('aso-medico').value = '';
    document.getElementById('aso-crm').value = '';
    document.getElementById('aso-clinica').value = '';
    document.getElementById('aso-exames').value = '';
    document.getElementById('aso-restricoes').value = '';
    document.getElementById('aso-obs').value = '';
    document.getElementById('aso-restricoes-wrap').style.display = 'none';
    // Resetar estado do campo vencimento
    const vencInput = document.getElementById('aso-vencimento');
    if (vencInput) { vencInput.readOnly = false; vencInput.style.opacity = ''; vencInput.style.cursor = ''; }
    const autoLabel = document.getElementById('aso-venc-auto-label');
    if (autoLabel) autoLabel.textContent = '';
    toggleAsoVencimento();
    abrirModalPadrao('modal-aso');
    lucide.createIcons();
}

function abrirModalFerias() {
    editIds.ferias = null;
    document.getElementById('modal-ferias-title').textContent = 'Registrar Férias';
    ['ferias-func-id','ferias-aq-ini','ferias-aq-fim','ferias-gozo-ini','ferias-gozo-fim',
     'ferias-dias','ferias-pgto','ferias-obs','ferias-valor'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    document.getElementById('ferias-status').value = 'AQUISITIVO';
    abrirModalPadrao('modal-ferias');
    lucide.createIcons();
}

function abrirModalPonto() {
    editIds.ponto = null;
    document.getElementById('modal-ponto-title').textContent = 'Registrar Ocorrência';
    ['ponto-func-id','ponto-tipo','ponto-data','ponto-justificativa','ponto-aprovado'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('ponto-minutos').value = '';
    document.getElementById('ponto-justificado').value = 'false';
    abrirModalPadrao('modal-ponto');
    lucide.createIcons();
}

function abrirModalAtestado() {
    editIds.atestado = null;
    document.getElementById('modal-atestado-title').textContent = 'Novo Atestado / Afastamento';
    ['atestado-func-id','atestado-tipo','atestado-inicio','atestado-fim','atestado-cid',
     'atestado-medico','atestado-crm','atestado-beneficio','atestado-pericia','atestado-retorno','atestado-obs'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('atestado-dias').value = '';
    document.getElementById('atestado-status').value = 'ATIVO';
    abrirModalPadrao('modal-atestado');
    lucide.createIcons();
}

function abrirModalEpi() {
    editIds.epi = null;
    document.getElementById('modal-epi-title').textContent = 'Registrar Entrega de EPI';
    ['epi-func-id','epi-nome','epi-ca','epi-ca-venc','epi-fabricante','epi-venc-epi','epi-obs'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('epi-qtd').value = '1';
    document.getElementById('epi-motivo').value = 'ADMISSIONAL';
    document.getElementById('epi-assinatura').value = 'false';
    abrirModalPadrao('modal-epi');
    lucide.createIcons();
}

function abrirModalUniforme() {
    editIds.uniforme = null;
    document.getElementById('modal-uniforme-title').textContent = 'Registrar Uniforme';
    ['unif-func-id','unif-item','unif-tamanho','unif-entrega','unif-obs'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('unif-qtd').value = '1';
    document.getElementById('unif-estado').value = 'NOVO';
    document.getElementById('unif-motivo').value = 'ADMISSIONAL';
    abrirModalPadrao('modal-uniforme');
    lucide.createIcons();
}

function abrirModalBeneficio() {
    editIds.beneficio = null;
    document.getElementById('modal-benef-title').textContent = 'Novo Benefício';
    ['benef-func-id','benef-tipo','benef-desc','benef-operadora','benef-cartao','benef-inicio','benef-fim','benef-obs'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('benef-valor').value = '';
    document.getElementById('benef-desconto').value = '';
    document.getElementById('benef-ativo').value = 'true';
    abrirModalPadrao('modal-beneficio');
    lucide.createIcons();
}

function abrirModalContrato() {
    editIds.contrato = null;
    document.getElementById('modal-contr-title').textContent = 'Novo Contrato de Experiência';
    ['contr-func-id','contr-inicio','contr-fim45','contr-fim90','contr-data45','contr-aval45',
     'contr-avaliacao45','contr-data90','contr-aval90','contr-avaliacao90','contr-data-efetivacao','contr-obs'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('contr-status45').value = 'PENDENTE';
    document.getElementById('contr-status90').value = 'PENDENTE';
    document.getElementById('contr-resultado').value = '';
    abrirModalPadrao('modal-contrato');
    lucide.createIcons();
}

function abrirModalChecklist() {
    editIds.checklist = null;
    document.getElementById('modal-check-title').textContent = 'Avaliação de Experiência';
    ['check-func-id','check-avaliador','check-comentarios'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('check-data').value = new Date().toISOString().split('T')[0];
    document.getElementById('check-periodo').value = '45_DIAS';
    document.getElementById('check-recomendacao').value = '';
    document.getElementById('check-assin-func').value = 'false';
    document.getElementById('check-assin-gestor').value = 'false';
    // Reset star scores
    CHECKLIST_CRITERIOS.forEach(c => setStarValue(c.key, 0));
    document.getElementById('nota-total-box').style.display = 'none';
    abrirModalPadrao('modal-checklist');
    lucide.createIcons();
}

function abrirModalCargo() {
    editIds.cargo = null;
    document.getElementById('modal-cargo-title').textContent = 'Novo Cargo';
    ['cargo-nome','cargo-cbo','cargo-setor','cargo-descricao','cargo-responsabilidades','cargo-requisitos','cargo-beneficios'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('cargo-ch').value = '220';
    document.getElementById('cargo-salario-base').value = '';
    document.getElementById('cargo-salario-min').value = '';
    document.getElementById('cargo-salario-max').value = '';
    document.getElementById('cargo-nivel').value = '';
    document.getElementById('cargo-ativo').value = 'true';
    abrirModalPadrao('modal-cargo');
    lucide.createIcons();
}

// ============================================================
//  EDITAR (carregar dados no modal)
// ============================================================

function editarFuncionario(id) {
    const f = dpFuncionarios.find(x => x.id === id);
    if (!f) return;
    editIds.funcionario = id;
    document.getElementById('modal-func-title').textContent = 'Editar Funcionário';
    const fields = {
        'func-nome': f.nome_completo, 'func-cpf': f.cpf, 'func-rg': f.rg,
        'func-rg-orgao': f.rg_orgao_emissor, 'func-nascimento': f.data_nascimento,
        'func-sexo': f.sexo, 'func-estado-civil': f.estado_civil, 'func-escolaridade': f.escolaridade,
        'func-mae': f.nome_mae, 'func-naturalidade': f.naturalidade,
        'func-celular': f.celular, 'func-telefone': f.telefone, 'func-email': f.email,
        'func-cep': f.cep, 'func-logradouro': f.logradouro, 'func-numero': f.numero,
        'func-complemento': f.complemento, 'func-bairro': f.bairro, 'func-cidade': f.cidade,
        'func-uf': f.uf, 'func-emerg-nome': f.emergencia_nome, 'func-emerg-tel': f.emergencia_telefone,
        'func-emerg-parent': f.emergencia_parentesco, 'func-matricula': f.matricula,
        'func-cargo-id': f.cargo_id, 'func-setor': f.setor, 'func-admissao': f.data_admissao,
        'func-tipo-contrato': f.tipo_contrato, 'func-turno': f.turno, 'func-salario': f.salario,
        'func-status': f.status, 'func-motivo-deslig': f.motivo_desligamento, 'func-demissao': f.data_demissao,
        'func-pis': f.pis_pasep, 'func-ctps-num': f.ctps_numero, 'func-ctps-serie': f.ctps_serie,
        'func-ctps-uf': f.ctps_uf, 'func-ctps-data': f.ctps_data_emissao,
        'func-banco': f.banco, 'func-agencia': f.agencia, 'func-conta': f.conta,
        'func-tipo-conta': f.tipo_conta, 'func-pix': f.chave_pix, 'func-obs': f.observacoes,
    };
    Object.entries(fields).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el && val != null) el.value = val;
    });
    const isDesligado = f.status === 'DESLIGADO';
    document.getElementById('func-motivo-deslig-wrap').style.display = isDesligado ? 'flex' : 'none';
    document.getElementById('func-data-demissao-wrap').style.display = isDesligado ? 'flex' : 'none';
    abrirModalPadrao('modal-funcionario');
    lucide.createIcons();
}

function editarAso(id) {
    const a = dpAsos.find(x => x.id === id);
    if (!a) return;
    editIds.aso = id;
    document.getElementById('modal-aso-title').textContent = 'Editar ASO';
    // Carregar periodicidade ANTES do vencimento para o cálculo de estado funcionar
    const fields = {
        'aso-func-id': a.funcionario_id, 'aso-tipo': a.tipo, 'aso-data': a.data_exame,
        'aso-periodicidade': a.periodicidade_meses,
        'aso-resultado': a.resultado, 'aso-medico': a.medico_nome, 'aso-crm': a.medico_crm,
        'aso-clinica': a.clinica, 'aso-exames': a.exames_realizados,
        'aso-restricoes': a.restricoes, 'aso-obs': a.observacoes,
    };
    Object.entries(fields).forEach(([id, val]) => { const el = document.getElementById(id); if (el && val != null) el.value = val; });
    // Carregar vencimento e ativar cálculo auto se houver periodicidade
    if (a.data_vencimento) document.getElementById('aso-vencimento').value = a.data_vencimento;
    calcularVencimentoAso(); // define readonly e label conforme periodicidade salva
    toggleAsoVencimento();
    document.getElementById('aso-restricoes-wrap').style.display = a.resultado === 'APTO_COM_RESTRICOES' ? 'flex' : 'none';
    abrirModalPadrao('modal-aso');
    lucide.createIcons();
}

function editarFerias(id) {
    const f = dpFerias.find(x => x.id === id);
    if (!f) return;
    editIds.ferias = id;
    document.getElementById('modal-ferias-title').textContent = 'Editar Férias';
    const fields = {
        'ferias-func-id': f.funcionario_id, 'ferias-aq-ini': f.periodo_aq_inicio, 'ferias-aq-fim': f.periodo_aq_fim,
        'ferias-gozo-ini': f.data_inicio_gozo, 'ferias-gozo-fim': f.data_fim_gozo,
        'ferias-dias': f.dias_gozados, 'ferias-parcela': f.parcela_numero, 'ferias-abono': f.abono_pecuniario,
        'ferias-13': f.adiantamento_13, 'ferias-status': f.status,
        'ferias-pgto': f.data_pagamento, 'ferias-valor': f.valor_pago, 'ferias-obs': f.observacoes,
    };
    Object.entries(fields).forEach(([id, val]) => { const el = document.getElementById(id); if (el && val != null) el.value = val; });
    abrirModalPadrao('modal-ferias');
    lucide.createIcons();
}

function editarPonto(id) {
    const p = dpPonto.find(x => x.id === id);
    if (!p) return;
    editIds.ponto = id;
    document.getElementById('modal-ponto-title').textContent = 'Editar Ocorrência';
    const fields = {
        'ponto-func-id': p.funcionario_id, 'ponto-tipo': p.tipo, 'ponto-data': p.data,
        'ponto-minutos': p.minutos, 'ponto-justificativa': p.justificativa,
        'ponto-justificado': p.justificado, 'ponto-aprovado': p.aprovado_por,
    };
    Object.entries(fields).forEach(([id, val]) => { const el = document.getElementById(id); if (el && val != null) el.value = val; });
    abrirModalPadrao('modal-ponto');
    lucide.createIcons();
}

function editarAtestado(id) {
    const a = dpAtestados.find(x => x.id === id);
    if (!a) return;
    editIds.atestado = id;
    document.getElementById('modal-atestado-title').textContent = 'Editar Atestado';
    const fields = {
        'atestado-func-id': a.funcionario_id, 'atestado-tipo': a.tipo,
        'atestado-inicio': a.data_inicio, 'atestado-fim': a.data_fim, 'atestado-dias': a.dias,
        'atestado-cid': a.cid, 'atestado-medico': a.medico_nome, 'atestado-crm': a.medico_crm,
        'atestado-beneficio': a.numero_beneficio, 'atestado-pericia': a.data_pericia,
        'atestado-status': a.status, 'atestado-retorno': a.retorno_efetivo, 'atestado-obs': a.observacoes,
    };
    Object.entries(fields).forEach(([id, val]) => { const el = document.getElementById(id); if (el && val != null) el.value = val; });
    abrirModalPadrao('modal-atestado');
    lucide.createIcons();
}

function editarEpi(id) {
    const e = dpEpis.find(x => x.id === id);
    if (!e) return;
    editIds.epi = id;
    document.getElementById('modal-epi-title').textContent = 'Editar EPI';
    const fields = {
        'epi-func-id': e.funcionario_id, 'epi-nome': e.nome_epi, 'epi-ca': e.ca_numero,
        'epi-ca-venc': e.ca_vencimento, 'epi-fabricante': e.fabricante, 'epi-qtd': e.quantidade,
        'epi-entrega': e.data_entrega, 'epi-venc-epi': e.data_vencimento_epi,
        'epi-motivo': e.motivo, 'epi-assinatura': e.assinatura_recebido, 'epi-obs': e.observacoes,
    };
    Object.entries(fields).forEach(([id, val]) => { const el = document.getElementById(id); if (el && val != null) el.value = val; });
    abrirModalPadrao('modal-epi');
    lucide.createIcons();
}

function editarUniforme(id) {
    const u = dpUniformes.find(x => x.id === id);
    if (!u) return;
    editIds.uniforme = id;
    document.getElementById('modal-uniforme-title').textContent = 'Editar Uniforme';
    const fields = {
        'unif-func-id': u.funcionario_id, 'unif-item': u.item, 'unif-tamanho': u.tamanho,
        'unif-qtd': u.quantidade, 'unif-entrega': u.data_entrega, 'unif-estado': u.estado,
        'unif-motivo': u.motivo, 'unif-obs': u.observacoes,
    };
    Object.entries(fields).forEach(([id, val]) => { const el = document.getElementById(id); if (el && val != null) el.value = val; });
    abrirModalPadrao('modal-uniforme');
    lucide.createIcons();
}

function editarBeneficio(id) {
    const b = dpBeneficios.find(x => x.id === id);
    if (!b) return;
    editIds.beneficio = id;
    document.getElementById('modal-benef-title').textContent = 'Editar Benefício';
    const fields = {
        'benef-func-id': b.funcionario_id, 'benef-tipo': b.tipo, 'benef-desc': b.descricao,
        'benef-valor': b.valor, 'benef-desconto': b.valor_desconto_func,
        'benef-operadora': b.operadora, 'benef-cartao': b.numero_cartao,
        'benef-inicio': b.data_inicio, 'benef-fim': b.data_fim, 'benef-ativo': b.ativo, 'benef-obs': b.observacoes,
    };
    Object.entries(fields).forEach(([id, val]) => { const el = document.getElementById(id); if (el && val != null) el.value = val; });
    abrirModalPadrao('modal-beneficio');
    lucide.createIcons();
}

function editarContrato(id) {
    const c = dpContratos.find(x => x.id === id);
    if (!c) return;
    editIds.contrato = id;
    document.getElementById('modal-contr-title').textContent = 'Editar Contrato de Experiência';
    const fields = {
        'contr-func-id': c.funcionario_id, 'contr-inicio': c.data_inicio,
        'contr-fim45': c.data_fim_45, 'contr-fim90': c.data_fim_90,
        'contr-status45': c.status_45, 'contr-data45': c.data_avaliacao_45,
        'contr-aval45': c.avaliador_45, 'contr-avaliacao45': c.avaliacao_45,
        'contr-status90': c.status_90, 'contr-data90': c.data_avaliacao_90,
        'contr-aval90': c.avaliador_90, 'contr-avaliacao90': c.avaliacao_90,
        'contr-resultado': c.resultado_final, 'contr-data-efetivacao': c.data_efetivacao, 'contr-obs': c.observacoes,
    };
    Object.entries(fields).forEach(([id, val]) => { const el = document.getElementById(id); if (el && val != null) el.value = val; });
    abrirModalPadrao('modal-contrato');
    lucide.createIcons();
}

function editarChecklist(id) {
    const c = dpChecklist.find(x => x.id === id);
    if (!c) return;
    editIds.checklist = id;
    document.getElementById('modal-check-title').textContent = 'Editar Avaliação';
    const fields = {
        'check-func-id': c.funcionario_id, 'check-periodo': c.periodo,
        'check-data': c.data_avaliacao, 'check-avaliador': c.avaliador,
        'check-recomendacao': c.recomendacao, 'check-assin-func': c.assinatura_func,
        'check-assin-gestor': c.assinatura_gestor, 'check-comentarios': c.comentarios,
    };
    Object.entries(fields).forEach(([id, val]) => { const el = document.getElementById(id); if (el && val != null) el.value = val; });
    CHECKLIST_CRITERIOS.forEach(cr => setStarValue(cr.key, c[cr.key] || 0));
    calcularNotaMedia();
    abrirModalPadrao('modal-checklist');
    lucide.createIcons();
}

function editarCargo(id) {
    const c = dpCargos.find(x => x.id === id);
    if (!c) return;
    editIds.cargo = id;
    document.getElementById('modal-cargo-title').textContent = 'Editar Cargo';
    const fields = {
        'cargo-nome': c.nome, 'cargo-cbo': c.cbo, 'cargo-nivel': c.nivel, 'cargo-setor': c.setor,
        'cargo-ch': c.carga_horaria, 'cargo-salario-base': c.salario_base,
        'cargo-salario-min': c.salario_minimo, 'cargo-salario-max': c.salario_maximo,
        'cargo-descricao': c.descricao, 'cargo-responsabilidades': c.responsabilidades,
        'cargo-requisitos': c.requisitos, 'cargo-beneficios': c.beneficios_padrao, 'cargo-ativo': c.ativo,
    };
    Object.entries(fields).forEach(([id, val]) => { const el = document.getElementById(id); if (el && val != null) el.value = val; });
    abrirModalPadrao('modal-cargo');
    lucide.createIcons();
}

// ============================================================
//  FICHA DO FUNCIONÁRIO
// ============================================================

function verFicha(id) {
    const f = dpFuncionarios.find(x => x.id === id);
    if (!f) return;
    fichaFuncId = id;
    const cargo = dpCargos.find(c => c.id === f.cargo_id);
    const body = document.getElementById('ficha-body');
    const campo = (label, value) => `
        <div class="ficha-item">
            <span class="ficha-label">${label}</span>
            <span class="ficha-value">${value || '<span style="color:var(--text-muted)">Não informado</span>'}</span>
        </div>`;
    const sec = (title) => `<div class="ficha-section">${title}</div>`;

    body.innerHTML = `
        <div style="display:flex;align-items:center;gap:1.25rem;padding:0 0 1.5rem;border-bottom:1px solid var(--border-color);margin-bottom:1.25rem;">
            <div style="width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--purple));display:flex;align-items:center;justify-content:center;font-size:1.8rem;font-weight:800;color:#fff;flex-shrink:0;">
                ${f.nome_completo.split(' ').slice(0,2).map(n=>n[0]).join('')}
            </div>
            <div>
                <div style="font-size:1.3rem;font-weight:800;">${f.nome_completo}</div>
                <div style="color:var(--text-muted);font-size:0.9rem;">${f.cargo_nome || ''} ${f.setor ? '• ' + f.setor : ''}</div>
                <span class="badge badge-${(f.status||'').toLowerCase().replace('_','')}" style="margin-top:0.4rem;">${labelStatus(f.status)}</span>
            </div>
        </div>
        <div class="ficha-grid">
            ${sec('📋 Dados Pessoais')}
            ${campo('CPF', f.cpf)}
            ${campo('RG', f.rg ? f.rg + (f.rg_orgao_emissor ? ' / ' + f.rg_orgao_emissor : '') : null)}
            ${campo('Nascimento', formatDate(f.data_nascimento))}
            ${campo('Sexo', f.sexo === 'M' ? 'Masculino' : f.sexo === 'F' ? 'Feminino' : f.sexo)}
            ${campo('Estado Civil', f.estado_civil)}
            ${campo('Naturalidade', f.naturalidade)}
            ${campo('Escolaridade', f.escolaridade)}
            ${campo('Nome da Mãe', f.nome_mae)}

            ${sec('📞 Contato')}
            ${campo('Celular', f.celular)}
            ${campo('Telefone', f.telefone)}
            ${campo('E-mail', f.email)}
            ${campo('Endereço', [f.logradouro, f.numero, f.complemento, f.bairro, f.cidade, f.uf].filter(Boolean).join(', '))}
            ${campo('Emergência', f.emergencia_nome ? `${f.emergencia_nome} (${f.emergencia_parentesco || ''}) — ${f.emergencia_telefone || ''}` : null)}

            ${sec('💼 Dados Trabalhistas')}
            ${campo('Matrícula', f.matricula)}
            ${campo('Cargo', f.cargo_nome || (cargo?.nome))}
            ${campo('Setor', f.setor)}
            ${campo('Admissão', formatDate(f.data_admissao))}
            ${campo('Tipo Contrato', f.tipo_contrato)}
            ${campo('Turno', f.turno)}
            ${campo('Salário', f.salario ? 'R$ ' + parseFloat(f.salario).toLocaleString('pt-BR', {minimumFractionDigits:2}) : null)}
            ${f.data_demissao ? campo('Demissão', formatDate(f.data_demissao)) : ''}

            ${sec('📄 Documentos')}
            ${campo('PIS/PASEP', f.pis_pasep)}
            ${campo('CTPS', f.ctps_numero ? `${f.ctps_numero} / Série ${f.ctps_serie} / ${f.ctps_uf}` : null)}

            ${sec('🏦 Dados Bancários')}
            ${campo('Banco', f.banco)}
            ${campo('Agência / Conta', f.agencia ? `${f.agencia} / ${f.conta} (${f.tipo_conta || ''})` : null)}
            ${campo('Chave PIX', f.chave_pix)}

            ${f.observacoes ? `${sec('📝 Observações')}<div class="ficha-item" style="grid-column:1/-1;"><span class="ficha-value">${f.observacoes}</span></div>` : ''}
        </div>`;

    document.getElementById('modal-ficha').classList.add('open');
    lucide.createIcons();
}

function editarFuncionarioDaFicha() {
    fecharModal('modal-ficha');
    if (fichaFuncId) editarFuncionario(fichaFuncId);
}

function verCargo(id) {
    const c = dpCargos.find(x => x.id === id);
    if (!c) return;
    const funcsNoCargo = dpFuncionarios.filter(f => f.cargo_id === id && f.status !== 'DESLIGADO').length;
    toast(`Cargo "${c.nome}" — ${funcsNoCargo} funcionário(s) neste cargo`, 'info');
}

// ============================================================
//  SALVAR (CRUD)
// ============================================================

async function salvarFuncionario() {
    const nome = document.getElementById('func-nome')?.value?.trim();
    const admissao = document.getElementById('func-admissao')?.value;
    if (!nome) { toast('Nome do funcionário é obrigatório.', 'error'); return; }
    if (!admissao) { toast('Data de admissão é obrigatória.', 'error'); return; }

    const cargoId = document.getElementById('func-cargo-id')?.value || null;
    const cargo = dpCargos.find(c => c.id === cargoId);

    const payload = {
        empresa_id: empresaId,
        nome_completo: nome,
        cpf: v('func-cpf'), rg: v('func-rg'), rg_orgao_emissor: v('func-rg-orgao'),
        data_nascimento: v('func-nascimento') || null, sexo: v('func-sexo'),
        estado_civil: v('func-estado-civil'), escolaridade: v('func-escolaridade'),
        nome_mae: v('func-mae'), naturalidade: v('func-naturalidade'),
        celular: v('func-celular'), telefone: v('func-telefone'), email: v('func-email'),
        cep: v('func-cep'), logradouro: v('func-logradouro'), numero: v('func-numero'),
        complemento: v('func-complemento'), bairro: v('func-bairro'), cidade: v('func-cidade'), uf: v('func-uf'),
        emergencia_nome: v('func-emerg-nome'), emergencia_telefone: v('func-emerg-tel'), emergencia_parentesco: v('func-emerg-parent'),
        matricula: v('func-matricula'), cargo_id: cargoId || null, cargo_nome: cargo?.nome || v('func-cargo-id'),
        setor: v('func-setor'), data_admissao: admissao, tipo_contrato: v('func-tipo-contrato'),
        turno: v('func-turno'), salario: parseFloatOrNull('func-salario'), status: v('func-status'),
        motivo_desligamento: v('func-motivo-deslig'), data_demissao: v('func-demissao') || null,
        pis_pasep: v('func-pis'), ctps_numero: v('func-ctps-num'), ctps_serie: v('func-ctps-serie'),
        ctps_uf: v('func-ctps-uf'), ctps_data_emissao: v('func-ctps-data') || null,
        banco: v('func-banco'), agencia: v('func-agencia'), conta: v('func-conta'),
        tipo_conta: v('func-tipo-conta'), chave_pix: v('func-pix'), observacoes: v('func-obs'),
        updated_at: new Date().toISOString(),
    };

    try {
        let err;
        let descLog = '';
        if (editIds.funcionario) {
            // Detectar modificações
            const original = dpFuncionarios.find(f => f.id === editIds.funcionario);
            const diffs = obterDiferencas(original, payload);
            
            if (diffs) {
                const motivo = prompt("Por favor, informe o motivo da alteração deste funcionário:");
                if (motivo === null) return; // Cancelou
                if (!motivo.trim()) {
                    toast('Justificativa é obrigatória para salvar as alterações.', 'error');
                    return;
                }
                descLog = `DETALHE: Alterou dados do funcionário: ${nome} | ALTERACAO: ${diffs} | MOTIVO: ${motivo}`;
            } else {
                descLog = `DETALHE: Re-salvou cadastro do funcionário: ${nome} (Sem modificações)`;
            }

            ({ error: err } = await sb.from('dp_funcionarios').update(payload).eq('id', editIds.funcionario));
            if (!err) registrarLog('dp', 'ALTERAÇÃO', descLog);
        } else {
            ({ error: err } = await sb.from('dp_funcionarios').insert(payload));
            if (!err) registrarLog('dp', 'INCLUSÃO', `DETALHE: Cadastrou novo funcionário: ${nome}`);
        }
        if (err) throw err;
        fecharModal('modal-funcionario');
        await loadFuncionarios();
        populateFuncSelects();
        renderFuncionarios();
        renderDashboard();
        toast(editIds.funcionario ? 'Funcionário atualizado!' : 'Funcionário cadastrado com sucesso!', 'success');
    } catch (e) {
        console.error(e);
        toast('Erro ao salvar: ' + (e.message || 'Verifique os dados'), 'error');
    }
}

async function salvarAso() {
    const funcId = v('aso-func-id');
    const tipo = v('aso-tipo');
    const data = v('aso-data');
    if (!funcId || !tipo || !data) { toast('Preencha funcionário, tipo e data do exame.', 'error'); return; }

    const payload = {
        empresa_id: empresaId, funcionario_id: funcId, tipo, data_exame: data,
        data_vencimento: v('aso-vencimento') || null, periodicidade_meses: parseInt(v('aso-periodicidade')) || null,
        resultado: v('aso-resultado'), medico_nome: v('aso-medico'), medico_crm: v('aso-crm'),
        clinica: v('aso-clinica'), exames_realizados: v('aso-exames'), restricoes: v('aso-restricoes'), observacoes: v('aso-obs'),
        updated_at: new Date().toISOString(),
    };
    await crudSave('dp_asos', 'aso', payload, loadAsos, renderAsos);
}

async function salvarFerias() {
    const funcId = v('ferias-func-id');
    const aqIni = v('ferias-aq-ini');
    const aqFim = v('ferias-aq-fim');
    if (!funcId || !aqIni || !aqFim) { toast('Preencha funcionário e período aquisitivo.', 'error'); return; }

    // Calcular limite concessivo (12 meses após fim do aquisitivo)
    const concFim = new Date(aqFim + 'T00:00:00');
    concFim.setFullYear(concFim.getFullYear() + 1);

    const payload = {
        empresa_id: empresaId, funcionario_id: funcId,
        periodo_aq_inicio: aqIni, periodo_aq_fim: aqFim,
        periodo_conc_fim: concFim.toISOString().split('T')[0],
        data_inicio_gozo: v('ferias-gozo-ini') || null, data_fim_gozo: v('ferias-gozo-fim') || null,
        dias_gozados: parseInt(v('ferias-dias')) || null,
        parcela_numero: parseInt(v('ferias-parcela')) || 1,
        abono_pecuniario: v('ferias-abono') === 'true', adiantamento_13: v('ferias-13') === 'true',
        status: v('ferias-status'), data_pagamento: v('ferias-pgto') || null,
        valor_pago: parseFloatOrNull('ferias-valor'), observacoes: v('ferias-obs'),
        updated_at: new Date().toISOString(),
    };
    await crudSave('dp_ferias', 'ferias', payload, loadFerias, renderFerias);
}

async function salvarPonto() {
    const funcId = v('ponto-func-id');
    const tipo = v('ponto-tipo');
    const data = v('ponto-data');
    if (!funcId || !tipo || !data) { toast('Preencha funcionário, tipo e data.', 'error'); return; }

    const payload = {
        empresa_id: empresaId, funcionario_id: funcId, tipo, data,
        minutos: parseInt(v('ponto-minutos')) || null,
        justificativa: v('ponto-justificativa'), justificado: v('ponto-justificado') === 'true',
        aprovado_por: v('ponto-aprovado'), updated_at: new Date().toISOString(),
    };
    await crudSave('dp_ponto', 'ponto', payload, loadPonto, renderPonto);
}

async function salvarAtestado() {
    const funcId = v('atestado-func-id');
    const tipo = v('atestado-tipo');
    const inicio = v('atestado-inicio');
    if (!funcId || !tipo || !inicio) { toast('Preencha funcionário, tipo e data de início.', 'error'); return; }

    const payload = {
        empresa_id: empresaId, funcionario_id: funcId, tipo, data_inicio: inicio,
        data_fim: v('atestado-fim') || null, dias: parseInt(v('atestado-dias')) || null,
        cid: v('atestado-cid'), medico_nome: v('atestado-medico'), medico_crm: v('atestado-crm'),
        numero_beneficio: v('atestado-beneficio'), data_pericia: v('atestado-pericia') || null,
        status: v('atestado-status'), retorno_efetivo: v('atestado-retorno') || null, observacoes: v('atestado-obs'),
        updated_at: new Date().toISOString(),
    };
    await crudSave('dp_atestados', 'atestado', payload, loadAtestados, renderAtestados);
}

async function salvarEpi() {
    const funcId = v('epi-func-id');
    const nome = v('epi-nome');
    const entrega = v('epi-entrega');
    if (!funcId || !nome || !entrega) { toast('Preencha funcionário, nome do EPI e data de entrega.', 'error'); return; }

    const payload = {
        empresa_id: empresaId, funcionario_id: funcId, nome_epi: nome, ca_numero: v('epi-ca'),
        ca_vencimento: v('epi-ca-venc') || null, fabricante: v('epi-fabricante'),
        quantidade: parseInt(v('epi-qtd')) || 1, data_entrega: entrega,
        data_vencimento_epi: v('epi-venc-epi') || null, motivo: v('epi-motivo'),
        assinatura_recebido: v('epi-assinatura') === 'true', observacoes: v('epi-obs'),
        updated_at: new Date().toISOString(),
    };
    await crudSave('dp_epis', 'epi', payload, loadEpis, renderEpis);
}

async function salvarUniforme() {
    const funcId = v('unif-func-id');
    const item = v('unif-item');
    const entrega = v('unif-entrega');
    if (!funcId || !item || !entrega) { toast('Preencha funcionário, item e data de entrega.', 'error'); return; }

    const payload = {
        empresa_id: empresaId, funcionario_id: funcId, item, tamanho: v('unif-tamanho'),
        quantidade: parseInt(v('unif-qtd')) || 1, data_entrega: entrega,
        estado: v('unif-estado'), motivo: v('unif-motivo'), observacoes: v('unif-obs'),
        updated_at: new Date().toISOString(),
    };
    await crudSave('dp_uniformes', 'uniforme', payload, loadUniformes, renderUniformes);
}

async function salvarBeneficio() {
    const funcId = v('benef-func-id');
    const tipo = v('benef-tipo');
    const inicio = v('benef-inicio');
    if (!funcId || !tipo || !inicio) { toast('Preencha funcionário, tipo e data de início.', 'error'); return; }

    const payload = {
        empresa_id: empresaId, funcionario_id: funcId, tipo, descricao: v('benef-desc'),
        valor: parseFloatOrNull('benef-valor'), valor_desconto_func: parseFloatOrNull('benef-desconto'),
        operadora: v('benef-operadora'), numero_cartao: v('benef-cartao'),
        data_inicio: inicio, data_fim: v('benef-fim') || null,
        ativo: v('benef-ativo') === 'true', observacoes: v('benef-obs'),
        updated_at: new Date().toISOString(),
    };
    await crudSave('dp_beneficios', 'beneficio', payload, loadBeneficios, renderBeneficios);
}

async function salvarContrato() {
    const funcId = v('contr-func-id');
    const inicio = v('contr-inicio');
    if (!funcId || !inicio) { toast('Preencha funcionário e data de início.', 'error'); return; }

    const payload = {
        empresa_id: empresaId, funcionario_id: funcId, data_inicio: inicio,
        data_fim_45: v('contr-fim45') || null, data_fim_90: v('contr-fim90') || null,
        status_45: v('contr-status45'), data_avaliacao_45: v('contr-data45') || null,
        avaliador_45: v('contr-aval45'), avaliacao_45: v('contr-avaliacao45'),
        status_90: v('contr-status90'), data_avaliacao_90: v('contr-data90') || null,
        avaliador_90: v('contr-aval90'), avaliacao_90: v('contr-avaliacao90'),
        resultado_final: v('contr-resultado') || null, data_efetivacao: v('contr-data-efetivacao') || null,
        observacoes: v('contr-obs'), updated_at: new Date().toISOString(),
    };
    await crudSave('dp_contratos_exp', 'contrato', payload, loadContratos, renderContratos);
}

async function salvarChecklist() {
    const funcId = v('check-func-id');
    const periodo = v('check-periodo');
    if (!funcId || !periodo) { toast('Preencha funcionário e período.', 'error'); return; }

    const scores = {};
    let total = 0; let count = 0;
    CHECKLIST_CRITERIOS.forEach(c => {
        const val = getStarValue(c.key);
        scores[c.key] = val || null;
        if (val) { total += val; count++; }
    });
    const nota_media = count > 0 ? parseFloat((total / count).toFixed(2)) : null;

    const payload = {
        empresa_id: empresaId, funcionario_id: funcId, periodo,
        data_avaliacao: v('check-data') || null, avaliador: v('check-avaliador'),
        ...scores, nota_media,
        recomendacao: v('check-recomendacao') || null,
        assinatura_func: v('check-assin-func') === 'true',
        assinatura_gestor: v('check-assin-gestor') === 'true',
        comentarios: v('check-comentarios'), updated_at: new Date().toISOString(),
    };
    await crudSave('dp_checklist_exp', 'checklist', payload, loadChecklist, renderChecklist);
}

async function salvarCargo() {
    const nome = v('cargo-nome')?.trim();
    if (!nome) { toast('Nome do cargo é obrigatório.', 'error'); return; }

    const payload = {
        empresa_id: empresaId, nome, cbo: v('cargo-cbo'), nivel: v('cargo-nivel'),
        setor: v('cargo-setor'), carga_horaria: parseInt(v('cargo-ch')) || 220,
        salario_base: parseFloatOrNull('cargo-salario-base'),
        salario_minimo: parseFloatOrNull('cargo-salario-min'),
        salario_maximo: parseFloatOrNull('cargo-salario-max'),
        descricao: v('cargo-descricao'), responsabilidades: v('cargo-responsabilidades'),
        requisitos: v('cargo-requisitos'), beneficios_padrao: v('cargo-beneficios'),
        ativo: v('cargo-ativo') !== 'false', updated_at: new Date().toISOString(),
    };

    try {
        let err;
        let descLog = '';
        if (editIds.cargo) {
            const original = dpCargos.find(c => c.id === editIds.cargo);
            const diffs = obterDiferencas(original, payload);
            
            if (diffs) {
                const motivo = prompt("Por favor, informe o motivo da alteração deste cargo:");
                if (motivo === null) return;
                if (!motivo.trim()) {
                    toast('Justificativa é obrigatória para salvar as alterações.', 'error');
                    return;
                }
                descLog = `DETALHE: Alterou dados do cargo: ${nome} | ALTERACAO: ${diffs} | MOTIVO: ${motivo}`;
            } else {
                descLog = `DETALHE: Re-salvou cadastro do cargo: ${nome} (Sem modificações)`;
            }

            ({ error: err } = await sb.from('dp_cargos').update(payload).eq('id', editIds.cargo));
            if (!err) registrarLog('dp', 'ALTERAÇÃO', descLog);
        } else {
            ({ error: err } = await sb.from('dp_cargos').insert(payload));
            if (!err) registrarLog('dp', 'INCLUSÃO', `DETALHE: Cadastrou novo cargo: ${nome}`);
        }
        if (err) throw err;
        fecharModal('modal-cargo');
        await loadCargos();
        renderCargos();
        populateFuncSelects();
        toast(editIds.cargo ? 'Cargo atualizado!' : 'Cargo cadastrado!', 'success');
    } catch(e) {
        toast('Erro ao salvar cargo: ' + (e.message || ''), 'error');
    }
}

// Helper genérico de CRUD
async function crudSave(table, editKey, payload, loadFn, renderFn) {
    const modal = {
        aso: 'modal-aso', ferias: 'modal-ferias', ponto: 'modal-ponto', atestado: 'modal-atestado',
        epi: 'modal-epi', uniforme: 'modal-uniforme', beneficio: 'modal-beneficio',
        contrato: 'modal-contrato', checklist: 'modal-checklist',
    }[editKey];
    try {
        let err;
        let acaoLog = editIds[editKey] ? 'ALTERAÇÃO' : 'INCLUSÃO';
        
        // Buscar nome do funcionário na lista local
        let nomeFunc = '';
        if (payload.funcionario_id) {
            const funcObj = dpFuncionarios.find(f => f.id === payload.funcionario_id);
            if (funcObj) nomeFunc = ` do funcionário ${funcObj.nome_completo}`;
        }

        let descLog = `${editIds[editKey] ? 'Alterou' : 'Adicionou'} registro de `;
        
        switch(editKey) {
            case 'aso':
                descLog += `ASO ${payload.tipo}${nomeFunc} (Resultado: ${payload.resultado})`;
                break;
            case 'ferias':
                descLog += `Férias${nomeFunc} (Início do Gozo: ${payload.data_inicio_gozo || 'Não definido'}, Dias: ${payload.dias_gozados || 0})`;
                break;
            case 'ponto':
                descLog += `Ponto / Ocorrência de ${payload.tipo}${nomeFunc} na data ${payload.data}`;
                break;
            case 'atestado':
                descLog += `Atestado / Afastamento (${payload.tipo})${nomeFunc} (Início: ${payload.data_inicio}, Dias: ${payload.dias || 'Não informado'})`;
                break;
            case 'epi':
                descLog += `Entrega de EPI "${payload.nome_epi}"${nomeFunc} (CA: ${payload.ca_numero || '—'}, Qtd: ${payload.quantidade})`;
                break;
            case 'uniforme':
                descLog += `Entrega de Uniforme "${payload.item}"${nomeFunc} (Tamanho: ${payload.tamanho || '—'}, Qtd: ${payload.quantidade})`;
                break;
            case 'beneficio':
                descLog += `Benefício de ${payload.tipo}${nomeFunc} (Valor: R$ ${payload.valor || '0,00'})`;
                break;
            case 'contrato':
                descLog += `Contrato de Experiência${nomeFunc} (Início: ${payload.data_inicio})`;
                break;
            case 'checklist':
                descLog += `Avaliação de Experiência (${payload.periodo === '45_DIAS' ? '45 dias' : '90 dias'})${nomeFunc} (Média: ${payload.nota_media} ★, Recomendação: ${payload.recomendacao})`;
                break;
            default:
                descLog += `registro no submódulo ${editKey}${nomeFunc}`;
        }

        let finalAuditDescription = `DETALHE: ${descLog}`;

        if (editIds[editKey]) {
            // Obter array correspondente
            const stateLists = {
                aso: dpAsos, ferias: dpFerias, ponto: dpPonto, atestado: dpAtestados,
                epi: dpEpis, uniforme: dpUniformes, beneficio: dpBeneficios,
                contrato: dpContratos, checklist: dpChecklist
            };
            const list = stateLists[editKey] || [];
            const original = list.find(x => x.id === editIds[editKey]);
            const diffs = obterDiferencas(original, payload);
            
            if (diffs) {
                const motivo = prompt(`Por favor, informe o motivo da alteração deste registro de ${editKey}:`);
                if (motivo === null) return; // Cancelou
                if (!motivo.trim()) {
                    toast('Justificativa é obrigatória para salvar as alterações.', 'error');
                    return;
                }
                finalAuditDescription = `DETALHE: ${descLog} | ALTERACAO: ${diffs} | MOTIVO: ${motivo}`;
            } else {
                finalAuditDescription = `DETALHE: Re-salvou registro de ${editKey}${nomeFunc} (Sem modificações)`;
            }

            ({ error: err } = await sb.from(table).update(payload).eq('id', editIds[editKey]));
        } else {
            ({ error: err } = await sb.from(table).insert(payload));
        }

        if (err) throw err;
        registrarLog('dp', acaoLog, finalAuditDescription);
        fecharModal(modal);
        await loadFn();
        renderFn();
        renderDashboard();
        toast(editIds[editKey] ? 'Registro atualizado!' : 'Registro salvo com sucesso!', 'success');
    } catch(e) {
        console.error(e);
        toast('Erro ao salvar: ' + (e.message || 'Verifique os dados'), 'error');
    }
}

// ============================================================
//  DELETAR
// ============================================================

async function deletarRegistro(tipo, id) {
    if (!confirm('Confirma a exclusão deste registro? Esta ação não pode ser desfeita.')) return;
    const tableMap = {
        funcionario: 'dp_funcionarios', aso: 'dp_asos', ferias: 'dp_ferias', ponto: 'dp_ponto',
        atestado: 'dp_atestados', epi: 'dp_epis', uniforme: 'dp_uniformes', beneficio: 'dp_beneficios',
        contrato: 'dp_contratos_exp', checklist: 'dp_checklist_exp', cargo: 'dp_cargos',
    };
    const loadMap = {
        funcionario: loadFuncionarios, aso: loadAsos, ferias: loadFerias, ponto: loadPonto,
        atestado: loadAtestados, epi: loadEpis, uniforme: loadUniformes, beneficio: loadBeneficios,
        contrato: loadContratos, checklist: loadChecklist, cargo: loadCargos,
    };
    const renderMap = {
        funcionario: renderFuncionarios, aso: renderAsos, ferias: renderFerias, ponto: renderPonto,
        atestado: renderAtestados, epi: renderEpis, uniforme: renderUniformes, beneficio: renderBeneficios,
        contrato: renderContratos, checklist: renderChecklist, cargo: renderCargos,
    };

    // Buscar informações do item antes de excluir para enriquecer o log de auditoria
    let descExclusao = `Excluiu registro do tipo ${tipo} (ID: ${id})`;
    try {
        if (tipo === 'funcionario') {
            const item = dpFuncionarios.find(x => x.id === id);
            if (item) descExclusao = `Excluiu cadastro do funcionário ${item.nome_completo} (CPF: ${item.cpf || 'Não informado'})`;
        } else if (tipo === 'aso') {
            const item = dpAsos.find(x => x.id === id);
            if (item) descExclusao = `Excluiu ASO (${item.tipo}) do funcionário ${item.funcionario_nome}`;
        } else if (tipo === 'ferias') {
            const item = dpFerias.find(x => x.id === id);
            if (item) descExclusao = `Excluiu registro de Férias do funcionário ${item.funcionario_nome}`;
        } else if (tipo === 'ponto') {
            const item = dpPonto.find(x => x.id === id);
            if (item) descExclusao = `Excluiu Ocorrência de Ponto (${item.tipo}) do funcionário ${item.funcionario_nome}`;
        } else if (tipo === 'atestado') {
            const item = dpAtestados.find(x => x.id === id);
            if (item) descExclusao = `Excluiu Atestado / Afastamento (${item.tipo}) do funcionário ${item.funcionario_nome}`;
        } else if (tipo === 'epi') {
            const item = dpEpis.find(x => x.id === id);
            if (item) descExclusao = `Excluiu entrega de EPI (${item.nome_epi}) do funcionário ${item.funcionario_nome}`;
        } else if (tipo === 'uniforme') {
            const item = dpUniformes.find(x => x.id === id);
            if (item) descExclusao = `Excluiu entrega de Uniforme (${item.item}) do funcionário ${item.funcionario_nome}`;
        } else if (tipo === 'beneficio') {
            const item = dpBeneficios.find(x => x.id === id);
            if (item) descExclusao = `Excluiu benefício (${item.tipo}) do funcionário ${item.funcionario_nome}`;
        } else if (tipo === 'contrato') {
            const item = dpContratos.find(x => x.id === id);
            if (item) descExclusao = `Excluiu Contrato de Experiência do funcionário ${item.funcionario_nome}`;
        } else if (tipo === 'checklist') {
            const item = dpChecklist.find(x => x.id === id);
            if (item) descExclusao = `Excluiu Avaliação de Experiência (${item.periodo}) do funcionário ${item.funcionario_nome}`;
        } else if (tipo === 'cargo') {
            const item = dpCargos.find(x => x.id === id);
            if (item) descExclusao = `Excluiu o cargo ${item.nome} (CBO: ${item.cbo || '—'})`;
        }
    } catch (e) {
        console.warn('[AuditLog] Erro ao construir descrição rica de exclusão:', e);
    }

    try {
        const { error } = await sb.from(tableMap[tipo]).delete().eq('id', id);
        if (error) throw error;
        registrarLog('dp', 'EXCLUSÃO', descExclusao);
        await loadMap[tipo]();
        renderMap[tipo]();
        renderDashboard();
        toast('Registro excluído.', 'success');
    } catch(e) {
        toast('Erro ao excluir: ' + (e.message || ''), 'error');
    }
}

// ============================================================
//  NAVEGAÇÃO DE ABAS
// ============================================================

function switchTab(tabId) {
    document.querySelectorAll('.tabs-header > .tab-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view-section').forEach(s => {
        if (s.id.startsWith('view-') && !s.id.startsWith('sub-view-')) s.classList.remove('active');
    });
    const btn = document.getElementById(`tab-${tabId}`);
    if (btn) btn.classList.add('active');
    const section = document.getElementById(`view-${tabId}`);
    if (section) section.classList.add('active');

    // Renderizar aba ao entrar
    const renderMap = {
        funcionarios: renderFuncionarios, aso: renderAsos, ferias: renderFerias,
        ponto: () => {
            switchSubTab('ponto', 'atestados');
        },
        epis: () => {
            switchSubTab('epis', 'epi');
        },
        beneficios: renderBeneficios,
        contratos: () => {
            switchSubTab('contratos', 'exp');
        },
        cargos: renderCargos,
    };
    if (renderMap[tabId]) renderMap[tabId]();
    if (window.lucide) lucide.createIcons();
}

function switchSubTab(prefix, subId) {
    const container = document.getElementById(`view-${prefix}`);
    if (!container) return;
    container.querySelectorAll('.tab-item').forEach(b => b.classList.remove('active'));
    container.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
    const btn = document.getElementById(`sub-${prefix}-${subId}`);
    if (btn) btn.classList.add('active');
    const sec = document.getElementById(`sub-view-${prefix}-${subId}`);
    if (sec) sec.classList.add('active');
    const renderMap = { 'ponto-banco': renderPonto, 'ponto-atestados': renderAtestados, 'epis-epi': renderEpis, 'epis-uniforme': renderUniformes, 'contratos-exp': renderContratos, 'contratos-check': renderChecklist };
    if (renderMap[`${prefix}-${subId}`]) renderMap[`${prefix}-${subId}`]();
    if (window.lucide) lucide.createIcons();
}

// ============================================================
//  HELPERS: PAGINAÇÃO E ORDENAÇÃO
// ============================================================

function paginate(key, totalItems) {
    const total = Math.ceil(totalItems / PER_PAGE) || 1;
    if (pages[key] > total) pages[key] = total;
    return { page: pages[key], total };
}

function renderPagination(btnContainerId, infoId, currentPage, totalPages, totalItems, renderFnName) {
    const infoEl = document.getElementById(infoId);
    if (infoEl) {
        const from = Math.min((currentPage - 1) * PER_PAGE + 1, totalItems);
        const to = Math.min(currentPage * PER_PAGE, totalItems);
        infoEl.textContent = `Mostrando ${from}–${to} de ${totalItems} registro(s)`;
    }
    const btns = document.getElementById(btnContainerId);
    if (!btns) return;
    let html = `<button class="page-btn" onclick="changePage('${renderFnName.replace('render','').toLowerCase()}',${currentPage - 1},'${renderFnName}')" ${currentPage <= 1 ? 'disabled' : ''}>‹ Ant.</button>`;
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, start + 4);
    for (let i = start; i <= end; i++) html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="changePage('${renderFnName.replace('render','').toLowerCase()}',${i},'${renderFnName}')">${i}</button>`;
    html += `<button class="page-btn" onclick="changePage('${renderFnName.replace('render','').toLowerCase()}',${currentPage + 1},'${renderFnName}')" ${currentPage >= totalPages ? 'disabled' : ''}>Próx. ›</button>`;
    btns.innerHTML = html;
}

function changePage(key, page, renderFn) {
    if (page < 1) return;
    pages[key] = page;
    window[renderFn]();
}

function sortTable(key, column) {
    if (sorts[key].key === column) {
        sorts[key].dir = sorts[key].dir === 'asc' ? 'desc' : 'asc';
    } else {
        sorts[key].key = column;
        sorts[key].dir = 'asc';
    }
    const renderMap = {
        funcionarios: renderFuncionarios, asos: renderAsos, ferias: renderFerias,
        ponto: renderPonto, atestados: renderAtestados, epis: renderEpis,
        uniformes: renderUniformes, beneficios: renderBeneficios, contratos: renderContratos,
        checklist: renderChecklist, cargos: renderCargos,
    };
    if (renderMap[key]) renderMap[key]();
}

function semanticSort(list, sort) {
    return [...list].sort((a, b) => {
        let va = a[sort.key], vb = b[sort.key];
        // Date fields
        const dateCols = ['data_nascimento','data_admissao','data_exame','data_vencimento','data_entrega','periodo_aq_inicio','data','data_inicio','data_inicio_gozo','data_avaliacao','created_at','data_fim_45','data_fim_90','ca_vencimento'];
        if (dateCols.includes(sort.key)) {
            va = va ? new Date(va).getTime() : 0;
            vb = vb ? new Date(vb).getTime() : 0;
        } else if (typeof va === 'number' || typeof vb === 'number' || ['salario','nota_media','minutos','dias_gozados','dias','quantidade','carga_horaria','salario_base'].includes(sort.key)) {
            va = parseFloat(va) || 0; vb = parseFloat(vb) || 0;
        } else {
            va = (va || '').toString().toLowerCase();
            vb = (vb || '').toString().toLowerCase();
            return sort.dir === 'asc' ? va.localeCompare(vb, undefined, {numeric:true}) : vb.localeCompare(va, undefined, {numeric:true});
        }
        if (va < vb) return sort.dir === 'asc' ? -1 : 1;
        if (va > vb) return sort.dir === 'asc' ? 1 : -1;
        return 0;
    });
}

// ============================================================
//  HELPERS: FORMULÁRIOS
// ============================================================

function v(id) { return document.getElementById(id)?.value || ''; }
function parseFloatOrNull(id) { const val = parseFloat(v(id)); return isNaN(val) ? null : val; }

function toggleAsoVencimento() {
    const tipo = v('aso-tipo');
    const showVenc = ['PERIODICO','MUDANCA_FUNCAO'].includes(tipo);
    const vencWrap = document.getElementById('aso-venc-wrap');
    const periodWrap = document.getElementById('aso-period-wrap');
    if (vencWrap) vencWrap.style.display = showVenc ? 'flex' : 'none';
    if (periodWrap) periodWrap.style.display = showVenc ? 'flex' : 'none';
}

function calcularFimGozoFerias() {
    const ini = v('ferias-gozo-ini');
    const dias = parseInt(v('ferias-dias'));
    if (ini && !isNaN(dias) && dias > 0) {
        const d = new Date(ini + 'T00:00:00');
        d.setDate(d.getDate() + dias - 1);
        document.getElementById('ferias-gozo-fim').value = d.toISOString().split('T')[0];
    } else {
        document.getElementById('ferias-gozo-fim').value = '';
    }
}

function calcularDiasAtestado() {
    const ini = v('atestado-inicio');
    const fim = v('atestado-fim');
    if (ini && fim) {
        const d1 = new Date(ini + 'T00:00:00');
        const d2 = new Date(fim + 'T00:00:00');
        const dias = Math.round((d2 - d1) / 86400000) + 1;
        document.getElementById('atestado-dias').value = dias > 0 ? dias : '';
    }
}

function calcularDatasContrato() {
    const inicio = v('contr-inicio');
    if (!inicio) return;
    const d = new Date(inicio + 'T00:00:00');
    const d45 = new Date(d); d45.setDate(d.getDate() + 45);
    const d90 = new Date(d); d90.setDate(d.getDate() + 90);
    document.getElementById('contr-fim45').value = d45.toISOString().split('T')[0];
    document.getElementById('contr-fim90').value = d90.toISOString().split('T')[0];
}

function autoPreencherContrato() {
    const funcId = v('contr-func-id');
    const func = dpFuncionarios.find(f => f.id === funcId);
    if (func && func.data_admissao && !v('contr-inicio')) {
        document.getElementById('contr-inicio').value = func.data_admissao;
        calcularDatasContrato();
    }
}

async function buscarCep(cep) {
    const clean = cep.replace(/\D/g, '');
    if (clean.length !== 8) return;
    try {
        const r = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
        const d = await r.json();
        if (!d.erro) {
            document.getElementById('func-logradouro').value = d.logradouro || '';
            document.getElementById('func-bairro').value = d.bairro || '';
            document.getElementById('func-cidade').value = d.localidade || '';
            document.getElementById('func-uf').value = d.uf || '';
        }
    } catch(e) { /* CEP não encontrado */ }
}

/**
 * Calcula as diferenças de dados entre o objeto antigo e o novo payload
 * para exibir na auditoria de logs (padrão de alteração).
 */
function obterDiferencas(antigo, novo) {
    if (!antigo) return '';
    let diffs = [];
    const ignore = ['id', 'empresa_id', 'created_at', 'updated_at', 'cargo_id'];
    for (let key in novo) {
        if (ignore.includes(key)) continue;
        let vAntigo = antigo[key];
        let vNovo = novo[key];
        
        // Tratar nulos/undefined
        if (vAntigo === null || vAntigo === undefined) vAntigo = '';
        if (vNovo === null || vNovo === undefined) vNovo = '';
        
        // Se for string, limpar espaços
        if (typeof vAntigo === 'string') vAntigo = vAntigo.trim();
        if (typeof vNovo === 'string') vNovo = vNovo.trim();

        if (String(vAntigo) !== String(vNovo)) {
            let label = key.toUpperCase().replace(/_/g, ' ');
            diffs.push(`${label} de "${vAntigo}" para "${vNovo}"`);
        }
    }
    return diffs.join(' | ');
}

/**
 * Calcula automaticamente a Data de Vencimento do ASO
 * baseado na Data do Exame + Periodicidade (meses).
 * Se a periodicidade não for selecionada, libera o campo para edição manual.
 */
function calcularVencimentoAso() {
    const dataExame    = document.getElementById('aso-data')?.value;
    const periodicidade = parseInt(document.getElementById('aso-periodicidade')?.value || '');
    const vencInput    = document.getElementById('aso-vencimento');
    const autoLabel    = document.getElementById('aso-venc-auto-label');

    if (!vencInput) return;

    if (dataExame && periodicidade) {
        // Calcular: data do exame + N meses
        const d = new Date(dataExame + 'T00:00:00');
        d.setMonth(d.getMonth() + periodicidade);
        vencInput.value = d.toISOString().split('T')[0];
        vencInput.readOnly = true;
        vencInput.style.opacity = '0.7';
        vencInput.style.cursor = 'not-allowed';
        if (autoLabel) autoLabel.textContent = '(auto)';
    } else {
        // Sem periodicidade → campo livre para preenchimento manual
        vencInput.readOnly = false;
        vencInput.style.opacity = '';
        vencInput.style.cursor = '';
        if (autoLabel) autoLabel.textContent = '';
        // Limpar apenas se estava calculado (não limpar se o usuário já digitou manualmente)
        if (!periodicidade) {
            // mantém o valor atual para não perder edição manual
        }
    }
}

// ============================================================
//  CHECKLIST: ESTRELAS
// ============================================================

function buildChecklistScores() {
    const container = document.getElementById('checklist-scores');
    if (!container) return;
    container.innerHTML = CHECKLIST_CRITERIOS.map(c => `
        <div class="score-item">
            <span style="font-size:0.85rem;">${c.label}</span>
            <div class="star-input" id="stars-${c.key}">
                ${[1,2,3,4,5].map(n => `<span class="star-input-btn" data-key="${c.key}" data-val="${n}" onclick="setStarValue('${c.key}',${n})">★</span>`).join('')}
            </div>
        </div>`).join('');
}

function setStarValue(key, val) {
    const container = document.getElementById(`stars-${key}`);
    if (!container) return;
    container.querySelectorAll('.star-input-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.val) <= val);
    });
    calcularNotaMedia();
}

function getStarValue(key) {
    const container = document.getElementById(`stars-${key}`);
    if (!container) return 0;
    const active = container.querySelectorAll('.star-input-btn.active');
    return active.length;
}

function calcularNotaMedia() {
    let total = 0; let count = 0;
    CHECKLIST_CRITERIOS.forEach(c => {
        const val = getStarValue(c.key);
        if (val > 0) { total += val; count++; }
    });
    if (count > 0) {
        const media = (total / count).toFixed(1);
        document.getElementById('nota-total-box').style.display = 'block';
        document.getElementById('nota-media-display').textContent = media;
    } else {
        document.getElementById('nota-total-box').style.display = 'none';
    }
}

// ============================================================
//  EXPORTAÇÃO EXCEL
// ============================================================

function exportarExcel(tipo) {
    if (!window.XLSX) { toast('Aguarde o carregamento da biblioteca Excel...', 'error'); return; }
    let data = [], title = 'Funcionarios';
    if (tipo === 'funcionarios' || !tipo) {
        data = dpFuncionarios.map(f => ({
            'Matrícula': f.matricula || '', 'Nome': f.nome_completo, 'CPF': f.cpf || '',
            'Cargo': f.cargo_nome || '', 'Setor': f.setor || '', 'Admissão': formatDate(f.data_admissao),
            'Nascimento': formatDate(f.data_nascimento), 'Salário': f.salario || '',
            'Status': f.status, 'Celular': f.celular || '', 'E-mail': f.email || '',
        }));
    }
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, title);
    XLSX.writeFile(wb, `FrotaLink_DP_${title}_${new Date().toLocaleDateString('pt-BR').replace(/\//g,'-')}.xlsx`);
    toast('Exportação Excel concluída!', 'success');
}

// ============================================================
//  HELPERS: FORMATAÇÃO E LABELS
// ============================================================

function formatDate(d) {
    if (!d) return '<span style="color:var(--text-muted)">—</span>';
    try {
        const dt = new Date(d + 'T00:00:00');
        return dt.toLocaleDateString('pt-BR');
    } catch { return d; }
}

function formatBirthday(d) {
    if (!d) return '<span style="color:var(--text-muted)">—</span>';
    const dt = new Date(d + 'T00:00:00');
    const hoje = new Date();
    const isHoje = dt.getDate() === hoje.getDate() && dt.getMonth() === hoje.getMonth();
    return `${dt.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' })}${isHoje ? ' 🎂' : ''}`;
}

function labelStatus(s) {
    const m = { ATIVO: 'Ativo', FERIAS: 'Em Férias', AFASTADO: 'Afastado', DESLIGADO: 'Desligado' };
    return m[s] || s || '—';
}
function labelAsoTipo(t) {
    const m = { ADMISSIONAL: 'Admissional', PERIODICO: 'Periódico', MUDANCA_FUNCAO: 'Mudança Função', RETORNO_TRABALHO: 'Retorno Trab.', DEMISSIONAL: 'Demissional' };
    return m[t] || t || '—';
}
function labelAsoResultado(r) {
    const m = { APTO: 'Apto', INAPTO: 'Inapto', APTO_COM_RESTRICOES: 'Apto c/ Rest.' };
    return m[r] || r || '—';
}
function labelFeriasStatus(s) {
    const m = { AQUISITIVO: 'Aquisitivo', PROGRAMADA: 'Programada', EM_GOZO: 'Em Gozo', CONCLUIDA: 'Concluída', VENCIDA: 'Vencida' };
    return m[s] || s || '—';
}
function labelPontoTipo(t) {
    const m = { FALTA: 'Falta', ATRASO: 'Atraso', HORA_EXTRA: 'Hora Extra', SAIDA_ANTECIPADA: 'Saída Antecipada' };
    return m[t] || t || '—';
}
function labelAtestadoTipo(t) {
    const m = { ATESTADO_MEDICO: 'Atestado Médico', AFASTAMENTO_INSS: 'Afastamento INSS', ACIDENTE_TRABALHO: 'Acidente Trabalho', LICENCA_MATERNIDADE: 'Lic. Maternidade', LICENCA_PATERNIDADE: 'Lic. Paternidade', OUTROS: 'Outros' };
    return m[t] || t || '—';
}
function labelBeneficioTipo(t) {
    const m = { VT: 'Vale Transporte', VA: 'Vale Alimentação', VR: 'Vale Refeição', PLANO_SAUDE: 'Plano de Saúde', PLANO_ODONTO: 'Plano Odonto', SEGURO_VIDA: 'Seguro de Vida', OUTROS: 'Outros' };
    return m[t] || t || '—';
}

function getVencStatus(dateStr) {
    if (!dateStr) return { cls: '', label: '—' };
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const em30 = new Date(hoje); em30.setDate(hoje.getDate() + 30);
    const d = new Date(dateStr + 'T00:00:00');
    if (d < hoje) return { cls: 'badge-vencido', label: 'Vencido' };
    if (d <= em30) return { cls: 'badge-afastado', label: 'Vencendo' };
    return { cls: 'badge-ok', label: 'OK' };
}

function getNota(nota) {
    const n = parseFloat(nota) || 0;
    if (n >= 4) return { color: '#34d399' };
    if (n >= 3) return { color: '#fcd34d' };
    return { color: '#f87171' };
}

// ============================================================
//  TOAST
// ============================================================

function toast(msg, tipo = 'info') {
    const el = document.getElementById('dp-toast');
    const msgEl = document.getElementById('dp-toast-msg');
    if (!el || !msgEl) return;
    msgEl.textContent = msg;
    el.className = `show ${tipo}`;
    const iconEl = el.querySelector('i[data-lucide]');
    if (iconEl) {
        const icons = { success: 'check-circle', error: 'x-circle', info: 'info' };
        iconEl.setAttribute('data-lucide', icons[tipo] || 'info');
        iconEl.style.color = tipo === 'success' ? '#34d399' : tipo === 'error' ? '#f87171' : '#38bdf8';
        lucide.createIcons();
    }
    clearTimeout(window._dpToastTimer);
    window._dpToastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}

/**
 * Injeta dinamicamente as dicas textuais de atalhos de teclado nos botões
 * (F2 para Novo, Ctrl+Enter para Salvar, Esc para Fechar/Cancelar)
 */
function injetarIndicadoresAtalhos() {
    // 1. Botões de Nova Ação (Cabeçalhos de Seções e Cabeçalho Geral)
    const botoesNovo = document.querySelectorAll('.section-header button.btn-primary, .page-actions button.btn-primary');
    botoesNovo.forEach(btn => {
        const textNodes = Array.from(btn.childNodes).filter(node => node.nodeType === Node.TEXT_NODE);
        const textContent = textNodes.map(n => n.textContent.trim()).join(' ');
        if (textContent && !textContent.includes('[F2]')) {
            const lastTextNode = textNodes[textNodes.length - 1];
            if (lastTextNode) {
                lastTextNode.textContent = ` ${lastTextNode.textContent.trim()} [F2]`;
            } else {
                btn.appendChild(document.createTextNode(' [F2]'));
            }
            btn.setAttribute('title', 'Atalho: F2');
        }
    });

    // 2. Botões de Salvar nos Modais
    const botoesSalvar = document.querySelectorAll('.dp-modal-overlay .btn-save');
    botoesSalvar.forEach(btn => {
        const textNodes = Array.from(btn.childNodes).filter(node => node.nodeType === Node.TEXT_NODE);
        const textContent = textNodes.map(n => n.textContent.trim()).join(' ');
        if (textContent && !textContent.includes('[Ctrl+Enter]')) {
            const lastTextNode = textNodes[textNodes.length - 1];
            if (lastTextNode) {
                lastTextNode.textContent = ` ${lastTextNode.textContent.trim()} [Ctrl+Enter]`;
            } else {
                btn.appendChild(document.createTextNode(' [Ctrl+Enter]'));
            }
            btn.setAttribute('title', 'Atalho: Ctrl + Enter');
        }
    });

    // 3. Botões de Cancelar/Fechar nos Modais
    const botoesCancelar = document.querySelectorAll('.dp-modal-overlay button.btn-secondary, .dp-modal-overlay button.btn-danger');
    botoesCancelar.forEach(btn => {
        const textNodes = Array.from(btn.childNodes).filter(node => node.nodeType === Node.TEXT_NODE);
        const textContent = textNodes.map(n => n.textContent.trim()).join(' ');
        if (textContent && (textContent.toLowerCase().includes('cancelar') || textContent.toLowerCase().includes('fechar')) && !textContent.includes('[Esc]')) {
            const lastTextNode = textNodes[textNodes.length - 1];
            if (lastTextNode) {
                lastTextNode.textContent = ` ${lastTextNode.textContent.trim()} [Esc]`;
            } else {
                btn.appendChild(document.createTextNode(' [Esc]'));
            }
            btn.setAttribute('title', 'Atalho: Esc');
        }
    });

    // 4. Fechar "X" no topo dos modais
    const botoesX = document.querySelectorAll('.dp-modal-overlay .modal-close');
    botoesX.forEach(btn => {
        btn.setAttribute('title', 'Fechar [Esc]');
    });
}

