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

// X — the un-namer, the mark you make when the name is gone. Two strokes
// crossed and nothing else, drawn in the drained grey of a colour that answers
// to nothing (--lt-body is --muted for X, where Y is gold and Ee magenta). The
// eyes sit high in the top notch between the arms; the mouth is a flat, unbothered
// line — it is winning and knows it.
function drawX() {
  const down = bar(24, 16, 76, 86, 15); // top-left to bottom-right
  const up = bar(76, 16, 24, 86, 15);   // top-right to bottom-left
  return `<svg class="lt lt-x" viewBox="0 0 100 100" width="96" height="96" aria-hidden="true">
    <g class="lt-flip">
      <path class="lt-body" d="${down}${up}"/>
      <!-- a shadow down the two legs, a thin light along the two upper arms -->
      <path d="${bar(52, 53, 73, 82, 4)}${bar(48, 53, 27, 82, 4)}" fill="rgba(0,0,0,0.16)"/>
      <path d="${bar(26, 19, 48, 48, 3.5)}${bar(74, 19, 52, 48, 3.5)}" fill="rgba(255,255,255,0.13)"/>
      ${face(50, 37, 7, 4.6, '<path d="M43 51 Q50 53 57 51" fill="none" stroke="rgba(30,10,22,0.5)" stroke-width="2.2" stroke-linecap="round"/>')}
    </g>
  </svg>`;
}

// The Hoarder — a pair of brackets with nothing between them but what it has
// grabbed: the mark that sets a thing aside and keeps it. Two curved arms, each
// built from four short bars bowing outward (this file draws no curves), leaning
// in round a heap; the eyes sit low between them as if peering over the pile,
// and the mouth is a small wanting grin. The heap is three translucent washes,
// so it needs no colour of its own — the body wears --hot, the colour of the
// gold it is clutching, where X wears the grey of nothing at all.
function drawHoarder() {
  const left = bar(41, 14, 32, 30, 13) + bar(32, 30, 29, 50, 13) + bar(29, 50, 32, 70, 13) + bar(32, 70, 41, 86, 13);
  const right = bar(59, 14, 68, 30, 13) + bar(68, 30, 71, 50, 13) + bar(71, 50, 68, 70, 13) + bar(68, 70, 59, 86, 13);
  return `<svg class="lt lt-hoarder" viewBox="0 0 100 100" width="96" height="96" aria-hidden="true">
    <g class="lt-flip">
      <path class="lt-body" d="${left}${right}"/>
      <!-- a shadow down the inside of each arm, a thin light along the outer bow -->
      <path d="${bar(35, 32, 33, 50, 4)}${bar(65, 32, 67, 50, 4)}" fill="rgba(0,0,0,0.16)"/>
      <path d="${bar(30, 30, 27, 50, 3)}${bar(70, 30, 73, 50, 3)}" fill="rgba(255,255,255,0.14)"/>
      <!-- the hoard: a clutched heap, low between the arms -->
      <circle cx="44" cy="77" r="7" fill="rgba(255,255,255,0.22)"/>
      <circle cx="56" cy="79" r="6" fill="rgba(0,0,0,0.22)"/>
      <circle cx="50" cy="70" r="6.5" fill="rgba(255,255,255,0.3)"/>
      ${face(50, 52, 7, 5, '<path d="M45 62 Q50 67 55 62" fill="none" stroke="rgba(30,10,22,0.55)" stroke-width="2.4" stroke-linecap="round"/>')}
    </g>
  </svg>`;
}

const DRAW = { Y: drawY, Ee: drawEe, X: drawX, Hoarder: drawHoarder };

export function isSpeaker(id) {
  return Object.prototype.hasOwnProperty.call(DRAW, id);
}

/** The speaker as an SVG string, ready to drop into the cutscene card. Falls
 *  back to Y rather than throwing, so a beat that names a speaker this build
 *  does not draw still shows a face. */
export function letterSVG(id) {
  return (DRAW[id] ?? drawY)();
}
