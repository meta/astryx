// An app whose astryx.config still uses layout.components (migrated in 0.1.3).
import * as path from 'node:path';

export default function (dir, {makeApp, writeFile}) {
  makeApp(dir, {name: 'config-app'});
  writeFile(
    path.join(dir, 'astryx.config.mjs'),
    `export default {
  layout: {
    components: {
      Hero: './src/Hero.tsx',
      Footer: {from: './src/Footer.tsx'},
    },
  },
};
`,
  );
  writeFile(path.join(dir, 'src/Hero.tsx'), 'export function Hero() { return null; }\n');
}
