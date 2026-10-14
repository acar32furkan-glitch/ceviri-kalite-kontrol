import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildValidationReport } from "../scripts/eval/validation-report";

const examplePath = path.join(process.cwd(), "data", "eval-set.example.jsonl");

describe("veri doğrulama raporu (CLI çekirdeği)", () => {
  it("örnek veri setinde hata bulmaz ve çıkış kodu 0 verir", () => {
    const text = readFileSync(examplePath, "utf8");
    const report = buildValidationReport(text, "data/eval-set.example.jsonl");

    expect(report.exitCode).toBe(0);
    expect(report.errorCount).toBe(0);
    expect(report.warningCount).toBe(0);
    expect(report.counts).toEqual({ total: 5, dev: 3, test: 2, labeled: 2, unlabeled: 3 });
    expect(report.lines.join("\n")).toContain("HATA YOK");
  });

  it("bozuk satırı satır numarasıyla raporlar ve çıkış kodu 1 verir", () => {
    const text = [
      JSON.stringify({
        id: "trq-0001",
        split: "dev",
        direction: "en-tr",
        kind: "ui",
        source: "Download invoice",
        target: "Faturayı indir",
        labels: null,
        origin: "dogal",
        license: "ozgun",
      }),
      "{ bozuk json",
    ].join("\n");

    const report = buildValidationReport(text, "test.jsonl");
    expect(report.exitCode).toBe(1);
    expect(report.errorCount).toBe(1);
    expect(report.lines.join("\n")).toContain("satır 2");
    expect(report.lines.join("\n")).toContain("BAŞARISIZ");
  });

  it("dondurma hash'lerini rapora yazar ve dev/test ayrı hesaplanır", () => {
    const text = readFileSync(examplePath, "utf8");
    const report = buildValidationReport(text, "data/eval-set.example.jsonl");

    expect(report.frozen.dev).toMatch(/^[0-9a-f]{16}$/u);
    expect(report.frozen.test).toMatch(/^[0-9a-f]{16}$/u);
    expect(report.frozen.dev).not.toBe(report.frozen.test);
    expect(report.lines.join("\n")).toContain(`dev : ${report.frozen.dev}`);
    expect(report.lines.join("\n")).toContain(`test: ${report.frozen.test}`);
  });

  it("hedef metinde geçmeyen snippet'i uyarı olarak işaretler (hata değil)", () => {
    const text = JSON.stringify({
      id: "trq-0009",
      split: "dev",
      direction: "en-tr",
      kind: "urun",
      source: "Save your changes before closing the window.",
      target: "Pencereyi kapatmadan önce değişikliklerinizi kaydedin.",
      labels: {
        overallScore: 70,
        categoryScores: { accuracy: 70, fluency: 70, terminology: 70, tone: 70, formatting: 70 },
        issues: [{ snippet: "baska bir metin", family: "fluency", severity: "low" }],
        confidence: "medium",
        uncertain: false,
      },
      origin: "dogal",
      license: "ozgun",
    });

    const report = buildValidationReport(text, "test.jsonl");
    expect(report.exitCode).toBe(0);
    expect(report.warningCount).toBe(1);
    expect(report.lines.join("\n")).toContain("UYARILAR (1)");
  });

  it("şema hatalarını Türkçe mesajla ve satır numarasıyla raporlar", () => {
    const text = [
      JSON.stringify({
        id: "trq-0001",
        split: "dev",
        direction: "en-tr",
        kind: "ui",
        source: "Download invoice",
        target: "Faturayı indir",
        labels: null,
        origin: "dogal",
        license: "ozgun",
      }),
      JSON.stringify({
        id: "trq-0002",
        split: "dev",
        direction: "en-tr",
        kind: "ui",
        source: "Download invoice",
        target: "Faturayı indir",
        labels: {
          overallScore: 101,
          categoryScores: { accuracy: 90, fluency: 90, terminology: 90, tone: 90, formatting: 90 },
          issues: [{ snippet: "indir", family: "yazim", severity: "medium" }],
          confidence: "high",
          uncertain: false,
        },
        origin: "dogal",
        license: "ozgun",
      }),
    ].join("\n");

    const report = buildValidationReport(text, "test.jsonl");
    const output = report.lines.join("\n");
    expect(report.exitCode).toBe(1);
    expect(output).toContain("satır 2");
    expect(output).toContain("labels.overallScore: sayı en fazla 100 olabilir");
    expect(output).toContain("labels.issues.0.family: geçersiz değer");
  });

  it("tekrarlanan kimlikte gerçek satırları bulur (satır 0 yerine)", () => {
    const record = (id: string, split: string): string =>
      JSON.stringify({
        id,
        split,
        direction: "en-tr",
        kind: "ui",
        source: "Download invoice",
        target: "Faturayı indir",
        labels: null,
        origin: "dogal",
        license: "ozgun",
      });
    const text = [record("trq-0001", "dev"), record("trq-0002", "test"), record("trq-0001", "test")].join("\n");

    const report = buildValidationReport(text, "test.jsonl");
    const output = report.lines.join("\n");
    expect(report.exitCode).toBe(1);
    expect(output).toContain("satır 3 (ilk geçiş: satır 1): tekrarlanan kimlik: trq-0001");
  });

  it("boş girdide sıfır kayıt raporlar (çökmez, uyarı basar)", () => {
    const report = buildValidationReport("\n\n", "bos.jsonl");
    expect(report.counts.total).toBe(0);
    expect(report.exitCode).toBe(0);
    expect(report.lines.join("\n")).toContain("(kayıt yok)");
    expect(report.lines.join("\n")).toContain("hiç kayıt yok");
  });
});
