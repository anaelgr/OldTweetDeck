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

let extId;
let isFirefox = navigator.userAgent.indexOf('Firefox') > -1;
const OTD_ALWAYS_USE_LOCAL = localStorage.getItem("OTDalwaysUseLocalFiles");

if(!window.chrome) window.chrome = {};
if(!window.chrome.runtime) window.chrome.runtime = {};
window.chrome.runtime.getURL = url => {
    if(!url.startsWith('/')) url = `/${url}`;
    return `${isFirefox ? 'moz-extension://' : 'chrome-extension://'}${extId}${url}`;   
}
window.addEventListener('message', e => {
    if(e.source !== window) return;
    if(e.data.extensionId) {
        // console.log("got extensionId", e.data.extensionId);
        extId = e.data.extensionId;
        main();
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
    let content = "";
    
    // 1. Always try Local first as baseline
    try {
        const localUrl = chrome.runtime.getURL(localPath);
        const r = await fetch(localUrl);
        if (r.ok) content = await r.text();
    } catch (e) {
        console.warn(`Local fetch failed for ${localPath}`, e);
    }

    // 2. If allowed, try Remote (with Stale-While-Revalidate Cache)
    if (!OTD_ALWAYS_USE_LOCAL && remoteUrl && (remoteUrl.startsWith('http://') || remoteUrl.startsWith('https://'))) {
        try {
             const cache = await caches.open('otd-resources');
             const cachedRes = await cache.match(remoteUrl);

             // Background update function
             const updateCache = async () => {
                 try {
                     const r = await fetch(remoteUrl);
                     if (r.ok) {
                         const txt = await r.text();
                         if (txt.length > 30) {
                             await cache.put(remoteUrl, new Response(txt));
                             // console.log(`Background updated: ${remoteUrl}`);
                         }
                     }
                 } catch (e) { console.error("Background update failed", e); }
             };

             if (cachedRes) {
                 const cachedTxt = await cachedRes.text();
                 if (cachedTxt.length > 30) {
                     content = cachedTxt;
                     // console.log(`Using cached ${remoteUrl}`);
                     // Trigger background update without awaiting
                     setTimeout(updateCache, 100);
                 } else {
                     // Invalid cache, treat as no cache
                     await updateCache();
                     // We might have updated cache now, try to read it?
                     // Or just fall back to what we fetched.
                     // For simplicity, if cache was bad, we rely on the fetch inside updateCache
                     // but we need the result.
                     // Re-fetch for use:
                     const r = await fetch(remoteUrl);
                     if(r.ok) content = await r.text();
                 }
             } else {
                 // No cache, blocking fetch
                 // console.log(`Fetching remote (no cache) ${remoteUrl}`);
                 const r = await fetch(remoteUrl);
                 if (r.ok) {
                     const txt = await r.text();
                     if (txt.length > 30) {
                         content = txt;
                         await cache.put(remoteUrl, new Response(txt));
                     }
                 }
             }
        } catch (e) {
            console.error(`Remote logic failed for ${remoteUrl}, using local`, e);
        }
    }
    return content;
}

async function main() {
    let html = await fetch(chrome.runtime.getURL('/files/index.html')).then(r => r.text());
    document.documentElement.innerHTML = html;

    // CSS should be injected as early as possible to prevent FOUC
    const cssPromise = getResource('/files/bundle.css', 'https://raw.githubusercontent.com/dimdenGD/OldTweetDeck/main/files/bundle.css');
    cssPromise.then(bundle_css => {
        if (bundle_css) {
            let bundle_css_style = document.createElement("style");
            bundle_css_style.innerHTML = bundle_css;
            document.head.appendChild(bundle_css_style);
        }
    });

    // Parallel fetch of scripts
    const resources = [
        { key: 'challenge_js', local: '/src/challenge.js', remote: 'https://raw.githubusercontent.com/dimdenGD/OldTweetDeck/main/src/challenge.js' },
        { key: 'interception_js', local: '/src/interception.js', remote: 'https://raw.githubusercontent.com/dimdenGD/OldTweetDeck/main/src/interception.js' },
        { key: 'vendor_js', local: '/files/vendor.js', remote: 'https://raw.githubusercontent.com/dimdenGD/OldTweetDeck/main/files/vendor.js' },
        { key: 'bundle_js', local: '/files/bundle.js', remote: 'https://raw.githubusercontent.com/dimdenGD/OldTweetDeck/main/files/bundle.js' },
        { key: 'twitter_text', local: '/files/twitter-text.js', remote: 'https://raw.githubusercontent.com/dimdenGD/OldTweetDeck/main/files/twitter-text.js' }
    ];

    const results = await Promise.all(resources.map(res => getResource(res.local, res.remote)));

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
