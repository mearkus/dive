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

> **Status: implemented and playtested.** Everything in §3 is live in
> `src/rules/`, covered by 33 tests, and measured over thousands of simulated
> games. Numbers below are the tuned values, not the original guesses — see
> §3.9 for what changed and why.

### 3.1 Components

- **4 trenches in play**, drawn from five defined ones of depth 4 / 5 / 6 / 7 / 8.
- Each **ledge** carries a **current value** of 1–6 — what it costs to reach.
  Values are drawn per-trench at setup from a fixed distribution so deeper
  ledges skew expensive (see §3.7).
- **Surface**: a shared boat row above all trenches; every diver starts here.
- **Divers**: 4 per player, colour-coded, plus a shape badge for accessibility.
- **Air deck**: 60 cards, values 1–6, weighted toward low values —
  **16×1, 14×2, 11×3, 8×4, 6×5, 5×6**. Hand size **5**.
- **Treasure**: 4 tokens per trench, values descending — the first diver to a
  floor takes the richest.

### 3.2 Setup

Shuffle the air deck (seeded PRNG — see §6.4). Deal 5 cards to each player.
Roll ledge values. Place treasure token piles face-up on each trench floor,
richest on top. All divers on the surface. Random start player.

### 3.3 Turn structure

On your turn, do exactly one of:

**A. Descend** — move one of your divers one ledge deeper, paying its cost.
**B. Surface for air** — discard your whole hand, draw a fresh five. This is
your entire turn, and it is **only legal when you cannot afford any descend**.
It is a pressure valve, not a strategic option (§3.9).

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
- When a trench's fourth token is taken the trench is **picked clean**. It
  closes to new divers, and — critically — **every diver still inside it aborts
  the dive and surfaces immediately with nothing**. The wreck is stripped;
  there is no reason to keep descending.

  This is the game's second source of tension. Dawdle in a trench and the
  divers ahead of you can end your dive outright, wasting every card you spent
  getting there. It is also load-bearing: without it, divers in a picked-clean
  trench become dead pieces that can never score and never leave, which
  deadlocks the game permanently (§3.9).

- **The air clock.** Each time the deck is exhausted and the discard pile is
  reshuffled, air runs lower. After the **6th** reshuffle the game ends no
  matter what. This guarantees termination even if every player stalls; in
  practice a game uses about 3 reshuffles, so the clock almost never binds.
- **Game end** triggers when any player has surfaced all four divers, every
  trench has closed, or the air runs out. Finish the round so all players have
  had equal turns.
- Divers still in the water at the end score **nothing**.
- Highest treasure total wins. Tiebreak: most hauls brought back (an aborted
  dive is not a haul), then the single richest haul.

### 3.7 Starting numbers to tune from

Treasure pools, top token first:

| Trench | Depth | Tokens |
| --- | --- | --- |
| Shelf Break | 4 | 3, 2, 1, 1 |
| Kelp Chimney | 5 | 5, 3, 2, 1 |
| The Gutter | 6 | 7, 5, 3, 2 |
| Blacklip Wall | 7 | 9, 6, 4, 2 |
| Sunken Hold | 8 | 12, 8, 5, 3 |

With four trenches in play the set is spread across the depth range, so a
short game still offers both a cheap trench and a deep one.

Ledge costs: ledge 1 is always 1–2 (cheap entry). Remaining ledges draw from a
bag weighted toward the deep — roughly `1..3` for the top third, `2..5` for the
middle, `3..6` for the bottom third, with the floor ledge never below 3.

Measured game length, 3 players: **49 turns, ~16 per player**. (The original
estimate of 25–35 was simply bad arithmetic — a diver needs one turn per ledge,
so total turns scale with divers × depth.)

### 3.8 Worked example

Ana's diver sits on The Gutter ledge 3. Below her on ledge 4 is nothing; above
her on ledge 3 sit Ben's diver and Cal's diver, in that order. Ledge 4 costs 5.
Ana holds `2 3 3 6 1`. She plays `2+3`, descends — and Ben and Cal ride down
with her for free, still stacked in order. Ben is now one ledge from the wreck
and hasn't spent a card all game. Ana's consolation: she's still beneath them,
so the next descent she pays for drags them along again — but she'll reach the
floor first and take the 7.

