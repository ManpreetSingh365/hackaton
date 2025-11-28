package com.voicestreamai.sst.ws;

import jakarta.websocket.*;

/**
 * WebSocket client for connecting to VoiceStreamAI server
 */
@ClientEndpoint
public class VoiceStreamAiClientEndpoint {

    private final AgentAudioEndpoint parent;

    public VoiceStreamAiClientEndpoint(AgentAudioEndpoint parent) {
        this.parent = parent;
    }

    @OnOpen
    public void onOpen(Session session) {
        System.out.println("Connected to VoiceStreamAI");
        parent.setVoiceStreamSession(session);
    }

    @OnMessage
    public void onText(String transcript) {
        parent.handleTranscript(transcript);
    }

    @OnClose
    public void onClose(Session session, CloseReason reason) {
        parent.handleVoiceStreamClose(reason);
    }

    @OnError
    public void onError(Session session, Throwable error) {
        parent.handleVoiceStreamError(error);
    }
}
