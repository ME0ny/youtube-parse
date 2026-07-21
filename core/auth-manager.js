// core/auth-manager.js
/**
 * Менеджер аутентификации.
 * Управляет:
 *   - machineId (генерируется через fingerprint)
 *   - credentials (client_id + client_secret)
 *   - токенами (access + refresh)
 *
 * Хранение: chrome.storage.local
 */

import { ApiClient } from './api-client.js';
import { generateMachineId } from './machine-fingerprint.js';

const MODULE_NAME = 'AuthManager';

const STORAGE_KEYS = {
    CLIENT_ID: 'api_client_id',
    CLIENT_SECRET: 'api_client_secret',
    ACCESS_TOKEN: 'api_access_token',
    REFRESH_TOKEN: 'api_refresh_token',
    MACHINE_ID: 'api_machine_id',
    USERNAME: 'api_username',
    AUTH_TYPE: 'api_auth_type', // 'machine' | 'user' | null
    IS_AUTHENTICATED: 'api_is_authenticated',
    API_BASE_URL: 'api_base_url'
};

export class AuthManager {
    constructor() {
        this.apiClient = new ApiClient();
        this.apiClient.onTokensRefreshed = async (access, refresh) => {
            await this._saveTokens(access, refresh);
        };
        this._initialized = false;
    }

    /**
     * Инициализация: загружает сохранённые данные из storage.
     * Должна быть вызвана один раз при старте background.
     */
    async initialize() {
        if (this._initialized) return;

        try {
            const data = await chrome.storage.local.get([
                STORAGE_KEYS.CLIENT_ID,
                STORAGE_KEYS.CLIENT_SECRET,
                STORAGE_KEYS.ACCESS_TOKEN,
                STORAGE_KEYS.REFRESH_TOKEN,
                STORAGE_KEYS.MACHINE_ID,
                STORAGE_KEYS.USERNAME,
                STORAGE_KEYS.AUTH_TYPE,
                STORAGE_KEYS.IS_AUTHENTICATED,
                STORAGE_KEYS.API_BASE_URL
            ]);

            // Настраиваем base URL
            if (data[STORAGE_KEYS.API_BASE_URL]) {
                this.apiClient.baseUrl = data[STORAGE_KEYS.API_BASE_URL];
            }

            // Восстанавливаем токены
            if (data[STORAGE_KEYS.IS_AUTHENTICATED] && data[STORAGE_KEYS.ACCESS_TOKEN]) {
                this.apiClient.setTokens(
                    data[STORAGE_KEYS.ACCESS_TOKEN],
                    data[STORAGE_KEYS.REFRESH_TOKEN]
                );
                console.log(`[${MODULE_NAME}] Restored session for client ${data[STORAGE_KEYS.CLIENT_ID]}`);
            }

            this._initialized = true;
        } catch (e) {
            console.error(`[${MODULE_NAME}] Initialization error:`, e);
        }
    }

    /**
     * Получает текущий machineId (генерирует, если нет).
     */
    async getMachineId() {
        const data = await chrome.storage.local.get([STORAGE_KEYS.MACHINE_ID]);
        if (data[STORAGE_KEYS.MACHINE_ID]) {
            return data[STORAGE_KEYS.MACHINE_ID];
        }
        // Генерируем новый fingerprint
        const machineId = await generateMachineId();
        await chrome.storage.local.set({ [STORAGE_KEYS.MACHINE_ID]: machineId });
        console.log(`[${MODULE_NAME}] Generated new machineId: ${machineId}`);
        return machineId;
    }

    /**
     * Автоматическая регистрация (machine account).
     */
    async registerMachine() {
        await this.initialize();
        const machineId = await this.getMachineId();

        const metadata = this._collectMetadata();
        const result = await this.apiClient.registerMachine(machineId, metadata);

        await this._saveCredentials({
            client_id: result.client_id,
            client_secret: result.client_secret,
            access_token: result.access_token,
            refresh_token: result.refresh_token,
            auth_type: 'machine',
            username: null
        });

        console.log(`[${MODULE_NAME}] Machine registration successful: ${result.client_id}`);
        return result;
    }

    /**
     * Ручная регистрация (user account).
     */
    async registerUser(username, password) {
        await this.initialize();
        const machineId = await this.getMachineId();

        const metadata = this._collectMetadata();
        const result = await this.apiClient.registerUser(machineId, username, password, metadata);

        await this._saveCredentials({
            client_id: result.client_id,
            client_secret: result.client_secret,
            access_token: result.access_token,
            refresh_token: result.refresh_token,
            auth_type: 'user',
            username: username
        });

        console.log(`[${MODULE_NAME}] User registration successful: ${username}`);
        return result;
    }

    /**
     * Вход по сохранённым machine credentials.
     */
    async loginMachine(clientId, clientSecret) {
        await this.initialize();
        const result = await this.apiClient.loginMachine(clientId, clientSecret);

        await this._saveCredentials({
            client_id: clientId,
            client_secret: clientSecret,
            access_token: result.access_token,
            refresh_token: result.refresh_token,
            auth_type: 'machine',
            username: null
        });

        console.log(`[${MODULE_NAME}] Machine login successful: ${clientId}`);
        return result;
    }

