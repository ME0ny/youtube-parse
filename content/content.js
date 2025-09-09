// content/content.js — обновлённый

// 👇 Добавим утилиту для получения ID текущего видео
function getCurrentVideoId() {
    const url = new URL(window.location.href);
    let videoId = url.searchParams.get('v');

    if (!videoId && window.location.pathname.startsWith('/shorts/')) {
        const pathParts = window.location.pathname.split('/');
        videoId = pathParts[2];
    }

    return videoId || 'unknown';
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "navigateToVideo") {
        console.log("[Content] Получена команда: navigateToVideo", request.videoId);
        const success = window.VideoNavigator.navigate(request.videoId);
        sendResponse({ status: success ? "success" : "error" });
        return true;
    }
    if (request.action === "scrollOnly") {
        console.log("[Content] Получена команда: scrollOnly");

        const currentVideoId = getCurrentVideoId();
        console.log(`[Content] Текущее видео: ${currentVideoId}`);

        window.VideoScroller.scrollNTimes(
            16,
            1500,
            1250,
            (progress) => {
                if (progress.message) {
                    chrome.runtime.sendMessage({
                        type: "log",
                        message: progress.message,
                        source: "scroller"
                    });
                }
                if (progress.done) {
                    console.log("[Content] Скроллинг завершён → запускаем парсинг");

                    // 1. Парсим и подсвечиваем
                    const cards = window.VideoParser.parseAndHighlight();
                    const cardCount = cards.length;

                    chrome.runtime.sendMessage({
                        type: "log",
                        message: `✅ Найдено и подсвечено ${cardCount} видео`,
                        source: "parser"
                    });

                    if (cardCount === 0) {
                        sendResponse({
                            status: "success",
                            message: "Видео не найдены",
                            data: [],
                            sourceVideoId: currentVideoId
                        });
                        return;
                    }

                    // 2. 👇 Скрапим данные
                    const scrapedData = window.VideoScraper.scrape(cards, currentVideoId);
                    console.log(`[Content] Извлечено данных: ${scrapedData.length}`);

                    chrome.runtime.sendMessage({
                        type: "log",
                        message: `📋 Извлечено данных: ${scrapedData.length}`,
                        source: "scraper"
                    });

                    // 3. Отправляем данные в background
                    sendResponse({
                        status: "success",
                        message: "Скролл, парсинг и скрапинг завершены",
                        data: scrapedData,
                        sourceVideoId: currentVideoId,
                        currentVideoId: currentVideoId
                    });
                }
            }
        );

        return true;
    }

    return true;
});