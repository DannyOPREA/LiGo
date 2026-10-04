import { numberFormat } from 'lib/i18n';
import * as poolRangeStorage from 'lib/poolRangeStorage';
import { pubsub } from 'lib/pubsub';
import { colors } from 'lib/setup/color';
import { wsPingInterval } from 'lib/socket';
import { storage, type LichessStorage } from 'lib/storage';
import { confirm } from 'lib/view';

import { isGoRuleset, isGoSize, isHandicap } from './goSetup';
import * as hookRepo from './hookRepo';
import type {
  LobbyOpts,
  LobbyData,
  Tab,
  Mode,
  Hook,
  Pool,
  PoolMember,
  GameType,
  ForceSetupOptions,
  LobbyMe,
} from './interfaces';
import { noChips, viewerOf, type Chips, type Viewer } from './openChallenges';
import { poolFromHash } from './poolList';
import {
  casualHookForm,
  corresSeekForm,
  effectiveChips,
  ownHook,
  ownSeek,
  parseQuickChips,
  type CorresTile,
  type PoolRange,
  type QuickChips,
} from './quickPair';
import * as seekRepo from './seekRepo';
import SetupController from './setupCtrl';
import LobbySocket from './socket';
import { make as makeStores, readChips, writeChips, type Stores } from './store';
import variantConfirm from './variant';
import * as xhr from './xhr';

export default class LobbyController {
  data: LobbyData;
  playban: any;
  me?: LobbyMe;
  socket: LobbySocket;
  stores: Stores;
  tab: Tab;
  mode: Mode;
  stepHooks: Hook[] = [];
  stepping = false;
  redirecting = false;
  poolMember?: PoolMember;
  pools: Pool[];
  chips: Chips = noChips();
  setupCtrl: SetupController;
  // the quick-pairing view (unit 6.6): the chip row, the correspondence tiles, each pool's waiting count,
  // the tile you are waiting on and since when, and the ranks you can meet there
  quickChips: QuickChips;
  corres: CorresTile[];
  poolSizes: Record<string, number> = {};
  waiting?: { kind: 'pool' | 'hook' | 'seek'; id: string; since: number };
  poolRange?: PoolRange;
  private waitingTicker?: ReturnType<typeof setInterval>;

  private readonly poolInStorage: LichessStorage;
  private flushHooksTimeout?: number;
  private readonly alreadyWatching: string[] = [];

