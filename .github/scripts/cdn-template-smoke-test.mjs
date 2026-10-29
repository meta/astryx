#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * CDN starter-page smoke test — scaffolds `astryx template --cdn` into a temp
 * directory, serves it, and opens it in headless Chromium. Fails on any console
 * error, page error, or failed request, and on a page that loaded without
 * rendering anything.
 *
 * This is the one recipe we ship that runs entirely outside the repo: no
 * bundler resolves its imports, no test double stands in for jsDelivr or
 * esm.sh, and the failure modes it is annotated against (a missing
 * react/jsx-runtime entry, a second React copy) are silent until a browser
 * executes it. Reading the file proves nothing; this does.
 *
 * Needs network access and `npx playwright install chromium`.
 *
 * Usage:
 *   node .github/scripts/cdn-template-smoke-test.mjs
 *
 * Exit code 0 = the page rendered clean
 * Exit code 1 = it did not
 */

import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {pageAssetUrls, primeCdnAssets} from './lib/cdn-asset-priming.mjs';
import {
  renderPage,
  renderUntilClean,
  uncleanFindings,
} from './lib/cdn-page-render.mjs';
import {resolvePublishedCdnVersion} from './lib/cdn-version.mjs';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const CLI = path.join(ROOT, 'packages/cli/clients/cli/bin/astryx.mjs');
const PAGE = 'cdn.template.html';
const ATTEMPTS = 2;

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-cdn-smoke-'));
const pagePath = path.join(tmpDir, PAGE);

function fail(message, detail) {
  console.log(`  FAIL  ${message}`);
  if (detail) console.log(detail);
  process.exitCode = 1;
}

// ── 1. Scaffold the page with the real CLI ───────────────────────────────────
fs.writeFileSync(
  path.join(tmpDir, 'package.json'),
  JSON.stringify({name: 'cdn-smoke', private: true}),
);
const scaffold = spawnSync(
  process.execPath,
  [CLI, '--json', 'template', '--cdn'],
  {
    cwd: tmpDir,
    encoding: 'utf8',
    timeout: 60_000,
  },
);
if (scaffold.status !== 0 || !fs.existsSync(pagePath)) {
  fail(`astryx template --cdn (exit ${scaffold.status})`, scaffold.stderr);
  process.exit(1);
}
const pinned = JSON.parse(scaffold.stdout).data.version;
console.log(`scaffolded ${PAGE} pinned to ${pinned}`);

// ── 2. Point the page at a version that is actually on the CDN ───────────────
// The pin is the owner-declared version in this checkout. It can remain
// unpublished throughout next-plan and release-branch PRs; branch consolidation
// writes changelogs without bumping package.json. Gating every PR on that exact
// version being on the CDN would block the whole release train on a build that
// cannot exist yet, so on an unpublished pin we re-point the page at npm's stable `latest`
// dist-tag and still assert the recipe. Registry `versions` keys are not a
// version-ordered API: the final key can be a canary that esm.sh has not built.
const metadata = await fetch('https://registry.npmjs.org/@astryxdesign/core')
  .then(r => r.json())
  .catch(() => null);
const rendered = resolvePublishedCdnVersion(metadata, pinned);
if (rendered == null) {
  fail('could not resolve a published stable version from the npm registry');
  process.exit(1);
}
if (rendered !== pinned) {
  console.log(
    `  note  ${pinned} is not published yet — rendering against ${rendered}`,
  );
  fs.writeFileSync(
    pagePath,
    fs.readFileSync(pagePath, 'utf8').replaceAll(`@${pinned}`, `@${rendered}`),
  );
}

