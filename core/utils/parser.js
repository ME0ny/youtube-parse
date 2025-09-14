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

    if (typeof tabId !== 'number' || tabId < 0) {
        const errorMsg = `Недействительный tabId для парсинга: ${tabId}`;
        log(`❌ ${errorMsg}`, { module: 'Parser', level: 'error' });
        throw new Error(errorMsg);
    }

    log(`🔍 Отправка запроса на парсинг и подсветку видео...`, { module: 'Parser' });

    try {
        const response = await chrome.tabs.sendMessage(tabId, {
            action: "parseAndHighlight"
        });

        if (response && response.status === "success") {
            const count = response.highlightedCount;
            const cardHtmlList = response.cardHtmlList || [];
            log(`✅ Парсинг и подсветка завершены. Найдено и подсвечено видео: ${count}`, { module: 'Parser' });

            // Выводим в консоль background (видна в DevTools popup или background) первые N карточек для проверки
            const cardsToShow = Math.min(3, cardHtmlList.length);
            if (cardsToShow > 0) {
                console.group(`[Core Parser] HTML первых ${cardsToShow} найденных карточек:`);
                for (let i = 0; i < cardsToShow; i++) {
                    console.log(`--- Карточка ${i + 1} (первые 200 символов) ---`);
                    console.log(cardHtmlList[i].substring(0, 200) + (cardHtmlList[i].length > 200 ? '...' : ''));
                }
                console.groupEnd();
            }

            return {
                status: "success",
                highlightedCount: count,
                cardHtmlList: cardHtmlList // Возвращаем список HTML
            };
        } else {
            const errorMsg = response?.message || "Неизвестная ошибка парсинга/подсветки";
            log(`❌ Ошибка парсинга/подсветки: ${errorMsg}`, { module: 'Parser', level: 'error' });
            throw new Error(errorMsg);
        }
    } catch (err) {
        log(`❌ Ошибка связи при парсинге/подсветке: ${err.message}`, { module: 'Parser', level: 'error' });
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