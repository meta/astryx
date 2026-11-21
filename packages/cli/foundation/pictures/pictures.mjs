// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Pictures of HTML pages through a browser already on the machine:
 * the project's Playwright, else a Chrome or Chromium. Each browser runs as
 * its own process group with its own temp folder, time bound and stop.
 * @input the project (its folder and its require), and each page's .html,
 *   picture .png and color mode
 * @output each picture taken, with what the browser measured in it, or why
 *   none was, with the facts a caller words its own advice from
 * @position used by the theme editor's previews (api/theme-edit/_preview.mjs);
 *   runs the picture scripts in foundation/render (picture-playwright.mjs,
 *   picture-chrome.mjs)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {spawn} from 'node:child_process';
import * as os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {PICTURE_TAKEN} from '../render/picture-window.mjs';
import {FONT_PROBE_PREFIX} from '../render/font-probe.mjs';
import {CUT_SHORT_PREFIX} from '../render/cut-short.mjs';
import {LOW_CONTRAST_PREFIX} from '../render/drawn-contrast.mjs';
import {PART_BOXES_PREFIX} from '../render/part-boxes.mjs';

/** The script that takes one picture through the project's Playwright. */
const PLAYWRIGHT_PICTURE = fileURLToPath(
  new URL('../render/picture-playwright.mjs', import.meta.url),
);

/** The script that takes one picture through a Chrome or Chromium. */
const CHROME_PICTURE = fileURLToPath(
  new URL('../render/picture-chrome.mjs', import.meta.url),
);

/** How long a stopped browser may take to close before it is killed. */
const STOP_GRACE_MS = 5_000;

/** The signals that stop a picture run, the terminal closing among them. */
const STOP_SIGNALS = /** @type {const} */ (['SIGINT', 'SIGTERM', 'SIGHUP']);

/** How long a browser may take for one picture before it is stopped. */
export const BROWSER_BOUND_MS = 60_000;

/**
 * What the pictures of one run share: the browsers that failed or hung,
 * each with its reason, so a later picture does not wait on them again.
 * @typedef {{failed: Map<string, string>}} PictureRun
 */

/** A new picture run. @returns {PictureRun} */
export function newPictureRun() {
  return {failed: new Map()};
}

/** The time a batch adds to its browser's bound for each page after the first. */
const PAGE_BOUND_MS = 20_000;

/**
 * One picture of {@link takePictures}: taken, with its PNG and what was
 * measured in it; a run that ended with a stated reason; or the first not
 * taken, with the facts its caller words its advice from.
 * @typedef {{ok: true, png: string, notes: string[], boxes?: Record<string, Array<[number, number]>>, cutShort?: Array<{part: string | null, text: string, whole: boolean, broken?: boolean, overlaps?: boolean}>, lowContrast?: Array<{part: string, text: string, ratio: number, fg: string, bg: string}>} | {ok: false, reason: string, stopped?: string} | {ok: false, failed: string[], pwFound: boolean, pwMissing: boolean, chrome: string | null}} TakenPicture
 */

/**
 * Whole-page PNGs of HTML files, all with one browser: a Playwright the
 * project has installed, else a Chrome or Chromium found on the machine.
 * One browser start for the whole batch, a few pages drawn at once, so a
 * run of many pictures costs about one start. Each browser gets its own
 * time bound, and the next one the pictures still to take when one fails
 * or hangs. A result for each picture, in order, up to the first that was
 * not taken. A taken picture has its `png` path, its `notes` (why an
 * earlier browser did not take it, and the fonts this machine draws in
 * place of a stack) and what the browser's script measured in the page:
 * the text drawn cut short (`cutShort`), the text too faint to read
 * (`lowContrast`) and each asked part's drawn sizes (`boxes`), each absent
 * when nothing was measured. A run that was stopped, or that could not
 * make its temp folder, ends with a result that says so in `reason`.
 * Otherwise the first picture not taken ends the list with what the caller
 * needs to word its own advice: each browser's reason (`failed`), whether
 * a Playwright was found (`pwFound`) and whether it had no browser of its
 * own (`pwMissing`), and the Chrome found, if any (`chrome`).
 * @param {{cwd: string, req?: NodeJS.Require, from?: string}} at the
 *   project: its folder, whose path no reason shows, and the require that
 *   finds its Playwright (`req`), or a file whose folder it resolves from
 *   (`from`)
 * @param {Array<{html: string, png: string, mode: 'light' | 'dark', boxes?: string[]}>} jobs
 *   absolute paths; `boxes`: parts whose drawn sizes the picture measures
 * @param {PictureRun} [run] what earlier pictures of the same run learned:
 *   a browser that failed or hung there is not tried again
 * @returns {Promise<TakenPicture[]>}
 */
