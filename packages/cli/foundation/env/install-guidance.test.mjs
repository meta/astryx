// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  chooseDeclaredValue,
  declaredValuesOf,
  declaredCliCommand,
  installGuidanceFor,
  recordDeclaredSettings,
} from './cli-command.mjs';

describe('install guidance from loaded integrations', () => {
  it('uses one line, declared by one or more integrations', () => {
    const declared = declaredValuesOf(
      [
        {name: '@acme/a', installGuidance: 'Add {packages}, then relock'},
        {name: '@acme/b', installGuidance: 'Add {packages}, then relock'},
        {name: '@acme/c'},
      ],
      'installGuidance',
    );
    expect(chooseDeclaredValue(declared)).toMatchObject({
      value: 'Add {packages}, then relock',
      conflict: false,
    });
  });

  it('uses neither of two different lines, and says they conflict', () => {
    const choice = chooseDeclaredValue(
      declaredValuesOf(
        [
          {name: '@acme/a', installGuidance: 'Add {packages}, then relock'},
          {name: '@acme/b', installGuidance: 'Ask the platform team'},
        ],
        'installGuidance',
      ),
    );
    expect(choice.value).toBeUndefined();
    expect(choice.conflict).toBe(true);
  });

  it('fills in {packages} from the record cliCommand reads, set-aside packages left out', () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'astryx-install-guidance-'),
    );
    try {
      fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"app"}');
      expect(installGuidanceFor(['a'], dir)).toBeUndefined();
      recordDeclaredSettings(dir, [
        {
          name: '@acme/a',
          cliCommand: 'acme astryx',
          installGuidance: 'Add {packages} to package.json, then relock',
        },
        {
          name: '@acme/b',
          installGuidance: 'Ask the platform team',
          __loadError: 'boom',
        },
        {
          name: '@acme/c',
          installGuidance: 'Something else',
          __providerConflict: {},
        },
      ]);
      expect(installGuidanceFor(['recharts', '@acme/b'], dir)).toBe(
        'Add recharts @acme/b to package.json, then relock',
      );
      expect(declaredCliCommand(dir).command).toBe('acme astryx');
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });
});