### 3.9 What the playtests changed

Milestone M1 built the engine and a terminal game, then ran thousands of
simulated games to answer the questions §10 raised. Four things changed, and
one of them was a genuine bug in the rules as first written.

**1. A picked-clean trench deadlocked the game outright.** The original rule —
"divers already inside continue normally" — created dead pieces: a trench with
no treasure left still held divers who could descend but could never score. In
one measured game, twelve divers sat trapped in a stripped trench. No player
could ever surface all their divers, so the end condition could never fire and
the game ran to the 3000-turn safety cap. Recalling every diver when a trench
closes fixes it, and turns dead weight into the game's second tension.

**2. The game had no guaranteed termination.** Even with (1) fixed, nothing
stopped every player from stalling forever. A board game resolves that
socially; software cannot. The air clock is the backstop.

**3. Refreshing had to stop being a free choice.** As a voluntary option, a
third of all turns were spent passing. Restricting it to "only when you can
afford nothing" cut games from 69 to 49 turns, raised free rides from 16% to
21% of all movement, and evened out a first-player advantage.

**4. The exact-sum rule really did jam hands.** With a uniform 1–6 deck,
players were stuck with an unaffordable hand on 15–18% of turns — above the
15% line §10 set for retuning. Weighting the deck toward low values
(16/14/11/8/6/5) dropped that to **8–10%** without touching the movement rules.

Measured over 600 games per player count, with the tuned rules:

| | 2 players | 3 players | 4 players |
| --- | --- | --- | --- |
| turns per player | 19.7 | 16.4 | 13.9 |
| forced refreshes | 8.3% | 9.2% | 9.7% |
| free rides (share of all movement) | 13.3% | 20.9% | 26.8% |
| aborted dives (share of divers) | 12% | 28% | 38% |
| seat win rate spread | 51/49 | 31/33/36 | 23/25/27/25 |
| games ending normally | 100% | 100% | 100% |

Seat order is fair, no game hits the turn cap, and the free ride — the whole
point of the design — now fires constantly. **The one number still worth
watching in human playtests is the 4-player abort rate**: at 38%, more than a
third of divers come home empty because a rival stripped their trench. That may
read as brutal rather than tense. It tracks the diver-to-token ratio, not the
trench count (adding a fifth trench changed nothing), so the lever is diver
count or tokens per trench.

**One thing the simulations cannot tell us** is whether the free ride is *fun*
or merely frequent — whether handing a rival a lift feels like an agonising
choice or an annoying tax. That needs humans, and it is the first question to
put to a real playtest.

## 4. Why this works as a video game

The board game's tension is social and readable; the screen's job is to make
the stack state instantly legible and the free ride *feel* like something.
Three design commitments follow:

0. **Surface divers are interchangeable.** Discovered the moment the terminal
   game listed its options: offering each idle diver separately turned 4 real
   choices into 24 identical-looking ones. At the surface the player picks a
   *trench*, not a diver. The 3D UI must do the same.
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
  // `cards` are indices into the mover's hand; `trench` is required only
  // when the diver is entering from the surface.
  | { kind: 'descend'; diver: string; cards: number[]; trench?: number }
  | { kind: 'refresh' };

type GameEvent =
  | { t: 'cards-spent'; player: number; values: number[] }
  | { t: 'stack-moved'; trench: number; from: number; to: number; divers: string[] }
  | { t: 'treasure-taken'; player: number; diver: string; trench: number; value: number }
  | { t: 'trench-closed'; trench: number }
  | { t: 'divers-recalled'; trench: number; divers: string[] }
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

**✅ Exact-sum deadlock — measured and fixed.** A uniform 1–6 deck jammed hands
on 15–18% of turns, over the line. Reweighting the deck toward low values
dropped it to 8–10%. Overpay-with-penalty was never needed. Keep the
instrument (`npm run sim`) pointed at this number whenever costs or deck
change.

