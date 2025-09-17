export class SettingsSection {
    constructor() {
        this.element = document.getElementById('settingsSection');
        this.toggleBtn = document.getElementById('toggleSettingsBtn');
        this.selectionModeRadios = document.querySelectorAll('input[name="selectionMode"]');
        this.iterationsInput = document.getElementById('iterationsInput');
        this.importTextarea = document.getElementById('importTextarea');
        this.importDataBtn = document.getElementById('importDataBtn');
        this.clearImportedBtn = document.getElementById('clearImportedBtn');

        this.init();
    }

    init() {
        // Восстанавливаем состояние из localStorage
        this.restoreState();

        // Обработчики
        this.toggleBtn.addEventListener('click', () => this.toggle());
        this.selectionModeRadios.forEach(radio => {
            radio.addEventListener('change', () => this.saveState());
        });
        this.iterationsInput.addEventListener('change', () => this.saveState());
        this.importDataBtn.addEventListener('click', () => this.handleImport());
        this.clearImportedBtn.addEventListener('click', () => this.handleClearImported());

        // Сохраняем при потере фокуса
        this.iterationsInput.addEventListener('blur', () => this.saveState());
    }

    toggle() {
        const isCollapsed = this.element.classList.contains('collapsed');
        if (isCollapsed) {
            this.expand();
        } else {
            this.collapse();
        }
        this.saveState();
    }

    collapse() {
        this.element.classList.add('collapsed');
        this.toggleBtn.textContent = '🔽';
    }

    expand() {
        this.element.classList.remove('collapsed');
        this.toggleBtn.textContent = '▲';
    }

    saveState() {
        const state = {
            isCollapsed: this.element.classList.contains('collapsed'),
            selectionMode: document.querySelector('input[name="selectionMode"]:checked')?.value || 'smart',
            iterations: this.iterationsInput.value,
        };
        localStorage.setItem('settingsState', JSON.stringify(state));
    }

    restoreState() {
        const saved = localStorage.getItem('settingsState');
        if (saved) {
            const state = JSON.parse(saved);
            if (state.isCollapsed) {
                this.collapse();
            } else {
                this.expand();
            }
            if (state.selectionMode) {
                const radio = document.querySelector(`input[name="selectionMode"][value="${state.selectionMode}"]`);
                if (radio) radio.checked = true;
            }
            if (state.iterations) {
                this.iterationsInput.value = state.iterations;
            }
        }
    }

    handleImport() {
        const text = this.importTextarea.value.trim();

        if (!text) {
            this.dispatchEvent('log', { message: '❌ Нет данных для импорта', level: 'error' });
            return;
        }

        try {
            const data = this.parseCSV(text);

            if (data.length === 0) {
                this.dispatchEvent('log', { message: '❌ Нет данных для импорта после парсинга', level: 'error' });
                return;
            }

            const dataWithFlag = data.map((item, index) => {
                const newItem = {
                    ...item,
                    isImported: true, // Добавляем флаг
                    timestamp: item.timestamp || Date.now() // Убеждаемся, что timestamp есть
                };
                return newItem;
            });

            this.dispatchEvent('importData', { data: dataWithFlag }); // ВАЖНО: ключ 'data'
            this.importTextarea.value = '';
            this.dispatchEvent('log', { message: `✅ Импортировано ${dataWithFlag.length} записей`, level: 'success' });
        } catch (err) {
            console.error("[SettingsSection] Ошибка импорта:", err);
            this.dispatchEvent('log', { message: `❌ Ошибка импорта: ${err.message}`, level: 'error' });
        }
    }

    async handleClearImported() {
        console.log("[SettingsSection] Начало handleClearImported");
        this.dispatchEvent('log', { message: '📤 Отправка команды на очистку импортированных данных...', level: 'info' });

        try {
            // Отправляем сообщение в background
            const response = await chrome.runtime.sendMessage({
                action: "clearImportedTableData"
            });

            if (response && response.status === "success") {
                console.log("[SettingsSection] Импортированные данные успешно очищены в background");
                this.dispatchEvent('log', { message: '✅ Импортированные данные очищены', level: 'success' });
                // Опционально: можно отправить событие, если другим компонентам нужно знать
                // this.dispatchEvent('importedDataCleared');
            } else {
                const errorMsg = response?.message || 'Неизвестная ошибка';
                console.error("[SettingsSection] Ошибка очистки в background:", errorMsg);
                this.dispatchEvent('log', { message: `❌ Ошибка очистки: ${errorMsg}`, level: 'error' });
            }
        } catch (err) {
            console.error("[SettingsSection] Ошибка отправки команды в background:", err);
            this.dispatchEvent('log', { message: `❌ Ошибка связи: ${err.message}`, level: 'error' });
        }
    }

    parseCSV(text) {
        console.log("[SettingsSection] Начало parseCSV");
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== ''); // Убираем пустые строки
        console.log("[SettingsSection] Всего строк после фильтрации пустых:", lines.length);
        if (lines.length === 0) {
            console.log("[SettingsSection] Файл пуст");
            throw new Error('Пустой файл');
        }

        // Определяем разделитель: сначала пробуем '\t', затем ';'
        let delimiter = ';';
        const firstLine = lines[0];
        if (firstLine.includes('\t')) {
            delimiter = '\t';
        } else if (firstLine.includes(',')) {
            delimiter = ','; // Добавляем поддержку запятой, если другие разделители не найдены
        }
        console.log("[SettingsSection] Определён разделитель:", delimiter === '\t' ? '\\t' : delimiter);

        const headersLine = lines[0];
        console.log("[SettingsSection] Строка заголовков:", headersLine);

        // --- НОВОЕ: Парсинг заголовков с учётом кавычек ---
        const headers = this.#parseCsvLine(headersLine, delimiter);
        console.log("[SettingsSection] Распарсенные заголовки:", headers);

        // Определяем необходимые поля и их индексы
        const required = ['название', 'id', 'просмотры', 'канал', 'исходное видео', 'миниатюра'];
        const fieldMap = {
            'название': 'title',
            'id': 'videoId',
            'просмотры': 'views',
            'канал': 'channelName',
            'исходное видео': 'sourceVideoId',
            'миниатюра': 'thumbnailUrl'
        };

        const indices = {};
        required.forEach(field => {
            // Ищем заголовок, игнорируя регистр и окружающие пробелы
            const index = headers.findIndex(h => h.trim().toLowerCase() === field);
            if (index === -1) {
                console.error("[SettingsSection] Не найдена колонка:", field);
                throw new Error(`Не найдена колонка: ${field}`);
            }
            indices[field] = index;
            console.log(`[SettingsSection] Индекс для '${field}':`, index);
        });

        const data = [];
        // Обрабатываем строки данных (начиная со второй строки)
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) {
                console.log(`[SettingsSection] Пропущена пустая строка ${i}`);
                continue;
            }
            console.log(`[SettingsSection] Обработка строки ${i}:`, line);

            // --- НОВОЕ: Парсинг строки данных с учётом кавычек ---
            const cells = this.#parseCsvLine(line, delimiter);
            console.log(`[SettingsSection] Распарсенные ячейки строки ${i}:`, cells);

            if (cells.length < required.length) {
                console.warn(`[SettingsSection] Недостаточно ячеек в строке ${i} (ожидается ${required.length}, получено ${cells.length}), пропускаем`);
                continue; // Пропускаем строки с недостаточным количеством ячеек
            }

            const item = {};
            required.forEach(field => {
                const index = indices[field];
                // --- НОВОЕ: trim() и удаление кавычек происходит внутри #parseCsvLine ---
                item[fieldMap[field]] = cells[index] ? cells[index] : '';
            });
            data.push(item);
            console.log(`[SettingsSection] Добавлена запись из строки ${i}:`, item);
        }
        console.log("[SettingsSection] Парсинг CSV завершён. Всего записей:", data.length);
        return data;
    }

    /**
     * Вспомогательный метод для парсинга одной строки CSV/TSV с учётом кавычек.
     * @param {string} line - Строка для парсинга.
     * @param {string} delimiter - Разделитель.
     * @returns {string[]} Массив значений ячеек.
     * @private
     */
    #parseCsvLine(line, delimiter) {
        const values = [];
        let currentValue = '';
        let insideQuotes = false;
        let i = 0;

        while (i < line.length) {
            const char = line[i];

            if (char === '"') {
                if (insideQuotes && i + 1 < line.length && line[i + 1] === '"') {
                    // Двойная кавычка внутри кавычек -> это экранированная кавычка
                    currentValue += '"';
                    i += 2; // Пропускаем обе кавычки
                } else {
                    // Открывающая или закрывающая кавычка
                    insideQuotes = !insideQuotes;
                    i++; // Пропускаем кавычку
                }
            } else if (char === delimiter && !insideQuotes) {
                // Разделитель вне кавычек -> конец значения
                values.push(currentValue.trim());
                currentValue = '';
                i++;
            } else {
                // Обычный символ
                currentValue += char;
                i++;
            }
        }

        // Добавляем последнее значение
        values.push(currentValue.trim());

        return values;
    }

    dispatchEvent(type, detail) {
        document.dispatchEvent(new CustomEvent(type, { detail }));
    }
}