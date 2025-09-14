// content/content.js
// window.performScrollNTimes доступна, так как scroller.js был подключен раньше

console.log("[Content Script] Загружен и готов к работе.");

// Слушаем сообщения от background.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("[Content Script] Получено сообщение:", request);

    if (request.action === "scrollNTimes") {
        console.log("[Content Script] Начинаем выполнение скроллинга:", request);

        (async () => {
            try {
                // Используем функцию из глобальной области видимости
                const result = await window.performScrollNTimes(
                    request.count,
                    request.delayMs,
                    request.step,
                    async (current, total) => {
                        try {
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

        return true;
    }

    console.log("[Content Script] Неизвестное сообщение, игнорируем.");
});