// background/background.js
// Импортируем новые модули
import { Logger } from '../core/logger.js';
import { ChromeStorageLogAdapter } from '../adapters/ChromeStorageLogAdapter.js';
import { ChromeStorageTableAdapter } from '../adapters/ChromeStorageTableAdapter.js';
import { ScenarioEngine } from '../core/scenario-engine.js';
import { testCountdownScenario } from '../scenarios/test-countdown.js';
import { prepareImportedDataIndices } from '../core/data-processor.js';
import { parseRecommendationScenario } from '../scenarios/parse-recommendation.js';

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

export async function getImportedDataIndices() {
    try {
        const allData = await tableAdapter.getAll();
        // Фильтруем только импортированные данные
        const importedData = allData.filter(item => item.isImported === true);
        logger.debug(`[Background] Получено ${importedData.length} импортированных записей для индексации.`, { module: 'Background' });
        return prepareImportedDataIndices(importedData);
    } catch (error) {
        logger.error(`[Background] Ошибка при получении/индексации импортированных данных: ${error.message}`, { module: 'Background' });
        // Возвращаем пустые структуры в случае ошибки
        return {
            visitedVideoIds: new Set(),
            channelVideoCounts: new Map(),
            channelToVideoIds: new Map()
        };
    }
}
// logger по умолчанию уже добавил ChromeStorageLogAdapter, но мы можем добавить ещё

// 2. Создаем экземпляр движка сценариев
export const scenarioEngine = new ScenarioEngine();

// 3. Регистрируем тестовый сценарий
scenarioEngine.registerScenario(testCountdownScenario);
scenarioEngine.registerScenario(parseRecommendationScenario);
// --- Конец инициализации нового функционала ---