export async function takePictures(at, jobs, run = newPictureRun()) {
  const req =
    at.req ?? createRequire(at.from ?? path.join(at.cwd, 'package.json'));
  /** @type {TakenPicture[]} */
  const results = [];
  if (!jobs.length) return results;
  /** What was tried and why it could not take the picture. @type {string[]} */
  const failed = [...run.failed.values()];
  /** Whether a Playwright was found without its own browser installed. */
  let pwMissing = false;
  /** Whether a Playwright was found at all. */
  let pwFound = false;
  /** A line with no path of this machine. @param {string} line */
  const local = line => line.split(at.cwd).join('.');
  /**
   * Why a browser did not take the picture: Playwright's first line names
   * only the call ("browserType.launch: Target … closed"); the cause, such
   * as a missing library, is in a later line, so that line comes too.
   * Chrome's startup warnings (dbus, GPU) are not a cause.
   * @param {string} text
   */
  const causeOf = text => {
    const lines = String(text ?? '')
      .split('\n')
      .map(l => l.replace(/^[\s=<>-]+/, '').trim())
      .filter(Boolean);
    const head =
      meaningfulLine(lines.join('\n')) || 'it stopped with no message';
    const rest = lines
      .slice(lines.indexOf(head) + 1)
      .find(l =>
        /error|cannot|can't|missing|not found|while loading|no such|failed|denied/i.test(
          l,
        ),
      );
    return local(rest ? `${head} (${rest})` : head);
  };
  /** The browsers to try, in order: each a picture script and its first argument. */
  /** @type {Array<{who: string, script: string, first: string}>} */
  const tries = [];
  for (const pkg of ['playwright', 'playwright-core']) {
    try {
      const entry = req.resolve(pkg);
      pwFound = true;
      tries.push({
        who: `${pkg}'s own browser`,
        script: PLAYWRIGHT_PICTURE,
        first: entry,
      });
      break;
    } catch {
      // Not installed here.
    }
  }
  const chrome = chromeBinary();
  if (chrome) tries.push({who: chrome, script: CHROME_PICTURE, first: chrome});
  for (const t of tries) {
    if (run.failed.has(t.who)) continue;
    const rest = jobs.slice(results.length);
    const r = await runBrowser(
      t.script,
      [t.first, JSON.stringify(rest)],
      BROWSER_BOUND_MS + (rest.length - 1) * PAGE_BOUND_MS,
      {drop: rest.map(j => j.png)},
    );
    if (r.stoppedBy) {
      results.push({
        ok: false,
        stopped: r.stoppedBy,
        reason: `the pictures were stopped (${r.stoppedBy}) before the browser finished`,
      });
      return results;
    }
    if (r.noTemp) {
      results.push({
        ok: false,
        reason: `no browser was started: the system temp folder cannot be written (${r.noTemp}), and a browser needs a profile folder of its own there; fix the temp folder (TMPDIR), then run the command again`,
      });
      return results;
    }
    // Each picture's own lines, by its place in this browser's share.
    /** @type {Map<number, string[]>} */
    const said = new Map();
    for (const line of String(r.stdout ?? '').split('\n')) {
      const tab = line.indexOf('\t');
      const i = Number(line.slice(0, tab));
      if (tab < 1 || !Number.isInteger(i)) continue;
      said.set(i, [...(said.get(i) ?? []), line.slice(tab + 1)]);
    }
    // The pictures it took whole, in order, up to the first it did not.
    for (const [i, job] of rest.entries()) {
      const lines = said.get(i) ?? [];
      if (!lines.includes(PICTURE_TAKEN) || !fs.existsSync(job.png)) break;
      const out = lines.join('\n');
      results.push({
        ok: true,
        png: job.png,
        notes: [
          ...(failed.length
            ? [`the picture was taken with ${t.who}; ${failed.join('; ')}`]
            : []),
          ...pictureFontNotes(out),
        ],
        ...measuredCutShort(out),
        ...measuredLowContrast(out),
        ...measuredBoxes(out),
      });
    }
    if (results.length === jobs.length) return results;
    // A share it did not finish is the next browser's.
    for (const job of jobs.slice(results.length))
      fs.rmSync(job.png, {force: true});
    const text = r.error ? String(r.error.message) : r.stderr;
    if (
      t.script === PLAYWRIGHT_PICTURE &&
      /Executable doesn't exist|playwright install/i.test(text)
    )
      pwMissing = true;
    const why = r.timedOut
      ? `${t.who} did not finish within ${(BROWSER_BOUND_MS + (rest.length - 1) * PAGE_BOUND_MS) / 1000} seconds, so it was stopped`
      : `${t.who} could not take it: ${causeOf(text || (r.status === 0 ? 'it stopped before every picture was taken' : ''))}`;
    run.failed.set(t.who, why);
    failed.push(why);
  }
  results.push({ok: false, failed, pwFound, pwMissing, chrome});
  return results;
}

