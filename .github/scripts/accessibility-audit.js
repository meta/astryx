#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.


/**
 * @description Runs accessibility audits on component stories using axe-core
 * @input --storybook-dir <path> --output <file> [--components <comma-separated>]
 *   [--stories <comma-separated-story-ids>] [--port <number, 0 = any free>]
 *   [--ready-selector <css-selector>] [--concurrency <pages, default 1>]
 *   [--shard <i>/<n> --shard-output <file>] (scan every n-th story, write it)
 *   [--merge-shards <dir>] (read a complete shard set instead of scanning)
 *   --baseline <path> (compare violations against a checked-in baseline)
 *   --fail-on-new (exit 1 when violations not present in the baseline exist)
 *   --update-baseline (rewrite the baseline file from this run's report)
 * @output JSON report with accessibility violations; with --baseline, a gate
 *   summary (new / baselined / resolved) on stdout and a non-zero exit code
 *   when --fail-on-new finds regressions. Diff logic lives in
 *   lib/a11y-baseline.js. Pages are scanned with animations held at their end
 *   state.
 * @position Blocking PR accessibility audit; scoped stories share canonical
 *   package-qualified ownership with the RTL audit.
 */

const { chromium } = require('playwright');
const { AxeBuilder } = require('@axe-core/playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {
  COMPONENT_PACKAGES,
  flatPackageComponentNames,
  nestedPackageComponentNames,
} = require('../../scripts/component-packages.cjs');
const {
  buildBaseline,
  diffAgainstBaseline,
  formatDiffSummary,
  storyKey,
} = require('./lib/a11y-baseline');
const {waitForStoryReadiness} = require('./lib/a11y-story-readiness');
const {
  mergeA11yShards,
  parseShard,
  readShardFiles,
  readStorybookSha,
  shardFile,
  shardItems,
} = require('./lib/a11y-shards');
const {
  legacyBaselineStoryKeys,
  ownerForA11yStory,
} = require('./lib/a11y-story-identity');

const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 ? args[idx + 1] : null;
};
const hasFlag = (name) => args.includes(`--${name}`);

const storybookDir = getArg('storybook-dir') || 'apps/storybook/dist';
const outputFile = getArg('output') || 'a11y-report.json';
const port = Number(getArg('port') || 6007);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error(`Invalid --port value: ${getArg('port')}`);
}
const componentsArg = getArg('components');
const components = (componentsArg || '').split(',').filter(Boolean);
const storiesArg = getArg('stories');
const requestedStories = (storiesArg || '').split(',').filter(Boolean);
// --components present but EMPTY means the caller derived an explicit empty
// audit set (pr-a11y on a PR whose core/src changes map to no component —
// e.g. a shared test file). Audit nothing and pass. Only an ABSENT flag
// means "all stories" (the full release-check contract).
const emptyComponentSet = componentsArg !== null && components.length === 0;
if (storiesArg !== null && requestedStories.length === 0) {
  throw new Error('--stories requires at least one story id');
}
// Stories scanned at once, each on its own page in the shared context. The
// report is assembled in story order afterwards, so it does not depend on
// which page finishes first.
const concurrencyArg = getArg('concurrency');
const concurrency = Number(concurrencyArg ?? 1);
if (!Number.isInteger(concurrency) || concurrency < 1) {
  throw new Error(`Invalid --concurrency value: ${concurrencyArg}`);
}
// A sharded audit: each `--shard i/n` job scans every n-th story and writes
// only its per-story results; `--merge-shards` then builds the report (and
// applies the baseline gate) from the complete set, exactly as one run would.
const shardArg = getArg('shard');
const shardOutput = getArg('shard-output');
const mergeShardsDir = getArg('merge-shards');
const shard = shardArg === null ? null : parseShard(shardArg);
if ((shard === null) !== (shardOutput === null)) {
  throw new Error('--shard and --shard-output must be given together');
}
if (shard !== null && mergeShardsDir !== null) {
  throw new Error('--shard and --merge-shards cannot be combined');
}
const baselineFile = getArg('baseline');
const readySelector = getArg('ready-selector');
const failOnNew = hasFlag('fail-on-new');
const updateBaseline = hasFlag('update-baseline');

