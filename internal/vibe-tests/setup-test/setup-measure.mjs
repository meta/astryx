#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/** Build, serve, and measure one copied canonical fixture in two color schemes.
 *
 * The build never runs in the sandbox it measures. The agent's sandbox is the
 * attested artifact — its bytes are what the runner digested and what integrity
 * and any later recovery read — so it is copied into a disposable build root
 * first and only the copy is built and served. See `setup-workspace.mjs`. The
 * integrity analysis still reads the original, because the original is the
 * thing being attested.
 */

import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {analyzeSetupIntegrity} from './setup-integrity.mjs';
import {openInteractionState} from './setup-interactions.mjs';
import {validatePromptContracts} from './setup-matrix.mjs';
import {createMeasurementWorkspace} from './setup-workspace.mjs';
import {
  assertPublicArtifactSafe,
  publicProvenance,
  sanitizePublicArtifact,
} from '../src/public-artifact.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../..');

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) continue;
    const key = argument.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      parsed[key] = next;
      index += 1;
    } else {
      parsed[key] = true;
    }
  }
  return parsed;
}

export const normalizeSubpixel = value => Math.round(value * 64) / 64;

export function parseLayerOrder(css) {
  const order = [];
  for (const match of css.matchAll(/@layer\s+([^;{]+)\s*[;{]/g)) {
    for (const name of match[1].split(',').map(part => part.trim())) {
      if (/^[a-zA-Z0-9_-]+$/.test(name) && !order.includes(name)) {
        order.push(name);
      }
    }
  }
  return order;
}

/**
 * Run the app's build.
 *
 * `CI=true` and piped stdio keep it non-interactive: a package manager or
 * bundler that finds no TTY must not stop to ask anything, and a spinner that
 * probes for one must not error out. Measurement is unattended by definition.
 *
 * pnpm is a .cmd (batch) file on Windows; spawnSync can only run a batch
 * file through a shell, so shell out through cmd.exe /c directly rather than
 * spawnSync's shell:true. See internal/vibe-tests/src/fixture-suite.mjs for
 * the same pattern.
 */
function build(appDir) {
  const started = Date.now();
  const result =
    process.platform === 'win32'
      ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'pnpm', 'build'], {
          cwd: appDir,
          encoding: 'utf8',
          env: {...process.env, CI: 'true'},
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      : spawnSync('pnpm', ['build'], {
          cwd: appDir,
          encoding: 'utf8',
          env: {...process.env, CI: 'true'},
          stdio: ['ignore', 'pipe', 'pipe'],
        });
  return {
    ok: result.status === 0,
    status: result.status ?? -1,
    ms: Date.now() - started,
    stdout: (result.stdout ?? '').slice(-4000),
    stderr: (result.stderr ?? '').slice(-4000),
  };
}

export function classifyCssAssets(files) {
  if (files.length === 0) return ['missing-css-asset'];
  if (files.length > 1) return [`multiple-css-assets:${files.join(',')}`];
  return [];
}

export function measurementPrivateValues({
  appDir,
  outFile,
  buildDir = null,
  environment = process.env,
  cwd = process.cwd(),
  repoRoot = REPO_ROOT,
}) {
  return [
    appDir,
    buildDir,
    // The disposable build root's parent, so neither the copy's path nor the
    // temporary directory holding it can reach a public artifact.
    buildDir ? path.dirname(buildDir) : null,
    repoRoot,
    cwd,
    path.dirname(outFile),
    environment.HOME,
    environment.USER,
    environment.HOSTNAME,
  ].filter(value => typeof value === 'string');
}

export function publicMeasurement(
  measurement,
  {fixtureId, privateValues = []},
) {
  const sanitized = sanitizePublicArtifact(
    {...measurement, app: fixtureId},
    {privateValues},
  );
  assertPublicArtifactSafe(sanitized, {
    label: 'measurement',
    privateValues,
  });
  return sanitized;
}

function emittedLayerOrder(distDir) {
  const assets = path.join(distDir, 'assets');
  if (!fs.existsSync(assets)) {
    return {order: [], errors: ['missing-css-assets-directory']};
  }
  const cssFiles = fs
    .readdirSync(assets)
    .filter(name => name.endsWith('.css'))
    .sort();
  const errors = classifyCssAssets(cssFiles);
  if (errors.length > 0) return {order: [], errors};
  const order = [];
  for (const file of cssFiles) {
    const css = fs.readFileSync(path.join(assets, file), 'utf8');
    for (const layer of parseLayerOrder(css)) {
      if (!order.includes(layer)) order.push(layer);
    }
  }
  return {order, errors: []};
}

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

/**
 * The origin to fetch a locally bound server on, derived from what it actually
 * bound to.
 *
 * The pairing that has to hold is bind address and fetch address. Listening
 * without a host binds the wildcard — `::` wherever Node has IPv6 — while the
 * fetch used a hardcoded `127.0.0.1`, so the two only agreed as long as the
 * host mapped v4-in-v6. Where it does not, every page load fails to connect and
 * the measurement looks like a broken app rather than a broken harness. That is
 * what made an operator wrap the measurer in a network namespace with loopback
 * forced up; nothing about measuring an app needs that.
 *
 * A wildcard is never a fetchable address, so it is rewritten to the loopback
 * of its own family: `0.0.0.0` to `127.0.0.1`, `::` to `[::1]`. Anything else
 * is used as bound, and IPv6 literals are bracketed as a URL requires.
 */
export function loopbackOrigin(address) {
  if (!address || typeof address !== 'object') {
    throw new Error('server.address() did not return an AddressInfo');
  }
  const {address: host, port, family} = address;
  const ipv6 = family === 'IPv6' || family === 6 || String(host).includes(':');
  const WILDCARD = new Set(['0.0.0.0', '::', '::0', '0:0:0:0:0:0:0:0', '']);
  const target = WILDCARD.has(host) ? (ipv6 ? '::1' : '127.0.0.1') : host;
  const bracketed = target.includes(':') ? `[${target}]` : target;
  return `http://${bracketed}:${port}`;
}

function serve(distDir) {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const relative = url.pathname === '/' ? '/index.html' : url.pathname;
    const file = path.join(distDir, relative);
    if (
      !file.startsWith(distDir) ||
      !fs.existsSync(file) ||
      fs.statSync(file).isDirectory()
    ) {
      response.statusCode = 404;
      response.end();
      return;
    }
    response.setHeader(
      'content-type',
      MIME[path.extname(file)] ?? 'application/octet-stream',
    );
    fs.createReadStream(file).pipe(response);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    // Bind IPv4 loopback explicitly rather than the wildcard: the app under
    // measurement is only ever fetched from this process, so there is no reason
    // to listen on anything reachable, and an explicit bind is what makes the
    // fetch address predictable. The origin is still read back from the socket
    // rather than assumed.
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({server, port: address.port, origin: loopbackOrigin(address)});
    });
  });
}

