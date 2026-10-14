# Etiketleme Kılavuzu — Çeviri Kalite Kontrol Altın Veri Seti

> **Sürüm:** 1.0 (Faz 1) · **Etiketleyici:** Furkan Acar · **Dil çifti:** EN ↔ TR
> **İlgili kararlar:** ADR-002 (0–100 ölçek), ADR-003 (6 hata ailesi, 3 şiddet), ADR-004 (kör
> etiketleme + donmuş test seti), ADR-005 (lisans).
>
> Bu kılavuz **donmuştur**. Etiketleme sırasında kural değiştirilmez; değişiklik gerekiyorsa
> etiketlemeye ara verilir, kılavuzun yeni sürümü yazılır ve `docs/DECISIONS.md`'ye gerekçe eklenir.
> Aynı kaydı eski ve yeni kuralla puanlamak ölçümü kirletir.

---

## 0. Bu kılavuz neden var

Araç "iyi mi kötü?" sorusunun cevabı yok; çünkü ölçüm yok. Ölçüm için insan yargısının
**tekrarlanabilir** olması gerekir. Tekrarlanabilirliğin ön koşulu, aynı nitelikteki sorunların her
seferinde aynı adı ve aynı şiddeti almasıdır. Bu kılavuz tam olarak bunu sağlar: hangi puan, hangi
hata ailesi, hangi şiddet.

İki cümlelik özet: **Puanla, kanıtla, emin değilsen işaretle.** Kanıt yoksa sorun yoktur; "bana öyle
geldi" ölçülebilir bir veri değildir.

---

## 1. Etiketleme akışı

1. Arayüzü aç: `/eval/label`.
2. Kaydın **kaynak** ve **hedef** metnini baştan sona oku. Önce yalnızca kaynağı oku, ne demek
   istediğini kendi kendine söyle; sonra hedefe bak.
3. Genel puanı (0–100) ve beş kategoriyi puanla (bkz. §2).
4. Gördüğün her sorunu **hedef metinden birebir kopyalanmış** bir snippet ile kaydet (§5).
5. Kendi güvenini işaretle (`low` / `medium` / `high`). Emin değilsen `X` ile **belirsiz** işaretini koy (§6).
6. `S` ile kaydet. Değişiklikler tarayıcıda otomatik saklanır; oturum sonunda **JSONL indir** ile
   etiket dosyasını indir.

Zorluk çıkan yerler kılavuzda **kalın** yazılmıştır; onlar tartışmalı kararlardır.

---

## 2. Puan ölçeği: 0–100

### 2.1 Ölçeğin mantığı

- Ölçek **0–100 tam sayıdır**. Ondalık yoktur (`88.5` değil `89`).
- `100` **kusursuz** demektir, `0` **kullanılamaz** demektir. Bu iki uç gerçek hayatta nadirdir;
  çoğu kayıt 50–95 arasına düşer.
- **Genel puan, beş kategorinin aritmetik ortalaması değildir.** Bütünsel bir yargıdır: kullanıcıya
  en çok zarar veren kategoriye en çok ağırlığı ver. Bir metin akıcı ama anlamı yanlışsa genel puan
  düşüktür, çünkü akıcılık yanlış anlamı gizler (en tehlikeli hata tipi).
- Genel puan ile kategori ortalaması arasında 3–5 puanlık fark **normaldir**. 20 puanlık fark
  varsa puanlamayı tekrar gözden geçir.
- **Tavandan kaçın.** Her kayda 85+ vermek ölçüm sinyalini yok eder. "Fena değil" 60–70'tir,
  85 değildir.

### 2.2 Çıpalar (genel puan)

