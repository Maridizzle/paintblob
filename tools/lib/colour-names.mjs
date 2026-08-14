// Human-readable names for derived palette colours, so the paint tubs read as
// "Deep Teal" rather than "#1b5f63". Purely cosmetic, entirely deterministic.

const HUES = [
  [345, 'Red'], [15, 'Vermilion'], [32, 'Orange'], [45, 'Amber'],
  [56, 'Gold'], [68, 'Chartreuse'], [90, 'Green'], [140, 'Emerald'],
  [168, 'Teal'], [188, 'Cyan'], [205, 'Azure'], [225, 'Blue'],
  [250, 'Indigo'], [275, 'Violet'], [292, 'Purple'], [315, 'Magenta'],
  [332, 'Rose'],
];

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];

  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return [h, s, l];
}

function baseHue(h) {
  let best = HUES[0][1];
  let bestD = Infinity;
  for (const [deg, name] of HUES) {
    const d = Math.min(Math.abs(h - deg), 360 - Math.abs(h - deg));
    if (d < bestD) {
      bestD = d;
      best = name;
    }
  }
  return best;
}

export function nameColour([r, g, b]) {
  const [h, s, l] = rgbToHsl(r, g, b);

  if (s < 0.09) {
    if (l < 0.06) return 'Ink';
    if (l < 0.2) return 'Charcoal';
    if (l < 0.38) return 'Slate';
    if (l < 0.58) return 'Grey';
    if (l < 0.76) return 'Ash';
    if (l < 0.94) return 'Pearl';
    return 'Chalk';
  }

  const hue = baseHue(h);

  // Warm dark low-saturation colours read as browns, not "dark orange".
  if (h > 12 && h < 52 && l < 0.42 && s < 0.62) return l < 0.24 ? 'Espresso' : 'Umber';
  if (h > 12 && h < 52 && l > 0.62 && s < 0.5) return 'Sand';

  let prefix = '';
  if (l < 0.22) prefix = 'Midnight';
  else if (l < 0.36) prefix = 'Deep';
  else if (l < 0.48) prefix = s > 0.7 ? 'Rich' : 'Muted';
  else if (l < 0.66) prefix = s > 0.7 ? 'Bright' : '';
  else if (l < 0.82) prefix = s > 0.5 ? 'Light' : 'Pale';
  else prefix = 'Powder';

  return prefix ? `${prefix} ${hue}` : hue;
}

export function toHex([r, g, b]) {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Ensures every tub label in one puzzle is distinct. */
export function uniquifyNames(names) {
  const seen = new Map();
  return names.map((name) => {
    const n = (seen.get(name) || 0) + 1;
    seen.set(name, n);
    return n === 1 ? name : `${name} ${'II III IV V VI VII VIII IX X'.split(' ')[n - 2] || n}`;
  });
}
