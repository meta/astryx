// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file A family built twice in one process reads each member as it is at
 * each build: a member rewritten between the builds is never built from
 * the module the first build loaded.
 */
import {beforeAll, describe, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import {createRequire} from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import {themeBuildFamily} from './build.mjs';
import {ensureCoreBuilt} from '../../../clients/cli/commands/ensure-core-built.mjs';

vi.setConfig({testTimeout: 120_000});
const CLI_ROOT = path.resolve(import.meta.dirname, '../../..');
const require = createRequire(import.meta.url);
beforeAll(() => ensureCoreBuilt(), 200_000);

/** A project in the OS temp folder, with the packages the CLI resolves. */
function makeDir() {
  const dir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-family-reload-')),
  );
  fs.mkdirSync(path.join(dir, 'themes'), {recursive: true});
  fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}\n');
  for (const [name, target] of Object.entries({
    '@astryxdesign': path.join(CLI_ROOT, 'node_modules/@astryxdesign'),
    react: path.dirname(require.resolve('react/package.json')),
  })) {
    const link = path.join(dir, 'node_modules', name);
    fs.mkdirSync(path.dirname(link), {recursive: true});
    fs.symlinkSync(target, link, 'dir');
  }
  return dir;
}

describe('a family built twice in one process', () => {
  it('builds the second time from each member as it is then', async () => {
    const dir = makeDir();
    try {
      const themes = path.join(dir, 'themes');
      fs.writeFileSync(
        path.join(themes, 'ocean.ts'),
        "import {defineTheme} from '@astryxdesign/core/theme';\nexport const ocean = defineTheme({name: 'ocean', tokens: {'--color-accent': '#0066cc'}});\n",
      );
      /** @param {string} accent */
      const member = accent =>
        fs.writeFileSync(
          path.join(themes, 'ocean-calm.ts'),
          `import {defineTheme} from '@astryxdesign/core/theme';\nimport {ocean} from './ocean';\nexport default defineTheme({extends: ocean, name: 'ocean-calm', tokens: {'--color-accent': '${accent}'}});\n`,
        );
      const build = async () => {
        await themeBuildFamily(
          ['themes/ocean.ts', 'themes/ocean-calm.ts'],
          {familyKey: 'ocean-family'},
          {cwd: dir},
        );
        return fs.readFileSync(path.join(themes, 'ocean-family.css'), 'utf8');
      };
      member('#111111');
      expect(await build()).toContain('#111111');
      member('#222222');
      const second = await build();
      expect(second).toContain('#222222');
      expect(second).not.toContain('#111111');
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });
});
