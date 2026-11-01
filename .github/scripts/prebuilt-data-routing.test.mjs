// Copyright (c) Meta Platforms, Inc. and affiliates.

/** Pins the prebuilt data-variable browser proof to the existing cascade owner. */
import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

const ROOT = path.resolve(import.meta.dirname, '../..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

describe('prebuilt data-variable browser routing', () => {
  it('runs through the existing Build cascade guard after Chromium is installed', () => {
    const steps = yaml.parse(read('.github/workflows/ci.yml')).jobs[
      'test-build'
    ].steps;
    const install = steps.findIndex(
      step => step.run === 'npx playwright install chromium',
    );
    const guard = steps.findIndex(step => step.run === 'pnpm test:build');
    expect(install).toBeGreaterThanOrEqual(0);
    expect(guard).toBeGreaterThan(install);
    expect(JSON.parse(read('package.json')).scripts['test:build']).toContain(
      'node .github/scripts/theme-layer-cascade.js',
    );
    const source = read('.github/scripts/theme-layer-cascade.js');
    expect(source).toContain('scripts/build-css.data-tokens.browser.test.mjs');
    expect(source).toContain("ASTRYX_PREBUILT_DATA_BROWSER: '1'");
    expect(source).toContain('execFileSync(');
    expect(source).not.toContain('continue-on-error');
  });
});