    /**
     * Вход по username/password.
     */
    async loginUser(username, password) {
        await this.initialize();
        const machineId = await this.getMachineId();
        const result = await this.apiClient.loginUser(username, password, machineId);

        // client_id и client_secret при user login не возвращаются —
        // но они нам и не нужны, т.к. у нас есть username/password
        await this._saveCredentials({
            client_id: null, // неизвестен при user login
            client_secret: null,
            access_token: result.access_token,
            refresh_token: result.refresh_token,
            auth_type: 'user',
            username: username
        });

        console.log(`[${MODULE_NAME}] User login successful: ${username}`);
        return result;
    }

    /**
     * Выход — очищает токены, но сохраняет credentials для быстрого повторного входа.
     */
    async logout() {
        await chrome.storage.local.remove([
            STORAGE_KEYS.ACCESS_TOKEN,
            STORAGE_KEYS.REFRESH_TOKEN,
            STORAGE_KEYS.IS_AUTHENTICATED
        ]);
        this.apiClient.setTokens(null, null);
        console.log(`[${MODULE_NAME}] Logged out`);
    }

    /**
     * Полный сброс — удаляет все данные (credentials + токены + machineId).
     */
    async reset() {
        await chrome.storage.local.remove(Object.values(STORAGE_KEYS));
        this.apiClient.setTokens(null, null);
        console.log(`[${MODULE_NAME}] Full reset`);
    }

    /**
     * Проверяет, авторизован ли клиент.
     */
    async isAuthenticated() {
        await this.initialize();
        const data = await chrome.storage.local.get([STORAGE_KEYS.IS_AUTHENTICATED]);
        return data[STORAGE_KEYS.IS_AUTHENTICATED] === true;
    }

    /**
     * Возвращает информацию о текущей сессии.
     */
    async getSessionInfo() {
        await this.initialize();
        const data = await chrome.storage.local.get([
            STORAGE_KEYS.CLIENT_ID,
            STORAGE_KEYS.MACHINE_ID,
            STORAGE_KEYS.USERNAME,
            STORAGE_KEYS.AUTH_TYPE,
            STORAGE_KEYS.IS_AUTHENTICATED
        ]);

        return {
            isAuthenticated: data[STORAGE_KEYS.IS_AUTHENTICATED] === true,
            clientId: data[STORAGE_KEYS.CLIENT_ID] || null,
            machineId: data[STORAGE_KEYS.MACHINE_ID] || null,
            username: data[STORAGE_KEYS.USERNAME] || null,
            authType: data[STORAGE_KEYS.AUTH_TYPE] || null
        };
    }

    /**
     * Возвращает ApiClient для прямых запросов.
     */
    getApiClient() {
        return this.apiClient;
    }

    /**
     * Устанавливает base URL API.
     */
    async setBaseUrl(url) {
        this.apiClient.baseUrl = url;
        await chrome.storage.local.set({ [STORAGE_KEYS.API_BASE_URL]: url });
    }

    /**
     * Получает сохранённые credentials (для быстрого повторного входа).
     */
    async getStoredCredentials() {
        const data = await chrome.storage.local.get([
            STORAGE_KEYS.CLIENT_ID,
            STORAGE_KEYS.CLIENT_SECRET,
            STORAGE_KEYS.USERNAME,
            STORAGE_KEYS.AUTH_TYPE
        ]);
        return {
            clientId: data[STORAGE_KEYS.CLIENT_ID] || null,
            clientSecret: data[STORAGE_KEYS.CLIENT_SECRET] || null,
            username: data[STORAGE_KEYS.USERNAME] || null,
            authType: data[STORAGE_KEYS.AUTH_TYPE] || null
        };
    }

    // ==================== PRIVATE ====================

    async _saveCredentials({ client_id, client_secret, access_token, refresh_token, auth_type, username }) {
        const toSave = {
            [STORAGE_KEYS.IS_AUTHENTICATED]: true
        };
        if (client_id !== undefined) toSave[STORAGE_KEYS.CLIENT_ID] = client_id;
        if (client_secret !== undefined) toSave[STORAGE_KEYS.CLIENT_SECRET] = client_secret;
        if (access_token !== undefined) toSave[STORAGE_KEYS.ACCESS_TOKEN] = access_token;
        if (refresh_token !== undefined) toSave[STORAGE_KEYS.REFRESH_TOKEN] = refresh_token;
        if (auth_type !== undefined) toSave[STORAGE_KEYS.AUTH_TYPE] = auth_type;
        if (username !== undefined) toSave[STORAGE_KEYS.USERNAME] = username;

        await chrome.storage.local.set(toSave);
        this.apiClient.setTokens(access_token, refresh_token);
    }

    async _saveTokens(access_token, refresh_token) {
        const toSave = {};
        if (access_token !== null) {
            toSave[STORAGE_KEYS.ACCESS_TOKEN] = access_token;
        } else {
            // Токены очищены — убираем флаг авторизации
            toSave[STORAGE_KEYS.IS_AUTHENTICATED] = false;
        }
        if (refresh_token !== null) {
            toSave[STORAGE_KEYS.REFRESH_TOKEN] = refresh_token;
        }
        await chrome.storage.local.set(toSave);
    }

    _collectMetadata() {
        return {
            extension_version: '2.0.0',
            browser_version: navigator.userAgent,
            os_info: navigator.platform
        };
    }
}