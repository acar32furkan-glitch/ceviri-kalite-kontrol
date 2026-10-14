# Veri seti (`data/`)

Bu dizin, ölçümün **tek gerçeği** olan insan etiketli altın veri setini barındırır.
Etiketleme kuralları `docs/ANNOTATION_GUIDE.md`, kararların gerekçesi `docs/DECISIONS.md` içindedir.

## Dosyalar

| Dosya | Rol |
| --- | --- |
| `data/eval-set.jsonl` | **Asıl veri seti.** Etiketleme arayüzü ve doğrulama CLI'si önce buna bakar. Gerçek etiketler oluştuğunda depoya işlenir (CI'daki replay-eval bu dosyayı kullanır). |
| `data/eval-set.example.jsonl` | **Örnek veri.** Gerçek veri seti yokken arayüzün ve testlerin çalışmasını sağlar. Depoya işlenir. |

`data/eval-set.jsonl` yoksa veya bozuksa araç örnek veri ile çalışır ve arayüzde bunu söyleyen bir
uyarı gösterir. Örnek veri üzerinden üretilen etiketler **geçicidir**; ölçüm sonucu sayılmaz.

Biçim: her satırda bir JSON nesnesi (JSONL). Zorunlu alanlar ve tipler `src/lib/eval/record-schema.ts`
içindeki `EvalRecordSchema` ile tanımlıdır; şema değişirse **ikisi birlikte** güncellenir.

## Lisans politikası (ADR-005)

1. Her metin ya proje sahibi tarafından yazılmış **özgün** metindir (`license: "ozgun"`), ya da
   lisansı doğrulanmış açık bir kaynaktan alınmıştır.
2. Açık kaynak kullanılırsa `license` alanına lisansın **SPDX kısa adı** ve sürümü yazılır
   (örn. `CC-BY-4.0`, `CC0-1.0`, `public-domain`).
3. Lisansı belirsiz, telifli veya "izinsiz kullanılabilir" varsayılan hiçbir metin alınmaz.
   Kitap, haber, altyazı ve sözlük tanımı metinleri kullanılmaz.
4. Kaynak metin havuzu kayıt altına alınır (aşağıdaki liste). Kayıt olmadan veri setine satır eklenmez.

### Kaynak listesi (iskelet)

Veri setine giren her dış kaynak buraya eklenir. Özgün metinler için satır açmak zorunlu değildir,
ancak `license` alanı yine doldurulur.

| # | Kaynak | Lisans (SPDX) | Erişim tarihi | Kullanılan kayıtlar | Not |
| --- | --- | --- | --- | --- | --- |
| 1 | _(örnek)_ Project Gutenberg e-kitap | `public-domain` | — | `trq-00XX` | Yalnızca kamu malı eserler |
| 2 | _(örnek)_ AB açık veri portalı duyurusu | `CC-BY-4.0` | — | `trq-00XX` | Atıf `data/README.md` içinde |
| — | Proje sahibi tarafından yazılan özgün metinler | `ozgun` | — | geri kalanı | Varsayılan |

> Not: Şu an depodaki veri **tamamı özgündür**; dış kaynak kullanılmamıştır.

## Dev / test bölünmesi (ADR-004)

- Her kayıt tam olarak bir split'e aittir: `dev` veya `test`.
- **Hedef oran:** toplam kayıtların yaklaşık **%60–70'i `dev`**, kalanı `test`.
- `dev`, geliştirme içindir: prompt, glossary, model ayarı ve arayüz iyileştirmeleri **yalnızca**
  `dev` üzerinde yapılır.
- `test` **dondurulur**. Kayıt metni görüldükten sonra prompt/kod ayarlamak veri sızıntısıdır ve
  ölçümü anlamsız kılar. `test` içeriğinin kararlı özeti (dondurma hash'i) doğrulama CLI'si ile
  her koşuda yeniden hesaplanır:

  ```bash
  npm run eval:validate
  ```

  Raporlanan `dev` / `test` hash'leri bir sürüm notuna yazılır; hash değişirse test seti değişmiş
  demektir ve değişiklik gerekçesi `docs/DECISIONS.md` içine yeni bir ADR olarak eklenir.
- Bir kaydın split'i **sonradan değiştirilemez** (test → dev "kaçış kapısı" değildir).
- Etiketlenmemiş kayıtlar da split'e aittir; etiketleme sırası `dev` önce olacak şekilde planlanır.

## Metin türü dağılımı

Her split içinde `kind` alanı mümkün olduğunca dengeli dağıtılır:

| `kind` | Ne demek | Örnek |
| --- | --- | --- |
| `ui` | Arayüz dizeleri (buton, etiket, kısa bildirim) | "Download invoice" |
| `urun` | Ürün/uygulama metinleri (bildirim, onboarding) | "Your trial ends in 3 days." |
| `eposta` | İş ve destek e-postaları | sipariş, iade, hatırlatma |
| `teknik` | Teknik belge, sürüm notu, yer tutucu içeren metin | `{count} rows imported` |
| `resmi` | Sözleşme, tebliğ, resmî yazışma | "Bu belge taraflar için bağlayıcıdır." |

## Veri kalitesi kontrolü

Veri setine satır ekledikten sonra mutlaka:

```bash
npx tsx scripts/eval/validate-data.ts data/eval-set.jsonl
npm run eval:validate
```

Doğrulama; şema hatalarını **satır numarasıyla**, kayıt/etiket sayılarını, dev/test dondurma
hash'lerini ve snippet'lerin hedef metinde birebir geçip geçmediğini raporlar. Hata varsa çıkış kodu
`1` olur; hatalı veri işlenmiş sayılmaz.
