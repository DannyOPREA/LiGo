package lila.mod

import lila.chat.UserChat
import lila.core.relay.RoundIdName as RelayRound
import lila.report.Suspect
import lila.user.UserRepo
import lila.core.relay.GetActiveRounds

type PublicChats[A] = List[(A, UserChat)]

final class PublicChat(
    chatApi: lila.chat.ChatApi,
    userRepo: UserRepo
)(using Executor, Scheduler):

  def all: Fu[PublicChats[RelayRound]] = relayChats

  def deleteAll(userId: UserId): Funit =
    userRepo.byId(userId).map2(Suspect.apply).flatMapz(deleteAll)

  def deleteAll(suspect: Suspect): Funit =
    all.flatMap: relays =>
      relays._2F
        .filter(_.hasLinesOf(suspect.user))
        .parallelVoid(chatApi.userChat.delete(_, suspect.user, _.global))

  private def getRelayRounds =
    lila.common.Bus.ask[List[RelayRound], GetActiveRounds](GetActiveRounds(_))

  private def relayChats: Fu[PublicChats[RelayRound]] = for
    rounds <- getRelayRounds
    chats <- chatApi.userChat.findAll(rounds.map(_.id.into(ChatId)))
  yield chats.flatMap: chat =>
    rounds.find(_.id.value == chat.id.value).map(_ -> chat)
