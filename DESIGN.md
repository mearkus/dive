# Sunken Hold — Design & Implementation Plan

A browser game in three.js. Competitive push-your-luck descent: rival salvage
divers work their way down five ocean trenches to strip a wreck of treasure,
hitching rides on each other's dive lines on the way down.

Working title: **Sunken Hold**. Repo name `dive`. Alternates in §11.

---

## 1. Elevator pitch

Five trenches drop from a sunlit shelf into the dark. Each has a wreck on the
floor with a dwindling pile of treasure — the deeper the trench, the richer the
haul and the more air it costs to reach.

You have five divers and a hand of air cards. On your turn you spend air to
drop one diver a single ledge deeper. The catch: divers stacked on a ledge are
clipped to the same line, so **when you descend, everyone clipped above you
comes with you, for free.** Descending is never purely selfish, and parking a
diver on top of a rival's is the cheapest way down — if they ever move.

First diver to a trench floor takes the best treasure; stragglers take scraps.
Divers still in the water when the game ends score nothing.

## 2. Inspiration and what we're actually borrowing

Adapted from **Mountain Goats** (Stefan Dorra) — goats climb numbered mountain
tracks by playing numbered cards, and goats stacked on a space get carried
along when the one beneath them moves.

We're borrowing the *shape* of that design, not its rulebook:

- parallel tracks of differing length, each space carrying a number,
- a hand of numbered cards spent to pay a space's number,
- the stacking / free-ride rule as the central social tension,
- a race that ends when someone gets all their pieces home.

Everything below — exact costs, treasure economy, end condition, trench
layout — is re-derived for this game and tuned by us. **Do not describe this
as a faithful digital Mountain Goats.** If we ever want to claim lineage
publicly, check the published rules first; the specifics here are deliberately
our own, and the theme (descent, air, salvage) inverts the original.

Theme mapping:

| Mountain Goats | Sunken Hold |
| --- | --- |
| Mountain | Trench |
| Climbing up | Descending down |
| Summit | Wreck on the trench floor |
| Goat | Diver |
| Card | Air / kick card |
| Goats riding a mover | Divers clipped to the same descent line |

## 3. Rules specification (v1, implementable as written)

### 3.1 Components

- **5 trenches**, depths 4 / 5 / 6 / 7 / 8 ledges.
- Each **ledge** carries a **current value** of 1–6 — what it costs to reach.
  Values are drawn per-trench at setup from a fixed distribution so deeper
  ledges skew expensive (see §3.7).
- **Surface**: a shared boat row above all trenches; every diver starts here.
- **Divers**: 5 per player, colour-coded, plus a shape badge for accessibility.
- **Air deck**: 60 cards, values 1–6, ten of each. Hand size **5**.
- **Treasure**: 4 tokens per trench, values descending — the first diver to a
  floor takes the richest.

### 3.2 Setup

Shuffle the air deck (seeded PRNG — see §6.4). Deal 5 cards to each player.
Roll ledge values. Place treasure token piles face-up on each trench floor,
richest on top. All divers on the surface. Random start player.

### 3.3 Turn structure

On your turn, do exactly one of:

**A. Descend** — move one of your divers one ledge deeper, paying its cost.
**B. Surface for air** — discard your whole hand, draw a fresh five. (This is
your entire turn. It's the anti-deadlock valve; see §10.)

Then refill your hand to 5. Play passes left.

### 3.4 Descending

- A diver **on the surface** may enter any open trench, arriving on ledge 1.
- A diver **on a ledge** may move to the next ledge down of the same trench.
  No ascending, no changing trenches. Entering a trench is a commitment.
- **Cost**: discard air cards from your hand summing **exactly** to the target
  ledge's current value. Exact sums are the point — overpaying isn't allowed,
  so hand shape matters as much as hand size.
- If you cannot make the exact sum, that move is illegal. (The UI greys it out.)

### 3.5 The line rule (free rides)

- Any number of divers may share a ledge. They form a **stack** in arrival
  order — last to arrive sits on top.
- When a diver descends, **every diver above it in the stack descends with it**,
  keeping their relative order. Riders pay nothing.
- You pay only for your own diver. You may move any of your own divers at any
  time, including one buried under a pile of rivals — they all come along.

This is the whole game. Every descent is a gift to whoever is stacked above
you, and stacking onto a rival is a bet that they'll keep moving.

### 3.6 Reaching the wreck, and the end

- A diver arriving on the **floor ledge** takes the top treasure token from
  that trench and immediately surfaces: remove it from the board, token to
  its owner's score pile, diver out of the game.
- When a trench's fourth token is taken the trench is **picked clean**: it
  closes, and no diver may enter it. Divers already inside continue normally.
- **Game end** triggers when any player has surfaced all five divers, or every
  trench has closed. Finish the round so all players have had equal turns.
- Divers still in the water at the end score **nothing**.
- Highest treasure total wins. Tiebreak: most divers surfaced, then deepest
  single haul.

### 3.7 Starting numbers to tune from

Treasure pools, top token first:

| Trench | Depth | Tokens |
| --- | --- | --- |
| Shelf Break | 4 | 3, 2, 1, 1 |
| Kelp Chimney | 5 | 5, 3, 2, 1 |
| The Gutter | 6 | 7, 5, 3, 2 |
| Blacklip Wall | 7 | 9, 6, 4, 2 |
| Sunken Hold | 8 | 12, 8, 5, 3 |

Ledge costs: ledge 1 is always 1–2 (cheap entry). Remaining ledges draw from a
bag weighted toward the deep — roughly `1..3` for the top third, `2..5` for the
middle, `3..6` for the bottom third, with the floor ledge never below 3.

Expected game length, 3 players: 25–35 turns. If it runs long, cut divers per
player to 4 before touching the costs.

### 3.8 Worked example

Ana's diver sits on The Gutter ledge 3. Below her on ledge 4 is nothing; above
her on ledge 3 sit Ben's diver and Cal's diver, in that order. Ledge 4 costs 5.
Ana holds `2 3 3 6 1`. She plays `2+3`, descends — and Ben and Cal ride down
with her for free, still stacked in order. Ben is now one ledge from the wreck
and hasn't spent a card all game. Ana's consolation: she's still beneath them,
so the next descent she pays for drags them along again — but she'll reach the
floor first and take the 7.

## 4. Why this works as a video game

The board game's tension is social and readable; the screen's job is to make
the stack state instantly legible and the free ride *feel* like something.
Three design commitments follow:

1. **Descents are animated as one event.** When a stack drops, it drops
   together, with a shared line, bubble wash and a settling bounce. The free
   ride should read as a physical consequence, not a rules footnote.
2. **Depth is the mood.** Colour, fog density, light and audio all key off
   camera depth. The top of a trench is turquoise and noisy; the floor is near
   monochrome with only diver lamps. Descending should feel like a cost.
3. **The hand is the puzzle.** Exact-sum payment means the UI must continuously
   answer "what can I afford right now" — legal targets highlighted, running
   sum against the required number, illegal combos dimmed as you select.

## 5. Tech stack

- **three.js** (r170+) via npm, WebGL2.
- **TypeScript**, strict.
- **Vite** for dev server and build.
- **Vitest** for the rules engine.
- **troika-three-text** for crisp ledge numbers and in-world labels.
- **howler.js** for audio (or bare WebAudio if we keep the cue list small).
- No UI framework. The HUD is a DOM overlay with plain CSS; the 3D layer never
  renders text-heavy UI.
- No physics engine. Movement is scripted tweens; the game is discrete.

Deliberately excluded from v1: online multiplayer, a server, accounts, any
build step beyond Vite. Ships as static files.

## 6. Architecture

### 6.1 The one hard rule

**The rules engine is pure and knows nothing about three.js.** It takes
`(state, action)` and returns `(state', events[])`. The renderer consumes
`events[]` as an animation timeline. Nothing in `render/` mutates game state;
nothing in `rules/` imports three.

This buys us: unit-testable rules, a text-mode game loop for playtesting
before any art exists, AI that can search by calling the same reducer,
deterministic seeded replays, and a straightforward path to netplay later.

### 6.2 File layout

```
src/
  rules/
    types.ts        GameState, Diver, Trench, Ledge, Action, GameEvent
    setup.ts        newGame(seed, playerCount)
    legal.ts        legalActions(state) -> Action[]; cardCombos(hand, target)
    reduce.ts       apply(state, action) -> { state, events }
    scoring.ts      scores(state), winner(state)
    rng.ts          mulberry32 seeded PRNG, deck shuffle
  ai/
    policy.ts       Policy interface
    greedy.ts       one-ply heuristic bot
    search.ts       depth-limited search over reduce()
    heuristics.ts   position valuation
  render/
    stage.ts        renderer, scene, resize, render loop
    camera.ts       orbit controls + scripted focus moves
    water.ts        fog, depth grading, particulate, caustics
    trench.ts       trench geometry, ledges, instancing
    diver.ts        diver model, lamp, bubble trail
    timeline.ts     GameEvent[] -> tween queue, with skip/fast-forward
    quality.ts      tiered quality presets + capability detection
  ui/
    hand.ts         card rail, selection, running sum
    hud.ts          scores, turn indicator, trench treasure remaining
    log.ts          scrolling play log ("Ben rode down to ledge 4")
    prompts.ts      confirm/undo, end-of-game screen
  app/
    controller.ts   input -> action -> reduce -> timeline -> unlock input
    main.ts         bootstrap
  cli/
    play.ts         text-mode loop against the same engine (playtesting)
```

### 6.3 Core types (sketch)

```ts
type Position =
  | { kind: 'surface' }
  | { kind: 'ledge'; trench: number; ledge: number }   // ledge 1 = topmost
  | { kind: 'scored' };

interface Diver { id: string; owner: number; pos: Position; }

interface Trench {
  id: number; name: string;
  costs: number[];          // costs[i] = cost to enter ledge i+1
  treasure: number[];       // remaining tokens, richest first
  closed: boolean;
  stacks: string[][];       // stacks[i] = diver ids on ledge i+1, bottom first
}

type Action =
  | { kind: 'descend'; diver: string; cards: number[] }  // indices into hand
  | { kind: 'refresh' };

type GameEvent =
  | { t: 'cards-spent'; player: number; values: number[] }
  | { t: 'stack-moved'; trench: number; from: number; to: number; divers: string[] }
  | { t: 'treasure-taken'; player: number; diver: string; trench: number; value: number }
  | { t: 'trench-closed'; trench: number }
  | { t: 'hand-refilled'; player: number; count: number }
  | { t: 'turn-passed'; to: number }
  | { t: 'game-over'; scores: number[] };
```

`legal.ts` carries the only fiddly algorithm: enumerating subsets of a 5-card
hand that sum exactly to a target. Trivially small (2^5 = 32 subsets); compute
all of them per turn and cache by `hand+target` so the UI can live-highlight.

### 6.4 Determinism

Everything random flows through a seeded `mulberry32` stored in state. A game
is fully reproducible from `(seed, playerCount, action[])`, which gives us
free replays, reproducible bug reports, and regression tests over whole games.

## 7. Rendering plan

### 7.1 Scene

A seafloor shelf plane with five shafts cut down into it, laid out in a gentle
arc so a single 3/4 camera sees all of them. Each trench is a pair of rock
walls (displaced plane geometry, tri-planar rock material) with ledges as
shelves cantilevered from the near wall — camera-side wall is clipped away so
we always see in.

Ledge numbers: `troika-three-text` billboards on the shelf face, with a glowing
plate behind them so they stay readable in the dark. They must be legible at
the default camera distance; if they aren't, the whole game is unplayable.

### 7.2 Water and depth

- `FogExp2` keyed to a deep blue-green, density rising with depth via a custom
  depth-remap in a post pass.
- Particulate: one `Points` cloud, additive, slow drift, parallaxed by depth.
- Caustics on the upper shelf only: scrolling projected texture, faded out
  below ~ledge 3 of any trench.
- Fake god rays: a few additive cones from the surface, no volumetric pass.
- Kelp: instanced strips with a vertex-shader sway — cheap, sells the motion.

### 7.3 Divers

Low-poly: capsule body, tank, fins, mask. One `SpotLight` for the **active**
diver only (lights are the main perf cliff); everyone else gets an unlit
emissive lamp cone billboard. Idle animation is a slow fin kick and a bubble
every few seconds — `Points` with an additive sprite, pooled.

Stack readability is critical: divers on a shared ledge fan out along the line
with a visible carabiner/line connecting them, and the HUD mirrors stack order
as a small column of pips. Never make the player rotate the camera to find out
who's on top.

### 7.4 Animation from events

`timeline.ts` maps each `GameEvent` to a tween or tween group, queued and
played in order, with an input lock until the queue drains. A tap anywhere
fast-forwards (2x, then snap-to-end). Bot turns default to 2x.

The signature animation is `stack-moved` with `divers.length > 1`: line goes
taut, the whole group drops together, bubble wash, settle. That one animation
teaches the central rule without a tutorial.

### 7.5 Performance targets

60 fps at 1080p on integrated graphics; degrade gracefully on mobile.

- `InstancedMesh` for ledges, kelp, debris.
- No real-time shadows; one blob shadow decal per diver.
- Post-processing (bloom + vignette + depth grade) behind a quality tier;
  auto-detect and default to `medium` on anything failing a quick capability
  probe.
- Quality tiers `low | medium | high` toggle: particulate count, god rays,
  caustics, bloom, active-diver spotlight.

## 8. Interaction and UI

**Flow**: click a diver (or a trench, for surface divers) → legal target ledge
lights up with its cost → the card rail highlights every subset that sums to
it → click cards (running sum shown against the target) → confirm. Escape
cancels, and cancelling never costs anything.

**Card rail**: DOM overlay along the bottom. Cards are plain HTML — sharper,
accessible, and far cheaper than in-world quads.

**Always-visible HUD**: scores, whose turn, deck count, and per-trench treasure
remaining (the closing-trench pressure is invisible otherwise).

**Play log**: one line per event, phrased in-fiction — "Ben rides down to ledge
4". This is how players learn the free-ride rule.

**Accessibility**: colourblind-safe palette plus per-player shape badges; a
2D top-down "board mode" toggle that drops the 3D scene entirely (also the
low-end fallback); full keyboard navigation; respect
`prefers-reduced-motion` by shortening tweens to near-instant.

## 9. AI opponents

Needed for v1 — a hotseat-only game is a demo, not a game.

- `greedy`: score each legal action by a heuristic — progress toward a floor,
  value of the treasure still reachable, and a penalty proportional to the
  free ride handed to rivals stacked above.
- `search`: depth-limited expectimax over `reduce()`, 2–3 plies, with hidden
  hands modelled as a draw from the remaining deck. The pure engine makes this
  nearly free to write.
- Difficulty = search depth plus noise injected into the heuristic.

Bots must also *look* like they're thinking — a short deliberation pause and a
camera move to the diver they're about to move, or their turns are unreadable.

## 10. Risks and open design questions

**Exact-sum deadlock.** A player may hold five cards that pay for nothing.
Mitigated by the refresh turn (§3.3A), but if refreshing is common the game
stalls. *Instrument it*: log refresh frequency in CLI playtests. If it exceeds
~15% of turns, either widen payment (allow overpay at a penalty) or reweight
the deck toward low values.

**Kingmaking.** Late game, a player out of contention chooses who gets a free
ride to a wreck. Watch for it in playtests; the fix if it bites is scoring
divers still in the water for partial depth, which softens the cliff.

**The free ride may be too strong.** If parking on rivals dominates, cap it:
riders beyond the first pay 1 card, or a stack can carry at most two riders.
Both are one-line changes in `reduce.ts` — keep them behind a rules-variant
flag so playtests can A/B them.

**Text legibility underwater.** Fog plus dark plus small numbers is a real
risk. Prototype the ledge-number treatment in M2, at the real camera distance,
before building anything else in 3D.

**Scope.** Five trenches of hand-authored rock is a lot of art. v1 uses one
parametric trench mesh with per-trench seed, depth and palette.

**Open questions for the user** (§ blocking nothing; defaults chosen):
target player count (default 2–4), mobile support (default: works, not
optimised), online play (default: out of scope, architecture leaves the door
open), art direction — stylised low-poly vs. moody realism (default: stylised,
it's cheaper and reads better under fog).

## 11. Milestones

| # | Goal | Done when |
| --- | --- | --- |
| **M0** | Scaffold | Vite + TS + three + Vitest running; CI runs typecheck and tests |
| **M1** | **Rules engine + CLI** | `src/cli/play.ts` plays a full 3-player game in the terminal; rules unit-tested; **we have playtested it and the game is fun** |
| **M2** | Static scene | Trenches, ledges, numbers, water mood on screen; legibility verified |
| **M3** | Playable 3D | Full click-to-move loop, event-driven animations, HUD, hand rail |
| **M4** | Opponents | Greedy + search bots, difficulty selection, bot camera/pacing |
| **M5** | Polish | Audio, bloom/particulate, quality tiers, tutorial, end screen, board-mode fallback |
| **M6** | Stretch | Seeded replays, daily seed + leaderboard, online play, extra trench decks |

**M1 is the gate.** Do not build a single trench mesh until the terminal
version is fun. If the rules don't work, nothing downstream saves them — and
the whole engine is testable before any pixel exists.

## 12. Stretch ideas (post-v1, keep out of the way for now)

- **Current cards**: an event deck that reshuffles ledge costs mid-game.
- **Air as a shared clock**: a global timer that ends the game when the deck
  runs out, rather than on divers-surfaced.
- **Asymmetric divers**: one per player with a small ability (ignores 1 rider,
  or may re-enter a closed trench).
- **Daily seed**: same trenches and deck for everyone, score-chase.
- **Online**: the engine is already deterministic — netplay is action relay
  plus a lockstep check, no rewrite.

## 13. Name candidates

Sunken Hold · Salvage Line · Deep Cut · The Gutter · Bends & Bounty ·
Clipped In · Trencher

---

*Next step: M0 + M1. Say the word and I'll scaffold the project and build the
rules engine with the terminal playtest loop.*
