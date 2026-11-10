// A project whose astryx.config sets a discover source (it fails for some requests; integrations export bad sources).
import * as path from 'node:path';

export default async function (dir, h) {
  await h.makeApp(dir);
  await h.writeJson(path.join(dir, 'package.json'), {
    name: 'proj',
    version: '1.0.0',
    dependencies: {'@astryxdesign/core': h.CORE_VERSION, '@test/kit': '3.1.4'},
  });

  const kit = path.join(dir, 'node_modules', '@test', 'kit');
  await h.writeJson(path.join(kit, 'package.json'), {name: '@test/kit', version: '3.1.4'});
  await h.writeFile(path.join(kit, 'astryx.integration.mjs'), "export default {components: './components'};\n");
  await h.writeFile(path.join(kit, 'components', 'Dial.doc.mjs'), "export const docs = {name: 'Dial', usage: {description: 'A dial.'}};\n");
  await h.writeFile(path.join(kit, 'components', 'Dial.tsx'), 'export function Dial() { return null; }\n');

  const v2 = path.join(dir, 'node_modules', '@test', 'v2');
  await h.writeJson(path.join(v2, 'package.json'), {name: '@test/v2', version: '1.0.0'});
  await h.writeFile(path.join(v2, 'astryx.integration.mjs'), "export default {};\nexport const discover = async () => ({schemaVersion: 2});\n");
  const nf = path.join(dir, 'node_modules', '@test', 'notfn');
  await h.writeJson(path.join(nf, 'package.json'), {name: '@test/notfn', version: '1.0.0'});
  await h.writeFile(path.join(nf, 'astryx.integration.mjs'), "export default {};\nexport const discover = 42;\n");
  await h.writeFile(path.join(dir, 'astryx.config.mjs'), CONFIG);
}

const CONFIG = `
const packages = [
  {
    package: '@test/kit',
    integration: 'test-kit',
    aliases: [],
    latest: '3.2.0',
    versions: [
      {version: '3.2.0', publishedAt: '2026-09-29T00:00:00.000Z', prerelease: false, status: 'ok'},
      {version: '3.1.4', publishedAt: '2026-09-01T00:00:00.000Z', prerelease: false, status: 'ok'},
    ],
    contributions: [{kind: 'component', name: 'Dial'}],
  },
  {
    package: '@test/charts',
    integration: 'test-charts',
    aliases: [],
    latest: '2.0.0',
    versions: [
      {version: '2.1.0-beta.1', publishedAt: '2026-09-25T00:00:00.000Z', prerelease: true, status: 'ok'},
      {version: '2.0.0', publishedAt: '2026-09-20T00:00:00.000Z', prerelease: false, status: 'ok'},
    ],
    contributions: [
      {kind: 'component', name: 'Chart'},
      {kind: 'template', name: 'pages/Report'},
    ],
  },
  {
    package: '@test/boards',
    integration: 'test-boards',
    aliases: [],
    latest: '1.0.0',
    versions: [
      {version: '1.0.0', publishedAt: '2026-09-10T00:00:00.000Z', prerelease: false, status: 'ok'},
    ],
    contributions: [{kind: 'template', name: 'pages/DialBoard'}],
  },
];

export default {
  integrations: ['@test/kit', '@test/v2', '@test/notfn'],
  async discover({package: name}) {
    if (name === '@test/charts') throw new Error('offline');
    if (name === '@test/boards') return {schemaVersion: 1, source: {name: '', generatedAt: 'x', complete: true}, packages: []};
    if (name === '@test/kit') throw 'plain string';
    return {
      schemaVersion: 1,
      source: {name: 'Test catalog', generatedAt: '2026-09-30T00:00:00.000Z', complete: true},
      packages: packages.filter(p => name == null || p.package === name),
    };
  },
};
`;
