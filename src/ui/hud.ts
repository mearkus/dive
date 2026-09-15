import { standings, type GameState, type LegalDescend } from '../rules/index.js';
import type { Lesson } from './coach.js';
import { PLAYER_CSS } from '../render/palette.js';

export interface PayOption {
  label: string;
  cardIndices: number[];
  /** Marks a payment that burns its cards rather than discarding them. */
  danger?: boolean;
  onPick(): void;
}

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node as T;
}

export class Hud {
  private players = el('players');
  private meta = el('meta');
  private prompt = el('prompt');
  private hand = el('hand');
  private options = el('options');
  private logBox = el('log');
  private endBox = el('end');
  private coach = el('coach');
  /** Last hand rendered, so a re-render can tell which cards are newly drawn. */
  private lastHand: number[] = [];

  renderState(state: GameState, humanSeats: number[]): void {
    this.players.innerHTML = '';
    for (const row of standings(state).sort((a, b) => a.player - b.player)) {
      const active = row.player === state.current && !state.over;
      // One diver from surfacing their last is one diver from ending the game.
      const closing = row.stranded === 1 && state.endTriggeredBy === null;
      const card = document.createElement('div');
      card.className = `player${active ? ' active' : ''}${closing ? ' closing' : ''}`;
      card.dataset.seat = String(row.player);
      card.style.setProperty('--c', PLAYER_CSS[row.player % PLAYER_CSS.length]);
      card.innerHTML =
        `<span class="dot">${String.fromCharCode(65 + row.player)}</span>` +
        `<span class="who">${humanSeats.length === 0 ? 'Bot' : humanSeats.includes(row.player) ? 'You' : 'Bot'}</span>` +
        `<span class="score">${row.score}</span>` +
        `<span class="sub">${row.surfaced} up · ${row.stranded} down</span>`;
      this.players.appendChild(card);
    }

    const open = state.trenches.filter((t) => !t.closed).length;
    this.meta.innerHTML =
      `<span>turn ${state.turn}</span>` +
      `<span>${open}/${state.trenches.length} trenches open</span>`;

    this.renderFinale(state, humanSeats);
  }

  /**
   * Show one tutorial lesson. It stays until the player dismisses it or makes
   * a move — an earlier version timed out after 15 seconds, which quietly ate
   * the opening lesson while the player was still reading the board.
   */
  showCoach(lesson: Lesson, onDismiss: () => void): void {
    el('coachTitle').textContent = lesson.title;
    el('coachText').innerHTML = lesson.body;
    this.coach.classList.add('show');

    const dismiss = () => {
      this.hideCoach();
      onDismiss();
    };
    const ok = el<HTMLButtonElement>('coachOk');
    ok.onclick = dismiss;

  }

  hideCoach(): void {
    this.coach.classList.remove('show');
  }

  /**
   * The end used to be announced by two small words in the meta strip, with
   * only one to three turns left in the whole game. It gets a banner and a
   * count now.
   */
  private renderFinale(state: GameState, humanSeats: number[]): void {
    const banner = el('finale');
    if (state.endTriggeredBy === null || state.over) {
      banner.classList.remove('show', 'last');
      return;
    }
    const seats = state.players.length;
    const left = ((state.endTriggeredBy - state.current + seats) % seats) || seats;
    const yours = humanSeats.includes(state.current);
    banner.classList.add('show');
    banner.classList.toggle('last', yours);
    banner.textContent = yours
      ? 'Final round — your last turn'
      : `Final round — ${left} turn${left === 1 ? '' : 's'} left`;
  }

  setPrompt(html: string): void {
    this.prompt.innerHTML = html;
  }

  /**
   * The hand rail. `used` lifts the cards a hovered payment would spend.
   * Cards that were not in the previous hand deal in from the deck, so it is
   * visible where they came from.
   */
  setHand(cards: number[], used: number[] = []): void {
    // Multiset diff against the last render: anything left over is newly drawn.
    const previous = new Map<number, number>();
    for (const value of this.lastHand) previous.set(value, (previous.get(value) ?? 0) + 1);

    const isNew = cards.map((value) => {
      const left = previous.get(value) ?? 0;
      if (left > 0) {
        previous.set(value, left - 1);
        return false;
      }
      return true;
    });

    this.hand.innerHTML = '';
    let dealt = 0;
    cards.forEach((value, i) => {
      const card = document.createElement('span');
      card.className = `card${used.includes(i) ? ' used' : ''}${isNew[i] ? ' dealt' : ''}`;
      // The value is a lungful of air, so it is also shown as bubbles.
      const bubbles = '<i></i>'.repeat(value);
      card.innerHTML =
        `<span class="idx">${value}</span><span class="big">${value}</span>` +
        `<span class="bubbles">${bubbles}</span>`;
      if (isNew[i]) card.style.animationDelay = `${dealt++ * 70}ms`;
      this.hand.appendChild(card);
    });
    this.lastHand = [...cards];
  }

  /**
   * Send card-backs sailing between two points. Opponents' spending used to
   * change nothing but a two-digit count, so the deck never looked shared.
   */
  private fly(from: DOMRect, to: DOMRect, count: number, delay = 0): void {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const n = Math.min(count, 4);
    for (let i = 0; i < n; i++) {
      const flyer = document.createElement('div');
      flyer.className = 'flyer';
      flyer.style.left = `${from.left + from.width / 2 - 13}px`;
      flyer.style.top = `${from.top + from.height / 2 - 18}px`;
      flyer.style.opacity = '0';
      document.body.appendChild(flyer);

      const dx = to.left + to.width / 2 - (from.left + from.width / 2);
      const dy = to.top + to.height / 2 - (from.top + from.height / 2);
      window.setTimeout(() => {
        flyer.style.opacity = '1';
        flyer.style.transform = `translate(${dx}px, ${dy}px) rotate(${(i - 1) * 14}deg) scale(.8)`;
      }, delay + i * 80);
      window.setTimeout(() => {
        flyer.style.opacity = '0';
      }, delay + i * 80 + 380);
      window.setTimeout(() => flyer.remove(), delay + i * 80 + 700);
    }
  }

