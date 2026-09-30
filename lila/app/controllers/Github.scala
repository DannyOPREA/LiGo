package controllers

import play.api.libs.json.*
import play.api.mvc.*

import lila.app.*

final class Github(env: Env) extends LilaController(env):

  def secretScanning = Action.async(checkSignature): req =>
    req.body.asOpt[List[lila.oauth.AccessTokenApi.GithubSecretScan]] match
      case Some(scans) =>
        env.oAuth.tokenApi
          .secretScanning(scans)
          // The "token revoked" private message went with the msg module (unit 3.6).
          .void
        NoContent
      case None => badRequest("JSON does not match expected format")

  private val checkSignature: BodyParser[JsValue] = parse.using: req =>
    parse.raw.validateM: raw =>
      val body = raw.asBytes().map(_.utf8String)
      val identifier = req.headers.get("Github-Public-Key-Identifier")
      val signature = req.headers.get("Github-Public-Key-Signature")

      (body, identifier, signature)
        .mapN: (b, i, s) =>
          env.web.github
            .verify(b, s, i)
            .map:
              if _ then Json.parse(b).asRight
              else badRequest("Signature verification failed").asLeft
        .fold(fuccess(badRequest("Missing headers for signature verification").asLeft))(identity)

  private def badRequest(msg: String): Result = BadRequest(jsonError(msg))
