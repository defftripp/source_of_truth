# Feature

## Цель

Доставить новую возможность без случайного scope creep.

## Шаги

1. Сформулировать user-visible outcome.
2. Записать scope, anti-scope, constraints, verification и stop condition.
3. Назвать affected modules, files или boundaries.
4. Определить самый маленький checkpoint, который доказывает, что feature работает.
5. Использовать read-only `explorer`, `reviewer`, `test-auditor` или `browser-debug`, если blast radius нетривиальный.
6. Реализовать checkpoint через одного main patch owner.
7. Проверить поведение.
8. Записать evidence, а follow-up work вынести отдельно вместо тихого расширения scope.

## Checklist

- scope явный;
- anti-scope явный;
- success condition наблюдаемая;
- verification существует;
- evidence path есть для checkpoint-weight work;
- memory обновлена, если изменилась architecture или workflow.
