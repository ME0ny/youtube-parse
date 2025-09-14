// core/utils/parser.js

/**
 * Отправляет сообщение в content script для парсинга и подсветки видео.
 * @param {Object} context - Контекст сценария (для tabId и логов).
 * @returns {Promise<{status: string, highlightedCards?: HTMLElement[], highlightedCount?: number, message?: string}>}
 * ВАЖНО: DOM-элементы нельзя передавать через sendMessage, они становятся пустыми объектами {}.
 * Поэтому возвращаем только количество. Для получения самих данных будет следующий шаг (scraping).
 */
export async function parseAndHighlight(context) {
    const { log, tabId } = context;
    // Предполагается, что sourceVideoId будет доступен в context
    // Это может быть ID текущей вкладки, если мы на странице видео, или передано специально.
    // Для MVP возьмем его из URL вкладки или используем заглушку.
    let sourceVideoId = 'unknown_source';
    try {
        if (typeof tabId === 'number' && tabId > 0) {
            const tab = await chrome.tabs.get(tabId);
            const url = new URL(tab.url);
            sourceVideoId = url.searchParams.get('v') || 'unknown_source_from_url';
        }
    } catch (getUrlErr) {
        console.warn("[Core Parser] Не удалось получить sourceVideoId из URL вкладки:", getUrlErr);
        sourceVideoId = 'unknown_source';
    }

    // Переопределяем sourceVideoId, если он передан явно в params (например, из сценария навигации)
    if (context.params && context.params.sourceVideoId) {
        sourceVideoId = context.params.sourceVideoId;
    }

    if (typeof tabId !== 'number' || tabId < 0) {
        const errorMsg = `Недействительный tabId для парсинга: ${tabId}`;
        log(`❌ ${errorMsg}`, { module: 'Parser', level: 'error' });
        throw new Error(errorMsg);
    }

    log(`🔍 Отправка запроса на парсинг, подсветку и скрапинг видео (источник: ${sourceVideoId})...`, { module: 'Parser' });

    try {
        const response = await chrome.tabs.sendMessage(tabId, {
            action: "parseAndHighlight",
            sourceVideoId: sourceVideoId // Передаем sourceVideoId в content script
        });

        if (response && response.status === "success") {
            const count = response.highlightedCount;
            const data = response.scrapedData || [];
            log(`✅ Парсинг, подсветка и скрапинг завершены. Найдено/подсвечено видео: ${count}, извлечено данных: ${data.length}`, { module: 'Parser' });

            // Выводим в консоль background первые N записей для проверки
            const itemsToShow = Math.min(3, data.length);
            if (itemsToShow > 0) {
                console.group(`[Core Parser] Данные первых ${itemsToShow} извлеченных карточек:`);
                for (let i = 0; i < itemsToShow; i++) {
                    const item = data[i];
                    console.log(
                        `Карточка ${i + 1}:`,
                        `ID: ${item.videoId || 'N/A'}`,
                        `Название: "${(item.title || 'N/A').substring(0, 50)}${(item.title || '').length > 50 ? '...' : ''}"`,
                        `Канал: "${(item.channelName || 'N/A').substring(0, 30)}${(item.channelName || '').length > 30 ? '...' : ''}"`
                    );
                }
                console.groupEnd();
            }

            return response; // { status: "success", highlightedCount: number, scrapedData: Array }
        } else {
            const errorMsg = response?.message || "Неизвестная ошибка парсинга/подсветки/скрапинга";
            log(`❌ Ошибка парсинга/подсветки/скрапинга: ${errorMsg}`, { module: 'Parser', level: 'error' });
            throw new Error(errorMsg);
        }
    } catch (err) {
        log(`❌ Ошибка связи при парсинге/подсветке/скрапинге: ${err.message}`, { module: 'Parser', level: 'error' });
        throw err; // Пробрасываем для обработки выше
    }
}

/**
 * Отправляет сообщение в content script для удаления подсветки.
 * @param {Object} context - Контекст сценария (для tabId и логов).
 * @returns {Promise<void>}
 */
export async function removeParserHighlights(context) {
    const { log, tabId } = context;

    if (typeof tabId !== 'number' || tabId < 0) {
        // Не критично, просто логируем
        console.warn("[Core Parser] Недействительный tabId для удаления подсветки:", tabId);
        return;
    }

    log(`🧹 Отправка запроса на удаление подсветки...`, { module: 'Parser' });

    try {
        const response = await chrome.tabs.sendMessage(tabId, {
            action: "removeParserHighlights"
        });

        if (response && response.status === "success") {
            log(`✅ Подсветка удалена.`, { module: 'Parser' });
        } else {
            const errorMsg = response?.message || "Неизвестная ошибка удаления подсветки";
            log(`⚠️ Ошибка удаления подсветки: ${errorMsg}`, { module: 'Parser', level: 'warn' });
            // Не бросаем ошибку, так как это вспомогательная операция
        }
    } catch (err) {
        // Может возникнуть, если вкладка закрыта
        log(`⚠️ Ошибка связи при удалении подсветки: ${err.message}`, { module: 'Parser', level: 'warn' });
    }
}