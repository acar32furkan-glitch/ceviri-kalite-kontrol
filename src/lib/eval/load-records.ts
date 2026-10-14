/**
 * Etiketleme veri setini **sunucu tarafında** yükler.
 *
 * Neden sunucu tarafı: JSONL dosyası `node:fs` ile okunur ve tarayıcıya yalnızca kayıt metinleri
 * gider. Dosya sistemi erişimi istemci paketine hiç girmez; ayrıca dosya değişirse sayfa
 * (force-dynamic) her istekte taze veriyi görür.
 *
 * Kör etiketleme (ADR-004): dönen kayıtlarda `labels` alanı **yoktur**. Etiketleyici ne daha önce
 * verilmiş insan etiketini ne de aracın puanını görür. `origin` ve `license` alanları JSONL'e
 * kayıpsız geri yazılabilmesi için taşınır ama arayüzde **gösterilmez** (`origin: "enjekte"`
 * metnin bilerek bozuk olduğunu söylerdi — bu bir ipucudur).
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { EvalDataValidation, EvalRecord } from "./record-schema";
import { frozenSplitHash, validateEvalJsonl } from "./record-schema";

/** Asıl veri seti; yoksa veya bozuksa örnek veriye düşülür. */
export const PRIMARY_DATA_FILE = path.join("data", "eval-set.jsonl");
/** Örnek veri seti; depoya işlenir ve testlerin çalışmasını sağlar. */
export const EXAMPLE_DATA_FILE = path.join("data", "eval-set.example.jsonl");

/**
 * Arayüze giden kör kayıt: `EvalRecord`'un etiketsiz hâli.
 * `labels` alanı özellikle dışarıda bırakılmıştır.
 */
export interface BlindRecord {
  readonly id: string;
  readonly split: EvalRecord["split"];
  readonly direction: EvalRecord["direction"];
  readonly kind: EvalRecord["kind"];
  readonly source: string;
  readonly target: string;
  readonly origin: EvalRecord["origin"];
  readonly license: string;
  readonly glossary: EvalRecord["glossary"];
}

export interface EvalDatasetLoad {
  /** Sırayla etiketlenecek kayıtlar (dosya sırası korunur). */
  readonly records: readonly BlindRecord[];
  /** Okunan dosyanın depo köküne göre yolu. */
  readonly file: string;
  /** Asıl veri seti değil, örnek veri kullanılıyor mu? */
  readonly usedExample: boolean;
  /** Kullanıcıya gösterilecek Türkçe uyarı (sorun yoksa `null`). */
  readonly warning: string | null;
  readonly counts: EvalDataValidation["counts"];
  /** Dondurma hash'leri (ADR-004): test seti değişirse bu değer değişir. */
  readonly frozen: { readonly dev: string; readonly test: string };
  /** Veri sağlığı: şema hataları (satır numaralı). Asıl dosyada hata varsa örnek veriye düşülür. */
  readonly errors: readonly { readonly line: number; readonly error: string }[];
}

/** Etiketlenmiş kaydı kör kayda indirger: `labels` alanı hiçbir koşulda dışarı çıkmaz. */
function toBlindRecord(record: EvalRecord): BlindRecord {
  return {
    id: record.id,
    split: record.split,
    direction: record.direction,
    kind: record.kind,
    source: record.source,
    target: record.target,
    origin: record.origin,
    license: record.license,
    glossary: record.glossary,
  };
}

function summarize(
  validation: EvalDataValidation,
  file: string,
  usedExample: boolean,
  warning: string | null,
): EvalDatasetLoad {
  return {
    records: validation.records.map(toBlindRecord),
    file,
    usedExample,
    warning,
    counts: validation.counts,
    frozen: {
      dev: frozenSplitHash(validation.records, "dev"),
      test: frozenSplitHash(validation.records, "test"),
    },
    errors: validation.errors,
  };
}

async function readTextFile(absolutePath: string): Promise<string | null> {
  try {
    return await readFile(absolutePath, "utf8");
  } catch {
    // Dosya yok, izin yok veya okunamıyor: çağıran taraf uyarı üretir.
    return null;
  }
}

async function loadExample(cwd: string, warning: string | null): Promise<EvalDatasetLoad> {
  const text = await readTextFile(path.join(cwd, EXAMPLE_DATA_FILE));
  if (text === null) {
    return {
      records: [],
      file: EXAMPLE_DATA_FILE,
      usedExample: true,
      warning: `${EXAMPLE_DATA_FILE} bulunamadı. Etiketlenecek kayıt yok.`,
      counts: { total: 0, dev: 0, test: 0, labeled: 0, unlabeled: 0 },
      frozen: { dev: "", test: "" },
      errors: [],
    };
  }

  const validation = validateEvalJsonl(text);
  const exampleWarning =
    validation.errors.length > 0
      ? `Örnek veri ile çalışıyorsun ve örnek dosyada ${validation.errors.length} şema hatası var. Etiketler geçicidir, ölçüm sonucu sayılmaz.`
      : "Örnek veri ile çalışıyorsun: data/eval-set.jsonl henüz yok. Buradaki etiketler geçicidir, gerçek ölçüm için kendi veri setini oluştur.";
  return summarize(validation, EXAMPLE_DATA_FILE, true, warning ?? exampleWarning);
}

/**
 * Veri setini yükler. Sıra: `data/eval-set.jsonl` → geçerliyse kullan; yoksa/bozuksa
 * `data/eval-set.example.jsonl` → o da yoksa boş küme (uyarı ile).
 */
export async function loadEvalDataset(cwd: string = process.cwd()): Promise<EvalDatasetLoad> {
  const primaryText = await readTextFile(path.join(cwd, PRIMARY_DATA_FILE));
  if (primaryText !== null) {
    const validation = validateEvalJsonl(primaryText);
    if (validation.errors.length === 0 && validation.records.length > 0) {
      return summarize(validation, PRIMARY_DATA_FILE, false, null);
    }
    const reason =
      validation.errors.length > 0
        ? `${validation.errors.length} şema hatası var`
        : "hiç geçerli kayıt yok";
    return loadExample(
      cwd,
      `${PRIMARY_DATA_FILE} kullanılamadı (${reason}) ve örnek veri ile çalışıyorsun. ` +
        `Etiketler tarayıcıda tutulur; gerçek ölçüm için dosyayı düzelt: npx tsx scripts/eval/validate-data.ts ${PRIMARY_DATA_FILE}`,
    );
  }

  return loadExample(cwd, null);
}
