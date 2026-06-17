# 💎 FrotaLink: Padrões de Interface e Lógica (Standard UI Patterns)

Este documento serve como guia de referência para manter a consistência visual e funcional entre todos os módulos do sistema FrotaLink.

---

## 1. Ordenação Semântica de Tabelas (Table Sorting)

Sempre que uma tabela for exibida, ela deve permitir a ordenação por colunas clicáveis.

### 🎨 Visual (HTML/CSS)
*   **Ícone Padrão:** `chevrons-up-down` (opacidade reduzida).
*   **Ícone Ativo:** `chevron-up` ou `chevron-down` com a cor `--primary`.
*   **Hover:** O cabeçalho deve mudar levemente de cor ao passar o mouse.

### 🧠 Lógica (JavaScript)
A ordenação deve ser **semântica**, tratando os dados de acordo com seu tipo real:
```javascript
filtered.sort((a, b) => {
    let valA, valB;
    switch (currentSort.key) {
        case 'data':
            valA = new Date(a.data + 'T12:00:00');
            valB = new Date(b.data + 'T12:00:00');
            break;
        case 'valor':
            valA = parseFloat(a.valor) || 0;
            valB = parseFloat(b.valor) || 0;
            break;
        default: // Texto / Alfanumérico
            valA = (a[currentSort.key] || '').toString();
            valB = (b[currentSort.key] || '').toString();
            return currentSort.dir === 'asc' 
                ? valA.localeCompare(valB, undefined, {numeric: true}) 
                : valB.localeCompare(valA, undefined, {numeric: true});
    }
    if (valA < valB) return currentSort.dir === 'asc' ? -1 : 1;
    if (valA > valB) return currentSort.dir === 'asc' ? 1 : -1;
    return 0;
});
```

---

## 2. Filtragem Inteligente (Intelligent Filtering)

Os filtros rápidos no topo da página devem ser interdependentes: ao selecionar um item em um filtro, os outros devem mostrar apenas as opções que possuem dados correspondentes.

### 🧠 Lógica
1.  Capturar todos os filtros ativos.
2.  Filtrar a lista principal.
3.  Atualizar as opções de cada `<select>` baseando-se apenas nos registros que restaram na lista filtrada.
4.  **Pruning:** Remover opções que resultariam em listas vazias.

---

## 3. Paginação e Performance (700px / 200 Records)

Para evitar lentidão no navegador em tabelas com milhares de registros:

*   **Limite de Altura:** A `.table-container` deve ter `max-height: 700px; overflow-y: auto;`.
*   **Sticky Header:** O cabeçalho da tabela deve permanecer fixo ao rolar.
*   **Paginação:** Exibir no máximo **200 registros por página**.
*   **Rodapé de Navegação:** Exibir contador de registros ("Mostrando 1-200 de 1500") e botões de página.

---

## 4. Integração com Manutenção (Maintenance Link)

Itens de custo (sejam Peças ou Serviços) podem ser vinculados ao módulo de Manutenção.

### 🎨 UI (Modal)
*   **Toggle:** "Controlar Manutenção?" (SIM/NÃO).
*   **Condição:** Para "Peças", o toggle só aparece se "Estoque?" for **NÃO**.
*   **Campos Dinâmicos:** Ao ativar, exibir campos de:
    *   Tipo de Manutencão (Preventiva/Corretiva).
    *   Ação (Troca/Ajuste/etc).
    *   Controle por KM ou Tempo.
    *   Garantia.

### 🧠 Lógica de Salvamento
*   Se o toggle estiver ativo, criar um registro na tabela `manutencoes` e `manutencao_itens`.
*   Sempre incluir o ID da compra na descrição para rastreabilidade: `[ID:COMPRA-123]`.

---

## 5. Persistência em Edição

Ao abrir um modal de edição:
1.  **Reset:** Limpar o formulário e containers de itens dinâmicos.
2.  **Populate:** Carregar todos os campos, garantindo que IDs de UUIDs sejam mapeados corretamente.
3.  **Dropdowns:** Garantir que o valor selecionado no banco seja o valor selecionado no `<select>`.
4.  **State:** Manter o `editId` global para saber que se trata de uma atualização e não um novo cadastro.
94: 
95: ---
96: 
97: ## 6. Atalhos de Teclado e Navegação (Hotkeys)
98: 
99: Para aumentar a produtividade e a acessibilidade, todos os modais devem suportar atalhos de teclado:
100: 
101: ### ⌨️ Comandos Globais (Modais)
102: *   **ESC (Sair):** 
103:     *   Modais de **Visualização** (leitura) fecham sempre.
104:     *   Modais de **Formulário** (cadastro) fecham apenas se **não houver dados preenchidos**. Se houver digitação ou itens, o ESC é ignorado para evitar perda de dados.
105: *   **ENTER (Salvar):** Dispara o clique no botão principal de salvamento (`.btn-save`), desde que não haja um menu de autocomplete aberto.
106: 
107: ### 🔍 Busca e Autocomplete
108: Campos de busca (como Veículos e Produtos) devem permitir navegação sem mouse:
109: *   **Setas (↑ / ↓):** Navegam entre os resultados da lista de sugestões, destacando a opção atual.
110: *   **ENTER:** Seleciona o item destacado e fecha a lista.
111: *   **ESPAÇO:** Seleciona o item destacado (específico para busca de **veículos/placas**). No caso de produtos, o espaço é mantido para digitação textual.
112: *   **ESC (dentro do input):** Fecha apenas a lista de sugestões sem fechar o modal.
---

