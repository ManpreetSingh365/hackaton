// content_script.js (updated - shows latest transcription first)
const overlayId = 'agent-audit-overlay';
if (!document.getElementById(overlayId)) {
    const overlay = document.createElement('div');
    overlay.id = overlayId;
    overlay.style = `
    position: fixed;
    right: 12px;
    bottom: 12px;
    width: 360px;
    max-width: 45%;
    z-index: 2147483647;
    font-family: Arial, sans-serif;
    box-shadow: 0 6px 18px rgba(0,0,0,0.25);
    border-radius: 10px;
    padding: 10px;
    background: white;
  `;
    overlay.innerHTML = `
    <div style="font-weight:700;margin-bottom:6px">Agent Auditor (MVP)</div>
    <div id="audit-status">Status: idle</div>
    <div id="audit-hints" style="margin-top:8px; max-height:120px; overflow:auto;"></div>

    <!-- Transcript log: newest (latest) entries will appear at the top -->
    <div style="margin-top:8px;font-weight:600">Live / Latest transcripts</div>
    <div id="transcript-live" style="font-size:12px;color:#333; margin-top:6px;"></div>
    <div id="transcript-log" style="margin-top:6px; max-height:140px; overflow:auto; border-top:1px solid #eee; padding-top:6px;"></div>

    <div style="margin-top:8px">
      <button id="audit-start">Start</button>
      <button id="audit-stop" disabled>Stop</button>
      <button id="audit-consent">Give Consent</button>
    </div>
  `;
    document.body.appendChild(overlay);
}

const statusEl = document.getElementById('audit-status');
const hintsEl = document.getElementById('audit-hints');
const startBtn = document.getElementById('audit-start');
const stopBtn = document.getElementById('audit-stop');
const consentBtn = document.getElementById('audit-consent');
const liveEl = document.getElementById('transcript-live');
const transcriptLogEl = document.getElementById('transcript-log');

let recognition;
let transcripts = []; // chronological, used for summary
let started = false;
let consentGiven = false;

consentBtn.onclick = () => {
    consentGiven = true;
    consentBtn.textContent = 'Consent: Given';
    consentBtn.disabled = true;
    alert('Consent recorded locally. Make sure customers are notified per company policy.');
};

startBtn.onclick = async () => {
    if (!consentGiven) { alert('Please click Give Consent first (company/legal requirement).'); return; }
    try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
        alert('Microphone access denied. Allow microphone for this page and retry.');
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert('SpeechRecognition API not available in this browser. Use Chrome stable.');
        return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = 'en-IN';
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onstart = () => {
        started = true;
        statusEl.textContent = 'Status: listening (agent mic)';
        startBtn.disabled = true;
        stopBtn.disabled = false;
        liveEl.textContent = '';
        transcriptLogEl.innerHTML = ''; // clear previous session log visual (keeps storage intact)
        hintsEl.innerHTML = '';
    };

    recognition.onresult = (event) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            const res = event.results[i];
            const text = res[0].transcript.trim();
            if (res.isFinal) {
                // Keep transcripts chronological for summary
                transcripts.push(text);
                // Show final segment in transcript log with newest on top (descending)
                prependTranscriptLog(text);
                // Run checks for final segment
                runChecks(text);
            } else {
                interim += text + ' ';
            }
        }
        // Show live interim at top (overwrite, so latest interim is visible)
        if (interim) {
            liveEl.innerHTML = `<div style="font-size:13px"><strong>Live:</strong> ${escapeHtml(interim)}</div>`;
        } else {
            // clear interim display when there's none
            liveEl.innerHTML = '';
        }
    };

    recognition.onerror = (e) => {
        console.error('recog error', e);
    };

    recognition.onend = () => {
        started = false;
        statusEl.textContent = 'Status: stopped';
        startBtn.disabled = false;
        stopBtn.disabled = true;
    };

    recognition.start();
};

// Stop and save summary
stopBtn.onclick = async () => {
    if (recognition) recognition.stop();
    statusEl.textContent = 'Status: processing summary...';
    const summary = createSummary();
    // Save to extension local storage via service worker
    chrome.runtime.sendMessage({ type: 'SAVE_SUMMARY', summary }, (res) => {
        statusEl.textContent = 'Status: saved summary';
        alert('Call summary saved to extension storage. Open popup to view.');
        // clear transcripts for next call
        transcripts = [];
    });
};

// Prepend a final transcript segment to the transcript log (newest first)
function prependTranscriptLog(text) {
    const container = document.createElement('div');
    container.style = 'margin-bottom:8px;padding:6px;border-radius:6px;background:#f9f9f9;font-size:12px';
    const ts = new Date().toLocaleTimeString();
    container.innerHTML = `<div style="color:#666;font-size:11px">${ts}</div><div style="margin-top:4px">${escapeHtml(text)}</div>`;
    // Prepend: add at top of transcriptLogEl
    if (transcriptLogEl.firstChild) {
        transcriptLogEl.insertBefore(container, transcriptLogEl.firstChild);
    } else {
        transcriptLogEl.appendChild(container);
    }
}

// Simple checks engine (keyword and politeness heuristics)
function runChecks(segment) {
    const lowPolite = ['shut up', 'idiot', 'stupid', 'don\'t care', 'useless'];
    const politePhrases = ['thank you', 'thanks', 'please', 'glad to help', 'happy to help', 'sorry for'];
    const festivalKeywords = ['diwali', 'happy diwali', 'festival', 'holi', 'eid', 'christmas'];

    const segLower = segment.toLowerCase();
    // Rude words
    for (const w of lowPolite) {
        if (segLower.includes(w)) {
            appendHint(`⚠️ Rude phrase detected: "${w}"`);
        }
    }
    // Politeness
    let hasPolite = politePhrases.some(p => segLower.includes(p));
    if (!hasPolite) {
        appendHint('ℹ️ Consider using "please/thank you" to improve tone.');
    } else {
        appendHint('✅ Polite phrases used.');
    }
    // Festival check example
    if (festivalKeywords.some(k => segLower.includes(k))) {
        appendHint('🎉 Festival greeting detected (good).');
    }
}

// Append hint to overlay (deduplicate recent hints)
function appendHint(text) {
    const el = document.createElement('div');
    el.style = 'font-size:12px;margin-top:6px';
    el.textContent = text;
    // Newest hint first
    if (hintsEl.firstChild) {
        hintsEl.insertBefore(el, hintsEl.firstChild);
    } else {
        hintsEl.appendChild(el);
    }
}

// Create a tiny summary object (uses chronological transcripts)
function createSummary() {
    const joined = transcripts.join(' ');
    const wordCount = joined.split(/\s+/).filter(Boolean).length;
    const containsDiwali = /diwali|happy diwali/i.test(joined);
    const rudeFound = /shut up|idiot|stupid|don'?t care|useless/i.test(joined);
    return {
        url: location.href,
        timestamp: Date.now(),
        transcript: joined,
        words: wordCount,
        greetings: containsDiwali,
        rude: rudeFound
    };
}

function escapeHtml(text) {
    return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
