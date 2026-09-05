# Entity AI — Sistem Dokümantasyonu

`script.js` · Entities: The Caller (V7 Remade)

Bu belge Entity'nin yapay zekâsını satır düzeyinde anlatır. Oyunun genel tanıtımı ve
kurulumu için [`README.md`](README.md)'ye bak.

---

## 1. DURUM MAKİNESİ

Entity beş durumdan birinde bulunur. Buna ek olarak duruma bağlı olmayan bir
**sersemleme (stun)** bayrağı vardır — hangi durumda olursa olsun onu dondurur.

| Durum | Tetikleyici | Davranış | Işık |
|-------|-------------|----------|------|
| `PATROLLING` | Varsayılan / arama bitti | Rastgele bir walkable kareye yürür | Beyaz, 1.6 |
| `HUNTING` | `canEnemySeePlayer() === true` | Oyuncuya/tahmin noktasına koşar, kollar öne uzanır | Kırmızı, 3.0–5.5 titrek |
| `SEARCHING` | HUNTING → oyuncu kaçtı | Üç aşamalı arama, kafa tarar | Turuncu, 2.5 |
| `AMBUSH` | Rastgele + yakın + oyuncu bakmıyor | Görünmez kalır, bakılmıyorken atılır | Kapalı |
| `FROZEN` | Tüm anahtarlar toplandı | Titreyerek yerinde durur, saldıramaz | — |

**Sersemleme:** `isStunned` bayrağı. Işık maviye (`0x00ffff`) döner, `updateTheEntity`
erken çıkar. İki yoldan tetiklenir — fener (3.5 sn) veya doğrudan şişe isabeti (6 sn).

---

## 2. ALGI

### `canEnemySeePlayer(isSprinting)` — satır 2142

Üç aşamalı kontrol; herhangi biri başarısız olursa `false` döner.

**1. Mesafe**

```
yarıçap = (temel + öğrenmeBonusu + koşuAlışkanlığıBonusu) × çömelmeÇarpanı
```

| Bileşen | Değer |
|---------|-------|
| temel | 20 (yürürken) · 35 (koşarken) |
| öğrenmeBonusu | `entityMemory.score × 0.5` → en fazla +5 |
| koşuAlışkanlığıBonusu | Koşuyorsa **ve** karelerin >%25'inde koştuysa +6 |
| çömelmeÇarpanı | 0.6 (çömelirken) · 1.0 |

**2. Görüş konisi + altıncı his**

Ön vektör quaternion'dan alınır: `(0,0,1).applyQuaternion(mesh.quaternion)`.
`dot < 0.3` (~145° koni) ise oyuncu koninin dışındadır — ama hemen elenmez:

```js
senseRadius = (7 + (koşuyorsa 4 : 0)) × çömelmeÇarpanı
if (dot < 0.3 && mesafe² > senseRadius²) return false;
```

Yani koninin **dışında** olsan bile `senseRadius` içindeysen ve arada duvar yoksa
Entity seni hisseder ve döner. Arkasından sessizce geçmeyi engelleyen davranış budur.

**3. Görüş hattı**

Duvarlara ve **kapalı** kapılara raycast. Açık kapılar listeye alınmaz, yani
açık bir kapının içinden görebilir.

### `isPlayerLookingAtEnemy(playerPos)` — satır 2212

Oyuncu Entity'ye bakıyor mu? Görünmez Entity için her zaman `false` döner.
Menzil `flashlight.distance + 5`. Asıl karşılaştırmayı `isPlayerLookingAtPoint`
yapar: `dot > 0.8` (~37° koni) + duvar raycast'i.

`isPlayerLookingAtPoint` ortak bir yardımcıdır — AMBUSH giriş şartı, AMBUSH iç
kontrolü ve bu fonksiyon aynı tanımı paylaşır, böylece "bakıyor mu" her yerde
aynı anlama gelir.

### `updateSmoothedLook(obj, rawValue, delta)` — histerezis

Koni sınırındaki kamera titreşimlerinin tek karede durum değiştirmesini engeller.
Ham değer `LOOK_FLIP_GRACE` (0.18 sn) boyunca sabit kalmadıkça kabul edilmez.
Hem AMBUSH hem sahte Entity bunu kullanır — sahte Entity'nin 5 saniyelik sayacının
bir karelik titremeyle sıfırlanmaması için şart.

---

## 3. ÖĞRENEN HAFIZA

`entityMemory` her karede güncellenir ve oyuncuyu profilleyerek 0–10 arası bir
**skor** üretir:

```js
score = min(10, floor(huntCount / 1.5))
```

`huntCount`, oyuncunun elinden kaçtığı av sayısıdır (`onHuntEnded`).

