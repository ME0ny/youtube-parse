// core/types/table.types.js

/**
 * @typedef {Object} VideoData
 * @property {string} videoId - Уникальный идентификатор видео.
 * @property {string} title - Название видео.
 * @property {string} channelName - Название канала.
 * @property {string} views - Количество просмотров (в виде строки, например, "1.2M").
 * @property {string} sourceVideoId - ID видео, с которого был совершен переход.
 * @property {string} thumbnailUrl - URL миниатюры.
 * @property {number} timestamp - Временная метка добавления записи.
 * @property {boolean} [isImported] - Флаг, указывающий, что запись была импортирована.
 */

/**
 * @typedef {Object} TableAdapter
 * @property {function(VideoData): Promise<void>} add - Добавляет одну запись.
 * @property {function(VideoData[]): Promise<void>} addBatch - Добавляет несколько записей.
 * @property {function(): Promise<VideoData[]>} getAll - Получает все записи.
 * @property {function(): Promise<void>} clear - Очищает таблицу.
 * @property {function(): Promise<number>} getCount - Получает общее количество записей.
 */