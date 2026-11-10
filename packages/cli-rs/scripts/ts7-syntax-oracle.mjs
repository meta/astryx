#!/usr/bin/env node
// Dumps what the TypeScript 7 Node API's syntax tree reports for every node of
// a few test files (kind, positions, getStart, text, child properties, list
// items, parent, leading comments), for the Rust decoder's test. Usage:
//   node scripts/ts7-syntax-oracle.mjs <typescript-7 package dir>
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const tsDir = path.resolve(process.argv[2] ?? "");
const imp = rel => import(pathToFileURL(path.join(tsDir, rel)).href);
const { API } = await imp("dist/api/sync/api.js");
const ast = await imp("dist/ast/index.js");
const { childProperties } = await imp("dist/api/node/protocol.generated.js");

const ROOT = "/tmp/astryx-ts7-syntax";
fs.rmSync(ROOT, { recursive: true, force: true });
fs.cpSync(path.join(here, "../src/ts7/testdata/syntax"), ROOT, { recursive: true });
const files = fs.readdirSync(ROOT).sort().map(f => `${ROOT}/${f}`);
const config = `${ROOT}/__astryx_check_1.tsconfig.json`;
const configText = JSON.stringify({ compilerOptions: { noLib: true, noResolve: true, allowJs: true, noEmit: true, types: [], jsx: "preserve" }, files });
const api = new API({
  cwd: ROOT,
  fs: {
    readFile: p => (p === config ? configText : undefined),
    fileExists: p => (p === config ? true : undefined),
  },
});
const snap = api.updateSnapshot({ openProjects: [config] });
const project = snap.getProject(config);

const out = { config: configText, files: {} };
for (const file of files) {
  const sf = project.program.getSourceFile(file);
  const nodes = [];
  const visit = node => {
    const props = {};
    for (const name of childProperties[node.kind] ?? []) {
      const child = node[name];
      if (child === undefined) continue;
      props[name] = Array.isArray(child) ? { list: child.map(c => c.index) } : child.index;
    }
    const comments = ast.getLeadingCommentRanges(sf.text, node.pos) ?? [];
    nodes.push({
      index: node.index,
      kind: node.kind,
      pos: node.pos,
      end: node.end,
      start: node.getStart(sf),
      startJsDoc: node.getStart(sf, true),
      text: typeof node.text === "string" && node !== sf ? node.text : null,
      flags: node.flags,
      parent: node.parent ? node.parent.index : null,
      props,
      children: (() => {
        const c = [];
        node.forEachChild(n => {
          c.push(n.index);
        });
        return c;
      })(),
      jsDoc: (node.jsDoc ?? []).map(j => j.index),
      comments: comments.map(r => [r.kind, r.pos, r.end, r.hasTrailingNewLine]),
      line: sf.getLineAndCharacterOfPosition(node.getStart(sf)),
    });
    for (const j of node.jsDoc ?? []) visit(j);
    node.forEachChild(visit);
  };
  visit(sf);
  out.files[path.basename(file)] = { path: sf.path, textLength: sf.text.length, nodes };
}
snap.dispose();
api.close();
fs.writeFileSync(path.join(here, "../src/ts7/testdata/syntax-oracle.json"), JSON.stringify(out) + "\n");
console.log(Object.entries(out.files).map(([f, v]) => `${f}: ${v.nodes.length} nodes`).join(", "));
