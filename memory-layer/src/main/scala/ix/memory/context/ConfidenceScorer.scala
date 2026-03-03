package ix.memory.context

import ix.memory.model._

trait ConfidenceScorer {
  def score(claim: Claim, latestRev: Rev): ScoredClaim
}

/** Stub implementation for Phase 1 -- Task 8 will replace this. */
class DefaultConfidenceScorer extends ConfidenceScorer {

  def score(claim: Claim, latestRev: Rev): ScoredClaim = {
    val baseAuth = SourceType.baseAuthority(claim.provenance.sourceType)
    val breakdown = ConfidenceBreakdown(
      baseAuthority   = Factor(baseAuth, s"${claim.provenance.sourceType}"),
      verification    = Factor(1.0, "no verification data"),
      recency         = Factor(1.0, "default recency"),
      corroboration   = Factor(1.0, "default corroboration"),
      conflictPenalty = Factor(1.0, "no conflicts detected")
    )
    ScoredClaim(claim, breakdown)
  }
}
