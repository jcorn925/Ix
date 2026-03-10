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
