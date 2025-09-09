// core/selector.js

/**
 * Выбирает следующее видео для парсинга по улучшенному алгоритму:
 * 1. Группирует по каналам
 * 2. Сортирует каналы по возрастанию количества видео
 * 3. Проверяет до 10 каналов с наименьшим количеством
 * 4. Для каждого канала ищет видео, которое:
 *    - не является текущим
 *    - не было исходным
 * 5. Если не нашёл — берёт первое подходящее из таблицы
 */
async function selectNextVideoId(videos, currentVideoId = null, mode = 'smart') {
    console.log(`[Selector] Выбор следующего видео. Режим: ${mode}, Текущее: ${currentVideoId}`);

    if (!videos || videos.length === 0) {
        console.log("[Selector] Нет данных для выбора.");
        return null;
    }

    let candidateVideos;

    if (mode === 'batch') {
        // BATCH MODE: Только видео, найденные на странице текущего видео
        console.log("[Selector] Режим 'batch': фильтруем по sourceVideoId =", currentVideoId);
        candidateVideos = videos.filter(video => video.sourceVideoId === currentVideoId);
        if (candidateVideos.length === 0) {
            console.log("[Selector] Нет видео из последней подборки (batch).");
            // Можно вернуть null или переключиться на smart mode.
            // Пока вернем null, как и было.
            return null;
        }
    } else {
        // SMART MODE: Все видео
        console.log("[Selector] Режим 'smart': используем все видео.");
        candidateVideos = videos;
    }

    // === НОВЫЙ АЛГОРИТМ ВЫБОРА ===

    // 1. Получаем список всех уникальных каналов из кандидатов
    const allChannels = [...new Set(candidateVideos.map(v => v.channelName || 'Неизвестен'))];
    console.log(`[Selector] Найдено ${allChannels.length} уникальных каналов в кандидатах.`);

    // 2. Считаем, сколько раз каждый канал встречается ВО ВСЕЙ таблице
    const channelCountMap = {};
    videos.forEach(video => {
        const channel = video.channelName || 'Неизвестен';
        channelCountMap[channel] = (channelCountMap[channel] || 0) + 1;
    });

    // 3. Сортируем каналы по возрастанию количества вхождений
    const sortedChannels = allChannels
        .map(channel => ({ name: channel, count: channelCountMap[channel] || 0 }))
        .sort((a, b) => a.count - b.count);

    console.log(`[Selector] Каналы отсортированы по количеству вхождений (первые 10):`, sortedChannels.slice(0, 10));

    // 4. Берем топ 10 каналов с наименьшим количеством вхождений
    const top10Channels = sortedChannels.slice(0, 10).map(c => c.name);
    console.log(`[Selector] Топ 10 каналов для проверки:`, top10Channels);

    // 5. Получаем множество (Set) всех videoId, которые уже были sourceVideoId
    // Это ключевая часть для предотвращения зацикливания
    const usedSourceVideoIds = new Set(videos.map(v => v.sourceVideoId).filter(id => id));
    console.log(`[Selector] Найдено ${usedSourceVideoIds.size} уникальных 'Исходных видео'.`);

    // 6. Проходимся по каждому каналу из топ-10
    for (const channelName of top10Channels) {
        console.log(`[Selector] Проверяем канал: ${channelName}`);

        // 7. Выбираем все видео-кандидаты, принадлежащие этому каналу
        const videosFromThisChannel = candidateVideos.filter(
            v => (v.channelName || 'Неизвестен') === channelName
        );

        // 8. Проверяем каждое видео из этого канала
        for (const video of videosFromThisChannel) {
            // Условия выбора:
            // - Не является текущим видео
            // - Его videoId НИКОГДА не было в столбце sourceVideoId (нигде в таблице)
            if (
                video.videoId !== currentVideoId &&
                !usedSourceVideoIds.has(video.videoId)
            ) {
                console.log(`[Selector] НАЙДЕНО подходящее видео: ${video.videoId} из канала ${channelName}`);
                return video.videoId;
            } else {
                if (video.videoId === currentVideoId) {
                    console.log(`[Selector] Пропущено (текущее): ${video.videoId}`);
                } else if (usedSourceVideoIds.has(video.videoId)) {
                    console.log(`[Selector] Пропущено (уже было исходным): ${video.videoId}`);
                }
            }
        }
        console.log(`[Selector] Канал ${channelName} не дал подходящих видео.`);
    }

    // 9. Если ни одно видео не подошло из топ-10 каналов
    console.log("[Selector] Ни одно видео из топ-10 каналов не подошло.");

    // 10. Финальный Fallback: выбираем любое видео, которое не текущее и не было исходным
    console.log("[Selector] Пробуем финальный fallback...");
    for (const video of candidateVideos) {
        if (
            video.videoId !== currentVideoId &&
            !usedSourceVideoIds.has(video.videoId)
        ) {
            console.log(`[Selector] Fallback выбрал видео: ${video.videoId}`);
            return video.videoId;
        }
    }

    // Абсолютный финальный Fallback: если всё строгое запрещено, выбираем просто не текущее
    // (крайне маловероятно, если таблица большая)
    console.log("[Selector] Пробуем абсолютный fallback (не текущее)...");
    for (const video of candidateVideos) {
        if (video.videoId !== currentVideoId) {
            console.log(`[Selector] Абсолютный fallback выбрал видео: ${video.videoId}`);
            return video.videoId;
        }
    }

    console.log("[Selector] Абсолютный fallback не удался. Нет подходящих видео.");
    return null;
}

// Убедимся, что старая функция batch не используется напрямую
function selectNextVideoFromLastBatch(videos, currentVideoId) {
    console.warn("selectNextVideoFromLastBatch устарела. Используйте selectNextVideoId с mode='batch'.");
    return null;
}

// Экспортируем
window.VideoSelector = {
    selectNextVideoId,
    selectNextVideoFromLastBatch
};