**✅ Non-termination — found and fixed.** Two separate holes (stranded divers
in a stripped trench; universal stalling) let games run forever. Fixed by the
recall rule and the air clock; 0 of 1800 measured games now fail to end. Any
future rule change must be re-checked against the `full games` test, which
asserts termination and card conservation over 40 complete games.

**Kingmaking.** Late game, a player out of contention chooses who gets a free
ride to a wreck. Bots cannot reveal this — it needs humans. The fix if it bites
is scoring divers still in the water for partial depth, which softens the
cliff.

**The free ride may be too strong.** At 13–27% of all movement it is central
without being dominant, and bots that exploit it do not run away with games
(win margins hold at ~4 points). The `maxRiders` variant is implemented and
tested if human play says otherwise.

**The 4-player abort rate.** 38% of divers come home empty at four players.
Tense or just punishing? Humans decide. Levers: divers per player, or a fifth
token per trench.

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
| **M0** | ✅ Scaffold | Vite + TS + three + Vitest running; CI runs typecheck, tests and build |
| **M1** | ✅ **Rules engine + CLI** | Engine complete and pure; 33 tests; `npm run play` plays a full game in the terminal; `npm run sim` measures balance. Bot-level tuning is done and the numbers are healthy — **the remaining gate is a human playtest** (§3.9) |
| **M2** | ✅ Static scene | Trenches as lit shafts, cost plates, treasure plates, fog/backdrop/particulate; legibility verified in-browser at real camera distance |
| **M3** | ✅ **Playable 3D** | Click a diver or a glowing ledge → pick an exact-sum payment → animated descent. HUD, hand rail, play log, bots, end screen, `?watch=1` attract mode. Verified end-to-end in a headless browser: a full 45-turn game with zero page errors |
| **M4** | ✅ Opponents | Greedy + search bots, difficulty selection, bot pacing. Strength **measured**, not assumed: search wins 62% of seats head-to-head at 2 players and 55% against a 33% fair share at 3 (§11c) |
| **M5** | Polish (in progress) | ✅ tutorial, end screen, quality tiers, particulate, audio, bloom, art pass. Remaining: 2D board-mode fallback |
| **M6** | Stretch | Seeded replays, daily seed + leaderboard, online play, extra trench decks |

**M1 is the gate, and it earned its keep.** Building the terminal version
first surfaced a rules bug that deadlocked the game permanently, a missing
termination guarantee, and a UI trap — none of which would have been visible
until very late if we had started with trench meshes. Do not build 3D until a
human has played the terminal version and confirmed the free ride is fun, not
just frequent.

## 11b. What building the browser client changed

M2/M3 are done and the game is playable. Four things the engine work could not
have told us:

**Legibility was the right thing to prototype first, and the fix was not
subtle.** Bare numbers in fog are unreadable. What works is an opaque plate
behind every number, `fog: false` on all UI sprites so depth never costs
legibility, and — the part that was not in the plan — **labels that hold a
near-constant screen size**. Fitting a four-trench board onto a phone pushes
the camera far enough back that world-scaled text becomes noise. Label scale
is now derived from camera distance every frame.

**The camera must fit the board to the viewport's aspect ratio.** The first
build framed on width alone and showed two of four trenches on a phone.
`fitDistance()` now solves for both axes and reserves margin for the HUD and
card tray.

**A focus-follows-selection camera was a mistake.** Panning the orbit target
toward the chosen trench accumulated drift across a game until the deepest
trench sat off screen. Removed — the board fits in one view, so nothing needs
to move.

**Stack rendering needs three cues, not one.** Divers on a shared ledge now
spread left-to-right in stack order (leftmost is the carrier), alternate
front/back so badges never sit flush, shrink as the stack grows, and are
joined by a visible dive line. A six-diver stack was unreadable without all
four.

Still deferred to M5, as planned: audio, bloom, the tutorial, and the 2D
board-mode fallback.

## 11c. Verifying the opponents

The intro offers "Standard" and "Tough" opponents. That is a claim, so it
needed measuring rather than assuming — `npm run sim --bots=search,greedy`
seats the two policies against each other and rotates seats every game so the
result is policy strength, not seat luck.

