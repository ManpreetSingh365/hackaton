package com.voicestreamai.sst.model;

import java.util.List;

/**
 * POJO representing the callScript.json configuration
 */
public class CallScriptConfig {
    
    private List<String> openingLines;
    private List<String> mandatorySteps;
    private List<String> closingLines;
    private Constraints constraints;
    
    public static class Constraints {
        private int holdTimeLimitSeconds;
        private boolean mustTakeConsentBeforeHold;
        private boolean noAbusiveWords;
        private List<String> noHighRiskWords;
        private List<String> priorityCaseKeywords;
        private int minimumEmpathyCount;
        
        // Getters and setters
        public int getHoldTimeLimitSeconds() { return holdTimeLimitSeconds; }
        public void setHoldTimeLimitSeconds(int value) { this.holdTimeLimitSeconds = value; }
        
        public boolean isMustTakeConsentBeforeHold() { return mustTakeConsentBeforeHold; }
        public void setMustTakeConsentBeforeHold(boolean value) { this.mustTakeConsentBeforeHold = value; }
        
        public boolean isNoAbusiveWords() { return noAbusiveWords; }
        public void setNoAbusiveWords(boolean value) { this.noAbusiveWords = value; }
        
        public List<String> getNoHighRiskWords() { return noHighRiskWords; }
        public void setNoHighRiskWords(List<String> value) { this.noHighRiskWords = value; }
        
        public List<String> getPriorityCaseKeywords() { return priorityCaseKeywords; }
        public void setPriorityCaseKeywords(List<String> value) { this.priorityCaseKeywords = value; }
        
        public int getMinimumEmpathyCount() { return minimumEmpathyCount; }
        public void setMinimumEmpathyCount(int value) { this.minimumEmpathyCount = value; }
    }
    
    // Getters and setters
    public List<String> getOpeningLines() { return openingLines; }
    public void setOpeningLines(List<String> value) { this.openingLines = value; }
    
    public List<String> getMandatorySteps() { return mandatorySteps; }
    public void setMandatorySteps(List<String> value) { this.mandatorySteps = value; }
    
    public List<String> getClosingLines() { return closingLines; }
    public void setClosingLines(List<String> value) { this.closingLines = value; }
    
    public Constraints getConstraints() { return constraints; }
    public void setConstraints(Constraints value) { this.constraints = value; }
}
