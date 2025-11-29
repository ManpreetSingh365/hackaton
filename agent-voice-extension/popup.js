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
let callEnded = false; // Track if call has ended

// Persistent Alert Store (never auto-clear critical alerts)
const persistentAlerts = {
  critical: new Set(), // High-risk, social media, rude language
  risk: new Set(),     // Priority cases
  alert: new Set(),    // Missing steps
  completed: []        // Completed steps (can update)
};

// UI elements
const statusIndicator = document.getElementById('statusIndicator');
const transcriptCard = document.getElementById('transcriptCard');
const complianceSection = document.getElementById('complianceSection');
const complianceScore = document.getElementById('complianceScore');
const complianceAlerts = document.getElementById('complianceAlerts');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const endCallBtn = document.getElementById('endCallBtn');
const resetBtn = document.getElementById('resetBtn');

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
 * Update Compliance UI with PERSISTENT ALERTS and severity badges
 * Alerts stay on screen until explicitly resolved or reset
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

  // DON'T CLEAR - Use persistent alert system instead
  // alertsEl.innerHTML = ''; // ❌ REMOVED - This was causing alerts to disappear!
  
  // Process new data into persistent store
  if (result.critical_violations && Array.isArray(result.critical_violations)) {
    result.critical_violations.forEach(v => persistentAlerts.critical.add(v));
  }
  if (result.risk_violations && Array.isArray(result.risk_violations)) {
    result.risk_violations.forEach(v => persistentAlerts.risk.add(v));
  }
  if (result.missing_steps && Array.isArray(result.missing_steps)) {
    result.missing_steps.forEach(v => persistentAlerts.alert.add(v));
  }
  
  // Remove completed steps from missing
  if (result.completed_steps && Array.isArray(result.completed_steps)) {
    result.completed_steps.forEach(step => {
      persistentAlerts.alert.delete(step);
    });
    persistentAlerts.completed = result.completed_steps;
  }
  
  // Clear and rebuild alerts from persistent store
  alertsEl.innerHTML = '';
  
  // RENDER PERSISTENT CRITICAL ALERTS FIRST (with badges)
  Array.from(persistentAlerts.critical).forEach(violation => {
    const div = document.createElement('div');
    div.className = 'alert-item';
    div.style.background = 'rgba(244, 67, 54, 0.2)';
    div.style.borderLeftColor = '#f44336';
    div.style.color = '#ff8a80';
    div.innerHTML = '<strong>[🔴 CRITICAL]</strong> ' + violation;
    alertsEl.appendChild(div);
  });
  
  // RENDER RISK ALERTS (with badges)
  Array.from(persistentAlerts.risk).forEach(violation => {
    const div = document.createElement('div');
    div.className = 'alert-item';
    div.style.background = 'rgba(255, 152, 0, 0.2)';
    div.style.borderLeftColor = '#ff9800';
    div.style.color = '#ffcc80';
    div.innerHTML = '<strong>[🟠 RISK]</strong> ' + violation;
    alertsEl.appendChild(div);
  });
  
  // UPDATE VISUALIZER TEXT (instead of showing in alerts)
  const visualizer = document.getElementById('visualizer');
  if (result.status === 'IN_PROGRESS') {
    visualizer.setAttribute('data-message', '📞 Call In Progress... Keep going!');
    callEnded = false;
  } else if (result.status === 'PASS') {
    visualizer.setAttribute('data-message', '✅ Call Complete!');
    callEnded = true;
  } else if (result.status === 'FAIL') {
    visualizer.setAttribute('data-message', '❌ Call Failed');
    callEnded = true;
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

  // RENDER PERSISTENT ALERT-LEVEL WARNINGS (missing steps)
  // Only show "Missing: Closing" if call has ended
  Array.from(persistentAlerts.alert).forEach(step => {
    // Skip closing-related alerts if call is still ongoing
    const isClosingStep = step.toLowerCase().includes('closing') || 
                          step.toLowerCase().includes('goodbye') || 
                          step.toLowerCase().includes('thank you');
    
    if (isClosingStep && !callEnded) {
      return; // Don't show closing alerts during active call
    }
    
    const div = document.createElement('div');
    div.className = 'alert-item';
    div.style.background = 'rgba(255, 193, 7, 0.15)';
    div.style.borderLeftColor = '#FFC107';
    div.style.color = '#FFE082';
    div.innerHTML = '<strong>[🟡 ALERT]</strong> Missing: ' + step;
    alertsEl.appendChild(div);
  });

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
        callEnded = false; // Reset call state
        stopBtn.disabled = false;
        endCallBtn.disabled = false; // Enable End Call button
        updateStatus('connected');
        
        // Activate visualizer with message
        const visualizer = document.getElementById('visualizer');
        visualizer.setAttribute('data-message', '📞 Call In Progress... Keep going!');
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
 * End the call - marks call as ended and shows final alerts
 */
function endCall() {
  callEnded = true;
  
  // Update visualizer
  const visualizer = document.getElementById('visualizer');
  visualizer.setAttribute('data-message', '✅ Call Ended');
  
  // Re-render alerts to show missing closing steps
  const lastResult = window.lastComplianceResult;
  if (lastResult) {
    updateComplianceUI(lastResult);
  }
  
  // Disable End Call button after use
  endCallBtn.disabled = true;
  
  console.log('📞 Call ended manually');
}

/**
 * Clean up audio resources
 */
function cleanup() {
  isStreaming = false;
  
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
  endCallBtn.disabled = true;
  startBtn.disabled = false;
  updateStatus('disconnected');
  
  // Clear visualizer message
  const visualizer = document.getElementById('visualizer');
  visualizer.removeAttribute('data-message');
  
  // Deactivate visualizer
  document.querySelectorAll('.bar').forEach(bar => bar.classList.remove('active'));
}

/**
 * Reset UI - clear all transcripts and compliance data
 */
function resetUI() {
  // Clear transcripts
  transcriptCard.innerHTML = '<div class="no-transcript">Click "Start" to begin listening...</div>';
  
  // Clear persistent alert store
  persistentAlerts.critical.clear();
  persistentAlerts.risk.clear();
  persistentAlerts.alert.clear();
  persistentAlerts.completed = [];
  
  // Reset call state
  callEnded = false;
  window.lastComplianceResult = null;
  
  // Hide and clear compliance section
  complianceSection.style.display = 'none';
  complianceScore.textContent = '--';
  complianceScore.style.color = '#4CAF50';
  complianceAlerts.innerHTML = '';
  
  // Clear visualizer message
  const visualizer = document.getElementById('visualizer');
  visualizer.removeAttribute('data-message');
  
  console.log('✅ UI Reset - Transcripts and compliance cleared');
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
      window.lastComplianceResult = message.data; // Store for End Call
      updateComplianceUI(message.data);
      break;
  }
});

// Event listeners
startBtn.addEventListener('click', startStreaming);
stopBtn.addEventListener('click', stopStreaming);
endCallBtn.addEventListener('click', endCall);
resetBtn.addEventListener('click', resetUI);

// Initialize
updateStatus('disconnected');
syncState();
