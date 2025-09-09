// popup/popup.js — исправленная версия

class PopupController {
    constructor() {
        this.initElements();
        this.bindEvents();
        this.loadInitialData();
        this.loadLogs(); // Теперь AppLogger уже доступен благодаря <script>
        this.loadTableData();
        this.restoreImportSectionState();
        this.restoreSelectionMode();
    }

    initElements() {
        this.parseOnceBtn = document.getElementById('parseOnceBtn');
        this.clearLogBtn = document.getElementById('clearLogBtn');
        this.statusDiv = document.getElementById('status');
        this.logContainer = document.getElementById('logContainer');
        this.copyTableBtn = document.getElementById('copyTableBtn');
        this.clearTableBtn = document.getElementById('clearTableBtn');
        this.csvInput = document.getElementById('csvInput');
        this.importDataBtn = document.getElementById('importDataBtn');
        this.toggleImportBtn = document.getElementById('toggleImportBtn');
        this.importSection = document.getElementById('importSection');
        this.counterInput = document.getElementById('counterInput');
        this.startAnalysisBtn = document.getElementById('startAnalysisBtn');
        this.selectionModeRadios = document.querySelectorAll('input[name="selectionMode"]');
    }

    bindEvents() {
        this.parseOnceBtn.addEventListener('click', () => this.handleParseOnce());
        this.clearLogBtn.addEventListener('click', () => this.handleClearLog());
        this.copyTableBtn.addEventListener('click', () => this.handleCopyTable());
        this.clearTableBtn.addEventListener('click', () => this.handleClearTable());
        this.importDataBtn.addEventListener('click', () => this.handleImportData());
        this.toggleImportBtn.addEventListener('click', () => this.toggleImportSection());
        this.startAnalysisBtn.addEventListener('click', () => this.handleStartAnalysis());
        this.selectionModeRadios.forEach(radio => {
            radio.addEventListener('change', () => this.saveSelectionMode());
        });
        // Слушаем новые логи
        chrome.runtime.onMessage.addListener((request) => {
            if (request.type === 'newLog' && request.log) {
                this.renderLogEntry(request.log);
            }
            if (request.type === 'logsCleared') {
                this.logContainer.innerHTML = '';
                this.renderLogEntry({
                    message: "🧹 Журнал очищен",
                    level: "info",
                    timestamp: Date.now()
                });
            }
            // 👇 НОВОЕ: обновление данных
            if (request.type === 'dataUpdated') {
                this.loadTableData();
            }

            if (request.type === 'dataCleared') {
                this.renderTable([]); // очищаем таблицу
                this.renderLogEntry({
                    message: "✅ Данные таблицы удалены",
                    level: "success",
                    timestamp: Date.now()
                });
            }
        });
    }

    updateStatus(message, isError = false) {
        this.statusDiv.textContent = message;
        this.statusDiv.className = `status ${isError ? 'error' : ''}`;
    }

    renderLogEntry(logEntry) {
        const entry = document.createElement('div');
        const date = new Date(logEntry.timestamp).toLocaleTimeString();
        entry.textContent = `[${date}] ${logEntry.message}`;
        entry.style.color = this.getLogColor(logEntry.level);
        entry.style.padding = '4px 0';
        entry.style.borderBottom = '1px solid #eee';

        this.logContainer.appendChild(entry);
        this.logContainer.scrollTop = this.logContainer.scrollHeight;
    }

    // popup/popup.js — обновлённый renderTable

