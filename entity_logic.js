import * as THREE from 'three';

// =============================================================================
// 1. MONİTOR SAHNE KURULUMU
// =============================================================================
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('monitor-canvas'), antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.8;
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.Fog(0x000000, 15, 55);

// Radar Kurulumu
const radarCanvas = document.getElementById('radar-canvas');
const ctx = radarCanvas.getContext('2d');
radarCanvas.width = 400;
radarCanvas.height = 350;

const clock = new THREE.Clock();

// =============================================================================
// 2. DÜNYA İNŞASI (MAZE LAYOUT)
// =============================================================================
const mazeLayout = [
    "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW",
    "X   P W K        W       K     W",
    "W    W WWWWWWWWW W WWWWWWWWWWWWW",
    "WEWW D W       W D W           W",
    "W WW W W WWWWW W W W WWWWWWWWWWW",
    "W K  W   W   W   W   W K       W",
    "WWWWWWWW D W WWWWWWWWWW WWWWWWDW",
    "W        W W         W      W  W",
    "W WWWWWWWW WWWWWWWWW D WWWW D  W",
    "W W      W           W W    W WW",
    "W D WWWW W WWWWWWWWWWW W WWWW W",
    "W W W    W     K       W K  W W",
    "W W WWWW WWWWWWWWWWWWWWWWWWW  W",
    "W W    D                   WW  W",
    "W WWWWWWWWWWWWWWWWWWWWWWWW D  W",
    "W K                    W W W W",
    "WWWWWWWWWWWWWWWWWWWWWW D W W W",
    "W                      W K   W",
    "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW"
];

const wallSize = 4;
const wallHeight = 5;

// Texture yükleme
const textureLoader = new THREE.TextureLoader();
const wallTex = textureLoader.load('duvar_dokusu.webp');
const floorTex = textureLoader.load('yer_dokusu.webp');
const ceilingTex = textureLoader.load('tavan_dokusu.webp');
const doorTex = textureLoader.load('kapi_dokusu.webp');

[floorTex, ceilingTex].forEach(t => {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
});
floorTex.repeat.set(50, 50);
ceilingTex.repeat.set(50, 50);

const wallMaterial = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.8 });
const doorMaterial = new THREE.MeshStandardMaterial({ map: doorTex, roughness: 0.8 });
const floorMaterial = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9 });
const ceilingMaterial = new THREE.MeshStandardMaterial({ map: ceilingTex, roughness: 0.9 });
const walls = new THREE.Group();
const monitorDoors = [];

const floor = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), floorMaterial);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), ceilingMaterial);
ceiling.position.y = wallHeight;
ceiling.rotation.x = Math.PI / 2;
scene.add(ceiling);

mazeLayout.forEach((row, rowIndex) => {
    for (let colIndex = 0; colIndex < row.length; colIndex++) {
        const x = colIndex * wallSize;
        const z = rowIndex * wallSize;
        const char = row[colIndex];

        if (char === 'W' || char === 'X') {
            const wall = new THREE.Mesh(new THREE.BoxGeometry(wallSize, wallHeight, wallSize), wallMaterial);
            wall.position.set(x, wallHeight / 2, z);
            walls.add(wall);
        } else if (char === 'D') {
            const isVerticalCorridor = mazeLayout[rowIndex][colIndex - 1] === 'W' && mazeLayout[rowIndex][colIndex + 1] === 'W';
            const doorGeo = isVerticalCorridor ? new THREE.BoxGeometry(wallSize, wallHeight, 0.4) : new THREE.BoxGeometry(0.4, wallHeight, wallSize);
            const doorMesh = new THREE.Mesh(doorGeo, doorMaterial);
            doorMesh.position.set(x, wallHeight / 2, z);
            doorMesh.userData = { col: colIndex, row: rowIndex };
            scene.add(doorMesh);
            monitorDoors.push(doorMesh);
        }
    }
});
scene.add(walls);

// Işıklandırma — entity etrafını görebilmeli
scene.add(new THREE.AmbientLight(0x333333, 1.2));

// =============================================================================
// 3. ENTITY POV KOLLARI (FPS) — Kameranın child'ı
// =============================================================================
const _armMat = new THREE.MeshStandardMaterial({ color: 0x0d0d0d, roughness: 0.95, metalness: 0.05, transparent: true, opacity: 1 });
const _headMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.85, emissive: 0x222222, emissiveIntensity: 0.05 });

