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
    private SampleCriticalPhrases sampleCriticalPhrases;

    public static class Constraints {
        private int holdTimeLimitSeconds;
        private boolean mustTakeConsentBeforeHold;
        private boolean noAbusiveWords;
        private CriticalViolations criticalViolations;
        private RiskViolations riskViolations;
        private int minimumEmpathyCount;

        public static class CriticalViolations {
            private List<String> highRiskWords;
            private List<String> socialMediaThreats;
            private List<String> rudeLanguage;

            public List<String> getHighRiskWords() {
                return highRiskWords;
            }

            public void setHighRiskWords(List<String> value) {
                this.highRiskWords = value;
            }

            public List<String> getSocialMediaThreats() {
                return socialMediaThreats;
            }

            public void setSocialMediaThreats(List<String> value) {
                this.socialMediaThreats = value;
            }

            public List<String> getRundeLanguage() {
                return rudeLanguage;
            }

            public void setRundeLanguage(List<String> value) {
                this.rudeLanguage = value;
            }
        }

        public static class RiskViolations {
            private List<String> priorityCaseKeywords;

            public List<String> getPriorityCaseKeywords() {
                return priorityCaseKeywords;
            }

            public void setPriorityCaseKeywords(List<String> value) {
                this.priorityCaseKeywords = value;
            }
        }

        public int getHoldTimeLimitSeconds() {
            return holdTimeLimitSeconds;
        }

        public void setHoldTimeLimitSeconds(int value) {
            this.holdTimeLimitSeconds = value;
        }

        public boolean isMustTakeConsentBeforeHold() {
            return mustTakeConsentBeforeHold;
        }

        public void setMustTakeConsentBeforeHold(boolean value) {
            this.mustTakeConsentBeforeHold = value;
        }

        public boolean isNoAbusiveWords() {
            return noAbusiveWords;
        }

        public void setNoAbusiveWords(boolean value) {
            this.noAbusiveWords = value;
        }

        public CriticalViolations getCriticalViolations() {
            return criticalViolations;
        }

        public void setCriticalViolations(CriticalViolations value) {
            this.criticalViolations = value;
        }

        public RiskViolations getRiskViolations() {
            return riskViolations;
        }

        public void setRiskViolations(RiskViolations value) {
            this.riskViolations = value;
        }

        public int getMinimumEmpathyCount() {
            return minimumEmpathyCount;
        }

        public void setMinimumEmpathyCount(int value) {
            this.minimumEmpathyCount = value;
        }
    }

    public static class SampleCriticalPhrases {
        private List<String> customerDisconnectionStatements;

        public List<String> getCustomerDisconnectionStatements() {
            return customerDisconnectionStatements;
        }

        public void setCustomerDisconnectionStatements(List<String> value) {
            this.customerDisconnectionStatements = value;
        }
    }

    // Main class getters and setters
    public List<String> getOpeningLines() {
        return openingLines;
    }

    public void setOpeningLines(List<String> value) {
        this.openingLines = value;
    }

    public List<String> getMandatorySteps() {
        return mandatorySteps;
    }

    public void setMandatorySteps(List<String> value) {
        this.mandatorySteps = value;
    }

    public List<String> getClosingLines() {
        return closingLines;
    }

    public void setClosingLines(List<String> value) {
        this.closingLines = value;
    }

    public Constraints getConstraints() {
        return constraints;
    }

    public void setConstraints(Constraints value) {
        this.constraints = value;
    }

    public SampleCriticalPhrases getSampleCriticalPhrases() {
        return sampleCriticalPhrases;
    }

    public void setSampleCriticalPhrases(SampleCriticalPhrases value) {
        this.sampleCriticalPhrases = value;
    }
}
