// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Which font a picture draws the theme's headings and body text in.
 * @input A DevTools protocol `send` for the page a picture was taken of.
 * @output `probeFonts(send)`: for the theme's heading and body font stacks
 *   (its --font-family-* tokens), the stack and the font the browser draws
 *   it in; `FONT_PROBE_PREFIX`: the line prefix a picture script prints the
 *   result after.
 * @position Run by the picture scripts (picture-chrome.mjs,
 *   picture-playwright.mjs) after the picture is taken; read by
 *   `screenshot` in api/theme-edit/_preview.mjs, which names a stack this
 *   machine has none of the families for.
 */

/** The line prefix a picture script prints the probe's result after. */
export const FONT_PROBE_PREFIX = 'astryx-fonts:';

/** The roles probed, by the token that holds each one's stack. */
const ROLES = /** @type {const} */ ([
  ['heading', '--font-family-heading'],
  ['body', '--font-family-body'],
]);

/**
 * Text in each role's stack, added inside the theme's root after the
 * picture is taken, and each stack as the root resolves it.
 */
const SETUP = `document.fonts.ready.then(() => {
  const root = document.querySelector('[data-astryx-theme]') ?? document.body;
  const out = {};
  for (const [role, token] of ${JSON.stringify(ROLES)}) {
    const span = document.createElement('span');
    span.id = 'astryx-font-probe-' + role;
    span.textContent = 'Hamburgefonstiv 0123';
    span.style.fontFamily = 'var(' + token + ')';
    root.appendChild(span);
    out[role] = getComputedStyle(span).fontFamily;
  }
  return JSON.stringify(out);
})`;

/**
 * The font each role's text is drawn in, as the browser's own font list
 * names it (`DejaVu Sans`), with its stack.
 * @param {(method: string, params?: Record<string, unknown>) => Promise<any>} send
 * @returns {Promise<Record<string, {stack: string[], shown: string | null}>>}
 */
export async function probeFonts(send) {
  const set = await send('Runtime.evaluate', {
    expression: SETUP,
    awaitPromise: true,
    returnByValue: true,
  });
  /** @type {Record<string, string>} */
  const stacks = JSON.parse(set?.result?.value ?? '{}');
  await send('DOM.enable');
  await send('CSS.enable');
  const {root} = await send('DOM.getDocument', {depth: 0});
  /** @type {Record<string, {stack: string[], shown: string | null}>} */
  const out = {};
  for (const [role] of ROLES) {
    const stack = String(stacks[role] ?? '')
      .split(',')
      .map(f => f.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
    const {nodeId} = await send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector: `#astryx-font-probe-${role}`,
    });
    const fonts = nodeId
      ? (await send('CSS.getPlatformFontsForNode', {nodeId})).fonts
      : [];
    out[role] = {stack, shown: fonts?.[0]?.familyName ?? null};
  }
  return out;
}