/** The generic families any font of a common kind stands in for. */
const PLAIN_GENERICS = ['sans-serif', 'system-ui', 'ui-sans-serif'];

/**
 * What a picture shows in place of a font stack: a role whose stack ends in
 * a generic of a kind (serif, monospace, cursive) and none of whose named
 * families this machine has is drawn in this machine's font for that
 * generic, which may be of another kind (a system with no serif font draws
 * serif in a sans-serif one). A stack that ends in sans-serif falls back
 * to a font of its own kind, so it is not named.
 * @param {string} stdout what the picture script printed
 * @returns {string[]}
 */
export function pictureFontNotes(stdout) {
  const line = stdout.split('\n').find(l => l.startsWith(FONT_PROBE_PREFIX));
  if (!line) return [];
  /** @type {Record<string, {stack: string[], shown: string | null} | null>} */
  let probe;
  try {
    probe = JSON.parse(line.slice(FONT_PROBE_PREFIX.length));
  } catch {
    return [];
  }
  /** @type {string[]} */
  const out = [];
  for (const [role, label] of /** @type {const} */ ([
    ['heading', 'headings'],
    ['body', 'body text'],
  ])) {
    const r = probe?.[role];
    const generic = r?.stack.at(-1)?.toLowerCase();
    if (!r?.shown || !generic || PLAIN_GENERICS.includes(generic)) continue;
    const named = r.stack.slice(0, -1);
    const drawn = r.shown.toLowerCase();
    if (!named.length || named.some(f => f.toLowerCase() === drawn)) continue;
    out.push(
      `this machine has none of ${named.join(', ')}, so the pictures draw the ${label} in ${r.shown}, its font for ${generic}; a system with ${named[0]} shows them as set (an open font with its package installed shows everywhere, the pictures included)`,
    );
  }
  return out;
}

/**
 * The text a picture script measured cut short, from the line it prints
 * after `CUT_SHORT_PREFIX`; nothing when it printed none that reads.
 * @param {string} stdout what the picture script printed
 * @returns {{cutShort?: Array<{part: string | null, text: string, whole: boolean, broken?: boolean, overlaps?: boolean}>}}
 */
export function measuredCutShort(stdout) {
  const line = stdout.split('\n').find(l => l.startsWith(CUT_SHORT_PREFIX));
  if (!line) return {};
  /** @type {unknown} */
  let found;
  try {
    found = JSON.parse(line.slice(CUT_SHORT_PREFIX.length));
  } catch {
    return {};
  }
  if (!Array.isArray(found)) return {};
  return {
    cutShort: found
      .filter(x => x && typeof x.text === 'string')
      .map(x => ({
        part: typeof x.part === 'string' ? x.part : null,
        text: x.text,
        whole: x.whole === true,
        ...(x.broken === true ? {broken: true} : {}),
        ...(x.overlaps === true ? {overlaps: true} : {}),
      })),
  };
}

