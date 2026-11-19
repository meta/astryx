// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `experimental export` warns for a prop a page gives a Core component
 * that the component does not take, as `astryx doctor` judges it: it names
 * the component and the prop, offers a documented prop with the same words,
 * and lists the props the component takes when a prop has none. A
 * documented prop, an HTML attribute the component forwards (`open`, `id`)
 * and a hyphenated name get no warning. Each element gets its own warning,
 * React's console line for a prop the warning names does not print, and a
 * project without TypeScript gets none.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {render} from './render.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';

const SLOW = 120_000;

/** @type {string} */
let dir;

beforeAll(() => {
  dir = makeLinkedFixture('astryx-render-prop-names-', [
    '@astryxdesign',
    '@stylexjs',
    'react',
    'react-dom',
    '@types/react',
    'typescript',
  ]);
});

afterAll(() => {
  removeLinkedFixture(dir);
});

/**
 * The unknown-prop warnings of an export of a page with this source.
 * @param {string} name
 * @param {string} source
 */
async function propWarnings(name, source) {
  fs.writeFileSync(path.join(dir, name), source);
  const answer = /** @type {any} */ (
    await render(name, {cwd: dir, out: name.replace(/\.tsx$/, '.html')})
  );
  return answer.data.warnings
    .filter((/** @type {any} */ w) => w.code === 'unknown-prop')
    .map((/** @type {any} */ w) => w.message);
}

describe('experimental export: props a Core component does not take', () => {
  it(
    'names each prop AlertDialog does not take, with the documented prop of the same words or the props it takes',
    async () => {
      const warnings = await propWarnings(
        'confirm.tsx',
        `import {AlertDialog} from '@astryxdesign/core/AlertDialog';
export default function Page() {
  return (
    <AlertDialog
      isOpen
      onOpenChange={() => {}}
      title="Delete project?"
      description="This cannot be undone."
      actionLabel="Delete"
      onAction={() => {}}
      open
      id="confirm"
      aria-label="Confirm"
      data-step="1"
      onConfirm={() => {}}
      actionLoading
    />
  );
}
`,
      );
      expect(warnings).toEqual([
        'confirm.tsx:15: AlertDialog has no onConfirm, actionLoading (did you mean isActionLoading?); it takes isOpen, onOpenChange, title, description, actionLabel, onAction, cancelLabel, actionVariant, isActionLoading, width, isInline.',
      ]);
    },
    SLOW,
  );

  it(
    'leaves out the list of props when every prop has a documented prop of the same words',
    async () => {
      const warnings = await propWarnings(
        'loading.tsx',
        `import {AlertDialog} from '@astryxdesign/core/AlertDialog';
export default function Page() {
  return <AlertDialog isOpen onOpenChange={() => {}} title="Leave?" description="Changes are lost." actionLabel="Leave" onAction={() => {}} actionLoading />;
}
`,
      );
      expect(warnings).toEqual([
        'loading.tsx:3: AlertDialog has no actionLoading (did you mean isActionLoading?).',
      ]);
    },
    SLOW,
  );

  it(
    'gives no warning for documented props, HTML attributes and hyphenated names',
    async () => {
      expect(
        await propWarnings(
          'documented.tsx',
          `import {Button} from '@astryxdesign/core/Button';
export default function Page() {
  return <Button label="Save" variant="primary" onClick={() => {}} id="save" title="Save" aria-describedby="hint" data-kind="save" />;
}
`,
        ),
      ).toEqual([]);
    },
    SLOW,
  );
  it(
    'gives each element its own warning, at the line of its first unknown prop',
    async () => {
      const warnings = await propWarnings(
        'two.tsx',
        `import {AlertDialog} from '@astryxdesign/core/AlertDialog';
export default function Page() {
  return (
    <>
      <AlertDialog isOpen onOpenChange={() => {}} title="Leave?" description="Changes are lost." actionLabel="Leave" onAction={() => {}} actionLoading />
      <AlertDialog isOpen onOpenChange={() => {}} title="Delete?" description="Gone for good." actionLabel="Delete" onAction={() => {}} onConfirm={() => {}} />
      <AlertDialog isOpen onOpenChange={() => {}} title="Reset?" description="Back to defaults." actionLabel="Reset" onAction={() => {}} onConfirm={() => {}} />
    </>
  );
}
`,
      );
      expect(warnings).toEqual([
        'two.tsx:5: AlertDialog has no actionLoading (did you mean isActionLoading?).',
        expect.stringMatching(
          /^two\.tsx:6: AlertDialog has no onConfirm; it takes isOpen, /,
        ),
        expect.stringMatching(
          /^two\.tsx:7: AlertDialog has no onConfirm; it takes isOpen, /,
        ),
      ]);
    },
    SLOW,
  );
  it(
    "judges nothing in a project without TypeScript, where React's console line still prints",
    async () => {
      const bare = makeLinkedFixture('astryx-render-prop-names-bare-', [
        '@astryxdesign',
        '@stylexjs',
        'react',
        'react-dom',
        '@types/react',
      ]);
      try {
        fs.writeFileSync(
          path.join(bare, 'page.tsx'),
          `import {AlertDialog} from '@astryxdesign/core/AlertDialog';
export default function Page() {
  return <AlertDialog isOpen onOpenChange={() => {}} title="Delete?" description="Gone for good." actionLabel="Delete" onAction={() => {}} confirmLabel="Delete" />;
}
`,
        );
        const answer = /** @type {any} */ (
          await render('page.tsx', {cwd: bare, out: 'page.html'})
        );
        expect(
          answer.data.warnings.filter(
            (/** @type {any} */ w) => w.code === 'unknown-prop',
          ),
        ).toEqual([]);
        // The line the filter drops where the warning names the prop.
        expect(answer.data.warnings).toContainEqual(
          expect.objectContaining({
            code: 'page-output',
            message: expect.stringContaining('`confirmLabel`'),
          }),
        );
      } finally {
        removeLinkedFixture(bare);
      }
    },
    SLOW,
  );
  it(
    "names TabList's real props for selectedID, and drops React's cut-off console line for a prop it names",
    async () => {
      fs.writeFileSync(
        path.join(dir, 'tabs.tsx'),
        `import {TabList, Tab} from '@astryxdesign/core/TabList';
import {AlertDialog} from '@astryxdesign/core/AlertDialog';
export default function Page() {
  return (
    <>
      <TabList selectedID="a"><Tab value="a" label="Overview" /><Tab value="b" label="Details" /></TabList>
      <AlertDialog isOpen isInline onOpenChange={() => {}} title="Delete?" description="Gone for good." actionLabel="Delete" onAction={() => {}} confirmLabel="Delete" />
    </>
  );
}
`,
      );
      const answer = /** @type {any} */ (
        await render('tabs.tsx', {cwd: dir, out: 'tabs.html'})
      );
      const messages = answer.data.warnings.map(
        (/** @type {any} */ w) => `${w.code}: ${w.message}`,
      );
      expect(messages).toContainEqual(
        expect.stringMatching(
          /^unknown-prop: tabs\.tsx:6: TabList has no selectedID; it takes value, onChange, /,
        ),
      );
      expect(messages).toContainEqual(
        expect.stringMatching(
          /^unknown-prop: tabs\.tsx:7: AlertDialog has no confirmLabel; /,
        ),
      );
      expect(
        messages.filter(
          (/** @type {string} */ m) =>
            m.startsWith('page-output:') && /selectedID|confirmLabel/.test(m),
        ),
      ).toEqual([]);
    },
    SLOW,
  );
});
