// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DrawerDirection.test.tsx
 * @input Drawer closed transforms and the matching @starting-style declarations
 * @output Regression coverage for resolved DOM LTR/RTL motion on both logical sides
 * @position Focused direction contract; complements Drawer.test.tsx behavior coverage
 */

import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import * as ts from 'typescript';
import {describe, expect, it} from 'vitest';
import {render, screen} from '@testing-library/react';
import {Drawer} from './Drawer';

function closedTransform(): string {
  return getComputedStyle(screen.getByRole('dialog', {hidden: true})).transform;
}

describe.each([
  {side: 'start' as const, ltr: 'translateX(-100%)', rtl: 'translateX(100%)'},
  {side: 'end' as const, ltr: 'translateX(100%)', rtl: 'translateX(-100%)'},
])('Drawer direction on side=$side', ({side, ltr, rtl}) => {
  it('uses a self-applied RTL direction', () => {
    render(
      <Drawer
        isOpen={false}
        onOpenChange={() => {}}
        label="Details"
        side={side}
        dir="rtl">
        Content
      </Drawer>,
    );
    expect(closedTransform()).toBe(rtl);
  });

  it('honors a nearer LTR override inside an RTL page', () => {
    render(
      <div dir="rtl">
        <Drawer
          isOpen={false}
          onOpenChange={() => {}}
          label="Details"
          side={side}
          dir="ltr">
          Content
        </Drawer>
      </div>,
    );
    expect(closedTransform()).toBe(ltr);
  });
});

const SOURCE = readFileSync(join(__dirname, 'Drawer.tsx'), 'utf8');

function styleDefinition(name: string): ts.ObjectLiteralExpression {
  const file = ts.createSourceFile(
    'Drawer.tsx',
    SOURCE,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let found: ts.ObjectLiteralExpression | undefined;
  const visit = (node: ts.Node) => {
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      found = node.initializer;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  if (found == null) {
    throw new Error(`No style named "${name}" in Drawer.tsx`);
  }
  return found;
}

function property(style: ts.ObjectLiteralExpression, key: string): string {
  const entry = style.properties.find(
    candidate =>
      ts.isPropertyAssignment(candidate) &&
      (ts.isIdentifier(candidate.name) || ts.isStringLiteral(candidate.name)) &&
      candidate.name.text === key,
  );
  if (entry == null) {
    throw new Error(`No "${key}" in ${style.getText().slice(0, 40)}…`);
  }
  return (entry as ts.PropertyAssignment).initializer.getText();
}

describe.each([
  {
    side: 'start',
    closed: 'start',
    open: 'startOpen',
    ltr: 'translateX(-100%)',
    rtl: 'translateX(100%)',
  },
  {
    side: 'end',
    closed: 'end',
    open: 'endOpen',
    ltr: 'translateX(100%)',
    rtl: 'translateX(-100%)',
  },
])('Drawer $side entry declaration', ({closed, open, ltr, rtl}) => {
  it('parks closed on the computed logical edge', () => {
    const transform = property(styleDefinition(closed), 'transform');
    expect(transform).toContain(`default: '${ltr}'`);
    expect(transform).toContain(`':dir(rtl)': '${rtl}'`);
  });

  it('starts opening from the same computed logical edge', () => {
    const transform = property(styleDefinition(open), 'transform');
    expect(transform).toContain("default: 'translateX(0)'");
    expect(transform).toContain('@starting-style');
    expect(transform).toContain(`default: '${ltr}'`);
    expect(transform).toContain(`':dir(rtl)': '${rtl}'`);
  });
});
