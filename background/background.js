// background/background.js
// Импортируем новые модули
import { Logger } from '../core/logger.js';
import { ChromeStorageLogAdapter } from '../adapters/ChromeStorageLogAdapter.js';
import { ScenarioEngine } from '../core/scenario-engine.js';
import { testCountdownScenario } from '../scenarios/test-countdown.js';

// --- Инициализация нового функционала ---
// 1. Создаем экземпляр логгера
export const logger = new Logger({
    maxSize: 1000,
    enableConsole: true,
    defaultLevel: 'info'
});
// logger по умолчанию уже добавил ChromeStorageLogAdapter, но мы можем добавить ещё

// 2. Создаем экземпляр движка сценариев
export const scenarioEngine = new ScenarioEngine();

// 3. Регистрируем тестовый сценарий
scenarioEngine.registerScenario(testCountdownScenario);
// --- Конец инициализации нового функционала ---

// --- Обработка сообщений от popup ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