/**
 * The text a picture script measured too faint to read, from the line it
 * prints after `LOW_CONTRAST_PREFIX`; nothing when it printed none that
 * reads.
 * @param {string} stdout what the picture script printed
 * @returns {{lowContrast?: Array<{part: string, text: string, ratio: number, fg: string, bg: string}>}}
 */
export function measuredLowContrast(stdout) {
  const line = stdout.split('\n').find(l => l.startsWith(LOW_CONTRAST_PREFIX));
  if (!line) return {};
  /** @type {unknown} */
  let found;
  try {
    found = JSON.parse(line.slice(LOW_CONTRAST_PREFIX.length));
  } catch {
    return {};
  }
  if (!Array.isArray(found)) return {};
  return {
    lowContrast: found.filter(
      x =>
        x &&
        typeof x.part === 'string' &&
        typeof x.text === 'string' &&
        typeof x.ratio === 'number' &&
        /^#[0-9a-f]{6}$/.test(String(x.fg)) &&
        /^#[0-9a-f]{6}$/.test(String(x.bg)),
    ),
  };
}

/**
 * The part sizes a picture script measured, from the line it prints after
 * `PART_BOXES_PREFIX`; nothing when it printed none that reads.
 * @param {string} stdout what the picture script printed
 * @returns {{boxes?: Record<string, Array<[number, number]>>}}
 */
export function measuredBoxes(stdout) {
  const line = stdout.split('\n').find(l => l.startsWith(PART_BOXES_PREFIX));
  if (!line) return {};
  /** @type {unknown} */
  let found;
  try {
    found = JSON.parse(line.slice(PART_BOXES_PREFIX.length));
  } catch {
    return {};
  }
  if (!found || typeof found !== 'object' || Array.isArray(found)) return {};
  /** @type {Record<string, Array<[number, number]>>} */
  const boxes = {};
  for (const [part, list] of Object.entries(found))
    if (Array.isArray(list))
      boxes[part] = list.filter(
        (/** @type {unknown} */ b) =>
          Array.isArray(b) &&
          b.length === 2 &&
          b.every(n => typeof n === 'number'),
      );
  return {boxes};
}

/** A Chrome or Chromium on this machine, at a usual place or on PATH. */
export function chromeBinary() {
  const names = [
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
    'chrome',
  ];
  const fixed = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];
  // Only a file that runs: a folder or a file with no execute permission
  // by a browser's name is passed over, and the search goes on.
  /** @param {string} f */
  const runs = f => {
    try {
      if (!fs.statSync(f).isFile()) return false;
      if (process.platform !== 'win32') fs.accessSync(f, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  };
  for (const f of fixed) if (runs(f)) return f;
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    for (const n of names) {
      const f = path.join(dir, n);
      if (dir && runs(f)) return f;
    }
  }
  return null;
}

/**
 * Run a picture script (one browser, one picture) as its own process group,
 * without blocking this process. The one owner of every browser run:
 * - a temp folder of its own (TMPDIR, TMP, TEMP), where the browser keeps
 *   its profile; with none to make, nothing runs (`noTemp`);
 * - a time bound (`timedOut`);
 * - a stop (SIGINT, SIGTERM, SIGHUP) that reaches the run stops it
 *   (`stoppedBy`), then ends this process as the stop would have.
 * A stop or the bound asks the whole group to close, waits for it (killing
 * it past a short grace), then removes the temp folder and the `drop` files
 * (a picture part a stopped run leaves); a run that ends on its own removes
 * the temp folder only, and gives what the script wrote on its standard
 * output (`stdout`: what it measured in the page).
 * @param {string} script a picture script
 * @param {string[]} args
 * @param {number} [bound] milliseconds before the run is stopped
 * @param {{drop?: string[]}} [opts]
 * @returns {Promise<{status: number | null, signal: string | null, stderr: string, stdout?: string, error?: Error, stoppedBy?: string, timedOut?: boolean, noTemp?: string}>}
 */
