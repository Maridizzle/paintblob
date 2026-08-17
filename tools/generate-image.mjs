#!/usr/bin/env node
// Generates artwork with OpenAI's image API and runs it straight through the
// mapify pipeline.
//
//   OPENAI_API_KEY=sk-... node tools/generate-image.mjs "a koi pond at dusk"
//   node tools/generate-image.mjs "desert arch" --cells 70 --colours 16
//
// Note what this does *not* do: it never asks the model for region data. The
// model's only job is to paint something with big flat areas of colour; the
// cell map is derived from the pixels afterwards, deterministically. That means
// any generator works — Flux, Midjourney, a scan of your own gouache. Save a
// PNG and run `npm run mapify -- path/to/it.png`.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeBuffer } from './lib/decode.mjs';
import { buildPuzzle } from '../src/pipeline/build.js';
import { writePuzzle, reportPuzzle } from './mapify.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const RAW = path.join(ROOT, 'puzzles', '_raw');

// The style block matters more than the subject. Quantisation and connected
// components want broad plateaus of identical colour; gradients, grain and
// painterly texture shatter into hundreds of slivers that then have to be
// merged away, losing detail you paid for. Asking for flat vector art up front
// is far more effective than post-processing harder.
const STYLE = [
  'flat vector poster illustration',
  'bold simple shapes with clean silhouettes',
  'strictly flat areas of solid colour',
  'vivid, richly saturated colours — no washed-out, muted or pastel tones',
  'no gradients, no shading, no texture, no grain, no noise, no halftone',
  'varied palette of roughly 16 well separated, vibrant colours',
  'strong contrast between neighbouring shapes',
  // Zoom/pan is built into the app now, so shapes a bit finer than a
  // fingertip stay paintable — no need to blow them up into slivers.
  'large clear regions, with room for some smaller detail shapes',
  'centred composition, full bleed, no border, no frame',
  'no text, no letters, no numbers, no signature, no watermark',
].join(', ');

const DEFAULTS = { size: '1024x1024', model: 'gpt-image-1', quality: 'high' };

function parseArgs(argv) {
  const opts = { ...DEFAULTS, _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      opts._.push(a);
      continue;
    }
    const [flag, inline] = a.slice(2).split('=');
    const value = inline !== undefined ? inline : argv[++i];
    switch (flag) {
      case 'size': opts.size = value; break;
      case 'model': opts.model = value; break;
      case 'quality': opts.quality = value; break;
      case 'id': opts.id = value; break;
      case 'title': opts.title = value; break;
      case 'cells': opts.maxCells = Number(value); break;
      case 'colors': case 'colours': opts.maxColours = Number(value); break;
      case 'min-area': opts.minAreaFrac = Number(value); break;
      case 'raw': opts.raw = true; i--; break;   // send the prompt unadorned
      case 'keep': opts.keep = true; i--; break; // keep the source png
      default: throw new Error(`unknown flag --${flag}`);
    }
  }
  return opts;
}

async function generate(prompt, opts) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('set OPENAI_API_KEY (or use an existing PNG with tools/mapify.mjs)');

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: opts.model,
      prompt,
      size: opts.size,
      n: 1,
      ...(opts.model === 'gpt-image-1' ? { quality: opts.quality } : { response_format: 'b64_json' }),
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`image API ${res.status}: ${detail.slice(0, 600)}`);
  }

  const body = await res.json();
  const item = body.data?.[0];
  if (!item) throw new Error(`no image in response: ${JSON.stringify(body).slice(0, 400)}`);

  if (item.b64_json) return Buffer.from(item.b64_json, 'base64');
  if (item.url) return Buffer.from(await (await fetch(item.url)).arrayBuffer());
  throw new Error('response contained neither b64_json nor url');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const subject = opts._.join(' ').trim();
  if (!subject) {
    console.error('usage: node tools/generate-image.mjs "<subject>" [--id slug] [--title "Name"]');
    console.error('       [--cells 64] [--colours 14] [--size 1024x1024] [--raw]');
    process.exit(1);
  }

  const prompt = opts.raw ? subject : `${subject}. ${STYLE}.`;
  const id = opts.id
    ?? subject.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const title = opts.title ?? subject.replace(/\b\w/g, (c) => c.toUpperCase());

  console.log(`generating "${subject}" (${opts.model}, ${opts.size})…`);
  const buffer = await generate(prompt, opts);

  fs.mkdirSync(RAW, { recursive: true });
  const rawFile = path.join(RAW, `${id}.png`);
  fs.writeFileSync(rawFile, buffer);

  const image = decodeBuffer(buffer);
  const puzzle = buildPuzzle(image.data, image.width, image.height, opts);
  const out = writePuzzle(puzzle, { id, title });

  // Keep the source art around only on request; the puzzle file is the
  // artefact that matters and puzzles/_raw is gitignored anyway.
  if (opts.keep) console.log(`  source kept at ${path.relative(ROOT, rawFile)}`);
  else fs.rmSync(rawFile);

  reportPuzzle(puzzle, title, out);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
