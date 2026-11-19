// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Markdown.renderBoundary.test.tsx
 * @input Uses vitest, @testing-library/react, and Markdown with its real parser
 * @output Tests that unsafe link and image URLs never reach the DOM or a
 *   custom renderer through `<Markdown>`
 * @position Testing; the parser owns Markdown's URL rule and the renderer
 *   trusts parsed nodes, so these tests go through the only path to the
 *   renderer: Markdown source parsed by `<Markdown>` itself
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {cleanup, render} from '@testing-library/react';
import {Markdown} from './Markdown';

afterEach(() => {
  cleanup();
});

const UNSAFE = [
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  'vbscript:MsgBox(1)',
  'data:image/png;base64,iVBORw0KGgo=',
  'data:image/svg+xml,%3Csvg%3E%3C/svg%3E',
  'data:text/html,hello',
  'data:text/plain,hello',
  'DATA:image/png;base64,iVBORw0KGgo=',
  ' data:image/png;base64,iVBORw0KGgo=',
  'da\tta:image/png;base64,iVBORw0KGgo=',
  'java\u0000script:alert(1)',
  '&#100;ata:image/png;base64,iVBORw0KGgo=',
  'jav&#x61;script:alert(1)',
];

const FORMS: ReadonlyArray<[string, (url: string) => string]> = [
  ['inline link', url => `[go](<${url}>)`],
  ['reference link', url => `[go][r]\n\n[r]: <${url}>\n`],
  ['inline image', url => `see ![go](<${url}>) here`],
  ['reference image', url => `see ![go][r] here\n\n[r]: <${url}>\n`],
  ['standalone image', url => `![go](<${url}>)\n`],
];

const ACCEPTED = [
  'https://example.com/page',
  '/page',
  '#section',
  'mailto:a@example.com',
];

describe('Markdown render boundary — URLs come only from the parser', () => {
  describe.each(FORMS)('%s', (_form, markdownFor) => {
    it.each(UNSAFE)('renders no link or image for %j', url => {
      const link = vi.fn(() => null);
      const image = vi.fn(() => null);
      const {container} = render(
        <Markdown components={{link, image}}>{markdownFor(url)}</Markdown>,
      );
      expect(container.querySelector('a[href], img[src]')).toBeNull();
      expect(link).not.toHaveBeenCalled();
      expect(image).not.toHaveBeenCalled();
      expect(container.textContent).toContain('go');
    });
  });

  it.each(ACCEPTED)('renders the accepted destination %s as a link', href => {
    const {container} = render(<Markdown>{`[go](${href})`}</Markdown>);
    expect(container.querySelector('a')?.getAttribute('href')).toBe(href);
  });

  it('renders a padded destination as the normalized link', () => {
    const onLinkClick = vi.fn(() => false as const);
    const {container} = render(
      <Markdown onLinkClick={onLinkClick}>
        {'[go](< https://example.com/x >)'}
      </Markdown>,
    );
    const link = container.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://example.com/x');
    expect(link?.getAttribute('target')).toBe('_blank');
    link?.click();
    expect(onLinkClick).toHaveBeenCalledWith(
      'https://example.com/x',
      expect.anything(),
    );
  });

  it('renders an accepted image source as an image', () => {
    const {container} = render(
      <Markdown>{'![go](https://example.com/a.png)'}</Markdown>,
    );
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'https://example.com/a.png',
    );
  });

  it.each(['[go]()', '[go](< >)', '[go](&#9;)', '[go](<&#10;>)'])(
    'renders the empty or blank destination in %j as text',
    markdown => {
      const {container} = render(<Markdown>{markdown}</Markdown>);
      expect(container.querySelector('a')).toBeNull();
      expect(container.textContent).toContain('go');
    },
  );

  it.each(['![alt]()', '![alt](< >)', '![alt](&#9;)', 'see ![alt](< >) here'])(
    'renders the empty or blank image source in %j as its fallback',
    markdown => {
      const {container} = render(<Markdown>{markdown}</Markdown>);
      expect(container.querySelector('img')).toBeNull();
      expect(container.textContent).toContain('[alt]');
    },
  );
});
