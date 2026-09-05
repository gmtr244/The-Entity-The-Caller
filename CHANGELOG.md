# Değişiklik Günlüğü

Entities: The Caller — **V7 Remade**

Bu sürüm V7'nin üzerine yeniden inşa edildi. Aşağıda V7'ye göre eklenen ve
değişen sistemler var. Entity yapay zekâsının teknik dökümü için
[`system.md`](system.md), oyunun tanıtımı için [`README.md`](README.md).

---

## Sahte Entity (Hallucination) Sistemi

Gerçek Entity'nin yanına, oyuncunun kafasını karıştırmak için ikinci bir tehdit
eklendi.

### Görünüm

Gerçek Entity'nin modeliyle aynı iskelet, ama bilerek farklı hissettiriyor:

- **Yarı saydam gövde** — `opacity: 0.4`, içinden geçiyormuş gibi duruyor
- **Yatık kafa** — `rotation.z = 0.15`, doğal olmayan huzursuz edici bir duruş
- **Yeşil ışık** — `SpotLight(0x00ff44, 1.5, 8)`, gerçek Entity'nin kırmızı/beyaz
  ışığıyla asla karışmıyor
- **Süzülme** — yere basmıyor, `y = 1.6`'da havada duruyor
- **Kollar** — `_makeArmCustom(side, mat)` ile kendi şeffaf malzemesini alıyor,
  hafif tedirgin edici asılı pozda

### Davranış

```
WANDERING ──► DECTED ──5 sn kesintisiz bakış──► CHARGING ──► GLITCH ──► kaybolur
     ▲            │                                  │
     └────────────┴──── bakış kesilirse ─────────────┘
```

| Durum | Ne yapıyor |
|-------|-----------|
| `WANDERING` | Labirentte A\* ile dolaşıyor (hız 1.5), önüne çıkan kapıları açıyor |
| `DECTED` | Oyuncuya dönüp donuyor, 5 saniyelik sayaç işlemeye başlıyor |
| `CHARGING` | Oyuncuya doğru uçuyor (hız 13.5), oyuncu tekrar bakarsa DECTED'e dönüyor |
| `GLITCH` | 5 saniye oyuncunun etrafında yörüngede dönüyor, ekran bozuluyor |

**Yakalama mantığı gerçek Entity'nin tersi.** Sahte Entity'ye **5 saniye kesintisiz
bakarsan** saldırıya geçiyor. Bakışını çevirirsen kaçırıyorsun — 15–40 birim uzağa
ışınlanıp dolaşmaya devam ediyor.

Bu bilinçli bir tasarım tercihi: oyunda iki zıt "bakma" mekaniği var. AMBUSH'ta
bakmak seni koruyor, sahte Entity'de bakmak seni tehlikeye atıyor.

**Sahte Entity öldüremiyor.** GLITCH'in sonunda sahneden kalkıyor ve
`25 + rastgele(20) − score × 1.5` saniye sonra tekrar geliyor. Entity ne kadar çok
avlandıysa o kadar sık dönüyor.

### Entity kombosu

Sahte Entity CHARGING durumundayken **ve** gerçek Entity o an avlanmıyorken, gerçek
Entity de aynı yöne hamle yapıyor (`huntSpeed × 1.2`) ve ışığı turuncu-kırmızıya
dönüyor. Oyuncu iki taraftan sıkışıyor ve strateji değiştirmek zorunda kalıyor.

AMBUSH bu kombodan muaf — yoksa pusunun "oyuncu bakınca don" mekaniğini ezerdi.

---

## Gerçek Entity

### Çok aşamalı arama

SEARCHING artık tek bir noktaya bakıp vazgeçmiyor. `lastKnownPlayerPosition`
etrafında sırayla üç nokta deniyor:

| Aşama | Hedef |
|-------|-------|
| 0 | Son görüldüğü yer |
| 1 | Kaçış yönünde +5 birim |
| 2 | Kaçış yönünde +10 birim |

Hedefe 2.5 birim yaklaşınca veya o aşamada 4 saniye geçince sıradakine atlıyor.
"O tarafa gitti, şuraya da bakayım" davranışı.

### Altıncı his

Görüş konisinin dışında kalsan bile, `senseRadius` (7 birim; koşarken +4,
çömelirken ×0.6) içindeysen ve aranızda duvar yoksa Entity seni hissedip dönüyor.
Arkasından sessizce geçmek artık işe yaramıyor.

### Öğrenen ısrar

`huntGrace` skorla ölçekleniyor: `1.2 + 0.1 × score` saniye. Entity öğrendikçe
görüşünü kaybettikten sonra daha uzun süre ısrar ediyor — köşeye saklanıp anında
kurtulmak zorlaşıyor.

### Doğal ortaya çıkış

Görünmezden görünüre geçerken artık rastgele bir yere ışınlanmıyor; o an yaklaşmış
olduğu konumda ortaya çıkıyor. İki emniyet payı var: çok yakınken veya oyuncu o
yöne bakıyorken ortaya çıkış erteleniyor — ama en fazla dört kez, sonra yine de
çıkıyor.

Ayrıca görünür olmadan ~3 saniye önce bir kıkırdama çalıyor: "bir şey geliyor" uyarısı.

