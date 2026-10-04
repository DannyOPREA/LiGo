// The round page for a Go game (unit 3.18): lila's round controller with chessground replaced by
// libs/board's Go board. The board reports the player's stone or pass, the page sends it to the
// server (ADR 0019 §6: an SGF point or `pass` in the `move` message), and the server's `move`
// event plays it on every board watching the game. The board knows the legal points; the server
// is the referee.

import type { BoardConfig, Move, Played, ScoringMarks } from '@ligo/board/board';
import { themeOf, type Theme } from '@ligo/board/themes';

import { defined, type Toggle, type Prop, toggle, requestIdleCallbackSafe } from 'lib';
import { isTouchDevice } from 'lib/device';
import * as game from 'lib/game';
import { plyColor, plyOpponentColor } from 'lib/game';
import { ClockCtrl, type ClockOpts } from 'lib/game/clock/clockCtrl';
import { game as gameRoute } from 'lib/game/router';
import viewStatus from 'lib/game/view/status';
import { licon } from 'lib/licon';
import notify from 'lib/notification';
import * as poolRangeStorage from 'lib/poolRangeStorage';
import { Coords, Replay } from 'lib/prefs';
import { pubsub } from 'lib/pubsub';
import { type SocketSendOpts } from 'lib/socket';
import { once, storedBooleanProp } from 'lib/storage';
import type { QuestionOpts } from 'lib/types';
import { toggleZenMode } from 'lib/view/zen';
import * as wakeLock from 'lib/wakeLock';

import * as blur from './blur';
import { RoundBoard } from './board';
import { Byoyomi } from './byoyomi';
import { CorresClockController } from './corresClock/corresClockCtrl';
import { boardGame, eventMove, goStatusText, resolveConfirm, soundOf, stepOf } from './go';
import type {
  RoundOpts,
  RoundData,
  SocketMove,
  RoundTour,
  ApiEnd,
  ClockEvent,
  GoMoveEvent,
  ResumeEvent,
  ScoringData,
  Step,
} from './interfaces';
import { init as keyboardInit } from './keyboard';
import MoveOn from './moveOn';
import Server from './server';
import { make as makeSocket, type RoundSocket } from './socket';
import * as title from './title';
import TransientMove from './transientMove';
import * as util from './util';
import { endGameView } from './view/main';
import { userTxt } from './view/user';
import * as xhr from './xhr';

type GoneBerserk = Partial<ByColor<boolean>>;

/** The ply that ends play (ADR 0019 §7): the scoring phase opens there and play can't resume. */
const MOVE_LIMIT = 1000;

/** The board and stone themes the page was served with, or last chosen in the account menu. */
const themeOfPage = (): Theme => themeOf(document.body.dataset.board, document.body.dataset.pieceSet);

export default class RoundController {
  data: RoundData;
  socket: RoundSocket;
  board: RoundBoard;
  clock?: ClockCtrl;
  /** A byo-yomi clock's periods (unit 4.10); undefined for a Fischer clock. */
  byoyomi?: Byoyomi;
  corresClock?: CorresClockController;
  /** When the scoring phase times out (or lila stops waiting for the count), as `Date.now()` reads it. */
  scoringDeadline?: number;
  /** A toggle or accept sent that the server hasn't answered with a new count yet. */
  scoringSent = false;
  private scoringSentTimeout?: number;
  private scoringTicker?: number;
  moveOn: MoveOn;
  /** The ply the board shows: the last one, or an earlier one while looking back. */
  ply: number;
  firstSeconds = true;
  menu: Toggle;
  loading = false;
  loadingTimeout: number;
  redirecting = false;
  transientMove: TransientMove;
  goneBerserk: GoneBerserk = {};
  resignConfirm?: Timeout = undefined;
  // will be replaced by view layer
  autoScroll: () => void = () => {};
  shouldSendMoveTime = false;
  sign: string = Math.random().toString(36);
  keyboardHelp: boolean = location.hash === '#keyboard';
  server: Server;
  vibration: Prop<boolean> = storedBooleanProp('vibration', false);
  streamer: Prop<boolean> = storedBooleanProp('streamermode', false);
  /**
   * `Pref.ConfirmMoves` (unit 2.3), resolved once against this browser: a tap previews the stone
   * and the Confirm button (or a mouse double click) plays it.
   */
  readonly confirm: boolean;
  /**
   * The board's look (ADR 0026 §3): lila's board (`theme`) and stone (`pieceSet`) preferences, which
   * hold goban's theme names (unit 9.7). The page carries them on <body>, and the account menu
   * changes them there.
   */
  theme: Theme = themeOfPage();

