// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, vi, afterEach} from 'vitest';
import {
  emit,
  section,
  text,
  list,
  record,
  records,
  wrapText,
  displayWidth,
  WRAP_WIDTH,
  code,
  Block,
  BULLET,
  ARROW,
} from './index.mjs';
import {setJsonMode} from '../../../foundation/response/json.mjs';

afterEach(() => {
  setJsonMode(false);
  vi.restoreAllMocks();
});

describe('constants', () => {
  it('are plain ASCII', () => {
    expect(BULLET).toBe('-');
    expect(ARROW).toBe('->');
    expect(/[^\x20-\x7E]/.test(`${BULLET}${ARROW}`)).toBe(false);
  });
});

describe('renderers return Block', () => {
  it('produces nominal Block instances', () => {
    expect(section('x')).toBeInstanceOf(Block);
    expect(record({a: 1})).toBeInstanceOf(Block);
    expect(records([{a: 1}])).toBeInstanceOf(Block);
    expect(code('a')).toBeInstanceOf(Block);
  });
});

describe('section', () => {
  it('renders a heading alone, or heading + subtitle directly beneath', () => {
    expect(section('PAGE TEMPLATES').toString()).toBe('PAGE TEMPLATES');
    expect(section('PAGE TEMPLATES', 'Closest full-page templates.').toString()).toBe(
      'PAGE TEMPLATES\nClosest full-page templates.',
    );
  });
});

describe('list', () => {
  it('renders single-line items tightly with bullets', () => {
    expect(list(['alpha', 'beta']).toString()).toBe('- alpha\n- beta');
  });

  it('hang-indents multi-line items and separates them with a blank line', () => {
    expect(list([['head', 'detail'], 'solo']).toString()).toBe(
      '- head\n  detail\n\n- solo',
    );
  });
});

describe('record', () => {
  it('renders a JSON object as aligned key: value lines', () => {
    const lines = record({
      name: 'Button',
      domain: 'component',
      description: 'A button.',
    })
      .toString()
      .split('\n');
    expect(lines[0]).toMatch(/^name:\s+Button$/);
    expect(lines[1]).toMatch(/^domain:\s+component$/);
    expect(lines[2]).toMatch(/^description: A button\.$/);
    // Values align to one column (keyWidth 'description' = 11, +2 = 13).
    expect(lines[0].indexOf('Button')).toBe(13);
    expect(lines[2].indexOf('A button.')).toBe(13);
  });

  it('picks + orders fields and skips missing/empty ones', () => {
    const out = record(
      {name: 'X', domain: 'component', description: ''},
      {fields: ['domain', 'name', 'displayName', 'description']},
    ).toString();
    expect(out).toBe('domain: component\nname:   X');
  });

  it('applies labels and format transforms', () => {
    const out = record(
      {command: 'astryx x'},
      {labels: {command: 'run'}, format: {command: v => `pnpm exec ${v}`}},
    ).toString();
    expect(out).toBe('run: pnpm exec astryx x');
  });

  it('joins array values with commas', () => {
    expect(record({frame: ['AppShell', 'TopNav']}).toString()).toBe(
      'frame: AppShell, TopNav',
    );
  });
});

describe('records', () => {
  it('renders one record per object separated by a blank line', () => {
    expect(records([{name: 'A'}, {name: 'B'}]).toString()).toBe('name: A\n\nname: B');
  });
});

describe('ASCII normalization', () => {
  it('converts em/en dashes, curly quotes, and ellipsis in prose + records', () => {
    expect(text('a \u2014 b').toString()).toBe('a - b');
    expect(section('X \u2013 Y').toString()).toBe('X - Y');
    expect(record({name: '\u201cSettings\u201d \u2014 Form\u2026'}).toString()).toBe(
      'name: "Settings" - Form...',
    );
    expect(list(['Avatar \u2014 Group']).toString()).toBe('- Avatar - Group');
  });

  it('converts Unicode arrows to ASCII arrows', () => {
    expect(text('Rename items \u2192 options').toString()).toBe('Rename items -> options');
    expect(text('options \u2190 items').toString()).toBe('options <- items');
    expect(record({title: 'a \u2192 b'}).toString()).toBe('title: a -> b');
  });

  it('leaves code verbatim (no normalization)', () => {
    expect(code('a \u2014 b').toString()).toBe('a \u2014 b');
  });
});

describe('code', () => {
  it('is byte-for-byte verbatim (source or docs)', () => {
    const src = 'const x = 1;\n  const y = 2;\n';
    expect(code(src).toString()).toBe(src);
    expect(code('# Title\n\n- a\n').toString()).toBe('# Title\n\n- a\n');
  });
});

