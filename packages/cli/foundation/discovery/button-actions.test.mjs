// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The scan for Core buttons that do nothing when pressed: what counts
 * as an action, what around a button may act on a press, how a component
 * that holds a button is followed to where the app renders it, which buttons
 * it reads, and the Core layout components it trusts, read from their own
 * source.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {
  LAYOUT_COMPONENTS,
  buttonsWithoutAction,
  scanButtonActions,
} from './button-actions.mjs';
import {parseTemplateSource, walk} from './template-source-tree.mjs';

/**
 * The name another module imports a file by.
 * @param {string} file
 */
function stemOf(file) {
  const base = path.basename(file).replace(/\.[cm]?[jt]sx?$/, '');
  return base === 'index' ? path.basename(path.dirname(file)) : base;
}

/**
 * The buttons that do nothing in an app made of these modules, as
 * `file:line label` (the component when the button has no static label).
 * `@/` imports are the app's own code.
 * @param {Record<string, string>} modules file → source
 * @param {{knownPackage?: (specifier: string) => boolean}} [options]
 */
function deadButtons(modules, {knownPackage = () => true} = {}) {
  const isOwnCode = (/** @type {string} */ specifier) => specifier.startsWith('@/');
  const scans = new Map(
    Object.entries(modules).map(([file, source]) => [
      file,
      scanButtonActions(source, {isOwnCode, stem: stemOf(file), knownPackage}),
    ]),
  );
  return buttonsWithoutAction({
    files: Object.keys(modules),
    scan: file => scans.get(file) ?? null,
    modulesNaming: () => Object.keys(modules),
  }).map(found => `${found.file}:${found.line} ${found.label ?? found.component}`);
}

/**
 * A page module whose default export renders `body` inside a VStack; the
 * body's first line is line 6.
 * @param {string} body
 * @param {string} [imports] more import lines, before the page
 */
function page(body, imports = '') {
  return [
    `import {Button, IconButton} from '@astryxdesign/core';${imports ? ` ${imports}` : ''}`,
    "import {VStack} from '@astryxdesign/core/Layout';",
    'export default function Page() {',
    '  return (',
    '    <VStack>',
    `      ${body}`,
    '    </VStack>',
    '  );',
    '}',
    '',
  ].join('\n');
}

/** @param {string} body @param {string} [imports] */
const onPage = (body, imports) => deadButtons({'page.tsx': page(body, imports)});

describe('a name in its props', () => {
  it.each([
    ['a const link that goes nowhere', "const START = '#';", '<Button label="Start" href={START} />', ['page.tsx:6 Start']],
    ['a const link cast as const', "const START = '#' as const;", '<Button label="Start" href={START} />', ['page.tsx:6 Start']],
    ['a const empty handler', 'const noop = () => {};', '<Button label="Save" onClick={noop} />', ['page.tsx:6 Save']],
    ['an empty function declaration', 'function noop() {}', '<Button label="Save" onClick={noop} />', ['page.tsx:6 Save']],
    ['a const link that goes somewhere', "const DOCS = '/docs';", '<Button label="Docs" href={DOCS} />', []],
    ['a let link', "let START = '#';", '<Button label="Start" href={START} />', []],
    ['a const handler that acts', 'const save = () => post();', '<Button label="Save" onClick={save} />', []],
    ['a computed const link', "const START = base + '#';", '<Button label="Start" href={START} />', []],
    ['a link from props', '', '<Button label="Start" href={START} />', []],
  ])('%s', (_, declaration, body, expected) => {
    expect(onPage(body, declaration)).toEqual(expected);
  });

  it('names the constant that goes nowhere', () => {
    const scan = scanButtonActions(page('<Button label="Start" href={START} />', "const START = '#';"), {
      isOwnCode: () => false,
      stem: 'page',
    });
    expect(scan?.buttons.map(button => button.note)).toEqual(['placeholder link: replace `#` in START with a real href']);
  });
});

