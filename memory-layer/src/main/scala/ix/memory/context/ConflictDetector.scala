package ix.memory.context

import ix.memory.model._

trait ConflictDetector {
  def detect(claims: Vector[ScoredClaim]): Vector[ConflictReport]
}

/** Stub implementation for Phase 1 -- Task 9 will replace this. */
class DefaultConflictDetector extends ConflictDetector {

  def detect(claims: Vector[ScoredClaim]): Vector[ConflictReport] =
    Vector.empty // No conflict detection yet
}