// --- Обработка сообщений от popup ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    if (request.type === "contentLog") {
        console.log("[Background] Получен лог от content script:", request);
        // Перенаправляем лог в наш logger
        logger.log(
            request.message,
            request.level || 'info',
            {
                module: request.module || 'ContentScript',
                // Можно добавить ID вкладки, если нужно
                // tabId: sender.tab?.id
            }
        );
        // Намеренно не отправляем sendResponse, так как это одностороннее сообщение
        return false; // Не нужно ждать асинхронного ответа
    }

    if (request.action === "stopAllScenarios") {
        logger.info("📥 Получена команда на остановку всех сценариев", { module: 'Background' });
        (async () => {
            try {
                // Получаем список всех запущенных сценариев
                const runningScenarios = scenarioEngine.getRunningScenarios();
                if (runningScenarios.length === 0) {
                    logger.info("📭 Нет запущенных сценариев для остановки", { module: 'Background' });
                    sendResponse({ status: "success", message: "Нет запущенных сценариев" });
                    return;
                }

                logger.info(`⏹️ Запрошена остановка ${runningScenarios.length} сценариев`, { module: 'Background' });

                let stoppedCount = 0;
                let errorCount = 0;

                const stopPromises = runningScenarios.map(async (scenario) => {
                    try {
                        // ScenarioEngine.stop возвращает true, если сценарий был найден и остановлен
                        const wasStopped = scenarioEngine.stop(scenario.id);
                        if (wasStopped) {
                            stoppedCount++;
                            logger.info(`⏹️ Сценарий "${scenario.name}" (ID: ${scenario.id}) остановлен`, { module: 'Background' });
                        } else {
                            // Это маловероятно, так как мы только что получили список запущенных
                            logger.warn(`⚠️ Сценарий "${scenario.name}" (ID: ${scenario.id}) не был остановлен (уже завершен?)`, { module: 'Background' });
                        }
                    } catch (err) {
                        errorCount++;
                        logger.error(`❌ Ошибка при остановке сценария "${scenario.name}" (ID: ${scenario.id}): ${err.message}`, { module: 'Background' });
                    }
                });

                // Ждем завершения всех попыток остановки
                await Promise.allSettled(stopPromises);

                const resultMessage = `Остановлено сценариев: ${stoppedCount}. Ошибок: ${errorCount}.`;
                logger.info(`🏁 Результат остановки: ${resultMessage}`, { module: 'Background' });

                sendResponse({ status: "success", message: resultMessage });

            } catch (err) {
                logger.error(`❌ Ошибка при остановке сценариев: ${err.message}`, { module: 'Background' });
                sendResponse({ status: "error", message: err.message });
            }
        })();
        return true; // keep channel open for async response
    }

    if (request.action === "getScenarioStatus") {
        logger.debug("📥 Получен запрос состояния сценариев", { module: 'Background' });
        try {
            const runningScenarios = scenarioEngine.getRunningScenarios();
            const isRunning = runningScenarios.length > 0;
            // Можно также отправить список запущенных сценариев, если нужно
            sendResponse({ status: "success", isRunning: isRunning, runningScenarios: runningScenarios });
            logger.debug(`📤 Отправлено состояние сценариев: isRunning=${isRunning}`, { module: 'Background' });
        } catch (err) {
            logger.error(`❌ Ошибка при получении состояния сценариев: ${err.message}`, { module: 'Background' });
            sendResponse({ status: "error", message: err.message });
        }
        return true; // keep channel open for async response (на случай, если getRunningScenarios станет асинхронным в будущем)
    }

    if (request.action === "runScenario") {
        const { scenarioId, params = {} } = request;
        logger.info(`📥 Получена команда на запуск сценария "${scenarioId}"`, { module: 'Background', meta: params });

        (async () => {
            try {
                let activeTabId = null;
                try {
                    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    activeTabId = activeTab?.id || null;
                } catch (e) {
                    logger.warn("Не удалось получить активную вкладку для сценария", { module: 'Background' });
                }

                // Определяем, какой сценарий запускать
                let scenarioToRun;
                if (scenarioId === 'parse-recommendation') {
                    scenarioToRun = parseRecommendationScenario;
                } else if (scenarioId === 'test-countdown') {
                    scenarioToRun = testCountdownScenario;
                    // } else if (scenarioId === '...') {
                    //     scenarioToRun = ...;
                } else {
                    throw new Error(`Неизвестный ID сценария: ${scenarioId}`);
                }

                // Передаем параметры в сценарий через context.params
                const instanceId = await scenarioEngine.run(scenarioToRun, params, activeTabId);
                logger.info(`🏁 Сценарий "${scenarioId}" запущен с ID: ${instanceId}`, { module: 'Background' });

                // 👇 Отправляем подтверждение запуска с ID инстанса
                sendResponse({ status: "started", instanceId: instanceId });

                // Опционально: отправляем сообщение в popup о начале (если нужно немедленное уведомление до завершения сценария)
                // chrome.runtime.sendMessage({ type: "scenarioStatus", status: "started", message: `Сценарий "${scenarioId}" начат.`, level: "info" });

            } catch (err) {
                logger.error(`❌ Ошибка запуска сценария "${scenarioId}": ${err.message}`, { module: 'Background' });
                sendResponse({ status: "error", message: err.message });
            }
        })();

        return true; // keep channel open for async response
    }

    if (request.action === "clearImportedTableData") {
        (async () => {
            try {
                logger.info("📥 Получена команда на очистку импортированных данных", { module: 'Background' });

                // Вызываем метод адаптера
                await tableAdapter.clearImported();

                logger.info("✅ Импортированные данные очищены", { module: 'Background' });
                sendResponse({ status: "success" });

            } catch (err) {
                logger.error(`❌ Ошибка очистки импортированных данных: ${err.message}`, { module: 'Background' });
                sendResponse({ status: "error", message: err.message });
            }
        })();
        return true; // keep channel open for async response
    }

    if (request.action === "getTableFreshData") {
        (async () => {
            try {
                // Используем новый метод адаптера
                const data = await tableAdapter.getFreshData();
                sendResponse({ status: "success", data });
            } catch (err) {
                logger.error(`❌ Ошибка получения свежих данных таблицы: ${err.message}`, { module: 'Background' });
                sendResponse({ status: "error", message: err.message });
            }
        })();
        return true; // Указывает, что ответ будет асинхронным
    }

    if (request.action === "DEBUG_getImportedDataIndices") {
        (async () => {
            try {
                console.log("[DEBUG] Получение индексов импортированных данных по запросу из popup/console...");
                const indices = await getImportedDataIndices(); // Эта функция доступна внутри модуля

                // Maps и Sets нужно сериализовать для отправки
                const serializableData = {
                    visitedVideoIds_size: indices.visitedVideoIds.size,
                    channelVideoCounts_size: indices.channelVideoCounts.size,
                    channelToVideoIds_size: indices.channelToVideoIds.size,

                    // Добавим примеры для лучшей проверки
                    visitedVideoIds_sample: Array.from(indices.visitedVideoIds).slice(0, 5),
                    channelVideoCounts_sample: Object.fromEntries(
                        Array.from(indices.channelVideoCounts).slice(0, 5)
                    ),
                    channelToVideoIds_sample: Object.fromEntries(
                        Array.from(indices.channelToVideoIds, ([k, v]) => [k, Array.from(v).slice(0, 3)]).slice(0, 3)
                    )
                };

                console.log("[DEBUG] Индексы получены:", serializableData);
                sendResponse({ status: "success", data: serializableData });
            } catch (err) {
                console.error("[DEBUG] Ошибка в getImportedDataIndices:", err);
                sendResponse({ status: "error", message: err.message });
            }
        })();
        return true; // keep channel open for async response
    }

    if (request.action === "importTableData") {
        (async () => {
            try {
                if (!request.data || !Array.isArray(request.data)) {
                    const errorMsg = "Некорректные данные для импорта";
                    console.error("[Background] importTableData:", errorMsg);
                    sendResponse({ status: "error", message: errorMsg });
                    return;
                }

                const dataToImport = request.data;

                // 1. Получаем существующие данные
                let existingData = [];
                try {
                    existingData = await tableAdapter.getAll();
                } catch (getErr) {
                    console.warn("[Background] Не удалось получить существующие данные, начинаем с пустого массива:", getErr.message);
                }

                // 2. Объединяем данные (можно просто добавить, или реализовать объединение/замещение)
                // Для простоты, просто добавляем в конец.
                const combinedData = [...existingData, ...dataToImport];

                // 3. Сохраняем в хранилище через адаптер
                // tableAdapter.addBatch ожидает массив VideoData. Убедимся, что формат правильный.
                // addBatch внутри адаптера тоже вызывает getAll, добавляет и set.
                // Чтобы упростить и избежать двойного getAll, можно напрямую использовать set,
                // но лучше использовать API адаптера. Реализуем addBatch, если его нет.
                // Проверим, есть ли addBatch:
                if (typeof tableAdapter.addBatch === 'function') {
                    await tableAdapter.addBatch(dataToImport);
                } else if (typeof tableAdapter.add === 'function') {
                    // Если addBatch нет, добавляем по одной (менее эффективно)
                    for (const item of dataToImport) {
                        await tableAdapter.add(item);
                    }
                } else {
                    const errorMsg = "Адаптер таблицы не поддерживает методы добавления";
                    console.error("[Background] importTableData:", errorMsg);
                    sendResponse({ status: "error", message: errorMsg });
                    return;
                }

                logger.info(`📥 Импортировано ${dataToImport.length} записей в таблицу`, { module: 'Background' });

                sendResponse({ status: "success", count: dataToImport.length });

            } catch (err) {
                console.error("[Background] Ошибка при импорте данных:", err);
                logger.error(`❌ Ошибка импорта данных: ${err.message}`, { module: 'Background' });
                sendResponse({ status: "error", message: err.message });
            }
        })();
        return true; // keep channel open for async response
    }

    if (request.action === "getImportedDataIndices") {
        (async () => {
            try {
                const indices = await getImportedDataIndices();
                // Maps и Sets нельзя напрямую сериализовать в JSON, поэтому преобразуем
                const serializableIndices = {
                    visitedVideoIds: Array.from(indices.visitedVideoIds),
                    channelVideoCounts: Object.fromEntries(indices.channelVideoCounts),
                    channelToVideoIds: {} // Преобразуем Map<channel, Set<id>> в объект
                };
                for (const [channel, idSet] of indices.channelToVideoIds) {
                    serializableIndices.channelToVideoIds[channel] = Array.from(idSet);
                }
                sendResponse({ status: "success", data: serializableIndices });
            } catch (err) {
                logger.error(`[Background] Ошибка получения индексов: ${err.message}`, { module: 'Background' });
                sendResponse({ status: "error", message: err.message });
            }
        })();
        return true; // Для асинхронной отправки ответа
    }

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

    // TODO: Здесь будут обработчики для других действий (parseOnce, startAutoAnalysis и т.д.)
    // которые мы постепенно перенесем на новую архитектуру.
    // Пока оставим заглушку или старую логику, если нужно проверить MVP.
});

logger.info("🚀 Background service worker запущен и готов к работе.", { module: 'Background' });