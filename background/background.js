// background/background.js — исправленная версия

// 👇 Подключаем logger.js функции (временно встроены, как и раньше)

const LOG_STORAGE_KEY = 'appLogs';
const MAX_LOGS = 500;
let targetTabId = null;
let stopRequested = false;

const UNAVAILABLE_VIDEO_IDS_KEY = 'unavailableVideoIds';

/**
 * Получает список недоступных videoId из хранилища.
 * @returns {Promise<Set<string>>} Множество недоступных ID.
 */

function stopAutoAnalysis() {
    if (isAnalysisRunning) {
        stopRequested = true;
        log("⏹️ Получен запрос на остановку анализа", "warn");
        broadcastAnalysisStatus('stopped');
    } else {
        log("⚠️ Анализ не запущен, остановка не требуется", "info");
    }
}

function broadcastAnalysisStatus(status) {
    chrome.runtime.sendMessage({
        type: "analysisStatus",
        status: status
    });
}

async function getUnavailableVideoIds() {
    return new Promise((resolve) => {
        chrome.storage.local.get([UNAVAILABLE_VIDEO_IDS_KEY], (result) => {
            const ids = result[UNAVAILABLE_VIDEO_IDS_KEY] || [];
            resolve(new Set(ids)); // Используем Set для быстрого поиска O(1)
        });
    });
}

/**
 * Добавляет один или несколько videoId в список недоступных.
 * @param {string | string[]} videoIds - ID видео или массив ID.
 * @returns {Promise<void>}
 */
async function addUnavailableVideoIds(videoIds) {
    const idsToAdd = Array.isArray(videoIds) ? videoIds : [videoIds];
    if (idsToAdd.length === 0) return;

    const currentSet = await getUnavailableVideoIds();
    let changed = false;
    idsToAdd.forEach(id => {
        if (!currentSet.has(id)) {
            currentSet.add(id);
            changed = true;
        }
    });

    if (changed) {
        await chrome.storage.local.set({ [UNAVAILABLE_VIDEO_IDS_KEY]: Array.from(currentSet) });
        console.log(`[Unavailable] Добавлены недоступные видео:`, idsToAdd);
    }
}

/**
 * Проверяет, доступно ли текущее видео.
 * @param {number} tabId - ID вкладки для проверки.
 * @returns {Promise<boolean>} True, если видео доступно, false - если недоступно.
 */

async function log(message, level = "info") {
    const logEntry = {
        id: Date.now() + Math.random().toString(36).substr(2, 9),
        timestamp: Date.now(),
        message,
        level
    };

    const logs = await getLogs();
    logs.push(logEntry);
    if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS);
    await saveLogs(logs);

    broadcastLog(logEntry);
    console.log(`[${level.toUpperCase()}] ${message}`);
    return logEntry;
}

async function getLogs() {
    return new Promise(resolve => {
        chrome.storage.local.get([LOG_STORAGE_KEY], result => {
            resolve(result[LOG_STORAGE_KEY] || []);
        });
    });
}

async function saveLogs(logs) {
    return new Promise(resolve => {
        chrome.storage.local.set({ [LOG_STORAGE_KEY]: logs }, () => resolve());
    });
}

function broadcastLog(logEntry) {
    chrome.runtime.sendMessage({
        type: "newLog",
        log: logEntry
    });
}

async function clearLogs() {
    return new Promise((resolve) => {
        chrome.storage.local.remove([LOG_STORAGE_KEY], () => {
            // 👇 ОТПРАВЛЯЕМ СОБЫТИЕ ВО ВСЕ ОТКРЫТЫЕ POPUP
            chrome.runtime.sendMessage({
                type: "logsCleared"
            }, () => {
                // 👇 Дополнительно: если есть ошибка — логируем
                if (chrome.runtime.lastError) {
                    console.warn("Не удалось отправить logsCleared:", chrome.runtime.lastError.message);
                }
            });
            resolve();
        });
    });
}

// 👇 Добавь эту функцию рядом с другими утилитами

async function clearTable() {
    try {
        await clearVideos(); // используем уже существующую функцию из storage
        await log("✅ Данные таблицы очищены", "success");

        // Рассылаем событие всем popup
        chrome.runtime.sendMessage({
            type: "dataCleared"
        });
    } catch (err) {
        await log(`❌ Ошибка очистки данных: ${err.message}`, "error");
    }
}

