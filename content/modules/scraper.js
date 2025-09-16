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
                // console.log(`[Content Module Scraper Debug] Проверка строки метаданных: "${rowText}"`); // <-- Лог для отладки

                // Проверяем на наличие просмотров (английский и русский), игнорируя дату после "•"
                // Примеры: "21M views • 5 days ago", "195 тыс. просмотров • 2 дня назад"
                // Учитываем неразрывные пробелы (\u00A0) и обычные пробелы
                const normalizedText = rowText.replace(/\u00A0/g, ' '); // Заменяем неразрывный пробел на обычный для поиска

                // Паттерн для поиска: число + (опционально K/M/B или тыс./млн./млрд.) + (views/view/просмотр/просмотра/просмотров)
                // \b - граница слова
                // [\d\s\u00A0,.]+ - одна или более цифра, пробел, неразрывный пробел, запятая или точка
                // (?:K|M|B|k|m|b|тыс\.?|млн\.?|млрд\.?) - не сохраняющая группа для множителей
                // \s* - ноль или более пробельных символов
                // (?:views?|просмотра?|просмотров|view) - не сохраняющая группа для слов "views", "view", "просмотр", "просмотра", "просмотров"
                // .*? - ленивый захват всего до "•" или конца строки
                // (?:\s*•.*)? - не сохраняющая группа для " • ..." в конце, опциональная
                // $ - конец строки (опционально, так как текст может продолжаться)
                const viewsPattern = /([\d\s\u00A0,.]+(?:K|M|B|k|m|b|тыс\.?|млн\.?|млрд\.?)?\s*(?:views?|просмотра?|просмотров|view))/i;

                const match = normalizedText.match(viewsPattern);

                if (match) {
                    // match[1] содержит найденную подстроку с числом и словом
                    let viewsPart = match[1].trim();
                    // console.log(`[Content Module Scraper Debug] Найдена потенциальная строка просмотров: "${viewsPart}"`); // <-- Лог для отладки

                    // Убираем слово "views/view/просмотр/просмотра/просмотров" из строки
                    // Это делает результат чище, как в предыдущем коде
                    viewsPart = viewsPart
                        .replace(/\s*(?:views?|просмотра?|просмотров|view)\s*$/i, '') // Убираем слово в конце
                        .trim();

                    // Берем часть до "•", если она есть (на случай, если паттерн захватил больше)
                    const parts = viewsPart.split('•');
                    views = parts[0].trim();

                    // console.log(`[Content Module Scraper Debug] Извлечены просмотры: "${views}"`); // <-- Лог для отладки
                    break; // Нашли, выходим из цикла
                }
            }
            // Если views всё ещё 'Неизвестно', попробуем упрощённый подход, как в предыдущем коде
            if (views === 'Неизвестно') {
                // console.log(`[Content Module Scraper Debug] Простой поиск по ключевым словам...`); // <-- Лог для отладки
                for (const row of metadataRows) {
                    const rowText = row.textContent || '';
                    const normalizedText = rowText.replace(/\u00A0/g, ' ');
                    // Простая проверка на наличие ключевых слов
                    if (/\b(?:views?|просмотра?|просмотров|view)\b/i.test(normalizedText)) {
                        // console.log(`[Content Module Scraper Debug] Найдено ключевое слово в: "${normalizedText}"`); // <-- Лог для отладки
                        // Берем часть до "•"
                        const parts = normalizedText.split('•');
                        const potentialViews = parts[0].trim();
                        // Простая очистка: убираем всё после последнего слова, похожего на "views/просмотры"
                        const cleaned = potentialViews.replace(/\s*(?:views?|просмотра?|просмотров|view)\s*$/i, '').trim();
                        if (cleaned) {
                            views = cleaned;
                            // console.log(`[Content Module Scraper Debug] Извлечены просмотры (простой способ): "${views}"`); // <-- Лог для отладки
                            break;
                        }
                    }
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