The first measurement said **54% over 200 games** — inside the noise, i.e. the
"Tough" setting was not demonstrably tougher. The cause was a one-line bug in
the search bot's action list: candidate moves were deduplicated by diver id
alone, but a diver waiting at the surface has one legal action *per open
trench*, all sharing that id. They collapsed to a single entry, so the bot
could only ever enter whichever trench came first and never chose between
them. Keying on diver *and* trench fixed it.

| | search | greedy |
| --- | --- | --- |
| 2 players, 600 games | **62.2%** of seats won | 37.8% |
| 3 players, 300 games | **55.3%** (fair share 33.3%) | 22.3% each |

Worth noting for anyone tuning it further: before the fix, search won slightly
more often while scoring *less* than greedy. That is consistent with its
evaluation, which maximises the margin over the best opponent rather than raw
points — it plays to win, not to score.

**Mobile.** Phone play is legible in portrait and the board re-lays-out when
the device rotates, but landscape on a phone is inherently tight: eight ledges
plus the surface have to share roughly 250 usable pixels of height, which caps
how large a cost plate can be. Portrait is the orientation to hold it in.
Making landscape genuinely good needs a different presentation — showing part
of the board and panning — not more camera maths.

## 11d. The tutorial

Built as **contextual coaching**, not a scripted tutorial mode: short lessons
that fire the first time each situation becomes true, once each, remembered
across sessions.

The reasoning is that the interface is not what needs teaching — click a
diver, pick a payment, done. What needs teaching is *why the line rule
matters*, and no rules screen conveys that. It lands when the player has a
move selected and the prompt reads "carries C3, C1 free" — so that is exactly
when the lesson appears.

A scripted mode was rejected: it would need forced game states and a script
engine, would duplicate the rules, and would teach the mechanic at a moment
the player has no stake in it.

Nine lessons, weighted so the most important wins when several match at once:
the opening move, exact-sum payment, **carrying riders** and **being
carried**, hitching onto a rival, the wreck coming into reach, a trench being
stripped, a forced refresh, and the final round. Decision-moment lessons are
sticky — they stay while the payment panel is open; the rest time out.

**A lesson must not time out.** The first version dismissed non-sticky lessons
after 15 seconds, which quietly ate the opening lesson while the player was
still reading the board — reported as "where is the tutorial?" by the first
person to play it, on a build where it had in fact fired correctly. Lessons
now wait to be dismissed, or until the player moves.

**"Sometimes it fires, sometimes it doesn't."** The second person-report on the
line rule, and the rule was working perfectly — the wording hid half of it.
"Everyone stacked above you" is only true of divers that arrived on that ledge
*after* yours, and entering a trench always puts you on top of whoever is
already there, so a diver that just moved in tows nobody. Worse, "above" was a
vertical metaphor for something drawn as a flat horizontal row, so it had no
visual referent at all.

Three changes, because this is the mechanic the whole game rests on: the rule
is now phrased as "everyone who landed there after you" with the consequence
spelled out (first in tows everyone, last in tows nobody); the move prompt
names the empty case explicitly — *tows nobody, you are last onto this ledge* —
rather than silently omitting it; and each later arrival now sits slightly
higher on the ledge, so the rope slopes and "after you" finally reads as
"above you" on the board.

**And the rules must stay reachable.** The same session produced two questions
the game could not answer for itself — why the ledge numbers look random, and
how the playable ones are chosen. A `?` button now opens a rules card from
anywhere in the game. A tutorial that only fires once cannot be the only place
the cost model is explained.

Notes for anyone extending it:

- The opening lesson cannot key off `state.turn`. The start player is random,
  so a human seated second or third reaches their first turn well after the
  counter has moved; it keys off "none of my divers have left the surface".
- `localStorage` is wrapped in try/catch. Blocked storage degrades to
  re-teaching each session rather than throwing.
- Tips are off in `?watch=1`, and the intro carries an opt-out plus a reset
  that only appears once there is something to reset.

## 11e. The card tray

