package ix.memory

import cats.effect.IO
import ix.memory.db.ArangoClient

trait TestDbHelper {

  /** Truncate all collections to ensure a clean state for each test. */
  protected def cleanDatabase(client: ArangoClient): IO[Unit] = {
    val collections = List(
      "nodes", "edges", "claims", "patches",
      "revisions", "idempotency_keys", "conflict_sets"
    )
    collections.foldLeft(IO.unit) { (acc, name) =>
      acc >> client.execute(s"FOR doc IN $name REMOVE doc IN $name", Map.empty[String, AnyRef])
    }
  }
}
