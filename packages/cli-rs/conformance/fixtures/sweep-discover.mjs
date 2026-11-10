// Projects whose discover source answers with publish dates in the formats
// V8's Date.parse reads beyond ISO 8601.
import * as path from 'node:path';

const config = packages => `
export default {
  async discover() {
    return {
      schemaVersion: 1,
      source: {name: 'Sweep catalog', generatedAt: '2026-09-30T00:00:00.000Z', complete: true},
      packages: ${JSON.stringify(packages)},
    };
  },
};
`;

const v = (version, publishedAt) => ({version, publishedAt, prerelease: false, status: 'ok'});

export default async function (dir, h) {
  await h.makeApp(dir);
  await h.writeFile(
    path.join(dir, 'astryx.config.mjs'),
    config([
      {
        package: '@test/dates',
        integration: 'test-dates',
        aliases: [],
        latest: '1.5.0',
        versions: [
          v('1.0.0', 'Jan 5, 2026'),
          v('1.1.0', '2026-02-01 10:00:00'),
          v('1.4.0', 'garbage'),
          v('1.2.0', 'Tue, 03 Mar 2026 10:00:00 GMT'),
          v('1.3.0', '2026/04/04'),
          v('1.5.0', '2026-05-05T10:00:00+0200'),
          v('1.6.0', '5 June 2026 3:15 pm PST'),
          v('1.7.0', '2026-07-01T00:00:00.000Z'),
        ],
        contributions: [{kind: 'component', name: 'Dated'}],
      },
    ]),
  );
}