// 👇 Если у тебя ещё нет clearVideos — добавь её (обычно уже есть из storage.js)

async function clearVideos() {
    return new Promise(resolve => {
        chrome.storage.local.remove(['parsedVideos'], () => {
            resolve();
        });
    });
}

// 👇 НОВОЕ: слушаем логи от content-script и сохраняем их!
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    if (request.action === "startAutoAnalysis") {
        // 👇 НЕ используем sender.tab.id — получаем активную вкладку сами
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs.find(t => t.url?.includes("youtube.com"));
            if (!tab || !tab.id) {
                log("❌ Не удалось найти активную вкладку YouTube для автоанализа", "error");
                return;
            }
            startAutoAnalysis(request.iterations, tab.id);
        });
        return true;
    }
    // 👇 НОВОЕ: обработка команды на очистку журнала
    if (request.action === "clearLogs") {
        clearLogs(); // background очищает storage и рассылает logsCleared
        return;
    }

    if (request.action === "stopAutoAnalysis") {
        stopAutoAnalysis();
        return true;
    }

    if (request.action === "clearTable") {
        clearTable();
        return;
    }

    // Если пришёл лог от content-script
    if (request.type === "log" && request.message) {
        log(request.message, request.level || "info");
        return;
    }

    // Если пришла команда от popup
    if (request.action === "parseOnce") {
        if (!request.tabId) {
            log("❌ Не передан tabId", "error");
            return;
        }
        handleParseOnce(request.tabId);
        return true;
    }
});

// background/background.js — добавим в начало (после логгера)

const STORAGE_KEY = 'parsedVideos';

async function getVideos() {
    return new Promise(resolve => {
        chrome.storage.local.get([STORAGE_KEY], result => {
            resolve(result[STORAGE_KEY] || []);
        });
    });
}

async function appendVideos(newVideos) {
    const existing = await getVideos();
    const combined = [...existing, ...newVideos];
    return new Promise(resolve => {
        chrome.storage.local.set({ [STORAGE_KEY]: combined }, () => {
            resolve(combined);
        });
    });
}
// 👇 Временно: встроенная функция выбора следующего видео

// background.js

/**
 * Выбирает следующее видео для парсинга по алгоритму: наименее представленные каналы во всей таблице.
 * @param {Array} videos — массив объектов { title, videoId, views, channelName, sourceVideoId, thumbnailUrl }
 * @param {string} currentVideoId — ID текущего видео
 * @param {string} mode — режим выбора ('smart' или 'batch')
 * @returns {Promise<string|null>} videoId следующего видео или null
 */
