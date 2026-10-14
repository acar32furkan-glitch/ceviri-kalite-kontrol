import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  frozenSplitHash,
  parseEvalRecord,
  validateEvalJsonl,
} from "../src/lib/eval/record-schema";
import type { EvalRecord } from "../src/lib/eval/record-schema";

/** Geçerli bir kaydın JSON düzlemi (JSONL'deki gibi). Testler bu tabandan türetir. */
function validRecordJson(): Record<string, unknown> {
  return {
    id: "trq-0001",
    split: "dev",
    direction: "en-tr",
    kind: "urun",
    source: "Save your changes before closing the window.",
    target: "Pencereyi kapatmadan önce değişikliklerinizi kaydedin.",
    labels: null,
    origin: "dogal",
    license: "ozgun",
  };
}

function validLabelJson(): Record<string, unknown> {
  return {
    overallScore: 80,
    categoryScores: { accuracy: 85, fluency: 72, terminology: 80, tone: 85, formatting: 90 },
    issues: [{ snippet: "kaydedin", family: "fluency", severity: "medium" }],
    confidence: "high",
    uncertain: false,
  };
}

function asRecord(value: unknown): EvalRecord {
  const parsed = parseEvalRecord(value);
  if (!parsed.ok) throw new Error(`Beklenmeyen doğrulama hatası: ${parsed.error}`);
  return parsed.record;
}

describe("EvalRecordSchema · geçerli kayıtlar", () => {
  it("etiketlenmemiş kaydı kabul eder", () => {
    const parsed = parseEvalRecord(validRecordJson());
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.record.id).toBe("trq-0001");
      expect(parsed.record.labels).toBeNull();
      expect(parsed.record.split).toBe("dev");
    }
  });

  it("etiketli kaydı ve tüm kategori puanlarını kabul eder", () => {
    const parsed = parseEvalRecord({ ...validRecordJson(), labels: validLabelJson() });
    expect(parsed.ok).toBe(true);
    if (parsed.ok && parsed.record.labels !== null) {
      expect(parsed.record.labels.overallScore).toBe(80);
      expect(parsed.record.labels.categoryScores.formatting).toBe(90);
      expect(parsed.record.labels.issues).toHaveLength(1);
      expect(parsed.record.labels.issues[0]?.family).toBe("fluency");
    }
  });

  it("glossary alanını opsiyonel kabul eder", () => {
    const parsed = parseEvalRecord({
      ...validRecordJson(),
      glossary: [{ source: "dashboard", target: "kontrol paneli" }],
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.record.glossary).toHaveLength(1);
  });
});

