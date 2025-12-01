chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if(request.action === 'setcookie') {
        chrome.cookies.getAll({url: "https://x.com"}, async cookies => {
            console.log('setcookie', cookies);

            // Prefer using sender.tab if available
            let targetTab = sender.tab;

            if (!targetTab) {
                // Fallback to active tab query if message didn't come from a tab (unlikely for this action)
                let tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
                targetTab = tabs[0];
            }

            if (!targetTab) {
                console.error("No target tab found for setcookie");
                return;
            }

            chrome.cookies.getAllCookieStores(async cookieStores => {
                console.log('cookieStores', cookieStores, targetTab);
                const storeId = cookieStores?.find( cookieStore => cookieStore?.tabIds?.indexOf(targetTab.id) !== -1)?.id;

                if (!storeId) {
                    console.error("Could not find storeId for tab", targetTab.id);
                    return;
                }

                // Batch promises for performance instead of sequential callbacks?
                // chrome.cookies.set is async.
                const setPromises = cookies.map(cookie => {
                    return new Promise((resolve) => {
                        chrome.cookies.set({
                            url: "https://twitter.com",
                            name: cookie.name,
                            value: cookie.value,
                            expirationDate: cookie.expirationDate,
                            domain: ".twitter.com", // Ensure this is correct for all cookies
                            sameSite: cookie.sameSite,
                            secure: cookie.secure,
                            httpOnly: cookie.httpOnly,
                            storeId
                        }, (c) => {
                            // console.log('set cookie', c); // Remove log for perf
                            resolve(c);
                        });
                    });
                });

                await Promise.all(setPromises);
                console.log("All cookies set");
            });
        });
    } else if(request.action === 'getcookie') {
        chrome.cookies.get({ name: "auth_token", url: "https://x.com" }).then(cookie => {
            sendResponse(cookie);
        });
        return true;
    }
});