| Puan | Adı | Ölçüt | EN → TR örnek |
| --- | --- | --- | --- |
| **0** | Kullanılamaz | Hedef metin kaynağı taşımıyor: anlam yok, uydurma, dil yanlış, ya da içerik tamamen başka bir şey. Yayına çıkamaz. | Kaynak: `Your order has been shipped.` · Hedef: `Lütfen fatura bilgilerinizi güncelleyin.` (alakasız) |
| **25** | Ağır hasarlı | Ana fikir kısmen seziliyor ama metin güvenilir değil: kritik bilgi düşmüş, yer tutucu bozulmuş, sayı/tarih yanlış, ya da çeviri baştan sona makine kokuyor. | Kaynak: `Sync completed in {count} seconds.` · Hedef: `Eşitleme 6 saniyede tamamlandı.` (yer tutucu sayıyla değiştirilmiş) |
| **50** | Ciddi sorunlu | Anlam doğru ama kullanıcı görürse şikâyet eder: terminoloji tutarsız, kalıp kırık, ton tamamen yanlış, İngilizce sözdizimi taklidi. Düzeltmeden yayına alınmaz. | Hedef: `Talebınız onaylandı. Tutar kartınıza yansıtılacaktır.` (fluency dışında fena değil ama ifade İngilizce kopyası) |
| **75** | Yayına hazır (düzeltmeyle) | Tek tük, küçük kusur: bir kelime tercihi, bir noktalama, bir ton tonu. Anlam ve dil sağlam. Editör 2 dakikada düzeltir. | Hedef: `Değişikliklerinizi kaydetmeden pencereyi kapatmayın.` (anlam tam, üslup yazılım diline göre bir tık sıcak) |
| **100** | Kusursuz | Yerelleştirme standardı: anlam eksiksiz, ifade yerli, terminoloji doğru, ton bağlama uygun, biçim/yer tutucu/sayı kuralları korunmuş. Bu puan nadirdir. | Kaynak: `Save your changes before closing the window.` · Hedef: `Pencereyi kapatmadan önce değişikliklerinizi kaydedin.` |

### 2.3 Kategori çıpaları

Beş kategori bağımsızdır: biri düşükken diğeri yüksek olabilir. **TÜM KATEGORİLER
doldurulur** — emin olmadığın kategoriye komşu kayıttan puan kopyalama; o kategori için de
`uncertain` işaretini kullan.

| Kategori | 0 | 25 | 50 | 75 | 100 |
| --- | --- | --- | --- | --- | --- |
| **Anlam doğruluğu** (`accuracy`) | Anlam yok / başka konu. `shipped` → `iptal edildi` | Kritik bilgi düşmüş ya da zıt anlam: `3 gün` → `30 gün`, `iade` → `değişim` | Ana fikir doğru, ayrıntılar kayıp veya eklenmiş: bir cümle atlanmış, olmayan bir niteleyici eklenmiş | Anlam eksiksiz; yalnızca vurgu/kesinlik nüansı kayıp: `unlimited` → `sınırsız` yerine `çok geniş` | Kaynaktaki her bilgi, hiçbir şey eklenmeden ve çarpıtılmadan aktarılmış |
| **Akıcılık** (`fluency`) | Cümle kurulamıyor, dil bilgisi çökük; okuyan anlamı çıkaramıyor | İngilizce sözdizimi taklidi: `Tutar kartınıza yansıtılacaktır.` gibi doğal olmayan yapılar metnin yarısında | Anlaşılır ama yerli değil: sözcük sırası bozuk, bağlaçlar yanlış, tekrar var | Doğal; yalnızca bir kalıp beklenenden farklı: `yok olacaktır` yerine `kaybolacaktır` | Hedef dilde ana dili konuşanı gibi; hiçbir cümle "çeviri kokmuyor" |
| **Terminoloji** (`terminology`) | Terimler uydurma veya yanlış alan dili; glossary'ye tamamen aykırı | Glossary teriminin yarısı ihlal edilmiş ya da aynı kavram iki farklı sözcükle anılmış (tutarsızlık) | Terim doğru ama yerleşik karşılık değil; alan dili zayıf | Terimler doğru ve tutarlı; bir yerde daha iyi bir karşılık mümkün | Glossary ve alan standardı birebir; tutarlı |
| **Ton ve register** (`tone`) | Ton tamamen yanlış: resmî sözleşmede `naber`, pazarlama metninde bürokrasi | Ton fark edilir biçimde kaymış: `Please` → emir kipi, kurumsal ses → samimi arkadaş sesi | Ton kabul edilebilir ama tutarsız (metnin başı resmî, sonu samimi) | Ton doğru; bir cümlede gereksiz sertlik veya fazla samimiyet | Hitap düzeyi, kip ve kurumsal ses bağlama tam oturuyor |
| **Biçimlendirme** (`formatting`) | Yer tutucu/etiket bozuk (`{count}` → sayı), HTML etiketi düşmüş, metin işlevi bozulmuş | Yer tutucu bozulmuş veya bir etiket kaybolmuş; işlevsellik risk altında | Sayı/tarih biçimi yanlış yerelleştirilmiş (`1,250` → `1250`), ölçü birimi karışmış | Biçim doğru; noktalama/boşluk gibi küçük sapma | Yer tutucular, sayı ve tarih biçimleri, noktalama ve etiketler kaynakla birebir ve yerel kurallara uygun |