  constructor(
    readonly opts: RoundOpts,
    readonly redraw: Redraw,
  ) {
    util.upgradeServerData(opts.data);

    const d = (this.data = opts.data);

    this.ply = util.lastPly(d);
    this.confirm = resolveConfirm(d.pref.confirmMoves, isTouchDevice());
    this.goneBerserk[d.player.color] = d.player.berserk;
    this.goneBerserk[d.opponent.color] = d.opponent.berserk;
    setTimeout(() => {
      this.firstSeconds = false;
      this.redraw();
    }, 3000);
    this.socket = makeSocket(opts.socketSend!, this);
    this.board = new RoundBoard(this.boardConfig, this.redraw);

    this.updateClockCtrl();
    this.startScoring();

    this.setQuietMode();
    this.moveOn = new MoveOn(this, 'move-on');
    this.transientMove = new TransientMove(this.socket);
    this.server = new Server(() => this.data);

    this.menu = toggle(false, redraw);
    setTimeout(this.delayedInit, 200);

    setTimeout(this.showExpiration, 350);

    if (this.streamer()) this.streamerMode(true);

    if (!document.referrer?.includes('/serviceWorker.')) setTimeout(this.showYourMoveNotification, 500);

    pubsub.on('jump', ply => {
      this.jump(parseInt(ply));
      this.redraw();
    });

    pubsub.on('zen', toggleZenMode);
    pubsub.on('board.change', () => {
      this.theme = themeOfPage();
      this.board.remount();
    });
  }

  private readonly showExpiration = () => {
    if (!this.data.expiration) return;
    this.redraw();
    setTimeout(this.showExpiration, 250);
  };

  /** The board for the ply shown: its moves, who may place stones there, the look. */
  boardConfig = (): BoardConfig => ({
    ...boardGame(this.data.game.go),
    moves: util.movesUntil(this.data, this.ply),
    movable: this.movable(),
    confirm: this.confirm,
    theme: this.theme,
    coordinates: this.data.pref.coords !== Coords.Hidden,
    onMove: this.onUserMove,
    onPlayed: this.onPlayed,
    onRefused: () => site.sound.play('error'),
    onChange: this.redraw,
    scoring: this.scoringMarks(),
    onScoreTap: this.scoreToggle,
  });

  /**
   * A stone or pass sent that the server hasn't played back yet: no second move until it has (a
   * remount while looking back would otherwise forget that the board is waiting).
   */
  private moveInFlight = false;

  /** Only the player, only on the last position, only while the game goes on and no move is on its way. */
  private readonly movable = (): 'black' | 'white' | 'none' =>
    this.isPlaying() && !this.replaying() && !this.moveInFlight && !this.inScoring()
      ? this.data.player.color
      : 'none';

  /** The board reported the player's stone or pass: send it (the server's `move` event plays it). */
  private readonly onUserMove = (move: Move): void => {
    if (!this.isPlaying() || this.replaying() || this.moveInFlight) return this.board.board?.cancel();
    this.sendMove(move);
  };

  private readonly onPlayed = (played: Played): void => {
    site.sound.play(soundOf(played.move, played.captured));
  };

  /** The game is in its scoring phase (ADR 0020 §3): play is stopped, the dead stones are agreed. */
  inScoring = (): boolean => game.playable(this.data) && this.data.game.go.phase === 'scoring';

  /** The scoring proposal or count on show, once it has arrived (not while "Counting…"). */
  scoringCount = (): ScoringData | undefined => {
    const s = this.data.game.scoring;
    return s && !s.counting && s.v ? s : undefined;
  };

