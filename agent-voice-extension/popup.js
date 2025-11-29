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
  
  // Update class for styling
  statusIndicator.className = 'status-value ' + (state === 'connected' ? 'connected' : state === 'disconnected' ? 'disconnected' : 'listening');
}

/**
 * Add new transcript to UI
 */
function addTranscript(text) {
  // Remove "no transcript" placeholder
  const placeholder = transcriptCard.querySelector('.no-transcript');
  if (placeholder) placeholder.remove();

  // Parse text if it's a JSON string (VoiceStreamAI returns JSON)
  let displayText = text;
  try {
    if (typeof text === 'string' && (text.startsWith('{') || text.startsWith('['))) {
      const parsed = JSON.parse(text);
      // If it has a 'text' field, use that. Otherwise use the whole object.
      if (parsed.text) {
        displayText = parsed.text;
      }
    }
  } catch (e) {
    // Not JSON, use original text
  }

  // Create transcript item
  const item = document.createElement('div');
  item.className = 'transcript-item';
  
  const time = document.createElement('div');
  time.className = 'transcript-time';
  time.textContent = new Date().toLocaleTimeString();
  
  const content = document.createElement('div');
  content.className = 'transcript-text';
  content.textContent = displayText;
  
  item.appendChild(time);
  item.appendChild(content);
  transcriptCard.insertBefore(item, transcriptCard.firstChild);

  // Keep only last 10 transcripts
  while (transcriptCard.children.length > 10) {
    transcriptCard.removeChild(transcriptCard.lastChild);
  }
}

/**
 * Update Compliance UI with AI results - Enhanced with color-coded alerts
 */