> **Kategori–aile bağı:** Bir sorunu kaydettiğinde puanladığın kategori ile düşsün diye değil,
> gerçekten o kategoride hasar varsa düşür. Eşleme ADR-003'te tanımlı: `accuracy`→accuracy,
> `fluency`→fluency, `terminology`→terminology, `style`→tone, `locale`→formatting,
> `formatting`→formatting.

---

## 3. Hata aileleri (6)

Her sorun **tek** aile alır. Bir snippet iki aileyi birden ilgilendiriyorsa **iki ayrı sorun** olarak
kaydet (snippet aynı olabilir) — birleştirmek değil, ayırmak doğrudur.

| Aile | Tanım | Şunu **alır** | Şunu **almaz** |
| --- | --- | --- | --- |
| `accuracy` | Kaynak anlamın eksik, fazla veya yanlış aktarılması | Atlanan cümle, değişen sayıya bağlı olmayan anlam kayması, yorumla eklenen bilgi, zıt anlam | Sadece üslup/akıcılık kusuru; yer tutucu/sayı biçimi (`formatting`/`locale`) |
| `fluency` | Hedef dilde dil bilgisi, sözdizimi veya doğallık kusuru | Çeviri kokan yapı, çekim hatası, yanlış bağlaç, tekrar, kırık cümle | İçerik yanlışlığı (o `accuracy`) |
| `terminology` | Alan terimi veya glossary karşılığının yanlış/tutarsız kullanımı | `password` → `şifre` (glossary `parola` diyor), aynı terimin iki farklı karşılığı | Genel sözcük tercihi (o `style` veya `fluency`) |
| `style` | Register, üslup, kurumsal ses, hitap düzeyi | Resmî metinde samimi dil, `Please` → emir kipi, sert/pasif kurumsal ton | Dil bilgisi bozukluğu (`fluency`), anlam kaybı (`accuracy`) |
| `locale` | Yerelleştirme biçimi: sayı, tarih, para, ölçü, adres, isim sırası | `1,250` → `1250`, `3.8 GB` → `3.8 GB` (yerel ondalık ayırıcı kullanılmamış), `MM/DD/YYYY` kalmış | Yer tutucu/etiket kaybı (o `formatting`) |
| `formatting` | Teknik işaret ve yapı: yer tutucu, HTML/markdown etiketi, satır sonu, büyük/küçük harf kalıbı | `{count}` → `6`, `<b>` etiketi düşmüş, `%USER%` çevrilmiş, arayüz dizesinde sonundaki `…` kaybolmuş | Sayı/tarih yerelleştirmesi (o `locale`) |

### Tipik örnekler

**`accuracy` — cümle atlanmış**
Kaynak: `Your trial ends in 3 days. Add a payment method to keep using all features.`
Hedef: `Deneme sürümünüz 3 gün içinde sona erecek.`
→ İkinci cümle yok. Aile `accuracy`, şiddet `high` (kullanıcı ne yapacağını bilmiyor).

