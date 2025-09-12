// popup/components/TableSection.js
export class TableSection {
    constructor() {
        this.tableBody = document.getElementById('tableBody');
        this.init();
    }

    init() {
        // Слушаем внутренние события
        document.addEventListener('updateTable', (e) => this.render(e.detail));
        document.addEventListener('clearTable', () => this.clear());
        // При инициализации сразу загружаем начальные данные
        this.loadInitialData();
    }

    /**
     * Загружает и отображает начальные данные из хранилища.
     */
    async loadInitialData() {
        console.log("TableSection: Загрузка начальных данных...");
        try {
            // Отправляем сообщение в background для получения данных
            const response = await chrome.runtime.sendMessage({ action: "getTableData" });
            const data = response?.data || [];
            console.log(`TableSection: Получено ${data.length} записей.`);
            this.render(data);
        } catch (error) {
            console.error("TableSection: Ошибка при загрузке начальных данных:", error);
            this.clear();
            document.dispatchEvent(new CustomEvent('log', { detail: { message: `⚠️ Ошибка загрузки таблицы: ${error.message}`, level: 'error' } }));
        }
    }

    /**
     * Рендерит данные в таблицу.
     * @param {Array<Object>} data - Массив объектов видео.
     */
    render(data = []) {
        this.tableBody.innerHTML = '';
        if (data.length === 0) {
            this.#showPlaceholder();
            return;
        }

        // Ограничиваем количество отображаемых строк для производительности
        const dataToShow = data.slice(-50); // последние 50

        dataToShow.forEach(video => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${this.#escapeHtml(video.title || '')}</td>
                <td>${this.#escapeHtml(video.videoId || '')}</td>
                <td>${this.#escapeHtml(video.views || '')}</td>
                <td>${this.#escapeHtml(video.channelName || '')}</td>
                <td>${this.#escapeHtml(video.sourceVideoId || '')}</td>
                <td>
                    ${video.thumbnailUrl ?
                    `<img src="${video.thumbnailUrl}" alt="Thumbnail" onerror="this.parentElement.innerHTML='—'">` :
                    '—'}
                </td>
            `;
            this.tableBody.appendChild(row);
        });
    }

    /**
     * Очищает таблицу и показывает placeholder.
     */
    clear() {
        this.tableBody.innerHTML = '';
        this.#showPlaceholder();
    }

    // --- Вспомогательные методы ---

    /**
     * Показывает placeholder "Таблица пуста".
     * @private
     */
    #showPlaceholder() {
        const placeholderRow = document.createElement('tr');
        placeholderRow.className = 'table-placeholder';
        placeholderRow.innerHTML = `<td colspan="6">Таблица пуста</td>`;
        this.tableBody.appendChild(placeholderRow);
    }

    /**
     * Экранирует HTML-сущности.
     * @param {string} text - Текст для экранирования.
     * @returns {string} - Экранированный текст.
     * @private
     */
    #escapeHtml(text) {
        if (typeof text !== 'string') return '';
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "<")
            .replace(/>/g, ">")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}