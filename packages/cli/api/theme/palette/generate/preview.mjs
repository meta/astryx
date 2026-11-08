// Copyright (c) Meta Platforms, Inc. and affiliates.
export const PALETTE_PREVIEW_VERSION = 'palette-preview-v1';

/** @typedef {'light' | 'dark'} PaletteMode */

/** @param {unknown} value */
function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/**
 * @param {string} familyId
 * @param {string} familyName
 * @param {'light' | 'dark'} mode
 * @param {Record<string, string>} colors
 */
function renderRamp(familyId, familyName, mode, colors) {
  const orderedColors = Object.entries(colors).sort(
    ([left], [right]) => Number(left) - Number(right),
  );
  const swatches = orderedColors
    .map(
      ([stop, color]) => `
        <li class="swatch" title="${escapeHtml(`${familyId}.${mode}[${stop}] — ${color}`)}">
          <span class="color" style="--swatch:${escapeHtml(color)}"></span>
          <span class="meta"><strong>${escapeHtml(stop)}</strong><code>${escapeHtml(color)}</code></span>
        </li>`,
    )
    .join('');
  return `
      <section class="family">
        <h3>${escapeHtml(familyName)}</h3>
        <ol class="ramp" style="--stop-count:${orderedColors.length}">${swatches}
        </ol>
      </section>`;
}

/**
 * @param {import('../../theme.type.mjs').TonalPaletteCandidate} candidate
 * @param {'light' | 'dark'} mode
 */
function renderMode(candidate, mode) {
  const families = Object.entries(candidate.palette)
    .map(([familyId, family]) => {
      const colors = family[mode];
      return colors ? renderRamp(familyId, family.name, mode, colors) : '';
    })
    .join('');
  if (!families) return '';
  return `
    <article class="mode ${mode}">
      <header class="mode-title">
        <h2>${mode === 'light' ? 'Light mode' : 'Dark mode'}</h2>
      </header>${families}
    </article>`;
}

/** @param {import('../../theme.type.mjs').TonalPaletteCandidate} candidate */
function renderThemeValues(candidate) {
  return `
      <section class="theme-values">
        <div>
          <h2>Exact theme values</h2>
          <p>Always available. Default families repeat these values at stops 0 and 100; custom layouts may omit them.</p>
        </div>
        <ol>
          <li><span class="color" style="--swatch:${escapeHtml(candidate.black)}"></span><span class="meta"><strong>Black</strong><code>${escapeHtml(candidate.black)}</code></span></li>
          <li><span class="color" style="--swatch:${escapeHtml(candidate.white)}"></span><span class="meta"><strong>White</strong><code>${escapeHtml(candidate.white)}</code></span></li>
        </ol>
      </section>`;
}

/**
 * Render a self-contained, deterministic review artifact.
 *
 * @param {import('../../theme.type.mjs').TonalPaletteCandidate} candidate
 * @returns {string}
 */
export function renderPalettePreview(candidate) {
  /** @type {PaletteMode[]} */
  const paletteModes = ['light', 'dark'];
  const modes = paletteModes
    .map(mode => renderMode(candidate, mode))
    .filter(Boolean)
    .join('');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="generator" content="${PALETTE_PREVIEW_VERSION}" />
    <title>Astryx palette candidate</title>
    <style>
      :root { color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #111; }
      * { box-sizing: border-box; }
      body { margin: 0; background: #111; color: #f5f5f5; }
      main { max-width: 1600px; margin: 0 auto; padding: 40px; }
      h1, h2, h3, p { margin: 0; }
      h1 { font-size: 30px; letter-spacing: -0.03em; }
      .intro { margin: 8px 0 28px; color: #aaa; font-size: 15px; }
      .theme-values { display: flex; align-items: center; justify-content: space-between; gap: 32px; margin-bottom: 24px; padding: 18px 20px; border-radius: 14px; background: #1b1b1b; }
      .theme-values h2 { font-size: 18px; }
      .theme-values p { margin-top: 4px; color: #999; font-size: 13px; }
      .theme-values ol { display: grid; grid-template-columns: repeat(2, 96px); gap: 8px; margin: 0; padding: 0; list-style: none; }
      .theme-values .color { height: 44px; }
      .modes { display: grid; grid-template-columns: 1fr; gap: 24px; }
      .mode { min-width: 0; border-radius: 20px; padding: 24px; overflow-x: auto; }
      .mode.light { background: #f5f5f5; color: #171717; }
      .mode.dark { background: #232323; color: #f5f5f5; border: 1px solid #393939; }
      .mode-title { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 24px; }
      .family + .family { margin-top: 28px; }
      .family h3 { margin-bottom: 10px; font-size: 18px; }
      .ramp { display: grid; grid-template-columns: repeat(var(--stop-count), minmax(52px, 1fr)); gap: 8px; margin: 0; padding: 0; list-style: none; }
      .swatch { min-width: 0; }
      .color { display: block; height: 58px; border: 1px solid rgb(127 127 127 / 20%); border-radius: 10px; background: var(--swatch); }
      .meta { display: block; margin-top: 5px; font-size: 11px; line-height: 1.35; }
      .meta strong, .meta code { display: block; overflow: hidden; text-overflow: ellipsis; }
      .meta code { opacity: 0.65; font-family: ui-monospace, monospace; }
      @media (max-width: 700px) { main { padding: 20px; } }
    </style>
  </head>
  <body data-preview-version="${PALETTE_PREVIEW_VERSION}">
    <main>
      <h1>Astryx tonal palette</h1>
      <p class="intro">Generated by <code>${escapeHtml(candidate.recipe)}</code></p>
      ${renderThemeValues(candidate)}
      <div class="modes">${modes}
      </div>
    </main>
  </body>
</html>
`;
}
