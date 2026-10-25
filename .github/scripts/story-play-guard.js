#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @description Runs listed stories' play functions in real Chromium and fails when one throws
 * @input --storybook-dir <path> [--port <n>]
 * @output One line per story; exit 1 if a play function threw, the story errored, or it never finished
 *
 * A story's play function is the only place a geometry assertion can live —
 * getBoundingClientRect needs a real layout engine — but on its own it is
 * observed by nothing that can fail: Vitest collects only `*.test.*` files,
 * and the visual gate loads each story waiting for rendered DOM without
 * awaiting or inspecting the play result. A broken play assertion therefore
 * leaves every required check green (PR #3938 round 3).
 *
 * This guard closes that gap. It serves the built Storybook, loads each
 * listed story's iframe in Chromium, and listens on the preview channel for
 * the play outcome: `storyRendered` only fires after `play` resolves, and
 * any thrown assertion surfaces as `playFunctionThrewException` (or one of
 * its sibling error events). No outcome within the timeout also fails —
 * a story that cannot boot must not pass by silence.
 */

const {chromium} = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const args = process.argv.slice(2);
const getArg = name => {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 ? args[idx + 1] : null;
};

const storybookDir = getArg('storybook-dir') || 'apps/storybook/dist';
const port = Number(getArg('port') || 6010);

// Stories whose play assertions are load-bearing. Adding a story here is the
// whole cost of promoting its play function into required CI.
const TARGETS = [
  {
    component: 'Item',
    story: 'core-item--align-first-line',
    guards:
      'under align="first-line" every start and end slot centers on the label\'s first line (wrapped, clamped, dense, spacious, avatar, interactive, RTL, ListItem, RadioListItem) and never rises into the row padding',
  },
  {
    component: 'Selector',
    story: 'core-selector--size-variants',
    guards:
      'compact and wide-spacing triggers match their size tokens, large label text stays unclipped, and multiline values grow by one text row',
  },
  {
    component: 'MultiSelector',
    story: 'core-multiselector--sizes',
    guards: 'compact trigger variants match their size tokens',
  },
  {
    component: 'MultiSelector',
    story: 'core-multiselector--secondary-variant',
    guards:
      'the secondary trigger keeps its explicit 180px inline size while selected labels change',
  },
  {
    component: 'ComplexSelector',
    story: 'core-complexselector--secondary-variant',
    guards:
      'the secondary trigger keeps its explicit 190px inline size while the selected value changes',
  },
  {
    component: 'Code',
    story: 'core-code--colors',
    guards:
      'primary, secondary, and inherited text colors remain distinct and inheritance follows the surrounding text',
  },
  {
    component: 'Code',
    story: 'core-code--long-inline-content',
    guards:
      'an unbroken inline identifier wraps without overflowing its constrained prose container',
  },
  {
    component: 'Code',
    story: 'core-code--text-sizes',
    guards:
      'size="inherit" matches each surrounding font size and line height across distinct text roles',
  },
  {
    component: 'ChartTooltip',
    story: 'charts-chrome-tooltip--modal-layering',
    guards:
      'ChartTooltip stays continuously open across content-bearing points in ' +
      'nested Theme/MediaTheme scope above a native modal with nonzero geometry',
  },
  {
    component: 'ChartTheming',
    story: 'lab-charttheming-colorpicker--end-user-choices',
    guards:
      'Automatic, theme, custom, mode switching, and Reset update the selected chart color',
  },
  {
    component: 'ChartTheming',
    story: 'lab-charttheming-recharts--theme-tokens',
    guards:
      'Recharts resolves theme-aware resting colors and a same-series active-state tint in the browser',
  },
  {
    component: 'ChartTheming',
    story: 'lab-charttheming-recharts--runtime-theme-switch',
    guards:
      'Recharts keeps its SVG and focused chart surface while authored data colors switch modes',
  },
  {
    component: 'ChartTheming',
    story: 'lab-charttheming-recharts--square-bars',
    guards:
      'A chart can opt its bar geometry out of the theme radius without mutating the theme',
  },
  {
    component: 'ChartTheming',
    story: 'lab-charttheming-canvas--runtime-theme-switch',
    guards: 'Canvas redraws concrete theme colors on the same drawing surface',
  },
  {
    component: 'ChartTheming',
    story: 'lab-charttheming-vega--serialized-canvas-config',
    guards:
      'Vega receives serialized concrete values and explicitly rebuilds its View when config changes',
  },
  {
    component: 'ChatToolCalls',
    story: 'core-chattoolcalls--focused-grouped-detail',
    guards:
      'grouped detail focus ring remains visible inside the animated clip boundary',
  },
  {
    component: 'ChatToolCalls',
    story: 'core-chattoolcalls--narrow',
    guards: 'long metadata stays within the 320px narrow-container fixture',
  },
  {
    component: 'PowerSearch',
    story: 'core-powersearch--near-full-token-row',
    hasTouch: true,
    guards:
      'on a coarse pointer, an empty trailing combobox stays on the nearly full token row without overlapping the full Clear all hit area',
  },
  {
    component: 'PowerSearch',
    story: 'core-powersearch--near-full-token-row-rtl',
    hasTouch: true,
    guards:
      'on a coarse pointer, the compact combobox and full Clear all hit area remain separate in RTL as well',
  },
  {
    component: 'PowerSearch',
    story: 'core-powersearch--default-filters-beside-search',
    guards:
      'default filter tokens that reach past the field center never cover the search input, and pressing its center focuses it',
  },
  {
    component: 'PowerSearch (RTL)',
    story: 'core-powersearch--default-filters-beside-search-rtl',
    guards: 'default filter tokens never cover the search input in RTL as well',
  },
  {
    component: 'PowerSearch',
    story: 'core-powersearch--token-row-when-resting-styles-win',
    guards:
      'whichever single resting declaration of the empty search input outranks its empty-query override, the input stays on the token row and the field grows no blank row',
  },
  {
    component: 'Tokenizer',
    story: 'core-tokenizer--caret-placement',
    guards:
      'a focused empty combobox puts its caret right after the last token on the last row without moving tokens, and a row too full for the caret keeps its resting height and starts a new row only on focus, never for a read-only field',
  },
  {
    component: 'Tokenizer (RTL)',
    story: 'core-tokenizer--caret-placement',
    direction: 'rtl',
    guards:
      'the caret follows the last token at its inline end, and a too-full row stays one row at rest and while read-only, under RTL as well',
  },
  // spec:AST-059 — the layer runtime's viewport inset. Each story is one
  // claim of the record; the guard is its rendered evidence, at a desktop
  // viewport and at a phone's, because a cap that holds only where the
  // viewport is wider than the layer is no cap. Every play also asserts the
  // first painted frame equals the settled one (FR8).
  ...[
    {
      story: 'core-layer--content-fits-beside-trigger',
      guards:
        'FR2/FR4: a content-sized layer with room beside its trigger stays start-aligned at its content size',
    },
    {
      story: 'core-layer--content-does-not-fit-beside-trigger',
      guards:
        'FR2/FR4: unwrappable content flips at its size where it fits the viewport and is capped to the viewport where it does not',
    },
    {
      story: 'core-layer--explicit-size-near-edge',
      guards:
        'FR2: a 352px end-aligned layer 45px from the edge renders at min(352px, cap), on screen',
    },
    {
      story: 'core-layer--trigger-near-edge-flips',
      guards:
        'FR4: a 320px start-aligned layer near the end edge flips to end alignment and keeps the gutter',
    },
    {
      story: 'core-layer--neither-side-fits',
      guards:
        'FR2/FR4: a 1000px layer on a centred trigger slides inside the gutters where it fits the viewport and is capped where it does not',
    },
    {
      story: 'core-layer--trigger-near-the-bottom-flips',
      guards:
        'FR4: a layer placed below a trigger with no room below flips above, inside the block gutters',
    },
    {
      story: 'core-layer--wide-layer-near-the-bottom-flips',
      guards:
        'FR2/FR4: a layer wider than the room beside its trigger, placed below with no room below, is capped to the viewport and flips above',
    },
    {
      story: 'core-layer--taller-than-the-viewport',
      guards:
        'FR3: the layer box is capped to the viewport minus both block gutters',
    },
    {
      story: 'core-layer--anchor-leaves-the-viewport',
      guards:
        'FR5: an open layer follows its anchor out of the viewport with its size intact and does not pin to the edge',
    },
    {
      story: 'core-layer--anchor-already-off-screen',
      guards:
        'FR5/FR8: a layer opened with its anchor off-screen holds beside the anchor from its first frame',
    },
    {
      story: 'core-layer--app-declared-inset',
      guards:
        'FR6: LayerProvider inset lifts the bottom gutter so a layer flips above a trigger near a declared bar',
    },
    {
      story: 'core-layer--inset-changes-while-open',
      guards:
        'FR6/FR8: changing the provider inset moves an open layer in the same frame, with no later shift',
    },
    {
      story: 'core-layer--layer-opens-as-inset-arrives',
      guards:
        'FR6/FR8: a layer mounted open in the same commit as its provider is above the bar in its first frame',
    },
    {
      story: 'core-layer--measured-inset',
      guards:
        'FR6/FR8: an inset the app measures and declares before paint reaches the layer in that same frame',
    },
    {
      story: 'core-layer--portaled-outside-the-provider-subtree',
      guards:
        'FR6: a layer portaled out of its JSX position still receives the provider inset',
    },
    {
      story: 'core-layer--gutter-at-the-edge',
      guards:
        'FR1: a wrapping layer beside a flush trigger stops 16px short of the viewport edge',
    },
  ].flatMap(target => [
    {component: 'Layer', ...target},
    {
      component: 'Layer (phone)',
      ...target,
      viewport: {width: 390, height: 844},
      hasTouch: true,
    },
  ]),
  {
    component: 'FormLayout (phone)',
    story: 'core-formlayout--horizontal-labels',
    viewport: {width: 390, height: 844},
    guards:
      'below the 480px collapse, horizontal-labels controls fill the column, including a Selector with a short value',
  },
  {
    component: 'FormLayout',
    story: 'core-formlayout--horizontal-labels',
    viewport: {width: 481, height: 844},
    guards: 'just above the collapse, labels stay beside their controls',
  },
  {
    component: 'FormLayout audit (phone)',
    story: 'core-formlayout--audit-matrix',
    viewport: {width: 320, height: 844},
    guards:
      'all arrangements stay in the 320px viewport, horizontal columns retain order, horizontal-labels collapses, and required-default ARIA remains truthful',
  },
  {
    component: 'FormLayout audit (boundary)',
    story: 'core-formlayout--audit-matrix',
    viewport: {width: 481, height: 844},
    guards:
      'at 481px horizontal-labels remains a two-column grid while every arrangement stays in the viewport',
  },
  {
    component: 'FormLayout audit (RTL phone)',
    story: 'core-formlayout--audit-matrix',
    direction: 'rtl',
    viewport: {width: 320, height: 844},
    guards:
      'logical horizontal order mirrors under RTL while the collapsed horizontal-label layout stays in the phone viewport',
  },
  {
    component: 'FormLayout audit (RTL wide)',
    story: 'core-formlayout--audit-matrix',
    direction: 'rtl',
    guards:
      'logical horizontal order mirrors under RTL and wide horizontal-label pairs retain inline-start placement',
  },
  {
    component: 'Grid',
    story: 'core-grid--grid-span-with-long-content',
    guards:
      'a full-width GridSpan holding a Tokenizer with a long token stays within its 500px host',
  },
  {
    component: 'Grid audit (phone)',
    story: 'core-grid--audit-matrix',
    viewport: {width: 320, height: 900},
    guards:
      'fixed tracks retain logical order, capped responsive tracks collapse to one, and every grid stays inside the phone viewport',
  },
  {
    component: 'Grid audit (wide)',
    story: 'core-grid--audit-matrix',
    viewport: {width: 800, height: 900},
    guards:
      'capped responsive tracks reach three columns, auto-fit expands beyond auto-fill, and full span covers the explicit grid',
  },
  {
    component: 'Grid audit (RTL)',
    story: 'core-grid--audit-matrix',
    direction: 'rtl',
    viewport: {width: 800, height: 900},
    guards:
      'the rendered RTL wrapper mirrors fixed-track item order while responsive and span geometry remain bounded',
  },
  {
    component: 'TabList',
    story: 'core-tablist--full-bleed-geometry',
    guards:
      'isFullBleed strip/label geometry incl. clamp far side, and the real ' +
      'LayoutHeader paddingBlockEnd -> TabList isFullBleed dock (#2622)',
  },
];

const CONTENT_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function createServer(dir, listenPort) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const filePath = path
        .join(dir, req.url === '/' ? 'index.html' : req.url)
        .split('?')[0];

      const resolved = path.resolve(filePath);
      if (!resolved.startsWith(path.resolve(dir))) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      fs.readFile(resolved, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        res.writeHead(200, {
          'Content-Type': CONTENT_TYPES[path.extname(resolved)] || 'text/plain',
        });
        res.end(data);
      });
    });

    server.listen(listenPort, () => resolve(server));
  });
}