async function selectNextVideoId(videos, currentVideoId = null, mode = 'smart') {
    await log(`[Selector] 🔍 Начало выбора следующего видео. Режим: ${mode}, Текущее: ${currentVideoId || 'неизвестно'}`, "info");

    if (!videos || videos.length === 0) {
        await log("[Selector] 📉 Нет данных для выбора.", "warn");
        return null;
    }

    // === 1. Получаем список недоступных видео ===
    const unavailableVideoIdsSet = await getUnavailableVideoIds();
    await log(`[Selector] 🚫 Загружено ${unavailableVideoIdsSet.size} недоступных видео из черного списка.`, "info");

    let candidateVideos;
    let contextDescription = "";

    if (mode === 'batch') {
        contextDescription = `из последней подборки (sourceVideoId=${currentVideoId})`;
        await log(`[Selector] 📦 Режим 'batch': фильтруем по sourceVideoId = ${currentVideoId}`, "info");
        candidateVideos = videos.filter(video => video.sourceVideoId === currentVideoId);
        if (candidateVideos.length === 0) {
            await log("[Selector] ⚠️ Нет видео из последней подборки (batch).", "warn");
            return null;
        }
    } else {
        contextDescription = "из всей таблицы";
        await log("[Selector] 🌐 Режим 'smart': используем все видео.", "info");
        candidateVideos = videos;
    }

    // === 2. Фильтруем кандидатов: исключаем текущее, уже исходные и недоступные ===
    // ВАЖНО: Это фильтрация для выбора, но не для подсчета каналов.
    const validCandidates = candidateVideos.filter(video =>
        video.videoId !== currentVideoId && // Не текущее
        !videos.some(v => v.videoId === video.videoId && v.sourceVideoId === video.videoId) && // Не было исходным
        !unavailableVideoIdsSet.has(video.videoId) // Не в черном списке
    );

    await log(`[Selector] ✅ После фильтрации (${contextDescription}): ${validCandidates.length} подходящих видео.`, "info");

    if (validCandidates.length === 0) {
        await log("[Selector] ⚠️ Нет подходящих видео после фильтрации.", "warn");
        return null;
    }

    // === 3. СТАРЫЙ АЛГОРИТМ: Получаем список всех уникальных каналов из отфильтрованных кандидатов ===
    const allChannelsFromCandidates = [...new Set(validCandidates.map(v => v.channelName || 'Неизвестен'))];
    await log(`[Selector] 📊 Найдено ${allChannelsFromCandidates.length} уникальных каналов в подходящих кандидатах.`, "info");

    // === 4. СТАРЫЙ АЛГОРИТМ: Считаем, сколько раз каждый из этих каналов встречается ВО ВСЕЙ таблице ===
    const channelCountMap = {};
    videos.forEach(video => {
        const channel = video.channelName || 'Неизвестен';
        // Считаем только каналы, которые присутствуют среди кандидатов
        if (allChannelsFromCandidates.includes(channel)) {
            channelCountMap[channel] = (channelCountMap[channel] || 0) + 1;
        }
    });

    // === 5. СТАРЫЙ АЛГОРИТМ: Сортируем каналы по возрастанию количества вхождений ВО ВСЕЙ ТАБЛИЦЕ ===
    const sortedChannels = allChannelsFromCandidates
        .map(channel => ({ name: channel, count: channelCountMap[channel] || 0 }))
        .sort((a, b) => a.count - b.count);

    await log(`[Selector] 📈 Каналы отсортированы по количеству вхождений во всей таблице (первые 10):`, "info");
    const topChannelsToShow = Math.min(10, sortedChannels.length);
    for (let i = 0; i < topChannelsToShow; i++) {
        const { name, count } = sortedChannels[i];
        await log(`[Selector]    ${i + 1}. ${name} (${count})`, "info");
    }

    // === 6. Получаем множество (Set) всех videoId, которые уже были sourceVideoId ===
    const usedSourceVideoIds = new Set(videos.map(v => v.sourceVideoId).filter(id => id));
    await log(`[Selector] 🧷 Найдено ${usedSourceVideoIds.size} уникальных 'Исходных видео'.`, "info");

    // === 7. Проходимся по каждому каналу из топ-10 отсортированных каналов ===
    for (let i = 0; i < Math.min(10, sortedChannels.length); i++) {
        const channelName = sortedChannels[i].name;
        await log(`[Selector] 🔍 Проверяем канал: ${channelName} (всего в таблице: ${sortedChannels[i].count})`, "info");

        // 7a. Выбираем все подходящие видео-кандидаты, принадлежащие этому каналу
        // (они уже отфильтрованы на шаге 2, но повторно фильтруем по каналу для ясности и порядка)
        const videosFromThisChannel = validCandidates.filter(
            v => (v.channelName || 'Неизвестен') === channelName
        );

        await log(`[Selector]    Найдено ${videosFromThisChannel.length} подходящих видео в этом канале.`, "info");

        // 7b. Проверяем каждое видео из этого канала (внутриканальный порядок не важен, важен канал)
        for (const video of videosFromThisChannel) {
            // Условия выбора (уже частично проверены на шаге 2, но для полноты логики):
            // - Не является текущим видео (уже проверено)
            // - Его videoId НИКОГДА не было в столбце sourceVideoId (нигде в таблице) (уже проверено)
            // - Не в черном списке недоступных (уже проверено)
            // Повторная проверка на всякий случай и для логирования
            if (
                video.videoId !== currentVideoId &&
                !usedSourceVideoIds.has(video.videoId) &&
                !unavailableVideoIdsSet.has(video.videoId)
            ) {
                await log(`[Selector] 🎯 НАЙДЕНО подходящее видео: ${video.videoId} из канала ${channelName}`, "success");
                return video.videoId;
            } else {
                // Это ветка для отладки, если что-то пошло не так, хотя по идее не должно
                let reason = [];
                if (video.videoId === currentVideoId) reason.push("текущее");
                if (usedSourceVideoIds.has(video.videoId)) reason.push("было исходным");
                if (unavailableVideoIdsSet.has(video.videoId)) reason.push("недоступно");
                await log(`[Selector]    Пропущено видео ${video.videoId}: ${reason.join(', ')}`, "debug");
            }
        }
        await log(`[Selector]    Канал ${channelName} не дал подходящих видео (или все уже проверены).`, "info");
    }

    // === 8. Если ни одно видео не подошло из топ-10 каналов (маловероятно, но возможно) ===
    await log("[Selector] ⚠️ Ни одно видео из топ-10 каналов не подошло.", "warn");

    // === 9. Финальный Fallback: выбираем любое видео из validCandidates, которое не текущее и не было исходным ===
    // Этот fallback теперь тоже учитывает usedSourceVideoIds и unavailableVideoIds
    await log("[Selector] 🔁 Пробуем финальный fallback из отфильтрованных кандидатов...", "info");
    for (const video of validCandidates) {
        if (
            video.videoId !== currentVideoId &&
            !usedSourceVideoIds.has(video.videoId) &&
            !unavailableVideoIdsSet.has(video.videoId)
        ) {
            await log(`[Selector] 🔁 Fallback выбрал видео: ${video.videoId}`, "info");
            return video.videoId;
        }
    }

    // === 10. Абсолютный финальный Fallback: если всё строгое запрещено, выбираем просто не текущее из validCandidates ===
    await log("[Selector] ❗ Пробуем абсолютный fallback (просто не текущее) из отфильтрованных кандидатов...", "warn");
    for (const video of validCandidates) {
        if (video.videoId !== currentVideoId) {
            await log(`[Selector] ❗ Абсолютный fallback выбрал видео: ${video.videoId}`, "warn");
            return video.videoId;
        }
    }

    await log("[Selector] ❌ Абсолютный fallback не удался. Нет подходящих видео.", "error");
    return null;
}

