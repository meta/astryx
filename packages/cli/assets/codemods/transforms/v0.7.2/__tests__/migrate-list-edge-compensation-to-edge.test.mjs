// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import transform from '../migrate-list-edge-compensation-to-edge.mjs';

async function applyTransform(source) {
  const jscodeshift = (await import('jscodeshift')).default;
  const j = jscodeshift.withParser('tsx');
  const api = {jscodeshift: j, stats: () => {}, report: () => {}};
  return transform({source, path: 'test.tsx'}, api) ?? source;
}

describe('migrate-list-edge-compensation-to-edge', () => {
  it("renames edgeCompensation='inline' to edge='outset'", async () => {
    const output =
      await applyTransform(`import {List, ListItem} from '@astryxdesign/core/List';
const a = <List edgeCompensation="inline"><ListItem label="a" /></List>;
const b = <List hasDividers edgeCompensation={'inline'} />;`);

    expect(output).not.toContain('edgeCompensation');
    expect(output.match(/edge='outset'/g)).toHaveLength(2);
    expect(output).toContain('hasDividers');
  });

  it('follows aliases and the package root import', async () => {
    const output =
      await applyTransform(`import {List as Rows} from '@astryxdesign/core';
const a = <Rows edgeCompensation="inline" />;`);

    expect(output).toContain("<Rows edge='outset' />");
  });

  it('drops edgeCompensation beside an edge string, whatever its value', async () => {
    const output =
      await applyTransform(`import {List} from '@astryxdesign/core/List';
const a = <List edge="bleed" edgeCompensation="inline" />;
const b = <List edge={'flush'} edgeCompensation={mode} />;
const c = <List {...rest} edge="padded" edgeCompensation="inline" />;`);

    // c: the spread comes before edge, so it cannot override it.
    expect(output).toContain('edge="bleed"');
    expect(output).toContain("edge={'flush'}");
    expect(output).toContain('edge="padded"');
    expect(output).not.toContain('edgeCompensation');
    expect(output).not.toContain('TODO');
  });

  it('leaves a TODO where edge may be undefined at runtime', async () => {
    const output =
      await applyTransform(`import {List} from '@astryxdesign/core/List';
const a = <List edge={edge} edgeCompensation="inline" />;
const b = <List edge="flush" {...rest} edgeCompensation="inline" />;
const c = <List edge={props.edge} edgeCompensation={mode} />;`);

    // a and c: a computed edge falls back to the old prop when undefined.
    // b: the spread after edge may set it to undefined.
    expect(output.match(/TODO\(astryx upgrade\)/g)).toHaveLength(3);
    expect(output.match(/edgeCompensation=/g)).toHaveLength(3);
    expect(output).toContain('edge={edge}');
    expect(output).toContain('edge={props.edge}');
  });

  it('leaves a TODO on a dynamic value and keeps it working', async () => {
    const output =
      await applyTransform(`import {List} from '@astryxdesign/core/List';
const a = <List edgeCompensation={mode} />;
const b = <List edgeCompensation={flag ? 'inline' : undefined} />;`);

    expect(output.match(/TODO\(astryx upgrade\)/g)).toHaveLength(2);
    expect(output).toContain('edgeCompensation={mode}');
    expect(output).toContain("edgeCompensation={flag ? 'inline' : undefined}");
  });

  it('keeps edgeCompensation with a TODO when the List also spreads props', async () => {
    const output =
      await applyTransform(`import {List} from '@astryxdesign/core/List';
const a = <List {...rest} edgeCompensation="inline" />;
const b = <List edgeCompensation="inline" {...rest} />;
const c = <List {...rest} edgeCompensation={mode} />;
const d = <List {...props} />;
const e = <List {...rest} edge="padded" />;`);

    // a: an edge in the spread wins today, and a new edge would override
    // it. b: the spread may override either prop. c: dynamic value and a
    // spread, one TODO. d: no evidence of the old prop, so unchanged; its
    // @deprecated type reports a typed use where the props are written.
    // e: no old prop.
    expect(output.match(/TODO\(astryx upgrade\)/g)).toHaveLength(3);
    const code = output.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toContain("edge='outset'");
    expect(code.match(/edgeCompensation="inline"/g)).toHaveLength(2);
    expect(output).toContain('edgeCompensation={mode}');
    expect(output).toContain('const d = <List {...props} />;');
    expect(output).toContain('edge="padded"');
  });

  it('leaves other components, other packages, and unrelated spreads alone', async () => {
    const source = `import {List} from '@astryxdesign/core/List';
import {TabList} from '@astryxdesign/core/TabList';
import {List as Other} from 'some-other-package';
const a = <TabList edgeCompensation="inline" {...props} />;
const b = <Other edgeCompensation="inline" {...props} />;
const c = <div {...props} />;`;
    expect(await applyTransform(source)).toBe(source);
  });

  it('changes nothing on a second run', async () => {
    const once =
      await applyTransform(`import {List} from '@astryxdesign/core/List';
const a = <List edgeCompensation="inline" />;
const b = <List edgeCompensation={mode} />;
const c = <List {...props} edgeCompensation="inline" />;
const d = <List edge="flush" edgeCompensation="inline" />;
const e = <List edge={edge} edgeCompensation="inline" />;`);
    const twice = await applyTransform(once);

    expect(twice).toBe(once);
    expect(twice.match(/TODO\(astryx upgrade\)/g)).toHaveLength(3);
  });
});