function _makePOVArm(side) {
    const g = new THREE.Group();
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.085, 0.72, 8), _armMat.clone());
    upper.position.y = -0.36;
    const elbowPivot = new THREE.Object3D();
    elbowPivot.position.y = -0.72;
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.065, 0.65, 8), _armMat.clone());
    fore.position.y = -0.32;
    elbowPivot.add(fore);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), _armMat.clone());
    hand.position.y = -0.65;
    elbowPivot.add(hand);
    g.add(upper, elbowPivot);
    g.position.set(side * 0.35, -0.35, -0.5);
    return { group: g, elbow: elbowPivot, hand, materials: [upper.material, fore.material, hand.material] };
}

const povLeftArm = _makePOVArm(-1);
const povRightArm = _makePOVArm(1);

camera.add(povLeftArm.group, povRightArm.group);

// Entity POV — kollar sadece, fener yok

scene.add(camera);

// =============================================================================
// 4. OYUNCU HUMANOID MODELİ
// =============================================================================
const playerModel = new THREE.Group();

// Gövde — yeşil mont/kıyafet
const _bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a5a3a, roughness: 0.85 });
const playerBody = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 1.0, 10), _bodyMat);
playerBody.position.y = 0.8;
playerModel.add(playerBody);

// Kafa — ten rengi
const _skinMat = new THREE.MeshStandardMaterial({ color: 0xd4a574, roughness: 0.7 });
const playerHead = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), _skinMat);
playerHead.position.y = 1.55;
playerModel.add(playerHead);

// Saç — koyu kahve
const _hairMat = new THREE.MeshStandardMaterial({ color: 0x2a1a0a, roughness: 0.9 });
const playerHair = new THREE.Mesh(new THREE.SphereGeometry(0.23, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), _hairMat);
playerHair.position.y = 1.6;
playerModel.add(playerHair);

// Sol Kol
const _clothMat = new THREE.MeshStandardMaterial({ color: 0x2a4a2a, roughness: 0.9 });
const playerLeftArmGroup = new THREE.Group();
playerLeftArmGroup.position.set(-0.35, 1.1, 0);
const pLeftUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.065, 0.5, 8), _clothMat.clone());
pLeftUpper.position.y = -0.25;
const pLeftElbowPivot = new THREE.Object3D();
pLeftElbowPivot.position.y = -0.5;
const pLeftFore = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.06, 0.4, 8), _skinMat.clone());
pLeftFore.position.y = -0.2;
pLeftElbowPivot.add(pLeftFore);
playerLeftArmGroup.add(pLeftUpper, pLeftElbowPivot);
playerModel.add(playerLeftArmGroup);

// Sağ Kol
const playerRightArmGroup = new THREE.Group();
playerRightArmGroup.position.set(0.35, 1.1, 0);
const pRightUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.065, 0.5, 8), _clothMat.clone());
pRightUpper.position.y = -0.25;
const pRightElbowPivot = new THREE.Object3D();
pRightElbowPivot.position.y = -0.5;
const pRightFore = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.06, 0.4, 8), _skinMat.clone());
pRightFore.position.y = -0.2;
pRightElbowPivot.add(pRightFore);
playerRightArmGroup.add(pRightUpper, pRightElbowPivot);
playerModel.add(playerRightArmGroup);

// Sol Bacak — koyu pantolon
const _legMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2a, roughness: 0.9 });
const playerLeftLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.085, 0.7, 8), _legMat);
playerLeftLeg.position.set(-0.12, 0.35, 0);
playerModel.add(playerLeftLeg);

// Sağ Bacak
const playerRightLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.085, 0.7, 8), _legMat.clone());
playerRightLeg.position.set(0.12, 0.35, 0);
playerModel.add(playerRightLeg);

// Ayakkabılar — koyu kahve
const _shoeMat = new THREE.MeshStandardMaterial({ color: 0x1a0d06, roughness: 0.95 });
const pLeftShoe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.18), _shoeMat);
pLeftShoe.position.set(-0.12, 0.03, 0.03);
playerModel.add(pLeftShoe);
const pRightShoe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.18), _shoeMat.clone());
pRightShoe.position.set(0.12, 0.03, 0.03);
playerModel.add(pRightShoe);

// Oyuncu fener ışığı
const playerLight = new THREE.SpotLight(0xffffee, 1.5, 18, Math.PI / 6, 0.5, 1.5);
playerLight.position.set(0, 1.4, 0);
playerLight.target.position.set(0, 1.2, -5);
playerModel.add(playerLight, playerLight.target);

scene.add(playerModel);

