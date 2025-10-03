export class SettingsSection {
    constructor() {
        this.element = document.getElementById('settingsSection');
        this.toggleBtn = document.getElementById('toggleSettingsBtn');
        this.selectionModeRadios = document.querySelectorAll('input[name="selectionMode"]');
        this.iterationsInput = document.getElementById('iterationsInput');

        this.importFileInput = document.getElementById('importFileInput');
        this.importDataBtn = document.getElementById('importDataBtn');
        this.clearImportedBtn = document.getElementById('clearImportedBtn');

        this.searchQueriesFileInput = document.getElementById('searchQueriesFileInput');
        this.loadSearchQueriesBtn = document.getElementById('loadSearchQueriesBtn');
        this.clearSearchQueriesBtn = document.getElementById('clearSearchQueriesBtn');
        this.searchQueriesStatus = document.getElementById('searchQueriesStatus');

        this.pendingFileContent = null;
        this.pendingFileName = null;

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
        this.importFileInput.addEventListener('change', (event) => this.handleFileSelected(event));
        this.importDataBtn.addEventListener('click', () => this.handleImport());
        this.clearImportedBtn.addEventListener('click', () => this.handleClearImported());
        this.iterationsInput.addEventListener('blur', () => this.saveState());
        this.loadSearchQueriesBtn.addEventListener('click', () => this.searchQueriesFileInput.click());
        this.searchQueriesFileInput.addEventListener('change', (e) => this.handleSearchQueriesFileSelected(e));
        this.clearSearchQueriesBtn.addEventListener('click', () => this.handleClearSearchQueries());
        this.updateSearchQueriesStatus();
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

    // 👇 НОВОЕ: Обработчик выбора файла — читает файл, но НЕ импортирует
    handleFileSelected(event) {
        const file = event.target.files[0];
        if (!file) {
            this.dispatchEvent('log', { message: '❌ Файл не выбран', level: 'error' });
            return;
        }

        // Проверка типа файла
        if (!file.name.endsWith('.csv') && !file.name.endsWith('.tsv') && file.type !== 'text/csv' && file.type !== 'text/tsv') {
            this.dispatchEvent('log', { message: '❌ Неподдерживаемый тип файла. Выберите .csv или .tsv', level: 'error' });
            this.importFileInput.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            this.pendingFileContent = e.target.result;
            this.pendingFileName = file.name;
            this.dispatchEvent('log', { message: `✅ Файл "${file.name}" выбран. Нажмите "Импортировать файл" для начала загрузки.`, level: 'success' });
        };
        reader.onerror = () => {
            this.dispatchEvent('log', { message: `❌ Ошибка чтения файла: ${file.name}`, level: 'error' });
            this.importFileInput.value = '';
        };
        reader.readAsText(file);
    }

    // 👇 ОБНОВЛЕННЫЙ: Импорт начинается ТОЛЬКО по нажатию кнопки
    handleImport() {
        // Просто триггерим событие. Реальную логику выполнит PopupApp.
        this.dispatchEvent('requestImportFromFile');
    }

    // 👇 НОВОЕ: Асинхронный парсер с чанками
    async parseCSVAsync(text, fileName) {
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
        if (lines.length === 0) throw new Error('Пустой файл');

        let delimiter = ';';
        if (lines[0].includes('\t')) delimiter = '\t';
        else if (lines[0].includes(',')) delimiter = ',';

        const headers = this.#parseCsvLine(lines[0], delimiter);
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
            const index = headers.findIndex(h => h.trim().toLowerCase() === field);
            if (index === -1) throw new Error(`Не найдена колонка: ${field}`);
            indices[field] = index;
        });

        const data = [];
        const totalLines = lines.length - 1; // минус заголовок
        let processedLines = 0;

        // 👇 Обрабатываем строки асинхронно, чанками по 5000
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const cells = this.#parseCsvLine(line, delimiter);
            if (cells.length < required.length) continue;

            const item = {};
            required.forEach(field => {
                const index = indices[field];
                item[fieldMap[field]] = cells[index] ? cells[index] : '';
            });
            data.push(item);

            processedLines++;

            // Каждые 5000 строк — делаем паузу и показываем прогресс
            if (processedLines % 5000 === 0) {
                this.dispatchEvent('log', {
                    message: `📊 Обработано ${processedLines} из ${totalLines} строк файла "${fileName}"...`,
                    level: 'info'
                });
                // 👇 Отдаем управление браузеру, чтобы UI не зависал
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        this.dispatchEvent('log', {
            message: `✅ Парсинг файла "${fileName}" завершен. Обработано ${processedLines} строк.`,
            level: 'success'
        });

        return data;
    }

    // 👇 Существующий метод парсинга одной строки (без изменений)
    #parseCsvLine(line, delimiter) {
        const values = [];
        let currentValue = '';
        let insideQuotes = false;
        let i = 0;
        while (i < line.length) {
            const char = line[i];
            if (char === '"') {
                if (insideQuotes && i + 1 < line.length && line[i + 1] === '"') {
                    currentValue += '"';
                    i += 2;
                } else {
                    insideQuotes = !insideQuotes;
                    i++;
                }
            } else if (char === delimiter && !insideQuotes) {
                values.push(currentValue.trim());
                currentValue = '';
                i++;
            } else {
                currentValue += char;
                i++;
            }
        }
        values.push(currentValue.trim());
        return values;
    }

    async handleClearImported() {
        console.log("[SettingsSection] Начало handleClearImported");
        this.dispatchEvent('log', { message: '📤 Отправка команды на очистку импортированных данных...', level: 'info' });
        try {
            const response = await chrome.runtime.sendMessage({
                action: "clearImportedTableData"
            });
            if (response && response.status === "success") {
                console.log("[SettingsSection] Импортированные данные успешно очищены в background");
                this.dispatchEvent('log', { message: '✅ Импортированные данные очищены', level: 'success' });
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

    dispatchEvent(type, detail) {
        document.dispatchEvent(new CustomEvent(type, { detail }));
    }

    async handleSearchQueriesFileSelected(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const text = e.target.result;
                // Разделяем по ; и очищаем
                const queries = text
                    .split(';')
                    .map(q => q.trim())
                    .filter(q => q.length > 0);

                if (queries.length === 0) {
                    this.dispatchEvent('log', { message: '❌ Файл не содержит валидных запросов.', level: 'error' });
                    return;
                }

                await chrome.storage.local.set({ searchQueries: queries });
                this.updateSearchQueriesStatus(queries);
                this.dispatchEvent('log', { message: `✅ Загружено ${queries.length} поисковых запросов.`, level: 'success' });
            } catch (err) {
                this.dispatchEvent('log', { message: `❌ Ошибка загрузки запросов: ${err.message}`, level: 'error' });
            }
        };
        reader.readAsText(file);
        event.target.value = ''; // сброс
    }

    async handleClearSearchQueries() {
        await chrome.storage.local.set({ searchQueries: [] });
        this.updateSearchQueriesStatus([]);
        this.dispatchEvent('log', { message: '🗑️ Список поисковых запросов очищен.', level: 'info' });
    }

    async updateSearchQueriesStatus(queries = null) {
        if (!queries) {
            const res = await chrome.storage.local.get(['searchQueries']);
            queries = res.searchQueries || [];
        }
        if (queries.length > 0) {
            this.searchQueriesStatus.textContent = `Загружено запросов: ${queries.length}`;
        } else {
            this.searchQueriesStatus.textContent = 'Список запросов пуст.';
        }
    }
}