/**
 * Agent Voice Streamer - Popup UI Controller
 * Captures agent microphone and sends to backend for transcription
 */

// Audio components
let audioContext = null;
let sourceNode = null;
let workletNode = null;
let mediaStream = null;
let isStreaming = false;

// UI elements
const statusIndicator = document.getElementById('statusIndicator');
const transcriptCard = document.getElementById('transcriptCard');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');

/**
 * Update connection status display
 */
function updateStatus(state) {
  const states = {
    disconnected: '<span class="status-dot red"></span> Disconnected',
    connecting: '<span class="status-dot blue"></span> Connecting...',
    connected: '<span class="status-dot green"></span> Connected'
  };
  statusIndicator.innerHTML = states[state] || states.disconnected;
}

/**
 * Add new transcript to UI
 */
function addTranscript(text) {
  // Remove "no transcript" placeholder
  const placeholder = transcriptCard.querySelector('.no-transcript');
  if (placeholder) placeholder.remove();

  // Create transcript item
  const item = document.createElement('div');
  item.className = 'transcript-item';
  
  const time = document.createElement('div');
  time.className = 'transcript-time';
  time.textContent = new Date().toLocaleTimeString();
  
  const content = document.createElement('div');
  content.className = 'transcript-text';
  content.textContent = text;
  
  item.appendChild(time);
  item.appendChild(content);
  transcriptCard.insertBefore(item, transcriptCard.firstChild);

  // Keep only last 10 transcripts
  while (transcriptCard.children.length > 10) {
    transcriptCard.removeChild(transcriptCard.lastChild);
  }
}

/**
 * Start microphone streaming
 */
async function startStreaming() {
  try {
    startBtn.disabled = true;
    updateStatus('connecting');

    // Get microphone access
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        sampleRate: 16000
      }
    });

    // Create audio context
    audioContext = new AudioContext({ sampleRate: 16000 });
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    // Load and create audio worklet
    await audioContext.audioWorklet.addModule('audio-worklet.js');
    workletNode = new AudioWorkletNode(audioContext, 'pcm-processor');

    // Send audio data to background service worker
    workletNode.port.onmessage = (event) => {
      if (isStreaming) {
        chrome.runtime.sendMessage({
          type: 'audioData',
          data: Array.from(new Uint8Array(event.data))
        });
      }
    };

    // Connect audio pipeline
    sourceNode = audioContext.createMediaStreamSource(mediaStream);
    sourceNode.connect(workletNode);
    workletNode.connect(audioContext.destination);

    // Tell background to connect WebSocket
    chrome.runtime.sendMessage({ type: 'connect' }, (response) => {
      if (response?.success) {
        isStreaming = true;
        stopBtn.disabled = false;
        updateStatus('connected');
      } else {
        throw new Error('Backend connection failed');
      }
    });

  } catch (error) {
    console.error('Failed to start:', error);
    alert('Microphone access required. Please allow and try again.');
    cleanup();
  }
}

/**
 * Stop streaming and cleanup
 */
function stopStreaming() {
  isStreaming = false;
  chrome.runtime.sendMessage({ type: 'disconnect' });
  cleanup();
}

/**
 * Clean up audio resources
 */
function cleanup() {
  if (workletNode) {
    workletNode.disconnect();
    workletNode = null;
  }
  
  if (sourceNode) {
    sourceNode.disconnect();
    sourceNode = null;
  }
  
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }

  stopBtn.disabled = true;
  startBtn.disabled = false;
  updateStatus('disconnected');
}

/**
 * Sync UI with background state on popup open
 */
function syncState() {
  chrome.runtime.sendMessage({ type: 'getState' }, (response) => {
    if (response?.state) {
      updateStatus(response.state);
      
      // Disconnect orphaned connections
      if (response.state === 'connected' && !isStreaming) {
        chrome.runtime.sendMessage({ type: 'disconnect' });
      }
    }
  });
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'stateChange') {
    updateStatus(message.state);
  } else if (message.type === 'transcript') {
    addTranscript(message.data);
  }
});

// Event listeners
startBtn.addEventListener('click', startStreaming);
stopBtn.addEventListener('click', stopStreaming);

// Initialize
updateStatus('disconnected');
syncState();
