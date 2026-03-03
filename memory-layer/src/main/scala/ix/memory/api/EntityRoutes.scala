package ix.memory.api

import java.util.UUID

import cats.effect.IO
import io.circe.{Encoder, Json}
import io.circe.generic.semiauto.deriveEncoder
import io.circe.syntax._
import org.http4s.HttpRoutes
import org.http4s.circe.CirceEntityCodec._
import org.http4s.dsl.io._

import ix.memory.db.{ArangoClient, Direction, GraphQueryApi}
import ix.memory.model._

case class EntityResponse(node: GraphNode, claims: Vector[Claim], edges: Vector[GraphEdge])

object EntityResponse {
  implicit val encoder: Encoder[EntityResponse] = deriveEncoder[EntityResponse]
}

case class ProvenanceEntry(patchId: PatchId, rev: Rev, source: PatchSource, intent: Option[String])

object ProvenanceEntry {
  implicit val encoder: Encoder[ProvenanceEntry] = deriveEncoder[ProvenanceEntry]
}

case class ProvenanceResponse(entityId: NodeId, chain: Vector[ProvenanceEntry])

object ProvenanceResponse {
  implicit val encoder: Encoder[ProvenanceResponse] = deriveEncoder[ProvenanceResponse]
}

class EntityRoutes(queryApi: GraphQueryApi, client: ArangoClient) {

  val routes: HttpRoutes[IO] = HttpRoutes.of[IO] {

    // GET /v1/entity/:id?tenant=<uuid>
    case req @ GET -> Root / "v1" / "entity" / UUIDVar(id) =>
      (for {
        tenantStr <- IO.fromOption(req.params.get("tenant"))(
          new IllegalArgumentException("Missing required query parameter: tenant")
        )
        tenantId  <- IO.fromTry(scala.util.Try(UUID.fromString(tenantStr))).map(TenantId(_))
        nodeId     = NodeId(id)
        nodeOpt   <- queryApi.getNode(tenantId, nodeId)
        node      <- IO.fromOption(nodeOpt)(
          new NoSuchElementException(s"Entity not found: $id")
        )
        claims    <- queryApi.getClaims(tenantId, nodeId)
        expanded  <- queryApi.expand(tenantId, nodeId, Direction.Both)
        resp      <- Ok(EntityResponse(node, claims, expanded.edges))
      } yield resp).handleErrorWith(ErrorHandler.handle(_))

    // POST /v1/provenance/:id?tenant=<uuid>
    case req @ POST -> Root / "v1" / "provenance" / UUIDVar(id) =>
      (for {
        tenantStr <- IO.fromOption(req.params.get("tenant"))(
          new IllegalArgumentException("Missing required query parameter: tenant")
        )
        tenantId  <- IO.fromTry(scala.util.Try(UUID.fromString(tenantStr))).map(TenantId(_))
        nodeId     = NodeId(id)
        // Verify entity exists
        nodeOpt   <- queryApi.getNode(tenantId, nodeId)
        _         <- IO.fromOption(nodeOpt)(
          new NoSuchElementException(s"Entity not found: $id")
        )
        // Query patches that touched this entity
        chain     <- queryProvenanceChain(tenantId, nodeId)
        resp      <- Ok(ProvenanceResponse(nodeId, chain))
      } yield resp).handleErrorWith(ErrorHandler.handle(_))
  }

  private def queryProvenanceChain(tenant: TenantId, nodeId: NodeId): IO[Vector[ProvenanceEntry]] =
    client.query(
      """FOR p IN patches
        |  FILTER p.tenant == @tenant
        |  SORT p.rev ASC
        |  RETURN p""".stripMargin,
      Map(
        "tenant" -> tenant.value.toString.asInstanceOf[AnyRef]
      )
    ).map { jsons =>
      jsons.flatMap { json =>
        val c = json.hcursor
        val dataC = c.downField("data")
        // Check if this patch contains ops referencing our entity
        val ops = dataC.downField("ops").focus.flatMap(_.asArray).getOrElse(Vector.empty)
        val touchesEntity = ops.exists { op =>
          val opC = op.hcursor
          opC.get[String]("id").toOption.contains(nodeId.value.toString) ||
            opC.get[String]("entityId").toOption.contains(nodeId.value.toString)
        }
        if (touchesEntity) {
          for {
            patchIdStr <- dataC.get[String]("patchId").toOption
              .orElse(c.get[String]("patch_id").toOption)
            patchId    <- scala.util.Try(UUID.fromString(patchIdStr)).toOption.map(PatchId(_))
            rev        <- c.get[Long]("rev").toOption.map(Rev(_))
            sourceUri  <- dataC.downField("source").get[String]("uri").toOption
            sourceHash  = dataC.downField("source").get[String]("sourceHash").toOption
            extractor  <- dataC.downField("source").get[String]("extractor").toOption
            stStr      <- dataC.downField("source").get[String]("sourceType").toOption
            sourceType <- SourceType.decoder.decodeJson(Json.fromString(stStr)).toOption
            intent      = dataC.get[String]("intent").toOption
          } yield ProvenanceEntry(
            patchId = patchId,
            rev     = rev,
            source  = PatchSource(sourceUri, sourceHash, extractor, sourceType),
            intent  = intent
          )
        } else None
      }.toVector
    }
}