describe('a button with no action', () => {
  it.each([
    ['a label only', '<Button label="Try it" />', ['page.tsx:6 Try it']],
    ['an icon button', '<IconButton label="Close" icon="x" />', ['page.tsx:6 Close']],
    ['words for children', '<Button label="Export">Export now</Button>', ['page.tsx:6 Export']],
    ['an empty arrow handler', '<Button label="Save" onClick={() => {}} />', ['page.tsx:6 Save']],
    ['a handler that returns undefined', '<Button label="Save" clickAction={() => undefined} />', ['page.tsx:6 Save']],
    ['an empty function handler', '<Button label="Save" onClick={function () {}} />', ['page.tsx:6 Save']],
    ['a block that only returns null', '<Button label="Save" onClick={() => { return null; }} />', ['page.tsx:6 Save']],
    ['a function that only returns', '<Button label="Save" onClick={function () { return; }} />', ['page.tsx:6 Save']],
    ['type="button"', '<Button label="Next" type="button" />', ['page.tsx:6 Next']],
    ['isDisabled={false}', '<Button label="Go" isDisabled={false} />', ['page.tsx:6 Go']],
    ['a look that changes nothing a press does', '<Button label="Go" variant="primary" size="lg" icon={<span>+</span>} width="100%" />', ['page.tsx:6 Go']],
    ['an aria-label', '<IconButton aria-label="Mark done" icon="check" />', ['page.tsx:6 Mark done']],
    ['a label the scan cannot read', '<Button label={title} />', ['page.tsx:6 Button']],
    ['a link to # alone', '<Button label="Get started" href="#" />', ['page.tsx:6 Get started']],
    ['an empty link', '<Button label="Docs" href="" />', ['page.tsx:6 Docs']],
    ['a javascript: link', '<Button label="Go" href="javascript:void(0)" />', ['page.tsx:6 Go']],
  ])('%s', (_, body, expected) => {
    expect(onPage(body)).toEqual(expected);
  });

  it("an icon inside the button is content, as Core's components are", () => {
    expect(onPage('<Button label="Edit" icon={<PencilIcon />} />', "import {PencilIcon} from 'lucide-react';")).toEqual([
      'page.tsx:6 Edit',
    ]);
  });

  it('a # link opens the first page in an app that routes by the hash', () => {
    const scan = scanButtonActions(page('<Button label="Home" href="#" />\n<Button label="Docs" href="" />'), {
      isOwnCode: () => false,
      stem: 'page',
      hashRouting: true,
    });
    expect(scan?.buttons.map(button => button.label)).toEqual(['Docs']);
  });

  it('names the prop that does nothing', () => {
    const scan = scanButtonActions(
      page('<Button label="A" />\n<Button label="B" onClick={() => {}} />\n<Button label="C" href="#" />\n<Button label="D" href="#" clickAction={() => {}} />'),
      {isOwnCode: () => false, stem: 'page'},
    );
    expect(scan?.buttons.map(button => [button.label, button.note])).toEqual([
      ['A', null],
      ['B', 'empty onClick'],
      ['C', 'placeholder link: replace `#` with a real href'],
      ['D', 'empty clickAction'],
    ]);
  });
});

