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

case class DiffRequest(
  fromRev:  Long,
  toRev:    Long,
  entityId: Option[String] = None,
  summary:  Option[Boolean] = None,
  limit:    Option[Int] = None
)

object DiffRequest {
  implicit val decoder: Decoder[DiffRequest] = deriveDecoder[DiffRequest]
  implicit val encoder: Encoder[DiffRequest] = deriveEncoder[DiffRequest]
}

case class DiffEntry(
  entityId:   NodeId,
  changeType: String,    // "added", "removed", "modified"
  atFromRev:  Option[GraphNode],
  atToRev:    Option[GraphNode],
  summary:    Option[String]
)

object DiffEntry {
  implicit val encoder: Encoder[DiffEntry] = deriveEncoder[DiffEntry]
}

case class DiffResponse(
  fromRev:      Long,
  toRev:        Long,
  changes:      Vector[DiffEntry],
  truncated:    Boolean,
  totalChanges: Int
)

object DiffResponse {
  implicit val encoder: Encoder[DiffResponse] = deriveEncoder[DiffResponse]
}

case class DiffSummaryResponse(
  fromRev: Long,
  toRev: Long,
  summary: Map[String, Int],
  total: Int
)

object DiffSummaryResponse {
  implicit val encoder: Encoder[DiffSummaryResponse] = deriveEncoder[DiffSummaryResponse]
}

class DiffRoutes(queryApi: GraphQueryApi) {

  val routes: HttpRoutes[IO] = HttpRoutes.of[IO] {
    case req @ POST -> Root / "v1" / "diff" =>
      (for {
        body <- req.as[DiffRequest]
        _    <- IO.raiseWhen(body.fromRev >= body.toRev)(
          new IllegalArgumentException("fromRev must be less than toRev")
        )
        resp <- if (body.summary.getOrElse(false)) {
          for {
            counts <- queryApi.getDiffSummary(Rev(body.fromRev), Rev(body.toRev))
            r      <- Ok(DiffSummaryResponse(body.fromRev, body.toRev, counts, counts.values.sum))
          } yield r
        } else {
          val effectiveLimit = body.limit.getOrElse(100)
          val changesIO = body.entityId match {
            case Some(eidStr) =>
              for {
                eid    <- IO.fromTry(scala.util.Try(UUID.fromString(eidStr))).map(NodeId(_))
                result <- diffEntity(eid, Rev(body.fromRev), Rev(body.toRev))
              } yield result.toVector
            case None =>
              queryApi.getChangedEntities(Rev(body.fromRev), Rev(body.toRev)).map { pairs =>
                pairs.map { case (atTo, atFromOpt) =>
                  val changeType = if (atFromOpt.isEmpty) "added"
                                   else if (atTo.deletedRev.isDefined) "removed"
                                   else "modified"
                  val attrSummary = atFromOpt.map { atFrom =>
                    diffAttrs(atFrom.attrs, atTo.attrs)
                  }
                  DiffEntry(
                    entityId   = atTo.id,
                    changeType = changeType,
                    atFromRev  = atFromOpt,
                    atToRev    = Some(atTo),
                    summary    = attrSummary.filter(_.nonEmpty)
                  )
                }
              }
          }
          for {
            allChanges <- changesIO
            totalCount  = allChanges.size
            truncated   = totalCount > effectiveLimit
            limited     = if (truncated) allChanges.take(effectiveLimit) else allChanges
            r          <- Ok(DiffResponse(body.fromRev, body.toRev, limited, truncated, totalCount))
          } yield r
        }
      } yield resp).handleErrorWith(ErrorHandler.handle(_))
  }

  private def diffEntity(
    nodeId: NodeId, fromRev: Rev, toRev: Rev
  ): IO[Option[DiffEntry]] =
    for {
      atFrom <- queryApi.getNode(nodeId, asOfRev = Some(fromRev))
      atTo   <- queryApi.getNode(nodeId, asOfRev = Some(toRev))
    } yield {
      (atFrom, atTo) match {
        case (None, None)       => None
        case (None, Some(_))    => Some(DiffEntry(nodeId, "added", None, atTo, None))
        case (Some(_), None)    => Some(DiffEntry(nodeId, "removed", atFrom, None, None))
        case (Some(a), Some(b)) =>
          if (a.updatedAt != b.updatedAt || a.attrs != b.attrs)
            Some(DiffEntry(nodeId, "modified", Some(a), Some(b), Some(diffAttrs(a.attrs, b.attrs)).filter(_.nonEmpty)))
          else
            None
      }
    }

  private def diffAttrs(from: io.circe.Json, to: io.circe.Json): String = {
    val fromFields = from.asObject.map(_.keys.toSet).getOrElse(Set.empty)
    val toFields   = to.asObject.map(_.keys.toSet).getOrElse(Set.empty)
    val added   = (toFields -- fromFields).size
    val removed = (fromFields -- toFields).size
    val changed = (fromFields intersect toFields).count { k =>
      from.hcursor.downField(k).focus != to.hcursor.downField(k).focus
    }
    val parts = List(
      if (added > 0) Some(s"+$added attrs") else None,
      if (removed > 0) Some(s"-$removed attrs") else None,
      if (changed > 0) Some(s"~$changed attrs") else None
    ).flatten
    parts.mkString(", ")
  }

}
