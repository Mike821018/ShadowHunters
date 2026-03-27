# Frontend Implementation (higu style)

## Quick start

1. Run the integrated local server from project root:
	 - `python main.py serve --port 5500`
	 - then open `http://127.0.0.1:5500/frontend/index.html`
2. If you only need a static preview, you can still open [frontend/index.html](index.html) directly.

## Current implementation

- Higu-inspired visual style:
	- fixed-width `982px` layout
	- classic blue/gray palette (`#09c`, `#e3edf5`, `#fcfdfe`)
	- fieldset/table-driven lobby and game panels
	- keyboard-accessible tab navigation (Left/Right/Home/End)
- Pages in single-file app tabs:
	- Lobby
	- Room
	- Game
- Fully integrated operation panels:
	- create/list/join/start
	- next_step / card_effect / loot_from_kill / steal_equipment
	- player table, turn summary, quick target selector, event log
- Transport modes:
	- `AUTO` (prefer dispatcher or HTTP, fallback to DEMO)
	- `HTTP` (`POST /api/dispatch`)
	- `DEMO` (in-browser simulated backend for UI testing)
- Source files:
	- [frontend/index.html](index.html)
	- [frontend/src/theme.css](src/theme.css)
	- [frontend/src/app.js](src/app.js)

## API contract

- Schema: [frontend/contracts/api.schema.json](contracts/api.schema.json)
- Examples: [frontend/contracts/api.examples.json](contracts/api.examples.json)
- TS types: [frontend/src/types.ts](src/types.ts)

## Backend integration

App transport in `app.js` (`AUTO` mode) follows this order:

1. If `window.SHADOW_API_DISPATCH(action, payload)` exists, call it directly.
2. Else POST `/api/dispatch` with `{ action, payload }`.
3. If HTTP unavailable, fallback to DEMO mode response contract.

So when implementing backend server routing, expose:

- `POST /api/dispatch`
- body: `{ action: string, payload: object }`
- response: `Envelope`

## Next step suggestions

1. Connect real HTTP/WebSocket backend adapter (if not yet).
2. Replace demo fallback with real-time push updates.
3. Add battle log API and richer action/card animation.
