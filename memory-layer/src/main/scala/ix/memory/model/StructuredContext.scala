package ix.memory.model

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

final case class ScoredClaim(
  claim:      Claim,
  confidence: ConfidenceBreakdown,
  relevance:  Double = 1.0,
  finalScore: Double = 0.0
)

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
