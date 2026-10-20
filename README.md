# ♠ Planning Poker

A real-time planning poker app for agile teams, styled like a real poker table. It runs entirely in the browser: no backend, no accounts and no database, so it's hosted for free on GitHub Pages.

Create a table, share the link, and estimate stories together. Votes stay hidden until the host reveals them.

## Features

- **Serverless:** players sync with the dealer's browser through public relay servers, end-to-end encrypted. Votes land and flip in real time.
- **Host controls:** only the host can reveal cards, re-deal, move to the next story, remove players, hand over the host role, or end the game.
- **Re-deal on disagreement:** when the numeric votes differ, the host re-deals the same story for another round. 🃏 (unsure) and ☕ (break) are ignored.
- **Story tracking:** the host sets the story being estimated, shown in the middle of the table.
- **Deck:** 0, 1, 2, 3, 5, 8, Joker and Coffee.
- **Animations:** cards are dealt and flipped one by one, with confetti on consensus. Motion is reduced when the system asks for it.

## How it works

The person who creates a table is the **dealer**: their browser holds the game state and runs the game logic (`src/game/rooms.js`). Everyone else sends their actions to the dealer and receives the table state back. Messages travel over secure WebSockets through several public MQTT brokers at once (EMQX, HiveMQ and Mosquitto), so the table keeps working if one of them is down.

- Messages are encrypted with AES-GCM using a key derived from the table id, which only exists in the invite link. The brokers see a hashed topic and ciphertext only.
- The dealer must keep their tab open. Refreshing is fine, because the table is restored from session storage. If the dealer closes the tab, the table pauses until they return.
- The host role (reveal, re-deal and so on) can be handed to another player. The dealer's tab still has to stay open.
- Players who close their tab leave the table straight away; players whose browser disappears are removed after about a minute.
- Networks that block WebSockets on ports 8084, 8884 and 8081 can't reach the brokers. If players are stuck on "Connecting to the relay servers", try another network.

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests for the game logic
npm run build      # static site in dist/
```

To test locally, open the table in two different browsers (or a normal and a private window), so each one counts as a separate player.

## Deploying to GitHub Pages

1. Push to `main`.
2. In the repository, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
3. The [deploy workflow](.github/workflows/deploy.yml) tests, builds and publishes the site on every push to `main`.

The site is then available at `https://<user>.github.io/<repo>/`.

### Optional: your own brokers

To use different MQTT brokers, add a repository variable `MQTT_BROKERS` under **Settings → Secrets and variables → Actions → Variables** with comma-separated WebSocket URLs (e.g. `wss://broker.example.com:8884/mqtt`), then re-run the deploy workflow.

## Project structure

```
src/
  game/
    rooms.js        game rules (pure functions, unit tested)
    useTable.js     encrypted sync over MQTT: the dealer runs rooms.js, players send actions
  Home.jsx          create a table
  Game.jsx          the poker table
  styles.css
```

## License

[MIT](LICENSE)
