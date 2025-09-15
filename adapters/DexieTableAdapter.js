// adapters/DexieTableAdapter.js
import Dexie from '../lib/dexie.min.js';

console.log("[DexieTableAdapter] Dexie импортирован:", typeof Dexie);
/**
 * @typedef {import('../core/types/table.types.js').VideoData} VideoData
 * @typedef {import('../core/types/table.types.js').TableAdapter} TableAdapter
 */

/**
 * Адаптер таблицы, использующий IndexedDB через Dexie.js для хранения больших объемов данных.
 * @implements {TableAdapter}
 */
export class DexieTableAdapter {
    /** @type {Dexie} */
    #db;
    /** @type {string} */
    #tableName;

    /**
     * @param {Object} options
     * @param {string} [options.dbName='YouTubeParserOS_DB']
     * @param {string} [options.tableName='parsedVideos']
     * @param {number} [options.version=1]
     */
    constructor(options = {}) {
        const dbName = options.dbName ?? 'YouTubeParserOS_DB';
        this.#tableName = options.tableName ?? 'parsedVideos';
        const version = options.version ?? 2;

        // Создаем/открываем базу данных Dexie
        this.#db = new Dexie(dbName);

        // Определяем схему таблицы
        // Версия 1
        this.#db.version(version).stores({
            // Название таблицы: индексы. Первичный ключ - auto-incrementing id.
            // Добавляем индексы на поля, по которым будем часто искать/фильтровать.
            [this.#tableName]: '++id, &videoId, sourceVideoId, channelName, isImported, timestamp'
            // ++id - автоинкрементный первичный ключ
            // &videoId - уникальный индекс на videoId
            // sourceVideoId, channelName, isImported, timestamp - обычные индексы
        });

