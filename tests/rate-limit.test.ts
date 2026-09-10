import { afterEach, describe, expect, it } from "vitest";
import { checkRateLimit, resetRateLimit } from "../src/lib/rate-limit";

afterEach(() => resetRateLimit());

describe("rate limiting", () => {
  it("allows five requests per minute for one identifier", () => {
    for (let index = 0; index < 5; index += 1) {
      expect(checkRateLimit("127.0.0.1", 1000 + index)).toBe(true);
    }
    expect(checkRateLimit("127.0.0.1", 1005)).toBe(false);
  });

  it("tracks identifiers independently", () => {
    expect(checkRateLimit("one", 1000)).toBe(true);
    expect(checkRateLimit("two", 1000)).toBe(true);
  });

  it("expires old request timestamps", () => {
    expect(checkRateLimit("one", 1000)).toBe(true);
    expect(checkRateLimit("one", 61_001)).toBe(true);
  });
});
