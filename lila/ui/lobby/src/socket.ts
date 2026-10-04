import { idleTimer } from 'lib/event';

import type LobbyController from './ctrl';
import * as hookRepo from './hookRepo';
import type { PoolMember, Hook } from './interfaces';
import type { PoolRange } from './quickPair';

type Handlers = Record<string, (data: any) => void>;

export default class LobbySocket {
  handlers: Handlers;

  constructor(
    readonly send: SocketSend,
    ctrl: LobbyController,
  ) {
    this.handlers = {
      had(hook: Hook) {
        hookRepo.add(ctrl, hook);
        if (hook.action === 'cancel') ctrl.flushHooks(true);
        ctrl.redraw();
      },
      hrm(ids: string) {
        ids.match(/.{8}/g)!.forEach(function (id) {
          hookRepo.remove(ctrl, id);
        });
        ctrl.redraw();
      },
      hooks(hooks: Hook[]) {
        hookRepo.setAll(ctrl, hooks);
        ctrl.flushHooks(true);
        ctrl.redraw();
      },
      hli(ids: string) {
        hookRepo.syncIds(ctrl, ids.match(/.{8}/g) || []);
        ctrl.redraw();
      },
      reload_seeks() {
        if (ctrl.showsCorrespondence() || ctrl.waiting?.kind === 'seek') ctrl.fetchSeeks();
      },
      // the quick-pairing tiles (unit 6.6): each pool's waiting count, and who you can meet where you wait
      poolSizes(sizes: Record<string, number>) {
        ctrl.setPoolSizes(sizes);
      },
      poolRange(range: PoolRange) {
        ctrl.setPoolRange(range);
      },
    };

    idleTimer(
      3 * 60 * 1000,
      () => send('idle', true),
      () => {
        send('idle', false);
        ctrl.awake();
      },
    );
  }

  realTimeIn() {
    this.send('hookIn');
  }
  realTimeOut() {
    this.send('hookOut');
  }

  poolIn(member: PoolMember) {
    // last arg=true: must not retry
    // because if poolIn is sent before socket opens,
    // then poolOut is sent,
    // then poolIn shouldn't be sent again after socket opens.
    // poolIn is sent anyway on socket open event.
    this.send('poolIn', member, {}, true);
  }

  poolOut(member: PoolMember) {
    this.send('poolOut', member.id);
  }

  receive = (tpe: string, data: any): boolean => {
    if (this.handlers[tpe]) {
      this.handlers[tpe](data);
      return true;
    }
    return false;
  };
}