**`fluency` — çeviri kokusu (klasik "yansımak" tuzağı)**
Hedef: `Tutar kartınıza yansıtılacaktır.`
→ İngilizce `will be reflected` yapısının taklidi. Aile `fluency`, şiddet `medium`.

**`terminology` — glossary ihlali**
Glossary `dashboard = kontrol paneli` iken hedefte `gösterge paneli` geçiyor.
→ Aile `terminology`, şiddet `medium` (tutarsızlık kullanıcıyı yanıltır).

**`style` — ton kayması**
Kaynak (kurumsal destek e-postası): `We are unable to process your request at this time.`
Hedef: `Şu an bunu yapamıyoruz.`
→ Anlam doğru, register düştü. Aile `style`, şiddet `low`–`medium` (kanal ve marka sesine bağlı).

**`locale` — sayı biçimi**
Kaynak: `1,250 records` · Hedef: `1250 kayıt`
→ Türkçede binlik ayırıcı noktadır: `1.250`. Aile `locale`, şiddet `medium`.

**`formatting` — yer tutucu**
Kaynak: `Sync completed in {count} seconds.` · Hedef: `Eşitleme 6 saniyede tamamlandı.`
→ `{count}` sabit sayıya dönüşmüş; çalışma zamanı değeri artık gösterilemez. Aile `formatting`,
şiddet `high`.

---

## 4. Şiddet karar ağacı

Her sorun için sırayla sor. **İlk "evet" aldığın dalda dur.**

```
1) Bu sorun kullanıcıyı YANLIŞ İŞ YAPMAYA mı sürüklüyor?
   (yanlış tutar, yanlış tarih, çalışmayan yer tutucu, zıt anlam)
   → EVET  → high
   → HAYIR → 2. adıma

2) Hata teknik olarak ÇALIŞMAYI mı bozuyor, yoksa kullanıcı fark edip
   şikâyet eder mi? (düşmüş etiket, işlevsiz buton metni, tutarsız terim,
   ton tamamen yanlış, atlanmış cümle içeriği)
   → EVET  → high (teknik/işlev)  |  medium (görünür kalite kusuru)
   → HAYIR → 3. adıma

3) Bir editör metni okurken FARK EDER ve düzeltmek İSTER mi?
   → EVET  → medium
   → HAYIR → 4. adıma

4) Yalnızca daha iyi bir alternatif var; mevcut hâli de savunulabilir mi?
   (üslup tercihi, daha zarif karşılık, tartışmalı terim)
   → EVET  → low
   → Bilmiyorum/karar veremiyorum → low + uncertain işareti
```

Ek kurallar:

- **`high` çok pahalıdır.** Bir kayıtta birden fazla `high` varsa genel puan büyük olasılıkla
  `50`nin altındadır. Sürekli `high` veriyorsan kılavuzun 4. maddesini tekrar oku.
- **Aynı sorun tekrar ediyorsa** (örn. aynı terim 5 yerde yanlış) her tekrarı ayrı kaydetme:
  en temsili olanı kaydet ve notta `×(5)` yaz. Şiddet, tekrar sayısıyla `medium`dan `high`a
  yükselmez; ama puanlarken yaygınlığı hesaba kat.
- **Kozmetik vs. işlev:** `…` yerine `...` → `low`; `%USER%` çevrilmiş → `high`.

---

## 5. Snippet kuralı (birebir kopyalama)

Snippet, etiketin **kanıtıdır**. Kanıt kuralı üç madde:

1. **Birebir kopyala.** Snippet, hedef metinde **aynen geçen** bir parça olmalıdır. Arayüzdeki
   "Seçimden doldur" düğmesini kullan: hedef metinden seç, düğmeye bas. Elle yazarsan yazım
   hatası kaçınılmazdır.
