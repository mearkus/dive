# dive

**Sunken Hold** — a browser game in three.js. Rival salvage divers descend five
ocean trenches to strip the wrecks on their floors, hitching free rides on each
other's dive lines on the way down.

Inspired by the shape of the board game *Mountain Goats* (parallel numbered
tracks, numbered cards, and the stacking free-ride rule), re-derived and
inverted for a deep-sea theme.

**Playable now** — in the browser and in the terminal. See [DESIGN.md](DESIGN.md)
for the rules specification, architecture, and milestone plan.

## Running it

```bash
npm install
npm run play    # play in the terminal (the game is complete and playable)
npm run sim     # batch-simulate games and print balance stats
npm test        # rules engine test suite
npm run dev     # the browser game
```

`npm run play -- --players=3 --humans=1 --seed=7` — add `--humans=0` to watch
bots play, `--bot=search` for the stronger opponent.

### Playing in the browser

Click one of your divers, or any glowing ledge, then pick which cards to spend
— every exact-sum combination is offered, and hovering one shows what it costs
you. A ledge holding other divers means they ride down with you for free.

A **?** button opens the rules from anywhere in the game. First-timers also get
**tutorial tips**: short prompts that appear the first time
each situation comes up — most importantly the moment you are about to carry a
rival down for free. Each appears once and is remembered; turn them off, or
reset them, on the intro screen.

URL options: `?seed=42` replays an exact board, `?watch=1` sits a bot in every
seat and plays the game out on its own.

### How it is put together

    src/rules/   pure game engine — no three.js, no DOM. apply(state, action) -> {state, events}
    src/ai/      bots, running over the same reducer
    src/render/  three.js scene; consumes events as an animation timeline
    src/ui/      DOM overlay (HUD, hand, log)
    src/cli/     terminal game and the balance simulator

Nothing in `render/` or `ui/` can change game state. That is what lets the
terminal game, the browser game, and the bots all share one rulebook.

## Deployment

Pushes to `main` build and publish to GitHub Pages via
`.github/workflows/deploy.yml`. You can also deploy any branch by hand from the
Actions tab ("Deploy" → "Run workflow"), which is useful for previewing a
milestone before it merges.

**One-time setup:** in repo Settings → Pages, set *Build and deployment →
Source* to **GitHub Actions**. Until that is set the workflow fails at the
"Configure Pages" step.

The deploy runs typecheck and the test suite first, so a broken build never
reaches the site.