        console.log(`[DexieTableAdapter] Инициализирован. БД: ${dbName}, Таблица: ${this.#tableName}`);
    }

    /**
     * Добавляет одну запись.
     * @param {VideoData} videoData
     * @returns {Promise<void>}
     */
    async add(videoData) {
        try {
            // Dexie автоматически генерирует id, если его нет
            await this.#db.table(this.#tableName).add(videoData);
            this.#broadcastDataUpdate(); // Уведомляем о изменении
        } catch (e) {
            console.error("[DexieTableAdapter] Ошибка добавления записи:", e);
            throw e;
        }
    }

    /**
     * Добавляет массив записей.
     * @param {VideoData[]} videoDataArray
     * @returns {Promise<void>}
     */
    async addBatch(videoDataArray) {
        if (!Array.isArray(videoDataArray) || videoDataArray.length === 0) {
            console.warn("[DexieTableAdapter] addBatch: Получен пустой массив или не массив.");
            return;
        }
        try {
            await this.#db.table(this.#tableName).bulkAdd(videoDataArray);
            console.log(`[DexieTableAdapter] Успешно добавлено ${videoDataArray.length} записей.`);
            this.#broadcastDataUpdate(); // Уведомляем о изменении
        } catch (e) {
            // bulkAdd может прерваться при первой же ошибке или вставить все уникальные
            // Проверим, была ли ошибка из-за уникальности (например, videoId уже есть)
            if (e.name === 'ConstraintError' || e.name === 'BulkError') {
                console.warn("[DexieTableAdapter] Предупреждение при bulkAdd (возможно, дубликаты):", e);
                // Можно повторить с bulkPut или обработать BulkError для частичного успеха
                // Для MVP просто логируем
            } else {
                console.error("[DexieTableAdapter] Ошибка массового добавления записей:", e);
                throw e;
            }
        }
    }

    /**
     * Получает все записи.
     * @returns {Promise<VideoData[]>}
     */
    async getAll() {
        try {
            // Для больших данных может потребоваться постраничное чтение
            return await this.#db.table(this.#tableName).toArray();
        } catch (e) {
            console.error("[DexieTableAdapter] Ошибка получения всех записей:", e);
            return [];
        }
    }

    /**
     * Получает "свежие" данные (не импортированные).
     * @returns {Promise<VideoData[]>}
     */
    async getFreshData() {
        try {
            const table = this.#db.table(this.#tableName);

            // В Dexie, чтобы найти записи, где поле отсутствует (undefined),
            // мы не можем использовать equals(undefined) напрямую в where/or.
            // Вместо этого, получим все записи и отфильтруем вручную.
            // Это менее эффективно, но надежно.

            // 1. Получаем все записи
            const allData = await table.toArray();
            console.log(`[DexieTableAdapter] Получено ${allData.length} записей из таблицы для фильтрации "свежих".`, { module: 'DexieTableAdapter' });

            // 2. Фильтруем "свежие" записи: isImported === false или isImported === undefined
            const freshData = allData.filter(item =>
                item.isImported === false || item.isImported === undefined
            );

            console.log(`[DexieTableAdapter] После фильтрации "свежих" записей: ${freshData.length}.`, { module: 'DexieTableAdapter' });
            return freshData;
        } catch (e) {
            console.error("[DexieTableAdapter] Ошибка получения свежих записей:", e);
            return [];
        }
    }

    /**
     * Очищает все данные.
     * @returns {Promise<void>}
     */
    async clear() {
        try {
            await this.#db.table(this.#tableName).clear();
            console.log("[DexieTableAdapter] Таблица очищена.");
            this.#broadcastDataCleared(); // Уведомляем об очистке
        } catch (e) {
            console.error("[DexieTableAdapter] Ошибка очистки таблицы:", e);
            throw e;
        }
    }

    /**
     * Очищает только импортированные данные.
     * @returns {Promise<void>}
     */
    async clearImported() {
        try {
            console.log("[DexieTableAdapter] Начало очистки импортированных данных...");
            const deleteCount = await this.#db.table(this.#tableName).where('isImported').equals(true).delete();
            console.log(`[DexieTableAdapter] Удалено ${deleteCount} импортированных записей.`);
            this.#broadcastDataUpdate(); // Уведомляем об изменении
        } catch (e) {
            console.error("[DexieTableAdapter] Ошибка очистки импортированных данных:", e);
            throw e;
        }
    }

    /**
     * Получает количество записей.
     * @returns {Promise<number>}
     */
    async getCount() {
        try {
            return await this.#db.table(this.#tableName).count();
        } catch (e) {
            console.error("[DexieTableAdapter] Ошибка получения количества записей:", e);
            return 0;
        }
    }

    /**
     * Получает количество "свежих" записей.
     * @returns {Promise<number>}
     */
    async getFreshCount() {
        try {
            const table = this.#db.table(this.#tableName);

            // Аналогично getFreshData, но используем count()
            const allData = await table.toArray();
            const freshData = allData.filter(item =>
                item.isImported === false || item.isImported === undefined
            );

            const count = freshData.length;

            console.log(`[DexieTableAdapter] Получено количество свежих записей: ${count}`, { module: 'DexieTableAdapter' });
            return count;
        } catch (e) {
            console.error("[DexieTableAdapter] Ошибка получения количества свежих записей:", e);
            return 0;
        }
    }

    // --- Private Methods ---

    /**
     * Отправляет сообщение о том, что данные обновились.
     * @private
     */
    #broadcastDataUpdate() {
        if (typeof chrome !== 'undefined' && chrome.runtime) {
            chrome.runtime.sendMessage({ type: "dataUpdated" }).catch(err => {
                if (!chrome.runtime.lastError) {
                    console.debug("Ошибка при отправке dataUpdated:", err);
                }
            });
        }
    }

    /**
     * Отправляет сообщение о том, что данные очищены.
     * @private
     */
    #broadcastDataCleared() {
        if (typeof chrome !== 'undefined' && chrome.runtime) {
            chrome.runtime.sendMessage({ type: "dataCleared" }).catch(err => {
                if (!chrome.runtime.lastError) {
                    console.debug("Ошибка при отправке dataCleared:", err);
                }
            });
        }
    }
}