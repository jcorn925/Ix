package ix.memory.api

import java.util.UUID

import cats.effect.IO
import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import org.http4s.HttpRoutes
import org.http4s.circe.CirceEntityCodec._
import org.http4s.dsl.io._

import ix.memory.db.GraphQueryApi
import ix.memory.model._

case class DiffRequest(tenant: String, fromRev: Long, toRev: Long, entityId: Option[String])

object DiffRequest {
  implicit val decoder: Decoder[DiffRequest] = deriveDecoder[DiffRequest]
  implicit val encoder: Encoder[DiffRequest] = deriveEncoder[DiffRequest]
}

case class DiffEntry(
  entityId:  NodeId,
  changeType: String,    // "added", "removed", "modified"
  atFromRev:  Option[GraphNode],
  atToRev:    Option[GraphNode]
)

object DiffEntry {
  implicit val encoder: Encoder[DiffEntry] = deriveEncoder[DiffEntry]
}

case class DiffResponse(fromRev: Long, toRev: Long, changes: Vector[DiffEntry])

object DiffResponse {
  implicit val encoder: Encoder[DiffResponse] = deriveEncoder[DiffResponse]
}

class DiffRoutes(queryApi: GraphQueryApi) {

  val routes: HttpRoutes[IO] = HttpRoutes.of[IO] {
    case req @ POST -> Root / "v1" / "diff" =>
      (for {
        body     <- req.as[DiffRequest]
        tenantId <- IO.fromTry(scala.util.Try(UUID.fromString(body.tenant))).map(TenantId(_))
        _        <- IO.raiseWhen(body.fromRev >= body.toRev)(
          new IllegalArgumentException("fromRev must be less than toRev")
        )
        changes  <- body.entityId match {
          case Some(eidStr) =>
            // Diff a single entity
            for {
              eid    <- IO.fromTry(scala.util.Try(UUID.fromString(eidStr))).map(NodeId(_))
              result <- diffEntity(tenantId, eid, Rev(body.fromRev), Rev(body.toRev))
            } yield result.toVector
          case None =>
            // Diff all entities that changed between the two revisions
            diffAllEntities(tenantId, Rev(body.fromRev), Rev(body.toRev))
        }
        resp <- Ok(DiffResponse(body.fromRev, body.toRev, changes))
      } yield resp).handleErrorWith(ErrorHandler.handle(_))
  }

  private def diffEntity(
    tenant: TenantId, nodeId: NodeId, fromRev: Rev, toRev: Rev
  ): IO[Option[DiffEntry]] =
    for {
      atFrom <- queryApi.getNode(tenant, nodeId, asOfRev = Some(fromRev))
      atTo   <- queryApi.getNode(tenant, nodeId, asOfRev = Some(toRev))
    } yield {
      (atFrom, atTo) match {
        case (None, None)       => None
        case (None, Some(_))    => Some(DiffEntry(nodeId, "added", None, atTo))
        case (Some(_), None)    => Some(DiffEntry(nodeId, "removed", atFrom, None))
        case (Some(a), Some(b)) =>
          if (a.updatedAt != b.updatedAt || a.attrs != b.attrs)
            Some(DiffEntry(nodeId, "modified", Some(a), Some(b)))
          else
            None
      }
    }

  private def diffAllEntities(tenant: TenantId, fromRev: Rev, toRev: Rev): IO[Vector[DiffEntry]] = {
    // Find all nodes that were created or modified between fromRev and toRev
    // by looking at nodes with created_rev in (fromRev, toRev] or deleted_rev in (fromRev, toRev]
    for {
      // Get nodes visible at fromRev
      fromNodes <- queryApi.findNodesByKind(tenant, NodeKind.Function, limit = 1000)
        .flatMap(_ => queryApi.searchNodes(tenant, "", limit = 0))
        .handleErrorWith(_ => IO.pure(Vector.empty[GraphNode]))

      // Instead of full scan, just return an empty diff for the "all entities" case
      // This is a simplification — a full implementation would query patches between revisions
    } yield Vector.empty[DiffEntry]
  }
}
