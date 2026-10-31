// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file components/index.ts
 * @input None
 * @output Every component the native package adds to, by core component name
 * @position The generator walks this list; each entry pairs with core's
 *   `<Name>/<Name>.doc.mjs`
 */

import type {NativeAdditions} from '../contract/fromComponentDoc.js';
import {avatar} from './Avatar.js';
import {avatarStatusDot} from './AvatarStatusDot.js';
import {badge} from './Badge.js';
import {button} from './Button.js';
import {card} from './Card.js';
import {divider} from './Divider.js';
import {heading} from './Heading.js';
import {hStack} from './HStack.js';
import {icon} from './Icon.js';
import {progressBar} from './ProgressBar.js';
import {selector} from './Selector.js';
import {switchControl} from './Switch.js';
import {text} from './Text.js';
import {thumbnail} from './Thumbnail.js';
import {textInput} from './TextInput.js';
import {vStack} from './VStack.js';

export const NATIVE_COMPONENTS: readonly NativeAdditions[] = [
  avatar,
  avatarStatusDot,
  badge,
  button,
  card,
  divider,
  heading,
  hStack,
  icon,
  progressBar,
  selector,
  switchControl,
  text,
  thumbnail,
  textInput,
  vStack,
];