  /**
   * The marks the board shows: during the scoring phase, and on a game that ended by counting (the
   * record of its count), on the last position only.
   */
  private readonly scoringMarks = (): ScoringMarks | undefined => {
    const s = this.scoringCount();
    if (!s || this.replaying()) return undefined;
    if (!this.inScoring() && this.data.game.status.name !== 'variantEnd') return undefined;
    return { dead: s.dead ?? [], owner: s.owner, seal: s.seal, tappable: this.mayMarkDead() };
  };

  /** The player may tap chains now: a player, in the scoring phase, with no recount on its way. */
  mayMarkDead = (): boolean =>
    this.isPlaying() &&
    this.inScoring() &&
    !this.replaying() &&
    !this.scoringSent &&
    !!this.scoringCount() &&
    !this.scoringCount()?.pending;

  /** The board reported a tap on a stone: ask the server to toggle its chain (ADR 0020 §3.3). */
  private readonly scoreToggle = (p: Move): void => {
    const v = this.scoringCount()?.v;
    if (!v || !this.mayMarkDead()) return;
    this.markScoringSent();
    this.socket.send('score-toggle', { p, v });
    this.board.board?.set({ scoring: this.scoringMarks() });
    this.redraw();
  };

  /** The player has accepted the count on show. */
  hasAccepted = (): boolean =>
    !!this.scoringCount()?.accepted?.[this.data.player.color === 'black' ? 'b' : 'w'];

  /** Accepts the count on show (ADR 0020 §3.4); it ends the game once both players have. */
  acceptScore = (): void => {
    const v = this.scoringCount()?.v;
    if (!v || !this.mayMarkDead() || this.hasAccepted()) return;
    this.markScoringSent();
    this.socket.send('score-accept', { v });
    this.redraw();
  };

  /**
   * No second toggle or accept until the server answers. lila answers a refused one (a count that
   * changed meanwhile) with nothing, and a message can be lost on a reconnect: after 5 s the page
   * takes taps again rather than wait for the next event.
   */
  private markScoringSent(): void {
    this.scoringSent = true;
    clearTimeout(this.scoringSentTimeout);
    this.scoringSentTimeout = setTimeout(() => {
      if (!this.scoringSent) return;
      this.scoringSent = false;
      if (!this.replaying()) this.board.board?.set({ scoring: this.scoringMarks() });
      this.redraw();
    }, 5000);
  }

  /** Resume is refused at the move limit (ADR 0019 §7, ADR 0020 §3.5): no stone may follow it. */
  mayResume = (): boolean => this.isPlaying() && this.inScoring() && this.lastPly() < MOVE_LIMIT;

  /** Takes the game back to play (ADR 0020 §3.5). */
  resumePlay = (): void => {
    if (!this.mayResume()) return;
    this.socket.sendLoading('score-resume');
  };

  /** Seconds before the scoring phase times out, as last told by the server. */
  scoringSecondsLeft = (): number =>
    this.scoringDeadline === undefined
      ? 0
      : Math.max(0, Math.ceil((this.scoringDeadline - Date.now()) / 1000));

  /** The countdown redraws every second while the phase lasts. */
  private startScoring(): void {
    const s = this.data.game.scoring;
    this.scoringDeadline = s && this.inScoring() ? Date.now() + s.expiresIn * 1000 : undefined;
    clearInterval(this.scoringTicker);
    this.scoringTicker = undefined;
    if (this.scoringDeadline !== undefined) this.scoringTicker = setInterval(this.redraw, 1000);
  }

  /**
   * The server's `scoring` event (ADR 0020 §6): the phase opened ("Counting…"), the proposal or a
   * recount arrived, a chain was toggled or a player accepted.
   */
  apiScoring = (o: ScoringData): void => {
    const d = this.data;
    d.game.go.phase = 'scoring';
    const before = d.game.scoring;
    d.game.scoring = o;
    this.scoringSent = false;
    clearTimeout(this.scoringSentTimeout);
    this.moveInFlight = false;
    this.startScoring();
    if (this.clock?.isRunning()) this.clock.stopClock();
    if (!this.replaying()) this.board.board?.set({ scoring: this.scoringMarks(), movable: 'none' });
    if (!o.counting && o.score && (before?.counting || before?.v !== o.v))
      site.sound.say(`${i18n.site.black} ${o.score.b.total}, ${i18n.site.white} ${o.score.w.total}`);
    this.setTitle();
    this.redraw();
    this.onChange();
    // having answered the count, the player has nothing more to do here: lila's "play next game"
    if (this.isPlaying() && this.hasAccepted()) this.moveOn.next();
  };

