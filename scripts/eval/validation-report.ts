/**
 * Veri seti doğrulama raporunun **saf** (dosya sistemi erişimi olmayan) hesabı.
 *
 * CLI (`scripts/eval/validate-data.ts`) bu modülü kullanır; testler de aynı hesabı doğrudan
 * çağırabilsin diye ayrı tutulmuştur (bkz. tests/eval-validate-cli.test.ts).
 */

import type { EvalRecord } from "../../src/lib/eval/record-schema";
import { frozenSplitHash, validateEvalJsonl } from "../../src/lib/eval/record-schema";

export const DEFAULT_DATA_FILE = "data/eval-set.jsonl";
export const EXAMPLE_DATA_FILE = "data/eval-set.example.jsonl";

export interface ValidationReport {
  readonly file: string;
  /** Yazdırılacak satırlar (satır numarası eklenmeden). */
  readonly lines: readonly string[];
  /** 0: hata yok · 1: şema hatası var (CI kapısı). */
  readonly exitCode: number;
  readonly errorCount: number;
  readonly warningCount: number;
  readonly counts: {
    readonly total: number;
    readonly dev: number;
    readonly test: number;
    readonly labeled: number;
    readonly unlabeled: number;
  };
  readonly frozen: { readonly dev: string; readonly test: string };
}

/**
 * Birebir snippet kuralı (ANNOTATION_GUIDE §5): her sorunun snippet'i hedef metinde aynen geçmeli.
 * Bu bir **uyarıdır**, hata değil: geçmiş kayıtlarda sınır durumlar olabilir ve veri sessizce
 * silinmez, yalnızca işaretlenir.
 */
function collectSnippetWarnings(records: readonly EvalRecord[]): string[] {
  const warnings: string[] = [];
  for (const record of records) {
    if (record.labels === null) continue;
    for (const [index, issue] of record.labels.issues.entries()) {
      if (!record.target.includes(issue.snippet)) {
        const preview = issue.snippet.length > 60 ? `${issue.snippet.slice(0, 60)}…` : issue.snippet;
        warnings.push(
          `${record.id} · ${index + 1}. sorun: “${preview}” hedef metinde birebir geçmiyor (aile: ${issue.family}).`,
        );
      }
    }
  }
  return warnings;
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Aynı kimliğin geçtiği 1 tabanlı satır numaraları. */
function findIdLines(text: string, id: string): number[] {
  const lines: number[] = [];
  text.split(/\r?\n/u).forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed === "") return;
    try {
      const decoded: unknown = JSON.parse(trimmed);
      if (isRecordValue(decoded) && decoded.id === id) lines.push(index + 1);
    } catch {
      // Geçersiz JSON kendi hata satırında raporlanır.
    }
  });
  return lines;
}

/**
 * Hata yerini Türkçe ve **satır numaralı** olarak verir.
 * `validateEvalJsonl` tekrarlanan kimlikler için satır 0 döndüğü için gerçek satırlar burada
 * bulunur: "satır 5 (ilk geçiş: satır 1)".
 */
function resolveErrorLocation(text: string, line: number, message: string): string {
  if (line > 0) return `satır ${line}`;
  const match = /^tekrarlanan kimlik: (.+)$/u.exec(message);
  if (match === null || match[1] === undefined) return "satır belirlenemedi";
  const lines = findIdLines(text, match[1]);
  const first = lines[0];
  if (first === undefined) return "satır belirlenemedi";
  const rest = lines.slice(1);
  return rest.length === 0 ? `satır ${first}` : `satır ${rest.join(", ")} (ilk geçiş: satır ${first})`;
}

/**
 * Zod'un bilinen mesajlarını Türkçeye çevirir. Tanınmayan mesaj **olduğu gibi** geçer
 * (sessizce yutulmaz); böylece Zod sürümü değişirse bilgi kaybolmaz.
 */
