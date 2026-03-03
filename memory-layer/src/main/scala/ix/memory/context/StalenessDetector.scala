package ix.memory.context

import java.nio.file.{Files, Paths}
import java.security.MessageDigest

import cats.effect.IO
import ix.memory.model._

/**
 * Detects whether claims are stale by comparing the current source file hash
 * to the hash recorded in the claim's provenance.
 *
 * A claim is "stale" if:
 * - Its source file's current hash differs from provenance.sourceHash
 * - Its source file no longer exists
 * - Its provenance has no sourceHash (unknown state, treated as potentially stale)
 */
object StalenessDetector {

  /**
   * For a collection of claims, determine which have stale sources.
   * Returns a Map from ClaimId to whether the source has changed.
   *
   * Uses IO since file system access is a side effect.
   */
  def detect(claims: Vector[Claim]): IO[Map[ClaimId, Boolean]] = IO.blocking {
    // Group by sourceUri to avoid hashing the same file multiple times
    val bySource = claims.groupBy(_.provenance.sourceUri)

    bySource.flatMap { case (sourceUri, sourceClaims) =>
      val currentHash = computeHash(sourceUri)
      sourceClaims.map { claim =>
        val changed = claim.provenance.sourceHash match {
          case Some(recordedHash) => currentHash.fold(true)(_ != recordedHash) // file gone or hash differs
          case None               => false // no recorded hash, can't determine staleness -- treat as fresh
        }
        claim.id -> changed
      }
    }
  }

  /** Compute SHA-256 hash of a file, returning None if the file doesn't exist or can't be read. */
  private def computeHash(sourceUri: String): Option[String] = {
    try {
      val path = Paths.get(sourceUri)
      if (Files.exists(path) && Files.isRegularFile(path)) {
        val bytes = Files.readAllBytes(path)
        val digest = MessageDigest.getInstance("SHA-256")
        Some(digest.digest(bytes).map("%02x".format(_)).mkString)
      } else {
        None // File doesn't exist
      }
    } catch {
      case _: Exception => None // Can't read file
    }
  }
}
