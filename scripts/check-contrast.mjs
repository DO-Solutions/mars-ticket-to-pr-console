// Assert every text token clears WCAG AA against every surface it can appear on.
// Tokens are read from app/globals.css, so this checks what actually ships.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'app/globals.css'), 'utf8');

const token = (name) => {
  const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`token --color-${name} not found in globals.css`);
  return m[1];
};

const channel = (c) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex) => {
  const h = hex.slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};
const ratio = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

const SURFACES = ['ink', 'panel', 'raised', 'code'];
const TEXT = ['primary', 'secondary', 'muted', 'subtle', 'blue', 'green', 'red', 'amber', 'violet'];
const AA_NORMAL = 4.5;
const AA_NON_TEXT = 3.0;

let failed = 0;
console.log('Text tokens vs every surface (AA needs 4.5:1 at normal size)\n');
for (const t of TEXT) {
  const worst = SURFACES.map((s) => ({ s, r: ratio(token(t), token(s)) })).sort((a, b) => a.r - b.r)[0];
  const ok = worst.r >= AA_NORMAL;
  if (!ok) failed++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${t.padEnd(10)} worst ${worst.r.toFixed(2)}:1 (on ${worst.s})`);
}

// Borders that convey state must clear 3:1; decorative card edges need not.
console.log('\nStateful borders vs panel (need 3:1 per WCAG 1.4.11)\n');
for (const t of ['do-blue', 'blue']) {
  const r = ratio(token(t), token('panel'));
  const ok = r >= AA_NON_TEXT;
  if (!ok) failed++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${t.padEnd(10)} ${r.toFixed(2)}:1`);
}

if (failed) {
  console.error(`\n${failed} token(s) below threshold — fix app/globals.css.`);
  process.exit(1);
}
console.log('\nAll tokens pass.');
