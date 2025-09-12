// adapters/ChromeStorageTableAdapter.js

/**
 * @typedef {import('../core/types/table.types.js').VideoData} VideoData
 * @typedef {import('../core/types/table.types.js').TableAdapter} TableAdapter
 */

export class ChromeStorageTableAdapter {
    /** @type {string} */
    #storageKey;
    /** @type {number} */
    #maxSize;

    /**
     * @param {Object} options
     * @param {string} [options.storageKey='parsedVideos']
     * @param {number} [options.maxSize=100000]
     */
    constructor(options = {}) {
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
            throw new Error('ChromeStorageTableAdapter: chrome.storage.local is not available.');
        }

        this.#storageKey = options.storageKey ?? 'parsedVideos';
        this.#maxSize = options.maxSize ?? 100000; // Увеличенный размер для больших данных
    }

    /**
     * @param {VideoData} videoData
     * @returns {Promise<void>}
     */
    async add(videoData) {
        try {
            const allData = await this.getAll();
            allData.push(videoData);

            // Ограничиваем размер, удаляя старые записи с начала
            if (allData.length > this.#maxSize) {
                allData.splice(0, allData.length - this.#maxSize);
            }

            await chrome.storage.local.set({ [this.#storageKey]: allData });

            // Отправляем сообщение всем popup'ам об обновлении данных
            this.#broadcastDataUpdate();
        } catch (e) {
            console.error("[ChromeStorageTableAdapter] Ошибка добавления записи:", e);
            throw e;
        }
    }

    /**
     * @param {VideoData[]} videoDataArray
     * @returns {Promise<void>}
     */
    async addBatch(videoDataArray) {
        if (!Array.isArray(videoDataArray) || videoDataArray.length === 0) {
            return;
        }

        try {
            const allData = await this.getAll();
            allData.push(...videoDataArray);

            // Ограничиваем размер
            if (allData.length > this.#maxSize) {
                allData.splice(0, allData.length - this.#maxSize);
            }

            await chrome.storage.local.set({ [this.#storageKey]: allData });

            // Отправляем сообщение об обновлении данных
            this.#broadcastDataUpdate();
        } catch (e) {
            console.error("[ChromeStorageTableAdapter] Ошибка добавления записей:", e);
            throw e;
        }
    }

    /**
     * @returns {Promise<VideoData[]>}
     */
    async getAll() {
        try {
            const result = await chrome.storage.local.get([this.#storageKey]);
            return result[this.#storageKey] || [];
        } catch (e) {
            console.error("[ChromeStorageTableAdapter] Ошибка получения записей:", e);
            return [];
        }
    }

    /**
     * @returns {Promise<void>}
     */
    async clear() {
        try {
            await chrome.storage.local.remove([this.#storageKey]);
            // Отправляем сообщение об очистке данных
            this.#broadcastDataCleared();
        } catch (e) {
            console.error("[ChromeStorageTableAdapter] Ошибка очистки:", e);
            throw e;
        }
    }

    /**
     * @returns {Promise<number>}
     */
    async getCount() {
        try {
            const data = await this.getAll();
            return data.length;
        } catch (e) {
            console.error("[ChromeStorageTableAdapter] Ошибка получения количества записей:", e);
            return 0;
        }
    }

    /**
     * Отправляет сообщение о том, что данные обновились.
     * @private
     */
    #broadcastDataUpdate() {
        if (typeof chrome !== 'undefined' && chrome.runtime) {
            chrome.runtime.sendMessage({ type: "dataUpdated" }).catch(err => {
                // Игнорируем ошибки, если popup закрыт
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