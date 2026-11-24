// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.test.ts
 * @input The Lab SelectableCardGroup entry and the Core component
 * @output Tests that the Lab entry re-exports the Core exports, deprecated
 * @position Testing; validates index.ts
 */

import {readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {SelectableCardGroup as CoreSelectableCardGroup} from '@astryxdesign/core/SelectableCardGroup';
import {SelectableCardGroup} from './index';

const EXPORTS = ['SelectableCardGroup', 'SelectableCardGroupProps'];

describe('Lab SelectableCardGroup', () => {
  it('is the Core component', () => {
    expect(SelectableCardGroup).toBe(CoreSelectableCardGroup);
  });

  it('marks each of its exports deprecated', () => {
    // Static metadata only: editors and type checkers show it, and nothing
    // warns at runtime.
    const source = readFileSync(path.join(__dirname, 'index.ts'), 'utf8');
    for (const name of EXPORTS) {
      // The doc comment right above the export, whatever it contains.
      const comment = new RegExp(
        String.raw`/\*\*((?:(?!\*/)[\s\S])*)\*/\nexport (?:const|type) ${name}\b`,
      ).exec(source);
      expect(comment?.[1], name).toContain('@deprecated');
    }
  });
});
