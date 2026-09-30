package lila.ws

import com.github.blemale.scaffeine.Cache
import reactivemongo.api.WriteConcern
import reactivemongo.api.bson.*
import reactivemongo.api.bson.collection.BSONCollection

import java.time.LocalDateTime

import lila.ws.Auth.AccessTokenId

final class SeenAtUpdate(mongo: Mongo)(using
    context: Executor,
    cacheApi: util.CacheApi
) extends MongoHandlers:

  private val done: Cache[User.Id, Boolean] =
    cacheApi.notLoadingSync[User.Id, Boolean](65_536, "seenAt.done"):
      _.expireAfterWrite(5.minutes).build()

  def set(user: User.Id, oauthToken: Option[AccessTokenId]): Unit =
    if done.getIfPresent(user).isEmpty then
      done.put(user, true)
      val now = LocalDateTime.now
      for
        userColl <- mongo.userColl
        _ <- findAndModify(
          coll = userColl,
          selector = BSONDocument("_id" -> user, "mustConfirmEmail" -> BSONDocument("$exists" -> false)),
          modifier = BSONDocument("$set" -> BSONDocument("seenAt" -> now)),
          fields = BSONDocument("_id" -> true)
        )
      do
        oauthToken.foreach: tokenId =>
          mongo.oauthColl.foreach:
            _.update(ordered = false, writeConcern = WriteConcern.Unacknowledged).one(
              BSONDocument("_id" -> tokenId),
              BSONDocument("$set" -> BSONDocument("used" -> now))
            )

  private def findAndModify(
      coll: BSONCollection,
      selector: BSONDocument,
      modifier: BSONDocument,
      fields: BSONDocument
  ): Future[Option[BSONDocument]] =
    coll
      .findAndModify(
        selector = selector,
        modifier = coll.updateModifier(modifier),
        sort = None,
        fields = Some(fields),
        bypassDocumentValidation = false,
        writeConcern = WriteConcern.Default,
        maxTime = None,
        collation = None,
        arrayFilters = Seq.empty
      )
      .map(_.result[BSONDocument])
