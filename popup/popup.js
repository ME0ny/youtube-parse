
// popup/popup.js
import { SettingsSection } from './components/SettingsSection.js';
import { ControlSection } from './components/ControlSection.js';
import { LogSection } from './components/LogSection.js';
import { TableSection } from './components/TableSection.js';

class PopupApp {
    constructor() {
        this.initElements();
        this.initComponents(); // Инициализируем компоненты и загружаем начальные данные
        this.bindEvents(); // Привязываем события popup-контроллера
        this.loadState(); // Загружаем сохранённое состояние UI
        this.updateScenarioControlButtons(false);
        this.checkScenarioStatusOnLoad();
        this.isScenarioLaunchInProgress = false;
    }

    initElements() {
        // Инициализируем ссылки на DOM элементы, принадлежащие popup напрямую
        this.settingsSection = document.getElementById('settingsSection');
        this.settingsContent = document.getElementById('settingsContent');
        this.toggleSettingsBtn = document.getElementById('toggleSettingsBtn');

        this.selectionModeRadios = document.querySelectorAll('input[name="selectionMode"]');
        this.iterationsInput = document.getElementById('iterationsInput');
        this.importTextarea = document.getElementById('importTextarea');
        this.importDataBtn = document.getElementById('importDataBtn');
        this.clearImportedBtn = document.getElementById('clearImportedBtn');

        this.runScenarioBtn = document.getElementById('runScenarioBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.copyTableBtn = document.getElementById('copyTableBtn');
        this.clearTableBtn = document.getElementById('clearTableBtn');
        this.clearLogBtn = document.getElementById('clearLogBtn');

        // Элемент для нового функционала

        this.scenarioSelector = document.getElementById('scenarioSelector');

        document.addEventListener('importData', (e) => {
            this.handleImportData(e.detail); // Передаём detail как аргумент
        });
    }

    initComponents() {
        // Создаём экземпляры компонентов. Они сами привяжут свои обработчики и DOM.
        this.settings = new SettingsSection();
        this.control = new ControlSection();
        this.logs = new LogSection();
        this.table = new TableSection();

        // Инициируем загрузку начальных данных для компонентов
        // Это заменяет старые updateLogs и updateTable
        this.logs.loadInitialLogs();
        this.table.loadInitialData();
    }

    bindEvents() {
        // --- Обработчики UI popup-а ---
        this.selectionModeRadios.forEach(radio => {
            radio.addEventListener('change', () => this.saveSettings());
        });
        this.iterationsInput.addEventListener('change', () => this.saveSettings());
        this.importDataBtn.addEventListener('click', () => this.handleImport());
        this.clearImportedBtn.addEventListener('click', () => this.handleClearImported());

        this.runScenarioBtn.addEventListener('click', () => this.handleRunScenario());
        this.stopBtn.addEventListener('click', () => this.handleStop());
        this.copyTableBtn.addEventListener('click', () => this.handleCopyTable());
        this.clearTableBtn.addEventListener('click', () => this.handleClearTable());
        this.clearLogBtn.addEventListener('click', () => this.handleClearLog());

        this.runScenarioBtn.addEventListener('click', () => this.handleRunScenario());

        document.addEventListener('requestImportFromFile', () => this.handleImportFromFile());

        // --- Слушатель сообщений от background ---
        this.addMessageListener();
    }

    saveSettings() {
        // Определяем состояние для сохранения
        const isSettingsCollapsed = this.settingsSection.classList.contains('collapsed');

        const state = {
            isSettingsCollapsed: isSettingsCollapsed,
            selectionMode: document.querySelector('input[name="selectionMode"]:checked')?.value || 'smart',
            iterations: this.iterationsInput.value,
        };


        try {
            localStorage.setItem('popupSettings', JSON.stringify(state));
        } catch (e) {
            console.error("saveSettings: Ошибка при сохранении в localStorage:", e);
        }
    }

    loadState() {

        const savedStateJson = localStorage.getItem('popupSettings');
        if (savedStateJson) {
            try {
                const state = JSON.parse(savedStateJson);
                if (state.isSettingsCollapsed === true) {
                    this.settingsSection.classList.add('collapsed');
                    this.toggleSettingsBtn.textContent = '🔽';
                } else {
                    this.settingsSection.classList.remove('collapsed');
                    this.toggleSettingsBtn.textContent = '▲';
                }

                // Применяем другие настройки (если есть)
                if (state.selectionMode) {
                    const radio = document.querySelector(`input[name="selectionMode"][value="${state.selectionMode}"]`);
                    if (radio) {
                        radio.checked = true;
                    }
                }

                if (state.iterations) {
                    this.iterationsInput.value = state.iterations;
                }
            } catch (e) {
                console.error("loadState: Ошибка при парсинге сохранённого состояния:", e);
                // В случае ошибки парсинга, используем значения по умолчанию
                // и пересохраняем их
            }
        } else {
            this.settingsSection.classList.remove('collapsed'); // По умолчанию развернуто
            this.toggleSettingsBtn.textContent = '▲';
            // Другие значения по умолчанию уже заданы в HTML
        }
    }

    // --- Message Listener ---
    addMessageListener() {
        this.messageListener = (request, sender, sendResponse) => {
            if (request.type === 'scenarioStatus') {
                console.log("PopupApp: Received scenarioStatus message", request);
                if (request.status === 'started') {
                    this.updateScenarioControlButtons(true);
                } else if (request.status === 'stopped' || request.status === 'finished') {
                    console.log("PopupApp: Updating buttons to STOPPED state based on scenarioStatus"); // <-- Лог
                    this.updateScenarioControlButtons(false);
                }
                // Логируем сообщение от сценария, если оно есть
                if (request.message) {
                    document.dispatchEvent(new CustomEvent('log', { detail: { message: request.message, level: request.level || 'info' } }));
                }
                return;
            }

            if (request.type === 'dataUpdated') {
                this.table.loadInitialData();
            }

            if (request.type === 'dataCleared') {
                document.dispatchEvent(new CustomEvent('clearTable'));
            }

            if (request.type === 'newLog' && request.log) {
                document.dispatchEvent(new CustomEvent('log', { detail: request.log }));
            }

            if (request.type === 'logsCleared') {
                document.dispatchEvent(new CustomEvent('clearLog'));
            }

            if (request.type === 'dataCleared') {
                document.dispatchEvent(new CustomEvent('clearTable'));
            }

            // TODO: Добавить обработчики для других сообщений
            // if (request.type === 'analysisStatus') { ... }
            // if (request.type === 'dataUpdated') { 
            //    document.dispatchEvent(new CustomEvent('updateTable', { detail: newDataArray }));
            // }
        };

        chrome.runtime.onMessage.addListener(this.messageListener);
    }

    // --- Button Handlers (имитация / заглушки) ---
    // Эти обработчики теперь используют CustomEvent для взаимодействия с компонентами
    // или напрямую вызывают chrome.runtime.sendMessage

    handleImport() {
        const text = this.importTextarea.value.trim();
        if (!text) {
            document.dispatchEvent(new CustomEvent('log', { detail: { message: '❌ Нет данных для импорта', level: 'error' } }));
            return;
        }
        document.dispatchEvent(new CustomEvent('log', { detail: { message: `✅ Импорт данных (имитация): ${text.split('\n').length - 1} строк`, level: 'success' } }));
        this.importTextarea.value = '';
        // В реальном сценарии здесь будет sendMessage для импорта в background
        // и затем событие обновления таблицы
        setTimeout(() => {
            this.table.loadInitialData(); // Имитация обновления таблицы
        }, 500);
    }

    handleClearImported() {
        document.dispatchEvent(new CustomEvent('log', { detail: { message: '✅ Импортированные данные очищены (имитация)', level: 'success' } }));
        // В реальном сценарии здесь будет sendMessage для очистки в background
    }

    async handleRunScenario() {
        if (this.isScenarioLaunchInProgress) {
            console.warn("[PopupApp] Запуск сценария уже выполняется, игнорируем клик.");
            return;
        }
        this.isScenarioLaunchInProgress = true; // <-- Установить флаг
        // 1. Получаем ID выбранного сценария
        const selectedScenarioId = this.scenarioSelector.value;
        if (!selectedScenarioId) {
            document.dispatchEvent(new CustomEvent('log', { detail: { message: '❌ Не выбран сценарий для запуска', level: 'error' } }));
            return;
        }

        // 2. Получаем параметры из UI
        const iterations = parseInt(this.iterationsInput.value) || 10;
        const mode = document.querySelector('input[name="selectionMode"]:checked')?.value || 'all_videos';

        // 3. Логируем начало
        const scenarioName = this.scenarioSelector.options[this.scenarioSelector.selectedIndex].text;
        document.dispatchEvent(new CustomEvent('log', { detail: { message: `📤 Запуск сценария "${scenarioName}": ${iterations} итераций, режим: ${mode}`, level: 'info' } }));

        try {
            // 4. Отправляем сообщение в background с параметрами
            const response = await chrome.runtime.sendMessage({
                action: "runScenario",
                scenarioId: selectedScenarioId,
                params: {
                    iterations,
                    mode,
                    // Параметры для скроллинга (можно сделать настройками позже)
                    count: 16,
                    delayMs: 1500,
                    step: 1000
                }
            });

            if (response && response.status === "started") {
                console.log("[PopupApp] Сценарий успешно запущен в background, обновляем состояние кнопок.");
                // 5. Обновляем состояние кнопок
                this.updateScenarioControlButtons(true);
                document.dispatchEvent(new CustomEvent('log', { detail: { message: `✅ Сценарий запущен. ID: ${response.instanceId}`, level: 'success' } }));
            } else {
                const errorMsg = response?.message || 'Неизвестная ошибка при запуске';
                console.error("[PopupApp] Ошибка запуска сценария:", errorMsg);
                document.dispatchEvent(new CustomEvent('log', { detail: { message: `❌ Ошибка запуска сценария: ${errorMsg}`, level: 'error' } }));
                // Возвращаем кнопки в исходное состояние в случае ошибки
                this.updateScenarioControlButtons(false);
            }

        } catch (err) {
            console.error("[PopupApp] Исключение при запуске сценария:", err);
            document.dispatchEvent(new CustomEvent('log', { detail: { message: `❌ Ошибка связи при запуске сценария: ${err.message}`, level: 'error' } }));
            // Возвращаем кнопки в исходное состояние в случае ошибки
            this.isScenarioLaunchInProgress = false;
            this.updateScenarioControlButtons(false);
        } finally {
            // Сбросить флаг в любом случае, после попытки запуска
            console.log("[PopupApp] Finally блок handleRunScenario: сброс флага isScenarioLaunchInProgress.");
            this.isScenarioLaunchInProgress = false; // <-- Сбросить флаг
            this.updateScenarioControlButtons(false);
        }
    }

    async handleStop() {
        document.dispatchEvent(new CustomEvent('log', { detail: { message: '📤 Отправка команды на остановку всех сценариев...', level: 'info' } }));

        try {
            // Отправляем сообщение в background для остановки всех сценариев
            const response = await chrome.runtime.sendMessage({
                action: "stopAllScenarios"
            });

            if (response && response.status === "success") {
                document.dispatchEvent(new CustomEvent('log', { detail: { message: `✅ ${response.message}`, level: 'warn' } }));
                // Обновляем состояние кнопок
                this.updateScenarioControlButtons(false);
            } else {
                const errorMsg = response?.message || 'Неизвестная ошибка при остановке';
                console.error("[PopupApp] Ошибка остановки сценариев:", errorMsg);
                document.dispatchEvent(new CustomEvent('log', { detail: { message: `❌ Ошибка остановки сценариев: ${errorMsg}`, level: 'error' } }));
                // Оставляем кнопки в состоянии "запущено", так как остановка не удалась
            }
        } catch (err) {
            console.error("[PopupApp] Исключение при остановке сценариев:", err);
            document.dispatchEvent(new CustomEvent('log', { detail: { message: `❌ Ошибка связи при остановке сценариев: ${err.message}`, level: 'error' } }));
            // Оставляем кнопки в состоянии "запущено", так как остановка не удалась
        }
    }

    async handleCopyTable() {
        document.dispatchEvent(new CustomEvent('log', { detail: { message: '📤 Подготовка таблицы для копирования (CSV с ";")...', level: 'info' } }));

        try {
            // 1. Отправляем сообщение в background для получения данных
            const response = await chrome.runtime.sendMessage({ action: "copyTableDataAsCSV" }); // Новое сообщение

            if (response && response.status === "success") {
                // 2. Получаем данные в формате CSV из ответа
                const csvContent = response.data; // Ожидаем, что данные уже в нужном формате

                // 3. Копируем в буфер обмена
                await navigator.clipboard.writeText(csvContent);

                const lines = csvContent.split('\n').filter(line => line.trim() !== '').length;
                const dataLines = lines > 1 ? lines - 1 : 0; // Вычитаем заголовок

                document.dispatchEvent(new CustomEvent('log', { detail: { message: `✅ Таблица скопирована в буфер обмена (${dataLines} строк)`, level: 'success' } }));
            } else {
                const errorMsg = response?.message || 'Неизвестная ошибка';
                throw new Error(errorMsg);
            }
        } catch (err) {
            console.error("[PopupApp] Ошибка копирования таблицы:", err);
            document.dispatchEvent(new CustomEvent('log', { detail: { message: `❌ Ошибка копирования таблицы: ${err.message}`, level: 'error' } }));
        }
    }

    async handleClearTable() {
        document.dispatchEvent(new CustomEvent('log', { detail: { message: '📤 Отправка команды на очистку таблицы...', level: 'info' } }));
        try {
            const response = await chrome.runtime.sendMessage({ action: "clearTableData" });
            if (response.status === "success") {
                document.dispatchEvent(new CustomEvent('log', { detail: { message: '✅ Таблица очищена', level: 'success' } }));
                // Сообщаем TableSection об очистке
                document.dispatchEvent(new CustomEvent('clearTable'));
            } else {
                throw new Error(response.message);
            }
        } catch (err) {
            document.dispatchEvent(new CustomEvent('log', { detail: { message: `❌ Ошибка очистки таблицы: ${err.message}`, level: 'error' } }));
        }
    }

    async handleClearLog() {
        // В реальном сценарии popup отправляет сообщение в background для очистки
        // и background потом прислает 'logsCleared' или popup сам обновит UI
        try {
            await chrome.storage.local.remove(['appLogs']);
            document.dispatchEvent(new CustomEvent('log', { detail: { message: '✅ Журнал очищен', level: 'success' } }));
            // Сообщаем компоненту журнала об очистке
            document.dispatchEvent(new CustomEvent('clearLog'));
        } catch (err) {
            document.dispatchEvent(new CustomEvent('log', { detail: { message: `❌ Ошибка очистки журнала: ${err.message}`, level: 'error' } }));
        }
    }

    async handleImportData(eventDetail) {
        const dataToImport = eventDetail && eventDetail.data;

        if (!dataToImport || !Array.isArray(dataToImport)) {
            console.error("[PopupApp] handleImportData: данные отсутствуют или не являются массивом", dataToImport);
            document.dispatchEvent(new CustomEvent('log', { detail: { message: '❌ Ошибка: Некорректные данные для импорта', level: 'error' } }));
            return;
        }

        document.dispatchEvent(new CustomEvent('log', { detail: { message: `📤 Отправка ${dataToImport.length} записей для импорта...`, level: 'info' } }));

        try {
            // Отправляем данные в background для сохранения
            const response = await chrome.runtime.sendMessage({
                action: "importTableData", // Новое сообщение для обработки импорта
                data: dataToImport // Отправляем массив напрямую
            });

            if (response && response.status === "success") {
                document.dispatchEvent(new CustomEvent('log', { detail: { message: `✅ ${response.count} записей успешно импортированы`, level: 'success' } }));
                // Принудительно обновляем таблицу в popup
                this.table.loadInitialData();
            } else {
                const errorMsg = response?.message || 'Неизвестная ошибка';
                console.error("[PopupApp] Ошибка импорта в background:", errorMsg);
                document.dispatchEvent(new CustomEvent('log', { detail: { message: `❌ Ошибка импорта: ${errorMsg}`, level: 'error' } }));
            }
        } catch (err) {
            console.error("[PopupApp] Ошибка отправки данных в background:", err);
            document.dispatchEvent(new CustomEvent('log', { detail: { message: `❌ Ошибка связи с background: ${err.message}`, level: 'error' } }));
        }
    }

    /**
     * Обновляет состояние кнопок управления сценариями.
     * @param {boolean} isRunning - Запущен ли сейчас какой-либо сценарий.
     */
    updateScenarioControlButtons(isRunning) {
        if (this.runScenarioBtn && this.stopBtn) {
            this.runScenarioBtn.disabled = isRunning;
            this.stopBtn.disabled = !isRunning;
        }
    }

    /**
     * Проверяет статус выполнения сценариев при загрузке popup.
     * Обновляет состояние кнопок управления соответственно.
     */
    async checkScenarioStatusOnLoad() {
        console.log("[PopupApp] Проверка статуса сценариев при загрузке...");
        try {
            const response = await chrome.runtime.sendMessage({
                action: "getScenarioStatus"
            });

            if (response && response.status === "success") {
                const isRunning = response.isRunning;
                console.log(`[PopupApp] Статус сценариев при загрузке: isRunning=${isRunning}`);
                this.updateScenarioControlButtons(isRunning);

                // Опционально: можно отобразить уведомление, если сценарии выполняются
                if (isRunning) {
                    const count = response.runningScenarios?.length || 1;
                    document.dispatchEvent(new CustomEvent('log', {
                        detail: {
                            message: `ℹ️ При загрузке popup обнаружено запущенных сценариев: ${count}. Кнопка "Остановить" активна.`,
                            level: 'info'
                        }
                    }));
                }
            } else {
                console.warn("[PopupApp] Не удалось получить статус сценариев при загрузке:", response?.message);
                // В случае ошибки оставляем кнопки в начальном состоянии (не запущено)
                this.updateScenarioControlButtons(false);
            }
        } catch (err) {
            console.error("[PopupApp] Ошибка при проверке статуса сценариев при загрузке:", err);
            // В случае ошибки оставляем кнопки в начальном состоянии (не запущено)
            this.updateScenarioControlButtons(false);
        }
    }

    async handleImportFromFile() {
        // 1. Получаем ссылку на input
        const fileInput = document.getElementById('importFileInput');
        const file = fileInput?.files[0];

        if (!file) {
            document.dispatchEvent(new CustomEvent('log', { detail: { message: '❌ Файл не выбран', level: 'error' } }));
            return;
        }

        // 2. Проверка типа файла
        if (!file.name.endsWith('.csv') && !file.name.endsWith('.tsv')) {
            document.dispatchEvent(new CustomEvent('log', { detail: { message: '❌ Неподдерживаемый тип файла. Выберите .csv или .tsv', level: 'error' } }));
            fileInput.value = '';
            return;
        }

        // 3. Читаем файл
        try {
            document.dispatchEvent(new CustomEvent('log', { detail: { message: `🔄 Чтение файла "${file.name}"...`, level: 'info' } }));
            const text = await this.#readFileAsync(file);
            document.dispatchEvent(new CustomEvent('log', { detail: { message: `✅ Файл "${file.name}" прочитан. Начинаем парсинг...`, level: 'success' } }));

            // 4. Парсим CSV/TSV
            const data = this.#parseCSV(text);
            if (data.length === 0) {
                document.dispatchEvent(new CustomEvent('log', { detail: { message: '❌ Нет данных для импорта после парсинга', level: 'error' } }));
                fileInput.value = '';
                return;
            }

            // 5. Добавляем флаг isImported
            const dataWithFlag = data.map(item => ({
                ...item,
                isImported: true,
                timestamp: item.timestamp || Date.now()
            }));

            document.dispatchEvent(new CustomEvent('log', { detail: { message: `📊 Подготовлено ${dataWithFlag.length} записей для импорта.`, level: 'info' } }));

            // 6. 👇 ОТПРАВКА ДАННЫХ ЧАНКАМИ В BACKGROUND
            await this.#importDataInChunks(dataWithFlag, file.name);

            // 7. Очищаем input и обновляем таблицу
            fileInput.value = '';
            this.table.loadInitialData();

        } catch (err) {
            console.error("[PopupApp] Ошибка импорта файла:", err);
            document.dispatchEvent(new CustomEvent('log', { detail: { message: `❌ Ошибка импорта: ${err.message}`, level: 'error' } }));
        }
    }

    // 👇 ВСПОМОГАТЕЛЬНЫЙ МЕТОД: Асинхронное чтение файла
    #readFileAsync(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error(`Ошибка чтения файла: ${e.target.error.message}`));
            reader.readAsText(file);
        });
    }

    // 👇 ВСПОМОГАТЕЛЬНЫЙ МЕТОД: Парсинг CSV (скопирован из SettingsSection.js)
    #parseCSV(text) {
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
        }
        return data;
    }

    // 👇 ВСПОМОГАТЕЛЬНЫЙ МЕТОД: Парсинг одной строки CSV
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

    // 👇 ГЛАВНЫЙ МЕТОД: Импорт данных чанками
    async #importDataInChunks(data, fileName) {
        const CHUNK_SIZE = 5000; // Размер чанка. Можно настроить.
        const totalChunks = Math.ceil(data.length / CHUNK_SIZE);

        document.dispatchEvent(new CustomEvent('log', { detail: { message: `📤 Отправка данных чанками по ${CHUNK_SIZE} записей...`, level: 'info' } }));

        for (let i = 0; i < totalChunks; i++) {
            const start = i * CHUNK_SIZE;
            const end = start + CHUNK_SIZE;
            const chunk = data.slice(start, end);

            try {
                const response = await chrome.runtime.sendMessage({
                    action: "importTableDataChunk",
                    data: chunk,
                    isLastChunk: (i === totalChunks - 1),
                    fileName: fileName,
                    chunkIndex: i + 1,
                    totalChunks: totalChunks
                });

                if (response?.status === "success") {
                    document.dispatchEvent(new CustomEvent('log', { detail: { message: `✅ Чанк ${i + 1}/${totalChunks} успешно импортирован.`, level: 'success' } }));
                } else {
                    throw new Error(response?.message || 'Неизвестная ошибка');
                }
            } catch (err) {
                console.error(`[PopupApp] Ошибка импорта чанка ${i + 1}:`, err);
                document.dispatchEvent(new CustomEvent('log', { detail: { message: `❌ Ошибка импорта чанка ${i + 1}/${totalChunks}: ${err.message}`, level: 'error' } }));
                // Прерываем импорт при ошибке
                return;
            }
        }

        document.dispatchEvent(new CustomEvent('log', { detail: { message: `🎉 Импорт файла "${fileName}" успешно завершен!`, level: 'success' } }));
    }
}

// Запускаем приложение
document.addEventListener('DOMContentLoaded', () => {
    new PopupApp();
});