## 6. Design Responsivo (Mobile Version)

Para garantir que o sistema seja funcional em dispositivos móveis, os módulos devem seguir o padrão de "Cards Adaptativos" em vez de tabelas horizontais.

### 🎨 UI (CSS)
*   **Ocultar Header:** Em telas menores que 768px, o `<thead>` deve ser ocultado.
*   **Transformação em Cards:** Cada `<tr>` deve se tornar um bloco (`display: block`) com bordas arredondadas e fundo glassmorphism.
*   **Labels Dinâmicas:** Usar o pseudo-elemento `::before` com `content: attr(data-label)` para exibir o nome da coluna à esquerda do valor.
*   **Padding Compacto:** Reduzir o padding geral para economizar espaço vertical.

### 🧠 Lógica (HTML/JS)
*   **Atributo data-label:** Todas as células `<td>` geradas via JavaScript devem incluir o atributo `data-label="Nome da Coluna"`.
*   **Filtros Colapsáveis:** Em mobile, a barra de filtros deve ser substituída por um botão "Filtros" que abre um menu ou modal.
*   **Botões de Ação:** Ícones de editar/excluir devem ser agrupados ou destacados no final do card para fácil acesso com o polegar.

---

## 7. Navegação e Abas (Tab Navigation)

Para módulos com múltiplas sub-visões, deve-se usar o padrão **Premium Pill Tabs** definido no `style.css` global.

> ⚠️ **Regra:** NUNCA redefinir `.tabs-header` ou `.tab-item` localmente com valores diferentes do padrão abaixo.

### 🎨 Especificação Visual

| Propriedade | Valor |
|---|---|
| Container (`display`) | `inline-flex` |
| Container (`background`) | `rgba(15, 23, 42, 0.6)` |
| Container (`border-radius`) | `16px` |
| Container (`padding`) | `0.5rem` |
| Container (`gap`) | `0.5rem` |
| Container (`border`) | `1px solid rgba(255, 255, 255, 0.05)` |
| Item (`padding`) | `0.8rem 1.5rem` |
| Item (`border-radius`) | `12px` |
| Item (`font-size`) | `0.9rem` |
| Item (`font-weight`) | `600` |
| Item ativo (`background`) | `#6366f1` |
| Item ativo (`box-shadow`) | `0 4px 15px rgba(99, 102, 241, 0.3)` |
| Ícone (`width/height`) | `18px` |

### 🧠 Estrutura HTML (Padrão)

```html
<!-- ✅ Container principal de abas -->
<nav class="tabs-header">
    <button class="tab-item active" onclick="switchTab('dashboard')" data-perm="modulo_dashboard:view">
        <i data-lucide="layout-dashboard" style="width:18px;"></i> Dashboard
    </button>
    <button class="tab-item" onclick="switchTab('lista')" data-perm="modulo_lista:view">
        <i data-lucide="list" style="width:18px;"></i> Lista
    </button>
    <button class="tab-item" onclick="switchTab('cadastro')" data-perm="modulo_cadastros:view">
        <i data-lucide="database" style="width:18px;"></i> Cadastro
    </button>
</nav>

<!-- Sub-abas internas (dentro de seções) -->
<div class="tabs-header" style="margin-bottom: 2rem;">
    <div class="tab-item active" onclick="switchSubTab('opcao1')">Opção 1</div>
    <div class="tab-item" onclick="switchSubTab('opcao2')">Opção 2</div>
</div>
```

### ⚙️ JavaScript Padrão

```javascript
function switchTab(tabId) {
    document.querySelectorAll('.tabs-header .tab-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
    const btn = document.querySelector(`.tab-item[onclick*="${tabId}"]`);
    if (btn) btn.classList.add('active');
    const section = document.getElementById(`view-${tabId}`);
    if (section) section.classList.add('active');
    if (window.lucide) lucide.createIcons();
}
```

### ✅ Checklist para Novos Módulos

- [ ] HTML importa `style.css` **antes** de qualquer CSS local
- [ ] Container usa a classe `tabs-header` (ou `nav-tabs`)
- [ ] Botões usam a classe `tab-item` (ou `tab-btn`)
- [ ] Cada botão tem um **ícone Lucide** + **texto**
- [ ] Aba padrão tem a classe `active`
- [ ] Botões com permissão têm `data-perm="modulo_secao:acao"`
- [ ] **NÃO** usar `border-bottom` no container (pill, não flat)
- [ ] **NÃO** sobrescrever `.tabs-header`/`.tab-item` com valores distintos