/* c8 ignore start -- executed in the page rather than in Node. */
/**
 * Exported so the canonical suite can run the real reader in a real browser
 * against a fixed DOM, rather than restating its rules in a copy that can
 * drift. It is passed to `page.evaluate`, so it must stay self-contained.
 */
export function readPage(spec) {
  const normalizedRect = rect => {
    const normalize = value => Math.round(value * 64) / 64;
    return {
      x: normalize(rect.x),
      y: normalize(rect.y),
      top: normalize(rect.top),
      right: normalize(rect.right),
      bottom: normalize(rect.bottom),
      left: normalize(rect.left),
      width: normalize(rect.width),
      height: normalize(rect.height),
    };
  };
  const markerSelector = marker =>
    `[data-vibe-${marker.source === 'result' ? 'result' : 'probe'}="${marker.marker ?? marker.name}"]`;
  const styleRecord = (computed, properties) =>
    Object.fromEntries(
      properties.map(property => [property, computed[property]]),
    );
  const luminance = rgb => {
    const [red, green, blue] = rgb.map(value => {
      const channel = value / 255;
      return channel <= 0.03928
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const parseColor = color => {
    const match = color.match(/rgba?\(([^)]+)\)/);
    if (!match) return null;
    const parts = match[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number);
    return {rgb: parts.slice(0, 3), alpha: parts.length > 3 ? parts[3] : 1};
  };
  const effectiveBackground = element => {
    let current = element;
    while (current) {
      const color = parseColor(getComputedStyle(current).backgroundColor);
      if (color && color.alpha > 0.5) return color.rgb;
      current = current.parentElement;
    }
    return [255, 255, 255];
  };
  const contrast = (foreground, background) => {
    const light = luminance(foreground) + 0.05;
    const dark = luminance(background) + 0.05;
    return (
      Math.round((Math.max(light, dark) / Math.min(light, dark)) * 100) / 100
    );
  };
  /**
   * The host copy a container renders, excluding task-owned subtrees.
   *
   * Two exclusions, for two different reasons.
   *
   * Task-owned subtrees (`data-vibe-*`) are skipped because the task mandated
   * them: a container that must gain a control necessarily gains that control's
   * text, and comparing it exactly would report the mandate as host damage.
   *
   * Unrendered subtrees are skipped because this measure exists to detect
   * *visible* host change, and text the browser does not paint is not visible
   * host change. This is not a hole an executor can hide damage in: removing or
   * rewriting host copy still changes the string, so hiding a host paragraph
   * still reports the words it lost. Only *invisible additions* stop counting.
   *
   * The case that forced this: a design-system control's own overlay is not
   * always a DOM child of that control. An Astryx `Button` with a `tooltip`
   * renders the tooltip as a `display: none` sibling — hoisted out of the
   * button because a button cannot legally contain it — linked by
   * `aria-describedby`. The subtree exclusion above cannot see it, so the
   * mandated control's own closed tooltip landed in the host container's text
   * and scored as host damage while nothing on screen had changed.
   */
  const protectedText = element => {
    const parts = [];
    const rendered = node =>
      typeof node.checkVisibility !== 'function' ||
      node.checkVisibility({
        contentVisibilityAuto: true,
        visibilityProperty: true,
      });
    const visit = node => {
      for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          parts.push(child.textContent ?? '');
          continue;
        }
        if (!(child instanceof Element)) continue;
        if (
          child.matches(
            '[data-vibe-probe],[data-vibe-result],[data-vibe-replacement]',
          )
        ) {
          continue;
        }
        if (!rendered(child)) continue;
        visit(child);
      }
    };
    visit(element);
    return parts.join(' ').trim().replace(/\s+/g, ' ');
  };
  const focusableSelector =
    'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]):not([disabled])';
  const isVisible = (computed, rect) =>
    computed.display !== 'none' &&
    computed.visibility !== 'hidden' &&
    Number(computed.opacity) > 0 &&
    rect.width > 0 &&
    rect.height > 0;

  const readLayerSurface = surface => {
    const element = document.querySelector(markerSelector(surface));
    if (!(element instanceof HTMLElement)) {
      return {
        kind: surface.kind,
        missing: true,
        ...(surface.styleReference
          ? {styleReference: surface.styleReference}
          : {}),
      };
    }
    let topLayerElement = element;
    try {
      let candidate = element;
      while (candidate) {
        if (candidate.matches(':modal') || candidate.matches(':popover-open')) {
          topLayerElement = candidate;
          break;
        }
        candidate = candidate.parentElement;
      }
    } catch {}
    let inTopLayer = false;
    try {
      inTopLayer =
        topLayerElement.matches(':modal') ||
        topLayerElement.matches(':popover-open');
    } catch {}
    const readsDialogBackdrop =
      surface.kind === 'backdrop' &&
      topLayerElement instanceof HTMLDialogElement &&
      inTopLayer;
    const computed = readsDialogBackdrop
      ? getComputedStyle(topLayerElement, '::backdrop')
      : getComputedStyle(element);
    const rect = readsDialogBackdrop
      ? {
          x: 0,
          y: 0,
          top: 0,
          right: innerWidth,
          bottom: innerHeight,
          left: 0,
          width: innerWidth,
          height: innerHeight,
        }
      : element.getBoundingClientRect();
    const center = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
    const centerHit =
      center.x >= 0 &&
      center.x <= innerWidth &&
      center.y >= 0 &&
      center.y <= innerHeight
        ? document.elementFromPoint(center.x, center.y)
        : null;
    let clippingAncestor = null;
    let ancestor =
      readsDialogBackdrop || (inTopLayer && topLayerElement === element)
        ? null
        : element.parentElement;
    while (ancestor && ancestor !== document.documentElement) {
      const ancestorStyle = getComputedStyle(ancestor);
      if (
        /hidden|clip/.test(
          `${ancestorStyle.overflowX} ${ancestorStyle.overflowY}`,
        )
      ) {
        const ancestorRect = ancestor.getBoundingClientRect();
        if (
          rect.left < ancestorRect.left ||
          rect.right > ancestorRect.right ||
          rect.top < ancestorRect.top ||
          rect.bottom > ancestorRect.bottom
        ) {
          clippingAncestor =
            ancestor.getAttribute('data-vibe-probe') ||
            ancestor.getAttribute('data-vibe-result') ||
            ancestor.tagName.toLowerCase();
          break;
        }
      }
      ancestor = ancestor.parentElement;
    }
    return {
      kind: surface.kind,
      ...(surface.styleReference
        ? {styleReference: surface.styleReference}
        : {}),
      visible: isVisible(computed, rect),
      display: computed.display,
      visibility: computed.visibility,
      opacity: computed.opacity,
      position: computed.position,
      zIndex: computed.zIndex,
      style: styleRecord(computed, spec.surfaceProperties),
      bounds: normalizedRect(rect),
      intersectsViewport:
        rect.right > 0 &&
        rect.bottom > 0 &&
        rect.left < innerWidth &&
        rect.top < innerHeight,
      clippingAncestor,
      centerHitSelf:
        centerHit === element ||
        (centerHit instanceof Node && element.contains(centerHit)),
      centerHitProbe:
        centerHit instanceof Element
          ? (centerHit
              .closest('[data-vibe-probe],[data-vibe-result]')
              ?.getAttribute('data-vibe-probe') ??
            centerHit
              .closest('[data-vibe-result]')
              ?.getAttribute('data-vibe-result') ??
            null)
          : null,
      topLayer: {
        tagName: topLayerElement.tagName.toLowerCase(),
        role: topLayerElement.getAttribute('role'),
        open: topLayerElement.hasAttribute('open'),
        popover: topLayerElement.getAttribute('popover'),
        ariaModal: topLayerElement.getAttribute('aria-modal'),
        inTopLayer,
        portalChild: topLayerElement.parentElement === document.body,
      },
      /**
       * The host token scopes this surface sits inside, nearest first.
       *
       * Recorded so that "the host's tokens no longer reach this element" is
       * reported as the structural fact it is, rather than only as a list of
       * colours that came out different. The two failures look identical in a
       * style diff and have opposite fixes: restate the colours and the next
       * host token change silently desynchronizes; restore the boundary and the
       * host's own rules resolve as they always did.
       */
      tokenScopes: (spec.hostTokenScopes ?? []).length
        ? (() => {
            const scopes = [];
            for (
              let node = element;
              node instanceof Element;
              node = node.parentElement
            ) {
              for (const selector of spec.hostTokenScopes) {
                let matches = false;
                try {
                  matches = node.matches(selector);
                } catch {
                  matches = false;
                }
                if (matches && !scopes.includes(selector)) {
                  scopes.push(selector);
                }
              }
            }
            return scopes;
          })()
        : [],
    };
  };

  const probes = {};
  for (const probe of spec.probes) {
    const element = document.querySelector(probe.selector);
    if (!(element instanceof HTMLElement)) {
      probes[probe.name] = {missing: true};
      continue;
    }
    const computed = getComputedStyle(element);
    const foreground = parseColor(computed.color);
    probes[probe.name] = {
      style: styleRecord(computed, spec.properties),
      geometry: normalizedRect(element.getBoundingClientRect()),
      text: protectedText(element),
      descendantText: (element.textContent ?? '')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 200),
      contrast: foreground
        ? contrast(foreground.rgb, effectiveBackground(element))
        : null,
    };
  }

  const taskResults = {};
  for (const result of spec.results ?? []) {
    const elements = document.querySelectorAll(
      `[data-vibe-result="${result.name}"]`,
    );
    const element = elements[0];
    if (!(element instanceof HTMLElement)) {
      taskResults[result.name] = {
        count: elements.length,
        visible: false,
        focusable: false,
        text: '',
        style: {},
        geometry: null,
      };
      continue;
    }
    const computed = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    taskResults[result.name] = {
      count: elements.length,
      visible: isVisible(computed, rect),
      focusable:
        (element.matches(focusableSelector) ||
          element.querySelector(focusableSelector) != null) &&
        !element.hasAttribute('disabled') &&
        element.getAttribute('aria-disabled') !== 'true',
      text: (element.textContent ?? '')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 200),
      style: styleRecord(computed, spec.properties),
      geometry: normalizedRect(rect),
    };
  }

  const root = getComputedStyle(document.documentElement);
  const variables = {};
  for (const variable of spec.rootVariables) {
    variables[variable] = root.getPropertyValue(variable).trim();
  }
  const interaction = spec.interaction
    ? {
        id: spec.interaction.id,
        direction: spec.interaction.direction ?? 'host-baseline',
        opened: true,
        keyboardReached: {},
        error: null,
        surfaces: Object.fromEntries(
          spec.interaction.surfaces.map(surface => [
            surface.name,
            readLayerSurface(surface),
          ]),
        ),
      }
    : undefined;
  return {
    probes,
    variables,
    colorScheme: root.colorScheme,
    taskResults,
    ...(interaction ? {interaction} : {}),
  };
}
/* c8 ignore stop */

