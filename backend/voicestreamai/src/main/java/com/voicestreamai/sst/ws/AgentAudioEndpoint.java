package com.voicestreamai.sst.ws;

import jakarta.websocket.*;
import jakarta.websocket.server.ServerEndpoint;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;

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
        System.out.println("🟢 Agent connected: " + session.getId());

        // Connect to VoiceStreamAI
        try {
            WebSocketContainer container = ContainerProvider.getWebSocketContainer();
            container.connectToServer(
                    new VoiceStreamAiClientEndpoint(this),
                    URI.create("ws://localhost:8765"));
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

        // Forward to VoiceStreamAI
        if (voiceStreamSession != null && voiceStreamSession.isOpen()) {
            try {
                // Use AsyncRemote to avoid blocking and timeouts
                voiceStreamSession.getAsyncRemote().sendBinary(ByteBuffer.wrap(audioData), result -> {
                    if (!result.isOK()) {
                        System.err.println("❌ Async send failed: " + result.getException().getMessage());
                    }
                });
            } catch (Exception e) {
                System.err.println("❌ Failed to initiate async send: " + e.getMessage());
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
        System.out.println("📞 VoiceStreamAI connected");
    }

    void handleTranscript(String transcript) {
        System.out.println("📝 Transcript: " + transcript);

        // Send transcript back to agent
        if (clientSession != null && clientSession.isOpen()) {
            try {
                clientSession.getAsyncRemote().sendText(transcript);
            } catch (Exception e) {
                System.err.println("❌ Failed to send transcript: " + e.getMessage());
            }
        }
    }

    void handleVoiceStreamClose(CloseReason reason) {
        System.out.println("VoiceStreamAI closed: " + reason);
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