// Убедимся, что старая функция batch не используется напрямую
function selectNextVideoFromLastBatch(videos, currentVideoId) {
    console.warn("selectNextVideoFromLastBatch устарела. Используйте selectNextVideoId с mode='batch'.");
    return null;
}

// 👇 Обновим handleParseOnce — добавим сохранение данных

async function handleParseOnce(tabId, attempt = 1, maxAttempts = 3, isAutoAnalysis = false) {
    // isAutoAnalysis - флаг, указывающий, вызвана ли функция из автоанализа
    await log(`🎯 Попытка ${attempt}/${maxAttempts}: запуск скролла и парсинга на вкладке ${tabId}...`, "info");

    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const targetTab = tabs.find(t => t.id === tabId);

        if (!targetTab) {
            throw new Error("Целевая вкладка не найдена");
        }

        // === ПРОВЕРКА ДОСТУПНОСТИ ТЕКУЩЕГО ВИДЕО ===
        await log(`🔒 Проверка доступности текущего видео...`, "info");
        const isAvailable = await isVideoAvailable(tabId);

        if (!isAvailable) {
            const currentUrl = targetTab.url || 'неизвестный URL';
            await log(`🔒 Текущее видео недоступно (${currentUrl}).`, "warn");

            // Добавляем в черный список
            let currentVideoId = null;
            try {
                const url = new URL(currentUrl);
                currentVideoId = url.searchParams.get('v');
                if (currentVideoId) {
                    await addUnavailableVideoIds(currentVideoId);
                    await log(`🔒 Видео ${currentVideoId} добавлено в черный список недоступных`, "warn");
                }
            } catch (e) {
                console.warn("Не удалось извлечь videoId для добавления в черный список");
            }

            // === ПОПЫТКА ПЕРЕХОДА НА ДОСТУПНОЕ ВИДЕО ===
            // Это ключевое изменение: если видео недоступно, пытаемся сразу перейти на новое
            await log(`🔁 Попытка перехода на доступное видео...`, "info");

            // Получаем все видео для выбора
            const allVideos = await getVideos();

            // Получаем режим выбора
            const mode = await getSelectionMode();

            // Выбираем новое видео, исключая недоступное
            const nextVideoId = await selectNextVideoId(allVideos, currentVideoId, mode);

            if (nextVideoId) {
                await log(`➡️ Выбрано новое видео для перехода: ${nextVideoId}`, "info");
                try {
                    const navResponse = await sendMessageToTab(tabId, {
                        action: "navigateToVideo",
                        videoId: nextVideoId
                    });

                    if (navResponse?.status === "success") {
                        await log(`✅ Переход на видео ${nextVideoId} инициирован`, "success");
                        // Ждем загрузки новой страницы
                        await waitForPageLoad(tabId);

                        // Рекурсивно вызываем handleParseOnce для нового видео
                        // Сбрасываем attempt, так как это новая попытка на новом видео
                        // Передаем флаг isAutoAnalysis, чтобы знать контекст
                        await log(`🔁 Перезапуск парсинга на новом видео...`, "info");
                        return await handleParseOnce(tabId, 1, maxAttempts, isAutoAnalysis);

                    } else {
                        await log(`❌ Не удалось перейти на видео ${nextVideoId}`, "error");
                        // Если переход не удался, и это автоанализ, можно прервать итерацию
                        if (isAutoAnalysis) {
                            await log(`⏭️ Прерываем итерацию из-за ошибки перехода в автоанализе.`, "warn");
                            return; // Завершаем итерацию
                        }
                        // Если это одиночный парсинг, пробуем повторить попытку
                        throw new Error(`Не удалось перейти на выбранное видео ${nextVideoId}`);
                    }
                } catch (navError) {
                    await log(`❌ Ошибка перехода: ${navError.message}`, "error");
                    if (isAutoAnalysis) {
                        await log(`⏭️ Прерываем итерацию из-за ошибки перехода в автоанализе.`, "warn");
                        return; // Завершаем итерацию
                    }
                    throw navError; // Повторяем попытку в обычном режиме
                }
            } else {
                await log("⚠️ Не удалось выбрать новое видео для перехода.", "error");
                // Если не можем выбрать новое видео, завершаем (особенно важно для автоанализа)
                if (isAutoAnalysis) {
                    await log(`⏭️ Прерываем итерацию, так как новое видео не найдено.`, "warn");
                    return; // Завершаем итерацию
                }
                throw new Error("Не удалось выбрать новое видео для перехода с недоступной страницы.");
            }
        }

        // === Если видео доступно, продолжаем обычный парсинг ===
        await log(`✅ Видео доступно, продолжаем парсинг...`, "success");

        await log(`🚀 Отправка команды 'scrollOnly' (попытка ${attempt})...`, "info");

        const response = await sendMessageToTab(tabId, { action: "scrollOnly" });

        if (!response || response.status !== "success") {
            throw new Error(response?.message || "Неизвестная ошибка скролла");
        }

        const cardCount = response.cardCount || 0;
        await log(`✅ Успешно обработано: ${cardCount} видео подсвечено`, "success");

        const scrapedData = response.data || [];
        const currentVideoId = response.currentVideoId || null;

        if (scrapedData.length > 0) {
            const combined = await appendVideos(scrapedData);
            await log(`💾 Сохранено ${scrapedData.length} новых видео. Всего: ${combined.length}`, "success");

            // === Выбор следующего видео ===
            const mode = await getSelectionMode();
            const nextVideoId = await selectNextVideoId(combined, currentVideoId, mode);

            if (nextVideoId) {
                await log(`➡️ Следующее видео (${mode === 'batch' ? 'подборка' : 'умный'}): ${nextVideoId}`, "info");

                // === Переход на выбранное видео ===
                try {
                    const navResponse = await sendMessageToTab(tabId, {
                        action: "navigateToVideo",
                        videoId: nextVideoId
                    });

                    if (navResponse?.status === "success") {
                        await log(`✅ Переход на видео ${nextVideoId} инициирован`, "success");
                        // === Ждем загрузки новой страницы ===
                        await waitForPageLoad(tabId);
                        // === Проверяем доступность НОВОГО видео ===
                        const isNewVideoAvailable = await isVideoAvailable(tabId);
                        if (!isNewVideoAvailable) {
                            await log(`⚠️ Новое видео (${nextVideoId}) недоступно. Добавляем в черный список и повторяем выбор.`, "warn");
                            await addUnavailableVideoIds(nextVideoId);

                            // === Рекурсивный повтор выбора и перехода ===
                            await handleUnavailableVideoRecovery(tabId, combined, currentVideoId, mode);
                        }
                    } else {
                        await log(`❌ Не удалось перейти на видео ${nextVideoId}`, "error");
                    }
                } catch (navError) {
                    await log(`❌ Ошибка перехода: ${navError.message}`, "error");
                }

            } else {
                await log("⚠️ Не удалось выбрать следующее видео (все варианты исключены)", "warn");
            }

            chrome.runtime.sendMessage({
                type: "dataUpdated",
                total: combined.length
            });
        } else {
            await log("⚠️ Данные не извлечены — карточки отсутствуют", "warn");
        }

    } catch (error) {
        console.error(`[Background] Ошибка на попытке ${attempt}:`, error);
        await log(`❌ Ошибка на попытке ${attempt}: ${error.message}`, "error");

        if (attempt >= maxAttempts) {
            await log(`⛔ Превышено количество попыток (${maxAttempts}). Останавливаемся.`, "error");
            // Если это автоанализ, не останавливаем весь процесс, а завершаем итерацию
            if (isAutoAnalysis) {
                await log(`⏭️ Завершаем итерацию из-за превышения попыток.`, "warn");
                return; // Завершаем только итерацию
            }
            return; // Завершаем процесс
        }

        await log(`🔄 Перезагружаем страницу (попытка ${attempt + 1})...`, "warn");

        try {
            await chrome.tabs.reload(tabId);
            await waitForPageLoad(tabId);
            // Рекурсивный вызов с увеличенным номером попытки
            await handleParseOnce(tabId, attempt + 1, maxAttempts, isAutoAnalysis);

        } catch (reloadError) {
            await log(`❌ Не удалось перезагрузить страницу: ${reloadError.message}`, "error");
            if (isAutoAnalysis) {
                await log(`⏭️ Завершаем итерацию из-за ошибки перезагрузки.`, "warn");
                return; // Завершаем только итерацию
            }
        }
    }
}

