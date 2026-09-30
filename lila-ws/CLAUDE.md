# lila-ws/ in LiGo

lichess's websocket server (Scala 3, Netty, Pekko typed actors), imported at the SHA in
`docs/UPSTREAM.md`. Licence: AGPL-3.0 only (ADR 0007).

## How it talks to lila
`browser ⇄ websocket ⇄ lila-ws ⇄ Redis pub/sub ⇄ lila`. lila-ws holds the connections and
crowds; lila holds game logic and state.
- Browser side: `netty/` accepts connections; `Router.scala` maps a URL to an endpoint (lobby,
  round, site, ...); `ClientIn` / `ClientOut` (in `ipc/`) are the messages to and from browsers.
- Lila side: `Lila.scala` and `LilaHandler.scala` publish and subscribe on one pair of Redis
  channels per area (site, lobby, round, ...; see `chans` in `Lila.scala`); `ipc/LilaIn` /
  `LilaOut` are the messages. lila's side of
  the same protocol lives in `lila/modules/socket` and each module's `*Socket.scala`.
- Go on the wire (unit 3.14, ADR 0019 §6): the round's `move` carries an SGF point or `pass`
  (`GoMove` in `model.scala`, shape only); `Fens.scala` turns lila's Go move event into mini-board
  updates. No chess rules or formats here any more.
- Flows that matter for Go: lobby (seeks, pools) through `Lobby.scala` and `actor/LobbyClientActor`;
  games through `RoundCrowd.scala` and `actor/RoundClientActor`. The scoring phase will add
  messages here (planned).
- A protocol change is a major decision: both sides change together, and the owner approves it.

## Build and test
`dev/ligo compile ws`, `dev/ligo test ws`.

## Logs to read
`logs/backend.md` (Lessons + latest entries).
