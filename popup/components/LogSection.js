// popup/components/LogSection.js
export class LogSection {
    constructor() {
        this.container = document.getElementById('logContainer');
        this.init();
    }

    init() {
        // Слушаем внутренние события для добавления логов
        document.addEventListener('log', (e) => {
            this.addLog(e.detail);
        });
        document.addEventListener('clearLog', () => this.clear());
        // При инициализации сразу загружаем начальные логи
        this.loadInitialLogs();
    }

    /**
     * Загружает и отображает начальные логи из хранилища.
     */
    async loadInitialLogs() {
        try {
            // Получаем логи напрямую из chrome.storage.local
            // В будущем это можно будет заменить на вызов нового Logger API
            const result = await chrome.storage.local.get(['appLogs']);
            const logs = result.appLogs || [];

            // Очищаем контейнер и убираем placeholder
            this.container.innerHTML = '';

            if (logs.length === 0) {
                // Если логов нет, показываем placeholder
                this.#showPlaceholder();
            } else {
                // Отображаем последние N логов, например, последние 100
                const logsToShow = logs.slice(-100);
                logsToShow.forEach(logEntry => {
                    // Используем существующий метод addLog, но без прокрутки
                    this.#renderLogEntry(logEntry);
                });
                // Прокручиваем вниз только один раз, после добавления всех начальных логов
                this.container.scrollTop = this.container.scrollHeight;
            }
        } catch (error) {
            console.error("LogSection: Ошибка при загрузке начальных логов:", error);
            // Даже в случае ошибки показываем placeholder
            this.#showPlaceholder();
            // Можно также залогировать ошибку в UI
            this.addLog({ message: `⚠️ Ошибка загрузки журнала: ${error.message}`, level: 'error' });
        }
    }

    /**
     * Добавляет запись в журнал событий, учитывая позицию прокрутки пользователя.
     * @param {Object} logEntry - Объект записи лога.
     * @param {string} logEntry.message - Текст сообщения.
     * @param {string} logEntry.level - Уровень лога ('info', 'success', 'warn', 'error').
     * @param {number} logEntry.timestamp - Временная метка.
     */
    addLog({ message, level = 'info', timestamp = Date.now() }) {
        // Удаляем placeholder, если он есть
        const placeholder = this.container.querySelector('.log-placeholder');
        if (placeholder) {
            placeholder.remove();
        }

        const entry = document.createElement('div');
        entry.className = `log-entry log-level-${level}`;
        const time = new Date(timestamp).toLocaleTimeString();
        entry.textContent = `[${time}] ${message}`;

        // --- Логика умной прокрутки ---
        const container = this.container;
        const isScrolledToBottom = (container.scrollHeight - container.clientHeight) <= (container.scrollTop + 1);
        container.appendChild(entry);
        if (isScrolledToBottom) {
            container.scrollTop = container.scrollHeight;
        }
        // ---
    }

    /**
     * Очищает журнал и показывает placeholder.
     */
    clear() {
        this.container.innerHTML = '';
        this.#showPlaceholder();
        // Опционально: можно залогировать факт очистки
        // this.addLog({ message: '🧹 Журнал очищен', level: 'info' });
    }

    // --- Вспомогательные методы ---

    /**
     * Показывает placeholder "Журнал пуст".
     */
    #showPlaceholder() {
        const placeholder = document.createElement('div');
        placeholder.className = 'log-placeholder';
        placeholder.textContent = 'Журнал пуст';
        this.container.appendChild(placeholder);
    }

    /**
     * Внутренний метод для рендеринга одной записи без логики прокрутки.
     * Используется при загрузке начальных логов.
     * @private
     */
    #renderLogEntry({ message, level = 'info', timestamp = Date.now() }) {
        // Placeholder удаляется первой записью
        const placeholder = this.container.querySelector('.log-placeholder');
        if (placeholder) {
            placeholder.remove();
        }

        const entry = document.createElement('div');
        entry.className = `log-entry log-level-${level}`;
        const time = new Date(timestamp).toLocaleTimeString();
        entry.textContent = `[${time}] ${message}`;
        this.container.appendChild(entry);
        // Прокрутка НЕ происходит здесь
    }

}