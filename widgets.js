/**
 * 🔮 Widgets System - FrotaLink Design System
 * Notepad, Calendar, and Calculator Floating Tools
 */

(function() {
    // --- Configuration and Defaults ---
    const WIDGETS = [
        {
            id: 'notepad',
            title: 'Bloco de Notas',
            icon: 'file-text',
            defaultPos: { right: '24px', top: '120px' }
        },
        {
            id: 'postits',
            title: 'Post-its (Notas)',
            icon: 'sticky-note',
            defaultPos: { right: '24px', top: '450px' }
        },
        {
            id: 'calendar',
            title: 'Calendário',
            icon: 'calendar',
            defaultPos: { left: '24px', top: '120px' }
        },
        {
            id: 'calculator',
            title: 'Calculadora',
            icon: 'calculator',
            defaultPos: { left: '24px', top: '450px' }
        },
        {
            id: 'news',
            title: 'Notícias',
            icon: 'newspaper',
            defaultPos: { right: '270px', top: '120px' }
        }
    ];

    // LocalStorage keys
    const KEY_VISIBLE = 'frotalink_widgets_visible';
    const KEY_NOTEPAD_TEXT = 'frotalink_widget_notepad_text';
    const getPosKey = (id) => `frotalink_widget_pos_${id}`;
    const getMinKey = (id) => `frotalink_widget_minimized_${id}`;

    // Active state
    let visibleWidgets = JSON.parse(localStorage.getItem(KEY_VISIBLE) || '{"notepad": false, "calendar": false, "calculator": false, "postits": false, "news": false}');

    // Resize observer logic
    let resizeTimeout = null;
    const resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
            const card = entry.target;
            const id = card.id.replace('widget-', '');
            
            if (card.classList.contains('minimized') || !card.classList.contains('visible')) continue;
            
            if (card.style.width || card.style.height) {
                clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(() => {
                    localStorage.setItem(`frotalink_widget_size_${id}`, JSON.stringify({
                        width: card.style.width,
                        height: card.style.height
                    }));
                }, 300);
            }
        }
    });

    function initWidgetsSystem() {
        createManagerUI();
        createWidgetContainers();
        restoreWidgetStates();
        setupGlobalEvents();
    }

    // --- Create UI Elements ---

    function createManagerUI() {
        // Toggle Button
        const trigger = document.createElement('button');
        trigger.className = 'widgets-manager-trigger';
        trigger.title = 'Gerenciador de Widgets';
        trigger.innerHTML = '<i data-lucide="layout-template"></i>';
        trigger.addEventListener('click', toggleManagerPanel);
        document.body.appendChild(trigger);

        // Sidebar Manager Panel
        const panel = document.createElement('div');
        panel.className = 'widgets-manager-panel';
        panel.id = 'widgetsManagerPanel';

        let listHtml = '';
        WIDGETS.forEach(w => {
            const isChecked = visibleWidgets[w.id] ? 'checked' : '';
            listHtml += `
                <div class="widget-option-item">
                    <div class="widget-option-info">
                        <i data-lucide="${w.icon}"></i>
                        <span class="widget-option-name">${w.title}</span>
                    </div>
                    <label class="widget-switch">
                        <input type="checkbox" id="toggle-widget-${w.id}" data-widget="${w.id}" ${isChecked}>
                        <span class="widget-slider"></span>
                    </label>
                </div>
            `;
        });

        panel.innerHTML = `
            <div class="widgets-manager-header">
                <h3>Ferramentas de Atalho</h3>
                <button class="widgets-manager-close">&times;</button>
            </div>
            <div class="widgets-list-options">
                ${listHtml}
            </div>
        `;

        panel.querySelector('.widgets-manager-close').addEventListener('click', toggleManagerPanel);
        document.body.appendChild(panel);

        // Event listener for switches
        WIDGETS.forEach(w => {
            document.getElementById(`toggle-widget-${w.id}`).addEventListener('change', function(e) {
                setWidgetVisibility(w.id, e.target.checked);
            });
        });
    }

    function toggleManagerPanel() {
        const panel = document.getElementById('widgetsManagerPanel');
        panel.classList.toggle('open');
    }

    function createWidgetContainers() {
        WIDGETS.forEach(w => {
            const card = document.createElement('div');
            card.className = 'widget-card';
            card.id = `widget-${w.id}`;
            
            card.innerHTML = `
                <div class="widget-header" id="widget-header-${w.id}">
                    <div class="widget-title">
                        <i data-lucide="${w.icon}"></i>
                        <span>${w.title}</span>
                    </div>
                    <div class="widget-controls">
                        <button class="widget-control-btn min-btn" title="Minimizar">
                            <i data-lucide="minus" style="width:14px; height:14px;"></i>
                        </button>
                        <button class="widget-control-btn close-btn" title="Fechar">
                            <i data-lucide="x" style="width:14px; height:14px;"></i>
                        </button>
                    </div>
                </div>
                <div class="widget-body" id="widget-body-${w.id}"></div>
            `;

            // Append specific widgets body content
            const body = card.querySelector('.widget-body');
            if (w.id === 'notepad') {
                initNotepadWidget(body);
            } else if (w.id === 'calendar') {
                initCalendarWidget(body);
            } else if (w.id === 'calculator') {
                initCalculatorWidget(body);
            } else if (w.id === 'postits') {
                initPostitsWidget(body);
            } else if (w.id === 'news') {
                initNewsWidget(body);
            }

            // Controls listeners
            card.querySelector('.min-btn').addEventListener('click', () => toggleMinimizeWidget(w.id));
            card.querySelector('.close-btn').addEventListener('click', () => setWidgetVisibility(w.id, false));

            document.body.appendChild(card);
            makeDraggable(card, card.querySelector('.widget-header'));
            resizeObserver.observe(card);
        });
    }

    // --- State Restoration & Drag-and-Drop ---

    function restoreWidgetStates() {
        WIDGETS.forEach(w => {
            const card = document.getElementById(`widget-${w.id}`);
            
            // Set visibility
            if (visibleWidgets[w.id]) {
                card.classList.add('visible');
            }

            // Restore size
            const savedSize = JSON.parse(localStorage.getItem(`frotalink_widget_size_${w.id}`));
            if (savedSize) {
                if (savedSize.width) card.style.width = savedSize.width;
                if (savedSize.height) card.style.height = savedSize.height;
            }

            // Restore position
            const savedPos = JSON.parse(localStorage.getItem(getPosKey(w.id)));
            if (savedPos) {
                // Apply saved percentage position
                card.style.left = savedPos.x;
                card.style.top = savedPos.y;
                card.style.right = 'auto'; // Clear default right/left configs
            } else {
                // Apply default
                if (w.defaultPos.left) card.style.left = w.defaultPos.left;
                if (w.defaultPos.right) card.style.right = w.defaultPos.right;
                card.style.top = w.defaultPos.top;
            }

            // Restore minimized state
            const isMin = localStorage.getItem(getMinKey(w.id)) === 'true';
            if (isMin) {
                card.classList.add('minimized');
                const minIconBtn = card.querySelector('.min-btn i');
                if (minIconBtn) minIconBtn.setAttribute('data-lucide', 'square');
            }
        });

        if (window.lucide) {
            lucide.createIcons();
        }

        // Restore all floating post-its if postits manager is enabled
        if (visibleWidgets.postits) {
            postitsList.forEach(p => renderFloatingPostit(p));
        }
    }

    function setWidgetVisibility(id, visible) {
        visibleWidgets[id] = visible;
        localStorage.setItem(KEY_VISIBLE, JSON.stringify(visibleWidgets));

        const card = document.getElementById(`widget-${id}`);
        const checkbox = document.getElementById(`toggle-widget-${id}`);

        if (visible) {
            card.classList.add('visible');
            checkbox.checked = true;
            if (id === 'postits') {
                postitsList.forEach(p => renderFloatingPostit(p));
            }
        } else {
            card.classList.remove('visible');
            checkbox.checked = false;
            if (id === 'postits') {
                document.querySelectorAll('.widget-postit-card').forEach(p => p.remove());
            }
        }
    }

    function toggleMinimizeWidget(id) {
        const card = document.getElementById(`widget-${id}`);
        const wasMin = card.classList.toggle('minimized');
        localStorage.setItem(getMinKey(id), wasMin);

        // Update minimize icon
        const minBtn = card.querySelector('.min-btn');
        if (minBtn) {
            minBtn.innerHTML = wasMin 
                ? '<i data-lucide="maximize-2" style="width:14px; height:14px;"></i>'
                : '<i data-lucide="minus" style="width:14px; height:14px;"></i>';
        }
        if (window.lucide) lucide.createIcons();
    }

    function makeDraggable(element, handle) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        
        handle.onmousedown = dragMouseDown;
        handle.ontouchstart = dragTouchStart;

        function dragMouseDown(e) {
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }

        function dragTouchStart(e) {
            pos3 = e.touches[0].clientX;
            pos4 = e.touches[0].clientY;
            document.ontouchend = closeDragElement;
            document.ontouchmove = elementTouchDrag;
        }

        function elementDrag(e) {
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            
            let newTop = element.offsetTop - pos2;
            let newLeft = element.offsetLeft - pos1;

            // Bounds restriction
            const margin = 10;
            newTop = Math.max(margin, Math.min(window.innerHeight - 50, newTop));
            newLeft = Math.max(margin, Math.min(window.innerWidth - element.offsetWidth + (element.offsetWidth/2), newLeft));

            element.style.top = newTop + "px";
            element.style.left = newLeft + "px";
            element.style.right = "auto";
        }

        function elementTouchDrag(e) {
            pos1 = pos3 - e.touches[0].clientX;
            pos2 = pos4 - e.touches[0].clientY;
            pos3 = e.touches[0].clientX;
            pos4 = e.touches[0].clientY;

            let newTop = element.offsetTop - pos2;
            let newLeft = element.offsetLeft - pos1;

            newTop = Math.max(10, Math.min(window.innerHeight - 50, newTop));
            newLeft = Math.max(10, Math.min(window.innerWidth - 100, newLeft));

            element.style.top = newTop + "px";
            element.style.left = newLeft + "px";
            element.style.right = "auto";
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
            document.ontouchend = null;
            document.ontouchmove = null;

            // Save position as percentages to support screen resizing gracefully
            const pctX = ((element.offsetLeft / window.innerWidth) * 100).toFixed(2) + '%';
            const pctY = ((element.offsetTop / window.innerHeight) * 100).toFixed(2) + '%';
            
            const widgetId = element.id.replace('widget-', '');
            localStorage.setItem(getPosKey(widgetId), JSON.stringify({ x: pctX, y: pctY }));
        }
    }

    // --- 1. Notepad Logic ---

    function initNotepadWidget(body) {
        const textarea = document.createElement('textarea');
        textarea.className = 'widget-notepad-textarea';
        textarea.placeholder = 'Escreva suas notas rápidas aqui...\n(Salvo automaticamente)';
        textarea.value = localStorage.getItem(KEY_NOTEPAD_TEXT) || '';
        
        textarea.addEventListener('input', (e) => {
            localStorage.setItem(KEY_NOTEPAD_TEXT, e.target.value);
        });

        body.appendChild(textarea);
    }

    // --- 2. Calendar Logic ---

    function initCalendarWidget(body) {
        const calendarContainer = document.createElement('div');
        calendarContainer.className = 'widget-calendar-container';
        
        let date = new Date();
        let currYear = date.getFullYear();
        let currMonth = date.getMonth();

        const months = [
            "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
            "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
        ];

        calendarContainer.innerHTML = `
            <div class="widget-calendar-nav">
                <button class="widget-calendar-btn prev-month">&lt;</button>
                <div class="widget-calendar-month-year"></div>
                <button class="widget-calendar-btn next-month">&gt;</button>
            </div>
            <div class="widget-calendar-weekdays">
                <div>Dom</div><div>Seg</div><div>Ter</div><div>Qua</div><div>Qui</div><div>Sex</div><div>Sáb</div>
            </div>
            <div class="widget-calendar-days"></div>
        `;

        body.appendChild(calendarContainer);

        const renderCalendar = () => {
            let firstDayofMonth = new Date(currYear, currMonth, 1).getDay();
            let lastDateofMonth = new Date(currYear, currMonth + 1, 0).getDate();
            let lastDayofMonth = new Date(currYear, currMonth, lastDateofMonth).getDay();
            let lastDateofLastMonth = new Date(currYear, currMonth, 0).getDate();
            
            let daysGrid = "";

            // Days of previous month
            for (let i = firstDayofMonth; i > 0; i--) {
                daysGrid += `<div class="widget-calendar-day prev-next">${lastDateofLastMonth - i + 1}</div>`;
            }

            // Days of current month
            for (let i = 1; i <= lastDateofMonth; i++) {
                let isToday = i === date.getDate() && currMonth === new Date().getMonth() 
                            && currYear === new Date().getFullYear() ? "today" : "";
                daysGrid += `<div class="widget-calendar-day ${isToday}">${i}</div>`;
            }

            // Days of next month
            for (let i = lastDayofMonth; i < 6; i++) {
                daysGrid += `<div class="widget-calendar-day prev-next">${i - lastDayofMonth + 1}</div>`;
            }

            calendarContainer.querySelector(".widget-calendar-month-year").innerText = `${months[currMonth]} ${currYear}`;
            calendarContainer.querySelector(".widget-calendar-days").innerHTML = daysGrid;
        };

        renderCalendar();

        calendarContainer.querySelector(".prev-month").addEventListener("click", () => {
            currMonth = currMonth - 1;
            if (currMonth < 0) {
                currMonth = 11;
                currYear = currYear - 1;
            }
            renderCalendar();
        });

        calendarContainer.querySelector(".next-month").addEventListener("click", () => {
            currMonth = currMonth + 1;
            if (currMonth > 11) {
                currMonth = 0;
                currYear = currYear + 1;
            }
            renderCalendar();
        });
    }

    // --- 3. Calculator Logic ---

    function initCalculatorWidget(body) {
        const container = document.createElement('div');
        container.className = 'widget-calc-container';

        container.innerHTML = `
            <div class="widget-calc-display">
                <div class="widget-calc-history" id="calc-history"></div>
                <div id="calc-screen">0</div>
            </div>
            <div class="widget-calc-buttons">
                <button class="widget-calc-btn action-btn" data-val="C">C</button>
                <button class="widget-calc-btn action-btn" data-val="back">⌫</button>
                <button class="widget-calc-btn op-btn" data-val="/">/</button>
                <button class="widget-calc-btn op-btn" data-val="*">×</button>
                
                <button class="widget-calc-btn" data-val="7">7</button>
                <button class="widget-calc-btn" data-val="8">8</button>
                <button class="widget-calc-btn" data-val="9">9</button>
                <button class="widget-calc-btn op-btn" data-val="-">-</button>
                
                <button class="widget-calc-btn" data-val="4">4</button>
                <button class="widget-calc-btn" data-val="5">5</button>
                <button class="widget-calc-btn" data-val="6">6</button>
                <button class="widget-calc-btn op-btn" data-val="+">+</button>
                
                <button class="widget-calc-btn" data-val="1">1</button>
                <button class="widget-calc-btn" data-val="2">2</button>
                <button class="widget-calc-btn" data-val="3">3</button>
                <button class="widget-calc-btn eq-btn" data-val="=">=</button>
                
                <button class="widget-calc-btn" data-val="0" style="grid-column: span 2;">0</button>
                <button class="widget-calc-btn" data-val=".">.</button>
            </div>
        `;

        body.appendChild(container);

        const screen = container.querySelector('#calc-screen');
        const historyEl = container.querySelector('#calc-history');
        let currentInput = '0';
        let prevInput = '';
        let operation = null;
        let resetScreen = false;

        const updateScreen = () => {
            screen.innerText = currentInput;
            if (operation && prevInput) {
                historyEl.innerText = `${prevInput} ${operation}`;
            } else {
                historyEl.innerText = '';
            }
        };

        const handleCalcBtn = (val) => {
            if (val >= '0' && val <= '9') {
                if (currentInput === '0' || resetScreen) {
                    currentInput = val;
                    resetScreen = false;
                } else {
                    currentInput += val;
                }
            } else if (val === '.') {
                if (resetScreen) {
                    currentInput = '0.';
                    resetScreen = false;
                } else if (!currentInput.includes('.')) {
                    currentInput += '.';
                }
            } else if (val === 'C') {
                currentInput = '0';
                prevInput = '';
                operation = null;
                resetScreen = false;
            } else if (val === 'back') {
                if (currentInput.length > 1) {
                    currentInput = currentInput.slice(0, -1);
                } else {
                    currentInput = '0';
                }
            } else if (['+', '-', '*', '/'].includes(val)) {
                if (operation && !resetScreen) {
                    calculate();
                }
                prevInput = currentInput;
                operation = val;
                resetScreen = true;
            } else if (val === '=') {
                calculate();
                operation = null;
                prevInput = '';
            }
            updateScreen();
        };

        const calculate = () => {
            let result = 0;
            const prev = parseFloat(prevInput);
            const current = parseFloat(currentInput);
            
            if (isNaN(prev) || isNaN(current)) return;
            
            switch (operation) {
                case '+': result = prev + current; break;
                case '-': result = prev - current; break;
                case '*': result = prev * current; break;
                case '/': 
                    if (current === 0) {
                        currentInput = 'Erro';
                        resetScreen = true;
                        return;
                    }
                    result = prev / current; 
                    break;
                default: return;
            }
            
            // Format result
            currentInput = String(parseFloat(result.toFixed(8)));
            resetScreen = true;
        };

        container.querySelectorAll('.widget-calc-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                handleCalcBtn(btn.getAttribute('data-val'));
            });
        });

        // Add basic keyboard integration when calculator is focused or hovered
        let isFocused = false;
        container.addEventListener('mouseenter', () => isFocused = true);
        container.addEventListener('mouseleave', () => isFocused = false);

        window.addEventListener('keydown', (e) => {
            if (!isFocused || !visibleWidgets.calculator) return;
            
            let key = e.key;
            if (key >= '0' && key <= '9') handleCalcBtn(key);
            else if (key === '.') handleCalcBtn('.');
            else if (key === '+') handleCalcBtn('+');
            else if (key === '-') handleCalcBtn('-');
            else if (key === '*') handleCalcBtn('*');
            else if (key === '/') handleCalcBtn('/');
            else if (key === 'Enter' || key === '=') { e.preventDefault(); handleCalcBtn('='); }
            else if (key === 'Backspace') handleCalcBtn('back');
            else if (key === 'Escape' || key === 'c' || key === 'C') handleCalcBtn('C');
        });
    }

    // --- 4. Post-its (Sticky Notes) Logic ---
    let postitsList = JSON.parse(localStorage.getItem('frotalink_widget_postits_list') || '[]');

    function savePostits() {
        localStorage.setItem('frotalink_widget_postits_list', JSON.stringify(postitsList));
        updatePostitCounter();
    }

    function updatePostitCounter() {
        const counters = document.querySelectorAll('.widget-postit-counter');
        const countText = `${postitsList.length} ${postitsList.length === 1 ? 'nota' : 'notas'} na tela`;
        counters.forEach(c => c.innerText = countText);
    }

    function initPostitsWidget(body) {
        const container = document.createElement('div');
        container.className = 'widget-postit-launcher-container';

        container.innerHTML = `
            <button class="widget-postit-add-btn">
                <i data-lucide="plus"></i> Novo Post-it
            </button>
            <span class="widget-postit-counter">0 notas na tela</span>
        `;

        body.appendChild(container);
        updatePostitCounter();

        container.querySelector('.widget-postit-add-btn').addEventListener('click', () => {
            const id = 'postit_' + Date.now();
            // Spawn in a semi-random spot near the center of the screen
            const randomX = (30 + Math.random() * 40).toFixed(0) + '%';
            const randomY = (20 + Math.random() * 40).toFixed(0) + '%';
            const newPost = {
                id: id,
                title: '',
                text: '',
                color: 'yellow',
                x: randomX,
                y: randomY,
                w: '220px',
                h: '220px'
            };

            postitsList.push(newPost);
            savePostits();
            renderFloatingPostit(newPost);
        });

        if (window.lucide) lucide.createIcons();
    }

    function renderFloatingPostit(data) {
        if (document.getElementById(data.id)) return;

        const card = document.createElement('div');
        card.className = `widget-postit-card widget-postit-${data.color}`;
        card.id = data.id;
        card.style.left = data.x;
        card.style.top = data.y;
        card.style.width = data.w || '220px';
        card.style.height = data.h || '220px';

        card.innerHTML = `
            <div class="widget-postit-header">
                <div class="widget-postit-colors">
                    <span class="widget-postit-color-dot yellow" data-color="yellow" title="Amarelo"></span>
                    <span class="widget-postit-color-dot blue" data-color="blue" title="Azul"></span>
                    <span class="widget-postit-color-dot pink" data-color="pink" title="Rosa"></span>
                    <span class="widget-postit-color-dot green" data-color="green" title="Verde"></span>
                    <span class="widget-postit-color-dot orange" data-color="orange" title="Laranja"></span>
                </div>
                <button class="widget-postit-delete" title="Excluir Nota">
                    <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                </button>
            </div>
            <div class="widget-postit-body">
                <input type="text" class="widget-postit-title-input" placeholder="Título..." value="${data.title || ''}">
                <textarea class="widget-postit-textarea" placeholder="Escreva algo...">${data.text || ''}</textarea>
            </div>
        `;

        document.body.appendChild(card);
        if (window.lucide) lucide.createIcons();

        makeDraggablePostit(card, card.querySelector('.widget-postit-header'));

        // Handle resize observation for specific Post-its
        let resizeTimer = null;
        const ro = new ResizeObserver(entries => {
            for (let entry of entries) {
                if (card.style.width || card.style.height) {
                    clearTimeout(resizeTimer);
                    resizeTimer = setTimeout(() => {
                        const post = postitsList.find(p => p.id === data.id);
                        if (post) {
                            post.w = card.style.width;
                            post.h = card.style.height;
                            savePostits();
                        }
                    }, 300);
                }
            }
        });
        ro.observe(card);

        // Events
        card.querySelector('.widget-postit-delete').addEventListener('click', () => {
            card.remove();
            postitsList = postitsList.filter(p => p.id !== data.id);
            savePostits();
        });

        const textarea = card.querySelector('.widget-postit-textarea');
        textarea.addEventListener('input', (e) => {
            const post = postitsList.find(p => p.id === data.id);
            if (post) {
                post.text = e.target.value;
                savePostits();
            }
        });

        const titleInput = card.querySelector('.widget-postit-title-input');
        titleInput.addEventListener('input', (e) => {
            const post = postitsList.find(p => p.id === data.id);
            if (post) {
                post.title = e.target.value;
                savePostits();
            }
        });

        card.querySelectorAll('.widget-postit-color-dot').forEach(dot => {
            dot.addEventListener('click', () => {
                const color = dot.getAttribute('data-color');
                card.className = `widget-postit-card widget-postit-${color}`;
                const post = postitsList.find(p => p.id === data.id);
                if (post) {
                    post.color = color;
                    savePostits();
                }
            });
        });
    }

    function makeDraggablePostit(element, handle) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        
        handle.onmousedown = dragMouseDown;
        handle.ontouchstart = dragTouchStart;

        function dragMouseDown(e) {
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }

        function dragTouchStart(e) {
            pos3 = e.touches[0].clientX;
            pos4 = e.touches[0].clientY;
            document.ontouchend = closeDragElement;
            document.ontouchmove = elementTouchDrag;
        }

        function elementDrag(e) {
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            
            let newTop = element.offsetTop - pos2;
            let newLeft = element.offsetLeft - pos1;

            newTop = Math.max(10, Math.min(window.innerHeight - 50, newTop));
            newLeft = Math.max(10, Math.min(window.innerWidth - element.offsetWidth + (element.offsetWidth/2), newLeft));

            element.style.top = newTop + "px";
            element.style.left = newLeft + "px";
        }

        function elementTouchDrag(e) {
            pos1 = pos3 - e.touches[0].clientX;
            pos2 = pos4 - e.touches[0].clientY;
            pos3 = e.touches[0].clientX;
            pos4 = e.touches[0].clientY;

            let newTop = element.offsetTop - pos2;
            let newLeft = element.offsetLeft - pos1;

            newTop = Math.max(10, Math.min(window.innerHeight - 50, newTop));
            newLeft = Math.max(10, Math.min(window.innerWidth - 100, newLeft));

            element.style.top = newTop + "px";
            element.style.left = newLeft + "px";
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
            document.ontouchend = null;
            document.ontouchmove = null;

            const pctX = ((element.offsetLeft / window.innerWidth) * 100).toFixed(2) + '%';
            const pctY = ((element.offsetTop / window.innerHeight) * 100).toFixed(2) + '%';
            
            const post = postitsList.find(p => p.id === element.id);
            if (post) {
                post.x = pctX;
                post.y = pctY;
                savePostits();
            }
        }
    }

    // --- 5. News Widget Logic ---
    const NEWS_FEEDS = {
        veiculos: [
            'https://g1.globo.com/rss/g1/carros/',
            'https://rss.uol.com.br/feed/carros.xml',
            'https://noticias.r7.com/carros/feed.xml'
        ],
        financas: [
            'https://g1.globo.com/rss/g1/economia/',
            'https://rss.uol.com.br/feed/economia.xml',
            'https://noticias.r7.com/economia/feed.xml'
        ],
        negocios: [
            'https://g1.globo.com/rss/g1/economia/negocios/',
            'https://valor.globo.com/rss/valor/',
            'https://rss.uol.com.br/feed/empreendedorismo.xml'
        ],
        tecnologia: [
            'https://g1.globo.com/rss/g1/tecnologia/',
            'https://rss.uol.com.br/feed/tecnologia.xml',
            'https://noticias.r7.com/tecnologia-e-ciencia/feed.xml'
        ],
        geral: [
            'https://g1.globo.com/rss/g1/',
            'https://rss.uol.com.br/feed/noticias.xml',
            'https://noticias.r7.com/feed.xml'
        ]
    };

    function initNewsWidget(body) {
        const container = document.createElement('div');
        container.className = 'widget-news-container';

        container.innerHTML = `
            <div class="widget-news-controls">
                <div class="widget-news-chips" id="news-chips-container">
                    <span class="widget-news-chip" data-topic="veiculos">🚗 Carros</span>
                    <span class="widget-news-chip" data-topic="financas">💰 Finanças</span>
                    <span class="widget-news-chip" data-topic="negocios">📈 Negócios</span>
                    <span class="widget-news-chip" data-topic="tecnologia">💻 Tech</span>
                    <span class="widget-news-chip" data-topic="geral">📰 Geral</span>
                </div>
                <button class="widget-news-refresh-btn" title="Atualizar Notícias">
                    <i data-lucide="rotate-cw" style="width: 14px; height: 14px;"></i>
                </button>
            </div>
            <div class="widget-news-list" id="news-items-list">
                <div class="widget-news-loading">Carregando notícias...</div>
            </div>
        `;
        body.appendChild(container);

        const chipsContainer = container.querySelector('#news-chips-container');
        const refreshBtn = container.querySelector('.widget-news-refresh-btn');
        const listContainer = container.querySelector('#news-items-list');

        // Restore active topics array
        let activeTopics = JSON.parse(localStorage.getItem('frotalink_widget_news_topics_multiselect') || '["veiculos"]');
        
        // Highlight active chips
        const updateChipsUI = () => {
            chipsContainer.querySelectorAll('.widget-news-chip').forEach(chip => {
                const topic = chip.getAttribute('data-topic');
                if (activeTopics.includes(topic)) {
                    chip.classList.add('active');
                } else {
                    chip.classList.remove('active');
                }
            });
        };

        const loadNews = async () => {
            if (activeTopics.length === 0) {
                listContainer.innerHTML = '<div class="widget-news-error">Selecione pelo menos um assunto acima.</div>';
                return;
            }

            listContainer.innerHTML = '<div class="widget-news-loading">Carregando notícias...</div>';

            try {
                // Collect active feeds with their source names
                const activeFeeds = [];
                activeTopics.forEach(topic => {
                    const feeds = NEWS_FEEDS[topic];
                    if (Array.isArray(feeds)) {
                        feeds.forEach(url => {
                            let source = "G1";
                            if (url.includes("uol.com.br")) source = "UOL";
                            else if (url.includes("r7.com")) source = "R7";
                            else if (url.includes("valor.globo.com")) source = "Valor";
                            activeFeeds.push({ url, source, topic });
                        });
                    }
                });

                // Fetch active feeds in parallel
                const fetchPromises = activeFeeds.map(async (feed) => {
                    try {
                        const res = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}`);
                        const data = await res.json();
                        if (data.status === 'ok' && data.items) {
                            return data.items.map(item => ({ ...item, source: feed.source, topic: feed.topic }));
                        }
                        return [];
                    } catch (e) {
                        console.warn(`Erro ao carregar feed ${feed.url}:`, e);
                        return [];
                    }
                });

                const results = await Promise.all(fetchPromises);
                
                // Merge and de-duplicate articles
                let mergedItems = results.flat();
                const seenLinks = new Set();
                mergedItems = mergedItems.filter(item => {
                    if (seenLinks.has(item.link)) return false;
                    seenLinks.add(item.link);
                    return true;
                });

                // Sort chronologically (newest first)
                mergedItems.sort((a, b) => {
                    const dateA = a.pubDate ? new Date(a.pubDate) : new Date(0);
                    const dateB = b.pubDate ? new Date(b.pubDate) : new Date(0);
                    return dateB - dateA;
                });

                const topicNames = {
                    veiculos: 'Carros',
                    financas: 'Finanças',
                    negocios: 'Negócios',
                    tecnologia: 'Tech',
                    geral: 'Geral'
                };

                if (mergedItems.length > 0) {
                    let html = '';
                    // Display top 8 articles
                    mergedItems.slice(0, 8).forEach(item => {
                        const date = new Date(item.pubDate).toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                        });
                        const thumb = item.thumbnail || '';
                        const sourceClass = (item.source || 'G1').toLowerCase();
                        const topicClass = (item.topic || 'geral');
                        const topicLabel = topicNames[item.topic] || 'Geral';

                        html += `
                            <a href="${item.link}" target="_blank" class="widget-news-item">
                                ${thumb ? `<img src="${thumb}" class="widget-news-thumb" alt="News Image">` : ''}
                                <div class="widget-news-info">
                                    <h4 class="widget-news-title">${item.title}</h4>
                                    <div class="widget-news-meta">
                                        <span>${date}</span>
                                        <div style="display: flex; gap: 0.35rem; align-items: center;">
                                            <span class="widget-news-category-tag topic-${topicClass}">${topicLabel}</span>
                                            <span class="widget-news-source-tag source-${sourceClass}">${item.source || 'G1'}</span>
                                        </div>
                                    </div>
                                </div>
                            </a>
                        `;
                    });
                    listContainer.innerHTML = html;
                } else {
                    listContainer.innerHTML = '<div class="widget-news-error">Nenhuma notícia encontrada.</div>';
                }
            } catch (err) {
                console.error("Erro ao carregar notícias:", err);
                listContainer.innerHTML = '<div class="widget-news-error">Erro ao carregar notícias.</div>';
            }
        };

        // Chips click event handlers
        chipsContainer.querySelectorAll('.widget-news-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const topic = chip.getAttribute('data-topic');
                const index = activeTopics.indexOf(topic);

                if (index > -1) {
                    // Prevent unselecting all topics completely
                    if (activeTopics.length > 1) {
                        activeTopics.splice(index, 1);
                    } else {
                        // Optional: show a user warning or ignore unchecking
                        return;
                    }
                } else {
                    activeTopics.push(topic);
                }

                localStorage.setItem('frotalink_widget_news_topics_multiselect', JSON.stringify(activeTopics));
                updateChipsUI();
                loadNews();
            });
        });

        refreshBtn.addEventListener('click', loadNews);

        // Initial setup
        updateChipsUI();
        loadNews();
        if (window.lucide) lucide.createIcons();
    }

    // --- Global Click/Close handler to dismiss Manager Panel ---

    function setupGlobalEvents() {
        document.addEventListener('click', (e) => {
            const panel = document.getElementById('widgetsManagerPanel');
            const trigger = document.querySelector('.widgets-manager-trigger');
            if (panel && panel.classList.contains('open') && 
                !panel.contains(e.target) && !trigger.contains(e.target)) {
                panel.classList.remove('open');
            }
        });
    }

    // Load widgets when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initWidgetsSystem);
    } else {
        initWidgetsSystem();
    }
})();
