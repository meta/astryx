// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useResizableStory.test.mjs
 * @input The StructuredPercentSizing Storybook fixture source.
 * @output Mutation-sensitive contract that its scrollable content is keyboard-reachable.
 * @position Focused source guard paired with the real Chromium/axe story check.
 */

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {describe, expect, it} from 'vitest';

const STORY_PATH = path.resolve(
  import.meta.dirname,
  '../stories/useResizable.stories.tsx',
);

function jsxAttributes(tagName) {
  const source = ts.createSourceFile(
    STORY_PATH,
    fs.readFileSync(STORY_PATH, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const matches = [];
  const visit = node => {
    if (
      ts.isJsxElement(node) &&
      node.openingElement.tagName.getText(source) === tagName
    ) {
      matches.push(node.openingElement.attributes.properties);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return matches;
}

describe('StructuredPercentSizing story', () => {
  it('gates a named scroll region on effective overflow', () => {
    const sourceText = fs.readFileSync(STORY_PATH, 'utf8');
    const [attributes] = jsxAttributes('LayoutContent');
    expect(attributes).toBeDefined();

    const attribute = name =>
      attributes.find(
        candidate =>
          ts.isJsxAttribute(candidate) && candidate.name.getText() === name,
      );
    expect(attribute('tabIndex')?.initializer?.getText()).toBe(
      '{isContentScrollable ? 0 : -1}',
    );
    expect(attribute('role')?.initializer?.getText()).toBe(
      "{isContentScrollable ? 'region' : undefined}",
    );
    expect(attribute('label')?.initializer?.getText()).toContain(
      'isContentScrollable',
    );
    expect(attribute('data-testid')?.initializer?.getText()).toContain(
      'structured-percent-${kind}-content',
    );
    const [panelAttributes] = jsxAttributes('LayoutPanel');
    const panelScrollable = panelAttributes.find(
      candidate =>
        ts.isJsxAttribute(candidate) &&
        candidate.name.getText() === 'isScrollable',
    );
    expect(panelScrollable?.initializer?.getText()).toBe('{false}');

    expect(sourceText).toContain('observeResize(content, measureContentOverflow)');
    expect(sourceText).toContain(
      'content.scrollHeight > content.clientHeight + 1',
    );
  });
});
