/**
 * Etiketleme formunun **saf** mantığı: taslak (metin tabanlı form durumu) ↔ `EvalLabel`.
 *
 * Neden ayrı dosya: puan sınırları (0–100 tam sayı), snippet uzunluğu (1–300) ve kayıtlı taslak
 * doğrulaması sessizce bozulmaması gereken kurallardır. Burada tutulunca arayüzden bağımsız
 * olarak test edilebilirler (bkz. tests/eval-label-draft.test.ts). Tarayıcıya özgü hiçbir şey
 * (window, localStorage) bu dosyada yoktur; girdiler dışarıdan verilir.
 */

import type { EvalIssue, EvalLabel } from "./record-schema";
import {
  CATEGORY_KEYS,
  ERROR_FAMILIES,
  EvalLabelSchema,
  LABEL_CONFIDENCES,
  SEVERITIES,
} from "./record-schema";

/** Arayüz kısayol tuşlarının saklandığı anahtar. */
export const EVAL_LABEL_STORAGE_KEY = "ceviri-kalite-kontrol:eval-label-drafts:v1";

/** Snippet sınırı `EvalIssueSchema` ile birebir aynı olmalı (kılavuz §5). */
export const SNIPPET_MAX_LENGTH = 300;
export const SNIPPET_MIN_LENGTH = 1;
export const SCORE_MIN = 0;
export const SCORE_MAX = 100;

export type CategoryKey = (typeof CATEGORY_KEYS)[number];
export type Severity = (typeof SEVERITIES)[number];
export type LabelConfidence = (typeof LABEL_CONFIDENCES)[number];
export type ErrorFamily = (typeof ERROR_FAMILIES)[number];

export interface IssueDraft {
  snippet: string;
  family: ErrorFamily;
  severity: Severity;
  note: string;
  suggestion: string;
}

export interface LabelDraft {
  overallScore: string;
  categoryScores: Record<CategoryKey, string>;
  issues: IssueDraft[];
  confidence: LabelConfidence;
  uncertain: boolean;
}

export function emptyDraft(): LabelDraft {
  return {
    overallScore: "",
    categoryScores: { accuracy: "", fluency: "", terminology: "", tone: "", formatting: "" },
    issues: [],
    confidence: "medium",
    uncertain: false,
  };
}

export function emptyIssue(): IssueDraft {
  return { snippet: "", family: "accuracy", severity: "medium", note: "", suggestion: "" };
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/* ------------------------------------------------------------------ */
/* Güvenli değer dönüşümleri (dışarıdan gelen veriye asla güvenilmez)   */
/* ------------------------------------------------------------------ */

export function asFamily(value: unknown): ErrorFamily {
  return ERROR_FAMILIES.find((family) => family === value) ?? "accuracy";
}

export function asSeverity(value: unknown): Severity {
  return SEVERITIES.find((severity) => severity === value) ?? "medium";
}

export function asConfidence(value: unknown): LabelConfidence {
  return LABEL_CONFIDENCES.find((confidence) => confidence === value) ?? "medium";
}

/* ------------------------------------------------------------------ */
/* Puan girişi                                                         */
/* ------------------------------------------------------------------ */

/** Girişte yalnızca rakam bırakır, en fazla 3 hane, 100'ün üstünü 100'e çeker. */
export function sanitizeScoreInput(raw: string): string {
  const digits = raw.replace(/\D/gu, "").slice(0, 3);
  if (digits === "") return "";
  const value = Number.parseInt(digits, 10);
  return value > SCORE_MAX ? String(SCORE_MAX) : String(value);
}

/** Boş veya geçersiz girişte `null` döner; sekme sırası bozulmasın diye boş bırakılabilir. */
export function parseScoreInput(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,3}$/u.test(trimmed)) return null;
  const value = Number.parseInt(trimmed, 10);
  return value >= SCORE_MIN && value <= SCORE_MAX ? value : null;
}

/* ------------------------------------------------------------------ */
/* Taslak → EvalLabel                                                  */
/* ------------------------------------------------------------------ */

export interface DraftValidation {
  readonly ok: boolean;
  readonly label: EvalLabel | null;
  readonly errors: readonly string[];
}

/** Türkçe alan adları hata mesajlarında kullanılır; arayüzdeki etiketlerle aynı olmalı. */
const CATEGORY_ERROR_LABELS: Record<CategoryKey, string> = {
  accuracy: "Anlam doğruluğu",
  fluency: "Akıcılık",
  terminology: "Terminoloji",
  tone: "Ton ve register",
  formatting: "Biçimlendirme",
};

/**
 * Taslağı sözleşmeye uygun bir `EvalLabel`'a çevirir.
 * Kural: 0–100 tam sayı zorunlu; snippet boş olamaz ve 300 karakteri geçemez.
 */
