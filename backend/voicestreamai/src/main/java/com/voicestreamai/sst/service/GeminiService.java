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
import java.util.stream.Collectors;

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
            // Create default config to prevent null pointer
            callScriptConfig = new CallScriptConfig();
        }
    }

    /**
     * Build dynamic AI prompt from callScript.json configuration
     */
    private String buildPrompt(String transcript) {
        StringBuilder prompt = new StringBuilder();

        prompt.append("You are analyzing a LIVE customer service call in REAL-TIME for compliance.\n\n");

        prompt.append("**IMPORTANT SCORING RULES**:\n");
        prompt.append("- Give PARTIAL CREDIT for steps completed so far (not 0% for incomplete calls)\n");
        prompt.append("- Score should INCREASE as agent completes more requirements\n");
        prompt.append("- Only check closing lines if transcript contains goodbye/thank you/closing words\n");
        prompt.append("- Focus on what HAS been done, not just what's missing\n\n");

        // Mandatory Steps
        if (callScriptConfig.getMandatorySteps() != null && !callScriptConfig.getMandatorySteps().isEmpty()) {
            prompt.append("**MANDATORY STEPS** (Agent must complete ALL of these):\n");
            for (int i = 0; i < callScriptConfig.getMandatorySteps().size(); i++) {
                prompt.append((i + 1)).append(". ").append(callScriptConfig.getMandatorySteps().get(i)).append("\n");
            }
            prompt.append("\n");
        }

        // Opening Lines Check
        if (callScriptConfig.getOpeningLines() != null && !callScriptConfig.getOpeningLines().isEmpty()) {
            prompt.append("**OPENING LINES** (Check at START of call):\n");
            prompt.append("Expected: ").append(String.join(" OR ", callScriptConfig.getOpeningLines())).append("\n\n");
        }

        // Closing Lines Check - contextualize
        if (callScriptConfig.getClosingLines() != null && !callScriptConfig.getClosingLines().isEmpty()) {
            prompt.append("**CLOSING LINES** (ONLY check if call appears to be ending):\n");
            prompt.append("Expected: ").append(String.join(" OR ", callScriptConfig.getClosingLines())).append("\n");
            prompt.append("Note: Do NOT mark as missing if call is still ongoing\n\n");
        }

        // Constraints - PROACTIVE checking
        if (callScriptConfig.getConstraints() != null) {
            CallScriptConfig.Constraints c = callScriptConfig.getConstraints();

            prompt.append("**CONSTRAINTS** (Check PROACTIVELY throughout call):\n");

            if (c.isNoAbusiveWords()) {
                prompt.append("- No abusive or offensive language allowed\n");
            }

            if (c.getNoHighRiskWords() != null && !c.getNoHighRiskWords().isEmpty()) {
                prompt.append("- HIGH-RISK WORDS (IMMEDIATELY flag if detected): ")
                        .append(String.join(", ", c.getNoHighRiskWords()))
                        .append("\n");
            }

            if (c.getPriorityCaseKeywords() != null && !c.getPriorityCaseKeywords().isEmpty()) {
                prompt.append("- PRIORITY KEYWORDS (IMMEDIATELY escalate if detected): ")
                        .append(String.join(", ", c.getPriorityCaseKeywords()))
                        .append("\n");
            }

            if (c.getMinimumEmpathyCount() > 0) {
                prompt.append("- Minimum empathy statements required: ").append(c.getMinimumEmpathyCount())
                        .append(" (count how many found so far)\n");
            }

            prompt.append("\n");
        }

        // Scoring Instructions - PROGRESSIVE
        prompt.append("**PROGRESSIVE SCORING FORMULA**:\n");
        prompt.append("- Opening greeting present: +15 points\n");
        prompt.append("- Each mandatory step completed: +10 points each (70 points total for 7 steps)\n");
        prompt.append("- Empathy statement used: +5 points\n");
        prompt.append("- Closing (if call ending): +10 points\n");
        prompt.append("- SUBTRACT 20 points if high-risk words detected\n");
        prompt.append("- Current score = points earned so far\n\n");

        // Analysis Instructions
        prompt.append("**ANALYSIS INSTRUCTIONS**:\n");
        prompt.append("Analyze the transcript PROGRESSIVELY and return ONLY a valid JSON object:\n");
        prompt.append("{\n");
        prompt.append("  \"score\": <number 0-100 based on completed items so far>,\n");
        prompt.append("  \"status\": \"IN_PROGRESS\" or \"PASS\" or \"FAIL\",\n");
        prompt.append("  \"alerts\": [\"only critical warnings, not all missing steps\"],\n");
        prompt.append("  \"high_risk_detected\": <boolean>,\n");
        prompt.append("  \"priority_case_detected\": <boolean>,\n");
        prompt.append("  \"completed_steps\": [\"array of mandatory steps COMPLETED so far\"],\n");
        prompt.append("  \"missing_steps\": [\"array of mandatory steps NOT YET completed\"],\n");
        prompt.append("  \"empathy_count\": <number of empathy statements found>\n");
        prompt.append("}\n\n");

        prompt.append("**STATUS LOGIC**:\n");
        prompt.append("- IN_PROGRESS: Call is ongoing, not all steps complete yet\n");
        prompt.append("- PASS: All mandatory steps + closing completed\n");
        prompt.append("- FAIL: High-risk detected OR call ended without all steps\n\n");

        prompt.append("**TRANSCRIPT TO ANALYZE** (current conversation so far):\n");
        prompt.append("\"").append(transcript).append("\"\n");

        return prompt.toString();
    }

    public String analyzeText(String transcript) {
        if (apiKey == null || apiKey.isEmpty() || "YOUR_GEMINI_API_KEY".equals(apiKey)) {
            System.err.println("⚠️ Gemini API Key not configured. Set GEMINI_API_KEY environment variable.");
            return createErrorResponse("API key not configured");
        }

        try {
            // Build dynamic prompt from callScript.json
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

            // Extract JSON from markdown code block if present
            resultText = extractJSON(resultText);

            return resultText.trim();

        } catch (Exception e) {
            System.err.println("❌ Gemini API Error: " + e.getMessage());
            e.printStackTrace();
            return createErrorResponse("AI analysis failed: " + e.getMessage());
        }
    }

    /**
     * Extract JSON from markdown code blocks
     */
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

    /**
     * Create error response in expected JSON format
     */
    private String createErrorResponse(String errorMessage) {
        JSONObject error = new JSONObject();
        error.put("score", 0);
        error.put("status", "IN_PROGRESS");
        error.put("alerts", new JSONArray().put(errorMessage));
        error.put("high_risk_detected", false);
        error.put("priority_case_detected", false);
        error.put("completed_steps", new JSONArray());
        error.put("missing_steps", new JSONArray());
        error.put("empathy_count", 0);
        return error.toString();
    }
}
