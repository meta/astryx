// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The visual report a pull-request reviewer actually looks at.
 *
 * @input  a verdict and the three image sets it refers to
 * @output one self-contained index.html
 *
 * The report exists to make one judgement fast: for each changed shot, is the
 * AFTER the correct picture? So every change shows before, after and diff
 * together, defaults to a wipe between before and after (the view that makes a
 * 3px shift obvious), and carries the exact command that records "yes, the
 * after is right". No build step and no CDN: it is copied onto gh-pages as-is
 * and has to render from a file:// path too.
 */

/** @param {unknown} value */
function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    character =>
      ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[character],
  );
}

/** @param {import('./compare.mjs').Change & Record<string, any>} change */
function changeSection(change) {
  const key = escapeHtml(change.key);
  const reasons = (change.reasons ?? [])
    .map(reason => `<span class="tag">${escapeHtml(reason)}</span>`)
    .join(' ');
  return `
<section class="change" id="${key}">
  <header>
    <h3>${escapeHtml(change.component || change.title)} <span class="muted">·</span> ${escapeHtml(change.name)}</h3>
    <div class="meta">
      <span class="chip">${escapeHtml(change.theme)}</span>
      <span class="chip">${escapeHtml(change.mode)}</span>
      <span class="muted">${change.diffPixels.toLocaleString()} px (${(change.diffRatio * 100).toFixed(3)}%)</span>
      ${change.sizeChanged ? '<span class="chip warn">size changed</span>' : ''}
      ${reasons}
    </div>
  </header>
  <div class="views" data-key="${key}">
    <div class="tabs">
      <button data-view="wipe" class="active">Wipe</button>
      <button data-view="before">Before</button>
      <button data-view="after">After</button>
      <button data-view="diff">Diff</button>
      <button data-view="side">Side by side</button>
    </div>
    <div class="stage" data-view="wipe">
      <div class="wipe">
        <img class="after" src="after/${key}.png" alt="after">
        <div class="before-clip"><img class="before" src="before/${key}.png" alt="before"></div>
        <input type="range" min="0" max="100" value="50" aria-label="wipe between before and after">
      </div>
      <div class="single before"><img src="before/${key}.png" alt="before"></div>
      <div class="single after"><img src="after/${key}.png" alt="after"></div>
      <div class="single diff"><img src="diff/${key}.png" alt="diff"></div>
      <div class="side">
        <figure><figcaption>Before</figcaption><img src="before/${key}.png" alt="before"></figure>
        <figure><figcaption>After</figcaption><img src="after/${key}.png" alt="after"></figure>
        <figure><figcaption>Diff</figcaption><img src="diff/${key}.png" alt="diff"></figure>
      </div>
    </div>
  </div>
  <footer><code>${key}</code></footer>
</section>`;
}

/** @param {string[]} keys @param {string} title @param {string} note */
function keyList(keys, title, note) {
  if (keys.length === 0) return '';
  return `
<section class="list">
  <h2>${escapeHtml(title)} <span class="muted">(${keys.length})</span></h2>
  <p class="muted">${escapeHtml(note)}</p>
  <ul>${keys.map(key => `<li><code>${escapeHtml(key)}</code></li>`).join('')}</ul>
</section>`;
}

/** @param {string[]} keys @param {'added' | 'removed'} kind */
function oneSidedEvidence(keys, kind) {
  if (keys.length === 0) return '';
  const imageKind = kind === 'added' ? 'after' : 'before';
  const title = kind === 'added' ? 'Added' : 'Removed';
  return `
<h2>${title} (${keys.length})</h2>
${keys
  .map(key => {
    const safe = escapeHtml(key);
    return `<section class="change"><h3><code>${safe}</code></h3><p class="muted">${imageKind}</p><div class="stage"><img src="${imageKind}/${safe}.png" alt="${imageKind}"></div></section>`;
  })
  .join('')}`;
}

/** @param {object} targeting */
function targetingSection(targeting) {
  const rows = [
    [
      'Theme overrides that bound to nothing',
      'A theme styles this target, but no shot in this run rendered it. Either the plan cannot reach it, or the component stopped rendering the target the theme aims at.',
      (targeting.unexercisedOverrides ?? []).map(
        finding =>
          `${finding.theme} → ${finding.key}${finding.selector ? ` (${finding.selector})` : ''}`,
      ),
    ],
    [
      'Declared targets never seen',
      'Documented as themeable, absent from every shot. A coverage gap, not necessarily a bug.',
      targeting.uncoveredTargets ?? [],
    ],
    [
      'Rendered but undeclared',
      'An astryx-* class in the DOM that no component doc declares as a theming target.',
      targeting.undeclaredTargets ?? [],
    ],
  ].filter(([, , items]) => items.length > 0);

  if (rows.length === 0) {
    return '<section class="list"><h2>Theming targets</h2><p class="ok">Every theme override bound to a rendered target.</p></section>';
  }
  return rows
    .map(
      ([title, note, items]) => `
<section class="list">
  <h2>${escapeHtml(title)} <span class="muted">(${items.length})</span></h2>
  <p class="muted">${escapeHtml(note)}</p>
  <ul>${items.map(item => `<li><code>${escapeHtml(item)}</code></li>`).join('')}</ul>
</section>`,
    )
    .join('');
}

/**
 * @param {object} verdict
 * @param {{acceptHint?: string, oneSidedEvidence?: boolean}} [options]
 * @returns {string}
 */
