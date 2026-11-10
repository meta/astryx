// Doctor: theme packages and wiring, one project per subfolder.
import * as fs from 'node:fs';
import * as path from 'node:path';

export default async function (dir, h) {
  const neutral = path.join(h.REPO, 'packages/themes/neutral');
  const app = async (name, files, theme = true, pkgExtra = {}) => {
    const d = path.join(dir, name);
    await h.makeApp(d, {name});
    if (theme && fs.existsSync(neutral)) {
      const pkg = h.copyPackage(neutral, path.join(d, 'node_modules/@astryxdesign/theme-neutral'));
      const pj = JSON.parse(fs.readFileSync(path.join(d, 'package.json'), 'utf8'));
      pj.dependencies[pkg.name] = pkg.version;
      Object.assign(pj, pkgExtra);
      await h.writeJson(path.join(d, 'package.json'), pj);
    }
    for (const [rel, text] of Object.entries(files)) await h.writeFile(path.join(d, rel), text);
  };
  await app('unwired', {});
  await app('legacy', {}, true, {astryx: {theme: 'neutral'}});
  await app('cssimport', {'src/globals.css': "@import '@astryxdesign/theme-neutral/neutral.css';\n"});
  await app('notgenerated', {'src/astryx-themes.ts': 'export const themes = {};\n'});
}
