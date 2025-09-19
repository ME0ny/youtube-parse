// core/utils/video-selector.js

import { getUnavailableVideoIds } from './blacklist.js';

/**
 * @typedef {Object} VideoData
 * @property {string} videoId - Уникальный идентификатор видео.
 * @property {string} title - Название видео.
 * @property {string} channelName - Название канала.
 * @property {string} sourceVideoId - ID видео, с которого был совершен переход.
 * @property {string} views - Количество просмотров.
 * @property {string} thumbnailUrl - URL миниатюры.
 * ... другие поля
 */

/**
 * Проверяет, является ли текст, вероятно, рУССКОязычным (а не просто кириллическим).
 * Отсеивает украинские, белорусские и другие не-русские кириллические тексты по характерным символам.
 * @param {string} text - Текст для проверки.
 * @returns {boolean} true, если текст содержит кириллицу и НЕ содержит маркеров других языков, иначе false.
 */
function isLikelyRussian(text) {
    if (!text || typeof text !== 'string') return false;

    // --- 1. Проверяем наличие ЛЮБОЙ кириллицы ---
    // Если кириллицы вообще нет — точно не русский
    const hasCyrillic = /[\u0400-\u04FF\u0500-\u052F]/.test(text);
    if (!hasCyrillic) {
        return false;
    }

    // --- 2. Проверяем наличие маркеров НЕ-РУССКОГО языка ---
    // Украинские буквы, которых нет в русском алфавите
    const ukrainianMarkers = /[іїєґІЇЄҐ]/;
    // Белорусская "ў"
    const belarusianMarkers = /[ўЎ]/;
    // Сербская "ђ", "ћ", "џ" и т.д. (если нужно)
    const serbianMarkers = /[ђћџЂЋЏ]/;

    // Объединяем все маркеры в один регэксп
    const nonRussianMarkers = new RegExp(`[${ukrainianMarkers.source}${belarusianMarkers.source}${serbianMarkers.source}]`);

    // Если найден хотя бы один маркер — считаем, что это НЕ русский текст
    if (nonRussianMarkers.test(text)) {
        return false;
    }

    // --- 3. Дополнительная проверка: наличие характерной украинской "i" (латинская) ---
    // Украинские названия часто используют латинскую "i" вместо кириллической "і" или русской "и"
    // Это сильный индикатор.
    if (text.includes('i') || text.includes('I')) {
        return false;
    }

    // --- 4. Если дошли до сюда: кириллица есть, а запрещённых символов нет — считаем русским ---
    return true;
}

/**
 * Надежный парсер строки просмотров в число.
 * Адаптация Python-функции parse_views_robust.
 * @param {string} viewStr - Строка с количеством просмотров (например, "1.2M", "195 тыс. просмотров").
 * @returns {number} Число просмотров. 0, если не удалось распарсить.
 */
