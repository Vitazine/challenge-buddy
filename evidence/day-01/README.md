# День 1 — правила проекта и две генерации

Задание Дня 1 выполнено на Challenge Buddy: архивирование собственных челленджей, отдельный архив, сохранение истории и серверный запрет изменения отметок. Видео готовит пользователь. Задания других дней не выполнялись; VPS и опубликованное приложение не менялись.

Публичный репозиторий: [Vitazine/challenge-buddy](https://github.com/Vitazine/challenge-buddy).

## Основные результаты

- [Итоговый файл правил проекта v2](../../AGENTS.md), [сохранённая v1](rules/AGENTS.v1.md), [сохранённая v2](rules/AGENTS.v2.md), [дифф правил](rules/v1-to-v2.diff).
- [Таблица и выводы сравнения](comparison.md), [список того, что повлияло на качество](quality-impact.md), [основания итерации](rules/iteration-notes.md).
- [Точный промпт](prompt.txt), [инструкции независимых запусков](runner-instructions.txt), [протокол](protocol.md), [manifest и настройки](manifest.json), [снимок глобальных предпочтений](rules/global-AGENTS.md).
- [Разница кода двух генераций](generation-1-vs-2.diff), [контрольные суммы артефактов](SHA256SUMS.json).

| | Генерация 1 | Генерация 2 |
|---|---|---|
| Неизменённая ветка | [codex/day-01-generation-1](https://github.com/Vitazine/challenge-buddy/tree/codex/day-01-generation-1) | [codex/day-01-generation-2](https://github.com/Vitazine/challenge-buddy/tree/codex/day-01-generation-2) |
| Применимый патч к общей базе | [final.patch](generation-1/final.patch) | [final.patch](generation-2/final.patch) |
| Итоговые исходники приложения | [ZIP](generation-1/final-source.zip) | [ZIP](generation-2/final-source.zip) |
| Исходники перед первым полным check | [ZIP](generation-1/first-attempt-source.zip), [патч](generation-1/first-attempt.patch) | [ZIP](generation-2/first-attempt-source.zip), [патч](generation-2/first-attempt.patch) |
| Первый полный check | [Лог](generation-1/FIRST_CHECK.log) | [Лог](generation-2/FIRST_CHECK.log) |
| Независимый штатный check вне sandbox | [Лог](generation-1/standard-check.log) | [Лог](generation-2/standard-check.log) |
| Отчёт исполнителя и применение скиллов | [Отчёт](generation-1/GENERATION_REPORT.md) | [Отчёт](generation-2/GENERATION_REPORT.md) |
| Независимое ревью | [Отчёт](generation-1/review.md) | [Отчёт](generation-2/review.md) |
| Остальные логи и авторские скриншоты | [ZIP](generation-1/supplementary-artifacts.zip) | [ZIP](generation-2/supplementary-artifacts.zip) |
| Одинаковая фикстура, детали | [Скриншот](screenshots/generation-1-detail.jpg) | [Скриншот](screenshots/generation-2-detail.jpg) |
| Одинаковая фикстура, архив | [Скриншот](screenshots/generation-1-archive.jpg) | [Скриншот](screenshots/generation-2-archive.jpg) |

Снимки первой попытки соответствуют моменту перед первым полным check. Вторая генерация до этого уже исправила ошибку раннего lint; её лог сохранён отдельно и внутри дополнительных артефактов. Нельзя выдавать первый сохранённый снимок за решение до любых проверок.

Оригинальная генерация 2 содержит P2, найденный внешним ревью. В main находится её код с отдельным минимальным исправлением: [патч после сравнения](post-comparison-fix.patch), [проверка исправления](post-comparison-hook-check.log), [итоговый check](final-project-check.log). Исправление не внесено задним числом в сохраняемые ветки/ZIP.

## Воспроизведение

Нужны Node.js 24 и pnpm 11.25.0. Установить зависимости с `pnpm install --frozen-lockfile --ignore-scripts`. Для просмотра любой генерации переключиться на соответствующую ветку и запустить `pnpm check`, затем `pnpm dev`.

Для проверки патча использовать чистую копию общего коммита `a0e36e85c03f439cf59e8c6e568f1b4306d2a3ab` и `git apply` соответствующего `final.patch`. Оба патча проверены на применение к этой базе: [результат](verification/patch-reproduction.json). Внутри ZIP — только явный список файлов приложения и правил Дня 1; состав и SHA-256 лежат рядом. Зависимости, рабочие БД, сборки, исходные задания курса и частные эксплуатационные документы в ZIP не входят.

В [verification/](verification/) находятся одинаковые API-проверки, диагностический сценарий будущей схемы, управляемый стенд хука, съёмочная синтетическая фикстура и скрипт сохранения артефактов. Вызовы из корня репозитория:

```sh
pnpm exec node --import tsx evidence/day-01/verification/api-check.mjs /path/to/generation evidence/day-01/verification/generation-1-adapter.json
pnpm exec node --import tsx evidence/day-01/verification/future-schema-check.mjs /path/to/generation
pnpm exec node evidence/day-01/verification/hook-lifecycle-check.mjs /path/to/generation-2 reproduce
pnpm exec node evidence/day-01/verification/hook-lifecycle-check.mjs /path/to/main fixed
```

Оба адаптера API одинаковы. Стенд хука применим к интерфейсу хука генерации 2 и итоговой версии; это управляемый синтетический планировщик, не полноценный React renderer.

Полные первоначальные учебные архивы и частные материалы размещения сохранены только локально в игнорируемом `data/local-publication-backup/`. Публичная история создана из очищенной базы. Доказательство создания репозитория: [скриншот](screenshots/github-public.jpg).
