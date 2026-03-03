package ix.memory.context

import cats.effect.IO
import ix.memory.model._

/**
 * Trait for LLM-based conflict judgment.
 * Implementations should send the two claim statements to an LLM
 * and return a judgment on whether they truly conflict.
 */
trait LlmJudge {
  /**
   * Ask the LLM whether two claims conflict.
   * @return Some(judgment) if the LLM detects a semantic conflict, None if no conflict
   */
  def judge(claimA: Claim, claimB: Claim): IO[Option[LlmJudgment]]
}

/**
 * The LLM's judgment about a pair of claims.
 */
case class LlmJudgment(
  isConflict:     Boolean,
  confidence:     Double,            // 0.0 to 1.0 — how confident the LLM is in its judgment
  explanation:    String,            // Why the LLM thinks they do or don't conflict
  preferredClaim: Option[ClaimId]    // Which claim the LLM prefers, if any
)

/**
 * Stub implementation — always returns None (no LLM available).
 * Replace with real implementation when LLM integration is ready.
 */
class StubLlmJudge extends LlmJudge {
  def judge(claimA: Claim, claimB: Claim): IO[Option[LlmJudgment]] =
    IO.pure(None)
}
