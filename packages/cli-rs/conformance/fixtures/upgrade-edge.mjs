// Sources that exercise parser and printer edges seen in real apps: a regular
// expression inside a parenthesized return in a file a codemod changes, and
// generic arrow functions in a .ts file.
import * as path from 'node:path';

export default function (dir, {makeApp, writeFile}) {
  makeApp(dir, {name: 'edge-app'});
  const w = (rel, text) => writeFile(path.join(dir, rel), text);
  w('src/slug.tsx', `export function slug(value: string): string {
  return (
    value
      .trim()
      .replace(/['\\u201C\\u201D"]/g, '')
      .replace(/^-+|-+$/g, '') || 'section'
  );
}

export const style = {background: 'var(--color-surface, #fff)'};
`);
  w('src/mock.test.ts', `const mock = {
  create: <T>(styles: T) => styles,
  defineConsts: <T,>(constants: T) => constants,
};
export const token = 'var(--color-surface)';
export default mock;
`);
  w('src/plain.js', `export const re = () => (
  /a'b/g
);
export const bg = 'var(--color-surface)';
`);
}
