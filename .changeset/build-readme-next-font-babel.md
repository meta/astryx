---
'@astryxdesign/build': patch
---

[docs] The Next.js setup in the README says that its Babel config turns off SWC, which `next/font` needs, so a fresh `create-next-app` layout must drop its `next/font` import before the webpack source build will compile. (#9439)

@cixzhang