function updateComplianceUI(data) {
  const section = document.getElementById('complianceSection');
  const scoreEl = document.getElementById('complianceScore');
  const alertsEl = document.getElementById('complianceAlerts');

  if (!data) return;

  // Show section
  section.style.display = 'block';

  // Parse data if string
  let result = data;
  if (typeof data === 'string') {
    try {
      result = JSON.parse(data);
    } catch {
      return;
    }
  }

  // Update Score with color coding and animation
  if (result.score !== undefined) {
    // Animate score change
    const currentScore = parseInt(scoreEl.textContent) || 0;
    const targetScore = result.score;
    
    if (targetScore !== currentScore) {
      animateScore(scoreEl, currentScore, targetScore);
    }
    
    // Progressive color coding
    if (result.score >= 80) {
      scoreEl.style.color = '#4CAF50'; // Green - Excellent
    } else if (result.score >= 60) {
      scoreEl.style.color = '#FFC107'; // Amber - Good
    } else if (result.score >= 30) {
      scoreEl.style.color = '#FF9800'; // Orange - Needs improvement
    } else {
      scoreEl.style.color = '#FF5722'; // Red - Critical
    }
  }

  // Clear previous alerts
  alertsEl.innerHTML = '';
  
  // STATUS: IN_PROGRESS - Blue/Progress indicator
  if (result.status === 'IN_PROGRESS') {
    const div = document.createElement('div');
    div.className = 'alert-item';
    div.style.background = 'rgba(33, 150, 243, 0.15)';
    div.style.borderLeftColor = '#2196F3';
    div.style.color = '#64B5F6';
    div.innerHTML = '📞 <strong>Call In Progress...</strong> Keep going!';
    alertsEl.appendChild(div);
  }
  
  // HIGH-RISK DETECTION - Red Alert
  if (result.high_risk_detected) {
    const div = document.createElement('div');
    div.className = 'alert-item';
    div.style.background = 'rgba(244, 67, 54, 0.2)';
    div.style.borderLeftColor = '#f44336';
    div.style.color = '#ff8a80';
    div.innerHTML = '🚨 <strong>HIGH-RISK WORDS DETECTED</strong>';
    alertsEl.appendChild(div);
  }

  // PRIORITY CASE DETECTION - Orange Alert
  if (result.priority_case_detected) {
    const div = document.createElement('div');
    div.className = 'alert-item';
    div.style.background = 'rgba(255, 152, 0, 0.2)';
    div.style.borderLeftColor = '#ff9800';
    div.style.color = '#ffcc80';
    div.innerHTML = '⚡ <strong>PRIORITY CASE</strong> - Escalate immediately';
    alertsEl.appendChild(div);
  }

  // EMPATHY COUNT - Show progress
  if (result.empathy_count !== undefined) {
    const minRequired = 1; // From callScript.json
    const div = document.createElement('div');
    div.className = 'alert-item';
    if (result.empathy_count >= minRequired) {
      div.style.background = 'rgba(76, 175, 80, 0.1)';
      div.style.borderLeftColor = '#4CAF50';
      div.style.color = '#a5d6a7';
      div.innerHTML = `💚 Empathy statements: ${result.empathy_count}/${minRequired} ✓`;
    } else {
      div.style.background = 'rgba(255, 152, 0, 0.15)';
      div.style.borderLeftColor = '#ff9800';
      div.style.color = '#ffcc80';
      div.innerHTML = `⚠️ Empathy statements: ${result.empathy_count}/${minRequired} (need more)`;
    }
    alertsEl.appendChild(div);
  }

  // COMPLETED STEPS - Green Alerts (only show first 3 to avoid clutter)
  if (result.completed_steps && Array.isArray(result.completed_steps) && result.completed_steps.length > 0) {
    const showCount = Math.min(3, result.completed_steps.length);
    for (let i = 0; i < showCount; i++) {
      const div = document.createElement('div');
      div.className = 'alert-item success';
      div.innerHTML = '✅ ' + result.completed_steps[i];
      alertsEl.appendChild(div);
    }
    
    // If more than 3, show summary
    if (result.completed_steps.length > 3) {
      const div = document.createElement('div');
      div.className = 'alert-item success';
      div.innerHTML = `✅ +${result.completed_steps.length - 3} more steps completed`;
      alertsEl.appendChild(div);
    }
  }

  // MISSING STEPS - Only show if call is ending or critical (not during IN_PROGRESS)
  if (result.status !== 'IN_PROGRESS' && result.missing_steps && Array.isArray(result.missing_steps) && result.missing_steps.length > 0) {
    result.missing_steps.forEach(step => {
      const div = document.createElement('div');
      div.className = 'alert-item';
      div.style.background = 'rgba(244, 67, 54, 0.15)';
      div.style.borderLeftColor = '#f44336';
      div.style.color = '#ff8a80';
      div.innerHTML = '❌ Missing: ' + step;
      alertsEl.appendChild(div);
    });
  }

  // GENERAL ALERTS - Amber Alerts
  if (result.alerts && Array.isArray(result.alerts) && result.alerts.length > 0) {
    result.alerts.forEach(alertText => {
      // Skip if already displayed as missing_steps
      if (result.missing_steps && result.missing_steps.includes(alertText)) {
        return;
      }
      
      const div = document.createElement('div');
      div.className = 'alert-item';
      div.style.background = 'rgba(255, 152, 0, 0.15)';
      div.style.borderLeftColor = '#ff9800';
      div.style.color = '#ffcc80';
      div.innerHTML = '⚠️ ' + alertText;
      alertsEl.appendChild(div);
    });
  }

  // STATUS PASS - Green Success Message
  if (result.status === 'PASS') {
    const div = document.createElement('div');
    div.className = 'alert-item success';
    div.innerHTML = '✅ <strong>All Script Requirements Met!</strong>';
    alertsEl.insertBefore(div, alertsEl.firstChild);
  }

  // STATUS FAIL - Show overall failure
  if (result.status === 'FAIL') {
    const div = document.createElement('div');
    div.className = 'alert-item';
    div.style.background = 'rgba(244, 67, 54, 0.2)';
    div.style.borderLeftColor = '#f44336';
    div.style.color = '#ff8a80';
    div.innerHTML = '❌ <strong>Script Compliance Failed</strong>';
    alertsEl.insertBefore(div, alertsEl.firstChild);
  }
}

/**
 * Animate score changes for better UX
 */
function animateScore(element, from, to) {
  const duration = 500; // ms
  const steps = 20;
  const increment = (to - from) / steps;
  const stepDuration = duration / steps;
  
  let current = from;
  let step = 0;
  
  const timer = setInterval(() => {
    step++;
    current += increment;
    
    if (step >= steps) {
      element.textContent = to + '%';
      clearInterval(timer);
    } else {
      element.textContent = Math.round(current) + '%';
    }
  }, stepDuration);
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
        
        // Activate visualizer
        document.querySelectorAll('.bar').forEach(bar => bar.classList.add('active'));
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
  
  // Deactivate visualizer
  document.querySelectorAll('.bar').forEach(bar => bar.classList.remove('active'));
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
  switch (message.type) {
    case 'stateChange':
      updateStatus(message.state);
      break;

    case 'transcript':
      addTranscript(message.data);
      break;

    case 'compliance':
      updateComplianceUI(message.data);
      break;
  }
});

// Event listeners
startBtn.addEventListener('click', startStreaming);
stopBtn.addEventListener('click', stopStreaming);

// Initialize
updateStatus('disconnected');
syncState();