  /** An opponent paying into the shared discard. */
  opponentSpends(seat: number, count: number): void {
    const chip = this.players.querySelector<HTMLElement>(`[data-seat="${seat}"]`);
    if (!chip) return;
    this.fly(chip.getBoundingClientRect(), el('discard').getBoundingClientRect(), count);
  }

  /** The discard going back into the deck. */
  reshuffle(): void {
    this.fly(el('discard').getBoundingClientRect(), el('deck').getBoundingClientRect(), 4);
    const deck = el('deck');
    deck.animate(
      [{ transform: 'none' }, { transform: 'scale(1.12)' }, { transform: 'none' }],
      { duration: 520, easing: 'ease-out' },
    );
  }

  /** Deck and discard counts, the top discard, and air burnt for good. */
  setPiles(deck: number, discard: number, top?: number, burnt = 0): void {
    const burntEl = el('burnt');
    burntEl.textContent = burnt > 0 ? `${burnt} gone` : '';
    burntEl.classList.toggle('show', burnt > 0);
    el('deck').classList.toggle('empty', deck === 0);
    el('discard').classList.toggle('empty', discard === 0);
    el('deck').querySelector('.pile-count')!.textContent = String(deck);
    el('discard').querySelector('.pile-count')!.textContent = String(discard);
    el('discardTop').textContent = top === undefined ? '' : String(top);
  }

  /**
   * Send the spent cards to the discard pile. Runs on the elements already on
   * screen, before the hand is rebuilt, so the player sees which cards left.
   */
  spendCards(values: number[]): void {
    const remaining = [...values];
    const discardRect = el('discard').getBoundingClientRect();

    for (const card of [...this.hand.children] as HTMLElement[]) {
      const value = Number(card.querySelector('.big')?.textContent);
      const at = remaining.indexOf(value);
      if (at < 0) continue;
      remaining.splice(at, 1);
      const dx = discardRect.left + discardRect.width / 2 - (card.getBoundingClientRect().left + card.offsetWidth / 2);
      card.style.setProperty('--dx', `${dx}px`);
      card.classList.remove('used');
      card.classList.add('spending');
    }
    // The hand is rebuilt by the next sync; nothing to clean up here.
  }

  setOptions(options: PayOption[], onHover: (indices: number[]) => void): void {
    this.options.innerHTML = '';
    for (const option of options) {
      const button = document.createElement('button');
      button.className = `pay${option.danger ? ' burns' : ''}`;
      button.innerHTML = option.label;
      button.addEventListener('click', option.onPick);
      button.addEventListener('pointerenter', () => onHover(option.cardIndices));
      button.addEventListener('pointerleave', () => onHover([]));
      this.options.appendChild(button);
    }
  }

  clearOptions(): void {
    this.options.innerHTML = '';
  }

  log(line: string, tone: 'normal' | 'good' | 'bad' = 'normal'): void {
    const row = document.createElement('div');
    row.className = `line ${tone}`;
    row.textContent = line;
    this.logBox.appendChild(row);
    while (this.logBox.childElementCount > 9) this.logBox.removeChild(this.logBox.firstChild!);
    this.logBox.scrollTop = this.logBox.scrollHeight;
  }

  showEnd(state: GameState, humanSeats: number[], onReplay: () => void): void {
    const table = standings(state);
    const champion = table[0];
    const won = humanSeats.includes(champion.player);
    this.endBox.innerHTML =
      `<div class="panel"><h2>${won ? 'You win' : `${String.fromCharCode(65 + champion.player)} wins`}` +
      ` with ${champion.score}</h2><table>` +
      table
        .map(
          (r) =>
            `<tr><td style="color:${PLAYER_CSS[r.player % PLAYER_CSS.length]}">` +
            `${String.fromCharCode(65 + r.player)}</td><td>${r.score} pts</td>` +
            `<td>${r.hauls} hauls</td><td>${r.stranded} stranded</td></tr>`,
        )
        .join('') +
      `</table><button id="replay">Dive again</button></div>`;
    this.endBox.classList.add('show');
    el('replay').addEventListener('click', onReplay);
  }

  describeTarget(descend: LegalDescend, state: GameState): string {
    const trench = state.trenches[descend.trench];
    if (descend.from.kind === 'surface') {
      return `Enter <b>${trench.name}</b> — ledge 1, cost <b>${descend.cost}</b>`;
    }
    // Naming the empty case matters as much as the full one: "why didn't the
    // free ride happen?" is answered by being last onto the ledge.
    const stack = trench.stacks[descend.from.ledge - 1];
    const hasDiversBelow = stack.indexOf(descend.diver) > 0;
    const riders = descend.riders.length
      ? ` <span class="warn">tows ${descend.riders.join(', ')} free</span>`
      : hasDiversBelow
        ? ` <span class="good">tows nobody — you are last onto this ledge</span>`
        : '';
    const wreck = descend.reachesWreck
      ? ` <span class="good">reaches the wreck — takes ${trench.treasure[0] ?? 0}</span>`
      : '';
    return `<b>${descend.diver}</b> → ledge ${descend.toLedge} of <b>${trench.name}</b>, cost <b>${descend.cost}</b>${wreck}${riders}`;
  }
}
