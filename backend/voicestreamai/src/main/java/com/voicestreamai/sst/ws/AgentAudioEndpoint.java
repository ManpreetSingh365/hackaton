package com.voicestreamai.sst.ws;

import com.voicestreamai.sst.config.ApplicationContextProvider;
import com.voicestreamai.sst.service.ScriptComplianceService;
import jakarta.websocket.*;
import jakarta.websocket.server.ServerEndpoint;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import org.json.JSONObject;

/**
 * WebSocket endpoint for Chrome Extension
 * Receives audio from agent microphone and forwards to VoiceStreamAI
 */
@Component
@ServerEndpoint("/ws/agent-audio")
public class AgentAudioEndpoint {

    private Session clientSession; // Chrome extension
    private Session voiceStreamSession; // VoiceStreamAI server

    @OnOpen
    public void onOpen(Session session) {
        this.clientSession = session;
        // Set timeout to 24 hours (86400000ms) - only disconnect when user stops
        // manually
        this.clientSession.setMaxIdleTimeout(86400000L);
        System.out.println("🟢 Agent connected: " + session.getId());

        // Connect to VoiceStreamAI
        try {
            WebSocketContainer container = ContainerProvider.getWebSocketContainer();
            // Set write timeout to 5 minutes (300000ms) for slow networks
            container.setDefaultMaxSessionIdleTimeout(86400000L);
            container.setAsyncSendTimeout(300000L);

            Session voiceSession = container.connectToServer(
                    new VoiceStreamAiClientEndpoint(this),
                    URI.create("ws://localhost:8765"));

            // Set VoiceStreamAI session timeout to 24 hours as well
            voiceSession.setMaxIdleTimeout(86400000L);
        } catch (Exception e) {
            System.err.println("❌ Failed to connect to VoiceStreamAI: " + e.getMessage());
            try {
                session.close(new CloseReason(
                        CloseReason.CloseCodes.CANNOT_ACCEPT,
                        "Backend service unavailable"));
            } catch (IOException ignored) {
            }
        }
    }

    @OnMessage
    public void onBinary(ByteBuffer buffer) {
        buffer.order(ByteOrder.LITTLE_ENDIAN);

        // Validate header
        if (buffer.remaining() < 12) {
            System.err.println("❌ Invalid audio frame");
            return;
        }

        // Parse header
        buffer.getInt(); // sampleRate
        buffer.getShort(); // channels
        buffer.getShort(); // reserved
        int frameLength = buffer.getInt();

        // Validate data
        int expectedBytes = frameLength * 2;
        if (buffer.remaining() < expectedBytes) {
            System.err.println("❌ Incomplete audio frame");
            return;
        }

        // Extract audio data
        byte[] audioData = new byte[expectedBytes];
        buffer.get(audioData);

        // Forward to VoiceStreamAI with synchronized async (prevents both timeout AND
        // BINARY_FULL_WRITING)
        if (voiceStreamSession != null && voiceStreamSession.isOpen()) {
            synchronized (voiceStreamSession) {
                try {
                    // Use AsyncRemote with 5-minute timeout (prevents 20s timeout)
                    // But synchronized to prevent concurrent writes (prevents BINARY_FULL_WRITING
                    // error)
                    voiceStreamSession.getAsyncRemote().sendBinary(ByteBuffer.wrap(audioData));
                } catch (Exception e) {
                    // Log only if not a normal close
                    if (e.getMessage() != null && !e.getMessage().contains("closed")
                            && !e.getMessage().contains("BINARY_FULL_WRITING")) {
                        System.err.println("❌ Failed to send audio: " + e.getMessage());
                    }
                }
            }
        }
    }

    @OnClose
    public void onClose(Session session, CloseReason reason) {
        System.out.println("🔴 Agent disconnected: " + reason);
        closeVoiceStream();
    }

    @OnError
    public void onError(Session session, Throwable error) {
        System.err.println("⚠️ WebSocket error: " + error.getMessage());
        closeVoiceStream();
    }

    /* Called by VoiceStreamAiClientEndpoint */
    void setVoiceStreamSession(Session session) {
        this.voiceStreamSession = session;

        // Set 24-hour idle timeout
        this.voiceStreamSession.setMaxIdleTimeout(86400000L);

        // Set async send timeout to 5 minutes (300000ms) - prevents 20-second write
        // timeout
        this.voiceStreamSession.getAsyncRemote().setSendTimeout(300000L);

        System.out.println("📞 VoiceStreamAI connected (timeout: 24h, write: 5min)");
    }

    /**
     * Get ScriptComplianceService from Spring context
     * Required because @ServerEndpoint creates instances outside Spring's control
     */
    private ScriptComplianceService getComplianceService() {
        try {
            return ApplicationContextProvider.getBean(ScriptComplianceService.class);
        } catch (Exception e) {
            System.err.println("⚠️ Failed to get ScriptComplianceService: " + e.getMessage());
            return null;
        }
    }

    void handleTranscript(String transcript) {
        System.out.println("📝 Transcript: " + transcript);

        // Send transcript back to agent immediately
        if (clientSession != null && clientSession.isOpen()) {
            try {
                // Send as JSON
                JSONObject json = new JSONObject();
                json.put("type", "transcript");
                json.put("data", transcript);
                clientSession.getAsyncRemote().sendText(json.toString());
            } catch (Exception e) {
                System.err.println("❌ Failed to send transcript: " + e.getMessage());
            }
        }

        // Trigger AI Analysis using manual bean retrieval
        ScriptComplianceService scriptComplianceService = getComplianceService();
        if (scriptComplianceService != null) {
            scriptComplianceService.analyzeAsync(transcript, (analysisResult) -> {
                if (clientSession != null && clientSession.isOpen()) {
                    try {
                        JSONObject json = new JSONObject();
                        json.put("type", "compliance");
                        json.put("data", new JSONObject(analysisResult));
                        clientSession.getAsyncRemote().sendText(json.toString());
                        System.out.println("✅ Sent compliance result to client");
                    } catch (Exception e) {
                        System.err.println("❌ Failed to send compliance result: " + e.getMessage());
                    }
                }
            });
        }
    }

    void handleVoiceStreamClose(CloseReason reason) {
        System.out.println("⚠️ VoiceStreamAI closed: " + reason);

        // Auto-reconnect if client is still connected
        if (clientSession != null && clientSession.isOpen()) {
            System.out.println("🔄 Attempting to reconnect to VoiceStreamAI...");
            try {
                Thread.sleep(1000); // Wait 1 second before reconnecting

                WebSocketContainer container = ContainerProvider.getWebSocketContainer();
                container.setDefaultMaxSessionIdleTimeout(86400000L);
                container.setAsyncSendTimeout(300000L);

                Session voiceSession = container.connectToServer(
                        new VoiceStreamAiClientEndpoint(this),
                        URI.create("ws://localhost:8765"));

                voiceSession.setMaxIdleTimeout(86400000L);
                System.out.println("✅ Reconnected to VoiceStreamAI successfully");
            } catch (Exception e) {
                System.err.println("❌ Reconnection failed: " + e.getMessage());
            }
        }
    }

    void handleVoiceStreamError(Throwable error) {
        System.err.println("VoiceStreamAI error: " + error.getMessage());
    }

    private void closeVoiceStream() {
        if (voiceStreamSession != null && voiceStreamSession.isOpen()) {
            try {
                voiceStreamSession.close();
            } catch (IOException ignored) {
            }
        }
        voiceStreamSession = null;
    }
}
