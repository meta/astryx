// Copyright (c) Meta Platforms, Inc. and affiliates.

import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
// The fixture suite is a runtime JavaScript module covered by its own tests.
// @ts-expect-error -- fixture-suite.mjs intentionally has no declaration output.
import {copyFixture} from '../src/fixture-suite.mjs';
// @ts-expect-error -- public-artifact.mjs intentionally has no declaration output.
import {assertPublicArtifactSafe} from '../src/public-artifact.mjs';
// @ts-expect-error -- setup-integrity.mjs intentionally has no declaration output.
import {analyzeSetupIntegrity} from './setup-integrity.mjs';
// @ts-expect-error -- setup-workspace.mjs intentionally has no declaration output.
import {manifestDifferences, treeManifest} from './setup-workspace.mjs';
// @ts-expect-error -- linkDirectory.mjs intentionally has no declaration output.
import {linkDirectory} from './linkDirectory.mjs';
import {
  passesAcceptance,
  scoreArm,
  verdict,
  type Measurement,
} from './setup-eval.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../..');
const MEASURE = path.join(HERE, 'setup-measure.mjs');
const RUN_SETUP = path.join(HERE, 'run-setup.mjs');
const EVIDENCE_DIR = process.env.ASTRYX_SETUP_EVIDENCE_DIR
  ? path.resolve(process.env.ASTRYX_SETUP_EVIDENCE_DIR)
  : null;
const RUN_CANONICAL = process.env.ASTRYX_CANONICAL_SETUP_BROWSER === '1';
const temporaryDirectories: string[] = [];
const dependencyRoots = new Map<string, string>();

/**
 * The single run directory `run-setup.mjs` writes beside its config files.
 *
 * Named rather than indexed: the output directory also holds
 * `setup-config-<id>.json` and `setup-matrix-<id>.json`, and the run directory
 * is the one entry without a dot in it.
 */
function runDirectory(root: string): string {
  const entry = fs.readdirSync(root).find(name => !name.includes('.'));
  if (!entry) {
    throw new Error(`no prepared run directory under ${root}`);
  }
  return entry;
}

function run(command: string, args: string[], cwd: string) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'setup-canonical-tests',
      GIT_AUTHOR_EMAIL: 'setup-canonical-tests@example.com',
      GIT_COMMITTER_NAME: 'setup-canonical-tests',
      GIT_COMMITTER_EMAIL: 'setup-canonical-tests@example.com',
    },
  });
}

// pnpm is a .cmd (batch) file on Windows. execFileSync, like spawnSync, can
// only run a batch file through a shell — a bare 'pnpm' fails with ENOENT
// and an explicit 'pnpm.cmd' still fails with EINVAL (batch files need a
// shell even named exactly). Shelling out through cmd.exe /c directly,
// rather than execFileSync's shell:true, avoids Node's
// shell-argument-escaping deprecation warning (DEP0190) — every argument
// here is a hardcoded literal, never user input, so we build the argv
// ourselves instead of asking execFileSync to build a shell string. See
// internal/vibe-tests/src/fixture-suite.mjs for the same pattern.
function runPnpm(args: string[], cwd: string) {
  return process.platform === 'win32'
    ? run('cmd.exe', ['/d', '/s', '/c', 'pnpm', ...args], cwd)
    : run('pnpm', args, cwd);
}

// The non-throwing counterpart to runPnpm, for the cases below where a
// failing pnpm invocation is the assertion under test, not an error: same
// cmd.exe routing on win32, but returns spawnSync's result object instead of
// throwing on a non-zero exit.
function spawnPnpm(args: string[], options: Parameters<typeof spawnSync>[2]) {
  return process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'pnpm', ...args], options)
    : spawnSync('pnpm', args, options);
}

function edit(file: string, transform: (source: string) => string) {
  const source = fs.readFileSync(file, 'utf8');
  const next = transform(source);
  if (next === source) {
    throw new Error(`canonical edit did not apply: ${file}`);
  }
  fs.writeFileSync(file, next);
}

function ensurePackageBuilds() {
  if (
    !fs.existsSync(path.join(REPO_ROOT, 'packages/core/dist/Button/index.js'))
  ) {
    runPnpm(['-F', '@astryxdesign/core', 'build'], REPO_ROOT);
  }
  if (
    !fs.existsSync(
      path.join(REPO_ROOT, 'packages/themes/neutral/dist/theme.css'),
    )
  ) {
    runPnpm(['-F', '@astryxdesign/theme-neutral', 'build'], REPO_ROOT);
  }
}

function dependencyRoot(fixture: string) {
  const existing = dependencyRoots.get(fixture);
  if (existing) {
    return existing;
  }
  const parent = fs.mkdtempSync(
    path.join(os.tmpdir(), `setup-canonical-deps-${fixture}-`),
  );
  temporaryDirectories.push(parent);
  const root = path.join(parent, 'app');
  copyFixture(fixture, root);
  runPnpm(['install', '--frozen-lockfile', '--ignore-scripts'], root);
  dependencyRoots.set(fixture, root);
  return root;
}

function preparePair(fixture: string) {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), `setup-canonical-${fixture}-`),
  );
  temporaryDirectories.push(root);
  const deps = dependencyRoot(fixture);
  const baseline = path.join(root, 'baseline');
  const arm = path.join(root, 'arm');
  for (const destination of [baseline, arm]) {
    copyFixture(fixture, destination);
    linkDirectory(
      path.join(deps, 'node_modules'),
      path.join(destination, 'node_modules'),
    );
  }

  const scope = path.join(arm, 'node_modules', '@astryxdesign');
  fs.mkdirSync(scope, {recursive: true});
  fs.symlinkSync(
    path.join(REPO_ROOT, 'packages/core'),
    path.join(scope, 'core'),
    'dir',
  );
  fs.symlinkSync(
    path.join(REPO_ROOT, 'packages/themes/neutral'),
    path.join(scope, 'theme-neutral'),
    'dir',
  );
  edit(path.join(arm, 'vite.config.ts'), source =>
    source.includes('  resolve: {')
      ? source.replace(
          '  resolve: {',
          "  resolve: {\n    dedupe: ['react', 'react-dom'],",
        )
      : source.replace(
          'export default defineConfig({\n  plugins:',
          "export default defineConfig({\n  resolve: {dedupe: ['react', 'react-dom']},\n  plugins:",
        ),
  );
  fs.writeFileSync(path.join(arm, '.gitignore'), 'node_modules/\ndist/\n');
  run('git', ['init', '-q'], arm);
  run('git', ['add', '-A'], arm);
  run('git', ['commit', '-qm', 'baseline'], arm);
  return {root, baseline, arm};
}

function installAstryxCss(arm: string) {
  edit(path.join(arm, 'src', 'index.css'), source =>
    source.replace(
      "@import 'tailwindcss';",
      [
        '@layer reset, theme, base, astryx-base, astryx-theme, components, utilities;',
        '',
        "@import 'tailwindcss';",
        "@import '@astryxdesign/core/reset.css';",
        "@import '@astryxdesign/core/astryx.css';",
        "@import '@astryxdesign/theme-neutral/theme.css';",
      ].join('\n'),
    ),
  );
}

/**
 * Canonical `host-aligned` strategy install.
 *
 * The established host stays authoritative: the app owns a theme that extends
 * neutral and restates the host's own fonts and semantic colors, instead of
 * importing the stock theme stylesheet. The theme is compiled by a
 * deterministic build step, and the theme attribute is present before first
 * paint rather than written by an effect.
 */
function installHostAlignedStrategy(arm: string) {
  fs.writeFileSync(
    path.join(arm, 'src', 'hostTheme.ts'),
    `// Copyright (c) Meta Platforms, Inc. and affiliates.

import {defineTheme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme-neutral';

// Restates the host's own vocabulary. Values are the host's, not the design
// system's: every pair is [light, dark] so both modes resolve to host values.
export const hostAlignedTheme = defineTheme({
  name: 'hostaligned',
  extends: neutralTheme,
  tokens: {
    '--font-family-body': 'ui-sans-serif, system-ui, sans-serif',
    '--font-family-heading': 'ui-sans-serif, system-ui, sans-serif',
    '--font-family-code': 'ui-monospace, monospace',
  },
});
`,
  );

  // Deterministic build step: same input, same emitted CSS, every run.
  run(
    process.execPath,
    [
      path.join(REPO_ROOT, 'packages/cli/clients/cli/bin/astryx.mjs'),
      'theme',
      'build',
      path.join('src', 'hostTheme.ts'),
    ],
    arm,
  );

  edit(path.join(arm, 'src', 'index.css'), source =>
    source.replace(
      "@import 'tailwindcss';",
      [
        '@layer reset, theme, base, astryx-base, astryx-theme, components, utilities;',
        '',
        "@import 'tailwindcss';",
        "@import '@astryxdesign/core/reset.css';",
        "@import '@astryxdesign/core/astryx.css';",
        // The app's own generated theme — never the stock theme.css, and never
        // tailwind-theme.css, which would take over the host's vocabulary.
        "@import './hostaligned.css';",
      ].join('\n'),
    ),
  );

  // Establish the theme attribute before first paint.
  edit(path.join(arm, 'index.html'), source =>
    source.replace(
      '<html lang="en"',
      '<html lang="en" data-astryx-theme="hostaligned"',
    ),
  );

  // The provider follows the host's own mode control rather than replacing it,
  // so it mounts where that state lives.
  edit(path.join(arm, 'src', 'App.tsx'), source =>
    source
      .replace(
        "import {createPortal} from 'react-dom';",
        [
          "import {createPortal} from 'react-dom';",
          "import {Theme} from '@astryxdesign/core/theme';",
          "import {hostalignedTheme} from './hostaligned.js';",
        ].join('\n'),
      )
      .replace(
        "  return (\n    <div className={dark ? 'dark' : ''}>",
        "  return (\n    <Theme theme={hostalignedTheme} mode={dark ? 'dark' : 'light'}>\n    <div className={dark ? 'dark' : ''}>",
      )
      .replace(/\n {2}\);\n\}\n?$/, '\n    </Theme>\n  );\n}\n'),
  );
}

