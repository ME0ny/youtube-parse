// core/utils/metrics.js

import { isLikelyRussian } from './video-selector.js';

/** @type {Array<Object>} */
export const goldNicheVideos = [];

/**
 * Рассчитывает количество новых каналов, найденных в текущей итерации.
 * @param {Array<Object>} scrapedData - Данные, полученные в текущей итерации (из последнего парсинга).
 * @param {Map<string, number>} globalChannelCounts - Глобальный индекс channelVideoCounts (из IndexManager).
 * @param {Function} log - Функция логирования из контекста сценария.
 * @returns {Object} Объект с результатами.
 * @returns {number} .newChannelCount - Количество новых каналов.
 * @returns {Set<string>} .newChannelNames - Названия новых каналов (для дальнейшего анализа).
 */
export function calculateNewChannelsInIteration(scrapedData, globalChannelCounts, log) {

    if (!Array.isArray(scrapedData) || scrapedData.length === 0) {
        return { newChannelCount: 0, newChannelNames: new Set() };
    }

    // Извлекаем уникальные названия каналов из текущей итерации
    const channelsInIteration = new Set(
        scrapedData
            .map(item => item.channelName || 'Неизвестный канал')
            .filter(name => name !== 'Неизвестный канал')
    );

    // Фильтруем только те каналы, которых еще нет в глобальном индексе
    const newChannels = new Set();
    for (const channelName of channelsInIteration) {
        const isAlreadyKnown = globalChannelCounts.has(channelName);
        if (!isAlreadyKnown) {
            newChannels.add(channelName);
        }
    }

    return {
        newChannelCount: newChannels.size,
        newChannelNames: newChannels
    };
}

/**
 * Рассчитывает процент русских каналов среди переданного списка НОВЫХ каналов,
 * используя ТОЛЬКО данные из текущей итерации (scrapedData).
 * Канал считается русским, если более 50% его видео (из текущей итерации) имеют русские названия.
 * @param {Set<string>} newChannelNames - Названия НОВЫХ каналов (результат calculateNewChannelsInIteration).
 * @param {Array<Object>} scrapedData - Данные, полученные в текущей итерации (из последнего парсинга).
 * @param {Function} log - Функция логирования из контекста сценария.
 * @returns {Object} Объект с результатами.
 */
