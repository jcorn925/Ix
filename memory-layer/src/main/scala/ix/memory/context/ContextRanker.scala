package ix.memory.context

import ix.memory.model.ScoredClaim

object ContextRanker {

  def rank(claims: Vector[ScoredClaim]): Vector[ScoredClaim] =
    claims.sortBy(-_.confidence.score)
}
