import type AnalyseCtrl from './ctrl';

/** Milliseconds between moves (lila's "realtime" and "by CPL" replays need a game's clock or an engine). */
export type AutoplayDelay = number;

export class Autoplay {
  private timeout?: Timeout;
  private delay?: AutoplayDelay;

  lastMoveAt?: number;

  constructor(private readonly ctrl: AnalyseCtrl) {}

  private move(): boolean {
    const child = this.ctrl.node.children[0];
    if (child) {
      const path = this.ctrl.path + child.id;
      this.ctrl.jump(path);
      this.lastMoveAt = Date.now();
      this.ctrl.redraw();
      return true;
    }
    this.stop();
    this.ctrl.redraw();
    return false;
  }

  private schedule(): void {
    this.timeout = setTimeout(() => {
      if (this.move()) this.schedule();
    }, this.delay);
  }

  start(delay: AutoplayDelay): void {
    this.stop();
    this.delay = delay;
    this.schedule();
  }

  stop(): void {
    this.delay = undefined;
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = undefined;
    }
    this.lastMoveAt = undefined;
  }

  toggle(delay: AutoplayDelay): void {
    if (this.active(delay)) this.stop();
    else {
      if (!this.active() && !this.move()) this.ctrl.jump('');
      this.start(delay);
    }
  }

  active = (delay?: AutoplayDelay) => (!delay || delay === this.delay) && !!this.timeout;

  getDelay = () => this.delay;
}
