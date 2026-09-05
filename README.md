<div align="center">

# 🔦 Entities: The Caller

**Three.js ile yazılmış, tarayıcıda çalışan birinci şahıs labirent korku oyunu.**
*A first-person maze horror game built with Three.js, running entirely in the browser.*

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
![Three.js](https://img.shields.io/badge/Three.js-vendored-000000?logo=three.js&logoColor=white)
![No Build Step](https://img.shields.io/badge/build-yok%20%2F%20none-success)
![Offline](https://img.shields.io/badge/offline-çalışır%20%2F%20works-brightgreen)

**[🇹🇷 Türkçe](#-türkçe) · [🇬🇧 English](#-english)**

</div>

> [!WARNING]
> **Işığa duyarlılık uyarısı.** Entity yaklaştığında ekran saniyede ~5 kez titreşir ve renk kayması uygular. Işığa duyarlı epilepsisi olanlar için risklidir.
> **Photosensitivity warning.** When the Entity closes in, the screen flickers ~5 times per second with a hue shift. This may be a risk for people with photosensitive epilepsy.

> [!NOTE]
> Atmosferik korku: karanlık, takip eden bir yaratık, çığlık sesleri. **Kan, şiddet görüntüsü veya jumpscare yok.**
> Atmospheric horror: darkness, a stalking creature, scream sounds. **No blood, no depicted violence, no jumpscares.**

---

# 🇹🇷 Türkçe

## Oyun Nedir?

Karanlık bir labirentte uyanıyorsun. Elinde bir fener var ve yalnız değilsin.

**Amaç:** Labirente dağılmış **8 anahtarı** topla, çıkış kapısını bul, kaç.

Ama son anahtarı aldığın anda oyun kurallarını değiştiriyor: **fenerin kalıcı olarak sönüyor**, koridorlar aydınlanıyor ve canavar çıkışın önünde donuyor. Çıkışa yaklaştığında kapı mühürlenip **duvara dönüşüyor**, labirentin başka bir yerinde yeni bir çıkış açılıyor ve **15 saniyelik geri sayım** başlıyor. Sayım bitince canavar çözülüyor — bu sefer %35 daha hızlı.

## Nasıl Çalışır — Sistemler

### 🧠 Entity: Öğrenen Avcı

Beş durumlu bir durum makinesi. Labirentte **A\*** ile yol buluyor (4 yönlü, Manhattan sezgisel, 350 iterasyon sınırı).

| Durum | Tetikleyici | Davranış | Işık |
|-------|-------------|----------|------|
| `PATROLLING` | Varsayılan | Rastgele bir kareye yürür | Beyaz, sabit |
| `HUNTING` | Seni gördü/hissetti | Üstüne koşar; kovaladıkça hızlanır | Kırmızı, titrek |
| `SEARCHING` | Görüşü kaybetti | 3 aşamalı arama (aşağıda) | Turuncu |
| `AMBUSH` | Yakın + sen bakmıyorken, rastgele | Görünmez olur, üstüne atılır | Yok (görünmez) |
| `FROZEN` | 8 anahtar toplandı | Çıkışın önünde titreyerek bekler | — |

Ayrıca **sersemleme (stun)** durumu var: ışık maviye döner, hareket edemez.

**Üç katmanlı algı** (`canEnemySeePlayer`):
1. **Mesafe** — yürürken 20 birim, koşarken 35 birim
2. **Görüş konisi** — `dot > 0.3` (~145°). Koninin dışında kalsan bile **altıncı his**: 7 birim içindeysen ve aranızda duvar yoksa seni hisseder, döner. *Arkasından sinsice geçmek işe yaramıyor.*
3. **Raycast** — arada duvar veya kapalı kapı var mı

Çömelmek her iki yarıçapı da **×0,6** yapıyor. Koşmak sezgi mesafesini +4 büyütüyor.

**3 aşamalı arama:** Görüşü kaybedince önce seni son gördüğü yere gider; 4 saniyede bulamazsa kaçış yönünde **+5 birim** ileriye, sonra **+10 birim** ileriye bakar. "O tarafa gitti, şuraya da bakayım" davranışı.

### 📈 Adaptif Hafıza — Seni Öğreniyor

Entity her avdan sonra bir **öğrenme skoru** biriktiriyor (`floor(avSayısı / 1,5)`, en fazla 10). Skor arttıkça:

| Etki | Formül |
|------|--------|
| Algılama yarıçapı büyür | +0,5 birim / puan |
| Köşeye saklanınca daha ısrarcı | +0,1 sn / puan (1,2 → 2,2 sn) |
| Devriyede en çok gezdiğin bölgeye gider | +%7 ihtimal / puan (max %70) |
| Sahte Entity daha sık gelir | bekleme −1,5 sn / puan |
| **Önünü keser** | skor ≥ 2'den itibaren |

Ayrıca **alışkanlığını** öğreniyor: karelerin %25'inden fazlasında koştuysan, koşarken algılama yarıçapına **+6** ekleniyor. Ve **anahtar başına %7 hızlanıyor** — 8 anahtarla yaklaşık %56 daha hızlı.

Arka planda bir **ısı haritası** (1,5 sn'de bir hangi karede olduğun) ve **son 30 pozisyonun** (0,3 sn aralıkla) tutuluyor. Önünü kesme bu geçmişten hızını çıkarıp 2,8 kat ileriye projeksiyon yaparak çalışıyor.

### 👁️ İki Farklı "Bakma" Mekaniği

Oyunun en ilginç yanı: bakmak bir tehdide karşı seni **koruyor**, diğerine karşı **öldürüyor**.

**AMBUSH — klasik weeping angel.** Entity görünmez olur ve donar. **Baktığın sürece hareket edemez.** Bakışını çevirdiğin an normal av hızının **2,3 katıyla** üstüne atılır. 3 birime yaklaşırsa aniden görünür olup saldırıya geçer. 9 saniyede yakalayamazsa pusu bozulur, 90 saniye bekler.

**Sahte Entity — tam tersi.** Yarı saydam, yeşil ışıklı, yerden 1,6 birim yukarıda süzülüyor. **Ona 5 saniye kesintisiz bakarsan** üstüne uçmaya başlıyor. Bakışını çevirirsen kaçırıyorsun — ışınlanıp gidiyor.

```
WANDERING ──► DECTED ──5 sn kesintisiz bakış──► CHARGING ──► GLITCH ──► kaybolur
(A* ile      (bakınca                          (13,5 hız,   (5 sn,
 dolaşır)     donar)                            bakınca      etrafında
                │                                DECTED'e     döner)
                └──bakışı kesersen──► ışınlanır   döner)
```

**Önemli:** Sahte Entity seni **öldüremiyor.** En kötü ihtimalle GLITCH: 5 saniye etrafında dönüyor, ekran bozuluyor, çığlık çalıyor, sonra kayboluyor. Gerçek tehlike şu: sahte Entity üstüne uçarken **gerçek Entity de aynı yöne hamle yapıyor** ve ışığı turuncu-kırmızıya dönüyor. İki taraftan sıkışıyorsun.

### 🔦 Fener ve 🍾 Şişeler

**Fener:** Entity'ye bakarken `F` tuşunu **basılı tut** — dairesel bir çubuk dolar. 2 saniyede dolunca Entity 3,5 saniye sersemler. Ama her kullanımda gereken süre **+0,5 saniye artıyor**, yani ikinci sefer 2,5 sn, üçüncü 3 sn... Sınırsız kullanılamıyor.

**Şişeler:** Haritada duvar diplerine **rastgele 4 tane** dağılıyor. İki işe yarıyor:
- **Yere düşüp kırılınca** ses çıkarıp Entity'yi oraya çekiyor — ama her attığında %10 daha az kanıyor (**en fazla %65 yoksayma**)
- **Doğrudan çarparsan** Entity'yi **6 saniye** sersemletiyor *(sadece görünürken)*

### 👻 Görünürlük Döngüsü

Entity sürekli görünür değil. **60 saniye görünür**, sonra kayboluyor ve **25 saniye görünmez** kalıyor. Görünmezken:

- Daha yavaş (2,0 birim/sn) ama **kapılardan geçebiliyor**
- **Sana zarar veremiyor** ve ışınlanamıyor
- Yakınlığa göre tırmalama sesi çalıyor — 8 birim içindeyse her 2–3,5 sn'de, 15 birim içindeyse 4–7 sn'de bir *(kasıtlı: yaklaşık konumunu ele veriyor)*
- Görünür olmadan ~3 saniye önce bir kıkırdama duyuyorsun — "bir şey geliyor" uyarısı

Bir de **yönetmen AI'ı** var: (25 − anahtar×2) saniyedir karşılaşma olmadıysa Entity'yi zorla yanına ışınlıyor. Yani sakinlik uzun sürmüyor.

### 🎬 Sinematikler

**Açılış (~20 sn, atlanamaz):** Dört satır metin — *"Gözlerini açtığında buradaydın."* → karanlıkta sağa-sola bakış → fenerin çakıp sönmesi → 180° arkanı dönüş → Entity 16 birim ötede belirip üstüne koşar → 3,5 birime gelince kaybolur. Bu sırada fare ve klavye tamamen kilitli.

**Kazanma:** Canvas üzerine çizilen bir orman sahnesi — 55 ağaç 5 saniyede büyüyor ve rüzgârda sallanıyor, soğuk bir ay yükseliyor, 10 ateşböceği süzülüyor. Sonra harf harf yazılan *"Kabus sona erdi... şimdilik."*

**Ölüm:** Karartma → çığlık → 12 metinden rastgele biri. Yarısı sıradan itiraflar, yarısı bilerek anlaşılmaz:
> *"Anahtarları saydın. O da saydı. Ama o farklı şeyler sayıyordu."*

### 📺 Entity Monitor — Gözlem Odası

`entity.html`, ikinci bir sekmede açılan yeşil fosfor / CRT tarzı gözlem ekranı. Oyun sekmesinden `BroadcastChannel('telemetry-hub')` üzerinden canlı veri alıyor: Entity'nin konumu, durumu, boyun ve kol açıları, ışık rengi; oyuncunun konumu, staminası, feneri; kapıların açık/kapalı durumu; kalan anahtarların koordinatları; çıkış kapısının yeri. Altta 2B radar, üstte durum paneli.

İki sekme aynı tarayıcıda açık olmalı — `BroadcastChannel` ağ üzerinden çalışmaz.

### 🏆 Başarımlar

Oyun `window.parent.postMessage` ile üç başarım gönderiyor: **ilk ölüm**, **kaçış**, ve **5 dakikanın altında kaçış**. Bu bir portal sayfasına `<iframe>` ile gömülmek için tasarlanmış — tek başına açıldığında mesajlar sessizce yok sayılıyor, oyun normal çalışıyor.

## Kontroller

| Tuş | İşlev |
|-----|-------|
| `W` `A` `S` `D` | Hareket |
| `Shift` | Koş — stamina harcar, sesin Entity'ye daha uzaktan ulaşır |
| `C` | Çömel — sessiz ve daha az fark edilir, ama yavaş |
| `Space` | Zıpla |
| `E` | Etkileşim — kapı aç/kapa, şişe al, çıkıştan kaç |
| `F` | Fener aç/kapa · Entity'ye **basılı tutunca** sersemletir |
| `G` | **Basılı tut** nişan al, **bırak** fırlat |
| `1` `2` `3` | Envanter slotu (3 slot) |
| `Esc` | Duraklat *(imleç kilidini bırakır)* |

**Ölüm koşulu:** Entity görünürken, sersemlememişken ve sana 1,5 birimden yakınken.

## Nasıl Çalıştırılır?

Oyun ES modülleri kullanıyor, bu yüzden **`index.html`'i çift tıklamak çalışmaz** (tarayıcı `file://` üzerinden modül yüklemeyi engeller). Yerel bir HTTP sunucusu gerekiyor:

```bash
git clone https://github.com/gmtr244/The-Entity-The-Caller.git
cd The-Entity-The-Caller
python3 -m http.server 8000
```

Tarayıcıdan **http://localhost:8000** · gözlem ekranı için ikinci sekmede **http://localhost:8000/entity.html**

<details>
<summary>Alternatifler</summary>

```bash
npx serve
php -S localhost:8000
```
VS Code'da **Live Server** eklentisi de olur.
</details>

**Gerekenler:** WebGL destekleyen güncel bir tarayıcı. İnternet gerekmiyor — Three.js dahil her şey repoda. Fare kilidi için oyuna bir kez tıklaman gerekiyor.

## Labirent

Prosedürel değil — `script.js` içinde **elle yazılmış 19 satırlık bir karakter ızgarası**. Her oyunda aynı harita.

```
W = duvar     D = kapı (10 adet)      K = anahtar (8 adet)
P = oyuncu    E = Entity başlangıcı   X = çıkış kapısı (kilitli)
```

Her karakter 4×4 birimlik bir kare, duvarlar 5 birim yüksekliğinde.

**Her oyunda değişenler:** Entity'nin açılış konumu, 4 şişenin yeri, Sahte Entity'nin çıktığı nokta, ışınlanma hedefleri, ve mühürlemeden sonra yeni çıkışın açılacağı kapı.

## Proje Yapısı

```
├── index.html          # Oyun — menü, HUD, importmap
├── script.js           # Oyun motoru (~2950 satır)
├── sounds.js           # Ses yükleme ve durum yönetimi
├── style.css           # Arayüz, VHS/glitch efekt katmanları
├── entity.html         # Gözlem odası (ayrı sekme)
├── entity_logic.js     # Monitor 3B görünüm + radar
├── js/                 # Kütüphaneler — çevrim dışı çalışsın diye repoda
│   ├── three.module.js
│   ├── PointerLockControls.js   (özel düzeltmeli — aşağıya bak)
│   └── BufferGeometryUtils.js
├── system.md           # Entity AI teknik notları
└── CHANGELOG.md        # Sürüm günlüğü
```

## Teknik Notlar

- **Sıfır bağımlılık, sıfır build adımı.** Three.js repoda gömülü, `importmap` ile çözülüyor. CDN'e ihtiyaç yok, tamamen çevrim dışı çalışıyor.
- **Ses hataya dayanıklı:** `createSafeAudio()` her yüklemeyi `try/catch` ile sarıyor, eksik dosya oyunu çökertmiyor. `bottle_break.mp3` yoksa `scratch.mp3`'e düşüyor.
- **Kayan çarpışma (sliding collision):** Duvara çapraz girince tamamen durmuyor — önce X, sonra Z ekseni ayrı deneniyor, hangisi boşsa o yönde kayıyor.
- **`PointerLockControls.js` özelleştirilmiş:** `onMouseMove` içinde `enabled` kontrolü var — sinematikler sırasında kamerayı tamamen kilitlemeyi sağlıyor.
- **Takılma kurtarma:** Entity 2 saniye boyunca 0,3 birimden az ilerlerse hedefe en yakın komşu kareye ışınlanıyor. Ping-pong'u önlemek için rastgele değil, hep hedefe doğru.
- **`Object3D.lookAt` tuzağı:** Three.js'te kamera dışı nesnelerde `lookAt` yerel **+Z**'yi hedefe çevirir — kameradakinin aksine. Entity modelinin yüzü ve ışığı +Z'de olduğu için düz `lookAt(oyuncu)` doğrudan doğru sonucu veriyor. Ayrıntı: [`system.md`](system.md)

---

# 🇬🇧 English

## What Is It?

You wake up in a dark maze. You have a flashlight, and you are not alone.

**The goal:** collect the **8 keys** scattered through the maze, find the exit, escape.

But the moment you grab the last key the game changes its rules: **your flashlight dies permanently**, the corridors light up, and the creature freezes in front of the exit. When you approach that exit it gets sealed and **turns into a wall**, a new exit opens elsewhere in the maze, and a **15-second countdown** starts. When it hits zero the creature unfreezes — 35% faster this time.

## How It Works — Systems

### 🧠 The Entity: A Hunter That Learns

A five-state machine navigating the maze with **A\*** (4-directional, Manhattan heuristic, capped at 350 iterations).

| State | Trigger | Behaviour | Light |
|-------|---------|-----------|-------|
| `PATROLLING` | Default | Walks to a random tile | White, steady |
| `HUNTING` | Saw or sensed you | Charges you, accelerating the longer it chases | Red, flickering |
| `SEARCHING` | Lost line of sight | Three-stage search (below) | Orange |
| `AMBUSH` | Nearby + you're not looking, at random | Goes invisible, then lunges | None (invisible) |
| `FROZEN` | All 8 keys collected | Trembles in front of the exit | — |

There's also a **stunned** condition: the light turns blue and it can't move.

**Three-layer perception** (`canEnemySeePlayer`):
1. **Distance** — 20 units while you walk, 35 while you sprint
2. **Vision cone** — `dot > 0.3` (~145°). Even outside the cone, a **sixth sense** kicks in: within 7 units with no wall between you, it senses you and turns. *Sneaking up behind it does not work.*
3. **Raycast** — is there a wall or closed door in between

Crouching multiplies both radii by **0.6**. Sprinting adds +4 to the sense radius.

**Three-stage search:** on losing you it first goes to where it last saw you; if that fails after 4 seconds it checks **+5 units** along your escape direction, then **+10 units**. A "you went that way, let me check further" behaviour.

### 📈 Adaptive Memory — It Learns You

The Entity accumulates a **learning score** after each hunt (`floor(huntCount / 1.5)`, capped at 10). As it climbs:

| Effect | Formula |
|--------|---------|
| Detection radius grows | +0.5 units / point |
| More persistent when you break line of sight | +0.1 s / point (1.2 → 2.2 s) |
| Patrols toward your most-visited area | +7% chance / point (max 70%) |
| The Fake Entity returns sooner | −1.5 s wait / point |
| **Cuts you off** | from score ≥ 2 onward |

It also learns your **habits**: if you sprinted for more than 25% of frames, its sprint detection radius gains **+6**. And it gets **7% faster per key you collect** — roughly 56% faster with all eight.

Behind this sits a **heatmap** (which tile you're on, sampled every 1.5 s) and your **last 30 positions** (every 0.3 s). Interception works by deriving your velocity from that history and projecting 2.8× ahead.

### 👁️ Two Opposite "Looking" Mechanics

The most interesting thing in the game: looking **protects** you from one threat and **kills** you against the other.

**AMBUSH — the classic weeping angel.** The Entity goes invisible and freezes. **It cannot move while you look at it.** The instant you look away it lunges at **2.3× its hunt speed**. Within 3 units it snaps visible and attacks. If it hasn't caught you in 9 seconds the ambush breaks, and it waits 90 seconds before trying again.

**The Fake Entity — the exact inverse.** Translucent, green-lit, hovering 1.6 units off the floor. **Look at it for 5 uninterrupted seconds** and it starts flying at you. Look away and you've escaped it — it teleports off.

```
WANDERING ──► DECTED ──5s of unbroken staring──► CHARGING ──► GLITCH ──► vanishes
(roams        (freezes                          (speed 13.5,  (5s orbit
 via A*)       when you                          back to       around you)
                │  look)                          DECTED if
                └──look away──► teleports away     you look)
```

**Important:** the Fake Entity **cannot kill you.** Worst case is GLITCH: five seconds orbiting you, screen distortion, a scream, then it's gone. The real danger is that while it charges, **the real Entity lunges the same way**, its light shifting orange-red. You get squeezed from both sides.

### 🔦 Flashlight and 🍾 Bottles

**Flashlight:** **hold** `F` while looking at the Entity — a radial bar fills. At 2 seconds it stuns the Entity for 3.5 seconds. But each use raises the required hold by **+0.5 seconds** (2.5s the second time, 3s the third…), so it can't be spammed.

**Bottles:** **four** are scattered at random against the walls. They do two jobs:
- **Shattering on the ground** pulls the Entity toward the noise — but every throw makes it 10% less gullible (**capped at 65% ignored**)
- **A direct hit** stuns the Entity for **6 seconds** *(only while it's visible)*

### 👻 The Visibility Cycle

The Entity isn't always there. It stays **visible for 60 seconds**, then disappears for **25 seconds**. While invisible it:

- Moves slower (2.0 units/s) but **passes through doors**
- **Cannot hurt you** and cannot teleport
- Plays scratching sounds by proximity — every 2–3.5 s within 8 units, every 4–7 s within 15 *(deliberate: it leaks its rough position)*
- Gives a giggle about 3 seconds before reappearing — a "something's coming" tell

There's also a **director AI**: if (25 − keys×2) seconds pass without an encounter, it force-teleports the Entity near you. Quiet stretches don't last.

### 🎬 Cinematics

**Opening (~20s, not skippable):** four lines of text — *"You were already here when you opened your eyes."* → looking left and right in the dark → the flashlight sputtering and dying → turning 180° → the Entity appearing 16 units away and running at you → vanishing at 3.5 units. Mouse and keyboard are fully locked throughout.

**Winning:** a forest scene drawn on canvas — 55 trees growing over 5 seconds and swaying in the wind, a cold moon rising, 10 fireflies drifting. Then, typed out character by character: *"The nightmare is over... for now."*

**Dying:** fade to black → scream → one of 12 lines at random. Half are ordinary confessions, half are deliberately opaque:
> *"You counted the keys. So did it. But it was counting different things."*

### 📺 Entity Monitor — The Observation Room

`entity.html` is a green-phosphor CRT-style observation screen you open in a second tab. It receives live data from the game tab over `BroadcastChannel('telemetry-hub')`: the Entity's position, state, neck and arm angles, light colour; your position, stamina and flashlight; every door's open/closed state; the coordinates of the remaining keys; the exit's location. A 2D radar sits at the bottom, a status panel at the top.

Both tabs must be in the same browser — `BroadcastChannel` does not cross the network.

### 🏆 Achievements

The game emits three achievements via `window.parent.postMessage`: **first death**, **escape**, and **escape under 5 minutes**. This is built to be embedded in a portal page via `<iframe>` — opened standalone the messages are silently ignored and the game runs normally.

## Controls

| Key | Action |
|-----|--------|
| `W` `A` `S` `D` | Move |
| `Shift` | Sprint — drains stamina, and carries your sound further to the Entity |
| `C` | Crouch — quiet and harder to detect, but slow |
| `Space` | Jump |
| `E` | Interact — open/close doors, pick up bottles, escape through the exit |
| `F` | Toggle flashlight · **hold** on the Entity to stun it |
| `G` | **Hold** to aim, **release** to throw |
| `1` `2` `3` | Inventory slot (3 slots) |
| `Esc` | Pause *(releases pointer lock)* |

**Death condition:** the Entity is visible, not stunned, and within 1.5 units of you.

## Running It

The game uses ES modules, so **double-clicking `index.html` won't work** (browsers block module loading over `file://`). You need a local HTTP server:

```bash
git clone https://github.com/gmtr244/The-Entity-The-Caller.git
cd The-Entity-The-Caller
python3 -m http.server 8000
```

Open **http://localhost:8000** · and for the observation screen, a second tab at **http://localhost:8000/entity.html**

<details>
<summary>Alternatives</summary>

```bash
npx serve
php -S localhost:8000
```
The VS Code **Live Server** extension works too.
</details>

**Requirements:** a modern WebGL-capable browser. No internet needed — everything including Three.js is in the repo. Click into the game once to engage pointer lock.

## The Maze

Not procedural — a **hand-authored 19-row character grid** inside `script.js`. Same map every run.

```
W = wall      D = door (10)          K = key (8)
P = player    E = Entity spawn       X = exit door (locked)
```

Each character is a 4×4-unit tile; walls are 5 units tall.

**What does change per run:** the Entity's opening position, where the 4 bottles land, where the Fake Entity spawns, teleport destinations, and which door becomes the new exit after the seal.

## Project Structure

```
├── index.html          # Game — menu, HUD, importmap
├── script.js           # Game engine (~2950 lines)
├── sounds.js           # Audio loading and state
├── style.css           # UI and VHS/glitch effect layers
├── entity.html         # Observation room (separate tab)
├── entity_logic.js     # Monitor 3D view + radar
├── js/                 # Libraries — vendored so the game works offline
│   ├── three.module.js
│   ├── PointerLockControls.js   (locally patched — see below)
│   └── BufferGeometryUtils.js
├── system.md           # Entity AI technical notes (Turkish)
└── CHANGELOG.md        # Version log (Turkish)
```

## Technical Notes

- **Zero dependencies, zero build step.** Three.js is vendored and resolved through `importmap`. No CDN required; it runs fully offline.
- **Fault-tolerant audio:** `createSafeAudio()` wraps every load in `try/catch`, so a missing file logs a warning instead of crashing the game. Missing `bottle_break.mp3` falls back to `scratch.mp3`.
- **Sliding collision:** hitting a wall at an angle doesn't stop you dead — X and Z are tried separately, and you slide along whichever axis is clear.
- **`PointerLockControls.js` is customised:** `onMouseMove` honours an `enabled` flag, which is what lets the cinematics lock the camera completely.
- **Stuck recovery:** if the Entity advances less than 0.3 units over 2 seconds, it teleports to the neighbouring tile closest to its target — always toward the goal rather than at random, to avoid ping-ponging.
- **The `Object3D.lookAt` trap:** in Three.js, `lookAt` on a non-camera object points local **+Z** at the target — the opposite convention from a camera. The Entity's face and light both sit on +Z, so a plain `lookAt(player)` does exactly the right thing. Details in [`system.md`](system.md).

---

## 📄 Lisans / License

**GNU Affero General Public License v3.0** — bkz. / see [`LICENSE`](LICENSE).

<div align="center">
<sub>© 2026 — Entities Project · <a href="https://github.com/gmtr244">gmtr244</a></sub>
</div>
