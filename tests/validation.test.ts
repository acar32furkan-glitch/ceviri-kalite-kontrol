import { describe, expect, it } from "vitest";
import { parseGlossary, validateEvaluationPayload, validateEvaluationReport } from "../src/lib/validation";

describe("evaluation payload validation", () => {
  it("accepts a valid request", () => {
    const result = validateEvaluationPayload({
      sourceText: "Hello world, this is a complete source sentence.",
      targetText: "Merhaba dünya, bu eksiksiz bir kaynak cümledir.",
      direction: "en-tr",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.sourceText).toBe("Hello world, this is a complete source sentence.");
      expect(result.value.direction).toBe("en-tr");
    }
  });

  it("rejects identical source and target text", () => {
    const result = validateEvaluationPayload({
      sourceText: "This is a complete source sentence for testing.",
      targetText: "This is a complete source sentence for testing.",
      direction: "en-tr",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("aynı");
  });

  it("rejects text above the server-side length limit", () => {
    const result = validateEvaluationPayload({
      sourceText: "a".repeat(5001),
      targetText: "Bu hedef metin yeterli uzunlukta görünüyor.",
      direction: "en-tr",
    });

    expect(result.ok).toBe(false);
  });

  it("parses glossary lines using equals or colon separators", () => {
    expect(parseGlossary("password = parola\nsupport: destek ekibi\ninvalid line")).toEqual([
      { source: "password", target: "parola" },
      { source: "support", target: "destek ekibi" },
    ]);
  });
});

describe("evaluation report validation", () => {
  it("normalizes a model response", () => {
    const report = validateEvaluationReport({
      overallScore: 88.6,
      categoryScores: {
        accuracy: 91,
        fluency: 86,
        terminology: 90,
        tone: 84,
        formatting: 92,
      },
      issues: [
        {
          snippet: "account",
          type: "terminology",
          severity: "medium",
          suggestion: "Use the approved glossary term.",
        },
      ],
    });

    expect(report.overallScore).toBe(89);
    expect(report.categoryScores.accuracy).toBe(91);
    expect(report.issues).toHaveLength(1);
  });

  it("rejects scores outside the valid range", () => {
    expect(() =>
      validateEvaluationReport({
        overallScore: 101,
        categoryScores: { accuracy: 1, fluency: 2, terminology: 3, tone: 4, formatting: 5 },
        issues: [],
      }),
    ).toThrow();
  });
});
