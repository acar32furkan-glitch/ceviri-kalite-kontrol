import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const evaluateWithDeepSeek = vi.hoisted(() => vi.fn());

vi.mock("../src/lib/deepseek", () => ({
  evaluateWithDeepSeek,
  ConfigurationError: class ConfigurationError extends Error {},
}));

import { POST } from "../src/app/api/evaluate/route";
import { resetRateLimit } from "../src/lib/rate-limit";

const validPayload = {
  sourceText: "This is a complete source sentence for translation quality checking.",
  targetText: "Bu, çeviri kalitesi kontrolü için eksiksiz bir kaynak cümledir.",
  direction: "en-tr",
};

beforeEach(() => {
  evaluateWithDeepSeek.mockReset();
  resetRateLimit();
});

afterEach(() => {
  resetRateLimit();
});

describe("POST /api/evaluate", () => {
  it("returns a validated evaluation report", async () => {
    evaluateWithDeepSeek.mockResolvedValue({
      overallScore: 91,
      categoryScores: { accuracy: 92, fluency: 90, terminology: 93, tone: 89, formatting: 91 },
      issues: [],
    });

    const response = await POST(
      new Request("http://localhost/api/evaluate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validPayload),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      report: {
        overallScore: 91,
        categoryScores: { accuracy: 92, fluency: 90, terminology: 93, tone: 89, formatting: 91 },
        issues: [],
      },
    });
  });

  it("rejects an invalid payload before calling the model", async () => {
    const response = await POST(
      new Request("http://localhost/api/evaluate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...validPayload, direction: "fr-de" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(evaluateWithDeepSeek).not.toHaveBeenCalled();
  });

  it("returns a rate limit response after five requests", async () => {
    evaluateWithDeepSeek.mockResolvedValue({
      overallScore: 90,
      categoryScores: { accuracy: 90, fluency: 90, terminology: 90, tone: 90, formatting: 90 },
      issues: [],
    });

    for (let index = 0; index < 5; index += 1) {
      const response = await POST(
        new Request("http://localhost/api/evaluate", {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": "127.0.0.1" },
          body: JSON.stringify(validPayload),
        }),
      );
      expect(response.status).toBe(200);
    }

    const response = await POST(
      new Request("http://localhost/api/evaluate", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "127.0.0.1" },
        body: JSON.stringify(validPayload),
      }),
    );
    expect(response.status).toBe(429);
  });
});