/**
 * Canonical `guest-contained` strategy install.
 *
 * The host keeps global preflight and tokens: no reset import, and the
 * provider wraps only the guest subtree. The root attribute sync is contained
 * with the only mechanism available today — see the portal tradeoff below.
 */
function installGuestContainedStrategy(arm: string) {
  edit(path.join(arm, 'src', 'index.css'), source =>
    source.replace(
      "@import 'tailwindcss';",
      [
        '@layer reset, theme, base, astryx-base, astryx-theme, components, utilities;',
        '',
        "@import 'tailwindcss';",
        // No reset.css: the host already owns preflight and element defaults.
        "@import '@astryxdesign/core/astryx.css';",
        "@import '@astryxdesign/theme-neutral/theme.css';",
      ].join('\n'),
    ),
  );

  fs.writeFileSync(
    path.join(arm, 'src', 'GuestRegion.tsx'),
    `// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useEffect, type ReactNode} from 'react';
import {Theme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme-neutral';

/**
 * WORKAROUND, not a supported configuration.
 *
 * A provider with no provider above it is a root provider, and a root provider
 * syncs \`data-astryx-theme\` onto the document element so that @scope'd theme
 * CSS reaches portaled content. There is no public prop to opt out of that
 * sync, so containment requires removing the attribute and keeping it removed.
 *
 * TRADEOFF, measured by the strategy pilot: with the attribute removed, content
 * inside this subtree stays themed, and design-system content portaled to
 * document.body falls outside every scope root and loses its theme tokens.
 * \`data-theme\` is left alone because the host relies on it for color-scheme.
 */
function useContainedThemeScope() {
  useEffect(() => {
    const root = document.documentElement;
    const strip = () => root.removeAttribute('data-astryx-theme');
    strip();
    const observer = new MutationObserver(strip);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['data-astryx-theme'],
    });
    return () => observer.disconnect();
  }, []);
}

export function GuestRegion({
  children,
  mode,
}: {
  children: ReactNode;
  mode: 'light' | 'dark';
}) {
  useContainedThemeScope();
  return (
    <Theme theme={neutralTheme} mode={mode}>
      {children}
    </Theme>
  );
}
`,
  );
}

function applyButtonAddition(arm: string) {
  installAstryxCss(arm);
  edit(path.join(arm, 'src', 'App.tsx'), source =>
    source
      .replace(
        'const activity = [',
        "import {Button} from '@astryxdesign/core/Button';\n\nconst activity = [",
      )
      .replace(
        `            <button
              className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white"
              data-vibe-probe="primary-action">
              Create item
            </button>`,
        `            <div className="flex gap-2">
              <button
                className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white"
                data-vibe-probe="primary-action">
                Create item
              </button>
              <Button
                data-vibe-result="astryx-button"
                label="Deploy"
                size="md"
                variant="secondary"
              />
            </div>`,
      ),
  );
}

function applyStatusReplacement(arm: string, fixture: string) {
  installAstryxCss(arm);
  edit(path.join(arm, 'src', 'App.tsx'), source => {
    if (fixture === 'tailwind-v4-control') {
      return source
        .replace(
          'const activity = [',
          "import {Badge} from '@astryxdesign/core/Badge';\n\nconst activity = [",
        )
        .replace(
          `                      <span
                        data-vibe-probe={
                          row.item === 'Quarterly plan' ? 'status' : undefined
                        }>
                        {row.state}
                      </span>`,
          `                      {row.item === 'Quarterly plan' ? (
                        <span
                          className="relative inline-block"
                          data-vibe-replacement>
                          <span className="invisible">{row.state}</span>
                          <Badge
                            className="absolute left-0 top-1/2 -translate-y-1/2 whitespace-nowrap"
                            data-vibe-result="astryx-status"
                            label={row.state}
                            variant="neutral"
                          />
                        </span>
                      ) : (
                        row.state
                      )}`,
        );
    }
    if (fixture === 'shadcn-tailwind-v4-established') {
      return source
        .replace(
          "import {createPortal} from 'react-dom';",
          "import {createPortal} from 'react-dom';\nimport {Badge} from '@astryxdesign/core/Badge';",
        )
        .replace(
          `                          <span
                            className={\`inline-flex rounded-full px-2 py-1 text-xs font-medium \${statusClasses[request.status as keyof typeof statusClasses]}\`}
                            data-vibe-probe={
                              request.id === 'REQ-104' ? 'status' : undefined
                            }>
                            {request.status}
                          </span>`,
          `                          {request.id === 'REQ-104' ? (
                            <span
                              className="relative inline-block"
                              data-vibe-replacement>
                              <span
                                aria-hidden
                                className={\`invisible inline-flex rounded-full px-2 py-1 text-xs font-medium \${statusClasses[request.status as keyof typeof statusClasses]}\`}>
                                {request.status}
                              </span>
                              <Badge
                                className="absolute left-0 top-1/2 -translate-y-1/2 whitespace-nowrap"
                                data-vibe-result="astryx-status"
                                label={request.status}
                                variant="neutral"
                              />
                            </span>
                          ) : (
                            <span
                              className={\`inline-flex rounded-full px-2 py-1 text-xs font-medium \${statusClasses[request.status as keyof typeof statusClasses]}\`}>
                              {request.status}
                            </span>
                          )}`,
        );
    }
    if (fixture === 'enterprise-scoped-synthetic') {
      return source
        .replace(
          "import {createPortal} from 'react-dom';",
          "import {createPortal} from 'react-dom';\nimport {Badge} from '@astryxdesign/core/Badge';",
        )
        .replace(
          `                      <span
                        className={\`inline-flex rounded px-2 py-1 text-xs font-semibold \${healthClasses[service.health]}\`}
                        data-vibe-probe={
                          service.name === 'Aster' ? 'status' : undefined
                        }>
                        {service.health}
                      </span>`,
          `                      {service.name === 'Aster' ? (
                        <span
                          className="relative inline-block"
                          data-vibe-replacement>
                          <span
                            aria-hidden
                            className={\`invisible inline-flex rounded px-2 py-1 text-xs font-semibold \${healthClasses[service.health]}\`}>
                            {service.health}
                          </span>
                          <Badge
                            className="absolute left-0 top-1/2 -translate-y-1/2 whitespace-nowrap"
                            data-vibe-result="astryx-status"
                            label={service.health}
                            variant="neutral"
                          />
                        </span>
                      ) : (
                        <span
                          className={\`inline-flex rounded px-2 py-1 text-xs font-semibold \${healthClasses[service.health]}\`}>
                          {service.health}
                        </span>
                      )}`,
        );
    }
    throw new Error(`unsupported status fixture: ${fixture}`);
  });
}

function applySelectorReplacement(arm: string) {
  installAstryxCss(arm);
  edit(path.join(arm, 'src', 'App.tsx'), source =>
    source
      .replace(
        'const activity = [',
        "import {useState} from 'react';\nimport {Selector} from '@astryxdesign/core/Selector';\n\nconst activity = [",
      )
      .replace(
        'export default function App() {',
        "export default function App() {\n  const [reviewer, setReviewer] = useState('avery');",
      )
      .replace(
        `            <label className="block text-sm font-medium">
              Reviewer
              <select className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2">
                <option>Avery</option>
                <option>Morgan</option>
              </select>
            </label>`,
        `            <Selector
              data-vibe-result="astryx-selector"
              label="Reviewer"
              onChange={setReviewer}
              options={[
                {value: 'avery', label: 'Avery'},
                {value: 'morgan', label: 'Morgan'},
              ]}
              size="md"
              value={reviewer}
              width="100%"
            />`,
      ),
  );
}

function applyShadcnComposition(arm: string) {
  installAstryxCss(arm);
  edit(path.join(arm, 'src', 'App.tsx'), source =>
    source
      .replace(
        "import {Button} from '@/components/ui/button';",
        [
          "import {Selector} from '@astryxdesign/core/Selector';",
          "import {Tooltip} from '@astryxdesign/core/Tooltip';",
          "import {Button} from '@/components/ui/button';",
        ].join('\n'),
      )
      .replace(
        '  const [popoverOpen, setPopoverOpen] = useState(false);',
        "  const [popoverOpen, setPopoverOpen] = useState(false);\n  const [route, setRoute] = useState('operations');",
      )
      .replace(
        `                <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-border bg-background p-3">`,
        `                <div className="mt-4 flex items-end gap-3">
                  <Tooltip
                    content={
                      <span data-vibe-result="astryx-tooltip-surface">
                        Approval routing details
                      </span>
                    }
                    delay={0}>
                    <button
                      aria-label="Explain Astryx routing"
                      className="grid size-9 place-items-center rounded-md border border-input bg-background text-sm font-semibold"
                      data-vibe-result="astryx-tooltip-trigger"
                      type="button">
                      i
                    </button>
                  </Tooltip>
                  <Selector
                    data-vibe-result="astryx-selector-trigger"
                    isLabelHidden
                    label="Approval route"
                    onChange={setRoute}
                    options={[
                      {value: 'operations', label: 'Operations'},
                      {value: 'research', label: 'Research'},
                      {value: 'facilities', label: 'Facilities'},
                    ]}
                    renderOption={option => (
                      <span
                        data-vibe-result={
                          option.value === 'operations'
                            ? 'astryx-selector-surface'
                            : undefined
                        }>
                        {option.label}
                      </span>
                    )}
                    value={route}
                    width={180}
                  />
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-border bg-background p-3">`,
      ),
  );
}

