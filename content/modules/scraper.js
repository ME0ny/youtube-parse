// content/modules/scraper.js

/**
 * Извлекает данные из массива DOM-элементов карточек.
 * @param {HTMLElement[]} cardElements - массив DOM-элементов карточек (уже подсвеченных).
 * @param {string} sourceVideoId - ID видео, с которого был совершен переход (текущее видео).
 * @returns {Array<Object>} массив объектов с данными.
 *   Каждый объект содержит: title, videoId, views, channelName, sourceVideoId, thumbnailUrl.
 */
function scrapeCardsFromElements(cardElements, sourceVideoId = 'unknown') {
    console.log(`[Content Module Scraper] Начинаем скрапинг данных из ${cardElements.length} карточек...`);
    const scrapedData = [];

    cardElements.forEach((el, index) => {
        try {
            // --- Извлечение данных из элемента `el` ---
            // Структура HTML может немного отличаться, поэтому селекторы могут потребовать корректировки.

            // 1. Название видео
            // Оригинал: .yt-lockup-metadata-view-model__title
            // Новый вариант (на основе предоставленного HTML):
            const titleElement = el.querySelector('h3.yt-lockup-metadata-view-model__heading-reset a.yt-lockup-metadata-view-model__title');
            // Альтернатива, если предыдущая не сработала:
            // const titleElement = el.querySelector('.yt-lockup-metadata-view-model__title');
            const title = titleElement?.textContent?.trim() || 'Без названия';

            // 2. ID видео из ссылки
            let videoId = 'Не найден';
            // const linkElement = el.querySelector('a[href*="/watch?v="]');
            // Более общий селектор для ссылки на видео внутри карточки
            const linkElement = el.querySelector('a[href^="/watch?v="]');
            if (linkElement) {
                try {
                    const url = new URL(linkElement.href, window.location.origin);
                    videoId = url.searchParams.get('v') || 'Не найден';
                } catch (e) {
                    console.warn(`[Content Module Scraper] Ошибка парсинга URL для карточки ${index}:`, e);
                }
            }

            // 3. Количество просмотров
            let views = 'Неизвестно';
            // Ищем строку метаданных, которая содержит информацию о просмотрах
            const metadataRows = el.querySelectorAll('.yt-content-metadata-view-model__metadata-row');
            for (const row of metadataRows) {
                const rowText = row.textContent || '';
                // Проверяем на наличие просмотров (английский и русский), игнорируя дату после "•"
                // Пример: "21M views • 5 days ago" -> "21M views"
                if (/\b\d+([\.,]?\d+)*\s*[KMBkmb]?\.?\s*(views?|просмотра?|просмотров)/i.test(rowText)) {
                    // Берем текст до первого "•" и убираем лишнее
                    const viewsPart = rowText.split('•')[0].trim();
                    views = viewsPart;
                    break; // Нашли, выходим
                }
            }

            // 4. Название канала
            let channelName = 'Неизвестен';
            // В предоставленном HTML канал находится внутри .yt-content-metadata-view-model__metadata-row
            // и выглядит как: ... ChessMaster <иконка верификации> ...
            // Нужно найти span/text непосредственно перед или после иконки, или просто текст до разделителя.
            const channelMetadataRow = Array.from(metadataRows).find(row =>
                row.querySelector('span.yt-core-attributed-string--link-inherit-color') &&
                !row.querySelector('span.yt-content-metadata-view-model__delimiter') // Исключаем строку с датой
            );

            if (channelMetadataRow) {
                // Берем первый span с именем канала
                const channelSpan = channelMetadataRow.querySelector('span.yt-core-attributed-string--link-inherit-color');
                if (channelSpan) {
                    // Убираем иконку верификации, если она внутри
                    const verifiedIcon = channelSpan.querySelector('.ytIconWrapperHost');
                    if (verifiedIcon) {
                        verifiedIcon.remove(); // Временно удаляем, чтобы не мешала textContent
                    }
                    channelName = channelSpan.textContent?.trim() || 'Неизвестен';
                    if (verifiedIcon) {
                        channelSpan.appendChild(verifiedIcon); // Возвращаем иконку на место
                    }
                } else {
                    // Если span не найден, берем весь текст строки и пытаемся извлечь имя
                    const fullText = channelMetadataRow.textContent || '';
                    // Простая эвристика: имя канала до первого "•"
                    const parts = fullText.split('•');
                    channelName = parts[0]?.trim() || 'Неизвестен';
                }
            }

            // 5. Thumbnail URL
            let thumbnailUrl = '';
            const thumbnailImg = el.querySelector('yt-thumbnail-view-model img.ytCoreImageHost');
            if (thumbnailImg && thumbnailImg.src) {
                thumbnailUrl = thumbnailImg.src;
            }

            // --- Сборка объекта данных ---
            const scrapedItem = {
                title,
                videoId,
                views,
                channelName,
                sourceVideoId, // Передается извне
                thumbnailUrl
            };

            scrapedData.push(scrapedItem);
            // Для отладки, можно логировать первые N элементов
            // if (index < 3) {
            //     console.log(`[Content Module Scraper] Данные из карточки ${index + 1}:`, scrapedItem);
            // }

        } catch (err) {
            console.error(`[Content Module Scraper] Ошибка при скрапинге карточки ${index}:`, err);
            // Добавляем запись об ошибке, чтобы не терять счет
            scrapedData.push({
                title: `Ошибка скрапинга ${index}`,
                videoId: '',
                views: '',
                channelName: '',
                sourceVideoId: sourceVideoId,
                thumbnailUrl: '',
                _scrapeError: err.message // Доп. поле для отладки
            });
        }
    });

    console.log(`[Content Module Scraper] Скрапинг завершён. Извлечено данных: ${scrapedData.length}`);
    return scrapedData;
}

// Экспортируем функцию в глобальную область видимости
window.ytScraper = {
    scrapeCards: scrapeCardsFromElements
};

console.log("[Content Module Scraper] Модуль загружен и готов.");