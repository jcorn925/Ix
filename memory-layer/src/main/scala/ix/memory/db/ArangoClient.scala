package ix.memory.db

import cats.effect.{IO, Resource}
import cats.syntax.traverse._
import com.arangodb.{ArangoDB, ArangoDatabase}
import com.fasterxml.jackson.databind.ObjectMapper
import io.circe.Json
import io.circe.parser.{parse => parseJson}

import scala.jdk.CollectionConverters._

class ArangoClient private (db: ArangoDatabase) {
  private val mapper = new ObjectMapper()

  private def toJson(value: AnyRef): IO[Json] =
    IO.fromEither(
      parseJson(mapper.writeValueAsString(value))
        .left.map(e => new RuntimeException(s"Failed to parse ArangoDB result: ${e.message}"))
    )

  private def asJava(bindVars: Map[String, AnyRef]): java.util.Map[String, AnyRef] = {
    val m = new java.util.HashMap[String, AnyRef]()
    bindVars.foreach { case (k, v) => m.put(k, v) }
    m
  }

  def query(aql: String, bindVars: Map[String, AnyRef] = Map.empty): IO[List[Json]] =
    IO.blocking {
      val cursor = db.query(aql, classOf[AnyRef], asJava(bindVars))
      cursor.asListRemaining().asScala.toList
    }.flatMap(_.traverse(toJson))

  def queryOne(aql: String, bindVars: Map[String, AnyRef] = Map.empty): IO[Option[Json]] =
    query(aql, bindVars).map(_.headOption)

  def execute(aql: String, bindVars: Map[String, AnyRef] = Map.empty): IO[Unit] =
    IO.blocking {
      db.query(aql, classOf[Void], asJava(bindVars))
      ()
    }

  def ensureSchema(): IO[Unit] = ArangoSchema.ensure(db)
}

object ArangoClient {
  def resource(
    host: String,
    port: Int,
    database: String,
    user: String,
    password: String
  ): Resource[IO, ArangoClient] =
    Resource.make(
      IO.blocking {
        val arango = new ArangoDB.Builder()
          .host(host, port)
          .user(user)
          .password(if (password.isEmpty) null else password)
          .build()
        val existingDbs = arango.getDatabases.asScala.toSet
        if (!existingDbs.contains(database)) {
          arango.createDatabase(database)
        }
        (arango, new ArangoClient(arango.db(database)))
      }
    ) { case (arango, _) =>
      IO.blocking(arango.shutdown())
    }.map(_._2)
}
