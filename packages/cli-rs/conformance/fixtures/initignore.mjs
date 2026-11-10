// Projects whose ignore files exclude CLAUDE.md (or not) in unusual ways, each
// with a root CLAUDE.md and a .claude/CLAUDE.md that hold a managed block.
export default async function (dir, h) {
  h.makeApp(dir, {name: 'initignore'});
  const variants = {
    neg: {'.gitignore': '*.md\n!CLAUDE.md\n'},
    dironly: {'.gitignore': '.claude/\nCLAUDE.md\n'},
    nested: {'.gitignore': '/CLAUDE.md\n', '.claude/.gitignore': '!CLAUDE.md\n'},
    nestedignored: {'.gitignore': '/CLAUDE.md\n', '.claude/.gitignore': 'CLAUDE.md\n'},
    glob: {'.gitignore': '**/CLAUDE.md\n!.claude/CLAUDE.md\n'},
    dirpattern: {'.gitignore': 'CLAUDE.md/\n'},
    escaped: {'.gitignore': '\\#notes\nCLAUDE.m?\n# CLAUDE.md\n'},
  };
  for (const [name, files] of Object.entries(variants)) {
    const root = `${dir}/${name}`;
    h.writeJson(`${root}/package.json`, {name, version: '1.0.0', dependencies: {'@astryxdesign/core': h.CORE_VERSION}});
    h.writeFile(`${root}/CLAUDE.md`, '# Notes\n\n<!-- ASTRYX:START -->\nold\n<!-- ASTRYX:END -->\n');
    h.writeFile(`${root}/.claude/CLAUDE.md`, '<!-- ASTRYX:START -->\nold\n<!-- ASTRYX:END -->\n');
    for (const [rel, text] of Object.entries(files)) h.writeFile(`${root}/${rel}`, text);
  }
}