  constructor(
    readonly opts: LobbyOpts,
    readonly redraw: () => void,
  ) {
    this.data = {
      ...opts.data,
      hooks: [],
      seeks: [],
    };
    this.me = opts.data.me;
    this.pools = opts.pools;
    this.corres = opts.corres ?? [];
    this.playban = opts.playban;
    this.chips = readChips();
    this.setupCtrl = new SetupController(this);
    hookRepo.initAll(this);
    seekRepo.initAll(this);
    this.socket = new LobbySocket(opts.socketSend, this);

    this.stores = makeStores(this.me?.username.toLowerCase());
    this.quickChips = parseQuickChips(storage.get(this.quickChipsKey()));
    if (this.me?.isBot) this.tab = 'now_playing';
    else {
      if (this.stores.tab.get() === 'now_playing' && this.data.nbNowPlaying === 0)
        this.stores.tab.set('pools');
      else if (this.hasOngoingRealTimeGame(false)) this.stores.tab.set('now_playing');
      this.tab = this.stores.tab.get();
    }
    this.mode = this.stores.mode.get();

    const locationHash = location.hash.replace('#', '');
    if (['friend', 'hook'].includes(locationHash)) {
      const forceOptions: ForceSetupOptions = {};
      const urlParams = new URLSearchParams(location.search);
      const friendUser = urlParams.get('user') ?? undefined;
      // A chess `variant` or `fen` in the URL is ignored: every new game is a Go game (unit 3.15).
      const size = Number(urlParams.get('size'));
      if (isGoSize(size)) forceOptions.goSize = size;
      const ruleset = urlParams.get('ruleset');
      if (isGoRuleset(ruleset)) forceOptions.goRuleset = ruleset;
      const komi = urlParams.get('komi');
      if (komi) forceOptions.goKomi = Number(komi);

      // a reusable byo-yomi challenge says `timeMode=byoyomi` (unit 4.9), the others `time=unlimited`
      let timeMode = urlParams.get('time') ?? urlParams.get('timeMode');
      const handicap = Number(urlParams.get('handicap'));
      if (isHandicap(handicap) && handicap > 0) forceOptions.handicap = handicap;
      const periods = urlParams.get('periods');
      const periodTime = urlParams.get('periodTime');
      const days = urlParams.get('days');
      const minutesPerSide = urlParams.get('minutesPerSide');
      const increment = urlParams.get('increment');

      if (!timeMode) {
        if (days) timeMode = 'correspondence';
        else if (minutesPerSide || increment) timeMode = 'realTime';
      }

      if (timeMode === 'correspondence') {
        forceOptions.timeMode = 'correspondence';
        if (days) forceOptions.days = parseInt(days);
        if (locationHash === 'hook') [this.tab, this.mode] = ['open', 'correspondence'];
      } else if (timeMode === 'realTime') {
        forceOptions.timeMode = 'realTime';
        if (minutesPerSide) forceOptions.time = parseFloat(minutesPerSide);
        if (increment) forceOptions.increment = parseInt(increment);
        if (locationHash === 'hook') [this.tab, this.mode] = ['open', 'live'];
      } else if (timeMode === 'byoyomi') {
        forceOptions.timeMode = 'byoyomi';
        if (minutesPerSide) forceOptions.time = parseFloat(minutesPerSide);
        if (periods) forceOptions.periods = parseInt(periods);
        if (periodTime) forceOptions.periodTime = parseInt(periodTime);
        if (locationHash === 'hook') [this.tab, this.mode] = ['open', 'live'];
      } else if (timeMode === 'unlimited') {
        if (locationHash === 'hook') [this.tab, this.mode] = ['open', 'correspondence'];
        forceOptions.timeMode = 'unlimited';
        forceOptions.mode = 'casual';
      }

      if (locationHash === 'hook' || locationHash === 'friend') {
        const gameMode = urlParams.get('gameMode');
        if (gameMode === 'casual' || gameMode === 'rated') {
          forceOptions.mode = gameMode;
        }
      }

      const color = urlParams.get('color');
      const foundColor = color && colors.find(c => c === color);
      if (foundColor) {
        forceOptions.color = foundColor;
      }

      pubsub.after('polyfill.dialog').then(() => {
        this.setupCtrl.openModal(locationHash as Exclude<GameType, 'local'>, forceOptions, friendUser);
        redraw();
      });
      history.replaceState(null, '', '/');
    }

    this.poolInStorage = storage.make('lobby.pool-in');
    this.poolInStorage.listen(_ => {
      // when another tab joins a pool
      this.leavePool();
      redraw();
    });
    this.flushHooksSchedule();

    this.startWatching();

    if (this.playban) {
      if (this.playban.remainingSeconds < 86400)
        setTimeout(site.reload, this.playban.remainingSeconds * 1000);
    } else {
      setInterval(() => {
        if (this.poolMember) this.poolIn();
        else if (this.wantsHooks() && !this.data.hooks.length) this.socket.realTimeIn();
      }, 10 * 1000);
      this.joinPoolFromLocationHash();
    }

    pubsub.on('socket.open', () => {
      if (this.wantsHooks()) {
        this.data.hooks = [];
        this.socket.realTimeIn();
      }
      if (this.tab === 'pools' && this.poolMember) this.poolIn();
      else if (this.showsCorrespondence()) this.fetchSeeks();
    });

    window.addEventListener('beforeunload', () => this.leavePool());
  }

  spreadPlayersNumber?: (nb: number) => void;
  spreadGamesNumber?: (nb: number) => void;
  initNumberSpreader = (elm: HTMLAnchorElement, nbSteps: number, initialCount: number) => {
    let previous = initialCount;
    let timeouts: number[] = [];
    const display = (prev: number, cur: number, it: number) => {
      elm.textContent = numberFormat(Math.round((prev * (nbSteps - 1 - it) + cur * (it + 1)) / nbSteps));
    };
    return (nb: number) => {
      if (!nb && nb !== 0) return;
      timeouts.forEach(clearTimeout);
      timeouts = [];
      const interv = Math.abs(wsPingInterval() / nbSteps);
      const prev = previous || nb;
      previous = nb;
      for (let i = 0; i < nbSteps; i++)
        timeouts.push(setTimeout(() => display(prev, nb, i), Math.round(i * interv)));
    };
  };

  private doFlushHooks() {
    this.stepHooks = this.data.hooks.slice(0);
    if (this.wantsHooks()) this.redraw();
  }

  flushHooks = (now: boolean) => {
    if (this.flushHooksTimeout) clearTimeout(this.flushHooksTimeout);
    if (now) this.doFlushHooks();
    else {
      this.stepping = true;
      if (this.showsLive()) this.redraw();
      setTimeout(() => {
        this.stepping = false;
        this.doFlushHooks();
      }, 500);
    }
    this.flushHooksTimeout = this.flushHooksSchedule();
  };

  private readonly flushHooksSchedule = () => setTimeout(this.flushHooks, 8000);

