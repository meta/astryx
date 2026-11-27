// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Regression tests for `astryx init` app-theme next steps.
 *
 * The guidance follows the generated-module workflow: base CSS once, add an
 * installed theme, import the generated record once, extend to customize, and
 * eject only to make an independent source fork.
 */

import {describe, it, expect, afterAll} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {getNextSteps} from '../../../api/init/init.mjs';
import {recordDeclaredSettings} from '../../../foundation/env/cli-command.mjs';
// A project with no Core takes the theme at the release of the CLI that
// answers, whose Core the theme brings.
import {CLI_VERSION} from '../../../test-utils/release-fixtures.mjs';

/** @type {string[]} */
const made = [];
/**
 * A project folder with the given files.
 * @param {Record<string, string>} files
 */
function project(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-next-steps-'));
  made.push(dir);
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"app"}');
  for (const [name, text] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), text);
  }
  return dir;
}
afterAll(() => {
  for (const dir of made) fs.rmSync(dir, {recursive: true, force: true});
});

describe('init Next steps theme guidance', () => {
  const text = getNextSteps('npx astryx', project({})).join('\n');

  it('mentions the base CSS imports so the app is not left unstyled', () => {
    expect(text).toContain("'@astryxdesign/core/reset.css'");
    expect(text).toContain("'@astryxdesign/core/astryx.css'");
  });

  it('adds an installed theme through the CLI', () => {
    expect(text).toContain(
      `npm install @astryxdesign/theme-neutral@${CLI_VERSION}\n`,
    );
    expect(text).toContain('npx astryx theme add neutral');
  });

  it("installs the theme with the project's package manager", () => {
    const pnpm = getNextSteps(
      'pnpm exec astryx',
      project({'pnpm-lock.yaml': "lockfileVersion: '9.0'\n"}),
    ).join('\n');
    expect(pnpm).toContain(
      `pnpm add @astryxdesign/theme-neutral@${CLI_VERSION}\n`,
    );
    expect(pnpm).not.toContain('npm install');
  });

  it("installs the theme at the project's Core release, saved exactly where Core is pinned", () => {
    const dir = project({'package-lock.json': '{}'});
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({
        name: 'app',
        dependencies: {'@astryxdesign/core': '0.7.10'},
      }),
    );
    const pinned = getNextSteps('npx @astryxdesign/cli@0.7.10', dir).join('\n');
    expect(pinned).toContain(
      'npm install -E @astryxdesign/theme-neutral@0.7.10\n',
    );
  });

  it('wires the generated theme record once', () => {
    expect(text).toContain(
      "{ themes, defaultThemeSlug } from './astryx-themes'",
    );
    expect(text).toContain('themes[defaultThemeSlug]');
  });

  it('names extension for customization and eject only for a source fork', () => {
    expect(text).toContain('Extend an imported theme');
    expect(text).toContain('npx astryx theme eject <slug>');
    expect(text).toContain('only to fork source');
  });

  it('sends making or changing a theme to the theme editor', () => {
    expect(text).toContain(
      'To make or change a theme: the experimental theme editor',
    );
    expect(text).toContain(
      'npx astryx experimental theme editor new <name> --like neutral',
    );
  });

  it('does not teach a direct package theme import', () => {
    expect(text).not.toContain("from '@astryxdesign/theme-neutral");
  });
});

describe('init Next steps when the lockfiles disagree', () => {
  it('prints npm install and says the lockfiles disagree', () => {
    const text = getNextSteps(
      'npx astryx',
      project({'pnpm-lock.yaml': "lockfileVersion: '9.0'\n", 'yarn.lock': '# yarn\n'}),
    ).join('\n');
    expect(text).toContain(
      `npm install @astryxdesign/theme-neutral@${CLI_VERSION}\n`,
    );
    expect(text).toContain('(the lockfiles in this folder disagree; use the package manager this project uses)');
  });

  it('follows a declared packageManager over a stray lockfile', () => {
    const dir = project({'package-lock.json': '{}'});
    fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"app","packageManager":"pnpm@10.0.0"}');
    const text = getNextSteps('pnpm exec astryx', dir).join('\n');
    expect(text).toContain(
      `pnpm add @astryxdesign/theme-neutral@${CLI_VERSION}\n`,
    );
  });
});

describe('init in an app that is already set up', () => {
  it('names the build and search commands, not the install steps', async () => {
    const {getWorkflowSteps} = await import('../../../api/init/init.mjs');
    const text = getWorkflowSteps('pnpm exec astryx').join('\n');
    expect(text).toContain('Astryx is already set up here');
    expect(text).toContain('pnpm exec astryx build "<what you\'re building>"');
    expect(text).toContain('pnpm exec astryx search <query>');
    expect(text).toContain('pnpm exec astryx docs getting-started');
    expect(text).not.toContain('Next steps');
    expect(text).not.toContain('theme-neutral');
  });
});

describe('init Next steps when an integration gives install guidance', () => {
  it('prints the guidance instead of a package-manager command', () => {
    const dir = project({'pnpm-lock.yaml': "lockfileVersion: '9.0'\n"});
    recordDeclaredSettings(dir, [
      {name: '@acme/ui', installGuidance: 'Add {packages} to package.json, commit, then run the relock script'},
    ]);
    const text = getNextSteps('pnpm exec astryx', dir).join('\n');
    expect(text).toContain(
      `Add @astryxdesign/theme-neutral@${CLI_VERSION} to package.json, commit, then run the relock script\n`,
    );
    expect(text).not.toContain('pnpm add');
    expect(text).not.toContain('disagree');
  });
});
