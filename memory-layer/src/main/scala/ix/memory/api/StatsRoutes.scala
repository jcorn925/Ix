package ix.memory.api

import cats.effect.IO
import io.circe.Json
import io.circe.syntax._
import org.http4s.HttpRoutes
import org.http4s.circe.CirceEntityCodec._
import org.http4s.dsl.io._

import ix.memory.db.ArangoClient

class StatsRoutes(client: ArangoClient) {

  val routes: HttpRoutes[IO] = HttpRoutes.of[IO] {
    case GET -> Root / "v1" / "stats" =>
      (for {
        nodeStats <- client.query(
          """FOR n IN nodes
            |  FILTER n.deleted_rev == null
            |  COLLECT kind = n.kind WITH COUNT INTO cnt
            |  SORT cnt DESC
            |  RETURN { kind: kind, count: cnt }""".stripMargin,
          Map.empty[String, AnyRef]
        )
        edgeStats <- client.query(
          """FOR e IN edges
            |  FILTER e.deleted_rev == null
            |  COLLECT predicate = e.predicate WITH COUNT INTO cnt
            |  SORT cnt DESC
            |  RETURN { predicate: predicate, count: cnt }""".stripMargin,
          Map.empty[String, AnyRef]
        )
        totalNodes <- client.query(
          """RETURN LENGTH(FOR n IN nodes FILTER n.deleted_rev == null RETURN 1)""",
          Map.empty[String, AnyRef]
        )
        totalEdges <- client.query(
          """RETURN LENGTH(FOR e IN edges FILTER e.deleted_rev == null RETURN 1)""",
          Map.empty[String, AnyRef]
        )
        resp <- Ok(Json.obj(
          "nodes" -> Json.obj(
            "total" -> totalNodes.headOption.flatMap(_.asNumber).flatMap(_.toInt).getOrElse(0).asJson,
            "byKind" -> nodeStats.asJson
          ),
          "edges" -> Json.obj(
            "total" -> totalEdges.headOption.flatMap(_.asNumber).flatMap(_.toInt).getOrElse(0).asJson,
            "byPredicate" -> edgeStats.asJson
          )
        ))
      } yield resp).handleErrorWith(ErrorHandler.handle(_))
  }
}
