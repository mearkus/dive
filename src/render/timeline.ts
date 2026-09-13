/**
 * Turns the reducer's ordered GameEvent list into a queue of timed steps.
 * Nothing here touches game state — the renderer is a consumer, per
 * DESIGN.md §6.1.
 */
export interface Step {
  duration: number;
  start?(): void;
  done?(): void;
}

export class Timeline {
  private queue: Step[] = [];
  private current: Step | null = null;
  private elapsed = 0;
  private rate = 1;
  private idleCallbacks: (() => void)[] = [];

  get busy(): boolean {
    return this.current !== null || this.queue.length > 0;
  }

  push(step: Step): void {
    this.queue.push(step);
  }

  /** Fast-forward: bot turns and impatient players run at a higher rate. */
  setRate(rate: number): void {
    this.rate = Math.max(0.1, rate);
  }

  skip(): void {
    this.rate = 8;
  }

  onIdle(fn: () => void): void {
    this.idleCallbacks.push(fn);
  }

  update(dt: number): void {
    const wasBusy = this.busy;
    let remaining = dt * this.rate;

    while (remaining > 0) {
      if (!this.current) {
        const next = this.queue.shift();
        if (!next) break;
        this.current = next;
        this.elapsed = 0;
        next.start?.();
      }
      const left = this.current.duration - this.elapsed;
      if (remaining < left) {
        this.elapsed += remaining;
        remaining = 0;
      } else {
        remaining -= left;
        this.current.done?.();
        this.current = null;
      }
    }

    if (wasBusy && !this.busy) {
      this.rate = 1;
      const fns = this.idleCallbacks;
      this.idleCallbacks = [];
      for (const fn of fns) fn();
    }
  }
}