export function calculateRussianChannelRatio(newChannelNames, scrapedData, log) {

    if (newChannelNames.size === 0) {
        // log(`🇷🇺 Нет новых каналов для анализа.`, { module: 'Metrics' });
        return { russianChannelCount: 0, totalChannels: 0, ratio: 0, russianChannelList: [] };
    }

    // 👇 Группируем видео из scrapedData по каналам
    const channelVideosMap = new Map();
    for (const video of scrapedData) {
        const channelName = video.channelName || 'Неизвестный канал';
        if (!channelVideosMap.has(channelName)) {
            channelVideosMap.set(channelName, []);
        }
        channelVideosMap.get(channelName).push(video);
    }

    let russianCount = 0;
    const russianChannelList = [];

    // Анализируем каждый НОВЫЙ канал
    for (const channelName of newChannelNames) {
        // log(`🇷🇺 --- 📺 Анализ НОВОГО канала: "${channelName}" ---`, { module: 'Metrics' });

        const videosInChannel = channelVideosMap.get(channelName) || [];
        if (videosInChannel.length === 0) {
            // log(`🇷🇺   ❌ Для канала "${channelName}" не найдено видео в текущей итерации.`, { module: 'Metrics', level: 'warn' });
            continue;
        }

        // log(`🇷🇺   ✅ Найдено ${videosInChannel.length} видео для канала "${channelName}" в текущей итерации.`, { module: 'Metrics' });

        let russianVideoCount = 0;
        let totalVideoCount = 0;

        // Проверяем каждое видео канала
        for (const video of videosInChannel) {
            if (video.title) {
                totalVideoCount++;
                const isRussian = isLikelyRussian(video.title);
                if (isRussian) {
                    russianVideoCount++;
                }
                // log(`🇷🇺     🎬 Видео ID: ${video.videoId} | Название: "${video.title.substring(0, 40)}${video.title.length > 40 ? '...' : ''}" | Русское: ${isRussian ? '✅' : '❌'}`, { module: 'Metrics' });
            }
        }

        // Канал считается русским, если >50% его видео — русские
        const russianRatio = totalVideoCount > 0 ? (russianVideoCount / totalVideoCount) * 100 : 0;
        const isChannelRussian = totalVideoCount > 0 && russianRatio > 50;

        // log(`🇷🇺   📊 Всего видео с названиями: ${totalVideoCount}`, { module: 'Metrics' });
        // log(`🇷🇺   📊 Русских видео: ${russianVideoCount}`, { module: 'Metrics' });
        // log(`🇷🇺   📊 Процент русских видео: ${russianRatio.toFixed(2)}%`, { module: 'Metrics' });
        // log(`🇷🇺   ${isChannelRussian ? '✅ Канал считается РУССКИМ (проходит порог > 50%)' : '❌ Канал НЕ считается русским (не проходит порог > 50%)'}`, { module: 'Metrics', level: isChannelRussian ? 'success' : 'info' });

        if (isChannelRussian) {
            russianCount++;
            russianChannelList.push(channelName);
        }
    }

    const totalChannels = newChannelNames.size;
    const ratio = totalChannels > 0 ? (russianCount / totalChannels) * 100 : 0;

    // log(`🇷🇺 === 🏁 ИТОГ АНАЛИЗА ===`, { module: 'Metrics' });
    // log(`🇷🇺 Всего проанализировано новых каналов: ${totalChannels}`, { module: 'Metrics' });
    // log(`🇷🇺 Русских каналов: ${russianCount}`, { module: 'Metrics', level: 'success' });
    // log(`🇷🇺 Процент русских каналов: ${ratio.toFixed(2)}%`, { module: 'Metrics', level: 'success' });

    return {
        russianChannelCount: russianCount,
        totalChannels: totalChannels,
        ratio: parseFloat(ratio.toFixed(2)),
        russianChannelList: russianChannelList
    };
}

/** @type {number[]} */
const last10RussianChannelCounts = [];

/**
 * Обновляет метрику среднего количества новых русских каналов за последние 10 итераций.
 * Вызывается в конце каждой успешной итерации парсинга.
 * @param {number} russianChannelCount - Количество новых русских каналов, найденных в ТЕКУЩЕЙ итерации.
 * @param {Function} log - Функция логирования из контекста сценария.
 */
export function updateRussianChannelMetric(russianChannelCount, log) {
    last10RussianChannelCounts.push(russianChannelCount);
    if (last10RussianChannelCounts.length > 10) {
        last10RussianChannelCounts.shift();
    }
    const sum = last10RussianChannelCounts.reduce((acc, val) => acc + val, 0);
    const average = last10RussianChannelCounts.length > 0 ? sum / last10RussianChannelCounts.length : 0;
    const roundedAverage = parseFloat(average.toFixed(2));

    let level = 'info';
    let message = '';
    if (roundedAverage > 7) {
        level = 'success';
        message = `✅ Отлично! Среднее количество новых русских каналов: ${roundedAverage}`;
    } else if (roundedAverage >= 5) {
        level = 'warn';
        message = `⚠️ Обратить внимание: Среднее количество новых русских каналов: ${roundedAverage}`;
    } else {
        level = 'error';
        message = `❌ Проблема: Среднее количество новых русских каналов: ${roundedAverage}`;
    }

    log(message, { module: 'Metrics', level: level });

    // 👇 ВОЗВРАЩАЕМ текущее среднее значение
    return roundedAverage;
}

/**
 * Сбрасывает историю последних 10 значений метрики русских каналов.
 * Используется, например, при сбросе индексов или начале нового сеанса парсинга.
 */
export function resetRussianChannelMetric() {
    last10RussianChannelCounts.length = 0; // Очищаем массив, сохраняя ссылку
    console.log("[Metrics] История метрики русских каналов сброшена.");
}