describe("EvalRecordSchema · puan sınırları (0–100 tam sayı)", () => {
  it("101 genel puanı reddeder", () => {
    const parsed = parseEvalRecord({
      ...validRecordJson(),
      labels: { ...validLabelJson(), overallScore: 101 },
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toContain("overallScore");
  });

  it("-1 genel puanı reddeder", () => {
    const parsed = parseEvalRecord({
      ...validRecordJson(),
      labels: { ...validLabelJson(), overallScore: -1 },
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toContain("overallScore");
  });

  it("kategori puanı 101 ve -1 reddedilir", () => {
    for (const invalid of [101, -1]) {
      const parsed = parseEvalRecord({
        ...validRecordJson(),
        labels: {
          ...validLabelJson(),
          categoryScores: { accuracy: invalid, fluency: 50, terminology: 50, tone: 50, formatting: 50 },
        },
      });
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) expect(parsed.error).toContain("categoryScores.accuracy");
    }
  });

  it("ondalıklı puanı reddeder (tam sayı şartı)", () => {
    const parsed = parseEvalRecord({
      ...validRecordJson(),
      labels: { ...validLabelJson(), overallScore: 88.5 },
    });
    expect(parsed.ok).toBe(false);
  });

  it("0 ve 100 kabul edilir (sınır değerler)", () => {
    for (const score of [0, 100]) {
      const parsed = parseEvalRecord({
        ...validRecordJson(),
        labels: { ...validLabelJson(), overallScore: score },
      });
      expect(parsed.ok).toBe(true);
    }
  });
});

describe("EvalRecordSchema · taksonomi kısıtları", () => {
  it("bilinmeyen hata ailesini reddeder", () => {
    const parsed = parseEvalRecord({
      ...validRecordJson(),
      labels: {
        ...validLabelJson(),
        issues: [{ snippet: "kaydedin", family: "yazim", severity: "medium" }],
      },
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toContain("family");
  });

  it("bilinmeyen şiddeti reddeder (araç enum'uyla birebir olmalı)", () => {
    const parsed = parseEvalRecord({
      ...validRecordJson(),
      labels: {
        ...validLabelJson(),
        issues: [{ snippet: "kaydedin", family: "fluency", severity: "critical" }],
      },
    });
    expect(parsed.ok).toBe(false);
  });

  it("300 karakterden uzun snippet'i reddeder", () => {
    const parsed = parseEvalRecord({
      ...validRecordJson(),
      labels: {
        ...validLabelJson(),
        issues: [{ snippet: "a".repeat(301), family: "fluency", severity: "low" }],
      },
    });
    expect(parsed.ok).toBe(false);
  });

  it("boş snippet'i reddeder", () => {
    const parsed = parseEvalRecord({
      ...validRecordJson(),
      labels: { ...validLabelJson(), issues: [{ snippet: "", family: "fluency", severity: "low" }] },
    });
    expect(parsed.ok).toBe(false);
  });

  it("geçersiz kimlik biçimini reddeder", () => {
    for (const id of ["trq-1", "TRQ-0001", "trq-00001"]) {
      const parsed = parseEvalRecord({ ...validRecordJson(), id });
      expect(parsed.ok).toBe(false);
    }
  });

  it("bilinmeyen origin değerini reddeder", () => {
    const parsed = parseEvalRecord({ ...validRecordJson(), origin: "ceviri" });
    expect(parsed.ok).toBe(false);
  });
});

describe("validateEvalJsonl · satır bazlı doğrulama", () => {
  it("bozuk JSON satırını satır numarasıyla raporlar", () => {
    const text = [
      JSON.stringify(validRecordJson()),
      "{ bu json degil",
      JSON.stringify({ ...validRecordJson(), id: "trq-0002" }),
    ].join("\n");

    const validation = validateEvalJsonl(text);
    expect(validation.records).toHaveLength(2);
    expect(validation.errors).toHaveLength(1);
    expect(validation.errors[0]?.line).toBe(2);
    expect(validation.errors[0]?.error).toContain("geçerli JSON");
  });

  it("şema hatasını doğru satırda raporlar ve geçerli kayıtları korur", () => {
    const text = [
      JSON.stringify({ ...validRecordJson(), id: "trq-0001" }),
      JSON.stringify({ ...validRecordJson(), id: "trq-0002", labels: { ...validLabelJson(), overallScore: 101 } }),
      JSON.stringify({ ...validRecordJson(), id: "trq-0003" }),
    ].join("\n");

    const validation = validateEvalJsonl(text);
    expect(validation.counts.total).toBe(2);
    expect(validation.errors).toHaveLength(1);
    expect(validation.errors[0]?.line).toBe(2);
    expect(validation.errors[0]?.error).toContain("overallScore");
  });

  it("tekrarlanan kimliği yakalar", () => {
    const text = [
      JSON.stringify({ ...validRecordJson(), id: "trq-0007" }),
      JSON.stringify({ ...validRecordJson(), id: "trq-0007" }),
    ].join("\n");

    const validation = validateEvalJsonl(text);
    expect(validation.records).toHaveLength(2);
    expect(validation.errors).toHaveLength(1);
    expect(validation.errors[0]?.error).toContain("tekrarlanan kimlik: trq-0007");
  });

  it("boş satırları atlar ve dev/test/etiket sayılarını doğru hesaplar", () => {
    const text = [
      "",
      JSON.stringify({ ...validRecordJson(), id: "trq-0001", split: "dev", labels: validLabelJson() }),
      "   ",
      JSON.stringify({ ...validRecordJson(), id: "trq-0002", split: "test", labels: null }),
      "",
    ].join("\n");

    const validation = validateEvalJsonl(text);
    expect(validation.errors).toHaveLength(0);
    expect(validation.counts).toEqual({ total: 2, dev: 1, test: 1, labeled: 1, unlabeled: 1 });
  });
});

describe("frozenSplitHash · test seti dondurma (ADR-004)", () => {
  const devRecord = asRecord({ ...validRecordJson(), id: "trq-0001", split: "dev" });
  const testRecord = asRecord({ ...validRecordJson(), id: "trq-0002", split: "test" });

  it("aynı girdide kararlıdır", () => {
    const first = frozenSplitHash([devRecord, testRecord], "test");
    const second = frozenSplitHash([devRecord, testRecord], "test");
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{16}$/u);
  });

  it("sıradan bağımsızdır (kayıtlar sıralanarak özetlenir)", () => {
    const other = asRecord({ ...validRecordJson(), id: "trq-0003", split: "test" });
    expect(frozenSplitHash([testRecord, other], "test")).toBe(frozenSplitHash([other, testRecord], "test"));
  });

  it("farklı girdide farklıdır (içerik değişikliğini yakalar)", () => {
    const changed = asRecord({ ...validRecordJson(), id: "trq-0002", split: "test", target: "Tamamen farklı bir çeviri metni." });
    expect(frozenSplitHash([testRecord], "test")).not.toBe(frozenSplitHash([changed], "test"));
  });

  it("etiket değişikliğinden etkilenmez (yalnızca içerik dondurulur)", () => {
    const labeled = asRecord({ ...validRecordJson(), id: "trq-0002", split: "test", labels: validLabelJson() });
    expect(frozenSplitHash([labeled], "test")).toBe(frozenSplitHash([testRecord], "test"));
  });

  it("split'ler ayrı hesaplanır", () => {
    expect(frozenSplitHash([devRecord, testRecord], "dev")).not.toBe(frozenSplitHash([devRecord, testRecord], "test"));
  });
});

describe("örnek veri seti (data/eval-set.example.jsonl)", () => {
  const examplePath = path.join(process.cwd(), "data", "eval-set.example.jsonl");
  const text = readFileSync(examplePath, "utf8");
  const validation = validateEvalJsonl(text);

  it("şema hatası içermez ve 5 kayıt taşır", () => {
    expect(validation.errors).toEqual([]);
    expect(validation.counts.total).toBe(5);
    expect(validation.counts.dev + validation.counts.test).toBe(5);
  });

  it("etiketli ve etiketsiz kayıtları birlikte içerir", () => {
    expect(validation.counts.labeled).toBeGreaterThan(0);
    expect(validation.counts.unlabeled).toBeGreaterThan(0);
  });

  it("istenen origin çeşitliliğini sağlar (dogal / enjekte / injection)", () => {
    const origins = new Set(validation.records.map((record) => record.origin));
    expect(origins).toEqual(new Set(["dogal", "enjekte", "injection"]));
  });

  it("her kaydın lisansı doldurulmuştur (ADR-005)", () => {
    for (const record of validation.records) {
      expect(record.license.length).toBeGreaterThan(0);
    }
  });

  it("her snippet hedef metinde birebir geçer (kılavuz §5)", () => {
    for (const record of validation.records) {
      if (record.labels === null) continue;
      for (const issue of record.labels.issues) {
        expect(record.target).toContain(issue.snippet);
      }
    }
  });
});
