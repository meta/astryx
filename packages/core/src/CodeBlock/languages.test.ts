// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file languages.test.ts
 * @input tokenizer.ts and the language modules
 * @output CodeBlock FR12 (built-in identifiers) and FR13 (language modules)
 *   tokenizer evidence
 * @position CodeBlock FR12, FR13 evidence
 */

import {describe, expect, it} from 'vitest';
import {tokenize} from './tokenizer';
import {dockerfile} from './languages/dockerfile';
import {graphql} from './languages/graphql';
import {java} from './languages/java';
import {lua} from './languages/lua';
import {objectiveC} from './languages/objective-c';
import {powershell} from './languages/powershell';
import {ruby} from './languages/ruby';
import {thrift} from './languages/thrift';
import {toml} from './languages/toml';
import {
  createCodeLanguage,
  isCodeLanguage,
  languageKey,
  listedLanguage,
  listedLanguageForFile,
} from './grammar';
import type {CodeLanguage} from './grammar';

/** Token types painted for `code`, by the text they cover. */
function painted(
  code: string,
  language: string | CodeLanguage,
): Map<string, Set<string>> {
  const lines = code.split('\n');
  const out = new Map<string, Set<string>>();
  tokenize(code, language).forEach((tokens, index) => {
    for (const token of tokens) {
      const text = lines[index].slice(token.start, token.end);
      const types = out.get(token.type) ?? new Set<string>();
      types.add(text);
      out.set(token.type, types);
    }
  });
  return out;
}

type Case = {
  ids: string[];
  code: string;
  comment?: string;
  string?: string;
  number?: string;
  keyword: string;
};

const NATIVE: Case[] = [
  {
    ids: ['typescript', 'ts', 'javascript', 'js', 'tsx', 'jsx'],
    code: '// c\nconst n = 3; const s = "x";',
    comment: '// c',
    string: '"x"',
    number: '3',
    keyword: 'const',
  },
  {
    ids: ['json'],
    code: '{"s": "x", "n": 3}',
    string: '"x"',
    number: '3',
    keyword: '',
  },
  {
    ids: ['html', 'xml', 'svg'],
    code: '<!-- c -->\n<a href="x">t</a>',
    comment: '<!-- c -->',
    string: '"x"',
    keyword: '',
  },
  {
    ids: ['css', 'scss', 'less'],
    code: '/* c */\na { width: 3px; content: "x"; }',
    comment: '/* c */',
    string: '"x"',
    number: '3px',
    keyword: '',
  },
  {
    ids: ['python', 'py'],
    code: '# c\ndef f(): return "x", 3',
    comment: '# c',
    string: '"x"',
    number: '3',
    keyword: 'def',
  },
  {
    ids: ['bash', 'sh', 'zsh', 'shell'],
    code: '# c\nif true; then echo "x" 3; fi',
    comment: '# c',
    string: '"x"',
    number: '3',
    keyword: 'if',
  },
  {
    ids: ['php'],
    code: '<?php\n// c\nfunction f() { return "x" . 3; }',
    comment: '// c',
    string: '"x"',
    number: '3',
    keyword: 'function',
  },
  {
    ids: ['hack'],
    code: '// c\nfunction f(): vec<int> { return vec["x", 3]; }',
    comment: '// c',
    string: '"x"',
    number: '3',
    keyword: 'function',
  },
  {
    ids: ['yaml', 'yml'],
    code: '# c\nname: "x"\nn: 3',
    comment: '# c',
    string: '"x"',
    number: '3',
    keyword: '',
  },
  {
    ids: ['markdown', 'md'],
    code: '# Title\n\nSome `code` here.',
    keyword: '# Title',
  },
  {
    ids: ['c', 'h'],
    code: '#include <stdio.h>\n// c\nint n = 42; char *s = "x";',
    comment: '// c',
    string: '"x"',
    number: '42',
    keyword: 'int',
  },
  {
    ids: ['cpp', 'c++', 'cc', 'cxx', 'hpp', 'hh'],
    code: '// c\nauto v = std::vector<int>{1};\nconst char* s = "x";',
    comment: '// c',
    string: '"x"',
    number: '1',
    keyword: 'auto',
  },
  {
    ids: ['sql'],
    code: "-- c\nSELECT id FROM t WHERE n > 7 AND s = 'x';",
    comment: '-- c',
    string: "'x'",
    number: '7',
    keyword: 'SELECT',
  },
  {
    ids: ['rust', 'rs'],
    code: '// c\nfn main() { let n = 3; let s = "x"; }',
    comment: '// c',
    string: '"x"',
    number: '3',
    keyword: 'fn',
  },
  {
    ids: ['kotlin', 'kt', 'kts'],
    code: '// c\nfun main() { val n = 3; val s = "x" }',
    comment: '// c',
    string: '"x"',
    number: '3',
    keyword: 'fun',
  },
  {
    ids: ['swift'],
    code: '// c\nfunc f() { let n = 3; let s = "x" }',
    comment: '// c',
    string: '"x"',
    number: '3',
    keyword: 'func',
  },
  {
    ids: ['go', 'golang'],
    code: '// c\nfunc main() { n := 3; s := "x" }',
    comment: '// c',
    string: '"x"',
    number: '3',
    keyword: 'func',
  },
];

