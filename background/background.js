// background/background.js
// Импортируем новые модули
import { Logger } from '../core/logger.js';
import { ChromeStorageLogAdapter } from '../adapters/ChromeStorageLogAdapter.js';
import { ChromeStorageTableAdapter } from '../adapters/ChromeStorageTableAdapter.js';
import { ScenarioEngine } from '../core/scenario-engine.js';
import { testCountdownScenario } from '../scenarios/test-countdown.js';
import { prepareImportedDataIndices } from '../core/data-processor.js';

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
// --- Конец инициализации нового функционала ---

// --- Обработка сообщений от popup ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

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

    if (request.action === "startAnalysis") {
        const params = request.params || {}; // Получаем параметры
        logger.info("📥 Получена команда на запуск анализа", { module: 'Background', meta: params });

        // Запускаем сценарий асинхронно
        (async () => {
            try {
                let activeTabId = null;
                try {
                    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    activeTabId = activeTab?.id || null;
                } catch (e) {
                    logger.warn("Не удалось получить активную вкладку для сценария", { module: 'Background' });
                }

                // Передаем параметры в сценарий через context.params
                const instanceId = await scenarioEngine.run(testCountdownScenario, params, activeTabId);
                logger.info(`🏁 Анализ запущен с ID: ${instanceId}`, { module: 'Background' });

            } catch (err) {
                logger.error(`❌ Ошибка запуска анализа: ${err.message}`, { module: 'Background' });
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
    // 👇 НОВОЕ: обработка команды на запуск тестового сценария
    if (request.action === "runTestScenario") {
        // Получаем параметры из запроса
        const params = request.params || {};
        logger.info("📥 Получена команда на запуск тестового сценария", { module: 'Background', meta: params });

        // Запускаем сценарий асинхронно
        (async () => {
            try {
                let activeTabId = null;
                try {
                    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    activeTabId = activeTab?.id || null;
                } catch (e) {
                    logger.warn("Не удалось получить активную вкладку для сценария", { module: 'Background' });
                }

                // Передаем параметры в сценарий через context.params
                const instanceId = await scenarioEngine.run(testCountdownScenario, params, activeTabId);
                logger.info(`🏁 Тестовый сценарий запущен с ID: ${instanceId}`, { module: 'Background' });

            } catch (err) {
                logger.error(`❌ Ошибка запуска тестового сценария: ${err.message}`, { module: 'Background' });
            }
        })();

        return true; // Для асинхронной отправки ответа
    }

    // TODO: Здесь будут обработчики для других действий (parseOnce, startAutoAnalysis и т.д.)
    // которые мы постепенно перенесем на новую архитектуру.
    // Пока оставим заглушку или старую логику, если нужно проверить MVP.
});

logger.info("🚀 Background service worker запущен и готов к работе.", { module: 'Background' });