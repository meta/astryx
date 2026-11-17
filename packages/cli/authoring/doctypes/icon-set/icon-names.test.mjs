// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The CLI's IconName list matches Core's `IconName` union.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, it, expect} from 'vitest';
import {ICON_NAMES} from './icon-names.mjs';

const REGISTRY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../core/src/Icon/globalIconRegistry.tsx',
);

describe('ICON_NAMES', () => {
  it("lists exactly Core's IconName union, in order", () => {
    const source = fs.readFileSync(REGISTRY, 'utf-8');
    const union = /export type IconName =([^;]*);/u.exec(source)?.[1] ?? '';
    const names = [...union.matchAll(/'([^']+)'/gu)].map(match => match[1]);
    expect(names.length).toBeGreaterThan(0);
    expect([...ICON_NAMES]).toEqual(names);
  });
});