const MODULES: (Case & {module: CodeLanguage})[] = [
  {
    module: graphql,
    ids: ['graphql', 'gql'],
    code: '# c\nquery Q { user(id: "x", n: 3) { name } }',
    comment: '# c',
    string: '"x"',
    number: '3',
    keyword: 'query',
  },
  {
    module: java,
    ids: ['java'],
    code: '// c\npublic class A { int n = 3; String s = "x"; }',
    comment: '// c',
    string: '"x"',
    number: '3',
    keyword: 'public',
  },
  {
    module: thrift,
    ids: ['thrift'],
    code: '# c\nstruct U { 1: required string s = "x"; }',
    comment: '# c',
    string: '"x"',
    number: '1',
    keyword: 'struct',
  },
  {
    module: objectiveC,
    ids: ['objective-c', 'objc', 'm', 'mm'],
    code: '// c\n@interface A : NSObject\nint n = 3; NSString *s = @"x";',
    comment: '// c',
    string: '@"x"',
    number: '3',
    keyword: '@interface',
  },
  {
    module: toml,
    ids: ['toml'],
    code: '# c\n[pkg]\nname = "x"\nn = 3',
    comment: '# c',
    string: '"x"',
    number: '3',
    keyword: '',
  },
  {
    module: powershell,
    ids: ['powershell', 'ps1', 'pwsh'],
    code: '# c\nfunction F { $n = 3; $s = "x" }',
    comment: '# c',
    string: '"x"',
    number: '3',
    keyword: 'function',
  },
  {
    module: ruby,
    ids: ['ruby', 'rb'],
    code: '# c\ndef f\n  n = 3; s = "x"\nend',
    comment: '# c',
    string: '"x"',
    number: '3',
    keyword: 'def',
  },
  {
    module: lua,
    ids: ['lua'],
    code: '-- c\nlocal function f() local n = 3; local s = "x" end',
    comment: '-- c',
    string: '"x"',
    number: '3',
    keyword: 'local',
  },
  {
    module: dockerfile,
    ids: ['dockerfile', 'docker'],
    code: '# c\nFROM node:20 AS build\nRUN echo "x" 3',
    comment: '# c',
    string: '"x"',
    number: '3',
    keyword: 'FROM',
  },
];

function expectPaints(map: Map<string, Set<string>>, c: Case) {
  for (const type of ['comment', 'string', 'number', 'keyword'] as const) {
    const text = c[type];
    if (text) {
      expect(map.get(type)).toContain(text);
    }
  }
}