  /** The server's `resume` event: a player took the game back from the scoring phase to play. */
  apiResume = (o: ResumeEvent): void => {
    const d = this.data;
    if (o.ply !== this.lastPly()) return this.socket.reload();
    d.game.go.phase = 'play';
    d.game.go.moves = d.game.go.moves ? `${d.game.go.moves} resume` : 'resume';
    d.game.scoring = undefined;
    d.game.player = o.turn;
    this.scoringSent = false;
    this.startScoring();
    if (o.clock) this.setClockFrom(o.clock, this.isPlaying() && o.turn === d.player.color ? 0 : undefined);
    if (!this.replaying()) this.board.board?.set({ scoring: undefined, movable: this.movable() });
    site.sound.play('confirmation');
    this.setLoading(false);
    this.setTitle();
    this.redraw();
    this.onChange();
    if (this.isPlaying() && o.turn === d.player.color) this.showYourMoveNotification();
  };

  /** Sets the clocks from a move or resume event, the byo-yomi periods too. */
  private setClockFrom(oc: ClockEvent, delay?: number): void {
    this.byoyomi?.update(oc);
    if (this.clock)
      this.clock.setClock({
        white: oc.white,
        black: oc.black,
        ticking: this.tickingClockColor(),
        delay: delay ?? (oc.lag || 1),
      });
    else if (this.corresClock) this.corresClock.update(oc.white, oc.black);
  }

  streamerMode = (v: boolean): void => {
    $('main.round').toggleClass('round--streamer', this.streamer(v));
  };

  lastPly = (): number => util.lastPly(this.data);

  replaying = (): boolean => this.ply !== this.lastPly();

  userJump = (ply: Ply): void => {
    if (ply !== this.ply && this.jump(ply)) site.sound.say(this.stepAt(this.ply).san || 'Start', true);
    else this.redraw();
  };

  userJumpPlyDelta = (plyDelta: Ply): void => this.userJump(this.ply + plyDelta);

  isPlaying = (): boolean => game.isPlayerPlaying(this.data);

  jump = (ply: Ply): boolean => {
    ply = Math.max(util.firstPly(this.data), Math.min(this.lastPly(), ply));
    const changed = ply !== this.ply;
    this.ply = ply;
    if (changed || !this.board.board) this.board.remount();
    this.autoScroll();
    pubsub.emit('ply', ply);
    return true;
  };

  /** Whether the player may place a stone now: their turn, on the last position. */
  canMove = (): boolean =>
    !this.replaying() && !this.moveInFlight && !this.inScoring() && game.isPlayerTurn(this.data);

  /**
   * The game waits for this player: what lila's `Pov.isMyTurn` says, so the page agrees with the lists
   * of games to move. Their turn, or in the scoring phase a count they have not yet accepted
   * (unit 7.7, ADR 0023 §4).
   */
  isMyTurn = (): boolean =>
    this.inScoring() ? !this.data.player.spectator && !this.hasAccepted() : game.isPlayerTurn(this.data);

  replayEnabledByPref = (): boolean => {
    const d = this.data;
    return (
      d.pref.replay === Replay.Always ||
      (d.pref.replay === Replay.OnlySlowGames &&
        (d.game.speed === 'classical' || d.game.speed === 'correspondence'))
    );
  };

  isLate = (): boolean => this.replaying() && game.playing(this.data);

  /** The opponent sits at the top, the player (or White, for a spectator watching White's side) below. */
  playerAt = (position: game.TopOrBottom): game.Player =>
    position === 'top' ? this.data.opponent : this.data.player;

  setTitle = (): void => title.set(this);

