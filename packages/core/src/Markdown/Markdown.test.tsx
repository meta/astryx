// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Markdown.test.tsx
 * @input Markdown renderer, supported blocks and source-line plugin
 * @output Semantic, flat-task identity and nested flow-task regressions
 * @position Core Markdown unit tests
 */

import {
  describe,
  it,
  expect,
  expectTypeOf,
  vi,
  beforeEach,
  afterEach,
} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import type {ComponentProps, ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Markdown} from './Markdown';
import {markdownSourceLinesPlugin} from './plugins';
import type {
  MarkdownComponents,
  MarkdownInlinePlugin,
  MarkdownSourceLines,
} from './Markdown';
import type {ParseOptions} from './index';
import {stubMatchMedia} from '../__tests__/stubMatchMedia';
import {parseOutlineFromMarkdown} from '../Outline/parseOutlineFromMarkdown';
import {spacingVars} from '../theme/tokens.stylex';

const tableCellSpacingProbe = stylex.create({
  cell: {
    paddingBlock: spacingVars['--spacing-2'],
    paddingInline: spacingVars['--spacing-2'],
  },
});

describe('Markdown', () => {
  it('renders with role="document"', () => {
    render(<Markdown>Hello</Markdown>);
    expect(screen.getByRole('document')).toBeInTheDocument();
  });

  it('renders astryx-markdown class name', () => {
    const {container} = render(<Markdown>Hello</Markdown>);
    expect(container.firstElementChild!.className).toContain('astryx-markdown');
  });

  it('renders headings', () => {
    render(<Markdown>{'# Heading 1\n\n## Heading 2'}</Markdown>);
    expect(screen.getByText('Heading 1').tagName).toBe('H1');
    expect(screen.getByText('Heading 2').tagName).toBe('H2');
  });

  describe('heading ids', () => {
    // Outline's documented contract: an outline item id "should match the
    // target heading element id". Markdown renders the ids that
    // useOutlineFromMarkdown derives, so hash navigation resolves.
    it('renders generated id attributes on headings', () => {
      render(<Markdown>{'# Overview\n\ncontent\n\n# Installation'}</Markdown>);
      expect(screen.getByText('Overview')).toHaveAttribute('id', 'overview');
      expect(screen.getByText('Installation')).toHaveAttribute(
        'id',
        'installation',
      );
    });

    it('disambiguates duplicate headings with numeric suffixes', () => {
      render(<Markdown>{'# Setup\n\n# Setup\n\n# Setup'}</Markdown>);
      const ids = screen.getAllByText('Setup').map(el => el.id);
      expect(ids).toEqual(['setup', 'setup-1', 'setup-2']);
    });

    it('renders ids matching parseOutlineFromMarkdown for the same source', () => {
      // Parity invariant: every id the outline derives must resolve to a
      // rendered heading with that exact id — including slugified formatting,
      // duplicate numbering, the empty-slug fallback, and code-fence decoys.
      const source = [
        '# **Bold** and _italic_ text',
        '## Setup',
        '## Setup',
        '### !!!',
        '```',
        '# not a heading',
        '```',
        '## The `useState` hook',
      ].join('\n\n');
      const {container} = render(<Markdown>{source}</Markdown>);
      const outline = parseOutlineFromMarkdown(source);
      expect(outline.length).toBe(5);
      for (const item of outline) {
        const target = container.querySelector(`[id="${item.id}"]`);
        expect(target, `no rendered heading with id "${item.id}"`).not.toBe(
          null,
        );
        expect(target!.tagName).toMatch(/^H[1-6]$/);
        expect(target!.textContent?.trim()).toBe(item.label);
      }
    });

    it('keeps citation markers out of released heading ids', () => {
      render(
        <Markdown sources={{cite: {title: 'Citation'}}}>
          {'# Before [cite] after'}
        </Markdown>,
      );
      expect(
        screen.getByRole('heading', {name: /Before.*after/}),
      ).toHaveAttribute('id', 'before-after');
    });

    it('passes the generated id to a custom heading component', () => {
      const received: (string | undefined)[] = [];
      render(
        <Markdown
          components={{
            heading: ({children, id}: {children: ReactNode; id?: string}) => {
              received.push(id);
              return <h2 id={id}>{children}</h2>;
            },
          }}>
          {'# Overview\n\n# Overview'}
        </Markdown>,
      );
      expect(received).toEqual(['overview', 'overview-1']);
    });
    it('does not assign ids to headings nested inside blockquotes', () => {
      // parseOutlineFromMarkdown only lists top-level headings. If nested
      // headings consumed slugs too, duplicate numbering would drift and
      // outline links would land on the wrong heading.
      const source = '> # Quoted\n\n# Quoted';
      const {container} = render(<Markdown>{source}</Markdown>);
      const outline = parseOutlineFromMarkdown(source);
      expect(outline.map(i => i.id)).toEqual(['quoted']);
      const [nested, topLevel] = screen.getAllByText('Quoted');
      expect(container.querySelector('blockquote')).toContainElement(nested);
      expect(nested).not.toHaveAttribute('id');
      expect(topLevel).toHaveAttribute('id', 'quoted');
      expect(screen.queryByRole('link', {name: /Permalink to/})).toBeNull();
    });
  });

  it('renders paragraphs as block <div> (never <p>) for composition safety', () => {
    render(<Markdown>{'Hello world'}</Markdown>);
    // Markdown paragraphs render as <div> so block-level inline content
    // (images, custom inline components) never trips the phrasing-content
    // trap that a <p> would impose. role="paragraph" re-exposes the paragraph
    // role to assistive tech without the <p> hazard. Consumers who want a real
    // <p> element can pass `components={{paragraph: 'p'}}`.
    const para = screen.getByText('Hello world');
    expect(para.tagName).toBe('DIV');
    expect(para).toHaveAttribute('role', 'paragraph');
  });

  it('renders the astryx-markdown-paragraph theme target on each paragraph', () => {
    render(<Markdown>{'First para\n\nSecond para'}</Markdown>);
    const first = screen.getByText('First para');
    const second = screen.getByText('Second para');
    // Stable theme-target class lets a theme adjust the inter-paragraph gap
    // (marginBlockStart/marginBlockEnd) via defineTheme without reaching for
    // fragile descendant selectors or global spacing tokens.
    expect(first.className).toContain('astryx-markdown-paragraph');
    expect(second.className).toContain('astryx-markdown-paragraph');
  });

  describe('base props', () => {
    // BaseProps documents that data-*, aria-* and role are kept; the root
    // dropped everything but data-testid.
    it('forwards data and aria attributes to the block root', () => {
      const {container} = render(
        <Markdown data-source="turn-7" aria-label="Answer">
          Hello
        </Markdown>,
      );
      const root = container.firstElementChild!;
      expect(root.getAttribute('data-source')).toBe('turn-7');
      expect(root.getAttribute('aria-label')).toBe('Answer');
    });

    it('keeps its own role when a consumer passes one', () => {
      // The rest spread comes first precisely so the component's own
      // semantics survive a consumer prop.
      const {container} = render(
        <Markdown role="presentation">Hello</Markdown>,
      );
      expect(container.firstElementChild!.getAttribute('role')).toBe(
        'document',
      );
    });

    it('forwards them on the inline root too', () => {
      const {container} = render(
        <Markdown display="inline" data-source="turn-7">
          Hello
        </Markdown>,
      );
      expect(container.firstElementChild!.getAttribute('data-source')).toBe(
        'turn-7',
      );
    });
  });

  describe('block spacing theme targets', () => {
    // Every block type renders a stable astryx-markdown-<block> class so a
    // theme can tune the gap around it (marginBlockStart/marginBlockEnd) via
    // defineTheme — the whole prose rhythm is themeable, not just paragraphs.
    it('renders a stable theme-target class on every block type', () => {
      const {container} = render(
        <Markdown>
          {[
            '# Heading',
            'Paragraph text',
            '- item one',
            '```\ncode\n```',
            '> quoted',
            '| a | b |\n| - | - |\n| 1 | 2 |',
            '---',
            '![alt](https://example.com/x.png)',
          ].join('\n\n')}
        </Markdown>,
      );
      for (const cls of [
        'astryx-markdown-heading',
        'astryx-markdown-paragraph',
        'astryx-markdown-list',
        'astryx-markdown-codeblock',
        'astryx-markdown-blockquote',
        'astryx-markdown-table',
        'astryx-markdown-hr',
        'astryx-markdown-image',
      ]) {
        expect(
          container.querySelector(`.${cls}`),
          `expected a .${cls} element`,
        ).not.toBeNull();
      }
    });

    it('renders the theme target on task lists too', () => {
      const {container} = render(<Markdown>{'- [ ] todo'}</Markdown>);
      expect(container.querySelector('.astryx-markdown-list')).not.toBeNull();
    });

    it('reflects density on block targets as data-density', () => {
      const {rerender} = render(<Markdown>{'Hello world'}</Markdown>);
      // Default density is reflected so themes can tune spacing per density.
      expect(screen.getByText('Hello world')).toHaveAttribute(
        'data-density',
        'default',
      );
      rerender(<Markdown density="compact">{'Hello world'}</Markdown>);
      expect(screen.getByText('Hello world')).toHaveAttribute(
        'data-density',
        'compact',
      );
    });

    it('reflects the heading level on the heading target as data-level', () => {
      render(<Markdown>{'## Section'}</Markdown>);
      const heading = screen.getByText('Section');
      expect(heading.className).toContain('astryx-markdown-heading');
      expect(heading).toHaveAttribute('data-level', '2');
    });

    it('does not apply the theme target when a custom block component is provided', () => {
      const {container} = render(
        <Markdown
          components={{
            heading: ({children}: {children: ReactNode}) => (
              <h2 data-custom>{children}</h2>
            ),
          }}>
          {'# Custom heading'}
        </Markdown>,
      );
      // Custom components own their own styling — the default target is not
      // imposed on them.
      expect(container.querySelector('.astryx-markdown-heading')).toBeNull();
      expect(container.querySelector('[data-custom]')).not.toBeNull();
    });
  });

  it('renders inline display without block wrappers', () => {
    const {container} = render(
      <Markdown display="inline">{'Use `code` and **bold**'}</Markdown>,
    );

    expect(container.firstElementChild?.tagName).toBe('SPAN');
    expect(screen.queryByRole('document')).not.toBeInTheDocument();
    expect(container.querySelector('p')).toBeNull();
    expect(screen.getByText('code').tagName).toBe('CODE');
    expect(screen.getByText('bold').tagName).toBe('STRONG');
  });

  it('renders links with inline display', () => {
    render(<Markdown display="inline">{'[docs](/docs)'}</Markdown>);

    const link = screen.getByText('docs');
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/docs');
  });

  it('renders bold text', () => {
    render(<Markdown>{'**bold text**'}</Markdown>);
    expect(screen.getByText('bold text').tagName).toBe('STRONG');
  });

  it('renders italic text', () => {
    render(<Markdown>{'*italic text*'}</Markdown>);
    expect(screen.getByText('italic text').tagName).toBe('EM');
  });

  it('renders strikethrough text', () => {
    render(<Markdown>{'~~struck~~'}</Markdown>);
    expect(screen.getByText('struck').tagName).toBe('DEL');
  });

  it('renders inline code as delimiter-free <code> content', () => {
    const {container} = render(<Markdown>{'Use `code` here'}</Markdown>);
    const code = container.querySelector('code');
    expect(code).toBeInTheDocument();
    expect(code).toHaveTextContent('code');
    expect(code?.textContent).toBe('code');
    expect(container.textContent).toBe('Use code here');
  });

  it('renders code blocks with CodeBlock', () => {
    render(<Markdown>{'```js\nconst x = 1;\n```'}</Markdown>);
    // CodeBlock renders in a <pre>
    const pre = document.querySelector('pre');
    expect(pre).toBeInTheDocument();
  });

  it('renders a diff-<lang> fence as a diff over that language, and diff over plaintext', () => {
    const {container, rerender} = render(
      <Markdown>{'```diff-js\n-const x = 1;\n+const x = 2;\n```'}</Markdown>,
    );
    expect(container.querySelector('[data-diff="removed"]')).not.toBeNull();
    expect(container.querySelector('[data-diff="added"]')).not.toBeNull();
    // `const` keeps its js highlighting past the glyph.
    expect(
      container.querySelector('[data-diff="added"] .astryx-token-keyword'),
    ).not.toBeNull();
    rerender(<Markdown>{'```diff\n-old\n+new\n```'}</Markdown>);
    expect(container.querySelectorAll('[data-diff]')).toHaveLength(2);
    expect(container.querySelector('.astryx-token-keyword')).toBeNull();
    rerender(<Markdown>{'```js\n-const x = 1;\n```'}</Markdown>);
    expect(container.querySelector('[data-diff]')).toBeNull();
  });

  it('hands a custom code renderer the leading word as today and nothing new', () => {
    type CodeProps = {code: string; language?: string};
    const seen: CodeProps[] = [];
    const Code = (props: CodeProps) => {
      seen.push(props);
      return <pre data-testid="custom">{props.code}</pre>;
    };
    render(
      <Markdown components={{code: Code}}>
        {
          '```diff-tsx\n-a\n+b\n```\n\n```diff\n-a\n```\n\n```tsx\nconst x = 1;\n```'
        }
      </Markdown>,
    );
    // The leading word characters, as today: a diff-tsx fence is `diff`.
    expect(seen.map(p => p.language)).toEqual(['diff', 'diff', 'tsx']);
    for (const props of seen) {
      expect(Object.keys(props).sort()).toEqual(['code', 'language']);
    }
  });

  it('renders links with correct href', () => {
    render(<Markdown>{'[click](https://example.com)'}</Markdown>);
    const link = screen.getByText('click');
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('https://example.com');
  });

  it('links to the destination, not the destination plus its title', () => {
    render(
      <Markdown>
        {'[notes](https://example.com/notes "Release notes")'}
      </Markdown>,
    );
    expect(screen.getByText('notes').getAttribute('href')).toBe(
      'https://example.com/notes',
    );
  });

  it('shows character references as the characters they name', () => {
    const {container} = render(
      <Markdown>{'Fish &amp; chips &copy; 2026 and `&amp;` in code'}</Markdown>,
    );
    expect(container.textContent).toContain('Fish & chips \u00a9 2026');
    expect(container.querySelector('code')?.textContent).toBe('&amp;');
  });

  it('names an image with decoded alt text', () => {
    render(
      <Markdown>
        {'![Fish &amp; chips \\*fresh\\*](https://example.com/fish.png)'}
      </Markdown>,
    );
    expect(
      screen.getByRole('img', {name: 'Fish & chips *fresh*'}),
    ).toBeInTheDocument();
  });

  it('adds target="_blank" to external links', () => {
    render(<Markdown>{'[ext](https://example.com)'}</Markdown>);
    const link = screen.getByText('ext');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('renders a footer reference-style link as an anchor', () => {
    // The XDS parser previously had no reference-definition support, so this
    // rendered as literal `[the docs][docs]` text with the definition leaking
    // as a paragraph. It now resolves to a real anchor.
    render(
      <Markdown>
        {'See [the docs][docs] here.\n\n[docs]: https://example.com/docs\n'}
      </Markdown>,
    );
    const link = screen.getByText('the docs');
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('https://example.com/docs');
    // The definition line must not leak into the rendered output.
    expect(screen.queryByText(/\[docs\]:/)).toBeNull();
  });

  it('renders a shortcut reference-style link as an anchor', () => {
    render(<Markdown>{'See [the docs].\n\n[the docs]: /docs'}</Markdown>);
    const link = screen.getByText('the docs');
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/docs');
  });

  it('does not add target="_blank" to relative links', () => {
    render(<Markdown>{'[internal](/page)'}</Markdown>);
    const link = screen.getByText('internal');
    expect(link.getAttribute('target')).toBeNull();
  });

  it('calls onLinkClick when link is clicked', () => {
    const handleClick = vi.fn();
    render(
      <Markdown onLinkClick={handleClick}>
        {'[click me](https://example.com)'}
      </Markdown>,
    );
    fireEvent.click(screen.getByText('click me'));
    expect(handleClick).toHaveBeenCalledWith(
      'https://example.com',
      expect.any(Object),
    );
  });

  it('renders blockquotes', () => {
    render(<Markdown>{'> A quote'}</Markdown>);
    const bq = document.querySelector('blockquote');
    expect(bq).toBeInTheDocument();
  });

  it('renders lazy continuations in the owning nested containers', () => {
    const {container} = render(
      <Markdown>{'> 1. > Quoted **text**\ncontinued lazily'}</Markdown>,
    );
    const root = container.querySelector('.astryx-markdown');
    const outerQuote = root?.querySelector('blockquote');
    const nestedQuote = outerQuote?.querySelector('ol blockquote');

    expect(root?.children).toHaveLength(1);
    expect(root?.querySelectorAll('blockquote')).toHaveLength(2);
    expect(root?.querySelectorAll('ol')).toHaveLength(1);
    expect(nestedQuote).toHaveTextContent('Quoted text');
    expect(nestedQuote).toHaveTextContent('continued lazily');
  });

  it('renders unordered lists', () => {
    render(<Markdown>{'- A\n- B\n- C'}</Markdown>);
    const ul = document.querySelector('ul');
    expect(ul).toBeInTheDocument();
    expect(document.querySelectorAll('li')).toHaveLength(3);
  });

  it('renders ordered lists', () => {
    render(<Markdown>{'1. A\n2. B'}</Markdown>);
    const ol = document.querySelector('ol');
    expect(ol).toBeInTheDocument();
  });

  it('renders ordered list items as direct children of ol (no span wrapper)', () => {
    render(<Markdown>{'1. First\n2. Second\n3. Third'}</Markdown>);
    const ol = document.querySelector('ol')!;
    const directChildren = Array.from(ol.children);
    // All direct children should be <li> elements — no <span> wrappers
    expect(directChildren.every(c => c.tagName === 'LI')).toBe(true);
    expect(directChildren).toHaveLength(3);
  });

  it('applies counter-increment class to ordered list items', () => {
    render(<Markdown>{'1. First\n2. Second\n3. Third'}</Markdown>);
    const ol = document.querySelector('ol')!;
    const lis = ol.querySelectorAll('li');
    // Each li should have the counter-increment class
    lis.forEach(li => {
      expect(li.className).toContain('withCounter');
    });
  });

  it('applies counter-reset class to ordered list container', () => {
    render(<Markdown>{'1. First\n2. Second'}</Markdown>);
    const ol = document.querySelector('ol')!;
    expect(ol.className).toContain('withCounter');
  });

  it('joins blank-line-separated 1./1./1. into a single ordered list', () => {
    // Regression: LLM-style loose ordered lists (1.\n\n1.\n\n1.) used to
    // render as three separate <ol>s each restarting at 1.
    render(<Markdown>{'1. apple\n\n1. banana\n\n1. cherry'}</Markdown>);
    const ols = document.querySelectorAll('ol');
    expect(ols).toHaveLength(1);
    expect(ols[0].querySelectorAll('li')).toHaveLength(3);
  });

  it('forwards a non-default start onto the <ol> element', () => {
    render(<Markdown>{'5. five\n6. six\n7. seven'}</Markdown>);
    const ol = document.querySelector('ol')!;
    expect(ol.getAttribute('start')).toBe('5');
  });

  it('renders task lists with checkboxes', () => {
    render(<Markdown>{'- [x] Done\n- [ ] Todo'}</Markdown>);
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes).toHaveLength(2);
    expect((checkboxes[0] as HTMLInputElement).checked).toBe(true);
    expect((checkboxes[1] as HTMLInputElement).checked).toBe(false);
    // Preserve the released flat pure-task grouping/naming path.
    expect(document.querySelector('.astryx-checkbox-list')).not.toBeNull();
    expect(screen.getByRole('group')).toHaveAttribute('aria-labelledby');
  });

  it('keeps nested pure-task rows on the static marker path with source lines', () => {
    render(
      <Markdown plugins={[markdownSourceLinesPlugin]}>
        {
          '- [ ] Outer task\n  - [x] Inner task\n\n    388. Counter\n    389. Sibling'
        }
      </Markdown>,
    );
    expect(document.querySelector('.astryx-checkbox-list')).toBeNull();
    const checkboxes = screen.getAllByRole<HTMLInputElement>('checkbox');
    expect(checkboxes.map(input => input.checked)).toEqual([false, true]);
    for (const input of checkboxes) {
      expect(input).toHaveAttribute('aria-readonly', 'true');
    }
    expect(
      Array.from(document.querySelectorAll('li'), item =>
        item.getAttribute('data-source-line'),
      ),
    ).toEqual(['1', '2', '4', '5']);
  });

  it('uses the static task marker path for lists nested through a blockquote', () => {
    render(
      <Markdown>
        {'- [ ] Outer task\n\n  > 388. Quoted counter\n  > 389. Quoted sibling'}
      </Markdown>,
    );
    expect(document.querySelector('.astryx-checkbox-list')).toBeNull();
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.getByRole('checkbox')).toHaveAttribute(
      'aria-readonly',
      'true',
    );
    expect(document.querySelector('blockquote ol')).toHaveAttribute(
      'start',
      '388',
    );
  });

  it('keeps each task item checked or open in a list that mixes task and plain items (FR23)', () => {
    render(
      <Markdown>
        {'- [x] Done **task**\n- Plain item\n- [ ] Open task\n'}
      </Markdown>,
    );
    // One list, in document order.
    expect(document.querySelectorAll('ul, ol')).toHaveLength(1);
    const items = [...document.querySelectorAll('li')];
    expect(items.map(item => item.textContent)).toEqual([
      expect.stringContaining('Done task'),
      'Plain item',
      expect.stringContaining('Open task'),
    ]);
    const checkbox = (item: Element | undefined) =>
      item?.querySelector<HTMLInputElement>('input[type="checkbox"]') ?? null;
    // Each task item shows its own read-only checkbox, named by its text.
    expect(checkbox(items[0])?.checked).toBe(true);
    expect(checkbox(items[2])?.checked).toBe(false);
    expect(screen.getByRole('checkbox', {name: 'Done task'})).toBe(
      checkbox(items[0]),
    );
    expect(screen.getByRole('checkbox', {name: 'Open task'})).toBe(
      checkbox(items[2]),
    );
    for (const input of [checkbox(items[0]), checkbox(items[2])]) {
      expect(input?.getAttribute('aria-readonly')).toBe('true');
    }
    // A plain item keeps its marker and has no checkbox.
    expect(checkbox(items[1])).toBeNull();
  });

  it('keeps task state in mixed ordered and nested lists', () => {
    render(
      <Markdown>
        {
          '1. [ ] First step\n2. Second step\n   - [x] Nested done\n   - Nested plain\n'
        }
      </Markdown>,
    );
    expect(
      document.querySelector('ol')?.querySelectorAll(':scope > li'),
    ).toHaveLength(2);
    expect(
      screen.getByRole<HTMLInputElement>('checkbox', {name: 'First step'})
        .checked,
    ).toBe(false);
    expect(
      screen.getByRole<HTMLInputElement>('checkbox', {name: 'Nested done'})
        .checked,
    ).toBe(true);
    expect(document.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
  });

  it('renders tables', () => {
    render(<Markdown>{'| A | B |\n| --- | --- |\n| 1 | 2 |'}</Markdown>);
    expect(document.querySelector('table')).toBeInTheDocument();
    expect(document.querySelectorAll('th')).toHaveLength(2);
    expect(document.querySelectorAll('td')).toHaveLength(2);
  });

  it('renders escaped table pipes without exposing the escape in code spans', () => {
    render(
      <Markdown>
        {
          '| Concept | TypeScript |\n| --- | --- |\n| Null safety | `T \\| null` |'
        }
      </Markdown>,
    );

    const cells = document.querySelectorAll('tbody td');
    expect(Array.from(cells).map(cell => cell.textContent)).toEqual([
      'Null safety',
      'T | null',
    ]);
    expect(cells[1].querySelector('code')).toHaveTextContent('T | null');
  });

  it('delegates table scrolling and focus to the Table-owned viewport', () => {
    const {container} = render(
      <Markdown>{'| A | B |\n| --- | --- |\n| 1 | 2 |'}</Markdown>,
    );
    const table = container.querySelector('table');
    const markdownBlock = container.querySelector('.astryx-markdown-table');
    const groups = container.querySelectorAll('[role="group"]');

    expect(table).toBeInTheDocument();
    // Exactly one scroll region: Table's own, which also owns the name and
    // (when it actually overflows) the tab stop. Markdown's block carries
    // spacing and sizing only.
    expect(groups).toHaveLength(1);
    expect(groups[0]).toContainElement(table);
    expect(groups[0]).toHaveAttribute('aria-label', 'Table');
    expect(markdownBlock).not.toHaveAttribute('role');
    expect(markdownBlock).not.toHaveAttribute('tabindex');
  });

  it('uses spacing-2 on every Markdown table cell edge', () => {
    const {container} = render(
      <Markdown>{'| A | B |\n| --- | --- |\n| 1 | 2 |'}</Markdown>,
    );
    const spacingClasses = (
      stylex.props(tableCellSpacingProbe.cell).className ?? ''
    )
      .split(' ')
      .filter(className => className !== '' && !className.includes('__'));
    const cells = container.querySelectorAll('th, td');

    expect(spacingClasses.length).toBeGreaterThan(0);
    expect(cells).toHaveLength(4);
    for (const cell of cells) {
      for (const className of spacingClasses) {
        expect(cell).toHaveClass(className);
      }
    }
  });

  it('floors each table column from its own content, in ch', () => {
    // The floor algorithm: max(4, ceil(longest cell / 2), min(header, 20)),
    // capped at 24, expressed in `ch` so it follows the reader's font size.
    // That the floor then survives cell padding and actually widens the
    // column is geometry, and is proved in MarkdownTable.a11y.chromium.spec.ts.
    const long = 'x'.repeat(120);
    render(
      <Markdown>
        {`| Key | Meaning | Note |\n| --- | --- | --- |\n| id | Stable identifier never reused | ${long} |`}
      </Markdown>,
    );
    const floors = Array.from(document.querySelectorAll('th')).map(th =>
      th.getAttribute('style'),
    );
    expect(floors[0]).toMatch(/\b4ch\b/); // "Key" / "id" — short, min floor
    expect(floors[1]).toMatch(/\b15ch\b/); // 30 chars → ceil(30 / 2)
    expect(floors[2]).toMatch(/\b24ch\b/); // 120 chars → capped
    // No fixed pixel bucket survives anywhere in the column floors.
    expect(floors.join(' ')).not.toMatch(/\d+px/);
  });

  it('floors a short-bodied column from its header label, up to the cap', () => {
    render(
      <Markdown>
        {
          '| Component name | Accessibility status and remediation owner | X |\n| --- | --- | --- |\n| Button | Pass | 1 |'
        }
      </Markdown>,
    );
    const ths = Array.from(document.querySelectorAll('th'));
    // 14-char label: the header floor (14ch) beats the body floor (3ch).
    expect(ths[0].getAttribute('style')).toMatch(/\b14ch\b/);
    // 42-char label: the header floor caps at 20ch, so the body floor
    // (ceil(42 / 2) = 21ch) is what the column keeps.
    expect(ths[1].getAttribute('style')).toMatch(/\b21ch\b/);
  });

  it('floors a header-only table from its labels alone', () => {
    // No body rows: the body floor is computed over nothing, so the header
    // label has to carry the column by itself rather than collapsing to the
    // minimum (or throwing on an absent row).
    render(<Markdown>{'| Status | Owner |\n| --- | --- |'}</Markdown>);
    const ths = Array.from(document.querySelectorAll('th'));
    expect(ths.map(th => th.textContent)).toEqual(['Status', 'Owner']);
    expect(document.querySelectorAll('tbody tr')).toHaveLength(0);
    expect(ths[0].getAttribute('style')).toMatch(/\b6ch\b/);
    expect(ths[1].getAttribute('style')).toMatch(/\b5ch\b/);
  });

  it('floors a column of empty cells at the minimum', () => {
    render(
      <Markdown>
        {'| A | B | C |\n| --- | --- | --- |\n|  | middle only |  |'}
      </Markdown>,
    );
    const ths = Array.from(document.querySelectorAll('th'));
    // Empty body cells contribute nothing; a one-character header still
    // leaves the column at the 4ch minimum rather than at zero.
    expect(ths[0].getAttribute('style')).toMatch(/\b4ch\b/);
    expect(ths[2].getAttribute('style')).toMatch(/\b4ch\b/);
    // 11 chars in the middle column → ceil(11 / 2) = 6ch.
    expect(ths[1].getAttribute('style')).toMatch(/\b6ch\b/);
  });

  it('keeps inline code inside a table cell on the default Code part', () => {
    render(
      <Markdown>
        {'| Status |\n| --- |\n| `needs_revision_before_landing_v2` |'}
      </Markdown>,
    );
    const code = document.querySelector('tbody td code');
    expect(code).toHaveTextContent('needs_revision_before_landing_v2');
  });

  it('lets a supplied inlineCode renderer own code inside table cells', () => {
    const components: Partial<MarkdownComponents> = {
      inlineCode: ({children}) => <kbd data-custom>{children}</kbd>,
    };
    render(
      <Markdown components={components}>
        {'| Status |\n| --- |\n| `x` |'}
      </Markdown>,
    );
    expect(
      document.querySelector('tbody td kbd[data-custom]'),
    ).toHaveTextContent('x');
    expect(document.querySelector('tbody td code')).toBeNull();
  });

  it('renders horizontal rules', () => {
    render(<Markdown>{'---'}</Markdown>);
    expect(document.querySelector('hr')).toBeInTheDocument();
  });

  it('renders images', () => {
    render(<Markdown>{'![alt text](image.png)'}</Markdown>);
    const img = document.querySelector('img');
    expect(img).toBeInTheDocument();
    expect(img!.getAttribute('alt')).toBe('alt text');
    expect(img!.getAttribute('src')).toBe('image.png');
  });

  it('uses the components.image override for a standalone (block) image', () => {
    // A standalone image line parses as a block image; its render path must
    // honor components.image just like the inline image path does.
    render(
      <Markdown
        components={{
          image: ({src, alt}) => (
            <span data-testid="custom-image" data-src={src}>
              {alt}
            </span>
          ),
        }}>
        {'![alt text](image.png)'}
      </Markdown>,
    );
    expect(document.querySelector('img')).not.toBeInTheDocument();
    const custom = screen.getByTestId('custom-image');
    expect(custom).toHaveTextContent('alt text');
    expect(custom.getAttribute('data-src')).toBe('image.png');
  });

  it('shifts heading levels with headingLevelStart', () => {
    render(<Markdown headingLevelStart={3}>{'# Heading 1'}</Markdown>);
    expect(screen.getByText('Heading 1').tagName).toBe('H3');
  });

  it('shows streaming cursor when isStreaming is true', () => {
    const {container} = render(<Markdown isStreaming>{'Hello'}</Markdown>);
    // Streaming mode parses incrementally but no cursor element
    expect(container.querySelector('[role="document"]')).toBeInTheDocument();
  });

  it('hides cursor when not streaming', () => {
    const {container} = render(<Markdown>{'Hello'}</Markdown>);
    const cursor = container.querySelector('span[aria-hidden]');
    expect(cursor).not.toBeInTheDocument();
  });

  // A reader watching a reply arrive sees the DOM, not the parsed nodes.
  // A `\|` is literal text, so the line must stay legible as it streams;
  // the parser once classified it as an unfinished table header and held
  // the whole line back, blanking the message.
  describe('streamed text containing an escaped pipe', () => {
    // Reduced motion makes the reveal synchronous, so each render shows
    // exactly the prefix under test rather than a rAF-driven fraction.
    beforeEach(() => {
      stubMatchMedia({reduceMotion: true});
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    /** The text of each rendered block, in document order. */
    function blockTexts(container: HTMLElement): string[] {
      const doc = container.querySelector('[role="document"]')!;
      return Array.from(doc.children).map(block =>
        (block.textContent ?? '').replace(/\s+/g, ' ').trim(),
      );
    }

    it('shows every prefix of the line, escaped pipe rendered literally', () => {
      const text = 'Costs 5 \\| 10 per unit';
      const {container, rerender} = render(
        <Markdown isStreaming>{text.slice(0, 1)}</Markdown>,
      );

      for (let length = 1; length <= text.length; length++) {
        const prefix = text.slice(0, length);
        rerender(<Markdown isStreaming>{prefix}</Markdown>);

        // Every `\|` reads as one literal pipe, and no backslash survives.
        expect(blockTexts(container)).toEqual([
          prefix.replace(/\\\|/g, '|').trim(),
        ]);
      }
    });

    it('shows every prefix below settled content, both kept on screen', () => {
      const settled = 'Intro\n\n';
      const text = `${settled}Costs 5 \\| 10 per unit`;
      const {container, rerender} = render(
        <Markdown isStreaming>{settled}</Markdown>,
      );

      for (let length = settled.length + 1; length <= text.length; length++) {
        const prefix = text.slice(0, length);
        rerender(<Markdown isStreaming>{prefix}</Markdown>);

        const tail = text.slice(settled.length, length).replace(/\\\|/g, '|');
        // The settled paragraph stays on screen and the tail is legible.
        expect(blockTexts(container)).toEqual(['Intro', tail.trim()]);
      }
    });

    it('renders the finished line as one paragraph with the literal pipe', () => {
      const {container} = render(
        <Markdown isStreaming>{'Costs 5 \\| 10 per unit'}</Markdown>,
      );

      const paragraphs = container.querySelectorAll('[role="paragraph"]');
      expect(paragraphs).toHaveLength(1);
      expect(paragraphs[0].textContent).toBe('Costs 5 | 10 per unit');
      // Prose, not a table: no cell was ever split out of it.
      expect(container.querySelector('table')).toBeNull();
    });

    it('still renders a real streamed table containing an escaped pipe', () => {
      const {container} = render(
        <Markdown isStreaming>
          {'| Col1 | Col2 |\n| --- | --- |\n| a \\| b | c |'}
        </Markdown>,
      );

      const cells = container.querySelectorAll('tbody td');
      expect(Array.from(cells).map(cell => cell.textContent)).toEqual([
        'a | b',
        'c',
      ]);
    });
  });

  it('applies compact density', () => {
    const {container} = render(
      <Markdown density="compact">{'Hello'}</Markdown>,
    );
    expect(container.firstElementChild).toHaveAttribute(
      'data-density',
      'compact',
    );
  });

  it('supports data-testid', () => {
    render(<Markdown data-testid="md">{'Hello'}</Markdown>);
    expect(screen.getByTestId('md')).toBeInTheDocument();
  });

  it('forwards ref', () => {
    const ref = {current: null as HTMLDivElement | null};
    render(<Markdown ref={ref}>{'Hello'}</Markdown>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('sanitizes javascript: URLs in links', () => {
    const {container} = render(
      <Markdown>{'[click](javascript:alert(1))'}</Markdown>,
    );
    const link = container.querySelector('a');
    expect(link).toBeNull();
    expect(container.textContent).toContain('click');
  });

  it('sanitizes data: URLs in images', () => {
    const {container} = render(
      <Markdown>{'![xss](data:text/html,<script>alert(1)</script>)'}</Markdown>,
    );
    const img = container.querySelector('img');
    expect(img).toBeNull();
  });

  it('allows safe URLs', () => {
    const {container} = render(
      <Markdown>
        {'[safe](https://example.com) and [relative](/page)'}
      </Markdown>,
    );
    const links = container.querySelectorAll('a');
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute('href')).toBe('https://example.com');
    expect(links[1].getAttribute('href')).toBe('/page');
  });

  describe('link destinations follow the shared navigation rule', () => {
    // The same matrix Core's link plumbing and imperative navigation apply
    // (utils/safeUrl.ts): only executable document schemes are blocked.
    const blocked = [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'vbscript:MsgBox(1)',
      'data:text/html,<script>alert(1)</script>',
      'java\nscript:alert(1)',
    ];
    const accepted = [
      'https://example.com',
      '/page',
      '#section',
      '//example.com/x',
      'mailto:a@example.com',
      'tel:+15555550100',
      'data:image/png;base64,iVBORw0KGgo=',
    ];

    it.each(blocked)('renders %s as text, not a link', destination => {
      const {container} = render(
        <Markdown>{`[click](${destination})`}</Markdown>,
      );
      expect(container.querySelector('a')).toBeNull();
      expect(container.textContent).toContain('click');
    });

    it.each(accepted)('renders %s as a link', destination => {
      const {container} = render(
        <Markdown>{`[click](${destination})`}</Markdown>,
      );
      const link = container.querySelector('a');
      expect(link).not.toBeNull();
      expect(link?.getAttribute('href')).toBe(destination);
    });

    it('a data:image link is navigation and is accepted, while a data:image image stays rejected by the resource policy', () => {
      const {container} = render(
        <Markdown>
          {
            '[view](data:image/png;base64,iVBORw0KGgo=)\n\n![pic](data:image/png;base64,iVBORw0KGgo=)'
          }
        </Markdown>,
      );
      expect(container.querySelector('a')?.getAttribute('href')).toBe(
        'data:image/png;base64,iVBORw0KGgo=',
      );
      expect(container.querySelector('img')).toBeNull();
    });
  });

  it('preserves dollar-delimited text when no math renderer is supplied', () => {
    const {container} = render(
      <Markdown>{'Total $5 and formula $x_1 + *y*$.'}</Markdown>,
    );
    expect(container.textContent).toBe('Total $5 and formula $x_1 + y$.');
    expect(container.querySelector('em')).toHaveTextContent('y');
    expect(container.querySelector('[role="math"]')).toBeNull();
  });

  it('passes inline and display expressions to the custom math renderer', () => {
    type MathRendererProps = ComponentProps<
      NonNullable<MarkdownComponents['math']>
    >;
    function MathRenderer({value, display}: MathRendererProps) {
      const Tag = display === 'block' ? 'div' : 'span';
      return (
        <Tag
          role="math"
          aria-label={`Formula: ${value}`}
          data-testid={`${display}-math`}>
          {value}
        </Tag>
      );
    }

    render(
      <Markdown components={{math: MathRenderer}}>
        {'Inline $x_1 + *y*$ here.\n\n$$\n\\sum_i x_i\n$$'}
      </Markdown>,
    );

    expect(screen.getByTestId('inline-math')).toHaveTextContent('x_1 + *y*');
    expect(screen.getByTestId('block-math')).toHaveTextContent('\\sum_i x_i');
    expect(screen.getAllByRole('math')).toHaveLength(2);
  });

  it('exports the math renderer and parser option types', () => {
    type MathRendererProps = ComponentProps<
      NonNullable<MarkdownComponents['math']>
    >;
    expectTypeOf<MathRendererProps>().toEqualTypeOf<{
      value: string;
      display: 'inline' | 'block';
      sourceLines?: MarkdownSourceLines;
    }>();
    expectTypeOf<ParseOptions>().toMatchTypeOf<{math?: boolean}>();
  });
});

// ---------------------------------------------------------------------------
// inlinePlugins
// ---------------------------------------------------------------------------

// Helper: creates a plugin that turns JIRA-style ticket refs (PROJ-123) into links
function createTicketPlugin(): MarkdownInlinePlugin {
  return {
    pattern: /\b([A-Z][A-Z0-9]+-\d+)\b/g,
    render: (match, key) => (
      <a
        key={key}
        href={`https://issues.example.com/browse/${match[1]}`}
        data-testid="ticket-link">
        {match[0]}
      </a>
    ),
  };
}

// Helper: creates a plugin that turns X-numbers (X12345) into links
function createXRefPlugin(): MarkdownInlinePlugin {
  return {
    pattern: /\bX(\d+)\b/g,
    render: (match, key) => (
      <a
        key={key}
        href={`https://xref.example.com/${match[1]}`}
        data-testid="xref-link">
        {match[0]}
      </a>
    ),
  };
}

describe('inlinePlugins', () => {
  it('transforms text patterns into custom elements', () => {
    const ticketPlugin = createTicketPlugin();
    const {container} = render(
      <Markdown inlinePlugins={[ticketPlugin]}>
        {'Check out PROJ-123 for details'}
      </Markdown>,
    );
    const link = container.querySelector('[data-testid="ticket-link"]');
    expect(link).toBeInTheDocument();
    expect(link!.getAttribute('href')).toBe(
      'https://issues.example.com/browse/PROJ-123',
    );
    expect(link!.textContent).toBe('PROJ-123');
  });

  it('autolinks generic prefixed-number entities without rewriting source', () => {
    const entityPlugin: MarkdownInlinePlugin = {
      pattern: /\b([A-Z][A-Z0-9]+-\d+)\b/g,
      render: (match, key) => (
        <a key={key} href={`/entities/${match[1]}`} data-testid="entity-link">
          {match[0]}
        </a>
      ),
    };
    const {container} = render(
      <Markdown inlinePlugins={[entityPlugin]}>
        {'See DOC-2048, but keep `DOC-9999` literal.'}
      </Markdown>,
    );
    const link = screen.getByTestId('entity-link');
    expect(link).toHaveAttribute('href', '/entities/DOC-2048');
    expect(link).toHaveTextContent('DOC-2048');
    expect(container.querySelector('code')).toHaveTextContent('DOC-9999');
    expect(
      container.querySelectorAll('[data-testid="entity-link"]'),
    ).toHaveLength(1);
  });

  it('keeps math opaque to entity plugins while transforming surrounding prose', () => {
    const entityPlugin: MarkdownInlinePlugin = {
      pattern: /\b(DOC-\d+)\b/g,
      render: (match, key) => (
        <a key={key} href={`/entities/${match[1]}`} data-testid="entity-link">
          {match[0]}
        </a>
      ),
    };
    const MathRenderer: NonNullable<MarkdownComponents['math']> = ({value}) => (
      <span role="math">{value}</span>
    );
    render(
      <Markdown
        components={{math: MathRenderer}}
        inlinePlugins={[entityPlugin]}>
        {'DOC-1 and $DOC-2 + x$ and `DOC-3`'}
      </Markdown>,
    );
    expect(screen.getAllByTestId('entity-link')).toHaveLength(1);
    expect(screen.getByTestId('entity-link')).toHaveTextContent('DOC-1');
    expect(screen.getByRole('math')).toHaveTextContent('DOC-2 + x');
    expect(screen.getByText('DOC-3').tagName).toBe('CODE');
  });

  it('supports multiple plugins', () => {
    const {container} = render(
      <Markdown inlinePlugins={[createTicketPlugin(), createXRefPlugin()]}>
        {'See PROJ-123 and X99999'}
      </Markdown>,
    );
    const ticketLink = container.querySelector('[data-testid="ticket-link"]');
    const xrefLink = container.querySelector('[data-testid="xref-link"]');
    expect(ticketLink).toBeInTheDocument();
    expect(ticketLink!.getAttribute('href')).toBe(
      'https://issues.example.com/browse/PROJ-123',
    );
    expect(xrefLink).toBeInTheDocument();
    expect(xrefLink!.getAttribute('href')).toBe(
      'https://xref.example.com/99999',
    );
  });

  it('does not transform patterns inside fenced code blocks', () => {
    const {container} = render(
      <Markdown inlinePlugins={[createTicketPlugin()]}>
        {'```\nPROJ-123\n```'}
      </Markdown>,
    );
    const link = container.querySelector('[data-testid="ticket-link"]');
    expect(link).toBeNull();
    expect(container.textContent).toContain('PROJ-123');
  });

  it('does not transform patterns inside inline code', () => {
    const {container} = render(
      <Markdown inlinePlugins={[createTicketPlugin()]}>
        {'Use `PROJ-123` in your code'}
      </Markdown>,
    );
    const link = container.querySelector('[data-testid="ticket-link"]');
    expect(link).toBeNull();
    expect(container.textContent).toContain('PROJ-123');
  });

  it('works alongside regular markdown links', () => {
    const {container} = render(
      <Markdown inlinePlugins={[createTicketPlugin()]}>
        {'Visit [example](https://example.com) and check PROJ-123'}
      </Markdown>,
    );
    const ticketLink = container.querySelector('[data-testid="ticket-link"]');
    expect(ticketLink).toBeInTheDocument();
    const mdLink = container.querySelector('a[href="https://example.com"]');
    expect(mdLink).toBeInTheDocument();
    expect(mdLink!.textContent).toBe('example');
  });

  it('first plugin wins for overlapping patterns', () => {
    const narrowPlugin: MarkdownInlinePlugin = {
      pattern: /PROJ-\d+/g,
      render: (match, key) => (
        <span key={key} data-testid="narrow-match">
          {match[0]}
        </span>
      ),
    };
    const broadPlugin: MarkdownInlinePlugin = {
      pattern: /[A-Z]+-\d+/g,
      render: (match, key) => (
        <span key={key} data-testid="broad-match">
          {match[0]}
        </span>
      ),
    };
    const {container} = render(
      <Markdown inlinePlugins={[narrowPlugin, broadPlugin]}>
        {'Check PROJ-123'}
      </Markdown>,
    );
    expect(
      container.querySelector('[data-testid="narrow-match"]'),
    ).toBeInTheDocument();
    expect(container.querySelector('[data-testid="broad-match"]')).toBeNull();
  });

  it('skips matches when getEndIndex returns false', () => {
    const plugin: MarkdownInlinePlugin = {
      pattern: /\b([A-Z]+-\d+)\b/g,
      getEndIndex: () => false,
      render: (match, key) => (
        <a key={key} data-testid="ticket-link">
          {match[0]}
        </a>
      ),
    };
    const {container} = render(
      <Markdown inlinePlugins={[plugin]}>
        {'Check PROJ-123 for details'}
      </Markdown>,
    );
    const link = container.querySelector('[data-testid="ticket-link"]');
    expect(link).toBeNull();
    expect(container.textContent).toContain('PROJ-123');
  });

  it('uses getEndIndex to adjust match boundaries', () => {
    const plugin: MarkdownInlinePlugin = {
      pattern: /TAG:/g,
      getEndIndex: (text, match) => {
        const afterMatch = text.slice(match.index! + match[0].length);
        const wordMatch = afterMatch.match(/^(\S+)/);
        if (wordMatch) {
          return match.index! + match[0].length + wordMatch[1].length;
        }
        return match.index! + match[0].length;
      },
      render: (match, key) => {
        return (
          <span key={key} data-testid="tag-match">
            {match[0]}
          </span>
        );
      },
    };
    const {container} = render(
      <Markdown inlinePlugins={[plugin]}>{'See TAG:important here'}</Markdown>,
    );
    const tag = container.querySelector('[data-testid="tag-match"]');
    expect(tag).toBeInTheDocument();
    expect(container.textContent).toContain('here');
  });

  it('renders identically when no inlinePlugins are provided', () => {
    const withPlugins = render(
      <Markdown inlinePlugins={[]}>{'Hello **world** and `code`'}</Markdown>,
    );
    const withoutPlugins = render(
      <Markdown>{'Hello **world** and `code`'}</Markdown>,
    );
    expect(withPlugins.container.textContent).toBe(
      withoutPlugins.container.textContent,
    );
  });

  it('transforms patterns inside bold/italic text', () => {
    const {container} = render(
      <Markdown inlinePlugins={[createTicketPlugin()]}>
        {'**PROJ-123**'}
      </Markdown>,
    );
    const link = container.querySelector('[data-testid="ticket-link"]');
    expect(link).toBeInTheDocument();
    expect(link!.textContent).toBe('PROJ-123');
    expect(link!.closest('strong')).toBeInTheDocument();
  });

  describe('autolink prop', () => {
    it('renders bare URLs as plain text by default', () => {
      const {container} = render(
        <Markdown>{'see https://example.com here'}</Markdown>,
      );
      expect(container.querySelector('a')).toBeNull();
      expect(container.textContent).toContain('https://example.com');
    });

    it('renders bare https URLs as links when autolink="gfm"', () => {
      const {container} = render(
        <Markdown autolink="gfm">{'see https://example.com here'}</Markdown>,
      );
      const link = container.querySelector('a');
      expect(link).not.toBeNull();
      expect(link!.getAttribute('href')).toBe('https://example.com');
      expect(link!.textContent).toBe('https://example.com');
    });

    it('renders bare www URLs with http:// prefix', () => {
      const {container} = render(
        <Markdown autolink="gfm">{'go www.example.com'}</Markdown>,
      );
      const link = container.querySelector('a');
      expect(link).not.toBeNull();
      expect(link!.getAttribute('href')).toBe('http://www.example.com');
      expect(link!.textContent).toBe('www.example.com');
    });

    it('renders bare emails with mailto: href', () => {
      const {container} = render(
        <Markdown autolink="gfm">{'ping user@example.com please'}</Markdown>,
      );
      const link = container.querySelector('a');
      expect(link).not.toBeNull();
      expect(link!.getAttribute('href')).toBe('mailto:user@example.com');
      expect(link!.textContent).toBe('user@example.com');
    });

    it('does not autolink URLs inside code spans', () => {
      const {container} = render(
        <Markdown autolink="gfm">{'try `https://example.com` here'}</Markdown>,
      );
      expect(container.querySelector('a')).toBeNull();
      expect(container.querySelector('code')).not.toBeNull();
    });

    it('does not autolink URLs inside code blocks', () => {
      const {container} = render(
        <Markdown autolink="gfm">{'```\nhttps://example.com\n```'}</Markdown>,
      );
      expect(container.querySelector('a')).toBeNull();
      expect(container.querySelector('pre')).not.toBeNull();
    });
  });
});