function parseViewsRobust(viewStr) {
    // console.log(viewStr);
    if (!viewStr || typeof viewStr !== 'string') {
        return 0;
    }
    viewStr = viewStr.trim();
    // Случай: URL миниатюры — пропускаем
    if (viewStr.startsWith('http') || viewStr.includes('ytimg.com')) {
        return 0;
    }
    // Случай: "Неизвестно", "No", "—", "—" и подобное
    const unknownValues = ['неизвестно', 'no', '-', '—', '', 'unknown'];
    if (unknownValues.includes(viewStr.toLowerCase())) {
        return 0;
    }
    // Определяем множители для разных суффиксов
    const patterns = [
        // Русский: млрд (без слова "просмотров")
        { regex: /([\d\s\u00A0,\.]+)[\s\u00A0]*млрд\.?/i, multiplier: 1_000_000_000 },
        // Русский: млн (без слова "просмотров")
        { regex: /([\d\s\u00A0,\.]+)[\s\u00A0]*млн\.?/i, multiplier: 1_000_000 },
        // Русский: тыс. (без слова "просмотров")
        { regex: /([\d\s\u00A0,\.]+)[\s\u00A0]*тыс\.?/i, multiplier: 1_000 },
        // Английский: B (billion)
        { regex: /([\d\s\u00A0,\.]+)[\s\u00A0]*[Bb]/i, multiplier: 1_000_000_000 },
        // Английский: M (million)
        { regex: /([\d\s\u00A0,\.]+)[\s\u00A0]*[Mm]/i, multiplier: 1_000_000 },
        // Английский: K (thousand)
        { regex: /([\d\s\u00A0,\.]+)[\s\u00A0]*[Kk]/i, multiplier: 1_000 },
    ];
    for (const { regex, multiplier } of patterns) {
        const match = viewStr.match(regex);
        if (match) {
            let numStr = match[1].replace(/\s/g, '').replace(',', '.');
            try {
                // 👇 ИСПРАВЛЕНО: Используем parseFloat и умножаем, затем Math.floor
                const num = parseFloat(numStr);
                if (isNaN(num)) {
                    continue;
                }
                // console.log("Сработало распознавание паттерна ", num * multiplier);
                return Math.floor(num * multiplier);
            } catch (e) {
                continue; // если не получилось распарсить — пробуем дальше
            }
        }
    }
    // Случай: просто число (возможно, с "просмотров" или без)
    const digitsOnly = viewStr.replace(/[^\d]/g, '');
    if (digitsOnly) {
        try {
            // console.log("Паттерн не сработал ", parseInt(digitsOnly, 10));
            return parseInt(digitsOnly, 10);
        } catch (e) {
            // pass
        }
    }
    // Если ничего не подошло — возвращаем 0
    return 0;
}

/**
 * Выбирает следующее видео для перехода по алгоритму "минимизация количества видео на канал".
 *
 * @param {Object} dependencies - Зависимости для работы функции.
 * @param {Set<string>} dependencies.visitedSourceVideoIds - Множество ID видео, на которые мы уже заходили (sourceVideoId).
 * @param {Map<string, number>} dependencies.channelVideoCounts - Словарь: канал -> количество видео из этого канала.
 * @param {Map<string, Set<string>>} dependencies.channelToVideoIds - Словарь: канал -> множество ID видео этого канала.
 * @param {string} currentVideoId - ID текущего видео (на котором мы сейчас находимся и которое только что спарсили).
 * @param {'current_recommendations' | 'all_videos'} mode - Режим выбора.
 * @param {Array<VideoData>} scrapedData - Массив видео, полученных на текущем шаге (для 'current_recommendations').
 * @param {Object} context - Контекст для логирования.
 * @param {Function} context.log - Функция логирования.
 * @returns {Promise<string|null>} ID следующего видео (videoId) или null, если не удалось выбрать.
 */