| Alan | Örnekleme | Kullanımı |
|------|-----------|-----------|
| `heatmap` | 1.5 sn'de bir mevcut kare | `getMemoryHotSpot()` → devriye hedefi |
| `posHistory` | 0.3 sn'de bir konum, son 30 | `getPredictedPlayerPos()` → önünü kesme |
| `escapedDirs` | Av bitince, son 5 | Arama yönü |
| `profile.sprintFrames` | Her kare | Koşu alışkanlığı bonusu |
| `profile.bottlesThrown` | Her fırlatma | Yem yoksayma ihtimali |

### Skorun beş etkisi

| Etki | Formül |
|------|--------|
| Algılama yarıçapı | `+0.5 × score` |
| Av ısrarı (`huntGrace`) | `1.2 + 0.1 × score` sn |
| Hot spot'a gitme ihtimali | `0.07 × score`, en fazla %70 |
| Sahte Entity bekleme süresi | `−1.5 × score` sn |
| Önünü kesme | `score >= 2` olunca devreye girer |

### `getPredictedPlayerPos(playerPos)`

Pozisyon geçmişinden hız çıkarır, 2.8 kat ileriye projeksiyon yapar ve labirent
sınırlarına kırpar. `score >= 2` iken HUNTING hedefi oyuncunun kendisi değil, bu
tahmin noktasıdır.

---

## 4. YOL BULMA

### `findPathAStar(fromWorld, toWorld)` — satır 2008

2B ızgara üzerinde A\*. Dört yönlü komşuluk, Manhattan sezgiseli, **350 iterasyon**
üst sınırı. Hedef kare duvarsa `_pfNearestWalkable()` onu en yakın yürünebilir
kareye yapıştırır (en fazla 6 halka tarar). Yol bulunamazsa `null` döner ve çağıran
taraf hedefe doğru düz yürümeyi dener — Entity asla tamamen donmaz.

### `entityGetNextWaypoint(from, to, delta, pf, playStuckSound)` — satır 2067

Gerçek ve sahte Entity aynı fonksiyonu kullanır; `pf` parametresi sayesinde her biri
kendi bağımsız `path` / `waypointIdx` / `stuckTimer` durumunu taşır.

**Yol yenileme:** hedef `wallSize × 1.5` kadar kaydıysa, yol boşsa veya 1.2 sn'lik
sayaç dolduysa.

**Takılma kurtarma:** 2 saniye boyunca **birikmiş** ilerleme 0.3 birimin altında
kalırsa Entity, hedefe en yakın yürünebilir komşu kareye ışınlanır. Kare-kare
karşılaştırma değil birikmiş mesafe ölçülür — normal devriye hızında (1.5 birim/sn)
bir karede kat edilen mesafe zaten eşiğin altındadır. Işınlama rastgele değil hep
hedefe doğrudur; aksi halde oyuncuya "geri gidiyor" hissi verir.

---

## 5. DURUM DAVRANIŞLARI — `updateTheEntity()` satır 2248

Akış sırası:

1. `cinematicPlaying` → erken çıkış
2. Öfke çarpanı: `1 + keysCollected × 0.07` (8 anahtarla ≈ %56 hız artışı)
3. `isStunned` → ışık mavi, erken çıkış
4. `FROZEN` → konum kilidi + titreme, erken çıkış
5. VHS glitch: `mesafe < 5 && HUNTING && görünür` iken `body.glitch-active`
6. Görünürlük / ışınlanma yönetimi
7. `canEnemySeePlayer` → `enterHunting()` veya `huntGrace` sayacı
8. AMBUSH tetikleyici
9. Duruma göre hedef ve hız seçimi
10. A\* hareketi + yol üstündeki kapıları açma
11. Gövde dönüşü (`_lerpAngle`)
12. Kafa takibi (`neckPivot`)
13. Kol animasyonu

### Görünürlük döngüsü

Entity **60 saniye görünür**, **25 saniye görünmez** kalır (`timeVisible` /
`timeInvisible`).

**Görünürken:** normal hızda, kapıları açar, öldürebilir, koşulları uyarsa ışınlanır.

**Görünmezken:** hız 2.0'a düşer, `phaseDoors` ile kapılardan geçer, **öldüremez**,
ışınlanamaz. Yakınlığa göre tırmalama sesi çalar — 8 birim içinde her 2.0–3.5 sn'de,
15 birim içinde 4.0–7.0 sn'de bir. Bu, konumunu kasıtlı olarak sızdırır.

Görünür olmadan ~3 saniye önce bir kıkırdama çalar (`_preRevealSoundPlayed`) —
oyuncuya "bir şey geliyor" uyarısı.

