// Step 0: Unregister all service workers to prevent modern Twitter from interfering
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
        for (let registration of registrations) {
            registration.unregister();
        }
    });
}

// Step 1: fool twitter into thinking scripts loaded
window.__SCRIPTS_LOADED__ = Object.freeze({
    main: true,
    vendor: true,
    runtime: false
});

// Step 2: Intercept global variable assignment efficiently
try {
    Object.defineProperty(window, 'webpackChunk_twitter_responsive_web', {
        get() { return undefined; },
        set(val) { return undefined; },
        configurable: false
    });
} catch(e) {
    // Fallback if already defined (rare in run_at: document_start)
    delete window.webpackChunk_twitter_responsive_web;
}

// Step 3: Use MutationObserver instead of polling to clean up DOM
const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
            if (node.id === 'ScriptLoadFailure') {
                node.remove();
            }
        }
    }
    // Ensure scripts loaded state remains frozen
    if (!window.__SCRIPTS_LOADED__?.main) {
        window.__SCRIPTS_LOADED__ = Object.freeze({
            main: true,
            vendor: true,
            runtime: false
        });
    }
});

observer.observe(document.documentElement, {
    childList: true,
    subtree: true
});


// Step 4: destroy twitter critical modules
let _originalPush = Array.prototype.push;
Array.prototype.push = function() {
    try {
        const arg = arguments[0];
        if (arg && Array.isArray(arg) && Array.isArray(arg[0])) {
            const chunkIds = arg[0];
            // If it's a webpack chunk push (array of 2 or 3 elements, first is array of ids)
            // We only allow it if it's OldTweetDeck's webpackJsonp
            if (this !== window.webpackJsonp && typeof chunkIds[0] !== 'undefined') {
                console.warn("OldTweetDeck: Blocked attempt to load unknown script chunk", chunkIds);
                return this.length;
            }
        }
    } catch(e) {
        // Safe catch-all for weird objects
    }
    return _originalPush.apply(this, arguments);
}

// Step 5: prevent twitter from reporting it
let _originalTest = RegExp.prototype.test;
RegExp.prototype.test = function() {
    try {
        if(this.toString() === '/[?&]failedScript=/') {
            RegExp.prototype.test = _originalTest;
            return false;
        };
    } catch(e) {
        console.error(e);
    }
    try {
        return _originalTest.apply(this, arguments);
    } catch(e) {
        return false;
    }
}

// Step 6: Cleanup
// We keep the observer running for a bit, then disconnect to save resources
setTimeout(() => {
    observer.disconnect();
    Array.prototype.push = _originalPush;
    RegExp.prototype.test = _originalTest;
}, 5000);
