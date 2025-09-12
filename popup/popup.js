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

        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.copyTableBtn = document.getElementById('copyTableBtn');
        this.clearTableBtn = document.getElementById('clearTableBtn');
        this.clearLogBtn = document.getElementById('clearLogBtn');

        // Элемент для нового функционала
        this.runTestScenarioBtn = document.getElementById('runTestScenarioBtn');
        if (!this.runTestScenarioBtn) {
            console.error("Кнопка 'runTestScenarioBtn' не найдена в DOM");
        }
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

        this.startBtn.addEventListener('click', () => this.handleStart());
        this.stopBtn.addEventListener('click', () => this.handleStop());
        this.copyTableBtn.addEventListener('click', () => this.handleCopyTable());
        this.clearTableBtn.addEventListener('click', () => this.handleClearTable());
        this.clearLogBtn.addEventListener('click', () => this.handleClearLog());

        // Обработчик для новой кнопки
        if (this.runTestScenarioBtn) {
            this.runTestScenarioBtn.addEventListener('click', () => this.handleRunTestScenario());
        }

        // --- Слушатель сообщений от background ---
        this.addMessageListener();
    }

    // --- State Management ---
    saveSettings() {
        console.log("saveSettings: Начало выполнения");

        // Определяем состояние для сохранения
        const isSettingsCollapsed = this.settingsSection.classList.contains('collapsed');
        console.log("saveSettings: Определяем isSettingsCollapsed:", isSettingsCollapsed);

        const state = {
            isSettingsCollapsed: isSettingsCollapsed,
            selectionMode: document.querySelector('input[name="selectionMode"]:checked')?.value || 'smart',
            iterations: this.iterationsInput.value,
        };

        console.log("saveSettings: Подготовленный объект state для сохранения:", state);

        try {
            localStorage.setItem('popupSettings', JSON.stringify(state));
            console.log("saveSettings: Состояние успешно сохранено в localStorage");
        } catch (e) {
            console.error("saveSettings: Ошибка при сохранении в localStorage:", e);
        }
    }

    loadState() {
        console.log("loadState: Начало выполнения");

        const savedStateJson = localStorage.getItem('popupSettings');
        console.log("loadState: Полученные данные из localStorage:", savedStateJson);

        if (savedStateJson) {
            try {
                const state = JSON.parse(savedStateJson);
                console.log("loadState: Распарсенный объект state:", state);

                // Применяем состояние сворачивания
                if (state.isSettingsCollapsed === true) {
                    console.log("loadState: Применяем состояние 'collapsed'");
                    this.settingsSection.classList.add('collapsed');
                    this.toggleSettingsBtn.textContent = '🔽';
                } else {
                    // Если false или undefined, секция развернута
                    console.log("loadState: Применяем состояние 'развёрнута' (удаляем 'collapsed')");
                    this.settingsSection.classList.remove('collapsed');
                    this.toggleSettingsBtn.textContent = '▲';
                }

                // Применяем другие настройки (если есть)
                if (state.selectionMode) {
                    const radio = document.querySelector(`input[name="selectionMode"][value="${state.selectionMode}"]`);
                    if (radio) {
                        radio.checked = true;
                        console.log("loadState: Установлен режим выбора:", state.selectionMode);
                    }
                }

                if (state.iterations) {
                    this.iterationsInput.value = state.iterations;
                    console.log("loadState: Установлено количество итераций:", state.iterations);
                }

                console.log("loadState: Завершено успешно");
            } catch (e) {
                console.error("loadState: Ошибка при парсинге сохранённого состояния:", e);
                // В случае ошибки парсинга, используем значения по умолчанию
                // и пересохраняем их
            }
        } else {
            console.log("loadState: Нет сохранённых данных, используются значения по умолчанию");
            // Убедимся, что значения по умолчанию установлены корректно
            this.settingsSection.classList.remove('collapsed'); // По умолчанию развернуто
            this.toggleSettingsBtn.textContent = '▲';
            // Другие значения по умолчанию уже заданы в HTML
        }
    }

    // --- Message Listener ---
    addMessageListener() {
        this.messageListener = (request, sender, sendResponse) => {
            // console.log("Popup received message:", request); // <-- Лог для отладки

            // Обработка сообщений, требующих действий на уровне popup-контроллера
            // или передачи данных между компонентами
            if (request.type === 'dataUpdated') {
                console.log("PopupApp: Received dataUpdated, reloading table data");
                // Запрашиваем обновленные данные у TableSection
                // или отправляем сообщение TableSection для перезагрузки
                this.table.loadInitialData();
            }

            if (request.type === 'dataCleared') {
                console.log("PopupApp: Received dataCleared");
                document.dispatchEvent(new CustomEvent('clearTable'));
            }

            if (request.type === 'newLog' && request.log) {
                console.log("PopupApp: Received newLog, dispatching CustomEvent"); // <-- Лог для отладки
                // Вместо вызова this.addLog (которой больше нет)
                // Отправляем внутреннее событие, которое будет слушать LogSection
                document.dispatchEvent(new CustomEvent('log', { detail: request.log }));
            }

            if (request.type === 'logsCleared') {
                console.log("Handling logsCleared message in PopupApp"); // <-- Лог для отладки
                // Сообщаем компоненту журнала об очистке
                document.dispatchEvent(new CustomEvent('clearLog'));
            }

            if (request.type === 'dataCleared') {
                console.log("Handling dataCleared message in PopupApp"); // <-- Лог для отладки
                // Сообщаем компоненту таблицы об очистке
                document.dispatchEvent(new CustomEvent('clearTable'));
            }

            // TODO: Добавить обработчики для других сообщений
            // if (request.type === 'analysisStatus') { ... }
            // if (request.type === 'dataUpdated') { 
            //    document.dispatchEvent(new CustomEvent('updateTable', { detail: newDataArray }));
            // }
        };

        chrome.runtime.onMessage.addListener(this.messageListener);
        console.log("PopupApp: Message listener added"); // <-- Лог для отладки
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

    handleStart() {
        const iterations = parseInt(this.iterationsInput.value) || 10;
        const mode = document.querySelector('input[name="selectionMode"]:checked')?.value || 'smart';
        document.dispatchEvent(new CustomEvent('log', { detail: { message: `🚀 Запуск анализа: ${iterations} итераций, режим: ${mode}`, level: 'info' } }));

        // В реальном сценарии здесь будет sendMessage для запуска в background
        // и обновление UI (например, disable кнопок) через события или напрямую

        this.startBtn.disabled = true;
        this.stopBtn.disabled = false;
        setTimeout(() => {
            document.dispatchEvent(new CustomEvent('log', { detail: { message: '🎉 Анализ завершён (имитация)', level: 'success' } }));
            this.startBtn.disabled = false;
            this.stopBtn.disabled = true;
            this.table.loadInitialData(); // Имитация обновления таблицы
        }, 3000);
    }

    handleStop() {
        document.dispatchEvent(new CustomEvent('log', { detail: { message: '⏹️ Анализ остановлен (имитация)', level: 'warn' } }));
        // В реальном сценарии здесь будет sendMessage для остановки в background
        this.startBtn.disabled = false;
        this.stopBtn.disabled = true;
    }

    async handleCopyTable() {
        document.dispatchEvent(new CustomEvent('log', { detail: { message: '📤 Подготовка таблицы для копирования...', level: 'info' } }));
        try {
            const response = await chrome.runtime.sendMessage({ action: "copyTableData" });
            if (response.status === "success") {
                await navigator.clipboard.writeText(response.data);
                document.dispatchEvent(new CustomEvent('log', { detail: { message: '✅ Таблица скопирована в буфер обмена', level: 'success' } }));
            } else {
                throw new Error(response.message);
            }
        } catch (err) {
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

    // НОВОЕ: Обработчик для запуска тестового сценария
    async handleRunTestScenario() {
        // Используем CustomEvent для логирования внутри popup
        document.dispatchEvent(new CustomEvent('log', { detail: { message: "📤 Отправка команды на запуск тестового сценария...", level: "info" } }));
        try {
            // Отправляем сообщение в background
            await chrome.runtime.sendMessage({
                action: "runTestScenario"
            });
            document.dispatchEvent(new CustomEvent('log', { detail: { message: "✅ Команда на запуск тестового сценария отправлена.", level: "success" } }));
        } catch (err) {
            document.dispatchEvent(new CustomEvent('log', { detail: { message: `❌ Ошибка отправки команды: ${err.message}`, level: "error" } }));
        }
    }
}

// Запускаем приложение
document.addEventListener('DOMContentLoaded', () => {
    new PopupApp();
});