import { describe, expect, it } from "vitest";

import {
  asConfidence,
  asFamily,
  asSeverity,
  draftIsEmpty,
  draftToLabel,
  emptyDraft,
  emptyIssue,
  EVAL_LABEL_STORAGE_KEY,
  parseScoreInput,
  parseStoredDrafts,
  sanitizeScoreInput,
  serializeStoredDrafts,
  toDraft,
} from "../src/lib/eval/label-draft";

import type { LabelDraft } from "../src/lib/eval/label-draft";

/** Geçerli bir taslak: tüm alanlar dolu. */
function validDraft(): LabelDraft {
  const draft = emptyDraft();
  draft.overallScore = "82";
  draft.categoryScores.accuracy = "90";
  draft.categoryScores.fluency = "75";
  draft.categoryScores.terminology = "80";
  draft.categoryScores.tone = "85";
  draft.categoryScores.formatting = "78";
  draft.confidence = "high";
  draft.issues = [{ ...emptyIssue(), snippet: "kargo takip numarası", severity: "high" }];
  return draft;
}

describe("etiketleme taslağı — saf mantık (label-draft)", () => {
  it("puan girişini temizler: rakam dışını atar, en fazla 3 hane, 100 tavanı", () => {
    expect(sanitizeScoreInput("")).toBe("");
    expect(sanitizeScoreInput("abc")).toBe("");
    expect(sanitizeScoreInput("82")).toBe("82");
    expect(sanitizeScoreInput("1a2")).toBe("12");
    expect(sanitizeScoreInput("999")).toBe("100");
    expect(sanitizeScoreInput("-5")).toBe("5");
  });

  it("puan ayrıştırma sınırları: 0 ve 100 geçerli, 101 ve boş geçersiz", () => {
    expect(parseScoreInput("0")).toBe(0);
    expect(parseScoreInput("100")).toBe(100);
    expect(parseScoreInput("101")).toBeNull();
    expect(parseScoreInput("")).toBeNull();
    expect(parseScoreInput("abc")).toBeNull();
  });

  it("bilinmeyen enum değerleri güvenli varsayılana düşer", () => {
    expect(asFamily("uydurma")).toBe("accuracy");
    expect(asFamily("locale")).toBe("locale");
    expect(asSeverity(42)).toBe("medium");
    expect(asConfidence("high")).toBe("high");
  });

  it("dolu taslak sözleşmeye uygun EvalLabel üretir", () => {
    const result = draftToLabel(validDraft());
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.label).toMatchObject({
      overallScore: 82,
      confidence: "high",
      uncertain: false,
    });
    expect(result.label?.categoryScores.fluency).toBe(75);
    expect(result.label?.issues[0]).toMatchObject({ family: "accuracy", severity: "high" });
  });

  it("eksik puan alanlarını Türkçe mesajlarla reddeder", () => {
    const draft = validDraft();
    draft.overallScore = "";
    draft.categoryScores.terminology = "";
    const result = draftToLabel(draft);
    expect(result.ok).toBe(false);
    expect(result.label).toBeNull();
    expect(result.errors.join(" ")).toContain("Genel puan");
    expect(result.errors.join(" ")).toContain("Terminoloji");
  });

  it("snippet kuralları: boş snippet ve 300 karakter üstü reddedilir", () => {
    const empty = validDraft();
    empty.issues = [{ ...emptyIssue(), snippet: "   " }];
    expect(draftToLabel(empty).ok).toBe(false);

    const tooLong = validDraft();
    tooLong.issues = [{ ...emptyIssue(), snippet: "x".repeat(301) }];
    const result = draftToLabel(tooLong);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("300");
  });

  it("boş taslak ile dolu taslağı ayırt eder", () => {
    expect(draftIsEmpty(emptyDraft())).toBe(true);
    const touched = emptyDraft();
    touched.uncertain = true;
    expect(draftIsEmpty(touched)).toBe(false);
  });

  it("kayıtlı taslaklar gidiş-dönüş korunur, bozuk kayıt sessizce atılmaz", () => {
    const drafts: Record<string, LabelDraft> = { "trq-0001": validDraft() };
    const roundTrip = parseStoredDrafts(serializeStoredDrafts(drafts));
    expect(roundTrip["trq-0001"]?.overallScore).toBe("82");
    expect(roundTrip["trq-0001"]?.issues).toHaveLength(1);

    expect(parseStoredDrafts(null)).toEqual({});
    expect(parseStoredDrafts("{bozuk json")).toEqual({});
    expect(parseStoredDrafts(JSON.stringify({ version: 1, drafts: { bozuk: 5 } }))).toEqual({});
  });

  it("ham değeri taslağa çevirirken puanları temizler ve sınır dışını tavanlar", () => {
    const draft = toDraft({
      overallScore: "999",
      categoryScores: { accuracy: "88", fluency: "kötü" },
      issues: [{ snippet: "kanıt", family: "locale", severity: "low", note: 5 }],
      confidence: "yok",
      uncertain: "evet",
    });
    expect(draft?.overallScore).toBe("100");
    expect(draft?.categoryScores.accuracy).toBe("88");
    expect(draft?.categoryScores.fluency).toBe("");
    expect(draft?.issues[0]).toMatchObject({ family: "locale", severity: "low" });
    expect(draft?.confidence).toBe("medium");
    expect(draft?.uncertain).toBe(false);
  });

  it("depo anahtarı sürümlü (şema değişince eski kayıt okunmaz)", () => {
    expect(EVAL_LABEL_STORAGE_KEY).toContain(":v1");
  });
});
