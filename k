🔄 Полный обновлённый алгоритм
Проверка авторизации: Если клиент не авторизован → прерываем выполнение и выводим ошибку в лог с просьбой войти в аккаунт.
Инициализация дедупликации: Загружаем все существующие videoId из локальной БД (tableAdapter) в Set (existingVideoIds) для мгновенной фильтрации дубликатов на клиенте.
Инициализация флага состояния задачи: Создаём переменные currentTaskId = null и isTaskFinished = false для отслеживания активной задачи и её состояния.
Основной цикл по количеству запросов (while processedQueries < queryCount):
4.1. Проверка остановки: Вызываем await abortSignal(). Если пользователь нажал "Стоп" → переходим к шагу 5 (обработка остановки).
4.2. Получение задачи: Делаем GET /v1/tasks/search/next.
Если 204 No Content → задач больше нет, прерываем основной цикл (break).
Если 200 OK → получаем taskId и searchQuery. Сохраняем currentTaskId = taskId, сбрасываем isTaskFinished = false.
4.3. Навигация: Переходим на страницу поиска https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}. Ждем 3–5 секунд для загрузки DOM.
4.4. Внутренний цикл скроллинга для текущего запроса (while shouldContinueScrolling):
4.4.1. Проверка остановки: Снова вызываем await abortSignal(). Если остановка → переходим к шагу 5.
4.4.2. Скроллинг: Вызываем утилиту скроллинга (например, 5 раз с задержкой 1.5 сек).
4.4.3. Парсинг: Вызываем утилиту парсинга. Получаем массив scrapedData.
Если scrapedData.length === 0 → завершаем задачу через completeTask (POST /v1/tasks/{taskId}/complete), ставим isTaskFinished = true, логируем "Выдача пуста, задача завершена" и прерываем внутренний цикл (break).
4.4.4. Дедупликация: Фильтруем массив, оставляя только новые видео: newVideos = scrapedData.filter(v => !existingVideoIds.has(v.videoId)).
Если newVideos.length === 0 → логируем "Все спарсенные видео уже известны", завершаем задачу через completeTask, ставим isTaskFinished = true, прерываем внутренний цикл.
4.4.5. Отправка батча: Формируем payload только из newVideos (добавляем viewsCount через parseViewsRobust, channelId оставляем null) и делаем POST /v1/videos/batch. Получаем в ответ batchId.
4.4.6. Обновление локального кэша: Добавляем videoId из newVideos в локальный Set (existingVideoIds).
4.4.7. Получение новизны (Novelty): Делаем GET /v1/batches/{batchId}/novelty. Получаем newChannelsCount и totalUniqueChannels.
4.4.8. Логирование и UI: Логируем в UI: 🆕 Новых русских каналов: X из Y. Обновляем метрику в popup.
4.4.9. Логика принятия решения (используем буфер последних 5 значений newChannelsCount):
Рассчитываем среднее значение (currentAverage) за последние 5 итераций.
Если currentAverage >= 7 (N): Сбрасываем счётчик низкой эффективности (lowPerformanceCounter = 0). shouldContinueScrolling = true.
Если 5 <= currentAverage < 7 (M): Увеличиваем lowPerformanceCounter на 1.
Если lowPerformanceCounter >= 2 (K): shouldContinueScrolling = false.
Иначе: shouldContinueScrolling = true.
Если currentAverage < 5 (L): shouldContinueScrolling = false.
4.5. Завершение задачи: Если !isTaskFinished, делаем POST /v1/tasks/{taskId}/complete, ставим isTaskFinished = true.
4.6. Инкремент: processedQueries++.
4.7. Обработка ошибок: Если на любом этапе произошла критическая ошибка (кроме остановки и пустой выдачи):
Если !isTaskFinished, пытаемся сделать POST /v1/tasks/{taskId}/release с причиной other, ставим isTaskFinished = true.
Если это сетевая ошибка API (status === 0), прерываем весь сценарий (break).
Обработка остановки сценария (кнопка "Стоп"):
Если currentTaskId !== null и !isTaskFinished:
Делаем POST /v1/tasks/{currentTaskId}/release с причиной other и комментарием "Сценарий остановлен пользователем".
Логируем: "🔄 Активная задача освобождена и вернётся в очередь".
Завершаем сценарий с сообщением "Сценарий остановлен пользователем".
Завершение: Логируем "🏁 Сценарий успешно завершен. Обработано запросов: N из запрошенных".