describe('a button that acts, or whose press the scan cannot judge', () => {
  it.each([
    ['onClick', '<Button label="Save" onClick={save} />'],
    ['an onClick that calls something', '<Button label="Save" onClick={() => save()} />'],
    ['clickAction', '<Button label="Save" clickAction={save} />'],
    ['href', '<Button label="Docs" href="/docs" />'],
    ['a link to an anchor on the page', '<Button label="Features" href="#features" />'],
    ['a # link with a handler', '<Button label="Go" href="#" onClick={go} />'],
    ['a link the scan cannot read', '<Button label="Go" href={url} />'],
    ['type="submit"', '<Button label="Send" type="submit" />'],
    ['type="reset"', '<Button label="Clear" type="reset" />'],
    ['a type the scan cannot read', '<Button label="Send" type={kind} />'],
    ['spread props', '<Button label="Go" {...props} />'],
    ['isDisabled', '<Button label="Go" isDisabled />'],
    ['isDisabled={true}', '<Button label="Go" isDisabled={true} />'],
    ['the HTML disabled prop', '<Button label="Go" disabled />'],
    ['a disabled state the scan cannot read', '<Button label="Go" isDisabled={busy} />'],
    ['isLoading', '<Button label="Go" isLoading />'],
    ['a tooltip', '<IconButton label="Info" icon="info" tooltip="About this" />'],
    ['a ref', '<Button label="Go" ref={ref} />'],
    ['an id', '<Button label="Go" id="go" />'],
    ['an ARIA popup', '<Button label="Menu" aria-haspopup="menu" />'],
    ['another event handler', '<Button label="Go" onPointerDown={start} />'],
    ['a form attribute', '<Button label="Send" form="signup" />'],
    ['a data attribute a script may look for', '<Button label="Go" data-action="go" />'],
    ['a link inside it', '<Button label="Go"><a href="/go">Go</a></Button>'],
    ['an app component inside it', '<Button label="Go"><Label /></Button>'],
    ['children the scan cannot read', '<Button label="Start">{children}</Button>'],
    ['an element prop the scan cannot read', '<Button label="Read" endContent={more} />'],
    ['content from a call', '<Button label="Go">{renderIcon()}</Button>'],
    ['children or text', '<Button label="Start">{children ?? "Start"}</Button>'],
    ['children in a fragment', '<Button label="Start"><>{children}</></Button>'],
  ])('%s', (_, body) => {
    expect(onPage(body)).toEqual([]);
  });

  it("content nested in Core's elements that the scan cannot read", () => {
    const core = "import {Text, Badge} from '@astryxdesign/core';";
    expect(onPage('<Button label="Start"><Text>{children}</Text></Button>', core)).toEqual([]);
    expect(onPage('<Button label="Start" endContent={<Badge label="New">{extra}</Badge>} />', core)).toEqual([]);
  });

  it('text, a choice between texts, and an icon variable are content', () => {
    expect(onPage('<Button label="Go">{"Go now"}</Button>')).toEqual(['page.tsx:6 Go']);
    expect(onPage('<Button label="Go">{busy ? "Saving" : "Save"}</Button>')).toEqual(['page.tsx:6 Go']);
    expect(onPage('<Button label="Go"><Text>{"Go now"}</Text></Button>', "import {Text} from '@astryxdesign/core';")).toEqual(['page.tsx:6 Go']);
    expect(onPage('<Button label="Go">{busy && "Saving"}</Button>')).toEqual(['page.tsx:6 Go']);
    // Core Icon's `icon` takes a glyph, so a variable there is not content.
    expect(onPage('<IconButton label="Edit" icon={<Icon icon={glyph} />} />', "import {Icon} from '@astryxdesign/core';")).toEqual(['page.tsx:6 Edit']);
    expect(onPage('<Button label="Edit" icon={PencilIcon} />', "import {PencilIcon} from 'lucide-react';")).toEqual(['page.tsx:6 Edit']);
  });
});

