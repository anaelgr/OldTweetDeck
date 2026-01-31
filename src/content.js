window.addEventListener('message', async e => {
    if(e.source !== window) return;
    if(e.data === 'extensionId') {
        let extId = chrome.runtime.getURL('/injection.js').split("/")[2];
        window.postMessage({ extensionId: extId }, window.location.origin);
    } else if(e.data?.action === 'setotdtoken') {
        chrome.storage.local.set({ otd_token: e.data.token });
    } else if(e.data === 'setcookie') {
        chrome.runtime.sendMessage({ action: "setcookie" });
    } else if(e.data === 'getAdditionalScripts') {
        chrome.storage.local.get('otd_token', async data => {
            const token = data.otd_token;
            try {
                const additionalScripts = await fetch("https://oldtd.org/api/scripts", {
                    headers: token ? {
                        Authorization: `Bearer ${token}`
                    } : undefined
                }).then(r => r.json());

                const scriptPromises = additionalScripts.map(script =>
                    fetch(`https://oldtd.org/api/scripts/${script}`, {
                        headers: token ? {
                            Authorization: `Bearer ${token}`
                        } : undefined
                    }).then(r => r.text())
                );

                const scripts = await Promise.all(scriptPromises);
                window.postMessage({ additionalScripts: scripts }, window.location.origin);
            } catch(e) {
                console.error("OldTweetDeck: Failed to fetch additional scripts", e);
                window.postMessage({ additionalScripts: [] }, window.location.origin);
            }
        });
    }
});
