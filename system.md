# Entity AI — Sistem Dokümantasyonu
## script.js · labirentV7_Remade

---

## 1. DURUM MAKİNESİ

Entity aşağıdaki 6 durumda olabilir:

| Durum        | Tetikleyici                                 | Davranış                                              |
|--------------|---------------------------------------------|-------------------------------------------------------|
| PATROLLING   | Varsayılan / arama bitti                    | Rastgele walkable tile'lara yürür                     |
| HUNTING      | `canEnemySeePlayer() = true`               | Oyuncuya/tahmin noktasına koşar, kol öne uzanır       |
| SEARCHING    | HUNTING → oyuncu kaçtı                      | Son bilinen konuma gider, kafa sol-sağ tarar          |
| AMBUSH       | Rastgele + yakın + oyuncu bakmıyor          | Dondurur, yaklaşınca/görünce HUNTING                  |
| FROZEN       | Tüm anahtarlar toplandı                     | Titreşerek yerinde kalır, saldıramaz                  |
| STUNNED      | Feneri yüzüne tutma (flaş)                 | Kısa süre donar, mavi gözler                          |

---

## 2. FONKSİYONLAR

### `canEnemySeePlayer(isSprinting)` — satır 1911
Entity'nin oyuncuyu görmesini 3 adımda hesaplar:
1. **Mesafe kontrolü**: Algılama yarıçapı + öğrenme bonusu + sprint bonusu
2. **Görüş açısı**: `forward = +Z direction` (quaternion'dan). Dot < 0.3 ve dist > 3m → görmez
3. **Raycast**: Duvar/kapı engeli var mı

**KRİTİK NOT (2026-06-16 düzeltmesi)**: Three.js'te **Group/Object3D** `lookAt()`
KAMERADAN FARKLI çalışır — kaynak `Object3D.lookAt` içinde non-camera için
argümanlar ters verilir (`_m1.lookAt(_target, _position, up)`), bu da **yerel +Z
eksenini doğrudan hedefe** çevirir. Modelin yüzü/gözleri/ışığı +Z'de olduğu için
düz `lookAt(oyuncu)` zaten yüzü oyuncuya döndürür — **flip GEREKMEZ.**
Önceki sürümde her lookAt'tan sonra eklenen `rotation.y += Math.PI` tam tersini
yapıyordu: yüzü oyuncudan 180° ters çeviriyordu → `forward(+Z)` uzağa bakıyor →
`dot < 0` → entity oyuncuyu **göremiyor/kovalayamıyordu** + sinematikte sırtını
dönüyordu. 3 flip de kaldırıldı (V7 davranışı). ✅

### `senseRadius` — altıncı his (2026-06-16 eklendi)
Görüş konisinin (FOV) DIŞINDA bile, oyuncu `senseRadius` (varsayılan 7m, sprint
+4m, çömelme ×0.6) içindeyse ve aralarında duvar yoksa entity oyuncuyu **hisseder**
→ dönüp kovalar. "Arkasına geçtiğimde beni fark etsin" davranışı.

### `isPlayerLookingAtEnemy(playerPos)` — satır 1950
Oyuncu entity'ye feneriyle bakıyor mu?
- Camera world direction vs entity direction
- dot > 0.8 (~37° koni)
- Raycast ile duvar engeli kontrolü

### `updateTheEntity(delta, playerPos, oldPlayerPos)` — satır 1967
Ana AI döngüsü, her frame çağrılır.

**Akış sırası:**
1. `cinematicPlaying` → erken çıkış (satır 1968)
2. `STUNNED` kontrolü (satır 1980)
3. `FROZEN` kontrolü + pozisyon kilidi (satır 1988)
4. `gameIntro.active` → eski intro bloğu (satır 2003) ← lookAt + PI fix eklendi (satır 2030)
5. VHS glitch yakınlık efekti (satır 2034)
6. Görünürlük/ışınlama yönetimi (satır 2040)
7. `canEnemySeePlayer` → HUNTING / SEARCHING geçişi (satır 2136)
8. AMBUSH tetikleyici (satır 2159) — `Math.random() < 0.01` / frame
9. Hedef ve hız seçimi per-state (satır 2164)
10. A* pathfinding hareketi + kapı açma (satır 2194)
11. `lookAt(target)` + `rotation.y += Math.PI` (satır 2224–2225) ← yön düzeltmesi
12. Kafa takibi / boyun pivot (satır 2228)
13. Göz rengi & yoğunluk (satır 2249)
14. Kol animasyonu (satır 2263)

### `setEntityVisibility(isVisible, playAudio)` — satır 1116
Entity görünür↔görünmez geçişi.
- `the_entity.mesh.visible = isVisible` → tüm mesh + eyeLight birlikte
- `visibilityTimer` resetlenir
- Ses: görünür → giggle, görünmez → tenseMusic

### `setNewPatrolTarget()` — aranacak
Rastgele walkable tile seçer, `PATROLLING` moduna geçer.

### `entityGetNextWaypoint(from, to, delta)` — önceki oturumlarda yazıldı
A* pathfinding. 2D grid üzerinde çalışır, düzleştirilmiş waypoint listesi döner.

---

## 3. KAFA TAKİBİ (neckPivot) — satır 2228

Gövde yönünü ayrı hesaplayan ayrı pivot. Gövde hedefe bakarken kafa oyuncuyu kırk-beş dereceye kadar takip eder.

| Durum       | Kafa hareketi                         |
|-------------|---------------------------------------|
| HUNTING     | Oyuncuya bak, ±65° sınır, lerp hız 6 |
| SEARCHING   | Sin dalgası ±55°, yavaş              |
| PATROLLING  | Hafif sallama ±10°                   |

**Formula** (satır 2235):
```
rel = atan2(player_dx, player_dz) - bodyYaw
```
PI flip'ten sonra `bodyYaw = atan2(target_dx, target_dz)` → formula doğru çalışır.

---

## 4. GÖZ / IŞIK SİSTEMİ

**2026-06-16: Ayrı göz mesh'leri KALDIRILDI** (V7 tarzı sade kafa seçildi). Kafa artık
düz soluk küre (`SphereGeometry(0.4)`, `0xcccccc`). Tehdit/renk tamamen yukarıdaki
`eyeLight` (tepe ışığı) ile veriliyor — aşağıdaki tablo o ışığın durum renklerini gösterir.

### eyeLight (SpotLight) — satır 245 · **V7 tarzı, 2026-06-16'da geri getirildi**
Artık öne bakan "far" DEĞİL — **kafanın üstünden aşağı gövdeye vuran** moody ışık (V6/V7 hissi).
- Pozisyon: `(0, 2.8, 0.35)` — kafanın üstü
- Hedef: `(0, 0.6, 0.05)` — aşağı, gövdeye doğru
- **enemyGroup'un** child'ı (kafanın değil) → kafa tarama hareketiyle sallanmaz
- Parlaklık duruma göre: av=3–5.5 titreşim · arama=2.5 · devriye=1.6 · pusu=0.35 · sersem=2
- Renk duruma göre: av=kırmızı · arama=turuncu · devriye=beyaz · pusu=koyu kırmızı · sersem=mavi

### AI zekâ iyileştirmeleri (2026-06-16)
- **Altıncı his** (`senseRadius`): arkadan/yandan yaklaşmayı hisseder → dönüp kovalar
- **Av ısrarı** (`huntGrace` 1.2sn): köşeye saklanınca anında kaybetmez
- **İz sürme**: arama hedefi = son görülen konum + kaçış yönünde +5 birim
- **Önünü kesme**: `score≥2`'den itibaren oyuncunun gideceği yeri tahmin eder
- **`chaseDuration` sıfırlanır**: av bitince hız sıfırlanır (sonsuz hızlanma bug'ı giderildi)
- **Pusu** kare-bağımsız (`0.3*delta`) — eski `0.01/kare` çok sık donduruyordu

---

## 5. SİNEMATİK AKIŞI — satır 1310

| Zaman (s) | Olay |
|-----------|------|
| 0 → 10    | Metin (4 satır × 2.5s), karanlık |
| 10 → 11.5 | Overlay fade-out |
| 11.5 → 16 | Oyuncu karanlıkta sağ-sol bakar |
| 16 → 16.6 | Fener çakmaya çalışıyor (flicker) |
| 16.6 → 18 | Fener tamamen söndü, karanlık |
| 16.8 → 18.5 | Oyuncu 180° arkasına döner |
| t = 18    | Entity arkada belirir + **fener + entity ışığı açılır** |
| Entity koşar | eyeLight pulse (kırmızı), fener 1.5 |
| dist < 3.5 | Entity kaybolur → **fener söner** |
| +0.5s     | `_endCinematic` → **fener tekrar açılır**, HUD görünür |

---

## 6. DÜZELTILEN SORUNLAR

| # | Sorun | Sebep | Düzeltme | Satır |
|---|-------|-------|----------|-------|
| 1 | ~~Entity oyuncuya bakamıyor~~ → **PI flip'in kendisi bug'mış** | Group.lookAt zaten +Z'yi hedefe çevirir; eklenen `rotation.y += Math.PI` yüzü TERS çevirdi → göremiyor/kovalamıyor | 3 flip de KALDIRILDI (gövde, intro, sinematik) | 2242, 2046, 1427 |
| 2 | Sinematikte entity gelio ama bakmıo | Aynı PI flip sinematik koşu bloğunda | Flip kaldırıldı → oyuncuya dönük gelir (fenerle yüzü görülür) | 1427 |
| 3 | Arkadan yaklaşınca fark etmiyor | FOV dışı sadece <3m hissediyordu | `senseRadius` (7m, sprint+4, çömelme×0.6) + LOS | 1937 |
| 4 | Spotlight entity'nin arkasına vuruyordu | Target -Z yönündeydi | Position `(0,0.05,0.15)`, target `(0,-0.3,8)` | 245-246 |
| 5 | Kafa başta siyah görünüyordu | Sadece color, emissive yoktu, ortam ışığı çok az | `emissive: 0x444444, emissiveIntensity: 0.06` | 229 |
| 6 | Sinematik entity ışığı kapalıydı | `updateTheEntity` sinematik sırasında çalışmıyor | entity belirlince `eyeLight.intensity = 5` | ~1391 |
| 7 | Sinematik fener zamanlaması yanlış | Fener t=11.5'te açılıyordu | Entity gelirken açılır, kaybolunca kapanır | ~1341 |
| 8 | Tüm input sinematik sırasında bloke değildi | keydown/keyup handler'ları filtre yoktu | `if (cinematicPlaying) return;` eklendi | 713,722 |
| 9 | Fare sinematik sırasında kamerayı oynatıyordu | `PointerLockControls.js` `enabled` kontrolü yoktu | `onMouseMove`'a `if (!scope.enabled) return` | PLControls:42 |

---

## 7. BİLİNEN SORUNLAR / İZLEME

| Sorun | Detay |
|-------|-------|
| AMBUSH çok sık | `Math.random() < 0.01` per frame → 60fps'de ~36x/dk. Delta ile normalize edilmeli: `Math.random() < 0.001 * delta * 60` |
| gameIntro aktif değil | `gameIntro.active` hiçbir zaman `true` set edilmiyor (eski kod). Blok zararsız ama temizlenebilir |
| Görünmezken entity konumu belli | Scratch sesi + proximity sounds entity'nin yaklaşık konumunu veriyor (intentional) |