/**
 * НОВАЯ ФУНКЦИЯ: Обработка случая, когда выбранное видео оказалось недоступным.
 * @param {number} tabId - ID вкладки.
 * @param {Array} allVideos - Все видео из хранилища.
 * @param {string} currentVideoId - ID видео, с которого ушли.
 * @param {string} mode - Режим выбора.
 */
async function handleUnavailableVideoRecovery(tabId, allVideos, currentVideoId, mode) {
    // Выбираем новое видео, зная, что предыдущее в черном списке
    const nextAttemptVideoId = await selectNextVideoId(allVideos, currentVideoId, mode);

    if (nextAttemptVideoId) {
        await log(`🔁 Повторный выбор: ${nextAttemptVideoId}`, "info");
        try {
            const navResponse = await sendMessageToTab(tabId, {
                action: "navigateToVideo",
                videoId: nextAttemptVideoId
            });

            if (navResponse?.status === "success") {
                await log(`✅ Повторный переход на видео ${nextAttemptVideoId}`, "success");
                // Ждем загрузки
                await waitForPageLoad(tabId);
                // Проверяем снова
                const isRetryVideoAvailable = await isVideoAvailable(tabId);
                if (!isRetryVideoAvailable) {
                    await log(`⚠️ Повторно выбранное видео (${nextAttemptVideoId}) тоже недоступно. Добавляем в черный список.`, "warn");
                    await addUnavailableVideoIds(nextAttemptVideoId);
                    // Рекурсивно повторяем
                    await handleUnavailableVideoRecovery(tabId, allVideos, currentVideoId, mode);
                } else {
                    await log(`✅ Повторно выбранное видео доступно.`, "success");
                }
            } else {
                await log(`❌ Не удалось выполнить повторный переход на видео ${nextAttemptVideoId}`, "error");
            }
        } catch (navError) {
            await log(`❌ Ошибка повторного перехода: ${navError.message}`, "error");
        }
    } else {
        await log("⚠️ Не удалось выбрать новое видео даже после исключения недоступного.", "error");
        // Можно добавить более сложную логику, например, переход на homepage
        // или завершение итерации/анализа.
    }
}