### Pusu ayarı

| Parametre | V7 | V7 Remade |
|-----------|-----|-----------|
| Tetikleme | `0.3 × delta` | `0.12 × delta` |
| Cooldown | 60 sn | 90 sn |
| Süre sınırı | — | 9 sn |

Pusu daha seyrek geliyor ve sonrasında daha uzun bekliyor — oyuncuya daha adil bir
tempo. 9 saniyede yakalayamazsa pusu bozuluyor.

---

## Yol Bulma

- **Ortak fonksiyon:** Gerçek ve sahte Entity aynı `entityGetNextWaypoint()`
  fonksiyonunu kullanıyor. `pf` parametresiyle her biri kendi bağımsız
  yol/waypoint/takılma durumunu taşıyor.
- **Birikmiş mesafe ölçümü:** Takılma tespiti kare-kare değil, 2 saniyelik pencerede
  **biriken** mesafeye bakıyor (eşik 0.3 birim).
- **Yönlü kurtarma:** Takılınca hedefe **en yakın** yürünebilir komşu kareye
  ışınlanıyor — rastgele değil. Ping-pong'u ve "geri gidiyor" hissini önlüyor.
- **Hedef yapıştırma:** Tahmin ve kombo hedefleri yürünebilirlik kontrolü yapmadan
  üretildiği için, duvara denk gelen hedefler `_pfNearestWalkable()` ile en yakın
  boş kareye çekiliyor.
- **Güvenli geri dönüş:** A\* 350 iterasyonda bitiremezse veya hedef gerçekten
  ulaşılamazsa Entity donmuyor, hedefe doğru düz yürümeyi deniyor.

---

## Bakış Mekaniğinde Histerezis

Koni sınırındaki ufak kamera titreşimlerinin tek karede durum değiştirmesini
önlemek için `updateSmoothedLook()` eklendi. Ham "bakıyor mu" değeri 0.18 saniye
sabit kalmadan kabul edilmiyor.

Hem AMBUSH'ın don/atıl geçişi hem sahte Entity'nin 5 saniyelik sayacı buna bağlı —
sayacın bir karelik titremeyle sıfırlanmaması için şart.

Ayrıca AMBUSH giriş şartı, AMBUSH iç kontrolü ve `isPlayerLookingAtEnemy` artık
ortak bir `isPlayerLookingAtPoint()` fonksiyonunu paylaşıyor, böylece "bakıyor mu"
tanımı her yerde aynı.

---

## Telemetri (Monitor Entegrasyonu)

`BroadcastChannel('telemetry-hub')` yayınına sahte Entity alanları eklendi:

```javascript
fakeEntity: {
    pos: Vector3,
    state: string    // WANDERING | DECTED | CHARGING | GLITCH
}
```

Gözlem ekranında radar üzerinde konumu, `#fake-entity-state` panelinde durumu
görünüyor. Yayına ayrıca canlı anahtar koordinatları ve çıkış kapısının konum/kilit
durumu da eklendi.

---

## Ses

Tüm ses yönetimi `script.js`'ten ayrılıp **`sounds.js`** modülüne taşındı.

- `createSafeAudio()` her yüklemeyi `try/catch` ile sarıyor; eksik dosya oyunu
  çökertmiyor, konsola uyarı düşüp devam ediyor
- Yedekli yükleme: `bottle_break.mp3` yoksa `scratch.mp3`, `pickup.mp3` yoksa
  `pickup2.mp3` kullanılıyor
- `soundState.phase` ile üç aşamalı müzik geçişi: `normal` → `post-keys` → `escape`.
  Duraklat/devam ettir artık doğru aşamanın müziğine dönüyor
- `background2.mp3` varlığı `fetch(HEAD)` ile kontrol edilip asenkron yükleniyor

---

## Kaçış Sekansı

Sekiz anahtar toplandığında:

1. **Fener kalıcı olarak sönüyor** ve `F` tuşu kilitleniyor
2. Koridorlar aydınlanıyor (`AmbientLight` 0'dan 1.2'ye)
3. Entity çıkışın önüne ışınlanıp `FROZEN` durumuna geçiyor
4. Sahte Entity kalıcı olarak devre dışı kalıyor

Oyuncu eski çıkışa 8 birim yaklaştığında:

5. Kapı mühürlenip **duvara dönüşüyor**
6. Oyuncudan 20+ birim uzaktaki rastgele bir kapı konumunda yeni çıkış açılıyor —
   yeşil ışık ve EXIT tabelasıyla
7. **15 saniyelik geri sayım** başlıyor, ortam ışığı kırmızıya dönüyor
8. Sayım bitince Entity çözülüyor ve `huntSpeed × 1.35` ile ava başlıyor

---

## Kazanma Sinematiği

Kaçış sonrası canvas üzerine çizilen bir orman sahnesi: 55 ağaç 5 saniye boyunca
büyüyüp rüzgârda sallanıyor, soğuk tonlu bir ay yükseliyor, 10 ateşböceği süzülüyor.
Ardından harf harf yazılan kapanış cümlesi.

Renk paleti bilerek soğuk ve kasvetli tutuldu — sıcak bir gün doğumu yerine soluk,
yeşilimsi bir alacakaranlık.

