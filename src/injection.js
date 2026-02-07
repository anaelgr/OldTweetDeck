/**
 * SECURITY WARNING: Remote Code Injection
 *
 * This file fetches and executes JavaScript code from remote sources (GitHub, oldtd.org).
 * This design choice is intentional to allow for rapid updates and hotfixes without
 * requiring a full extension update review process.
 *
 * RISK: This creates a potential Remote Code Execution (RCE) vulnerability if the
 * source domains are compromised.
 *
 * CONSTRAINT: The user has explicitly requested NOT to disable this mechanism.
 */

let extId = window.OTD_EXTENSION_ID;
let isFirefox = navigator.userAgent.indexOf('Firefox') > -1;
const OTD_ALWAYS_USE_LOCAL = localStorage.getItem("OTDalwaysUseLocalFiles");

if(!window.chrome) window.chrome = {};
if(!window.chrome.runtime) window.chrome.runtime = {};
window.chrome.runtime.getURL = url => {
    if(!url.startsWith('/')) url = `/${url}`;
    return `${isFirefox ? 'moz-extension://' : 'chrome-extension://'}${extId}${url}`;   
}

if (extId) {
    // Already have ID from content script injection
    main();
}

window.addEventListener('message', e => {
    if(e.source !== window) return;
    if(e.data.extensionId) {
        if (!extId) {
            extId = e.data.extensionId;
            main();
        }
    } else if(e.data.additionalScripts) {
        for(let scriptSource of e.data.additionalScripts) {
            let scriptElement = document.createElement("script");
            scriptElement.innerHTML = scriptSource;
            document.head.appendChild(scriptElement);
        }
    }
});
window.postMessage('extensionId', window.location.origin);
window.postMessage('getAdditionalScripts', window.location.origin);

async function getResource(localPath, remoteUrl) {
    const fetchLocal = () => fetch(chrome.runtime.getURL(localPath)).then(r => r.text()).catch(() => "");

    // 1. If remote is disabled, go straight to local
    if (OTD_ALWAYS_USE_LOCAL || !remoteUrl || (!remoteUrl.startsWith('http://') && !remoteUrl.startsWith('https://'))) {
        return fetchLocal();
    }

    try {
        const cache = await caches.open('otd-resources');
        const cachedRes = await cache.match(remoteUrl);

        // Background update function (Stale-While-Revalidate)
        const updateCache = async () => {
            try {
                const r = await fetch(remoteUrl);
                if (r.ok) {
                    const txt = await r.text();
                    if (txt.length > 30) {
                        await cache.put(remoteUrl, new Response(txt));
                    }
                }
            } catch (e) { /* background update failed, next load will try again */ }
        };

        // 2. If we have a valid cached version, return it immediately and update in background
        if (cachedRes) {
            const cachedTxt = await cachedRes.text();
            if (cachedTxt.length > 30) {
                setTimeout(updateCache, 100);
                return cachedTxt;
            }
        }

        // 3. Not in cache or invalid, try to fetch remote
        try {
            const r = await fetch(remoteUrl);
            if (r.ok) {
                const txt = await r.text();
                if (txt.length > 30) {
                    await cache.put(remoteUrl, new Response(txt));
                    return txt;
                }
            }
        } catch (e) {
            console.warn(`Remote fetch failed for ${remoteUrl}, falling back to local`, e);
        }
    } catch (e) {
        console.error(`Cache logic failed for ${remoteUrl}`, e);
    }

    // 4. Fallback to local if remote/cache fails
    return fetchLocal();
}

