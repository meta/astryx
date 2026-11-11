// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Grades one workspace: type check, build, then the task probe in Chromium.
 * @input a workspace, its arm, its task, and a shared browser
 * @output a pass or fail with the reason, probe steps, screenshots, axe counts
 * @position Called by the self-test in run.mjs
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

/** Blocks every request and socket except the local server and the allowed font hosts. */
async function localOnly(context, origin) {
  await context.route('**/*', async route => {
    const url = route.request().url();
    if (url.startsWith(origin)) return route.continue();
    if (!isAllowedRequest(url, origin)) return route.abort();
    try {
      await route.fulfill({response: await route.fetch({timeout: FONT_TIMEOUT_MS})});
    } catch {
      await route.abort().catch(() => {});
    }
  });
  const socketOrigin = origin.replace(/^http/, 'ws');
  await context.routeWebSocket(/.*/, socket => {
    if (socket.url().startsWith(socketOrigin)) socket.connectToServer();
    else socket.close();
  });
}

/** A context that reaches only allowed hosts and fails fast like the probe steps. */
async function openContext(browser, options, origin) {
  const context = await browser.newContext(options);
  context.setDefaultTimeout(ACTION_TIMEOUT_MS);
  await localOnly(context, origin);
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

async function probeInBrowser({browser, url, task, outDir}) {
  const steps = await loadProbe(task);
  const screenshots = {};
  const pageErrors = [];
  const consoleErrors = [];
  let axe;
  let probe;

  const desktop = await openContext(browser, VIEWPORTS.desktop, url);
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

  const mobile = await openContext(browser, VIEWPORTS.mobile, url);
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
 * first two, so a broken config cannot pass by printing nothing.
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
  try {
    Object.assign(grade, await probeInBrowser({browser, url: server.url, task, outDir}));
  } catch (error) {
    grade.failure ??= 'browser';
    grade.browserError = String(error);
    return grade;
  } finally {
    await server.close();
  }
  if (!grade.probe.passed) grade.failure ??= 'probe';
  if (grade.pageErrors.length > 0) grade.failure ??= 'page-error';
  grade.passed = grade.failure === null;
  return grade;
}
