package ix.memory.ingestion.parsers

import org.scalatest.flatspec.AnyFlatSpec
import org.scalatest.matchers.should.Matchers
import ix.memory.model.NodeKind
import io.circe.Json

class ScalaParserSpec extends AnyFlatSpec with Matchers {
  val parser = new ScalaParser

  val sampleCode: String =
    """package ix.memory.context
      |
      |import cats.effect.IO
      |import ix.memory.model.{Claim, GraphNode}
      |
      |trait ConfidenceScorer {
      |  def score(claim: Claim, ctx: ScoringContext): ScoredClaim
      |}
      |
      |class ConfidenceScorerImpl extends ConfidenceScorer {
      |  override def score(claim: Claim, ctx: ScoringContext): ScoredClaim = {
      |    val base = computeBase(claim)
      |    ScoredClaim(claim, base)
      |  }
      |
      |  private def computeBase(claim: Claim): Double = {
      |    claim.provenance.sourceType match {
      |      case SourceType.Code => 0.9
      |      case _ => 0.5
      |    }
      |  }
      |}
      |
      |object ConfidenceScorerImpl {
      |  def apply(): ConfidenceScorerImpl = new ConfidenceScorerImpl
      |}
      |""".stripMargin

  "ScalaParser" should "create a File entity" in {
    val result = parser.parse("ConfidenceScorer.scala", sampleCode)
    val file = result.entities.find(_.kind == NodeKind.File)
    file shouldBe defined
    file.get.name shouldBe "ConfidenceScorer.scala"
    file.get.attrs.get("language") shouldBe Some(Json.fromString("scala"))
  }

  it should "extract trait definitions" in {
    val result = parser.parse("ConfidenceScorer.scala", sampleCode)
    val traits = result.entities.filter(e =>
      e.kind == NodeKind.Class &&
      e.attrs.get("scala_kind").contains(Json.fromString("trait"))
    )
    traits.map(_.name) should contain("ConfidenceScorer")
  }

  it should "extract class definitions" in {
    val result = parser.parse("ConfidenceScorer.scala", sampleCode)
    val classes = result.entities.filter(e =>
      e.kind == NodeKind.Class &&
      e.attrs.get("scala_kind").contains(Json.fromString("class"))
    )
    classes.map(_.name) should contain("ConfidenceScorerImpl")
  }

  it should "extract object definitions" in {
    val result = parser.parse("ConfidenceScorer.scala", sampleCode)
    val objects = result.entities.filter(e =>
      e.kind == NodeKind.Class &&
      e.attrs.get("scala_kind").contains(Json.fromString("object"))
    )
    objects.map(_.name) should contain("ConfidenceScorerImpl")
  }

  it should "extract method definitions with line ranges" in {
    val result = parser.parse("ConfidenceScorer.scala", sampleCode)
    val methods = result.entities.filter(_.kind == NodeKind.Function)
    methods.map(_.name) should contain allOf ("score", "computeBase", "apply")
    val computeBase = methods.find(_.name == "computeBase").get
    computeBase.lineStart should be > 0
    computeBase.lineEnd should be >= computeBase.lineStart
  }

  it should "extract import statements" in {
    val result = parser.parse("ConfidenceScorer.scala", sampleCode)
    val imports = result.entities.filter(_.kind == NodeKind.Module)
    imports.map(_.name) should contain allOf ("cats.effect.IO", "ix.memory.model")
  }

  it should "create DEFINES relationships" in {
    val result = parser.parse("ConfidenceScorer.scala", sampleCode)
    val defines = result.relationships.filter(_.predicate == "DEFINES")
    defines.map(r => (r.srcName, r.dstName)) should contain allOf (
      ("ConfidenceScorer.scala", "ConfidenceScorer"),
      ("ConfidenceScorer.scala", "ConfidenceScorerImpl"),
      ("ConfidenceScorerImpl", "computeBase")
    )
  }

  it should "create IMPORTS relationships" in {
    val result = parser.parse("ConfidenceScorer.scala", sampleCode)
    val imports = result.relationships.filter(_.predicate == "IMPORTS")
    imports should not be empty
  }

  it should "store method signature as summary" in {
    val result = parser.parse("ConfidenceScorer.scala", sampleCode)
    val method = result.entities.find(_.name == "computeBase").get
    val summary = method.attrs.get("summary").flatMap(_.asString)
    summary shouldBe defined
    summary.get should include("computeBase")
  }

  it should "not store raw file content" in {
    val result = parser.parse("ConfidenceScorer.scala", sampleCode)
    val file = result.entities.find(_.kind == NodeKind.File).get
    file.attrs.get("content") shouldBe None
  }

  it should "handle case classes" in {
    val code = """case class Foo(bar: String, baz: Int)""".stripMargin
    val result = parser.parse("Foo.scala", code)
    val classes = result.entities.filter(e =>
      e.kind == NodeKind.Class &&
      e.attrs.get("scala_kind").contains(Json.fromString("case_class"))
    )
    classes.map(_.name) should contain("Foo")
  }
}
