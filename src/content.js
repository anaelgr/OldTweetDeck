window.addEventListener('message', async e => {
    if(e.source !== window) return;
    if(e.data === 'extensionId') {
        let extId = chrome.runtime.getURL('/injection.js').split("/")[2];
        window.postMessage({ extensionId: extId }, window.location.origin);
    } else if(e.data === 'cookie') {
        chrome.runtime.sendMessage({ action: "getcookie" }, cookie => {
            window.postMessage({ cookie }, window.location.origin);
        });
    } else if(e.data?.action === 'setotdtoken') {
        chrome.storage.local.set({ otd_token: e.data.token });
    } else if(e.data === 'getotdtoken') {
        chrome.storage.local.get('otd_token', token => {
            window.postMessage({ token: token.otd_token }, window.location.origin);
        });
    }
});