describe('built-in languages (FR12)', () => {
  for (const c of NATIVE) {
    for (const id of c.ids) {
      it(`paints ${id} with no setup`, () => {
        expectPaints(painted(c.code, id), c);
      });
    }
  }

  it('paints a call, not the operand before `!=`, and Rust macros', () => {
    const go = painted('if err != nil { f(1) }', 'go');
    expect(go.get('function')).toEqual(new Set(['f']));
    expect(go.get('operator')).toContain('!=');
    expect(painted('println!("x"); a != b', 'rust').get('function')).toEqual(
      new Set(['println!']),
    );
  });

  it('reads a raw string with inner quotes as one string', () => {
    const rust = 'let j = r#"{"id": 1, "type": "user"}"#; let u = user;';
    expect(painted(rust, 'rust').get('string')).toEqual(
      new Set(['r#"{"id": 1, "type": "user"}"#']),
    );
    const cpp = 'auto j = R"json({"id": ")"})json"; int n;';
    expect(painted(cpp, 'cpp').get('string')).toEqual(
      new Set(['R"json({"id": ")"})json"']),
    );
  });

  it('reads prefixed C++ and extended-delimiter Swift raw strings as one string', () => {
    expect(painted('auto s = u8R"(a "b" c)";', 'cpp').get('string')).toEqual(
      new Set(['u8R"(a "b" c)"']),
    );
    expect(painted('auto s = LR"x(say "y")x";', 'cpp').get('string')).toEqual(
      new Set(['LR"x(say "y")x"']),
    );
    expect(painted('let s = #"He said "hi""#', 'swift').get('string')).toEqual(
      new Set(['#"He said "hi""#']),
    );
  });

  it('renders an identifier with no grammar as plain code', () => {
    expect(tokenize('const x = 1;', 'zig').flat()).toEqual([]);
    expect(tokenize('', 'rust')).toEqual([[]]);
  });
});

describe('language values (FR13)', () => {
  for (const c of MODULES) {
    it(`paints ${c.module.name} only when its value is passed`, () => {
      for (const id of c.ids) {
        // A string never resolves to a module.
        expect(tokenize(c.code, id).flat()).toEqual([]);
      }
      expectPaints(painted(c.code, c.module), c);
    });
  }

  it('carries its name, identifiers, file extensions, and file names', () => {
    expect(thrift.name).toBe('thrift');
    expect(objectiveC.identifiers).toContain('objc');
    expect(graphql.fileExtensions).toEqual(['graphql', 'gql']);
    expect(dockerfile.fileNames).toContain('Dockerfile');
    expect(java.fileNames).toEqual([]);
    expect(languageKey(objectiveC)).toBe('objective-c');
  });

  it('makes a custom language from a tokenize function', () => {
    const seen: string[] = [];
    const zig = createCodeLanguage({
      name: 'zig',
      identifiers: ['zig'],
      tokenize: (code, language) => {
        seen.push(language);
        return [{type: 'keyword', start: 0, end: 3}];
      },
    });
    expect(zig.fileExtensions).toEqual([]);
    expect(zig.fileNames).toEqual([]);
    expect(painted('pub fn\nx', zig).get('keyword')).toEqual(new Set(['pub']));
    expect(seen).toEqual(['zig']);
    expect(isCodeLanguage(zig)).toBe(true);
  });

  it('finds a listed value by identifier, later entries first', () => {
    const gqlToo = createCodeLanguage({
      name: 'gql2',
      identifiers: ['gql'],
      tokenize: () => [],
    });
    expect(listedLanguage([graphql], 'gql')).toBe(graphql);
    expect(listedLanguage([graphql, gqlToo], 'gql')).toBe(gqlToo);
    expect(listedLanguage([graphql], 'thrift')).toBeUndefined();
    expect(listedLanguage(undefined, 'gql')).toBeUndefined();
  });

  it('finds a listed value by file name or extension', () => {
    const list = [graphql, dockerfile, ruby];
    expect(listedLanguageForFile(list, 'schema.graphql', 'graphql')).toBe(
      graphql,
    );
    expect(listedLanguageForFile(list, 'Dockerfile', null)).toBe(dockerfile);
    expect(listedLanguageForFile(list, 'Gemfile', null)).toBe(ruby);
    expect(listedLanguageForFile(list, 'a.rs', 'rs')).toBeUndefined();
  });

  it('ignores values that are not language values', () => {
    const fake = {
      name: 'thrift',
      identifiers: ['thrift'],
    } as unknown as CodeLanguage;
    expect(isCodeLanguage(fake)).toBe(false);
    expect(tokenize('struct U {}', fake).flat()).toEqual([]);
    expect(powershell.name).toBe('powershell');
    expect(lua.name).toBe('lua');
    expect(toml.name).toBe('toml');
  });
});