export function runBrowser(script, args, bound = BROWSER_BOUND_MS, opts = {}) {
  const drop = opts.drop ?? [];
  /** @type {string} */
  let temp;
  try {
    temp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-browser-'));
  } catch (e) {
    return Promise.resolve({
      status: null,
      signal: null,
      stderr: '',
      noTemp: String(/** @type {any} */ (e)?.code ?? e),
    });
  }
  return new Promise(resolve => {
    let stderr = '';
    let stdout = '';
    const posix = process.platform !== 'win32';
    const child = spawn(process.execPath, [script, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {...process.env, TMPDIR: temp, TMP: temp, TEMP: temp},
      // A group of its own, so a stop reaches the browser it starts too.
      detached: posix,
    });
    /** @param {NodeJS.Signals} sig */
    const signalAll = sig => {
      try {
        if (posix && child.pid) process.kill(-child.pid, sig);
        else child.kill(sig);
      } catch {
        // Gone already.
      }
    };
    const closed = new Promise(done => child.once('close', done));
    /** @param {string[]} files */
    const remove = files => {
      for (const f of files)
        try {
          fs.rmSync(f, {recursive: true, force: true});
        } catch {
          // Gone already.
        }
    };
    /** The temp folder goes on every way out; `drop` only with a stop. */
    const clean = () => remove([temp]);
    /** Close the group (killed past the grace), then clean up. */
    const finish = async () => {
      signalAll('SIGTERM');
      const grace = new Promise(done =>
        setTimeout(done, STOP_GRACE_MS).unref(),
      );
      if ((await Promise.race([closed.then(() => true), grace])) !== true) {
        signalAll('SIGKILL');
        await closed;
      }
      remove([temp, ...drop]);
    };
    // This process ending some other way: the group is killed, and the temp
    // folder and the unfinished files removed, as far as an exit allows.
    const onExit = () => {
      signalAll('SIGKILL');
      remove([temp, ...drop]);
    };
    process.once('exit', onExit);
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', d => {
      if (stderr.length < 8000) stderr += d;
    });
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', d => {
      // Room for every line the script prints: the fonts, and the text cut
      // short on a page of every component.
      if (stdout.length < 64_000) stdout += d;
    });
    /** Set once the run is being stopped (bound, signal): it ends there. */
    let stopping = false;
    let settled = false;
    /** @param {Awaited<ReturnType<typeof runBrowser>>} out */
    const settle = out => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      process.removeListener('exit', onExit);
      for (const sig of STOP_SIGNALS) process.removeListener(sig, onStop);
      resolve(out);
    };
    const timer = setTimeout(() => {
      stopping = true;
      void finish().then(() =>
        settle({status: null, signal: null, stderr, timedOut: true}),
      );
    }, bound);
    /** @param {NodeJS.Signals} sig */
    const onStop = async sig => {
      stopping = true;
      for (const s of STOP_SIGNALS) process.removeListener(s, onStop);
      // A second stop during the grace does not wait for it: the group is
      // killed and the files removed at once, then the process ends.
      /** @param {NodeJS.Signals} again */
      const onAgain = again => {
        for (const s of STOP_SIGNALS) process.removeListener(s, onAgain);
        signalAll('SIGKILL');
        remove([temp, ...drop]);
        if (process.listenerCount(again) === 0)
          process.kill(process.pid, again);
      };
      for (const s of STOP_SIGNALS) process.once(s, onAgain);
      await finish();
      for (const s of STOP_SIGNALS) process.removeListener(s, onAgain);
      settle({status: null, signal: null, stderr, stoppedBy: sig});
      // Nothing else listening: the stop ends this process, as it would
      // have without this listener.
      if (process.listenerCount(sig) === 0) process.kill(process.pid, sig);
    };
    for (const sig of STOP_SIGNALS) process.once(sig, onStop);
    child.once('error', error => {
      clean();
      settle({status: null, signal: null, stderr, error});
    });
    child.once('close', (status, signal) => {
      if (stopping) return;
      clean();
      settle({status, signal, stderr, stdout});
    });
  });
}

/**
 * The first stderr line that says something about the picture: Chrome's
 * startup warnings (dbus, GPU, sandbox notices) come first on Linux and
 * say nothing about why no picture was written.
 * @param {string} text
 */
export function meaningfulLine(text) {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);
  return (
    lines.find(
      l =>
        !/dbus|bus\.cc|gpu_|gl_|sandbox|fontconfig|crashpad|DevTools listening|WARNING:/i.test(
          l,
        ),
    ) ??
    lines[0] ??
    ''
  );
}
