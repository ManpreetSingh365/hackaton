document.addEventListener('DOMContentLoaded', () => {
    const list = document.getElementById('list');
    chrome.storage.local.get({ summaries: [] }, (res) => {
        const arr = res.summaries || [];
        if (!arr.length) {
            list.innerHTML = '<div>No summaries yet. Start a call and click Start.</div>';
            return;
        }
        list.innerHTML = '';
        arr.reverse().forEach(s => {
            const d = new Date(s.timestamp);
            const el = document.createElement('div');
            el.style = 'margin-bottom:12px;padding:8px;border:1px solid #ddd;border-radius:6px';
            el.innerHTML = `<div style="font-size:12px;color:#666">${d.toLocaleString()}</div>
        <div><strong>Words:</strong> ${s.words} &nbsp; <strong>Diwali greeting:</strong> ${s.greetings ? 'Yes' : 'No'} &nbsp; <strong>Rude:</strong> ${s.rude ? 'Yes' : 'No'}</div>
        <div style="margin-top:6px;font-size:13px">${escapeHtml(s.transcript.slice(0, 400))}${s.transcript.length > 400 ? '...' : ''}</div>`;
            list.appendChild(el);
        });
    });
});

function escapeHtml(text) {
    return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
