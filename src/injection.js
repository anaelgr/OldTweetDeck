let extId;
let isFirefox = navigator.userAgent.indexOf('Firefox') > -1;
let cookie = null;
let otdtoken = null;

if(!window.chrome) window.chrome = {};
if(!window.chrome.runtime) window.chrome.runtime = {};
window.chrome.runtime.getURL = url => {
    if(!url.startsWith('/')) url = `/${url}`;
    return `${isFirefox ? 'moz-extension://' : 'chrome-extension://'}${extId}${url}`;   
}
window.addEventListener('message', e => {
    if(e.data.extensionId) {
        console.log("got extensionId", e.data.extensionId);
        extId = e.data.extensionId;
        main();
    } else if(e.data.cookie) {
        cookie = e.data.cookie;
    } else if(e.data.token) {
        console.log("got otdtoken");
        otdtoken = e.data.token;
    }
});
window.postMessage('extensionId', '*');
window.postMessage('cookie', '*');
window.postMessage('getotdtoken', '*');

async function main() {
    let html = await fetch(chrome.runtime.getURL('/files/index.html')).then(r => r.text());
    document.documentElement.innerHTML = html;

    // Start fetching resources in parallel
    const resourceUrls = {
        challenge_js: "/src/challenge.js",
        interception_js: "/src/interception.js",
        vendor_js: "/files/vendor.js",
        bundle_js: "/files/bundle.js",
        bundle_css: "/files/bundle.css",
        twitter_text: "/files/twitter-text.js"
    };

    const remoteBase = "https://raw.githubusercontent.com/dimdenGD/OldTweetDeck/main";

    const fetchResource = async (key, localPath) => {
        let content;
        try {
            content = await fetch(chrome.runtime.getURL(localPath)).then(r => r.text());
        } catch(e) { console.error("Local fetch failed", e); }

        if (!localStorage.getItem("OTDalwaysUseLocalFiles")) {
            try {
                const remoteRes = await fetch(`${remoteBase}${localPath}`);
                if (remoteRes.ok) {
                    const remoteText = await remoteRes.text();
                    if (remoteText.length > 30) {
                        console.log(`Using remote ${key}`);
                        return remoteText;
                    }
                }
            } catch (e) {
                // Ignore remote failure
            }
        }
        return content;
    };

    const resourcesPromise = Promise.all(
        Object.keys(resourceUrls).map(key => fetchResource(key, resourceUrls[key]).then(text => ({key, text})))
    );

    const resources = (await resourcesPromise).reduce((acc, curr) => {
        acc[curr.key] = curr.text;
        return acc;
    }, {});

    // Inject CSS
    if (resources.bundle_css) {
        let bundle_css_style = document.createElement("style");
        bundle_css_style.innerHTML = resources.bundle_css;
        document.head.appendChild(bundle_css_style);
    }

    // Inject Scripts
    if (resources.challenge_js) {
        let challenge_js_script = document.createElement("script");
        challenge_js_script.innerHTML = resources.challenge_js.replaceAll('SOLVER_URL', chrome.runtime.getURL("solver.html"));
        document.head.appendChild(challenge_js_script);
    }

    const scriptsToInject = ['interception_js', 'vendor_js', 'bundle_js', 'twitter_text'];
    scriptsToInject.forEach(key => {
        if (resources[key]) {
            let s = document.createElement("script");
            s.innerHTML = resources[key];
            document.head.appendChild(s);
        }
    });

    // Additional Scripts from API
    (async () => {
        try {
            const additionalScripts = await fetch("https://oldtd.org/api/scripts", {
                headers: otdtoken ? { Authorization: `Bearer ${otdtoken}` } : undefined
            }).then(r => r.json());

            await Promise.all(additionalScripts.map(async script => {
                let scriptSource = await fetch(`https://oldtd.org/api/scripts/${script}`, {
                    headers: otdtoken ? { Authorization: `Bearer ${otdtoken}` } : undefined
                }).then(r => r.text());
                let scriptElement = document.createElement("script");
                scriptElement.innerHTML = scriptSource;
                document.head.appendChild(scriptElement);
            }));
        } catch(e) {
            console.error(e);
        }
    })();

    // Observer to remove bad body (Twitter's original body re-injection)
    const cleanupObserver = new MutationObserver(() => {
        let badBody = document.querySelector('body:not(#injected-body)');
        if (badBody) {
            let badHead = document.querySelector('head:not(#injected-head)');
            if(badHead) badHead.remove();
            badBody.remove(); 
        }
    });
    cleanupObserver.observe(document.documentElement, { childList: true });

    // Stop observing after 10 seconds to save resources
    setTimeout(() => cleanupObserver.disconnect(), 10000);


    // Observer to inject Account button listener
    const accountObserver = new MutationObserver(() => {
        let accountsBtn = document.querySelector('a[data-title="Accounts"]');
        if (accountsBtn && !accountsBtn.dataset.otdHooked) {
            accountsBtn.dataset.otdHooked = "true";
            accountsBtn.addEventListener("click", function() {
                console.log("setting account cookie");
                chrome.runtime.sendMessage({ action: "setcookie" });
            });
            // We disconnect once found, matching original behavior (clearInterval)
            // But if TweetDeck re-renders, we might need it again.
            // The original used setInterval but cleared it immediately on success.
            accountObserver.disconnect();
        }
    });

    // Start observing the injected body once it's available
    if (document.getElementById('injected-body')) {
        accountObserver.observe(document.getElementById('injected-body'), { childList: true, subtree: true });
    } else {
        // Fallback or wait? document.documentElement.innerHTML should have created it.
        // But just in case:
        const bodyStartObserver = new MutationObserver(() => {
            if (document.getElementById('injected-body')) {
                accountObserver.observe(document.getElementById('injected-body'), { childList: true, subtree: true });
                bodyStartObserver.disconnect();
            }
        });
        bodyStartObserver.observe(document.documentElement, { childList: true });
    }
};
