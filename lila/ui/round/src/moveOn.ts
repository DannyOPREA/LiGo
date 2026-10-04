import { isSwitchable } from 'lib/game';
import { type LichessBooleanStorage, storage } from 'lib/storage';

import type RoundController from './ctrl';
import { whatsNext } from './xhr';

export default class MoveOn {
  // set in the constructor, after `key`: a field initializer may run before parameter properties are
  // assigned (it does under node's type transform, which the unit tests use)
  private readonly storage: LichessBooleanStorage;
  readonly get: () => boolean;

  constructor(
    private readonly ctrl: RoundController,
    key: string,
    // how the page leaves for the next game (the tests record it instead)
    private readonly navigate: (href: string) => void = href => {
      window.location.href = href;
    },
  ) {
    this.storage = storage.boolean(key);
    this.get = this.storage.get;
  }

  toggle = (): void => {
    this.storage.toggle();
    this.next(true);
  };

  private readonly redirect = (href: string) => {
    this.ctrl.setRedirecting();
    this.navigate(href);
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