2. **Uzunluk 1–300 karakter.** Kanıtı taşıyacak en kısa anlamlı parçayı seç: genelde 3–12 sözcük.
   Tek bir edat yetersizdir; koca bir paragraf gereksizdir.
3. **Eksiltme yok, düzeltme yok.** Snippet'te `...` ile kısaltma, `[yanlış]` gibi ekleme,
   büyük/küçük harf değiştirme, noktalama düzeltmesi **yasaktır**. Snippet ne ise odur.
   Düzeltmeyi `suggestion` alanına yaz.

Doğru/yanlış örnek:

| | Değer | Neden |
| --- | --- | --- |
| ✅ | `yok olacaktır` | Hedefte aynen geçiyor, kanıtı taşıyor |
| ❌ | `kaybolacaktır` | Hedefte yok; öneriyi snippet'e yazmışsın |
| ❌ | `Kaydedilmemiş çalışmalar yok olacaktır` (uzun) | Gereksiz uzun; doğrulama yine geçer ama odak kaybolur |
| ❌ | `“yok olacaktır”` | Tırnak eklemişsin; hedefte tırnak yok |

`note` alanı neden sorun olduğunu (kısa, Türkçe), `suggestion` alanı düzeltilmiş metni taşır.
İkisi de 500 karakteri geçmez. **İkisi de opsiyoneldir**; ama `medium` ve `high` şiddette `note`
yazmak zorunlu kabul edilir.

---

## 6. "Belirsiz" işareti (`uncertain`)

`uncertain` **puanın yerine geçmez.** Kaydı yine 0–100 arası puanlarsın; bu yalnızca "bu puanı
savunurken tereddüt ettim" demenin yoludur.

**Ne zaman kullanılır:**

- İki karşılık da doğru ve tercih bağlama/kılavuza bağlı (örn. `dashboard` → `panel` mi
  `kontrol paneli` mi; glossary yoksa).
- Kaynak metin kendi içinde belirsiz (eksik bağlam: bu bir buton mu, cümle mi belli değil).
- Bir sorunun aile sınıflandırması senin için gerçekten sınırda (`style` ↔ `fluency`).
- Terim alan sözlüğünde yok ve iki kullanım da yaygın.
- Kaydın konusu (ürün, sektör) hakkında bilgin yok ve bu puanı etkiliyor.

**Ne zaman kullanılmaz:**

- Sadece tembelsen veya karar vermek istemiyorsan. Bu, işareti anlamsızlaştırır.
- Bir büyük hata açıkça varsa (`{count}` bozulmuş) — orada belirsizlik yoktur.
- Her kayda işaret koyuyorsan: kılavuz veya puan ölçeği anlaşılmamış demektir, ara ver ve
  §2'yi tekrar oku.

**Puanlamaya ve raporlamaya etkisi:**

1. `uncertain: true` kayıtlar analize **dâhil edilir**, atılmaz (aksi hâlde veri seçilmiş olur).
2. Uyum metrikleri (Spearman / Pearson / MAE) iki kez raporlanır: **tüm kayıtlar** ve yalnızca
   `uncertain: false` alt kümesi. İki sonuç arasındaki fark, ölçümün belirsizliğinin büyüklüğüdür
   ve `docs/EVAL.md`'de dürüstçe yazılır.
3. `uncertain` oranı **%20'yi geçerse** veri seti veya kılavuz revize edilir; aşan kayıtlar
   revizyon sonrası yeniden etiketlenir.
4. Arayüzde saniye saniye görünür: kaç kaydın belirsiz işaretli olduğunu ilerleme çubuğundan izle.

---

## 7. Ne yapılmaz

Bu bölüm kılavuzun en önemli kısmıdır: yasaklar ölçümün geçerliliğini korur.

1. **Aracın puanına bakmak yasak (kör etiketleme — ADR-004).** Etiketlemeden önce aracın aynı kayıt
   için verdiği puanı, kategori skorlarını veya sorun listesini görmek yasaktır. Görmek yargıyı
   çıpalar; sen araçla değil, kaynak metinle karşılaştır. Aynı kaydı önce araca, sonra kendine
   puanlatmak yasaktır.