const ZOD_TRANSLATIONS: ReadonlyArray<readonly [RegExp, (match: RegExpExecArray) => string]> = [
  [/^Too big: expected number to be <=(\d+)$/u, (match) => `sayı en fazla ${match[1]} olabilir`],
  [/^Too small: expected number to be >=(-?\d+)$/u, (match) => `sayı en az ${match[1]} olmalı`],
  [
    /^Too big: expected string to contain at most (\d+) character\(s\)$/u,
    (match) => `metin en fazla ${match[1]} karakter olabilir`,
  ],
  [
    /^Too small: expected string to contain at least (\d+) character\(s\)$/u,
    (match) => `metin en az ${match[1]} karakter olmalı`,
  ],
  [/^Invalid option: expected one of (.+)$/u, (match) => `geçersiz değer; şunlardan biri olmalı → ${match[1]}`],
  [
    /^Invalid input: expected (\w+), received (\w+)$/u,
    (match) => `${match[1]} bekleniyordu, ${match[2]} alındı`,
  ],
  [/^Invalid string: must match pattern/u, () => "metin beklenen kalıba uymuyor (örn. kimlik: trq-0001)"],
  [/^Invalid string: must start with/u, () => "metin beklenen önekle başlamıyor"],
  [/^Invalid input$/u, () => "geçersiz giriş"],
  [/^Required$/u, () => "zorunlu alan eksik"],
  [/^Unrecognized key/u, () => "tanınmayan alan"],
];

/** Tek bir Zod mesajını çevirir; tanınmazsa olduğu gibi döner. */
function translateZodMessage(message: string): string {
  for (const [pattern, translate] of ZOD_TRANSLATIONS) {
    const match = pattern.exec(message);
    if (match !== null) return translate(match);
  }
  return message;
}

/**
 * `parseEvalRecord` hataları "alan.yolu: mesaj" biçiminde (ve en fazla 3 tanesini "; " ile
 * birleştirerek) döner. Burada alan yolu korunur, yalnızca mesaj çevrilir.
 */
function toTurkishMessage(raw: string): string {
  return raw
    .split("; ")
    .map((part) => {
      const separator = part.indexOf(": ");
      if (separator === -1) return part;
      return `${part.slice(0, separator)}: ${translateZodMessage(part.slice(separator + 2))}`;
    })
    .join("; ");
}

/** Boş split için hash basmak yanıltıcı olur: "kayıt yok" yazar. */
function formatSplitHash(records: readonly EvalRecord[], split: "dev" | "test", count: number): string {
  return count > 0 ? frozenSplitHash(records, split) : "(kayıt yok)";
}

/** JSONL metnini doğrular ve yazdırılabilir Türkçe bir rapor üretir. */
export function buildValidationReport(text: string, file: string): ValidationReport {
  const validation = validateEvalJsonl(text);
  const warnings = collectSnippetWarnings(validation.records);

  const lines: string[] = [
    "=== Çeviri kalite kontrol · veri seti doğrulama ===",
    `Dosya: ${file}`,
    `Kayıt sayısı: ${validation.counts.total}  (dev: ${validation.counts.dev}, test: ${validation.counts.test})`,
    `Etiketli: ${validation.counts.labeled}  ·  Etiketsiz: ${validation.counts.unlabeled}`,
    "",
    "Dondurma hash (ADR-004, içerik değişikliğini yakalar):",
    `  dev : ${formatSplitHash(validation.records, "dev", validation.counts.dev)}`,
    `  test: ${formatSplitHash(validation.records, "test", validation.counts.test)}`,
    "",
  ];

  if (validation.counts.total === 0) {
    lines.push(
      "UYARI: veri setinde hiç kayıt yok — doğrulanacak içerik bulunamadı, ölçüm yapılamaz.",
      "",
    );
  }

  if (warnings.length > 0) {
    lines.push(`UYARILAR (${warnings.length}) — snippet hedef metinde birebir geçmiyor:`);
    for (const warning of warnings) lines.push(`  • ${warning}`);
    lines.push("");
  }

  if (validation.errors.length === 0) {
    lines.push("HATA YOK. Veri seti sözleşmeye uygun (EvalRecordSchema).");
  } else {
    lines.push(`HATALAR (${validation.errors.length}):`);
    for (const error of validation.errors) {
      lines.push(`  • ${resolveErrorLocation(text, error.line, error.error)}: ${toTurkishMessage(error.error)}`);
    }
    lines.push("");
    lines.push("Sonuç: BAŞARISIZ — hatalı veri işlenmiş sayılmaz.");
  }

  return {
    file,
    lines,
    exitCode: validation.errors.length > 0 ? 1 : 0,
    errorCount: validation.errors.length,
    warningCount: warnings.length,
    counts: validation.counts,
    frozen: {
      dev: frozenSplitHash(validation.records, "dev"),
      test: frozenSplitHash(validation.records, "test"),
    },
  };
}
