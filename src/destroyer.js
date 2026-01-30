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
        if(arguments[0]?.[0]?.[0] === "vendor" || arguments[0]?.[0]?.[0] === "main") {
            // Throwing is expensive if caught in a loop, but necessary here to break execution flow of the loader
            console.log("OldTweetDeck: Blocked attempt to load Twitter script");
            throw "Twitter killing magic killed Twitter";
        }
    } catch(e) {
        if(e === "Twitter killing magic killed Twitter") {
            throw e;
        }
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
