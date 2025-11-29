package com.voicestreamai.sst.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.voicestreamai.sst.model.CallScriptConfig;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.json.JSONObject;
import org.json.JSONArray;

import jakarta.annotation.PostConstruct;
import java.io.IOException;

@Service
public class GeminiService {

    @Value("${gemini.api.key:}")
    private String apiKey;

    private final String API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
    private final RestTemplate restTemplate = new RestTemplate();
    private CallScriptConfig callScriptConfig;

    @PostConstruct
    public void init() {
        loadCallScript();
    }

    /**
     * Load callScript.json configuration on service initialization
     */
    private void loadCallScript() {
        try {
            ObjectMapper mapper = new ObjectMapper();
            mapper.setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE);

            ClassPathResource resource = new ClassPathResource("callScript.json");
            callScriptConfig = mapper.readValue(resource.getInputStream(), CallScriptConfig.class);

            System.out.println("✅ Loaded callScript.json successfully");
        } catch (IOException e) {
            System.err.println("❌ Failed to load callScript.json: " + e.getMessage());
            callScriptConfig = new CallScriptConfig();
        }
    }

    /**
     * Build dynamic AI prompt with realistic scoring and severity detection
     */
    private String buildPrompt(String transcript) {
        StringBuilder prompt = new StringBuilder();

        prompt.append(
                "You are monitoring a LIVE customer service call for real-time compliance and risk detection.\\n\\n");

        // Severity System
        prompt.append("**ALERT SEVERITY LEVELS**:\\n");
        prompt.append("🔴 CRITICAL (Immediate action required):\\n");

        if (callScriptConfig.getConstraints() != null
                && callScriptConfig.getConstraints().getCriticalViolations() != null) {
            CallScriptConfig.Constraints.CriticalViolations critical = callScriptConfig.getConstraints()
                    .getCriticalViolations();

            if (critical.getHighRiskWords() != null && !critical.getHighRiskWords().isEmpty()) {
                prompt.append("- High-risk: ").append(String.join(", ", critical.getHighRiskWords())).append("\\n");
            }

            if (critical.getSocialMediaThreats() != null && !critical.getSocialMediaThreats().isEmpty()) {
                prompt.append("- Social media threats: ").append(String.join(", ", critical.getSocialMediaThreats()))
                        .append("\\n");
            }

            if (critical.getRundeLanguage() != null && !critical.getRundeLanguage().isEmpty()) {
                prompt.append("- Rude language: ").append(String.join(", ", critical.getRundeLanguage())).append("\\n");
            }
        }

        prompt.append("\\n🟠 RISK (Escalation needed):\\n");
        if (callScriptConfig.getConstraints() != null
                && callScriptConfig.getConstraints().getRiskViolations() != null) {
            CallScriptConfig.Constraints.RiskViolations risk = callScriptConfig.getConstraints().getRiskViolations();
            if (risk.getPriorityCaseKeywords() != null && !risk.getPriorityCaseKeywords().isEmpty()) {
                prompt.append("- Priority: ").append(String.join(", ", risk.getPriorityCaseKeywords())).append("\\n");
            }
        }

        prompt.append("\\n🟡 ALERT: Missing mandatory steps\\n\\n");

        // AI Context Analysis
        prompt.append("**AI CONTEXT ANALYSIS** (Judge agent behavior):\\n");
        prompt.append("Analyze HOW the agent is speaking, not just WHAT they say:\\n\\n");

        prompt.append("✅ GOOD CONTEXT (Professional behavior):\\n");
        prompt.append("- Polite, respectful tone\\n");
        prompt.append("- Patient and understanding\\n");
        prompt.append("- Clear communication\\n");
        prompt.append("- Active listening cues (\\\"I understand\\\", \\\"Let me help\\\")\\n");
        prompt.append("- Empathetic responses\\n\\n");

        prompt.append("❌ BAD CONTEXT (Unprofessional behavior):\\n");
        prompt.append("- Rude or dismissive tone\\n");
        prompt.append("- Impatient or rushed\\n");
        prompt.append("- Defensive or argumentative\\n");
        prompt.append("- Ignoring customer concerns\\n");
        prompt.append("- Sarcastic or condescending\\n\\n");

        // Sample Critical Phrases
        if (callScriptConfig.getSampleCriticalPhrases() != null &&
                callScriptConfig.getSampleCriticalPhrases().getCustomerDisconnectionStatements() != null &&
                !callScriptConfig.getSampleCriticalPhrases().getCustomerDisconnectionStatements().isEmpty()) {
            prompt.append("**SAMPLE CRITICAL PHRASES** (Examples of BAD CONTEXT triggers):\\n");
            for (String phrase : callScriptConfig.getSampleCriticalPhrases().getCustomerDisconnectionStatements()) {
                prompt.append("- \\\"").append(phrase).append("\\\"\\n");
            }
            prompt.append(
                    "If agent's behavior triggers customer frustration like these, mark context_quality as BAD\\n\\n");
        }

        // Realistic Scoring Formula
        prompt.append("**REALISTIC PROGRESSIVE SCORING** (Award generously):\\n");
        prompt.append("- Professional Greeting (20 pts)\\n");
        prompt.append("- Active Engagement (10 pts)\\n");
        prompt.append("- Mandatory Steps (49 pts total, 7 pts each):\\n");

        if (callScriptConfig.getMandatorySteps() != null && !callScriptConfig.getMandatorySteps().isEmpty()) {
            for (int i = 0; i < callScriptConfig.getMandatorySteps().size(); i++) {
                prompt.append("  ").append(i + 1).append(". ").append(callScriptConfig.getMandatorySteps().get(i))
                        .append(" (7 pts)\\n");
            }
        }

        prompt.append("- Empathy Statements (10 pts)\\n");
        prompt.append("- Professional Closing (11 pts)\\n");
        prompt.append("- PENALTY: -30 pts for CRITICAL violations OR BAD context\\n\\n");

        // Opening/Closing
        if (callScriptConfig.getOpeningLines() != null && !callScriptConfig.getOpeningLines().isEmpty()) {
            prompt.append("**OPENING** (check at start): ")
                    .append(String.join(" OR ", callScriptConfig.getOpeningLines())).append("\\n\\n");
        }

        if (callScriptConfig.getClosingLines() != null && !callScriptConfig.getClosingLines().isEmpty()) {
            prompt.append("**CLOSING** (only if call ending): ")
                    .append(String.join(" OR ", callScriptConfig.getClosingLines())).append("\\n");
            prompt.append("Note: Don't mark missing if call ongoing\\n\\n");
        }

        // Rules
        prompt.append("**DETECTION RULES**:\\n");
        prompt.append("1. Check CRITICAL violations FIRST\\n");
        prompt.append("2. Analyze agent TONE and CONTEXT\\n");
        prompt.append("3. Award points for every completed step\\n");
        prompt.append("4. Be PRACTICAL and REALISTIC\\n\\n");

        // Output Format with Context Analysis
        prompt.append("**OUTPUT** (valid JSON only):\\n");
        prompt.append("{\\n");
        prompt.append("  \\\"score\\\": <0-100>,\\n");
        prompt.append("  \\\"status\\\": \\\"IN_PROGRESS\\\"|\\\"PASS\\\"|\\\"FAIL\\\",\\n");
        prompt.append("  \\\"severity\\\": \\\"NORMAL\\\"|\\\"ALERT\\\"|\\\"RISK\\\"|\\\"CRITICAL\\\",\\n");
        prompt.append("  \\\"completed_steps\\\": [<array>],\\n");
        prompt.append("  \\\"missing_steps\\\": [<array>],\\n");
        prompt.append("  \\\"critical_violations\\\": [<array>],\\n");
        prompt.append("  \\\"risk_violations\\\": [<array>],\\n");
        prompt.append("  \\\"alerts\\\": [<array>],\\n");
        prompt.append("  \\\"high_risk_detected\\\": <boolean>,\\n");
        prompt.append("  \\\"rude_language_detected\\\": <boolean>,\\n");
        prompt.append("  \\\"social_media_threat_detected\\\": <boolean>,\\n");
        prompt.append("  \\\"priority_case_detected\\\": <boolean>,\\n");
        prompt.append("  \\\"empathy_count\\\": <number>,\\n");
        prompt.append("  \\\"agent_tone\\\": \\\"PROFESSIONAL\\\" | \\\"NEUTRAL\\\" | \\\"UNPROFESSIONAL\\\",\\n");
        prompt.append("  \\\"context_quality\\\": \\\"GOOD\\\" | \\\"ACCEPTABLE\\\" | \\\"BAD\\\",\\n");
        prompt.append("  \\\"behavior_issues\\\": [<array of behavioral problems if any>]\\n");
        prompt.append("}\\n\\n");

        prompt.append("**SEVERITY**:\\n");
        prompt.append("CRITICAL if rude/social_media/high_risk OR context_quality=BAD | ");
        prompt.append("RISK if priority | ALERT if missing_steps | NORMAL otherwise\\n\\n");

        prompt.append("**STATUS**:\\n");
        prompt.append(
                "IN_PROGRESS: ongoing | PASS: all done + good context | FAIL: critical violation OR bad context OR incomplete\\n\\n");

        prompt.append("**TRANSCRIPT**: \\\"").append(transcript).append("\\\"\\n\\n");
        prompt.append("Be professional, practical, simple. Focus on TONE and CONTEXT, not just words.");

        return prompt.toString();
    }

    public String analyzeText(String transcript) {
        if (apiKey == null || apiKey.isEmpty() || "YOUR_GEMINI_API_KEY".equals(apiKey)) {
            System.err.println("⚠️ Gemini API Key not configured.");
            return createErrorResponse("API key not configured");
        }

        try {
            String prompt = buildPrompt(transcript);

            // Build JSON Request
            JSONObject content = new JSONObject();
            JSONObject parts = new JSONObject();
            parts.put("text", prompt);
            content.put("parts", new JSONArray().put(parts));

            JSONObject requestBody = new JSONObject();
            requestBody.put("contents", new JSONArray().put(content));

            // Headers
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);

            HttpEntity<String> request = new HttpEntity<>(requestBody.toString(), headers);

            // Send Request
            String url = API_URL + "?key=" + apiKey;
            ResponseEntity<String> response = restTemplate.postForEntity(url, request, String.class);

            // Parse Response
            JSONObject jsonResponse = new JSONObject(response.getBody());
            String resultText = jsonResponse.getJSONArray("candidates")
                    .getJSONObject(0)
                    .getJSONObject("content")
                    .getJSONArray("parts")
                    .getJSONObject(0)
                    .getString("text");

            resultText = extractJSON(resultText);
            return resultText.trim();

        } catch (Exception e) {
            System.err.println("❌ Gemini API Error: " + e.getMessage());
            e.printStackTrace();
            return createErrorResponse("AI analysis failed: " + e.getMessage());
        }
    }

    private String extractJSON(String text) {
        if (text.contains("```json")) {
            int start = text.indexOf("```json") + 7;
            int end = text.lastIndexOf("```");
            if (end > start) {
                return text.substring(start, end);
            }
        } else if (text.contains("```")) {
            int start = text.indexOf("```") + 3;
            int end = text.lastIndexOf("```");
            if (end > start) {
                return text.substring(start, end);
            }
        }
        return text;
    }

    private String createErrorResponse(String errorMessage) {
        JSONObject error = new JSONObject();
        error.put("score", 0);
        error.put("status", "IN_PROGRESS");
        error.put("severity", "NORMAL");
        error.put("alerts", new JSONArray().put(errorMessage));
        error.put("high_risk_detected", false);
        error.put("priority_case_detected", false);
        error.put("rude_language_detected", false);
        error.put("social_media_threat_detected", false);
        error.put("completed_steps", new JSONArray());
        error.put("missing_steps", new JSONArray());
        error.put("critical_violations", new JSONArray());
        error.put("risk_violations", new JSONArray());
        error.put("empathy_count", 0);
        return error.toString();
    }
}
