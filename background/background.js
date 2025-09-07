// background/background.js — исправленная версия

// 👇 Подключаем logger.js функции (временно встроены, как и раньше)

const LOG_STORAGE_KEY = 'appLogs';
const MAX_LOGS = 500;
let targetTabId = null;

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

function selectNextVideoId(videos, currentVideoId = null) {
    if (!videos || videos.length === 0) {
        return null;
    }

    // 1. Группируем по каналам
    const channelGroups = {};
    videos.forEach(video => {
        const channel = video.channelName || 'Неизвестен';
        if (!channelGroups[channel]) {
            channelGroups[channel] = [];
        }
        channelGroups[channel].push(video);
    });

    // 2. Сортируем каналы по количеству видео (от меньшего к большему)
    const sortedChannels = Object.entries(channelGroups)
        .sort(([, a], [, b]) => a.length - b.length);

    // 3. Пробуем 10 каналов с наименьшим количеством видео
    for (let i = 0; i < Math.min(10, sortedChannels.length); i++) {
        const [channelName, videoList] = sortedChannels[i];

        // Ищем первое видео, которое:
        // - не было исходным (videoId !== sourceVideoId)
        // - не является текущим (videoId !== currentVideoId)
        for (const video of videoList) {
            if (
                video.videoId !== video.sourceVideoId &&
                video.videoId !== currentVideoId
            ) {
                return video.videoId;
            }
        }

        // Если не нашли "идеальное" — ищем просто не текущее
        for (const video of videoList) {
            if (video.videoId !== currentVideoId) {
                return video.videoId;
            }
        }
    }

    // 4. ФИНАЛЬНЫЙ FALLBACK: берём первое видео из всей таблицы, не равное текущему
    for (const video of videos) {
        if (video.videoId !== currentVideoId) {
            return video.videoId;
        }
    }

    // 5. АБСОЛЮТНЫЙ FALLBACK: если ВСЁ равно currentVideoId — возвращаем первый ID
    // (теоретически невозможно при videos.length > 1, но на всякий случай)
    return videos[0]?.videoId || null;
}

// 👇 Обновим handleParseOnce — добавим сохранение данных

async function handleParseOnce(tabId, attempt = 1, maxAttempts = 3) {
    await log(`🎯 Попытка ${attempt}/${maxAttempts}: запуск скролла и парсинга на вкладке ${tabId}...`, "info");

    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const targetTab = tabs.find(t => t.id === tabId);

        if (!targetTab) {
            throw new Error("Целевая вкладка не найдена");
        }

        await log(`🚀 Отправка команды 'scrollOnly' (попытка ${attempt})...`, "info");

        const response = await sendMessageToTab(tabId, { action: "scrollOnly" });

        if (!response || response.status !== "success") {
            throw new Error(response?.message || "Неизвестная ошибка скролла");
        }

        const cardCount = response.cardCount || 0;
        await log(`✅ Успешно обработано: ${cardCount} видео подсвечено`, "success");

        // 👇 НОВОЕ: получаем и сохраняем данные
        const scrapedData = response.data || [];
        const sourceVideoId = response.sourceVideoId || 'unknown';

        if (scrapedData.length > 0) {
            const combined = await appendVideos(scrapedData);
            await log(`💾 Сохранено ${scrapedData.length} новых видео. Всего: ${combined.length}`, "success");

            // 👇 ПОЛУЧАЕМ currentVideoId из response
            const currentVideoId = response.currentVideoId || null;

            // 👇 ВЫЗЫВАЕМ АЛГОРИТМ С УЧЁТОМ ТЕКУЩЕГО ВИДЕО
            const nextVideoId = selectNextVideoId(combined, currentVideoId);

            if (nextVideoId) {
                await log(`➡️ Следующее видео для парсинга: ${nextVideoId}`, "info");

                // 👇 НОВОЕ: отправляем команду на переход
                try {
                    const navResponse = await sendMessageToTab(tabId, {
                        action: "navigateToVideo",
                        videoId: nextVideoId
                    });

                    if (navResponse?.status === "success") {
                        await log(`✅ Переход на видео ${nextVideoId} инициирован`, "success");
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
            return;
        }

        await log(`🔄 Перезагружаем страницу (попытка ${attempt + 1})...`, "warn");

        try {
            await chrome.tabs.reload(tabId);
            await waitForPageLoad(tabId);
            await handleParseOnce(tabId, attempt + 1, maxAttempts);

        } catch (reloadError) {
            await log(`❌ Не удалось перезагрузить страницу: ${reloadError.message}`, "error");
        }
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

async function startAutoAnalysis(iterations, tabId) {
    if (isAnalysisRunning) {
        await log("⚠️ Анализ уже запущен", "warn");
        return;
    }

    if (!tabId) {
        await log("❌ Не передан tabId для автоанализа", "error");
        return;
    }

    // 👇 ЗАПОМИНАЕМ tabId — будем использовать его во всех итерациях
    targetTabId = tabId;
    isAnalysisRunning = true;
    totalIterations = iterations;
    currentIteration = 0;

    await log(`🚀 Запуск автоанализа: ${totalIterations} итераций на вкладке ${targetTabId}`, "info");

    try {
        for (let i = 1; i <= totalIterations; i++) {
            if (!isAnalysisRunning) break; // если остановили вручную

            currentIteration = i;
            await log(`🔁 Итерация ${i}/${totalIterations} начата...`, "info");

            // 👇 Используем targetTabId, а не активную вкладку
            await handleParseOnce(targetTabId, 1, 3);

            // Ждём загрузки страницы на targetTabId
            await waitForPageLoad(targetTabId);

            // Пауза
            await sleep(2000);
        }

        await log(`🎉 Автоанализ завершён: ${totalIterations} итераций выполнено`, "success");

    } catch (error) {
        await log(`❌ Критическая ошибка в автоанализе: ${error.message}`, "error");
    } finally {
        isAnalysisRunning = false;
        currentIteration = 0;
        totalIterations = 0;
        targetTabId = null; // 👈 Сбрасываем
    }
}

// 👇 Вспомогательная функция задержки
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}