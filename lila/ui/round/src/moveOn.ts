import { isSwitchable } from 'lib/game';
import { storage } from 'lib/storage';

import type RoundController from './ctrl';
import { whatsNext } from './xhr';

export default class MoveOn {
  private readonly storage = storage.boolean(this.key);

  constructor(
    private readonly ctrl: RoundController,
    private readonly key: string,
  ) {}

  toggle = (): void => {
    this.storage.toggle();
    this.next(true);
  };

  get: () => boolean = this.storage.get;

  private readonly redirect = (href: string) => {
    this.ctrl.setRedirecting();
    window.location.href = href;
  };

  next = (force?: boolean): void => {
    const d = this.ctrl.data;
    // a player who has yet to answer the count stays: it is their turn as far as lila is concerned
    if (d.player.spectator || !isSwitchable(d) || this.ctrl.isMyTurn() || !this.get()) return;
    if (force) this.redirect('/round-next/' + d.game.id);
    else if (d.simul) {
      if (d.simul.hostId === this.ctrl.opts.userId && d.simul.nbPlaying > 1)
        this.redirect('/round-next/' + d.game.id);
    } else
      whatsNext(this.ctrl).then(data => {
        if (data.next) this.redirect('/' + data.next);
      });
  };
}
