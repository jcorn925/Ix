package ix.memory.context

object EntityExtractor {

  private val stopwords = Set(
    "how", "does", "the", "is", "a", "an", "what", "when", "where", "why",
    "do", "it", "in", "of", "to", "for", "and", "or", "not", "with", "by",
    "from", "at", "on", "this", "that", "are", "was", "be", "has", "have", "can"
  )

  def extract(query: String): Vector[String] =
    query.toLowerCase
      .split("[\\s,;.!?]+")
      .map(_.trim)
      .filter(w => w.nonEmpty && w.length > 1 && !stopwords.contains(w))
      .toVector
      .distinct
}
