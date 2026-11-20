// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file shellArg: one shell word for a printed command. */

import {describe, expect, it} from 'vitest';
import {shellArg} from './shell-arg.mjs';

describe('shellArg', () => {
  it('shell-quotes unusual ids instead of allowing command substitution', () => {
    expect(shellArg('safe/id')).toBe('safe/id');
    expect(shellArg('@acme/icons/24/solid')).toBe('@acme/icons/24/solid');
    expect(shellArg('my$thing')).toBe("'my$thing'");
    expect(shellArg("a'b")).toBe("'a'\\''b'");
    expect(shellArg('foo`id`')).toBe("'foo`id`'");
    expect(shellArg('arrow up')).toBe("'arrow up'");
  });
});
