package com.voicestreamai.sst.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.util.concurrent.CompletableFuture;

@Service
public class ScriptComplianceService {

    @Autowired
    private GeminiService geminiService;

    // Buffer to accumulate text before sending to AI (to save API calls and provide
    // context)
    private StringBuilder transcriptBuffer = new StringBuilder();
    private long lastAnalysisTime = System.currentTimeMillis();
    private static final int BUFFER_THRESHOLD = 50; // Characters
    private static final long TIME_THRESHOLD = 3000; // Milliseconds

    public void analyzeAsync(String transcript, java.util.function.Consumer<String> callback) {
        transcriptBuffer.append(transcript).append(" ");

        long currentTime = System.currentTimeMillis();
        boolean bufferFull = transcriptBuffer.length() >= BUFFER_THRESHOLD;
        boolean timeElapsed = (currentTime - lastAnalysisTime) >= TIME_THRESHOLD;

        if (bufferFull || timeElapsed) {
            String textToAnalyze = transcriptBuffer.toString();

            // Reset buffer
            transcriptBuffer.setLength(0);
            lastAnalysisTime = currentTime;

            // Run AI analysis asynchronously
            CompletableFuture.runAsync(() -> {
                String analysisResult = geminiService.analyzeText(textToAnalyze);
                if (analysisResult != null) {
                    callback.accept(analysisResult);
                }
            });
        }
    }
}