    renderTable(data) {
        const tableBody = document.getElementById('tableBody');
        if (!tableBody) return;

        tableBody.innerHTML = '';

        if (!data || data.length === 0) {
            document.getElementById('tableContainer').style.display = 'none';
            return;
        }

        document.getElementById('tableContainer').style.display = 'block';

        data.forEach(video => {
            const row = document.createElement('tr');
            row.innerHTML = `
      <td>${this.escapeHtml(video.title)}</td>
      <td>${video.videoId}</td>
      <td>${video.views}</td>
      <td>${this.escapeHtml(video.channelName)}</td>
      <td>${video.sourceVideoId || 'unknown'}</td>
      <td>
        ${video.thumbnailUrl ?
                    `<img src="${video.thumbnailUrl}" alt="Thumbnail" style="width: 80px; height: 45px; object-fit: cover;">` :
                    '—'
                }
      </td>
    `;
            tableBody.appendChild(row);
        });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    getLogColor(level) {
        switch (level) {
            case 'error': return '#c5221f';
            case 'success': return '#1a73e8';
            case 'warn': return '#f9ab00';
            default: return '#333';
        }
    }

    async loadInitialData() {
        this.updateStatus("Готов к работе", false);
    }

    async loadLogs() {
        try {
            // 👇 Теперь AppLogger уже загружен через <script> в popup.html
            const logs = await window.AppLogger.getLogs();
            this.logContainer.innerHTML = '';
            logs.forEach(log => this.renderLogEntry(log));
            this.renderLogEntry({
                message: `✅ Загружено ${logs.length} записей журнала`,
                level: "info",
                timestamp: Date.now()
            });
        } catch (err) {
            this.renderLogEntry({
                message: "⚠️ Не удалось загрузить историю логов: " + err.message,
                level: "error",
                timestamp: Date.now()
            });
        }
    }

    async handleParseOnce() {
        this.updateStatus("Получаем активную вкладку...", false);
        this.renderLogEntry({
            message: "🔍 Поиск активной вкладки YouTube...",
            level: "info",
            timestamp: Date.now()
        });

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            if (!tab) {
                throw new Error("Активная вкладка не найдена");
            }

            if (!tab.url.includes("youtube.com")) {
                throw new Error("Активная вкладка не является YouTube");
            }

            this.renderLogEntry({
                message: `✅ Найдена вкладка: ${tab.title}`,
                level: "success",
                timestamp: Date.now()
            });

            this.updateStatus("Отправка команды на скролл...", false);

            chrome.runtime.sendMessage({
                action: "parseOnce",
                tabId: tab.id
            });

            this.renderLogEntry({
                message: "📤 Команда 'parseOnce' отправлена в background",
                level: "info",
                timestamp: Date.now()
            });

            this.updateStatus("✅ Команда отправлена. Следите за журналом.", false);

        } catch (err) {
            this.updateStatus(`❌ ${err.message}`, true);
            this.renderLogEntry({
                message: `❌ Ошибка: ${err.message}`,
                level: "error",
                timestamp: Date.now()
            });
        }
    }

    async handleClearLog() {
        try {
            // 👇 ВАЖНО: мы должны вызывать clearLogs из BACKGROUND, а не из popup!
            // Так как storage управляется background-ом
            chrome.runtime.sendMessage({
                action: "clearLogs"
            });
            this.renderLogEntry({
                message: "📤 Запрос на очистку журнала отправлен",
                level: "info",
                timestamp: Date.now()
            });
        } catch (err) {
            this.renderLogEntry({
                message: "❌ Ошибка: " + err.message,
                level: "error",
                timestamp: Date.now()
            });
        }
    }

    async loadTableData() {
        try {
            // 👇 Теперь VideoStorage уже доступен через <script> в popup.html
            const data = await window.VideoStorage.get();
            this.renderTable(data);
            this.renderLogEntry({
                message: `📊 Таблица обновлена: ${data.length} видео`,
                level: "success",
                timestamp: Date.now()
            });
        } catch (err) {
            this.renderLogEntry({
                message: "❌ Ошибка загрузки таблицы: " + err.message,
                level: "error",
                timestamp: Date.now()
            });
        }
    }

    async handleCopyTable() {
        try {
            const data = await window.VideoStorage.get();

            if (!data || data.length === 0) {
                this.renderLogEntry({
                    message: "❌ Нет данных для копирования",
                    level: "error",
                    timestamp: Date.now()
                });
                return;
            }

            // Заголовки
            const headers = ["Название", "ID", "Просмотры", "Канал", "Исходное видео", "Миниатюра"];

            // Формируем строки
            const rows = data.map(video => [
                video.title || '',
                video.videoId || '',
                video.views || '',
                video.channelName || '',
                video.sourceVideoId || '',
                video.thumbnailUrl || ''
            ]);

            // Объединяем в TSV
            const tsvContent = [
                headers.join('\t'),
                ...rows.map(row => row.join('\t'))
            ].join('\n');

            // Копируем в буфер
            await navigator.clipboard.writeText(tsvContent);

            this.renderLogEntry({
                message: `✅ Таблица скопирована в буфер обмена (${data.length} строк)`,
                level: "success",
                timestamp: Date.now()
            });

        } catch (err) {
            this.renderLogEntry({
                message: "❌ Ошибка копирования: " + err.message,
                level: "error",
                timestamp: Date.now()
            });
        }
    }

    handleClearTable() {
        this.renderLogEntry({
            message: "📤 Отправка команды на очистку данных...",
            level: "info",
            timestamp: Date.now()
        });

        // Отправляем команду в background
        chrome.runtime.sendMessage({
            action: "clearTable"
        });
    }