// ── 3. Prime the CDN, so the browser's requests hit a built asset ───────────
// Both CDNs build a package on the first request that reaches them for it, and a
// request that arrives mid-build is answered with an error document that is then
// cached. A page pinned to a version published minutes ago therefore loads its
// CSS as `text/plain`, which Chromium rejects as an opaque response
// (net::ERR_BLOCKED_BY_ORB) and `networkidle` never settles on. Asking for the
// same URLs over plain HTTP starts and finishes the build first, and turns the
// remaining case into a line that names the asset instead of a navigation
// timeout at the end of a 17-minute run.
const PRIME_DEADLINE_MS = 120_000;
const assets = pageAssetUrls(fs.readFileSync(pagePath, 'utf8'));
const {cold} = await primeCdnAssets(assets, {deadlineMs: PRIME_DEADLINE_MS});
if (cold.length > 0) {
  fail(
    `${cold.length} page asset(s) did not serve within ${PRIME_DEADLINE_MS / 1000}s`,
    [
      '        Every URL below is one the starter page requests, so the page cannot render',
      '        without it. The text after :: is what the last request observed, and it',
      '        takes one of three shapes.',
      '',
      '        HTTP <status> with a sentence after it: the CDN answered and its own words',
      '        name what it could not find — jsDelivr separates the file from the release',
      '        version from the package, and esm.sh words a missing release its own way.',
      '        A release published minutes ago can still be building at that edge, so weigh',
      '        the sentence against the version this run resolved before reading it as a',
      '        URL a change broke.',
      '',
      '        HTTP <status> with nothing after it: it answered, and the error document did',
      '        not read, so the number is all there is to report.',
      '',
      '        An error name, with the transport reason in parentheses when there is one',
      '        (TypeError (ECONNREFUSED), or a bare TimeoutError when the request hung):',
      '        nobody answered at all, so the asset may be fine and the DNS, the route or',
      '        the CDN itself is the problem.',
      '',
      ...cold.map(({url, reason}) => `        ${url} :: ${reason}`),
    ].join('\n'),
  );
  fs.rmSync(tmpDir, {recursive: true, force: true});
  process.exit(1);
}

// ── 4. Serve it, so the page loads the way a deployed one would ─────────────
const server = http.createServer((req, res) => {
  const body = fs.readFileSync(pagePath);
  res.writeHead(200, {'content-type': 'text/html; charset=utf-8'});
  res.end(body);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;

// ── 5. Render, retrying once so a blip at a CDN is not a red build ───────────
// Every attempt shares the one 90 s wait this step has always had, so the retry
// adds no time to it: this step can start with under two minutes of the
// smoke-test job's 15-minute limit left, and a page that hangs on both
// attempts still prints the report naming what hung before the job is stopped.
const RENDER_BUDGET_MS = 90_000;
const result = await renderUntilClean(
  ({budgetMs}) =>
    renderPage(url, {launch: async () => chromium.launch(), budgetMs}),
  {
    attempts: ATTEMPTS,
    deadline: Date.now() + RENDER_BUDGET_MS,
    // The attempt a retry replaces is printed in full: a CDN blip that clears
    // on the retry still shows in the log, rather than vanishing behind a
    // green run.
    onRetry: (attempt, leftMs, discarded) => {
      console.log(
        `  retry ${attempt} of ${ATTEMPTS - 1}, ${Math.round(leftMs / 1000)} s left, after:`,
      );
      for (const finding of uncleanFindings(discarded)) {
        console.log(`        ${finding}`);
      }
    },
  },
);
server.close();

// ── 6. Report ────────────────────────────────────────────────────────────────
console.log(`\n${PAGE} @ ${rendered}`);
if (result.timedOut) {
  fail(
    'the page never went idle, so its navigation timed out',
    result.pendingRequests.length === 0
      ? '        no request was in flight when the wait gave up'
      : result.pendingRequests
          .map(entry => `        still in flight: ${entry}`)
          .join('\n'),
  );
}
for (const [label, entries] of [
  ['console error', result.consoleErrors],
  ['page error', result.pageErrors],
  ['failed request', result.failedRequests],
]) {
  if (entries.length === 0) {
    console.log(`  ok    no ${label}s`);
  } else {
    fail(
      `${entries.length} ${label}(s)`,
      entries.map(e => `        ${e}`).join('\n'),
    );
  }
}
if (result.button) {
  console.log(`  ok    rendered a button: "${result.button.trim()}"`);
} else if (!result.timedOut) {
  fail('the page loaded but rendered no button');
}

fs.rmSync(tmpDir, {recursive: true, force: true});
if (process.exitCode) {
  console.log('\nCDN starter page is broken.');
} else {
  console.log('\nCDN starter page renders clean.');
}