async function main() {
    // Start fetching all resources in parallel
    const cssPromise = getResource('/files/bundle.css', 'https://raw.githubusercontent.com/dimdenGD/OldTweetDeck/main/files/bundle.css');
    const htmlPromise = fetch(chrome.runtime.getURL('/files/index.html')).then(r => r.text());

    const resources = [
        { key: 'challenge_js', local: '/src/challenge.js', remote: 'https://raw.githubusercontent.com/dimdenGD/OldTweetDeck/main/src/challenge.js' },
        { key: 'interception_js', local: '/src/interception.js', remote: 'https://raw.githubusercontent.com/dimdenGD/OldTweetDeck/main/src/interception.js' },
        { key: 'vendor_js', local: '/files/vendor.js', remote: 'https://raw.githubusercontent.com/dimdenGD/OldTweetDeck/main/files/vendor.js' },
        { key: 'bundle_js', local: '/files/bundle.js', remote: 'https://raw.githubusercontent.com/dimdenGD/OldTweetDeck/main/files/bundle.js' },
        { key: 'twitter_text', local: '/files/twitter-text.js', remote: 'https://raw.githubusercontent.com/dimdenGD/OldTweetDeck/main/files/twitter-text.js' }
    ];

    const scriptPromises = resources.map(res => getResource(res.local, res.remote));

    // Wait for HTML and CSS first to prevent FOUC
    const [bundle_css, html_raw] = await Promise.all([cssPromise, htmlPromise]);

    let html = html_raw;
    if (bundle_css) {
        // Use Blob URL for large CSS to improve parsing performance and keep DOM clean
        const blob = new Blob([bundle_css], { type: 'text/css' });
        const cssUrl = URL.createObjectURL(blob);
        const styleTag = `<link rel="stylesheet" id="otd-bundle-css" href="${cssUrl}">`;
        html = html.replace('</head>', `${styleTag}</head>`);
    }

    document.documentElement.innerHTML = html;

    // Now wait for scripts
    const results = await Promise.all(scriptPromises);

    // Map results back to variables
    const [challenge_js, interception_js, vendor_js, bundle_js, twitter_text] = results;

    let challenge_js_script = document.createElement("script");
    let challenge_js_content = challenge_js.replaceAll('SOLVER_URL', chrome.runtime.getURL("solver.html"));
    if(!challenge_js_content.includes("OTDChallengeReady")) {
        challenge_js_content += "\nwindow.dispatchEvent(new CustomEvent('OTDChallengeReady'));";
    }
    challenge_js_script.innerHTML = challenge_js_content;
    document.head.appendChild(challenge_js_script);

    let interception_js_script = document.createElement("script");
    interception_js_script.innerHTML = interception_js;
    document.head.appendChild(interception_js_script);

    let vendor_js_script = document.createElement("script");
    vendor_js_script.innerHTML = vendor_js;
    document.head.appendChild(vendor_js_script);

    let bundle_js_script = document.createElement("script");
    bundle_js_script.innerHTML = bundle_js;
    document.head.appendChild(bundle_js_script);

    let twitter_text_script = document.createElement("script");
    twitter_text_script.innerHTML = twitter_text;
    document.head.appendChild(twitter_text_script);


    // OPTIMIZED: Use MutationObserver to remove bad body immediately
    (() => {
        const clean = () => {
            let badBody = document.querySelector('body:not(#injected-body)');
            if (badBody) {
                let badHead = document.querySelector('head:not(#injected-head)');
                if(badHead) badHead.remove();
                badBody.remove();
                return true;
            }
            return false;
        };

        if(!clean()) {
            const observer = new MutationObserver((mutations, obs) => {
                if(clean()) {
                    obs.disconnect();
                }
            });
            observer.observe(document.documentElement, {
                childList: true,
                subtree: false
            });
            setTimeout(() => observer.disconnect(), 10000);
        }
    })();

    // FIXED: Use MutationObserver for account injection instead of polling
    function injectAccountObserver() {
        const accountsBtn = document.querySelector('a[data-title="Accounts"]');
        if (accountsBtn) {
            attachAccountListener(accountsBtn);
            return;
        }

        const observer = new MutationObserver((mutations, obs) => {
            const accountsBtn = document.querySelector('a[data-title="Accounts"]');
            if (accountsBtn) {
                attachAccountListener(accountsBtn);
                obs.disconnect();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Safety timeout to stop observing if it never appears
        setTimeout(() => observer.disconnect(), 30000);
    }

    function attachAccountListener(btn) {
        btn.addEventListener("click", function() {
            // console.log("setting account cookie");
            window.postMessage('setcookie', window.location.origin);
        });
    }

    injectAccountObserver();
};
