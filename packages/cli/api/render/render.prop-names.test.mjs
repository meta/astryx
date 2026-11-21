// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `experimental export` warns for a prop a page gives a Core component
 * that the component does not take, as `astryx doctor` judges it: it names
 * the component and the prop, offers a documented prop with the same words,
 * and lists the props the component takes when a prop has none. A
 * documented prop, an HTML attribute the component forwards (`open`, `id`)
 * and a hyphenated name get no warning. Each element gets its own warning,
 * and React's console line for a prop the warning names does not print or
 * hide the page's own lines. Where the props cannot be judged (no TypeScript
 * or React types), one `props-not-checked` warning says why and what to
 * install; with both, there is none.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {render} from './render.mjs';
import {COMPONENT_REPLACES_CLI} from '../../foundation/integrations/cli-requirement.mjs';
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
    "says once that it did not check, and why, in a project without TypeScript, where React's console line still prints",
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
        // One line says the check did not run, why, and what to install.
        expect(
          answer.data.warnings.filter(
            (/** @type {any} */ w) => w.code === 'props-not-checked',
          ),
        ).toEqual([
          {
            code: 'props-not-checked',
            message: expect.stringMatching(
              /^Core prop names: TypeScript is not installed in this project, so the props were not checked\. .*npm install -D typescript@6/,
            ),
          },
        ]);
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
  it(
    "names React's types as what to install when TypeScript cannot read them, and says nothing for a page whose props are all documented",
    async () => {
      const noTypes = makeLinkedFixture('astryx-render-prop-names-notypes-', [
        '@astryxdesign',
        '@stylexjs',
        'react',
        'react-dom',
        'typescript',
      ]);
      try {
        fs.writeFileSync(
          path.join(noTypes, 'wrong.tsx'),
          `import {AlertDialog} from '@astryxdesign/core/AlertDialog';
export default function Page() {
  return <AlertDialog isOpen onOpenChange={() => {}} title="Leave?" description="Changes are lost." actionLabel="Leave" onAction={() => {}} actionLoading />;
}
`,
        );
        fs.writeFileSync(
          path.join(noTypes, 'right.tsx'),
          `import {Button} from '@astryxdesign/core/Button';
export default function Page() {
  return <Button label="Save" variant="primary" onClick={() => {}} />;
}
`,
        );
        const wrong = /** @type {any} */ (
          await render('wrong.tsx', {cwd: noTypes, out: 'wrong.html'})
        );
        expect(
          wrong.data.warnings
            .filter((/** @type {any} */ w) => w.code === 'props-not-checked')
            .map((/** @type {any} */ w) => w.message),
        ).toEqual([
          "Core prop names: TypeScript could not read React's types from this project, so the props were not checked. Install React's types (`npm install -D @types/react`).",
        ]);
        const right = /** @type {any} */ (
          await render('right.tsx', {cwd: noTypes, out: 'right.html'})
        );
        expect(
          right.data.warnings.filter((/** @type {any} */ w) =>
            /^(unknown-prop|props-not-checked)$/.test(w.code),
          ),
        ).toEqual([]);
      } finally {
        removeLinkedFixture(noTypes);
      }
    },
    SLOW,
  );

  it(
    "keeps the page's own console line when React's lines for named props come first, and names where the rest of a long prop list is",
    async () => {
      fs.writeFileSync(
        path.join(dir, 'cap.tsx'),
        `import {AlertDialog} from '@astryxdesign/core/AlertDialog';
import {Button} from '@astryxdesign/core/Button';
function Late() {
  console.error('own: the page data failed to load');
  return <p>late</p>;
}
export default function Page() {
  return <><AlertDialog isOpen isInline onOpenChange={() => {}} title="Delete?" description="Gone." actionLabel="Delete" onAction={() => {}} confirmLabel="a" cancelText="b" bodyText="c" dialogTone="d" headerTitle="e" /><Button label="Go" onConfirm={() => {}} /><Late /></>;
}
`,
      );
      const answer = /** @type {any} */ (
        await render('cap.tsx', {cwd: dir, out: 'cap.html'})
      );
      const output = answer.data.warnings
        .filter((/** @type {any} */ w) => w.code === 'page-output')
        .map((/** @type {any} */ w) => w.message);
      expect(output).toEqual([
        expect.stringContaining('own: the page data failed to load'),
      ]);
      expect(answer.data.warnings).toContainEqual({
        code: 'unknown-prop',
        message: expect.stringMatching(
          /^cap\.tsx:\d+: Button has no onConfirm; it takes .*, and \d+ more \(`[^`]*astryx[^`]* component Button --package @astryxdesign\/core` lists them\)\.$/,
        ),
      });
      // With TypeScript and React's types the check runs, so no line says it did not.
      expect(
        answer.data.warnings.filter(
          (/** @type {any} */ w) => w.code === 'props-not-checked',
        ),
      ).toEqual([]);
    },
    SLOW,
  );
  it(
    'outside a project says Core is missing with no install step',
    async () => {
      const outside = fs.mkdtempSync(
        path.join(os.tmpdir(), 'astryx-render-prop-names-outside-'),
      );
      try {
        fs.writeFileSync(
          path.join(outside, 'page.tsx'),
          `import '@astryxdesign/core/astryx.css';
import {AlertDialog} from '@astryxdesign/core/AlertDialog';
export default function Page() {
  return <AlertDialog isOpen onOpenChange={() => {}} title="Delete?" description="Gone." actionLabel="Delete" onAction={() => {}} onConfirm={() => {}} />;
}
`,
        );
        const answer = /** @type {any} */ (
          await render('page.tsx', {cwd: outside, out: 'page.html'})
        );
        expect(
          answer.data.warnings
            .filter((/** @type {any} */ w) => w.code === 'props-not-checked')
            .map((/** @type {any} */ w) => w.message),
        ).toEqual([
          'Core prop names: Core is not installed where the pages that import it can find it, so the props were not checked.',
        ]);
      } finally {
        fs.rmSync(outside, {recursive: true, force: true});
      }
    },
    SLOW,
  );
  it(
    "lists Core's props and names Core in the pointer where an integration replaces the component",
    async () => {
      const own = makeLinkedFixture('astryx-render-prop-names-replaced-', [
        '@astryxdesign',
        '@stylexjs',
        'react',
        'react-dom',
        '@types/react',
        'typescript',
      ]);
      try {
        const pkg = path.join(
          path.dirname(own),
          'node_modules',
          '@acme',
          'buttons',
        );
        fs.mkdirSync(path.join(pkg, 'components'), {recursive: true});
        fs.writeFileSync(
          path.join(pkg, 'package.json'),
          JSON.stringify({
            name: '@acme/buttons',
            version: '1.0.0',
            exports: {'./components/*': './components/*.tsx'},
            peerDependencies: {
              '@astryxdesign/cli': `>=${COMPONENT_REPLACES_CLI}`,
            },
          }),
        );
        fs.writeFileSync(
          path.join(pkg, 'astryx.integration.mjs'),
          "export default {components: './components'};\n",
        );
        fs.writeFileSync(
          path.join(pkg, 'components', 'AcmeButton.doc.mjs'),
          `export default ${JSON.stringify({
            type: 'component',
            name: 'AcmeButton',
            displayName: 'AcmeButton',
            import: '@acme/buttons/components/AcmeButton',
            replaces: 'Button',
            keywords: ['acme'],
            usage: {description: 'AcmeButton for Acme apps.'},
            props: [
              {name: 'tone', type: "'calm' | 'loud'", description: 'Tone.'},
            ],
          })};\n`,
        );
        fs.writeFileSync(
          path.join(pkg, 'components', 'AcmeButton.tsx'),
          'export function AcmeButton() { return null; }\n',
        );
        const manifest = path.join(own, 'package.json');
        const project = JSON.parse(fs.readFileSync(manifest, 'utf8'));
        project.dependencies = {
          ...project.dependencies,
          '@acme/buttons': '1.0.0',
        };
        fs.writeFileSync(manifest, JSON.stringify(project));
        fs.writeFileSync(
          path.join(own, 'page.tsx'),
          `import {Button} from '@astryxdesign/core/Button';
export default function Page() {
  return <Button label="Go" onConfirm={() => {}} />;
}
`,
        );
        const answer = /** @type {any} */ (
          await render('page.tsx', {cwd: own, out: 'page.html'})
        );
        const warning = answer.data.warnings.find(
          (/** @type {any} */ w) => w.code === 'unknown-prop',
        );
        expect(warning?.message).toMatch(
          /^page\.tsx:3: Button has no onConfirm; it takes label, /,
        );
        expect(warning?.message).not.toMatch(/\btone\b/);
        expect(warning?.message).toMatch(
          /\(`[^`]* component Button --package @astryxdesign\/core` lists them\)\.$/,
        );
      } finally {
        removeLinkedFixture(own);
      }
    },
    SLOW,
  );
});
