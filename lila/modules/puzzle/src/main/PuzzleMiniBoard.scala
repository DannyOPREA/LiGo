package lila.puzzle

/** A small server-side picture of a puzzle's starting position, as inline SVG: for the daily puzzle on the
  * home page and the history list, where lichess shows a chessground mini board. It shows the part of the
  * board in `bounds`, the setup stones, and nothing else. Every number in it is computed here from the stored
  * puzzle, so the markup holds no user text.
  */
object PuzzleMiniBoard:

  private val cell = 10 // one grid step, in SVG units
  private val pad = 7 // the margin around the outermost lines

  def svg(puzzle: Puzzle, pixels: Int = 160): String =
    val bounds = puzzle.bounds.getOrElse(Puzzle.Bounds(0, 0, puzzle.size - 1, puzzle.size - 1))
    val cols = bounds.right - bounds.left
    val rows = bounds.bottom - bounds.top
    val width = cols * cell + 2 * pad
    val height = rows * cell + 2 * pad
    def x(col: Int) = pad + (col - bounds.left) * cell
    def y(row: Int) = pad + (row - bounds.top) * cell
    val lines =
      (bounds.left to bounds.right).map(c =>
        s"""<path d="M${x(c)} ${y(bounds.top)}V${y(bounds.bottom)}"/>"""
      ) ++
        (bounds.top to bounds.bottom).map(r =>
          s"""<path d="M${x(bounds.left)} ${y(r)}H${x(bounds.right)}"/>"""
        )
    def stones(points: String, fill: String) =
      Puzzle
        .sgfPoints(points)
        .filter((c, r) => c >= bounds.left && c <= bounds.right && r >= bounds.top && r <= bounds.bottom)
        .map((c, r) => s"""<circle cx="${x(c)}" cy="${y(r)}" r="${cell / 2 - 0.5}" fill="$fill"/>""")
    val black = stones(puzzle.setup.black, "#111").mkString
    val white = stones(puzzle.setup.white, "#f4f4f4").mkString
    val h = pixels * height / width
    s"""<svg class="puzzle-mini" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 $width $height" width="$pixels" height="$h">""" +
      s"""<rect width="$width" height="$height" fill="#dcb35c"/>""" +
      s"""<g stroke="#5b4a24" stroke-width="0.5" fill="none">${lines.mkString}</g>""" +
      s"""<g stroke="#222" stroke-width="0.5">$black$white</g>""" +
      "</svg>"
