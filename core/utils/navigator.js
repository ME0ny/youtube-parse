// core/utils/navigator.js

/**
 * Переходит на страницу YouTube видео по его ID.
 * @param {Object} context - Контекст сценария (для tabId и логов).
 * @param {string} videoId - ID видео, на которое нужно перейти.
 * @returns {Promise<void>}
 */
export async function navigateToVideo(context, videoId) {
    const { log, tabId } = context;

    if (typeof tabId !== 'number' || tabId < 0) {
        const errorMsg = `Недействительный tabId для навигации: ${tabId}`;
        log(`❌ ${errorMsg}`, { module: 'Navigator', level: 'error' });
        throw new Error(errorMsg);
    }

    if (!videoId || typeof videoId !== 'string') {
        const errorMsg = `Недействительный videoId для перехода: ${videoId}`;
        log(`❌ ${errorMsg}`, { module: 'Navigator', level: 'error' });
        throw new Error(errorMsg);
    }

    const targetUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    log(`🧭 Отправка команды на переход по URL: ${targetUrl}`, { module: 'Navigator' });

    try {
        // Отправляем сообщение в content script для выполнения перехода
        const response = await chrome.tabs.sendMessage(tabId, {
            action: "navigateToVideo",
            url: targetUrl,
            videoId: videoId // Передаем ID для логирования в content script
        });

        if (response && response.status === "success") {
            log(`✅ Команда на переход отправлена.`, { module: 'Navigator' });
        } else {
            const errorMsg = response?.message || "Неизвестная ошибка перехода";
            log(`❌ Ошибка перехода: ${errorMsg}`, { module: 'Navigator', level: 'error' });
            throw new Error(errorMsg);
        }
    } catch (err) {
        log(`❌ Ошибка связи при переходе: ${err.message}`, { module: 'Navigator', level: 'error' });
        throw err; // Пробрасываем для обработки выше
    }
}

/**
 * Переходит на страницу поиска YouTube по заданному запросу.
 * @param {Object} context - Контекст сценария (для tabId и логов).
 * @param {string} query - Поисковый запрос.
 * @returns {Promise<void>}
 */
export async function navigateToSearchQuery(context, query) {
    const { log, tabId } = context;
    if (typeof tabId !== 'number' || tabId < 0) {
        const errorMsg = `Недействительный tabId для перехода к поиску: ${tabId}`;
        log(`❌ ${errorMsg}`, { module: 'Navigator', level: 'error' });
        throw new Error(errorMsg);
    }
    if (!query || typeof query !== 'string') {
        const errorMsg = `Недействительный поисковый запрос: ${query}`;
        log(`❌ ${errorMsg}`, { module: 'Navigator', level: 'error' });
        throw new Error(errorMsg);
    }

    // URL-кодируем запрос для безопасности
    const encodedQuery = encodeURIComponent(query.trim());
    const targetUrl = `https://www.youtube.com/results?search_query=${encodedQuery}`;
    log(`🧭 Отправка команды на переход к поиску: "${query}" → ${targetUrl}`, { module: 'Navigator' });

    try {
        const response = await chrome.tabs.sendMessage(tabId, {
            action: "navigateToUrl",
            url: targetUrl
        });
        if (response && response.status === "success") {
            log(`✅ Команда на переход к поиску отправлена.`, { module: 'Navigator', level: 'success' });
        } else {
            const errorMsg = response?.message || "Неизвестная ошибка перехода";
            log(`❌ Ошибка перехода к поиску: ${errorMsg}`, { module: 'Navigator', level: 'error' });
            throw new Error(errorMsg);
        }
    } catch (err) {
        log(`❌ Ошибка связи при переходе к поиску: ${err.message}`, { module: 'Navigator', level: 'error' });
        throw err;
    }
}