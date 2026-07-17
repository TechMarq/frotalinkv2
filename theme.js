/**
 * 🎨 FrotaLink Theme System
 * Gerencia e aplica temas visuais globalmente em todas as páginas.
 * Inclua este script via orb_menu.js (já carregado em todas as páginas).
 */

(function () {
    const THEME_KEY = 'frotalink_theme';

    // ─────────────────────────────────────────────
    //  DEFINIÇÃO DOS TEMAS
    // ─────────────────────────────────────────────
    const THEMES = {
        dark: {
            id: 'dark',
            label: 'Dark',
            icon: '🌑',
            vars: {
                '--primary':              '#4f46e5',
                '--primary-hover':        '#4338ca',
                '--bg-main':              '#0f172a',
                '--bg-card':              'rgba(30, 41, 59, 0.7)',
                '--border-card':          'rgba(255, 255, 255, 0.1)',
                '--text-main':            '#f8fafc',
                '--text-muted':           '#94a3b8',
                '--success':              '#10b981',
                '--danger':               '#ef4444',
                '--warning':              '#f59e0b',
                '--radius':               '12px',
                '--tab-active-bg':        '#6366f1',
                '--tab-active-shadow':    'rgba(99, 102, 241, 0.3)',
                '--title-gradient-start': '#818cf8',
                '--title-gradient-end':   '#c084fc',
            },
            bodyGradient: `
                radial-gradient(at 0% 0%, hsla(253, 16%, 7%, 1) 0, transparent 50%),
                radial-gradient(at 50% 0%, hsla(225, 39%, 30%, 1) 0, transparent 50%),
                radial-gradient(at 100% 0%, hsla(339, 49%, 30%, 1) 0, transparent 50%)
            `,
        },

        green_pastel: {
            id: 'green_pastel',
            label: 'Clean Verde (Padrão)',
            icon: '🌿',
            vars: {
                '--primary':              '#2d9e6b',
                '--primary-hover':        '#228a5a',
                '--bg-main':              '#f0f7f4',
                '--bg-card':              'rgba(255, 255, 255, 0.92)',
                '--border-card':          'rgba(45, 158, 107, 0.15)',
                '--text-main':            '#1a2e25',
                '--text-muted':           '#5a7a6a',
                '--success':              '#27ae6f',
                '--danger':               '#e05252',
                '--warning':              '#d4891a',
                '--radius':               '12px',
                '--tab-active-bg':        'linear-gradient(135deg, #2d9e6b, #1a7a50)',
                '--tab-active-shadow':    'rgba(45, 158, 107, 0.25)',
                '--title-gradient-start': '#1a7a50',
                '--title-gradient-end':   '#2d9e6b',
            },
            bodyGradient: `
                radial-gradient(at 0% 0%,   hsla(152, 40%, 93%, 1) 0, transparent 60%),
                radial-gradient(at 100% 0%, hsla(145, 50%, 90%, 1) 0, transparent 55%),
                radial-gradient(at 50% 100%, hsla(148, 35%, 88%, 1) 0, transparent 60%),
                radial-gradient(at 0% 100%, hsla(155, 45%, 91%, 1) 0, transparent 50%)
            `,
        },
    };

    // ─────────────────────────────────────────────
    //  APLICAR TEMA
    // ─────────────────────────────────────────────
    function applyTheme(themeId) {
        const theme = THEMES[themeId] || THEMES.green_pastel;
        const root = document.documentElement;

        // Aplica variáveis CSS
        Object.entries(theme.vars).forEach(([k, v]) => root.style.setProperty(k, v));

        // Aplica gradiente do body
        document.body.style.backgroundImage = theme.bodyGradient;
        document.body.style.backgroundColor = theme.vars['--bg-main'];

        // Atualiza tabs ativas se necessário (troca box-shadow das tabs)
        updateTabStyles(theme);

        // Atualiza h1 gradients dinamicamente
        updateTitleGradients(theme);

        // Atualiza atributo global para referência CSS
        document.documentElement.setAttribute('data-theme', theme.id);

        // Salvar preferência
        localStorage.setItem(THEME_KEY, theme.id);
        window.currentThemeId = theme.id;
    }

    function updateTabStyles(theme) {
        // Atualiza .tab-btn.active e .tab-item.active via injeção de <style>
        let styleEl = document.getElementById('frotalink-theme-tabs');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'frotalink-theme-tabs';
            document.head.appendChild(styleEl);
        }

        const bg = theme.vars['--tab-active-bg'];
        const shadow = theme.vars['--tab-active-shadow'];
        const primary = theme.vars['--primary'];
        const bgCard = theme.vars['--bg-card'];
        const borderCard = theme.vars['--border-card'];
        const bgMain = theme.vars['--bg-main'];
        const textMuted = theme.vars['--text-muted'];
        const textMain = theme.vars['--text-main'];
        const gradStart = theme.vars['--title-gradient-start'];
        const gradEnd = theme.vars['--title-gradient-end'];

        styleEl.textContent = `
            .tab-btn.active, .tab-item.active {
                background: ${bg} !important;
                box-shadow: 0 4px 15px ${shadow} !important;
                color: white !important;
            }
            .plate {
                background: rgba(${hexToRgb(primary)}, 0.12) !important;
                color: ${primary} !important;
            }
            .search-box input:focus {
                border-color: ${primary} !important;
                box-shadow: 0 0 0 3px rgba(${hexToRgb(primary)}, 0.2) !important;
            }
            .btn-edit {
                background: rgba(${hexToRgb(primary)}, 0.15) !important;
                border-color: rgba(${hexToRgb(primary)}, 0.2) !important;
                color: ${gradStart} !important;
            }
            .btn-edit:hover {
                background: ${primary} !important;
                box-shadow: 0 4px 12px rgba(${hexToRgb(primary)}, 0.4) !important;
            }
            h1 {
                background: linear-gradient(to right, ${gradStart}, ${gradEnd}) !important;
                -webkit-background-clip: text !important;
                background-clip: text !important;
                -webkit-text-fill-color: transparent !important;
            }
            .module-card:hover {
                border-color: ${primary} !important;
                box-shadow: 0 10px 32px rgba(${hexToRgb(primary)}, 0.22), inset 0 1px 0 rgba(255,255,255,0.7) !important;
                background: linear-gradient(135deg, rgba(${hexToRgb(primary)}, 0.28) 0%, rgba(${hexToRgb(primary)}, 0.14) 100%) !important;
                transform: scale(1.02) !important;
            }
            .kpi-card:hover { border-color: ${primary} !important; }
            .th.active-sort { background: rgba(${hexToRgb(primary)}, 0.1) !important; }
            .badge.info { background: rgba(${hexToRgb(primary)}, 0.15) !important; color: ${gradStart} !important; }
            .modal { background: ${bgMain} !important; }
            #auth-user-btn {
                background: var(--bg-card) !important;
                border-color: var(--border-card) !important;
            }
            #auth-dropdown-menu {
                background: ${bgMain} !important;
                border-color: var(--border-card) !important;
            }
            .orb-satellite:hover { background: ${primary} !important; }
            .widgets-manager-trigger:hover { background: ${primary} !important; border-color: ${primary} !important; }
            .widget-accent { color: ${primary} !important; }
        `;
    }

    function updateTitleGradients(theme) {
        // Atualiza gradientes dos títulos existentes no DOM
        const gradStart = theme.vars['--title-gradient-start'];
        const gradEnd   = theme.vars['--title-gradient-end'];
        document.querySelectorAll('h1').forEach(el => {
            el.style.background = `linear-gradient(to right, ${gradStart}, ${gradEnd})`;
            el.style.webkitBackgroundClip = 'text';
            el.style.backgroundClip = 'text';
            el.style.webkitTextFillColor = 'transparent';
        });
    }

    // Helper: converte hex color para "r, g, b"
    function hexToRgb(hex) {
        if (!hex || !hex.startsWith('#')) return '99, 102, 241';
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result
            ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
            : '99, 102, 241';
    }

    // ─────────────────────────────────────────────
    //  CRIAR BOTÃO DE TEMA NO DROPDOWN DO USUÁRIO
    // ─────────────────────────────────────────────
    function injectThemePickerInDropdown() {
        const menu = document.getElementById('auth-dropdown-menu');
        if (!menu) {
            // Tenta novamente até o dropdown aparecer
            setTimeout(injectThemePickerInDropdown, 200);
            return;
        }

        // Evitar dupla injeção
        if (document.getElementById('theme-picker-section')) return;

        const currentId = window.currentThemeId || THEME_KEY;

        const section = document.createElement('div');
        section.id = 'theme-picker-section';
        section.style.cssText = `
            padding: 0.6rem 0.75rem;
            border-top: 1px solid var(--border-card);
            margin-top: 0.25rem;
        `;

        section.innerHTML = `
            <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.35rem;">
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-muted);"><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>
                Tema Visual
            </div>
            <div id="theme-options" style="display: flex; flex-direction: column; gap: 0.3rem;">
                ${Object.values(THEMES).map(t => `
                    <button
                        data-theme-id="${t.id}"
                        onclick="window.setFrotaTheme('${t.id}')"
                        style="
                            display: flex; align-items: center; gap: 0.5rem;
                            width: 100%; padding: 0.45rem 0.6rem; border-radius: 8px;
                            border: 1px solid ${window.currentThemeId === t.id ? 'rgba(45,158,107,0.3)' : 'transparent'};
                            background: ${window.currentThemeId === t.id ? 'rgba(45,158,107,0.1)' : 'transparent'};
                            color: var(--text-main); cursor: pointer; font-size: 0.82rem;
                            font-family: inherit; text-align: left;
                            transition: background 0.2s, border-color 0.2s;
                        "
                        onmouseover="this.style.background='rgba(45,158,107,0.08)'"
                        onmouseout="this.style.background='${window.currentThemeId === t.id ? 'rgba(45,158,107,0.1)' : 'transparent'}'"
                    >
                        <span style="font-size: 1rem;">${t.icon}</span>
                        <span>${t.label}</span>
                        ${window.currentThemeId === t.id ? '<span class="theme-active-badge" style="margin-left:auto; font-size:0.65rem; color:#2d9e6b; font-weight:700;">✓ Ativo</span>' : ''}
                    </button>
                `).join('')}
            </div>
        `;

        // Inserir antes do botão "Sair"
        const logoutBtn = menu.querySelector('button[onclick="authLogout()"]');
        if (logoutBtn) {
            menu.insertBefore(section, logoutBtn.closest('hr') || logoutBtn);
        } else {
            menu.appendChild(section);
        }
    }

    // ─────────────────────────────────────────────
    //  API PÚBLICA
    // ─────────────────────────────────────────────
    window.setFrotaTheme = function (themeId) {
        applyTheme(themeId);

        // Atualizar visual dos botões no picker sem fechar o dropdown
        const options = document.querySelectorAll('#theme-options button[data-theme-id]');
        options.forEach(btn => {
            const isActive = btn.dataset.themeId === themeId;
            btn.style.background = isActive ? 'rgba(45,158,107,0.1)' : 'transparent';
            btn.style.borderColor = isActive ? 'rgba(45,158,107,0.3)' : 'transparent';

            // Atualiza badge "✓ Ativo"
            let badge = btn.querySelector('.theme-active-badge');
            if (isActive && !badge) {
                badge = document.createElement('span');
                badge.className = 'theme-active-badge';
                badge.style.cssText = 'margin-left:auto; font-size:0.65rem; color:#2d9e6b; font-weight:700;';
                badge.textContent = '✓ Ativo';
                btn.appendChild(badge);
            } else if (!isActive && badge) {
                badge.remove();
            }
        });
    };

    window.getFrotaThemes = () => THEMES;
    window.getCurrentTheme = () => THEMES[window.currentThemeId] || THEMES.green_pastel;

    // ─────────────────────────────────────────────
    //  INICIALIZAÇÃO
    // ─────────────────────────────────────────────
    function init() {
        const saved = localStorage.getItem(THEME_KEY) || 'green_pastel';
        window.currentThemeId = saved;

        // Aplicar imediatamente (antes do DOM completo) para evitar flash
        applyTheme(saved);

        // Injetar picker no dropdown do usuário quando estiver disponível
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(injectThemePickerInDropdown, 400);
            });
        } else {
            setTimeout(injectThemePickerInDropdown, 400);
        }
    }

    init();
})();
