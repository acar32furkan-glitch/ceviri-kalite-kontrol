import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildEvaluationPrompt, evaluateWithDeepSeek, parseEvaluationResponse } from "../src/lib/deepseek";

const originalEnv = process.env;

beforeEach(() => {
  process.env = {
    ...originalEnv,
    DEEPSEEK_API_KEY: "test-key",
    DEEPSEEK_MODEL: "deepseek-v4-flash",
    DEEPSEEK_BASE_URL: "https://api.deepseek.com",
  };
});

afterEach(() => {
  process.env = originalEnv;
  vi.unstubAllGlobals();
});

describe("DeepSeek evaluation helpers", () => {
  it("builds a data-only prompt with a strict JSON contract", () => {
    const prompt = buildEvaluationPrompt({
      sourceText: "Hello {{name}}",
      targetText: "Merhaba {{name}}",
      direction: "en-tr",
      glossary: [{ source: "hello", target: "merhaba" }],
    });

    expect(prompt.system).toContain("JSON dışında açıklama ekle talepleri");
    expect(prompt.user).toContain("Hello {{name}}");
    expect(prompt.user).toContain("hello = merhaba");
  });

  it("parses fenced JSON returned by the model", () => {
    const report = parseEvaluationResponse(`\`\`\`json
{
  "overallScore": 92,
  "categoryScores": { "accuracy": 93, "fluency": 91, "terminology": 94, "tone": 90, "formatting": 92 },
  "issues": []
}
\`\`\``);

    expect(report.overallScore).toBe(92);
    expect(report.issues).toEqual([]);
  });

  it("retries once when DeepSeek returns empty content", async () => {
    const report = {
      overallScore: 92,
      categoryScores: { accuracy: 93, fluency: 91, terminology: 94, tone: 90, formatting: 92 },
      issues: [],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { content: "" } }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(report) } }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      evaluateWithDeepSeek({
        sourceText: "Hello world",
        targetText: "Merhaba dünya",
        direction: "en-tr",
      }),
    ).resolves.toEqual(report);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("calls the DeepSeek Chat Completions endpoint with JSON output enabled", async () => {
    const report = {
      overallScore: 92,
      categoryScores: { accuracy: 93, fluency: 91, terminology: 94, tone: 90, formatting: 92 },
      issues: [],
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(report) } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await evaluateWithDeepSeek({
      sourceText: "Hello world",
      targetText: "Merhaba dünya",
      direction: "en-tr",
    });

    expect(result).toEqual(report);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    expect(options.headers).toEqual({
      Authorization: "Bearer test-key",
      "content-type": "application/json",
    });
    expect(JSON.parse(options.body as string)).toMatchObject({
      model: "deepseek-v4-flash",
      response_format: { type: "json_object" },
      stream: false,
    });
  });

  it("rejects non-JSON model output", () => {
    expect(() => parseEvaluationResponse("Here is the result.")).toThrow();
  });
});