Reported as "the circled part are cards, but should be more obvious" — the
hand rendered as five numbered tiles with no indication that they were cards,
where they came from, or where they went.

The tray is now **deck → hand → spent**, left to right. Cards carry a corner
index and a card face; the deck is a face-down stack with its remaining count;
the discard shows its count and the value on top. Spending flies the paid
cards into the discard before the hand rebuilds, and their replacements deal
in from the deck with a stagger. The economy is otherwise invisible: a player
cannot reason about a 60-card deck they never see.

Implementing this surfaced an unrelated bug worth recording. `sync()` rendered
`state.current`'s hand — which during a bot's turn is **the bot's hand**. Every
opponent's cards were on screen for the whole of their turn. The hand now
always renders the viewer's own seat (`humanSeats[0]`, falling back to the
current player in watch mode, where there is nothing to hide).

## 11f. Art direction pass

Asked for on visuals alone: meeples, thematic trenches, thematic card values,
thematic treasure.

- **Divers are meeples.** The classic silhouette — round head, arms out,
  flared base — drawn once as a 2D outline and extruded, with a tank on the
  back and a mask across the face. A board game piece, not a model of a
  person: the shape has to read at thirty pixels tall, and a capsule never did.
- **Trenches are rock.** Ledges are irregular extruded slabs with flat
  shading rather than boxes, seeded per trench and ledge so no two shelves
  match; coral nubs cling to each one; a fringe of kelp rings the mouth of
  every shaft; and the wreck is a broken hull with ribs instead of a crate.
- **Card values are air.** Each card carries its number as a row of bubbles
  beneath the numeral. The numeral stays for legibility at phone sizes — the
  bubbles say what the number *is*.
- **Treasure is coins.** Struck gold discs with rims and values, richest
  first, rather than a row of gold digits.

Two framing bugs fell out of this, both from constants standing in for
measurements:

- The card tray grew when the deck and discard piles were added, and quietly
  pushed the deepest trench behind it. A `ResizeObserver` on the chrome now
  re-frames the camera when the UI changes size, not only when the window does.
- Fitting the board to a "usable" fraction of the viewport still centred it on
  the whole canvas, so the tray — far taller than the HUD — ate the bottom of
  the board. The camera now centres on the band the UI actually leaves visible,
  and the board's vertical extent is derived from where things really are
  (nameplate top, treasure below the deepest wreck) instead of a magic number.

## 11g. Sound, and what bloom cost

**Sound is synthesised, not shipped.** The whole palette is bubbles, thuds and
chimes: a few oscillators and a noise buffer, where audio files would have
been most of a megabyte on a game that otherwise loads in one request. Cues
are driven off the same ordered event list the renderer animates, so a sound
can never disagree with what is on screen. The AudioContext is built lazily on
the first cue, which always follows the player pressing Dive, so autoplay
policy needs no special case. Muting is one button and persists.

**Bloom was worse before it was better.** The first configuration
(strength 0.34, threshold 0.92) amplified the additive light shafts into
opaque grey cones that flattened the rock and washed the whole image out —
visibly worse than the medium tier it was meant to improve on. Tuned down to
0.18 at threshold 0.95, with the shafts started dimmer on that tier to
compensate, it is a gentle glow on gold and lamp light and leaves the cost
plates untouched. Worth knowing if anyone reaches for the strength dial: the
board is mostly dark, so bloom has very little to grab except the things that
must stay readable.

The passes are ~19 kB and load on demand, so only the top tier downloads them.
`?quality=low|medium|high` forces a tier, which is also how this was compared.

## 11h. Why the board was hard to see on a phone

Reported as objects being hard to make out on mobile. Four separate causes,
none of them "make it brighter":

1. **Deep ledges were tinted to the wall colour.** Shelf colour interpolated
   `LEDGE -> ROCK` by depth, so the deepest shelf of a trench was 100% rock —
   literally the colour of the wall behind it. Ledges now fade toward a
   dedicated deep-ledge tone and never converge on the rock.
