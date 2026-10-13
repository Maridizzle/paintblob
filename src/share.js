// Share cards: the picture a player posts. Two kinds, one renderer:
//   - an AWARD card for the big achievements ("Shareable award!")
//   - a PICTURE card for a finished painting
//
// Everything here is plain canvas drawing plus a few rules, with no game state
// and no DOM beyond an injectable canvas factory, so the rules run in node tests.
//
// The rules that matter:
//   - A picture the player added themselves carries a baked-in "Painted my OWN
//     picture" banner along the bottom. paintblob cannot see what players import,
//     so the card says whose picture it is. It is part of the image, so it cannot
//     be cropped off without cropping the picture itself.
//   - An imported picture's title is never printed (it is often a personal file
//     name), only the banner.
//   - A picture from an 18+ pack never goes on a card at all.
//   - The link is tagged (?ref=award / ?ref=picture) so the site's own traffic
//     stats can tell which button brought a visitor.

import { APP_ORIGIN } from './cloud.js';

export const OWN_LABEL = 'Painted my OWN picture';
export const AWARD_RIBBON = 'Shareable award!';
export const PICTURE_RIBBON = 'I painted this!';
export const CARD_W = 1080;
export const CARD_H = 1350;

/** The tagged link printed on a card and passed to the share sheet. */
export function shareUrl(kind) {
  return `${APP_ORIGIN}/?ref=${kind === 'award' ? 'award' : 'picture'}`;
}