### ❌ Anti-padrões (Proibido)

```css
/* ❌ Flat tabs com border-bottom */
.tabs { border-bottom: 1px solid ...; padding-bottom: 1rem; }

/* ❌ Valores divergentes do padrão */
.tabs-header { border-radius: 12px; gap: 1rem; } /* deve ser 16px e 0.5rem */
.tab-item { border-radius: 8px; font-size: 0.85rem; padding: 0.5rem 1rem; }
```

```html
<!-- ❌ Botão sem ícone -->
<button class="tab-btn" onclick="switchTab('lista')">Lista</button>

<!-- ❌ Inline style sobrescrevendo o container -->
<div class="tabs-header" style="border-radius: 12px; background: rgba(255,255,255,0.02);">
```

### 🗂 Ícones Lucide por Módulo

| Módulo | `data-lucide` |
|--------|---------------|
| Frota | `truck` |
| Abastecimento | `fuel` |
| Manutenção | `wrench` |
| Compras | `shopping-cart` |
| Estoque | `package` |
| Fechamento | `file-check` |
| Financeiro | `dollar-sign` |
| Comercial | `briefcase` |
| Dashboard | `layout-dashboard` |
| Analytics / Custos | `bar-chart-2` |
| Importações | `file-up` |
| Cadastros | `database` ou `settings` |
| Contratos | `file-text` |
| Usuários | `users` |
| Adicionar Usuário | `user-plus` |
| Empresa | `building-2` |

---

## 8. Cards de Gráficos e Altura (Chart Layout)

Gráficos devem ter altura fixa para garantir estabilidade visual durante o redimensionamento da janela.

### 🎨 UI (CSS)
*   **Altura Fixa:** `height: 400px` (ou valor específico) no container do card.
*   **Flexbox:** Usar `display: flex; flex-direction: column;` no card.
*   **Canvas:** Definir `flex: 1; min-height: 0;` no elemento `canvas` para que ele ocupe o espaço restante sem forçar o crescimento do container.
---

## 9. Layout e Centralização (Page Layout)

Para garantir o foco e a legibilidade em monitores ultra-wide, todo o conteúdo deve ser centralizado e limitado a uma largura máxima.

### 🎨 Visual (CSS)
*   **Container Principal:** Usar `.container`, `.ops-container` ou `.app-container`.
*   **Largura Máxima:** `max-width: 1400px`.
*   **Centralização:** `margin: 0 auto`.
*   **Padding Lateral:** `1.5rem` (ou `24px`) para evitar que o conteúdo encoste nas bordas em tablets.

### 🧠 Estrutura (HTML)
```html
<body>
    <div class="app-container">
        <!-- Todo o conteúdo aqui -->
    </div>
</body>
```
---

## 10. Cards de KPI (Key Performance Indicators)

Para dashboards, usar cards horizontais com ícones destacados.

### 🎨 Visual (CSS)
*   **Fundo:** Escuro sólido (`#111827`) ou glassmorphism.
*   **Ícone:** Container quadrado (`56px`) com bordas arredondadas e fundo de cor de destaque em baixa opacidade.
*   **Texto:** Valor em destaque (`1.7rem`, extra-bold) e label secundária.

### 🧠 Estrutura (HTML)
```html
<div class="kpi-card">
    <div class="kpi-icon-wrapper">
        <i data-lucide="trending-up"></i>
    </div>
    <div class="kpi-info">
        <span class="label">Título do KPI</span>
        <div class="value">R$ 0,00</div>
    </div>
</div>
```

---

## 11. Modais e Isolamento de Estilos (Modal Isolation)

Para evitar que estilos globais (como os de `style.css`) quebrem o posicionamento ou a aparência de modais específicos, os elementos de sobreposição (backdrop/overlay) e de conteúdo do modal devem usar classes CSS isoladas e dedicadas.

### 🎨 Visual (CSS)
*   **Sobreposição (Backdrop):** Usar classes isoladas como `.custom-modal-overlay` para garantir que o wrapper cubra a tela inteira (`position: fixed; top: 0; left: 0; width: 100%; height: 100%;`) e mantenha o alinhamento centralizado sem sofrer influência de propriedades globais da classe `.modal`.
*   **Card de Conteúdo:** Usar classes isoladas como `.custom-modal-content` para definir largura, altura máxima, rolagem interna (`overflow-y: auto`) e sombras de maneira independente.

### 🧠 Estrutura Recomendada (HTML)
```html
<!-- Wrapper de Fundo / Backdrop -->
<div id="meuModal" class="custom-modal-overlay">
    <!-- Caixa/Card do Modal -->
    <div class="custom-modal-content">
        <!-- Cabeçalho, Formulário e Rodapé -->
    </div>
</div>
```
```