/**
 * Wait for running CSS transitions to finish before anything is measured.
 *
 * A probe read is meant to capture the app at rest. `getComputedStyle` on an
 * element with a running transition returns the *interpolated* value, which
 * Chromium serializes in the interpolation space rather than the space the
 * value was authored in — so a host button whose colour never changed reads
 * back as `oklab(0.985 0 0)` mid-transition and `oklch(0.985 0 0)` at rest.
 * The numbers are identical; only the spelling differs, and an exact string
 * comparison scores that as host damage.
 *
 * The harness triggers these itself: opening an interaction clicks host
 * controls, and a host control with `transition-colors` starts a transition on
 * that click. Whether the read lands inside the transition window depends on
 * how long the app's own bundle takes to respond, which is stable per app —
 * so this misreads deterministically for some apps and never for others, which
 * is worse than flaky.
 *
 * Only `CSSTransition` is awaited. Transitions always finish; a decorative
 * infinite animation never would, so awaiting every animation would hang. The
 * timeout is a backstop for a transition on a property that never settles.
 */
export async function settleTransitions(page, timeoutMs = 2000) {
  await page.evaluate(async ms => {
    const running = document
      .getAnimations()
      .filter(animation => animation.constructor.name === 'CSSTransition');
    if (running.length === 0) return;
    await Promise.race([
      Promise.allSettled(running.map(animation => animation.finished)),
      new Promise(resolve => {
        setTimeout(resolve, ms);
      }),
    ]);
  }, timeoutMs);
}

