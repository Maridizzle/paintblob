// The letter-elders, drawn — Y, your guide, and Ee, who went short.
//
// Same idiom as the squirrel in tour.js and everything in avatar.js: chunky
// bezier-free outlines built from overlapping flat fills whose joins vanish
// under one colour, and every shadow and highlight a translucent rgba() wash
// carrying its own fill — so nothing here does colour maths and the letter
// recolours with a token. The body colour comes from `--lt-body`, set per
// letter in styles.css off the live theme, so under Tee Vibes Y comes up gold
// and Ee deep magenta without a line of this file knowing what magenta is.
//
// Drawn as paths, never as <text>: the app ships `font-src 'self'`, and a
// character that depends on a font is a character that can arrive as a blank
// box. A Y is two arms and a stem; an E is a stem and three bars. Both are
// shapes.
//
// Authored on a 0..100 box, each letter sitting a little left of centre so the
// speech card, which sits to its right, reads as coming from its mouth. A
// parent <g class="lt-flip"> is left in place so a scene could face one the
// other way without touching geometry, exactly as the squirrel does.

// A rectangle rotated to run from a→b with a given width, as a four-point
// polygon path. The letters are built from a handful of these, overlapping at
// the joins so the fill closes the corners for free.
function bar(ax, ay, bx, by, w) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const px = (-dy / len) * (w / 2);
  const py = (dx / len) * (w / 2);
  const p = (x, y) => `${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10}`;
  return `M${p(ax + px, ay + py)}L${p(ax - px, ay - py)}L${p(bx - px, by - py)}L${p(bx + px, by + py)}Z`;
}

// The eye pair and a soft mouth, shared so both elders blink the same way. `cx`
// is the midpoint between the eyes; `mouth` is a path or '' for none.
function face(cx, cy, gap, r, mouth = '') {
  return `
    <g class="lt-face">
      <circle class="lt-white" cx="${cx - gap}" cy="${cy}" r="${r}"/>
      <circle class="lt-white" cx="${cx + gap}" cy="${cy}" r="${r}"/>
      <circle class="lt-eye" cx="${cx - gap + 0.4}" cy="${cy + 0.4}" r="${r * 0.52}"/>
      <circle class="lt-eye" cx="${cx + gap + 0.4}" cy="${cy + 0.4}" r="${r * 0.52}"/>
      <circle cx="${cx - gap + r * 0.4}" cy="${cy - r * 0.4}" r="${r * 0.2}" fill="rgba(255,255,255,0.9)"/>
      <circle cx="${cx + gap + r * 0.4}" cy="${cy - r * 0.4}" r="${r * 0.2}" fill="rgba(255,255,255,0.9)"/>
      ${mouth}
    </g>`;
}

// Y — the letter that was never sure what it was. Two arms lifted like it is
// still asking a question, a slim stem, and the eyes set high in the fork.
function drawY() {
  const arms = bar(24, 17, 50, 55, 15) + bar(76, 17, 50, 55, 15);
  const stem = bar(50, 50, 50, 89, 15);
  return `<svg class="lt lt-y" viewBox="0 0 100 100" width="96" height="96" aria-hidden="true">
    <g class="lt-flip">
      <path class="lt-body" d="${arms}${stem}"/>
      <!-- a wash down the right of every stroke, so the thread looks rounded -->
      <path d="${bar(75, 19, 51, 54, 5)}${bar(53, 52, 53, 87, 5)}" fill="rgba(0,0,0,0.14)"/>
      <path d="${bar(25, 19, 48, 52, 4)}" fill="rgba(255,255,255,0.16)"/>
      ${face(46, 44, 8, 5, '<path d="M40 58 Q46 63 52 58" fill="none" stroke="rgba(30,10,22,0.55)" stroke-width="2.4" stroke-linecap="round"/>')}
    </g>
  </svg>`;
}

// Ee — the elder, squat where it used to be tall: the middle bar has crept up
// and the whole letter sits low and wide, a vowel that lost its length. The
// eyes ride the top bar, a little tired.
function drawEe() {
  const stem = bar(28, 18, 28, 86, 16);
  const top = bar(28, 25, 74, 25, 15);
  const mid = bar(28, 52, 62, 52, 14);
  const bot = bar(28, 79, 74, 79, 15);
  return `<svg class="lt lt-ee" viewBox="0 0 100 100" width="96" height="96" aria-hidden="true">
    <g class="lt-flip">
      <path class="lt-body" d="${stem}${top}${mid}${bot}"/>
      <!-- age it: a shadow along the undersides, a thin highlight along the top -->
      <path d="${bar(30, 30, 72, 30, 4)}${bar(30, 57, 60, 57, 4)}${bar(30, 84, 72, 84, 4)}" fill="rgba(0,0,0,0.16)"/>
      <path d="${bar(30, 21, 70, 21, 3)}" fill="rgba(255,255,255,0.14)"/>
      ${face(53, 39, 8, 4.6, '<path d="M47 47 L59 47" fill="none" stroke="rgba(30,10,22,0.5)" stroke-width="2.2" stroke-linecap="round"/>')}
    </g>
  </svg>`;
}

const DRAW = { Y: drawY, Ee: drawEe };

export function isSpeaker(id) {
  return Object.prototype.hasOwnProperty.call(DRAW, id);
}

/** The speaker as an SVG string, ready to drop into the cutscene card. Falls
 *  back to Y rather than throwing, so a beat that names a speaker this build
 *  does not draw still shows a face. */
export function letterSVG(id) {
  return (DRAW[id] ?? drawY)();
}
