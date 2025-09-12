// background/background.js
// Импортируем новые модули
import { Logger } from '../core/logger.js';
import { ChromeStorageLogAdapter } from '../adapters/ChromeStorageLogAdapter.js';
import { ChromeStorageTableAdapter } from '../adapters/ChromeStorageTableAdapter.js';
import { ScenarioEngine } from '../core/scenario-engine.js';
import { testCountdownScenario } from '../scenarios/test-countdown.js';

// --- Инициализация нового функционала ---
// 1. Создаем экземпляр логгера
export const logger = new Logger({
    maxSize: 1000,
    enableConsole: true,
    defaultLevel: 'info'
});

export const tableAdapter = new ChromeStorageTableAdapter({
    maxSize: 100000 // Установим большой лимит
});

// logger по умолчанию уже добавил ChromeStorageLogAdapter, но мы можем добавить ещё

// 2. Создаем экземпляр движка сценариев
export const scenarioEngine = new ScenarioEngine();

// 3. Регистрируем тестовый сценарий
scenarioEngine.registerScenario(testCountdownScenario);
// --- Конец инициализации нового функционала ---

// --- Обработка сообщений от popup ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    if (request.action === "getTableData") {
        (async () => {
            try {
                const data = await tableAdapter.getAll();
                sendResponse({ status: "success", data });
            } catch (err) {
                logger.error(`❌ Ошибка получения данных таблицы: ${err.message}`, { module: 'Background' });
                sendResponse({ status: "error", message: err.message });
            }
        })();
        return true; // Указывает, что ответ будет асинхронным
    }

    // 👇 НОВОЕ: обработка запроса на очистку таблицы
    if (request.action === "clearTableData") {
        (async () => {
            try {
                await tableAdapter.clear();
                sendResponse({ status: "success" });
                logger.info("✅ Таблица очищена", { module: 'Background' });
            } catch (err) {
                logger.error(`❌ Ошибка очистки таблицы: ${err.message}`, { module: 'Background' });
                sendResponse({ status: "error", message: err.message });
            }
        })();
        return true;
    }

    // 👇 НОВОЕ: обработка запроса на копирование таблицы (получение данных в формате TSV)
    if (request.action === "copyTableData") {
        (async () => {
            try {
                const data = await tableAdapter.getAll();
                // Фильтруем импортированные данные, если нужно
                const freshData = data.filter(v => !v.isImported);

                const headers = ['Название', 'ID', 'Просмотры', 'Канал', 'Исходное видео', 'Миниатюра'];
                const rows = freshData.map(v => [
                    v.title || '', v.videoId || '', v.views || '', v.channelName || '', v.sourceVideoId || '', v.thumbnailUrl || ''
                ]);

                const tsvContent = [headers.join('\t'), ...rows.map(r => r.join('\t'))].join('\n');
                sendResponse({ status: "success", data: tsvContent });
                logger.info(`📋 Таблица подготовлена для копирования (${freshData.length} строк)`, { module: 'Background' });
            } catch (err) {
                logger.error(`❌ Ошибка подготовки таблицы для копирования: ${err.message}`, { module: 'Background' });
                sendResponse({ status: "error", message: err.message });
            }
        })();
        return true;
    }
    // 👇 НОВОЕ: обработка команды на запуск тестового сценария
    if (request.action === "runTestScenario") {
        logger.info("📥 Получена команда на запуск тестового сценария", { module: 'Background' });

        // Запускаем сценарий асинхронно, не дожидаясь завершения
        (async () => {
            try {
                // Получаем активную вкладку для контекста (опционально)
                let activeTabId = null;
                try {
                    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    activeTabId = activeTab?.id || null;
                } catch (e) {
                    logger.warn("Не удалось получить активную вкладку для сценария", { module: 'Background' });
                }

                const instanceId = await scenarioEngine.run(testCountdownScenario, {}, activeTabId);
                logger.info(`🏁 Тестовый сценарий запущен с ID: ${instanceId}`, { module: 'Background' });

            } catch (err) {
                logger.error(`❌ Ошибка запуска тестового сценария: ${err.message}`, { module: 'Background' });
            }
        })();

        // Важно для асинхронных операций
        return true;
    }

    // TODO: Здесь будут обработчики для других действий (parseOnce, startAutoAnalysis и т.д.)
    // которые мы постепенно перенесем на новую архитектуру.
    // Пока оставим заглушку или старую логику, если нужно проверить MVP.
});

logger.info("🚀 Background service worker запущен и готов к работе.", { module: 'Background' });
