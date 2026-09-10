export type Direction = "en-tr" | "tr-en";
export type DirectionChoice = "auto" | Direction;
export type Severity = "low" | "medium" | "high";

export interface GlossaryEntry {
  source: string;
  target: string;
}

export interface CategoryScores {
  accuracy: number;
  fluency: number;
  terminology: number;
  tone: number;
  formatting: number;
}

export interface EvaluationIssue {
  snippet: string;
  type: string;
  severity: Severity;
  suggestion: string;
}

export interface EvaluationReport {
  overallScore: number;
  categoryScores: CategoryScores;
  issues: EvaluationIssue[];
}

export interface EvaluationRequest {
  sourceText: string;
  targetText: string;
  direction: Direction;
  glossary?: GlossaryEntry[];
}

export interface EvaluationResponse {
  report: EvaluationReport;
  detectedSourceLanguage?: "en" | "tr" | "unknown";
}
