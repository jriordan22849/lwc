import assert from "./assert.js";
import { patch } from "./patch.js";
import { scheduleRehydration } from "./vm.js";
import { invokeComponentAttributeChangedCallback } from "./invoker.js";
import {
    updateComponentProp,
} from "./component.js";
import { getComponentDef } from "./def.js";
import { c } from "./api.js";
import { defineProperties, create } from "./language.js";

const { getAttribute, setAttribute, removeAttribute } = Element.prototype;
const CAMEL_REGEX = /-([a-z])/g;
const attrNameToPropNameMap = create(null);

function getPropNameFromAttrName(attrName: string): string {
    let propName = attrNameToPropNameMap[attrName];
    if (!propName) {
        propName = attrName.replace(CAMEL_REGEX, (g: string): string => g[1].toUpperCase());
        attrNameToPropNameMap[attrName] = propName;
    }
    return propName;
}

function linkAttributes(element: HTMLElement, vm: VM) {
    assert.vm(vm);
    const { def: { props: propsConfig, observedAttrs } } = vm;
    // replacing mutators and accessors on the element itself to catch any mutation
    element.getAttribute = (attrName: string): string | null => {
        attrName = attrName.toLocaleLowerCase();
        const propName = getPropNameFromAttrName(attrName);
        if (propsConfig[propName]) {
            assert.block(() => {
                throw new ReferenceError(`Invalid Attribute "${attrName}" for component ${vm}. Instead of using \`element.getAttribute("${attrName}")\` you can access the corresponding public property using \`element.${propName};\`. This distintion is important because getAttribute will returned the value casted to string.`);
            });
            return;
        }
        return getAttribute.call(element, attrName);
    };
    element.setAttribute = (attrName: string, newValue: any) => {
        attrName = attrName.toLocaleLowerCase();
        const propName = getPropNameFromAttrName(attrName);
        if (propsConfig[propName]) {
            assert.block(() => {
                throw new ReferenceError(`Invalid Attribute "${attrName}" for component ${vm}. Instead of using \`element.setAttribute("${attrName}", someValue)\` you can update the corresponding public property using \`element.${propName} = someValue;\`. This distintion is important because setAttribute will cast the new value to string before setting it into the corresponding property.`);
            });
            return;
        }
        const oldValue = getAttribute.call(element, attrName);
        setAttribute.call(element, attrName, newValue);
        newValue = getAttribute.call(element, attrName);
        if (observedAttrs[attrName] && oldValue !== newValue) {
            invokeComponentAttributeChangedCallback(vm, attrName, oldValue, newValue);
        }
    };
    element.removeAttribute = (attrName: string) => {
        attrName = attrName.toLocaleLowerCase();
        const propName = getPropNameFromAttrName(attrName);
        if (propsConfig[propName]) {
            assert.block(() => {
                throw new ReferenceError(`Invalid Attribute "${attrName}" for component ${vm}. Instead of using \`element.removeAttribute("${attrName}")\` you can update the corresponding public property using \`element.${propName} = undefined;\`. This distintion is important because removeAttribute will set the corresponding property value to \`null\`.`);
            });
            return;
        }

        assert.block(() => {
            const propName = getPropNameFromAttrName(attrName);
            if (propsConfig[propName]) {
                updateComponentProp(vm, propName, newValue);
                if (vm.isDirty) {
                    console.log(`Scheduling ${vm} for rehydration.`);
                    scheduleRehydration(vm);
                }
            }
        });
        const oldValue = getAttribute.call(element, attrName);
        removeAttribute.call(element, attrName);
        const newValue = getAttribute.call(element, attrName);
        if (observedAttrs[attrName] && oldValue !== newValue) {
            invokeComponentAttributeChangedCallback(vm, attrName, oldValue, newValue);
        }
    };
}

function linkProperties(element: HTMLElement, vm: VM) {
    assert.vm(vm);
    const { component, def: { props: propsConfig, methods } } = vm;
    const descriptors: PropertyDescriptorMap = {};
    // linking public methods
    for (let methodName in methods) {
        descriptors[methodName] = {
            value: function (): any {
                return component[methodName](...arguments);
            },
            configurable: false,
            writable: false,
            enumerable: false,
        };
    }
    // linking reflective properties
    for (let propName in propsConfig) {
        descriptors[propName] = {
            get: (): any => component[propName],
            set: (newValue: any) => {
                updateComponentProp(vm, propName, newValue);
                if (vm.isDirty) {
                    console.log(`Scheduling ${vm} for rehydration.`);
                    scheduleRehydration(vm);
                }
            },
            configurable: false,
            enumerable: true,
        };
    }
    defineProperties(element, descriptors);
}

function getInitialProps(element: HTMLElement, Ctor: Class<Component>): HashTable<any> {
    const { props: config } = getComponentDef(Ctor);
    const props = {};
    for (let propName in config) {
        if (propName in element) {
            props[propName] = element[propName];
        }
    }
    return props;
}

function getInitialSlots(element: HTMLElement, Ctor: Class<Component>): HashTable<any> {
    const { slotNames } = getComponentDef(Ctor);
    if (!slotNames) {
        return;
    }
    // TODO: implement algo to resolve slots
    return undefined;
}

/**
 * This algo mimics 2.5 of web component specification somehow:
 * https://www.w3.org/TR/custom-elements/#upgrades
 */
function upgradeElement(element: HTMLElement, Ctor: Class<Component>) {
    if (!Ctor) {
        throw new TypeError(`Invalid Component Definition: ${Ctor}.`);
    }
    const props = getInitialProps(element, Ctor);
    const slotset = getInitialSlots(element, Ctor);
    const tagName = element.tagName.toLowerCase();
    const vnode = c(tagName, Ctor, { props, slotset, className: element.className || undefined });
    vnode.isRoot = true;
    // TODO: eventually after updating snabbdom we can use toVNode(element)
    // as the first argument to reconstruct the vnode that represents the
    // current state.
    const { vm } = patch(element, vnode);
    linkAttributes(element, vm);
    // TODO: for vnode with element we might not need to do any of these.
    linkProperties(element, vm);
}

/**
 * This method is almost identical to document.createElement
 * (https://developer.mozilla.org/en-US/docs/Web/API/Document/createElement)
 * with the slightly difference that in the options, you can pass the `is`
 * property set to a Constructor instead of just a string value. E.g.:
 *
 * const el = createElement('x-foo', { is: FooCtor });
 *
 * If the value of `is` attribute is not a constructor,
 * then we fallback to the normal Web-Components workflow.
 */
export function createElement(tagName: string, options: any = {}): HTMLElement {
    let Ctor = typeof options.is === 'function' ? options.is : null;
    if (Ctor) {
        delete options.is;
    }
    const element = document.createElement(tagName, options);
    if (Ctor && element instanceof HTMLElement) {
        upgradeElement(element, Ctor);
    }
    return element;
}

// TODO: how can a user dismount a component and kick in the destroy mechanism?