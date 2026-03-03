package ix.memory.api

import java.util.UUID

import cats.effect.IO
import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import org.http4s.HttpRoutes
import org.http4s.circe.CirceEntityCodec._
import org.http4s.dsl.io._

import ix.memory.conflict.ConflictService
import ix.memory.model.{ClaimId, ConflictId, ConflictStatus, TenantId}

case class ResolveRequest(winnerClaimId: String)

object ResolveRequest {
  implicit val decoder: Decoder[ResolveRequest] = deriveDecoder[ResolveRequest]
  implicit val encoder: Encoder[ResolveRequest] = deriveEncoder[ResolveRequest]
}

class ConflictRoutes(conflictService: ConflictService) {

  val routes: HttpRoutes[IO] = HttpRoutes.of[IO] {

    // GET /v1/conflicts?tenant=<uuid>&status=<optional>
    case req @ GET -> Root / "v1" / "conflicts" =>
      (for {
        tenantStr <- IO.fromOption(req.params.get("tenant"))(
          new IllegalArgumentException("Missing required query parameter: tenant")
        )
        tenantId  <- IO.fromTry(scala.util.Try(UUID.fromString(tenantStr))).map(TenantId(_))
        status     = req.params.get("status").flatMap(parseStatus)
        conflicts <- conflictService.listConflicts(tenantId, status)
        resp      <- Ok(conflicts)
      } yield resp).handleErrorWith(ErrorHandler.handle(_))

    // POST /v1/conflicts/:id/resolve?tenant=<uuid>
    case req @ POST -> Root / "v1" / "conflicts" / UUIDVar(id) / "resolve" =>
      (for {
        tenantStr    <- IO.fromOption(req.params.get("tenant"))(
          new IllegalArgumentException("Missing required query parameter: tenant")
        )
        tenantId     <- IO.fromTry(scala.util.Try(UUID.fromString(tenantStr))).map(TenantId(_))
        body         <- req.as[ResolveRequest]
        winnerClaimId <- IO.fromTry(scala.util.Try(UUID.fromString(body.winnerClaimId))).map(ClaimId(_))
        conflictId    = ConflictId(id)
        _            <- conflictService.resolve(tenantId, conflictId, winnerClaimId)
        resp         <- Ok(io.circe.Json.obj("status" -> io.circe.Json.fromString("resolved")))
      } yield resp).handleErrorWith(ErrorHandler.handle(_))
  }

  private def parseStatus(s: String): Option[ConflictStatus] = s.toLowerCase match {
    case "open"      => Some(ConflictStatus.Open)
    case "resolved"  => Some(ConflictStatus.Resolved)
    case "dismissed" => Some(ConflictStatus.Dismissed)
    case _           => None
  }
}
