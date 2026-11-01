// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import transform from '../migrate-touch-trigger-tap-to-trigger-behavior.mjs';
import {ManualMigrationRequired} from '../../../outcome.mjs';

async function applyTransform(source, reports = []) {
  const jscodeshift = (await import('jscodeshift')).default;
  const j = jscodeshift.withParser('tsx');
  const api = {
    jscodeshift: j,
    stats: () => {},
    report: finding => reports.push(finding),
  };
  return transform({source, path: 'test.tsx'}, api) ?? source;
}

const TRIGGER_TODO = 'This trigger is not a plain icon or span';

/** The code without its comments, whose migration notes name both props. */
const code = output => output.replace(/\/\*[\s\S]*?\*\//g, '');

describe('migrate-touch-trigger-tap-to-trigger-behavior (DEP-0016)', () => {
  it('rewrites a static touchTrigger="tap" on an icon or span trigger', async () => {
    const output =
      await applyTransform(`import {Tooltip, HoverCard, Icon} from '@astryxdesign/core';
const a = <Tooltip content="Why" touchTrigger="tap"><Icon icon="info" /></Tooltip>;
const b = <HoverCard content={card} touchTrigger={'tap'}><span>Ada <Icon icon="info" /></span></HoverCard>;
const c = <Tooltip content="Ranked by imports" touchTrigger="tap">How ranks work</Tooltip>;
const d = <Tooltip content="Legend" touchTrigger="tap"><svg viewBox="0 0 8 8"><circle r="4" /></svg></Tooltip>;`);

    expect(output.match(/triggerBehavior='toggle'/g)).toHaveLength(3);
    expect(output).toContain("triggerBehavior={'toggle'}");
    expect(output).not.toContain('touchTrigger');
    expect(output).not.toContain('TODO');
  });

  it('reports a button, a link, an unknown element and a text-repeating trigger, and leaves them', async () => {
    const output =
      await applyTransform(`import {Tooltip, HoverCard, Button} from '@astryxdesign/core';
const a = <Tooltip content="Why" touchTrigger="tap"><button>?</button></Tooltip>;
const b = <Tooltip content="Why" touchTrigger="tap"><Button label="What is this?" /></Tooltip>;
const c = <HoverCard content={card} touchTrigger="tap"><a href="/ada">Ada</a></HoverCard>;
const d = <Tooltip content="Why" touchTrigger="tap"><Avatar name="Ada" /></Tooltip>;
const e = <Tooltip content="A very long title" touchTrigger="tap"><span>A very long title</span></Tooltip>;
const f = <Tooltip content="Why" anchorRef={ref} touchTrigger="tap" />;`);

    expect(code(output).match(/touchTrigger="tap"/g)).toHaveLength(6);
    expect(output.match(new RegExp(TRIGGER_TODO, 'g'))).toHaveLength(6);
    expect(code(output)).not.toContain('triggerBehavior');
  });

  it('reports an icon or span that acts or takes focus: a role, a tabIndex, a handler, or spread props', async () => {
    const output =
      await applyTransform(`import {Tooltip, Icon} from '@astryxdesign/core';
const a = <Tooltip content="Why" touchTrigger="tap"><span role="button" tabIndex={0} onClick={open}>?</span></Tooltip>;
const b = <Tooltip content="Why" touchTrigger="tap"><svg role="button" viewBox="0 0 8 8"><circle r="4" /></svg></Tooltip>;
const c = <Tooltip content="Why" touchTrigger="tap"><Icon icon="info" role="button" /></Tooltip>;
const d = <Tooltip content="Why" touchTrigger="tap"><span tabIndex={0}>Help</span></Tooltip>;
const e = <Tooltip content="Why" touchTrigger="tap"><span>Help <Icon icon="info" onClick={open} /></span></Tooltip>;
const f = <Tooltip content="Why" touchTrigger="tap"><Icon icon="info" {...rest} /></Tooltip>;
const g = <Tooltip content="Why" touchTrigger="tap"><svg viewBox="0 0 8 8"><g onClick={open}><circle r="4" /></g></svg></Tooltip>;`);

    expect(code(output).match(/touchTrigger="tap"/g)).toHaveLength(7);
    expect(output.match(new RegExp(TRIGGER_TODO, 'g'))).toHaveLength(7);
    expect(code(output)).not.toContain('triggerBehavior');
  });

  it('follows aliased and namespace imports, Icon included', async () => {
    const output =
      await applyTransform(`import {Tooltip as Tip, Icon as I} from '@astryxdesign/core/Tooltip';
import * as Core from '@astryxdesign/core';
const a = <Tip content="x" touchTrigger="tap"><I icon="info" /></Tip>;
const b = <Core.HoverCard content="y" touchTrigger="tap"><span>?</span></Core.HoverCard>;`);

    expect(output.match(/triggerBehavior='toggle'/g)).toHaveLength(2);
    expect(output).not.toContain('touchTrigger');
  });

  it('treats an Icon that is not Core’s as unknown', async () => {
    const output =
      await applyTransform(`import {Tooltip} from '@astryxdesign/core';
import {Icon} from './icons';
const a = <Tooltip content="x" touchTrigger="tap"><Icon name="info" /></Tooltip>;`);

    expect(output).toContain('touchTrigger="tap"');
    expect(output).toContain(TRIGGER_TODO);
  });

  it('removes a static touchTrigger="auto", the default', async () => {
    const output =
      await applyTransform(`import {Tooltip} from '@astryxdesign/core';
const a = <Tooltip content="x" touchTrigger="auto"><button>t</button></Tooltip>;`);

    expect(output).not.toContain('touchTrigger');
    expect(output).not.toContain('triggerBehavior');
  });

  it('leaves touchTrigger="none" unchanged', async () => {
    const source = `import {Tooltip} from '@astryxdesign/core';
const a = <Tooltip content="x" touchTrigger="none"><span>t</span></Tooltip>;`;
    expect(await applyTransform(source)).toBe(source);
  });

  it('removes touchTrigger beside a static triggerBehavior="hover" or "toggle", which ignore it', async () => {
    const output =
      await applyTransform(`import {Tooltip, HoverCard} from '@astryxdesign/core';
const a = <Tooltip content="x" triggerBehavior="toggle" touchTrigger="tap" placement="below"><button>?</button></Tooltip>;
const b = <HoverCard content="x" triggerBehavior="hover" touchTrigger="tap"><button>?</button></HoverCard>;`);

    expect(output).toContain('triggerBehavior="toggle"');
    expect(output).toContain('triggerBehavior="hover"');
    expect(output).toContain('placement="below"');
    expect(output).not.toContain('touchTrigger');
  });

  it('leaves a TODO for a computed value, a competing triggerBehavior, and spread props', async () => {
    const output =
      await applyTransform(`import {Tooltip} from '@astryxdesign/core';
const a = <Tooltip content="x" touchTrigger={mode}><span>?</span></Tooltip>;
const b = <Tooltip content="x" triggerBehavior="adaptive" touchTrigger="tap"><span>?</span></Tooltip>;
const c = <Tooltip content="x" {...rest} touchTrigger="tap"><span>?</span></Tooltip>;`);

    expect(output).toContain('touchTrigger={mode}');
    expect(output).toContain('This value is computed');
    expect(output).toContain('triggerBehavior="adaptive"');
    expect(output.match(/touchTrigger="tap">/g)).toHaveLength(2);
    expect(output).toContain('an explicit triggerBehavior="adaptive"');
    expect(output).toContain('props are also spread here');
    expect(output.match(/TODO\(astryx upgrade\)/g)).toHaveLength(3);
  });

  it('reports tap beside spread props even next to a static toggle, which a spread triggerBehavior would override', async () => {
    const reports = [];
    const output = await applyTransform(
      `import {Tooltip, useTooltip} from '@astryxdesign/core';
const a = <Tooltip content="x" triggerBehavior="toggle" {...rest} touchTrigger="tap"><button>?</button></Tooltip>;
function B() {
  const tip = useTooltip({triggerBehavior: 'toggle', ...rest, touchTrigger: 'tap'});
}`,
      reports,
    );

    expect(code(output)).toContain('touchTrigger="tap"');
    expect(code(output)).toContain("touchTrigger: 'tap'");
    expect(output.match(/props are also spread here/g)).toHaveLength(2);
    expect(reports).toHaveLength(2);
    expect(reports.every(r => r instanceof ManualMigrationRequired)).toBe(true);
  });

  it('leaves touchTrigger="auto" beside spread props as it is, with no TODO and no listing', async () => {
    const reports = [];
    const source = `import {Tooltip, useTooltip} from '@astryxdesign/core';
const a = <Tooltip content="x" {...rest} touchTrigger="auto"><button>?</button></Tooltip>;
function B() {
  const tip = useTooltip({...rest, touchTrigger: 'auto'});
}`;
    const output = await applyTransform(source, reports);

    expect(output).toBe(source);
    expect(reports).toHaveLength(0);
  });

  it('reports tap in useTooltip and useHoverCard options, whose trigger it cannot see, and removes auto', async () => {
    const output =
      await applyTransform(`import {useTooltip, useHoverCard} from '@astryxdesign/core';
function A() {
  const tip = useTooltip({placement: 'below', touchTrigger: 'tap'});
  const card = useHoverCard({touchTrigger: 'auto', delay: 100});
  const kept = useHoverCard({touchTrigger: 'none'});
  return null;
}`);

    expect(output).toContain("touchTrigger: 'tap'");
    expect(output).toContain('The trigger this hook wires is not visible here');
    expect(code(output)).not.toContain('triggerBehavior');
    expect(output).toContain("placement: 'below'");
    expect(output).not.toContain("touchTrigger: 'auto'");
    expect(output).toContain('delay: 100');
    expect(output).toContain("useHoverCard({touchTrigger: 'none'})");
  });

  it('leaves components and hooks that are not Core’s unchanged', async () => {
    const source = `import {Tooltip, useTooltip} from './local';
const a = <Tooltip touchTrigger="tap" />;
const b = useTooltip({touchTrigger: 'tap'});`;
    expect(await applyTransform(source)).toBe(source);
  });

  it('reports every site it leaves to the upgrade listing, with its line, on every run', async () => {
    const source = `import {Tooltip, useTooltip, Icon} from '@astryxdesign/core';
const a = <Tooltip content="Why" touchTrigger="tap"><button>?</button></Tooltip>;
const b = <Tooltip content="x" touchTrigger={mode}><span>?</span></Tooltip>;
const c = <Tooltip content="x" touchTrigger="tap"><Icon icon="info" /></Tooltip>;
const d = useTooltip({touchTrigger: 'tap'});`;
    const first = [];
    const once = await applyTransform(source, first);
    expect(first.every(f => f instanceof ManualMigrationRequired)).toBe(true);
    expect(first.map(f => f.line)).toEqual([2, 3, 5]);
    expect(first[0].message).toContain('not a plain icon or span');
    expect(first[1].message).toContain('This value is computed');
    expect(first[2].message).toContain('not visible here');
    expect(first.some(f => f.message.startsWith('TODO'))).toBe(false);
    // The rewritten icon site is not reported; the others are, again.
    const second = [];
    expect(await applyTransform(once, second)).toBe(once);
    expect(second).toHaveLength(3);
  });

  it('changes nothing on a second run', async () => {
    const once =
      await applyTransform(`import {Tooltip, Icon} from '@astryxdesign/core';
const a = <Tooltip content="x" touchTrigger="tap"><button>?</button></Tooltip>;
const b = <Tooltip content="x" touchTrigger={mode}><button>?</button></Tooltip>;
const c = <Tooltip content="x" touchTrigger="tap"><Icon icon="info" /></Tooltip>;`);
    expect(await applyTransform(once)).toBe(once);
  });
});