2. **Test setini görüp prompt/kod yazmak yasak (ADR-004).** `test` split'indeki kayıtların metnini
   gördükten sonra prompt, glossary, model seçimi veya kod değiştirmek veri sızıntısıdır. Prompt
   geliştirmesi **yalnızca `dev`** üzerinde yapılır. Arayüz, test kaydı açıkken bunu hatırlatır.
3. **Ham veri dosyasını açıp `origin`/`labels` alanlarına bakmak yasak.** `data/eval-set.jsonl`
   içindeki `origin` alanı (örn. `enjekte`) metnin bozuk olduğunu söyler; `labels` alanı önceki
   etiketi gösterir. İkisi de çıpalamadır. Arayüz bu alanları **bilinçli olarak göstermez**;
   dosyayı elle açıp bakmak da aynı ihlaldir.
4. **Tahmin etme.** "Herhalde böyle demek istemiştir" diye puan verme. Emin değilsen `uncertain`
   işaretini kullan (`X`), puanı uydurma.
5. **Etiketi bir LLM'e veya çeviri motoruna ürettirme.** Veri seti **insan** yargısıdır; makine
   önerisiyle doldurulan etiket altın veri değildir. Glossary'ye bakmak serbesttir; çeviri
   motorundan çeviri almak yasaktır.
6. **Kaydın metnini değiştirme.** Yazım hatası görüyorsan kaydı düzeltme; `note` alanına yaz.
   Veri setinin metni dondurulmuştur (hash ile izlenir).
7. **Snippet'i yeniden yazma veya eksiltme** (§5).
8. **Split sınırını bulanıklaştırma.** Aynı kaydı hem `dev` hem `test` sayma; kaydın split'i
   dosyada yazılıdır ve değişmez.
9. **Kendi kılavuzunu anlık değiştirme.** Kural değişikliği yeni sürüm gerektirir (§0).
10. **Arayüzü kilo değiştirmek için zorlamak.** 300 karakter sınırına takılan bir snippet,
    gerçekten çok uzun demektir; daha kısa kanıt seç.

---

## 8. Oturum düzeni

Yorgun etiket, gürültü etiketidir. Ölçümün en büyük düşmanı tutarsızlıktır, yorgunluk da en büyük
tutarsızlık kaynağıdır.

- **25 dakikalık bloklar.** Bir blokta 10–15 kayıt. Blok sonunda 5 dakika ara ver; ekrandan kalk.
- **Bir blokta tek split.** `dev` ve `test` kayıtlarını aynı oturumda karıştırma. Bilinçli olsa da
  setlerin zorluk algısı farklıdır ve zihinsel referans kayar. Arayüzde split rozeti her kayıtta
  görünür — onu takip et.
- **Günde en fazla 4 blok** (yaklaşık 1,5 saat net etiketleme). Sonrasındaki puanlar güvenilmezdir.
- **Düşük güvende ara ver.** Son 3 kayıtta `confidence: low` işaretlediysen ya da puanlar birbirine
  yapıştıysa (hepsi 88 olduysa) dur. 10 dakika ara, kılavuzun §2.2 çıpalarını tekrar oku.
- **Blok sonunda 1 kayıt denetle.** Rastgele bir kaydı baştan puanla ve ilk puanla karşılaştır.
  15 puandan fazla fark varsa çıpalar kaymış demektir; bir sonraki bloğa başlamadan kılavuza dön.
- **Arayüz kendini kurtarır:** her kayıt tarayıcıda otomatik saklanır, `J`/`K` ile gezersin, sekmeyi
  kapatıp açtığında kaldığın etiketsiz kayda dönersin. Acele etmene gerek yok.
