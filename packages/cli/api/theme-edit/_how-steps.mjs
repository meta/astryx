// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The value a step moves to: a color made lighter or darker (keeping
 * a see-through color see-through), a color given a new alpha, a length
 * scaled, and a shadow's blur or alpha scaled.
 * @position api/theme-edit — a leaf read by _how-question.mjs and _missed.mjs
 */

import {COLOR_IN_VALUE, alphaOf, hex, parseColor} from './_color.mjs';

/**
 * Make a color lighter or darker by mixing in white or black.
 * @param {string} color @param {number} amount -1 (darker) to 1 (lighter)
 */
export function shift(color, amount) {
  const rgb = parseColor(color);
  if (!rgb) return null;
  const to = amount > 0 ? 255 : 0;
  const a = Math.abs(amount);
  return hex(rgb.map(c => c + (to - c) * a));
}

/**
 * A box-shadow with each layer's blur scaled (the third length); offsets,
 * spread, inset and color stay. Null when no layer has a blur to scale.
 * @param {string} shadow @param {number} f
 */
export function blurScaled(shadow, f) {
  const layers = String(shadow).split(/,(?![^(]*\))/);
  let changed = false;
  const out = layers.map(layer => {
    // The lengths outside any function (a color's numbers are not
    // lengths): the third is the blur.
    let depth = 0;
    let count = 0;
    let res = '';
    const re = /[()]|-?\d*\.?\d+(?:px|rem|em)?(?![\w.%])/g;
    let last = 0;
    for (let m = re.exec(layer); m; m = re.exec(layer)) {
      const tok = m[0];
      if (tok === '(') depth++;
      else if (tok === ')') depth--;
      else if (
        (depth === 0 && /^-?\d/.test(tok)) ||
        (depth === 0 && /^-?\./.test(tok))
      ) {
        const before = layer[m.index - 1];
        if (m.index === 0 || /\s/.test(before ?? ' ')) {
          count++;
          if (count === 3) {
            const n = /^(-?\d*\.?\d+)(px|rem|em)?$/.exec(tok);
            if (n) {
              const unit = n[2] ?? 'px';
              const v = Number(n[1]) * f;
              res +=
                layer.slice(last, m.index) +
                `${Number(v.toFixed(unit === 'px' ? 2 : 3))}${unit}`;
              last = m.index + tok.length;
              changed = true;
            }
          }
        }
      }
    }
    return res + layer.slice(last);
  });
  return changed ? out.join(',') : null;
}

/**
 * {@link shift} that keeps a see-through color see-through: its alpha
 * stays, only its hue moves. A see-through ink paints over the page, so
 * whether more of it is lighter is read against that page's color.
 * @param {string} color @param {number} amount
 * @param {string | null} [page] the page color it paints over (white when
 *   not given)
 */
export function shiftKeepAlpha(color, amount, page = null) {
  // rgb()/rgba()/hsl()/hwb()/lab()/oklch() with an alpha: the same color as
  // #rrggbbaa, so its alpha stays too.
  const fn =
    /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\((.*)\)$/i.exec(
      String(color).trim(),
    )?.[1] ?? null;
  if (fn) {
    const alphaText =
      /\/\s*([\d.]+%?)\s*$/.exec(fn)?.[1] ??
      (/^\s*rgba|^\s*hsla/i.test(String(color).trim())
        ? /,\s*([\d.]+%?)\s*$/.exec(fn)?.[1]
        : undefined);
    const rgb = parseColor(color);
    if (alphaText && rgb) {
      const a = alphaText.endsWith('%')
        ? Number.parseFloat(alphaText) / 100
        : Number(alphaText);
      if (a >= 0 && a < 1) {
        const byte = Math.max(0, Math.min(255, Math.round(a * 255)));
        return shiftKeepAlpha(
          `${hex(rgb.slice(0, 3))}${byte.toString(16).padStart(2, '0')}`,
          amount,
          page,
        );
      }
    }
  }
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})$/i.exec(String(color).trim());
  if (!m) return shift(color, amount);
  // A see-through ink: lighter means less of an ink darker than the page
  // (fainter) or more of one lighter than it (stronger); its hue stays.
  const rgb = parseColor(`#${m[1]}`) ?? [0, 0, 0];
  const under = (page ? parseColor(page) : null) ?? [255, 255, 255];
  const sum = (/** @type {number[]} */ v) => v[0] + v[1] + v[2];
  const darkInk =
    sum(rgb) < sum(under) || (sum(rgb) === sum(under) && sum(rgb) < 382);
  const k = Math.min(0.9, Math.abs(amount) * 2.5);
  const f = amount > 0 === darkInk ? 1 - k : 1 + k;
  const a = Math.max(1, Math.min(255, Math.round(parseInt(m[2], 16) * f)));
  return `#${m[1]}${a.toString(16).padStart(2, '0')}`;
}

