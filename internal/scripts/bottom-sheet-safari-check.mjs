#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.
// Manual real-Safari check for BottomSheet stacking, replace and non-modal
// hosting (the browser evidence a Linux CI cannot produce; see
// docs/specs/AST-027 and AST-013). Run by a person on a Mac against a
// deployed Storybook; results are pasted into the pull request.
//
// Drives Safari through safaridriver's W3C WebDriver endpoint with plain
// fetch — no npm dependencies, Node >= 20.
//
// Usage:
//   safaridriver --port 4799 &            (Develop > Allow Remote Automation must be on)
//   node internal/scripts/bottom-sheet-safari-check.mjs <baseUrl> <label> <outDir> [driverUrl]
//
//   baseUrl   a deployed Storybook root, e.g. https://…vercel.app/storybook
//   label     a short name for this run (used in file names), e.g. branch or main;
//             path separators and other characters unsafe in a file name are
//             flattened to '-' before anything is written
//   outDir    where results.json, summary.md and screenshots go (default
//             internal/scripts/output/safari, which git ignores)
//   driverUrl defaults to http://127.0.0.1:4799
//
// Every check records {status: pass | fail | skipped | not-driven, …}. A story
// the deployment does not have is `skipped`; a check Safari's WebDriver cannot
// drive reliably is `not-driven`, never faked. The stacking and replace
// stories (core-bottomsheetstacking--*, core-bottomsheetreplace--*) ship with
// the open-order stacking change; on a deployment without it those checks are
// skipped and the switcher and no-scrim checks still run.

import fs from 'node:fs';
import path from 'node:path';

