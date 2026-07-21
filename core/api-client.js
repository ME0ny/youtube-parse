// core/api-client.js
const MODULE_NAME = 'ApiClient';

export class ApiClient {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || 'http://localhost:8000/v1';
        this.accessToken = null;
        this.refreshToken = null;
        this.onTokensRefreshed = null;
    }

    setTokens(accessToken, refreshToken) {
        this.accessToken = accessToken;
        this.refreshToken = refreshToken;
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };

        if (this.accessToken) {
            headers['Authorization'] = `Bearer ${this.accessToken}`;
        }

        console.log(`[${MODULE_NAME}] → ${options.method || 'GET'} ${url}`);

        let response;
        try {
            response = await fetch(url, { ...options, headers });
        } catch (networkError) {
            console.error(`[${MODULE_NAME}] Network error:`, networkError);
            throw new ApiError(0, { message: `Network error: ${networkError.message}` });
        }

        console.log(`[${MODULE_NAME}] ← ${response.status} ${response.statusText}`);

        // Если 401 и есть refresh token — пробуем refresh
        if (response.status === 401 && this.refreshToken && !options._isRefreshRequest) {
            console.log(`[${MODULE_NAME}] Got 401, trying refresh...`);
            const refreshed = await this._tryRefresh();
            if (refreshed) {
                headers['Authorization'] = `Bearer ${this.accessToken}`;
                response = await fetch(url, { ...options, headers });
            } else {
                this.setTokens(null, null);
                if (this.onTokensRefreshed) {
                    await this.onTokensRefreshed(null, null);
                }
            }
        }

        return response;
    }

    async _tryRefresh() {
        try {
            const response = await fetch(`${this.baseUrl}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: this.refreshToken })
            });

            if (response.ok) {
                const data = await response.json();
                this.setTokens(data.access_token, data.refresh_token);
                if (this.onTokensRefreshed) {
                    await this.onTokensRefreshed(data.access_token, data.refresh_token);
                }
                return true;
            }
            return false;
        } catch (e) {
            console.error(`[${MODULE_NAME}] Refresh error:`, e);
            return false;
        }
    }

    // ==================== Auth ====================

    async registerMachine(machineId, metadata = {}) {
        return this._post('/auth/register', { machine_id: machineId, ...metadata });
    }

    async registerUser(machineId, username, password, metadata = {}) {
        return this._post('/auth/register-with-credentials', {
            machine_id: machineId,
            username,
            password,
            ...metadata
        });
    }

    async loginMachine(clientId, clientSecret) {
        return this._post('/auth/login/machine', {
            client_id: clientId,
            client_secret: clientSecret
        });
    }

    async loginUser(username, password, machineId) {
        return this._post('/auth/login/user', {
            username,
            password,
            machine_id: machineId
        });
    }

    // ==================== Tasks ====================

    async getNextTask() {
        const response = await this.request('/tasks/search/next', { method: 'GET' });
        if (response.status === 204) return null;
        return this._handleResponse(response);
    }

    async completeTask(taskId) {
        return this._post(`/tasks/${taskId}/complete`, {});
    }

    async releaseTask(taskId, reason = null, comment = null) {
        return this._post(`/tasks/${taskId}/release`, { reason, comment });
    }

    // ==================== Videos ====================

    async submitBatch(taskId, source, videos, parseDurationMs = null) {
        return this._post('/videos/batch', {
            task_id: taskId,
            source,
            videos,
            parse_duration_ms: parseDurationMs
        });
    }

    // ==================== Batches ====================

    async getBatchNovelty(batchId) {
        return this._get(`/batches/${batchId}/novelty`);
    }

    // ==================== Helpers ====================

    async _get(endpoint) {
        const response = await this.request(endpoint, { method: 'GET' });
        return this._handleResponse(response);
    }

    async _post(endpoint, body) {
        const response = await this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(body)
        });
        return this._handleResponse(response);
    }

    async _handleResponse(response) {
        // Пытаемся распарсить JSON
        let data = null;
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            try {
                data = await response.json();
            } catch (e) {
                // ignore
            }
        }

        if (!response.ok) {
            // 👇 ЛОГИРУЕМ ошибку
            console.error(`[${MODULE_NAME}] ❌ API Error ${response.status}:`, data);
            throw new ApiError(response.status, data);
        }

        return data;
    }
}

/**
 * Класс ошибки API с правильной обработкой 422 (валидация) и других ошибок.
 */
export class ApiError extends Error {
    constructor(status, data) {
        // Парсим разные форматы ошибок
        let message = `HTTP ${status}`;
        let details = null;
        let errorCode = null;

        if (data) {
            // FastAPI формат: { "detail": [...] } или { "detail": { "error": ..., "message": ... } }
            if (data.detail) {
                if (Array.isArray(data.detail)) {
                    // 422 Validation Error — массив ошибок полей
                    const fieldErrors = data.detail.map(err => {
                        const field = (err.loc || []).filter(l => l !== 'body').join('.');
                        return `${field || 'field'}: ${err.msg}`;
                    });
                    message = `Validation error: ${fieldErrors.join('; ')}`;
                    details = data.detail;
                    errorCode = 'VALIDATION_ERROR';
                } else if (typeof data.detail === 'object') {
                    // Бизнес-ошибка: { "error": "CODE", "message": "..." }
                    message = data.detail.message || message;
                    errorCode = data.detail.error || null;
                    details = data.detail.details || null;
                } else if (typeof data.detail === 'string') {
                    message = data.detail;
                }
            } else if (data.message) {
                message = data.message;
                errorCode = data.error || null;
            }
        }

        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.errorCode = errorCode;
        this.details = details;
        this.responseData = data;
    }

    /**
     * Возвращает человекочитаемое описание ошибки для UI.
     */
    toUserMessage() {
        if (this.status === 0) {
            return '🌐 Нет соединения с сервером. Проверьте, что API запущен.';
        }
        if (this.status === 422) {
            // Детали валидации
            if (Array.isArray(this.details)) {
                return this.details.map(err => {
                    const field = (err.loc || []).filter(l => l !== 'body').join('.');
                    return `• ${field}: ${err.msg}`;
                }).join('\n');
            }
            return this.message;
        }
        if (this.status === 409) {
            return this.message;
        }
        if (this.status === 401) {
            return '🔒 Неверные учётные данные или токен истёк.';
        }
        if (this.status >= 500) {
            return '💥 Ошибка сервера. Попробуйте позже.';
        }
        return this.message;
    }
}