// Oyuncu modeli referansları (animasyon için)
const playerModelRefs = {
    group: playerModel,
    body: playerBody,
    head: playerHead,
    leftArm: playerLeftArmGroup,
    rightArm: playerRightArmGroup,
    leftElbow: pLeftElbowPivot,
    rightElbow: pRightElbowPivot,
    leftLeg: playerLeftLeg,
    rightLeg: playerRightLeg,
    light: playerLight,
    walkPhase: 0,
    prevPos: new THREE.Vector3()
};

// =============================================================================
// 5. TELEMETRİ VERİ DİNLEME
// =============================================================================
const bc = new BroadcastChannel('telemetry-hub');
let gameData = null;
let prevPlayerPos = new THREE.Vector3();
let playerWalkPhase = 0;

let latestDt = 1 / 60;
let hasNewData = false;
bc.onmessage = (ev) => {
    gameData = ev.data;
    hasNewData = true;
};

// =============================================================================
// 6. ENTITY POV GÜNCELLEMESİ (Kollar + Fener Animasyonu)
// =============================================================================
function lerpVal(a, b, t) {
    return a + (b - a) * Math.min(1, t);
}

function updateEntityPOV(dt) {
    if (!gameData) return;
    const e = gameData.entity;

    // Entity durumuna göre sol kol
    const state = e.state;
    let targetLX = 0.06, targetLY = 0, targetRZ = 0.12;
    let targetRX = 0.06, targetRY = 0, targetRElbow = 0.12;
    let targetLElbow = 0.12;
    let lerpSpeed = 4;

    if (state === 'HUNTING') {
        const dist = camera.position.distanceTo(new THREE.Vector3(gameData.player.pos.x, 2, gameData.player.pos.z));
        if (dist < 6) {
            // Yakalama — kollar tam öne uzanmış, pençe
            const tr = Math.sin(Date.now() * 0.018) * 0.05;
            targetLX = -1.2 + tr;
            targetRX = -1.2 - tr;
            targetLElbow = 0.6;
            targetRElbow = 0.6;
            targetLY = -0.4;
            targetRY = 0.4;
            lerpSpeed = 6;
        } else {
            // Koşma — hızlı pompalama
            const s = Math.sin(e.walkPhase || 0) * 0.6;
            targetLX = s;
            targetRX = -s;
            targetLElbow = Math.max(0, s) * 0.6;
            targetRElbow = Math.max(0, -s) * 0.6;
            targetLY = 0;
            targetRY = 0;
            lerpSpeed = 8;
        }
    } else if (state === 'SEARCHING') {
        const s = Math.sin(Date.now() * 0.0016) * 0.3;
        targetLX = s;
        targetRX = -s;
        targetLElbow = 0.2;
        targetRElbow = 0.2;
        lerpSpeed = 3;
    } else if (state === 'STUNNED' || e.isStunned) {
        // Sersem — kollar aşağı sarkmış
        targetLX = 0.15;
        targetRX = 0.15;
        targetLElbow = 0.05;
        targetRElbow = 0.05;
        lerpSpeed = 2;
    } else if (state === 'FROZEN') {
        // Donmuş — titrek sarkma
        const tr = Math.sin(Date.now() * 0.01) * 0.03;
        targetLX = 0.1 + tr;
        targetRX = 0.1 - tr;
        targetLElbow = 0.08;
        targetRElbow = 0.08;
        lerpSpeed = 2;
    } else {
        // PATROLLING — doğal sallanma
        const s = Math.sin(Date.now() * 0.002) * 0.08;
        targetLX = s;
        targetRX = -s;
        targetLElbow = 0.12;
        targetRElbow = 0.12;
        lerpSpeed = 3;
    }

    povLeftArm.group.rotation.x = lerpVal(povLeftArm.group.rotation.x, targetLX, lerpSpeed * dt);
    povLeftArm.group.rotation.y = lerpVal(povLeftArm.group.rotation.y, targetLY, lerpSpeed * dt);
    povLeftArm.elbow.rotation.x = lerpVal(povLeftArm.elbow.rotation.x, targetLElbow, lerpSpeed * dt);
    povRightArm.group.rotation.x = lerpVal(povRightArm.group.rotation.x, targetRX, lerpSpeed * dt);
    povRightArm.group.rotation.y = lerpVal(povRightArm.group.rotation.y, targetRY, lerpSpeed * dt);
    povRightArm.elbow.rotation.x = lerpVal(povRightArm.elbow.rotation.x, targetRElbow, lerpSpeed * dt);

    // Entity modeli visibility — entity görünüyorsa POV aktif, görünmezse kollar loş
    if (povLeftArm.group.parent) {
        const armOpacity = e.isVisible ? 1.0 : 0.4;
        povLeftArm.group.visible = true;
        povRightArm.group.visible = true;
        povLeftArm.materials.forEach(m => { m.opacity = armOpacity; });
        povRightArm.materials.forEach(m => { m.opacity = armOpacity; });
    }
}

