import { numberFormat } from 'lib/i18n';
import * as poolRangeStorage from 'lib/poolRangeStorage';
import { pubsub } from 'lib/pubsub';
import { colors } from 'lib/setup/color';
import { wsPingInterval } from 'lib/socket';
import { storage, type LichessStorage } from 'lib/storage';

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
    this.playban = opts.playban;
    this.chips = readChips();
    this.setupCtrl = new SetupController(this);
    hookRepo.initAll(this);
    seekRepo.initAll(this);
    this.socket = new LobbySocket(opts.socketSend, this);

    this.stores = makeStores(this.me?.username.toLowerCase());
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
        else if (this.showsLive() && !this.data.hooks.length) this.socket.realTimeIn();
      }, 10 * 1000);
      this.joinPoolFromLocationHash();
    }

    pubsub.on('socket.open', () => {
      if (this.showsLive()) {
        this.data.hooks = [];
        this.socket.realTimeIn();
      } else if (this.tab === 'pools' && this.poolMember) this.poolIn();
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
    if (this.showsLive()) this.redraw();
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

  private changeView(tab: Tab, mode: Mode) {
    const wasLive = this.showsLive(),
      wasCorrespondence = this.showsCorrespondence();
    this.tab = this.stores.tab.set(tab);
    this.mode = this.stores.mode.set(mode);
    if (this.showsLive() && !wasLive) this.socket.realTimeIn();
    else if (!this.showsLive() && wasLive) {
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

  clickPool = (id: string) => {
    if (!this.me) {
      xhr.anonPoolSeek(this.pools.find(p => p.id === id)!);
      this.showOpen('live');
    } else if (this.poolMember?.id === id) this.leavePool();
    else this.enterPool({ id });
    this.redraw();
  };

  enterPool = (member: PoolMember) => {
    poolRangeStorage.set(this.me?.username, member.id, member.range);
    this.setTab('pools');
    this.poolMember = member;
    this.poolIn();
    site.mousetrap.bind(
      'esc',
      () => {
        this.leavePool();
        this.redraw();
      },
      undefined,
      false,
    );
  };

  leavePool = () => {
    if (!this.poolMember) return;
    this.socket.poolOut(this.poolMember);
    this.poolMember = undefined;
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
    if (this.showsLive()) {
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
        this.setTab('pools');
        if (this.me) this.enterPool(member);
        else setTimeout(() => this.clickPool(member.id), 1500);
      }
      history.replaceState(null, '', '/');
    }
  };
}
