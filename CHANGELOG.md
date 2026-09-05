# Entities: The Caller — V7 Değişiklik Günlüğü

## Sahte Entity (Hallucination) Sistemi

### Görsel Yenileme
- **Şeffaf Malzeme**: Gövde, kafa ve kollar artık `opacity: 0.4` ile yarı-saydam. İçinden geçiyormuş gibi duruyor — gerçek entity ile karıştırılmaması için bilerek farklı hissettiriyor.
- **Eğik Kafa**: Sahte entity'nin kafası `rotation.z = 0.15` ile hafif sağa yatık. Doğal olmayan, huzursuz edici bir duruş.
- **Yeşil Dim Işık**: Kafadan aşağı vuran `SpotLight(0x00ff44, intensity: 1.5, distance: 8)`. Gerçek entity'nin kırmızı/beyaz ışığıyla karışmaz.
- **Süzülme**: Sahte entity yere inmez, `y = 1.6`'da süzülerek hareket eder. Yere değme efekti kaldırıldı.
- **Custom Kol Fonksiyonu**: `_makeArmCustom(side, mat)` ile kendi malzemesini alan yeni bir kol üreticisi eklendi.

### Yeni Davranış Akışı

```
WANDERING → DECTED → CHARGING → GLITCH → KAYBOL
```

1. **WANDERING**: Sahte entity labirentte rastgele dolaşır (hız: 1.5x). Oyuncuya baktığını görür ve bakış hattında duvar yoksa→ bir sonraki adıma geçer.

2. **DECTED** (yeni durum): Oyuncu sahte entity'ye bakıyorsa → **DON**. Weeping Angel mekaniği gibi hareket etmez. Oyuncu bakmayı bıraktığı an → CHARGING'e geçer. Bu geçiş anında fakeEntitySound çalar.

3. **CHARGING**: Sahte entity oyuncuya doğru uçar (hız: 13.5x — eskisinden %50 daha hızlı). Oyuncu tekrar bakarsa DECTED'e geri döner. 2.0 birim yaklaştığında → GLITCH.

4. **GLITCH** (5 saniye): Sahte entity oyuncunun etrafında hızlıca döner (orbit efekti). Ekranda VHS glitch efekti aktif olur. 5 saniye sonra sahte entity kaybolur.

### Timer & Skor
- **Bekleme süresi**: `25 + Math.random() * 20` saniye (eskisi 45-75 arası)
- **Skor bonusu**: Her avlanma puanı +1.5 saniye kısaltır bekleme süresini. Entity ne kadar çok avlanırsa sahte entity o kadar sık gelir.

### Entity Kombosu
Sahte entity CHARGING durumdayken ve gerçek entity HUNTING değilken:
- Gerçek entity de sahte entity'nin charging yönüne doğru hamle yapar
- Hız: `huntSpeed * 1.2` (veya invisibleFollowSpeed * 1.2)
- Işık rengi turuncu-kırmızıya döner → kombonun aktif olduğunu gösterir

Oyuncu iki taraftan birden saldırıya uğrar, strateji değiştirmek zorunda kalır.

---

## Gerçek Entity Değişiklikleri

### Pusu (Ambush) Mekaniği
| Parametre | Eski | Yeni |
|-----------|------|------|
| Tetikleme oranı | `0.3 * delta` (~0.3/sn) | `0.12 * delta` (~0.12/sn) |
| Cooldown | 60 saniye | 90 saniye |

Artık pusu daha az tetikleniyor ve bir pustan sonra daha uzun bekliyor. Oyuncuya daha adil bir tempoyla yaklaşma fırsatı tanır.

### Pathfinding Düzeltmeleri
- **Takılma eşiği**: `1.5` → `2.0` saniye. Entity'nin daha uzun süre takılmasına izin verilir, böylece A* yolu daha iyi yeniden hesaplanabilir.
- **Rastgele komşuya ışınlanma**: Takılma tespit edildiğinde entity, rastgele bir walkable komşu tile'a ışınlanır. Ping-pong sorununu engeller — entity aynı iki tile arasında gidip gelmez.
- **Yeniden hesaplama**: Takılınca `pf.path = []` yapılır ve sonraki frame'de A* yeniden hesaplanır.

---

## Telemetri (Monitor Entegrasyonu)

### Yeni Veri Alanları
```javascript
fakeEntity: {
    pos: Vector3,    // Sahte entity'nin pozisyonu
    state: string    // WANDERING | DECTED | CHARGING | GLITCH
}
```

Bu veri `BroadcastChannel('telemetry-hub')` üzerinden entity_logic.js'e gönderilir. Monitor ekranında (radar + `#fake-entity-state` paneli) sahte entity'nin durumu ve konumu gösterilir.

