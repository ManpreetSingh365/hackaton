chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'SAVE_SUMMARY') {
        chrome.storage.local.get({ summaries: [] }, (res) => {
            const arr = res.summaries || [];
            arr.push(msg.summary);
            chrome.storage.local.set({ summaries: arr }, () => sendResponse({ ok: true }));
        });
        return true; // keep channel open
    }
});