  sendMove = (move: Move): void => {
    const data: SocketMove = { u: move };
    if (blur.get()) data.b = 1;
    this.resign(false);
    const socketOpts: SocketSendOpts = {
      sign: this.sign,
      ackable: true,
    };
    if (this.clock) {
      socketOpts.withLag = !this.shouldSendMoveTime || !this.clock.isRunning();
      const moveMillis = this.clock.stopClock();
      if (moveMillis !== undefined && this.shouldSendMoveTime) socketOpts.millis = moveMillis;
    }
    this.moveInFlight = true;
    this.socket.send('move', data, socketOpts);
    this.transientMove.register();
    this.redraw();
  };

  /** The player passes (the board reports it like a stone). */
  pass = (): void => {
    if (this.canMove()) this.board.board?.pass();
  };

  /** Whether a previewed stone waits for `confirmMove` (Confirm moves only). */
  movePending = (): boolean => this.board.board?.pending() ?? false;

  /** Plays the previewed stone (the Confirm button). */
  confirmMove = (): void => {
    this.board.board?.confirm();
  };

  /** Takes back the previewed stone. */
  cancelMove = (): void => {
    this.board.board?.cancel();
  };

  showYourMoveNotification = (): void => {
    const d = this.data;
    const opponent = $('body').hasClass('zen') ? i18n.site.goYourOpponent : userTxt(d.opponent);
    const joined = i18n.site.goXJoinedTheGame(opponent);
    const played = game.playedTurns(d);
    if (game.isPlayerTurn(d))
      notify(() => {
        let txt = i18n.site.yourTurn;
        if (played < 1) txt = `${joined}\n${txt}`;
        else {
          const step = util.lastStep(this.data);
          txt = `${step.uci === 'pass' ? i18n.site.goXPassed(opponent) : i18n.site.goXPlayedY(opponent, step.san)}\n${txt}`;
        }
        return txt;
      });
    else if (this.isPlaying() && played < 1) notify(joined);
  };

  playerByColor = (c: Color): game.Player => this.data[c === this.data.player.color ? 'player' : 'opponent'];

  /** The server's `move` event (ADR 0019 §6): a stone or a pass by either player, the player's own included. */
  apiMove = (o: GoMoveEvent): true => {
    const d = this.data;
    // A missed move event: the list would drift from the game. Fetch the game again instead.
    if (o.ply !== this.lastPly() + 1) {
      this.socket.reload();
      return true;
    }
    const playing = this.isPlaying();
    const wasLive = !this.replaying();
    const move = eventMove(o);
    const playedColor = plyOpponentColor(o.ply);
    if (playedColor === d.player.color) this.moveInFlight = false;
    d.game.turns = o.ply;
    d.game.player = plyColor(o.ply);
    const activeColor = d.player.color === d.game.player;
    if (o.status) d.game.status = o.status;
    if (o.winner) d.game.winner = o.winner;
    const go = d.game.go;
    go.moves = go.moves ? `${go.moves} ${move}` : move;
    go.prisoners = o.prisoners;
    go.phase = o.phase;
    go.ko = o.ko;
    const step = stepOf(go.size, o.ply, move);
    d.steps.push(step);
    this.setTitle();
    if (wasLive) {
      this.ply = step.ply;
      const board = this.board.board;
      if (board) {
        board.play(move);
        board.set({ movable: this.movable() });
      }
      blur.onMove();
      pubsub.emit('ply', this.ply);
    }
    game.setOnGame(d, playedColor, true);
    this.data.forecastCount = undefined;
    if (o.clock) {
      this.shouldSendMoveTime = true;
      this.setClockFrom(o.clock, playing && activeColor ? 0 : undefined);
    }
    if (this.data.expiration) {
      if (game.playedTurns(d) > 1) this.data.expiration = undefined;
      else this.data.expiration.movedAt = Date.now();
    }
    this.redraw();
    if (playing && playedColor === d.player.color) {
      this.transientMove.clear();
      this.moveOn.next();
    }
    if (wasLive && playedColor !== d.player.color) {
      if (this.vibration() && 'vibrate' in navigator) navigator.vibrate(100);
      if (playing && o.phase !== 'scoring') this.showYourMoveNotification();
    }
    this.autoScroll();
    this.onChange();
    site.sound.say(`${playedColor === 'black' ? i18n.site.black : i18n.site.white} ${step.san}`);
    this.server.alive();
    return true; // prevents default socket pubsub
  };

