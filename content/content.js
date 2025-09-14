// content/content.js
// window.performScrollNTimes доступна, так как scroller.js был подключен раньше

console.log("[Content Script] Загружен и готов к работе.");

// Слушаем сообщения от background.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("[Content Script] Получено сообщение:", request);

    if (request.action === "performSingleScroll") {
        console.log("[Content Script] Начинаем выполнение ОДНОГО скролла:", request);

        // Выполняем скролл, вызывая функцию из глобальной области
        window.performSingleScroll(request.step)
            .then(() => {
                console.log("[Content Script] Один скролл выполнен успешно.");
                sendResponse({ status: "success" });
            })
            .catch((err) => {
                console.error("[Content Script] Ошибка выполнения одного скролла:", err);
                sendResponse({ status: "error", message: err.message });
            });

        // Возвращаем true, чтобы указать, что ответ будет асинхронным
        return true;
    }

    console.log("[Content Script] Неизвестное сообщение, игнорируем.");
});