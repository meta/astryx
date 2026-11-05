// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The published `@astryxdesign/cli/json` envelope types carry
 * `apiVersion`, the field every `--json` envelope has. Type-checks a consumer
 * fixture that reads it from each envelope shape.
 */

import {describe, it, expect} from 'vitest';
import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const INDEX = fileURLToPath(new URL('./index.ts', import.meta.url));
const TSC = createRequire(import.meta.url).resolve('typescript/bin/tsc');

const FIXTURE = `
import type {
  assertResponse,
  CLIError,
  CLIUnsupportedError,
  parseResponse,
} from ${JSON.stringify(INDEX)};

declare const error: CLIError;
declare const unsupported: CLIUnsupportedError;
declare const parsed: Exclude<ReturnType<typeof parseResponse>, CLIError | CLIUnsupportedError>;
declare const asserted: ReturnType<typeof assertResponse<'manifest'>>;

export const versions: number[] = [
  error.apiVersion,
  unsupported.apiVersion,
  parsed.apiVersion,
  asserted.apiVersion,
];
`;

describe('@astryxdesign/cli/json envelope types', () => {
  it('declare apiVersion on the success and error envelopes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-envelope-types-'));
    try {
      fs.writeFileSync(path.join(dir, 'fixture.ts'), FIXTURE);
      fs.writeFileSync(
        path.join(dir, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            target: 'ES2022',
            module: 'ESNext',
            moduleResolution: 'bundler',
            strict: true,
            noEmit: true,
            skipLibCheck: true,
            allowImportingTsExtensions: true,
            // index.ts re-exports JSDoc types from .type.mjs files; read them
            // from source, as tsconfig.json-api.json does, not from generated
            // declarations that exist only after a build.
            allowJs: true,
            types: [],
          },
          files: ['fixture.ts'],
        }),
      );
      const res = spawnSync(process.execPath, [TSC, '-p', dir], {
        encoding: 'utf-8',
        timeout: 60_000,
      });
      expect(res.stdout + res.stderr).toBe('');
      expect(res.status).toBe(0);
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });
});
