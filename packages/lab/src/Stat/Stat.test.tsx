// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Stat.test.tsx
 * @input The Lab Stat entry and the Core component
 * @output Tests that the Lab entry is the Core component
 * @position Testing; validates index.ts
 */

import {describe, expect, it} from 'vitest';
import {Stat as CoreStat} from '@astryxdesign/core/Stat';
import {Stat} from './index';

describe('Lab Stat', () => {
  it('is the Core component', () => {
    expect(Stat).toBe(CoreStat);
  });
});