    handleImportData() {
        const csvText = this.csvInput.value.trim();

        if (!csvText) {
            this.renderLogEntry({
                message: "❌ Нет данных для импорта",
                level: "error",
                timestamp: Date.now()
            });
            return;
        }

        try {
            const parsedData = this.parseCsv(csvText);

            if (parsedData.length === 0) {
                throw new Error("Не удалось распознать данные");
            }

            // Сохраняем в storage (перезаписываем)
            window.VideoStorage.save(parsedData).then(() => {
                this.renderLogEntry({
                    message: `✅ Импортировано ${parsedData.length} строк`,
                    level: "success",
                    timestamp: Date.now()
                });

                // Обновляем таблицу
                this.renderTable(parsedData);

                // Очищаем поле ввода
                this.csvInput.value = '';
            });

        } catch (err) {
            this.renderLogEntry({
                message: "❌ Ошибка импорта: " + err.message,
                level: "error",
                timestamp: Date.now()
            });
        }
    }

    parseCsv(text) {
        const lines = text.split(/\r\n|\n/);
        if (lines.length === 0) return [];

        const firstLine = lines[0];
        const delimiter = firstLine.includes('\t') ? '\t' : ';';

        // 👇 Обновлённые заголовки
        const headers = firstLine.split(delimiter).map(h => h.trim().toLowerCase());

        const requiredFields = ['название', 'id', 'просмотры', 'канал', 'исходное видео', 'миниатюра'];
        const fieldMap = {
            'название': 'title',
            'id': 'videoId',
            'просмотры': 'views',
            'канал': 'channelName',
            'исходное видео': 'sourceVideoId',
            'миниатюра': 'thumbnailUrl' // 👈 НОВОЕ ПОЛЕ
        };

        const indices = {};
        requiredFields.forEach(field => {
            const index = headers.findIndex(h => h === field);
            if (index === -1) {
                throw new Error(`Не найдена колонка: ${field}`);
            }
            indices[field] = index;
        });

        const data = [];
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;

            const cells = lines[i].split(delimiter);
            if (cells.length < Math.max(...Object.values(indices))) continue;

            const item = {};
            requiredFields.forEach(field => {
                const index = indices[field];
                item[fieldMap[field]] = cells[index] ? cells[index].trim() : '';
            });

            data.push(item);
        }

        return data;
    }

    // Переключает видимость блока импорта
    toggleImportSection() {
        const isExpanded = this.importSection.style.maxHeight !== '0px';

        if (isExpanded) {
            this.collapseImportSection();
        } else {
            this.expandImportSection();
        }
    }

    // Сворачивает блок
    collapseImportSection() {
        this.importSection.style.maxHeight = '0px';
        this.importSection.style.padding = '0';
        this.importSection.style.margin = '0';
        this.importSection.style.border = 'none';
        this.toggleImportBtn.textContent = '🔽';
        localStorage.setItem('importSectionCollapsed', 'true');
    }

    // Разворачивает блок
    expandImportSection() {
        this.importSection.style.maxHeight = '500px'; // достаточно для textarea + кнопки
        this.importSection.style.padding = '16px';
        this.importSection.style.margin = '0 0 16px 0';
        this.importSection.style.border = '1px solid #ddd';
        this.importSection.style.borderRadius = '6px';
        this.toggleImportBtn.textContent = '▲';
        localStorage.setItem('importSectionCollapsed', 'false');
    }

    // Восстанавливает состояние при открытии popup
    restoreImportSectionState() {
        const isCollapsed = localStorage.getItem('importSectionCollapsed') === 'true';
        if (isCollapsed) {
            this.collapseImportSection();
        } else {
            this.expandImportSection();
        }
    }

    handleStartAnalysis() {
        const iterations = parseInt(this.counterInput.value);

        if (isNaN(iterations) || iterations < 1 || iterations > 1000) {
            this.renderLogEntry({
                message: "❌ Введите корректное число итераций (от 1 до 1000)",
                level: "error",
                timestamp: Date.now()
            });
            return;
        }

        this.renderLogEntry({
            message: `🚀 Запуск автоанализа: ${iterations} итераций`,
            level: "info",
            timestamp: Date.now()
        });

        // Отправляем команду в background
        chrome.runtime.sendMessage({
            action: "startAutoAnalysis",
            iterations: iterations
        });

        this.renderLogEntry({
            message: "✅ Анализ запущен в фоне. Можно закрыть popup.",
            level: "success",
            timestamp: Date.now()
        });
    }

    saveSelectionMode() {
        const selected = document.querySelector('input[name="selectionMode"]:checked');
        if (selected) {
            // Сохраняем в chrome.storage.local для доступа из background
            chrome.storage.local.set({ selectionMode: selected.value });
        }
    }

    // Восстанавливаем режим при открытии popup
    restoreSelectionMode() {
        const saved = localStorage.getItem('selectionMode');
        if (saved) {
            const radio = document.querySelector(`input[name="selectionMode"][value="${saved}"]`);
            if (radio) radio.checked = true;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.body.style.width = '720px';
    document.body.style.height = '780px';
    new PopupController();
});