// Doctor: agent docs in several states, one project per subfolder.
import * as path from 'node:path';

const BLOCK = '<!-- ASTRYX:START -->\nAstryx rules.\n<!-- ASTRYX:END -->\n';

export default async function (dir, h) {
  const app = async (name, files) => {
    const d = path.join(dir, name);
    await h.makeApp(d, {name});
    for (const [rel, text] of Object.entries(files)) await h.writeFile(path.join(d, rel), text);
  };
  await app('good', {'AGENTS.md': `# Agents\n\n${BLOCK}`, 'CLAUDE.md': 'Read AGENTS.md.\n'});
  await app('nomarkers', {'AGENTS.md': '# Agents\n\nNo block here.\n', '.cursorrules': 'rules\n'});
  await app('dangling', {'GEMINI.md': '<!-- ASTRYX:START -->\n@AGENTS.md\n<!-- ASTRYX:END -->\n', 'AGENTS.md': '# empty\n'});
  await app('legacy', {'.claude/CLAUDE.md': '<!-- XDS:START -->\nold\n<!-- XDS:END -->\n'});
}