async function readScheme({
  browser,
  origin,
  colorScheme,
  probeSpec,
  interaction,
}) {
  const page = await browser.newPage({
    viewport: {width: 1280, height: 720},
    colorScheme,
  });
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  page.on(
    'console',
    message => message.type() === 'error' && consoleErrors.push(message.text()),
  );
  page.on('pageerror', error => pageErrors.push(String(error)));
  page.on('requestfailed', request => failedRequests.push(request.url()));
  await page.goto(`${origin}/`);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  // Quiesce mount-time transitions so the interaction starts from rest.
  await settleTransitions(page);
  let state = {opened: false, keyboardReached: {}};
  let interactionError = null;
  if (interaction) {
    try {
      state = await openInteractionState(page, interaction);
    } catch (error) {
      interactionError = String(error);
    }
  }
  // Quiesce the transitions the interaction above just started.
  await settleTransitions(page);
  const reading = await page.evaluate(readPage, {...probeSpec, interaction});
  if (reading.interaction) {
    reading.interaction.opened = state.opened && interactionError === null;
    reading.interaction.keyboardReached = state.keyboardReached;
    reading.interaction.error = interactionError;
  }
  await page.close();
  return {reading, consoleErrors, pageErrors, failedRequests};
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (typeof args.app !== 'string' || typeof args.fixture !== 'string') {
    throw new Error(
      'usage: setup-measure.mjs --app <dir> --fixture <id> --out <file>',
    );
  }
  const appDir = path.resolve(args.app);
  const fixtureId = args.fixture;
  const outFile = path.resolve(
    typeof args.out === 'string'
      ? args.out
      : path.join(HERE, 'results', 'measurement.json'),
  );
  const screenshotDir =
    typeof args['screenshot-dir'] === 'string'
      ? path.resolve(args['screenshot-dir'])
      : null;
  const label =
    typeof args.label === 'string'
      ? args.label
      : path.basename(outFile, '.json');

  const probeFile = JSON.parse(
    fs.readFileSync(path.join(HERE, 'probes.json'), 'utf8'),
  );
  const fixtureProbes = probeFile.fixtures[fixtureId];
  if (!fixtureProbes) throw new Error(`unknown fixture probes: ${fixtureId}`);

  const provenance =
    typeof args.provenance === 'string'
      ? JSON.parse(fs.readFileSync(args.provenance, 'utf8'))
      : null;
  if (
    provenance &&
    (provenance.schemaVersion !== 1 || provenance.fixture?.id !== fixtureId)
  ) {
    throw new Error('provenance sidecar does not match the measured fixture');
  }
  const prompts = JSON.parse(
    fs.readFileSync(path.join(HERE, 'prompts.json'), 'utf8'),
  ).prompts;
  const matrixConfig = JSON.parse(
    fs.readFileSync(path.join(HERE, 'matrix.json'), 'utf8'),
  );
  validatePromptContracts(prompts, probeFile, matrixConfig);
  const taskDefinition = provenance?.task?.id
    ? prompts.find(prompt => prompt.id === provenance.task.id)
    : null;
  if (provenance?.task?.id && !taskDefinition) {
    throw new Error(`unknown task contract: ${provenance.task.id}`);
  }
  if (taskDefinition && !taskDefinition.fixtures.includes(fixtureId)) {
    throw new Error(
      `task ${taskDefinition.id} does not support fixture ${fixtureId}`,
    );
  }

  const surfaceProperties = probeFile.properties.filter(
    property =>
      !property.startsWith('margin') &&
      ![
        'position',
        'top',
        'right',
        'bottom',
        'left',
        'transform',
        'width',
        'height',
        'minWidth',
        'minHeight',
        'maxWidth',
        'maxHeight',
      ].includes(property),
  );
  const probeSpec = {
    properties: probeFile.properties,
    surfaceProperties,
    hostTokenScopes: fixtureProbes.hostTokenScopes ?? [],
    probes: fixtureProbes.probes,
    rootVariables: fixtureProbes.rootVariables,
    interaction: fixtureProbes.interaction ?? null,
    results: taskDefinition?.contract.results ?? [],
  };

  let integrity;
  if (taskDefinition) {
    const analyzed = analyzeSetupIntegrity(
      appDir,
      provenance?.execution?.agentDiffSha256,
    );
    integrity = {
      diffSha256: analyzed.diffSha256,
      attestedDiffSha256: analyzed.attestation.expectedSha256,
      diffMatchesAttestation: analyzed.attestation.matches,
      usesAstryx: analyzed.astryxUsage.found,
      changedFiles: analyzed.changedFiles.map(file => file.path),
      escapeHatches: analyzed.escapeHatches.map(finding => finding.kind),
    };
  }

  // The build runs on a disposable copy. `appDir` stays exactly as the agent
  // left it — that tree is the attested artifact, and integrity below reads it.
  const workspace = createMeasurementWorkspace(appDir);
  const buildDir = workspace.dir;

  try {
    const measurement = {
      label,
      fixture: fixtureId,
      app: appDir,
      measuredAt: new Date().toISOString(),
      build: build(buildDir),
      layerOrder: [],
      measurementErrors: [],
      ...(taskDefinition
        ? {
            task: {
              id: taskDefinition.id,
              kind: taskDefinition.kind,
              contract: taskDefinition.contract,
            },
            executionStatus: provenance?.execution?.status ?? 'missing',
            integrity,
          }
        : {}),
      schemes: {},
    };

    if (measurement.build.ok) {
      const distDir = path.join(buildDir, 'dist');
      const layers = emittedLayerOrder(distDir);
      measurement.layerOrder = layers.order;
      measurement.measurementErrors = layers.errors;
      const {chromium} = await import('playwright');
      const {server, origin} = await serve(distDir);
      const browser = await chromium.launch();

      for (const colorScheme of ['light', 'dark']) {
        const mainReading = await readScheme({
          browser,
          origin,
          colorScheme,
          probeSpec,
          interaction: probeSpec.interaction,
        });
        const taskInteractions = {};
        for (const interaction of taskDefinition?.contract.interactions ?? []) {
          const taskReading = await readScheme({
            browser,
            origin,
            colorScheme,
            probeSpec: {
              ...probeSpec,
              probes: [],
              rootVariables: [],
              results: [],
            },
            interaction,
          });
          taskInteractions[interaction.id] = taskReading.reading.interaction;
          mainReading.consoleErrors.push(...taskReading.consoleErrors);
          mainReading.pageErrors.push(...taskReading.pageErrors);
          mainReading.failedRequests.push(...taskReading.failedRequests);
        }
        if (screenshotDir) {
          fs.mkdirSync(screenshotDir, {recursive: true});
          const page = await browser.newPage({
            viewport: {width: 1280, height: 720},
            colorScheme,
          });
          await page.goto(`${origin}/`);
          await page.screenshot({
            path: path.join(screenshotDir, `${label}-${colorScheme}.png`),
            fullPage: true,
          });
          await page.close();
        }
        measurement.schemes[colorScheme] = {
          ...mainReading.reading,
          taskInteractions,
          consoleErrors: mainReading.consoleErrors,
          pageErrors: mainReading.pageErrors,
          failedRequests: mainReading.failedRequests,
        };
      }

      await browser.close();
      server.close();
    }

    const privateValues = measurementPrivateValues({
      appDir,
      outFile,
      buildDir,
    });
    const exportedMeasurement = publicMeasurement(measurement, {
      fixtureId,
      privateValues,
    });
    fs.mkdirSync(path.dirname(outFile), {recursive: true});
    fs.writeFileSync(
      outFile,
      `${JSON.stringify(exportedMeasurement, null, 2)}\n`,
    );

    if (provenance) {
      const sidecarOut = outFile.replace(/\.json$/, '.provenance.json');
      const exportedProvenance = publicProvenance(provenance, {privateValues});
      fs.writeFileSync(
        sidecarOut,
        `${JSON.stringify(exportedProvenance, null, 2)}\n`,
      );
    }

    console.log(
      `${label}: build ${measurement.build.ok ? 'ok' : `FAILED (${measurement.build.status})`}` +
        (measurement.build.ok
          ? `, ${measurement.schemes.light.consoleErrors.length} console errors` +
            `, ${Object.values(measurement.schemes.light.probes).filter(probe => probe.missing).length} probes missing`
          : ''),
    );
  } finally {
    // A failed build leaves the same debris a successful one does, so the copy
    // is removed on every path out.
    workspace.cleanup();
  }
}

const isMain =
  process.argv[1] != null &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));
if (isMain) await main();