export function renderReport(verdict, options = {}) {
  const {counts, status} = verdict;
  if (status === 'skipped') {
    return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Visual gate — skipped</title>
<style>
  body { font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 24px; max-width: 720px; }
  .status { color: #0969da; }
</style>
<h1>Visual gate <span class="status">skipped</span></h1>
<p><b>Capture deferred.</b> ${escapeHtml(verdict.reason)}</p>
<p>${counts.total} planned shot(s) were not compared. This is not passing visual evidence.</p>
</html>
`;
  }
  const acceptHint =
    options.acceptHint ??
    'node .github/scripts/visual-gate/gate.mjs accept --keys <key,key> --reason "<why the after is correct>"';

  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Visual gate — ${escapeHtml(status)}</title>
<style>
  :root { color-scheme: light dark; --line: color-mix(in oklab, currentColor 15%, transparent); }
  body { font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 24px; max-width: 1200px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 32px 0 4px; }
  h3 { font-size: 14px; margin: 0; }
  .muted { opacity: .6; }
  .ok { color: #1a7f37; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
  .status { display: inline-block; padding: 2px 10px; border-radius: 999px; font-weight: 600; }
  .status.pass { background: #1a7f3722; color: #1a7f37; }
  .status.changed { background: #9a670022; color: #9a6700; }
  .status.failed { background: #cf222e22; color: #cf222e; }
  .summary { display: flex; gap: 16px; flex-wrap: wrap; margin: 12px 0 8px; }
  .summary div { border: 1px solid var(--line); border-radius: 8px; padding: 8px 12px; min-width: 84px; }
  .summary b { display: block; font-size: 18px; }
  .howto { border: 1px solid var(--line); border-radius: 8px; padding: 12px 16px; margin: 16px 0; }
  .change { border: 1px solid var(--line); border-radius: 10px; padding: 16px; margin: 16px 0; }
  .change header { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; align-items: baseline; }
  .meta { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .chip, .tag { border: 1px solid var(--line); border-radius: 999px; padding: 1px 8px; font-size: 12px; }
  .tag { opacity: .7; }
  .chip.warn { border-color: #9a6700; color: #9a6700; }
  .tabs { display: flex; gap: 4px; margin: 12px 0 8px; }
  .tabs button { font: inherit; font-size: 12px; padding: 3px 10px; border-radius: 6px; border: 1px solid var(--line); background: transparent; cursor: pointer; }
  .tabs button.active { background: color-mix(in oklab, currentColor 12%, transparent); font-weight: 600; }
  .stage img { max-width: 100%; display: block; border: 1px solid var(--line); border-radius: 6px; background: #fff; }
  .stage > div { display: none; }
  .stage[data-view="wipe"] .wipe, .stage[data-view="before"] .single.before,
  .stage[data-view="after"] .single.after, .stage[data-view="diff"] .single.diff,
  .stage[data-view="side"] .side { display: block; }
  .side { display: none; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .stage[data-view="side"] .side { display: grid; }
  .side figure { margin: 0; }
  .side figcaption { font-size: 12px; opacity: .6; margin-bottom: 4px; }
  .wipe { position: relative; }
  .wipe .before-clip { position: absolute; inset: 0; overflow: hidden; width: 50%; }
  .wipe .before-clip img { max-width: none; }
  .wipe input { position: absolute; left: 0; right: 0; bottom: -6px; width: 100%; }
  .list ul { margin: 4px 0; padding-left: 20px; }
  footer code { opacity: .5; }
</style>
<h1>Visual gate <span class="status ${escapeHtml(status)}">${escapeHtml(status)}</span></h1>
<p class="muted">
  ${escapeHtml(verdict.context?.sha ?? 'unknown commit')} on ${escapeHtml(verdict.platform ?? '?')}
  · baseline ${escapeHtml(verdict.baseline?.sha ?? 'none')}
  · ${escapeHtml(verdict.generatedAt)}
</p>
<div class="summary">
  <div><b>${counts.total}</b>shots</div>
  <div><b>${counts.changed}</b>changed</div>
  <div><b>${counts.added}</b>added</div>
  <div><b>${counts.removed}</b>removed</div>
  <div><b>${counts.failed}</b>failed</div>
</div>
<div class="howto">
  <b>Changed is not the same as broken.</b> For each change below, decide whether the <em>after</em> is the picture you want.
  If it is, promote it — that is a valid, recorded outcome:
  <p><code>${escapeHtml(acceptHint)}</code></p>
  If it is not, the change is a regression: fix it before the release goes out.
</div>
${verdict.failures?.length ? `<section class="list"><h2>Failed to capture <span class="muted">(${verdict.failures.length})</span></h2><ul>${verdict.failures
    .map(f => `<li><code>${escapeHtml(f.key)}</code> — ${escapeHtml(f.error)}</li>`)
    .join('')}</ul></section>` : ''}
${verdict.changes.length ? `<h2>Changed (${verdict.changes.length})</h2>` : '<p class="ok">No shot changed against the baseline.</p>'}
${verdict.changes.map(changeSection).join('')}
${options.oneSidedEvidence ? oneSidedEvidence(verdict.added ?? [], 'added') : keyList(verdict.added ?? [], 'Added', 'New shots with no baseline to regress against — adopted on the next promotion.')}
${options.oneSidedEvidence ? oneSidedEvidence(verdict.removed ?? [], 'removed') : keyList(verdict.removed ?? [], 'Removed', 'Baseline shots whose story no longer exists.')}
${targetingSection(verdict.targeting ?? {})}
<script>
  for (const views of document.querySelectorAll('.views')) {
    const stage = views.querySelector('.stage');
    views.querySelectorAll('.tabs button').forEach((button) => {
      button.addEventListener('click', () => {
        views.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b === button));
        stage.dataset.view = button.dataset.view;
      });
    });
    const range = views.querySelector('.wipe input');
    const clip = views.querySelector('.before-clip');
    range?.addEventListener('input', () => { clip.style.width = range.value + '%'; });
  }
</script>
</html>
`;
}
