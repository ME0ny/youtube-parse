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

    // --- Обработчики для парсинга и скрапинга ---
    if (request.action === "parseAndHighlight") {
        console.log("[Content Script] === Получен запрос на парсинг, подсветку и скрапинг ===");
        const { sourceVideoId = 'unknown' } = request; // Ожидаем sourceVideoId от background
        console.log("[Content Script] Используем sourceVideoId:", sourceVideoId);

        try {
            // 1. Найти и подсветить карточки
            const parsedCardElements = window.ytParser.parseAndHighlight(); // Это HTMLElement[]
            const count = parsedCardElements.length;
            console.log(`[Content Script] Найдено и подсвечено карточек: ${count}`);

            // 2. Извлечь данные из подсвеченных карточек
            // Передаем массив элементов и sourceVideoId в scraper
            const scrapedData = window.ytScraper.scrapeCards(parsedCardElements, sourceVideoId);
            console.log(`[Content Script] Извлечено данных из ${scrapedData.length} карточек.`);

            // 3. Вернуть данные
            sendResponse({
                status: "success",
                highlightedCount: count,
                scrapedData: scrapedData // Возвращаем сразу извлеченные данные
            });
            console.log("[Content Script] === Данные успешно отправлены ===");

        } catch (err) {
            console.error("[Content Script] Ошибка парсинга/скрапинга:", err);
            sendResponse({
                status: "error",
                message: err.message,
                // Даже при ошибке можем вернуть то, что успели найти
                highlightedCount: 0,
                scrapedData: []
            });
        }
        return true; // keep channel open for async response
    }

    // --- Обработчики для управления подсветкой ---
    if (request.action === "removeParserHighlights") {
        console.log("[Content Script] Получен запрос на удаление подсветки.");
        try {
            window.ytParser.removeHighlights();
            sendResponse({ status: "success" });
        } catch (err) {
            console.error("[Content Script] Ошибка удаления подсветки:", err);
            sendResponse({ status: "error", message: err.message });
        }
        return true;
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

    if (request.action === "checkVideoAvailability") {
        console.log("[Content Script] Получен запрос на проверку доступности видео.");
        (async () => {
            try {
                // Вызываем функцию из модуля video-checker
                const isAvailable = window.ytVideoChecker.isCurrentVideoAvailable();
                console.log(`[Content Script] Видео ${isAvailable ? 'доступно' : 'недоступно'}.`);
                sendResponse({ status: "success", isAvailable: isAvailable });
            } catch (err) {
                console.error("[Content Script] Ошибка проверки доступности видео:", err);
                sendResponse({ status: "error", message: err.message, isAvailable: true }); // В случае ошибки считаем доступным
            }
        })();
        return true; // keep channel open for async response
    }

    if (request.action === "navigateToVideo") {
        console.log("[Content Script] Получена команда на переход по URL:", request.url);
        (async () => {
            try {
                // Проверяем, является ли текущая вкладка той, на которую нужно перейти
                // (на всякий случай, хотя обычно tabId уже правильный)
                // const currentTab = await chrome.tabs.getCurrent();
                // if (currentTab.id !== sender.tab.id) { ... }

                // Выполняем переход, изменяя location.href текущей страницы
                window.location.href = request.url;
                console.log(`[Content Script] Выполнен переход на ${request.url}`);
                // Отправляем успешный ответ
                sendResponse({ status: "success", message: `Переход на ${request.url} инициирован` });
            } catch (err) {
                console.error("[Content Script] Ошибка перехода:", err);
                sendResponse({ status: "error", message: err.message });
            }
        })();
        // Возвращаем true, чтобы указать, что ответ будет асинхронным
        return true;
    }


    console.log("[Content Script] Неизвестное сообщение, игнорируем.");
});