package ix.memory.ingestion

import ix.memory.ingestion.parsers.TreeSitterPythonParser

/**
 * Routes file paths to the appropriate language parser.
 * Currently supports Python (.py) files only.
 */
class ParserRouter {
  private val pythonParser = new TreeSitterPythonParser()

  def parserFor(filePath: String): Option[TreeSitterPythonParser] = {
    if (filePath.endsWith(".py")) Some(pythonParser)
    else None
  }
}
