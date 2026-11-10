// Doctor: projects with integrations in broken or conflicting states, one
// project per subfolder.
import * as path from 'node:path';

export default async function (dir, h) {
  const project = async (name, pkgs, config) => {
    const d = path.join(dir, name);
    await h.makeApp(d, {name});
    const deps = {'@astryxdesign/core': h.CORE_VERSION};
    for (const [pkg, files] of Object.entries(pkgs)) {
      deps[pkg] = '1.0.0';
      const root = path.join(d, 'node_modules', ...pkg.split('/'));
      for (const [rel, text] of Object.entries(files)) await h.writeFile(path.join(root, rel), text);
    }
    await h.writeJson(path.join(d, 'package.json'), {name, version: '1.0.0', private: true, dependencies: deps});
    if (config) await h.writeFile(path.join(d, 'astryx.config.mjs'), config);
  };
  const pj = (name, extra = {}) => JSON.stringify({name, version: '1.0.0', ...extra});
  await project('broken', {
    '@bad/throws': {'package.json': pj('@bad/throws'), 'astryx.integration.mjs': "throw new Error('manifest exploded');\n"},
    '@bad/messy': {
      'package.json': pj('@bad/messy'),
      'astryx.integration.mjs': "export default {components: './components', templates: './templates', codemods: './codemods', docs: './nodocs', compnents: './x', shiny: true};\n",
      'components/Orphan.tsx': 'export function Orphan() { return null; }\n',
      'components/Lonely.doc.mjs': "export default {type: 'component', name: 'Lonely', category: 'Layout', usage: {description: 'A lonely doc.'}, props: []};\n",
      'templates/stray.tsx': 'export default function Stray() { return null; }\n',
      'codemods/rename.mjs': 'export default {};\n',
      'codemods/next/fix.mjs': 'export default {};\n',
    },
  });
  await project('provider', {
    '@dup/one': {'package.json': pj('@dup/one'), 'astryx.integration.mjs': "export default {providerId: '@dup/shared', components: './components'};\n", 'components/.keep': ''},
    '@dup/two': {'package.json': pj('@dup/two'), 'astryx.integration.mjs': "export default {providerId: '@dup/shared', components: './components'};\n", 'components/.keep': ''},
  });
  await project('clicommand', {
    '@cmd/one': {'package.json': pj('@cmd/one'), 'astryx.integration.mjs': "export default {cliCommand: 'acme astryx'};\n"},
    '@cmd/two': {'package.json': pj('@cmd/two'), 'astryx.integration.mjs': "export default {cliCommand: 'other astryx'};\n"},
  });
  await project('oneclicommand', {
    '@cmd/one': {'package.json': pj('@cmd/one'), 'astryx.integration.mjs': "export default {cliCommand: 'acme astryx'};\n"},
  });
  await project('configured', {
    '@good/kit': {'package.json': pj('@good/kit'), 'astryx.integration.mjs': "export default {components: './components'};\n", 'components/.keep': ''},
  }, "export default {integrations: ['@good/kit', '@nope/absent']};\n");
  await project('alias', {
    'kit-alias': {'package.json': pj('@real/kit'), 'astryx.integration.mjs': "export default {components: './components', themes: './gone'};\n", 'components/.keep': ''},
  });
}
