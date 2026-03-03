package ix.memory.api

import java.util.UUID

import cats.effect.IO
import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import org.http4s.HttpRoutes
import org.http4s.circe.CirceEntityCodec._
import org.http4s.dsl.io._

import ix.memory.context.ContextService
import ix.memory.model.{Rev, TenantId}

case class ContextRequest(query: String, tenant: String, asOfRev: Option[Long])

object ContextRequest {
  implicit val decoder: Decoder[ContextRequest] = deriveDecoder[ContextRequest]
  implicit val encoder: Encoder[ContextRequest] = deriveEncoder[ContextRequest]
}

class ContextRoutes(contextService: ContextService) {

  val routes: HttpRoutes[IO] = HttpRoutes.of[IO] {
    case req @ POST -> Root / "v1" / "context" =>
      (for {
        body     <- req.as[ContextRequest]
        tenantId <- IO.fromTry(scala.util.Try(UUID.fromString(body.tenant))).map(TenantId(_))
        asOfRev   = body.asOfRev.map(Rev(_))
        result   <- contextService.query(tenantId, body.query, asOfRev)
        resp     <- Ok(result)
      } yield resp).handleErrorWith(ErrorHandler.handle(_))
  }
}
