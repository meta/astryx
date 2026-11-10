import {defineConfig} from 'vitest/config';
const REC = process.env.REC_OUT || '/tmp/rec.jsonl';
export default defineConfig({
  plugins: [{
    name: 'rec',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('/assets/codemods/transforms/') || id.includes('__tests__') || id.endsWith('/index.mjs')) return null;
      if (!/^export default /m.test(code)) return null;
      const rel = id.split('/assets/codemods/transforms/')[1];
      const out = code.replace(/^export default /m, 'const __recOrig = ') +
        `\nimport * as __fs from 'node:fs';\nconst __recWrapped = typeof __recOrig === 'function' ? function (file, api, options) {\n  let r, err;\n  try { r = __recOrig.call(this, file, api, options); } catch (e) { err = e; }\n  try { __fs.appendFileSync(${JSON.stringify(REC)}, JSON.stringify({m: ${JSON.stringify(rel)}, path: file && file.path, source: file && file.source, options: options ?? null, out: r === undefined ? {undef: true} : r, err: err ? String(err && err.message) : undefined, code: err && err.code}) + '\\n'); } catch {}\n  if (err) throw err; return r;\n} : __recOrig;\nexport default __recWrapped;\n`;
      return {code: out, map: null};
    },
  }],
  test: {include: ['packages/cli/assets/codemods/**/*.test.mjs'], environment: 'node', pool: 'forks', testTimeout: 60000},
});