function applyEnterpriseComposition(arm: string) {
  installAstryxCss(arm);
  edit(
    path.join(arm, 'src', 'index.css'),
    source =>
      `${source}\n[data-vibe-result='astryx-dialog-surface']::backdrop {\n  z-index: 40;\n}\n`,
  );
  edit(path.join(arm, 'src', 'App.tsx'), source => {
    let next = source
      .replace(
        "import {useState} from 'react';\nimport {createPortal} from 'react-dom';",
        "import {useRef, useState} from 'react';\nimport {Dialog} from '@astryxdesign/core/Dialog';",
      )
      .replace(
        '  const [popoverOpen, setPopoverOpen] = useState(false);',
        '  const [popoverOpen, setPopoverOpen] = useState(false);\n  const hostMenuRef = useRef<HTMLDivElement>(null);',
      )
      .replace(
        `  const closeDialog = () => {
    setDialogOpen(false);
    setPopoverOpen(false);
  };`,
        `  const closeDialog = () => {
    if (hostMenuRef.current?.matches(':popover-open')) {
      hostMenuRef.current.hidePopover();
    }
    setDialogOpen(false);
    setPopoverOpen(false);
  };

  const toggleHostMenu = () => {
    const menu = hostMenuRef.current;
    if (!menu) return;
    const isOpen = menu.matches(':popover-open');
    if (isOpen) {
      menu.hidePopover();
    } else {
      menu.showPopover();
    }
    setPopoverOpen(!isOpen);
  };`,
      )
      .replace(
        `            data-vibe-probe="dialog-trigger"
            onClick={() => setDialogOpen(true)}`,
        `            data-vibe-probe="dialog-trigger"
            data-vibe-result="astryx-dialog-trigger"
            onClick={() => setDialogOpen(true)}`,
      );
    const start = next.indexOf('      {dialogOpen\n        ? createPortal(');
    const end = next.indexOf('    </div>\n  );', start);
    if (start === -1 || end === -1) {
      throw new Error('canonical enterprise dialog edit did not apply');
    }
    // AST-038 makes inherited typography an explicit root-level choice. This
    // host-owned composition deliberately keeps its established host type.
    next = `${next.slice(0, start)}      {dialogOpen ? (
        <Dialog
          aria-labelledby="service-dialog-title"
          style={{fontFamily: 'inherit', fontSize: 'inherit', lineHeight: 'inherit'}}
          className="fixture-shell block z-[50] rounded-lg border border-border bg-panel p-6 text-foreground shadow-2xl"
          data-guest-design-system
          data-mode={mode}
          data-vibe-probe="dialog-surface"
          data-vibe-result="astryx-dialog-surface"
          isOpen
          onOpenChange={open => {
            if (!open) closeDialog();
          }}
          width="min(30rem, calc(100% - 2rem))">
          <div data-vibe-probe="dialog-backdrop">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-75">
              Guest action
            </p>
            <h2 className="text-lg font-semibold" id="service-dialog-title">
              Service actions
            </h2>
          </div>
          <p
            className="mt-3 text-sm opacity-75"
            data-vibe-probe="dialog-body">
            This guest dialog is portaled across the host boundary.
          </p>
          <div
            className="mt-4 rounded-md border border-border bg-subtle p-3 text-sm"
            data-vibe-probe="dialog-callout">
            Restarting a service pauses its queued work.
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-border bg-panel p-3">
            <div>
              <p className="text-sm font-semibold">Target service</p>
              <p className="text-xs opacity-75">Aster · North</p>
            </div>
            <button
              aria-controls="guest-service-menu"
              aria-expanded={popoverOpen}
              aria-haspopup="menu"
              className="rounded-md border border-border bg-panel px-3 py-2 text-sm font-medium"
              data-vibe-probe="popover-trigger"
              data-vibe-result="host-menu-trigger"
              onClick={toggleHostMenu}
              type="button">
              Select service
            </button>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button
              className="rounded-md border border-border px-3 py-2 text-sm font-medium"
              onClick={closeDialog}
              type="button">
              Cancel
            </button>
            <button
              className="rounded-md bg-error px-3 py-2 text-sm font-semibold text-white"
              data-vibe-probe="destructive-action"
              type="button">
              Restart service
            </button>
          </div>
          <div
            ref={hostMenuRef}
            aria-label="Guest service options"
            className="fixture-shell fixed left-[calc(50%+1.5rem)] top-[calc(50%+2rem)] z-[70] w-52 rounded-md border border-border bg-panel p-1 text-foreground shadow-2xl"
            data-guest-design-system
            data-mode={mode}
            data-vibe-probe="popover-surface"
            data-vibe-result="host-menu-surface"
            id="guest-service-menu"
            popover="manual"
            role="menu">
            {['Aster', 'Briar', 'Cedar'].map(service => (
              <button
                className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-subtle"
                data-vibe-probe={
                  service === 'Aster' ? 'popover-menu-item' : undefined
                }
                key={service}
                role="menuitem"
                type="button">
                {service}
              </button>
            ))}
          </div>
        </Dialog>
      ) : null}
${next.slice(end)}`;
    return next;
  });
}

function measure(
  app: string,
  fixture: string,
  out: string,
  provenance?: string,
  screenshotDir?: string,
): Measurement {
  run(
    process.execPath,
    [
      MEASURE,
      '--app',
      app,
      '--fixture',
      fixture,
      '--out',
      out,
      ...(provenance ? ['--provenance', provenance] : []),
      ...(screenshotDir ? ['--screenshot-dir', screenshotDir] : []),
    ],
    REPO_ROOT,
  );
  const serialized = fs.readFileSync(out, 'utf8');
  expect(serialized).not.toContain(path.resolve(app));
  const measurement = JSON.parse(serialized) as Measurement & {app?: string};
  expect(measurement.app).toBe(fixture);
  if (provenance) {
    const exportedProvenance = JSON.parse(
      fs.readFileSync(out.replace(/\.json$/, '.provenance.json'), 'utf8'),
    );
    expect(exportedProvenance.usage?.source).toBe('runner-reported');
    expect(JSON.stringify(exportedProvenance)).not.toContain(path.resolve(app));
  }
  return measurement;
}