- **Tekrar etiketleme:** zorunlu değil, ama 2–3 kaydı **birkaç gün sonra** yeniden etiketleyip
  intra-annotator tutarlılığı olarak raporlamak ölçümün kalitesine gerçek bir kanıt ekler (ADR-004).
  Aynı gün içinde yapılan tekrar tutarlılık ölçmez, hafızayı ölçer.

---

## 9. Tam dolu örnek etiketler

Aşağıdaki üç örnek, arayüzdeki alanların **aynı** sırasıyla doldurulmuştur. Kendi etiketlerini
bunlarla karşılaştırarak kalibre olabilirsin.

### Örnek A — EN → TR, ürün metni, doğal

| Alan | Değer |
| --- | --- |
| `id` | `trq-0031` |
| `split` | `dev` |
| `direction` | `en-tr` |
| `kind` | `urun` |
| `origin` | `dogal` |
| `license` | `ozgun` |
| **source** | `Your trial ends in 3 days. Add a payment method to keep using all features.` |
| **target** | `Deneme sürümünüz 3 gün sonra bitiyor. Tüm özellikleri kullanmaya devam etmek için ödeme yöntemi ekleyin.` |

**Etiket**

| Alan | Değer | Gerekçe |
| --- | --- | --- |
| `overallScore` | `88` | Anlam tam; tek kusur üslup |
| `categoryScores.accuracy` | `95` | Ayrıntı kaybı yok; `a payment method` → `ödeme yöntemi` belirsizlik farkı anlamı bozmuyor |
| `categoryScores.fluency` | `92` | Akıcı, doğal |
| `categoryScores.terminology` | `90` | Alan terimi yok; genel sözcükler doğru |
| `categoryScores.tone` | `78` | `bitiyor` ürün bildirimi için konuşma diline kaçıyor |
| `categoryScores.formatting` | `100` | Sayı ve biçim doğru, yer tutucu yok |
| `confidence` | `high` | Kural net |
| `uncertain` | `false` | — |

**Sorunlar**

```json
[
  {
    "snippet": "3 gün sonra bitiyor",
    "family": "style",
    "severity": "low",
    "note": "Ürün bildirimi için konuşma diline yakın; kurumsal ürün sesi beklenen kalıp.",
    "suggestion": "Deneme sürümünüz 3 gün içinde sona erecek."
  }
]
```

### Örnek B — TR → EN, e-posta, çeviri kokusu + biçim

| Alan | Değer |
| --- | --- |
| `id` | `trq-0044` |
| `split` | `test` |
| `direction` | `tr-en` |
| `kind` | `eposta` |
| `origin` | `dogal` |
| `license` | `ozgun` |
| **source** | `Sayın müşterimiz, iade talebiniz onaylanmıştır. Ücret, 3–5 iş günü içinde kartınıza yansıyacaktır.` |
| **target** | `Dear customer, your refund request has been approved. The amount will be reflected to your card within 3-5 business days.` |

**Etiket**

| Alan | Değer | Gerekçe |
| --- | --- | --- |
| `overallScore` | `70` | Anlam doğru ama iki kusur var, biri belirgin biçimde çeviri kokuyor |
| `categoryScores.accuracy` | `88` | Anlam tam; yalnızca `Ücret` → `The amount` biraz daralmış |
| `categoryScores.fluency` | `52` | `will be reflected to your card` İngilizce değil (Türkçe `yansımak` taklidi) |
| `categoryScores.terminology` | `82` | `refund` tutarlı; alan terimi yok |
| `categoryScores.tone` | `86` | `Dear customer` uygun, kurumsal ses korunmuş |
| `categoryScores.formatting` | `88` | Aralık işareti `–` → `-` dönüşmüş |
| `confidence` | `medium` | `will be reflected` bazı pazarlama metinlerinde bilinçli kullanılıyor olabilir |
| `uncertain` | `true` | `fluency` yargısı bağlama bağlı; ayrı raporlanacak |

**Sorunlar**

