# Karar Kaydı (DECISIONS)

Bu dosya, projenin **ne yaptığını, neyi yapmadığını ve neden** yaptığını kayıt altına alır.
Sıra numaraları sabittir; kararlar değişirse eskisi silinmez, yeni bir ADR eklenir.

---

## ADR-001 — Bu projenin işi **ölçüm**: eval harness, marketing iddiası değil

**Karar:** Mevcut çeviri kalite kontrol aracı (Next.js + DeepSeek) bir "API sarmalayıcısı" olmaktan
çıkarılıp **ölçülmüş bir sisteme** dönüştürülür: insan etiketli altın veri seti + tekrarlanabilir
eval çalıştırıcısı + tanımlı metrikler + CI regresyon kapısı + dürüst `docs/EVAL.md`.

**Neden:** Aracın ne kadar doğru olduğuna dair bugüne kadar hiçbir ölçüm yok (repoda `data/`, `eval/`,
`docs/` bulunmuyor; ölçüm iddiası hiç yapılmadı).

**Neyi yapmıyoruz:** Model karşılaştırması üzerinden "en iyi model" iddiası. Yalnızca ölçülen fark
raporlanır.

**Sonuç kötü çıkarsa:** Bu da raporlanır. Kötü sonucu dürüstçe yazmak zayıflık değil, sinyaldir.

---

## ADR-002 — Puanlama ölçeği: 0–100 (araçla birebir aynı)

**Karar:** İnsan etiketleri de araç çıktısıyla **aynı** ölçekte tutulur: genel puan 0–100 ve beş
kategori (`accuracy`, `fluency`, `terminology`, `tone`, `formatting`) 0–100.

**Neden:** Aynı ölçek, uyum metriklerini (Spearman/Pearson/MAE) doğrudan karşılaştırılabilir kılar;
1–5 ölçeğine indirmek bilgi kaybı ve yeniden ölçekleme varsayımı getirirdi.

**Neyi yapmıyoruz:** Etiketleri toplayıp tek bir "kalite skoru"na indirgemek. Kategori bazlı uyum
ayrıca raporlanır; çünkü bir sistem akıcılıkta iyi, terminolojide kötü olabilir.

---

## ADR-003 — Hata taksonomisi: MQM'den sadeleştirilmiş 6 aile, 3 şiddet

**Karar:** Sorunlar 6 ailede etiketlenir: `accuracy`, `fluency`, `terminology`, `style`, `locale`,
`formatting`. Şiddet aracın mevcut enum'uyla **birebir**: `low` | `medium` | `high`.

**Neden:** Aracın çıktı şeması (`issues[].type` serbest metin, `severity` üç değerli) ile
eşleştirilebilmesi gerekir; serbest metin tür adları precision/recall hesabını imkânsız kılar.

**Eşleştirme kuralı (sorun tespiti P/R/F1 için):** iki sorun eşleşmiş sayılır eğer
① metin parçası örtüşmesi yeterli (Unicode NFC normalizasyonu + TR küçük harfe çevirme sonrası,
insan etiketinin token'larının en az %40'ı araç snippet'inde geçiyor) **ve** ② hata ailesi aynı.
Kural koda gömülür ve `docs/EVAL.md`'de aynen yazılır.

---

## ADR-004 — Etiketleme protokolü: kör etiketleme, donmuş test seti

**Karar:**
- Etiketleyici (Furkan) **aracın puanını görmeden** etiketler (çıpalama yanlılığını önler).
- Veri seti `dev` / `test` olarak ayrılır; prompt ve kod iyileştirmeleri **yalnızca `dev`** üzerinde
  yapılır. `test` seti nihai ölçüme kadar dondurulur (içerik hash'i kayda geçer).
- Zorunlu test yoktur; bilinçli birkaç örnek **birkaç gün sonra yeniden** etiketlenir ve
  **intra-annotator (tek etiketleyici kendi tutarlılığı)** olarak raporlanır.

**Neden:** Test setine bakarak prompt ayarlamak veri sızıntısıdır ve ölçümü anlamsız kılar.

**Neyi yapmıyoruz:** "Inter-annotator agreement" iddiası. İkinci bir etiketleyici yok; böyle bir
ölçüm iddia edilmez. Tek etiketleyici ve küçük örneklem sınırlılık olarak `EVAL.md`'de yazılır.

---

## ADR-005 — Telif/lisans: yalnızca özgün veya açık lisanslı metin

**Karar:** Veri setindeki her metin ya proje sahibi tarafından yazılmış **özgün** metindir ya da
lisansı doğrulanmış açık kaynaktan alınmıştır. Her kaydın `license` alanı doldurulur ve kaynak
listesi `data/README.md` içinde tutulur.

**Neyi yapmıyoruz:** Telifli kitap/haber/altyazı metni kullanmak. Lisansı belirsiz kaynak almamak.

---

## ADR-006 — Operasyonel metrikler zorunlu: hata oranı ve gecikme/maliyet

**Karar:** Geçersiz JSON, zaman aşımı ve reddedilen yanıtlar "veri dışı bırakıldı" diye gizlenmez;
**hata oranı** olarak ayrı raporlanır. Ayrıca p50/p95 gecikme ve çağrı başına yaklaşık token
maliyeti ölçülür.

**Neden:** Kalite metrikleri yalnızca "başarılı" yanıtlar üzerinden hesaplanırsa sistem olduğundan
iyi görünür; operasyonel başarısızlık gizlenmiş olur.

---

## ADR-007 — Kilit dosyası bozuktu ve sıfırdan üretildi (CI kırmızısının kök nedeni)

**Bulgu (ölçüldü):** Depoya işlenmiş `package-lock.json` hem yerelde hem temiz klonda
`npm ci` → `npm error Invalid Version:` hatası veriyordu. Bu yüzden **CI ve Deploy 2026-09-10'dan
beri kırmızıydı** (16–17 sn'de düşüyor, kurulum adımında).

**Teşhis:** Manifest temizdi (tüm sürüm aralıkları geçerli, pinlenmiş tam sürümler registry'de
mevcut, `.npmrc` yok, `engines`/`overrides` yok). Kilit dosyasındaki sürüm alanları da geçerli
görünüyordu; ancak kilit dosyası **silinip** `npm install --package-lock-only` çalıştırıldığında
kurulum başarılı oldu → kusur kilit dosyasının kendisindeydi.

**Karar:** Kilit dosyası sıfırdan üretildi (`npm install --package-lock-only`), temiz klonda
`npm ci` → `npm run typecheck` → `npm test` → `npm run lint` → `npm run build` zinciri baştan sona
koşuldu ve geçti (17/17 test). Ardından depoya tek amaçlı bir commit ile işlendi.

**Not:** 160.845 baytlık eski dosya 289.474 bayta çıktı (513 → 527 paket kaydı); yani eski dosya
eksik/biçimce bozuk bir ağaç tanımlıyordu.

---

## Varsayımlar (soru sorulmadan alınan kararlar)

1. **Kaynak metin havuzu:** veri seti için özgün EN↔TR metinler proje sahibi tarafından
   yazılacak/sağlanacak; telif riski alınmaz (ADR-005).
2. **Etiketleme arayüzü:** kör etiketleme için uygulama içi bir sayfa (`/eval/label`) hedeflenir;
   arayüz aracın puanını göstermez, klavye ile hızlı etiketlemeye izin verir.
3. **Canlı eval bütçesi:** `eval:live` varsayılan olarak kapalıdır; yalnızca açık bütçe sınırıyla
   çalışır. CI yalnızca `eval:replay` (kaydedilmiş yanıtlar) kullanır — canlı LLM çağrısı yapmaz.
