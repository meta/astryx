// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const coreDeclarationMock = vi.hoisted(() => ({useLegacyHeading: false}));

vi.mock('node:fs', async importActual => {
  const actual = await importActual();
  return {
    ...actual,
    readFileSync(file, ...args) {
      if (
        coreDeclarationMock.useLegacyHeading &&
        /[\\/]dist[\\/]Heading[\\/]index\.d\.ts$/.test(String(file))
      ) {
        return `export { Heading, type HeadingProps, type HeadingLevel, type HeadingType } from './Heading';\n`;
      }
      return actual.readFileSync(file, ...args);
    },
  };
});

const {themeBuild} = await import('./build.mjs');

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'astryx-heading-core-compat-'),
  );
});
afterEach(() => {
  coreDeclarationMock.useLegacyHeading = false;
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('theme build Heading compatibility guard', () => {
  it('rejects a surface custom type when the installed Core predates HeadingTypeMap', async () => {
    const themeFile = path.join(tmpDir, 'legacy-core-theme.mjs');
    fs.writeFileSync(
      themeFile,
      `export default {
        name: 'legacy-core-theme',
        tokens: { '--color-bg': '#fff' },
        onDark: {
          components: {
            heading: { 'type:hero': { fontSize: '80px' } },
          },
        },
      };\n`,
    );
    coreDeclarationMock.useLegacyHeading = true;

    await expect(
      themeBuild('legacy-core-theme.mjs', {}, {cwd: tmpDir}),
    ).rejects.toThrow(
      'Custom Heading types require an installed @astryxdesign/core that exports HeadingTypeMap',
    );
    expect(fs.existsSync(path.join(tmpDir, 'legacy-core-theme.css'))).toBe(
      false,
    );
    expect(
      fs.existsSync(path.join(tmpDir, 'legacy-core-theme.variants.d.ts')),
    ).toBe(false);
  });
});