describe('what is around the button', () => {
  it.each([
    ['a link', '<a href="/next"><Button label="Next" /></a>'],
    ['a label', '<label><Button label="Pick" /></label>'],
    ['a summary', '<details><summary><Button label="More" /></summary></details>'],
    ['an element with a click handler', '<div onClick={open}><Button label="Open" /></div>'],
    ['an element with a widget role', '<div role="button"><Button label="Open" /></div>'],
    ['a component of the app named like a provider', '<AppProvider><Button label="Open" /></AppProvider>'],
    ["a Provider read off a namespace import of the app's own module", '<UI.Provider><Button label="Open" /></UI.Provider>', "import * as UI from './ui';"],
    ["a Provider read off a default import of the app's own module", '<UI.Provider><Button label="Open" /></UI.Provider>', "import UI from './ui';"],
    ['a disabled ButtonGroup', "<ButtonGroup isDisabled><Button label=\"Copy\" /></ButtonGroup>", "import {ButtonGroup} from '@astryxdesign/core/ButtonGroup';"],
    ['a disabled InputGroup', "<InputGroup isDisabled><Button label=\"Go\" /></InputGroup>", "import {InputGroup} from '@astryxdesign/core/InputGroup';"],
    ['a disabled fieldset', '<fieldset disabled><Button label="Send" /></fieldset>'],
    ['inert content', '<div inert><Button label="Open" /></div>'],
    ['a custom element', '<clipboard-copy value="x"><Button label="Copy" /></clipboard-copy>'],
    ['a built-in element a script extends', '<div is="copy-target"><Button label="Copy" /></div>'],
    ['a custom element inside the button', '<Button label="Copy"><clipboard-copy value="x" /></Button>'],
    ['a package link inside the button', '<Button label="Pricing"><Link to="/pricing">Pricing</Link></Button>', "import {Link} from 'react-router-dom';"],
    ['an element with a role the scan cannot read', '<div role={kind}><Button label="Open" /></div>'],
    ['an element with spread props', '<div {...rest}><Button label="Open" /></div>'],
    ['a Card that acts', '<Card onClick={select}><Button label="View" /></Card>'],
    ['a package link', "<Link href=\"/x\"><Button label=\"Go\" /></Link>", "import Link from 'next/link';"],
    ['a Core popover, which opens from what it holds', "<Popover content={<span />}><Button label=\"Options\" /></Popover>", "import {Popover} from '@astryxdesign/core/Popover';"],
    ['a tooltip', "<Tooltip content=\"Hi\"><Button label=\"Hover\" /></Tooltip>", "import {Tooltip} from '@astryxdesign/core';"],
    ['a component of the app', '<Panel><Button label="Go" /></Panel>'],
    ['a trigger prop', "<DropdownMenu trigger={<Button label=\"Open\" />} />", "import {DropdownMenu} from '@astryxdesign/core';"],
    ['a render prop', "<DropdownMenu renderTrigger={() => <Button label=\"Open\" />} />", "import {DropdownMenu} from '@astryxdesign/core';"],
    ['a prop of an element the scan does not trust', '<Panel footer={<Button label="Done" />} />'],
    ['a render helper', '{renderActions(<Button label="Go" />)}'],
  ])('%s: not reported', (_, body, imports) => {
    const source = page(body, imports).replace(
      "import {VStack} from '@astryxdesign/core/Layout';",
      "import {VStack, Card} from '@astryxdesign/core/Layout';",
    );
    expect(deadButtons({'page.tsx': source})).toEqual([]);
  });

  it.each([
    ['a Card', '<Card><Button label="View" /></Card>'],
    ['a form that only submits: the button is not a submit button', '<form onSubmit={save}><Button label="Save" /></form>'],
    ['a Layout slot', '<Layout content={<Button label="Go" />} />'],
    ['a map', '{items.map(item => <Button key={item} label="Pick" />)}'],
    ['a map with a block body', '{items.map(item => { return <Button key={item} label="Pick" />; })}'],
    ['a kept map', '{items.map(item => <Button key={item} label="Pick" />).slice(0, 3)}'],
    ['a condition', '{open && <Button label="Close" />}'],
    ['a choice', '{open ? <Button label="Close" /> : null}'],
    ['a fragment', '<><Button label="Go" /></>'],
    ['plain HTML', '<div className="row"><section><Button label="Go" /></section></div>'],
    ['a package provider', "<ToastProvider><Button label=\"Go\" /></ToastProvider>"],
    ["a context's Provider", '<Theme.Provider value="dark"><Button label="Go" /></Theme.Provider>'],
    ['a landmark role on a layout component', '<Card role="main"><Button label="Go" /></Card>'],
    ['a landmark role on HTML', '<nav role="navigation"><div role="group"><Button label="Go" /></div></nav>'],
    ['a ButtonGroup that is not disabled', '<ButtonGroup isDisabled={false}><Button label="Copy" /></ButtonGroup>'],
  ])('%s: reported', (_, body) => {
    const source = page(
      body,
      "import {ButtonGroup} from '@astryxdesign/core/ButtonGroup'; import {ToastProvider} from '@astryxdesign/core/Toast';",
    ).replace(
      "import {VStack} from '@astryxdesign/core/Layout';",
      "import {VStack, Card, Layout} from '@astryxdesign/core/Layout';",
    );
    expect(deadButtons({'page.tsx': source})).toHaveLength(1);
  });

  it('React wrappers, by named and by default import', () => {
    expect(onPage('<Suspense fallback={null}><Button label="A" /></Suspense>', "import {Suspense} from 'react';")).toEqual([
      'page.tsx:6 A',
    ]);
    expect(onPage('<React.Fragment><Button label="B" /></React.Fragment>', "import React from 'react';")).toEqual([
      'page.tsx:6 B',
    ]);
  });
});