  reload = (d: RoundData): void => {
    util.upgradeServerData(d);
    this.data = d;
    this.ply = util.lastPly(d);
    this.moveInFlight = false;
    this.shouldSendMoveTime = false;
    this.scoringSent = false;
    this.updateClockCtrl();
    this.startScoring();
    if (this.clock)
      this.clock.setClock({
        white: d.clock!.white,
        black: d.clock!.black,
        ticking: this.tickingClockColor(),
      });
    if (this.corresClock) this.corresClock.update(d.correspondence!.white, d.correspondence!.black);
    this.board.remount();
    this.setTitle();
    this.moveOn.next();
    this.setQuietMode();
    this.redraw();
    this.autoScroll();
    this.onChange();
    this.setLoading(false);
  };

  endWithData = (o: ApiEnd): void => {
    const d = this.data;
    // A move sent that the server never played: the game ended first (on time, or the opponent resigned).
    const unsent = this.moveInFlight;
    this.moveInFlight = false;
    d.game.winner = o.winner;
    d.game.status = o.status;
    d.game.abortedBy = o.abortedBy;
    d.game.boosted = o.boosted;
    if (o.result) d.game.result = o.result;
    this.scoringSent = false;
    this.startScoring();
    this.jump(this.lastPly());
    // The board still shows the unsent stone, waiting: a fresh board without it (and without moving).
    if (unsent) this.board.remount();
    // A game ended by counting keeps its marks on the board; any other ending takes them away.
    else this.board.board?.set({ movable: 'none', scoring: this.scoringMarks() });
    if (o.ratingDiff) {
      d.player.ratingDiff = o.ratingDiff[d.player.color];
      d.opponent.ratingDiff = o.ratingDiff[d.opponent.color];
    }
    if (!d.player.spectator && game.playedTurns(d) > 1) {
      poolRangeStorage.shiftRangeAfter(d);
      site.sound.play(o.winner ? (d.player.color === o.winner ? 'victory' : 'defeat') : 'draw');
    }
    this.onTimeTrouble(false);
    site.sound.byoyomiReset();
    endGameView();
    this.setTitle();
    this.moveOn.next();
    this.setQuietMode();
    this.setLoading(false);
    if (this.clock && o.clock)
      this.clock.setClock({
        white: o.clock.wc * 0.01,
        black: o.clock.bc * 0.01,
        ticking: undefined,
      });
    this.redraw();
    this.autoScroll();
    this.onChange();
    wakeLock.release();
    site.sound.say(this.statusText(), false, false, true);
    this.server.alive();
    if (!d.player.spectator && o.status.name === 'outoftime' && unsent) {
      notify(this.statusText());
    }
  };

  /** How the game ended, in words: Go's own endings first (two passes, the move limit), else lila's. */
  statusText = (): string => goStatusText(this.data) ?? viewStatus(this.data);

  challengeRematch = async (): Promise<void> => {
    await xhr.challengeRematch(this.data.game.id);
    pubsub.emit('challenge-app.open');
    if (once('rematch-challenge')) {
      setTimeout(async () => {
        const [tour] = await Promise.all([
          site.asset.loadEsm<RoundTour>('round.tour'),
          site.asset.loadCssPath('bits.shepherd'),
        ]);
        tour.corresRematchOffline();
      }, 1000);
    }
  };

