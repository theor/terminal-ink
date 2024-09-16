/** @type {import('svelte/action').Action<HTMLElement, string>}  */
export function foo(node) {
    // the node has been mounted in the DOM

    return {
        update(node) {
            // the value of `bar` has changed
        },

        destroy() {
            // the node has been removed from the DOM
        }
    };
}
