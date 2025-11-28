/**
 * Background Service Worker
 * Manages WebSocket connection to backend server
 */

let websocket = null;
let connectionState = 'disconnected'; // disconnected, connecting, connected

const BACKEND_URL = 'ws://localhost:8080/ws/agent-audio';

/**
 * Update connection state and notify popup
 */
function updateState(newState) {
  connectionState = newState;
  // Notify all extension popups
  chrome.runtime.sendMessage({ type: 'stateChange', state: newState }).catch(() => {});
}

/**
 * Connect to backend WebSocket
 */
function connect() {
  if (websocket) return { success: true };

  try {
    updateState('connecting');
    websocket = new WebSocket(BACKEND_URL);

    websocket.onopen = () => {
      console.log('✅ Connected to backend');
      updateState('connected');
    };

    websocket.onmessage = (event) => {
      // Receive transcript from backend
      let text = event.data;
      
      // Parse JSON if available
      try {
        const parsed = JSON.parse(event.data);
        text = parsed.text || event.data;
      } catch {}

      // Send to popup
      chrome.runtime.sendMessage({ type: 'transcript', data: text }).catch(() => {});
    };

    websocket.onerror = (error) => {
      console.error('❌ WebSocket error:', error);
      updateState('disconnected');
    };

    websocket.onclose = () => {
      console.log('🔴 Disconnected from backend');
      websocket = null;
      updateState('disconnected');
    };

    return { success: true };
  } catch (error) {
    console.error('Failed to connect:', error);
    updateState('disconnected');
    return { success: false, error: error.message };
  }
}

/**
 * Disconnect from backend
 */
function disconnect() {
  if (websocket) {
    websocket.close();
    websocket = null;
  }
  updateState('disconnected');
}

/**
 * Send audio data to backend
 */
function sendAudio(audioData) {
  if (websocket && websocket.readyState === WebSocket.OPEN) {
    const buffer = new Uint8Array(audioData).buffer;
    websocket.send(buffer);
  }
}

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'connect':
      sendResponse(connect());
      break;

    case 'disconnect':
      disconnect();
      sendResponse({ success: true });
      break;

    case 'audioData':
      sendAudio(message.data);
      sendResponse({ success: true });
      break;

    case 'getState':
      sendResponse({ state: connectionState });
      break;
  }
  return true; // Keep message channel open for async response
});
