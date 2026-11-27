// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Grades one workspace: type check, build, then the task probe in Chromium.
 * @input a workspace, its arm, its task, and a shared browser
 * @output a pass or fail with the reason, probe steps, screenshots, axe counts,
 *   the font requests whose abort Playwright refused as already answered, and
 *   an error for every other refused abort
 * @position Called by run.mjs after each agent run, and by its self-test
 */

import fs from 'node:fs';
import http from 'node:http';
import {createRequire} from 'node:module';
import path from 'node:path';
import {loadProbe} from './tasks.mjs';
import {run, tscErrorsIn} from './workspace.mjs';
import {runSteps} from './probe-kit.mjs';

const require = createRequire(import.meta.url);

const VIEWPORTS = {
  desktop: {viewport: {width: 1280, height: 800}},
  mobile: {viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true},
};

const ACTION_TIMEOUT_MS = 5000;

// The probe steps wait at most ACTION_TIMEOUT_MS. Probes that share the browser
// at the same time can miss that limit because of each other, not because of
// the app, so the probes of concurrent runs take turns.
let browserTurn = Promise.resolve();

/** Runs `probe` after every probe that started before it has settled. */
export function inBrowserTurn(probe) {
  const result = browserTurn.then(probe);
  browserTurn = result.catch(() => {});
  return result;
}

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
};

/**
 * Hosts a built app may still reach. A theme can load its font from a font
 * service while another library bundles its font, so both arms get their own
 * font and the screenshots compare like with like.
 */
export const ALLOWED_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);

export async function launchBrowser() {
  const {chromium} = await import('playwright-core');
  const executablePath = process.env.VIBE_EVAL_CHROMIUM || undefined;
  const server = process.env.HTTPS_PROXY || process.env.https_proxy;
  // The launch option, not a Chromium flag, so that route.fetch also uses the proxy.
  const proxy = server ? {server, bypass: '127.0.0.1,localhost'} : undefined;
  return chromium.launch({executablePath, args: ['--no-sandbox'], proxy});
}

export function isAllowedRequest(url, origin) {
  if (url.startsWith(origin)) return true;
  try {
    const {protocol, hostname} = new URL(url);
    return protocol === 'https:' && ALLOWED_HOSTS.has(hostname);
  } catch {
    return false;
  }
}

/** Serves a built app from 127.0.0.1 only; unknown paths get index.html. */
export function serveStatic(root) {
  const server = http.createServer((request, response) => {
    let file;
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      file = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
    } catch {
      response.statusCode = 400;
      response.end();
      return;
    }
    const relative = path.relative(root, file);
    const outside = relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
    if (outside || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(root, 'index.html');
    }
    response.setHeader('content-type', CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream');
    fs.createReadStream(file)
      .on('error', () => {
        response.statusCode = 500;
        response.end();
      })
      .pipe(response);
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const {port} = server.address();
      resolve({url: `http://127.0.0.1:${port}/`, close: () => new Promise(done => server.close(done))});
    });
  });
}

async function axeCounts(page) {
  const source = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
  await page.addScriptTag({content: source});
  return page.evaluate(async () => {
    const result = await window.axe.run(document, {runOnly: ['wcag2a', 'wcag2aa']});
    const counts = {critical: 0, serious: 0, moderate: 0, minor: 0};
    for (const violation of result.violations) {
      counts[violation.impact ?? 'minor'] += violation.nodes.length;
    }
    return {counts, rules: result.violations.map(violation => violation.id)};
  });
}

/** A font host that accepts a connection but never answers must not stall the page load. */
const FONT_TIMEOUT_MS = 3000;

/**
 * Playwright refuses to abort a route that another handler already answered.
 * That refusal is expected. Aborting a route whose page, context or browser has
 * closed resolves without an error. grade-playwright-pins.mjs checks both in Chromium.
 */
export const ALREADY_HANDLED = 'Route is already handled';

/** Whether `error` is Playwright's refusal to abort a route that is already answered. */
export function isAlreadyHandled(error) {
  return String(error?.message ?? error)
    .replace(/^route\.abort: /, '')
    .startsWith(ALREADY_HANDLED);
}

/** The first line of an error, at most 300 characters: a Playwright error can carry a call log with request headers. */
export function firstLine(error) {
  return String(error?.message ?? error)
    .split('\n', 1)[0]
    .slice(0, 300);
}