// =============================================================================
// 7. OYUNCU MODELİ GÜNCELLEMESİ
// =============================================================================
function updatePlayerModel(dt) {
    if (!gameData) return;
    const p = gameData.player;

    // Pozisyon
    playerModel.position.set(p.pos.x, 0, p.pos.z);

    // Rotasyon — sadece Y ekseni
    playerModel.rotation.y = p.rot.y || 0;

    // Çömelme — boy kısalması
    const targetScaleY = p.isCrouching ? 0.55 : 1.0;
    playerModel.scale.y = lerpVal(playerModel.scale.y, targetScaleY, 8 * dt);

    // Yürüyüş animasyonu — pozisyon değişiminden hız hesapla
    const currentPos = new THREE.Vector3(p.pos.x, p.pos.y, p.pos.z);
    const velocity = currentPos.distanceTo(playerModelRefs.prevPos);
    playerModelRefs.prevPos.copy(currentPos);

    const isMoving = velocity > 0.01;
    const speedMult = p.isSprinting ? 1.8 : 1.0;

    if (isMoving) {
        playerModelRefs.walkPhase += dt * 10 * speedMult;
    }

    const walkPhase = playerModelRefs.walkPhase;

    // Bacak sallanma
    if (isMoving) {
        const legSwing = Math.sin(walkPhase) * 0.4 * speedMult;
        playerLeftLeg.rotation.x = legSwing;
        playerRightLeg.rotation.x = -legSwing;
        // Ayakkabılar da sallansın
        pLeftShoe.position.z = 0.03 + Math.sin(walkPhase) * 0.03;
        pRightShoe.position.z = 0.03 - Math.sin(walkPhase) * 0.03;
    } else {
        playerLeftLeg.rotation.x = lerpVal(playerLeftLeg.rotation.x, 0, 5 * dt);
        playerRightLeg.rotation.x = lerpVal(playerRightLeg.rotation.x, 0, 5 * dt);
    }

    // Kol sallanma — bacaklarla zıt yönde
    if (isMoving) {
        const armSwing = Math.sin(walkPhase) * 0.35 * speedMult;
        playerLeftArmGroup.rotation.x = -armSwing;
        playerRightArmGroup.rotation.x = armSwing;
        playerLeftArmGroup.children[1].rotation.x = Math.max(0, armSwing) * 0.4;
        playerRightArmGroup.children[1].rotation.x = Math.max(0, -armSwing) * 0.4;
    } else {
        playerLeftArmGroup.rotation.x = lerpVal(playerLeftArmGroup.rotation.x, 0, 4 * dt);
        playerRightArmGroup.rotation.x = lerpVal(playerRightArmGroup.rotation.x, 0, 4 * dt);
    }

    // Koşma — kollar daha yukarı
    if (p.isSprinting && isMoving) {
        playerLeftArmGroup.rotation.x -= 0.3;
        playerRightArmGroup.rotation.x -= 0.3;
    }

    // Fener
    if (playerLight) {
        playerLight.visible = !!p.flashlightOn;
    }
}

