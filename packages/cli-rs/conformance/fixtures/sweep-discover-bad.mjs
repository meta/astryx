// A project whose discover source answers with a catalog whose aliases are
// both too many and invalid: zod reports the item before the length.
import * as path from 'node:path';

const CONFIG = `
export default {
  async discover() {
    return {
      schemaVersion: 1,
      source: {name: 'Bad catalog', generatedAt: '2026-09-30T00:00:00.000Z', complete: true},
      packages: [{
        package: '@test/bad',
        integration: 'test-bad',
        aliases: ['', ...Array.from({length: 70}, (_, i) => 'alias-' + i)],
        latest: null,
        versions: [],
        contributions: [],
      }],
    };
  },
};
`;

export default async function (dir, h) {
  await h.makeApp(dir);
  await h.writeFile(path.join(dir, 'astryx.config.mjs'), CONFIG);
}