function provenanceFor(arm: string, fixture: string, promptId: string) {
  const digest = analyzeSetupIntegrity(arm).diffSha256;
  const file = path.join(path.dirname(arm), `${promptId}.provenance.json`);
  fs.writeFileSync(
    file,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        task: {id: promptId, sha256: 'a'.repeat(64)},
        fixture: {id: fixture, sha256: 'b'.repeat(64)},
        condition: 'candidate',
        rep: 1,
        executor: {harness: 'fixture-test', model: 'deterministic'},
        matrix: {stage: 'confirmation', bundle: 'fixture-test'},
        execution: {
          status: 'succeeded',
          attempt: 1,
          retry: 0,
          agentDiffSha256: digest,
        },
        usage: {
          complete: true,
          inputTokens: 1,
          outputTokens: 1,
          source: arm,
        },
        environmentHash: 'c'.repeat(64),
      },
      null,
      2,
    )}\n`,
  );
  return file;
}

function outputPaths(root: string, task: string) {
  const directory = EVIDENCE_DIR ? path.join(EVIDENCE_DIR, task) : root;
  fs.mkdirSync(directory, {recursive: true});
  return {
    directory,
    baseline: path.join(directory, `${task}-baseline.json`),
    arm: path.join(directory, `${task}-canonical.json`),
  };
}

function hostProbe(measurement: Measurement, probeName: string) {
  const probe = measurement.schemes.light.probes[probeName];
  if (!probe || 'missing' in probe) {
    throw new Error(`missing ${probeName}`);
  }
  return probe;
}

function writeFalsePositiveEvidence(
  paths: ReturnType<typeof outputPaths>,
  task: string,
  baseline: Measurement,
  arm: Measurement,
  flags: Array<{probe: string; field: string}>,
) {
  if (!EVIDENCE_DIR) {
    return;
  }
  const oldEvaluatorFlags = flags.map(({probe, field}) => {
    const before = hostProbe(baseline, probe);
    const after = hostProbe(arm, probe);
    const read = (reading: typeof before) => {
      if (field === 'textContent') {
        return reading.descendantText;
      }
      const geometryField = field.replace(
        'geometry.',
        '',
      ) as keyof typeof reading.geometry;
      return reading.geometry[geometryField];
    };
    return {probe, field, before: read(before), after: read(after)};
  });
  fs.writeFileSync(
    path.join(paths.directory, 'false-positive-evidence.json'),
    `${JSON.stringify(
      {
        task,
        viewport: {width: 1280, height: 720},
        baselineScreenshot: path.join(
          paths.directory,
          `${task}-baseline-light.png`,
        ),
        canonicalScreenshot: path.join(
          paths.directory,
          `${task}-canonical-light.png`,
        ),
        oldEvaluatorFlags,
        strictAcceptance: passesAcceptance(scoreArm(baseline, arm)),
      },
      null,
      2,
    )}\n`,
  );
}

function assertStyleMutationFails(
  baseline: Measurement,
  arm: Measurement,
  probeName: string,
) {
  const mutations = [
    ['color', 'rgb(255, 0, 0)', 'rgb(0, 255, 0)'],
    ['borderTopLeftRadius', '999px', '777px'],
    ['boxShadow', 'rgb(255, 0, 0) 0px 0px 1px 0px', 'none'],
    ['borderTopWidth', '9px', '7px'],
    ['fontFamily', 'Mutation Font', 'Other Font'],
  ];
  for (const [property, first, second] of mutations) {
    const mutated = structuredClone(arm);
    for (const scheme of ['light', 'dark'] as const) {
      const probe = mutated.schemes[scheme].probes[probeName];
      if (!probe || 'missing' in probe) {
        throw new Error(`missing ${probeName}`);
      }
      probe.style[property] = probe.style[property] === first ? second : first;
    }
    expect(
      passesAcceptance(scoreArm(baseline, mutated)),
      `${probeName}:${property}`,
    ).toBe(false);
  }
}

const describeCanonical = RUN_CANONICAL ? describe : describe.skip;

describeCanonical('canonical intended changes', () => {
  beforeAll(ensurePackageBuilds, 180_000);
  afterAll(() => {
    for (const directory of temporaryDirectories) {
      fs.rmSync(directory, {recursive: true, force: true});
    }
  });
  it('writes a portable setup config with a resolvable matrix reference', () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'setup-canonical-public-config-'),
    );
    temporaryDirectories.push(root);
    run(
      process.execPath,
      [
        RUN_SETUP,
        '--stage',
        'separation',
        '--fixtures',
        'tailwind-v4-control',
        '--conditions',
        'floor',
        '--prompts',
        's1',
        '--bundles',
        'native-claude',
        '--reps',
        '1',
        '--out',
        root,
      ],
      REPO_ROOT,
    );
    const configFile = fs
      .readdirSync(root)
      .find((file: string) => file.startsWith('setup-config-'));
    if (!configFile) {
      throw new Error('missing generated setup config');
    }
    const config = JSON.parse(
      fs.readFileSync(path.join(root, String(configFile)), 'utf8'),
    );
    expect(() =>
      assertPublicArtifactSafe(config, {
        label: 'generated setup config',
        privateValues: [
          root,
          REPO_ROOT,
          process.env.HOME,
          process.env.USER,
          process.env.HOSTNAME,
        ],
      }),
    ).not.toThrow();
    expect(path.isAbsolute(config.matrixFile)).toBe(false);
    expect(fs.existsSync(path.join(root, config.matrixFile))).toBe(true);
    const taskText = fs.readFileSync(
      path.join(root, config.runs[0].taskFile),
      'utf8',
    );
    expect(taskText).toContain(
      'Treat the current working directory as the project',
    );
    expect(taskText).not.toContain(root);
    expect(() =>
      assertPublicArtifactSafe(taskText, {
        label: 'generated task',
        privateValues: [root, REPO_ROOT],
      }),
    ).not.toThrow();
    for (const reference of [
      ...Object.values(config.baselines),
      ...config.runs.flatMap((entry: Record<string, string>) => [
        entry.sandboxDir,
        entry.taskFile,
        entry.provenanceFile,
      ]),
    ] as string[]) {
      expect(path.isAbsolute(reference)).toBe(false);
      expect(fs.existsSync(path.join(root, reference))).toBe(true);
    }
  }, 120_000);

  /**
   * Guidance has to reach the sandbox, not just exist in the repository.
   *
   * The strategy pilot's two `host-aligned` integrity failures were scored
   * against a rule that no sandbox they ran in contained: the rule was written
   * into the guidance after those runs, and the tests that covered it read the
   * guidance file rather than anything an executor was handed. Both halves
   * passed while the executors were being judged on an instruction that had
   * never been delivered.
   *
   * So this asserts the delivery. It prepares real cells and requires every
   * section heading of a strategy's guidance document to be present in the
   * `AGENTS.md` the executor will actually open, and requires the other
   * strategy's document not to be — a sandbox that quietly received both would
   * be handed contradictory instructions.
   */
  it('delivers every section of a strategy document into its own sandbox', () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'setup-canonical-guidance-delivery-'),
    );
    temporaryDirectories.push(root);
    run(
      process.execPath,
      [RUN_SETUP, '--stage', 'strategy-iteration', '--out', root],
      REPO_ROOT,
    );

    const headings = (file: string) =>
      fs
        .readFileSync(path.join(HERE, 'guidance', file), 'utf8')
        .split('\n')
        .filter(line => line.startsWith('### '))
        .map(line => line.trim());

    const hostAligned = headings('host-aligned.md');
    const guestContained = headings('guest-contained.md');
    expect(hostAligned.length).toBeGreaterThan(3);
    expect(guestContained.length).toBeGreaterThan(2);

    const runRoot = path.join(root, runDirectory(root));
    const cells = fs
      .readdirSync(runRoot)
      .filter(entry => entry.startsWith('strategy-iteration__'));
    expect(cells).toHaveLength(4);

    for (const cell of cells) {
      const agents = fs.readFileSync(
        path.join(runRoot, cell, 'app', 'AGENTS.md'),
        'utf8',
      );
      const isHostAligned = cell.includes('__host-aligned-r2__');
      const delivered = isHostAligned ? hostAligned : guestContained;
      const withheld = isHostAligned ? guestContained : hostAligned;

      for (const heading of delivered) {
        expect(agents, `${cell} is missing "${heading}"`).toContain(heading);
      }
      for (const heading of withheld.filter(
        entry => !delivered.includes(entry),
      )) {
        expect(agents, `${cell} wrongly carries "${heading}"`).not.toContain(
          heading,
        );
      }
    }
  }, 300_000);

  /**
   * The specific rules each rerun exists to test, in the sandbox.
   *
   * Named individually rather than left to the heading sweep above, because
   * these are the sentences the failures turned on and a reworded heading
   * should not be able to carry them away silently. A guidance file passing a
   * grep is not evidence that a rule reached an executor, so these read the
   * `AGENTS.md` a prepared cell actually carries.
   */
  it('hands each strategy the rules its own rerun turns on', () => {
    const prepared = (stage: string) => {
      const root = fs.mkdtempSync(
        path.join(os.tmpdir(), 'setup-canonical-rerun-rules-'),
      );
      temporaryDirectories.push(root);
      run(
        process.execPath,
        [RUN_SETUP, '--stage', stage, '--out', root],
        REPO_ROOT,
      );
      return path.join(root, runDirectory(root));
    };
    const runRoots = [
      prepared('strategy-iteration'),
      prepared('strategy-iteration-2'),
    ];
    const agentsFor = (condition: string) => {
      for (const runRoot of runRoots) {
        const cell = fs
          .readdirSync(runRoot)
          .find(entry => entry.includes(`__${condition}__`));
        if (cell) {
          return fs.readFileSync(
            path.join(runRoot, cell, 'app', 'AGENTS.md'),
            'utf8',
          );
        }
      }
      throw new Error(`no prepared cell for ${condition}`);
    };

    // host-aligned-r2: the tracking rule, stated before the reasoning and
    // still stated in full further down. It was never delivered before.
    const hostR2 = agentsFor('host-aligned-r2');
    expect(hostR2).toContain('Never add it to `.gitignore`');
    expect(hostR2).toContain(
      'Do **not** add the generated output to `.gitignore`',
    );
    expect(hostR2.indexOf('Never add it to `.gitignore`')).toBeLessThan(
      hostR2.indexOf('### Own the theme; do not import the stock one'),
    );

    // guest-contained-r3: the pnpm approval mechanism, which is what the r2
    // cell died on before anything could be measured.
    const guest = agentsFor('guest-contained-r3');
    expect(guest).toContain('ERR_PNPM_IGNORED_BUILDS');
    expect(guest).toContain('pnpm approve-builds');
    expect(guest.replace(/\s+/g, ' ')).toContain(
      'pnpm 11 reads `allowBuilds` from `pnpm-workspace.yaml` only',
    );

    // host-aligned-r3: the boundary rule, stated up front this time, with the
    // procedure the r2 executor needed and did not have.
    const host = agentsFor('host-aligned-r3');
    const upFront = host.indexOf('the moved subtree must');
    expect(upFront).toBeGreaterThan(-1);
    expect(upFront).toBeLessThan(
      host.indexOf('### Own the theme; do not import the stock one'),
    );
    expect(host).toContain('### Host UI placed inside a design-system overlay');
    // Matched against reflowed text so a line wrap is not a test failure.
    expect(host.replace(/\s+/g, ' ')).toContain(
      '**carry the boundary with the markup**',
    );
    expect(host).toContain('do not assume it is the same hook');
    // Discovery, not the answer: the fixture's own selector is never handed over.
    expect(host).not.toContain('data-guest-design-system');
  }, 300_000);

  /**
   * The measurer must not build in the sandbox it measures.
   *
   * That sandbox is the attested artifact: the runner digested its bytes, the
   * integrity checker reads them, and a re-measurement has to be able to read
   * them again. A build in place regenerates the app-owned theme over the
   * executor's copy, writes `dist/`, appends to the CLI's invocation log, and
   * caches into `node_modules`, after which the tree no longer hashes to the
   * digest that attested it.
   *
   * This runs the real measurer, with a real build, against a real fixture arm,
   * and compares a full byte-and-mtime manifest of the sandbox taken before and
   * after — every entry, tracked and ignored alike, since the debris is ignored
   * by construction.
   */
  it('measures a real arm without changing one byte of its sandbox', () => {
    const {root, arm} = preparePair('tailwind-v4-control');
    applyButtonAddition(arm);
    const provenance = provenanceFor(arm, 'tailwind-v4-control', 's1');
    const digestBefore = analyzeSetupIntegrity(arm).diffSha256;
    const before = treeManifest(arm);

    const result = measure(
      arm,
      'tailwind-v4-control',
      path.join(root, 'immutability-arm.json'),
      provenance,
    );
    expect(
      result.build.ok,
      `${result.build.stdout}\n${result.build.stderr}`,
    ).toBe(true);
    // The build really produced what the measurement read.
    expect(result.layerOrder.length).toBeGreaterThan(0);

    expect(manifestDifferences(before, treeManifest(arm))).toEqual([]);
    // The digest that attested this tree still describes it, so the cell can be
    // re-measured or recovered from these same bytes.
    expect(analyzeSetupIntegrity(arm).diffSha256).toBe(digestBefore);
    // Nothing was left behind for the next measurement to trip over.
    expect(fs.existsSync(path.join(arm, 'dist'))).toBe(false);
  }, 180_000);

  it('leaves the sandbox untouched when the build fails', () => {
    const {root, arm} = preparePair('tailwind-v4-control');
    applyButtonAddition(arm);
    // Break the build after the sandbox is attested, the way a real failing
    // executor change would.
    edit(
      path.join(arm, 'src', 'App.tsx'),
      source => `${source}\nconst broken: number = 'not a number';\n`,
    );
    const provenance = provenanceFor(arm, 'tailwind-v4-control', 's1');
    const digestBefore = analyzeSetupIntegrity(arm).diffSha256;
    const before = treeManifest(arm);

    const result = measure(
      arm,
      'tailwind-v4-control',
      path.join(root, 'immutability-failed.json'),
      provenance,
    );
    expect(result.build.ok).toBe(false);

    expect(manifestDifferences(before, treeManifest(arm))).toEqual([]);
    expect(analyzeSetupIntegrity(arm).diffSha256).toBe(digestBefore);
  }, 180_000);

  it('builds, measures, and accepts a correct s1 button insertion', () => {
    const {
      root,
      baseline: baselineApp,
      arm,
    } = preparePair('tailwind-v4-control');
    applyButtonAddition(arm);
    const paths = outputPaths(root, 's1');
    const baseline = measure(
      baselineApp,
      'tailwind-v4-control',
      paths.baseline,
      undefined,
      EVIDENCE_DIR ? paths.directory : undefined,
    );
    const provenance = provenanceFor(arm, 'tailwind-v4-control', 's1');
    const result = measure(
      arm,
      'tailwind-v4-control',
      paths.arm,
      provenance,
      EVIDENCE_DIR ? paths.directory : undefined,
    );
    writeFalsePositiveEvidence(paths, 's1', baseline, result, [
      {probe: 'host-shell', field: 'textContent'},
      {probe: 'primary-action', field: 'geometry.x'},
    ]);
    const score = scoreArm(baseline, result);
    expect(score.regressionDetails).toEqual([]);
    expect(verdict(score)).toBe('clean');
    expect(passesAcceptance(score)).toBe(true);
    assertStyleMutationFails(baseline, result, 'primary-action');
    const geometryMutation = structuredClone(result);
    for (const scheme of ['light', 'dark'] as const) {
      const probe = geometryMutation.schemes[scheme].probes['primary-action'];
      if ('missing' in probe) {
        throw new Error('missing primary-action');
      }
      probe.geometry.width += 1;
    }
    expect(passesAcceptance(scoreArm(baseline, geometryMutation))).toBe(false);
  }, 120_000);

  it.each([
    'tailwind-v4-control',
    'shadcn-tailwind-v4-established',
    'enterprise-scoped-synthetic',
  ])(
    'builds, measures, and accepts a correct s2 status replacement in %s',
    fixture => {
      const {root, baseline: baselineApp, arm} = preparePair(fixture);
      applyStatusReplacement(arm, fixture);
      const baseline = measure(
        baselineApp,
        fixture,
        path.join(root, 's2-baseline.json'),
      );
      const provenance = provenanceFor(arm, fixture, 's2');
      const result = measure(
        arm,
        fixture,
        path.join(root, 's2-canonical.json'),
        provenance,
      );
      const score = scoreArm(baseline, result);
      expect(
        result.build.ok,
        `${result.build.stdout}\n${result.build.stderr}`,
      ).toBe(true);
      expect(score.regressionDetails, JSON.stringify(score, null, 2)).toEqual(
        [],
      );
      expect(verdict(score)).toBe('clean');
      expect(passesAcceptance(score)).toBe(true);
      for (const scheme of ['light', 'dark'] as const) {
        expect(result.schemes[scheme].probes.status).toEqual({missing: true});
        expect(
          result.schemes[scheme].taskResults?.['astryx-status'],
        ).toMatchObject({count: 1, visible: true});
      }
      const neighbor =
        fixture === 'tailwind-v4-control' ? 'table-cell' : 'table-header';
      assertStyleMutationFails(baseline, result, neighbor);
    },
    120_000,
  );

  it('builds, measures, and accepts a correct s3 selector replacement', () => {
    const {
      root,
      baseline: baselineApp,
      arm,
    } = preparePair('tailwind-v4-control');
    applySelectorReplacement(arm);
    const paths = outputPaths(root, 's3');
    const baseline = measure(
      baselineApp,
      'tailwind-v4-control',
      paths.baseline,
      undefined,
      EVIDENCE_DIR ? paths.directory : undefined,
    );
    const provenance = provenanceFor(arm, 'tailwind-v4-control', 's3');
    const result = measure(
      arm,
      'tailwind-v4-control',
      paths.arm,
      provenance,
      EVIDENCE_DIR ? paths.directory : undefined,
    );
    writeFalsePositiveEvidence(paths, 's3', baseline, result, [
      {probe: 'form-control', field: 'geometry.y'},
      {probe: 'form-control', field: 'geometry.bottom'},
    ]);
    const score = scoreArm(baseline, result);
    expect(score.regressionDetails).toEqual([]);
    expect(verdict(score)).toBe('clean');
    expect(passesAcceptance(score)).toBe(true);
    assertStyleMutationFails(baseline, result, 'form-control');
    const geometryMutation = structuredClone(result);
    for (const scheme of ['light', 'dark'] as const) {
      const probe = geometryMutation.schemes[scheme].probes['form-control'];
      if ('missing' in probe) {
        throw new Error('missing form-control');
      }
      probe.geometry.width += 1;
    }
    expect(passesAcceptance(scoreArm(baseline, geometryMutation))).toBe(false);
  }, 120_000);

  it('builds, interacts with, and accepts Astryx surfaces in a host dialog', () => {
    const {
      root,
      baseline: baselineApp,
      arm,
    } = preparePair('shadcn-tailwind-v4-established');
    applyShadcnComposition(arm);
    const baseline = measure(
      baselineApp,
      'shadcn-tailwind-v4-established',
      path.join(root, 's4-baseline.json'),
    );
    const provenance = provenanceFor(
      arm,
      'shadcn-tailwind-v4-established',
      's4',
    );
    const result = measure(
      arm,
      'shadcn-tailwind-v4-established',
      path.join(root, 's4-canonical.json'),
      provenance,
    );
    const score = scoreArm(baseline, result);
    expect(
      result.build.ok,
      `${result.build.stdout}\n${result.build.stderr}`,
    ).toBe(true);
    expect(score.regressionDetails, JSON.stringify(score, null, 2)).toEqual([]);
    expect(score.layeringFailures).toEqual([]);
    expect(score.taskFailures).toEqual([]);
    expect(verdict(score)).toBe('clean');
    expect(passesAcceptance(score)).toBe(true);

    const baselineDialog =
      baseline.schemes.light.interaction?.surfaces['dialog-surface'];
    const resultDialog =
      result.schemes.light.interaction?.surfaces['dialog-surface'];
    if (
      !baselineDialog ||
      'missing' in baselineDialog ||
      !resultDialog ||
      'missing' in resultDialog
    ) {
      throw new Error('missing host dialog surface');
    }
    expect(resultDialog.bounds.height).not.toBe(baselineDialog.bounds.height);
    const baselineHostText = hostProbe(baseline, 'host-shell').text;
    expect(hostProbe(result, 'host-shell').text).toBe(baselineHostText);
    expect(baselineHostText.indexOf('Save settings')).toBeGreaterThan(200);

    const widthDamage = structuredClone(result);
    const styleDamage = structuredClone(result);
    const backdropDamage = structuredClone(result);
    for (const scheme of ['light', 'dark'] as const) {
      const widthSurface =
        widthDamage.schemes[scheme].interaction?.surfaces['dialog-surface'];
      const styleSurface =
        styleDamage.schemes[scheme].interaction?.surfaces['dialog-surface'];
      const backdropSurface =
        backdropDamage.schemes[scheme].interaction?.surfaces['dialog-backdrop'];
      if (
        !widthSurface ||
        'missing' in widthSurface ||
        !styleSurface ||
        'missing' in styleSurface ||
        !backdropSurface ||
        'missing' in backdropSurface
      ) {
        throw new Error('missing host overlay surface');
      }
      widthSurface.bounds.width += 1;
      styleSurface.style.boxShadow = 'none';
      backdropSurface.style.backgroundColor = 'rgb(255, 0, 0)';
    }
    expect(passesAcceptance(scoreArm(baseline, widthDamage))).toBe(false);
    expect(passesAcceptance(scoreArm(baseline, styleDamage))).toBe(false);
    expect(passesAcceptance(scoreArm(baseline, backdropDamage))).toBe(false);

    edit(path.join(arm, 'src', 'App.tsx'), source =>
      source.replace('Save settings', 'Publish settings'),
    );
    const textDamage = measure(
      arm,
      'shadcn-tailwind-v4-established',
      path.join(root, 's4-host-text-damage.json'),
      provenanceFor(arm, 'shadcn-tailwind-v4-established', 's4'),
    );
    expect(scoreArm(baseline, textDamage).regressionDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({probe: 'host-shell', property: 'text'}),
      ]),
    );
    expect(passesAcceptance(scoreArm(baseline, textDamage))).toBe(false);
  }, 180_000);

  it('builds, interacts with, and accepts a host menu in an Astryx dialog', () => {
    const {
      root,
      baseline: baselineApp,
      arm,
    } = preparePair('enterprise-scoped-synthetic');
    applyEnterpriseComposition(arm);
    const baseline = measure(
      baselineApp,
      'enterprise-scoped-synthetic',
      path.join(root, 's5-baseline.json'),
    );
    const provenance = provenanceFor(arm, 'enterprise-scoped-synthetic', 's5');
    const result = measure(
      arm,
      'enterprise-scoped-synthetic',
      path.join(root, 's5-canonical.json'),
      provenance,
    );
    const score = scoreArm(baseline, result);
    expect(
      result.build.ok,
      `${result.build.stdout}\n${result.build.stderr}`,
    ).toBe(true);
    expect(score.regressionDetails, JSON.stringify(score, null, 2)).toEqual([]);
    expect(score.layeringFailures).toEqual([]);
    expect(score.taskFailures).toEqual([]);
    expect(verdict(score)).toBe('clean');
    expect(passesAcceptance(score)).toBe(true);

    for (const scheme of ['light', 'dark'] as const) {
      const interaction =
        result.schemes[scheme].taskInteractions?.['host-menu-in-astryx-dialog'];
      expect(interaction?.keyboardReached).toEqual({
        'astryx-dialog-trigger': true,
        'host-menu-trigger': true,
      });
      const menu = interaction?.surfaces['host-menu-surface'];
      if (!menu || 'missing' in menu) {
        throw new Error('missing host menu surface');
      }
      expect(menu.topLayer.inTopLayer).toBe(true);
    }
  }, 180_000);

  /**
   * The s5 task mandates a new Astryx dialog, so the executor has to put a
   * trigger for it somewhere in the host page. Both strategy-pilot executors
   * added a block to the host shell, and the shell then grew by that block and
   * gained its copy — eight identical measured "regressions" that the task
   * itself required. The contract now allows exactly that: the shell's height,
   * the two geometry fields height moves, and text it *gains*. Everything else
   * about the shell, and every other probe, stays exact.
   *
   * The canonical composition above reuses the fixture's own trigger and so
   * never reflows the shell. This variant inserts a new one, the way the task
   * reads and the way the pilot's executors read it.
   */
  function insertShellDialogTrigger(arm: string) {
    edit(path.join(arm, 'src', 'App.tsx'), source =>
      source
        .replace(
          `            data-vibe-probe="dialog-trigger"
            data-vibe-result="astryx-dialog-trigger"`,
          `            data-vibe-probe="dialog-trigger"`,
        )
        .replace(
          '      </main>',
          `        <section className="rounded-lg border border-border bg-panel p-4">
          <h2 className="text-sm font-semibold">Escalation routing</h2>
          <button
            className="mt-3 rounded-md border border-border bg-panel px-3 py-2 text-sm font-medium"
            data-vibe-result="astryx-dialog-trigger"
            onClick={() => setDialogOpen(true)}
            type="button">
            Open service actions
          </button>
        </section>
      </main>`,
        ),
    );
  }

  let shellTriggerMeasurement: {
    baseline: Measurement;
    result: Measurement;
  } | null = null;

  function measureShellTriggerInsertion() {
    if (shellTriggerMeasurement) {
      return shellTriggerMeasurement;
    }
    const {
      root,
      baseline: baselineApp,
      arm,
    } = preparePair('enterprise-scoped-synthetic');
    applyEnterpriseComposition(arm);
    insertShellDialogTrigger(arm);
    const baseline = measure(
      baselineApp,
      'enterprise-scoped-synthetic',
      path.join(root, 's5-shell-baseline.json'),
    );
    const provenance = provenanceFor(arm, 'enterprise-scoped-synthetic', 's5');
    const result = measure(
      arm,
      'enterprise-scoped-synthetic',
      path.join(root, 's5-shell-arm.json'),
      provenance,
    );
    expect(
      result.build.ok,
      `${result.build.stdout}\n${result.build.stderr}`,
    ).toBe(true);
    shellTriggerMeasurement = {baseline, result};
    return shellTriggerMeasurement;
  }

  it('accepts the host-shell reflow the mandated trigger insertion causes', () => {
    const {baseline, result} = measureShellTriggerInsertion();
    const score = scoreArm(baseline, result);

    expect(score.regressionDetails, JSON.stringify(score, null, 2)).toEqual([]);
    expect(score.taskFailures).toEqual([]);
    expect(verdict(score)).toBe('clean');
    expect(passesAcceptance(score)).toBe(true);

    // The reflow the allowance covers really happened, in both modes, or this
    // case is proving nothing.
    for (const scheme of ['light', 'dark'] as const) {
      const before = baseline.schemes[scheme].probes['host-shell'];
      const after = result.schemes[scheme].probes['host-shell'];
      if ('missing' in before || 'missing' in after) {
        throw new Error('missing host-shell probe');
      }
      expect(after.geometry.height).toBeGreaterThan(before.geometry.height);
      expect(after.text.length).toBeGreaterThan(before.text.length);
      // and nothing the allowance does not name moved
      expect(after.geometry.y).toBe(before.geometry.y);
      expect(after.geometry.x).toBe(before.geometry.x);
      expect(after.geometry.width).toBe(before.geometry.width);
      // `height` is the one computed style the allowance names, and it is the
      // only one that may differ.
      expect(after.style.height).not.toBe(before.style.height);
      const {height: _afterHeight, ...afterStyle} = after.style;
      const {height: _beforeHeight, ...beforeStyle} = before.style;
      expect(afterStyle).toEqual(beforeStyle);
    }
  }, 180_000);

  /**
   * Mutation proofs over the accepted measurement above. Each one changes one
   * measured field of the real run and re-scores it: the allowance must be
   * narrow enough that every one of them fails.
   */
  it.each([
    {
      name: 'a computed style on the same probe',
      probe: 'host-shell',
      style: {color: 'rgb(1, 2, 3)'},
    },
    {
      name: "the shell's own width, which the allowance does not name",
      probe: 'host-shell',
      geometry: {width: 1_000},
    },
    {
      name: "another probe's height, which the allowance must not reach",
      probe: 'status',
      geometry: {height: 99},
    },
  ])(
    'still reports $name as host damage',
    ({probe, style, geometry}) => {
      const {baseline, result} = measureShellTriggerInsertion();
      const mutated = JSON.parse(JSON.stringify(result)) as Measurement;
      for (const scheme of ['light', 'dark'] as const) {
        const reading = mutated.schemes[scheme].probes[probe] as {
          style: Record<string, string>;
          geometry: Record<string, number>;
        };
        Object.assign(reading.style, style ?? {});
        Object.assign(reading.geometry, geometry ?? {});
      }

      const score = scoreArm(baseline, mutated);

      expect(score.regressions).toBeGreaterThan(0);
      expect(passesAcceptance(score)).toBe(false);
    },
    180_000,
  );

  it('still reports host text the shell lost, not just text it gained', () => {
    const {baseline, result} = measureShellTriggerInsertion();
    const mutated = JSON.parse(JSON.stringify(result)) as Measurement;
    for (const scheme of ['light', 'dark'] as const) {
      const reading = mutated.schemes[scheme].probes['host-shell'] as {
        text: string;
      };
      // Drop one word of the host's own copy while keeping the added block's
      // text: an insertion-only allowance must not cover this.
      reading.text = reading.text.replace('Portfolio console ', '');
    }

    const score = scoreArm(baseline, mutated);

    expect(
      score.regressionDetails.some(
        regression =>
          regression.probe === 'host-shell' && regression.property === 'text',
      ),
    ).toBe(true);
    expect(passesAcceptance(score)).toBe(false);
  }, 180_000);

  /**
   * The same insertion, in the container the task actually points at.
   *
   * `s5` mandates exactly one visible `astryx-dialog-trigger`, and this
   * fixture's guest subtree is the region it declares for guest design-system
   * content, so that is where a trigger belongs. Two independent reps put it
   * there and both grew the boundary from 296px to 409px in both schemes. The
   * contract allows exactly that: the boundary's height and the two geometry
   * fields height moves. It takes no text exemption — the trigger is
   * task-owned, so the boundary's protected text never sees it — and nothing
   * else about the boundary, or any other probe, may move.
   *
   * This case inserts its own trigger from the same 296px baseline, so its
   * growth is its own; what it shares with the reps is the three fields that
   * move and the two schemes they move in.
   */
  function insertGuestBoundaryDialogTrigger(arm: string) {
    edit(path.join(arm, 'src', 'App.tsx'), source => {
      const next = source
        .replace(
          `            data-vibe-probe="dialog-trigger"
            data-vibe-result="astryx-dialog-trigger"`,
          `            data-vibe-probe="dialog-trigger"`,
        )
        .replace(
          '        </aside>',
          `          <button
            className="mt-4 w-full rounded-md border border-border bg-panel px-3 py-2 text-sm font-medium"
            data-vibe-result="astryx-dialog-trigger"
            onClick={() => setDialogOpen(true)}
            type="button">
            Open service actions
          </button>
        </aside>`,
        );
      if (next === source) {
        throw new Error('guest-boundary trigger insertion did not apply');
      }
      return next;
    });
  }

  let guestBoundaryMeasurement: {
    baseline: Measurement;
    result: Measurement;
  } | null = null;

  function measureGuestBoundaryInsertion() {
    if (guestBoundaryMeasurement) {
      return guestBoundaryMeasurement;
    }
    const {
      root,
      baseline: baselineApp,
      arm,
    } = preparePair('enterprise-scoped-synthetic');
    applyEnterpriseComposition(arm);
    insertGuestBoundaryDialogTrigger(arm);
    const baseline = measure(
      baselineApp,
      'enterprise-scoped-synthetic',
      path.join(root, 's5-guest-baseline.json'),
    );
    const provenance = provenanceFor(arm, 'enterprise-scoped-synthetic', 's5');
    const result = measure(
      arm,
      'enterprise-scoped-synthetic',
      path.join(root, 's5-guest-arm.json'),
      provenance,
    );
    expect(
      result.build.ok,
      `${result.build.stdout}\n${result.build.stderr}`,
    ).toBe(true);
    guestBoundaryMeasurement = {baseline, result};
    return guestBoundaryMeasurement;
  }

  it('accepts the guest-boundary growth the mandated trigger causes', () => {
    const {baseline, result} = measureGuestBoundaryInsertion();
    const score = scoreArm(baseline, result);

    expect(score.regressionDetails, JSON.stringify(score, null, 2)).toEqual([]);
    expect(score.taskFailures).toEqual([]);
    expect(verdict(score)).toBe('clean');
    expect(passesAcceptance(score)).toBe(true);

    // The growth the allowance covers really happened, in both modes, or this
    // case is proving nothing.
    for (const scheme of ['light', 'dark'] as const) {
      const before = baseline.schemes[scheme].probes['guest-boundary'];
      const after = result.schemes[scheme].probes['guest-boundary'];
      if ('missing' in before || 'missing' in after) {
        throw new Error('missing guest-boundary probe');
      }
      expect(after.geometry.height).toBeGreaterThan(before.geometry.height);
      expect(after.geometry.bottom).toBeGreaterThan(before.geometry.bottom);
      // and nothing the allowance does not name moved
      expect(after.geometry.y).toBe(before.geometry.y);
      expect(after.geometry.top).toBe(before.geometry.top);
      expect(after.geometry.x).toBe(before.geometry.x);
      expect(after.geometry.left).toBe(before.geometry.left);
      expect(after.geometry.width).toBe(before.geometry.width);
      // The inserted trigger is task-owned, so the boundary's protected text is
      // untouched and needs no exemption.
      expect(after.text).toBe(before.text);
      // `height` is the one computed style the allowance names, and it is the
      // only one that may differ.
      expect(after.style.height).not.toBe(before.style.height);
      const {height: _afterHeight, ...afterStyle} = after.style;
      const {height: _beforeHeight, ...beforeStyle} = before.style;
      expect(afterStyle).toEqual(beforeStyle);
    }
  }, 180_000);

  /**
   * Mutation proofs over the accepted measurement above. Each one changes one
   * measured field of the real run and re-scores it: the allowance must be
   * narrow enough that every one of them fails.
   */
  it.each([
    {
      name: 'a computed style on the boundary',
      probe: 'guest-boundary',
      style: {color: 'rgb(1, 2, 3)'},
    },
    {
      name: 'a typography change on the boundary',
      probe: 'guest-boundary',
      style: {fontFamily: 'Inter'},
    },
    {
      name: "the boundary's own width, which the allowance does not name",
      probe: 'guest-boundary',
      geometry: {width: 1_000},
    },
    {
      name: 'the boundary moving down the page',
      probe: 'guest-boundary',
      geometry: {top: 999, y: 999},
    },
    {
      name: "another probe's height, which the allowance must not reach",
      probe: 'settings-control',
      geometry: {height: 99},
    },
  ])(
    'still reports $name as host damage',
    ({probe, style, geometry}) => {
      const {baseline, result} = measureGuestBoundaryInsertion();
      const mutated = JSON.parse(JSON.stringify(result)) as Measurement;
      for (const scheme of ['light', 'dark'] as const) {
        const reading = mutated.schemes[scheme].probes[probe] as {
          style: Record<string, string>;
          geometry: Record<string, number>;
        };
        Object.assign(reading.style, style ?? {});
        Object.assign(reading.geometry, geometry ?? {});
      }

      const score = scoreArm(baseline, mutated);

      expect(score.regressions).toBeGreaterThan(0);
      expect(passesAcceptance(score)).toBe(false);
    },
    180_000,
  );

  it.each([
    {name: 'gained', mutate: (text: string) => `${text} Open service actions`},
    {
      name: 'lost',
      mutate: (text: string) => text.replace('Guest subtree ', ''),
    },
  ])(
    'still reports host copy the boundary $name',
    ({mutate}) => {
      const {baseline, result} = measureGuestBoundaryInsertion();
      const mutated = JSON.parse(JSON.stringify(result)) as Measurement;
      for (const scheme of ['light', 'dark'] as const) {
        const reading = mutated.schemes[scheme].probes['guest-boundary'] as {
          text: string;
        };
        reading.text = mutate(reading.text);
      }

      const score = scoreArm(baseline, mutated);

      expect(
        score.regressionDetails.some(
          regression =>
            regression.probe === 'guest-boundary' &&
            regression.property === 'text',
        ),
      ).toBe(true);
      expect(passesAcceptance(score)).toBe(false);
    },
    180_000,
  );
});

describeCanonical('canonical established-app strategies', () => {
  const FIXTURE = 'shadcn-tailwind-v4-established';

  beforeAll(() => {
    ensurePackageBuilds();
    // The preceding canonical block's afterAll removes every shared temporary
    // directory, including the cached dependency roots, while the module-level
    // cache still points at them. Drop the cache so this block installs its own
    // rather than hard-linking from a directory that no longer exists.
    dependencyRoots.clear();
  }, 180_000);

  afterAll(() => {
    for (const directory of temporaryDirectories) {
      fs.rmSync(directory, {recursive: true, force: true});
    }
  });

  function addAstryxButton(arm: string, wrap: 'none' | 'guest-region') {
    const button = `<Button
                data-vibe-result="astryx-button"
                label="Deploy"
                size="md"
                variant="secondary"
              />`;
    edit(path.join(arm, 'src', 'App.tsx'), source =>
      source
        .replace(
          "import {useState} from 'react';",
          [
            "import {useState} from 'react';",
            "import {Button as AstryxButton} from '@astryxdesign/core/Button';",
            ...(wrap === 'guest-region'
              ? ["import {GuestRegion} from './GuestRegion';"]
              : []),
          ].join('\n'),
        )
        .replace(
          `              <Button
                data-vibe-probe="primary-action"
                onClick={() => setDialogOpen(true)}>
                New request
              </Button>`,
          wrap === 'guest-region'
            ? `              <Button
                data-vibe-probe="primary-action"
                onClick={() => setDialogOpen(true)}>
                New request
              </Button>
              <GuestRegion mode={dark ? 'dark' : 'light'}>
                <AstryxButton
                  data-vibe-result="astryx-button"
                  label="Deploy"
                  size="md"
                  variant="secondary"
                />
              </GuestRegion>`
            : `              <Button
                data-vibe-probe="primary-action"
                onClick={() => setDialogOpen(true)}>
                New request
              </Button>
              <AstryxButton
                data-vibe-result="astryx-button"
                label="Deploy"
                size="md"
                variant="secondary"
              />`,
        ),
    );
    return button;
  }

  it('records the host-aligned bare-element gap without weakening acceptance', () => {
    const {root, baseline: baselineApp, arm} = preparePair(FIXTURE);
    installHostAlignedStrategy(arm);
    addAstryxButton(arm, 'none');

    const baseline = measure(
      baselineApp,
      FIXTURE,
      path.join(root, 'host-aligned-baseline.json'),
    );
    const provenance = provenanceFor(arm, FIXTURE, 's1');
    const result = measure(
      arm,
      FIXTURE,
      path.join(root, 'host-aligned-arm.json'),
      provenance,
    );

    expect(
      result.build.ok,
      `${result.build.stdout}\n${result.build.stderr}`,
    ).toBe(true);
    const score = scoreArm(baseline, result);

    // PRODUCT GAP, recorded rather than accommodated.
    //
    // A built theme always emits bare-element prose rules (h1-h6, p, small,
    // code/pre: family, size, weight, line height, color) into @layer reset,
    // @scope'd on the theme-name attribute. There is no supported way to build
    // a theme without them. host-aligned also requires that attribute at
    // document scope before first paint, so the design system's typographic
    // scale necessarily reaches the established host's bare elements.
    //
    // On a host whose bare elements differ from that scale, the result is real
    // host damage that no supported configuration avoids. The evaluator is
    // deliberately NOT relaxed for it: the strategy fails acceptance here, and
    // that failure is the finding.
    expect(passesAcceptance(score)).toBe(false);
    expect(score.regressionDetails.length).toBeGreaterThan(0);

    // If the gap ever closes, this test must be revisited rather than silently
    // keep passing: a clean host-aligned run should promote this to acceptance.
    expect(verdict(score)).not.toBe('clean');

    // The damage must still be attributable and bounded — the strategy does not
    // break the build or lose the task marker.
    expect(score.taskSuccess).toBe(true);

    // The measured host damage above is the ONLY thing standing between this
    // strategy and acceptance. The integrity checker used to add a second,
    // spurious reason: `astryx theme build` emits
    // `html[data-theme="light"] { color-scheme: light; }` paired with its dark
    // twin, and a lexical scan read the light arm as disabling dark mode.
    // That pattern now reads paired, mode-scoped arms semantically, so a
    // built theme is clean here and the strategy's remaining failure is a real
    // product gap rather than an evaluator artifact.
    expect(score.integrityFailures).toEqual([]);

    for (const scheme of ['light', 'dark'] as const) {
      expect(
        result.schemes[scheme].taskResults?.['astryx-button'],
      ).toMatchObject({count: 1, visible: true});
    }

    // Host damage is still detected at full strength.
    assertStyleMutationFails(baseline, result, 'primary-action');
  }, 180_000);

  it('builds an app-owned theme deterministically and imports no stock theme', () => {
    const {root, arm} = preparePair(FIXTURE);
    installHostAlignedStrategy(arm);

    const generated = path.join(arm, 'src', 'hostaligned.css');
    const first = fs.readFileSync(generated, 'utf8');
    run(
      process.execPath,
      [
        path.join(REPO_ROOT, 'packages/cli/clients/cli/bin/astryx.mjs'),
        'theme',
        'build',
        path.join('src', 'hostTheme.ts'),
      ],
      arm,
    );
    // Same input, byte-identical output: the build step is deterministic.
    expect(fs.readFileSync(generated, 'utf8')).toBe(first);

    const css = fs.readFileSync(path.join(arm, 'src', 'index.css'), 'utf8');
    expect(css).not.toContain('@astryxdesign/theme-neutral/theme.css');
    expect(css).not.toContain('tailwind-theme.css');
    expect(css).toContain("@import 'tailwindcss';");
    // The theme attribute is in the served markup, not written by an effect.
    expect(fs.readFileSync(path.join(arm, 'index.html'), 'utf8')).toContain(
      'data-astryx-theme="hostaligned"',
    );
    // Generated CSS carries no absolute path from this machine.
    expect(first).not.toContain(root);
    assertPublicArtifactSafe(
      {generated: first.split('\n').slice(0, 8).join('\n')},
      {label: 'generated host-aligned theme header'},
    );
  }, 180_000);

  it('accepts a canonical guest-contained s1 insertion with no host damage', () => {
    const {root, baseline: baselineApp, arm} = preparePair(FIXTURE);
    installGuestContainedStrategy(arm);
    addAstryxButton(arm, 'guest-region');

    const baseline = measure(
      baselineApp,
      FIXTURE,
      path.join(root, 'guest-contained-baseline.json'),
    );
    const provenance = provenanceFor(arm, FIXTURE, 's1');
    const result = measure(
      arm,
      FIXTURE,
      path.join(root, 'guest-contained-arm.json'),
      provenance,
    );

    expect(
      result.build.ok,
      `${result.build.stdout}\n${result.build.stderr}`,
    ).toBe(true);
    const score = scoreArm(baseline, result);
    expect(score.regressionDetails, JSON.stringify(score, null, 2)).toEqual([]);
    expect(verdict(score)).toBe('clean');
    expect(passesAcceptance(score)).toBe(true);

    const css = fs.readFileSync(path.join(arm, 'src', 'index.css'), 'utf8');
    // The host keeps preflight: the reset is never imported.
    expect(css).not.toContain('@astryxdesign/core/reset.css');
    expect(css).not.toContain('tailwind-theme.css');

    assertStyleMutationFails(baseline, result, 'primary-action');
  }, 180_000);

  it('documents the guest-contained portal tradeoff instead of hiding it', () => {
    const {arm} = preparePair(FIXTURE);
    installGuestContainedStrategy(arm);
    const region = fs.readFileSync(
      path.join(arm, 'src', 'GuestRegion.tsx'),
      'utf8',
    );

    // There is no supported prop for this; the only mechanism today is
    // removing the attribute and observing for its return.
    expect(region).toContain("removeAttribute('data-astryx-theme')");
    expect(region).toContain('MutationObserver');
    // data-theme drives color-scheme for the host and must survive.
    expect(region).not.toContain("removeAttribute('data-theme')");
    // The workaround is labelled honestly and the tradeoff is written down.
    expect(region).toContain('WORKAROUND, not a supported configuration');
    expect(region).toMatch(/portal/i);

    // The tradeoff is real and mechanical, not a matter of opinion: theme CSS
    // is emitted as @scope'd on the theme-name attribute, so removing it from
    // the document element puts body-portaled content outside every scope root.
    const themeCss = fs.readFileSync(
      path.join(REPO_ROOT, 'packages/themes/neutral/dist/theme.css'),
      'utf8',
    );
    expect(themeCss).toContain('@scope ([data-astryx-theme=');
  }, 180_000);
});

/**
 * The executor's real install path — the one the canonical suite was missing.
 *
 * `@astryxdesign/core` ships a `postinstall`, and pnpm 11 refuses to install a
 * dependency with an install script until that dependency is approved. A cell
 * died on it: the executor put the approval in `package.json`, pnpm never read
 * it there, and the install aborted with `ERR_PNPM_IGNORED_BUILDS` before
 * anything about the host could be measured.
 *
 * Nothing in this suite caught it because the harness installs its own fixture
 * dependencies with `--ignore-scripts`, which sidesteps approval entirely. So
 * these run a real `pnpm install` the way an executor does — scripts enabled,
 * no flags — and pin what the guidance now claims:
 *
 *  - `allowBuilds` in `pnpm-workspace.yaml` installs cleanly and the approved
 *    app then actually builds;
 *  - the identical key in `package.json` does not, and fails the same way the
 *    measured cell did.
 *
 * Skipped with the rest of the canonical work unless the browser/canonical flag
 * is set, because it reaches the network.
 */
describeCanonical('canonical pnpm build approval', () => {
  const FIXTURE = 'enterprise-scoped-synthetic';
  const PACKAGE = '@astryxdesign/core';

  function freshApp(label: string) {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), `setup-canonical-pnpm-${label}-`),
    );
    temporaryDirectories.push(root);
    const app = path.join(root, 'app');
    copyFixture(FIXTURE, app);
    // The dependency set the strategy adds; the fixture itself has no Astryx.
    const manifest = JSON.parse(
      fs.readFileSync(path.join(app, 'package.json'), 'utf8'),
    );
    manifest.dependencies = {
      ...manifest.dependencies,
      [PACKAGE]: '0.5.2',
      '@astryxdesign/theme-neutral': '0.5.2',
    };
    fs.writeFileSync(
      path.join(app, 'package.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    fs.rmSync(path.join(app, 'pnpm-lock.yaml'), {force: true});
    return app;
  }

  // spawnSync rather than execFileSync's throwing form: a failing install is
  // the assertion in half these cases, not an error.
  const install = (app: string) =>
    spawnPnpm(['install'], {
      cwd: app,
      encoding: 'utf8',
      env: {...process.env, CI: 'true'},
    });

  it('installs and builds when allowBuilds is in pnpm-workspace.yaml', () => {
    const app = freshApp('workspace');
    fs.writeFileSync(
      path.join(app, 'pnpm-workspace.yaml'),
      `allowBuilds:\n  '${PACKAGE}': true\n`,
    );

    const result = install(app);

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(`${result.stdout}${result.stderr}`).not.toContain(
      'ERR_PNPM_IGNORED_BUILDS',
    );
    // The approval is what lets the package's own postinstall run, and the
    // approved app is what an executor then has to be able to build.
    expect(
      fs.existsSync(path.join(app, 'node_modules', PACKAGE, 'package.json')),
    ).toBe(true);
    const built = spawnPnpm(['build'], {
      cwd: app,
      encoding: 'utf8',
      env: {...process.env, CI: 'true'},
    });
    expect(built.status, `${built.stdout}\n${built.stderr}`).toBe(0);
    expect(fs.existsSync(path.join(app, 'dist', 'index.html'))).toBe(true);
  }, 900_000);

  it('fails exactly as the measured cell did when the key is in package.json', () => {
    // The mutation, and the executor's actual mistake: same key, same value,
    // the file pnpm 11 does not read it from.
    const app = freshApp('manifest');
    const manifest = JSON.parse(
      fs.readFileSync(path.join(app, 'package.json'), 'utf8'),
    );
    manifest.pnpm = {allowBuilds: {[PACKAGE]: true}};
    fs.writeFileSync(
      path.join(app, 'package.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );

    const result = install(app);

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain(
      'ERR_PNPM_IGNORED_BUILDS',
    );
  }, 600_000);
});
