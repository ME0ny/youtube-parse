// background/background.js
// Импортируем новые модули
import { Logger } from '../core/logger.js';
import { ChromeStorageLogAdapter } from '../adapters/ChromeStorageLogAdapter.js';
import { ScenarioEngine } from '../core/scenario-engine.js';
import { testCountdownScenario } from '../scenarios/test-countdown.js';
import { DexieTableAdapter } from '../adapters/DexieTableAdapter.js';
import { prepareImportedDataIndices } from '../core/data-processor.js';
import { parseRecommendationScenario } from '../scenarios/parse-recommendation.js';
import {
    initialize as initIndexManager,
    reset as resetIndexManager,
    getStateSnapshot,
    addScrapedData as updateIndexManagerWithData
} from '../core/index-manager.js';

// --- Инициализация нового функционала ---
// 1. Создаем экземпляр логгера
export const logger = new Logger({
    maxSize: 1000,
    enableConsole: true,
    defaultLevel: 'info'
});

export const tableAdapter = new DexieTableAdapter({
    dbName: 'YouTubeParserOS_DB', // Имя базы данных IndexedDB
    tableName: 'parsedVideos',   // Имя таблицы внутри БД
    version: 1                     // Версия схемы (увеличивать при изменениях схемы)
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

// --- Инициализация IndexManager ---
// Вызывается один раз при запуске background script
async function initializeBackgroundState() {
    logger.info("🚀 Background service worker запущен и готов к работе.", { module: 'Background' });

    try {
        // 1. Инициализируем IndexManager данными из tableAdapter
        logger.info("🔄 Инициализация IndexManager...", { module: 'Background' });
        const allStoredData = await tableAdapter.getAll();
        await initIndexManager(allStoredData);
        logger.info(`✅ IndexManager инициализирован. Загружено ${allStoredData.length} записей.`, { module: 'Background' });

        // 2. Можно инициализировать другие части системы...

    } catch (initErr) {
        logger.error(`❌ Ошибка инициализации background: ${initErr.message}`, { module: 'Background' });
        // Важно: не останавливаем весь background из-за ошибки инициализации
        // но логируем критично
    }
}

// Вызываем инициализацию
initializeBackgroundState().catch(err => {
    console.error("[Background] Критическая ошибка при инициализации:", err);
    // logger может быть еще не инициализирован, поэтому console.error тоже важен
});
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
                logger.debug("Попытка получить активную вкладку...", { module: 'Background' });

                try {
                    // Попытка 1: Получить активную вкладку в текущем окне
                    const activeTabsCurrentWindow = await chrome.tabs.query({ active: true, currentWindow: true });
                    logger.debug(`Результат query({active: true, currentWindow: true}):`, activeTabsCurrentWindow, { module: 'Background' });
                    if (activeTabsCurrentWindow.length > 0) {
                        activeTabId = activeTabsCurrentWindow[0].id;
                        logger.debug(`Найдена активная вкладка в текущем окне: ID=${activeTabId}`, { module: 'Background' });
                    } else {
                        logger.warn("Активная вкладка в текущем окне не найдена.", { module: 'Background' });
                    }
                } catch (queryErr1) {
                    logger.warn(`Ошибка при попытке 1 получения активной вкладки: ${queryErr1.message}`, { module: 'Background' });
                }

                // Если не нашли, попробуем более общий запрос
                if (activeTabId === null) {
                    logger.debug("Попытка 2: Получить любую активную вкладку...", { module: 'Background' });
                    try {
                        const activeTabsAnyWindow = await chrome.tabs.query({ active: true });
                        logger.debug(`Результат query({active: true}):`, activeTabsAnyWindow, { module: 'Background' });
                        if (activeTabsAnyWindow.length > 0) {
                            // Берем первую, обычно это та, что в текущем окне
                            activeTabId = activeTabsAnyWindow[0].id;
                            logger.debug(`Найдена активная вкладка (любая): ID=${activeTabId}`, { module: 'Background' });
                        } else {
                            logger.warn("Не найдено ни одной активной вкладки.", { module: 'Background' });
                        }
                    } catch (queryErr2) {
                        logger.warn(`Ошибка при попытке 2 получения активной вкладки: ${queryErr2.message}`, { module: 'Background' });
                    }
                }

                // Если все еще null, логируем предупреждение, но продолжаем (сценарий может сам решить, что делать)
                if (activeTabId === null) {
                    logger.warn("❌ Не удалось получить активную вкладку. tabId будет null. Сценарий может не работать с контентом страницы.", { module: 'Background' });
                    // Не бросаем ошибку здесь, пусть сценарий сам решает, критично ли это.
                    // Но для скроллинга это критично, поэтому сценарий должен это обработать.
                } else {
                    logger.info(`✅ Активная вкладка определена: ID=${activeTabId}`, { module: 'Background' });
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

                // Передаем параметры и tabId в сценарий через context.params и context.tabId
                const instanceId = await scenarioEngine.run(scenarioToRun, params, activeTabId);
                logger.info(`🏁 Сценарий "${scenarioId}" запущен с ID: ${instanceId}`, { module: 'Background' });

                sendResponse({ status: "started", instanceId: instanceId });

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
                    logger.warn(`[Background] ${errorMsg}`, { module: 'Background' });
                    sendResponse({ status: "error", message: errorMsg });
                    return;
                }

                const dataToImport = request.data;
                logger.info(`📥 Начинаем импорт ${dataToImport.length} записей...`, { module: 'Background' });

                // 1. Добавляем данные в tableAdapter (основное хранилище)
                // Предполагается, что tableAdapter.addBatch существует и работает
                if (typeof tableAdapter.addBatch === 'function') {
                    await tableAdapter.addBatch(dataToImport);
                } else if (typeof tableAdapter.add === 'function') {
                    // Если addBatch нет, добавляем по одной (менее эффективно)
                    logger.warn("[Background] tableAdapter.addBatch не найден, используем add для каждой записи...", { module: 'Background' });
                    for (const item of dataToImport) {
                        await tableAdapter.add(item);
                    }
                } else {
                    throw new Error("Адаптер таблицы не поддерживает методы добавления (add/addBatch)");
                }

                logger.info(`✅ Импортировано ${dataToImport.length} записей в tableAdapter`, { module: 'Background' });

                // 👇 НОВОЕ: Обновляем IndexManager импортированными данными БЕЗ добавления в scrapedDataBuffer
                try {
                    logger.info(`🔄 Обновление IndexManager ${dataToImport.length} импортированными записями (addToBuffer=false)...`, { module: 'Background' });
                    // Вызываем addScrapedData с флагом addToBuffer = false
                    updateIndexManagerWithData(dataToImport, false);
                    logger.info(`✅ IndexManager успешно обновлен импортированными данными (без добавления в буфер).`, { module: 'Background' });
                } catch (indexUpdateErr) {
                    // Логируем ошибку, но не прерываем основной процесс импорта
                    logger.error(`⚠️ Ошибка обновления IndexManager после импорта: ${indexUpdateErr.message}`, { module: 'Background' });
                }

                sendResponse({ status: "success", count: dataToImport.length });

                // 👇 НОВОЕ: Оповещаем popup о том, что данные обновились (если нужно)
                // chrome.runtime.sendMessage({ type: "dataUpdated" }).catch(err => { /* ignore */ });

            } catch (err) {
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

    if (request.action === "importTableDataChunk") {
        (async () => {
            try {
                const { data, isLastChunk, fileName, chunkIndex, totalChunks } = request;

                if (!Array.isArray(data) || data.length === 0) {
                    throw new Error("Некорректные данные для импорта");
                }

                logger.info(`📥 Импорт чанка ${chunkIndex}/${totalChunks} из файла "${fileName}"...`, { module: 'Background' });

                // Добавляем чанк данных в хранилище
                await tableAdapter.addBatch(data);

                logger.info(`✅ Чанк ${chunkIndex}/${totalChunks} успешно импортирован.`, { module: 'Background' });

                // Если это последний чанк, обновляем IndexManager
                if (isLastChunk) {
                    logger.info(`🔄 Обновление IndexManager после импорта последнего чанка...`, { module: 'Background' });
                    try {
                        const importedData = await tableAdapter.getAll();
                        const importedOnly = importedData.filter(item => item.isImported);
                        const indices = prepareImportedDataIndices(importedOnly);
                        // 👇 ОБНОВЛЯЕМ IndexManager
                        await initIndexManager(importedOnly); // или updateIndexManagerWithData, если нужно инкрементальное обновление
                        logger.info(`✅ IndexManager успешно обновлен после импорта файла "${fileName}".`, { module: 'Background' });
                    } catch (indexUpdateErr) {
                        logger.error(`⚠️ Ошибка обновления IndexManager: ${indexUpdateErr.message}`, { module: 'Background' });
                    }
                }

                sendResponse({ status: "success" });

            } catch (err) {
                logger.error(`❌ Ошибка импорта чанка: ${err.message}`, { module: 'Background' });
                sendResponse({ status: "error", message: err.message });
            }
        })();
        return true; // keep channel open for async response
    }

    if (request.action === "copyTableDataAsCSV") {
        (async () => {
            try {
                logger.info("📥 Получен запрос на копирование таблицы в формате CSV (;)", { module: 'Background' });

                // 1. Получаем все данные из tableAdapter
                const data = await tableAdapter.getAll();
                logger.info(`📥 Получено ${data.length} записей из tableAdapter для копирования`, { module: 'Background' });

                // 2. Фильтруем, оставляя только "свежие" данные (не импортированные)
                const freshData = data.filter(v => !v.isImported);
                logger.info(`📋 Отобрано ${freshData.length} свежих записей для копирования`, { module: 'Background' });

                if (freshData.length === 0) {
                    logger.warn("📋 Нет свежих данных для копирования", { module: 'Background' });
                    sendResponse({ status: "success", data: "" });
                    return;
                }

                // 3. Подготавливаем заголовки (всегда в кавычках, как в примере)
                const headers = ['Название', 'ID', 'Просмотры', 'Канал', 'Исходное видео', 'Миниатюра'];
                const escapeHeader = (header) => {
                    // Всегда оборачиваем заголовки в кавычки и экранируем внутренние "
                    return `"${String(header).replace(/"/g, '""')}"`;
                };
                const csvHeader = headers.map(escapeHeader).join(';');

                // 4. Подготавливаем строки данных
                const escapeCSVField = (str) => {
                    if (str == null) return '""'; // Пустое значение -> ""
                    const s = String(str);
                    // Всегда оборачиваем в кавычки и экранируем внутренние "
                    return `"${s.replace(/"/g, '""')}"`;
                };

                const csvRows = freshData.map(v => [
                    escapeCSVField(v.title || ''),
                    escapeCSVField(v.videoId || ''),
                    escapeCSVField(v.views || ''),
                    escapeCSVField(v.channelName || ''), // Канал не оборачивается в кавычки, если нет спецсимволов
                    escapeCSVField(v.sourceVideoId || ''),
                    escapeCSVField(v.thumbnailUrl || '')
                ].join(';'));

                // 5. Формируем содержимое CSV с разделителем ";"
                const csvContent = [csvHeader, ...csvRows].join('\n');

                logger.info(`📋 Таблица подготовлена для копирования в формате CSV (;) (${freshData.length} строк)`, { module: 'Background' });
                sendResponse({ status: "success", data: csvContent });

            } catch (err) {
                logger.error(`❌ Ошибка подготовки таблицы для копирования в формате CSV (;): ${err.message}`, { module: 'Background' });
                sendResponse({ status: "error", message: err.message });
            }
        })();
        return true; // keep channel open for async response
    }

    // 👇 НОВОЕ: Обработчик для сброса индексов
    if (request.action === "resetIndices") {
        (async () => {
            try {
                logger.info("📥 Получена команда на сброс индексов.", { module: 'Background' });
                resetIndexManager();
                logger.info("✅ Индексы успешно сброшены.", { module: 'Background' });
                sendResponse({ status: "success", message: "Индексы сброшены." });
            } catch (err) {
                logger.error(`❌ Ошибка сброса индексов: ${err.message}`, { module: 'Background' });
                sendResponse({ status: "error", message: err.message });
            }
        })();
        return true; // keep channel open for async response
    }

    // 👇 НОВОЕ: Обработчик для получения состояния индексов (для отладки/статистики в popup)
    if (request.action === "getIndexState") {
        (async () => {
            try {
                // logger.info("📥 Получен запрос состояния индексов.", { module: 'Background' });
                // getStateSnapshot возвращает копии, безопасно для сериализации
                const indexStateSnapshot = getStateSnapshot();

                // Maps и Sets нужно преобразовать для отправки через sendMessage
                // ВАЖНО: Создаем объект с полями, которые ожидает popup
                const serializableState = {
                    // Поля для scrapedDataBuffer
                    scrapedDataBuffer_count: indexStateSnapshot.scrapedDataBuffer.length,
                    // 👇 НОВОЕ: Отправляем сами данные буфера (или часть)
                    scrapedDataBuffer_sample: indexStateSnapshot.scrapedDataBuffer, // Отправляем первые 5 элементов

                    // Поля для visitedVideoIds
                    visitedVideoIds_count: indexStateSnapshot.visitedVideoIds.size,
                    // 👇 НОВОЕ: Отправляем сами ID (или часть)
                    visitedVideoIds_sample: Array.from(indexStateSnapshot.visitedVideoIds), // Отправляем первые 10 ID

                    // Поля для channelVideoCounts
                    channelVideoCounts_count: indexStateSnapshot.channelVideoCounts.size,
                    // 👇 НОВОЕ: Отправляем часть словаря
                    channelVideoCounts_sample: Object.fromEntries(
                        Array.from(indexStateSnapshot.channelVideoCounts) // Первые 10 каналов
                    ),

                    // Поля для channelToVideoIds
                    channelToVideoIds_count: indexStateSnapshot.channelToVideoIds.size,
                    // 👇 НОВОЕ: Отправляем часть словаря, преобразуя Set в Array
                    channelToVideoIds_sample: Object.fromEntries(
                        Array.from(indexStateSnapshot.channelToVideoIds, ([k, v]) => [k, Array.from(v)])
                    ),
                };

                sendResponse({ status: "success", serializableState });
            } catch (err) {
                logger.error(`❌ Ошибка получения состояния индексов: ${err.message}`, { module: 'Background' });
                sendResponse({ status: "error", message: err.message });
            }
        })();
        return true; // keep channel open for async response
    }

    // TODO: Здесь будут обработчики для других действий (parseOnce, startAutoAnalysis и т.д.)
    // которые мы постепенно перенесем на новую архитектуру.
    // Пока оставим заглушку или старую логику, если нужно проверить MVP.
});

logger.info("🚀 Background service worker запущен и готов к работе.", { module: 'Background' });