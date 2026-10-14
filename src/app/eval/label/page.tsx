import type { Metadata } from "next";
import LabelingApp from "@/components/labeling-app";
import { loadEvalDataset } from "@/lib/eval/load-records";

/**
 * Kör etiketleme sayfası.
 * `force-dynamic`: veri seti her istekte diskten okunur, böylece etiketleme sırasında dosya
 * güncellenirse sayfa yenilenince taze içerik görünür (statik olarak dondurulmaz).
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Kör etiketleme | Çeviri Kalite Kontrol",
  description:
    "İnsan etiketli altın veri seti için kör etiketleme arayüzü. Araç puanı gösterilmez (ADR-004).",
};

export default async function EvalLabelPage() {
  const dataset = await loadEvalDataset();
  return <LabelingApp dataset={dataset} />;
}
