package ix.memory.model

import io.circe.{Decoder, Encoder, Json}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import io.circe.syntax._

final case class CompactScoredClaim(
  entityId:    NodeId,
  field:       String,
  value:       Json,
  score:       Double,
  confidence:  CompactConfidence,
  path:        Option[String],
  lineRange:   Option[(Int, Int)]
)

object CompactScoredClaim {

  /** Truncate string JSON values longer than 120 characters. */
  def truncateValue(v: Json): Json =
    v.asString match {
      case Some(s) if s.length > 120 => Json.fromString(s.take(120) + "...")
      case _                         => v
    }

  implicit val encoder: Encoder[CompactScoredClaim] = Encoder.instance { csc =>
    val fields = List(
      "entityId"   -> csc.entityId.asJson,
      "field"      -> Json.fromString(csc.field),
      "value"      -> truncateValue(csc.value),
      "score"      -> Json.fromDoubleOrNull(csc.score),
      "confidence" -> csc.confidence.asJson
    ) ++
      csc.path.map(p => "path" -> Json.fromString(p)).toList ++
      csc.lineRange.map { case (s, e) => "lineRange" -> Json.arr(Json.fromInt(s), Json.fromInt(e)) }.toList

    Json.obj(fields: _*)
  }

  implicit val decoder: Decoder[CompactScoredClaim] = Decoder.instance { c =>
    for {
      entityId   <- c.get[NodeId]("entityId")
      field      <- c.get[String]("field")
      value      <- c.get[Json]("value")
      score      <- c.get[Double]("score")
      confidence <- c.get[CompactConfidence]("confidence")
      path       <- c.get[Option[String]]("path")
      lineRange  <- c.downField("lineRange").as[Option[List[Int]]].map(_.collect {
        case List(s, e) => (s, e)
      })
    } yield CompactScoredClaim(entityId, field, value, score, confidence, path, lineRange)
  }
}

final case class ScoredClaim(
  claim:      Claim,
  confidence: ConfidenceBreakdown,
  relevance:  Double = 1.0,
  finalScore: Double = 0.0
) {
  def toCompact: CompactScoredClaim = CompactScoredClaim(
    entityId   = claim.entityId,
    field      = claim.statement,
    value      = claim.value,
    score      = finalScore,
    confidence = confidence.toCompact,
    path       = Some(claim.provenance.sourceUri),
    lineRange  = None
  )
}

object ScoredClaim {
  implicit val encoder: Encoder[ScoredClaim] = deriveEncoder[ScoredClaim]
  implicit val decoder: Decoder[ScoredClaim] = deriveDecoder[ScoredClaim]
}

final case class ConflictReport(
  id:             ConflictId,
  claimA:         ClaimId,
  claimB:         ClaimId,
  reason:         String,
  recommendation: String
)

object ConflictReport {
  implicit val encoder: Encoder[ConflictReport] = deriveEncoder[ConflictReport]
  implicit val decoder: Decoder[ConflictReport] = deriveDecoder[ConflictReport]
}

final case class DecisionReport(
  title:    String,
  rationale: String,
  entityId: Option[NodeId],
  intentId: Option[NodeId],
  rev:      Rev
)

object DecisionReport {
  implicit val encoder: Encoder[DecisionReport] = deriveEncoder[DecisionReport]
  implicit val decoder: Decoder[DecisionReport] = deriveDecoder[DecisionReport]
}

final case class IntentReport(
  id:           NodeId,
  statement:    String,
  status:       String,
  confidence:   Double,
  parentIntent: Option[String]
)

object IntentReport {
  implicit val encoder: Encoder[IntentReport] = deriveEncoder[IntentReport]
  implicit val decoder: Decoder[IntentReport] = deriveDecoder[IntentReport]
}

final case class ContextMetadata(
  query:        String,
  seedEntities: List[NodeId],
  hopsExpanded: Int,
  asOfRev:      Rev,
  depth:        Option[String]
)

object ContextMetadata {
  implicit val encoder: Encoder[ContextMetadata] = deriveEncoder[ContextMetadata]
  implicit val decoder: Decoder[ContextMetadata] = deriveDecoder[ContextMetadata]
}

final case class NodeSummary(
  id:   NodeId,
  kind: NodeKind,
  name: String,
  rev:  Rev
)

object NodeSummary {
  implicit val encoder: Encoder[NodeSummary] = deriveEncoder[NodeSummary]
  implicit val decoder: Decoder[NodeSummary] = deriveDecoder[NodeSummary]
}

final case class EdgeSummary(
  id:        EdgeId,
  src:       NodeId,
  dst:       NodeId,
  predicate: EdgePredicate,
  rev:       Rev
)

object EdgeSummary {
  implicit val encoder: Encoder[EdgeSummary] = deriveEncoder[EdgeSummary]
  implicit val decoder: Decoder[EdgeSummary] = deriveDecoder[EdgeSummary]
}

final case class StructuredContext(
  claims:        List[ScoredClaim],
  compactClaims: List[CompactScoredClaim] = Nil,
  conflicts:     List[ConflictReport],
  decisions:     List[DecisionReport],
  intents:       List[IntentReport],
  nodes:         List[GraphNode],
  edges:         List[GraphEdge],
  nodeSummaries: List[NodeSummary] = Nil,
  edgeSummaries: List[EdgeSummary] = Nil,
  metadata:      ContextMetadata
)

object StructuredContext {
  implicit val encoder: Encoder[StructuredContext] = deriveEncoder[StructuredContext]

  implicit val decoder: Decoder[StructuredContext] = Decoder.instance { c =>
    for {
      claims         <- c.getOrElse[List[ScoredClaim]]("claims")(Nil)
      compactClaims  <- c.getOrElse[List[CompactScoredClaim]]("compactClaims")(Nil)
      conflicts      <- c.getOrElse[List[ConflictReport]]("conflicts")(Nil)
      decisions      <- c.getOrElse[List[DecisionReport]]("decisions")(Nil)
      intents        <- c.getOrElse[List[IntentReport]]("intents")(Nil)
      nodes          <- c.getOrElse[List[GraphNode]]("nodes")(Nil)
      edges          <- c.getOrElse[List[GraphEdge]]("edges")(Nil)
      nodeSummaries  <- c.getOrElse[List[NodeSummary]]("nodeSummaries")(Nil)
      edgeSummaries  <- c.getOrElse[List[EdgeSummary]]("edgeSummaries")(Nil)
      metadata       <- c.get[ContextMetadata]("metadata")
    } yield StructuredContext(
      claims = claims,
      compactClaims = compactClaims,
      conflicts = conflicts,
      decisions = decisions,
      intents = intents,
      nodes = nodes,
      edges = edges,
      nodeSummaries = nodeSummaries,
      edgeSummaries = edgeSummaries,
      metadata = metadata
    )
  }
}
