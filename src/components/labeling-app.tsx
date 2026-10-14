"use client";

/**
 * Kör etiketleme arayüzü (ADR-004).
 *
 * Tasarım kararları:
 * - **Aracın puanı hiç görünmez.** Kayıtla birlikte gelen `labels` alanı sunucudan hiç gönderilmez
 *   (`src/lib/eval/load-records.ts`). `origin`/`license` teknik olarak taşınır (JSONL'e kayıpsız
 *   geri yazmak için) ama ekranda gösterilmez: `origin: "enjekte"` metnin bilerek bozulduğunu
 *   söylerdi ve bu bir ipucudur.
 * - Sayı girişleri `Tab` ile gezilir. `1–9`/`0` gibi hızlı puan kısayolu **bilinçli olarak yok**:
 *   sayı alanlarında yazılan rakamlarla çakışır ve yanlış puan riskini büyütür.
 * - Her kayıt `localStorage`'a otomatik yazılır; sekme kapatılsa bile kaldığı yerden devam edilir.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type {
  CategoryKey,
  ErrorFamily,
  IssueDraft,
  LabelConfidence,
  LabelDraft,
  Severity,
} from "@/lib/eval/label-draft";
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
  sanitizeScoreInput,
  toDraft,
} from "@/lib/eval/label-draft";
import type { BlindRecord, EvalDatasetLoad } from "@/lib/eval/load-records";
import {
  CATEGORY_KEYS,
  ERROR_FAMILIES,
  LABEL_CONFIDENCES,
  SEVERITIES,
  parseEvalRecord,
} from "@/lib/eval/record-schema";

/* ------------------------------------------------------------------ */
/* Sabitler                                                            */
/* ------------------------------------------------------------------ */

const EXPORT_FILE_NAME = "eval-set.labeled.jsonl";

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  accuracy: "Anlam doğruluğu",
  fluency: "Akıcılık",
  terminology: "Terminoloji",
  tone: "Ton ve register",
  formatting: "Biçimlendirme",
};

const CATEGORY_HINTS: Record<CategoryKey, string> = {
  accuracy: "Anlam eksiksiz mi? Atlama, ekleme, zıt anlam var mı?",
  fluency: "Hedef dilde doğal mı? Dil bilgisi ve sözdizimi sağlam mı?",
  terminology: "Terimler yerleşik mi, glossary ile tutarlı mı?",
  tone: "Register ve kurumsal ses bağlama uygun mu?",
  formatting: "Yer tutucu, etiket, sayı ve tarih biçimi korunmuş mu?",
};

const FAMILY_LABELS: Record<ErrorFamily, string> = {
  accuracy: "accuracy · anlam",
  fluency: "fluency · akıcılık",
  terminology: "terminology · terim",
  style: "style · üslup/ton",
  locale: "locale · yerel biçim",
  formatting: "formatting · yer tutucu",
};

const SEVERITY_LABELS: Record<Severity, string> = {
  low: "low · tercih",
  medium: "medium · fark edilir",
  high: "high · işlev/anlam riski",
};

const CONFIDENCE_LABELS: Record<LabelConfidence, string> = {
  low: "düşük",
  medium: "orta",
  high: "yüksek",
};

const KIND_LABELS: Record<BlindRecord["kind"], string> = {
  ui: "Arayüz metni",
  urun: "Ürün metni",
  eposta: "E-posta",
  teknik: "Teknik metin",
  resmi: "Resmî belge",
};

const DIRECTION_LABELS: Record<BlindRecord["direction"], string> = {
  "en-tr": "EN → TR",
  "tr-en": "TR → EN",
};

const SHORTCUTS: ReadonlyArray<{ keys: string; label: string }> = [
  { keys: "K", label: "Sonraki kayıt" },
  { keys: "J", label: "Önceki kayıt" },
  { keys: "S", label: "Kaydet ve doğrula" },
  { keys: "X", label: "Belirsiz işaretini aç/kapat" },
  { keys: "Shift+E", label: "Sorun ekle" },
  { keys: "?", label: "Bu yardımı aç/kapat" },
];

/* ------------------------------------------------------------------ */
/* Yardımcılar                                                         */
/* ------------------------------------------------------------------ */

/**
 * Saf etiketleme mantığı `src/lib/eval/label-draft.ts` içindedir: puan sınırları (0-100 tam sayı),
 * snippet doğrulaması (1-300), taslak -> EvalLabel çevirimi ve kayıtlı taslak ayrıştırma. Burada
 * yalnızca tarayıcıya bağlı yardımcılar kalır; kurallar tek yerde yaşar ve arayüzden bağımsız test
 * edilebilir (bkz. tests/eval-label-draft.test.ts).
 */

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Kayıtlı taslakların `localStorage` anahtarı (sürüm ekiyle; şema değişirse eski kayıt okunmaz). */
const STORAGE_KEY = EVAL_LABEL_STORAGE_KEY;