describe('emit', () => {
  it('joins blocks with a single blank line via one console.log', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    emit(section('A'), text('B'));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('A\n\nB');
  });

  it('drops falsy placeholders', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    emit(section('A'), false, null, undefined, text('B'));
    expect(spy).toHaveBeenCalledWith('A\n\nB');
  });

  it('is a no-op in --json mode (stdout stays clean)', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    setJsonMode(true);
    emit(section('A'), text('B'));
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('wrapText', () => {
  it('leaves short lines and its own line breaks alone', () => {
    expect(wrapText('a b\nc')).toBe('a b\nc');
  });

  it('wraps at the width with a hanging indent', () => {
    expect(wrapText('aaa bbb ccc', {width: 7, indent: '  '})).toBe('aaa bbb\n  ccc');
  });

  it('keeps a word longer than the width whole', () => {
    expect(wrapText('x '.concat('y'.repeat(20)), {width: 10})).toBe(
      `x\n${'y'.repeat(20)}`,
    );
  });
});

describe('records inline layout', () => {
  const items = [
    {id: 'a', title: 'Alpha', summary: 'First.'},
    {id: 'bbb', title: 'Beta', summary: ''},
  ];

  it('puts one record on each line under a padded first column', () => {
    expect(
      records(items, {fields: ['id', 'title', 'summary'], layout: 'inline'}).toString(),
    ).toBe('a    Alpha - First.\nbbb  Beta');
  });

  it('sizes the first column from the records sizesColumn keeps; another overhangs it', () => {
    const rows = [
      {id: 'a', summary: 'First.'},
      {id: 'a-much-longer-name', summary: 'Extra.', extra: true},
      {id: 'bbb', summary: 'Third.'},
    ];
    expect(
      records(rows, {
        fields: ['id', 'summary'],
        layout: 'inline',
        sizesColumn: row => !row.extra,
      }).toString(),
    ).toBe('a    First.\na-much-longer-name  Extra.\nbbb  Third.');
  });

  it('wraps a long record under the first column', () => {
    const out = records([{id: 'a', text: 'word '.repeat(40).trim()}], {
      layout: 'inline',
    }).toString();
    expect(out.split('\n').length).toBeGreaterThan(1);
    expect(out.split('\n').every(line => line.length <= WRAP_WIDTH)).toBe(true);
    expect(out.split('\n')[1].startsWith('   word')).toBe(true);
  });

  it('keeps the first column padded on a record that wraps', () => {
    const out = records(
      [
        {id: 'a', text: 'word '.repeat(40).trim()},
        {id: 'longer', text: 'x'},
      ],
      {layout: 'inline'},
    ).toString();
    const lines = out.split('\n');
    expect(lines[0].startsWith(`a${' '.repeat(7)}word`)).toBe(true);
    expect(lines[1].startsWith(' '.repeat(8) + 'word')).toBe(true);
    expect(lines.at(-1)).toBe('longer  x');
    expect(lines.every(line => line.length <= WRAP_WIDTH)).toBe(true);
  });

  it('cuts a long record to one line when asked', () => {
    const out = records([{id: 'a', text: 'word '.repeat(40).trim()}], {
      layout: 'inline',
      overflow: 'truncate',
    }).toString();
    expect(out.includes('\n')).toBe(false);
    expect(out.length).toBeLessThanOrEqual(WRAP_WIDTH);
    expect(out.endsWith('...')).toBe(true);
  });
});

describe('wide characters', () => {
  it('counts CJK characters as two columns', () => {
    expect(displayWidth('亮/暗模式')).toBe(9);
  });

  it('wraps CJK text, which has no spaces, by columns', () => {
    const out = wrapText('中'.repeat(100), {width: 20});
    expect(out.split('\n').every(line => displayWidth(line) <= 20)).toBe(true);
    expect(out.split('\n')).toHaveLength(10);
  });

  it('keeps spaces between Latin words next to CJK', () => {
    expect(wrapText('运行 astryx docs 查看', {width: 200})).toBe('运行 astryx docs 查看');
  });

  it('cuts an inline record to columns, not characters', () => {
    const out = records([{id: 'a', text: '中'.repeat(100)}], {
      layout: 'inline',
      overflow: 'truncate',
    }).toString();
    expect(displayWidth(out)).toBeLessThanOrEqual(WRAP_WIDTH);
    expect(out.endsWith('...')).toBe(true);
  });
});
