// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {fromComponentDoc, type ComponentDocLike} from './fromComponentDoc.js';
import {generateSwift} from './generateSwift.js';

const doc: ComponentDocLike = {
  name: 'Toggle',
  props: [
    {name: 'label', type: 'ReactNode', required: true},
    {name: 'icon', type: 'ReactNode'},
    {name: 'level', type: '1 | 2 | 3'},
    {
      name: 'onChange',
      type: '(on: boolean, e: ChangeEvent<HTMLInputElement>) => void',
    },
    {name: 'onClick', type: '(e: MouseEvent) => void'},
    {name: 'onFocus', type: '(e: FocusEvent) => void'},
    {name: 'onPick', type: '(e: MouseEvent, value: string) => void'},
  ],
};

describe('fromComponentDoc', () => {
  const contract = fromComponentDoc(doc, {
    name: 'Toggle',
    baseTarget: 'control',
    slots: {label: 'text'},
    callbacks: ['onClick', 'onPick'],
    sameMeaning: {onClick: 'a press in Compose too'},
  });

  it('gives declared content a typed text slot and leaves the rest on the web', () => {
    expect(contract.core.label).toEqual({
      type: {kind: 'string'},
      optional: false,
    });
    expect(contract.webOnly.map(prop => prop.name)).toContain('icon');
  });

  it('keeps a value callback and a declared press, and leaves other event callbacks on the web', () => {
    expect(contract.core.onChange?.type).toEqual({
      kind: 'fn',
      args: [{kind: 'boolean'}],
    });
    expect(contract.core.onClick?.type).toEqual({kind: 'fn', args: []});
    expect(contract.webOnly).toContainEqual({
      name: 'onFocus',
      reason: 'callback argument: DOM event',
    });
    // `callbacks` never drops values: an event before a value stays on the web.
    expect(contract.core).not.toHaveProperty('onPick');
    expect(contract.webOnly.map(prop => prop.name)).toContain('onPick');
  });

  it('projects a wider web type to its portable values, each one web value', () => {
    const sized = fromComponentDoc(
      {
        name: 'Box',
        props: [{name: 'width', type: 'SizeValue', description: 'Width.'}],
      },
      {
        name: 'Box',
        baseTarget: 'root',
        projections: {width: {content: 'auto', fill: '100%'}},
      },
    );
    expect(sized.core.width).toEqual({
      type: {kind: 'enum', values: ['content', 'fill']},
      optional: true,
      doc: 'Width. Native values: `content` is the web\'s `"auto"`, `fill` is the web\'s `"100%"`.',
    });
    expect(sized.webOnly).toEqual([]);
    const webValues = Object.values(sized.projections?.width ?? {});
    expect(new Set(webValues).size).toBe(webValues.length);
    // Without a projection the same prop stays on the web.
    const plain = fromComponentDoc(
      {name: 'Box', props: [{name: 'width', type: 'SizeValue'}]},
      {name: 'Box', baseTarget: 'root'},
    );
    expect(plain.core).not.toHaveProperty('width');
    expect(plain.webOnly.map(prop => prop.name)).toContain('width');
  });

  it('refuses a toolkit name unless the component declares the same meaning', () => {
    const plain = fromComponentDoc(doc, {
      name: 'Toggle',
      baseTarget: 'control',
      callbacks: ['onClick'],
    });
    expect(plain.core).not.toHaveProperty('onClick');
    expect(
      plain.webOnly.find(prop => prop.name === 'onClick')?.reason,
    ).toContain('compose');
  });

  it('writes a closed set of numbers as a Swift enum with raw values', () => {
    const swift = generateSwift([contract])['Toggle.swift'];
    expect(swift).toContain(
      'public enum ToggleLevel: Int, CaseIterable, Codable, Sendable {',
    );
    expect(swift).toContain('  case v1 = 1');
  });

  it('reads one component of a file that documents several', () => {
    const stack: ComponentDocLike = {
      name: 'Stack',
      components: [
        {name: 'Stack', props: [{name: 'gap', type: '0 | 0.5 | 1'}]},
        {name: 'VStack', props: [{name: 'wrap', type: 'boolean'}]},
      ],
    };
    const vstack = fromComponentDoc(stack, {
      name: 'VStack',
      baseTarget: 'container',
      doc: {file: 'Stack', component: 'VStack'},
    });
    expect(Object.keys(vstack.core)).toEqual(['wrap']);
    expect(() =>
      fromComponentDoc(stack, {
        name: 'Missing',
        baseTarget: 'root',
        doc: {file: 'Stack', component: 'Missing'},
      }),
    ).toThrow('does not document "Missing"');
  });
});