function readStoredDrafts(): Record<string, LabelDraft> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return {};
    const decoded: unknown = JSON.parse(raw);
    if (!isRecordValue(decoded)) return {};
    const stored = decoded.drafts;
    if (!isRecordValue(stored)) return {};
    const result: Record<string, LabelDraft> = {};
    for (const [key, value] of Object.entries(stored)) {
      const draft = toDraft(value);
      if (draft !== null) result[key] = draft;
    }
    return result;
  } catch {
    return {};
  }
}

/* ------------------------------------------------------------------ */
/* Kalıcı taslak deposu (localStorage)                                 */
/* ------------------------------------------------------------------ */

/**
 * `localStorage` bir **dış sistemdir**; React'in bunun için önerdiği araç `useSyncExternalStore`.
 * Böylece "boş render et, sonra effect içinde state yaz" (kademeli render) tuzağına düşülmez:
 * sunucu anlık görüntüsü boş kümedir, istemci hidrasyondan sonra gerçek taslaklara geçer.
 */
const EMPTY_DRAFTS: Record<string, LabelDraft> = {};

let draftsSnapshot: Record<string, LabelDraft> | null = null;
const draftListeners = new Set<() => void>();

function getDraftsSnapshot(): Record<string, LabelDraft> {
  if (draftsSnapshot === null) draftsSnapshot = readStoredDrafts();
  return draftsSnapshot;
}

/** Sunucu render'ı `localStorage` göremez: sabit ve referans olarak kararlı boş küme döner. */
function getServerDraftsSnapshot(): Record<string, LabelDraft> {
  return EMPTY_DRAFTS;
}

function subscribeDrafts(listener: () => void): () => void {
  draftListeners.add(listener);
  return () => {
    draftListeners.delete(listener);
  };
}

/** Tek yazma kapısı: hem bellekteki anlık görüntüyü hem `localStorage`'ı günceller. */
function writeDrafts(next: Record<string, LabelDraft>): void {
  draftsSnapshot = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, drafts: next }));
  } catch {
    // Gizli mod / kota dolu: etiketleme devam eder, kalıcılık olmaz.
  }
  for (const listener of draftListeners) listener();
}

/* ------------------------------------------------------------------ */
/* Küçük bileşenler                                                    */
/* ------------------------------------------------------------------ */