// 👇 Новая функция: ждёт, пока страница загрузится
function waitForPageLoad(tabId, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = timeoutMs / 500;

        const checkInterval = setInterval(async () => {
            try {
                // 👇 Запрашиваем вкладку ПО ID, а не по active: true
                const tabs = await chrome.tabs.query({}); // все вкладки
                const tab = tabs.find(t => t.id === tabId);

                if (!tab) {
                    clearInterval(checkInterval);
                    reject(new Error("Вкладка закрыта"));
                    return;
                }

                if (tab.status === "complete") {
                    clearInterval(checkInterval);
                    await log("✅ Страница полностью загружена", "success");
                    resolve();
                    return;
                }

                attempts++;
                if (attempts >= maxAttempts) {
                    clearInterval(checkInterval);
                    reject(new Error("Таймаут ожидания загрузки страницы"));
                }

            } catch (err) {
                clearInterval(checkInterval);
                reject(err);
            }
        }, 500);
    });
}

function sendMessageToTab(tabId, message) {
    return new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, message, (response) => {
            if (chrome.runtime.lastError) {
                console.warn("[Background] Tabs sendMessage error:", chrome.runtime.lastError.message);
                resolve(null);
            } else {
                resolve(response);
            }
        });
    });
}

// 👇 Глобальные переменные для управления циклом
let isAnalysisRunning = false;
let currentIteration = 0;
let totalIterations = 0;

