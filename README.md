# dive

**Sunken Hold** — a browser game in three.js. Rival salvage divers descend five
ocean trenches to strip the wrecks on their floors, hitching free rides on each
other's dive lines on the way down.

Inspired by the shape of the board game *Mountain Goats* (parallel numbered
tracks, numbered cards, and the stacking free-ride rule), re-derived and
inverted for a deep-sea theme.

Status: **design stage**. See [DESIGN.md](DESIGN.md) for the rules
specification, architecture, and milestone plan.

## Running it

```bash
npm install
npm run play    # play in the terminal (the game is complete and playable)
npm run sim     # batch-simulate games and print balance stats
npm test        # rules engine test suite
npm run dev     # 3D scene — scaffold only, see milestone M2
```

`npm run play -- --players=3 --humans=1 --seed=7` — add `--humans=0` to watch
bots play, `--bot=search` for the stronger opponent.