**Ortaya çıkma erteleme:** oyuncu o yöne bakıyorsa veya 4 birimden yakınsa ortaya
çıkış ertelenir — ama en fazla **4 kez** (`_revealStallCount`). Sınır olmasaydı
oyuncu sadece o yöne bakmaya devam ederek ortaya çıkışı sonsuza dek erteleyebilirdi.

### Yönetmen AI'ı

```js
directorWantsTeleport = timeSinceLastEncounter > (25 - keysCollected × 2)
```

Uzun süre olay olmazsa Entity zorla oyuncunun 12–22 birim yakınına ışınlanır —
ama yalnızca oyuncu ona bakmıyorken.

### SEARCHING — üç aşamalı arama

`lastKnownPlayerPosition` etrafında sırayla üç nokta:

| Aşama | Hedef |
|-------|-------|
| 0 | Son bilinen konum |
| 1 | Kaçış yönünde +5 birim |
| 2 | Kaçış yönünde +10 birim |

Hedefe 2.5 birim yaklaşınca **veya** aşamada 4 saniye geçince sıradakine atlar.
Arama hızı `searchSpeed × öfke × 1.3`.

### AMBUSH — weeping angel

```js
speed = oyuncuBakıyorsa ? 0 : huntSpeed × 2.3
```

Görünmez kalır. Oyuncu baktığı sürece **tamamen donar**; bakış kesildiği an normal
av hızının 2.3 katıyla atılır. 3 birime yaklaşırsa aniden görünür olup `enterHunting()`
çağırır. Giriş şartı: `mesafe < 10`, oyuncu bakmıyor, cooldown bitmiş,
`Math.random() < 0.12 × delta` (kare-bağımsız, ~0.12/sn).

Bir pusudan sonra **90 saniye** cooldown. 9 saniyede yakalayamazsa pusu bozulur.

### `enterHunting(playerPos, opts)`

HUNTING'e giren **her** yol bunu kullanmalıdır. `state`'i tek başına atamak
`huntGrace` veya `lastKnownPlayerPosition` gibi alanları kurmayı atlar ve Entity
bir sonraki karede sessizce SEARCHING'e geri düşer.

---

## 6. SAHTE ENTITY (HALLUCINATION)

Gerçek Entity'nin yarı saydam (`opacity: 0.4`), yeşil ışıklı, yerden 1.6 birim
yukarıda süzülen bir kopyası. Kafası `rotation.z = 0.15` ile hafif yatık.

```
WANDERING ──► DECTED ──5 sn kesintisiz bakış──► CHARGING ──► GLITCH ──► kaybolur
```

| Durum | Davranış |
|-------|----------|
| `WANDERING` | Gerçek Entity gibi A\* ile dolaşır (hız 1.5), yakın kapıları açar |
| `DECTED` | Oyuncuya döner ve donar; `detectionTimer` işler |
| `CHARGING` | Oyuncuya doğru uçar (hız 13.5); oyuncu tekrar bakarsa DECTED'e döner |
| `GLITCH` | 5 saniye oyuncunun etrafında yörüngede döner, ekran bozulur |

**Yakalama mantığı gerçek Entity'nin tersidir.** `FAKE_ENTITY_CAPTURE_DURATION`
(5.0 sn) boyunca **kesintisiz bakılırsa** CHARGING'e geçer. Süre dolmadan bakış
kesilirse oyuncu kazanır: sahte Entity oyuncudan 15–40 birim uzağa ışınlanıp
WANDERING'e döner.

**Sahte Entity oyuncuyu öldüremez.** GLITCH bittiğinde sahneden kaldırılır ve
sayaç `25 + rastgele(20) − score × 1.5` saniyeye kurulur.

### Entity kombosu

Sahte Entity CHARGING durumundayken **ve** gerçek Entity HUNTING değilken, gerçek
Entity de `chargeDirection` yönüne hamle yapar (hız `huntSpeed × 1.2`) ve ışığı
turuncu-kırmızıya döner. AMBUSH bu kombodan muaftır — yoksa pusunun "bakınca don"
mekaniğini ezerdi.

Tüm anahtarlar toplandığında sahte Entity kalıcı olarak devre dışı bırakılır.

---

## 7. GÖRSEL SİSTEM

### `eyeLight` — satır 257

Kafanın **üstünden aşağı gövdeye** vuran spotlight. Öne bakan bir far değildir.
`enemyGroup`'un child'ıdır (kafanın değil), böylece kafa tarama hareketiyle sallanmaz.

- Pozisyon `(0, 2.8, 0.35)` · hedef `(0, 0.6, 0.05)`
- Renk ve parlaklık duruma göre değişir (bkz. bölüm 1 tablosu)

