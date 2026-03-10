package ix.memory.ingestion

import org.scalatest.flatspec.AnyFlatSpec
import org.scalatest.matchers.should.Matchers
import io.circe.Json

import ix.memory.model._

class GraphPatchBuilderSpec extends AnyFlatSpec with Matchers {

  private def mkEntity(
    name: String,
    kind: NodeKind,
    lineStart: Int,
    lineEnd: Int,
    attrs: Map[String, Json] = Map.empty,
    contentFingerprint: Option[String] = None
  ): ParsedEntity =
    ParsedEntity(name, kind, attrs, lineStart, lineEnd, contentFingerprint)

  "GraphPatchBuilder" should "include line_start and line_end in UpsertNode attrs" in {
    val parseResult = ParseResult(
      entities = Vector(
        mkEntity("MyClass", NodeKind.Class, lineStart = 5, lineEnd = 25),
        mkEntity("myMethod", NodeKind.Method, lineStart = 10, lineEnd = 20)
      ),
      relationships = Vector.empty
    )

    val patch = GraphPatchBuilder.build("src/main.ts", Some("abc123"), parseResult)
    val upsertNodes = patch.ops.collect { case op: PatchOp.UpsertNode => op }

    upsertNodes should have size 2

    val classNode = upsertNodes.find(_.name == "MyClass").get
    classNode.attrs("line_start") shouldBe Json.fromInt(5)
    classNode.attrs("line_end") shouldBe Json.fromInt(25)

    val methodNode = upsertNodes.find(_.name == "myMethod").get
    methodNode.attrs("line_start") shouldBe Json.fromInt(10)
    methodNode.attrs("line_end") shouldBe Json.fromInt(20)
  }

  it should "include content_fingerprint alongside line spans" in {
    val parseResult = ParseResult(
      entities = Vector(
        mkEntity("MyClass", NodeKind.Class, lineStart = 1, lineEnd = 50, contentFingerprint = Some("fp123"))
      ),
      relationships = Vector.empty
    )

    val patch = GraphPatchBuilder.build("src/main.ts", Some("abc"), parseResult)
    val node = patch.ops.collect { case op: PatchOp.UpsertNode => op }.head

    node.attrs("line_start") shouldBe Json.fromInt(1)
    node.attrs("line_end") shouldBe Json.fromInt(50)
    node.attrs("content_fingerprint") shouldBe Json.fromString("fp123")
  }

  it should "not generate claims for line_start or line_end" in {
    val parseResult = ParseResult(
      entities = Vector(
        mkEntity("MyClass", NodeKind.Class, lineStart = 5, lineEnd = 25,
          attrs = Map("language" -> Json.fromString("typescript")))
      ),
      relationships = Vector.empty
    )

    val patch = GraphPatchBuilder.build("src/main.ts", Some("abc"), parseResult)
    val claims = patch.ops.collect { case op: PatchOp.AssertClaim => op }

    // Should only have a claim for "language", not for line_start/line_end
    claims.map(_.field) should contain("language")
    claims.map(_.field) should not contain "line_start"
    claims.map(_.field) should not contain "line_end"
  }

  it should "generate distinct edge IDs for same-name CALLS in different files" in {
    val rel = ParsedRelationship("main", "helper", "CALLS")
    val pr = ParseResult(
      entities = Vector(
        mkEntity("main", NodeKind.Function, 1, 10),
        mkEntity("helper", NodeKind.Function, 12, 20)
      ),
      relationships = Vector(rel)
    )

    val patchA = GraphPatchBuilder.build("src/a.ts", None, pr)
    val patchB = GraphPatchBuilder.build("src/b.ts", None, pr)

    val edgeA = patchA.ops.collect { case op: PatchOp.UpsertEdge => op }.head
    val edgeB = patchB.ops.collect { case op: PatchOp.UpsertEdge => op }.head

    edgeA.id should not be edgeB.id
  }

  it should "generate distinct node IDs for same-name entities in different files" in {
    val pr = ParseResult(
      entities = Vector(mkEntity("main", NodeKind.Function, 1, 10)),
      relationships = Vector.empty
    )

    val patchA = GraphPatchBuilder.build("src/a.ts", None, pr)
    val patchB = GraphPatchBuilder.build("src/b.ts", None, pr)

    val nodeA = patchA.ops.collect { case op: PatchOp.UpsertNode => op }.head
    val nodeB = patchB.ops.collect { case op: PatchOp.UpsertNode => op }.head

    nodeA.id should not be nodeB.id
  }

  it should "produce CALLS edges with matching src/dst node IDs for TS functions" in {
    // End-to-end: parser → GraphPatchBuilder produces edges whose
    // src/dst match the node IDs created for the same functions.
    val parser = new ix.memory.ingestion.parsers.TypeScriptParser()
    val source = """
      |export async function resolveEntityFull(
      |  client: any,
      |  symbol: string,
      |  opts?: { kind?: string; path?: string }
      |): Promise<any> {
      |  const winner = pickBest(candidates, symbol);
      |  return winner;
      |}
      |
      |function pickBest(candidates: any[], symbol: string) {
      |  return candidates[0];
      |}
    """.stripMargin

    val parseResult = parser.parse("resolve.ts", source)
    val filePath = "/project/ix-cli/src/cli/resolve.ts"
    val patch = GraphPatchBuilder.build(filePath, Some("hash"), parseResult)

    val nodes = patch.ops.collect { case op: PatchOp.UpsertNode => op }
    val edges = patch.ops.collect { case op: PatchOp.UpsertEdge => op }

    // Find the CALLS edge
    val callsEdges = edges.filter(_.predicate == EdgePredicate("CALLS"))
    callsEdges should not be empty

    val resolveToPickBest = callsEdges.find(e => {
      val srcNode = nodes.find(_.id == NodeId(e.src.value))
      val dstNode = nodes.find(_.id == NodeId(e.dst.value))
      srcNode.exists(_.name == "resolveEntityFull") &&
      dstNode.exists(_.name == "pickBest")
    })

    resolveToPickBest shouldBe defined
  }

  it should "preserve existing attrs alongside line spans" in {
    val parseResult = ParseResult(
      entities = Vector(
        mkEntity("myFunc", NodeKind.Function, lineStart = 3, lineEnd = 8,
          attrs = Map("visibility" -> Json.fromString("public"), "language" -> Json.fromString("scala")))
      ),
      relationships = Vector.empty
    )

    val patch = GraphPatchBuilder.build("src/main.scala", None, parseResult)
    val node = patch.ops.collect { case op: PatchOp.UpsertNode => op }.head

    node.attrs("line_start") shouldBe Json.fromInt(3)
    node.attrs("line_end") shouldBe Json.fromInt(8)
    node.attrs("visibility") shouldBe Json.fromString("public")
    node.attrs("language") shouldBe Json.fromString("scala")
  }
}
