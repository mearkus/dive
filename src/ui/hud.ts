import { standings, type GameState, type LegalDescend } from '../rules/index.js';
import type { Lesson } from './coach.js';
import { PLAYER_CSS } from '../render/palette.js';

export interface PayOption {
  label: string;
  cardIndices: number[];
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
  private coachTimer = 0;

  renderState(state: GameState, humanSeats: number[]): void {
    this.players.innerHTML = '';
    for (const row of standings(state).sort((a, b) => a.player - b.player)) {
      const active = row.player === state.current && !state.over;
      const card = document.createElement('div');
      card.className = `player${active ? ' active' : ''}`;
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
      `<span>turn ${state.turn}</span><span>deck ${state.deck.length}</span>` +
      `<span>${open}/${state.trenches.length} trenches open</span>` +
      (state.endTriggeredBy !== null ? `<span class="warn">final round</span>` : '');
  }

  /** Show one tutorial lesson. Non-sticky lessons fade out on their own. */
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

    window.clearTimeout(this.coachTimer);
    if (!lesson.sticky) {
      this.coachTimer = window.setTimeout(dismiss, 15000);
    }
  }

  hideCoach(): void {
    window.clearTimeout(this.coachTimer);
    this.coach.classList.remove('show');
  }

  setPrompt(html: string): void {
    this.prompt.innerHTML = html;
  }

  /** The hand rail. `used` dims the cards a hovered payment would spend. */
  setHand(cards: number[], used: number[] = []): void {
    this.hand.innerHTML = '';
    cards.forEach((value, i) => {
      const chip = document.createElement('span');
      chip.className = `card${used.includes(i) ? ' used' : ''}`;
      chip.textContent = String(value);
      this.hand.appendChild(chip);
    });
  }

  setOptions(options: PayOption[], onHover: (indices: number[]) => void): void {
    this.options.innerHTML = '';
    for (const option of options) {
      const button = document.createElement('button');
      button.className = 'pay';
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
    const riders = descend.riders.length
      ? ` <span class="warn">carries ${descend.riders.join(', ')} free</span>`
      : '';
    const wreck = descend.reachesWreck
      ? ` <span class="good">reaches the wreck — takes ${trench.treasure[0] ?? 0}</span>`
      : '';
    return `<b>${descend.diver}</b> → ledge ${descend.toLedge} of <b>${trench.name}</b>, cost <b>${descend.cost}</b>${wreck}${riders}`;
  }
}
