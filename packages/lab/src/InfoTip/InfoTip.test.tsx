// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file InfoTip.test.tsx
 * @input The Lab InfoTip entry and the Core component
 * @output Tests that the Lab entry re-exports the Core component, deprecated
 * @position Testing; validates index.ts (component:InfoTip FR4)
 */

import {readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {InfoTip as CoreInfoTip} from '@astryxdesign/core/InfoTip';
import {InfoTip} from './index';

describe('Lab InfoTip', () => {
  it('is the Core component', () => {
    expect(InfoTip).toBe(CoreInfoTip);
  });

  it('marks each of its exports deprecated', () => {
    // Static metadata only: editors and type checkers show it, and nothing
    // warns at runtime.
    const source = readFileSync(path.join(__dirname, 'index.ts'), 'utf8');
    for (const name of ['InfoTip', 'InfoTipProps', 'InfoTipSize']) {
      // The doc comment right above the export, whatever it contains.
      const comment = new RegExp(
        String.raw`/\*\*((?:(?!\*/)[\s\S])*)\*/\nexport (?:const|type) ${name}\b`,
      ).exec(source);
      expect(comment?.[1], name).toContain('@deprecated');
    }
  });
});
