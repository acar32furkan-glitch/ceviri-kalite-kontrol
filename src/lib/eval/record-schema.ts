/**
 * İnsan etiketli altın veri setinin **sözleşmesi** (JSONL kayıt şeması).
 *
 * Neden Zod: veri seti hem etiketleme arayüzünde hem doğrulama CLI'sinde hem eval çalıştırıcısında
 * okunur. Tek bir şema tanımı, "arayüzde geçen ama eval'de patlayan" veriyi imkânsız kılar.
 *
 * Ölçek kararı (ADR-002): insan etiketleri araç çıktısıyla **aynı** ölçekte tutulur — genel puan 0–100
 * ve beş kategori 0–100. Yeniden ölçekleme yok.
 *
 * Taksonomi kararı (ADR-003): 6 hata ailesi + 3 şiddet. Şiddet, aracın mevcut enum'uyla birebir:
 * `low` | `medium` | `high`.
 */

import { z } from "zod";

/** Araç çıktısındaki kategori anahtarları (src/lib/types.ts ile birebir aynı olmalı). */
export const CATEGORY_KEYS = ["accuracy", "fluency", "terminology", "tone", "formatting"] as const;
export const LABEL_CATEGORIES = CATEGORY_KEYS; // geriye dönük okunabilirlik için takma ad

/** MQM'den sadeleştirilmiş hata aileleri (ADR-003). */
export const ERROR_FAMILIES = [
  "accuracy",
  "fluency",
  "terminology",
  "style",
  "locale",
  "formatting",
] as const;

export const SEVERITIES = ["low", "medium", "high"] as const;
export const SPLITS = ["dev", "test"] as const;
export const DIRECTIONS = ["en-tr", "tr-en"] as const;
export const ORIGINS = ["dogal", "enjekte", "injection"] as const;

/** Metin türü çeşitliliği (prompt §3.1): kısa UI, ürün, e-posta, teknik, resmî. */
export const TEXT_KINDS = ["ui", "urun", "eposta", "teknik", "resmi"] as const;

/** Etiketleyicinin kendi güveni — puanla karıştırılmamalı. */
export const LABEL_CONFIDENCES = ["low", "medium", "high"] as const;

/**
 * Hata ailesi → araç kategorisi eşlemesi.
 * Sorun eşleştirme (P/R/F1) ve kategori bazlı uyum hesabında kullanılır.
 */
export const FAMILY_TO_CATEGORY: Record<(typeof ERROR_FAMILIES)[number], (typeof CATEGORY_KEYS)[number]> = {
  accuracy: "accuracy",
  fluency: "fluency",
  terminology: "terminology",
  style: "tone",
  locale: "formatting",
  formatting: "formatting",
};

const scoreField = z.number().int().min(0).max(100);

export const EvalIssueSchema = z.object({
  /** Hedef metinden birebir alınan parça (kanıt). */
  snippet: z.string().min(1).max(300),
  family: z.enum(ERROR_FAMILIES),
  severity: z.enum(SEVERITIES),
  /** Etiketleyicinin kısa gerekçesi. */
  note: z.string().max(500).optional(),
  /** Etiketleyicinin önerdiği düzeltme (opsiyonel). */
  suggestion: z.string().max(500).optional(),
});

export const EvalLabelSchema = z.object({
  overallScore: scoreField,
  categoryScores: z.object({
    accuracy: scoreField,
    fluency: scoreField,
    terminology: scoreField,
    tone: scoreField,
    formatting: scoreField,
  }),
  issues: z.array(EvalIssueSchema).max(30),
  confidence: z.enum(LABEL_CONFIDENCES),
  /** Kılavuzdaki "belirsiz" işareti: puanlamaya girer ama ayrıca raporlanır (ADR-004). */
  uncertain: z.boolean(),
});

export const EvalRecordSchema = z.object({
  id: z
    .string()
    .regex(/^trq-\d{4}$/, "Kimlik biçimi trq-0001 olmalı"),
  split: z.enum(SPLITS),
  direction: z.enum(DIRECTIONS),
  kind: z.enum(TEXT_KINDS),
  source: z.string().min(10).max(5000),
  target: z.string().min(10).max(5000),
  /** Etiketlenmemiş kayıtlar için `null` — etiketleme sırası bu alandan gelir. */
  labels: EvalLabelSchema.nullable(),
  origin: z.enum(ORIGINS),
  license: z.string().min(1).max(120),
  glossary: z
    .array(z.object({ source: z.string().min(1).max(120), target: z.string().min(1).max(120) }))
    .max(20)
    .optional(),
});

export type EvalIssue = z.infer<typeof EvalIssueSchema>;
export type EvalLabel = z.infer<typeof EvalLabelSchema>;
export type EvalRecord = z.infer<typeof EvalRecordSchema>;
export type ErrorFamily = (typeof ERROR_FAMILIES)[number];
export type EvalSplit = (typeof SPLITS)[number];

/** Tek bir JSONL satırını doğrular; hata mesajı Türkçe ve alan adı içerir. */
export function parseEvalRecord(
  value: unknown,
): { ok: true; record: EvalRecord } | { ok: false; error: string } {
  const result = EvalRecordSchema.safeParse(value);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join(".") || "(kök)"}: ${issue.message}`)
      .join("; ");
    return { ok: false, error: issues };
  }
  return { ok: true, record: result.data };
}

export interface EvalDataValidation {
  readonly records: readonly EvalRecord[];
  readonly errors: readonly { readonly line: number; readonly error: string }[];
  readonly counts: {
    readonly total: number;
    readonly dev: number;
    readonly test: number;
    readonly labeled: number;
    readonly unlabeled: number;
  };
}

/**
 * JSONL metnini (satır satır) doğrular. Boş satırlar atlanır; her hata satır numarasıyla döner,
 * böylece bozuk veri sessizce yutulmaz (ADR-006'nın veri tarafındaki karşılığı).
 */
export function validateEvalJsonl(text: string): EvalDataValidation {
  const records: EvalRecord[] = [];
  const errors: { line: number; error: string }[] = [];

  text.split(/\r?\n/u).forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed === "") return;
    let decoded: unknown;
    try {
      decoded = JSON.parse(trimmed);
    } catch {
      errors.push({ line: index + 1, error: "geçerli JSON değil" });
      return;
    }
    const parsed = parseEvalRecord(decoded);
    if (parsed.ok) records.push(parsed.record);
    else errors.push({ line: index + 1, error: parsed.error });
  });

  const ids = new Set<string>();
  for (const record of records) {
    if (ids.has(record.id)) errors.push({ line: 0, error: `tekrarlanan kimlik: ${record.id}` });
    ids.add(record.id);
  }

  const labeled = records.filter((record) => record.labels !== null).length;
  return {
    records,
    errors,
    counts: {
      total: records.length,
      dev: records.filter((record) => record.split === "dev").length,
      test: records.filter((record) => record.split === "test").length,
      labeled,
      unlabeled: records.length - labeled,
    },
  };
}

/** Test seti dondurma (ADR-004): içeriğin katı biçimde kararlı özeti. */
export function frozenSplitHash(records: readonly EvalRecord[], split: EvalSplit): string {
  const payload = records
    .filter((record) => record.split === split)
    .map((record) => `${record.id}\u0000${record.direction}\u0000${record.source}\u0000${record.target}`)
    .sort()
    .join("\u0001");
  // Node ve tarayıcıda aynı sonucu veren hafif özet (dış bağımlılık yok).
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < payload.length; i += 1) {
    const code = payload.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + code, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}
