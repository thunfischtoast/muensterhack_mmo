# MS HACK Plaza

Small browser multiplayer game for [Münsterhack 2026](https://www.muensterhack.de/): pick a name, walk around a pixel-art Münster (Prinzipalmarkt with the Historic Town Hall and a Wochenmarkt, St. Lamberti with its cages and the Lambertibrunnen, the Dom towers peeking over the roofs, the Kiepenkerl, the Aaseeterrassen with the Giant Pool Balls and pedal boats, the Promenade with the Buddenturm and a [Leezenflow](https://www.smart-city-dialog.de/wissen/smart-city-loesungen/leezenflow-gruene-welle-assistent-fuer-den-radverkehr) counting down the bike traffic light (a Münsterhack 2019 project), lots of Leezen) and chat via speech bubbles. All sprites are drawn procedurally in code.

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

## Mini-game: Leezen-Chaos

A gust of wind knocked over 6 Leezen on the plaza (marked with a yellow "!"). Pick one up ("Aufheben" / E), ride it to the empty bike rack below the plaza (free slots glow, an arrow points the way) and park it ("Einparken"). Getting off elsewhere drops the bike where you stand. When all 6 are parked, everyone gets a celebration and a new round starts 60 seconds later. The state lives in server memory and resets on restart.

## Easter eggs: earlier Münsterhack projects

Small nods to projects from [codeformuenster/muensterhack](https://github.com/codeformuenster/muensterhack):

- **Leihleeze** (2017): green sign at the bike rack on the plaza
- **Hack(a)Tonne** (2018): water-quality probe floating in the Aasee
- **Kraut und Rüben** (2019) / **MüMa** (2024): chalkboard at the Wochenmarkt stalls
- **Grüne Welle / Leezenflow** (2019): LED countdown for the bike traffic light on the Promenade
- **Humiditree** (2019): watering bags around park trees
- **Givebox Network** (2022) / **Kiepenkiste** (2025): sharing cabinet next to the Kiepenkerl
- **1648_reloaded** (2023): "1648" cartouche on the Historic Town Hall
- **Corndex** (2024): kiosk at the Aasee whose beer price rises with the noise meter
- **Nestflix** (2025): nest box with a recording light on a Promenade tree

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
