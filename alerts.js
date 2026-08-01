/* =============================================================================
   FROTALINK — ALERTS & MODAIS PADRONIZADOS DO SISTEMA (alerts.js)
   Gerencia os modais de confirmação, avisos de bloqueio e diálogos de segurança.
   ============================================================================= */

// Injetar estrutura do modal no body caso não exista
(function initSystemAlertModal() {
    document.addEventListener('DOMContentLoaded', () => {
        if (document.getElementById('sysAlertModalOverlay')) return;

        const modalHTML = `
        <div id="sysAlertModalOverlay" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.85); backdrop-filter: blur(8px); z-index: 10000; align-items: center; justify-content: center; padding: 1rem; font-family: 'Inter', sans-serif;">
            <div style="background: #0d1322; border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; width: 100%; max-width: 440px; padding: 2rem 1.75rem; text-align: center; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.8); display: flex; flex-direction: column; align-items: center; animation: sysModalFadeIn 0.2s ease-out;">
                
                <!-- Ícone Dinâmico -->
                <div id="sysAlertIconContainer" style="width: 56px; height: 56px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 1.25rem;">
                    <i id="sysAlertIcon" data-lucide="info" style="width: 28px; height: 28px;"></i>
                </div>

                <!-- Título e Mensagem -->
                <h3 id="sysAlertTitle" style="font-size: 1.3rem; font-weight: 800; color: #ffffff; margin-bottom: 0.5rem; letter-spacing: -0.02em;">Aviso</h3>
                <div id="sysAlertMessage" style="font-size: 0.88rem; color: #94a3b8; line-height: 1.5; margin-bottom: 1.75rem; max-width: 380px;"></div>

                <!-- Botões de Ação -->
                <div style="display: flex; gap: 0.75rem; width: 100%; justify-content: center;" id="sysAlertButtons">
                    <button id="sysAlertBtnCancel" style="flex: 1; height: 42px; background: transparent; border: 1px solid #334155; border-radius: 10px; color: #94a3b8; font-size: 0.82rem; font-weight: 700; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.color='#ffffff'; this.style.borderColor='#64748b';" onmouseout="this.style.color='#94a3b8'; this.style.borderColor='#334155';">CANCELAR</button>
                    <button id="sysAlertBtnConfirm" style="flex: 1; height: 42px; background: #059669; border: none; border-radius: 10px; color: #ffffff; font-size: 0.82rem; font-weight: 800; text-transform: uppercase; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 12px rgba(5,150,105,0.3);">CONFIRMAR</button>
                </div>
            </div>
        </div>
        <style>
            @keyframes sysModalFadeIn {
                from { opacity: 0; transform: scale(0.95); }
                to { opacity: 1; transform: scale(1); }
            }
        </style>`;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
    });
})();

/**
 * Exibe um Modal Informativo ou de Alerta (Substitui o alert() padrão do navegador)
 * 
 * @param {Object} config
 * @param {string} config.title - Título do modal
 * @param {string} config.message - Mensagem explicativa
 * @param {'warning' | 'error' | 'info' | 'success'} [config.type='info'] - Tipo visual
 * @param {string} [config.confirmText='ENTENDI'] - Texto do botão principal
 * @returns {Promise<void>}
 */
