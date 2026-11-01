// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file End-to-end test for the `astryx theme build` font-loading warning
 * (#5015). A theme that names webfont families gets a one-line stdout notice
 * naming the fonts; with `--detail full` it gets, AFTER the install
 * instructions, the copy-pasteable fix — the Google Fonts <link> pair and a
 * self-hosted @font-face with font-display: swap. It still exits 0 (it is a
 * warning, not an error). Themes that only name generics or known system
 * stacks get none of it.
 */

import {describe, it, expect, beforeAll, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {ensureCoreBuilt} from './ensure-core-built.mjs';
import {runCli} from '../../../test-utils/run-cli.mjs';

function writeTheme(dir, name, source) {
  fs.mkdirSync(dir, {recursive: true});
  const file = path.join(dir, `${name}.mjs`);
  fs.writeFileSync(file, source);
  return file;
}

// `astryx theme build` imports the compiled @astryxdesign/core/theme entry.
// Build core once if it isn't already present so the suite works in any CI
// job, regardless of job ordering.
beforeAll(() => {
  ensureCoreBuilt();
}, 200_000);

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-build-theme-fonts-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('theme build font-loading warning', () => {
  it('prints the unloaded fonts and the <link>/@font-face fix after the install instructions', async () => {
    const project = path.join(tmpDir, 'project');
    const themeFile = writeTheme(
      project,
      'fonty',
      `export default {
  name: 'fonty',
  typography: {
    body: {family: 'Space Grotesk', fallbacks: 'Arial, sans-serif'},
    code: {family: 'JetBrains Mono'},
  },
};\n`,
    );

    const result = await runCli(
      ['--detail', 'full', 'theme', 'build', path.relative(project, themeFile)],
      project,
    );

    expect(result.code).toBe(0);
    // The install instructions still come out intact…
    expect(result.stdout).toContain("from './fonty'");
    // …followed by the warning naming the theme and every unloaded family…
    expect(result.stdout).toContain('names fonts it does not load');
    expect(result.stdout).toContain('"Space Grotesk"');
    expect(result.stdout).toContain('"JetBrains Mono"');
    // …and the copy-pasteable fix, both flavors.
    expect(result.stdout).toContain(
      '<link rel="preconnect" href="https://fonts.googleapis.com"',
    );
    expect(result.stdout).toContain('family=Space+Grotesk');
    expect(result.stdout).toContain('family=JetBrains+Mono');
    expect(result.stdout).toContain('display=swap');
    expect(result.stdout).toContain('@font-face');
    expect(result.stdout).toContain('font-display: swap');
    expect(result.stdout).toContain(' docs typography');
    // The one-line summaries follow the CLI's stream contract. These are
    // NOTICES about a correct theme, not warnings, so they go to stdout with
    // the rest of the build's progress — stderr stays for the defects an
    // author has to fix.
    expect(result.stdout).toContain('note: Font "Space Grotesk"');
    expect(result.stdout).toContain('note: Font "JetBrains Mono"');
    expect(result.stderr).not.toContain('Font "');
  });

  it('names the unloaded fonts in one line by default', async () => {
    const project = path.join(tmpDir, 'project');
    const themeFile = writeTheme(
      project,
      'fonty',
      `export default {
  name: 'fonty',
  typography: {
    body: {family: 'Space Grotesk', fallbacks: 'Arial, sans-serif'},
    code: {family: 'JetBrains Mono'},
  },
};\n`,
    );

    const result = await runCli(
      ['theme', 'build', path.relative(project, themeFile)],
      project,
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(
      /\[note\] Fonts named but not loaded: "Space Grotesk", "JetBrains Mono"\. Load them in your app \(recipe: .+ docs typography\)\.\n/,
    );
    expect(result.stdout).not.toContain('fonts.googleapis.com');
    expect(result.stdout).not.toContain('@font-face');
    expect(result.stdout).toContain('Run with --detail full');
  });

  it('keeps --json stdout one valid envelope: notices inside, snippet suppressed', async () => {
    const project = path.join(tmpDir, 'project');
    const themeFile = writeTheme(
      project,
      'fonty',
      `export default { name: 'fonty', tokens: { '--font-family-body': '"Space Grotesk", sans-serif' } };\n`,
    );

    const result = await runCli(
      ['--json', 'theme', 'build', path.relative(project, themeFile)],
      project,
    );

    expect(result.code).toBe(0);
    // The whole stdout must parse — any human snippet leaking into --json
    // mode corrupts the envelope, so this asserts the "JSON is always JSON"
    // contract, not just substring presence.
    const envelope = JSON.parse(result.stdout);
    expect(envelope.type).toBe('theme.build');
    expect(envelope.data.notices).toEqual(
      expect.arrayContaining([expect.stringContaining('Font "Space Grotesk"')]),
    );
    expect(result.stdout).not.toContain('fonts.googleapis.com');
    // Human one-liners are silenced too — machine mode stays quiet.
    expect(result.stderr).not.toContain('Font "');
  });

  it('prints nothing font-related for a theme of generics and system stacks', async () => {
    const project = path.join(tmpDir, 'project');
    const themeFile = writeTheme(
      project,
      'sys',
      `export default {
  name: 'sys',
  tokens: {
    '--color-bg': '#fff',
    '--font-family-body': 'Helvetica, Arial, sans-serif',
    '--font-family-code': 'ui-monospace',
  },
};\n`,
    );

    const result = await runCli(
      ['--detail', 'full', 'theme', 'build', path.relative(project, themeFile)],
      project,
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("from './sys'");
    expect(result.stdout).not.toContain('names fonts it does not load');
    expect(result.stdout).not.toContain('fonts.googleapis.com');
    expect(result.stdout).not.toContain('@font-face');
    expect(result.stderr).not.toContain('Font "');
  });
});