// Held at the end state before every scan, the way the visual gate does it
// (visual-gate/lib/capture.mjs). axe blends an element's opacity into the
// foreground color, so a scan that lands mid-transition measures a frame no
// user is expected to read: Markdown's streaming fade reported contrast of
// 1.63 on text whose resting color is #171717, on ~1 run in 6.
const FREEZE_CSS = `
*, *::before, *::after {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  animation-iteration-count: 1 !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
}
`;

// Rules to disable — these are Storybook-context false positives, not component issues
const DISABLED_RULES = [
  'html-has-lang',        // Storybook controls <html>, not the component
  'document-title',       // iframe has no <title>, irrelevant for components
  'landmark-one-main',    // component stories are fragments, not full pages
  'page-has-heading-one', // same — not a full page
  'region',               // content doesn't need to be in landmarks in story isolation
];

// Wait until the story stops moving before scanning it. A story can paint
// its content and still be laying out (a scroll container sized by an effect,
// a grid scrolled to its initial position), and axe measures whatever frame it
// lands on: scanned mid-layout, a region that will not scroll reports
// `scrollable-region-focusable`. Fonts, two frames, then the geometry of the
// story root's elements sampled until two consecutive reads agree.
async function settleLayout(page) {
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page.evaluate(
    () =>
      new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  let previous = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const geometry = await page.evaluate(() =>
      [...document.querySelectorAll('#storybook-root *')]
        .map(element => {
          const box = element.getBoundingClientRect();
          return `${Math.round(box.x)},${Math.round(box.y)},${Math.round(box.width)},${Math.round(box.height)},${element.scrollWidth},${element.scrollHeight}`;
        })
        .join('|'),
    );
    if (geometry === previous) return;
    previous = geometry;
    await page.waitForTimeout(25);
  }
}

// Simple static file server
function createServer(dir, port) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let filePath = path.join(dir, req.url === '/' ? 'index.html' : req.url);
      filePath = filePath.split('?')[0];

      // Prevent path traversal — ensure resolved path stays within served directory
      const resolved = path.resolve(filePath);
      if (!resolved.startsWith(path.resolve(dir))) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      const ext = path.extname(filePath);
      const contentTypes = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
      };

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain' });
        res.end(data);
      });
    });

    server.listen(port, () => {
      console.log(
        `Storybook server running on http://localhost:${server.address().port}`,
      );
      resolve(server);
    });
  });
}

