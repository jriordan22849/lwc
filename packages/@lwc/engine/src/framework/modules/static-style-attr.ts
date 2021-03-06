/*
 * Copyright (c) 2018, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: MIT
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/MIT
 */
import { isUndefined } from '../../shared/language';
import { VNode } from '../../3rdparty/snabbdom/types';

// The HTML style property becomes the vnode.data.styleMap object when defined as a string in the template.
// The compiler takes care of transforming the inline style into an object. It's faster to set the
// different style properties individually instead of via a string.
function createStyleAttribute(vnode: VNode) {
    const {
        elm,
        data: { styleMap },
    } = vnode;
    if (isUndefined(styleMap)) {
        return;
    }

    const { style } = elm as HTMLElement;

    for (const name in styleMap) {
        style[name] = styleMap[name];
    }
}

export default {
    create: createStyleAttribute,
};