describe('where the component that holds the button is rendered', () => {
  const hero = [
    "import {Button} from '@astryxdesign/core/Button';",
    'export function Hero() {',
    '  return <Button label="Start" />;',
    '}',
    '',
  ].join('\n');

  const heroDefault = [
    "import {Button} from '@astryxdesign/core/Button';",
    'export default function Hero() {',
    '  return <Button label="Start" />;',
    '}',
    '',
  ].join('\n');
  /** @param {string} imports @param {string} body */
  const pageWith = (imports, body) => `${imports}\nexport default function Page() {\n  return ${body};\n}\n`;

  it.each([
    ['a lazy import inside a link', {'Hero.tsx': heroDefault, 'page.tsx': pageWith("import {lazy} from 'react';\nconst Lazy = lazy(() => import('./Hero'));", '<a href="/x"><Lazy /></a>')}],
    ['an aliased import inside a link', {'Hero.tsx': hero, 'page.tsx': pageWith("import {Hero as Banner} from './Hero';", '<a href="/x"><Banner /></a>')}],
    ['a list of components', {'Hero.tsx': hero, 'page.tsx': pageWith("import {Hero} from './Hero';\nconst sections = [Hero];", '<a href="/x">{sections.map(Section => <Section key="s" />)}</a>')}],
    ['a renamed re-export', {'Hero.tsx': hero, 'sections.ts': "export {Hero as Banner} from './Hero';\n", 'page.tsx': pageWith("import {Banner} from './sections';", '<a href="/x"><Banner /></a>')}],
    ['a re-export of a default export', {'Hero.tsx': heroDefault, 'sections.ts': "export {default as Banner} from './Hero';\n", 'page.tsx': pageWith("import {Banner} from './sections';", '<a href="/x"><Banner /></a>')}],
    ['a namespace import read as a value', {'Hero.tsx': hero, 'page.tsx': pageWith("import * as Sections from './Hero';", '<a href="/x">{Object.values(Sections).map(S => <S key="s" />)}</a>')}],
    ['a component passed as a prop', {'Hero.tsx': hero, 'page.tsx': pageWith("import {Hero} from './Hero';\nimport {Route} from 'react-router-dom';", '<Route path="/" Component={Hero} />')}],
    ['a component its own module lists', {'page.tsx': "import {Button} from '@astryxdesign/core/Button';\nexport function Home() {\n  return <Button label=\"Go\" />;\n}\nexport const routes = [{path: '/', component: Home}];\n"}],
  ])('%s: not reported', (_, modules) => {
    expect(deadButtons(modules)).toEqual([]);
  });

  it.each([
    ['a lazy import through a barrel, under another name', {'Hero.tsx': hero, 'sections/index.ts': "export * from '../Hero';\n", 'page.tsx': pageWith("import {lazy} from 'react';\nconst Banner = lazy(() => import('./sections').then(m => ({default: m.Hero})));", '<a href="/x"><Banner /></a>')}],
    ['a barrel read as a value', {'Hero.tsx': hero, 'sections/index.ts': "export {Hero} from '../Hero';\n", 'page.tsx': pageWith("import * as Sections from './sections';", '<a href="/x">{Object.values(Sections).map(S => <S key="s" />)}</a>')}],
    ['a barrel of barrels loaded by import()', {'Hero.tsx': hero, 'all/index.ts': "export {Hero} from '../Hero';\n", 'top/index.ts': "export * from '../all';\n", 'page.tsx': pageWith("const load = () => import('./top');", '<a href="/x" onClick={load}>Go</a>')}],
  ])('%s: not reported', (_, modules) => {
    expect(deadButtons(modules)).toEqual([]);
  });

  it('a component through a barrel, in the open, is followed to the button', () => {
    expect(
      deadButtons({'Hero.tsx': hero, 'sections/index.ts': "export * from '../Hero';\n", 'page.tsx': pageWith("import {Hero} from './sections';", '<main><Hero /></main>')}),
    ).toEqual(['Hero.tsx:3 Start']);
  });

  it('when the scan did not list every module, no component counts as one nothing renders', () => {
    const isOwnCode = () => false;
    const source = "import {Button} from '@astryxdesign/core/Button';\nexport default function Page() {\n  return <Button label=\"Go\" />;\n}\n";
    const scanned = scanButtonActions(source, {isOwnCode, stem: 'page'});
    const app = {files: ['page.tsx'], scan: () => scanned, modulesNaming: () => ['page.tsx']};
    expect(buttonsWithoutAction(app)).toHaveLength(1);
    expect(buttonsWithoutAction({...app, complete: false})).toEqual([]);
  });

  it('a package.json subpath import is the app\'s own code', () => {
    const page = (/** @type {string} */ body) => pageWith("import Hero from '#components/Hero';", body);
    const heroModule = heroDefault;
    expect(deadButtons({'Hero.tsx': heroModule, 'page.tsx': page('<a href="/x"><Hero /></a>')})).toEqual([]);
    expect(deadButtons({'Hero.tsx': heroModule, 'page.tsx': page('<main><Hero /></main>')})).toEqual(['Hero.tsx:3 Start']);
  });

  it('a module path only a bundler resolves may render its imports anywhere', () => {
    const knownPackage = (/** @type {string} */ specifier) => !specifier.startsWith('~/');
    for (const body of ['<a href="/x"><Hero /></a>', '<main><Hero /></main>']) {
      expect(
        deadButtons({'Hero.tsx': heroDefault, 'page.tsx': pageWith("import Hero from '~/Hero';", body)}, {knownPackage}),
      ).toEqual([]);
    }
    expect(
      deadButtons({'Hero.tsx': hero, 'page.tsx': pageWith("const load = () => import('~/Hero');", '<a href="/x" onClick={load}>Go</a>')}, {knownPackage}),
    ).toEqual([]);
  });

  it('a provider imported through a module path only a bundler resolves is not trusted', () => {
    const knownPackage = (/** @type {string} */ specifier) => !specifier.startsWith('~/');
    const body = '<AppProvider><Button label="Start" /></AppProvider>';
    expect(deadButtons({'page.tsx': page(body, "import {AppProvider} from '~/providers';")}, {knownPackage})).toEqual([]);
    expect(deadButtons({'page.tsx': page(body, "import {AppProvider} from '@acme/providers';")}, {knownPackage})).toEqual(['page.tsx:6 Start']);
  });

  it('an aliased import in the open is followed to the button', () => {
    expect(deadButtons({'Hero.tsx': hero, 'page.tsx': pageWith("import {Hero as Banner} from './Hero';", '<main><Banner /></main>')})).toEqual([
      'Hero.tsx:3 Start',
    ]);
  });

  it('a type that names the component renders nothing', () => {
    expect(
      deadButtons({
        'Hero.tsx': hero,
        'page.tsx': pageWith("import {Hero} from './Hero';\ntype HeroProps = Parameters<typeof Hero>[0];", '<main><Hero /></main>'),
      }),
    ).toEqual(['Hero.tsx:3 Start']);
  });

  it('a component the app renders in the open', () => {
    expect(
      deadButtons({
        'Hero.tsx': hero,
        'page.tsx': "import {Hero} from './Hero';\nexport default function Page() {\n  return <main><Hero /></main>;\n}\n",
      }),
    ).toEqual(['Hero.tsx:3 Start']);
  });

  it('a component the app renders inside a link, in another module', () => {
    expect(
      deadButtons({
        'Hero.tsx': hero,
        'page.tsx': "import {Hero} from './Hero';\nexport default function Page() {\n  return <a href=\"/start\"><Hero /></a>;\n}\n",
      }),
    ).toEqual([]);
  });

  it('a component rendered in the open once and inside a link once', () => {
    expect(
      deadButtons({
        'Hero.tsx': hero,
        'page.tsx':
          "import {Hero} from './Hero';\nexport default function Page() {\n  return <main><Hero /><a href=\"/x\"><Hero /></a></main>;\n}\n",
      }),
    ).toEqual([]);
  });

  it('through a path alias and a default import under another name', () => {
    const landing = "import {Button} from '@astryxdesign/core';\nexport default function LandingPage() {\n  return <Button label=\"Open\" />;\n}\n";
    expect(
      deadButtons({
        'LandingPage.tsx': landing,
        'App.tsx': "import Landing from '@/LandingPage';\nexport default function App() {\n  return <a href=\"/\"><Landing /></a>;\n}\n",
      }),
    ).toEqual([]);
    expect(
      deadButtons({
        'LandingPage.tsx': landing,
        'App.tsx': "import Landing from '@/LandingPage';\nexport default function App() {\n  return <Landing />;\n}\n",
      }),
    ).toEqual(['LandingPage.tsx:3 Open']);
  });

  it('an entry point: a root render call', () => {
    expect(
      deadButtons({
        'main.tsx':
          "import {createRoot} from 'react-dom/client';\nimport {StrictMode} from 'react';\nimport App from './App';\ncreateRoot(document.body).render(<StrictMode><App /></StrictMode>);\n",
        'App.tsx': "import {Button} from '@astryxdesign/core';\nexport default function App() {\n  return <Button label=\"Go\" />;\n}\n",
      }),
    ).toEqual(['App.tsx:3 Go']);
  });

  it("a router's page", () => {
    expect(
      deadButtons({
        'routes.tsx':
          "import {Route, Routes} from 'react-router-dom';\nimport {Home} from './Home';\nexport function AppRoutes() {\n  return <Routes><Route path=\"/\" element={<Home />} /></Routes>;\n}\n",
        'Home.tsx': "import {Button} from '@astryxdesign/core';\nexport function Home() {\n  return <Button label=\"Begin\" />;\n}\n",
      }),
    ).toEqual(['Home.tsx:3 Begin']);
  });

  it('a page no module renders is reported; a component nothing renders or exports is not', () => {
    expect(deadButtons({'page.tsx': hero})).toEqual(['page.tsx:3 Start']);
    expect(
      deadButtons({'page.tsx': hero.replace('export function Hero', 'function Hero')}),
    ).toEqual([]);
  });

  it('a component rendered where the scan cannot follow it', () => {
    expect(
      deadButtons({
        'Hero.tsx': hero,
        'routes.tsx': "import {Hero} from './Hero';\nexport const routes = [{path: '/', element: <Hero />}];\n",
      }),
    ).toEqual([]);
  });

  it('a function that is not a component', () => {
    expect(
      deadButtons({
        'page.tsx':
          "import {Button} from '@astryxdesign/core';\nexport function renderActions() {\n  return <Button label=\"Go\" />;\n}\n",
      }),
    ).toEqual([]);
  });

  it('a memo or forwardRef component, and an arrow component', () => {
    expect(
      deadButtons({
        'a.tsx': "import {memo} from 'react';\nimport {Button} from '@astryxdesign/core';\nexport const A = memo(function A() {\n  return <Button label=\"A\" />;\n});\n",
        'b.tsx': "import {forwardRef} from 'react';\nimport {Button} from '@astryxdesign/core';\nexport const B = forwardRef(() => <Button label=\"B\" />);\n",
        'c.tsx': "import {Button} from '@astryxdesign/core';\nconst C = () => <Button label=\"C\" />;\nexport default C;\n",
      }),
    ).toEqual(['a.tsx:4 A', 'b.tsx:3 B', 'c.tsx:2 C']);
  });
});

