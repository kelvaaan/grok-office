# Grok Office

A tiny pixel-art virtual office whose employees are your **Grok Bot agents**.
Each agent is a little chibi character with an always-visible name tag and a desk
of their own. When they work, they sit down and type (with an animated screen);
when they need you, a bouncing `?` bubble appears; when they're idle they wander
off to the lounge, the coffee machine, the ping-pong table or the arcade.

![Grok Office screenshot](docs/screenshot.png)

- **Zero dependencies** — plain Node.js (18+/20) `http` server and vanilla JS + Canvas 2D. No build step.
- **Fixed URL** — <http://127.0.0.1:3200>, no token, bound to loopback only.
- **Live** — status updates are pushed to every open browser with Server-Sent Events.
- **Persistent** — current state is saved to `data/state.json`; a restart restores everyone.
- **Original art** — every tile, piece of furniture and character is drawn in code (see `public/js/office.js`, `public/js/sprites.js`). No third-party sprite packs.

## The office

- **Work room** (wood floor): 8 desks with CRT-style monitors that show code, docs,
  terminals or candlestick charts depending on the activity, bookshelves, a
  `GROK HQ` sign, a real-time wall clock, windows onto a city skyline, a kanban
  whiteboard, a server rack with blinking LEDs, a printer, a collab table and a ping-pong table.
- **Meeting room**: black conference table with laptops, a wall TV cycling slides, a whiteboard.
- **Lounge**: sofas, bean bags, a neon `GROK` sign, an arcade cabinet.
- **Kitchen**: coffee machine (with steam), sink, fridge, water cooler, bar table and stools.
- **Day / night**: windows and lighting follow your local time (monitors and neon glow at night).
  Force a look with `?phase=day|dusk|night|dawn` or `?hour=22`.
- **Controls**: `+` / `−` / fit buttons (or keys `+`, `-`, `0`), ctrl/⌘ + scroll to zoom, drag or scroll to pan.
  Pixel-crisp integer zoom that fits the window (Retina aware).