export async function selectNextVideo(
    { visitedSourceVideoIds, channelVideoCounts, channelToVideoIds },
    currentVideoId,
    mode,
    scrapedData = [],
    context
) {
    const { log } = context;

    log(`🔍 Начинаем выбор следующего видео. Запрошенный режим: ${mode}, Текущее видео ID: ${currentVideoId}`, { module: 'VideoSelector' });
    log(`👣 Размер списка посещенных sourceVideoId: ${visitedSourceVideoIds.size}`, { module: 'VideoSelector' });
    log(`📈 Размер индекса каналов: ${channelVideoCounts.size}`, { module: 'VideoSelector' });
    log(`🎞️ Размер индекса видео по каналам: ${channelToVideoIds.size}`, { module: 'VideoSelector' });

    try {
        // --- 0. Получаем черный список недоступных видео ---
        const unavailableVideoIdsSet = await getUnavailableVideoIds();
        log(`🔒 Получен черный список недоступных видео. Размер: ${unavailableVideoIdsSet.size}`, { module: 'VideoSelector' });

        // --- 1. Определяем кандидатов в зависимости от исходного режима ---
        let candidateVideos = [];
        let candidateSource = '';
        let effectiveMode = mode; // Изначально используем запрошенный режим

        // --- ВАЖНО: Проверка на количество уникальных каналов ---
        // Определяем кандидатов для проверки количества каналов
        let channelsToCheckForOverride = new Set();
        if (effectiveMode === 'current_recommendations') {
            channelsToCheckForOverride = new Set(scrapedData.map(v => v.channelName || 'Неизвестный канал'));
        } else if (effectiveMode === 'all_videos') {
            // Для 'all_videos' сначала определим топ каналы, как в основном алгоритме
            const allChannels = Array.from(channelVideoCounts.keys());
            const sortedChannels = allChannels
                .map(channel => ({ name: channel, count: channelVideoCounts.get(channel) || 0 }))
                .sort((a, b) => a.count - b.count);
            const top10ChannelsInitial = sortedChannels.slice(0, 10);
            channelsToCheckForOverride = new Set(top10ChannelsInitial.map(c => c.name));
        }

        // Проверка условия: если уникальных каналов меньше 2, переопределяем режим
        if (channelsToCheckForOverride.size < 2) {
            const oldMode = effectiveMode;
            effectiveMode = 'all_videos'; // Принудительно меняем режим
            log(`⚠️ В исходных кандидатах для режима '${oldMode}' найдено менее 2 уникальных каналов (${channelsToCheckForOverride.size}). Режим выбора изменен на '${effectiveMode}'.`, { module: 'VideoSelector', level: 'warn' });
        } else {
            log(`✅ В исходных кандидатах для режима '${effectiveMode}' найдено ${channelsToCheckForOverride.size} уникальных каналов. Продолжаем с этим режимом.`, { module: 'VideoSelector' });
        }
        // --- Конец проверки на количество уникальных каналов ---

        // --- 2. Основная логика выбора кандидатов с учетом эффективного режима ---
        if (effectiveMode === 'current_recommendations') {
            // --- РЕЖИМ: Анализ видео из последней подборки ---
            candidateSource = 'последняя подборка (scrapedData)';
            log(`🎞️ Режим 'current_recommendations': используем ${scrapedData.length} видео из последней подборки.`, { module: 'VideoSelector' });

            // 👇 НОВОЕ: Фильтрация по языку для режима current_recommendations
            let filteredByLanguageScrapedData = [...scrapedData];
            log(`🔤 Применяем фильтрацию по языку для режима 'current_recommendations'...`, { module: 'VideoSelector' });

            // Сначала пробуем отфильтровать по кириллическим символам в названии
            const cyrillicFiltered = scrapedData.filter(v =>
                v.title && isLikelyRussian(v.title)
            );

            if (cyrillicFiltered.length > 0) {
                filteredByLanguageScrapedData = cyrillicFiltered;
                log(`🔤 Фильтрация по кириллическим символам в названии: ${cyrillicFiltered.length}/${scrapedData.length} видео оставлено.`, { module: 'VideoSelector' });
            } else {
                log(`🔤 Фильтрация по кириллическим символам не дала результатов. Оставляем все видео (${scrapedData.length}).`, { module: 'VideoSelector', level: 'warn' });
                // Альтернатива: можно оставить filteredByLanguageScrapedData пустым и перейти к all_videos
                // Но для MVP оставим все видео, если кириллических нет
                // filteredByLanguageScrapedData = []; 
            }

            candidateVideos = filteredByLanguageScrapedData; // Используем отфильтрованные данные
            // 👆 КОНЕЦ НОВОГО: Фильтрация по языку для режима current_recommendations

        } else if (effectiveMode === 'all_videos') {
            // --- РЕЖИМ: Анализ всех видео ---
            candidateSource = 'все видео (channelToVideoIds)';
            log(`🌐 Режим 'all_videos': используем все видео из индексов.`, { module: 'VideoSelector' });

            // 1. Получаем список уникальных каналов из channelVideoCounts
            const allChannels = Array.from(channelVideoCounts.keys());
            log(`📈 Найдено ${allChannels.length} уникальных каналов во всех данных.`, { module: 'VideoSelector' });

            // 2. Сортируем каналы по возрастанию количества видео
            const sortedChannels = allChannels
                .map(channel => ({ name: channel, count: channelVideoCounts.get(channel) || 0 }))
                .sort((a, b) => a.count - b.count);

            log(`📊 Каналы отсортированы по возрастанию количества видео (первые 10):`, { module: 'VideoSelector' });
            sortedChannels.slice(0, 10).forEach((c, i) => {
                log(`   ${i + 1}. ${c.name} (${c.count})`, { module: 'VideoSelector' });
            });

            // 3. Берем первые 10 каналов
            const top10Channels = sortedChannels.slice(0, 10);

            // 4. Собираем все videoId из этих каналов
            const videoIdsFromTopChannels = new Set();
            for (const { name: channelName } of top10Channels) {
                const videoIdsInChannel = channelToVideoIds.get(channelName);
                if (videoIdsInChannel) {
                    for (const id of videoIdsInChannel) {
                        videoIdsFromTopChannels.add(id);
                    }
                }
            }
            log(`🎞️ Собрано ${videoIdsFromTopChannels.size} уникальных videoId из топ-10 каналов.`, { module: 'VideoSelector' });

            // 5. Создаем "виртуальные" объекты VideoData для кандидатов
            candidateVideos = Array.from(videoIdsFromTopChannels).map(videoId => {
                // Найти канал для этого videoId (неэффективно, но для MVP сойдет)
                let channelName = 'Неизвестный канал из Top10';
                for (const { name: chName } of top10Channels) {
                    const videoIds = channelToVideoIds.get(chName);
                    if (videoIds && videoIds.has(videoId)) {
                        channelName = chName;
                        break;
                    }
                }
                return { videoId, channelName };
            });

        } else {
            log(`❓ Неизвестный эффективный режим выбора: ${effectiveMode}. Используем scrapedData как кандидатов.`, { module: 'VideoSelector', level: 'warn' });
            candidateVideos = [...scrapedData];
            candidateSource = 'scrapedData (по умолчанию для неизвестного режима)';
            effectiveMode = 'current_recommendations'; // Уточняем эффективный режим для логики ниже
        }

        if (candidateVideos.length === 0) {
            log(`📉 Нет кандидатов для выбора из источника '${candidateSource}'.`, { module: 'VideoSelector', level: 'warn' });
            return null;
        }

        log(`✅ Получено ${candidateVideos.length} кандидатов для выбора из '${candidateSource}' (эффективный режим: ${effectiveMode}).`, { module: 'VideoSelector' });

        // --- 3. Фильтрация кандидатов ---
        const filteredCandidates = candidateVideos.filter(v =>
            v.videoId &&
            v.videoId !== currentVideoId &&
            !unavailableVideoIdsSet.has(v.videoId)
        );

        log(`🧹 После фильтрации (не текущее, не недоступное): ${filteredCandidates.length} видео.`, { module: 'VideoSelector' });
        if (filteredCandidates.length === 0) {
            log(`📉 Нет кандидатов после фильтрации.`, { module: 'VideoSelector', level: 'warn' });
            return null;
        }

        // --- 4. Сортировка каналов кандидатов по глобальному количеству видео ---
        const candidateChannelsMap = new Map();
        for (const video of filteredCandidates) {
            const channel = video.channelName || 'Неизвестный канал';
            if (!candidateChannelsMap.has(channel)) {
                candidateChannelsMap.set(channel, { count: 0, videos: [] });
            }
            const globalCount = channelVideoCounts.get(channel) || 0;
            candidateChannelsMap.get(channel).count = globalCount;
            candidateChannelsMap.get(channel).videos.push(video);
        }

        // 👇 НОВОЕ: Получаем массив каналов
        const candidateChannelsArray = Array.from(candidateChannelsMap.entries())
            .map(([name, data]) => ({ name, ...data }));

        // 👇 НОВОЕ: Сортируем сначала по глобальному количеству видео (count)
        candidateChannelsArray.sort((a, b) => a.count - b.count);

        // 👇 НОВОЕ: Дополнительная сортировка для каналов с count === 1
        // Находим индекс первого канала с count > 1
        const firstNonSingleIndex = candidateChannelsArray.findIndex(channel => channel.count > 1);
        const singleVideoChannelsEndIndex = firstNonSingleIndex === -1 ? candidateChannelsArray.length : firstNonSingleIndex;

        // Сортируем подмассив каналов с count === 1 по просмотрам их видео (по убыванию)
        if (singleVideoChannelsEndIndex > 0) {
            const singleVideoChannels = candidateChannelsArray.slice(0, singleVideoChannelsEndIndex);
            singleVideoChannels.sort((a, b) => {
                // Берем первое (и единственное) видео из списка для каждого канала
                const videoA = a.videos[0];
                const videoB = b.videos[0];
                const viewsA = parseViewsRobust(videoA.views || '');
                const viewsB = parseViewsRobust(videoB.views || '');
                // Сортируем по убыванию просмотров
                return viewsB - viewsA;
            });
            // Заменяем отсортированный подмассив в основном массиве
            candidateChannelsArray.splice(0, singleVideoChannelsEndIndex, ...singleVideoChannels);
        }

        // 👇 Переименовываем для ясности
        const sortedCandidateChannels = candidateChannelsArray;

        log(`📊 Каналы кандидатов отсортированы по глобальному количеству видео (первые 10):`, { module: 'VideoSelector' });
        sortedCandidateChannels.slice(0, 10).forEach((c, i) => {
            log(`   ${i + 1}. ${c.name} (${c.count})`, { module: 'VideoSelector' });
            // 👇 ДОПОЛНИТЕЛЬНО: Для каналов с одним видео логируем просмотры
            if (c.count === 1 && c.videos.length > 0) {
                const viewsNum = parseViewsRobust(c.videos[0].views || '');
                log(`      👁️  Просмотры: ${viewsNum}`, { module: 'VideoSelector' });
            }
        });

        // --- 5. Поиск подходящего видео ---
        log(`🔍 Начинаем поиск подходящего видео по топ-каналам...`, { module: 'VideoSelector' });

        for (let i = 0; i < Math.min(10, sortedCandidateChannels.length); i++) {
            const channelData = sortedCandidateChannels[i];
            const channelName = channelData.name;
            const channelVideos = channelData.videos;
            log(`🔍 Проверяем канал: ${channelName} (глобальное количество: ${channelData.count})`, { module: 'VideoSelector' });

            for (const video of channelVideos) {
                if (!visitedSourceVideoIds.has(video.videoId)) {
                    log(`🎯 НАЙДЕНО подходящее видео: ${video.videoId} из канала ${channelName}`, { module: 'VideoSelector', level: 'success' });
                    return video.videoId;
                } else {
                    log(`⏭️ Пропущено видео ${video.videoId} (уже было sourceVideoId)`, { module: 'VideoSelector' });
                }
            }
        }

        // --- 6. Fallback: случайное видео из отфильтрованных кандидатов ---
        log(`🔄 Поиск по топ-каналам не дал результата. Пробуем случайное видео из отфильтрованных кандидатов...`, { module: 'VideoSelector', level: 'warn' });
        if (filteredCandidates.length > 0) {
            const randomIndex = Math.floor(Math.random() * filteredCandidates.length);
            const randomVideo = filteredCandidates[randomIndex];
            log(`🎲 Fallback выбрал случайное видео: ${randomVideo.videoId}`, { module: 'VideoSelector', level: 'warn' });
            return randomVideo.videoId;
        }

        log(`❌ Не удалось выбрать следующее видео.`, { module: 'VideoSelector', level: 'error' });
        return null;

    } catch (err) {
        log(`❌ Ошибка в процессе выбора следующего видео: ${err.message}`, { module: 'VideoSelector', level: 'error' });
        console.error("[VideoSelector] Stack trace:", err);
        return null;
    }
}