  // Open challenges shows hooks (live) or seeks (correspondence); only what is on screen is fetched.
  showsLive = () => this.tab === 'open' && this.mode === 'live';
  showsCorrespondence = () => this.tab === 'open' && this.mode === 'correspondence';
  // The quick-pairing view needs the open games too: a Casual tile counts and joins them (unit 6.6).
  wantsHooks = () => this.showsLive() || this.tab === 'pools';

  private changeView(tab: Tab, mode: Mode) {
    const wasLive = this.wantsHooks(),
      wasCorrespondence = this.showsCorrespondence();
    this.tab = this.stores.tab.set(tab);
    this.mode = this.stores.mode.set(mode);
    if (this.wantsHooks() && !wasLive) this.socket.realTimeIn();
    else if (!this.wantsHooks() && wasLive) {
      this.socket.realTimeOut();
      this.data.hooks = [];
    }
    if (this.showsCorrespondence() && !wasCorrespondence) this.fetchSeeks();
    this.redraw();
  }

  setTab = (tab: Tab) => {
    if (tab !== this.tab) this.changeView(tab, this.mode);
  };

  setMode = (mode: Mode) => {
    if (mode !== this.mode) this.changeView(this.tab, mode);
  };

  // Open challenges on the given kind of game.
  showOpen = (mode: Mode) => {
    if (this.tab !== 'open' || mode !== this.mode) this.changeView('open', mode);
  };

  setChips = (chips: Chips) => {
    this.chips = chips;
    writeChips(chips);
    this.redraw();
  };

  // What the open-challenges table needs to know about you.
  viewer = (): Viewer => viewerOf(this.me, this.data.ratingMap);

  clickHook = async (id: string) => {
    const hook = hookRepo.find(this, id);
    if (!hook || hook.disabled || this.stepping || this.redirecting) return;
    if (hook.action === 'cancel' || (await variantConfirm(hook.variant)))
      this.socket.send(hook.action, hook.id);
  };

  clickSeek = async (id: string) => {
    const seek = seekRepo.find(this, id);
    if (!seek || this.redirecting) return;
    if (seek.action === 'cancelSeek' || (await variantConfirm(seek.variant?.key)))
      this.socket.send(seek.action, seek.id);
  };

  fetchSeeks = async () => {
    this.data.seeks = await xhr.seeks();
    seekRepo.initAll(this);
    this.redraw();
  };

  // ---- the quick-pairing view (unit 6.6) ----

  private readonly quickChipsKey = () => `lobby.quick:${this.me?.username.toLowerCase() ?? '-'}`;

  setQuickChips = (chips: QuickChips) => {
    const wasRated = effectiveChips(this.quickChips, !!this.me).rated;
    this.quickChips = chips;
    storage.set(this.quickChipsKey(), JSON.stringify(chips));
    // Rated <-> Casual changes what you wait for (a pool, or a casual open game): stop waiting
    if (this.waiting && effectiveChips(chips, !!this.me).rated !== wasRated) this.stopWaiting();
    // a change of Handicap OK reaches the pool you wait in (ADR 0022 §2)
    else if (this.poolMember) {
      this.poolMember = { ...this.poolMember, handicap: effectiveChips(chips, !!this.me).handicap };
      this.poolIn();
    }
    this.redraw();
  };

  // A click on a real-time tile: the pool with Rated, a casual open game with Casual (ADR 0022 §2); a click
  // on the tile you wait on cancels.
  clickPool = (id: string) => {
    const pool = this.pools.find(p => p.id === id);
    if (!pool || this.redirecting) return;
    const again = this.waiting?.id === id;
    const chips = effectiveChips(this.quickChips, !!this.me);
    // a new casual open game replaces your old one on the server (AddHook), so don't also cancel it: that
    // socket message could land after the new game's POST and remove it
    this.stopWaiting(!again && !chips.rated);
    if (!again) {
      if (chips.rated)
        this.enterPool({
          id,
          handicap: chips.handicap,
          range: poolRangeStorage.get(this.me?.username, id) ?? undefined,
        });
      else {
        this.startWaiting('hook', id);
        xhr.createHook(casualHookForm(pool)).catch(() => {
          this.clearWaiting();
          this.redraw();
        });
      }
    }
    this.redraw();
  };

  // A click on a correspondence tile: a seek, which needs an account as in lila (ADR 0022 §1).
  clickCorres = async (id: string) => {
    const tile = this.corres.find(t => t.id === id);
    if (!tile || this.redirecting) return;
    if (!this.me) {
      if (await confirm(i18n.site.goCorrespondenceNeedsAccount, i18n.site.signUp, i18n.site.cancel))
        location.href = '/signup';
      return;
    }
    const again = this.waiting?.id === id;
    this.stopWaiting();
    if (!again) {
      this.startWaiting('seek', id);
      this.redraw();
      try {
        await xhr.createHook(corresSeekForm(tile, effectiveChips(this.quickChips, true).rated));
        await this.fetchSeeks();
      } catch {
        this.clearWaiting();
      }
    }
    this.redraw();
  };