---

## Teknik Detaylar

### Kullanılan Fonksiyonlar
- `isPlayerLookingAtFakeEntity(playerPos)`: Oyuncunun sahte entity'ye bakıp bakmadığını kontrol eder (41° koni, 20m yarıçap, raycasting ile duvar kontrolü)
- `_makeArmCustom(side, mat)`: Custom malzeme ile kol oluşturan yardımcı fonksiyon
- `hallucinationManager.chargeDirection`: Charging yönünü saklayan vektör, entity kombosu için kullanılır

### Dosyalar
| Dosya | Değişiklik |
|-------|-----------|
| `script.js` | Sahte entity sistemi, pusu, pathfinding, telemetri |
| `entity_logic.js` | (Önceki session'da yapıldı — monitor ekranı) |
| `entity.html` | (Önceki session'da yapıldı — importmap düzeltildi) |

---

## Hata Düzeltmeleri (Bug Fix Session)

### Entity Takılma Sorunu (Pathfinding)
**Sorun**: Entity, özellikle HUNTING tahmini (`getPredictedPlayerPos`), SEARCHING iz sürme ve sahte entity kombosu sırasında sık sık duvara "yapışıp" takılıyordu.

**Kök neden**: Bu üç hedef üretme yeri, hedef hücrenin yürünebilir olup olmadığını hiç kontrol etmiyordu. Hedef bir duvar hücresine denk geldiğinde `findPathAStar` anında `null` dönüyor, `entityGetNextWaypoint` da yol bulamayınca duvarları hiç hesaba katmadan hedefe "kuş uçuşu" bir waypoint döndürüyordu (`script.js` — eski `entityGetNextWaypoint`). Entity bu yöne yürüyüp collision'a takılıyor, 2 saniyelik stuck-timer devreye girene kadar duvarda "donmuş" gibi görünüyordu.

**Düzeltme** (`script.js`):
- `_pfNearestWalkable(cx, cz)`: hedef hücre duvarsa halka halka tarayarak en yakın yürünebilir hücreyi bulan yeni yardımcı fonksiyon.
- `findPathAStar()`: artık hedef duvarsa pes etmeden önce bu fonksiyonla en yakın yürünebilir hücreye "yapıştırıyor" — HUNTING tahmini, SEARCHING iz sürme ve kombo hedefleri artık neredeyse her zaman geçerli bir yol buluyor.
- `entityGetNextWaypoint()`: A* gerçekten yol bulamazsa (nadir, tamamen ulaşılamaz hedef) artık kör düz çizgiyle hedefe (`targetPos`) yürümek yerine `pf.pathFailed` bayrağıyla entity'nin olduğu yerde beklemesi sağlanıyor.

### Monitor'da Sahte Entity Eksikliği
**Sorun**: `script.js` sahte entity'nin pozisyon/durumunu telemetri ile gönderiyordu ama `entity_logic.js` bu veriyi hiç okumuyordu — monitor ekranında sahte entity hiç görünmüyordu.

**Düzeltme**:
- `entity_logic.js` → `drawRadar()`: sahte entity artık radar'da yeşil bir nokta olarak çiziliyor (aktifken).
- `entity_logic.js` → `updateMonitor()`: yeni `#fake-entity-state` paneli sahte entity'nin durumunu (WANDERING/DECTED/CHARGING/GLITCH) ve konumunu yazıyor.
- `entity.html`: `#fake-entity-state` div'i eklendi.

### Ölü Kod Temizliği
`hallucinationManager.lastFakeState` ve `pauseTimer` alanları set ediliyordu ama hiçbir mantıkta okunmuyordu (state geçişi hiç tespit edilmiyordu). İkisi de kaldırıldı.

### Dokümantasyon Düzeltmesi
Bu dosyada telemetri kanalının adı yanlışlıkla `'telemetri-hub'` (Türkçe yazım) olarak geçiyordu; kodda her iki dosyada da tutarlı şekilde kullanılan gerçek isim `'telemetry-hub'` olarak düzeltildi.

---

## Hata Düzeltmeleri (Session 2 — Entity Bozulmaları + Konsol/HUD Hataları)

### Entity Normal Gezinirken (PATROLLING) Kilitli Kapıda Takılıyor
**Sorun**: Kullanıcı belirtti: entity aslında hiç "sıkışmıyor" hissi vermeden, normal haritada gezinirken bile takılıp ışınlanıyordu — yani teleport-fix'in hedeflediği "gerçekten sıkışmış" senaryosundan önce, entity zaten kilitli bir kapıda tıkanıp kalıyordu.

**Kök neden**: Kapı açma kontrolü (`updateTheEntity`, hareket bloğu) entity'nin **bir sonraki waypoint'e yöneldiği yönde** bir raycast atıp önündeki kapıyı buluyordu. Ama waypoint ilerleme mantığı (`entityGetNextWaypoint`), entity mevcut waypoint'e (kapının hücresi olabilir) sadece **1.8 birim kala** bir sonraki waypoint'e geçiyor ("corner-cut" — köşede erken dönüş, akıcı hareket için). Kapının hemen ardından bir dönüş varsa, entity kapıya fiilen ulaşmadan ondan SONRAKİ hücreye yönelmeye başlıyor — yani raycast artık kapıdan değil, dönüşün ötesinden geçiyor, kapıyı **ıskalıyor**, kapı hiç açılmıyor ve entity kapalı kapıya çarpıp tıkanıyordu. Patrol hedefleri haritada tamamen rastgele/uzak seçildiği için (`setNewPatrolTarget`), uzun rotalar çok daha fazla kapıdan geçiyor — bu yüzden sorun en çok normal gezinme sırasında fark ediliyordu (hunting'de mesafe genelde kısa, daha az kapı).

**Düzeltme** (`script.js` → `updateTheEntity`, hareket bloğu): Yön bazlı raycast yerine **mesafe bazlı** kontrol — entity'ye 3 birimden yakın, kapalı ve çıkış olmayan HERHANGİ bir kapı artık yönden bağımsız olarak açılıyor. Böylece entity kapıya tam bakmasa bile (köşe kesme yüzünden) kapı zamanında açılıyor ve entity hiç tıkanmadan normal şekilde yoluna devam ediyor.

### Entity "Atlıyor / Geri Gidiyor" (Monitor'de Gözlemlendi)
**Sorun**: Gerçek entity (sahte entity değil), monitor ekranından izlenirken zaman zaman aniden sıçrıyor/geri gidiyormuş gibi görünüyordu.

**Kök neden**: `entityGetNextWaypoint()` içindeki "takılma tespiti" mekanizması, entity 2 saniye boyunca 0.05 birimden az hareket ederse onu **tamamen rastgele** bir komşu hücreye (4 birim) ışınlıyordu — hiç ses/görsel ipucu olmadan. Yön rastgele olduğu için oyuncuya göre "geri gidiyor" gibi görünebiliyordu; sessiz olduğu için de bir "bug" gibi okunuyordu (dosyadaki diğer tüm ışınlanmalar — director AI, ambush, reveal — ya sesli ya da açıkça kurgulanmış mekanikler).

**Düzeltme** (`script.js` → `entityGetNextWaypoint`): Işınlanacak komşu artık rastgele değil, **mevcut hedefe en yakın olan** komşu seçiliyor (her zaman "ileri" sıçrar) ve ışınlanma anında `behindSound` çalınıyor (diğer ışınlanmalarla tutarlı olsun diye).

### Entity "Tutarsız State" (Aynı Karede HUNTING → AMBUSH)
**Sorun**: Entity bazen avlamaya başlar başlamaz aniden kayboluyordu.

**Kök neden**: `updateTheEntity()` fonksiyonu başında `isHunting` bir kere hesaplanıp (`const isHunting = the_entity.state === 'HUNTING'`) fonksiyon boyunca kullanılıyordu. Ama `the_entity.state` aynı fonksiyon içinde (görüş kontrolüyle) `'HUNTING'`'e çevrilebiliyordu — pusu kontrolü (`canAmbush`) ve kol animasyonu ise hâlâ **bayat** `isHunting` değerini okuyordu. Sonuç: entity bu karede yeni HUNTING'e geçmiş olsa bile, pusu şartları tutarsa aynı karede anında AMBUSH'a düşüp gizleniyordu.

**Düzeltme** (`script.js` → `updateTheEntity`): Görüş/state-geçiş bloğundan hemen sonra taze `isHuntingNow` değişkeni hesaplanıyor ve `canAmbush` ile kol animasyonu bu taze değeri kullanıyor.

### Konsol Hataları
- **`favicon.ico` 404**: `index.html`'e mevcut `scare.png` favicon olarak eklendi.
- **"Uncaught (in promise) SecurityError"**: `PointerLockControls.lock()` içeride `requestPointerLock()`'un döndürdüğü promise'i hiç yakalamıyor (bu, three.js'in resmi kütüphanesinde de böyle — kütüphaneye dokunulmadı). `script.js`'e `requestPointerLockSafe()` yardımcı fonksiyonu eklendi; `controls.domElement.requestPointerLock()`'u doğrudan çağırıp promise'i yakalıyor. `startButton` ve `pauseScreen` tıklama handler'ları artık bunu kullanıyor.

### Görsel Hata: Crosshair Zamanlaması (Tam Ters Çalışıyordu)
**Sorun**: Crosshair, giriş sinematiği metni sırasında görünüyor, "8 Anahtarı Topla" tostu çıkarken kayboluyordu — olması gerekenin tam tersi.

**Kök neden — iki parçalı**:
1. `controls.addEventListener('lock', ...)` handler'ı, `cinematicPlaying` kontrolü yapmadan pointer lock alınır alınmaz crosshair'i gösteriyordu (sinematik daha yeni başlarken).
2. `setHudVisible(true)` (sinematik bitince `_endCinematic()` içinde çağrılıyor) crosshair'in `style.display`'ini `''` yapıyordu; ama `.crosshair`'in CSS varsayılanı `display:none` olduğu için `''` onu GİZLİYORDU, göstermiyordu.

**Düzeltme**: `lock` handler artık crosshair'i sadece `!cinematicPlaying` iken gösteriyor; `setHudVisible()` crosshair için `''` yerine açıkça `'block'`/`'none'` kullanıyor.

---

## Hata Düzeltmeleri (Session 3 — Sahte Entity Kapı Çarpışma Hatası)

### Sahte Entity Kapılardan Rastgele Geçiyor / Kapıya Yapışıp Kalıyordu
**Sorun**: Kullanıcı bildirdi — hem ana oyun penceresinde hem monitör ekranında entity "garip hareket ediyor" ve zaman zaman "hiç hareket etmiyor / takılıyor" gibi görünüyordu. Bozulma, monitör + sahte entity + entity güncellemesinin yapıldığı oturumdan sonra ortaya çıktı.

**Kök neden** (`script.js` → `checkCollision`): Kapı çarpışma kontrolündeki "görünmez entity kapıdan geçer" satırı (`if (!isPlayer && !the_entity.isVisible) continue;`) **her zaman gerçek entity'nin (`the_entity`) görünürlük bayrağını** okuyordu — çağıranın kim olduğuna bakmaksızın. Sahte entity (hallucination) de hareket ederken aynı `checkCollision(pos, hitbox)` fonksiyonunu `isPlayer=false` ile çağırıyor, dolayısıyla:
- Gerçek entity görünmezken → sahte entity de (kendisiyle hiç ilgisi olmadığı halde) kapalı kapılardan **hayalet gibi geçiyordu** ("garip hareket").
- Gerçek entity görünürken → kapı kontrolü normal çalışıyordu, ama sahte entity'nin (gerçek entity'nin aksine) yakın kapıyı **açma mantığı hiç yoktu** — düz çizgiyle hareket ettiği için kapalı bir kapıya denk gelince ona yapışıp kalıyordu ("takılıyor").

**Düzeltme**:
- `checkCollision(position, hitbox, isPlayer, phaseDoors)`: yeni açık `phaseDoors` parametresi eklendi (varsayılan `false`). Kapı-geçme davranışı artık çağıranın kendi durumuna bağlı, gizli global `the_entity.isVisible` okumuyor.
- Gerçek entity'nin 3 hareket noktası (cinematic kovalama, intro, ana `updateTheEntity` hareketi) artık `phaseDoors` için açıkça `!the_entity.isVisible` gönderiyor — eski davranış birebir korundu.
- Sahte entity'nin çağrıları `phaseDoors` göndermiyor (varsayılan `false`) → artık asla kapıdan hayalet gibi geçmiyor.
- `updateHallucinations()`'a, WANDERING/CHARGING sırasında 3 birim yakınındaki kapalı-olmayan-çıkış kapıları açan bir blok eklendi (gerçek entity'nin kapı açma mantığıyla aynı desen) — böylece sahte entity artık kapıya yapışıp kalmıyor, gerçek entity gibi kapıyı açıp geçiyor.

### Gerçek Entity A* Başarısız Olunca Tamamen Donuyordu (Asıl "Takılma" Sebebi)
**Sorun**: Yukarıdaki kapı düzeltmesinden sonra bile takılma hem ana oyunda hem monitörde devam etti. Kullanıcı orijinal projeyi (`labirentV7_Remade`, A*'sız değil — o da A* kullanıyor ama farklı bir fallback ile) referans gösterdi: orijinalde entity hiçbir zaman tamamen donmuyor.

**Kök neden** (`script.js` → `entityGetNextWaypoint`): Önceki oturumda (Session 2) A* yol bulamadığında ("hedef tamamen ulaşılamaz") entity'nin duvara doğru kör yürümesini önlemek için `pf.pathFailed` bayrağı eklenmiş ve yol bulunamadığında `return entityPos.clone()` (yani "olduğun yerde kal") yapılmıştı. Ama `findPathAStar` sadece hedef gerçekten ulaşılamaz olduğunda değil, **arama 350 iterasyonda bitmediğinde de** (büyük labirentte uzak/karmaşık bir hedefe — özellikle canlı oyuncu pozisyonunu hedefleyen HUNTING/SEARCHING/kombo sırasında) `null` dönüyordu. Bu durumda `dirToWp.length()` sıfıra çok yakın oluyor, hareket bloğu (kapı açma dahil) hiç çalışmıyor ve entity bir sonraki yeniden hesaplamaya kadar (en fazla 1.2 sn, ama hedef sürekli hareket ediyorsa tekrar tekrar başarısız olup süresiz donabiliyordu) **tamamen hareketsiz** kalıyordu. Orijinal projede bu bayrak hiç yoktu — yol bulunamadığında her zaman hedefe doğru düz çizgiyle yürümeye devam ediyordu (collision onu durdursa bile en azından dener/duvarda kayar, asla donmuyordu).

**Düzeltme** (`script.js` → `entityGetNextWaypoint`): `pf.pathFailed` bayrağı ve "olduğun yerde kal" dalı tamamen kaldırıldı; orijinaldeki gibi yol bulunamadığında her zaman `targetPos.clone()` döndürülüyor — entity artık A* başarısız olsa bile hedefe doğru hareket etmeyi denemeye devam ediyor, hiçbir koşulda tamamen donmuyor. `entityPathfinding` başlangıç objesindeki kullanılmayan `pathFailed: false` alanı da temizlendi.

---

## Session 4 — script.js Orijinalden Yeniden İnşa Edildi

**Durum**: Yukarıdaki iki düzeltmeden sonra bile "takılma" hem ana oyunda hem monitörde sürmesi üzerine kullanıcı `script.js` + `style.css` + `sounds.js`'i doğrudan orijinal V7 projesinden (`labirentV7_Remade`) kopyalayıp üzerine yazdı — yani tüm V7 sahte-entity geliştirmeleri (DECTED/GLITCH, entity kombosu, pusu/pathfinding ayarları, genişletilmiş telemetri, opaklık/görsel farklar) `script.js`'ten silindi, oyun tekrar temiz/orijinal haline döndü. Ama `entity.html`, `entity_logic.js` ve bu CHANGELOG hâlâ yeni özellik setini bekliyordu — üç dosya birbirini tutmuyordu.

**Yapılan iş**: Kullanıcının talimatıyla, bu temiz orijinal `script.js` üzerine V7 özellik seti **sıfırdan, dikkatle** yeniden kuruldu — bu sefer daha önceki oturumlarda bulunan iki gerçek hatayı (kapı çarpışması + A* donma) **hiç eklemeden**:

- **Sahte entity görseli**: yarı-saydam (`opacity:0.4`) gövde/kafa/kol malzemeleri, `rotation.z=0.15` eğik kafa, `SpotLight(0x00ff44)` yeşil ışık, `y=1.6` süzülme (yere değmiyor), malzeme parametresi alan `_makeArmCustom(side, mat)`.
- **Yeni davranış akışı**: `WANDERING → DECTED → CHARGING → GLITCH` — yeni `isPlayerLookingAtFakeEntity()` fonksiyonu ile "oyuncu bakıyorsa don, bakmayı bırakınca uç" (weeping-angel) mekaniği; GLITCH'te oyuncu etrafında 5sn orbit + `glitch-active` CSS sınıfı; charge hızı 13.5 (eskisinden %50 hızlı); bekleme süresi `25 + rand()*20` sn, her avlanma puanı bunu 1.5sn kısaltıyor.
- **Sahte entity kapı açma**: WANDERING/CHARGING sırasında 3 birim yakınındaki kapıları açıyor (Session 3'teki takılma-önleme mantığı).
- **`checkCollision` phaseDoors düzeltmesi**: Session 3'te bulunan "sahte entity, gerçek entity'nin görünürlüğüne göre kapıdan geçiyor/takılıyor" hatası bu sefer en baştan doğru kuruldu (orijinalde de aynı gizli hata vardı, o da düzeltildi).
- **Pathfinding**: `_pfNearestWalkable` ile hedef-hücre duvarsa en yakın yürünebilir hücreye yapıştırma; takılma tespitinde rastgele değil **en yakın komşuya** (hedefe göre, `behindSound` ile) ışınlanma; **donma dalı eklenmedi** — yol bulunamazsa orijinaldeki gibi her zaman hedefe doğru yürümeye devam ediyor.
- **Kapı açma (gerçek entity)**: yön bazlı raycast yerine mesafe bazlı (3 birim) kontrol — corner-cut nedeniyle kapıyı ıskalayıp tıkanma sorunu önlendi.
- **`isHuntingNow`**: pusu kontrolü ve kol animasyonu artık aynı karede HUNTING'e geçişi kaçırmıyor (bayat `isHunting` yerine taze durum).
- **Pusu ayarı**: tetikleme oranı `0.3*delta` → `0.12*delta`, cooldown `60sn` → `90sn`.
- **Entity kombosu**: sahte entity CHARGING'deyken gerçek entity de o yöne hamle yapıyor — **AMBUSH durumu hariç tutuldu** (yoksa pusunun "oyuncu bakınca don" mekaniğini ezip bozardı — bu, önceki V7 sürümünde olmayan bir iyileştirme).
- **Telemetri**: `walkPhase`, `isStunned`, `neckRotY`, kol/dirsek rotasyonları, `isVisible`, göz ışığı rengi/yoğunluğu, oyuncu `isSprinting/isCrouching/flashlightOn/activeSlot/stamina`, ve `fakeEntity: {pos, state}` alanları eklendi — `entity_logic.js`'in beklediği tüm alanlar artık gönderiliyor.
- **Konsol hataları**: `requestPointerLockSafe()` eklendi (promise rejection yakalanıyor); `setHudVisible()` crosshair için `''` yerine `'block'`/`'none'`; `lock` handler'ı crosshair'i sadece `!cinematicPlaying` iken gösteriyor.

---

## Session 5 — "İlerleyemiyor / Geri Gidiyor" — Takılmanın Asıl Kaynağı

**Sorun**: Session 4'teki tam yeniden inşadan sonra bile entity "gidemiyor, giderken geri gidiyor" gibi davranmaya devam etti — düz, engelsiz yürüyüş sırasında bile.

**Kök neden** (`script.js` → `entityGetNextWaypoint`, takılma tespiti): Sayaç, entity'nin **son BİR FRAME'de** ne kadar yol aldığını 0.05 birimlik sabit bir eşikle karşılaştırıyordu (`pf.lastPos` her frame güncelleniyordu). Ama normal PATROLLING hızında (1.5 birim/sn) 60 FPS'te bir frame'de alınan yol ~0.025 birim — yani **eşiğin altında**. Sonuç: entity dümdüz, hiç engelsiz yürürken bile her frame "hareket etmemiş" sayılıyor, takılma sayacı sürekli birikip her ~2 saniyede bir en yakın komşu hücreye **ışınlanıyordu** — bu da akıcı ilerleyişi kesip "geri sıçrama" hissi veriyordu. Orijinalde de aynı 0.05/frame hatası var ama orijinal takılınca sadece yolu sıfırlıyordu (pozisyonu **ışınlamıyordu**), o yüzden bu gizli hata görünmüyordu; V7'nin gerçek ışınlama özelliğini (Session 2/4) geri koyunca aktif hale geldi.

**Düzeltme**: Takılma tespiti artık frame-to-frame değil, sayaç sıfırlandığından beri **BİRİKEN** mesafeyi ölçüyor — referans pozisyon (`pf.stuckCheckPos`) sadece entity 0.3 birimden fazla ilerlediğinde (ya da bir ışınlanmadan hemen sonra) güncelleniyor. 2 saniyelik pencerede normal hızda kat edilen mesafe (~3 birim) bu eşiği rahatça geçtiği için artık yalnızca GERÇEKTEN sıkışan entity ışınlanıyor. Kullanılmayan `pf.lastPos` alanı `stuckCheckPos` ile değiştirildi.

**Doğrulama**: `node --check` ile her iki dosya sözdizimi temiz; headless Chromium ile `index.html`/`entity.html` konsol hatasız yükleniyor; başlat butonuna tıklayıp ~16 saniyelik giriş sinematiği boyunca (entity hareketi, halüsinasyon sayacı, telemetri dahil) hata gözlenmedi.

---

## Session 6 — Mod/State Denetimi + Sahte Entity Bakış Mekaniği + A* Dolaşma

Kullanıcı gerçek tarayıcıda test ederken "entity'nin modlarına göre davranışları bozuk" dedi. Tam bir state-machine denetimi yapıldı (9 somut bulgu) ve iki yeni davranış talebi karşılandı. Kapsam planlandı ve onaylandı (`Alien: Isolation` tarzı genel AI ince ayarı — "Faz 6" — kullanıcının isteğiyle bu oturuma dahil edilmedi, ayrıca konuşulacak).

### Kök neden: HUNTING'e giren 3 ayrı yerden yalnızca biri gerekli alanları kuruyordu
**Sorun**: `the_entity.state = 'HUNTING'` üç farklı yerde elle set ediliyordu (normal görüş, pusu yakalaması, kaçış sekansı sonu) ama sadece normal görüş geçişi `huntGrace`/`lastKnownPlayerPosition`/`searchTimer`/`entityMemory.wasHunting` alanlarının hepsini kuruyordu. Sonuç: (a) pusu yakalamasından hemen sonra görüş kontrolü başarısız olursa entity bir kare içinde sessizce SEARCHING'e geri düşüyor VE bu yakalama öğrenen AI'a (`entityMemory`) hiç işlenmiyordu; (b) kaçış sekansının sonunda "canavar hızlanıp serbest kalır" finali neredeyse hiç gerçekleşmiyordu — aynı sebepten HUNTING anında SEARCHING'e düşüyordu.

**Düzeltme** (`script.js`): Ortak `enterHunting(playerPos, opts)` yardımcı fonksiyonu eklendi, alanların hepsini birlikte kuruyor. 3 çağrı noktası (normal görüş, pusu yakalaması, kaçış serbest bırakma) buna yönlendirildi. Ayrıca HUNTING hedef atamasına `|| playerPos.clone()` null-guard eklendi (SEARCHING dalında zaten vardı) — erken oyunda bir pusu yakalaması + hemen ardından görüş kaybı `target=null` → `findPathAStar` çökmesi → render loop'un tamamen donması riskini kapatıyor.

### Diğer tutarsızlıklar
- `distractEntity()`: pusu (AMBUSH) sırasında artık şişe atılarak bozulamıyor (kombo bloğunun zaten koruduğu gibi tutarlı hale getirildi).
- Şişe sersemletme çarpışması artık `the_entity.isVisible` şartına bağlı — daha önce görünmez/pusudaki entity kör atışla sersemletilebiliyordu, fener-tabanlı sersemletmenin "görmeden etkileşemezsin" ilkesini deliyordu.
- `onAllKeysCollected()` hallüsinasyonu zorla kapatırken artık `state`'i de `'IDLE'`'a, `detectionTimer`'ı sıfıra ve sahte entity'nin path'ini boşa çekiyor (önceden `isActive=false` iken `state` eski değerde kalıyordu — latent tutarsızlık).
- Entity kombosu (`isComboActive`) aktifken artık gövde/kollar bayat `lastKnownPlayerPosition`'a değil, canlı kombo hedefine bakıyor ve hızlı koşu animasyonu oynatıyor — önceden ayaklar bir yöne yürürken gövde başka yöne bakıp yavaş yürüyüş animasyonu oynatıyordu.

### Bakışa dayalı ani geçişlere tolerans (debounce)
**Sorun**: Hem gerçek entity'nin AMBUSH "bakılınca don" kontrolü hem sahte entity'nin DECTED kontrolü, kamera bakış konisi sınırındaki ufak titreşimlerde bile tek karede anlık flip yapıyordu (DON↔UÇ). AMBUSH'ın giriş şartı (`canAmbush`, duvar kontrollü ~37° koni) ile iç kontrolü (`_playerLooking`, duvar kontrolsüz ~63° koni) de tutarsızdı.

**Düzeltme**: Ortak `isPlayerLookingAtPoint(playerPos, targetPos, cosThreshold, checkWalls)` ve `updateSmoothedLook(obj, rawValue, delta)` (≈0.18sn histerezis) eklendi. AMBUSH artık giriş şartıyla aynı koni+duvar kontrolünü kullanıyor ve histerezisli. Sahte entity'nin bakış kontrolü de aynı histerezisi kullanıyor.

### Sahte entity artık gerçek entity gibi A* ile dolaşıyor
**İstek**: WANDERING düz-çizgi kayma yerine gerçek entity'nin pathfinding'ini kullanmalı.

**Değişiklik**: `entityGetNextWaypoint` artık bir `pf` parametresi alıyor (varsayılan `entityPathfinding`, geriye dönük uyumlu). Sahte entity için ayrı `fakeEntityPathfinding` state objesi eklendi. WANDERING hareketi bu ortak fonksiyona geçti — artık duvarların etrafından düzgün yol buluyor, önceden olduğu gibi sürtünmüyor. CHARGING kasıtlı olarak düz-çizgi kaldı (kaçınılmaz hamle hissi için). Sahte entity'nin kendi takılma-kurtarma ışınlanması sessiz (`behindSound` çalmıyor) — gerçek entity'nin "yaklaşıyor" sinyaliyle karışmasın diye.

### Sahte entity: 5 saniyelik kesintisiz bakış mekaniği
**İstek**: DECTED'de bakışı bir an kesince anlık CHARGING'e geçmesin; oyuncu 5 saniye kesintisiz bakarsa "yakalama" tamamlanıp saldırıya geçsin, 5 saniye dolmadan bakış kesilirse sahte entity kaybolup başka yere ışınlanıp dolaşmaya dönsün.

**Değişiklik**: `hallucinationManager.detectionTimer` ve `FAKE_ENTITY_CAPTURE_DURATION = 5.0` eklendi. DECTED'de bakılırken sayaç birikir; 5.0'a ulaşınca CHARGING başlar. Bakış kesilirse (histerezisli kontrolle) sayaç sıfırlanır, sahte entity oyuncudan 15-40 birim uzakta rastgele bir noktaya ışınlanıp `WANDERING`'e döner (kısa bir ses efektiyle). Tüm hallüsinasyon reset noktalarına (spawn, GLITCH bitişi, zorla kapatma) `detectionTimer`/`fakeEntityPathfinding.path` sıfırlaması eklendi.

**Doğrulama**: `node --check` ile sözdizimi temiz; headless Chromium'da her iki sayfa konsol hatasız yükleniyor.

**Not**: Faz 6 (Alien: Isolation tarzı genel AI ince ayarı — çok aşamalı arama, ısınma-haritasına duyarlı ışınlanma, son-görülen-konumdan tahmin, skora göre ölçeklenen ısrar süresi, mesafeye duyarlı ön-uyarı) kullanıcının isteğiyle bu oturuma dahil edilmedi — plan hazır (`/home/project-gamers/.claude/plans/dostum-u-orjinal-olan-noble-dewdrop.md`), ayrıca konuşulup onaylanınca uygulanacak.

---

## Session 7 — Faz 6 (kısmi): Çok Aşamalı Arama + Öğrenen Israr + Doğal Ortaya Çıkış

Faz 6'nın 5 maddesi kullanıcıyla tek tek gözden geçirildi; 2 tanesi onaylandı, 1 tanesi ("mesafeye duyarlı ön-uyarı") kullanıcı isteğiyle atlandı, 2 tanesi (ısınma-haritasına duyarlı ışınlanma, son-görülen-konumdan tahmin) bu oturuma dahil edilmedi. Ayrıca kullanıcı ayrı, somut bir davranış hatası daha tarif etti: entity görünmezken oyuncuya doğru yavaşça yaklaşıp (yaklaşma sesleri + giggle uyarısı) tekrar görünür olurken rastgele bir noktaya ışınlanıyordu — bu, "yaklaştı, şimdi ortaya çıkıyor" anlatısını kırıyordu.

### Çok aşamalı SEARCHING
`the_entity`'ye `searchStage` (0-2) ve `searchStageTimer` alanları eklendi. SEARCHING artık tek bir tahmin noktasına gitmiyor: önce son görülen konum, oraya yaklaşınca (2.5 birim) veya 4sn oyalanınca kaçış yönünde 5 birim ileri, sonra 10 birim ileri — sırayla üç nokta kontrol ediyor. Her iki SEARCHING-giriş noktası (`distractEntity`, huntGrace-bitişi demotion) `searchStage`'i sıfırlıyor.

### Skora göre ölçeklenen huntGrace
`enterHunting()` içinde `huntGrace = 1.2 + entityMemory.score * 0.1` — entity öğrendikçe (skor arttıkça) görüşü kaybettikten sonra biraz daha ısrarla kovalıyor (max ~2.2sn, skor 10'da).

### Görünür olurken artık ışınlanmıyor
**Sorun**: Görünmezlik süresi dolunca (`updateTheEntity`, görünmez faz bloğu), oyuncu entity yönüne bakmıyorsa entity rastgele bir noktaya (oyuncudan 10-22 birim) ışınlanıp öyle görünür oluyordu — halbuki görünmez fazda zaten oyuncuya doğru yavaşça yaklaşmış oluyordu (mesafeye göre scratch sesleri + 3sn kala giggle uyarısı).

**Düzeltme**: Işınlama tamamen kaldırıldı — `setEntityVisibility(true)` artık entity'nin o an bulunduğu (zaten yaklaşmış olduğu) konumda çağrılıyor. "Oyuncu bakıyorsa 2.5sn daha bekle" mantığı aynen korundu.

**Doğrulama**: `node --check` ile sözdizimi temiz; headless Chromium'da her iki sayfa konsol hatasız yükleniyor.

**Kapsam dışı bırakılanlar** (kullanıcı onayı beklemede): ısınma-haritasına duyarlı director ışınlanması, tahminli avlanmanın son-görülen-konumdan çalışması, mesafeye duyarlı ön-uyarı penceresi.