describe('which buttons the scan reads', () => {
  it.each([
    ["another package's button", "import {Button} from '@acme/ui';\nexport default function P() { return <Button label=\"Go\" />; }\n"],
    ['a button the module declares', "import {Button as CoreButton} from '@astryxdesign/core';\nconst Button = () => <CoreButton label=\"Go\" onClick={go} />;\nexport default function P() { return <Button label=\"Go\" />; }\n"],
    ['a type-only import', "import type {Button} from '@astryxdesign/core';\nexport default function P() { return <Button label=\"Go\" />; }\n"],
  ])('%s: not read', (_, source) => {
    expect(deadButtons({'page.tsx': source})).toEqual([]);
  });

  it('a namespace import and a component entry', () => {
    expect(
      deadButtons({
        'a.tsx': "import * as Astryx from '@astryxdesign/core';\nexport default function A() { return <Astryx.Button label=\"Go\" />; }\n",
        'b.tsx': "import {IconButton} from '@astryxdesign/core/IconButton';\nexport default function B() { return <IconButton label=\"X\" icon=\"x\" />; }\n",
      }),
    ).toEqual(['a.tsx:2 Go', 'b.tsx:2 X']);
  });

  it('a module that does not parse has no scan', () => {
    expect(scanButtonActions('export default function (', {isOwnCode: () => false, stem: 'x'})).toBeNull();
  });
});

