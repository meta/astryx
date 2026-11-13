// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file markdownExtensionNode.test.ts
 * @input Uses @lexical/headless, lexical, ./editorNodes,
 *   ./markdownExtensionNode
 * @output Pins the registered-node-class contract: RichTextExtensionNode is
 *   constructible with no arguments, and such a node reads as the empty
 *   values the class already gives damaged stored state.
 * @position Unit test for the extension node's construction contract.
 */

import {describe, expect, it} from 'vitest';
import {createHeadlessEditor} from '@lexical/headless';

import {DEFAULT_NODES} from './editorNodes';
import {
  RichTextExtensionNode,
  factsFrom,
  type RichTextExtensionNodeFacts,
} from './markdownExtensionNode';

/** Runs `work` in an editor that registers this package's default nodes. */
function inEditor<T>(work: () => T): T {
  const editor = createHeadlessEditor({
    nodes: [...DEFAULT_NODES],
    onError(error) {
      throw error;
    },
  });
  let result!: T;
  editor.update(
    () => {
      result = work();
    },
    {discrete: true},
  );
  return result;
}

describe('RichTextExtensionNode construction', () => {
  // A Yjs binding builds one instance of every registered node class, with no
  // arguments, to read its default properties. A throw here stops collaboration
  // for every editor that registers this node, not only a document that holds
  // one.
  it('is constructible with no arguments', () => {
    expect(() => inEditor(() => new RichTextExtensionNode())).not.toThrow();
  });

  it('reads as empty facts, not as undefined', () => {
    const {facts, format} = inEditor(() => {
      const node = new RichTextExtensionNode();
      return {facts: node.getFacts(), format: node.getFormat()};
    });

    expect(facts).toEqual<RichTextExtensionNodeFacts>(factsFrom({}));
    // `display` decides whether the node carries text formats; reading it off
    // an undefined object is what used to throw.
    expect(facts.display).toBe('inline');
    expect(format).toBe(0);
  });

  it('still takes the facts it is given', () => {
    const given = factsFrom({
      display: 'block',
      name: 'chart',
      plugin: 'demo',
      source: '```chart\n```',
    });
    const {facts, format} = inEditor(() => {
      const node = new RichTextExtensionNode(given, 1);
      return {facts: node.getFacts(), format: node.getFormat()};
    });

    expect(facts.name).toBe('chart');
    // A block node carries no text format, whatever it is passed.
    expect(format).toBe(0);
  });
});