export function draftToLabel(draft: LabelDraft): DraftValidation {
  const errors: string[] = [];

  const overallScore = parseScoreInput(draft.overallScore);
  if (overallScore === null) errors.push(`Genel puan ${SCORE_MIN}–${SCORE_MAX} arası bir tam sayı olmalı.`);

  const categoryScores: Record<CategoryKey, number> = {
    accuracy: 0,
    fluency: 0,
    terminology: 0,
    tone: 0,
    formatting: 0,
  };
  for (const key of CATEGORY_KEYS) {
    const value = parseScoreInput(draft.categoryScores[key]);
    if (value === null) {
      errors.push(`${CATEGORY_ERROR_LABELS[key]}: ${SCORE_MIN}–${SCORE_MAX} arası tam sayı girin.`);
    } else {
      categoryScores[key] = value;
    }
  }

  const issues: EvalIssue[] = [];
  for (const [position, issue] of draft.issues.entries()) {
    const snippet = issue.snippet.trim();
    if (snippet === "") {
      errors.push(`${position + 1}. sorun: snippet boş. Hedef metinden bir parça kopyalayın.`);
      continue;
    }
    if (snippet.length > SNIPPET_MAX_LENGTH) {
      errors.push(
        `${position + 1}. sorun: snippet ${SNIPPET_MAX_LENGTH} karakteri aşıyor (${snippet.length}).`,
      );
      continue;
    }
    const entry: EvalIssue = { snippet, family: issue.family, severity: issue.severity };
    const note = issue.note.trim();
    const suggestion = issue.suggestion.trim();
    if (note !== "") entry.note = note;
    if (suggestion !== "") entry.suggestion = suggestion;
    issues.push(entry);
  }

  if (errors.length > 0 || overallScore === null) {
    return { ok: false, label: null, errors: errors.length > 0 ? errors : ["Etiket geçersiz."] };
  }

  const candidate: EvalLabel = {
    overallScore,
    categoryScores,
    issues,
    confidence: draft.confidence,
    uncertain: draft.uncertain,
  };
  // Son güvenlik ağı: arayüz ne derse desin etiket sözleşmeye uymak zorunda.
  const parsed = EvalLabelSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, label: null, errors: ["Etiket şemaya uymuyor; alanları kontrol edin."] };
  }
  return { ok: true, label: parsed.data, errors: [] };
}

/** Kullanıcı hiçbir şey yazmadı mı? (indirme raporunda "eksik etiket" saymak için) */
export function draftIsEmpty(draft: LabelDraft): boolean {
  return (
    draft.overallScore.trim() === "" &&
    CATEGORY_KEYS.every((key) => draft.categoryScores[key].trim() === "") &&
    draft.issues.length === 0 &&
    !draft.uncertain
  );
}

/* ------------------------------------------------------------------ */
/* Tarayıcı deposu (saf serileştirme)                                  */
/* ------------------------------------------------------------------ */

/** Güvenilmeyen ham değeri taslağa çevirir; bozuksa `null`. */
export function toDraft(value: unknown): LabelDraft | null {
  if (!isRecordValue(value)) return null;
  const overall = value.overallScore;
  if (typeof overall !== "string") return null;

  const categories = isRecordValue(value.categoryScores) ? value.categoryScores : {};
  const categoryScores: Record<CategoryKey, string> = {
    accuracy: "",
    fluency: "",
    terminology: "",
    tone: "",
    formatting: "",
  };
  for (const key of CATEGORY_KEYS) {
    const raw = categories[key];
    categoryScores[key] = typeof raw === "string" ? sanitizeScoreInput(raw) : "";
  }

  const issues: IssueDraft[] = [];
  if (Array.isArray(value.issues)) {
    for (const item of value.issues) {
      if (!isRecordValue(item)) continue;
      issues.push({
        snippet: typeof item.snippet === "string" ? item.snippet : "",
        family: asFamily(item.family),
        severity: asSeverity(item.severity),
        note: typeof item.note === "string" ? item.note : "",
        suggestion: typeof item.suggestion === "string" ? item.suggestion : "",
      });
    }
  }

  return {
    overallScore: sanitizeScoreInput(overall),
    categoryScores,
    issues,
    confidence: asConfidence(value.confidence),
    uncertain: value.uncertain === true,
  };
}

/** `localStorage`'dan okunan ham metni taslak haritasına çevirir. Bozuk kayıtlar atılır. */
export function parseStoredDrafts(raw: string | null): Record<string, LabelDraft> {
  if (raw === null) return {};
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!isRecordValue(decoded)) return {};
  const stored = decoded.drafts;
  if (!isRecordValue(stored)) return {};
  const result: Record<string, LabelDraft> = {};
  for (const [key, value] of Object.entries(stored)) {
    const draft = toDraft(value);
    if (draft !== null) result[key] = draft;
  }
  return result;
}

/** Taslak haritasını `localStorage`'a yazılacak metne çevirir. */
export function serializeStoredDrafts(drafts: Record<string, LabelDraft>): string {
  return JSON.stringify({ version: 1, drafts });
}