// background.js — обновлённая startAutoAnalysis

async function startAutoAnalysis(iterations, tabId) {
    if (isAnalysisRunning) {
        await log("⚠️ Анализ уже запущен", "warn");
        return;
    }

    targetTabId = tabId;
    isAnalysisRunning = true;
    totalIterations = iterations;
    currentIteration = 0;
    stopRequested = false; // 👈 Сбрасываем флаг при запуске

    await log(`🚀 Запуск автоанализа: ${totalIterations} итераций на вкладке ${targetTabId}`, "info");
    broadcastAnalysisStatus('started'); // 👈 Сообщаем popup, что анализ начался

    try {
        // === ПРЕДВАРИТЕЛЬНАЯ ПРОВЕРКА ДОСТУПНОСТИ НАЧАЛЬНОГО ВИДЕО ===
        await log(`🔒 Предварительная проверка доступности начального видео...`, "info");
        const tabs = await chrome.tabs.query({});
        const targetTab = tabs.find(t => t.id === targetTabId);
        if (targetTab) {
            const isInitialAvailable = await isVideoAvailable(targetTabId);
            if (!isInitialAvailable) {
                await log(`🔒 Начальное видео недоступно (${targetTab.url}). Попытка перехода на доступное...`, "warn");

                const allVideos = await getVideos();
                let currentVideoIdForInitialCheck = null;
                try {
                    const url = new URL(targetTab.url);
                    currentVideoIdForInitialCheck = url.searchParams.get('v');
                    if (currentVideoIdForInitialCheck) {
                        await addUnavailableVideoIds(currentVideoIdForInitialCheck);
                        await log(`🔒 Видео ${currentVideoIdForInitialCheck} добавлено в черный список недоступных`, "warn");
                    }
                } catch (e) {
                    console.warn("Не удалось извлечь videoId начального видео для добавления в черный список");
                }

                const mode = await getSelectionMode();
                const nextVideoId = await selectNextVideoId(allVideos, currentVideoIdForInitialCheck, mode);

                if (nextVideoId) {
                    await log(`➡️ Выбрано новое начальное видео для перехода: ${nextVideoId}`, "info");
                    try {
                        const navResponse = await sendMessageToTab(targetTabId, {
                            action: "navigateToVideo",
                            videoId: nextVideoId
                        });

                        if (navResponse?.status === "success") {
                            await log(`✅ Переход на начальное видео ${nextVideoId} инициирован`, "success");
                            await waitForPageLoad(targetTabId);
                            await log(`✅ Начальная страница загружена. Продолжаем автоанализ.`, "success");
                        } else {
                            await log(`❌ Не удалось перейти на начальное видео ${nextVideoId}. Останавливаю автоанализ.`, "error");
                            throw new Error(`Не удалось перейти на начальное видео ${nextVideoId}`);
                        }
                    } catch (navError) {
                        await log(`❌ Ошибка перехода на начальное видео: ${navError.message}. Останавливаю автоанализ.`, "error");
                        throw navError;
                    }
                } else {
                    await log("⚠️ Не удалось выбрать новое начальное видео. Останавливаю автоанализ.", "error");
                    throw new Error("Не удалось выбрать новое начальное видео для перехода с недоступной страницы.");
                }
            } else {
                await log(`✅ Начальное видео доступно.`, "success");
            }
        } else {
            await log("⚠️ Не удалось найти начальную вкладку для проверки.", "warn");
        }

        // === ОСНОВНОЙ ЦИКЛ АВТОАНАЛИЗА ===
        for (let i = 1; i <= totalIterations; i++) {
            // 👇 Проверяем, не была ли запрошена остановка
            if (stopRequested) {
                await log(`⏹️ Анализ остановлен пользователем на итерации ${i}/${totalIterations}`, "warn");
                break;
            }

            if (!isAnalysisRunning) {
                await log(`⏭️ Автоанализ был остановлен на итерации ${i}.`, "warn");
                break;
            }

            currentIteration = i;
            await log(`🔁 Итерация ${i}/${totalIterations} начата...`, "info");

            // Передаем флаг isAutoAnalysis = true
            await handleParseOnce(targetTabId, 1, 3, true);

            // 👇 Проверяем снова после handleParseOnce
            if (stopRequested) {
                await log(`⏹️ Анализ остановлен пользователем после итерации ${i}/${totalIterations}`, "warn");
                break;
            }

            // Ждём загрузки страницы на targetTabId (на всякий случай)
            await waitForPageLoad(targetTabId);

            // Пауза
            await sleep(2000);
        }

        await log(`🎉 Автоанализ завершён: ${currentIteration} итераций выполнено`, "success");

    } catch (error) {
        await log(`❌ Критическая ошибка в автоанализе: ${error.message}`, "error");
    } finally {
        isAnalysisRunning = false;
        currentIteration = 0;
        totalIterations = 0;
        targetTabId = null;
        stopRequested = false;
        broadcastAnalysisStatus('stopped'); // 👈 Сообщаем popup, что анализ завершился
    }
}