/** Scale a CSS length. @param {string} v @param {number} f */
export function scaled(v, f) {
  const m = /^(\d*\.?\d+)(px|rem|em)$/.exec(String(v ?? '').trim());
  if (!m) return null;
  const n = Number(m[1]) * f;
  // A fraction of a pixel is a real length (hi-dpi screens draw it): kept
  // to 0.01px, never rounded away to the same value or to 0.
  return `${m[2] === 'px' ? Number(n.toFixed(2)) : Number(n.toFixed(3))}${m[2]}`;
}

/**
 * A color written with a new alpha, in the form it was written: a hex color
 * as 8-digit hex, a `/ alpha` or rgba()/hsla() alpha replaced, an opaque
 * color function given one.
 * @param {string} color
 * @param {number} a 0 to 1
 */
export function withAlpha(color, a) {
  const c = color.trim();
  const round = (/** @type {number} */ n) => Math.round(n * 1000) / 1000;
  if (c.startsWith('#')) {
    const rgb = parseColor(c);
    if (!rgb) return color;
    return `${hex(rgb.slice(0, 3))}${Math.round(a * 255)
      .toString(16)
      .padStart(2, '0')}`;
  }
  const slash = /\/\s*[\d.]+(%?)\s*\)$/.exec(c);
  if (slash)
    return c.replace(
      /\/\s*[\d.]+%?\s*\)$/,
      slash[1] ? `/ ${Math.round(a * 1000) / 10}%)` : `/ ${round(a)})`,
    );
  const legacy =
    /^(rgba?|hsla?)\(([^,()]*),([^,()]*),([^,()]*)(?:,[^,()]*)?\)$/i.exec(c);
  if (legacy)
    return `${legacy[1].replace(/a$/i, '')}a(${legacy[2].trim()}, ${legacy[3].trim()}, ${legacy[4].trim()}, ${round(a)})`;
  return c.replace(/\)$/, ` / ${round(a)})`);
}

/**
 * A shadow with the alpha of each of its colors scaled (clamped to 0–1),
 * layers, offsets and blur kept; with a mode, only that half of each
 * light-dark() color.
 * @param {string} value
 * @param {number} k
 * @param {'light' | 'dark' | null} [mode]
 */
export function shadowAlphaScaled(value, k, mode = null) {
  /** @param {string} part */
  const scale = part =>
    part
      // A color mixed with transparent (a ring at 30%) scales its share.
      .replace(
        /color-mix\(\s*in\s+srgb\s*,\s*((?:[^(),]|\([^()]*\))+?)\s+(\d*\.?\d+)%\s*,\s*transparent\s*\)/gi,
        (_m, color, share) =>
          `color-mix(in srgb, ${color.trim()} ${Math.round(Math.max(0, Math.min(100, Number(share) * k)) * 10) / 10}%, transparent)`,
      )
      .replace(COLOR_IN_VALUE, c =>
        /^color-mix\(/i.test(c)
          ? c
          : withAlpha(c, Math.max(0, Math.min(1, alphaOf(c) * k))),
      );
  if (!mode) return scale(value);
  // A named mode: that half of each light-dark() color; a color written as
  // one value becomes a light-dark() pair with only that mode's half scaled.
  const PAIR =
    /light-dark\(((?:[^(),]|\([^()]*\))*),\s*((?:[^(),]|\([^()]*\))*)\)/g;
  return value
    .split(/(light-dark\((?:[^(),]|\([^()]*\))*,\s*(?:[^(),]|\([^()]*\))*\))/g)
    .map(piece =>
      /^light-dark\(/.test(piece)
        ? piece.replace(
            PAIR,
            (_m, a, b) =>
              `light-dark(${mode === 'light' ? scale(a) : a}, ${mode === 'dark' ? scale(b) : b})`,
          )
        : piece.replace(COLOR_IN_VALUE, c => {
            const scaled = scale(c);
            if (scaled === c) return c;
            return mode === 'dark'
              ? `light-dark(${c}, ${scaled})`
              : `light-dark(${scaled}, ${c})`;
          }),
    )
    .join('');
}
