// The unpainted view of a picture, as a standalone SVG string.
//
// One piece of markup serves both sizes it is needed at — the thumbnail on a
// row in the Pictures panel, and the large preview behind a hover or a long
// press. SVG rather than a raster because a cell's outline is already SVG path
// data: there is nothing here to draw, only to wrap.
//
// Every cell is concatenated into a single <path>. As far as a stroke is
// concerned they are all subpaths of one shape, and one element strokes far
// faster than five hundred — which matters when the panel builds a row per
// picture and each picture may carry 500 cells.

/**
 * Stroke width is set in device pixels via `vector-effect`, not in picture
 * units. A picture is 700–2000 units across and is shown at anywhere from 50
 * to 500 of them, so a width in its own coordinates would be a hairline at one
 * size and a slab at the other.
 */
export function outlineSVG(puzzle, { stroke = 'currentColor', width = 1, opacity = 1, maxCells = Infinity } = {}) {
  let cells = puzzle.cells;
  if (cells.length > maxCells) {
    // Biggest first, then cut. Five hundred outlines inside fifty pixels is a
    // grey block with no picture in it; the largest few dozen are the shapes
    // that carry the composition, and the rest is the texture that buries it.
    // Each cell's path is complete in itself, so dropping the small ones
    // leaves the survivors closed rather than fraying them.
    cells = [...cells].sort((a, b) => b.a - a.a).slice(0, maxCells);
  }
  const d = cells.map((c) => c.d).join('');
  return `<svg viewBox="0 0 ${puzzle.width} ${puzzle.height}" xmlns="http://www.w3.org/2000/svg"
    preserveAspectRatio="xMidYMid meet"><path d="${d}" fill="none" stroke="${stroke}"
    stroke-width="${width}" stroke-opacity="${opacity}" stroke-linejoin="round"
    vector-effect="non-scaling-stroke"/></svg>`;
}

/**
 * How heavily to draw the outlines, given how many cells are being squeezed
 * into how many pixels.
 *
 * A seventeen-cell demo picture wants a confident line; a five-hundred-cell
 * one at thumbnail size wants a hairline, or every cell boundary merges into a
 * single grey block and the composition disappears. Density is cells per
 * thousand square display pixels, which is the thing that actually decides
 * whether a line drawing reads or blocks up.
 */
export function outlineWeight(cellCount, displayPx) {
  // Roughly: a cell needs about ten display pixels of area before its outline
  // says anything. Past that the honest move is to draw fewer of them rather
  // than to draw them all fainter.
  const maxCells = Math.max(12, Math.round((displayPx * displayPx) / 90));
  const shown = Math.min(cellCount, maxCells);
  const density = (shown * 1000) / Math.max(1, displayPx * displayPx);
  if (density > 18) return { width: 0.75, opacity: 0.75, maxCells };
  if (density > 4) return { width: 1, opacity: 0.9, maxCells };
  return { width: 1.25, opacity: 1, maxCells };
}
