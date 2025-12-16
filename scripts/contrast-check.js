const fs = require('fs');

function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(h => h + h).join('');
  const bigint = parseInt(hex, 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

function rgbaBlend(topRgb, topA, bottomRgb) {
  // Returns [r,g,b]
  const r = Math.round(topRgb[0] * topA + bottomRgb[0] * (1 - topA));
  const g = Math.round(topRgb[1] * topA + bottomRgb[1] * (1 - topA));
  const b = Math.round(topRgb[2] * topA + bottomRgb[2] * (1 - topA));
  return [r, g, b];
}

function sRGBtoLin(c) {
  c = c / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relLuminance(rgb) {
  const [r, g, b] = rgb.map(sRGBtoLin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(rgbA, rgbB) {
  const L1 = relLuminance(rgbA);
  const L2 = relLuminance(rgbB);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

function rgbToHex(rgb) {
  return '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function darkenHex(hex, amount) {
  const [r, g, b] = hexToRgb(hex);
  const dr = Math.max(0, Math.round(r * (1 - amount)));
  const dg = Math.max(0, Math.round(g * (1 - amount)));
  const db = Math.max(0, Math.round(b * (1 - amount)));
  return rgbToHex([dr, dg, db]);
}

// Read CSS
const css = fs.readFileSync('css/style.css', 'utf8');

// Find --accent and --card-alt
const accentMatch = css.match(/--accent:\s*(#[0-9A-Fa-f]{3,6})/);
const cardAltMatch = css.match(/--card-alt:\s*(#[0-9A-Fa-f]{3,6})/);
const trackMatch = css.match(/\.skill-bar\s*{[\s\S]*?background:\s*rgba\((\d+),\s*(\d+),\s*(\d+),\s*([0-9.]+)\)/);

if (!accentMatch || !cardAltMatch || !trackMatch) {
  console.error('Could not find required CSS values (--accent, --card-alt, skill-bar background).');
  process.exit(1);
}

let accent = accentMatch[1];
const cardAlt = cardAltMatch[1];
const topR = parseInt(trackMatch[1], 10);
const topG = parseInt(trackMatch[2], 10);
const topB = parseInt(trackMatch[3], 10);
let alpha = parseFloat(trackMatch[4]);

const whiteRgb = [255,255,255];
const cardAltRgb = hexToRgb(cardAlt);
let trackRgb = rgbaBlend(whiteRgb, alpha, cardAltRgb);

console.log('Current --accent', accent);
console.log('Card-alt', cardAlt);
console.log('Track alpha', alpha);
console.log('Computed track RGB', trackRgb.map(v=>v.toString()).join(','));
console.log('Contrast (accent vs track):', contrastRatio(hexToRgb(accent), trackRgb).toFixed(2));

// Try to find minimal darkening of accent that reaches 4.5
let bestAccent = null;
let bestContrast = 0;
for (let i=0;i<=20;i++){
  const amount = i * 0.03; // darken by 3% per step, up to 60%
  const candidate = darkenHex(accent, amount);
  const c = contrastRatio(hexToRgb(candidate), trackRgb);
  if (c >= 4.5) { bestAccent = candidate; bestContrast = c; break; }
  if (c > bestContrast) { bestContrast = c; }
}

if (bestAccent) {
  console.log('Found accessible accent:', bestAccent, 'contrast:', bestContrast.toFixed(2));
  // Apply change to CSS
  const newCss = css.replace(/(--accent:\s*)(#[0-9A-Fa-f]{3,6})/, `$1${bestAccent}`);
  fs.writeFileSync('css/style.css', newCss, 'utf8');
  console.log('Applied new --accent to css/style.css');
  process.exit(0);
}

// Otherwise, try reducing alpha (make track darker)
let bestAlpha = null;
bestContrast = 0;
for (let i=1;i<=15;i++){
  const a = alpha - i * 0.01; // reduce by 0.01 steps
  if (a < 0) break;
  const t = rgbaBlend(whiteRgb, a, cardAltRgb);
  const c = contrastRatio(hexToRgb(accent), t);
  if (c >= 4.5) { bestAlpha = a; bestContrast = c; break; }
  if (c > bestContrast) bestContrast = c;
}

if (bestAlpha !== null) {
  console.log('Found accessible alpha:', bestAlpha.toFixed(2), 'contrast:', bestContrast.toFixed(2));
  // Replace background alpha value in css
  const newCss = css.replace(/(\.skill-bar\s*{[\s\S]*?background:\s*rgba\(\d+,\s*\d+,\s*\d+,\s*)([0-9.]+)/, `$1${bestAlpha.toFixed(2)}`);
  fs.writeFileSync('css/style.css', newCss, 'utf8');
  console.log('Applied new alpha to css/style.css');
  process.exit(0);
}

console.log('No simple change found within limits; best contrast was', bestContrast.toFixed(2));
process.exit(1);
