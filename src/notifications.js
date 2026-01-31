function createModal(content, className, onclose, canclose) {
    ensureStyles();
    let modal = document.createElement('div');
    modal.classList.add('otd-modal');
    let modal_content = document.createElement('div');
    modal_content.classList.add('otd-modal-content');
    if(className) modal_content.classList.add(className);
    if(typeof content === 'string') {
        modal_content.textContent = content;
    } else {
        modal_content.appendChild(content);
    }
    modal.appendChild(modal_content);
    let close = document.createElement('span');
    close.classList.add('otd-modal-close');
    close.title = "ESC";
    close.innerHTML = '&times;';
    document.body.classList.add('otd-no-scroll');
    function removeModal() {
        modal.remove();
        let event = new Event('findActiveTweet');
        document.dispatchEvent(event);
        document.removeEventListener('keydown', escapeEvent);
        if(onclose) onclose();
        let modals = document.getElementsByClassName('otd-modal');
        if(modals.length === 0) {
            document.body.classList.remove('otd-no-scroll');
        }
    }
    modal.removeModal = removeModal;
    function escapeEvent(e) {
        if(e.key === 'Escape' || (e.altKey && e.keyCode === 78)) {
            if(!canclose || canclose()) removeModal();
        }
    }
    close.addEventListener('click', removeModal);
    modal.addEventListener('click', e => {
        if(e.target === modal) {
            if(!canclose || canclose()) removeModal();
        }
    });
    document.addEventListener('keydown', escapeEvent);
    modal_content.appendChild(close);
    document.body.appendChild(modal);
    return modal;
}

async function getNotifications() {
    try {
        let notifs = await fetch('https://oldtd.org/notifications.json?t='+Date.now()).then(r => r.json());
        let readNotifs = localStorage.getItem('readNotifications') ? JSON.parse(localStorage.getItem('readNotifications')) : [];
        let notifsToDisplay = notifs.filter(notif => !readNotifs.includes(notif.id));
        return notifsToDisplay;
    } catch(e) {
        console.error("Failed to fetch notifications", e);
        return [];
    }
}

function maxVersionCheck(ver, maxVer) {
    let verArr = ver.split('.');
    let maxVerArr = maxVer.split('.');
    for(let i = 0; i < verArr.length; i++) {
        if(parseInt(verArr[i]) > parseInt(maxVerArr[i])) return false;
        if(parseInt(verArr[i]) < parseInt(maxVerArr[i])) return true;
    }
    return true;
}
function minVersionCheck(ver, minVer) {
    let verArr = ver.split('.');
    let minVerArr = minVer.split('.');
    for(let i = 0; i < verArr.length; i++) {
        if(parseInt(verArr[i]) < parseInt(minVerArr[i])) return false;
        if(parseInt(verArr[i]) > parseInt(minVerArr[i])) return true;
    }
    return true;
}

async function showNotifications() {
    let notifsToDisplay = await getNotifications();
    if(notifsToDisplay.length === 0) return;

    // Use runtime.getManifest instead of fetching manifest.json (it's available in MV3 usually, but this is MAIN world)
    // MAIN world cannot access chrome.runtime.getManifest directly usually.
    // But injection.js polyfills chrome.runtime.getURL.
    // We stick to fetch manifest logic or pass it from content script.
    // The original code fetched it. We'll keep fetching but catch errors.

    let currentVersion = "0.0.0";
    try {
        let manifest = await fetch(chrome.runtime.getURL('/manifest.json')).then(r => r.json());
        currentVersion = manifest.version;
    } catch(e) {
        console.warn("Could not get manifest version", e);
    }
   
    let readNotifs = localStorage.getItem('readNotifications') ? JSON.parse(localStorage.getItem('readNotifications')) : [];
    let initialReadNotifsLength = readNotifs.length;
    let isFirstRun = !localStorage.OTDnotifsReadOnce;

    for(let notif of notifsToDisplay) {
        if(isFirstRun && notif.ignoreOnInstall) {
            if(readNotifs.includes(notif.id)) continue;
            readNotifs.push(notif.id);
            continue;
        }
        if(notif.maxVersion && !maxVersionCheck(currentVersion, notif.maxVersion)) continue;
        if(notif.minVersion && !minVersionCheck(currentVersion, notif.minVersion)) continue;
        if(document.querySelector('.otd-notification-modal')) continue;

        let notifEl = document.createElement('div');
        notifEl.className = `otd-notification otd-notification-${notif.type}`;
        let contentEl = document.createElement('div');
        contentEl.className = 'otd-notification-content';
        contentEl.textContent = notif.text;
        notifEl.appendChild(contentEl);

        let shown = Date.now();
        createModal(notifEl, 'otd-notification-modal', () => {
            if(!notif.dismissable) return;
            let readNotifs = localStorage.getItem('readNotifications') ? JSON.parse(localStorage.getItem('readNotifications')) : [];
            if(readNotifs.includes(notif.id)) return;
            readNotifs.push(notif.id);
            localStorage.setItem('readNotifications', JSON.stringify(readNotifs));
        }, () => Date.now() - shown > 3000);
    }

    if (readNotifs.length !== initialReadNotifsLength) {
        localStorage.setItem('readNotifications', JSON.stringify(readNotifs));
    }
    localStorage.OTDnotifsReadOnce = '1';
}

let style = document.createElement('style');
style.innerHTML = /*css*/`
:root {
    --otd-modal-bg: white;
    --otd-modal-color: black;
    --otd-modal-overlay: rgba(0, 0, 0, 0.4);
    --otd-notif-info: "ℹ️";
    --otd-notif-warning: "⚠️";
    --otd-notif-error: "❌";
}

html.dark {
    --otd-modal-bg: #15202b;
    --otd-modal-color: white;
    --otd-modal-overlay: rgba(0, 0, 0, 0.6);
}

.otd-no-scroll {
    overflow-y: hidden !important;
}

.otd-modal {
    position: fixed;
    z-index: 200000;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    overflow: auto;
    background-color: var(--otd-modal-overlay);
    display: flex;
    align-items: center;
    justify-content: center;
}

.otd-modal-content {
    width: fit-content;
    min-width: 500px;
    max-width: 90%;
    margin: auto;
    border-radius: 8px;
    padding: 20px;
    background-color: var(--otd-modal-bg);
    color: var(--otd-modal-color);
    position: relative;
    max-height: 80%;
    overflow-y: auto;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    animation: opac 0.2s ease-in-out;
}

.otd-notification-warning > .otd-notification-content::before {
    content: var(--otd-notif-warning);
    margin-right: 8px;
}
.otd-notification-error > .otd-notification-content::before {
    content: var(--otd-notif-error);
    margin-right: 8px;
}
.otd-notification-info > .otd-notification-content::before {
    content: var(--otd-notif-info);
    margin-right: 8px;
}

@keyframes opac {
    0% { opacity: 0; transform: scale(0.95); }
    100% { opacity: 1; transform: scale(1); }
}

.otd-modal-close {
    color: #aaaaaa;
    float: right;
    font-size: 24px;
    font-weight: bold;
    top: 5px;
    right: 10px;
    position: absolute;
    line-height: 1;
    transition: color 0.2s;
}

.otd-modal-close:hover,
.otd-modal-close:focus {
    color: var(--otd-modal-color);
    text-decoration: none;
    cursor: pointer;
}
`;

function ensureStyles() {
    if (!document.documentElement.contains(style)) {
        document.head.appendChild(style);
    }
}

// Check if we need to show notifications soon, but don't force style injection yet until needed or DOM is stable
setTimeout(showNotifications, 2000);
setInterval(showNotifications, 60000 * 60);
