# MS HACK Plaza

Small browser multiplayer game for [Münsterhack 2026](https://www.muensterhack.de/): pick a name, walk around a pixel-art Münster (Prinzipalmarkt, St. Lamberti, Aasee with the Giant Pool Balls, Promenade, lots of Leezen) and chat via speech bubbles. All sprites are drawn procedurally in code.

## Run with Docker

```sh
docker compose up -d --build
```

Then open http://localhost:3000.

## Run locally

Requires Node.js 20+.

```sh
npm install && npm start
```

Tests: `npm test`.

## Controls

| | Desktop | Mobile |
|---|---|---|
| Walk | WASD / arrow keys, or click a destination | Tap a destination |
| Chat | Enter, type, Enter to send (Esc cancels) | Chat button bottom right |

Chat messages appear above the character for 5 seconds.

## Configuration

- `PORT`: HTTP and WebSocket port (default `3000`).

The client derives the WebSocket URL from the page URL, so behind an HTTPS reverse proxy it uses `wss://` automatically. The proxy must forward WebSocket upgrades (e.g. nginx `proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";`).

## Structure

- `server.js`: static file server + WebSocket relay (`ws`), input validation, rate limit, heartbeat.
- `public/map.js`: tile map, objects and collision, shared by client and server.
- `public/sprites.js`: procedural pixel art (characters, tiles, buildings).
- `public/path.js`: A* pathfinding for click/tap-to-walk.
- `public/game.js`: client (input, networking, movement, camera, rendering).

Movement is client-authoritative (the server only clamps positions to the world bounds), which is fine for a hackathon toy but not cheat-proof.
