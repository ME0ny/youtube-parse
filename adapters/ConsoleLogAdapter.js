// adapters/ConsoleLogAdapter.js

/**
 * @typedef {import('../core/types/log.types.js').LogEntry} LogEntry
 * @typedef {import('../core/types/log.types.js').LogAdapter} LogAdapter
 */

export class ConsoleLogAdapter {
    /**
     * @param {LogEntry} entry
     * @returns {Promise<void>}
     */
    async write(entry) {
        // Логика уже есть в основном классе, но можно и здесь реализовать
        // например, если нужен специфичный формат только для консоли
        // Пока оставим пустым, так как дублирование происходит в Logger
    }

    /**
     * @returns {Promise<LogEntry[]>}
     */
    async read() {
        console.warn("[ConsoleLogAdapter] Чтение логов из консоли невозможно");
        return [];
    }

    /**
     * @returns {Promise<void>}
     */
    async clear() {
        console.clear(); // Физически очищает консоль браузера
    }
}