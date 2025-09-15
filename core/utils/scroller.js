// core/utils/scroller.js

/**
 * Выполняет N шагов скроллинга страницы с задержками и отслеживанием прогресса.
 * @param {Object} context - Контекст сценария для логирования и проверки прерывания.
 * @param {number} [count=16] - Сколько раз скроллить.
 * @param {number} [delayMs=1500] - Задержка между скроллами (мс).
 * @param {number} [step=1000] - На сколько пикселей скроллить за раз.
 * @returns {Promise<void>}
 */
export async function scrollPageNTimes(context, count = 16, delayMs = 1500, step = 1000) {
    const { log, abortSignal } = context;
    let tabId = context.tabId;
    console.log("[Scroller] scrollPageNTimes вызвана с параметрами:", { count, delayMs, step, tabId: context.tabId }); // <-- Лог
    log(`🔄 Начинаем скроллинг страницы: ${count} раз(а), шаг ${step}px, задержка ${delayMs}мс`, { module: 'Scroller' });

    try {

        // --- УЛУЧШЕННАЯ ПРОВЕРКА tabId ---
        // 1. Сначала проверяем, передан ли tabId в context
        let effectiveTabId = tabId;

        // 2. Если tabId все еще null/undefined, логируем предупреждение
        // (Это может произойти, если background.js не смог его получить)
        if (effectiveTabId == null) { // == проверит и null, и undefined
            const errorMsg = `Недействительный tabId для sendMessage: ${effectiveTabId}. Убедитесь, что сценарий запущен на активной вкладке YouTube.`;
            log(`❌ ${errorMsg}`, { module: 'Scroller', level: 'error' });
            throw new Error(errorMsg); // Прерываем выполнение скроллинга
        }

        // 3. Проверка типа (дополнительная предосторожность)
        if (typeof effectiveTabId !== 'number' || effectiveTabId < 0) {
            const errorMsg = `Недействительный тип или значение tabId для sendMessage: ${effectiveTabId} (тип: ${typeof effectiveTabId}). Ожидалось положительное число.`;
            log(`❌ ${errorMsg}`, { module: 'Scroller', level: 'error' });
            throw new Error(errorMsg);
        }
        // --- КОНЕЦ УЛУЧШЕННОЙ ПРОВЕРКИ tabId ---
        console.log("Проверка tabId пройдена", effectiveTabId);
        for (let i = 1; i <= count; i++) {
            console.log("// 1. Проверяем, не был ли запрос на остановку/прерывание");
            // 1. Проверяем, не был ли запрос на остановку/прерывание
            await abortSignal();

            // 2. Отправляем сообщение content script для выполнения ОДНОГО скролла
            log(`⏳ Выполняем скролл ${i}/${count}...`, { module: 'Scroller' });

            // --- ПОПЫТКА С БЛОКОМ try/catch ДЛЯ sendMessage ---
            let response;
            try {
                response = await chrome.tabs.sendMessage(
                    context.tabId,
                    {
                        action: "performSingleScroll",
                        step: step
                    }
                );
            } catch (sendMsgErr) {
                log(`❌ Ошибка sendMessage для скролла ${i}/${count}: ${sendMsgErr.message}`, { module: 'Scroller', level: 'error' });
                throw new Error(`Ошибка связи со страницей YouTube: ${sendMsgErr.message}`);
            }
            // --- КОНЕЦ ПОПЫТКИ ---

            if (response && response.status === "success") {
                log(`✅ Скролл ${i}/${count} выполнен.`, { module: 'Scroller' });
            } else {
                const errorMsg = response?.message || "Неизвестная ошибка выполнения скролла";
                log(`❌ Ошибка скролла ${i}/${count}: ${errorMsg}`, { module: 'Scroller', level: 'error' });
                throw new Error(errorMsg);
            }

            // 3. Проверяем снова на прерывание после выполнения скролла
            await abortSignal();

            // 4. Если это не последний скролл, делаем паузу
            if (i < count) {
                log(`⏱️ Ожидание ${delayMs}мс перед следующим скроллом (${i + 1}/${count})...`, { module: 'Scroller' });

                // Создаем промис для задержки
                const delayPromise = new Promise(resolve => setTimeout(resolve, delayMs));

                try {
                    // Используем Promise.race между задержкой и сигналом остановки.
                    // context.abortSignal() должен возвращать промис, который:
                    // - Разрешается успешно, если остановки нет (ЭТО НЕВЕРНО ДЛЯ RACE!)
                    // - Отклоняется с ошибкой, если сработал сигнал остановки.
                    //
                    // ПРАВИЛЬНАЯ логика: мы хотим ждать задержку, НО прерваться, если поступил сигнал.
                    // Значит, abortSignal должен возвращать промис, который ЖДЕТ сигнала (не разрешается сам).
                    // Но наша текущая реализация resolve() его. Это проблема.
                    //
                    // ПЕРЕДЕЛАЕМ ЛОГИКУ:
                    // 1. Создадим отдельный AbortController для этой паузы.
                    // 2. Будем ждать либо таймаут, либо сигнал остановки напрямую.

                    // Создаем новый контроллер для управления этой паузой
                    const pauseController = new AbortController();
                    const abortPromise = new Promise((_, reject) => {
                        // Слушаем сигнал остановки от основного контроллера сценария
                        context.controller.signal.addEventListener('abort', () => {
                            reject(new Error('Сценарий остановлен пользователем.'));
                        }, { once: true, signal: pauseController.signal }); // Привязываем к нашему pauseController, чтобы можно было отменить слушатель
                    });

                    // Гонка между таймаутом и сигналом остановки
                    await Promise.race([
                        new Promise(resolve => setTimeout(resolve, delayMs)), // Таймаут
                        abortPromise // Сигнал остановки
                    ]);

                    // Если дошли до этой точки, значит либо прошло время, либо сценарий остановлен.
                    // Проверка на остановку уже включена в abortPromise.

                } catch (err) {
                    // Если прервано по сигналу
                    log(`⏹️ Скроллинг остановлен пользователем во время ожидания (${i + 1}/${count}).`, { module: 'Scroller', level: 'warn' });
                    throw err; // Пробрасываем исключение дальше
                }
                // Если не было исключения, цикл продолжится
            }
        }

        // После завершения всех скроллов можно оценить количество карточек
        try {
            const countResponse = await chrome.tabs.sendMessage(context.tabId, {
                action: "getEstimatedCardCount"
            });
            const cardCount = countResponse?.cardCount || 0;
            log(`✅ Скроллинг завершён. Обработано примерно ${cardCount} карточек.`, { module: 'Scroller' });
        } catch (countErr) {
            console.warn("[Core Scroller] Не удалось получить количество карточек после скроллинга:", countErr);
            log(`✅ Скроллинг завершён.`, { module: 'Scroller' });
        }

    } catch (err) {
        console.error("[Scroller] Поймано исключение в scrollPageNTimes:", err); // <-- Лог ошибок

        if (err.message === 'Сценарий остановлен пользователем.') {
            log(`⏹️ Скроллинг остановлен пользователем.`, { module: 'Scroller', level: 'warn' });
        } else {
            log(`❌ Ошибка при выполнении скроллинга: ${err.message}`, { module: 'Scroller', level: 'error' });
        }
        throw err; // Перебрасываем ошибку для обработки в сценарии
    }
}