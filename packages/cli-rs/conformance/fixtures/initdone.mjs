// A project that already holds agent docs, a theme template and swizzled
// copies, for init and swizzle runs against existing files.
export default async function (dir, h) {
  h.makeApp(dir, {name: 'initdone'});
  h.writeFile(`${dir}/CLAUDE.md`, '# Team notes\n\nKeep it tidy.\n\n<!-- ASTRYX:START -->\nAstryx v0.6.0 · 90 components\nold\n<!-- ASTRYX:END -->\n');
  h.writeFile(`${dir}/.claude/CLAUDE.md`, '<!-- ASTRYX:START -->\nold\n<!-- ASTRYX:END -->\n');
  h.writeFile(`${dir}/GEMINI.md`, '# Gemini\n\n@./AGENTS.md\n');
  h.writeFile(`${dir}/.cursorrules`, 'be nice\n');
  h.writeFile(`${dir}/HERMES.md`, '<!-- XDS:START -->\nlegacy\n<!-- XDS:END -->\n');
  h.writeFile(`${dir}/theme.template.ts`, '// mine\n');
  h.writeFile(`${dir}/components/astryx/Button/Button.tsx`, '// edited\n');
  h.writeFile(`${dir}/components/astryx/notes.txt`, 'x\n');
  h.writeFile(`${dir}/ui/astryx-swizzle.json`, '{"packages": {"@acme/kit": "1.0.0"}}\n');
  h.writeFile(`${dir}/broken/AGENTS.md`, '<!-- ASTRYX:START -->\nno end\n');
  h.writeFile(`${dir}/dup/AGENTS.md`, '<!-- ASTRYX:START -->\na\n<!-- ASTRYX:END -->\n<!-- ASTRYX:START -->\nb\n<!-- ASTRYX:END -->\n');
  h.writeJson(`${dir}/packages/web/package.json`, {name: 'web', version: '1.0.0'});
  h.writeFile(`${dir}/.gitignore`, 'CLAUDE.md\n');
}