function Badge({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "emerald" | "amber" | "sky" }) {
  const tones: Record<string, string> = {
    slate: "border-white/10 bg-white/[0.04] text-slate-300",
    emerald: "border-emerald-300/30 bg-emerald-300/10 text-emerald-200",
    amber: "border-amber-300/30 bg-amber-300/10 text-amber-200",
    sky: "border-sky-300/30 bg-sky-300/10 text-sky-200",
  };
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${tones[tone] ?? tones.slate}`}>
      {children}
    </span>
  );
}

function KeyHint({ keys }: { keys: string }) {
  return (
    <span className="rounded border border-white/15 bg-black/25 px-1 font-mono text-[10px] leading-4 text-slate-400">
      {keys}
    </span>
  );
}

function ProgressCard({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: "emerald" | "amber" }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4">
      <div className="text-[11px] uppercase tracking-[0.14em] text-slate-400">{label}</div>
      <div className={`mt-2 text-xl font-semibold ${tone === "amber" ? "text-amber-200" : "text-emerald-200"}`}>{value}</div>
      <div className="mt-1 text-[11px] leading-4 text-slate-500">{detail}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ana bileşen                                                         */
/* ------------------------------------------------------------------ */

export default function LabelingApp({ dataset }: { dataset: EvalDatasetLoad }) {
  const records = dataset.records;

  const drafts = useSyncExternalStore(subscribeDrafts, getDraftsSnapshot, getServerDraftsSnapshot);
  /** Kullanıcı gezinene kadar `null`: kayıt seçimi "ilk etiketsiz kayıt"tan türetilir. */
  const [pinnedIndex, setPinnedIndex] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const [focusIssueId, setFocusIssueId] = useState<number | null>(null);

  /**
   * "Kaldığın yerden devam": taslaklar yüklendikten sonra ilk etiketsiz kayıt açılır.
   * Kullanıcı bir kaydı düzenlemeye başladığında dizin sabitlenir (`updateDraft`), böylece
   * puan girilirken kayıt kendiliğinden değişmez.
   */
  const resumeIndex = useMemo(() => {
    if (records.length === 0) return 0;
    const firstUnlabeled = records.findIndex((item) => {
      const itemDraft = drafts[item.id];
      return itemDraft === undefined || !draftToLabel(itemDraft).ok;
    });
    return firstUnlabeled === -1 ? records.length - 1 : firstUnlabeled;
  }, [drafts, records]);

  const index = pinnedIndex ?? resumeIndex;
  const record: BlindRecord | undefined = records[index];

  const announce = useCallback((message: string) => {
    setAnnouncement(message);
  }, []);

  const updateDraft = useCallback(
    (recordId: string, updater: (current: LabelDraft) => LabelDraft) => {
      // Düzenleme başladı: kayıt seçimini sabitle (aksi hâlde geçerli etiket girilince dizin kayar).
      setPinnedIndex((previous) => previous ?? records.findIndex((item) => item.id === recordId));
      const current = getDraftsSnapshot();
      writeDrafts({ ...current, [recordId]: updater(current[recordId] ?? emptyDraft()) });
    },
    [records],
  );

  const progress = useMemo(() => {
    let labeled = 0;
    let uncertain = 0;
    let devLabeled = 0;
    let devTotal = 0;
    let testLabeled = 0;
    let testTotal = 0;
    for (const item of records) {
      const itemDraft = drafts[item.id];
      const done = itemDraft !== undefined && draftToLabel(itemDraft).ok;
      if (itemDraft?.uncertain === true) uncertain += 1;
      if (item.split === "dev") {
        devTotal += 1;
        if (done) devLabeled += 1;
      } else {
        testTotal += 1;
        if (done) testLabeled += 1;
      }
      if (done) labeled += 1;
    }
    return {
      labeled,
      uncertain,
      total: records.length,
      remaining: records.length - labeled,
      devLabeled,
      devTotal,
      testLabeled,
      testTotal,
    };
  }, [drafts, records]);

  const goTo = useCallback(
    (nextIndex: number) => {
      if (records.length === 0) return;
      const clamped = Math.min(Math.max(nextIndex, 0), records.length - 1);
      setPinnedIndex(clamped);
      setFocusIssueId(null);
      announce(`Kayıt ${clamped + 1} / ${records.length} · ${records[clamped]?.id ?? ""}`);
    },
    [announce, records],
  );

  const findNextUnlabeled = useCallback(
    (fromIndex: number): number => {
      for (let offset = 1; offset <= records.length; offset += 1) {
        const candidate = (fromIndex + offset) % records.length;
        const item = records[candidate];
        if (item === undefined) continue;
        const itemDraft = drafts[item.id];
        if (itemDraft === undefined || !draftToLabel(itemDraft).ok) return candidate;
      }
      return -1;
    },
    [drafts, records],
  );

  const saveCurrent = useCallback(() => {
    if (record === undefined) return;
    const draft = drafts[record.id] ?? emptyDraft();
    const result = draftToLabel(draft);
    if (!result.ok) {
      announce(`${record.id} kaydedilemedi. ${result.errors[0] ?? "Etiket geçersiz."}`);
      return;
    }
    const next = findNextUnlabeled(index);
    announce(`${record.id} kaydedildi ve doğrulandı. ${progress.remaining <= 1 ? "Son kayıt." : ""}`.trim());
    if (next !== -1) goTo(next);
    else setPinnedIndex(index);
  }, [announce, drafts, findNextUnlabeled, goTo, index, progress.remaining, record]);

  const toggleUncertain = useCallback(() => {
    if (record === undefined) return;
    const nextValue = !(drafts[record.id]?.uncertain === true);
    updateDraft(record.id, (current) => ({ ...current, uncertain: nextValue }));
    announce(nextValue ? `${record.id} belirsiz olarak işaretlendi.` : `${record.id} belirsiz işareti kaldırıldı.`);
  }, [announce, drafts, record, updateDraft]);

  const addIssue = useCallback(() => {
    if (record === undefined) return;
    updateDraft(record.id, (current) => ({ ...current, issues: [...current.issues, emptyIssue()] }));
    const nextIssueIndex = (drafts[record.id]?.issues.length ?? 0);
    setFocusIssueId(nextIssueIndex);
    announce(`${record.id} için yeni sorun satırı eklendi. Snippet'i hedef metinden kopyalayın.`);
  }, [announce, drafts, record, updateDraft]);

  const removeIssue = useCallback(
    (issueIndex: number) => {
      if (record === undefined) return;
      updateDraft(record.id, (current) => ({
        ...current,
        issues: current.issues.filter((_, position) => position !== issueIndex),
      }));
      announce(`${issueIndex + 1}. sorun silindi.`);
    },
    [announce, record, updateDraft],
  );

  const updateIssue = useCallback(
    (issueIndex: number, patch: Partial<IssueDraft>) => {
      if (record === undefined) return;
      updateDraft(record.id, (current) => ({
        ...current,
        issues: current.issues.map((issue, position) =>
          position === issueIndex ? { ...issue, ...patch } : issue,
        ),
      }));
    },
    [record, updateDraft],
  );

  /** Birebir snippet kuralı: yalnızca hedef metinden seçilen parça kabul edilir. */
  const fillSnippetFromSelection = useCallback(
    (issueIndex: number) => {
      if (record === undefined) return;
      const selected = window.getSelection()?.toString().trim() ?? "";
      if (selected === "") {
        announce("Önce hedef metinden bir parça seçin, sonra bu düğmeye basın.");
        return;
      }
      if (selected.length > 300) {
        announce(`Seçim ${selected.length} karakter; snippet en fazla 300 karakter olabilir.`);
        return;
      }
      if (!record.target.includes(selected)) {
        announce("Seçim hedef metnin içinde birebir geçmiyor. Yalnızca hedef metinden kopyalayın.");
        return;
      }
      updateIssue(issueIndex, { snippet: selected });
      announce(`Snippet hedef metinden birebir alındı (${selected.length} karakter).`);
    },
    [announce, record, updateIssue],
  );

  const downloadJsonl = useCallback(() => {
    const lines: string[] = [];
    const invalidIds = new Set<string>();
    let labelCount = 0;

    for (const item of records) {
      const itemDraft = drafts[item.id] ?? emptyDraft();
      const result = draftToLabel(itemDraft);
      if (result.ok) labelCount += 1;
      else if (!draftIsEmpty(itemDraft)) invalidIds.add(item.id);

      const candidate = {
        id: item.id,
        split: item.split,
        direction: item.direction,
        kind: item.kind,
        source: item.source,
        target: item.target,
        labels: result.ok ? result.label : null,
        origin: item.origin,
        license: item.license,
        ...(item.glossary !== undefined ? { glossary: item.glossary } : {}),
      };
      const validated = parseEvalRecord(candidate);
      if (!validated.ok) {
        invalidIds.add(item.id);
        continue;
      }
      lines.push(JSON.stringify(validated.record));
    }

    if (lines.length === 0) {
      announce("İndirilecek kayıt yok. Veri seti boş görünüyor.");
      return;
    }

    const blob = new Blob([`${lines.join("\n")}\n`], { type: "application/x-ndjson;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = EXPORT_FILE_NAME;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);

    announce(
      `${EXPORT_FILE_NAME} indirildi: ${labelCount} etiket, ${lines.length} kayıt.` +
        (invalidIds.size > 0 ? ` ${invalidIds.size} kaydın etiketi eksik/geçersiz, "labels": null yazıldı.` : ""),
    );
  }, [announce, drafts, records]);

  /* Klavye kısayolları: yazı alanlarında devre dışı, böylece metin girişini bozmaz. */
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        const isTextField =
          tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
        if (isTextField) {
          if (event.key === "Escape") target.blur();
          return;
        }
      }
      if (event.altKey || event.ctrlKey || event.metaKey) return;

      switch (event.key) {
        case "k":
        case "K":
          event.preventDefault();
          goTo(index + 1);
          break;
        case "j":
        case "J":
          event.preventDefault();
          goTo(index - 1);
          break;
        case "s":
        case "S":
          event.preventDefault();
          saveCurrent();
          break;
        case "x":
        case "X":
          event.preventDefault();
          toggleUncertain();
          break;
        case "E":
          if (event.shiftKey) {
            event.preventDefault();
            addIssue();
          }
          break;
        case "?":
          event.preventDefault();
          setShowHelp((previous) => !previous);
          break;
        default:
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [addIssue, goTo, index, saveCurrent, toggleUncertain]);

  const currentDraft = useMemo(() => {
    if (record === undefined) return emptyDraft();
    return drafts[record.id] ?? emptyDraft();
  }, [drafts, record]);

  const currentValidation = useMemo(() => draftToLabel(currentDraft), [currentDraft]);
  const isTestRecord = record?.split === "test";

  if (records.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16">
        <h1 className="text-2xl font-semibold text-white">Etiketlenecek kayıt yok</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          {dataset.warning ?? "Veri seti boş görünüyor."} Veri setini <code className="text-slate-300">data/eval-set.jsonl</code>{" "}
          olarak ekleyip doğrulayın:
        </p>
        <pre className="mt-4 overflow-x-auto rounded-xl border border-white/10 bg-black/30 p-4 text-xs text-slate-300">
          npm run eval:validate
        </pre>
        <Link href="/" className="mt-6 inline-block text-sm text-emerald-200 hover:text-emerald-100">
          ← Ana sayfa
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      {/* Ekran okuyucu ve görünür durum bildirimi (aria-live) */}
      <div
        role="status"
        aria-live="polite"
        className="mb-5 min-h-11 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm leading-5 text-slate-300"
      >
        {announcement !== "" ? announcement : "Etiketlemeye hazır. Kısayollar için ? tuşuna basın."}
      </div>

      {dataset.warning !== null && (
        <div className="mb-5 rounded-2xl border border-amber-300/30 bg-amber-300/[0.08] px-5 py-4 text-sm leading-6 text-amber-100">
          <div className="font-medium">Örnek veri ile çalışıyorsun</div>
          <p className="mt-1 text-amber-100/85">{dataset.warning}</p>
          <p className="mt-2 text-[11px] text-amber-100/70">Dosya: {dataset.file}</p>
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Kör etiketleme</h1>
          <p className="mt-1 text-sm text-slate-400">
            Kaynak ve hedef metni okuyup kendi yargını puanla. Araç puanı gösterilmez (ADR-004).
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowHelp((previous) => !previous)}
          aria-keyshortcuts="?"
          aria-expanded={showHelp}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 px-3.5 text-xs font-medium text-slate-300 transition hover:border-emerald-200/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/50"
        >
          Kısayollar <KeyHint keys="?" />
        </button>
      </div>

      {showHelp && (
        <div className="mt-4 rounded-2xl border border-white/[0.1] bg-[#0b1a2d]/85 p-5">
          <h2 className="text-sm font-semibold text-white">Klavye kısayolları</h2>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            {SHORTCUTS.map((shortcut) => (
              <div key={shortcut.keys} className="flex items-center gap-3 text-sm text-slate-300">
                <KeyHint keys={shortcut.keys} />
                <dd>{shortcut.label}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-[11px] leading-5 text-slate-500">
            Sayı alanları <KeyHint keys="Tab" /> ile gezilir. <code>1–9</code>/<code>0</code> hızlı puan
            kısayolu bilinçli olarak yoktur: yazılan rakamlarla çakışıp yanlış puan üretirdi. Metin
            alanlarındayken kısayollar devre dışıdır (<KeyHint keys="Esc" /> ile alandan çıkın).
          </p>
        </div>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ProgressCard
          label="İlerleme"
          value={`${progress.labeled} / ${progress.total}`}
          detail={`${progress.remaining} kayıt kaldı`}
        />
        <ProgressCard
          label="dev"
          value={`${progress.devLabeled} / ${progress.devTotal}`}
          detail="Geliştirme seti · prompt ayarı burada serbest"
        />
        <ProgressCard
          label="test"
          value={`${progress.testLabeled} / ${progress.testTotal}`}
          detail="DONMUŞ SET · metni görüp prompt ayarlama (ADR-004)"
          tone="amber"
        />
        <ProgressCard
          label="Belirsiz"
          value={`${progress.uncertain}`}
          detail="uncertain oranı %20'yi geçerse kılavuz revize edilir"
        />
      </div>

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-300 transition-all duration-500"
          style={{ width: `${progress.total === 0 ? 0 : Math.round((progress.labeled / progress.total) * 100)}%` }}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
        <span className="font-mono text-slate-400">
          dondurma hash — dev: {dataset.frozen.dev || "—"} · test: {dataset.frozen.test || "—"}
        </span>
        <span>·</span>
        <span>Dosya: {dataset.file}</span>
        {Object.keys(drafts).length > 0 && (
          <span className="text-emerald-200/80">
            · Kaydedilmiş {Object.keys(drafts).length} taslak yüklendi (kaldığın yerden devam)
          </span>
        )}
        {dataset.errors.length > 0 && (
          <span className="text-amber-200">· {dataset.errors.length} şema hatası yok sayıldı</span>
        )}
      </div>

      {record !== undefined && (
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
          {/* Sol: kayıt metni */}
          <article className="rounded-3xl border border-white/[0.1] bg-[#0b1a2d]/85 p-5 shadow-2xl shadow-black/20 backdrop-blur-md sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-white/10 bg-black/25 px-2 py-1 font-mono text-[11px] text-slate-300">
                {record.id}
              </span>
              <Badge tone={isTestRecord ? "amber" : "emerald"}>
                {isTestRecord ? "test · donmuş" : "dev"}
              </Badge>
              <Badge>{DIRECTION_LABELS[record.direction]}</Badge>
              <Badge>{KIND_LABELS[record.kind]}</Badge>
              <span className="ml-auto text-[11px] text-slate-500">
                Kayıt {index + 1} / {records.length}
              </span>
            </div>

            {isTestRecord && (
              <div className="mt-4 rounded-xl border border-amber-300/35 bg-amber-300/[0.09] px-4 py-3 text-xs leading-5 text-amber-100">
                <strong className="font-semibold">DONMUŞ SET</strong> — bu kaydın metnini görüp prompt/kod
                ayarlama (ADR-004). Etiketle, kaydet, devam et; test seti nihai ölçüme kadar dondurulur.
              </div>
            )}

            <section className="mt-5">
              <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
                Kaynak metin
              </h2>
              <p className="mt-2 whitespace-pre-wrap rounded-2xl border border-white/[0.08] bg-[#07111f]/70 p-4 text-sm leading-6 text-slate-100">
                {record.source}
              </p>
            </section>

            <section className="mt-5">
              <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
                Hedef çeviri
              </h2>
              <p className="mt-2 whitespace-pre-wrap rounded-2xl border border-emerald-300/20 bg-[#07111f]/70 p-4 text-sm leading-6 text-slate-100">
                {record.target}
              </p>
              <p className="mt-2 text-[11px] leading-4 text-slate-500">
                Sorun için snippet’i bu metinden birebir seç ve “Seçimden doldur” düğmesini kullan
                (1–300 karakter, eksiltme yok).
              </p>
            </section>

            {record.glossary !== undefined && record.glossary.length > 0 && (
              <section className="mt-5">
                <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
                  Glossary (zorunlu terimler)
                </h2>
                <ul className="mt-2 space-y-1 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
                  {record.glossary.map((entry) => (
                    <li key={`${entry.source}-${entry.target}`} className="font-mono text-xs text-slate-300">
                      {entry.source} → {entry.target}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </article>

          {/* Sağ: etiket formu */}
          <form
            className="rounded-3xl border border-white/[0.1] bg-[#0b1a2d]/85 p-5 shadow-2xl shadow-black/20 backdrop-blur-md sm:p-6"
            onSubmit={(event) => {
              event.preventDefault();
              saveCurrent();
            }}
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-lg font-semibold tracking-tight text-white">Etiket</h2>
              <span className="text-[11px] text-slate-500">Bu tarayıcıda otomatik kaydedilir</span>
            </div>

            <div className="mt-5">
              <label htmlFor="overall-score" className="text-xs font-medium uppercase tracking-[0.12em] text-slate-300">
                Genel puan (0–100)
              </label>
              <input
                id="overall-score"
                type="number"
                min={0}
                max={100}
                step={1}
                inputMode="numeric"
                value={currentDraft.overallScore}
                onChange={(event) =>
                  updateDraft(record.id, (current) => ({
                    ...current,
                    overallScore: sanitizeScoreInput(event.target.value),
                  }))
                }
                aria-describedby="overall-hint"
                aria-invalid={parseScoreInput(currentDraft.overallScore) === null}
                className="mt-2 w-full rounded-xl border border-white/10 bg-[#07111f]/70 px-4 py-3 text-lg font-semibold text-slate-100 outline-none transition focus:border-emerald-300/60 focus:ring-2 focus:ring-emerald-300/20"
              />
              <p id="overall-hint" className="mt-2 text-[11px] leading-4 text-slate-500">
                Bütünsel yargı; beş kategorinin ortalaması değil. Çıpalar: 0 kullanılamaz · 25 ağır
                hasar · 50 kabul edilemez kusur · 75 düzeltmeyle yayına · 100 kusursuz.
              </p>
            </div>

            <fieldset className="mt-6">
              <legend className="text-xs font-medium uppercase tracking-[0.12em] text-slate-300">
                Kategori puanları (her biri 0–100)
              </legend>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {CATEGORY_KEYS.map((key) => (
                  <div key={key}>
                    <label
                      htmlFor={`score-${key}`}
                      className="flex items-baseline justify-between gap-2 text-xs font-medium text-slate-200"
                    >
                      <span>{CATEGORY_LABELS[key]}</span>
                      <span className="font-mono text-[10px] text-slate-500">{key}</span>
                    </label>
                    <input
                      id={`score-${key}`}
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      inputMode="numeric"
                      value={currentDraft.categoryScores[key]}
                      onChange={(event) =>
                        updateDraft(record.id, (current) => ({
                          ...current,
                          categoryScores: {
                            ...current.categoryScores,
                            [key]: sanitizeScoreInput(event.target.value),
                          },
                        }))
                      }
                      aria-describedby={`hint-${key}`}
                      aria-invalid={parseScoreInput(currentDraft.categoryScores[key]) === null}
                      className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#07111f]/70 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-emerald-300/60 focus:ring-2 focus:ring-emerald-300/20"
                    />
                    <p id={`hint-${key}`} className="mt-1 text-[10px] leading-4 text-slate-500">
                      {CATEGORY_HINTS[key]}
                    </p>
                  </div>
                ))}
              </div>
            </fieldset>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="label-confidence" className="text-xs font-medium uppercase tracking-[0.12em] text-slate-300">
                  Kendi güvenin
                </label>
                <select
                  id="label-confidence"
                  value={currentDraft.confidence}
                  onChange={(event) =>
                    updateDraft(record.id, (current) => ({
                      ...current,
                      confidence: asConfidence(event.target.value),
                    }))
                  }
                  className="mt-2 w-full rounded-xl border border-white/10 bg-[#07111f]/70 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-emerald-300/60 focus:ring-2 focus:ring-emerald-300/20"
                >
                  {LABEL_CONFIDENCES.map((value) => (
                    <option key={value} value={value}>
                      {value} · {CONFIDENCE_LABELS[value]}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[10px] leading-4 text-slate-500">
                  Güven, puanın kendisi değildir: “bu puanı savunurken ne kadar rahatım?”
                </p>
              </div>
              <div className="flex flex-col justify-end">
                <button
                  type="button"
                  onClick={toggleUncertain}
                  aria-keyshortcuts="X"
                  aria-pressed={currentDraft.uncertain}
                  className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/50 ${
                    currentDraft.uncertain
                      ? "border-amber-300/45 bg-amber-300/15 text-amber-100"
                      : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-amber-300/35 hover:text-white"
                  }`}
                >
                  {currentDraft.uncertain ? "Belirsiz işaretli" : "Belirsiz işaretle"} <KeyHint keys="X" />
                </button>
                <p className="mt-1 text-[10px] leading-4 text-slate-500">
                  Puanın yerine geçmez; analizde ayrı raporlanır (ANNOTATION_GUIDE §6).
                </p>
              </div>
            </div>

            <div className="mt-6">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-slate-300">
                  Sorunlar ({currentDraft.issues.length})
                </h3>
                <button
                  type="button"
                  onClick={addIssue}
                  aria-keyshortcuts="Shift+E"
                  className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs text-slate-300 transition hover:border-emerald-200/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/50"
                >
                  Sorun ekle <KeyHint keys="Shift+E" />
                </button>
              </div>

              {currentDraft.issues.length === 0 && (
                <p className="mt-3 rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-3 text-xs leading-5 text-slate-500">
                  Sorun yoksa boş bırak: “sorun yok” da bir etikettir. Gerçekten kusursuz metne 100
                  verebilirsin.
                </p>
              )}

              <div className="mt-3 space-y-3">
                {currentDraft.issues.map((issue, issueIndex) => (
                  <div
                    key={`${record.id}-issue-${issueIndex}`}
                    className="rounded-2xl border border-white/[0.09] bg-white/[0.03] p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-slate-400">#{issueIndex + 1}</span>
                      <button
                        type="button"
                        onClick={() => removeIssue(issueIndex)}
                        className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-slate-400 transition hover:border-rose-300/40 hover:text-rose-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/50"
                      >
                        Sil
                      </button>
                    </div>

                    <label
                      htmlFor={`issue-${issueIndex}-snippet`}
                      className="mt-3 block text-[11px] font-medium uppercase tracking-[0.1em] text-slate-300"
                    >
                      Snippet (hedef metinden birebir)
                    </label>
                    <div className="mt-1.5 flex gap-2">
                      <input
                        id={`issue-${issueIndex}-snippet`}
                        type="text"
                        maxLength={300}
                        value={issue.snippet}
                        autoFocus={focusIssueId === issueIndex}
                        onChange={(event) => updateIssue(issueIndex, { snippet: event.target.value })}
                        placeholder="Hedef metinden kopyala…"
                        className="w-full rounded-lg border border-white/10 bg-[#07111f]/70 px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-emerald-300/60 focus:ring-2 focus:ring-emerald-300/20"
                      />
                      <button
                        type="button"
                        onClick={() => fillSnippetFromSelection(issueIndex)}
                        className="shrink-0 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-[11px] text-slate-300 transition hover:border-emerald-200/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/50"
                      >
                        Seçimden doldur
                      </button>
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor={`issue-${issueIndex}-family`}
                          className="block text-[11px] font-medium uppercase tracking-[0.1em] text-slate-300"
                        >
                          Hata ailesi
                        </label>
                        <select
                          id={`issue-${issueIndex}-family`}
                          value={issue.family}
                          onChange={(event) => updateIssue(issueIndex, { family: asFamily(event.target.value) })}
                          className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#07111f]/70 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-emerald-300/60 focus:ring-2 focus:ring-emerald-300/20"
                        >
                          {ERROR_FAMILIES.map((family) => (
                            <option key={family} value={family}>
                              {FAMILY_LABELS[family]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label
                          htmlFor={`issue-${issueIndex}-severity`}
                          className="block text-[11px] font-medium uppercase tracking-[0.1em] text-slate-300"
                        >
                          Şiddet
                        </label>
                        <select
                          id={`issue-${issueIndex}-severity`}
                          value={issue.severity}
                          onChange={(event) => updateIssue(issueIndex, { severity: asSeverity(event.target.value) })}
                          className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#07111f]/70 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-emerald-300/60 focus:ring-2 focus:ring-emerald-300/20"
                        >
                          {SEVERITIES.map((severity) => (
                            <option key={severity} value={severity}>
                              {SEVERITY_LABELS[severity]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <label
                      htmlFor={`issue-${issueIndex}-note`}
                      className="mt-3 block text-[11px] font-medium uppercase tracking-[0.1em] text-slate-300"
                    >
                      Not (neden sorun?)
                    </label>
                    <textarea
                      id={`issue-${issueIndex}-note`}
                      rows={2}
                      maxLength={500}
                      value={issue.note}
                      onChange={(event) => updateIssue(issueIndex, { note: event.target.value })}
                      className="mt-1.5 w-full resize-y rounded-lg border border-white/10 bg-[#07111f]/70 px-3 py-2 text-sm leading-5 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-emerald-300/60 focus:ring-2 focus:ring-emerald-300/20"
                    />

                    <label
                      htmlFor={`issue-${issueIndex}-suggestion`}
                      className="mt-3 block text-[11px] font-medium uppercase tracking-[0.1em] text-slate-300"
                    >
                      Öneri (opsiyonel)
                    </label>
                    <textarea
                      id={`issue-${issueIndex}-suggestion`}
                      rows={2}
                      maxLength={500}
                      value={issue.suggestion}
                      onChange={(event) => updateIssue(issueIndex, { suggestion: event.target.value })}
                      className="mt-1.5 w-full resize-y rounded-lg border border-white/10 bg-[#07111f]/70 px-3 py-2 text-sm leading-5 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-emerald-300/60 focus:ring-2 focus:ring-emerald-300/20"
                    />
                  </div>
                ))}
              </div>
            </div>

            {!currentValidation.ok && currentValidation.errors.length > 0 && (
              <ul className="mt-5 space-y-1 rounded-xl border border-amber-300/25 bg-amber-300/[0.07] px-4 py-3 text-[11px] leading-5 text-amber-100">
                {currentValidation.errors.slice(0, 4).map((error) => (
                  <li key={error}>• {error}</li>
                ))}
              </ul>
            )}

            <div className="mt-6 flex flex-col gap-3 border-t border-white/[0.08] pt-5 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => goTo(index - 1)}
                disabled={index === 0}
                aria-keyshortcuts="J"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm text-slate-200 transition hover:border-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ← Önceki <KeyHint keys="J" />
              </button>
              <button
                type="button"
                onClick={saveCurrent}
                aria-keyshortcuts="S"
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-300 to-cyan-300 px-5 text-sm font-semibold text-[#07111f] transition hover:from-emerald-200 hover:to-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60"
              >
                Kaydet ve sonraki <KeyHint keys="S" />
              </button>
              <button
                type="button"
                onClick={() => goTo(index + 1)}
                disabled={index >= records.length - 1}
                aria-keyshortcuts="K"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm text-slate-200 transition hover:border-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Sonraki <KeyHint keys="K" /> →
              </button>
            </div>

            <div className="mt-5 flex flex-col gap-2 border-t border-white/[0.08] pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[11px] leading-5 text-slate-500">
                İndirilen dosya şema doğrulamasından geçer ve yalnızca <strong className="font-medium text-slate-400">bu etiketleri</strong>{" "}
                ({progress.labeled}/{progress.total}) içerir; etiketsiz kayıtlar <code>labels: null</code> olarak
                yazılır.
              </p>
              <button
                type="button"
                onClick={downloadJsonl}
                className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl border border-emerald-300/35 bg-emerald-300/10 px-4 text-sm font-medium text-emerald-100 transition hover:bg-emerald-300/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/50"
              >
                JSONL indir ({progress.labeled}/{progress.total})
              </button>
            </div>
          </form>
        </div>
      )}

      <footer className="mt-10 border-t border-white/[0.08] pt-6 text-[11px] leading-5 text-slate-500">
        Kurallar: <code className="text-slate-400">docs/ANNOTATION_GUIDE.md</code> · Kararlar:{" "}
        <code className="text-slate-400">docs/DECISIONS.md</code> (ADR-002 · ADR-003 · ADR-004) ·
        Veri politikası: <code className="text-slate-400">data/README.md</code>. Doğrulama:{" "}
        <code className="text-slate-400">npm run eval:validate</code>.
      </footer>
    </div>
  );
}
