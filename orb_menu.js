/**
 * 🔮 Orb Menu - Global Navigation Shortcut
 * FrotaLink Design System
 */

(function() {
    const modules = [
        { id: 'home', icon: 'layout-grid', label: 'Hub', url: 'home.html' },
        { id: 'fleet', icon: 'car', label: 'Frota', url: 'index.html' },
        { id: 'fuel', icon: 'fuel', label: 'Abastecimento', url: 'abastecimento.html' },
        { id: 'maint', icon: 'wrench', label: 'Manutenção', url: 'manutencao.html' },
        { id: 'closing', icon: 'file-check', label: 'Fechamento', url: 'fechamento.html' },
        { id: 'shop', icon: 'shopping-cart', label: 'Compras', url: 'compras.html' },
        { id: 'stock', icon: 'package', label: 'Estoque', url: 'estoque.html' },
        { id: 'finance', icon: 'dollar-sign', label: 'Financeiro', url: 'financeiro.html' },
        { id: 'comercial', icon: 'briefcase', label: 'Comercial', url: 'comercial.html' },
        { id: 'dp', icon: 'users', label: 'DP', url: 'dp.html' },
        { id: 'auditoria', icon: 'activity', label: 'Auditoria', url: 'auditoria.html' }
    ];

    const authModuleMap = {
        'home': null,
        'fleet': 'frota',
        'fuel': 'abastecimento',
        'maint': 'manutencao',
        'closing': 'fechamento',
        'shop': 'compras',
        'stock': 'estoque',
        'finance': 'financeiro',
        'comercial': 'comercial',
        'dp': 'dp'
    };

    function initOrbMenu() {
        // Create container
        const container = document.createElement('div');
        container.className = 'orb-menu-container';
        container.id = 'globalOrbMenu';

        // Create main trigger
        const mainBtn = document.createElement('button');
        mainBtn.className = 'orb-main';
        mainBtn.innerHTML = '<i data-lucide="plus"></i>';
        mainBtn.onclick = toggleOrbMenu;

        container.appendChild(mainBtn);

        // Create satellites
        modules.forEach((mod, index) => {
            const satellite = document.createElement('a');
            satellite.href = mod.url;
            satellite.dataset.modId = mod.id;
            satellite.className = `orb-satellite orb-s${index + 1}`;
            satellite.innerHTML = `
                <i data-lucide="${mod.icon}"></i>
                <span class="orb-label">${mod.label}</span>
            `;
            container.appendChild(satellite);
        });

        document.body.appendChild(container);

        // Initialize Lucide icons for the menu
        if (window.lucide) {
            lucide.createIcons();
        }

        // Check and hide unauthorized satellites
        checkSatellitesAccess();
    }

    function checkSatellitesAccess() {
        if (!window.currentUserRole) {
            setTimeout(checkSatellitesAccess, 100);
            return;
        }

        const satellites = document.querySelectorAll('.orb-satellite');
        satellites.forEach(sat => {
            const modId = sat.dataset.modId;
            if (modId === 'home') return; // always show home/hub
            
            let isEnabled = true;
            let hasViewPerm = true;

            if (modId === 'auditoria') {
                hasViewPerm = window.currentUserRole === 'admin' || 
                    (window.currentUserPermissions && Object.keys(window.currentUserPermissions).some(key => key.endsWith('_auditoria') && window.currentUserPermissions[key].view));
                isEnabled = hasViewPerm;
            } else {
                const authModKey = authModuleMap[modId];
                if (!authModKey) return;
                
                // Check if module is enabled for company/user
                isEnabled = window.currentUserModules && 
                    window.currentUserModules.some(m => m === authModKey || m.startsWith(authModKey + '_'));

                // Check if user has view permissions
                hasViewPerm = window.currentUserRole === 'admin';
                if (!hasViewPerm && window.currentUserPermissions) {
                    hasViewPerm = (window.currentUserPermissions[authModKey] && window.currentUserPermissions[authModKey].view) ||
                        Object.keys(window.currentUserPermissions).some(key => 
                            (key.startsWith(authModKey + '_') || key === authModKey) && window.currentUserPermissions[key].view
                        );
                }
            }

            if (!isEnabled || !hasViewPerm) {
                sat.style.display = 'none';
                sat.classList.add('orb-hidden');
            }
        });
    }

    let isMenuOpen = false;

    function toggleOrbMenu() {
        const container = document.getElementById('globalOrbMenu');
        const mainBtn = container.querySelector('.orb-main');
        const satellites = container.querySelectorAll('.orb-satellite');
        
        isMenuOpen = !isMenuOpen;

        if (isMenuOpen) {
            mainBtn.classList.add('active');
            mainBtn.innerHTML = '<i data-lucide="x"></i>';
            
            const visibleSatellites = Array.from(satellites).filter(sat => !sat.classList.contains('orb-hidden'));

            // Expand radius and widen arc for better distribution
            const radius = 140; // pixels
            const startAngle = -85; // Almost straight up
            const endAngle = -220; // Past left, heading down
            const step = visibleSatellites.length > 1 ? (endAngle - startAngle) / (visibleSatellites.length - 1) : 0;

            visibleSatellites.forEach((sat, i) => {
                const angle = startAngle + (step * i);
                const radian = angle * (Math.PI / 180);
                const x = Math.cos(radian) * radius;
                const y = Math.sin(radian) * radius;

                sat.classList.add('visible');
                sat.style.setProperty('--tx', `${x}px`);
                sat.style.setProperty('--ty', `${y}px`);
            });
        } else {
            mainBtn.classList.remove('active');
            mainBtn.innerHTML = '<i data-lucide="plus"></i>';
            
            satellites.forEach(sat => {
                sat.classList.remove('visible');
            });
        }

        if (window.lucide) {
            lucide.createIcons();
        }
    }

    // Load menu and widgets when DOM is ready
    function initAll() {
        // Load widgets.css
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'widgets.css';
        document.head.appendChild(link);

        // Load theme.js (must run early so theme applies before full render)
        const themeScript = document.createElement('script');
        themeScript.src = 'theme.js';
        document.head.appendChild(themeScript);

        // Load widgets.js
        const script = document.createElement('script');
        script.src = 'widgets.js';
        script.defer = true;
        document.body.appendChild(script);

        initOrbMenu();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAll);
    } else {
        initAll();
    }
})();