// Get stories from storybook
async function getStories(storybookPath) {
  const storiesJsonPath = path.join(storybookPath, 'index.json');

  let data;
  try {
    data = JSON.parse(fs.readFileSync(storiesJsonPath, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read Storybook index: ${error.message}`, {
      cause: error,
    });
  }
  const stories = data.entries || data.stories;
  if (
    stories == null ||
    typeof stories !== 'object' ||
    Array.isArray(stories)
  ) {
    throw new Error('Storybook index does not contain a story entries object');
  }
  const hasRunnableStory = Object.entries(stories).some(
    ([id, story]) => story?.type === 'story' && !id.endsWith('--docs'),
  );
  if (!hasRunnableStory) {
    throw new Error('Storybook index contains no runnable story entries');
  }
  return stories;
}

async function routedStoryIds(stories, componentFilters) {
  const {
    buildStoryComponentRoutes,
    componentRoutesForFilters,
    storyIdsForComponentFilters,
    unresolvedComponentFilters,
  } = await import(
    '../../apps/storybook/rtl-audit/rtl-audit-coverage.mjs'
  );
  const publicComponentsByPackage = Object.fromEntries(
    COMPONENT_PACKAGES.map(pkg => [
      pkg.name,
      pkg.layout === 'flat'
        ? flatPackageComponentNames(process.cwd(), pkg)
        : nestedPackageComponentNames(process.cwd(), pkg),
    ]),
  );
  const targets = JSON.parse(
    fs.readFileSync(
      path.resolve('apps/storybook/rtl-audit/targets.json'),
      'utf8',
    ),
  );
  const routes = buildStoryComponentRoutes({
    stories: Object.entries(stories)
      .filter(([id, story]) => story.type === 'story' && !id.endsWith('--docs'))
      .map(([id, story]) => ({
        id,
        title: story.title || '',
      })),
    targets,
    publicComponentsByPackage,
  }).map(route => ({
    ...route,
    component: ownerForA11yStory(route.id) ?? route.component,
  }));
  const selectedRoutes = componentRoutesForFilters(routes, componentFilters);
  const ownerStoryRoutes = {};
  for (const route of selectedRoutes) {
    ownerStoryRoutes[route.component] ??= [];
    if (!ownerStoryRoutes[route.component].includes(route.id)) {
      ownerStoryRoutes[route.component].push(route.id);
    }
  }
  return {
    routes: selectedRoutes,
    allRoutes: routes,
    storyIds: storyIdsForComponentFilters(routes, componentFilters),
    unresolvedFilters: unresolvedComponentFilters(routes, componentFilters),
    ownerStoryRoutes,
  };
}

async function runAccessibilityAudit() {
  console.log('Starting accessibility audit...');
  fs.rmSync(outputFile, {force: true});

  if (emptyComponentSet) {
    console.log('No components to audit (--components is empty) — skipping.');
    const report = {
      components: {},
      summary: { componentsAudited: 0, totalViolations: 0 },
    };
    fs.writeFileSync(outputFile, JSON.stringify(report, null, 2));
    return report;
  }

  console.log(`Components to audit: ${components.length > 0 ? components.join(', ') : 'all affected'}`);

  const storybookPath = path.resolve(process.cwd(), storybookDir);

  if (!fs.existsSync(storybookPath)) {
    throw new Error(`Storybook build not found at ${storybookPath}`);
  }

  // Get stories
  const stories = await getStories(storybookPath);
  const storyIds = Object.keys(stories);

  console.log(`Found ${storyIds.length} stories`);

  // Reuse the same canonical package-qualified owner map as the RTL audit.
  // Grouped Storybook titles such as Charts/Chrome/Legend and the historical
  // Lab/RichTextEditor namespace otherwise resolve to zero stories here.
  const routed = await routedStoryIds(stories, components);
  if (routed.unresolvedFilters.length > 0) {
    throw new Error(
      `No owned Storybook stories resolved for: ${routed.unresolvedFilters.join(', ')}`,
    );
  }
  for (const [owner, ownedStoryIds] of Object.entries(
    routed.ownerStoryRoutes,
  )) {
    console.log(`Owner route: ${owner} -> ${ownedStoryIds.join(', ')}`);
  }
  const routedIds = new Set(routed.storyIds);
  const requestedStoryIds = new Set(requestedStories);
  const relevantStories = storyIds.filter(id => {
    if (id.endsWith('--docs')) return false;
    return (
      routedIds.has(id) &&
      (storiesArg === null || requestedStoryIds.has(id))
    );
  });
  if (storiesArg !== null) {
    const unresolvedStories = requestedStories.filter(
      id => !relevantStories.includes(id),
    );
    if (unresolvedStories.length > 0) {
      throw new Error(
        `Requested stories did not resolve in the selected component scope: ${unresolvedStories.join(', ')}`,
      );
    }
  }

  // Group stories for scanning while retaining the legacy display identity for
  // safe baseline migration.
  const storyGroups = {};
  const storyKeyById = new Map(
    storyIds
      .filter(id => !id.endsWith('--docs'))
      .map(id => {
        const story = stories[id];
        const component = (story.title || '').split('/').pop() || id;
        return [id, storyKey(component, story.name || id)];
      }),
  );
  for (const storyId of relevantStories) {
    const story = stories[storyId];
    const component = (story.title || '').split('/').pop() || storyId;
    if (!storyGroups[component]) {
      storyGroups[component] = [];
    }
    storyGroups[component].push({id: storyId, ...story});
  }

  console.log(`Auditing ${Object.keys(storyGroups).length} components`);

  // A merge reads results; it starts no server and no browser.
  const scanning = mergeShardsDir === null;
  const server = scanning ? await createServer(storybookPath, port) : null;
  // The port the server actually holds: `--port 0` lets the OS pick a free one.
  const origin = server ? `http://localhost:${server.address().port}` : null;
  const browser = scanning ? await chromium.launch() : null;
  const componentResults = {};
  const auditedStoryIds = new Set();
  let totalViolations = 0;

  try {
    const context = scanning
      ? await browser.newContext({
          viewport: { width: 1280, height: 720 },
          reducedMotion: 'reduce',
        })
      : null;

    // Scan one story on a fresh page; returns its axe violations.
    const scanStory = async (component, story) => {
      const page = await context.newPage();
      try {
        const url = `${origin}/iframe.html?id=${story.id}&viewMode=story`;
        // Higher timeout to accommodate axe-core's heavier DOM analysis
        await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 15000,
        });
        await page.addStyleTag({ content: FREEZE_CSS }).catch(() => {});
        await waitForStoryReadiness(
          () =>
            page.evaluate(
              ({expectedOrigin, storyId}) => {
                const currentUrl = new URL(window.location.href);
                const root = document.querySelector('#storybook-root');
                return {
                  url: currentUrl.href,
                  urlMatches:
                    currentUrl.origin === expectedOrigin &&
                    currentUrl.pathname === '/iframe.html' &&
                    currentUrl.searchParams.get('id') === storyId,
                  errorVisible:
                    document.body.classList.contains('sb-show-errordisplay') ||
                    document.body.classList.contains('sb-show-nopreview'),
                  mainVisible:
                    document.body.classList.contains('sb-show-main'),
                  hasContent:
                    root != null &&
                    (root.childElementCount > 0 ||
                      (root.textContent ?? '').trim().length > 0),
                };
              },
              {expectedOrigin: origin, storyId: story.id},
            ),
          {timeoutMs: 5000, pollMs: 50},
        );
        if (readySelector != null) {
          await page.waitForSelector(readySelector, {
            state: 'visible',
            timeout: 5000,
          });
        }

        await settleLayout(page);

        // Run axe-core accessibility analysis
        const results = await new AxeBuilder({ page })
          .disableRules(DISABLED_RULES)
          .analyze();
        console.log(
          `✓ Audited: ${component} / ${story.name} - ${results.violations.length} issues`
        );
        return results.violations;
      } catch (e) {
        throw new Error(
          `Accessibility scan failed for selected story ${story.id}: ${e.message}`,
          {cause: e},
        );
      } finally {
        await page.close();
      }
    };

    const queue = Object.entries(storyGroups).flatMap(
      ([component, componentStories]) =>
        componentStories.map(story => ({component, story})),
    );
    const queueStoryIds = queue.map(({story}) => story.id);
    const storybookSha = readStorybookSha(storybookPath);
    let violationsByStory = new Map();
    if (!scanning) {
      violationsByStory = mergeA11yShards(readShardFiles(mergeShardsDir), {
        storyIds: queueStoryIds,
        storybookSha,
      });
      console.log(
        `Merged ${violationsByStory.size} audited stories from ${mergeShardsDir}`,
      );
    } else {
      const items = shard === null ? queue : shardItems(queue, shard);
      if (shard !== null) {
        console.log(
          `Shard ${shard.index}/${shard.count}: ${items.length} of ${queue.length} stories`,
        );
      }
      let next = 0;
      let failed = false;
      await Promise.all(
        Array.from({length: Math.min(concurrency, items.length)}, async () => {
          while (!failed && next < items.length) {
            const {component, story} = items[next++];
            try {
              violationsByStory.set(story.id, await scanStory(component, story));
            } catch (e) {
              failed = true;
              throw e;
            }
          }
        }),
      );
      if (shard !== null) {
        fs.writeFileSync(
          shardOutput,
          JSON.stringify(
            shardFile({
              storyIds: queueStoryIds,
              shard,
              storybookSha,
              violationsByStory,
            }),
          ),
        );
        console.log(`Shard results written to ${shardOutput}`);
        return null;
      }
    }

    for (const [component, componentStories] of Object.entries(storyGroups)) {
      const componentViolations = [];

      for (const story of componentStories) {
        const violations = violationsByStory.get(story.id);
        auditedStoryIds.add(story.id);
        if (violations.length > 0) {
          componentViolations.push({
            story: story.name || story.id,
            storyId: story.id,
            violations,
          });
          totalViolations += violations.length;
        }
      }

      // Aggregate violations for component — preserve counts and story context
      const violationMap = new Map();

      for (const storyResult of componentViolations) {
        for (const violation of storyResult.violations) {
          if (!violationMap.has(violation.id)) {
            violationMap.set(violation.id, {
              id: violation.id,
              impact: violation.impact,
              description: violation.description,
              help: violation.help,
              helpUrl: violation.helpUrl,
              tags: violation.tags,
              storyCount: 0,
              totalNodes: 0,
              stories: [],
              nodes: [],
            });
          }
          const agg = violationMap.get(violation.id);
          agg.storyCount++;
          agg.totalNodes += violation.nodes.length;
          agg.stories.push(storyResult.story);
          // Keep first 3 nodes for display (cap to avoid bloat)
          if (agg.nodes.length < 3) {
            agg.nodes.push(
              ...violation.nodes.slice(0, 3 - agg.nodes.length).map((n) => ({
                html: n.html.substring(0, 200),
                target: n.target,
              }))
            );
          }
        }
      }

      componentResults[component] = {
        storiesAudited: componentStories.length,
        violations: Array.from(violationMap.values()),
        storyDetails: componentViolations,
      };
    }
  } finally {
    await browser?.close();
    server?.close();
  }

  const auditedStories = routed.routes
    .filter(route => auditedStoryIds.has(route.id))
    .map(route => ({
      owner: route.component,
      storyId: route.id,
      legacyStoryKey: storyKeyById.get(route.id),
    }));
  const auditedStoryKeys = auditedStories.map(({owner, storyId}) =>
    storyKey(owner, storyId),
  );
  const ownerStoryKeys = {};
  for (const auditedStory of auditedStories) {
    ownerStoryKeys[auditedStory.owner] ??= [];
    ownerStoryKeys[auditedStory.owner].push(
      storyKey(auditedStory.owner, auditedStory.storyId),
    );
  }
  const legacyStoryOwners = {};
  for (const route of routed.allRoutes) {
    const legacyStory = storyKeyById.get(route.id);
    if (legacyStory == null) continue;
    legacyStoryOwners[legacyStory] ??= [];
    const canonicalStory = storyKey(route.component, route.id);
    if (!legacyStoryOwners[legacyStory].includes(canonicalStory)) {
      legacyStoryOwners[legacyStory].push(canonicalStory);
    }
  }

  const legacyBaselineAliases = {};
  for (const auditedStory of auditedStories) {
    for (const legacyStory of legacyBaselineStoryKeys(auditedStory.storyId)) {
      legacyBaselineAliases[legacyStory] ??= [];
      const canonicalStory = storyKey(
        auditedStory.owner,
        auditedStory.storyId,
      );
      if (!legacyBaselineAliases[legacyStory].includes(canonicalStory)) {
        legacyBaselineAliases[legacyStory].push(canonicalStory);
      }
    }
  }

  const report = {
    requestedStories,
    readySelector,
    ownerStoryRoutes: routed.ownerStoryRoutes,
    ownerStoryKeys,
    auditedStories,
    auditedStoryKeys,
    legacyStoryOwners,
    legacyBaselineAliases,
    components: componentResults,
    summary: {
      componentsAudited: Object.keys(componentResults).length,
      totalViolations,
      auditedAt: new Date().toISOString(),
    },
  };

  fs.writeFileSync(outputFile, JSON.stringify(report, null, 2));
  console.log(`\nAudit complete: ${totalViolations} total violations found`);
  console.log(`Report written to ${outputFile}`);

  return report;
}

// Read the baseline file; a missing file behaves as an empty baseline so
// every current violation counts as new.
function loadBaselineFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`Baseline file not found at ${filePath} — treating as empty`);
    return { version: 1, entries: [] };
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// Compare the report against the checked-in baseline (or rewrite it with
// --update-baseline). Returns the exit code for the process.
function applyBaselineGate(report) {
  if (!baselineFile) return 0;

  if (updateBaseline) {
    // Merge-aware: entries for components outside this (possibly
    // --components-scoped) run are preserved.
    const existing = fs.existsSync(baselineFile)
      ? JSON.parse(fs.readFileSync(baselineFile, 'utf8'))
      : null;
    fs.writeFileSync(
      baselineFile,
      JSON.stringify(buildBaseline(report, { existing }), null, 2) + '\n'
    );
    console.log(`Baseline written to ${baselineFile}`);
    return 0;
  }

  const baseline = loadBaselineFile(baselineFile);
  const diff = diffAgainstBaseline(report, baseline);
  console.log(formatDiffSummary(diff, { baselinePath: baselineFile }));

  if (diff.newViolations.length > 0 && failOnNew) {
    console.error(
      `\nFailing: ${diff.newViolations.length} accessibility violation(s) not in baseline.`
    );
    return 1;
  }
  return 0;
}

runAccessibilityAudit()
  .then((report) => {
    // A shard writes per-story results only; the merge run gates.
    if (report === null) return;
    const code = applyBaselineGate(report);
    if (code !== 0) process.exitCode = code;
  })
  .catch((e) => {
    console.error('Accessibility audit failed:', e);
    process.exit(1);
  });
