import { Element } from "../html-element.js";
import { createElement } from "../upgrade.js";
import assert from 'power-assert';

describe('Raptor.Element', () => {
    describe('#getBoundingClientRect()', () => {

        it('should return empty during construction', () => {
            let rect;
            const def = class MyComponent extends Element {
                constructor() {
                    super();
                    rect = this.getBoundingClientRect();
                }
            }
            createElement('x-foo', { is: def });
            assert.deepEqual(rect, {
                bottom: 0,
                height: 0,
                left: 0,
                right: 0,
                top: 0,
                width: 0,
            });
        });

        it('should have a valid classList during construction', () => {
            let containsFoo = false;
            const def = class MyComponent extends Element {
                constructor() {
                    super();
                    this.classList.add('foo');
                    containsFoo = this.classList.contains('foo');
                }
            }
            createElement('x-foo', { is: def });
            assert(containsFoo === true, 'classList does not contain "foo"');
        });

    });
});