Ayrı göz mesh'i yoktur. Kafa düz soluk bir küredir (`SphereGeometry(0.4)`,
`0xcccccc`, hafif emissive); tehdit hissinin tamamı bu ışıktan gelir.

### Kafa takibi — `neckPivot`, satır 2595

Gövdeden bağımsız dönen ayrı pivot. Gövde hedefe bakarken kafa ayrı davranır:

| Durum | Hedef açı | Lerp hızı |
|-------|-----------|-----------|
| Görüyor | Oyuncuya kilit, ±0.7π (~±126°) sınır | 10 — "fark etti" hissi |
| HUNTING, son bilinen konum | Aynı sınır | 5 |
| SEARCHING | `sin(t × 0.0016) × 0.5π` (~±90°) | 3 |
| PATROLLING | `sin(t × 0.0006) × 0.22` (~±13°) | 2 |

Açı gövde yaw'ına **göreli** hesaplanır, sonra ±π aralığına sarmalanır.

### Kol animasyonu — satır 2619

Yürüyüş fazı rastgele değil, **gerçekten kat edilen mesafeyle** ilerler
(`walkPhase += mesafe × 4.5`), böylece kollar adımlarla senkron kalır. Işınlanma
sıçramasını sınırlamak için tek karelik mesafe 0.5 ile kırpılır.

| Koşul | Poz |
|-------|-----|
| HUNTING/kombo **ve** mesafe < 6 | Kollar öne uzanır ve yana açılır, dirsekler bükük, hafif titrer |
| HUNTING/kombo | Büyük genlikli hızlı pompalama (±0.6) |
| Hareket ediyor | Ölçülü doğal sallanma (±0.32) |
| Duruyor | Kollar yanlarda asılı, sakin |

---

## 8. AÇILIŞ SİNEMATİĞİ — `updateCinematic()` satır 1478

Süre boyunca `controls.enabled = false`, klavye olayları da `cinematicPlaying`
kontrolüyle bloke edilir.

| Zaman (sn) | Olay |
|------------|------|
| 0 → 10 | Dört satır metin, her biri 2.5 sn, ekran karanlık |
| 10 → 11.5 | Metin overlay'i solar |
| 12.5 → 14 | Oyuncu sağa bakar |
| 14 → 15.5 | Sola bakar |
| 15.5 → 16 | Merkeze döner |
| 16 → 16.6 | Fener çakmaya çalışır (rastgele flicker) |
| 16.6 → 18 | Fener söner, tam karanlık |
| 16.8 → 18.5 | Oyuncu 180° arkasını döner |
| 18 | Entity 16 birim ötede belirir; fener ve `eyeLight` açılır |
| — | Entity `huntSpeed × 1.6` ile koşar, ışığı kırmızı titrer |
| mesafe < 3.5 | Entity kaybolur, fener söner, 25+ birim uzağa ışınlanır |
| +0.5 sn | `_endCinematic()` — fener geri açılır, HUD görünür, hedef bildirimi çıkar |
| 23 (emniyet) | Entity hiç gelmediyse zaman aşımı, sinematik yine de biter |

---

## 9. TELEMETRİ

Her karede `BroadcastChannel('telemetry-hub')` üzerinden yayın yapılır. Alıcı
`entity_logic.js` (gözlem ekranı).

Gönderilen veri: Entity'nin konumu, rotasyonu, durumu, `walkPhase`, sersemleme
bayrağı, boyun ve kol açıları, görünürlüğü, ışık rengi ve şiddeti · oyuncunun
konumu, rotasyonu, koşma/çömelme durumu, feneri, aktif slotu, staminası · sahte
Entity'nin konumu ve durumu (aktifse) · tüm kapıların açık/kapalı durumu ·
toplanan anahtar sayısı ve kalan anahtarların koordinatları · çıkış kapısının
konumu, kilit ve açıklık durumu.

---

## 10. THREE.JS NOTU — `Object3D.lookAt`

Three.js'te **kamera dışı** nesnelerde `lookAt()` kameradakinden farklı çalışır:
kaynak kodda non-camera dalı argümanları ters verir (`_m1.lookAt(_target, _position, up)`),
bu da yerel **+Z** eksenini doğrudan hedefe çevirir.

Entity modelinin yüzü, ışığı ve ön vektörü +Z üzerindedir. Dolayısıyla düz
`lookAt(oyuncuKonumu)` çağrısı yüzü doğrudan oyuncuya döndürür — ek bir
`rotation.y += Math.PI` düzeltmesi **gerekmez** ve eklenirse yüzü 180° ters
çevirir. Bu, `canEnemySeePlayer` içindeki ön vektör hesabıyla doğrudan bağlantılıdır:
`forward` yanlış yöne bakarsa `dot` negatif çıkar ve Entity oyuncuyu göremez.