```json
[
  {
    "snippet": "will be reflected to your card",
    "family": "fluency",
    "severity": "medium",
    "note": "İngilizcede para \"reflect\" edilmez; Türkçe \"yansımak\" fiilinin birebir taklidi. Anadili konuşan okuyucu anında fark eder.",
    "suggestion": "The amount will be credited to your card within 3–5 business days."
  },
  {
    "snippet": "3-5 business days",
    "family": "locale",
    "severity": "low",
    "note": "Kaynakta aralık işareti en dash (–), hedefte tire (-) kullanılmış. Biçim işaretleri korunmalı.",
    "suggestion": "3–5 business days"
  }
]
```

### Örnek C — EN → TR, teknik metin, yer tutucu ve sayı bozulması

| Alan | Değer |
| --- | --- |
| `id` | `trq-0058` |
| `split` | `dev` |
| `direction` | `en-tr` |
| `kind` | `teknik` |
| `origin` | `enjekte` |
| `license` | `ozgun` |
| **source** | `Batch import finished: {processed} of {total} rows imported. Failed rows: 1,204.` |
| **target** | `Toplu içe aktarma tamamlandı: 6 / {total} satır içe aktarıldı. Başarısız satır sayısı: 1204.` |

**Etiket**

| Alan | Değer | Gerekçe |
| --- | --- | --- |
| `overallScore` | `52` | Metin okunuyor ama bir yer tutucu kayıp ve bir sayı biçimi yanlış; işlevsel risk var |
| `categoryScores.accuracy` | `92` | Anlam aktarılmış; `rows imported` doğru |
| `categoryScores.fluency` | `90` | Akıcı |
| `categoryScores.terminology` | `88` | `içe aktarma` yerleşik karşılık |
| `categoryScores.tone` | `90` | Teknik bildirim tonu uygun |
| `categoryScores.formatting` | `18` | Bir yer tutucu (`{processed}`) kayıp, bir sayı yerelleştirmesi bozuk |
| `confidence` | `high` | Yer tutucu kaybı tartışmasız `high` şiddet |
| `uncertain` | `false` | — |

**Sorunlar**

```json
[
  {
    "snippet": "6 / {total}",
    "family": "formatting",
    "severity": "high",
    "note": "{processed} yer tutucusu gerçek bir sayıyla değiştirilmiş; uygulama bu değeri artık kullanıcıya gösteremez. Yer tutucular çevrilmez ve silinmez.",
    "suggestion": "{processed} / {total} satır içe aktarıldı."
  },
  {
    "snippet": "sayısı: 1204",
    "family": "locale",
    "severity": "medium",
    "note": "1,204 → Türkçede binlik ayırıcı noktadır: 1.204. Ayırıcı düşmüş.",
    "suggestion": "Başarısız satır: 1.204"
  }
]
```

---

## 10. Hızlı referans kartı

```
PUAN:      0 kullanılamaz · 25 ağır hasar · 50 kabul edilemez kusur · 75 düzeltmeyle yayına · 100 kusursuz
KATEGORİ:  accuracy · fluency · terminology · tone · formatting   (hepsi 0–100 TAM SAYI)
AİLELER:   accuracy · fluency · terminology · style · locale · formatting
ŞİDDET:    Yanlış iş yaptırır → high | Çalışmayı bozar → high | Fark edilir → medium | Tercih → low
SNIPPET:   Hedef metinden BİREBİR kopyala · 1–300 karakter · eksiltme/düzeltme YOK
BELİRSİZ:  Puanın yerine geçmez, yanına eklenir · %20'yi geçerse kılavuz revize edilir
YASAK:     Aracın puanına bakmak · test metnini görüp prompt yazmak · tahmin etmek
OTURUM:    25 dk blok · 10–15 kayıt · tek split · blok sonunda 1 denetim kaydı · 4 blok/gün
```

**Kısaltmalar:** `J` önceki kayıt · `K` sonraki kayıt · `S` kaydet · `X` belirsiz işaretle ·
`Shift+E` sorun ekle · `?` kısayol yardımı. Sayı alanları `Tab` ile gezilir.
