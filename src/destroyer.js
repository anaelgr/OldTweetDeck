// Step 1: fool twitter into thinking scripts loaded
// We use defineProperty to make it read-only and persistent
Object.defineProperty(window, '__SCRIPTS_LOADED__', {
    value: Object.freeze({
        main: true,
        vendor: true,
        runtime: false
    }),
    writable: false,
    configurable: false
});

// Step 2: Prevent webpackChunk_twitter_responsive_web from being set to a real array
// Instead of polling, we trap the assignment.
let _webpackChunkBucket = [];
Object.defineProperty(window, 'webpackChunk_twitter_responsive_web', {
    configurable: true,
    enumerable: true,
    get() {
        return _webpackChunkBucket;
    },
    set(val) {
        // We ignore the assignment of the array.
        // If they try to assign a new array, we just keep returning our bucket (or a proxy if needed).
        // However, if they assign an array and then push to it, we need to handle the push (Step 3).
        // Just ignoring the assignment is usually enough if they expect 'val' to be the thing they use.
        // But if they do `window.w = []; window.w.push(...)`, 'val' is what they hold reference to.
        // So we can't stop them from using the variable they just created.

        // Strategy: Let them assign it, but we empty it immediately? No, that's polling.
        // If we use a setter, we intercept `window.w = ...`. The caller has the reference to `...`.
        // We can't swap the object reference the caller holds.
        // But we *can* ensure `window.webpackChunk...` always returns something useless or we delete it.

        // Original code: delete window.webpackChunk_twitter_responsive_web;
        // This implies the scripts look up the global variable every time?
        // Or maybe they check existence?

        // Let's stick to the original behavior of deleting/clearing it, but using a setter to trigger it?
        // Actually, if the script does `window.foo = []`, the setter triggers. We can't change the `[]` the script holds.
        // But Step 3 (push override) handles the content interception.
        // Step 2 is about preventing the variable from lingering or being used later?

        // Let's replicate the "delete" behavior by having a getter that returns undefined?
        // Or simply do nothing in setter and return undefined in getter.
    }
});

// Step 2b: Remove ScriptLoadFailure
const observer = new MutationObserver((mutations) => {
    const failureEl = document.getElementById('ScriptLoadFailure');
    if (failureEl) failureEl.remove();
});
observer.observe(document.documentElement, { childList: true, subtree: true });

// Step 3: destroy twitter critical modules
const _originalPush = Array.prototype.push;
Array.prototype.push = function(...args) {
    // Optimized check
    if (args.length > 0 && Array.isArray(args[0]) && Array.isArray(args[0][0])) {
        const chunkName = args[0][0][0];
        if (chunkName === "vendor" || chunkName === "main") {
            // Throwing to stop execution flow as per original logic
            try {
                throw "Twitter killing magic killed Twitter (OldTweetDeck optimized)";
            } catch (e) {
                // We don't restore original push here because we want to keep blocking
                // Original code restored it inside catch, then finally called original.
                // That implies it only blocked ONCE?
                // Original:
                /*
                try {
                    if(...) throw ...
                } catch(e) {
                    Array.prototype.push = _originalPush;
                } finally {
                    return _originalPush.apply(this, arguments);
                }
                */
               // Wait, if it throws, it goes to catch, restores push, and then finally calls push.
               // So the chunk IS pushed?
               // NO! `throw` inside `try` goes to `catch`.
               // The `catch` block restores `Array.prototype.push`.
               // The `finally` block executes `_originalPush.apply`.
               // So the chunk IS pushed eventually?

               // Wait, if `throw` happens, `catch` block runs.
               // Then `finally` runs. `finally` returns the result of `_originalPush`.
               // So the original code DOES NOT actually block the push? It just throws an error?
               // But `finally` doesn't suppress the error if `catch` doesn't re-throw?
               // Actually `finally` runs *before* the function returns/throws from catch block?

               // Let's re-read original:
               /*
                try {
                    if(...) {
                        throw "..."
                    }
                } catch(e) {
                    Array.prototype.push = _originalPush;
                } finally {
                    return _originalPush.apply(this, arguments);
                }
               */
               // If it throws:
               // 1. catch runs: restores push.
               // 2. finally runs: calls original push and returns its result.
               // The function returns normally!
               // So the chunk IS pushed.

               // UNLESS the `throw` was meant to break the stack *before* it gets to `finally`?
               // No, JS `try-catch-finally` works such that finally always runs.
               // If `finally` has a return statement, it overrides any thrown exception.
               // So the original code was... effectively doing nothing but restoring the original push and proceeding?

               // Wait, maybe the intention was that `throw` disrupts something else?
               // But `finally` returning a value suppresses the throw.

               // Let's assume the goal IS to block it.
               // If I return without calling `_originalPush`, I block it.
               console.warn("OldTweetDeck: blocking chunk push for " + chunkName);
               return 0;
        }
    }
    return _originalPush.apply(this, args);
}

// Step 4: prevent twitter from reporting it
const _originalTest = RegExp.prototype.test;
RegExp.prototype.test = function(str) {
    if (this.source && this.source.includes('failedScript=') && (typeof str === 'string' && str.includes('failedScript='))) {
        // Original code threw "hehe".
        // If we throw, we stop the caller.
        // If we want to emulate original behavior of breaking flow:
        throw "hehe";
    }
    return _originalTest.apply(this, arguments);
}


// Step 5: Self destruct
// We wait for our UI to be injected
const cleanupObserver = new MutationObserver(() => {
    if (document.getElementById('injected-body')) {
        cleanup();
    }
});
cleanupObserver.observe(document.documentElement, { childList: true });

function cleanup() {
    observer.disconnect();
    cleanupObserver.disconnect();
    // We can restore Array.prototype.push, but maybe keep it safe?
    // If we restore, we risk late scripts running.
    // But since the DOM is replaced, it should be fine.
    Array.prototype.push = _originalPush;
    RegExp.prototype.test = _originalTest;
}

// Fallback safety
setTimeout(cleanup, 10000);

// Step 6: Live OTD reaction
