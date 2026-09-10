import type {
  CategoryScores,
  EvaluationIssue,
  EvaluationReport,
  EvaluationRequest,
  GlossaryEntry,
} from "./types";

export const MAX_TEXT_LENGTH = 5000;
export const MIN_TEXT_LENGTH = 10;
export const MAX_GLOSSARY_ENTRIES = 20;
export const MAX_GLOSSARY_ITEM_LENGTH = 120;

export interface ValidationSuccess<T> {
  ok: true;
  value: T;
}

export interface ValidationError {
  ok: false;
  error: string;
  field?: keyof EvaluationRequest;
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationError;

const directions = new Set(["en-tr", "tr-en"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function validateGlossaryEntry(value: unknown): GlossaryEntry | null {
  if (!isRecord(value)) return null;
  if (!isNonEmptyString(value.source, MAX_GLOSSARY_ITEM_LENGTH)) return null;
  if (!isNonEmptyString(value.target, MAX_GLOSSARY_ITEM_LENGTH)) return null;
  return {
    source: value.source.trim(),
    target: value.target.trim(),
  };
}

export function parseGlossary(raw: string): GlossaryEntry[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const equalsIndex = line.indexOf("=");
      const colonIndex = line.indexOf(":");
      const separatorIndex = [equalsIndex, colonIndex]
        .filter((index) => index >= 0)
        .sort((left, right) => left - right)[0];

      if (separatorIndex === undefined) {
        return null;
      }

      const source = line.slice(0, separatorIndex).trim();
      const target = line.slice(separatorIndex + 1).trim();
      if (!source || !target) return null;
      return { source, target };
    })
    .filter((entry): entry is GlossaryEntry => entry !== null)
    .slice(0, MAX_GLOSSARY_ENTRIES);
}

export function validateEvaluationPayload(payload: unknown): ValidationResult<EvaluationRequest> {
  if (!isRecord(payload)) {
    return { ok: false, error: "Geçersiz değerlendirme isteği." };
  }

  if (!isNonEmptyString(payload.sourceText, MAX_TEXT_LENGTH)) {
    return {
      ok: false,
      error: `Kaynak metin ${MIN_TEXT_LENGTH}-${MAX_TEXT_LENGTH} karakter arasında olmalıdır.`,
      field: "sourceText",
    };
  }

  if (!isNonEmptyString(payload.targetText, MAX_TEXT_LENGTH)) {
    return {
      ok: false,
      error: `Hedef metin ${MIN_TEXT_LENGTH}-${MAX_TEXT_LENGTH} karakter arasında olmalıdır.`,
      field: "targetText",
    };
  }

  if (typeof payload.direction !== "string" || !directions.has(payload.direction)) {
    return { ok: false, error: "Desteklenen bir dil yönü seçilmelidir.", field: "direction" };
  }

  const sourceText = payload.sourceText.trim();
  const targetText = payload.targetText.trim();

  if (sourceText.length < MIN_TEXT_LENGTH) {
    return {
      ok: false,
      error: `Kaynak metin en az ${MIN_TEXT_LENGTH} karakter olmalıdır.`,
      field: "sourceText",
    };
  }

  if (targetText.length < MIN_TEXT_LENGTH) {
    return {
      ok: false,
      error: `Hedef metin en az ${MIN_TEXT_LENGTH} karakter olmalıdır.`,
      field: "targetText",
    };
  }

  if (sourceText === targetText) {
    return { ok: false, error: "Bu iki metin aynı görünüyor.", field: "targetText" };
  }

  let glossary: GlossaryEntry[] | undefined;
  if (payload.glossary !== undefined) {
    if (!Array.isArray(payload.glossary) || payload.glossary.length > MAX_GLOSSARY_ENTRIES) {
      return { ok: false, error: `Glossary en fazla ${MAX_GLOSSARY_ENTRIES} satır içerebilir.` };
    }

    glossary = [];
    for (const [index, entry] of payload.glossary.entries()) {
      const validated = validateGlossaryEntry(entry);
      if (!validated) {
        return {
          ok: false,
          error: `Glossary ${index + 1}. satırı kaynak = hedef biçiminde olmalıdır.`,
        };
      }
      glossary.push(validated);
    }
  }

  return {
    ok: true,
    value: {
      sourceText,
      targetText,
      direction: payload.direction as EvaluationRequest["direction"],
      ...(glossary ? { glossary } : {}),
    },
  };
}

function isFiniteScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

export function validateEvaluationReport(value: unknown): EvaluationReport {
  if (!isRecord(value)) throw new Error("Model yanıtı geçerli bir nesne değil.");
  if (!isFiniteScore(value.overallScore)) throw new Error("Genel puan geçerli değil.");

  if (!isRecord(value.categoryScores)) throw new Error("Kategori puanları geçerli değil.");
  const categoryScores: CategoryScores = {
    accuracy: 0,
    fluency: 0,
    terminology: 0,
    tone: 0,
    formatting: 0,
  };
  for (const key of Object.keys(categoryScores) as Array<keyof CategoryScores>) {
    if (!isFiniteScore(value.categoryScores[key])) throw new Error(`${key} puanı geçerli değil.`);
    categoryScores[key] = Math.round(value.categoryScores[key] as number);
  }

  if (!Array.isArray(value.issues)) throw new Error("Sorun listesi geçerli değil.");
  const issues: EvaluationIssue[] = value.issues.slice(0, 20).map((issue, index) => {
    if (!isRecord(issue)) throw new Error(`${index + 1}. sorun geçerli değil.`);
    if (
      typeof issue.snippet !== "string" ||
      typeof issue.type !== "string" ||
      typeof issue.suggestion !== "string" ||
      !["low", "medium", "high"].includes(String(issue.severity))
    ) {
      throw new Error(`${index + 1}. sorun alanları geçerli değil.`);
    }
    return {
      snippet: issue.snippet,
      type: issue.type,
      severity: issue.severity as EvaluationIssue["severity"],
      suggestion: issue.suggestion,
    };
  });

  return {
    overallScore: Math.round(value.overallScore as number),
    categoryScores,
    issues,
  };
}
