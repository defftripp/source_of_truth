# Bugfix

## Цель

Исправить дефект и оставить regression barrier.

## Шаги

1. Воспроизвести баг.
2. Записать expected vs actual behavior.
3. Изолировать smallest responsible area.
4. Добавить или описать regression check.
5. Внести fix.
6. Запустить regression check и соседний gate, который нужен затронутому слою.
7. Записать evidence, если баг имеет checkpoint weight.
8. Если баг показывает повторяющийся pattern, поднять его в rule или checklist.

## Выход

- root cause;
- applied fix;
- regression barrier;
- verification result;
- evidence path, если написан;
- optional new rule, если lesson обобщается.