describe('the Core layout components the scan trusts', () => {
  const coreSource = fileURLToPath(new URL('../../../core/src/', import.meta.url));

  /**
   * The source file that declares a Core component: `<Name>.tsx` in its
   * folder.
   * @param {string} name
   * @returns {string | null}
   */
  function sourceOf(name) {
    const queue = [coreSource];
    while (queue.length > 0) {
      const dir = /** @type {string} */ (queue.shift());
      for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory() && entry.name !== '__tests__') queue.push(file);
        else if (entry.name === `${name}.tsx`) return file;
      }
    }
    return null;
  }

  /** The handlers of a press, as JSX props. */
  const PRESS_PROPS = new Set([
    'onClick',
    'onClickCapture',
    'onDoubleClick',
    'onMouseDown',
    'onMouseUp',
    'onPointerDown',
    'onPointerUp',
    'onTouchStart',
    'onTouchEnd',
  ]);
  const PRESS_EVENTS = new Set(['click', 'auxclick', 'dblclick', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend']);

  /**
   * Whether a handler only passes on the caller's own handler and the
   * component's truncation tooltip's (`composeEventHandlers(tooltipInterest.onPointerDown,
   * props.onPointerDown)`), which hides that tooltip and acts on nothing it renders.
   * @param {any} value a JSXAttribute value
   */
  const forwardsOnly = value =>
    value?.type === 'JSXExpressionContainer' &&
    value.expression.type === 'CallExpression' &&
    value.expression.callee.type === 'Identifier' &&
    value.expression.callee.name === 'composeEventHandlers' &&
    value.expression.arguments.every(
      (/** @type {any} */ argument) =>
        argument.type === 'MemberExpression' &&
        argument.object.type === 'Identifier' &&
        ['props', 'tooltipInterest'].includes(argument.object.name),
    );

  /**
   * What in a module can act on a press of what it renders: a press handler
   * prop, a clone of an element, a walk over its children, or a click
   * listener. Read from the syntax tree, so comments do not count.
   * @param {string} source
   */
  function pressReaders(source) {
    /** @type {string[]} */
    const found = [];
    walk(parseTemplateSource(source), (/** @type {any} */ node) => {
      if (node.type === 'JSXAttribute' && node.name.type === 'JSXIdentifier' && PRESS_PROPS.has(node.name.name) && !forwardsOnly(node.value)) {
        found.push(node.name.name);
      }
      if (node.type === 'Identifier' && node.name === 'cloneElement') found.push('cloneElement');
      if (
        node.type === 'MemberExpression' &&
        node.object.type === 'Identifier' &&
        node.object.name === 'Children' &&
        node.property.type === 'Identifier' &&
        ['map', 'toArray', 'forEach'].includes(node.property.name)
      ) {
        found.push(`Children.${node.property.name}`);
      }
      if (
        node.type === 'CallExpression' &&
        node.callee.type === 'MemberExpression' &&
        node.callee.property.type === 'Identifier' &&
        node.callee.property.name === 'addEventListener' &&
        node.arguments[0]?.type === 'StringLiteral' &&
        PRESS_EVENTS.has(node.arguments[0].value)
      ) {
        found.push(`addEventListener('${node.arguments[0].value}')`);
      }
    });
    return found;
  }

  it('the source check catches a press handler and a clone', () => {
    expect(pressReaders('const A = p => <div onClick={p.go}>{cloneElement(p.children)}</div>;')).toEqual([
      'onClick',
      'cloneElement',
    ]);
    expect(pressReaders('// onClick, cloneElement\nconst A = p => <div>{p.children}</div>;')).toEqual([]);
    expect(pressReaders('const A = p => <div onPointerUp={p.go} onTouchEnd={p.go}>{p.children}</div>;')).toEqual(['onPointerUp', 'onTouchEnd']);
    expect(pressReaders("el.addEventListener('touchend', go);")).toEqual(["addEventListener('touchend')"]);
    expect(
      pressReaders('const A = props => <p onPointerDown={composeEventHandlers(tooltipInterest.onPointerDown, props.onPointerDown)} />;'),
    ).toEqual([]);
    expect(pressReaders('const A = props => <p onPointerDown={composeEventHandlers(go, props.onPointerDown)} />;')).toEqual(['onPointerDown']);
  });

  it.each([...LAYOUT_COMPONENTS].sort())('%s listens for no press and clones nothing it renders', name => {
    const file = sourceOf(name);
    expect(file, `no source for ${name}`).not.toBeNull();
    expect(pressReaders(fs.readFileSync(/** @type {string} */ (file), 'utf8'))).toEqual([]);
  });
});
