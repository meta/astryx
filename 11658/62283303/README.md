# #11658 focused stills: main 66b2932a vs head 62283303

Real Google Chrome 157 (headless), DPR 2, Storybook built at each revision. Stories: `core-chatcomposer--flat` (rest, desktop hover, focus-within), `core-textinput--disabled-with-message` reached with Tab, `core-textinput--default` at rest. Frames are `<side>-<theme>-<mode>-<check>-<state>.png`.

| Theme | Page | Check | State | Edge main → head | vs its own fill: main → head | vs page body: main → head | Shadow at head |
| --- | --- | --- | --- | --- | --- | --- | --- |
| none | light | composer | rest | `rgb(204, 211, 219)` → `rgb(135, 141, 149)` | 1.51 → **3.35** (`rgb(255,255,255)`) | 1.37 → **3.03** (`rgb(241,244,247)`) | `—` |
| none | light | composer | hover | `rgb(204, 211, 219)` → `rgb(135, 141, 149)` | 1.51 → **3.35** (`rgb(255,255,255)`) | 1.37 → **3.03** (`rgb(241,244,247)`) | `color(srgb 0.529412 0.552941 0.584314 / 0.3) 0px 0px 0px 2px ins` |
| none | light | composer | focus-within | `rgb(0, 100, 224)` → `rgb(0, 100, 224)` | 5.39 → **5.39** (`rgb(255,255,255)`) | 4.88 → **4.88** (`rgb(241,244,247)`) | `rgba(0, 130, 251, 0.2) 0px 0px 0px 2px inset` |
| none | light | disabled-input | keyboard-focus | `rgb(0, 100, 224)` → `rgb(0, 100, 224)` | 5.39 → **5.39** (`rgb(255,255,255)`) | 4.88 → **4.88** (`rgb(241,244,247)`) | `rgba(0, 130, 251, 0.2) 0px 0px 0px 2px inset` |
| none | light | text-input | rest | `rgb(204, 211, 219)` → `rgb(135, 141, 149)` | 1.51 → **3.35** (`rgb(255,255,255)`) | 1.37 → **3.03** (`rgb(241,244,247)`) | `—` |
| none | dark | composer | rest | `rgb(73, 77, 83)` → `rgb(102, 106, 112)` | 1.71 → **2.67** (`rgb(40,41,44)`) | 2.22 → **3.47** (`rgb(17,17,18)`) | `—` |
| none | dark | composer | hover | `rgb(73, 77, 83)` → `rgb(102, 106, 112)` | 1.71 → **2.67** (`rgb(40,41,44)`) | 2.22 → **3.47** (`rgb(17,17,18)`) | `color(srgb 0.4 0.415686 0.439216 / 0.3) 0px 0px 0px 2px inset` |
| none | dark | composer | focus-within | `rgb(1, 113, 227)` → `rgb(1, 113, 227)` | 3.1 → **3.1** (`rgb(40,41,44)`) | 4.02 → **4.02** (`rgb(17,17,18)`) | `rgba(0, 130, 251, 0.247) 0px 0px 0px 2px inset` |
| none | dark | disabled-input | keyboard-focus | `rgb(1, 113, 227)` → `rgb(1, 113, 227)` | 3.5 → **3.5** (`rgb(31,31,34)`) | 4.02 → **4.02** (`rgb(17,17,18)`) | `rgba(0, 130, 251, 0.247) 0px 0px 0px 2px inset` |
| none | dark | text-input | rest | `rgb(73, 77, 83)` → `rgb(102, 106, 112)` | 1.93 → **3.02** (`rgb(31,31,34)`) | 2.22 → **3.47** (`rgb(17,17,18)`) | `—` |
| butter | light | composer | rest | `rgb(199, 196, 178)` → `rgb(137, 135, 122)` | 1.75 → **3.61** (`rgb(255,255,255)`) | 1.68 → **3.46** (`rgb(253,251,228)`) | `—` |
| butter | light | composer | hover | `rgb(199, 196, 178)` → `rgb(137, 135, 122)` | 1.75 → **3.61** (`rgb(255,255,255)`) | 1.68 → **3.46** (`rgb(253,251,228)`) | `color(srgb 0.537255 0.529412 0.478431 / 0.3) 0px 0px 0px 2px ins` |
| butter | light | composer | focus-within | `rgb(34, 91, 255)` → `rgb(34, 91, 255)` | 5.24 → **5.24** (`rgb(255,255,255)`) | 5.01 → **5.01** (`rgb(253,251,228)`) | `rgba(34, 91, 255, 0.2) 0px 0px 0px 2px inset` |
| butter | light | disabled-input | keyboard-focus | `rgb(229, 227, 212)` → `rgb(137, 135, 122)` | 1.29 → **3.61** (`rgb(255,255,255)`) | 1.24 → **3.46** (`rgb(253,251,228)`) | `rgba(34, 91, 255, 0.2) 0px 0px 0px 2px inset` |
| butter | light | text-input | rest | `rgb(229, 227, 212)` → `rgb(137, 135, 122)` | 1.29 → **3.61** (`rgb(255,255,255)`) | 1.24 → **3.46** (`rgb(253,251,228)`) | `—` |
| butter | dark | composer | rest | `rgb(147, 145, 132)` → `rgb(121, 120, 106)` | 4.33 → **3.08** (`rgb(58,42,31)`) | 5.34 → **3.8** (`rgb(38,26,19)`) | `—` |
| butter | dark | composer | hover | `rgb(147, 145, 132)` → `rgb(121, 120, 106)` | 4.33 → **3.08** (`rgb(58,42,31)`) | 5.34 → **3.8** (`rgb(38,26,19)`) | `color(srgb 0.47451 0.470588 0.415686 / 0.3) 0px 0px 0px 2px inse` |
| butter | dark | composer | focus-within | `rgb(253, 238, 140)` → `rgb(253, 238, 140)` | 11.62 → **11.62** (`rgb(58,42,31)`) | 14.35 → **14.35** (`rgb(38,26,19)`) | `rgba(253, 238, 140, 0.25) 0px 0px 0px 2px inset` |
| butter | dark | disabled-input | keyboard-focus | `rgba(243, 242, 226, 0.1)` → `rgb(121, 120, 106)` | 1.33 → **3.5** (`rgb(46,33,23)`) | 1.44 → **3.8** (`rgb(38,26,19)`) | `rgba(253, 238, 140, 0.25) 0px 0px 0px 2px inset` |
| butter | dark | text-input | rest | `rgba(243, 242, 226, 0.1)` → `rgb(121, 120, 106)` | 1.33 → **3.5** (`rgb(46,33,23)`) | 1.44 → **3.8** (`rgb(38,26,19)`) | `—` |
| gothic | light | composer | rest | `rgb(73, 80, 86)` → `rgb(104, 114, 121)` | 1.79 → **2.99** (`rgb(36,41,45)`) | 2.28 → **3.8** (`rgb(16,19,20)`) | `—` |
| gothic | light | composer | hover | `rgb(73, 80, 86)` → `rgb(104, 114, 121)` | 1.79 → **2.99** (`rgb(36,41,45)`) | 2.28 → **3.8** (`rgb(16,19,20)`) | `color(srgb 0.407843 0.447059 0.47451 / 0.3) 0px 0px 0px 2px inse` |
| gothic | light | composer | focus-within | `rgb(232, 241, 246)` → `rgb(232, 241, 246)` | 12.83 → **12.83** (`rgb(36,41,45)`) | 16.3 → **16.3** (`rgb(16,19,20)`) | `rgba(232, 241, 246, 0.125) 0px 0px 0px 2px inset` |
| gothic | light | disabled-input | keyboard-focus | `rgb(232, 241, 246)` → `rgb(232, 241, 246)` | 16.3 → **16.3** (`rgb(16,19,20)`) | 16.3 → **16.3** (`rgb(16,19,20)`) | `rgba(232, 241, 246, 0.125) 0px 0px 0px 2px inset` |
| gothic | light | text-input | rest | `rgb(73, 80, 86)` → `rgb(104, 114, 121)` | 2.28 → **3.8** (`rgb(16,19,20)`) | 2.28 → **3.8** (`rgb(16,19,20)`) | `—` |
| gothic | dark | composer | rest | `rgb(73, 80, 86)` → `rgb(104, 114, 121)` | 1.79 → **2.99** (`rgb(36,41,45)`) | 2.28 → **3.8** (`rgb(16,19,20)`) | `—` |
| gothic | dark | composer | hover | `rgb(73, 80, 86)` → `rgb(104, 114, 121)` | 1.79 → **2.99** (`rgb(36,41,45)`) | 2.28 → **3.8** (`rgb(16,19,20)`) | `color(srgb 0.407843 0.447059 0.47451 / 0.3) 0px 0px 0px 2px inse` |
| gothic | dark | composer | focus-within | `rgb(232, 241, 246)` → `rgb(232, 241, 246)` | 12.83 → **12.83** (`rgb(36,41,45)`) | 16.3 → **16.3** (`rgb(16,19,20)`) | `rgba(232, 241, 246, 0.125) 0px 0px 0px 2px inset` |
| gothic | dark | disabled-input | keyboard-focus | `rgb(232, 241, 246)` → `rgb(232, 241, 246)` | 16.3 → **16.3** (`rgb(16,19,20)`) | 16.3 → **16.3** (`rgb(16,19,20)`) | `rgba(232, 241, 246, 0.125) 0px 0px 0px 2px inset` |
| gothic | dark | text-input | rest | `rgb(73, 80, 86)` → `rgb(104, 114, 121)` | 2.28 → **3.8** (`rgb(16,19,20)`) | 2.28 → **3.8** (`rgb(16,19,20)`) | `—` |

The flat ChatComposer's fill is the popover token. Against the card:

- none light: flat ChatComposer edge `rgb(135, 141, 149)` vs the card `rgb(255,255,255)` = 3.35:1
- none dark: flat ChatComposer edge `rgb(102, 106, 112)` vs the card `rgb(31,31,34)` = 3.02:1
- gothic light: flat ChatComposer edge `rgb(104, 114, 121)` vs the card `rgb(25,29,32)` = 3.45:1
- gothic dark: flat ChatComposer edge `rgb(104, 114, 121)` vs the card `rgb(25,29,32)` = 3.45:1
