// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Markdown.codeLanguages.test.tsx
 * @input Markdown, CodeBlock language modules, createCodeLanguage
 * @output Markdown FR30 evidence: a fence naming a value in `codeLanguages`
 *   renders with it, ahead of a built-in; a later entry wins; a
 *   `diff-<identifier>` fence takes the diff layer over it; a custom `code`
 *   renderer keeps receiving the fence word
 * @position Markdown FR30 evidence
 */

import {render} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {createCodeLanguage} from '../CodeBlock/grammar';
import {objectiveC} from '../CodeBlock/languages/objective-c';
import {thrift} from '../CodeBlock/languages/thrift';
import {Markdown} from './Markdown';

const THRIFT = 'struct User {\n  1: required string name;\n}';

function keywordTexts(root: ParentNode): string[] {
  return Array.from(root.querySelectorAll('.astryx-token-keyword')).map(
    node => node.textContent ?? '',
  );
}

describe('Markdown codeLanguages (Markdown FR30)', () => {
  const fence = '```thrift\n' + THRIFT + '\n```';

  it('paints a fence naming a listed value, and only then', () => {
    const unlisted = render(<Markdown>{fence}</Markdown>);
    expect(keywordTexts(unlisted.container)).toEqual([]);
    const listed = render(
      <Markdown codeLanguages={[thrift]}>{fence}</Markdown>,
    );
    // jsdom has no CSS Custom Highlight API, so CodeBlock falls back to spans.
    expect(keywordTexts(listed.container)).toContain('struct');
  });

  it('labels a matched fence with the value name, not the fence word', () => {
    const fence = '```objc\n@interface A : NSObject\n@end\n```';
    const {container} = render(
      <Markdown codeLanguages={[objectiveC]}>{fence}</Markdown>,
    );
    expect(container.textContent).toContain('objective-c');
    expect(container.querySelector('pre')?.getAttribute('data-language')).toBe(
      'objective-c',
    );
  });

  it('lets a later entry win a shared identifier', () => {
    const mine = createCodeLanguage({
      name: 'thrift',
      identifiers: ['thrift'],
      tokenize: () => [{type: 'string', start: 0, end: 6}],
    });
    const {container} = render(
      <Markdown codeLanguages={[thrift, mine]}>{fence}</Markdown>,
    );
    expect(keywordTexts(container)).toEqual([]);
    expect(container.querySelector('.astryx-token-string')?.textContent).toBe(
      'struct',
    );
  });

  it('lets a listed value claim a built-in identifier', () => {
    const myTs = createCodeLanguage({
      name: 'ts',
      identifiers: ['ts'],
      tokenize: () => [{type: 'string', start: 0, end: 5}],
    });
    const fenceTs = '```ts\nconst a = 1;\n```';
    const builtIn = render(<Markdown>{fenceTs}</Markdown>);
    expect(keywordTexts(builtIn.container)).toContain('const');
    const listed = render(
      <Markdown codeLanguages={[myTs]}>{fenceTs}</Markdown>,
    );
    expect(keywordTexts(listed.container)).toEqual([]);
    expect(
      listed.container.querySelector('.astryx-token-string')?.textContent,
    ).toBe('const');
  });

  it('takes the diff layer over a listed value for a diff-<identifier> fence', () => {
    const diff = '```diff-thrift\n+struct User {}\n```';
    const {container} = render(
      <Markdown codeLanguages={[thrift]}>{diff}</Markdown>,
    );
    expect(keywordTexts(container)).toContain('struct');
    expect(container.querySelector('[data-diff="added"]')).not.toBeNull();
  });

  it('does not re-render the document when an inline list names the same values', () => {
    // An inline plugin's render runs each time Markdown renders its blocks.
    let renders = 0;
    const counting = [
      {
        pattern: /marker/g,
        render: () => {
          renders++;
          return 'marker';
        },
      },
    ];
    const doc = 'A marker here.\n\n' + fence;
    const {rerender} = render(
      <Markdown codeLanguages={[thrift]} inlinePlugins={counting}>
        {doc}
      </Markdown>,
    );
    const first = renders;
    rerender(
      <Markdown codeLanguages={[thrift]} inlinePlugins={counting}>
        {doc}
      </Markdown>,
    );
    expect(renders).toBe(first);
  });

  it('keeps a custom code renderer receiving the fence word', () => {
    const seen: unknown[] = [];
    render(
      <Markdown
        codeLanguages={[thrift]}
        components={{
          code: ({language}) => {
            seen.push(language);
            return null;
          },
        }}>
        {fence}
      </Markdown>,
    );
    expect(seen).toEqual(['thrift']);
  });
});
