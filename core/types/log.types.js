// core/types/log.types.js

/**
 * @typedef {Object} LogEntry
 * @property {string} id - Уникальный идентификатор записи.
 * @property {number} timestamp - Временная метка (мс с 1970).
 * @property {string} level - Уровень лога: 'debug', 'info', 'success', 'warn', 'error'.
 * @property {string} message - Текст сообщения.
 * @property {string} [module] - Модуль или компонент, создавший запись (например, 'Parser', 'Selector').
 * @property {string} [contextId] - Идентификатор контекста (например, ID сессии анализа).
 * @property {Object} [meta] - Дополнительные данные.
 */

/**
 * @typedef {Object} LoggerConfig
 * @property {number} [maxSize=1000] - Максимальное количество записей в памяти/хранилище.
 * @property {boolean} [enableConsole=true] - Дублировать логи в console.
 * @property {string} [defaultLevel='info'] - Уровень логирования по умолчанию.
 */

/**
 * @callback LogSubscriber
 * @param {LogEntry | { type: 'CLEAR_LOGS' }} entry - Запись лога или команда очистки.
 * @returns {void}
 */

/**
 * @typedef {Object} LogAdapter
 * @property {function(LogEntry): Promise<void>} write - Записывает лог.
 * @property {function(): Promise<LogEntry[]>} read - Читает все логи.
 * @property {function(): Promise<void>} clear - Очищает логи.
 */