/** The link as people read it on a card: no scheme, no query. */
export function shareUrlLabel() {
  return APP_ORIGIN.replace(/^https?:\/\//, '');
}

/** A picture the player added themselves (not bundled, not from a pack). */
export function needsOwnLabel(entry) {
  return !!entry?.imported && !entry?.pack;
}

/** 18+ pack pictures never appear on a card. */
export function canShowPicture(entry) {
  return !entry?.adult;
}

/** Word-wrap `text` to `maxWidth` using the caller's measuring function. */
export function wrapLines(measure, text, maxWidth, maxLines = 3) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next) > maxWidth) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].replace(/[\s.,;:!?-]+$/, '')}…`;
    return kept;
  }
  return lines;
}

/** Largest w x h that fits inside the box and keeps the picture's shape. */
export function fitInside(srcW, srcH, boxW, boxH) {
  if (!(srcW > 0 && srcH > 0)) return { w: boxW, h: boxH };
  const k = Math.min(boxW / srcW, boxH / srcH);
  return { w: Math.round(srcW * k), h: Math.round(srcH * k) };
}

const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",system-ui,sans-serif';
const TEXT_FONT = 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function pill(ctx, text, cx, y, { font, fg, bg, padX = 36, h = 76 }) {
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + padX * 2;
  ctx.fillStyle = bg;
  roundRect(ctx, cx - w / 2, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, y + h / 2 + 2);
}

/**
 * Draw a share card.
 * @param {object} o
 * @param {'award'|'picture'} o.kind
 * @param {string} [o.icon]      award emoji
 * @param {string} [o.title]     award name, or the picture's title (never an imported one)
 * @param {string} [o.subtitle]  how the award was earned
 * @param {number} [o.points]    points the award paid
 * @param {string} [o.dateText]
 * @param {CanvasImageSource & {width:number,height:number}|null} [o.picture]
 * @param {boolean} [o.own]      the player's own picture: bake in the banner
 * @param {(w:number,h:number)=>any} [o.makeCanvas]  injectable for tests
 * @returns the canvas
 */
export function renderShareCard(o) {
  const make = o.makeCanvas ?? ((w, h) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  });
  const canvas = make(CARD_W, CARD_H);
  const ctx = canvas.getContext('2d');
  const W = CARD_W, H = CARD_H, cx = W / 2;
  const award = o.kind === 'award';

  // Background and frame.
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, award ? '#2a1450' : '#10243f');
  bg.addColorStop(1, award ? '#0e0a1f' : '#08101c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = award ? '#f1c95a' : '#6fd0ff';
  ctx.lineWidth = 6;
  roundRect(ctx, 28, 28, W - 56, H - 56, 36);
  ctx.stroke();

  // The ribbon along the top.
  pill(ctx, award ? AWARD_RIBBON : PICTURE_RIBBON, cx, 78, {
    font: `800 40px ${TEXT_FONT}`, fg: '#1a1033', bg: award ? '#f1c95a' : '#6fd0ff',
  });

  let y = 190;
  if (award) {
    ctx.font = `200px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(o.icon ?? '🏆', cx, y + 190);
    y += 250;
  }

  // Title (and for an award, how it was earned).
  if (o.title) {
    ctx.font = `800 ${award ? 82 : 64}px ${TEXT_FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const lines = wrapLines((t) => ctx.measureText(t).width, o.title, W - 160, 2);
    for (const line of lines) { ctx.fillText(line, cx, y + 70); y += award ? 92 : 76; }
    y += 20;
  }
  if (award && o.subtitle) {
    ctx.font = `500 38px ${TEXT_FONT}`;
    ctx.fillStyle = '#cfc6e8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    for (const line of wrapLines((t) => ctx.measureText(t).width, o.subtitle, W - 200, 3)) {
      ctx.fillText(line, cx, y + 44); y += 52;
    }
    y += 16;
  }
  if (award && o.points) {
    pill(ctx, `+${o.points.toLocaleString()} points`, cx, y, {
      font: `800 40px ${TEXT_FONT}`, fg: '#1a1033', bg: '#ffffff', h: 68, padX: 32,
    });
    y += 90;
  }

  // The picture they painted, framed and kept in proportion.
  const bannerH = o.own ? 84 : 0;
  const footerH = 96;
  const bottom = H - 40 - footerH - bannerH;
  if (o.picture) {
    const boxW = W - 200, boxH = Math.max(120, bottom - y - 20);
    const { w, h } = fitInside(o.picture.width, o.picture.height, boxW, boxH);
    const px = Math.round(cx - w / 2), py = Math.round(y + (boxH - h) / 2);
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, px - 14, py - 14, w + 28, h + 28, 18);
    ctx.fill();
    ctx.drawImage(o.picture, px, py, w, h);
    y = py + h + 14;
  }

  // Date and link along the foot.
  const footY = H - 40 - bannerH;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  if (o.dateText) {
    ctx.font = `500 32px ${TEXT_FONT}`;
    ctx.fillStyle = '#a99fcb';
    ctx.fillText(o.dateText, cx, footY - 52);
  }
  ctx.font = `800 40px ${TEXT_FONT}`;
  ctx.fillStyle = award ? '#f1c95a' : '#6fd0ff';
  ctx.fillText(shareUrlLabel(), cx, footY - 4);

  // The banner, last, so nothing can sit on top of it.
  if (o.own) {
    ctx.save();
    roundRect(ctx, 28, 28, W - 56, H - 56, 36);   // keep the banner inside the rounded frame
    ctx.clip();
    ctx.fillStyle = '#ffd54a';
    ctx.fillRect(28, H - 28 - bannerH, W - 56, bannerH);
    ctx.restore();
    ctx.fillStyle = '#1a1033';
    ctx.font = `900 46px ${TEXT_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(OWN_LABEL, cx, H - 28 - bannerH / 2 + 2);
  }
  return canvas;
}

/**
 * Hand a card to the share sheet, or save it where the player can post it.
 * Feature-detected the way MDN describes: canShare({ files }) first, share()
 * straight from the player's tap, AbortError meaning they cancelled.
 * @returns {Promise<'shared'|'saved'|'cancelled'|'error'>}
 */
export async function shareCanvas(canvas, { title, text, url, filename, save, nav = globalThis.navigator }) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (blob && typeof File === 'function' && nav?.canShare && nav?.share) {
    const file = new File([blob], filename, { type: 'image/png' });
    if (nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file], title, text, url });
        return 'shared';
      } catch (err) {
        if (err?.name === 'AbortError') return 'cancelled';
        // Blocked or unsupported after all: fall through to saving the image.
      }
    }
  }
  try {
    const res = await save(canvas.toDataURL('image/png'), filename);
    return res?.error ? 'error' : 'saved';
  } catch {
    return 'error';
  }
}
