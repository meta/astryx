// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {SF_SYMBOL_NAMES} from './defaults.js';

const SWIFT_ICONS = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../apple/Sources/Astryx/Theme/AstryxIcons.swift',
);

describe('Astryx Swift icon defaults', () => {
  it('match NATIVE_ICON_DEFAULTS for Apple platforms', () => {
    const swift = fs.readFileSync(SWIFT_ICONS, 'utf8');
    const entries = Object.fromEntries(
      [...swift.matchAll(/^ {2}"(\w+)": "([^"]+)",$/gm)].map(m => [m[1], m[2]]),
    );
    expect(entries).toEqual({...SF_SYMBOL_NAMES});
  });
});