window.showAlertModal = function({ title, message, type = 'info', confirmText = 'ENTENDI' }) {
    return new Promise((resolve) => {
        const overlay   = document.getElementById('sysAlertModalOverlay');
        const iconBox   = document.getElementById('sysAlertIconContainer');
        const iconEl    = document.getElementById('sysAlertIcon');
        const titleEl   = document.getElementById('sysAlertTitle');
        const msgEl     = document.getElementById('sysAlertMessage');
        const btnCancel = document.getElementById('sysAlertBtnCancel');
        const btnConf   = document.getElementById('sysAlertBtnConfirm');

        if (!overlay) return resolve();

        // Configuração de temas e ícones
        const themes = {
            warning: { icon: 'alert-triangle', bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.3)', color: '#f59e0b', btnBg: '#d97706' },
            error:   { icon: 'shield-alert',   bg: 'rgba(239, 68, 68, 0.12)',  border: 'rgba(239, 68, 68, 0.3)',  color: '#ef4444', btnBg: '#dc2626' },
            success: { icon: 'check-circle-2', bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.3)', color: '#10b981', btnBg: '#059669' },
            info:    { icon: 'info',           bg: 'rgba(99, 102, 241, 0.12)', border: 'rgba(99, 102, 241, 0.3)', color: '#818cf8', btnBg: '#4f46e5' }
        };
        const t = themes[type] || themes.info;

        iconBox.style.background = t.bg;
        iconBox.style.border = `1px solid ${t.border}`;
        iconEl.style.color = t.color;
        iconEl.setAttribute('data-lucide', t.icon);

        titleEl.innerText = title;
        msgEl.innerHTML = message;

        btnCancel.style.display = 'none'; // Apenas 1 botão em alertas
        btnConf.innerText = confirmText;
        btnConf.style.background = t.btnBg;

        overlay.style.display = 'flex';
        if (window.lucide) lucide.createIcons();

        btnConf.onclick = () => {
            overlay.style.display = 'none';
            resolve();
        };
    });
};

/**
 * Exibe um Modal de Confirmação com opções (Substitui o confirm() padrão)
 * 
 * @param {Object} config
 * @param {string} config.title - Título do modal
 * @param {string} config.message - Mensagem de confirmação
 * @param {'warning' | 'error' | 'info'} [config.type='warning']
 * @param {string} [config.confirmText='CONFIRMAR']
 * @param {string} [config.cancelText='CANCELAR']
 * @returns {Promise<boolean>} Retorna true se confirmado, false se cancelado
 */
window.showConfirmModal = function({ title, message, type = 'warning', confirmText = 'CONFIRMAR', cancelText = 'CANCELAR' }) {
    return new Promise((resolve) => {
        const overlay   = document.getElementById('sysAlertModalOverlay');
        const iconBox   = document.getElementById('sysAlertIconContainer');
        const iconEl    = document.getElementById('sysAlertIcon');
        const titleEl   = document.getElementById('sysAlertTitle');
        const msgEl     = document.getElementById('sysAlertMessage');
        const btnCancel = document.getElementById('sysAlertBtnCancel');
        const btnConf   = document.getElementById('sysAlertBtnConfirm');

        if (!overlay) return resolve(false);

        const themes = {
            warning: { icon: 'alert-triangle', bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.3)', color: '#f59e0b', btnBg: '#d97706' },
            error:   { icon: 'trash-2',        bg: 'rgba(239, 68, 68, 0.12)',  border: 'rgba(239, 68, 68, 0.3)',  color: '#ef4444', btnBg: '#dc2626' },
            info:    { icon: 'help-circle',    bg: 'rgba(99, 102, 241, 0.12)', border: 'rgba(99, 102, 241, 0.3)', color: '#818cf8', btnBg: '#4f46e5' }
        };
        const t = themes[type] || themes.warning;

        iconBox.style.background = t.bg;
        iconBox.style.border = `1px solid ${t.border}`;
        iconEl.style.color = t.color;
        iconEl.setAttribute('data-lucide', t.icon);

        titleEl.innerText = title;
        msgEl.innerHTML = message;

        btnCancel.style.display = 'block';
        btnCancel.innerText = cancelText;
        btnConf.innerText = confirmText;
        btnConf.style.background = t.btnBg;

        overlay.style.display = 'flex';
        if (window.lucide) lucide.createIcons();

        btnConf.onclick = () => {
            overlay.style.display = 'none';
            resolve(true);
        };

        btnCancel.onclick = () => {
            overlay.style.display = 'none';
            resolve(false);
        };
    });
};
