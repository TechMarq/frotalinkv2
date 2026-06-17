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
        { id: 'comercial', icon: 'briefcase', label: 'Comercial', url: 'comercial.html' }
    ];

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
            
            // Expand radius and widen arc for better distribution
            const radius = 140; // pixels
            const startAngle = -85; // Almost straight up
            const endAngle = -220; // Past left, heading down
            const step = (endAngle - startAngle) / (satellites.length - 1);

            satellites.forEach((sat, i) => {
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
