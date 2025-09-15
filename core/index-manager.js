// core/index-manager.js

/**
 * Менеджер индексов для отслеживания состояния парсинга.
 * Управляет visitedVideoIds, channelVideoCounts, channelToVideoIds и scrapedData.
 */

// --- 1. Состояние (в памяти background.js) ---
/** @type {Set<string>} - Множество ID видео, на которые мы уже заходили (sourceVideoId). */
let visitedVideoIds = new Set();

/** @type {Map<string, number>} - Словарь: канал -> количество видео из этого канала. */
let channelVideoCounts = new Map();

/** @type {Map<string, Set<string>>} - Словарь: канал -> множество ID видео этого канала. */
let channelToVideoIds = new Map();

/** @type {Array<Object>} - Массив данных, извлеченных в ходе последнего парсинга. */
let scrapedDataBuffer = [];

// --- 2. API для работы с индексами ---

/**
 * Инициализирует индексы, опционально на основе начальных данных.
 * @param {Array<Object>} [initialData=[]] - Массив объектов видео (например, из tableAdapter.getAll()).
 * @returns {Promise<void>}
 */
export async function initialize(initialData = []) {
    console.log("[IndexManager] Инициализация индексов...");
    reset(); // Очищаем текущее состояние

    if (!Array.isArray(initialData) || initialData.length === 0) {
        console.log("[IndexManager] Нет начальных данных для инициализации индексов.");
        return;
    }

    console.log(`[IndexManager] Начинаем построение индексов из ${initialData.length} записей...`);
    let processedCount = 0;

    for (const video of initialData) {
        // --- visitedVideoIds: ID видео, на которые мы заходили (sourceVideoId) ---
        // Предполагаем, что если запись есть, то на это video.sourceVideoId мы уже заходили.
        if (video.sourceVideoId) {
            visitedVideoIds.add(video.sourceVideoId);
        }

        // --- channelVideoCounts: канал -> количество видео ---
        const channel = video.channelName || 'Неизвестный канал';
        const currentCount = channelVideoCounts.get(channel) || 0;
        channelVideoCounts.set(channel, currentCount + 1);

        // --- channelToVideoIds: канал -> множество ID видео ---
        if (!channelToVideoIds.has(channel)) {
            channelToVideoIds.set(channel, new Set());
        }
        if (video.videoId) {
            channelToVideoIds.get(channel).add(video.videoId);
        }

        processedCount++;
    }

    console.log(`[IndexManager] Индексы инициализированы. Обработано записей: ${processedCount}`);
    console.log(`[IndexManager] visitedVideoIds.size: ${visitedVideoIds.size}`);
    console.log(`[IndexManager] channelVideoCounts.size: ${channelVideoCounts.size}`);
    console.log(`[IndexManager] channelToVideoIds.size: ${channelToVideoIds.size}`);
}

/**
 * Сбрасывает все индексы и буфер в начальное состояние.
 */
export function reset() {
    console.log("[IndexManager] Сброс всех индексов и буфера.");
    visitedVideoIds.clear();
    channelVideoCounts.clear();
    channelToVideoIds.clear();
    scrapedDataBuffer = [];
    console.log("[IndexManager] Все индексы и буфер сброшены.");
}

/**
 * Добавляет новые данные в индексы и буфер.
 * @param {Array<Object>} newScrapedData - Массив новых объектов данных видео.
 */