  private updateClockCtrl() {
    const d = this.data;
    if (d.clock) {
      this.corresClock = undefined;
      this.byoyomi =
        d.clock.byo && d.clock.periods
          ? new Byoyomi(d.clock.byo, d.clock.initial, d.clock as Required<typeof d.clock>)
          : undefined;
      if (!this.clock) {
        this.clock = new ClockCtrl(d.clock, d.pref, this.tickingClockColor(), this.makeClockOpts());
        if (this.byoyomi) {
          // A period is short: the clock turns red in its last third (the server's `emerg`), and the
          // bar, which measures main time, makes way for the periods.
          if (d.clock.emerg) this.clock.emergMs = d.clock.emerg * 1000;
          this.clock.showBar = false;
          // Byo-yomi has its own warnings (ADR 0026 §2, `onClockTick`): no low-time sound in between.
          this.clock.emergSound.play = () => {};
        }
      }
      this.clock.alarmAction = {
        seconds: 60,
        fire: () => this.onTimeTrouble(true),
      };
    } else {
      this.clock = undefined;
      if (d.correspondence)
        this.corresClock ??= new CorresClockController(this, d.correspondence, this.socket.outoftime);
    }
  }

  /**
   * A clock reached zero. With byo-yomi the next period starts (or the first one, after main time)
   * and only the last one running out is a flag.
   */
  private readonly onClockZero = (): void => {
    const color = this.clock?.times.activeColor;
    if (!this.clock || !color || !this.byoyomi?.expire(color)) return this.socket.outoftime();
    const other = color === 'white' ? 'black' : 'white';
    this.clock.setClock({
      [color]: this.byoyomi.byo,
      [other]: this.clock.millisOf(other) / 1000,
      ticking: color,
    } as { white: number; black: number; ticking: Color });
    this.redraw();
  };

  /**
   * The player's own clock, ticking in byo-yomi: a low-time sound as each period starts and a spoken
   * count over its last 10 seconds (Phase 9's `site.sound.byoyomi`). Never for the opponent's clock,
   * in main time, or with clock sounds off.
   */
  private readonly onClockTick = (color: Color, millis: Millis): void => {
    const d = this.data;
    if (!this.byoyomi?.inByoyomi[color] || d.player.spectator || color !== d.player.color) return;
    if (!d.pref.clockSound) return;
    site.sound.byoyomi(this.byoyomi.periods[color], Math.floor(millis / 1000));
  };

  private readonly makeClockOpts: () => ClockOpts = () => ({
    onFlag: this.onClockZero,
    onTick: this.onClockTick,
    bothPlayersHavePlayed: () => game.bothPlayersHavePlayed(this.data),
    hasGoneBerserk: this.hasGoneBerserk,
    alarmColor: this.data.player.spectator || !this.data.pref.clockSound ? undefined : this.data.player.color,
  });

  // Clocks stop during the scoring phase (ADR 0020 §3).
  private readonly tickingClockColor = (): Color | undefined =>
    game.playable(this.data) &&
    this.data.game.go.phase !== 'scoring' &&
    (game.playedTurns(this.data) > 1 || this.data.clock?.running)
      ? this.data.game.player
      : undefined;

  private readonly setQuietMode = () => {
    const was = site.quietMode;
    const is = this.isPlaying();
    if (was !== is) {
      site.quietMode = is;
      $('body').toggleClass(
        'no-select',
        is && this.clock && this.clock.millisOf(this.data.player.color) <= 3e5,
      );
    }
  };

  question = (): QuestionOpts | false => {
    if (this.data.player.proposingTakeback)
      return {
        prompt: i18n.site.takebackPropositionSent,
        no: { action: this.cancelTakeback, text: i18n.site.cancel },
      };
    else if (this.data.opponent.proposingTakeback)
      return {
        prompt: i18n.site.yourOpponentProposesATakeback,
        yes: { action: this.takebackYes, icon: licon.Back },
        no: { action: () => this.socket.send('takeback-no') },
      };
    else return false;
  };

  opponentRequest(_req: 'takeback' | 'rematch', text: string): void {
    notify(text);
  }

  takebackYes = (): void => {
    this.socket.sendLoading('takeback-yes');
    this.cancelMove();
  };

  cancelTakeback = (): void => this.socket.sendLoading('takeback-no');

  resign = (v: boolean, immediately?: boolean): void => {
    if (v) {
      if (this.resignConfirm || !this.data.pref.confirmResign || immediately) {
        this.socket.sendLoading('resign');
        clearTimeout(this.resignConfirm);
      } else {
        this.resignConfirm = setTimeout(() => this.resign(false), 3000);
      }
      this.redraw();
    } else if (this.resignConfirm) {
      clearTimeout(this.resignConfirm);
      this.resignConfirm = undefined;
      this.redraw();
    }
  };

