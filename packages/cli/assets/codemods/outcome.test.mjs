// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {
  ManualMigrationRequired,
  RegenerationRequired,
  codemodOutcome,
} from './outcome.mjs';

describe('codemodOutcome', () => {
  it('reads a manual migration with and without its line', () => {
    expect(codemodOutcome(new ManualMigrationRequired('m', {line: 3}))).toEqual(
      {kind: 'manual', message: 'm', line: 3},
    );
    expect(codemodOutcome(new ManualMigrationRequired('m'))).toEqual({
      kind: 'manual',
      message: 'm',
    });
  });

  it('reads a regeneration with its commands', () => {
    expect(
      codemodOutcome(new RegenerationRequired('r', {commands: ['gen']})),
    ).toEqual({kind: 'regenerate', message: 'r', commands: ['gen']});
  });

  it('treats anything else as an ordinary failure', () => {
    expect(codemodOutcome(new Error('boom'))).toBeNull();
    expect(
      codemodOutcome(Object.assign(new Error('x'), {kind: 'manual'})),
    ).toBeNull();
    expect(codemodOutcome('boom')).toBeNull();
    expect(codemodOutcome(undefined)).toBeNull();
  });

  it('stays an Error, so a runner without the wrapper still reports it', () => {
    expect(new ManualMigrationRequired('m')).toBeInstanceOf(Error);
    expect(new RegenerationRequired('r', {commands: []})).toBeInstanceOf(Error);
  });
});