// 👇 Вспомогательная функция задержки
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getSelectionMode() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['selectionMode'], (result) => {
            resolve(result.selectionMode || 'smart');
        });
    });
}

async function isVideoAvailable(tabId) {
    try {
        // Инъектируем скрипт в контекст страницы YouTube для проверки
        const results = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => {
                // Этот код выполняется в контексте страницы YouTube

                // Проверяем URL - если это страница недоступного видео
                if (window.location.pathname === '/unavailable' ||
                    window.location.pathname.includes('unavailable')) {
                    console.log('[VideoCheckInjected] Обнаружен URL недоступного видео');
                    return false;
                }

                // Проверяем наличие плашки недоступности
                const promoRenderer = document.querySelector('ytd-background-promo-renderer');
                if (promoRenderer) {
                    // Проверяем заголовок
                    const titleElement = promoRenderer.querySelector('.promo-title');
                    const titleText = titleElement?.textContent.trim().toLowerCase() || '';

                    // Проверяем тело сообщения
                    const bodyElement = promoRenderer.querySelector('.promo-body-text');
                    const bodyText = bodyElement?.textContent.trim().toLowerCase() || '';

                    // Мультиязычные индикаторы недоступности
                    const unavailableIndicators = [
                        'unavailable', 'недоступно', 'nicht verfügbar', 'no disponible', 'indisponible'
                    ];

                    const privateDeletedIndicators = [
                        'private', 'deleted', 'удалено', 'приватное', 'private video', 'this video is private'
                    ];

                    const isUnavailable = unavailableIndicators.some(indicator =>
                        titleText.includes(indicator)
                    );

                    const isPrivateOrDeleted = privateDeletedIndicators.some(indicator =>
                        bodyText.includes(indicator)
                    );

                    if (isUnavailable || isPrivateOrDeleted) {
                        console.log(`[VideoCheckInjected] Найдена плашка недоступности. Заголовок: '${titleText}', Тело: '${bodyText}'`);
                        return false;
                    }
                }

                // Проверяем наличие плеера
                const player = document.querySelector('#player, ytd-watch-flexy');
                if (!player) {
                    console.log('[VideoCheckInjected] Не найден плеер видео');
                    return false;
                }

                // Если все проверки пройдены - видео доступно
                return true;
            },
        });

        // Результат выполнения скрипта
        const isAvailable = results && results[0] && results[0].result !== undefined ? results[0].result : true;
        console.log(`[VideoCheck] Доступность видео на вкладке ${tabId}: ${isAvailable}`);
        return isAvailable;
    } catch (error) {
        console.warn(`[VideoCheck] Ошибка проверки доступности видео на вкладке ${tabId}:`, error.message);
        // В случае ошибки инъекции - считаем видео недоступным для безопасности
        return false;
    }
}