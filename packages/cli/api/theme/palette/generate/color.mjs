// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @typedef {[number, number, number]} ColorTriple */

/** @param {number} channel @returns {number} */
function srgbToLinear(channel) {
  const value = channel / 255;
  return value <= 0.04045
    ? value / 12.92
    : Math.pow((value + 0.055) / 1.055, 2.4);
}

/** @param {number} channel @returns {number} */
function linearToSrgb(channel) {
  const value =
    channel <= 0.0031308
      ? channel * 12.92
      : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055;
  return Math.round(Math.min(255, Math.max(0, value * 255)));
}

/** @param {string} hex @returns {ColorTriple} */
function hexToRgb(hex) {
  const value = hex.replace('#', '');
  const full =
    value.length === 3
      ? value[0] + value[0] + value[1] + value[1] + value[2] + value[2]
      : value.slice(0, 6);
  const numeric = Number.parseInt(full, 16);
  return [(numeric >> 16) & 0xff, (numeric >> 8) & 0xff, numeric & 0xff];
}

/** @param {number} red @param {number} green @param {number} blue @returns {string} */
function rgbToHex(red, green, blue) {
  return (
    '#' +
    [red, green, blue]
      .map(channel =>
        Math.round(Math.max(0, Math.min(255, channel)))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

/** @param {number} red @param {number} green @param {number} blue @returns {ColorTriple} */
function linearRgbToOklab(red, green, blue) {
  const lRoot = Math.cbrt(
    0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue,
  );
  const mRoot = Math.cbrt(
    0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue,
  );
  const sRoot = Math.cbrt(
    0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue,
  );
  return [
    0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
    1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
    0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot,
  ];
}

/** @param {number} lightness @param {number} a @param {number} b @returns {ColorTriple} */
function oklabToLinearRgb(lightness, a, b) {
  const lRoot = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = lightness - 0.0894841775 * a - 1.291485548 * b;
  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** @param {unknown} input @returns {string} */
export function normalizeColor(input) {
  const value = String(input).trim();
  if (/^#?[0-9a-f]{3}$/i.test(value)) {
    const hex = value.replace('#', '').toLowerCase();
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
  }
  if (/^#?[0-9a-f]{6}$/i.test(value)) {
    return `#${value.replace('#', '').toLowerCase()}`;
  }
  throw new Error(`Invalid color: ${input}`);
}

/** @param {string} hex @returns {{L: number, C: number, H: number}} */
export function hexToOklch(hex) {
  const [red, green, blue] = hexToRgb(normalizeColor(hex));
  const [lightness, a, b] = linearRgbToOklab(
    srgbToLinear(red),
    srgbToLinear(green),
    srgbToLinear(blue),
  );
  let hue = (Math.atan2(b, a) * 180) / Math.PI;
  if (hue < 0) hue += 360;
  return {L: lightness, C: Math.sqrt(a * a + b * b), H: hue};
}

/** @param {number} lightness @param {number} chroma @param {number} hue @returns {boolean} */
function oklchInGamut(lightness, chroma, hue) {
  const radians = (hue * Math.PI) / 180;
  const [red, green, blue] = oklabToLinearRgb(
    lightness,
    chroma * Math.cos(radians),
    chroma * Math.sin(radians),
  );
  return (
    red >= -0.001 &&
    red <= 1.001 &&
    green >= -0.001 &&
    green <= 1.001 &&
    blue >= -0.001 &&
    blue <= 1.001
  );
}

/** @param {number} lightness @param {number} chroma @param {number} hue @returns {string} */
function oklchToHex(lightness, chroma, hue) {
  if (lightness <= 0) return '#000000';
  if (lightness >= 1) return '#ffffff';
  const radians = (hue * Math.PI) / 180;
  const [red, green, blue] = oklabToLinearRgb(
    lightness,
    chroma * Math.cos(radians),
    chroma * Math.sin(radians),
  );
  return rgbToHex(
    linearToSrgb(Math.max(0, red)),
    linearToSrgb(Math.max(0, green)),
    linearToSrgb(Math.max(0, blue)),
  );
}

/** @param {number} hue @param {number} lightness @returns {number} */
export function maxOklchChroma(hue, lightness) {
  let low = 0;
  let high = 0.4;
  for (let index = 0; index < 20; index++) {
    const middle = (low + high) / 2;
    if (oklchInGamut(lightness, middle, hue)) low = middle;
    else high = middle;
  }
  return low;
}

/** @param {number} lightness @param {number} chroma @param {number} hue @returns {string} */
export function oklchClampedHex(lightness, chroma, hue) {
  if (oklchInGamut(lightness, chroma, hue)) {
    return oklchToHex(lightness, chroma, hue);
  }
  return oklchToHex(lightness, maxOklchChroma(hue, lightness), hue);
}

/** @param {number} tone @returns {number} */
export function toneToOklabLightness(tone) {
  if (tone <= 0) return 0;
  if (tone >= 100) return 1;
  const relative = tone > 8 ? Math.pow((tone + 16) / 116, 3) : tone / 903.3;
  return Math.cbrt(relative);
}

/** @param {string} hex @returns {number} */
export function luminance(hex) {
  const [red, green, blue] = hexToRgb(hex).map(srgbToLinear);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** @param {string} hex @returns {ColorTriple} */
export function oklabCoordinates(hex) {
  const value = hexToOklch(hex);
  const radians = (value.H * Math.PI) / 180;
  return [value.L, value.C * Math.cos(radians), value.C * Math.sin(radians)];
}

/** @param {ColorTriple} coordinates @returns {string} */
export function oklabCoordinatesToHex(coordinates) {
  const [lightness, a, b] = coordinates;
  const chroma = Math.sqrt(a * a + b * b);
  const hue = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  return oklchClampedHex(Math.min(1, Math.max(0, lightness)), chroma, hue);
}
