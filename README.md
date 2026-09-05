<div align="center">

# 🔦 Entities: The Caller

**Three.js ile yazılmış, tarayıcıda çalışan birinci şahıs labirent korku oyunu.**
*A first-person maze horror game built with Three.js, running entirely in the browser.*

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
![Three.js](https://img.shields.io/badge/Three.js-r1xx-000000?logo=three.js&logoColor=white)
![No Build Step](https://img.shields.io/badge/build-yok%20%2F%20none-success)
![18+](https://img.shields.io/badge/18%2B-korku%20%2F%20horror-red)

**[🇹🇷 Türkçe](#-türkçe) · [🇬🇧 English](#-english)**

</div>

> [!WARNING]
> **18+ · Yüksek korku içeriği.** Ani jumpscare'ler, yüksek sesler ve yanıp sönen ışık/glitch efektleri içerir. Işığa duyarlı epilepsisi olanlar oynamamalıdır.
> **18+ · Intense horror content.** Contains sudden jumpscares, loud audio and flashing light/glitch effects. Not suitable for people with photosensitive epilepsy.

---

# 🇹🇷 Türkçe

## Oyun Nedir?

Karanlık bir labirentte uyanıyorsun. Elinde sadece bir fener var, ve labirentte yalnız değilsin.

**Amacın:** Labirente dağılmış **8 anahtarı** topla ve çıkış kapısından kaç. Ama son anahtarı aldığın anda çıkış **mühürleniyor** — geri sayım başlıyor ve yeni bir yol bulmak zorunda kalıyorsun.

Seni avlayan şey öğrenen bir yapay zekâ. Ne kadar çok kaçarsan, seni o kadar iyi tanıyor.

## Öne Çıkan Sistemler

### 🧠 Entity — Öğrenen Avcı

Entity, 6 durumlu bir **durum makinesi** ile çalışır ve labirentte **A\* pathfinding** ile yol bulur:

| Durum | Tetikleyici | Davranış |
|-------|-------------|----------|
| `PATROLLING` | Varsayılan | Rastgele noktalarda devriye gezer, ışığı beyaz |
| `HUNTING` | Seni gördü | Koşarak üstüne gelir, kolları öne uzanır, ışığı kırmızı |
| `SEARCHING` | Seni kaybetti | Son gördüğü yere gider, kafasını sağa sola tarar, ışığı turuncu |
| `AMBUSH` | Rastgele + yakın + sen bakmıyorken | Donar ve bekler — yaklaşınca saldırır |
| `FROZEN` | 8 anahtar toplandı | Yerinde titrer, saldıramaz |
| `STUNNED` | Feneri yüzüne tuttun | Kısa süre donar, gözleri maviye döner |

**Altıncı his (`senseRadius`):** Görüş konisinin *dışında* bile olsan, ~7 metre içindeyse ve aranızda duvar yoksa seni **hisseder** ve döner. Arkasından sinsice geçmek işe yaramaz.

**Adaptif hafıza:** Entity oyun boyunca seni profilleyip 0–10 arası bir *öğrenme skoru* biriktirir:
- Gezdiğin bölgelerin **ısı haritasını** çıkarır
- Son kaçış yönlerini hatırlar, **iz sürer**
- Skor 2'yi geçince **gideceğin yeri tahmin edip önünü keser**
- Ne kadar çok şişe fırlatırsan, **oltaya o kadar az gelir** (yem yoksayma şansı %65'e kadar çıkar)

### 👻 Sahte Entity (Halüsinasyon)

Gerçek Entity'nin yanında bir de **yarı saydam, yeşil ışıklı, süzülen** bir sahtesi var. Weeping Angel mantığıyla çalışır:

```
WANDERING  →  DECTED  →  CHARGING  →  GLITCH  →  kaybolur
 (dolaşır)   (bakınca   (bakmayı     (5 sn ekran
              DONAR)     bırakınca    glitch'i +
                         üstüne uçar) etrafında döner)
```

Ve en kötüsü: sahte Entity sana doğru uçarken gerçek Entity de aynı yöne hamle yapar — **iki taraftan birden** sıkışırsın. Bu kombo aktifken ışığı turuncu-kırmızıya döner.

### 🔦 Fener ve Şişeler

- **Fener (F):** Entity'nin yüzüne tutarsan onu sersemletirsin — ama şarj çubuğu dolana kadar tutman gerekir
- **Şişeler (G):** Yerden topla, uzağa fırlat, sesle Entity'yi başka yöne çek. Ama abartma — öğreniyor

### 📺 Entity Monitor — Gözlem Odası

`entity.html` ayrı bir sekmede açılan **CRT/yeşil fosfor tarzı gözlem ekranı**. `BroadcastChannel` üzerinden canlı telemetri alır: labirent radarı, Entity'nin anlık durumu, sahte Entity'nin durumu ve konumu. Oyunu ikinci bir ekranda izlemek için.

### 🎬 Ayrıca

- **Sinematik intro:** Karanlıkta uyanma, sönen fener, arkanda beliren Entity
- **Stamina sistemi:** Koşarken tükenir, tükenince nefes nefese kalırsın
- **Çömelme:** Daha sessiz ama daha yavaş — Entity'nin algı yarıçapı %40 düşer
- **Ruh sağlığı vinyeti**, VHS glitch efektleri, dinamik müzik geçişleri

## Kontroller

| Tuş | İşlev |
|-----|-------|
| `W` `A` `S` `D` | Hareket |
| `Shift` | Koş (stamina harcar) |
| `C` | Çömel |
| `Space` | Zıpla |
| `E` | Etkileşim (kapı aç, anahtar/şişe al) |
| `F` | Fener aç/kapa · Entity'ye tutunca sersemletir |
| `G` | Nişan al (basılı tut) → bırak: fırlat |
| `1` `2` `3` | Envanter slotu seç |
| `Esc` | Duraklat |

## Nasıl Çalıştırılır?

Oyun ES modülleri kullandığı için **`index.html`'i çift tıklayarak açmak çalışmaz** — yerel bir HTTP sunucusu gerekir.

```bash
git clone https://github.com/gmtr244/The-Entity-The-Caller.git
cd The-Entity-The-Caller

# Python ile (en kolay)
python3 -m http.server 8000
```

Sonra tarayıcıdan **http://localhost:8000** adresine git.

Gözlem ekranı için ikinci bir sekmede: **http://localhost:8000/entity.html**

<details>
<summary>Alternatif sunucular</summary>

```bash
npx serve          # Node.js
php -S localhost:8000   # PHP
```
VS Code kullanıyorsan **Live Server** eklentisi de yeterli.
</details>

**Gereken:** WebGL destekleyen güncel bir tarayıcı (Chrome / Firefox / Edge). Fare kilidi (Pointer Lock) için oyuna tıklaman gerekir.

## Proje Yapısı

```
├── index.html          # Oyun giriş noktası (menü + HUD + importmap)
├── script.js           # Ana oyun motoru (~2950 satır)
├── entity_logic.js     # Monitor ekranı mantığı + radar
├── entity.html         # Gözlem odası (ayrı sekme)
├── sounds.js           # Merkezî ses yönetimi
├── style.css           # Tüm arayüz ve efekt katmanları
├── js/
│   ├── three.module.js         # Three.js (gömülü, CDN'e bağımlılık yok)
│   ├── PointerLockControls.js  # Fare kilidi (özel düzeltmeli)
│   └── BufferGeometryUtils.js
├── system.md           # Entity AI teknik dokümantasyonu
├── CHANGELOG.md        # Sürüm değişiklik günlüğü
└── *.mp3 / *.webp      # Ses ve doku dosyaları
```

## Teknik Notlar

- **Bağımlılık yok, build adımı yok.** Three.js repoya gömülü, `importmap` ile çözülüyor
- Duvarlar `BufferGeometryUtils` ile **tek mesh'te birleştiriliyor** (draw call optimizasyonu)
- Pathfinding 2D grid üzerinde A\*, düzleştirilmiş waypoint listesi döndürüyor
- Ses dosyaları `createSafeAudio()` ile yükleniyor — eksik dosya oyunu çökertmiyor, uyarı verip geçiyor
- Entity ↔ Monitor haberleşmesi `BroadcastChannel('telemetry-hub')` üzerinden

Entity AI'nın satır satır dökümü için **[`system.md`](system.md)**, sürüm geçmişi için **[`CHANGELOG.md`](CHANGELOG.md)** dosyalarına bak.

## Bilinen Sorunlar

- Entity görünmezken bile scratch/proximity sesleri yaklaşık konumunu ele veriyor *(bilinçli tasarım)*
- `gameIntro.active` bloğu eski koddan kalma, hiç tetiklenmiyor — zararsız ama temizlenebilir

---

# 🇬🇧 English

## What Is It?

You wake up in a dark maze. You have a flashlight, and you are not alone.

**Your goal:** collect the **8 keys** scattered across the maze and escape through the exit door. But the moment you pick up the last key, the exit gets **sealed** — a countdown starts and you have to find another way out.

The thing hunting you is a learning AI. The more you run, the better it knows you.

## Core Systems

### 🧠 The Entity — A Hunter That Learns

The Entity runs on a 6-state **state machine** and navigates the maze with **A\* pathfinding**:

| State | Trigger | Behaviour |
|-------|---------|-----------|
| `PATROLLING` | Default | Wanders to random points, white light |
| `HUNTING` | It saw you | Charges at you, arms reaching forward, red light |
| `SEARCHING` | It lost you | Goes to your last known position, scans left-right, orange light |
| `AMBUSH` | Random + nearby + you're not looking | Freezes and waits — strikes when you get close |
| `FROZEN` | All 8 keys collected | Trembles in place, cannot attack |
| `STUNNED` | You shone the flashlight in its face | Freezes briefly, eyes turn blue |

**Sixth sense (`senseRadius`):** even *outside* its vision cone, if you're within ~7 metres with no wall between you, it **senses** you and turns around. Sneaking up behind it does not work.

**Adaptive memory:** the Entity profiles you during the run and builds a *learning score* from 0 to 10:
- Builds a **heatmap** of the areas you frequent
- Remembers your recent escape directions and **follows your trail**
- Past score 2, it **predicts where you're heading and cuts you off**
- The more bottles you throw, the **less it takes the bait** (ignore chance climbs to 65%)

### 👻 The Fake Entity (Hallucination)

Alongside the real one there's a **translucent, green-lit, floating** impostor. It works on Weeping Angel logic:

```
WANDERING  →  DECTED  →  CHARGING  →  GLITCH  →  vanishes
 (roams)     (FREEZES   (flies at    (5s of screen
              when you   you the      glitch while
              look)      moment you   orbiting you)
                         look away)
```

And the worst part: while the fake one charges you, the real Entity lunges in the same direction — you get **squeezed from both sides**. Its light turns orange-red when this combo is active.

### 🔦 Flashlight and Bottles

- **Flashlight (F):** hold it on the Entity's face to stun it — but you have to hold until the charge bar fills
- **Bottles (G):** pick them up, throw them far, lure the Entity away with the noise. Don't overdo it — it's learning

### 📺 Entity Monitor — The Observation Room

`entity.html` is a separate **CRT / green phosphor observation screen** you open in another tab. It receives live telemetry over `BroadcastChannel`: a maze radar, the Entity's current state, and the fake Entity's state and position. Made for watching the run on a second screen.

### 🎬 Also Included

- **Cinematic intro:** waking in the dark, the flashlight dying, the Entity appearing behind you
- **Stamina system:** drains as you sprint, leaves you winded when empty
- **Crouching:** quieter but slower — drops the Entity's detection radius by 40%
- **Sanity vignette**, VHS glitch effects, dynamic music transitions

## Controls

| Key | Action |
|-----|--------|
| `W` `A` `S` `D` | Move |
| `Shift` | Sprint (drains stamina) |
| `C` | Crouch |
| `Space` | Jump |
| `E` | Interact (open doors, pick up keys/bottles) |
| `F` | Toggle flashlight · stuns the Entity when held on it |
| `G` | Hold to aim → release to throw |
| `1` `2` `3` | Select inventory slot |
| `Esc` | Pause |

## Running It

The game uses ES modules, so **double-clicking `index.html` will not work** — you need a local HTTP server.

```bash
git clone https://github.com/gmtr244/The-Entity-The-Caller.git
cd The-Entity-The-Caller

# With Python (easiest)
python3 -m http.server 8000
```

Then open **http://localhost:8000** in your browser.

For the observation screen, open a second tab at **http://localhost:8000/entity.html**

<details>
<summary>Alternative servers</summary>

```bash
npx serve          # Node.js
php -S localhost:8000   # PHP
```
The VS Code **Live Server** extension works too.
</details>

**Requirements:** a modern WebGL-capable browser (Chrome / Firefox / Edge). You need to click into the game to engage Pointer Lock.

## Project Structure

```
├── index.html          # Game entry point (menu + HUD + importmap)
├── script.js           # Main game engine (~2950 lines)
├── entity_logic.js     # Monitor screen logic + radar
├── entity.html         # Observation room (separate tab)
├── sounds.js           # Centralised audio management
├── style.css           # All UI and effect layers
├── js/
│   ├── three.module.js         # Three.js (vendored, no CDN dependency)
│   ├── PointerLockControls.js  # Pointer lock (with custom fix)
│   └── BufferGeometryUtils.js
├── system.md           # Entity AI technical documentation
├── CHANGELOG.md        # Version changelog
└── *.mp3 / *.webp      # Audio and texture assets
```

## Technical Notes

- **No dependencies, no build step.** Three.js is vendored in the repo and resolved via `importmap`
- Walls are **merged into a single mesh** with `BufferGeometryUtils` (draw-call optimisation)
- Pathfinding is A\* on a 2D grid, returning a smoothed waypoint list
- Audio loads through `createSafeAudio()` — a missing file logs a warning instead of crashing the game
- Entity ↔ Monitor communication runs over `BroadcastChannel('telemetry-hub')`

See **[`system.md`](system.md)** for a line-by-line breakdown of the Entity AI, and **[`CHANGELOG.md`](CHANGELOG.md)** for version history. *(Both documents are written in Turkish.)*

## Known Issues

- Scratch/proximity sounds still hint at the Entity's rough position while it's invisible *(intentional design)*
- The `gameIntro.active` block is leftover code that never triggers — harmless, but could be cleaned up

---

## 📄 Lisans / License

Bu proje **GNU Affero General Public License v3.0** ile lisanslanmıştır.
This project is licensed under the **GNU Affero General Public License v3.0**.

Ayrıntılar için [`LICENSE`](LICENSE) dosyasına bakın. / See [`LICENSE`](LICENSE) for details.

<div align="center">
<sub>© 2026 — Entities Project · <a href="https://github.com/gmtr244">gmtr244</a></sub>
</div>
