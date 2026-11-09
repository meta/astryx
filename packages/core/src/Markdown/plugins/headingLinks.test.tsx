// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file headingLinks.test.tsx
 * @input Markdown and Outline with the first-party heading-links plugin
 * @output Identity, rendering, routing, i18n, and custom-renderer evidence
 * @position Acceptance tests for module:Markdown/headingLinks
 */

import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ComponentProps, ReactNode} from 'react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest';
import {__resetLiveRegionsForTest} from '../../hooks/useAnnounce';
import {useContainerReveal} from '../../hooks/useContainerReveal';
import {LinkProvider} from '../../Link/LinkProvider';
import {InternationalizationProvider} from '../../i18n';
import {parseOutlineFromMarkdown} from '../../Outline/parseOutlineFromMarkdown';
import {Markdown} from '../Markdown';
import {createMarkdownHeadingLinks} from './index';
import {createMarkdownPlugin} from './protocol';
import type {MarkdownPluginEntry} from './protocol';

const headingLinks = createMarkdownHeadingLinks();
const markdownPluginBrand = Symbol.for(
  '@astryxdesign/core/MarkdownPluginEntry',
);
const headingLinksConfigBrand = Symbol.for(
  '@astryxdesign/core/MarkdownHeadingLinksConfig',
);

function createBrandedSameNameEntry({
  pluginApiVersion = 1,
  config,
}: {
  readonly pluginApiVersion?: number;
  readonly config?: unknown;
}): MarkdownPluginEntry {
  const definition: Record<PropertyKey, unknown> = {
    name: 'heading-links',
    apiVersion: pluginApiVersion,
    transform: (root: {readonly type: string}) => root,
  };
  if (config !== undefined) {
    Object.defineProperty(definition, headingLinksConfigBrand, {
      configurable: false,
      enumerable: false,
      value: Object.freeze(config),
      writable: false,
    });
  }
  Object.freeze(definition);
  return Object.freeze({
    name: 'heading-links',
    apiVersion: pluginApiVersion,
    [markdownPluginBrand]: Object.freeze({
      kind: '@astryxdesign/core/MarkdownPluginEntry',
      apiVersion: pluginApiVersion,
      definition,
    }),
  }) as unknown as MarkdownPluginEntry;
}

function createConfig(
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    kind: '@astryxdesign/core/MarkdownHeadingLinksConfig',
    apiVersion: 1,
    headingIdPrefix: 'ignored',
    permalinkBaseUrl: '',
    ...overrides,
  };
}

const incompatibleHeadingLinksEntries: ReadonlyArray<
  readonly [string, MarkdownPluginEntry]
> = [
  [
    'same-name plugin without module configuration',
    createMarkdownPlugin({
      name: 'heading-links',
      apiVersion: 1,
      transform: root => root,
    }),
  ],
  [
    'malformed generic envelope',
    Object.freeze({
      name: 'heading-links',
      apiVersion: 1,
    }) as unknown as MarkdownPluginEntry,
  ],
  ['older plugin protocol', createBrandedSameNameEntry({pluginApiVersion: 0})],
  ['newer plugin protocol', createBrandedSameNameEntry({pluginApiVersion: 2})],
  [
    'older module configuration',
    createBrandedSameNameEntry({config: createConfig({apiVersion: 0})}),
  ],
  [
    'newer module configuration',
    createBrandedSameNameEntry({config: createConfig({apiVersion: 2})}),
  ],
  [
    'unparseable URL configuration',
    createBrandedSameNameEntry({
      config: createConfig({permalinkBaseUrl: 'https://%'}),
    }),
  ],
  [
    'wrong module configuration shape',
    createBrandedSameNameEntry({
      config: createConfig({headingIdPrefix: 42}),
    }),
  ],
];

function clipboardWrite(): ReturnType<typeof vi.fn> {
  return navigator.clipboard.writeText as ReturnType<typeof vi.fn>;
}