/** The address without its query: the grade keeps only where a request went. */
function originAndPath(url) {
  try {
    const {origin, pathname} = new URL(url);
    return `${origin}${pathname}`;
  } catch {
    return url.split(/[?#]/)[0];
  }
}

/** One error that names every font request whose abort failed, with the first line of each error. */
function abortFailure(failures) {
  const noun = failures.length === 1 ? 'request' : 'requests';
  const list = failures
    .map(({url, message}) => `${url}: ${message}`)
    .join('; ');
  return new Error(
    `Playwright could not abort ${failures.length} failed font ${noun}: ${list}`,
  );
}

/**
 * Blocks every request and socket except the local server and the allowed font
 * hosts. A font request that fails is aborted. When Playwright refuses that
 * abort because the route is already answered, `routeLog` records the address
 * in `alreadyHandledAborts`. Any other refusal goes to `abortFailures`.
 */
async function localOnly(context, origin, routeLog) {
  await context.route('**/*', async route => {
    const url = route.request().url();
    if (url.startsWith(origin)) return route.continue();
    if (!isAllowedRequest(url, origin)) return route.abort();
    try {
      await route.fulfill({response: await route.fetch({timeout: FONT_TIMEOUT_MS})});
    } catch {
      await route.abort().catch(error => {
        if (isAlreadyHandled(error))
          routeLog.alreadyHandledAborts.push(originAndPath(url));
        else
          routeLog.abortFailures.push({
            url: originAndPath(url),
            message: firstLine(error),
          });
      });
    }
  });
  const socketOrigin = origin.replace(/^http/, 'ws');
  await context.routeWebSocket(/.*/, socket => {
    if (socket.url().startsWith(socketOrigin)) socket.connectToServer();
    else socket.close();
  });
}

/** A context that reaches only allowed hosts and fails fast like the probe steps. */
async function openContext(browser, options, origin, routeLog) {
  const context = await browser.newContext(options);
  context.setDefaultTimeout(ACTION_TIMEOUT_MS);
  await localOnly(context, origin, routeLog);
  return context;
}

/** Records page errors and console errors, except for requests the grader blocked. */
function watchErrors(page, origin, pageErrors, consoleErrors) {
  page.on('pageerror', error => pageErrors.push(String(error.message ?? error)));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const source = message.location().url ?? '';
    if (message.text().startsWith('Failed to load resource') && source && !isAllowedRequest(source, origin)) return;
    consoleErrors.push(message.text().slice(0, 500));
  });
}

async function probeInBrowser({browser, url, task, outDir, routeLog}) {
  const steps = await loadProbe(task);
  const screenshots = {};
  const pageErrors = [];
  const consoleErrors = [];
  let axe;
  let probe;

  const desktop = await openContext(browser, VIEWPORTS.desktop, url, routeLog);
  try {
    const page = await desktop.newPage();
    watchErrors(page, url, pageErrors, consoleErrors);
    await page.goto(url, {waitUntil: 'load'});
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    screenshots.desktopInitial = path.join(outDir, 'desktop-initial.png');
    await page.screenshot({path: screenshots.desktopInitial, fullPage: true});
    axe = await axeCounts(page).catch(error => ({error: String(error)}));
    probe = await runSteps(steps(page));
    screenshots.desktopFinal = path.join(outDir, 'desktop-final.png');
    await page.screenshot({path: screenshots.desktopFinal, fullPage: true});
  } finally {
    await desktop.close();
  }

  const mobile = await openContext(browser, VIEWPORTS.mobile, url, routeLog);
  try {
    const phone = await mobile.newPage();
    watchErrors(phone, url, pageErrors, consoleErrors);
    await phone.goto(url, {waitUntil: 'load'});
    await phone.evaluate(() => document.fonts.ready);
    await phone.waitForTimeout(300);
    screenshots.mobileInitial = path.join(outDir, 'mobile-initial.png');
    await phone.screenshot({path: screenshots.mobileInitial, fullPage: true});
  } finally {
    await mobile.close();
  }

  return {probe, axe, pageErrors, consoleErrors, screenshots};
}

/**
 * Pass means: the type check and the build exit 0, every probe step passes,
 * and the page throws no uncaught error. The arm's own commands decide the
 * first two, so a broken config cannot pass by printing nothing. A refused
 * abort of a failed font request also fails the grade, unless Playwright
 * refused it because the route was already answered.
 */
export async function gradeWorkspace({workspace, arm, task, browser, outDir}) {
  fs.mkdirSync(outDir, {recursive: true});
  const grade = {passed: false, failure: null};

  const typecheck = await run(arm.typecheck, {cwd: workspace, timeoutMs: 180_000});
  grade.typecheck = {
    exitCode: typecheck.code,
    timedOut: typecheck.timedOut,
    errors: tscErrorsIn(typecheck.output, '.ts').length,
    tail: typecheck.output.slice(-3000),
  };
  const build = await run(arm.build, {cwd: workspace, timeoutMs: 300_000});
  const dist = path.join(workspace, 'dist');
  grade.build = {
    exitCode: build.code,
    timedOut: build.timedOut,
    tail: build.output.slice(-3000),
  };

  if (typecheck.code !== 0) grade.failure = 'typecheck';
  if (build.code !== 0 || !fs.existsSync(path.join(dist, 'index.html'))) {
    grade.failure ??= 'build';
    return grade;
  }

  const server = await serveStatic(dist);
  const routeLog = {alreadyHandledAborts: [], abortFailures: []};
  let thrown = null;
  try {
    Object.assign(
      grade,
      await inBrowserTurn(() =>
        probeInBrowser({browser, url: server.url, task, outDir, routeLog}),
      ),
    );
  } catch (error) {
    thrown = {error};
  } finally {
    await server.close();
  }
  // A route handler's error reaches no caller, so the grade reads the refused
  // aborts here, also after a probe that threw.
  grade.alreadyHandledAborts = routeLog.alreadyHandledAborts;
  if (routeLog.abortFailures.length > 0) {
    grade.failure ??= 'browser';
    grade.abortError = String(abortFailure(routeLog.abortFailures));
  }
  if (thrown !== null) {
    grade.failure ??= 'browser';
    grade.browserError = String(thrown.error);
    return grade;
  }
  if (!grade.probe.passed) grade.failure ??= 'probe';
  if (grade.pageErrors.length > 0) grade.failure ??= 'page-error';
  grade.passed = grade.failure === null;
  return grade;
}