  private readonly startWaiting = (kind: 'pool' | 'hook' | 'seek', id: string) => {
    this.waiting = { kind, id, since: Date.now() };
    this.poolRange = undefined;
    clearInterval(this.waitingTicker);
    this.waitingTicker = setInterval(this.redraw, 1000); // the elapsed time on the tile
    site.mousetrap.bind(
      'esc',
      () => {
        this.stopWaiting();
        this.redraw();
      },
      undefined,
      false,
    );
  };

  // Cancel whatever you wait on: leave the pool, or cancel your casual open game or seek. `replacingHook`:
  // a new casual open game follows, which replaces the old one by itself.
  stopWaiting = (replacingHook = false) => {
    const w = this.waiting;
    if (!w) return;
    if (w.kind === 'pool') this.leavePool();
    else if (w.kind === 'hook') {
      if (!replacingHook) this.socket.send('cancel');
    } else {
      const tile = this.corres.find(t => t.id === w.id);
      const seek = tile && ownSeek(tile, this.data.seeks);
      if (seek) this.socket.send('cancelSeek', seek.id);
    }
    this.clearWaiting();
  };

  private readonly clearWaiting = () => {
    this.waiting = undefined;
    this.poolRange = undefined;
    clearInterval(this.waitingTicker);
    this.waitingTicker = undefined;
  };

  // The server's word on who you can meet in the pool you wait in.
  setPoolRange = (range: PoolRange) => {
    if (this.waiting?.kind === 'pool' && this.waiting.id === range.id) {
      this.poolRange = range;
      this.redraw();
    }
  };

  setPoolSizes = (sizes: Record<string, number>) => {
    this.poolSizes = sizes;
    if (this.tab === 'pools') this.redraw();
  };

  // Your casual open game for the tile you wait on, once the server has it (for its Cancel).
  waitingHook = () => {
    const pool = this.waiting?.kind === 'hook' ? this.pools.find(p => p.id === this.waiting!.id) : undefined;
    return pool && ownHook(pool, this.data.hooks);
  };

  enterPool = (member: PoolMember) => {
    poolRangeStorage.set(this.me?.username, member.id, member.range);
    this.setTab('pools');
    this.poolMember = member;
    this.startWaiting('pool', member.id);
    this.poolIn();
  };

  leavePool = () => {
    if (!this.poolMember) return;
    this.socket.poolOut(this.poolMember);
    this.poolMember = undefined;
    if (this.waiting?.kind === 'pool') this.clearWaiting();
  };

  poolIn = () => {
    if (!this.poolMember) return;
    this.poolInStorage.fire();
    this.socket.poolIn(this.poolMember);
  };

  hasOngoingRealTimeGame = (requireTurn: boolean) =>
    this.data.nowPlaying.some(
      nowPlaying =>
        nowPlaying.speed !== 'correspondence' &&
        (nowPlaying.isMyTurn || !requireTurn) &&
        !nowPlaying.opponent.ai,
    );

  gameActivity = (gameId: string) => {
    if (this.data.nowPlaying.some(p => p.gameId === gameId))
      xhr.nowPlaying().then(res => {
        this.data.nowPlaying = res.nowPlaying;
        this.data.nbMyTurn = res.nbMyTurn;
        this.startWatching();
        this.redraw();
      });
  };

  private startWatching() {
    const newIds = this.data.nowPlaying.map(p => p.gameId).filter(id => !this.alreadyWatching.includes(id));
    if (newIds.length) {
      setTimeout(() => this.socket.send('startWatching', newIds.join(' ')), 2000);
      newIds.forEach(id => this.alreadyWatching.push(id));
    }
  }

  setRedirecting = () => {
    this.redirecting = true;
    setTimeout(() => {
      this.redirecting = false;
      this.redraw();
    }, 4000);
    this.redraw();
  };

  awake = () => {
    if (this.wantsHooks()) {
      this.data.hooks = [];
      this.socket.realTimeIn();
    } else if (this.showsCorrespondence()) this.fetchSeeks();
  };

  // after click on round "new opponent" button
  // also handles onboardink link for anon users
  private readonly joinPoolFromLocationHash = () => {
    if (location.hash.startsWith('#pool/')) {
      const member: PoolMember | undefined = poolFromHash(location.hash, this.pools);
      if (member) {
        const range = poolRangeStorage.get(this.me?.username, member.id);
        if (range) member.range = range;
        member.handicap = effectiveChips(this.quickChips, !!this.me).handicap;
        this.setTab('pools');
        if (this.me) this.enterPool(member);
        else setTimeout(() => this.clickPool(member.id), 1500);
      }
      history.replaceState(null, '', '/');
    }
  };
}