  hasGoneBerserk = (color: Color): boolean => !!this.goneBerserk[color];

  goBerserk = (): void => {
    if (game.berserkableBy(this.data) && !this.hasGoneBerserk(this.data.player.color)) {
      this.socket.berserk();
    }
  };

  setBerserk = (color: Color): void => {
    if (this.goneBerserk[color]) return;
    this.goneBerserk[color] = true;
    this.redraw();
    $(`<icon data-icon="${licon.Berserk}">`).appendTo($(`.game__meta .player.${color} .user-link`));
  };

  setLoading = (v: boolean, duration = 1500): void => {
    clearTimeout(this.loadingTimeout);
    if (v) {
      this.loading = true;
      this.loadingTimeout = setTimeout(() => {
        this.loading = false;
        this.redraw();
      }, duration);
      this.redraw();
    } else if (this.loading) {
      this.loading = false;
      this.redraw();
    }
  };

  setRedirecting = (): void => {
    this.redirecting = true;
    site.unload.expected = true;
    setTimeout(() => {
      this.redirecting = false;
      this.redraw();
    }, 2500);
    this.redraw();
  };

  private readonly onChange = () => {
    if (this.opts.onChange) setTimeout(() => this.opts.onChange(this.data), 150);
  };

  private goneTick?: number;
  setGone = (gone: number | boolean): void => {
    game.setGone(this.data, this.data.opponent.color, gone);
    clearTimeout(this.goneTick);
    if (Number(gone) > 1)
      this.goneTick = setTimeout(() => {
        const g = Number(this.opponentGone());
        if (g > 1) this.setGone(g - 1);
      }, 1000);
    this.redraw();
  };

  opponentGone = (): number | boolean => {
    const d = this.data;
    return (
      defined(d.opponent.isGone) &&
      d.opponent.isGone !== false &&
      !game.isPlayerTurn(d) &&
      game.resignable(d) &&
      d.opponent.isGone
    );
  };

  rematch(accept?: boolean): boolean {
    if (accept === undefined)
      return !!this.data.opponent.offeringRematch || !!this.data.player.offeringRematch;
    else if (accept) {
      if (this.data.game.rematch) location.href = gameRoute(this.data.game.rematch, this.data.opponent.color);
      if (!game.rematchable(this.data)) return false;
      if (!this.data.opponent.offeringRematch) this.data.player.offeringRematch = true;
      this.socket.send('rematch-yes');
    } else {
      if (!this.data.opponent.offeringRematch) return false;
      this.socket.send('rematch-no');
    }
    this.redraw();
    return true;
  }

  stepAt = (ply: Ply): Step => util.plyStep(this.data, ply);

  /** The prisoners each player has taken, in the position shown. */
  prisoners = (): ByColor<number> => {
    const shown = this.board.board?.state().captures;
    if (shown) return shown;
    const { b, w } = this.data.game.go.prisoners;
    return { black: b, white: w };
  };

  speakClock = (): void => {
    this.clock?.speak();
  };

  onTimeTrouble = (t: boolean): void => {
    if (this.data.player.spectator) return;
    site.powertip.forcePlacementHook = t ? (el: HTMLElement) => el.closest('.crosstable') && 's' : undefined;
  };

  private readonly delayedInit = () =>
    requestIdleCallbackSafe(() => {
      const d = this.data;
      if (this.isPlaying()) {
        blur.init(game.playedTurns(d) > 1);

        title.init();
        this.setTitle();

        if (d.clock && !d.opponent.ai)
          window.addEventListener('beforeunload', e => {
            if (site.unload.expected || !this.isPlaying()) return;
            this.socket.send('bye2');
            e.preventDefault();
          });

        if (this.confirm)
          site.mousetrap.bind('esc', this.cancelMove).bind('return', () => {
            if (this.movePending()) this.confirmMove();
          });
      }

      keyboardInit(this);
      if (d.game.speed !== 'correspondence') wakeLock.request();
    }, 800);
}
