// Theme sources for the old-Core adaptation guard, over an app with an older
// published @astryxdesign/core.
import * as fs from 'node:fs';
import * as path from 'node:path';
import {makeOldCoreApp} from './_oldcore.mjs';

const THEMES = {
  'plain.mjs': "export default {name:'plain', tokens:{'--color-bg':'#fff'}};\n",
  'ordered.mjs': "export default {name:'ordered', tokens:{'--spacing-4':'16px'}, adaptations:{rules:[{when:{contrast:'more'}, value:{tokens:{'--spacing-4':'20px'}}}]}};\n",
  'typo.mjs': "import {defineTheme} from '@astryxdesign/core/theme';\nexport default defineTheme({name:'typo', tokens:{'--color-bg':'#fff'}, typography:{body:{family:'Inter'}}, radius:{base:4}});\n",
  'kid.mjs': "import {defineTheme} from '@astryxdesign/core/theme';\nconst base = defineTheme({name:'b', tokens:{}, adaptations:{rules:[{when:{contrast:'more'}, value:{tokens:{'--x':'1'}}}]}});\nexport default defineTheme({name:'kid', extends: base, tokens:{'--color-bg':'#000'}});\n",
  'built.mjs': "export const t = {name:'built', tokens:{'--color-bg':'#fff'}, __adaptations:{rules:[]}};\n",
  'tla.mjs': "import {defineTheme} from '@astryxdesign/core/theme';\nawait Promise.resolve();\nexport default defineTheme({name:'tla', tokens:{'--color-bg':'#fff'}});\n",
  'axes.mjs': "import {defineTheme} from '@astryxdesign/core/theme';\nconst base = defineTheme({name:'tb', tokens:{}, typography:{body:{family:'Inter', weights:{regular:400}}, heading:{family:'Lora'}, scale:{base:16}}, motion:{speed:1}});\nexport default defineTheme({name:'tk', extends: base, typography:{body:{family:'Roboto'}}, radius:{base:2}, color:{hue:200}});\n",
  'widths.mjs': "import {defineTheme} from '@astryxdesign/core/theme';\nexport default defineTheme({name:'widths', tokens:{}, adaptations:{widthBreakpoints:{sm:640, md:768, lg:1024, xl:1280, '2xl':1536}}});\n",
  'widths-custom.mjs': "import {defineTheme} from '@astryxdesign/core/theme';\nexport default defineTheme({name:'widths-custom', tokens:{}, adaptations:{widthBreakpoints:{md:900}}});\n",
};

export function makeThemesOldCore(dir, h, version) {
  makeOldCoreApp(dir, h, version);
  const themes = path.join(dir, 'themes');
  fs.mkdirSync(themes, {recursive: true});
  for (const [name, source] of Object.entries(THEMES)) fs.writeFileSync(path.join(themes, name), source);
}
