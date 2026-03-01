# Backend Test Task

Полная постановка задания находится в [TASK.md](./TASK.md).

## Быстрый старт

```bash
docker compose up --build
```

API: `http://localhost:3000`

## Полезные команды

```bash
docker compose exec api npm run migrate
docker compose exec api npm test
docker compose down -v
```

## Что сдавать

## Анализ и рефакторинг

### 1. Какие проблемы были в исходном коде?

- Отсутствие идемпотентности операций spendBonus
- Возможность двойного списания бонусов при параллельных запросах
- Отсутствие транзакций базы данных
- Баланс считался без учета expiration
- Не было защиты от race condition
- Worker не обрабатывал expiration корректно


### 2. Как реализована идемпотентность?

Idempotency реализована через поле request_id в таблице bonus_transactions.

Перед выполнением операции выполняется проверка:

SELECT * FROM bonus_transactions WHERE request_id = ?

Если запись существует — операция не выполняется повторно.


### 3. Как решена проблема race conditions?

Используется SELECT ... FOR UPDATE внутри транзакции Sequelize.

Это блокирует записи пользователя до завершения транзакции и предотвращает двойное списание.


### 4. Как реализована работа с expiration?

Баланс считается только по активным бонусам:

- expires_at IS NULL
- expires_at > NOW()

Истекшие бонусы не учитываются.


### 5. Как обеспечена атомарность операций?

Все операции spendBonus выполняются внутри транзакции Sequelize:

sequelize.transaction()

Это гарантирует целостность данных при ошибках.


### 6. Как работает worker?

Worker запускается через BullMQ и Redis.

Он периодически проверяет истекшие accrual бонусы:

expireAccruals job

Истекшие бонусы больше не участвуют в расчете баланса.


### 7. Какие улучшения можно сделать?

- Добавить индексы по user_id и request_id
- Добавить retry логику worker
- Добавить unit тесты
- Добавить monitoring worker
- Добавить API для истории операций

## Запуск проекта

### 1. Запуск контейнеров

docker compose up -d


### 2. Проверка API

Создание пользователя:

POST http://localhost:3000/users

Начисление бонусов:

POST http://localhost:3000/bonus/accrual

Списание бонусов:

POST http://localhost:3000/bonus/spend


### 3. Проверка идемпотентности

Отправить одинаковый requestId дважды.

Второй запрос должен вернуть:

duplicated = true


### 4. Проверка expiration

Worker должен выводить:

[worker] expireAccruals started


### 5. Проверка базы данных

Подключение:

docker exec -it postgres psql -U app -d appdb

Команда:

SELECT * FROM bonus_transactions;
