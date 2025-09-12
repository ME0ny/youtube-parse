// content/content.js

console.log("[Content Script] Загружен и готов к работе.");

// Функция для выполнения скроллинга
function performScrollNTimes(count = 16, delayMs = 1500, step = 1000, onProgress = null) {
    return new Promise((resolve) => {
        let current = 0;
        const total = count;

        const scroll = () => {
            if (current >= total) {
                // Подсчитываем карточки после скроллинга
                const estimatedCardCount = document.querySelectorAll('ytd-rich-item-renderer, ytd-compact-video-renderer').length;
                resolve({ status: "success", cardCount: estimatedCardCount });
                return;
            }

            window.scrollBy(0, step);
            current++;

            // Отправляем сообщение о прогрессе
            if (onProgress) {
                onProgress(current, total);
            }

            setTimeout(scroll, delayMs);
        };

        // Начинаем скроллинг
        scroll();
    });
}

// Слушаем сообщения от background.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("[Content Script] Получено сообщение:", request);

    if (request.action === "scrollNTimes") {
        console.log("[Content Script] Начинаем выполнение скроллинга:", request);

        // Обернем в асинхронную IIFE, чтобы использовать async/await внутри
        (async () => {
            try {
                const result = await performScrollNTimes(
                    request.count,
                    request.delayMs,
                    request.step,
                    async (current, total) => {
                        // Отправляем промежуточные логи в background.js
                        try {
                            // Используем специальный тип сообщения, как обсуждали ранее
                            await chrome.runtime.sendMessage({
                                type: "contentLog",
                                message: `Прогресс скроллинга: ${current}/${total}`,
                                level: "info",
                                module: "ContentScroller"
                            });
                        } catch (err) {
                            console.debug("Не удалось отправить промежуточный лог скроллинга:", err);
                        }
                    }
                );
                console.log("[Content Script] Скроллинг завершён, отправляем результат:", result);
                sendResponse(result);
            } catch (err) {
                console.error("[Content Script] Ошибка скроллинга:", err);
                sendResponse({ status: "error", message: err.message });
            }
        })();

        // Возвращаем true, чтобы указать, что ответ будет асинхронным
        return true;
    }

    // Другие обработчики сообщений могут быть здесь позже
    // if (request.action === "parseAndHighlight") { ... }
    // if (request.action === "navigateToVideo") { ... }

    // Если сообщение не распознано, можно ничего не возвращать или вернуть false
    // console.log("[Content Script] Неизвестное сообщение, игнорируем.");
    // return false; // Не обязательно, если не нужно
});