// =============================================================================
// 8. RADAR ÇİZİMİ (2D)
// =============================================================================
function drawRadar() {
    ctx.fillStyle = '#000800';
    ctx.fillRect(0, 0, radarCanvas.width, radarCanvas.height);

    const scale = 11;
    const offsetX = 20;
    const offsetZ = 20;

    mazeLayout.forEach((row, r) => {
        for (let c = 0; c < row.length; c++) {
            const char = row[c];
            const rx = c * scale + offsetX;
            const rz = r * scale + offsetZ;

            if (char === 'W') {
                ctx.fillStyle = '#004400';
                ctx.fillRect(rx, rz, scale - 1, scale - 1);
            } else if (char === 'D') {
                let isOpen = false;
                const doorIndex = monitorDoors.findIndex(d => d.userData.row === r && d.userData.col === c);
                if (doorIndex !== -1 && gameData && gameData.doors) {
                    isOpen = gameData.doors[doorIndex];
                }
                ctx.fillStyle = isOpen ? '#001100' : '#0a0';
                ctx.fillRect(rx, rz, scale - 1, scale - 1);
            }
        }
    });

    if (gameData) {
        if (gameData.keys) {
            gameData.keys.forEach(k => {
                const kx = (k.x / wallSize) * scale + offsetX + scale / 2;
                const kz = (k.z / wallSize) * scale + offsetZ + scale / 2;
                ctx.fillStyle = '#ff0';
                ctx.shadowBlur = 5;
                ctx.shadowColor = '#ff0';
                ctx.beginPath();
                ctx.arc(kx, kz, scale / 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
            });
        }

        if (gameData.exitDoor) {
            const exX = (gameData.exitDoor.pos.x / wallSize) * scale + offsetX + scale / 2;
            const exZ = (gameData.exitDoor.pos.z / wallSize) * scale + offsetZ + scale / 2;
            const exitColor = gameData.exitDoor.isLocked ? '#400' : '#0f0';
            ctx.fillStyle = exitColor;
            if (!gameData.exitDoor.isLocked) {
                ctx.shadowBlur = 10;
                ctx.shadowColor = '#0f0';
            }
            ctx.fillRect(exX - scale / 2, exZ - scale / 2, scale, scale);
            ctx.shadowBlur = 0;
        }

        // Oyuncu (Parlak Mavi)
        const px = (gameData.player.pos.x / wallSize) * scale + offsetX + scale / 2;
        const pz = (gameData.player.pos.z / wallSize) * scale + offsetZ + scale / 2;
        ctx.fillStyle = '#0088ff';
        ctx.beginPath();
        ctx.arc(px, pz, scale / 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Entity (Parlak Kırmızı)
        const epos = gameData.entity.pos;
        const ex = (epos.x / wallSize) * scale + offsetX + scale / 2;
        const ez = (epos.z / wallSize) * scale + offsetZ + scale / 2;
        ctx.fillStyle = '#f00';
        ctx.beginPath();
        ctx.arc(ex, ez, scale / 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(ex, ez);
        ctx.lineTo(ex + Math.sin(gameData.entity.rot.y + Math.PI) * 15, ez + Math.cos(gameData.entity.rot.y + Math.PI) * 15);
        ctx.stroke();

        // Sahte Entity (Hallucination) — Yeşil, aktifse
        if (gameData.fakeEntity) {
            const fpos = gameData.fakeEntity.pos;
            const fx = (fpos.x / wallSize) * scale + offsetX + scale / 2;
            const fz = (fpos.z / wallSize) * scale + offsetZ + scale / 2;
            ctx.fillStyle = '#0f4';
            ctx.shadowBlur = 8;
            ctx.shadowColor = '#0f4';
            ctx.beginPath();
            ctx.arc(fx, fz, scale / 1.8, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }
}

// =============================================================================
// 9. MONİTÖR GÜNCELLEMESİ
// =============================================================================
function updateMonitor() {
    if (!gameData) return;

    const ep = gameData.entity.pos;
    const er = gameData.entity.rot;
    camera.position.set(ep.x, 2, ep.z);
    camera.rotation.set(er.x, er.y + Math.PI, er.z);

    if (gameData.doors && gameData.doors.length === monitorDoors.length) {
        gameData.doors.forEach((isOpen, i) => {
            monitorDoors[i].visible = !isOpen;
        });
    }

    const stateEl = document.getElementById('entity-state');
    const posEl = document.getElementById('entity-pos');
    const distEl = document.getElementById('player-dist');
    const fakeEl = document.getElementById('fake-entity-state');
    if (stateEl) stateEl.textContent = `DURUM: ${gameData.entity.state}`;
    if (posEl) posEl.textContent = `POS: ${Math.round(ep.x)}, ${Math.round(ep.z)}`;
    const dist = Math.sqrt(Math.pow(ep.x - gameData.player.pos.x, 2) + Math.pow(ep.z - gameData.player.pos.z, 2));
    if (distEl) distEl.textContent = `MESAFE: ${Math.round(dist)}m`;
    if (fakeEl) {
        if (gameData.fakeEntity) {
            const fp = gameData.fakeEntity.pos;
            fakeEl.textContent = `SAHTE ENTITY: ${gameData.fakeEntity.state} (${Math.round(fp.x)}, ${Math.round(fp.z)})`;
        } else {
            fakeEl.textContent = 'SAHTE ENTITY: YOK';
        }
    }

    drawRadar();
}

// =============================================================================
// 10. RENDER DÖNGÜSÜ
// =============================================================================
function animate() {
    requestAnimationFrame(animate);
    latestDt = clock.getDelta();
    if (hasNewData && gameData) {
        updateMonitor();
        updateEntityPOV(latestDt);
        updatePlayerModel(latestDt);
        hasNewData = false;
    }
    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
