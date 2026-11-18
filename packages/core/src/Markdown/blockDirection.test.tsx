// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {render} from '@testing-library/react';
import {Markdown} from './Markdown';
import {firstStrongDirection} from '../i18n/firstStrongDirection';
import {InternationalizationProvider} from '../i18n/InternationalizationProvider';

function renderIn(dir: 'ltr' | 'rtl', markdown: string) {
  return render(
    <div dir={dir}>
      <Markdown>{markdown}</Markdown>
    </div>,
  );
}

function renderInProvider(dir: 'ltr' | 'rtl', markdown: string) {
  return render(
    <InternationalizationProvider locale="en" dir={dir}>
      <Markdown>{markdown}</Markdown>
    </InternationalizationProvider>,
  );
}

function blockContaining(
  container: HTMLElement,
  selector: string,
  text: string,
) {
  const match = Array.from(
    container.querySelectorAll<HTMLElement>(selector),
  ).find(element => element.textContent?.includes(text));
  if (match == null) {
    throw new Error(`No ${selector} contains "${text}"`);
  }
  return match;
}

describe('firstStrongDirection', () => {
  it('reads the first strongly directional character', () => {
    expect(firstStrongDirection('Hello שלום')).toBe('ltr');
    expect(firstStrongDirection('שלום Hello')).toBe('rtl');
    expect(firstStrongDirection('مرحبا')).toBe('rtl');
  });

  it('skips digits, punctuation, symbols and combining marks', () => {
    expect(firstStrongDirection('123 — מזל טוב')).toBe('rtl');
    expect(firstStrongDirection('🎉 مرحبا')).toBe('rtl');
    expect(firstStrongDirection('۱۴۰۳ Annual report')).toBe('ltr');
    expect(firstStrongDirection('\u05B0Annual report')).toBe('ltr');
  });

  it('is null for text with no strongly directional character', () => {
    expect(firstStrongDirection('')).toBeNull();
    expect(firstStrongDirection('42 — 7%')).toBeNull();
  });
});

describe('Markdown block direction', () => {
  it('lays a Hebrew paragraph out right to left in a left-to-right page', () => {
    const {container} = renderIn(
      'ltr',
      'English first.\n\nשלום עולם, זו פסקה.',
    );
    expect(
      blockContaining(container, '[role="paragraph"]', 'שלום').getAttribute(
        'dir',
      ),
    ).toBe('rtl');
    expect(
      blockContaining(container, '[role="paragraph"]', 'English').getAttribute(
        'dir',
      ),
    ).toBe('ltr');
  });

  it('lays an English paragraph out left to right in a right-to-left page', () => {
    const {container} = renderIn('rtl', 'שלום עולם.\n\nAn English paragraph.');
    expect(
      blockContaining(container, '[role="paragraph"]', 'English').getAttribute(
        'dir',
      ),
    ).toBe('ltr');
    expect(
      blockContaining(container, '[role="paragraph"]', 'שלום').getAttribute(
        'dir',
      ),
    ).toBe('rtl');
  });

  it('gives a heading its own direction', () => {
    const {container} = renderIn('ltr', '# כותרת ראשית');
    expect(container.querySelector('h1')?.getAttribute('dir')).toBe('rtl');
  });

  it('gives each list item and a blockquote their own direction, and none to the list', () => {
    const {container} = renderIn(
      'ltr',
      '- First item\n- פריט שני\n\n> ציטוט בעברית',
    );
    expect(blockContaining(container, 'li', 'First').getAttribute('dir')).toBe(
      'ltr',
    );
    expect(blockContaining(container, 'li', 'פריט').getAttribute('dir')).toBe(
      'rtl',
    );
    expect(container.querySelector('ul')?.hasAttribute('dir')).toBe(false);
    expect(container.querySelector('blockquote')?.getAttribute('dir')).toBe(
      'rtl',
    );
  });

  it('gives a block with no strongly directional character no direction of its own', () => {
    const {container} = renderIn(
      'rtl',
      '12345 — 67%\n\n![A picture](https://example.com/a.png)',
    );
    expect(
      blockContaining(container, '[role="paragraph"]', '12345').hasAttribute(
        'dir',
      ),
    ).toBe(false);
    expect(
      container.querySelector('img')?.closest('[dir]')?.getAttribute('dir'),
    ).not.toBe('ltr');
  });

  it('gives a table cell the direction of its own text, and none to the table', () => {
    const {container} = renderIn(
      'ltr',
      '| Name | שם |\n| - | - |\n| Alice | אליס |\n| 42 | — |',
    );
    expect(blockContaining(container, 'th', 'Name').getAttribute('dir')).toBe(
      'ltr',
    );
    expect(blockContaining(container, 'th', 'שם').getAttribute('dir')).toBe(
      'rtl',
    );
    expect(blockContaining(container, 'td', 'אליס').getAttribute('dir')).toBe(
      'rtl',
    );
    expect(blockContaining(container, 'td', '42').hasAttribute('dir')).toBe(
      false,
    );
    expect(container.querySelector('table')?.hasAttribute('dir')).toBe(false);
  });

  it('gives a code block and a table no direction of their own', () => {
    const {container} = renderIn(
      'rtl',
      '```\nconst a = 1;\n```\n\n| A | B |\n| - | - |\n| one | two |',
    );
    expect(
      container.querySelector('pre')?.closest('[dir]')?.getAttribute('dir'),
    ).not.toBe('ltr');
    expect(
      container.querySelector('table')?.closest('[dir]')?.getAttribute('dir'),
    ).not.toBe('ltr');
  });

  it('gives a neutral paragraph inside a Hebrew list item the provider direction', () => {
    const {container} = renderInProvider(
      'ltr',
      '- פריט ראשון\n\n  2026\n- Second item',
    );
    expect(blockContaining(container, 'li', 'פריט').getAttribute('dir')).toBe(
      'rtl',
    );
    expect(
      blockContaining(container, '[role="paragraph"]', '2026').getAttribute(
        'dir',
      ),
    ).toBe('ltr');
  });

  it('gives a neutral paragraph inside an English quote the provider direction', () => {
    const {container} = renderInProvider(
      'rtl',
      '> An English quote.\n>\n> 42 — 7%',
    );
    expect(container.querySelector('blockquote')?.getAttribute('dir')).toBe(
      'ltr',
    );
    expect(
      blockContaining(container, '[role="paragraph"]', '42').getAttribute(
        'dir',
      ),
    ).toBe('rtl');
  });

  it('gives a neutral cell in a table under a Hebrew item the provider direction', () => {
    const {container} = renderInProvider(
      'ltr',
      '- פריט עם טבלה\n\n  | שם | 2026 |\n  | - | - |\n  | אליס | 42 |',
    );
    expect(blockContaining(container, 'td', 'אליס').getAttribute('dir')).toBe(
      'rtl',
    );
    expect(blockContaining(container, 'td', '42').getAttribute('dir')).toBe(
      'ltr',
    );
  });

  it('leaves a neutral block with no attribute where the block around it already reads the provider direction', () => {
    const {container} = renderInProvider('ltr', '- English item\n\n  2026');
    expect(
      blockContaining(container, '[role="paragraph"]', '2026').hasAttribute(
        'dir',
      ),
    ).toBe(false);
  });
});