- **Click a character** (or a name chip at the top) for a card with name, role, status, message and last-update time
  (shown in your browser's local time). There is intentionally no "delete employee" button.

## Run

```bash
git clone https://github.com/kelvaaan/grok-office.git
cd grok-office
node server.js            # or: npm start
# open http://127.0.0.1:3200
```

There are no runtime dependencies, so `npm install` is optional.

Environment variables:

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3200` | HTTP port |
| `HOST` | `127.0.0.1` | Bind address (keep it on loopback — the API has no auth) |
| `ROSTER_FILE` | `./roster.json` | Employee roster |
| `DATA_DIR` | `./data` | Where `state.json` is written |

Run it in the background:

```bash
nohup node server.js >> /tmp/grok-office.log 2>&1 & disown
```

### Demo mode

```bash
npm run demo                 # 3 loops of realistic statuses for everyone
LOOPS=0 npm run demo         # forever
SPEED=3 npm run demo         # faster
BASE_URL=http://127.0.0.1:3200 node scripts/demo.mjs
```

## API

All endpoints are on `http://127.0.0.1:3200`. Because the server only listens on
127.0.0.1, **no auth token is required**. As a light guard against browser-based
attacks, `POST` requests must use `Content-Type: application/json` (cross-origin
pages can't send that without a CORS preflight, which is never approved) and
requests with a non-loopback `Host` header are rejected (DNS-rebinding guard).
If you bind to another interface with `HOST=...`, anyone who can reach the port can change statuses.

### `POST /api/status`

```json
{ "id": "sameer", "status": "working", "activity": "write", "message": "Refactoring the parser" }
```

| Field | Required | Values |
| --- | --- | --- |
| `id` | yes | employee id (`[a-z0-9_-]`, ≤ 40 chars) |
| `status` | yes | `idle` · `working` · `waiting` · `offline` |
| `activity` | no | `read` · `write` · `command` (only used while `working`) |
| `message` | no | free text shown in the bubble (≤ 500 chars) |
| `name`, `role` | no | if `id` is unknown and `name` is given, the employee is auto-added and gets a free desk |

You can also send an array of such objects to update several employees at once.

```bash
# Sameer starts coding
curl -s -X POST http://127.0.0.1:3200/api/status \
  -H 'Content-Type: application/json' \
  -d '{"id":"sameer","status":"working","activity":"write","message":"Refactoring the parser"}'

# Jeremy needs a decision
curl -s -X POST http://127.0.0.1:3200/api/status \
  -H 'Content-Type: application/json' \
  -d '{"id":"jeremy","status":"waiting","message":"Trim NVDA by 5%?"}'

# Jared is taking a break, Francesca signs off
curl -s -X POST http://127.0.0.1:3200/api/status -H 'Content-Type: application/json' \
  -d '[{"id":"jared","status":"idle","message":"Coffee"},{"id":"francesca","status":"offline"}]'

# A brand-new agent joins (auto-added)
curl -s -X POST http://127.0.0.1:3200/api/status -H 'Content-Type: application/json' \
  -d '{"id":"maya","name":"Maya","role":"Researcher","status":"working","activity":"read","message":"Reading papers"}'
```

### `GET /api/agents`

Returns the office, roster and current status of everyone:

```bash
curl -s http://127.0.0.1:3200/api/agents
```

```json
{
  "office": { "name": "Grok HQ", "desks": 8 },
  "agents": [
    { "id": "sameer", "name": "Sameer", "role": "Software engineer", "desk": 0, "look": { "...": "..." },
      "status": "working", "activity": "write", "message": "Refactoring the parser",
      "updatedAt": "2026-09-26T13:27:06.355Z" }
  ],
  "serverTime": "2026-09-26T13:30:00.000Z"
}
```

### `GET /api/events`

Server-Sent Events stream: one `snapshot` event on connect (same shape as `/api/agents`),
then an `agent` event for every update (and a fresh `snapshot` when the roster changes).

```bash
curl -N http://127.0.0.1:3200/api/events
```

### `GET /api/health`

`{ "ok": true, "clients": 1 }`

## Adding an employee

Edit `roster.json` (the server picks up changes within ~2 seconds, no restart needed):

```json
{
  "id": "maya",
  "name": "Maya",
  "role": "Researcher",
  "desk": 4,
  "look": { "hair": "#d9b56b", "hairStyle": "bun", "skin": "#f0c8a2", "shirt": "#1fa3a3",
            "pants": "#2e3242", "shoes": "#1a1a1f", "glasses": true }
}
```

- `desk` is 0–7 (top row 0–3, bottom row 4–7). Omit it to get the first free desk.
  If all 8 desks are taken, extra employees hot-desk in the meeting room.
- `look` is optional — without it a look is generated from the id.
  `hairStyle`: `short` · `spiky` · `long` · `curly` · `bun` · `bald`; optional `tie` color and `glasses: true`.
- Removing someone from `roster.json` removes them from the office (their last status stays in `data/state.json`).

Alternatively just `POST /api/status` with a `name` for an unknown id and they are added automatically
(stored in `data/state.json`).

## Project layout

```
server.js            zero-dependency HTTP + SSE server
roster.json          employees
data/state.json      persisted status (created at runtime, git-ignored)
public/index.html    UI shell
public/js/office.js  map, furniture & environment pixel art
public/js/sprites.js character sprites & icons
public/js/main.js    simulation (BFS pathfinding, behaviours), rendering, UI
public/js/font.js    3x5 pixel font for signs and screens
scripts/demo.mjs     demo driver
scripts/screenshot.mjs  dev helper (needs playwright-core)
```

## License

MIT © 2026 Kelvin He. All art in this repository is original and covered by the same license.
Inspired by the idea of [Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents), but no code or assets are shared.
