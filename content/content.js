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

    if (request.action === "parseAndHighlight") {
        console.log("[Content Script] === Получен запрос на парсинг и подсветку ===");
        try {
            // Выполняем парсинг и подсветку, вызывая функцию из глобальной области
            const parsedCardsElements = window.ytParser.parseAndHighlight(); // Это HTMLElement[]
            const count = parsedCardsElements.length;
            console.log(`[Content Script] === Парсинг и подсветка завершены. Найдено карточек: ${count} ===`);

            // НОВОЕ: Собираем outerHTML каждой карточки
            const cardHtmlList = [];
            parsedCardsElements.forEach((element, index) => {
                try {
                    // outerHTML включает сам элемент и все его дочерние
                    cardHtmlList.push(element.outerHTML);
                } catch (serializeErr) {
                    console.error(`[Content Script] Ошибка сериализации HTML для карточки ${index}:`, serializeErr);
                    // Добавляем заглушку, чтобы не терять порядок
                    cardHtmlList.push(`<!-- Ошибка сериализации для карточки ${index} -->`);
                }
            });

            // Возвращаем и количество, и список HTML
            sendResponse({
                status: "success",
                highlightedCount: count,
                cardHtmlList: cardHtmlList // НОВОЕ поле
            });
        } catch (err) {
            console.error("[Content Script] Ошибка парсинга/подсветки:", err);
            sendResponse({ status: "error", message: err.message });
        }
        return true; // keep channel open for async response
    }

    if (request.action === "requestCardDetails") {
        console.log(`[Content Script] Получен запрос на данные по ${request.count} карточкам.`);
        try {
            // 1. Найти все подсвеченные карточки
            const highlightedCards = document.querySelectorAll('.video-highlighted');
            console.log(`[Content Script] Найдено подсвеченных карточек: ${highlightedCards.length}`);

            // 2. Извлечь данные из каждой
            const cardDetails = [];
            highlightedCards.forEach((cardElement, index) => {
                try {
                    // --- Логика извлечения данных, аналогичная core/scraper.js ---
                    // 1. Название видео
                    const titleElement = cardElement.querySelector('.yt-lockup-metadata-view-model__title');
                    const title = titleElement?.textContent?.trim() || 'Без названия';

                    // 2. ID видео из ссылки
                    const linkElement = cardElement.querySelector('a[href*="/watch?v="]');
                    let videoId = 'Не найден';
                    if (linkElement) {
                        try {
                            const url = new URL(linkElement.href);
                            videoId = url.searchParams.get('v') || 'Не удалось извлечь ID';
                        } catch (urlErr) {
                            console.warn(`[Content Script] Ошибка разбора URL для карточки ${index}:`, urlErr);
                        }
                    }

                    // 3. Количество просмотров
                    const viewsElement = cardElement.querySelector('.yt-lockup-metadata-view-model__byline-item');
                    const views = viewsElement?.textContent?.trim() || 'N/A';

                    // 4. Название канала
                    const channelElement = cardElement.querySelector('.yt-lockup-metadata-view-model__secondary-title');
                    const channelName = channelElement?.textContent?.trim() || 'N/A';

                    // 5. URL миниатюры (если нужно)
                    const thumbImg = cardElement.querySelector('img');
                    const thumbnailUrl = thumbImg?.src || 'N/A';

                    cardDetails.push({
                        videoId,
                        title,
                        views,
                        channelName,
                        thumbnailUrl
                        // Можно добавить больше полей при необходимости
                    });
                    console.log(`[Content Script] Данные извлечены для карточки ${index + 1}: ${title.substring(0, 30)}...`);
                } catch (scrapeErr) {
                    console.error(`[Content Script] Ошибка извлечения данных для карточки ${index}:`, scrapeErr);
                    // Добавляем карточку с ошибкой, чтобы сохранить порядок
                    cardDetails.push({
                        videoId: 'Ошибка извлечения',
                        title: `Ошибка: ${scrapeErr.message.substring(0, 50)}`,
                        views: 'N/A',
                        channelName: 'N/A',
                        thumbnailUrl: 'N/A'
                    });
                }
            });

            console.log(`[Content Script] Собрано данных по ${cardDetails.length} карточкам.`);
            sendResponse({
                status: "success",
                cardDetails: cardDetails
            });
        } catch (err) {
            console.error("[Content Script] Ошибка при сборе данных о карточках:", err);
            sendResponse({ status: "error", message: err.message });
        }
        return true; // keep channel open for async response
    }


    console.log("[Content Script] Неизвестное сообщение, игнорируем.");
});