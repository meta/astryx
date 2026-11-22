// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A typed value no page could show (a line height under 0.8, a padding
 * wider than any screen), and the property a question asks the value of
 * ("how much padding …").
 * @position api/theme-edit — a leaf read by _how-question.mjs and _how.mjs
 */

/**
 * A typed value no page could show, for the properties whose range is
 * plain: a line height that draws lines over each other (under 0.8) or
 * far apart (over 4), a padding, margin or gap wider than any screen
 * (over 512px), a font size under 6px or over 256px, a border over 64px.
 * The reason, or null for a value in range (and for any other property).
 * @param {{thing: string, value?: unknown}} st
 * @returns {string | null}
 */
export function outOfBounds(st) {
  const v = String(st.value ?? '').trim();
  const m = /^(-?\d*\.?\d+)(px|rem|em|%)?$/.exec(v);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2] ?? '';
  const px =
    unit === 'rem' || unit === 'em' ? n * 16 : unit === 'px' ? n : null;
  const thing = st.thing;
  if (/^line-height$|^--text-[a-z0-9-]+-leading$/.test(thing)) {
    const ratio = unit === '' ? n : unit === '%' ? n / 100 : null;
    if (ratio != null && (ratio < 0.5 || ratio > 4))
      return `a line height of ${v} ${ratio < 0.5 ? 'draws each line over the one before it' : 'leaves lines far apart'}; a line height reads between 0.5 and 4`;
    return null;
  }
  if (
    /^(?:padding|margin|gap|row-gap|column-gap)(?:-[a-z-]+)?$|^--spacing-/.test(
      thing,
    )
  ) {
    const each = v.split(/\s+/);
    if (px != null && Math.abs(px) > 512)
      return `${thing} ${v} is wider than any screen; a ${thing.replace(/^--/, '')} reads up to 512px`;
    void each;
    return null;
  }
  if (
    /^font-size$|^--text-[a-z0-9-]+-size$/.test(thing) &&
    px != null &&
    (px < 6 || px > 256)
  )
    return `a font size of ${v} ${px < 6 ? 'cannot be read' : 'is wider than the screen for a word'}; a font size reads between 6px and 256px`;
  if (
    /^border(?:-[a-z]+)?-width$|^--border-width$/.test(thing) &&
    px != null &&
    px > 64
  )
    return `a border of ${v} covers the part; a border reads up to 64px`;
  return null;
}

/**
 * The property a question asks the value of ("how much padding …", "how
 * rounded are …", "what color is …"), or null when it is not one.
 * @param {string} q
 * @returns {string | null}
 */
export function valueAsked(q) {
  // Only the question part ("how rounded are cards? make them 12px").
  const t = q.toLowerCase().trim().split('?')[0];
  if (
    !/^(?:how (?:much|many|big|round(?:ed)?|thick|wide|tall|bold|dark|light|transparent|opaque|dense|roomy|spacious|compact|tight|airy|crowded|cramped|strong|faint|soft|blurry)|what(?:(?:'s| is| are)(?: the| my)?(?: [a-z-]+){0,2}?|(?: the)?) (?:colou?r|size|padding|gap|spacing|density|radius|corner radius|font|weight|font size|shadow|border|opacity|font family|typeface|background|fill|focus ring|focus outline|ring|outline|height|width)s?|which (?:colou?r|font))\b/.test(
      t,
    )
  )
    return null;
  // "what is the focus ring of inputs": the ring the part draws when
  // focused (a box-shadow or an outline, as Core draws it there).
  if (/\b(?:focus (?:ring|outline)|rings?|outlines?)\b/.test(t))
    return 'focus-ring';
  if (/\b(round|rounded|radius|corners?)\b/.test(t)) return 'border-radius';
  if (/\b(opacity|transparent|opaque)\b/.test(t)) return 'opacity';
  if (
    /\b(font family|typeface)\b|\bwhat(?:'s| is)?(?: the| my)?(?: [a-z-]+)? font\b(?! size| weight)|\bwhich font\b/.test(
      t,
    )
  )
    return 'font-family';
  if (/\bgap\b/.test(t)) return 'gap';
  // "how tall are the buttons", "what is the height of buttons".
  if (/\b(height|tall)\b/.test(t)) return 'height';
  if (
    /\b(padding|spacing|space|room|density|dense|roomy|spacious|compact|tight|airy|crowded|cramped)\b/.test(
      t,
    )
  )
    return 'padding';
  if (/\bshadows?\b/.test(t)) return 'box-shadow';
  if (/\b(background|fill|bg)\b/.test(t)) return 'background-color';
  // (How strong or faint a border is, its color; how thick, its width.)
  if (/\bborders?\b/.test(t))
    return /\b(colou?r|strong|faint|dark|light|visible)\b/.test(t)
      ? 'border-color'
      : 'border-width';
  if (/\bfont size|text size|how big\b/.test(t)) return 'font-size';
  if (/\b(bold|weight)\b/.test(t)) return 'font-weight';
  // "what color is the primary button": the color; which one (its fill or
  // its text) the part decides (draftAnswer reads the part facts).
  if (/\b(colou?r|dark|light)\b/.test(t)) return 'color';
  // "how thick are dividers": a line's thickness is its border width.
  if (/\bhow (?:thick|thin)\b|\bthickness\b/.test(t)) return 'border-width';
  return null;
}
