// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Every printer of a step that adds packages the app lacks prints the loaded
 * integration's `installGuidance` in place of the package-manager command
 * (spec AST-039 FR16), and the package-manager command when no integration
 * gives one.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {recordDeclaredSettings} from '../foundation/env/cli-command.mjs';
import {CLI_VERSION} from '../test-utils/release-fixtures.mjs';
import {
  addMatchingCore,
  projectAddCommand,
} from '../foundation/release/notices.mjs';
import {installLine} from '../api/theme-edit/_project.mjs';
import {addCommand} from '../api/discover/_adapter.mjs';
import {coreAddCommand} from '../api/doctor/_adapter.mjs';
import {forkNeeds} from '../api/theme/_adapter.mjs';
import {analyzeTemplateNeeds} from '../foundation/discovery/template-needs.mjs';
import {pageNeeds} from '../api/theme-edit/_preview-app.mjs';
import {checkCoreInstalled} from '../api/doctor/doctor.mjs';
import {coreUnavailableMessage} from '../api/theme/build/build.mjs';

const GUIDANCE =
  'Add {packages} to package.json, commit, then run the relock script';

/** @type {string} */
let dir;

beforeEach(() => {
  dir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-guidance-')),
  );
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({
      name: 'app',
      dependencies: {'@astryxdesign/core': '0.7.16', react: '19.0.0'},
    }),
  );
  fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n');
});

afterEach(() => {
  recordDeclaredSettings(dir, []);
  fs.rmSync(dir, {recursive: true, force: true});
});

/** Every surface's line for adding `recharts`, in one list. */
function lines() {
  fs.mkdirSync(path.join(dir, 'fork'), {recursive: true});
  fs.writeFileSync(
    path.join(dir, 'fork', 'theme.ts'),
    "import {scaleLinear} from 'recharts';\nexport default scaleLinear;\n",
  );
  return {
    addMatchingCore: addMatchingCore(dir, 'recharts'),
    projectAddCommand: projectAddCommand(dir)?.('recharts'),
    installLine: installLine(dir, ['recharts']),
    discover: addCommand(/** @type {any} */ ({cwd: dir}))('recharts'),
    eject: forkNeeds('fork', ['theme.ts'], dir),
  };
}

describe('install guidance on every add step', () => {
  it('prints the package manager command when no integration gives guidance', () => {
    const found = lines();
    expect(found.addMatchingCore).toBe('pnpm add recharts');
    expect(found.projectAddCommand).toBe('pnpm add recharts');
    expect(found.installLine).toBe('pnpm add recharts');
    expect(found.discover).toBe('pnpm add recharts');
    expect(found.eject.installGuidance).toBeNull();
    expect(coreAddCommand(dir, '0.7.17')).toMatch(/^pnpm add /);
  });

  it("prints the integration's guidance in place of it", () => {
    recordDeclaredSettings(dir, [
      {name: '@acme/platform', installGuidance: GUIDANCE},
    ]);
    const expected = GUIDANCE.replace('{packages}', 'recharts');
    const found = lines();
    expect(found.addMatchingCore).toBe(expected);
    expect(found.projectAddCommand).toBe(expected);
    expect(found.installLine).toBe(expected);
    expect(found.discover).toBe(expected);
    expect(found.eject).toMatchObject({
      missingPackages: ['recharts'],
      installGuidance: expected,
    });
    expect(found.eject.installCommand).toMatch(/^pnpm add recharts/);
    // Moving Core into a theme's range is a release move, not an add: it
    // keeps the package manager's command, which carries the range.
    expect(coreAddCommand(dir, '0.7.17')).toMatch(
      /^pnpm add .*@astryxdesign\/core@0\.7\.17/,
    );
  });

  it('prints it for Core in a project that does not list Core', () => {
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({name: 'app'}),
    );
    const ctx = /** @type {any} */ ({
      cwd: dir,
      nodeVersion: '',
      coreDir: null,
      configPath: null,
    });
    // With no Core, Core is named at the release of the CLI that answers.
    expect(checkCoreInstalled(ctx).fix).toBe(
      `Install the design system: \`pnpm add @astryxdesign/core@${CLI_VERSION}\`.`,
    );
    expect(coreUnavailableMessage(dir, new Error('missing'))).toContain(
      `\`pnpm add @astryxdesign/core@${CLI_VERSION}\``,
    );
    recordDeclaredSettings(dir, [
      {name: '@acme/platform', installGuidance: GUIDANCE},
    ]);
    const line = GUIDANCE.replace(
      '{packages}',
      `@astryxdesign/core@${CLI_VERSION}`,
    );
    expect(checkCoreInstalled(ctx).fix).toBe(
      `Install the design system: \`${line}\`.`,
    );
    expect(coreUnavailableMessage(dir, new Error('missing'))).toContain(
      `\`${line}\``,
    );
  });

  it('names the version the command would add', () => {
    recordDeclaredSettings(dir, [
      {name: '@acme/platform', installGuidance: GUIDANCE},
    ]);
    // A package Astryx releases with Core is added at the project's Core.
    expect(addMatchingCore(dir, '@astryxdesign/theme-neutral')).toBe(
      GUIDANCE.replace('{packages}', '@astryxdesign/theme-neutral@0.7.16'),
    );
    expect(
      addCommand(/** @type {any} */ ({cwd: dir}))('recharts', '3.1.0'),
    ).toBe(GUIDANCE.replace('{packages}', 'recharts@3.1.0'));
  });

  it("puts it in template readiness and the theme editor's page notes", () => {
    const source =
      "import {LineChart} from 'recharts';\nexport default LineChart;\n";
    expect(analyzeTemplateNeeds(source, dir).notes[0]).toMatch(
      /^Install missing dependencies: pnpm add recharts/,
    );
    expect(pageNeeds(dir, source).installCommand).toMatch(/^pnpm add recharts/);
    recordDeclaredSettings(dir, [
      {name: '@acme/platform', installGuidance: GUIDANCE},
    ]);
    const line = GUIDANCE.replace('{packages}', 'recharts');
    const needs = analyzeTemplateNeeds(source, dir);
    expect(needs.notes[0]).toBe(`Install missing dependencies: ${line}`);
    expect(needs.installGuidance).toBe(line);
    // The receipt keeps the package-manager command and carries the line
    // beside it.
    expect(pageNeeds(dir, source)).toMatchObject({
      installGuidance: line,
      noCommand: false,
    });
    expect(pageNeeds(dir, source).installCommand).toMatch(/^pnpm add recharts/);
  });
});
