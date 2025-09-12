// core/types/scenario.types.js

/**
 * @typedef {Object} ScenarioContext
 * @property {string} id - Уникальный идентификатор выполнения сценария.
 * @property {number} [tabId] - ID активной вкладки, если применимо.
 * @property {Object} [params] - Параметры, переданные сценарию.
 * @property {function(string, Object): void} log - Функция для логирования в контексте сценария.
 * @property {function(): Promise<void>} abortSignal - Функция для проверки, не был ли запрос на остановку.
 */

/**
 * @typedef {Object} ScenarioDefinition
 * @property {string} id - Уникальный идентификатор сценария.
 * @property {string} name - Человекочитаемое имя сценария.
 * @property {string} description - Описание сценария.
 * @property {function(ScenarioContext): Promise<void>} execute - Асинхронная функция выполнения сценария.
 */