// Records the story's play outcome from the preview channel. `storyRendered`
// is emitted only after the play function resolves; every failure mode has
// its own event. Attached before any preview code runs so no event is missed.
function recordStoryOutcome() {
  window.__storyOutcome = {done: false, errors: []};
  const ERROR_EVENTS = [
    'playFunctionThrewException',
    'unhandledErrorsWhilePlaying',
    'storyThrewException',
    'storyErrored',
    'storyMissing',
  ];
  const describe = payload => {
    if (payload == null) return '';
    if (typeof payload === 'string') return payload;
    return [payload.name, payload.title, payload.message, payload.description]
      .filter(Boolean)
      .join(': ');
  };
  const attach = () => {
    const channel = window.__STORYBOOK_ADDONS_CHANNEL__;
    if (!channel) {
      setTimeout(attach, 50);
      return;
    }
    channel.on('storyRendered', () => {
      window.__storyOutcome.done = true;
    });
    for (const event of ERROR_EVENTS) {
      channel.on(event, payload => {
        window.__storyOutcome.errors.push(
          `${event}${describe(payload) ? ` — ${describe(payload)}` : ''}`,
        );
        window.__storyOutcome.done = true;
      });
    }
  };
  attach();
}

async function probe(page, target) {
  await page.addInitScript(recordStoryOutcome);
  const pointerQuery = target.hasTouch ? '&storyPlayPointer=coarse' : '';
  const globalsQuery = target.direction
    ? `&globals=direction:${target.direction}`
    : '';
  await page.goto(
    `http://localhost:${port}/iframe.html?id=${target.story}&viewMode=story${pointerQuery}${globalsQuery}`,
    {waitUntil: 'domcontentloaded', timeout: 30000},
  );
  await page.waitForFunction(
    () => window.__storyOutcome && window.__storyOutcome.done === true,
    null,
    {timeout: 30000},
  );
  return page.evaluate(expectedDirection => {
    const outcome = window.__storyOutcome;
    if (expectedDirection != null) {
      const directionRoot = document.querySelector('#storybook-root [dir]');
      if (directionRoot == null) {
        outcome.errors.push(
          `direction mismatch — expected ${expectedDirection}, but the story direction wrapper is missing`,
        );
      } else {
        const actualDirection = getComputedStyle(directionRoot).direction;
        if (actualDirection !== expectedDirection) {
          outcome.errors.push(
            `direction mismatch — expected ${expectedDirection}, received ${actualDirection}`,
          );
        }
      }
    }
    return outcome;
  }, target.direction ?? null);
}

