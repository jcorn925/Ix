package ix.memory.db

import org.scalatest.flatspec.AnyFlatSpec
import org.scalatest.matchers.should.Matchers

/**
 * Verify that search AQL queries use Arango-compatible functions.
 * COALESCE() is SQL — ArangoDB uses NOT_NULL() or direct field access.
 */
class SearchAqlSpec extends AnyFlatSpec with Matchers {

  // Read the source file to inspect AQL strings
  private val sourceFile = scala.io.Source.fromFile(
    "memory-layer/src/main/scala/ix/memory/db/ArangoGraphQueryApi.scala"
  ).mkString

  "ArangoGraphQueryApi AQL" should "not use COALESCE (not valid AQL)" in {
    sourceFile should not include "COALESCE"
  }

  it should "embed _search_weight into attrs via MERGE" in {
    sourceFile should include ("_search_weight: entry.weight")
    sourceFile should include ("MERGE(n2.attrs, { _search_weight")
  }

  it should "use weighted scoring in nameOnly mode" in {
    // nameOnly AQL should still return weight
    sourceFile should include ("LOWER(n.name) == LOWER(@text) ? 100 : 60")
  }

  it should "use weighted scoring in full mode with multiple match tiers" in {
    // Full AQL should have name (100/60), provenance (40), claim (20), decision (20), attrs (10)
    sourceFile should include ("weight: 40")
    sourceFile should include ("weight: 20")
    sourceFile should include ("weight: 10")
  }
}
