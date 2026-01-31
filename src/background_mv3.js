try {
    importScripts('/src/btd/background_bundle.js');
} catch (e) {
    console.error("Failed to import BTD bundle:", e);
}

// OldTweetDeck Logic

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'setcookie') {
        handleSetCookie(sender).catch(err => console.error("Error setting cookies:", err));
        // No response needed for setcookie in current implementation
    }
});

async function handleSetCookie(sender) {
    // Fetch cookies from x.com
    const cookies = await chrome.cookies.getAll({ url: "https://x.com" });

    // Determine target storeId
    let storeId = null;

    // 1. Try to get it from the sender tab (most reliable context)
    if (sender.tab && sender.tab.id) {
        const cookieStores = await chrome.cookies.getAllCookieStores();
        const store = cookieStores.find(s => s.tabIds.includes(sender.tab.id));
        if (store) storeId = store.id;
    }

    // 2. Fallback to active tab
    if (!storeId) {
        const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (tabs.length > 0) {
            const cookieStores = await chrome.cookies.getAllCookieStores();
            const store = cookieStores.find(s => s.tabIds.includes(tabs[0].id));
            if (store) storeId = store.id;
        }
    }

    // Set cookies for twitter.com
    const promises = cookies.map(cookie => {
        // Filter out session cookies if expirationDate is missing? No, copy them too.
        // Note: hostOnly is not settable, strict/lax sameSite might need adjustment but usually copying works.
        const newCookie = {
            url: "https://twitter.com",
            name: cookie.name,
            value: cookie.value,
            domain: ".twitter.com",
            path: "/",
            secure: cookie.secure,
            httpOnly: cookie.httpOnly,
            sameSite: cookie.sameSite,
        };

        if (cookie.expirationDate) {
            newCookie.expirationDate = cookie.expirationDate;
        }

        if (storeId) {
            newCookie.storeId = storeId;
        }

        return chrome.cookies.set(newCookie).catch(e => {
            // console.warn(`Failed to set cookie ${cookie.name}:`, e);
        });
    });

    await Promise.all(promises);
}