export function addScrapedData(newScrapedData, addToBuffer = true) {
    if (!Array.isArray(newScrapedData) || newScrapedData.length === 0) {
        console.warn("[IndexManager] addScrapedData: Получен пустой или некорректный массив данных.");
        return;
    }
    console.log(`[IndexManager] Добавление ${newScrapedData.length} новых записей в индексы. addToBuffer: ${addToBuffer}`, { module: 'IndexManager' });

    // 1. Добавляем в буфер, если addToBuffer === true
    if (addToBuffer) {
        scrapedDataBuffer.push(...newScrapedData);
        console.log(`[IndexManager] Добавлено ${newScrapedData.length} записей в scrapedDataBuffer. Новый размер буфера: ${scrapedDataBuffer.length}`, { module: 'IndexManager' });
    } else {
        console.log(`[IndexManager] Пропущено добавление в scrapedDataBuffer (addToBuffer=false).`, { module: 'IndexManager' });
    }

    // 2. Обновляем индексы (это всегда нужно делать)
    for (const video of newScrapedData) {
        // visitedVideoIds обновляется, если sourceVideoId является "посещенным"
        // Но в данном случае sourceVideoId - это видео, С КОТОРОГО мы пришли.
        // visitedVideoIds - это скорее ID видео, которые мы ПАРСИЛИ как источник.
        // Если мы хотим отслеживать, какие исходные видео мы уже обработали,
        // то sourceVideoId добавляется в visitedVideoIds.
        // Если мы хотим отслеживать, какие видео мы УЖЕ НАШЛИ (и не должны добавлять снова),
        // то videoId добавляется в отдельный индекс.
        // Для MVP: visitedVideoIds отслеживает sourceVideoId (откуда пришли).
        if (video.sourceVideoId) {
            visitedVideoIds.add(video.sourceVideoId);
            // console.log(`[IndexManager] Добавлен sourceVideoId в visitedVideoIds: ${video.sourceVideoId}`, { module: 'IndexManager' });
        }

        // channelVideoCounts обновляется
        const channel = video.channelName || 'Неизвестный канал';
        const currentCount = channelVideoCounts.get(channel) || 0;
        channelVideoCounts.set(channel, currentCount + 1);
        // console.log(`[IndexManager] Обновлен channelVideoCounts для канала ${channel}: ${currentCount} -> ${currentCount + 1}`, { module: 'IndexManager' });

        // channelToVideoIds обновляется
        if (!channelToVideoIds.has(channel)) {
            channelToVideoIds.set(channel, new Set());
        }
        if (video.videoId) {
            channelToVideoIds.get(channel).add(video.videoId);
            // console.log(`[IndexManager] Добавлен videoId в channelToVideoIds для канала ${channel}: ${video.videoId}`, { module: 'IndexManager' });
        }
    }

    console.log(`[IndexManager] Индексы обновлены.`, { module: 'IndexManager' });
    console.log(`[IndexManager] visitedVideoIds.size: ${visitedVideoIds.size}`, { module: 'IndexManager' });
    console.log(`[IndexManager] channelVideoCounts.size: ${channelVideoCounts.size}`, { module: 'IndexManager' });
    console.log(`[IndexManager] channelToVideoIds.size: ${channelToVideoIds.size}`, { module: 'IndexManager' });

    // 3. Оповещаем подписчиков об обновлении индексов/буфера
    // broadcastDataUpdate(); // Убираем, так как это делает tableAdapter
}

/**
 * Получает текущее состояние всех индексов и буфера.
 * @returns {{ visitedVideoIds: Set<string>, channelVideoCounts: Map<string, number>, channelToVideoIds: Map<string, Set<string>>, scrapedDataBuffer: Array<Object> }}
 */
export function getStateSnapshot() {
    // Возвращаем копии, чтобы предотвратить внешнее мутирование внутреннего состояния
    return {
        visitedVideoIds: new Set(visitedVideoIds),
        channelVideoCounts: new Map(channelVideoCounts),
        channelToVideoIds: new Map(Array.from(channelToVideoIds, ([k, v]) => [k, new Set(v)])),
        scrapedDataBuffer: [...scrapedDataBuffer] // Копия массива
    };
}

/**
 * Получает текущий буфер извлеченных данных.
 * @returns {Array<Object>} Копия массива scrapedDataBuffer.
 */
export function getScrapedDataBuffer() {
    return [...scrapedDataBuffer];
}

/**
 * Очищает буфер извлеченных данных.
 */
export function clearScrapedDataBuffer() {
    console.log("[IndexManager] Очистка буфера извлеченных данных.");
    scrapedDataBuffer = [];
    console.log("[IndexManager] Буфер извлеченных данных очищен.");
}

// --- 3. Вспомогательные функции (по мере необходимости) ---

/**
 * Проверяет, был ли уже посещен указанный sourceVideoId.
 * @param {string} sourceVideoId
 * @returns {boolean}
 */
export function isSourceVisited(sourceVideoId) {
    return visitedVideoIds.has(sourceVideoId);
}

/**
 * Возвращает количество уникальных каналов, найденных в данных.
 * @returns {number}
 */
export function getUniqueChannelCount() {
    return channelVideoCounts.size;
}

/**
 * Возвращает общее количество уникальных видео, найденных в данных.
 * @returns {number}
 */
export function getTotalUniqueVideoCount() {
    // Суммируем количество уникальных видео по всем каналам
    let total = 0;
    for (const videoIdsSet of channelToVideoIds.values()) {
        total += videoIdsSet.size;
    }
    return total;
}

// Экспортируем также функции для получения самих структур, если нужно прямой доступ
// (но рекомендуется использовать getStateSnapshot для согласованности)
export { visitedVideoIds, channelVideoCounts, channelToVideoIds };