describe('createMarkdownHeadingLinks', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {writeText: vi.fn().mockResolvedValue(undefined)},
    });
  });

  afterEach(() => {
    __resetLiveRegionsForTest();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  it('returns an ordinary public plugin entry', () => {
    expectTypeOf(headingLinks).toMatchTypeOf<MarkdownPluginEntry<never>>();
  });

  it('carries namespace and URL options across a duplicate compatible Core copy', async () => {
    vi.resetModules();
    const duplicateCore = await import('./headingLinks');
    const portableEntry = duplicateCore.createMarkdownHeadingLinks({
      headingIdPrefix: 'portable',
      permalinkBaseUrl: '/reader?document=42#stale',
    });
    const source = '> # Nested\n\n# Root';

    render(<Markdown plugins={[portableEntry]}>{source}</Markdown>);

    expect(screen.getByRole('heading', {name: 'Nested'})).toHaveAttribute(
      'id',
      'portable--nested',
    );
    const copyButton = screen.getByRole('button', {
      name: 'Copy link to Nested',
    });
    expect(copyButton).not.toHaveAttribute('href');
    await act(async () => {
      fireEvent.click(copyButton);
      await Promise.resolve();
    });
    expect(clipboardWrite()).toHaveBeenCalledWith(
      new URL('/reader?document=42#portable--nested', window.location.href)
        .href,
    );
    expect(
      parseOutlineFromMarkdown(source, {plugins: [portableEntry]}),
    ).toEqual([{id: 'portable--root', label: 'Root', level: 1}]);
  });

  it.each(incompatibleHeadingLinksEntries)(
    'fails soft for %s across Markdown and Outline',
    (_label, incompatibleEntry) => {
      const source = '> # Nested\n\n# Root';
      const {container} = render(
        <Markdown plugins={[incompatibleEntry]}>{source}</Markdown>,
      );
      const [nested, root] = screen.getAllByRole('heading');

      expect(nested).not.toHaveAttribute('id');
      expect(root).toHaveAttribute('id', 'root');
      expect(container.querySelector('button, a[href*="#"]')).toBeNull();
      expect(
        parseOutlineFromMarkdown(source, {plugins: [incompatibleEntry]}),
      ).toEqual([{id: 'root', label: 'Root', level: 1}]);
    },
  );

  it('does not treat another valid plugin as heading-links configuration', () => {
    const otherPlugin = createMarkdownPlugin({
      name: 'other-plugin',
      apiVersion: 1,
      transform: root => root,
    });
    render(
      <Markdown plugins={[otherPlugin]}>{'> # Nested\n\n# Root'}</Markdown>,
    );
    const [nested, root] = screen.getAllByRole('heading');

    expect(nested).not.toHaveAttribute('id');
    expect(root).toHaveAttribute('id', 'root');
    expect(screen.queryByRole('button', {name: /Copy link/})).toBeNull();
  });

  it('links every semantic heading level', () => {
    render(
      <Markdown plugins={[headingLinks]}>
        {Array.from(
          {length: 6},
          (_, index) => `${'#'.repeat(index + 1)} Level ${index + 1}`,
        ).join('\n\n')}
      </Markdown>,
    );

    for (let level = 1; level <= 6; level += 1) {
      const heading = screen.getByRole('heading', {
        level,
        name: `Level ${level}`,
      });
      expect(heading).toHaveAttribute('id', `level-${level}`);
      const copyButton = screen.getByRole('button', {
        name: `Copy link to Level ${level}`,
      });
      expect(copyButton).not.toHaveAttribute('href');
      expect(copyButton).toHaveTextContent('#');
    }
  });

  it('shares one depth-first allocator while Outline remains root-only', () => {
    const source = '> # Quoted\n\n# Quoted';
    const {container} = render(
      <Markdown plugins={[headingLinks]}>{source}</Markdown>,
    );
    const [nested, topLevel] = screen.getAllByText('Quoted');

    expect(container.querySelector('blockquote')).toContainElement(nested);
    expect(nested).toHaveAttribute('id', 'quoted');
    expect(topLevel).toHaveAttribute('id', 'quoted-1');
    expect(parseOutlineFromMarkdown(source, {plugins: [headingLinks]})).toEqual(
      [{id: 'quoted-1', label: 'Quoted', level: 1}],
    );
  });

  it('reserves emitted ids across natural numeric-suffix collisions', () => {
    render(
      <Markdown plugins={[headingLinks]}>
        {'# Foo\n\n# Foo\n\n# Foo-1'}
      </Markdown>,
    );
    expect(screen.getAllByRole('heading').map(heading => heading.id)).toEqual([
      'foo',
      'foo-1',
      'foo-1-1',
    ]);
    expect(
      parseOutlineFromMarkdown('# Foo-1\n\n# Foo\n\n# Foo', {
        plugins: [headingLinks],
      }).map(item => item.id),
    ).toEqual(['foo-1', 'foo', 'foo-2']);
  });

  it('normalizes Unicode letters and numbers while stripping emoji', () => {
    render(
      <Markdown plugins={[headingLinks]}>
        {'# Ｈｅｌｌｏ Привет 你好 😄 １２３'}
      </Markdown>,
    );
    expect(screen.getByRole('heading')).toHaveAttribute(
      'id',
      'hello-привет-你好-123',
    );
  });

  it('uses a caller-owned namespace across Markdown and Outline', () => {
    const source = '# Overview\n\n## Details';
    const namespaced = createMarkdownHeadingLinks({
      headingIdPrefix: 'article',
    });
    const {container} = render(
      <Markdown id="article" plugins={[namespaced]}>
        {source}
      </Markdown>,
    );

    expect(container.firstElementChild).toHaveAttribute('id', 'article');
    expect(screen.getAllByRole('heading').map(heading => heading.id)).toEqual([
      'article--overview',
      'article--details',
    ]);
    expect(parseOutlineFromMarkdown(source, {plugins: [namespaced]})).toEqual([
      {id: 'article--overview', label: 'Overview', level: 1},
      {id: 'article--details', label: 'Details', level: 2},
    ]);
  });

  it('renders one honest sibling copy button for every owned heading', () => {
    render(
      <Markdown plugins={[headingLinks]}>
        {'# Overview\n\n> ## Nested details'}
      </Markdown>,
    );
    const headings = screen.getAllByRole('heading');
    const copyButtons = screen.getAllByRole('button', {name: /Copy link to/});

    expect(headings.map(heading => heading.id)).toEqual([
      'overview',
      'nested-details',
    ]);
    expect(copyButtons).toHaveLength(headings.length);
    headings.forEach((heading, index) => {
      expect(heading).not.toContainElement(copyButtons[index]);
      expect(heading.parentElement).toContainElement(copyButtons[index]);
      expect(copyButtons[index]).toHaveAttribute('type', 'button');
      expect(copyButtons[index]).not.toHaveAttribute('href');
    });
  });

  it('wires the heading row and button to canonical container reveal', () => {
    const {result} = renderHook(() => useContainerReveal());
    const containerClasses = result.current
      .getContainerProps()
      .className?.split(/\s+/)
      .filter(Boolean);
    const contentClasses = result.current
      .getContentRevealProps({isLayoutPreserved: true})
      .className?.split(/\s+/)
      .filter(Boolean);
    render(<Markdown plugins={[headingLinks]}>{'# Overview'}</Markdown>);
    const heading = screen.getByRole('heading', {name: 'Overview'});
    const copyButton = screen.getByRole('button', {
      name: 'Copy link to Overview',
    });

    expect(containerClasses).toBeTruthy();
    expect(contentClasses).toBeTruthy();
    for (const className of containerClasses ?? []) {
      expect(heading.parentElement).toHaveClass(className);
    }
    for (const className of contentClasses ?? []) {
      expect(copyButton).toHaveClass(className);
    }
  });

  it('copies the canonical URL, shows fixed-space confirmation, announces, and restores', async () => {
    vi.useFakeTimers();
    render(<Markdown plugins={[headingLinks]}>{'# Overview'}</Markdown>);
    const permalink = screen.getByRole('button', {
      name: 'Copy link to Overview',
    });
    const canonicalUrl = new URL('#overview', window.location.href).href;
    const locationBefore = window.location.href;
    const scrollBefore = {x: window.scrollX, y: window.scrollY};

    await act(async () => {
      fireEvent.click(permalink);
      await Promise.resolve();
    });

    expect(window.location.href).toBe(locationBefore);
    expect({x: window.scrollX, y: window.scrollY}).toEqual(scrollBefore);
    expect(clipboardWrite()).toHaveBeenCalledWith(canonicalUrl);
    expect(permalink).toHaveAccessibleName('Link copied');
    expect(permalink.querySelector('.astryx-icon')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(20);
      await Promise.resolve();
    });
    expect(
      document.querySelector('[data-astryx-live-region="polite"]'),
    ).toHaveTextContent('Link copied');

    act(() => {
      vi.advanceTimersByTime(1480);
    });
    expect(permalink).toHaveAccessibleName('Copy link to Overview');
    expect(permalink).toHaveTextContent('#');
  });

  it('fails softly without navigation when clipboard writing rejects', async () => {
    clipboardWrite().mockRejectedValueOnce(new Error('clipboard denied'));
    render(<Markdown plugins={[headingLinks]}>{'# Overview'}</Markdown>);
    const permalink = screen.getByRole('button', {
      name: 'Copy link to Overview',
    });
    const locationBefore = window.location.href;

    await act(async () => {
      fireEvent.click(permalink);
      await Promise.resolve();
    });

    expect(window.location.href).toBe(locationBefore);
    expect(permalink).toHaveAccessibleName('Copy link to Overview');
    expect(permalink).toHaveTextContent('#');
    expect(
      document.querySelector('[data-astryx-live-region="polite"]'),
    ).toBeNull();
  });

  it('fails softly when the Clipboard API is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });
    render(<Markdown plugins={[headingLinks]}>{'# Overview'}</Markdown>);
    const permalink = screen.getByRole('button', {
      name: 'Copy link to Overview',
    });
    const locationBefore = window.location.href;

    await act(async () => {
      fireEvent.click(permalink);
      await Promise.resolve();
    });

    expect(window.location.href).toBe(locationBefore);
    expect(permalink).toHaveAccessibleName('Copy link to Overview');
    expect(permalink).toHaveTextContent('#');
  });

  it('ignores modified and non-primary pointer activation', () => {
    render(<Markdown plugins={[headingLinks]}>{'# Overview'}</Markdown>);
    const permalink = screen.getByRole('button', {
      name: 'Copy link to Overview',
    });

    expect(fireEvent.click(permalink, {ctrlKey: true})).toBe(true);
    expect(fireEvent.click(permalink, {metaKey: true})).toBe(true);
    expect(fireEvent.click(permalink, {shiftKey: true})).toBe(true);
    expect(fireEvent.click(permalink, {altKey: true})).toBe(true);
    expect(fireEvent.click(permalink, {button: 1})).toBe(true);
    expect(clipboardWrite()).not.toHaveBeenCalled();
  });

  it('copies on keyboard Enter and Space without navigation semantics', async () => {
    const user = userEvent.setup();
    render(<Markdown plugins={[headingLinks]}>{'# Keyboard target'}</Markdown>);
    const permalink = screen.getByRole('button', {
      name: 'Copy link to Keyboard target',
    });
    const canonicalUrl = new URL('#keyboard-target', window.location.href).href;
    permalink.focus();

    await user.keyboard('{Enter}');

    await waitFor(async () => {
      expect(await navigator.clipboard.readText()).toBe(canonicalUrl);
    });
    expect(permalink).toHaveFocus();
    expect(permalink).toHaveAttribute('type', 'button');
    expect(permalink).not.toHaveAttribute('href');

    await navigator.clipboard.writeText('sentinel');
    await user.keyboard(' ');
    await waitFor(async () => {
      expect(await navigator.clipboard.readText()).toBe(canonicalUrl);
    });
    expect(permalink).toHaveFocus();
  });

  it('keeps one feedback timer across re-click and clears it on unmount', async () => {
    vi.useFakeTimers();
    const clearTimer = vi.spyOn(globalThis, 'clearTimeout');
    const {unmount} = render(
      <Markdown plugins={[headingLinks]}>{'# Overview'}</Markdown>,
    );
    const permalink = screen.getByRole('button', {
      name: 'Copy link to Overview',
    });

    await act(async () => {
      fireEvent.click(permalink);
      await Promise.resolve();
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    await act(async () => {
      fireEvent.click(permalink);
      await Promise.resolve();
    });
    expect(clearTimer).toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(permalink).toHaveAccessibleName('Link copied');
    const clearsBeforeUnmount = clearTimer.mock.calls.length;
    unmount();
    expect(clearTimer.mock.calls.length).toBeGreaterThan(clearsBeforeUnmount);
  });

  it('keeps authored heading links valid instead of nesting anchors', () => {
    const {container} = render(
      <Markdown plugins={[headingLinks]}>
        {'# Read the [guide](https://example.com/guide)'}
      </Markdown>,
    );
    const heading = screen.getByRole('heading', {name: 'Read the guide'});

    expect(heading.querySelectorAll('a')).toHaveLength(1);
    expect(
      heading.parentElement?.querySelectorAll(':scope > span > button'),
    ).toHaveLength(1);
    expect(container.querySelector('a a')).toBeNull();
  });

  it('uses honest button semantics outside product link routing', async () => {
    const onLinkClick = vi.fn();
    const ProviderLink = ({children, ...linkProps}: ComponentProps<'a'>) => (
      <a data-provider-link {...linkProps}>
        {children}
      </a>
    );
    render(
      <LinkProvider component={ProviderLink}>
        <Markdown onLinkClick={onLinkClick} plugins={[headingLinks]}>
          {'# Overview'}
        </Markdown>
      </LinkProvider>,
    );

    const permalink = screen.getByRole('button', {
      name: 'Copy link to Overview',
    });
    expect(permalink.tagName).toBe('BUTTON');
    expect(permalink).not.toHaveAttribute('href');
    expect(permalink).not.toHaveAttribute('data-provider-link');
    await act(async () => {
      fireEvent.click(permalink);
      await Promise.resolve();
    });
    expect(onLinkClick).not.toHaveBeenCalled();
  });

  it('localizes the copy action and copied names through module keys', async () => {
    render(
      <InternationalizationProvider
        locale="fr"
        overrides={{
          fr: {
            '@astryx.markdownHeadingLinks.copied': 'Lien copié',
            '@astryx.markdownHeadingLinks.copy':
              'Copier le lien vers {heading}',
          },
        }}>
        <Markdown plugins={[headingLinks]}>{'# Aperçu'}</Markdown>
      </InternationalizationProvider>,
    );
    const permalink = screen.getByRole('button', {
      name: 'Copier le lien vers Aperçu',
    });
    expect(permalink).not.toHaveAttribute('href');

    await act(async () => {
      fireEvent.click(permalink);
      await Promise.resolve();
    });
    expect(permalink).toHaveAccessibleName('Lien copié');
  });

  it('uses a stable section fallback when the label has no slug text', () => {
    render(
      <Markdown plugins={[headingLinks]} sources={{cite: {title: 'Citation'}}}>
        {'# [cite]'}
      </Markdown>,
    );
    expect(screen.getByRole('heading')).toHaveAttribute('id', 'section');
    expect(
      screen.getByRole('button', {name: 'Copy link to section'}),
    ).toHaveTextContent('#');
  });

  it('keeps namespaces inside copied URLs and sanitizes optional bases', async () => {
    const namespace = ['java', 'script:alert(1)'].join('');
    const routed = createMarkdownHeadingLinks({
      headingIdPrefix: namespace,
      permalinkBaseUrl: '/reader?document=42#stale',
    });
    render(<Markdown plugins={[routed]}>{'# Overview'}</Markdown>);

    const copyButton = screen.getByRole('button', {
      name: 'Copy link to Overview',
    });
    await act(async () => {
      fireEvent.click(copyButton);
      await Promise.resolve();
    });
    expect(clipboardWrite()).toHaveBeenCalledWith(
      new URL(
        `/reader?document=42#${namespace}--overview`,
        window.location.href,
      ).href,
    );
    expect(() =>
      createMarkdownHeadingLinks({permalinkBaseUrl: 'javascript:alert(1)'}),
    ).toThrow(/safe, parseable navigation URL/);
    expect(() =>
      createMarkdownHeadingLinks({permalinkBaseUrl: 'https://%'}),
    ).toThrow(/safe, parseable navigation URL/);
  });

  it('leaves permalink output to a custom heading renderer at every depth', () => {
    const received: (string | undefined)[] = [];
    render(
      <Markdown
        plugins={[headingLinks]}
        components={{
          heading: ({children, id}: {children: ReactNode; id?: string}) => {
            received.push(id);
            return <h2 id={id}>{children}</h2>;
          },
        }}>
        {'> # Nested\n\n# Root'}
      </Markdown>,
    );

    expect(received).toEqual(['nested', 'root']);
    expect(screen.queryByRole('button', {name: /Copy link to/})).toBeNull();
  });
});
