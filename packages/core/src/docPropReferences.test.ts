// Copyright (c) Meta Platforms, Inc. and affiliates.

/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * @file Guards doc prose against docs/source prop mismatches (#3360).
 *
 * Scans every {Name}.doc.mjs for prose phrases like "the foo prop on Bar"
 * and verifies the referenced prop is documented on the referenced
 * component. Doc prose is LLM training signal: a reference to a prop that
 * doesn't exist steers codegen toward hallucinated APIs (#3360 shipped a
 * bullet pointing at a nonexistent CodeBlock syntaxTheme prop).
 *
 * A reference to a missing prop is allowed only when the same string
 * explicitly negates it ("no such prop exists" / "does not exist"), the
 * corrective-bullet pattern used to counter known hallucinations.
 */

import {describe, it, expect} from 'vitest';
import {readdirSync} from 'node:fs';
import {join, relative} from 'node:path';

const SRC_DIR = __dirname;

type DocModule = {
  docs?: {
    name?: string;
    props?: {name: string}[];
    components?: {name?: string; props?: {name: string}[]}[];
  };
};

/**
 * Props intentionally omitted from doc props[]: ComponentPropDoc in docs-types.ts
 * says to skip internal/styling props, so prose may reference them even
 * though no doc lists them.
 */
const UNIVERSAL_PROPS = new Set([
  'xstyle',
  'className',
  'style',
  'ref',
  'data-testid',
]);

/**
 * Matches prose like "the foo prop on Bar", "foo prop of Bar", and
 * conjunction targets: "foo prop on Bar or Baz". Group 1 is the prop
 * (camelCase, lowercase first letter), group 2 the component name list.
 */
const PROP_REF_PATTERN =
  /\b([a-z][A-Za-z0-9]*) prop (?:on|of) (?:the )?([A-Z][A-Za-z0-9]*(?:(?:,(?: and| or)?| and| or) [A-Z][A-Za-z0-9]*)*)/g;

/** A same-string negation marks the reference as a deliberate counter-signal. */
const NEGATION_PATTERN = /no such prop|does not exist|doesn't exist/i;

function findDocFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findDocFiles(full));
    } else if (entry.name.endsWith('.doc.mjs')) {
      files.push(full);
    }
  }
  return files;
}

/** Collect every string value reachable from a doc module export. */
function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === 'string') {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) {
      collectStrings(item, out);
    }
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) {
      collectStrings(item, out);
    }
  }
}

const docFiles = findDocFiles(SRC_DIR);

// Component name → documented prop names, from every doc file's props[]
// (single and sub-component docs) and inline components[] entries.
const documentedProps = new Map<string, Set<string>>();
for (const file of docFiles) {
  const mod = require(file) as DocModule;
  const docs = mod.docs;
  if (!docs) {
    continue;
  }
  const entries = [
    {name: docs.name, props: docs.props},
    ...(docs.components || []),
  ];
  for (const {name, props} of entries) {
    if (!name || !Array.isArray(props)) {
      continue;
    }
    const set = documentedProps.get(name) || new Set<string>();
    for (const prop of props) {
      set.add(prop.name);
    }
    documentedProps.set(name, set);
  }
}

interface Violation {
  file: string;
  component: string;
  prop: string;
  excerpt: string;
}

function findViolations(): Violation[] {
  const violations: Violation[] = [];
  for (const file of docFiles) {
    const strings: string[] = [];
    collectStrings(require(file), strings);
    for (const text of strings) {
      let match;
      while ((match = PROP_REF_PATTERN.exec(text)) !== null) {
        const [, prop, componentList] = match;
        if (UNIVERSAL_PROPS.has(prop) || NEGATION_PATTERN.test(text)) {
          continue;
        }
        for (const component of componentList.split(
          /,(?: and| or)?| and | or /,
        )) {
          const name = component.trim();
          if (!name) {
            continue;
          }
          const known = documentedProps.get(name);
          if (known && !known.has(prop)) {
            violations.push({
              file: relative(SRC_DIR, file),
              component: name,
              prop,
              excerpt: text.slice(
                Math.max(0, match.index - 40),
                match.index + match[0].length + 20,
              ),
            });
          }
        }
      }
    }
  }
  return violations;
}

/**
 * Every prop table in every doc export (`docs`, `docsZh`, and their
 * `components[]` entries) that names one prop more than once. A reader sees
 * two entries and cannot tell which one is true.
 */
function findRepeatedProps(): string[] {
  const repeated: string[] = [];
  for (const file of docFiles) {
    const mod = require(file) as Record<string, DocModule['docs']>;
    for (const [exportName, docs] of Object.entries(mod)) {
      if (!docs || typeof docs !== 'object') {
        continue;
      }
      const tables = [
        {name: docs.name, props: docs.props},
        ...(Array.isArray(docs.components) ? docs.components : []),
      ];
      for (const {name, props} of tables) {
        if (!Array.isArray(props)) {
          continue;
        }
        const seen = new Set<string>();
        for (const prop of props) {
          if (seen.has(prop.name)) {
            repeated.push(
              `${relative(SRC_DIR, file)} ${exportName} ${name ?? ''} ${prop.name}`,
            );
          }
          seen.add(prop.name);
        }
      }
    }
  }
  return repeated;
}

describe('doc prose prop references', () => {
  it('sanity: discovers doc files and documented components', () => {
    expect(docFiles.length).toBeGreaterThan(0);
    expect(documentedProps.size).toBeGreaterThan(0);
  });

  it('every "X prop on Y" reference names a documented prop of Y', () => {
    const violations = findViolations();
    expect(
      violations,
      violations
        .map(
          v =>
            `${v.file} references prop "${v.prop}" on ${v.component}, ` +
            `which does not document it (…${v.excerpt}…). Either the prop ` +
            `doesn't exist (fix the prose; negate with "no such prop ` +
            `exists" if countering a known hallucination) or it exists in ` +
            `source but is missing from the component's doc props[] (add it).`,
        )
        .join('\n'),
    ).toEqual([]);
  });

  it('every prop table lists each prop once', () => {
    expect(findRepeatedProps()).toEqual([]);
  });
});
