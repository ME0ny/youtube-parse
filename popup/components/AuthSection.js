// popup/components/AuthSection.js
const MODULE_NAME = 'AuthSection';

export class AuthSection {
    constructor(authManager) {
        this.authManager = authManager;

        // 🔒 ЗАЩИТА: Проверяем наличие элементов перед использованием
        this.container = document.getElementById('authSection');
        if (!this.container) {
            console.error(`[${MODULE_NAME}] ❌ Критическая ошибка: Элемент #authSection не найден в popup.html!`);
            return; // Останавливаем инициализацию, чтобы не было ошибок style
        }

        this.statusContainer = document.getElementById('authStatus');
        this.loginForm = document.getElementById('authLoginForm'); // Можно удалить, если не используется
        this.registerForm = document.getElementById('authRegisterForm'); // Можно удалить, если не используется

        this.init();
    }

    async init() {
        console.log(`[${MODULE_NAME}] Инициализация...`);
        this._bindEvents();
        await this._refreshState();
        console.log(`[${MODULE_NAME}] ✅ Инициализация завершена`);
    }

    _bindEvents() {
        console.log(`[${MODULE_NAME}] Привязка событий...`);

        // Машина: Регистрация
        const machineRegBtn = document.getElementById('authMachineRegisterBtn');
        if (machineRegBtn) {
            machineRegBtn.addEventListener('click', () => this._handleMachineRegister());
        }

        // Машина: Быстрый вход
        const quickRegisterBtn = document.getElementById('authQuickRegisterBtn');
        if (quickRegisterBtn) {
            quickRegisterBtn.addEventListener('click', () => this._handleQuickLogin());
        }

        // User: Вход
        const userLoginBtn = document.getElementById('authUserLoginBtn');
        if (userLoginBtn) {
            userLoginBtn.addEventListener('click', () => this._handleUserLogin());
        }

        // User: Регистрация
        const userRegisterBtn = document.getElementById('authUserRegisterBtn');
        if (userRegisterBtn) {
            userRegisterBtn.addEventListener('click', () => this._handleUserRegister());
        }

        // Выход
        const logoutBtn = document.getElementById('authLogoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this._handleLogout());
        }

        // Переключение вкладок
        document.querySelectorAll('.auth-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const formName = e.target.dataset.form;
                this._showForm(formName);
            });
        });

        // Сохранение API URL
        const saveApiUrlBtn = document.getElementById('authSaveApiUrlBtn');
        if (saveApiUrlBtn) {
            saveApiUrlBtn.addEventListener('click', () => this._handleSaveApiUrl());
        }
    }

    async _refreshState() {
        try {
            const session = await this.authManager.getSessionInfo();
            const credentials = await this.authManager.getStoredCredentials();

            if (session.isAuthenticated) {
                this._renderAuthenticated(session);
            } else {
                this._renderUnauthenticated(session, credentials);
            }
        } catch (e) {
            console.error(`[${MODULE_NAME}] Ошибка получения состояния:`, e);
            has
        }
    }

    _renderAuthenticated(session) {
        if (this.statusContainer) this.statusContainer.style.display = 'block';
        const formsContainer = document.getElementById('authForms');
        if (formsContainer) formsContainer.style.display = 'none';

        const statusText = document.getElementById('authStatusText');
        const accountType = document.getElementById('authAccountType');
        const machineIdEl = document.getElementById('authMachineId');

        if (statusText) {
            const displayName = session.username || (session.clientId ? session.clientId.substring(0, 8) + '...' : 'Unknown');
            statusText.textContent = `✅ Авторизован: ${displayName}`;
        }
        if (accountType) {
            accountType.textContent = session.authType === 'user' ? '👤 User account' : '🤖 Machine account';
        }
        if (machineIdEl) {
            machineIdEl.textContent = session.machineId || '—';
        }
    }

    _renderUnauthenticated(session, credentials) {
        if (this.statusContainer) this.statusContainer.style.display = 'none';
        const formsContainer = document.getElementById('authForms');
        if (formsContainer) formsContainer.style.display = 'block';

        const hasMachineCredentials = credentials.clientId && credentials.clientSecret;
        const hasUserCredentials = credentials.username;

        const quickLoginBlock = document.getElementById('authQuickLoginBlock');
        const quickLoginInfo = document.getElementById('authQuickLoginInfo');

        if (quickLoginBlock) {
            if (hasMachineCredentials || hasUserCredentials) {
                quickLoginBlock.style.display = 'flex';
                if (quickLoginInfo) {
                    if (hasUserCredentials) {
                        quickLoginInfo.textContent = `👤 Войти как ${credentials.username}`;
                    } else {
                        quickLoginInfo.textContent = `🤖 Войти как machine ${credentials.clientId.substring(0, 8)}...`;
                    }
                }
            } else {
                quickLoginBlock.style.display = 'none';
            }
        }

        this._showForm('register');
    }

    _showForm(formName) {
        const loginBlock = document.getElementById('authLoginBlock');
        const registerBlock = document.getElementById('authRegisterBlock');

        if (loginBlock) loginBlock.style.display = formName === 'login' ? 'block' : 'none';
        if (registerBlock) registerBlock.style.display = formName === 'register' ? 'block' : 'none';

        document.querySelectorAll('.auth-tab').forEach(tab => tab.classList.remove('active'));
        const activeTab = document.getElementById(`authTab-${formName}`);
        if (activeTab) activeTab.classList.add('active');
    }

    // ==================== HANDLERS ====================

    async _handleMachineRegister() {
        this._setLoading(true, 'Регистрация machine account...');
        try {
            const result = await this.authManager.registerMachine();
            this._log(`✅ Machine account зарегистрирован. Client ID: ${result.client_id}`, 'success');
            await this._refreshState();
        } catch (e) {
            const userMessage = e.toUserMessage ? e.toUserMessage() : e.message;
            this._log(`❌ Ошибка регистрации:\n${userMessage}`, 'error');
            console.error(`[${MODULE_NAME}] Machine register error:`, e);
        } finally {
            this._setLoading(false);
        }
    }

    async _handleQuickLogin() {
        this._setLoading(true, 'Вход по сохранённым данным...');
        try {
            // Прокси сам определит, machine это или user, по сохранённым данным
            await this.authManager.loginMachine(); // Или loginUser, зависит от вашей логики прокси
            this._log('✅ Вход выполнен', 'success');
            await this._refreshState();
        } catch (e) {
            const userMessage = e.toUserMessage ? e.toUserMessage() : e.message;
            this._log(`❌ Ошибка входа:\n${userMessage}`, 'error');
        } finally {
            this._setLoading(false);
        }
    }

    async _handleUserLogin() {
        const username = document.getElementById('authUsernameInput')?.value?.trim();
        const password = document.getElementById('authPasswordInput')?.value;

        if (!username || !password) {
            this._log('❌ Введите username и password', 'error');
            return;
        }

        this._setLoading(true, 'Вход...');
        try {
            await this.authManager.loginUser(username, password);
            this._log(`✅ Вход выполнен как ${username}`, 'success');
            await this._refreshState();
        } catch (e) {
            const userMessage = e.toUserMessage ? e.toUserMessage() : e.message;
            this._log(`❌ Ошибка входа:\n${userMessage}`, 'error');
        } finally {
            this._setLoading(false);
        }
    }

    async _handleUserRegister() {
        const username = document.getElementById('authRegUsernameInput')?.value?.trim();
        const password = document.getElementById('authRegPasswordInput')?.value;

        if (!username || !password) {
            this._log('❌ Введите username и password', 'error');
            return;
        }
        if (username.length < 3) {
            this._log('❌ Username должен быть не менее 3 символов', 'error');
            return;
        }
        if (password.length < 8) {
            this._log('❌ Password должен быть не менее 8 символов', 'error');
            return;
        }

        this._setLoading(true, 'Регистрация...');
        try {
            const result = await this.authManager.registerUser(username, password);
            this._log(`✅ User account зарегистрирован: ${username}`, 'success');
            await this._refreshState();
        } catch (e) {
            const userMessage = e.toUserMessage ? e.toUserMessage() : e.message;
            this._log(`❌ Ошибка регистрации:\n${userMessage}`, 'error');
        } finally {
            this._setLoading(false);
        }
    }

    async _handleLogout() {
        if (!confirm('Выйти из аккаунта? Credentials сохранятся для быстрого повторного входа.')) {
            return;
        }
        await this.authManager.logout();
        this._log('👋 Выход выполнен', 'info');
        await this._refreshState();
    }

    async _handleSaveApiUrl() {
        const url = document.getElementById('authApiUrlInput')?.value?.trim();
        if (!url) {
            this._log('❌ Введите URL', 'error');
            return;
        }
        await this.authManager.setBaseUrl(url);
        this._log(`✅ API URL сохранён: ${url}`, 'success');
    }

    // ==================== HELPERS ====================

    _setLoading(isLoading, message = 'Загрузка...') {
        const loader = document.getElementById('authLoader');
        if (loader) {
            loader.style.display = isLoading ? 'block' : 'none';
            loader.textContent = `⏳ ${message}`;
        }
        // Блокируем все кнопки в секции
        const buttons = this.container.querySelectorAll('button');
        buttons.forEach(btn => {
            btn.disabled = isLoading;
        });
    }

    _log(message, level = 'info') {
        console.log(`[${MODULE_NAME}] ${message}`);
        document.dispatchEvent(new CustomEvent('log', {
            detail: { message, level }
        }));
    }
}