const [
  baseUrlArg,
  rawLabel = 'run',
  outDirArg = './internal/scripts/output/safari',
  driverUrl = 'http://127.0.0.1:4799',
] = process.argv.slice(2);
if (!baseUrlArg) {
  console.error(
    'usage: node internal/scripts/bottom-sheet-safari-check.mjs <baseUrl> <label> <outDir> [driverUrl]',
  );
  process.exit(2);
}
const baseUrl = baseUrlArg.replace(/\/$/, '');
// The label names files: a branch name such as `feat/x` would otherwise send
// every screenshot and the results into a directory that does not exist.
const label =
  rawLabel.replace(/[/\\:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '') || 'run';
const outDir = path.resolve(outDirArg);
fs.mkdirSync(outDir, {recursive: true});

// ---------------------------------------------------------------------------
// Minimal W3C WebDriver client
// ---------------------------------------------------------------------------

async function wd(method, route, body) {
  const res = await fetch(`${driverUrl}${route}`, {
    method,
    headers: {'content-type': 'application/json; charset=utf-8'},
    body: body == null ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || (json.value && json.value.error)) {
    const err = new Error(
      `${method} ${route} -> ${res.status} ${JSON.stringify(json.value ?? json).slice(0, 400)}`,
    );
    err.wd = json.value;
    throw err;
  }
  return json.value;
}

let sessionId = null;
const S = () => `/session/${sessionId}`;

async function openSession() {
  const value = await wd('POST', '/session', {
    capabilities: {alwaysMatch: {browserName: 'safari'}},
  });
  sessionId = value.sessionId;
  return value.capabilities ?? {};
}
const closeSession = () =>
  sessionId ? wd('DELETE', S()).catch(() => null) : null;
const navigate = url => wd('POST', `${S()}/url`, {url});
const exec = (script, args = []) =>
  wd('POST', `${S()}/execute/sync`, {script, args});
const execAsync = (script, args = []) =>
  wd('POST', `${S()}/execute/async`, {script, args});
const screenshot = async name => {
  const b64 = await wd('GET', `${S()}/screenshot`);
  const file = path.join(outDir, `${label}-${name}.png`);
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  return path.basename(file);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function setWindow() {
  try {
    await wd('POST', `${S()}/window/rect`, {
      x: 0,
      y: 0,
      width: 390,
      height: 844,
    });
    const rect = await wd('GET', `${S()}/window/rect`);
    const inner = await exec('return {w: innerWidth, h: innerHeight};');
    return {requested: '390x844', window: rect, viewport: inner};
  } catch (error) {
    const inner = await exec('return {w: innerWidth, h: innerHeight};').catch(
      () => null,
    );
    return {
      requested: '390x844',
      error: String(error.message).slice(0, 160),
      viewport: inner,
    };
  }
}

// W3C Actions: a key press (keydown + keyup).
async function pressKey(key) {
  await wd('POST', `${S()}/actions`, {
    actions: [
      {
        type: 'key',
        id: 'kb',
        actions: [
          {type: 'keyDown', value: key},
          {type: 'keyUp', value: key},
        ],
      },
    ],
  });
  await wd('DELETE', `${S()}/actions`).catch(() => null);
}
const KEYS = {Escape: '\uE00C', Enter: '\uE007', Tab: '\uE004'};

// ---------------------------------------------------------------------------
// Page helpers (run inside Safari)
// ---------------------------------------------------------------------------

const PAGE = `
  const q = (sel, root = document) => root.querySelector(sel);
  const qa = (sel, root = document) => [...root.querySelectorAll(sel)];
  const isPopoverOpen = el => { try { return el.matches(':popover-open'); } catch { return false; } };
  const presented = () => qa('dialog').filter(d => d.open || isPopoverOpen(d));
  const label = el => el ? el.getAttribute('aria-label') : null;
  const describeActive = () => {
    const a = document.activeElement;
    if (!a || a === document.body) return 'body';
    const dlg = a.closest('dialog');
    const tag = a.tagName.toLowerCase();
    const name = a.textContent && tag === 'button' ? '"' + a.textContent.trim().slice(0, 30) + '"' : '';
    const panel = a.classList.contains('astryx-bottom-sheet') ? ' (panel)' : '';
    return tag + name + panel + (dlg ? ' in ' + label(dlg) : ' on page');
  };
  const backdropOpacity = d => { try { return parseFloat(getComputedStyle(d, '::backdrop').opacity); } catch { return null; } };
  const dialogState = () => presented().map(d => ({
    label: label(d), open: d.open, popoverOpen: isPopoverOpen(d), modal: (() => { try { return d.matches(':modal'); } catch { return null; } })(),
    inert: d.hasAttribute('inert') || d.inert === true, ariaHidden: d.getAttribute('aria-hidden'),
    stack: d.getAttribute('data-sheet-stack'), depth: d.getAttribute('data-sheet-stack-depth'),
    backdrop: d.matches(':modal') ? backdropOpacity(d) : 0,
    hasFocus: d.contains(document.activeElement),
  }));
  const hitAt = (x, y) => { const e = document.elementFromPoint(x, y); if (!e) return null; const dlg = e.closest('dialog'); return {tag: e.tagName.toLowerCase(), inDialog: label(dlg), inToast: e.closest('[role="region"]') != null}; };
  const panelOf = d => q('.astryx-bottom-sheet', d);
  const buttonIn = (root, text) => qa('button', root).find(b => b.textContent.trim() === text && b.offsetParent !== null) || qa('button', root).find(b => b.textContent.trim() === text);
  // The dialog a person can act in: presented, not inert, not hidden.
  const topDialog = () => { const p = presented().filter(d => !(d.hasAttribute('inert') || d.inert === true) && d.getAttribute('aria-hidden') !== 'true'); return p[p.length - 1] || null; };
`;

const inPage = body => `${PAGE}\n${body}`;

async function goStory(id) {
  await navigate(`${baseUrl}/iframe.html?id=${id}&viewMode=story`);
  // Wait for the story root to render something.
  for (let i = 0; i < 40; i++) {
    const ready = await exec(
      `return !!document.querySelector('#storybook-root button, #storybook-root dialog');`,
    ).catch(() => false);
    if (ready) break;
    await sleep(250);
  }
  await sleep(600);
}

async function storyExists(id) {
  const data = await exec(
    `const cb = arguments[arguments.length - 1];
     return fetch(${JSON.stringify(baseUrl)} + '/index.json').then(r => r.json()).then(j => Object.keys(j.entries || j.stories || {})).catch(() => null);`,
  ).catch(() => null);
  return data;
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

const results = {
  label,
  baseUrl,
  driverUrl,
  startedAt: new Date().toISOString(),
  checks: {},
};
const record = (name, value) => {
  results.checks[name] = value;
  const status = value.status ?? 'info';
  console.log(`  [${status}] ${name}${value.note ? ' — ' + value.note : ''}`);
};
const skipped = (name, note) => record(name, {status: 'skipped', note});
const CLOSE_ALL_ROW = '"Close all" from depth 3 returns focus to the opener';
const DEEP_LINK_ROW = 'deep link re-shown dialog order (depth three)';

// Click a button by its text. `top` means the presented top sheet and
// nothing else: with no sheet presented the answer is 'no-sheet', never a
// click on a button inside a closed dialog's content. `page` is the story
// root.
function clickButton(text, within = 'top') {
  return exec(
    inPage(`
      const root = ${within === 'top' ? 'topDialog()' : 'document.querySelector("#storybook-root")'};
      if (!root) return 'no-sheet';
      const b = buttonIn(root, ${JSON.stringify(text)});
      if (!b) return 'missing';
      b.focus(); b.click(); return 'clicked';
    `),
  );
}

// Sample the page per animation frame through an interaction, inside one
// execute/async call so the timing is the page's, not the driver's.
function sampleThrough(actionJs, ms) {
  return execAsync(
    inPage(`
      const done = arguments[arguments.length - 1];
      const frames = [];
      const start = performance.now();
      const area = {x: 20, y: 20};
      const sample = () => {
        const ds = presented();
        // Page dim: each visible modal backdrop is the 50%-alpha overlay colour
        // at its own opacity; compose them as the harness does.
        let dim = 0;
        for (const d of ds) { const op = d.matches(':modal') ? backdropOpacity(d) ?? 0 : 0; dim = 1 - (1 - dim) * (1 - 0.5 * op); }
        const panels = ds.map(d => { const p = panelOf(d); if (!p) return null; const cs = getComputedStyle(p); const r = p.getBoundingClientRect(); return {d: label(d), t: cs.transform, o: parseFloat(cs.opacity), top: Math.round(r.top)}; }).filter(Boolean);
        frames.push({rel: Math.round(performance.now() - start), dim: Math.round(dim * 1000) / 1000, backdrops: ds.map(d => [label(d), d.matches(':modal') ? backdropOpacity(d) : 0]), pageHit: hitAt(area.x, area.y), active: describeActive(), panels});
        if (performance.now() - start < ${ms}) requestAnimationFrame(sample); else done({frames, outcome});
      };
      // The sampler is scheduled before the action runs, so its first
      // sample is the first frame after the click — a handoff's opening
      // frames and the 150 ms before a fast Back are in the record, and
      // the action's own awaits never delay it.
      requestAnimationFrame(sample);
      // The action's own return value rides along with the frames, so a row
      // can tell what the action did (a Back pressed, or not found).
      let outcome = null;
      (async () => { ${actionJs} })().then(v => { outcome = v ?? null; }).catch(e => done({error: String(e)}));
    `),
  );
}

// `sampled` is what sampleThrough resolved: {frames, outcome} or {error}.
function framesOf(sampled) {
  return Array.isArray(sampled?.frames) ? sampled.frames : sampled;
}

function summarizeFrames(sampled) {
  const frames = framesOf(sampled);
  if (!Array.isArray(frames)) return {error: sampled?.error ?? 'no frames'};
  const dims = frames.map(f => f.dim);
  const openMax = Math.max(...frames.map(f => f.backdrops.length));
  return {
    frames: frames.length,
    dimMin: Math.min(...dims),
    dimMax: Math.max(...dims),
    openDialogsMax: openMax,
    activeFirst: frames[0]?.active,
    activeLast: frames[frames.length - 1]?.active,
    settled: frames[frames.length - 1],
  };
}

async function checkNonModalHosting(ids) {
  const id = ids.noScrimLone;
  if (!id) {
    // Every check this story carries, so the table never drops a row.
    skipped('non-modal hosting (lone NoScrim)', 'story absent');
    return skipped('focus return: lone no-scrim sheet, Escape', 'story absent');
  }
  await goStory(id);
  if (await exec(inPage(`return presented().length;`)))
    (await pressKey(KEYS.Escape), await sleep(800));
  await clickButton('Open sheet', 'page');
  await sleep(900);
  const state = await exec(inPage(`return dialogState();`));
  const shot = await screenshot('nonmodal-lone-open');
  const d = state[0];
  record('non-modal hosting (lone NoScrim)', {
    // Top-layer hosting means a manual popover: `:popover-open` and not
    // `:modal`. A `show()` host (not in the top layer) fails this row.
    status: !d ? 'fail' : d.popoverOpen && d.modal === false ? 'pass' : 'fail',
    hosting: d
      ? d.popoverOpen
        ? 'popover'
        : d.open
          ? 'show()'
          : 'none'
      : 'none',
    dialog: d ?? null,
    note: d
      ? `${d.popoverOpen ? ':popover-open' : 'open'}; :modal=${d.modal}; focus ${d.hasFocus ? 'inside' : 'outside'}`
      : 'no dialog presented',
    shot,
  });
  // Focus return on Escape (keyboard-opened would be ideal; Safari WebDriver
  // cannot reliably Tab to the opener, so the sheet is opened by click with
  // the opener focused first, which is the same opener-recording path).
  // A return is only a return if focus was inside the sheet first: a sheet
  // that never took focus closes with focus still on the opener and would
  // read as a pass. Move focus onto the sheet's first control; if Safari
  // leaves focus outside anyway, the row is not driven rather than faked.
  const focused = await exec(
    inPage(`
      const d = topDialog(); if (!d) return false;
      const c = d.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!c) return false;
      c.focus(); return d.contains(document.activeElement);`),
  );
  const before = await exec(inPage(`return describeActive();`));
  if (!focused) {
    record('focus return: lone no-scrim sheet, Escape', {
      status: 'not-driven',
      focusBeforeEscape: before,
      note: 'focus could not be moved into the sheet before Escape, so a return cannot be judged',
    });
    await pressKey(KEYS.Escape);
    await sleep(1100);
    return;
  }
  await pressKey(KEYS.Escape);
  await sleep(1100);
  const after = await exec(
    inPage(`return {active: describeActive(), open: presented().length};`),
  );
  record('focus return: lone no-scrim sheet, Escape', {
    status:
      after.open === 0
        ? after.active.includes('"Open sheet"')
          ? 'pass'
          : 'fail'
        : 'fail',
    focusBeforeEscape: before,
    focusAfterClose: after.active,
    openAfter: after.open,
    note: `focus inside before Escape; after close: ${after.active}`,
  });
}

async function checkReplaceFlow(ids, kind) {
  const id = kind === 'modal' ? ids.flowHug : ids.flowNoScrim;
  const name = `replace handoff (${kind})`;
  if (!id) {
    skipped(name, 'story absent');
    return skipped(
      `focus return: ${kind} flow, final close (Escape)`,
      'story absent',
    );
  }
  await goStory(id);
  // The story's play() opens the flow with a bare click (no focus), so close
  // it and reopen from the focused opener: that is how a person opens it and
  // how the opener is recorded for the final focus return.
  if (await exec(inPage(`return presented().length;`))) {
    await pressKey(KEYS.Escape);
    await sleep(1000);
  }
  await clickButton('Set up notifications', 'page');
  await sleep(1000);
  const opened = await exec(inPage(`return dialogState();`));
  // 1 -> 2
  const f12 = await sampleThrough(
    `const b = buttonIn(topDialog(), 'Continue'); b.focus(); b.click();`,
    1400,
  );
  const s12 = summarizeFrames(f12);
  const shot12 = await screenshot(`replace-${kind}-step2`);
  // fast Back during 2 -> 3: press Continue, then Back 150 ms later
  const fRev = await sampleThrough(
    `const c = buttonIn(topDialog(), 'Continue'); c.focus(); c.click();
     await new Promise(r => setTimeout(r, 150));
     const back = buttonIn(topDialog(), 'Back');
     if (!back) return 'back-missing';
     back.focus(); back.click(); return 'back-clicked';`,
    1600,
  );
  const sRev = summarizeFrames(fRev);
  // The fast-Back half of the row is only judged when Back was pressed.
  const backPressed = fRev?.outcome === 'back-clicked';
  const shotRev = await screenshot(`replace-${kind}-after-fast-back`);
  const settled = await exec(
    inPage(`return {dialogs: dialogState(), active: describeActive()};`),
  );
  // Focus must be inside the ENTERING step's dialog once the 1 → 2 handoff
  // settles — matched on that dialog's label alone, so focus left in the
  // exiting step's panel does not count. Part of the row's status.
  const enteringLabel = 'Notification frequency';
  const enteringFocused = (s12.activeLast ?? '').endsWith(
    ` in ${enteringLabel}`,
  );
  // The 1 → 2 handoff was measured whatever happened next: a failure there
  // is a failure of the row. Only a 1 → 2 half that held leaves the row's
  // verdict to the fast Back — and when Back was never pressed, the 2 → 3
  // handoff and its reversal were not exercised, so the row is not driven
  // rather than passed on the half it did measure.
  const dim12Ok =
    kind === 'modal'
      ? s12.dimMin >= 0.49 && s12.dimMax <= 0.51
      : s12.dimMax === 0;
  const half12Ok = dim12Ok && enteringFocused;
  const dimRevOk =
    kind === 'modal'
      ? sRev.dimMin >= 0.49 && sRev.dimMax <= 0.51
      : sRev.dimMax === 0;
  const oneLeft = settled.dialogs.length === 1;
  const status = !half12Ok
    ? 'fail'
    : !backPressed
      ? 'not-driven'
      : dimRevOk && oneLeft
        ? 'pass'
        : 'fail';
  record(name, {
    status,
    opened,
    switch1to2: s12,
    fastBack: fRev?.outcome ?? 'unknown',
    fastBackDuring2to3: sRev,
    settledAfter: settled,
    handoff1to2: half12Ok ? 'pass' : 'fail',
    focusIntoEnteringStep: enteringFocused ? 'pass' : 'fail',
    focusAfter1to2: s12.activeLast ?? null,
    note: `dim 1→2 ${s12.dimMin}..${s12.dimMax}, fast Back ${backPressed ? `${sRev.dimMin}..${sRev.dimMax}` : 'not pressed (' + (fRev?.outcome ?? 'unknown') + ')'}; open dialogs max ${s12.openDialogsMax}/${sRev.openDialogsMax}; settled ${settled.dialogs.map(d => d.label).join(', ')}; focus after 1→2 ${s12.activeLast ?? 'unknown'} (${enteringFocused ? 'inside the entering step' : 'not inside the entering step'})`,
    shots: [shot12, shotRev],
    frames: {switch1to2: framesOf(f12), fastBack: framesOf(fRev)},
  });
  // Final close -> opener. Dismiss with Escape (purpose info) from the step on top.
  const opener = await exec(
    inPage(
      `const b = buttonIn(document.querySelector('#storybook-root'), 'Set up notifications'); return b ? 'found' : 'missing';`,
    ),
  );
  await pressKey(KEYS.Escape);
  await sleep(1100);
  const after = await exec(
    inPage(`return {active: describeActive(), open: presented().length};`),
  );
  record(`focus return: ${kind} flow, final close (Escape)`, {
    status:
      after.open === 0
        ? after.active.includes('"Set up notifications"')
          ? 'pass'
          : 'fail'
        : 'fail',
    openerPresent: opener,
    focusAfterClose: after.active,
    openAfter: after.open,
    note: `focus after close: ${after.active}`,
  });
}

async function checkToastOrder(ids) {
  const id = ids.nonModalOverPage;
  if (!id) {
    skipped('toast order over a non-modal sheet', 'story absent');
    return skipped(
      'tooltip/popover opened from the sheet above it',
      'story absent',
    );
  }
  await goStory(id);
  const toastCenterHit = () =>
    exec(
      inPage(`
        const items = qa('[role="region"] li, [role="region"] > *').filter(e => e.getBoundingClientRect().height > 0);
        return items.map(el => { const r = el.getBoundingClientRect(); const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return {text: el.textContent.trim().slice(0, 24), hitsToast: el.contains(at), hitDialog: at ? label(at.closest('dialog')) : null}; });
      `),
    );
  await clickButton('Toast from page', 'page');
  await sleep(500);
  const before = await toastCenterHit();
  await clickButton('Open sheet', 'page');
  await sleep(1000);
  const presentedCount = await exec(inPage(`return presented().length;`));
  const sheetOpen = await toastCenterHit();
  const sheetClick = await clickButton('Toast from sheet', 'top');
  await sleep(500);
  const whileOpen = await toastCenterHit();
  const shot = await screenshot('toast-over-nonmodal');
  // Without a presented sheet there is no order to judge: the row is not
  // driven, never a pass on toasts over an empty top layer.
  const driven = presentedCount > 0 && sheetClick === 'clicked';
  const ok =
    driven &&
    sheetOpen.length > 0 &&
    sheetOpen.every(t => t.hitsToast) &&
    whileOpen.length > 1 &&
    whileOpen.every(t => t.hitsToast);
  record('toast order over a non-modal sheet', {
    status: ok ? 'pass' : driven ? 'fail' : 'not-driven',
    sheetPresented: presentedCount,
    toastFromSheet: sheetClick,
    toastBeforeOpen: before,
    toastAfterSheetOpened: sheetOpen,
    toastsWhileOpen: whileOpen,
    note: driven
      ? `raised before: ${sheetOpen.map(t => (t.hitsToast ? 'above' : 'under ' + t.hitDialog)).join(',')}; raised while open: ${whileOpen.map(t => (t.hitsToast ? 'above' : 'under')).join(',')}`
      : `no sheet presented after Open sheet (${presentedCount} presented, Toast from sheet: ${sheetClick})`,
    shot,
  });
  // Tooltip from the sheet: hover is not reliably drivable in Safari WebDriver.
  record('tooltip/popover opened from the sheet above it', {
    status: 'not-driven',
    note: 'not driven in Safari (hover is unreliable in safaridriver)',
  });
  await pressKey(KEYS.Escape);
  await sleep(600);
}

async function checkStacking(ids) {
  const id = ids.ordersDrillIn;
  if (!id) {
    skipped('covered sheets inert + aria-hidden', 'story absent');
    return skipped('Escape closes only the top sheet', 'story absent');
  }
  await goStory(id);
  await clickButton('Open orders', 'page');
  await sleep(900);
  // Drill in: the first visible button inside the top dialog that is not a close.
  await exec(
    inPage(
      `const d = topDialog(); const b = qa('button', d).find(x => /^(View|Open|Edit|Order)/.test(x.textContent.trim())) || qa('button', d)[0]; if (b) { b.focus(); b.click(); }`,
    ),
  );
  await sleep(1000);
  const state = await exec(inPage(`return dialogState();`));
  const top = await exec(
    inPage(
      `const d = topDialog(); const p = panelOf(d); const r = p.getBoundingClientRect(); const at = document.elementFromPoint(r.left + r.width / 2, r.top + 30); return {top: label(d), hit: label(at && at.closest('dialog'))};`,
    ),
  );
  const shot = await screenshot('stacking-depth2');
  const covered = state.filter(
    d => d.stack === 'covered' || (d.depth && Number(d.depth) > 0),
  );
  const ok =
    state.length >= 2 &&
    covered.length >= 1 &&
    covered.every(d => d.inert && d.ariaHidden === 'true') &&
    top.hit === top.top;
  record('covered sheets inert + aria-hidden', {
    status: ok ? 'pass' : 'fail',
    dialogs: state,
    topHit: top,
    note: `${state.length} presented; covered: ${covered.map(d => `${d.label} inert=${d.inert} aria-hidden=${d.ariaHidden}`).join('; ') || 'none'}; top ${top.top} hit-tests ${top.hit}`,
    shot,
  });
  // Escape closes only the top sheet.
  await pressKey(KEYS.Escape);
  await sleep(1100);
  const afterEsc = await exec(
    inPage(`return {dialogs: dialogState(), active: describeActive()};`),
  );
  // One fewer sheet is not enough: the one that left must be the former top,
  // and the sheets beneath must all still be presented.
  const remaining = afterEsc.dialogs.map(d => d.label);
  const topClosed =
    !remaining.includes(top.top) &&
    state
      .map(d => d.label)
      .filter(l => l !== top.top)
      .every(l => remaining.includes(l));
  record('Escape closes only the top sheet', {
    status:
      state.length >= 2 &&
      afterEsc.dialogs.length === state.length - 1 &&
      topClosed
        ? 'pass'
        : 'fail',
    closed: top.top,
    before: state.map(d => d.label),
    after: afterEsc.dialogs.map(d => d.label),
    focusAfter: afterEsc.active,
    note: `${state.length} → ${afterEsc.dialogs.length}; focus ${afterEsc.active}`,
  });
}

async function checkCloseAll(ids) {
  const id = ids.ordersDrillIn;
  if (!id) return skipped(CLOSE_ALL_ROW, 'story absent');
  await goStory(id);
  // Open from the focused page opener (the recorded return target).
  await clickButton('Open orders', 'page');
  await sleep(900);
  await exec(
    inPage(
      `const d = topDialog(); const b = qa('button', d).find(x => /^(View|Open|Edit|Order)/.test(x.textContent.trim())) || qa('button', d)[0]; if (b) { b.focus(); b.click(); }`,
    ),
  );
  await sleep(900);
  await exec(
    inPage(
      `const d = topDialog(); const b = buttonIn(d, 'Edit note') || qa('button', d).find(x => /^Edit/.test(x.textContent.trim())); if (b) { b.focus(); b.click(); }`,
    ),
  );
  await sleep(900);
  const before = await exec(
    inPage(`return {open: presented().map(label), active: describeActive()};`),
  );
  const frames = await sampleThrough(
    `const b = buttonIn(topDialog(), 'Close all'); if (!b) throw new Error('no Close all'); b.focus(); b.click();`,
    1500,
  );
  const summary = summarizeFrames(frames);
  const after = await exec(
    inPage(`return {open: presented().length, active: describeActive()};`),
  );
  const shot = await screenshot('close-all-after');
  record(CLOSE_ALL_ROW, {
    status:
      before.open.length === 3 &&
      after.open === 0 &&
      after.active.includes('"Open orders"')
        ? 'pass'
        : 'fail',
    before,
    after,
    dimThrough: `${summary.dimMin}..${summary.dimMax}`,
    note: `${before.open.length} open → ${after.open}; focus after: ${after.active}`,
    shot,
    frames: framesOf(frames),
  });
}

async function checkDeepLink(ids) {
  const id = ids.deepLink;
  if (!id) return skipped(DEEP_LINK_ROW, 'story absent');
  await goStory(id);
  // The story deep-links on load; if it needs a click, press the first page button.
  if ((await exec(inPage(`return presented().length;`))) < 2) {
    await exec(
      inPage(
        `const b = qa('button', document.querySelector('#storybook-root'))[0]; if (b) b.click();`,
      ),
    );
    await sleep(1200);
  }
  const state = await exec(inPage(`return dialogState();`));
  const hit = await exec(
    inPage(
      `const d = topDialog(); const p = panelOf(d); if (!p) return null; const r = p.getBoundingClientRect(); const at = document.elementFromPoint(r.left + r.width / 2, r.top + 30); return {expectedTop: label(d), hit: label(at && at.closest('dialog')), order: presented().map(label)};`,
    ),
  );
  const shot = await screenshot('deep-link-depth3');
  const topEntry = state.find(d => d.stack === 'top');
  const ok =
    state.length === 3 && topEntry != null && hit && hit.hit === topEntry.label;
  record(DEEP_LINK_ROW, {
    status: ok ? 'pass' : 'fail',
    dialogs: state,
    hit,
    note: `${state.length} presented; stack top=${topEntry?.label}; hit-tests ${hit?.hit}`,
    shot,
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

(async () => {
  console.log(`Safari check — ${label} — ${baseUrl}`);
  const caps = await openSession();
  results.capabilities = {
    browserName: caps.browserName,
    browserVersion: caps.browserVersion,
    platformName: caps.platformName,
    safariVersion: caps['safari:platformVersion'] ?? null,
  };
  console.log(
    `  session: ${caps.browserName} ${caps.browserVersion ?? ''} on ${caps.platformName ?? ''}`,
  );
  results.window = await setWindow();
  console.log(`  window: ${JSON.stringify(results.window)}`);

  await navigate(`${baseUrl}/iframe.html`);
  const entries = await storyExists();
  if (entries == null) {
    // A wrong base URL, a missing /storybook segment or a login page: the
    // index cannot be read, so nothing below could be judged. Fail the run
    // instead of recording every check as skipped.
    console.error(
      `error: could not read ${baseUrl}/index.json — check the Storybook base URL`,
    );
    await closeSession();
    process.exit(1);
  }
  results.storyIds = entries.length;
  const has = id => entries.includes(id);
  const pick = (...candidates) => candidates.find(has) ?? null;
  const ids = {
    noScrimLone: pick('core-bottomsheet--no-scrim'),
    flowHug: pick(
      'core-bottomsheetreplace--hug-content',
      'core-bottomsheetswitcher--hug-content',
    ),
    flowNoScrim: pick(
      'core-bottomsheetreplace--no-scrim',
      'core-bottomsheetswitcher--no-scrim',
    ),
    nonModalOverPage: pick('core-bottomsheetreplace--non-modal-over-live-page'),
    ordersDrillIn: pick('core-bottomsheetstacking--orders-drill-in'),
    deepLink: pick('core-bottomsheetstacking--deep-link-depth-three'),
  };
  results.storiesUsed = ids;
  console.log(`  stories: ${JSON.stringify(ids)}`);

  // Each step names the rows it records, so a throw inside it fails those
  // rows rather than adding one under the step's name.
  const steps = [
    [
      'non-modal hosting + focus return',
      () => checkNonModalHosting(ids),
      [
        'non-modal hosting (lone NoScrim)',
        'focus return: lone no-scrim sheet, Escape',
      ],
    ],
    [
      'replace (modal)',
      () => checkReplaceFlow(ids, 'modal'),
      [
        'replace handoff (modal)',
        'focus return: modal flow, final close (Escape)',
      ],
    ],
    [
      'replace (no-scrim)',
      () => checkReplaceFlow(ids, 'no-scrim'),
      [
        'replace handoff (no-scrim)',
        'focus return: no-scrim flow, final close (Escape)',
      ],
    ],
    [
      'toast order',
      () => checkToastOrder(ids),
      [
        'toast order over a non-modal sheet',
        'tooltip/popover opened from the sheet above it',
      ],
    ],
    [
      'stacking + Escape',
      () => checkStacking(ids),
      [
        'covered sheets inert + aria-hidden',
        'Escape closes only the top sheet',
      ],
    ],
    ['close all', () => checkCloseAll(ids), [CLOSE_ALL_ROW]],
    ['deep link', () => checkDeepLink(ids), [DEEP_LINK_ROW]],
  ];
  for (const [name, run, rows] of steps) {
    try {
      await run();
    } catch (error) {
      // The step's own named rows fail with the error, so the table keeps
      // its shape and a reader sees which checks the throw took down.
      const message = String(error.message ?? error).slice(0, 400);
      for (const row of rows) {
        if (!(row in results.checks)) {
          record(row, {status: 'fail', error: message, step: name});
        }
      }
    }
  }
  await closeSession();
  results.finishedAt = new Date().toISOString();
  fs.writeFileSync(
    path.join(outDir, `${label}-results.json`),
    JSON.stringify(results, null, 2),
  );

  const rows = Object.entries(results.checks).map(
    ([name, v]) =>
      `| ${name} | ${v.status} | ${(v.note ?? v.error ?? '').replace(/\|/g, '/')} |`,
  );
  const summary = [
    `# Safari check — ${label}`,
    '',
    `- Base URL: ${baseUrl}`,
    `- Browser: ${results.capabilities.browserName} ${results.capabilities.browserVersion ?? ''} on ${results.capabilities.platformName ?? ''} (real Safari via safaridriver; macOS, not iOS hardware)`,
    `- Window: ${JSON.stringify(results.window)}`,
    `- Stories: ${JSON.stringify(ids)}`,
    '',
    '| Check | Status | Note |',
    '|---|---|---|',
    ...rows,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(outDir, `${label}-summary.md`), summary);
  console.log('\n' + summary);
  const failed = Object.values(results.checks).filter(
    v => v.status === 'fail',
  ).length;
  process.exit(failed ? 1 : 0);
})().catch(async error => {
  console.error('fatal:', error.message ?? error);
  await closeSession();
  process.exit(1);
});
