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
        const lines = text.split(/\r?\n/);
        if (lines.length === 0) {
            throw new Error('Пустой файл');
        }

        // Определяем разделитель: сначала пробуем ';', затем ','
        let delimiter = ';';
        if (lines[0].includes(',') && !lines[0].includes(';')) {
            delimiter = ',';
        }

        const headers = lines[0].split(delimiter).map(h => h.trim().toLowerCase());

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
            const index = headers.findIndex(h => h === field);
            if (index === -1) {
                console.error("[SettingsSection] Не найдена колонка:", field);
                throw new Error(`Не найдена колонка: ${field}`);
            }
            indices[field] = index;
        });

        const data = [];
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) {
                continue;
            }
            const cells = line.split(delimiter).map(cell => {
                // Убираем окружающие кавычки, если они есть
                let trimmed = cell.trim();
                if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
                    trimmed = trimmed.substring(1, trimmed.length - 1);
                }
                return trimmed;
            });

            if (cells.length < headers.length) {
                console.warn(`[SettingsSection] Недостаточно ячеек в строке ${i}, пропускаем`);
                continue; // Пропускаем строки с недостаточным количеством ячеек
            }

            const item = {};
            required.forEach(field => {
                const index = indices[field];
                item[fieldMap[field]] = cells[index] ? cells[index] : '';
            });
            data.push(item);
        }
        return data;
    }

    dispatchEvent(type, detail) {
        document.dispatchEvent(new CustomEvent(type, { detail }));
    }
}