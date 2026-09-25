# MS HACK Plaza

Small browser multiplayer game for [Münsterhack 2026](https://www.muensterhack.de/): pick a name, walk around a pixel-art Münster (Prinzipalmarkt with the Historic Town Hall and a Wochenmarkt, St. Lamberti with its cages and the Lambertibrunnen, the Dom towers peeking over the roofs, the Kiepenkerl, the Aaseeterrassen with the Giant Pool Balls and pedal boats, the Promenade with the Buddenturm, lots of Leezen) and chat via speech bubbles. All sprites are drawn procedurally in code.

## Run with Docker

```sh
docker compose up -d --build
```

Then open http://localhost:3000.

## Run locally

Requires Node.js 22+.

```sh
npm install && npm start
```

Tests: `npm test`.

## Controls

| | Desktop | Mobile |
|---|---|---|
| Walk | WASD / arrow keys, or click a destination | Tap a destination |
| Chat | Enter, type, Enter to send (Esc cancels) | Chat button bottom right |
| Wave | Q (next to someone: high five) | Hand button |
| Bike | E next to a bike (or the button) to get on/off | "Aufsteigen" / "Absteigen" button |

Chat messages appear above the character for 5 seconds. Riding a bike is about twice as fast as walking; the parked bike stays where it is. Players pick one of 15 looks on the login screen. Ducks and a swan swim on the Aasee (driven by the wall clock, so everyone sees roughly the same).

## Configuration

- `PORT`: HTTP and WebSocket port (default `3000`).

The client derives the WebSocket URL from the page URL, so behind an HTTPS reverse proxy it uses `wss://` automatically. The proxy must forward WebSocket upgrades (e.g. nginx `proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";`).

## Updates

On startup the server hashes all files in `public/` into a version. Clients get it when they connect; if a reconnect (e.g. after a redeploy) brings a different version, the page reloads itself. Joins with a missing or wrong version are refused.

## Structure

- `server.js`: static file server + WebSocket relay (`ws`), input validation, rate limit, heartbeat.
- `public/map.js`: tile map, objects and collision, shared by client and server.
- `public/sprites.js`: procedural pixel art (characters, tiles, buildings).
- `public/path.js`: A* pathfinding for click/tap-to-walk.
- `public/game.js`: client (input, networking, movement, camera, rendering).

Movement is client-authoritative (the server only clamps positions to the world bounds), which is fine for a hackathon toy but not cheat-proof.
