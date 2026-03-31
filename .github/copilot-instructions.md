# ShadowHunters Copilot Workflow Rules

## Completion Gate (Mandatory)
For every coding task in this repository, do not end the task until all items below are done:

1. Code fix/feature is implemented.
2. Related issue file is updated in `issue_list/` (status + cause + fix + verification).
3. `VERSION.md` is updated with this session's changes.
4. Basic validation is run (error check/tests if available).

If item 2 or 3 is missing, the task is considered incomplete.

## Session Start Checklist
At the beginning of a new session:

1. Read target issue file in `issue_list/`.
2. Read latest section in `VERSION.md`.
3. Keep both files in sync with the actual code changes.

## Scope Rule
Only document what was actually changed in this session. Do not include speculative or unfinished changes in `VERSION.md` or `issue_list/`.

## issue_list Git Rule (Critical)
- Update `issue_list/` locally as part of task tracking.
- Do **not** commit or push `issue_list/` files unless the user explicitly asks to include them in git history.