2. **Fog is distance-based, so small screens were punished.** `FogExp2`
   attenuates by camera distance, and fitting the same board onto a narrow
   phone needs roughly twice the distance: about 59% fog against 17% on a
   wide screen. The board washed out in proportion to how small the screen
   was. Density is now derived from the fitted distance, so the haze looks
   the same everywhere.
3. **The rock material multiplied itself dark.** A textured `MeshStandard`
   multiplies map by colour, and the wall tinted a dark rock texture with a
   dark rock colour — the two compounded to near-black and took the strata
   with them. The texture carries the hue now; the colour only trims it.
4. **Player colour vanished in shadow.** A meeple lit only by dim ambient
   loses the one thing about it that carries information. Each suit now
   carries a little emissive of its own colour.

Two additions aimed at small screens specifically: every shelf has a lit lip
along its front edge, which survives being eight pixels tall where a shaded
slab does not, and divers grow as the camera retreats, on the same principle
as the labels.

## 11i. The endgame felt abrupt, and it was

Reported as the game ending abruptly. Measured over 300 games per player
count before changing anything, and the complaint holds:

| | 2p | 3p | 4p |
| --- | --- | --- | --- |
| your own turns between "someone has one diver left" and the trigger | 2.7 | 1.8 | 1.6 |
| turns left after the trigger (whole table) | 1 | 2 | 3 |
| games where seat A gets a final turn at all | 51% | 65% | 74% |

Every single game ends by all-surfaced; the air clock and trenches-closed
conditions never fire in practice. So the whole endgame is: someone lands
their last diver, one to three turns happen, it is over. That was announced
by the words "final round" in the meta strip.

The rule is unchanged — it is already fair, and the trigger player correctly
gets no further turn because they have nothing left to move. What was missing
was notice:

- **An earlier warning.** The moment any player is down to one diver in the
  water, the log says so and their HUD chip is ringed amber. That roughly
  doubles the useful warning, because the dangerous moment is before the
  trigger, not after.
- **A banner with a count.** "Final round — 2 turns left", counting down, and
  "your last turn" in a different colour when it is yours.
- **A cue**, so it registers without reading.
- **A beat before the results.** The panel used to cover the final move the
  instant it landed.

Worth keeping in mind if the end is ever retuned: at two players the final
round is a single turn, and about half the time it is not yours.

## 11j. Are the meeples enough on their own?

Asked because the numbers and marks together read as busy. Measured where
divers actually stand, over 1,452 board samples at three players:

| where | share of visible divers | does identity matter |
| --- | --- | --- |
| waiting at the surface | 23% | no — they are interchangeable |
| alone on a ledge | 15% | colour alone says whose |
| sharing a ledge | 62% | yes — order decides who tows whom |

So the marks cannot simply go: most divers on screen are in exactly the
situation where knowing whose diver is whose, and in what order, is the
whole decision.

What was redundant was not the letter but the **colour**. The badge was a
filled disc in the player's colour floating directly above a meeple in the
same colour — the largest element per diver, repeating what the piece already
said. It is now a small dark chip with a white letter and a thin coloured
edge: identity and the colour-blind fallback intact, a fraction of the weight.
Divers waiting at the surface lose their mark entirely, which clears the
densest cluster on the board.

## 12. Stretch ideas (post-v1, keep out of the way for now)

- **Current cards**: an event deck that reshuffles ledge costs mid-game.
- **Air as a shared clock**: promote the air clock (§3.6) from a safety
  backstop to a real pacing constraint by tightening the limit, so the deep
  trenches carry genuine time pressure.
- **Asymmetric divers**: one per player with a small ability (ignores 1 rider,
  or may re-enter a closed trench).
- **Daily seed**: same trenches and deck for everyone, score-chase.
- **Online**: the engine is already deterministic — netplay is action relay
  plus a lockstep check, no rewrite.

## 13. Name candidates

Sunken Hold · Salvage Line · Deep Cut · The Gutter · Bends & Bounty ·
Clipped In · Trencher

---

*M0–M3 are complete and the game is playable in the browser. Next: M4 (bot
pacing and difficulty selection are in, but the search bot wants tuning) and
M5 polish. The open question is still the one simulations cannot answer —
whether the free ride is fun or merely frequent.*
