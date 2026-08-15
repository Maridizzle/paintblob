// Locating a Chromium for the headless harnesses.
//
// Three environments have to work and none of them agree: this repo's dev
// container keeps browsers at a non-standard PLAYWRIGHT_BROWSERS_PATH, a CI
// runner has whatever `playwright-core install` put in the default cache (and
// usually a system Chrome besides), and a contributor's laptop could have
// either. So: ask Playwright first, then look where this container keeps them,
// then fall back to the machine's own browser.
//
// Never downloads anything as a side effect — a test harness that quietly
// pulls 150MB is a nasty surprise. CI installs the browser explicitly.

import fs from 'node:fs';
import path from 'node:path';

export function findChromium(chromium) {
  const candidates = [];
  const note = [];

  const add = (label, value) => {
    if (!value) return;
    candidates.push(value);
    note.push(`${label}: ${value}`);
  };

  add('PLAYWRIGHT_CHROMIUM', process.env.PLAYWRIGHT_CHROMIUM);

  // Playwright's own answer. Correct whenever browsers were installed the
  // normal way, and wrong (a path that does not exist) when the cache holds a
  // different revision than this version wants — hence the existence check.
  if (chromium) {
    try {
      add("playwright's own cache", chromium.executablePath());
    } catch {
      // Throws when no browser is installed at all; the fallbacks cover it.
    }
  }

  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (fs.existsSync(base)) {
    for (const dir of fs.readdirSync(base).filter((d) => d.startsWith('chromium')).sort().reverse()) {
      add('browsers path', path.join(base, dir, 'chrome-linux', 'chrome'));
      add('browsers path', path.join(base, dir, 'chrome-linux', 'headless_shell'));
    }
  }

  add('CHROME_PATH', process.env.CHROME_PATH);
  add('CHROME_BIN', process.env.CHROME_BIN);
  for (const p of [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ]) add('system browser', p);

  const found = candidates.find((p) => fs.existsSync(p));
  if (found) return found;

  throw new Error(
    'no chromium found. Looked at:\n  '
    + note.join('\n  ')
    + '\n\nInstall one with `npx playwright-core install chromium`, '
    + 'or point PLAYWRIGHT_CHROMIUM at an existing binary.',
  );
}
