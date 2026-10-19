# ♠ Planning Poker

A real-time planning poker app for agile teams, styled like a real poker table. It runs entirely in the browser: no backend, no accounts and no database, so it's hosted for free on GitHub Pages.

Create a table, share the link, and estimate stories together. Votes stay hidden until the host reveals them.

## Features

- **Peer-to-peer:** players connect directly to the dealer's browser over WebRTC. Votes land and flip in real time.
- **Host controls:** only the host can reveal cards, re-deal, move to the next story, remove players, hand over the host role, or end the game.
- **Re-deal on disagreement:** when the numeric votes differ, the host re-deals the same story for another round. 🃏 (unsure) and ☕ (break) are ignored.
- **Story tracking:** the host sets the story being estimated, shown in the middle of the table.
- **Deck:** 0, 1, 2, 3, 5, 8, Joker and Coffee.
- **Animations:** cards are dealt and flipped one by one, with confetti on consensus. Motion is reduced when the system asks for it.

## How it works

The person who creates a table is the **dealer**: their browser holds the game state and runs the game logic (`src/game/rooms.js`). Everyone else sends their actions to the dealer and receives the table state back. Peers find each other through public signalling relays via [Trystero](https://github.com/dmotz/trystero). After that, all game traffic goes directly between browsers.

- The dealer must keep their tab open. Refreshing is fine, because the table is restored from session storage. If the dealer closes the tab, the table pauses until they return.
- The host role (reveal, re-deal and so on) can be handed to another player. The dealer's tab still has to stay open.
- Some strict corporate networks block WebRTC. If players can't connect, try another network.

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

## Project structure

```
src/
  game/
    rooms.js        game rules (pure functions, unit tested)
    useTable.js     peer-to-peer sync: the dealer runs rooms.js, players send actions
  Home.jsx          create a table
  Game.jsx          the poker table
  styles.css
```

## License

[MIT](LICENSE)