async function run() {
  const dir = path.resolve(process.cwd(), storybookDir);
  if (!fs.existsSync(dir)) {
    console.error(`Storybook build not found at ${dir}`);
    return 1;
  }

  const server = await createServer(dir, port);
  const browser = await chromium.launch();
  let failures = 0;

  try {
    for (const target of TARGETS) {
      const context = await browser.newContext({
        viewport: target.viewport ?? {width: 1280, height: 900},
        hasTouch: target.hasTouch === true,
      });
      const page = await context.newPage();
      try {
        const outcome = await probe(page, target);
        if (outcome.errors.length > 0) {
          failures++;
          console.error(
            `✗ ${target.component} (${target.story}):\n    ${outcome.errors.join('\n    ')}`,
          );
        } else {
          console.log(
            `✓ ${target.component} (${target.story}): play passed — ${target.guards}`,
          );
        }
      } catch (e) {
        failures++;
        console.error(
          `✗ ${target.component} (${target.story}): no play outcome — ${e.message}`,
        );
      } finally {
        await page.close();
        await context.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  if (failures > 0) {
    console.error(
      `\nFailing: ${failures} story play function(s) did not pass.`,
    );
    return 1;
  }
  console.log('\nAll story play guards passed.');
  return 0;
}

run()
  .then(code => {
    process.exitCode = code;
  })
  .catch(e => {
    console.error('Story play guard failed:', e);
    process.exit(1);
  });
