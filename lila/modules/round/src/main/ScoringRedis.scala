package lila.round

import io.lettuce.core.*
import io.lettuce.core.pubsub.*
import org.apache.pekko.actor.CoordinatedShutdown
import play.api.libs.json.*

import lila.common.Lilakka
import lila.game.GoScoringPlay.Reply

/** lila's side of the scoring service's two Redis channels (ADR 0020 §1): requests go out on `scoring-in`,
  * replies come back on `scoring-out`, one JSON object per message. Adapted from lichess's `FishnetRedis`,
  * which talked to fishnet the same way.
  */
final private class ScoringRedis(
    client: RedisClient,
    chanIn: String,
    chanOut: String,
    shutdown: CoordinatedShutdown
)(onReply: Reply => Unit)(using Executor):

  private val connOut = client.connectPubSub()
  private val connIn = client.connectPubSub()

  @volatile private var stopping = false

  def send(request: JsObject): Unit =
    if !stopping then connOut.async.publish(chanIn, Json.stringify(request))

  connIn.async.subscribe(chanOut)

  connIn.addListener:
    new RedisPubSubAdapter[String, String]:
      override def message(chan: String, msg: String): Unit =
        scala.util.Try(Json.parse(msg)).toOption.flatMap(Reply.parse) match
          case Some(reply) => onReply(reply)
          case None => logger.warn(s"Unreadable message from the scoring service: ${msg.take(200)}")

  Lilakka.shutdown(shutdown, _.PhaseServiceUnbind, "Stopping the scoring redis pool"): () =>
    Future:
      stopping = true
      client.shutdown()
