import * as THREE from 'three';
import { PointerLockControls } from 'PointerLockControls';
import {
    bottleBreakSound, fakeEntitySound, itemPickupSound, doorSlamSound,
    victoryMusic, backgroundMusic, walkSound, sprintSound, screamSound,
    keyPickupSound, doorOpenSound, doorCloseSound, giggleSound, aiDoorOpenSound,
    ambientSounds, tenseMusic, ambientWind, behindSound, deathMusic,
    scratchSound,
    soundState, manageFootstepSounds, pauseAllSounds
} from './sounds.js';

// =============================================================================
// 1. TEMEL SAHNE KURULUMU
// =============================================================================
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({
    canvas: document.getElementById('game-canvas'),
    powerPreference: "high-performance",
    antialias: false
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
scene.fog = new THREE.Fog(0x000000, 1, 25);
scene.background = new THREE.Color(0x000000);

// 2. SES YÖNETİMİ → sounds.js'e taşındı (import edildi)

// =============================================================================
// 3. OYUN DEĞİŞKENLERİ
// =============================================================================
const player = {
    walkSpeed: 4.0,
    crouchSpeed: 2.0,
    sprintSpeed: 7.0,
    hitbox: new THREE.Vector3(0.5, 1.8, 0.5),
    stamina: 100,
    maxStamina: 100,
    staminaDrainRate: 15,
    staminaRegenRate: 10,
    isExhausted: false,
    staminaRecoveryThreshold: 20,
    isCrouching: false,
    y_velocity: 0,
    flashlightStunCharge: 0,
    stunRequirement: 2.0,
    inventory: [null, null, null],
    activeSlot: 0,
    isAiming: false
};

// V6: Head Bobbing (Kafa Sallanma) Değişkenleri
let headBobTimer = 0;
const HEAD_BOB_FREQ = 10;
const HEAD_BOB_AMP = 0.15;

const keyboard = {};
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const _centerVec2 = new THREE.Vector2(0, 0);
const _tmpVec3A = new THREE.Vector3();
const _tmpVec3B = new THREE.Vector3();
let gameRunning = false, gameOver = false, flashlightOn = true;
let flashlightDisabled = false;

// =============================================================================
// BAŞARIM SİSTEMİ
// =============================================================================
let gameStartTime = null;
let deathAchievementUnlocked = false;

function unlockAchievement(id) {
    try {
        window.parent.postMessage({ type: 'UNLOCK_ACHIEVEMENT', id }, '*');
    } catch (e) {}
}
// V7.1: Monitor Telemetri Kanalı
const telemetryBoard = new BroadcastChannel('telemetry-hub');
let interactionHintTimer = 0;
let cachedCameraDirection = new THREE.Vector3();
const TOTAL_KEYS = 8;
let keysCollected = 0;
const ESCAPE_COUNTDOWN_SECONDS = 15;
const GRAVITY = 30.0;
const JUMP_STRENGTH = 10.0;

// =============================================================================
// 4. THE ENTITY (AI) & HALLUCINATION SİSTEMİ
// =============================================================================
const the_entity = {
    mesh: null,
    hitbox: new THREE.Vector3(1, 1.8, 1),
    patrolSpeed: 1.5,
    huntSpeed: 4.2,
    invisibleFollowSpeed: 2.0,
    searchSpeed: 2.0,
    isVisible: true,
    state: 'PATROLLING',
    targetPosition: new THREE.Vector3(),
    lastKnownPlayerPosition: null,
    lastPlayerMoveDirection: new THREE.Vector3(),
    visibilityTimer: 60,
    timeVisible: 60,
    timeInvisible: 25,
    detectionRadius: 20,
    sprintDetectionRadius: 35,
    senseRadius: 7, // Görüş konisi dışındaki "altıncı his" mesafesi (arkadan/yandan yaklaşmayı hisseder)
    searchTimer: 0,
    teleportTimer: 15,
    eyeLight: null,
    chaseDuration: 0,
    huntGrace: 0, // LOS kesilince kısa süre avı sürdürür (köşeye saklanınca hemen kaybetmesin)
    walkPhase: 0, // gerçek harekete bağlı yürüyüş fazı (kollar adımlarla senkron olsun diye)
    isStunned: false,
    stunTimer: 0,
    ambushCooldown: 0, // V7.3: Pusu bekleme süresi
    ambushTimer: 0, // Pusu süresi (bu kadar saniyede yakalayamazsa pusu bozulur)
    searchStage: 0, // SEARCHING: 0=son bilinen konum, 1=kaçış yönünde 5 birim, 2=10 birim
    searchStageTimer: 0 // Bu aşamada ne kadar süredir arıyor — dolunca bir sonraki aşamaya geçer
};

let originalHuntSpeed = null;
let entityTrembleBase = 0.05;
let entityTrembleCloseMultiplier = 3.0;
const directorAI = { timeSinceLastEncounter: 0, calmThreshold: 90.0 };

// =============================================================================
// ÖĞRENEN AI HAFIZASI
// =============================================================================
const entityMemory = {
    heatmap: new Map(),     // "cx,cz" → kaç kez ziyaret edildi
    heatTimer: 0,
    posHistory: [],         // son 30 oyuncu pozisyonu (~0.3s aralık)
    histTimer: 0,
    huntCount: 0,           // toplam avlanma sayısı
    wasHunting: false,      // önceki karede hunting miydi
    escapedDirs: [],        // oyuncunun son 5 kaçış yönü
    profile: {
        sprintFrames: 0,
        totalFrames: 0,
        bottlesThrown: 0,
    },
    score: 0,               // 0-10: ne kadar öğrendi
};

const entityPathfinding = {
    path: [],
    waypointIdx: 0,
    pathTarget: null,
    recalcTimer: 0,
    stuckTimer: 0,
    stuckCheckPos: null,
    invisibleSoundTimer: 0,
};
// Sahte entity'nin WANDERING sırasında gerçek entity gibi A* ile dolaşabilmesi için ayrı,
// kendi pathfinding durumu — aynı fonksiyonu (entityGetNextWaypoint) paylaşıyorlar ama
// her biri kendi path/waypoint/stuck-timer durumunu tutmalı.
const fakeEntityPathfinding = {
    path: [],
    waypointIdx: 0,
    pathTarget: null,
    recalcTimer: 0,
    stuckTimer: 0,
    stuckCheckPos: null,
};
let gameIntro = { active: false, timer: 0, duration: 5.5 };
let cinematicPlaying = false;
const cinematic = { time: 0, startYaw: 0, entitySent: false, entityVanished: false, vanishWait: 0, textPhase: -1 };

const hallucinationManager = {
    fakeEntity: null,
    isActive: false,
    timer: 25.0,
    state: 'IDLE',
    wanderTarget: new THREE.Vector3(),
    glitchTimer: 0,
    chargeDirection: new THREE.Vector3(),
    detectionTimer: 0 // DECTED durumunda kesintisiz bakış süresi — bkz. FAKE_ENTITY_CAPTURE_DURATION
};
// Oyuncunun sahte entity'yi "yakalaması" (CHARGING'i tetiklemesi) için gereken kesintisiz bakış süresi.
const FAKE_ENTITY_CAPTURE_DURATION = 5.0;

const throwables = { group: new THREE.Group(), thrownGroup: [], aimLine: null, heldObject: null };
let corridorAmbient = null;
let keysCollectedHandled = false;
let escapeCountdown = 0;
let escapeCountdownActive = false;
let originalExitDoorPosition = null;
let entityFrozen = false;
let frozenEntityPosition = null;
let objectiveTargetPosition = null;

// =============================================================================
// 5. ARAYÜZ (UI) ELEMENTLERİ
// =============================================================================
function safeEl(id) {
    try {
        const e = document.getElementById(id);
        if (e) return e;
    } catch (e) {}
    return {
        style: {},
        classList: { add: () => {}, remove: () => {}, toggle: () => {} },
        textContent: '',
        appendChild: () => {},
        remove: () => {},
        value: '',
        dataset: {}
    };
}

const loadingScreen = safeEl('loading-screen'), startScreen = safeEl('start-screen'), pauseScreen = safeEl('pause-screen');
const staminaBar = safeEl('stamina-bar'), keyCounterElement = safeEl('key-counter');
const gameOverScreen = safeEl('game-over-screen'), winScreen = safeEl('win-screen');
const hintText = safeEl('hint-text');
const deathRestartButton = safeEl('death-restart-button');
const fadeToBlackScreen = safeEl('fade-to-black-screen');
const sanityVignette = safeEl('sanity-vignette');
const flashlightStunContainer = safeEl('flashlight-stun-container');
const flashlightStunBar = safeEl('flashlight-stun-bar');
const restartButtons = document.querySelectorAll('.restart-button'), startButton = safeEl('start-button');
const inventorySlotsUI = [(document.querySelector('#slot-1 .slot-item') || { textContent: '' }), (document.querySelector('#slot-2 .slot-item') || { textContent: '' }), (document.querySelector('#slot-3 .slot-item') || { textContent: '' })];
const interactionHint = safeEl('interaction-hint');
const countdownTimerEl = safeEl('countdown-timer');
const escapeMessageEl = safeEl('escape-message');
const objectiveMarker = safeEl('objective-marker');

// =============================================================================
// 6. OYUNCU VE DÜŞMAN MODELLERİ
// =============================================================================
const controls = new PointerLockControls(camera, renderer.domElement);
scene.add(controls.getObject());

const flashlight = new THREE.SpotLight(0xffffff, 1.8, 25, Math.PI / 5, 0.4, 1.5);
scene.add(flashlight, flashlight.target);

// GERÇEK ENTITY
const enemyGroup = new THREE.Group();

// Gövde
const _bodyMat = new THREE.MeshStandardMaterial({ color: 0x0d0d0d, roughness: 0.95, metalness: 0.05 });
const enemyBody = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.22, 2.0, 12), _bodyMat);
enemyBody.position.y = -0.1;

// Boyun pivot — kafa buradan bağımsız döner
const _neckPivot = new THREE.Object3D();
_neckPivot.position.y = 1.15;

// Kafa — V7 tarzı SADE soluk küre (ayrı göz YOK; tehdit/renk tamamen tepe ışığından gelir)
const _headMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.85, emissive: 0x222222, emissiveIntensity: 0.05 });
const enemyHead = new THREE.Mesh(new THREE.SphereGeometry(0.4, 24, 16), _headMat);
_neckPivot.add(enemyHead);

// V7 IŞIĞI: kafanın ÜSTÜNDEN aşağı gövdeye vuran, duruma göre renk değiştiren spotlight
// (av=kırmızı, arama=turuncu, devriye=beyaz, pusu=sönük, sersem=mavi)
// enemyGroup'a bağlı → kafa tarama hareketiyle sallanmaz, sabit "tepe ışığı" gibi durur
the_entity.eyeLight = new THREE.SpotLight(0xffffff, 4, 11, Math.PI / 5, 0.6, 1);
the_entity.eyeLight.position.set(0, 2.8, 0.35);        // kafanın üstü
the_entity.eyeLight.target.position.set(0, 0.6, 0.05); // aşağı, gövdeye doğru
enemyGroup.add(the_entity.eyeLight, the_entity.eyeLight.target);

// Kollar
const _armMat = new THREE.MeshStandardMaterial({ color: 0x0d0d0d, roughness: 0.95 });
function _makeArm(side) {
    const g = new THREE.Group();
    // Üst kol
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.085, 0.72, 8), _armMat.clone());
    upper.position.y = -0.36;
    // Dirsek pivot
    const elbowPivot = new THREE.Object3D();
    elbowPivot.position.y = -0.72;
    // Ön kol
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.065, 0.65, 8), _armMat.clone());
    fore.position.y = -0.32;
    elbowPivot.add(fore);
    g.add(upper, elbowPivot);
    g.position.set(side * 0.52, 0.85, 0);
    return { group: g, elbow: elbowPivot };
}
const _leftArmData  = _makeArm(-1);
const _rightArmData = _makeArm( 1);

enemyGroup.add(enemyBody, _neckPivot, _leftArmData.group, _rightArmData.group);
the_entity.mesh = enemyGroup;

// Animasyon referansları
the_entity.neckPivot   = _neckPivot;
the_entity.leftArm     = _leftArmData.group;
the_entity.rightArm    = _rightArmData.group;
the_entity.leftElbow   = _leftArmData.elbow;
the_entity.rightElbow  = _rightArmData.elbow;
scene.add(the_entity.mesh);
originalHuntSpeed = the_entity.huntSpeed;

// SAHTE ENTITY (HALLUCINATION) — gerçek entity'nin modeliyle benzer ama yarı-saydam ve yeşil ışıklı
// (gerçek entity ile karıştırılmaması için bilerek farklı hissettiriyor)
function _makeArmCustom(side, mat) {
    const g = new THREE.Group();
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.085, 0.72, 8), mat);
    upper.position.y = -0.36;
    const elbowPivot = new THREE.Object3D();
    elbowPivot.position.y = -0.72;
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.065, 0.65, 8), mat);
    fore.position.y = -0.32;
    elbowPivot.add(fore);
    g.add(upper, elbowPivot);
    g.position.set(side * 0.52, 0.85, 0);
    return { group: g, elbow: elbowPivot };
}

hallucinationManager.fakeEntity = new THREE.Group();

const _fakeBodyMat = new THREE.MeshStandardMaterial({ color: 0x0d0d0d, roughness: 0.95, metalness: 0.05, transparent: true, opacity: 0.4 });
const _fakeHeadMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.85, emissive: 0x222222, emissiveIntensity: 0.05, transparent: true, opacity: 0.4 });

// Gövde — şeffaf, içinden geçiyormuş gibi duruyor
const fakeEnemyBody = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.22, 2.0, 12), _fakeBodyMat);
fakeEnemyBody.position.y = -0.1;

// Kafa — hafif sağa yatık, doğal olmayan huzursuz edici duruş
const _fakeNeck = new THREE.Object3D();
_fakeNeck.position.y = 1.15;
_fakeNeck.rotation.z = 0.15;
const fakeEnemyHead = new THREE.Mesh(new THREE.SphereGeometry(0.4, 24, 16), _fakeHeadMat);
_fakeNeck.add(fakeEnemyHead);

// Kollar — custom şeffaf malzeme ile, hafif tedirgin edici doğal asılı poz
const _fakeLeftArm  = _makeArmCustom(-1, _fakeBodyMat);
const _fakeRightArm = _makeArmCustom( 1, _fakeBodyMat);
_fakeLeftArm.group.rotation.x  = 0.1;
_fakeRightArm.group.rotation.x = 0.1;
_fakeLeftArm.elbow.rotation.x  = 0.18;
_fakeRightArm.elbow.rotation.x = 0.18;

// Yeşil dim ışık — kafadan aşağı vuran, gerçek entity'nin kırmızı/beyaz ışığıyla karışmaz
const fakeGreenLight = new THREE.SpotLight(0x00ff44, 1.5, 8, Math.PI / 5, 0.6, 1);
fakeGreenLight.position.set(0, 1.4, 0.35);
fakeGreenLight.target.position.set(0, -0.5, 0.05);

hallucinationManager.fakeEntity.add(fakeEnemyBody, _fakeNeck, _fakeLeftArm.group, _fakeRightArm.group, fakeGreenLight, fakeGreenLight.target);
hallucinationManager.fakeEntity.userData = { hitbox: new THREE.Vector3(1, 1.8, 1) };

// =============================================================================
// 7. HARİTA, DOKULAR VE OBJE OLUŞTURMA
// =============================================================================
const wallSize = 4;
const wallHeight = 5;
// Labirent Düzeni
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

const walls = new THREE.Group(), doors = new THREE.Group(), keys = new THREE.Group();
let exitMarker;
let exitDoor = null;
let initialEntityPosition = null;
const walkableTiles = [];
const wallAdjacentTiles = [];
let doorMeshes = [];
const doorSpawnPoints = []; // { pos: Vector3(x,0,z), isVertical: bool } — doğru yönlü kapı spawn noktaları

const loadingManager = new THREE.LoadingManager(() => {
    loadingScreen.style.display = 'none';
    startScreen.style.display = 'flex';
});

const textureLoader = new THREE.TextureLoader(loadingManager);
const wallTexture = textureLoader.load('duvar_dokusu.webp');
const floorTexture = textureLoader.load('yer_dokusu.webp');
const ceilingTexture = textureLoader.load('tavan_dokusu.webp');
const doorTexture = textureLoader.load('kapi_dokusu.webp');

[floorTexture, ceilingTexture, wallTexture].forEach(t => { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; });
floorTexture.repeat.set(50, 50);
ceilingTexture.repeat.set(50, 50);

const wallMaterial = new THREE.MeshStandardMaterial({ map: wallTexture, roughness: 0.8 });
const doorMaterial = new THREE.MeshStandardMaterial({ map: doorTexture, roughness: 0.8 });
const exitDoorTexture = textureLoader.load('cikis_kapi_dokusu.webp');
let exitDoorMaterial = new THREE.MeshStandardMaterial({ map: exitDoorTexture, roughness: 0.8 });
exitDoorTexture.onError = () => { exitDoorMaterial = doorMaterial; };
const bottleMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a3d1a, transparent: true, opacity: 0.88,
    roughness: 0.05, metalness: 0.0
});

function makeBottleGeo(scale = 1) {
    const s = scale;
    const pts = [
        new THREE.Vector2(0.000 * s, 0.000 * s),
        new THREE.Vector2(0.040 * s, 0.000 * s),
        new THREE.Vector2(0.062 * s, 0.016 * s),
        new THREE.Vector2(0.064 * s, 0.055 * s),
        new THREE.Vector2(0.064 * s, 0.135 * s),
        new THREE.Vector2(0.058 * s, 0.170 * s),
        new THREE.Vector2(0.038 * s, 0.198 * s),
        new THREE.Vector2(0.021 * s, 0.220 * s),
        new THREE.Vector2(0.019 * s, 0.255 * s),
        new THREE.Vector2(0.022 * s, 0.265 * s),
        new THREE.Vector2(0.022 * s, 0.278 * s),
    ];
    return new THREE.LatheGeometry(pts, 14);
}

// Labirenti İnşa Et
mazeLayout.forEach((row, rowIndex) => {
    for (let colIndex = 0; colIndex < row.length; colIndex++) {
        const x = colIndex * wallSize;
        const z = rowIndex * wallSize;
        const char = row[colIndex];

        if (char === 'W') {
            const wall = new THREE.Mesh(new THREE.BoxGeometry(wallSize, wallHeight, wallSize), wallMaterial);
            wall.position.set(x, wallHeight / 2, z);
            wall.userData.hitbox = new THREE.Box3().setFromObject(wall);
            walls.add(wall);
        } else if (char === 'D') {
            const isVerticalCorridor = mazeLayout[rowIndex][colIndex - 1] === 'W' && mazeLayout[rowIndex][colIndex + 1] === 'W';
            const doorGeo = isVerticalCorridor ? new THREE.BoxGeometry(wallSize, wallHeight, 0.4) : new THREE.BoxGeometry(0.4, wallHeight, wallSize);
            const doorMesh = new THREE.Mesh(doorGeo, doorMaterial);
            const pivot = new THREE.Group();

            if (isVerticalCorridor) {
                pivot.position.set(x - wallSize / 2, wallHeight / 2, z);
                doorMesh.position.x = wallSize / 2;
                pivot.userData = { isOpen: false, isAnimating: false, closedRotation: 0, openRotation: -Math.PI / 2 };
            } else {
                pivot.position.set(x, wallHeight / 2, z - wallSize / 2);
                doorMesh.position.z = wallSize / 2;
                pivot.userData = { isOpen: false, isAnimating: false, closedRotation: 0, openRotation: Math.PI / 2 };
            }
            doorMesh.userData.pivot = pivot;
            pivot.add(doorMesh);
            doors.add(pivot);
            doorMeshes.push(doorMesh);
            doorSpawnPoints.push({ pos: new THREE.Vector3(x, 0, z), isVertical: isVerticalCorridor });
            walkableTiles.push(new THREE.Vector3(x, 1, z));
        } else {
            walkableTiles.push(new THREE.Vector3(x, 1, z));
            if ((rowIndex > 0 && mazeLayout[rowIndex - 1][colIndex] === 'W') || (rowIndex < mazeLayout.length - 1 && mazeLayout[rowIndex + 1][colIndex] === 'W') || (colIndex > 0 && mazeLayout[rowIndex][colIndex - 1] === 'W') || (colIndex < row.length - 1 && mazeLayout[rowIndex][colIndex + 1] === 'W')) {
                if (char === ' ') wallAdjacentTiles.push(new THREE.Vector3(x, 0.25, z));
            }
            if (char === 'P') {
                controls.getObject().position.set(x, 1.8, z);
            } else if (char === 'E') {
                the_entity.mesh.position.set(x, 1.8, z);
                initialEntityPosition = new THREE.Vector3(x, 1.8, z);
            } else if (char === 'X') {
                // V7.2: SAHTE/KİLİTLİ ÇIKIŞ KAPISI (Başlangıç)
                const isVerticalCorridor = rowIndex > 0 && mazeLayout[rowIndex - 1][colIndex] !== 'W';
                const pivot = new THREE.Group();
                const doorGeo = isVerticalCorridor ? new THREE.BoxGeometry(wallSize, wallHeight, 0.4) : new THREE.BoxGeometry(0.4, wallHeight, wallSize);
                const doorMesh = new THREE.Mesh(doorGeo, exitDoorMaterial);
                
                if (isVerticalCorridor) {
                    pivot.position.set(x - wallSize / 2, wallHeight / 2, z);
                    doorMesh.position.x = wallSize / 2;
                } else {
                    pivot.position.set(x, wallHeight / 2, z - wallSize / 2);
                    doorMesh.position.z = wallSize / 2;
                }

                pivot.userData = { isOpen: false, isAnimating: false, closedRotation: 0, openRotation: Math.PI / 2, isExit: true, isExitLocked: true, tileCenter: new THREE.Vector3(x, 0, z) };
                doorMesh.userData.pivot = pivot;
                pivot.add(doorMesh);
                doors.add(pivot);
                doorMeshes.push(doorMesh);

                // Hafif Sönük Exit Yazısı
                const canvas = document.createElement('canvas');
                canvas.width = 128; canvas.height = 64;
                const ctxCanvas = canvas.getContext('2d');
                ctxCanvas.fillStyle = '#555'; ctxCanvas.font = 'bold 40px Arial';
                ctxCanvas.textAlign = 'center'; ctxCanvas.fillText('EXIT', 64, 48);
                const tex = new THREE.CanvasTexture(canvas);
                const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.5 }));
                sprite.scale.set(2, 1, 1);
                sprite.position.y = 1.2;
                pivot.add(sprite);

                exitDoor = pivot;
                originalExitDoorPosition = pivot.position.clone();
                walkableTiles.push(new THREE.Vector3(x, 1, z));

                exitMarker = new THREE.Mesh(new THREE.BoxGeometry(wallSize, wallHeight, wallSize), new THREE.MeshBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.05 }));
                exitMarker.position.set(x, wallHeight / 2, z);
                scene.add(exitMarker);
            } else if (char === 'K') {
                const keyMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.9, roughness: 0.25 });
                const keyGroup = new THREE.Group();

                // Yuvarlak baş (halka)
                const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.026, 8, 20), keyMat);
                ring.position.set(0, 0.13, 0);
                keyGroup.add(ring);

                // Merkez delik dolgusu (küçük disk)
                const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.064, 0.064, 0.018, 16), keyMat);
                disc.rotation.x = Math.PI / 2;
                disc.position.set(0, 0.13, 0);
                keyGroup.add(disc);

                // Gövde (shaft)
                const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.22, 0.038), keyMat);
                shaft.position.set(0, -0.005, 0);
                keyGroup.add(shaft);

                // Diş 1
                const tooth1 = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.028, 0.038), keyMat);
                tooth1.position.set(0.042, -0.06, 0);
                keyGroup.add(tooth1);

                // Diş 2
                const tooth2 = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.028, 0.038), keyMat);
                tooth2.position.set(0.037, -0.095, 0);
                keyGroup.add(tooth2);

                keyGroup.position.set(x, 1.3, z);
                keyGroup.add(new THREE.PointLight(0xffd700, 1, 3));
                keys.add(keyGroup);
            }
        }
    }
});

// Rastgele Şişe Yerleştirme
for (let i = 0; i < 4; i++) {
    if (wallAdjacentTiles.length === 0) break;
    const randomIndex = Math.floor(Math.random() * wallAdjacentTiles.length);
    const pos = wallAdjacentTiles[randomIndex];
    const bottle = new THREE.Mesh(makeBottleGeo(), bottleMaterial);
    bottle.position.set(pos.x, 0, pos.z);
    bottle.rotation.y = Math.random() * Math.PI * 2;
    const glow = new THREE.PointLight(0x226622, 0.35, 2.5);
    glow.position.y = 0.1;
    bottle.add(glow);
    bottle.userData.type = 'bottle';
    throwables.group.add(bottle);
    wallAdjacentTiles.splice(randomIndex, 1);
}

scene.add(walls, doors, keys, throwables.group);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshStandardMaterial({ map: ceilingTexture, roughness: 0.9 }));
ceiling.position.y = wallHeight;
ceiling.rotation.x = Math.PI / 2;
scene.add(ceiling);

// =============================================================================
// 8. OLAY DİNLEYİCİLER
// =============================================================================
// Ses çarpanları (ayarlar ekranından ayarlanır)
const volumeState = {
    musicMult: 0.30,
    sfxMult: 0.80,
    musicBase: { backgroundMusic: 0.3, tenseMusic: 0.4, ambientWind: 0.45, victoryMusic: 0.5, deathMusic: 0.6 },
    sfxBase: { walkSound: 1.0, sprintSound: 1.0, screamSound: 1.0, keyPickupSound: 1.0,
               doorOpenSound: 0.9, doorCloseSound: 0.9, doorSlamSound: 0.9, bottleBreakSound: 0.8,
               fakeEntitySound: 0.7, giggleSound: 0.7, aiDoorOpenSound: 0.9, behindSound: 0.7,
               scratchSound: 0.35, itemPickupSound: 1.0 }
};

function applyMusicVolume(mult) {
    const m = mult / 100;
    const set = (snd, base) => { try { if (snd) snd.volume = base * m; } catch(e){} };
    set(backgroundMusic, volumeState.musicBase.backgroundMusic);
    set(tenseMusic,      volumeState.musicBase.tenseMusic);
    set(ambientWind,     volumeState.musicBase.ambientWind);
    set(victoryMusic,    volumeState.musicBase.victoryMusic);
    set(deathMusic,      volumeState.musicBase.deathMusic);
    try { if (soundState.background2) soundState.background2.volume = 0.45 * m; } catch(e){}
}

function applySFXVolume(mult) {
    const m = mult / 100;
    const b = volumeState.sfxBase;
    const set = (snd, base) => { try { if (snd) snd.volume = base * m; } catch(e){} };
    set(walkSound, b.walkSound); set(sprintSound, b.sprintSound);
    set(screamSound, b.screamSound); set(keyPickupSound, b.keyPickupSound);
    set(doorOpenSound, b.doorOpenSound); set(doorCloseSound, b.doorCloseSound);
    set(doorSlamSound, b.doorSlamSound); set(bottleBreakSound, b.bottleBreakSound);
    set(fakeEntitySound, b.fakeEntitySound); set(giggleSound, b.giggleSound);
    set(aiDoorOpenSound, b.aiDoorOpenSound); set(behindSound, b.behindSound);
    set(scratchSound, b.scratchSound); set(itemPickupSound, b.itemPickupSound);
}

// Settings paneli JS
const settingsButton = document.getElementById('settings-button');
const settingsPanel = document.getElementById('settings-panel');
const mainMenuContent = document.getElementById('main-menu-content');
const settingsBack = document.getElementById('settings-back');
const volMusicSlider = document.getElementById('vol-music');
const volSFXSlider = document.getElementById('vol-sfx');
const volMusicVal = document.getElementById('vol-music-val');
const volSFXVal = document.getElementById('vol-sfx-val');

if (settingsButton) settingsButton.addEventListener('click', () => {
    if (mainMenuContent) mainMenuContent.style.display = 'none';
    if (settingsPanel) settingsPanel.classList.add('visible');
});
if (settingsBack) settingsBack.addEventListener('click', () => {
    if (settingsPanel) settingsPanel.classList.remove('visible');
    if (mainMenuContent) mainMenuContent.style.display = 'flex';
});
if (volMusicSlider) volMusicSlider.addEventListener('input', () => {
    const v = parseInt(volMusicSlider.value);
    if (volMusicVal) volMusicVal.textContent = v + '%';
    applyMusicVolume(v);
});
if (volSFXSlider) volSFXSlider.addEventListener('input', () => {
    const v = parseInt(volSFXSlider.value);
    if (volSFXVal) volSFXVal.textContent = v + '%';
    applySFXVolume(v);
});

// Key counter yardımcısı
const keyCountTextEl = document.getElementById('key-count-text');
function updateKeyCounterUI(flash = false) {
    if (keyCountTextEl) {
        keyCountTextEl.textContent = keysCollected + ' / ' + TOTAL_KEYS;
        if (flash) {
            keyCountTextEl.classList.remove('key-flash');
            void keyCountTextEl.offsetWidth;
            keyCountTextEl.classList.add('key-flash');
        }
    }
}

function setHudVisible(visible) {
    const disp = visible ? '' : 'none';
    const staminaContainer = document.getElementById('stamina-container');
    if (staminaContainer) staminaContainer.style.display = disp;
    if (keyCounterElement) keyCounterElement.style.display = disp;
    const inventoryUI = document.getElementById('inventory-ui');
    if (inventoryUI) inventoryUI.style.display = disp;
    // .crosshair'in CSS varsayılanı display:none — inline style'ı '' yapmak bunu EZMEZ, gizli kalır.
    // Açıkça 'block'/'none' vermek gerekiyor.
    const crosshairEl = document.querySelector('.crosshair');
    if (crosshairEl) crosshairEl.style.display = visible ? 'block' : 'none';
    if (flashlightStunContainer) flashlightStunContainer.style.display = disp;
    if (interactionHint) interactionHint.style.display = disp;
    if (objectiveMarker) objectiveMarker.style.display = disp;
}

// PointerLockControls.lock() içeride requestPointerLock()'un döndürdüğü promise'i hiç yakalamıyor
// (three.js'in resmi kütüphanesinde de böyle — kütüphaneye dokunulmuyor). Reddedilirse "Uncaught
// (in promise) SecurityError" konsola düşüyordu. Promise'i burada doğrudan yakalıyoruz.
function requestPointerLockSafe() {
    try {
        const p = controls.domElement.requestPointerLock();
        if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (e) {}
}

startButton.addEventListener('click', () => {
    startScreen.style.display = 'none';
    requestPointerLockSafe();
    try { if (backgroundMusic) backgroundMusic.play().catch(() => {}); } catch (e) {}

    // Fener kapalı başlasın — sinematik açacak
    flashlightOn = false;
    flashlight.visible = false;

    // Entity uzakta beklesin — sinematik konumlandıracak
    const _startPlayerPos = controls.getObject().position;
    const _farTiles = walkableTiles.filter(p => p.distanceTo(_startPlayerPos) > 28);
    const _sp = (_farTiles.length > 0 ? _farTiles : walkableTiles)[Math.floor(Math.random() * (_farTiles.length > 0 ? _farTiles : walkableTiles).length)];
    const enemyPos = the_entity.mesh.position;
    enemyPos.copy(_sp); enemyPos.y = 1.1;
    setEntityVisibility(false, false);

    // Sinematik başlat — fare inputunu kilitle
    controls.enabled = false;
    cinematicPlaying = true;
    cinematic.time = 0;
    cinematic.startYaw = controls.getObject().rotation.y;
    cinematic.entitySent = false;
    cinematic.entityVanished = false;
    cinematic.vanishWait = 0;
    cinematic.textPhase = -1;

    // HUD'u gizle — oyun başlayınca gösterilecek
    setHudVisible(false);

    // Metin overlay'i göster
    const cOverlay = document.getElementById('cinematic-overlay');
    if (cOverlay) { cOverlay.style.display = 'flex'; cOverlay.style.opacity = '1'; }
    const cText = document.getElementById('cinematic-text');
    if (cText) cText.textContent = '';

    setNewPatrolTarget();
    updateKeyCounterUI();
});

pauseScreen.addEventListener('click', () => {
    requestPointerLockSafe();
});

function pauseAllGameSounds() {
    pauseAllSounds();
}

function resumeAllGameSounds() {
    if (!gameRunning) return;
    if (soundState.phase === 'normal') {
        try { if (backgroundMusic && backgroundMusic.paused) backgroundMusic.play().catch(() => {}); } catch (e) {}
    } else if (soundState.phase === 'post-keys') {
        try { if (ambientWind && ambientWind.paused) ambientWind.play().catch(() => {}); } catch (e) {}
    } else if (soundState.phase === 'escape') {
        try { if (soundState.background2 && soundState.background2.paused) soundState.background2.play().catch(() => {}); } catch (e) {}
    }
    try { if (the_entity && !the_entity.isVisible && tenseMusic && tenseMusic.paused) tenseMusic.play().catch(() => {}); } catch (e) {}
}

document.addEventListener('pointerlockerror', () => {
    console.warn('Pointer Lock API hatası.');
    try { pauseAllGameSounds(); } catch (e) {}
    try { pauseScreen.style.display = 'flex'; } catch (e) {}
});

controls.addEventListener('lock', () => {
    if (!gameOver) {
        pauseScreen.style.display = 'none';
        gameRunning = true;
        resumeAllGameSounds();

        // Nişangahı sadece giriş sinematiği bittiyse göster — sinematik sırasında gizli kalmalı
        if (!cinematicPlaying) {
            const ch = document.querySelector('.crosshair');
            if (ch) ch.style.display = 'block';
        }
    }
});

controls.addEventListener('unlock', () => {
    if (!gameOver) {
        pauseScreen.style.display = 'flex';
        gameRunning = false;
        manageFootstepSounds(null);
        pauseAllGameSounds();
        
        // YENİ: Duraklatınca nişangahı gizle
        const ch = document.querySelector('.crosshair');
        if (ch) ch.style.display = 'none';
    }
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

restartButtons.forEach(button => button.addEventListener('click', () => location.reload()));

document.addEventListener('keydown', (e) => {
    keyboard[e.code] = true;
    if (cinematicPlaying) return;
    if (['Digit1', 'Digit2', 'Digit3'].includes(e.code) && gameRunning) {
        player.activeSlot = parseInt(e.code.slice(-1)) - 1;
        updateInventoryUI();
    }
});

document.addEventListener('keyup', (e) => {
    keyboard[e.code] = false;
    if (cinematicPlaying) return;
    // V7: Fener kilidi aktifse F tuşu çalışmaz
    if (e.code === 'KeyF' && !flashlightDisabled) {
        flashlightOn = !flashlightOn;
        flashlight.visible = flashlightOn;
    }
    if (e.code === 'KeyE' && gameRunning) handleInteraction();
    if (e.code === 'KeyG' && player.isAiming) handleThrow();
});

// =============================================================================
// 9. YARDIMCI FONKSİYONLAR
// =============================================================================
function handleInteraction() {
    raycaster.setFromCamera(_centerVec2, camera);
    const objectsToTest = [...doorMeshes, ...throwables.group.children];
    const intersects = raycaster.intersectObjects(objectsToTest, false);
    if (intersects.length > 0 && intersects[0].distance < 3) {
        const object = intersects[0].object;
        if (object.userData.pivot) {
            const pivot = object.userData.pivot;
            // Kilidi açık çıkış kapısına basılınca kazanma sinematiği
            if (pivot.userData.isExit && !pivot.userData.isExitLocked && keysCollected >= TOTAL_KEYS) {
                triggerWin();
                return;
            }
            interactWithDoor(pivot, false);
        } else if (object.userData.type === 'bottle') {
            const emptySlot = player.inventory.indexOf(null);
            if (emptySlot !== -1) {
                player.inventory[emptySlot] = 'bottle';
                throwables.group.remove(object);
                if (itemPickupSound) itemPickupSound.play().catch(() => {});
                updateInventoryUI();
            }
        }
    }
}

function handleThrow() {
    player.isAiming = false;
    if (throwables.aimLine) camera.remove(throwables.aimLine);
    throwables.aimLine = null;
    const currentItem = player.inventory[player.activeSlot];
    if (currentItem) {
        entityMemory.profile.bottlesThrown++;
        const thrownObject = new THREE.Mesh(makeBottleGeo(), bottleMaterial);
        const playerPos = controls.getObject().position;
        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        thrownObject.position.copy(playerPos).add(camDir.clone().multiplyScalar(0.5));
        const velocity = camDir.multiplyScalar(15);
        velocity.y += 2;
        throwables.thrownGroup.push({ mesh: thrownObject, velocity: velocity });
        scene.add(thrownObject);
        player.inventory[player.activeSlot] = null;
        updateInventoryUI();
    }
}

function updateInventoryUI() {
    if (throwables.heldObject) {
        camera.remove(throwables.heldObject);
        throwables.heldObject = null;
    }
    const currentItem = player.inventory[player.activeSlot];
    if (currentItem === 'bottle') {
        const heldBottle = new THREE.Mesh(makeBottleGeo(0.75), bottleMaterial);
        heldBottle.position.set(0.18, -0.22, -0.28);
        heldBottle.rotation.z = Math.PI / 2.2;
        heldBottle.rotation.x = -0.2;
        camera.add(heldBottle);
        throwables.heldObject = heldBottle;
    }
    for (let i = 0; i < 3; i++) {
        inventorySlotsUI[i].textContent = player.inventory[i] ? 'Şişe' : '';
        const slotEl = document.getElementById(`slot-${i + 1}`) || { classList: { toggle: () => {} } };
        slotEl.classList.toggle('active', i === player.activeSlot);
    }
}

function canFakeEntitySeePlayer() {
    if (!hallucinationManager.fakeEntity) return false;
    const fakePos = hallucinationManager.fakeEntity.position.clone();
    fakePos.y = 1.5;
    const playerPos = controls.getObject().position.clone();

    if (fakePos.distanceTo(playerPos) > 30) return false;

    const direction = playerPos.clone().sub(fakePos).normalize();
    const distance = fakePos.distanceTo(playerPos);

    raycaster.set(fakePos, direction);
    const objectsToTest = [...walls.children, ...doorMeshes];
    const intersects = raycaster.intersectObjects(objectsToTest);

    if (intersects.length > 0) {
        if (intersects[0].distance < distance) return false;
    }
    return true;
}

// Oyuncu sahte entity'ye bakıyor mu? (DECTED durumu için)
function isPlayerLookingAtFakeEntity(playerPos) {
    if (!hallucinationManager.fakeEntity || !hallucinationManager.isActive) return false;
    const fakePos = hallucinationManager.fakeEntity.position;
    const distanceSq = playerPos.distanceToSquared(fakePos);
    if (distanceSq > 400) return false; // 20m yarıçap
    const toFake = fakePos.clone().sub(playerPos).normalize();
    camera.getWorldDirection(cachedCameraDirection);
    const dot = cachedCameraDirection.dot(toFake);
    if (dot < 0.75) return false; // ~41° koni
    raycaster.set(playerPos, cachedCameraDirection);
    const objectsToTest = [...walls.children, ...doorMeshes.filter(d => !d.userData.pivot.userData.isOpen)];
    const intersects = raycaster.intersectObjects(objectsToTest);
    if (intersects.length > 0 && intersects[0].distance * intersects[0].distance < distanceSq) return false;
    return true;
}

function updateHallucinations(delta, playerPos) {
    if (!gameRunning || entityFrozen) return;

    if (!hallucinationManager.isActive) {
        hallucinationManager.timer -= delta;
        if (hallucinationManager.timer <= 0) {
            const spawnPoints = walkableTiles.filter(p => {
                const distance = p.distanceTo(playerPos);
                return distance > 15 && distance < 40;
            });

            if (spawnPoints.length > 0) {
                const spawnPoint = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
                hallucinationManager.fakeEntity.position.copy(spawnPoint);
                hallucinationManager.fakeEntity.position.y = 1.6;
                hallucinationManager.fakeEntity.lookAt(playerPos.x, 1.6, playerPos.z);
                scene.add(hallucinationManager.fakeEntity);
                hallucinationManager.isActive = true;
                hallucinationManager.state = 'WANDERING';
                hallucinationManager.wanderTarget = spawnPoint.clone();
                hallucinationManager.glitchTimer = 0;
                hallucinationManager.detectionTimer = 0;
                fakeEntityPathfinding.path = [];
            } else {
                hallucinationManager.timer = 5;
            }
        }
        return;
    }

    const fakeEntity = hallucinationManager.fakeEntity;
    const fakePos = fakeEntity.position;
    const hoverY = 1.6;
    if (Math.abs(fakePos.y - hoverY) > 0.05) {
        fakePos.y += (hoverY - fakePos.y) * delta * 3;
    }

    // Histerezis: koni sınırındaki ufak kamera titreşimleri DECTED↔CHARGING'i anlık tetiklemesin
    // (5 saniyelik yakalama sayacının bir kare titremeyle sıfırlanmaması için de gerekli).
    const playerLooking = updateSmoothedLook(hallucinationManager, isPlayerLookingAtFakeEntity(playerPos), delta);

    // Sahte entity'nin A*'ı yok, düz çizgi hareket ediyor — kapalı bir kapıya denk gelirse
    // (gerçek entity'nin aksine) hiç açmadığı için kapıya yapışıp kalıyordu. WANDERING/CHARGING
    // sırasında yakın kapıyı açarak bu takılmayı önlüyoruz.
    if (hallucinationManager.state === 'WANDERING' || hallucinationManager.state === 'CHARGING') {
        for (const _dm of doorMeshes) {
            const _pivot = _dm.userData.pivot;
            if (_pivot.userData.isOpen || _pivot.userData.isExit) continue;
            if (fakePos.distanceTo(_pivot.position) < 3.0) {
                interactWithDoor(_pivot, true);
            }
        }
    }

    if (hallucinationManager.state === 'WANDERING') {
        if (fakePos.distanceTo(hallucinationManager.wanderTarget) < 1) {
            const angle = Math.random() * Math.PI * 2;
            hallucinationManager.wanderTarget.x = fakePos.x + Math.cos(angle) * 5;
            hallucinationManager.wanderTarget.z = fakePos.z + Math.sin(angle) * 5;
        }

        // Gerçek entity gibi A* ile dolaşıyor (eskiden düz-çizgi kayma ile duvarlara sürtünüyordu)
        const wp = entityGetNextWaypoint(fakePos, hallucinationManager.wanderTarget, delta, fakeEntityPathfinding, false);
        const moveDir = new THREE.Vector3(wp.x - fakePos.x, 0, wp.z - fakePos.z);
        if (moveDir.length() > 0.1) {
            moveDir.normalize();
            const moveStep = moveDir.clone().multiplyScalar(delta * 1.5);
            const nextX = fakePos.clone().add(new THREE.Vector3(moveStep.x, 0, 0));
            const nextZ = fakePos.clone().add(new THREE.Vector3(0, 0, moveStep.z));

            if (!checkCollision(nextX, new THREE.Vector3(0.5, 1.8, 0.5))) fakePos.x = nextX.x;
            if (!checkCollision(nextZ, new THREE.Vector3(0.5, 1.8, 0.5))) fakePos.z = nextZ.z;

            fakeEntity.lookAt(fakePos.x + moveDir.x, fakePos.y, fakePos.z + moveDir.z);
        }

        if (canFakeEntitySeePlayer() && playerLooking) {
            hallucinationManager.state = 'DECTED';
            fakeEntity.lookAt(playerPos.x, fakeEntity.position.y, playerPos.z);
            if (fakeEntitySound) {
                fakeEntitySound.currentTime = 0;
                fakeEntitySound.play().catch(() => {});
            }
        }
    } else if (hallucinationManager.state === 'DECTED') {
        // Weeping angel: oyuncu bakarken donar. FAKE_ENTITY_CAPTURE_DURATION kadar (5sn) KESİNTİSİZ
        // bakılırsa "yakalama" tamamlanır ve saldırıya geçer (CHARGING). Süre dolmadan bakış kesilirse
        // oyuncu kazanır — sahte entity kaybolup başka bir yere ışınlanır ve dolaşmaya devam eder.
        fakeEntity.lookAt(playerPos.x, fakeEntity.position.y, playerPos.z);
        if (playerLooking) {
            hallucinationManager.detectionTimer += delta;
            if (hallucinationManager.detectionTimer >= FAKE_ENTITY_CAPTURE_DURATION) {
                hallucinationManager.state = 'CHARGING';
                hallucinationManager.chargeDirection.copy(playerPos).sub(fakePos).normalize();
                hallucinationManager.detectionTimer = 0;
            }
        } else {
            hallucinationManager.detectionTimer = 0;
            const relocatePts = walkableTiles.filter(p => {
                const d = p.distanceTo(playerPos);
                return d > 15 && d < 40;
            });
            if (relocatePts.length > 0) {
                const rp = relocatePts[Math.floor(Math.random() * relocatePts.length)];
                fakePos.copy(rp);
                fakePos.y = hoverY;
            }
            fakeEntityPathfinding.path = [];
            hallucinationManager.wanderTarget.copy(fakePos);
            hallucinationManager.state = 'WANDERING';
            if (fakeEntitySound) { fakeEntitySound.currentTime = 0; fakeEntitySound.play().catch(() => {}); }
        }
    } else if (hallucinationManager.state === 'CHARGING') {
        const chargeDir = playerPos.clone().sub(fakePos).normalize();
        hallucinationManager.chargeDirection.copy(chargeDir);
        const chargeSpeed = 13.5; // 1.5x (9.0 * 1.5)
        const moveStep = chargeDir.multiplyScalar(chargeSpeed * delta);
        const nextX = fakePos.clone().add(new THREE.Vector3(moveStep.x, 0, 0));
        const nextZ = fakePos.clone().add(new THREE.Vector3(0, 0, moveStep.z));

        if (!checkCollision(nextX, new THREE.Vector3(0.5, 1.8, 0.5))) fakePos.x = nextX.x;
        if (!checkCollision(nextZ, new THREE.Vector3(0.5, 1.8, 0.5))) fakePos.z = nextZ.z;

        fakeEntity.lookAt(playerPos.x, fakeEntity.position.y, playerPos.z);

        // Oyuncu tekrar bakarsa don
        if (playerLooking) {
            hallucinationManager.state = 'DECTED';
        }

        // Yaklaştıysa → GLITCH'e geç
        if (fakePos.distanceTo(playerPos) < 2.0) {
            hallucinationManager.state = 'GLITCH';
            hallucinationManager.glitchTimer = 5.0;
            document.body.classList.add('glitch-active');
            if (screamSound) screamSound.play().catch(() => {});
        }
    } else if (hallucinationManager.state === 'GLITCH') {
        hallucinationManager.glitchTimer -= delta;
        // Sahte entity oyuncunun etrafında hızlıca dönsün (glitch efekti)
        const orbitAngle = Date.now() * 0.008;
        const orbitDist = 2.5 + Math.sin(Date.now() * 0.003) * 0.5;
        fakePos.x = playerPos.x + Math.cos(orbitAngle) * orbitDist;
        fakePos.z = playerPos.z + Math.sin(orbitAngle) * orbitDist;
        fakeEntity.lookAt(playerPos.x, fakeEntity.position.y, playerPos.z);

        if (hallucinationManager.glitchTimer <= 0) {
            // GLITCH bitti → sahte entity ölür (kaybolur)
            document.body.classList.remove('glitch-active');
            scene.remove(fakeEntity);
            hallucinationManager.isActive = false;
            hallucinationManager.timer = 25 + Math.random() * 20;
            // Score bonusu: her avlanma +1 azaltır bekleme süresini
            hallucinationManager.timer -= entityMemory.score * 1.5;
            hallucinationManager.state = 'IDLE';
            hallucinationManager.glitchTimer = 0;
            hallucinationManager.detectionTimer = 0;
            fakeEntityPathfinding.path = [];
            if (screamSound) screamSound.play().catch(() => {});
        }
    }
}

function distractEntity(position, fromHallucination = false) {
    if (entityFrozen) return;
    // Pusu (AMBUSH), kombo bloğunun zaten koruduğu gibi dikkat dağıtmayla da bozulmasın — tutarlılık
    if (the_entity.state === 'AMBUSH') return;
    // Çok şişe atıldıysa entity öğrendi, giderek daha az kandırılıyor
    if (!fromHallucination) {
        const ignoreChance = Math.min(0.65, entityMemory.profile.bottlesThrown * 0.1);
        if (Math.random() < ignoreChance) return;
    }
    if (the_entity.state !== 'HUNTING' || fromHallucination) {
        the_entity.state = 'SEARCHING';
        the_entity.targetPosition.copy(position);
        the_entity.searchTimer = 15;
        the_entity.lastKnownPlayerPosition = position.clone();
        the_entity.searchStage = 0;
        the_entity.searchStageTimer = 4;
    }
}

// Hafıza güncelleme — her frame çağrılır
function updateMemory(delta, playerPos) {
    if (!gameRunning || gameOver) return;

    entityMemory.profile.totalFrames++;
    if (keyboard['ShiftLeft'] && !player.isCrouching) entityMemory.profile.sprintFrames++;

    // Isı haritası: her 1.5sn'de bir mevcut tile'ı say
    entityMemory.heatTimer -= delta;
    if (entityMemory.heatTimer <= 0) {
        entityMemory.heatTimer = 1.5;
        const k = `${Math.round(playerPos.x / wallSize)},${Math.round(playerPos.z / wallSize)}`;
        entityMemory.heatmap.set(k, (entityMemory.heatmap.get(k) || 0) + 1);
    }

    // Pozisyon geçmişi: her 0.3sn'de bir snapshot
    entityMemory.histTimer -= delta;
    if (entityMemory.histTimer <= 0) {
        entityMemory.histTimer = 0.3;
        entityMemory.posHistory.push(playerPos.clone());
        if (entityMemory.posHistory.length > 30) entityMemory.posHistory.shift();
    }
}

// Avlanma bitti — oyuncu kaçtı
function onHuntEnded(playerPos) {
    entityMemory.huntCount++;
    entityMemory.score = Math.min(10, Math.floor(entityMemory.huntCount / 1.5));

    // Kaçış yönünü kaydet
    const h = entityMemory.posHistory;
    if (h.length >= 6) {
        const dir = h[h.length - 1].clone().sub(h[Math.max(0, h.length - 6)]).normalize();
        entityMemory.escapedDirs.push(dir);
        if (entityMemory.escapedDirs.length > 5) entityMemory.escapedDirs.shift();
    }
}

// En sık ziyaret edilen tile (hot spot) — patrol için
function getMemoryHotSpot() {
    if (entityMemory.heatmap.size < 4) return null;
    let bestKey = null, bestCount = 0;
    entityMemory.heatmap.forEach((count, key) => {
        if (count > bestCount) { bestCount = count; bestKey = key; }
    });
    if (!bestKey) return null;
    const [cx, cz] = bestKey.split(',').map(Number);
    const target = new THREE.Vector3(cx * wallSize, 1, cz * wallSize);
    return walkableTiles.reduce((a, b) => a.distanceTo(target) < b.distanceTo(target) ? a : b);
}

// Oyuncunun gideceği yeri tahmin et (predictive hunting)
function getPredictedPlayerPos(playerPos) {
    const h = entityMemory.posHistory;
    if (h.length < 6) return playerPos.clone();
    const vel = h[h.length - 1].clone().sub(h[Math.max(0, h.length - 6)]);
    const predicted = playerPos.clone().add(vel.multiplyScalar(2.8));
    const maxX = (mazeLayout[0].length - 2) * wallSize;
    const maxZ = (mazeLayout.length - 2) * wallSize;
    predicted.x = Math.max(wallSize, Math.min(predicted.x, maxX));
    predicted.z = Math.max(wallSize, Math.min(predicted.z, maxZ));
    return predicted;
}

function updateThrownObjects(delta) {
    for (let i = throwables.thrownGroup.length - 1; i >= 0; i--) {
        const obj = throwables.thrownGroup[i];
        obj.velocity.y -= GRAVITY * delta;
        obj.mesh.position.add(obj.velocity.clone().multiplyScalar(delta));

        // V7.3: Canavara Çarpma Kontrolü (Stun Mekaniği)
        const bottleBox = new THREE.Box3().setFromObject(obj.mesh);
        const entityBox = new THREE.Box3().setFromObject(the_entity.mesh);

        // Fener-tabanlı sersemletme "görmeden etkileşemezsin" ilkesine bağlı (isPlayerLookingAtEnemy
        // görünürlüğü zaten kontrol ediyor); şişe çarpması bunu es geçip görünmez/pusudaki entity'yi
        // kör atışla sersemletebiliyordu — isVisible şartı ekleniyor.
        if (the_entity.isVisible && bottleBox.intersectsBox(entityBox) && !the_entity.isStunned) {
            the_entity.isStunned = true;
            the_entity.stunTimer = 6.0; // Aga 6 saniye bayılıyor oki?
            if (bottleBreakSound) bottleBreakSound.play();
            scene.remove(obj.mesh);
            throwables.thrownGroup.splice(i, 1);
            continue;
        }

        // Yere Çarpma Kontrolü
        if (obj.mesh.position.y < 0.15) {
            if (bottleBreakSound) bottleBreakSound.play();
            distractEntity(obj.mesh.position);
            scene.remove(obj.mesh);
            throwables.thrownGroup.splice(i, 1);
        }
    }
}

function checkCollision(position, hitbox, isPlayer = false, phaseDoors = false) {
    const adjustedHitbox = hitbox.clone();
    if (isPlayer) {
        adjustedHitbox.x = Math.max(0.1, adjustedHitbox.x - 0.05);
        adjustedHitbox.z = Math.max(0.1, adjustedHitbox.z - 0.05);
    }
    const objectBox = new THREE.Box3().setFromCenterAndSize(position, adjustedHitbox);
    for (const wall of walls.children)
        if (objectBox.intersectsBox(wall.userData.hitbox)) return true;
    for (const doorMesh of doorMeshes) {
        const pivot = doorMesh.userData.pivot;
        if (phaseDoors) continue; // görünmez entity kapıdan geçer (sadece çağıran taraf isterse)
        if (!pivot.userData.isOpen) {
            const doorHitbox = new THREE.Box3().setFromObject(doorMesh);
            if (objectBox.intersectsBox(doorHitbox)) return true;
        }
    }
    if (isPlayer && the_entity.isVisible && !the_entity.isStunned) {
        const entityBox = new THREE.Box3().setFromObject(the_entity.mesh);
        if (objectBox.intersectsBox(entityBox)) return true;
    }
    return false;
}

function interactWithDoor(pivot, isAI) {
    // Canavar (AI) çıkış kapısına ASLA dokunamaz — kilidi açık olsa bile
    if (isAI && pivot && pivot.userData.isExit) return;
    if (pivot && !pivot.userData.isAnimating && !pivot.userData.isExitLocked) {
        const willOpen = !pivot.userData.isOpen;
        if (!willOpen) {
            const doorMesh = pivot.children.find(child => child.isMesh);
            if (doorMesh) {
                const originalRotation = pivot.rotation.y;
                pivot.rotation.y = pivot.userData.closedRotation;
                pivot.updateMatrixWorld(true);
                const doorBox = new THREE.Box3().setFromObject(doorMesh);
                pivot.rotation.y = originalRotation;
                pivot.updateMatrixWorld(true);
                const playerPos = controls.getObject().position.clone();
                const playerBox = new THREE.Box3().setFromCenterAndSize(playerPos, player.hitbox);
                if (doorBox.intersectsBox(playerBox) && !isAI) return;
            }
        }
        pivot.userData.isOpen = willOpen;
        pivot.userData.isAnimating = true;
        if (isAI) {
            if (pivot.userData.isOpen && aiDoorOpenSound) aiDoorOpenSound.play().catch(() => {});
        } else {
            if (pivot.userData.isOpen) { if (doorOpenSound) doorOpenSound.play().catch(() => {}); }
            else { if (doorCloseSound) doorCloseSound.play().catch(() => {}); }
        }
    }
}

function updateDoors(delta) {
    doors.children.forEach(pivot => {
        if (pivot.userData.isAnimating) {
            const targetRotation = pivot.userData.isOpen ? pivot.userData.openRotation : pivot.userData.closedRotation;
            pivot.rotation.y = THREE.MathUtils.lerp(pivot.rotation.y, targetRotation, delta * 10);
            if (Math.abs(pivot.rotation.y - targetRotation) < 0.01) {
                pivot.rotation.y = targetRotation;
                pivot.userData.isAnimating = false;
            }
        }
    });
}

// manageFootstepSounds → sounds.js'den import edildi

function updateInteractionHint(delta) {
    if (!interactionHint) return;
    interactionHintTimer += delta;
    if (interactionHintTimer < 0.1) return;
    interactionHintTimer = 0;
    raycaster.setFromCamera(_centerVec2, camera);
    const objectsToTest = [...doorMeshes, ...throwables.group.children];
    const intersects = raycaster.intersectObjects(objectsToTest, false);
    const crosshairEl = document.querySelector('.crosshair');
    if (intersects.length > 0 && intersects[0].distance < 3) {
        const obj = intersects[0].object;
        const pivot = obj.userData.pivot;
        if (pivot?.userData.isExit && !pivot.userData.isExitLocked && keysCollected >= TOTAL_KEYS) {
            interactionHint.textContent = '[E] Kaç → Ormana';
        } else {
            interactionHint.textContent = '[E] Etkileşim';
        }
        interactionHint.classList.add('visible');
        if (crosshairEl) crosshairEl.classList.add('hover-active');
    } else {
        interactionHint.textContent = '[E] Etkileşim';
        interactionHint.classList.remove('visible');
        if (crosshairEl) crosshairEl.classList.remove('hover-active');
    }
}

function setEntityVisibility(isVisible, playAudio = true) {
    if (the_entity.isVisible === isVisible) {
        the_entity.visibilityTimer = isVisible ? the_entity.timeVisible : the_entity.timeInvisible;
        the_entity.mesh.visible = isVisible;
        if (isVisible && tenseMusic) {
            tenseMusic.pause();
            tenseMusic.currentTime = 0;
        }
        return;
    }
    the_entity.isVisible = isVisible;
    the_entity.mesh.visible = isVisible;
    the_entity.visibilityTimer = isVisible ? the_entity.timeVisible : the_entity.timeInvisible;
    if (isVisible) {
        if (tenseMusic) {
            tenseMusic.pause();
            tenseMusic.currentTime = 0;
        }
        if (playAudio && giggleSound) {
            giggleSound.currentTime = 0;
            giggleSound.play().catch(() => {});
        }
    } else if (tenseMusic) {
        tenseMusic.currentTime = 0;
        tenseMusic.play().catch(() => {});
    }
}

function onAllKeysCollected() {
    try {
        // V7: Fener söndür ve F tuşunu tamamen kilitle
        flashlight.visible = false;
        flashlightOn = false;
        flashlightDisabled = true;
        if (throwables.heldObject) {
            camera.remove(throwables.heldObject);
            throwables.heldObject = null;
        }
    } catch (e) {}
    if (!corridorAmbient) {
        corridorAmbient = new THREE.AmbientLight(0xAAAA88, 0);
        scene.add(corridorAmbient);
    }
    let t = 0;
    const inc = setInterval(() => {
        t += 0.05;
        corridorAmbient.intensity = Math.min(1.2, t);
        if (t >= 1.2) {
            clearInterval(inc);
        }
    }, 100);
    if (exitDoor) {
        const pos = new THREE.Vector3();
        exitDoor.getWorldPosition(pos);
        const forward = new THREE.Vector3(0, 0, 1);
        try { exitDoor.getWorldDirection(forward); } catch (e) {}
        const offset = forward.multiplyScalar(-2);
        the_entity.mesh.position.copy(pos).add(offset);
        the_entity.mesh.position.y = 1.1;

        // Kapı kilitli kalır — yaklaşınca relocation tetiklenecek
    } else if (initialEntityPosition) {
        the_entity.mesh.position.copy(initialEntityPosition);
        the_entity.mesh.position.y = 1.1;
    }
    the_entity.state = 'FROZEN';
    entityFrozen = true;
    frozenEntityPosition = the_entity.mesh.position.clone();
    // Sahte entity varsa kaldır, kaçış aşamasında spawlanmasın
    if (hallucinationManager.isActive) {
        try { scene.remove(hallucinationManager.fakeEntity); } catch(e) {}
        hallucinationManager.isActive = false;
    }
    // isActive=false iken state'in eski bir değerde (WANDERING/DECTED/...) kalması latent bir
    // tutarsızlıktı — şu an zararsız (her yer isActive'e bakıyor) ama netlik için sıfırlanıyor.
    hallucinationManager.state = 'IDLE';
    hallucinationManager.detectionTimer = 0;
    fakeEntityPathfinding.path = [];
    hallucinationManager.timer = 99999;
    try {
        if (backgroundMusic) {
            backgroundMusic.pause();
            backgroundMusic.currentTime = 0;
        }
    } catch (e) {}
    try { if (ambientWind) { ambientWind.play().catch(() => {}); } } catch (e) {}
    soundState.phase = 'post-keys';
}

function relocateExitToRandom() {
    if (!exitDoor) return;

    // 1. Eski kapıyı tamamen kaldır, yerine duvar dokusu koy
    const tc = exitDoor.userData.tileCenter || new THREE.Vector3(exitDoor.position.x, 0, exitDoor.position.z);
    for (let i = doorMeshes.length - 1; i >= 0; i--) {
        if (doorMeshes[i].userData.pivot === exitDoor) doorMeshes.splice(i, 1);
    }
    doors.remove(exitDoor);
    const blockWall = new THREE.Mesh(new THREE.BoxGeometry(wallSize, wallHeight, wallSize), wallMaterial);
    blockWall.position.set(tc.x, wallHeight / 2, tc.z);
    blockWall.userData.hitbox = new THREE.Box3().setFromObject(blockWall);
    walls.add(blockWall);

    // 2. Doğru yönlü kapı spawn noktalarından filtrele (oyuncudan > 20 uzak, eski tile değil)
    const playerPos = controls.getObject().position;
    const possible = doorSpawnPoints.filter(dp =>
        dp.pos.distanceTo(playerPos) > 20 &&
        dp.pos.distanceTo(tc) > 1
    );
    if (possible.length === 0) return;
    const target = possible[Math.floor(Math.random() * possible.length)];

    // 3. Yeni exit door — corridor yönüne göre doğru geometri
    const isV = target.isVertical;
    const newPivot = new THREE.Group();
    const newDoorGeo = isV
        ? new THREE.BoxGeometry(wallSize, wallHeight, 0.4)
        : new THREE.BoxGeometry(0.4, wallHeight, wallSize);
    const newDoorMesh = new THREE.Mesh(newDoorGeo, exitDoorMaterial);

    if (isV) {
        newPivot.position.set(target.pos.x - wallSize / 2, wallHeight / 2, target.pos.z);
        newDoorMesh.position.x = wallSize / 2;
        newPivot.userData = {
            isOpen: false, isAnimating: false,
            closedRotation: 0, openRotation: -Math.PI / 2,
            isExit: true, isExitLocked: false,
            tileCenter: target.pos.clone()
        };
    } else {
        newPivot.position.set(target.pos.x, wallHeight / 2, target.pos.z - wallSize / 2);
        newDoorMesh.position.z = wallSize / 2;
        newPivot.userData = {
            isOpen: false, isAnimating: false,
            closedRotation: 0, openRotation: Math.PI / 2,
            isExit: true, isExitLocked: false,
            tileCenter: target.pos.clone()
        };
    }
    newDoorMesh.userData.pivot = newPivot;
    newPivot.add(newDoorMesh);

    // EXIT yazısı
    const ec = document.createElement('canvas');
    ec.width = 256; ec.height = 64;
    const ectx = ec.getContext('2d');
    ectx.fillStyle = '#90EE90'; ectx.font = 'bold 48px Arial';
    ectx.textAlign = 'center'; ectx.textBaseline = 'middle';
    ectx.fillText('EXIT', 128, 32);
    const etex = new THREE.CanvasTexture(ec);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: etex, transparent: true }));
    sprite.scale.set(2, 0.5, 1);
    sprite.position.set(isV ? wallSize / 2 : 0, wallHeight / 2 + 0.8, isV ? 0 : wallSize / 2);
    newPivot.add(sprite);

    // Yeşil ışık
    const eLight = new THREE.PointLight(0x90EE90, 2.0, 14);
    eLight.position.set(isV ? wallSize / 2 : 0, wallHeight / 2, isV ? 0 : wallSize / 2);
    newPivot.add(eLight);

    doors.add(newPivot);
    doorMeshes.push(newDoorMesh);
    exitDoor = newPivot;

    if (exitMarker) {
        exitMarker.position.set(target.pos.x, exitMarker.position.y, target.pos.z);
        if (exitMarker.material) exitMarker.material.color.set(0x90EE90);
    }
    objectiveTargetPosition = new THREE.Vector3(target.pos.x, 1.8, target.pos.z);
}

function startEscapeCountdown() {
    escapeCountdown = ESCAPE_COUNTDOWN_SECONDS;
    escapeCountdownActive = true;
    objectiveMarker.classList.add('objective-marker-visible');
    try { countdownTimerEl.style.display = 'block'; } catch (e) {}
    try {
        if (corridorAmbient) {
            corridorAmbient.color.set(0xff4444);
            corridorAmbient.intensity = Math.max(corridorAmbient.intensity, 0.8);
        }
    } catch (e) {}
    try {
        if (ambientWind) {
            ambientWind.pause();
            ambientWind.currentTime = 0;
        }
    } catch (e) {}
    try { if (soundState.background2) { soundState.background2.play().catch(() => {}); } } catch (e) {}
    soundState.phase = 'escape';
}

const _CINEMATIC_LINES = [
    'Gözlerini açtığında buradaydın.',
    'Ne zaman geldiğini bilmiyorsun.',
    'Ama o... hep buradaydı.',
    'Seni burada bırakmayacak.'
];

function updateCinematic(delta, playerPos) {
    cinematic.time += delta;
    const t = cinematic.time;
    const rig = controls.getObject();
    const enemyPos = the_entity.mesh.position;
    const cText = document.getElementById('cinematic-text');
    const cOverlay = document.getElementById('cinematic-overlay');

    // --- METİN FAZLARI (t=0 → 10, her satır 2.5s) ---
    const newPhase = Math.min(Math.floor(t / 2.5), _CINEMATIC_LINES.length - 1);
    if (t < 10.0 && newPhase !== cinematic.textPhase) {
        cinematic.textPhase = newPhase;
        if (cText) {
            cText.style.opacity = '0';
            setTimeout(() => {
                if (cText) { cText.textContent = _CINEMATIC_LINES[newPhase]; cText.style.opacity = '1'; }
            }, 200);
        }
    }

    // --- OVERLAY KARARMA (t=10 → 11.5) ---
    if (t >= 10.0 && cOverlay && parseFloat(cOverlay.style.opacity) > 0) {
        const fadeT = Math.min((t - 10.0) / 1.5, 1);
        cOverlay.style.opacity = String(1 - fadeT);
        if (fadeT >= 1) { cOverlay.style.display = 'none'; }
    }

    // --- SAĞA BAK (t=12.5 → 14) ---
    if (t >= 12.5 && t < 14.0) {
        const tgt = cinematic.startYaw - 0.5;
        rig.rotation.y = THREE.MathUtils.lerp(rig.rotation.y, tgt, 2.5 * delta);
    }

    // --- SOLA BAK (t=14 → 15.5) ---
    if (t >= 14.0 && t < 15.5) {
        const tgt = cinematic.startYaw + 0.5;
        rig.rotation.y = THREE.MathUtils.lerp(rig.rotation.y, tgt, 2.5 * delta);
    }

    // --- MERKEZE DÖN (t=15.5 → 16) ---
    if (t >= 15.5 && t < 16.0) {
        rig.rotation.y = THREE.MathUtils.lerp(rig.rotation.y, cinematic.startYaw, 4 * delta);
    }

    // --- FENER ÇAKIYOR (t=16 → 16.6): karanlıkta çakmaya çalışıyor ---
    if (t >= 16.0 && t < 16.6) {
        flashlightOn = true;
        flashlight.visible = true;
        flashlight.intensity = Math.random() < 0.45 ? 0 : 0.15 + Math.random() * 1.2;
    } else if (t >= 16.6 && t < 18.0) {
        // Fener söndü — entity gelene kadar karanlık
        flashlightOn = false;
        flashlight.visible = false;
        flashlight.intensity = 0;
    }

    // --- ARKAYA DÖN (t=16.8 → 18.5) ---
    if (t >= 16.8 && t < 18.5) {
        const tgt = cinematic.startYaw + Math.PI;
        rig.rotation.y = THREE.MathUtils.lerp(rig.rotation.y, tgt, 3.5 * delta);
    }

    // --- ENTİTY ARKADA BELIR (t=18) ---
    if (t >= 18.0 && !cinematic.entitySent && !cinematic.entityVanished) {
        cinematic.entitySent = true;
        const fwd = new THREE.Vector3();
        camera.getWorldDirection(fwd);
        const targetPos = playerPos.clone().add(fwd.clone().multiplyScalar(16));
        let closest = walkableTiles[0], closestDist = Infinity;
        for (const tile of walkableTiles) {
            const d = tile.distanceTo(targetPos);
            if (d < closestDist) { closestDist = d; closest = tile; }
        }
        enemyPos.copy(closest); enemyPos.y = 1.1;
        entityPathfinding.path = [];
        setEntityVisibility(true);
        // Entity belirince fener ve entity ışığı aç
        flashlightOn = true;
        flashlight.visible = true;
        flashlight.intensity = 1.5;
        the_entity.eyeLight.intensity = 5;
        the_entity.eyeLight.color.set(0xff2200);
    }

    // --- ENTİTY KOŞAR ---
    if (cinematic.entitySent && !cinematic.entityVanished) {
        const dist = enemyPos.distanceTo(playerPos);
        // Entity ışığı koşarken titreşiyor
        the_entity.eyeLight.intensity = 4.0 + Math.sin(Date.now() * 0.02) * 1.5;
        if (dist < 3.5) {
            // Yanımıza geldi → kaybol, fener de sönsün
            cinematic.entityVanished = true;
            flashlightOn = false;
            flashlight.visible = false;
            flashlight.intensity = 0;
            the_entity.eyeLight.intensity = 0;
            const farPts = walkableTiles.filter(p => p.distanceTo(playerPos) > 25);
            if (farPts.length > 0) {
                const fp = farPts[Math.floor(Math.random() * farPts.length)];
                enemyPos.copy(fp); enemyPos.y = 1.1;
                entityPathfinding.path = [];
            }
            setEntityVisibility(false, false);
        } else {
            const runSpeed = the_entity.huntSpeed * 1.6;
            const wp = entityGetNextWaypoint(enemyPos, playerPos, delta);
            const dir = new THREE.Vector3(wp.x - enemyPos.x, 0, wp.z - enemyPos.z);
            if (dir.length() > 0.1) {
                dir.normalize();
                const mv = dir.clone().multiplyScalar(runSpeed * delta);
                _tmpVec3A.copy(enemyPos).add(_tmpVec3B.set(mv.x, 0, 0));
                if (!checkCollision(_tmpVec3A, the_entity.hitbox, false, !the_entity.isVisible)) enemyPos.x = _tmpVec3A.x;
                _tmpVec3A.copy(enemyPos).add(_tmpVec3B.set(0, 0, mv.z));
                if (!checkCollision(_tmpVec3A, the_entity.hitbox, false, !the_entity.isVisible)) enemyPos.z = _tmpVec3A.z;
            }
            // Three.js'te Group/Object3D lookAt zaten +Z'yi (yüz) hedefe çevirir — flip YOK
            the_entity.mesh.lookAt(playerPos.x, enemyPos.y, playerPos.z);
        }
    }

    // --- SİNEMATİK BİTİŞİ ---
    if (cinematic.entityVanished) {
        cinematic.vanishWait += delta;
        if (cinematic.vanishWait > 0.5) {
            _endCinematic(playerPos);
        }
    } else if (t >= 23) {
        // Timeout (entity gelmediyse)
        const farPts = walkableTiles.filter(p => p.distanceTo(playerPos) > 25);
        if (farPts.length > 0) {
            const fp = farPts[Math.floor(Math.random() * farPts.length)];
            enemyPos.copy(fp); enemyPos.y = 1.1; entityPathfinding.path = [];
        }
        setEntityVisibility(false, false);
        _endCinematic(playerPos);
    }
}

function _endCinematic(playerPos) {
    cinematicPlaying = false;
    controls.enabled = true;
    controls.getObject().rotation.y = cinematic.startYaw;
    // Fener geri açılsın
    flashlightOn = true;
    flashlight.visible = true;
    flashlight.intensity = 1.5;
    setHudVisible(true);
    setNewPatrolTarget();
    showObjectiveToast();
    gameStartTime = Date.now();
}

function showObjectiveToast() {
    const el = document.createElement('div');
    el.id = 'objective-toast';
    el.textContent = '— 8 ANAHTARI TOPLA VE KAÇ —';
    document.body.appendChild(el);
    setTimeout(() => {
        el.classList.add('toast-fade-out');
        setTimeout(() => { try { el.remove(); } catch(e){} }, 1200);
    }, 4500);
}

function triggerGameOver() {
    if (gameOver) return;
    gameOver = true;
    gameRunning = false;
    controls.unlock();
    manageFootstepSounds(null);
    pauseAllGameSounds();
    if (objectiveMarker) objectiveMarker.style.display = 'none';

    // Ölüm... başarımı (sadece ilk ölümde)
    if (!deathAchievementUnlocked) {
        deathAchievementUnlocked = true;
        unlockAchievement('GvhQpygAvsg4KRP4n1fV');
    }
    
    // DÜZELTME: Ölünce Nişangahı Gizle
    const ch = document.querySelector('.crosshair');
    if (ch) ch.style.display = 'none';

    fadeToBlackScreen.style.display = 'block';
    setTimeout(() => { fadeToBlackScreen.style.opacity = '1'; }, 10);
    setTimeout(() => { if (screamSound) screamSound.play(); }, 500);
    const startCinematic = () => {
        if (deathMusic) {
            deathMusic.currentTime = 0;
            deathMusic.play().catch(() => {});
        }
        gameOverScreen.style.display = 'flex';
        const hints = [
            // — İnsani —
            "Feneri söndürdüm, karanlıkta bekledi. Ben de bekledim. Saatler geçti. Sonunda benim sesim çıktı.",
            "Sekiz anahtarı topladım. Kapıyı buldum. Elim kolu tutmuyordu artık. Bir adım daha atsaydım belki... ama atmadım.",
            "İlk gördüğümde dondum. Kaçmalıydım, biliyordum. Ama ayaklarım yere yapışmıştı sanki. İkinci kez şans vermedi.",
            "Şişeyi fırlattım, sesi duydu, döndü. O an kaçabilirdim. Ama panikledim. Ve o beni paniklerken buldu.",
            "Buraya girdiğimde harita vardı kafamda. Her şeyi planlamıştım. Plan, onu ilk gördüğüm anda yok oldu.",
            "Duydum onu. Yakındı. Nefesimi tuttum, kıpırdamadım, bekledi. Ben önce bıraktım. O kazandı.",
            // — Kimsenin anlayamayacağı —
            "Gölgen senden önce vardı burada. Sen sadece onu takip ettin ve bunu hiç fark etmedin.",
            "Yedinci kapıyı açtığında o zaten sekizincinin önündeydi. Bu tesadüf değildi. Hiç tesadüf olmadı.",
            "Duvarlar nefes alıyor. Sen yalnızca fark etmiyorsun, çünkü sen de nefes alıyorsun.",
            "Anahtarları saydın. O da saydı. Ama o farklı şeyler sayıyordu.",
            "Çıkış kapısı açıldı. Sonra kapandı. Biri mi kapattı? Yoksa hiç açılmadı mı? İkisi de doğru.",
            "O seni aramadı. Zaten biliyordu. Aramak, bilmeyenler için gereklidir.",
        ];
        const randomHint = hints[Math.floor(Math.random() * hints.length)];
        if (hintText) hintText.textContent = randomHint;
        setTimeout(() => { gameOverScreen.classList.add('active'); }, 50);
    };
    if (screamSound) {
        screamSound.addEventListener('ended', startCinematic, { once: true });
    } else {
        setTimeout(startCinematic, 1000);
    }
}

// Renk interpolasyonu yardımcısı
function lerpColor(c1, c2, t) {
    const p = h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
    const [r1,g1,b1] = p(c1), [r2,g2,b2] = p(c2);
    return `rgb(${Math.round(r1+(r2-r1)*t)},${Math.round(g1+(g2-g1)*t)},${Math.round(b1+(b2-b1)*t)})`;
}

// Orman sinematiği — ağaçlar büyür, güneş doğar.
// Canvas z-index=8 (win screen arkasında), animasyon sayfa yenilenene kadar devam eder.
function showForestCinematic() {
    const cvs = document.createElement('canvas');
    cvs.id = 'forest-canvas';
    cvs.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:8;pointer-events:none;';
    cvs.width = window.innerWidth;
    cvs.height = window.innerHeight;
    document.body.appendChild(cvs);
    const ctx = cvs.getContext('2d');
    const W = cvs.width, H = cvs.height;
    const GY = H * 0.68;
    const GROW_DUR = 5000;

    // 55 ağaç — her biri sallanma parametreleriyle
    const trees = [];
    for (let i = 0; i < 55; i++) {
        trees.push({
            x: (i / 55) * W * 1.3 - W * 0.15 + (Math.random() - 0.5) * 45,
            trunkH: 45 + Math.random() * 130,
            trunkW: 4 + Math.random() * 11,
            canopyH: 85 + Math.random() * 150,
            canopyW: 35 + Math.random() * 90,
            layers: 2 + Math.floor(Math.random() * 4),
            delay: Math.random() * 0.45,
            dark: Math.random() > 0.4,
            swayAmt: 2.5 + Math.random() * 5,    // px sallanma miktarı
            swayFreq: 0.25 + Math.random() * 0.7, // Hz
            swayPhase: Math.random() * Math.PI * 2
        });
    }
    trees.sort((a, b) => a.canopyW - b.canopyW);

    // Ateşböcekleri — t > 0.5'ten sonra belirir
    const fireflies = [];
    for (let i = 0; i < 10; i++) {
        fireflies.push({
            x: Math.random() * W,
            y: GY - 15 - Math.random() * (H * 0.35),
            vx: (Math.random() - 0.5) * 0.6,
            vy: -0.08 - Math.random() * 0.22,
            phase: Math.random() * Math.PI * 2,
            glowFreq: 1.5 + Math.random() * 2.5,
            size: 1.5 + Math.random() * 2.5
        });
    }

    const t0 = performance.now();
    let running = true;
    cvs._stop = () => { running = false; };

    function frame(now) {
        if (!running) return;
        const t = Math.min((now - t0) / GROW_DUR, 1);
        const swayT = (now - t0) / 1000; // saniye — kısıtlamasız, sürekli animasyon için
        ctx.clearRect(0, 0, W, H);

        // Gökyüzü — soğuk, kasvetli alacakaranlık (turuncu/sıcak yok)
        const sky = ctx.createLinearGradient(0, 0, 0, GY);
        sky.addColorStop(0,   lerpColor('#010204', '#050d1a', t));
        sky.addColorStop(0.5, lerpColor('#060412', '#0e1c14', Math.min(t * 1.2, 1)));
        sky.addColorStop(1,   lerpColor('#070a06', '#192b14', Math.min(t * 1.5, 1)));
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, W, GY);

        // Ay / soluk ışık kaynağı — sıcak güneş yerine soğuk soluk
        const st = Math.max(0, (t - 0.25) / 0.75);
        if (st > 0) {
            const sx = W * 0.68, sy = GY - st * GY * 0.52;
            // Sönük ışık huzmeleri
            const rayPulse = 1 + Math.sin(swayT * 0.5) * 0.03;
            ctx.save();
            ctx.globalAlpha = st * 0.04 * rayPulse;
            ctx.strokeStyle = 'rgba(160,210,180,1)';
            ctx.lineWidth = 50;
            for (let r = 0; r < 6; r++) {
                const ang = (r / 6) * Math.PI * 2;
                ctx.beginPath();
                ctx.moveTo(sx, sy);
                ctx.lineTo(sx + Math.cos(ang) * W * 1.5, sy + Math.sin(ang) * H * 1.5);
                ctx.stroke();
            }
            ctx.restore();
            // Soğuk yeşilimsi-gri glow
            const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 180);
            glow.addColorStop(0,   `rgba(140,200,160,${st * 0.45})`);
            glow.addColorStop(0.4, `rgba(60,110,80,${st * 0.18})`);
            glow.addColorStop(1,   'rgba(20,50,30,0)');
            ctx.fillStyle = glow;
            ctx.beginPath(); ctx.arc(sx, sy, 180, 0, Math.PI * 2); ctx.fill();
            // Soluk disk
            ctx.fillStyle = `rgba(200,225,210,${Math.min(st * 0.9, 0.75)})`;
            ctx.beginPath(); ctx.arc(sx, sy, 14 + st * 10, 0, Math.PI * 2); ctx.fill();
        }

        // Zemin — neredeyse siyah, karanlık orman tabanı
        const gg = ctx.createLinearGradient(0, GY, 0, H);
        gg.addColorStop(0, lerpColor('#060c06', '#0c1a0a', Math.min(t * 2, 1)));
        gg.addColorStop(1, '#020402');
        ctx.fillStyle = gg;
        ctx.fillRect(0, GY, W, H - GY);

        // Ağaçlar — büyüme + sallanma
        trees.forEach(tree => {
            const tp = Math.max(0, Math.min((t - tree.delay) / (0.95 - tree.delay), 1));
            if (tp <= 0) return;
            const drawn = tp * (tree.trunkH + tree.canopyH);
            const trunkD = Math.min(drawn, tree.trunkH);

            // Sallantı — büyüme tamamlandıkça artar
            const sway = Math.sin(swayT * tree.swayFreq + tree.swayPhase) * tree.swayAmt * tp;

            // Gövde
            ctx.fillStyle = tree.dark ? '#1b0d06' : '#2d1909';
            ctx.fillRect(tree.x - tree.trunkW / 2, GY - trunkD, tree.trunkW, trunkD);

            // Taç katmanları — üst katmanlar daha fazla sallanır
            if (drawn > tree.trunkH) {
                const cp = (drawn - tree.trunkH) / tree.canopyH;
                const cb = GY - tree.trunkH;
                for (let l = 0; l < tree.layers; l++) {
                    const lp = Math.min(cp * tree.layers - l, 1);
                    if (lp <= 0) continue;
                    const lH = (tree.canopyH / tree.layers) * lp;
                    const lW = tree.canopyW * (1 - l * 0.19);
                    const lBase = cb - l * (tree.canopyH / tree.layers);
                    const gv = (tree.dark ? 48 : 65) + l * 18;
                    // Üst katmanlar daha fazla sallanır
                    const cx = tree.x + sway * (1 + l * 0.4);
                    ctx.fillStyle = `rgb(${12 + l * 7},${gv},${12 + l * 7})`;
                    ctx.beginPath();
                    ctx.moveTo(cx, lBase - lH);
                    ctx.lineTo(cx + lW / 2, lBase);
                    ctx.lineTo(cx - lW / 2, lBase);
                    ctx.closePath(); ctx.fill();
                }
            }
        });

        // Zemin sisi — yavaşça sağa sola kayar
        if (t > 0.15) {
            const mt = Math.min((t - 0.15) / 0.4, 1);
            const mistOff = Math.sin(swayT * 0.18) * W * 0.04;
            const mist = ctx.createLinearGradient(0, GY - 22, 0, GY + 60);
            mist.addColorStop(0,   'rgba(180,220,180,0)');
            mist.addColorStop(0.4, `rgba(195,235,205,${mt * 0.32})`);
            mist.addColorStop(1,   'rgba(140,195,155,0)');
            ctx.fillStyle = mist;
            ctx.fillRect(mistOff, GY - 22, W, 82);
            // İkinci sis katmanı — ters yönde
            const mist2 = ctx.createLinearGradient(0, GY, 0, GY + 45);
            mist2.addColorStop(0, `rgba(160,210,170,${mt * 0.18})`);
            mist2.addColorStop(1, 'rgba(120,180,140,0)');
            ctx.fillStyle = mist2;
            ctx.fillRect(-mistOff * 1.5, GY, W, 45);
        }

        // Ateşböcekleri — t > 0.5'ten sonra
        if (t > 0.5) {
            const ffAlpha = Math.min((t - 0.5) / 0.25, 1);
            fireflies.forEach(ff => {
                // Hafif hareket
                ff.x += ff.vx;
                ff.y += ff.vy + Math.sin(swayT * 0.9 + ff.phase) * 0.15;
                if (ff.x < -20) ff.x = W + 10;
                if (ff.x > W + 20) ff.x = -10;
                if (ff.y < GY - H * 0.55) { ff.y = GY - 10; ff.x = Math.random() * W; }
                const glow = (Math.sin(swayT * ff.glowFreq + ff.phase) + 1) / 2;
                const ffA = ffAlpha * (0.35 + glow * 0.65);
                ctx.save();
                ctx.globalAlpha = ffA;
                const gradient = ctx.createRadialGradient(ff.x, ff.y, 0, ff.x, ff.y, ff.size * 5);
                gradient.addColorStop(0, 'rgba(210,255,160,1)');
                gradient.addColorStop(0.3, 'rgba(120,255,80,0.6)');
                gradient.addColorStop(1, 'rgba(60,200,40,0)');
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(ff.x, ff.y, ff.size * 5, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            });
        }

        // Fade-in (giriş)
        if (t < 0.06) {
            ctx.fillStyle = `rgba(0,0,0,${1 - t / 0.06})`;
            ctx.fillRect(0, 0, W, H);
        }

        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}

function triggerWin() {
    if (gameOver) return;
    gameOver = true;
    gameRunning = false;
    controls.unlock();
    manageFootstepSounds(null);
    pauseAllGameSounds();
    if (objectiveMarker) objectiveMarker.style.display = 'none';
    escapeCountdownActive = false;
    try { countdownTimerEl.style.display = 'none'; } catch (e) {}
    try { if (escapeMessageEl) escapeMessageEl.style.display = 'none'; } catch (e) {}
    const ch = document.querySelector('.crosshair');
    if (ch) ch.style.display = 'none';

    if (doorSlamSound) doorSlamSound.play();

    // Bu son mu? başarımı
    unlockAchievement('3SzvXD2RMxrPZHYzO3zb');

    // Hızlı Kaçış — 5 dakika = 300000ms
    if (gameStartTime && (Date.now() - gameStartTime) <= 300000) {
        unlockAchievement('DRZ4fNOH5GYTjvxfwhEZ');
    }

    // Orman animasyonu canvas olarak başlat (z-index 8 = win screen'in arkasında)
    showForestCinematic();

    // 3 saniye sonra win screen
    setTimeout(() => {
        const winScreenEl = safeEl('win-screen');
        winScreenEl.style.display = 'flex';
        if (victoryMusic) victoryMusic.play().catch(() => {});
        safeEl('win-title').textContent = 'KAÇTIN!';
        const msg = 'Kabus sona erdi... şimdilik.';
        safeEl('win-message').textContent = '';
        setTimeout(() => {
            winScreenEl.classList.add('active');
            setTimeout(() => {
                let i = 0;
                const wm = safeEl('win-message');
                (function typeWriter() {
                    if (i < msg.length) { wm.textContent += msg.charAt(i++); setTimeout(typeWriter, 60); }
                })();
            }, 3500);
        }, 200);
    }, 3000);
}

function updateObjectiveMarker() {
    if (!objectiveTargetPosition || !gameRunning) {
        objectiveMarker.classList.remove('objective-marker-visible');
        objectiveMarker.classList.add('objective-marker-hidden');
        return;
    }
    objectiveMarker.classList.remove('objective-marker-hidden');
    objectiveMarker.classList.add('objective-marker-visible');
    const target3D = objectiveTargetPosition.clone();
    const screenPos = target3D.project(camera);
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    const toTarget = objectiveTargetPosition.clone().sub(camera.position);
    const isBehind = cameraDirection.dot(toTarget) < 0;
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    if (isBehind || screenPos.x < -1 || screenPos.x > 1 || screenPos.y < -1 || screenPos.y > 1) {
        const projectedOntoPlane = new THREE.Vector3().copy(objectiveTargetPosition).projectOnPlane(cameraDirection).add(camera.position);
        const screenEdgePos = projectedOntoPlane.project(camera);
        const angle = Math.atan2(screenEdgePos.y, screenEdgePos.x);
        objectiveMarker.style.transform = `rotate(${angle + Math.PI / 2}rad) scale(1)`;
        const edgeX = screenWidth / 2 + (screenWidth / 2.2) * Math.cos(angle);
        const edgeY = screenHeight / 2 - (screenHeight / 2.2) * Math.sin(angle);
        objectiveMarker.style.left = `${edgeX}px`;
        objectiveMarker.style.top = `${edgeY}px`;
    } else {
        const x = (screenPos.x * 0.5 + 0.5) * screenWidth;
        const y = (-screenPos.y * 0.5 + 0.5) * screenHeight;
        objectiveMarker.style.left = `${x}px`;
        objectiveMarker.style.top = `${y}px`;
        objectiveMarker.style.transform = 'rotate(0rad) scale(0.8)';
    }
}

// =============================================================================
// 10. AI FONKSİYONLARI
// =============================================================================
// =============================================================================
// A* PATHFINDING
// =============================================================================
function _pfKey(cx, cz) { return cx * 10000 + cz; }

function _pfWalkable(cx, cz) {
    if (cz < 0 || cz >= mazeLayout.length) return false;
    const row = mazeLayout[cz];
    return !!row && cx >= 0 && cx < row.length && row[cx] !== 'W';
}

// Hedef hücre duvarsa (örn. tahmin/kombo hedefleri walkability kontrolü yapmadan üretiliyor)
// en yakın yürünebilir hücreye "yapıştırır". Bulunamazsa null döner.
function _pfNearestWalkable(cx, cz, maxRadius = 6) {
    if (_pfWalkable(cx, cz)) return { cx, cz };
    for (let r = 1; r <= maxRadius; r++) {
        for (let dx = -r; dx <= r; dx++) {
            for (let dz = -r; dz <= r; dz++) {
                if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue; // sadece halkanın üzerinde tara
                if (_pfWalkable(cx + dx, cz + dz)) return { cx: cx + dx, cz: cz + dz };
            }
        }
    }
    return null;
}

function findPathAStar(fromWorld, toWorld) {
    const sx = Math.round(fromWorld.x / wallSize);
    const sz = Math.round(fromWorld.z / wallSize);
    let gx = Math.round(toWorld.x / wallSize);
    let gz = Math.round(toWorld.z / wallSize);

    if (!_pfWalkable(gx, gz)) {
        const snapped = _pfNearestWalkable(gx, gz);
        if (!snapped) return null;
        gx = snapped.cx;
        gz = snapped.cz;
    }

    if (sx === gx && sz === gz) return [];

    const open = [{ cx: sx, cz: sz, g: 0 }];
    const cameFrom = new Map();
    const gMap = new Map();
    gMap.set(_pfKey(sx, sz), 0);

    const dirs = [{ cx: 1, cz: 0 }, { cx: -1, cz: 0 }, { cx: 0, cz: 1 }, { cx: 0, cz: -1 }];
    let iter = 0;

    while (open.length > 0 && iter++ < 350) {
        open.sort((a, b) =>
            (a.g + Math.abs(a.cx - gx) + Math.abs(a.cz - gz)) -
            (b.g + Math.abs(b.cx - gx) + Math.abs(b.cz - gz))
        );
        const cur = open.shift();

        if (cur.cx === gx && cur.cz === gz) {
            const path = [];
            let c = { cx: gx, cz: gz };
            while (cameFrom.has(_pfKey(c.cx, c.cz))) {
                path.unshift(new THREE.Vector3(c.cx * wallSize, 1.1, c.cz * wallSize));
                c = cameFrom.get(_pfKey(c.cx, c.cz));
            }
            return path; // start dahil değil, sadece ilerisi
        }

        for (const d of dirs) {
            const nx = cur.cx + d.cx, nz = cur.cz + d.cz;
            if (!_pfWalkable(nx, nz)) continue;
            const ng = cur.g + 1;
            const nk = _pfKey(nx, nz);
            if (ng < (gMap.get(nk) ?? Infinity)) {
                gMap.set(nk, ng);
                cameFrom.set(nk, { cx: cur.cx, cz: cur.cz });
                if (!open.some(n => n.cx === nx && n.cz === nz))
                    open.push({ cx: nx, cz: nz, g: ng });
            }
        }
    }
    return null;
}

// Bir sonraki waypoint'i döndürür, gerekirse yolu yeniden hesaplar. `pf` parametresi sayesinde
// gerçek entity (varsayılan `entityPathfinding`) ve sahte entity (`fakeEntityPathfinding`) aynı
// fonksiyonu, birbirinden bağımsız path/waypoint/stuck durumuyla paylaşabiliyor.
function entityGetNextWaypoint(entityPos, targetPos, delta, pf = entityPathfinding, playStuckSound = true) {
    // Takılma tespiti — BİRİKMİŞ mesafeye bakar (frame-to-frame DEĞİL). Önceki sürüm entityPos'u
    // pf.lastPos'a HER FRAME kaydedip bir sonraki frame'le kıyaslıyordu; ama normal PATROLLING hızında
    // (1.5 birim/sn) bir frame'de kat edilen mesafe (~0.025 birim @ 60fps) eşiğin (0.05) altında kalıyor —
    // yani entity dümdüz, tamamen normal yürürken bile "takılmış" sayılıp her ~2 saniyede bir komşu
    // hücreye ışınlanıyordu. Bu da "ilerleyemiyor, geri gidiyor" hissi veriyordu. Düzeltme: referans
    // pozisyon sadece takılma sayacı sıfırlandığında (ya da gerçekten anlamlı ilerleme olduğunda)
    // güncelleniyor — böylece 2 saniyelik pencere boyunca BİRİKEN mesafe ölçülüyor.
    if (!pf.stuckCheckPos) pf.stuckCheckPos = entityPos.clone();
    if (entityPos.distanceTo(pf.stuckCheckPos) < 0.3) {
        pf.stuckTimer += delta;
        if (pf.stuckTimer > 2.0) {
            pf.path = [];
            pf.stuckTimer = 0;
            // Ping-pong engeli: takılınca hedefe en yakın walkable komşuya ışınlan (rastgele DEĞİL —
            // her zaman ileri sıçrasın, oyuncuya "geri gidiyor" hissi vermesin)
            const cx = Math.round(entityPos.x / wallSize);
            const cz = Math.round(entityPos.z / wallSize);
            const neighbors = [];
            for (const d of [{ cx: 1, cz: 0 }, { cx: -1, cz: 0 }, { cx: 0, cz: 1 }, { cx: 0, cz: -1 }]) {
                if (_pfWalkable(cx + d.cx, cz + d.cz)) {
                    neighbors.push(new THREE.Vector3((cx + d.cx) * wallSize, entityPos.y, (cz + d.cz) * wallSize));
                }
            }
            if (neighbors.length > 0) {
                const teleport = neighbors.reduce((a, b) =>
                    a.distanceTo(targetPos) < b.distanceTo(targetPos) ? a : b
                );
                entityPos.x = teleport.x;
                entityPos.z = teleport.z;
                if (behindSound && playStuckSound) behindSound.play().catch(() => {});
            }
            pf.stuckCheckPos = entityPos.clone();
        }
    } else {
        pf.stuckTimer = 0;
        pf.stuckCheckPos = entityPos.clone();
    }

    // Hedef önemli ölçüde değiştiyse veya timer bittiyse yolu yeniden hesapla
    pf.recalcTimer -= delta;
    const targetMoved = !pf.pathTarget || pf.pathTarget.distanceTo(targetPos) > wallSize * 1.5;
    if (pf.path.length === 0 || targetMoved || pf.recalcTimer <= 0) {
        const newPath = findPathAStar(entityPos, targetPos);
        pf.path = newPath || [];
        pf.waypointIdx = 0;
        pf.pathTarget = targetPos.clone();
        pf.recalcTimer = 1.2;
    }

    // Yol bulunamadıysa (A* 350 iterasyonda bitiremedi ya da hedef gerçekten ulaşılamaz) entity'yi
    // olduğu yerde dondurmuyoruz — hedefe doğru yürümeyi dener, collision durdursa bile en azından
    // kayar/dener, asla tamamen donmaz.
    if (pf.path.length === 0) return targetPos.clone(); // fallback

    // Mevcut waypoint'e yetişildiyse bir sonrakine geç
    const wp = pf.path[pf.waypointIdx];
    const dx = entityPos.x - wp.x, dz = entityPos.z - wp.z;
    if (Math.sqrt(dx * dx + dz * dz) < 1.8 && pf.waypointIdx < pf.path.length - 1) {
        pf.waypointIdx++;
    }

    return pf.path[pf.waypointIdx];
}

function setNewPatrolTarget() {
    // score arttıkça hot spot'a gitme ihtimali artar (max %70)
    const hotChance = entityMemory.score * 0.07;
    let target = null;
    if (Math.random() < hotChance) target = getMemoryHotSpot();
    if (!target) target = walkableTiles[Math.floor(Math.random() * walkableTiles.length)];
    the_entity.targetPosition.copy(target);
    the_entity.state = 'PATROLLING';
}

function canEnemySeePlayer(isSprinting) {
    const playerPos = controls.getObject().position;
    const enemyPos = the_entity.mesh.position;
    
    // 1. Mesafe Kontrolü
    const distanceSq = playerPos.distanceToSquared(enemyPos);
    const crouchFactor = player.isCrouching ? 0.6 : 1.0;

    // Öğrenme bonusu: her avlanmayla +0.5 birim, max +5
    const learnBonus = entityMemory.score * 0.5;
    // Sprint alışkanlığı bonusu: oyuncu çok koştuysa sprint detection daha da büyür
    const sprintRatio = entityMemory.profile.sprintFrames / Math.max(1, entityMemory.profile.totalFrames);
    const sprintHabitBonus = (isSprinting && sprintRatio > 0.25) ? 6 : 0;
    const baseRadius = isSprinting ? the_entity.sprintDetectionRadius : the_entity.detectionRadius;
    const currentDetectionRadius = (baseRadius + learnBonus + sprintHabitBonus) * crouchFactor;

    if (distanceSq > currentDetectionRadius * currentDetectionRadius) return false;

    // 2. Görüş Açısı (Field of View) - V7.3
    // Canavarın ön vektörünü alıyoruz
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(the_entity.mesh.quaternion);
    const toPlayer = playerPos.clone().sub(enemyPos).normalize();
    const dot = forward.dot(toPlayer);
    
    // Eğer oyuncu canavarın arkasındaysa (dot < 0), canavar onu 'görmez' (duyması hariç)
    // 120 derecelik bir görüş açısı için dot > 0.5 yeterlidir.
    // ALTINCI HİS: Görüş konisinin dışında bile, senseRadius içindeyse hisseder (duyma/koku/sezgi)
    // -> oyuncu arkasına geçtiğinde canavar bunu hisseder, dönüp kovalar.
    // Sprint sesi sezgi mesafesini büyütür; çömelmek küçültür.
    const senseRadius = (the_entity.senseRadius + (isSprinting ? 4 : 0)) * crouchFactor;
    if (dot < 0.3 && distanceSq > senseRadius * senseRadius) return false;

    // 3. Görüş Hattı (Raycasting)
    raycaster.set(enemyPos, toPlayer);
    const objectsToTest = [...walls.children, ...doorMeshes.filter(d => !d.userData.pivot.userData.isOpen)];
    const intersects = raycaster.intersectObjects(objectsToTest);
    
    if (intersects.length > 0 && intersects[0].distance * intersects[0].distance < distanceSq) return false;
    
    return true;
}

// Ortak "oyuncu bu noktaya bakıyor mu" kontrolü — koni açısı + isteğe bağlı duvar raycast'i.
// AMBUSH giriş şartı, AMBUSH iç kontrolü ve isPlayerLookingAtEnemy hepsi bunu paylaşır — böylece
// "bakıyor mu" tanımı her yerde aynı (farklı koni/duvar kombinasyonları tutarsızlık yaratmıyor).
function isPlayerLookingAtPoint(playerPos, targetPos, cosThreshold, checkWalls = true) {
    const toTarget = targetPos.clone().sub(playerPos).normalize();
    camera.getWorldDirection(cachedCameraDirection);
    if (cachedCameraDirection.dot(toTarget) < cosThreshold) return false;
    if (!checkWalls) return true;
    const distanceSq = playerPos.distanceToSquared(targetPos);
    raycaster.set(playerPos, cachedCameraDirection);
    const objectsToTest = [...walls.children, ...doorMeshes.filter(d => !d.userData.pivot.userData.isOpen)];
    const intersects = raycaster.intersectObjects(objectsToTest);
    if (intersects.length > 0 && intersects[0].distance * intersects[0].distance < distanceSq) return false;
    return true;
}

// Bakış açısı sınırındaki ufak titreşimlerin (kamera oynaması) tek karede ani state
// değişimine yol açmasını önler — değer yalnızca LOOK_FLIP_GRACE kadar SABİT kaldıktan sonra kabul edilir.
const LOOK_FLIP_GRACE = 0.18; // sn
function updateSmoothedLook(obj, rawValue, delta) {
    if (obj._lookSmoothed === undefined) obj._lookSmoothed = rawValue;
    if (rawValue !== obj._lookRawPrev) obj._lookFlipTimer = 0;
    obj._lookFlipTimer = (obj._lookFlipTimer || 0) + delta;
    obj._lookRawPrev = rawValue;
    if (obj._lookFlipTimer >= LOOK_FLIP_GRACE) obj._lookSmoothed = rawValue;
    return obj._lookSmoothed;
}

function isPlayerLookingAtEnemy(playerPos) {
    if (!the_entity.isVisible) return false;
    const enemyPos = the_entity.mesh.position;
    const distanceSq = playerPos.distanceToSquared(enemyPos);
    const maxDistSq = (flashlight.distance + 5) * (flashlight.distance + 5);
    if (distanceSq > maxDistSq) return false;
    return isPlayerLookingAtPoint(playerPos, enemyPos, 0.8);
}

// Açıyı en kısa yönden yumuşakça çevirir (gövde dönüşü için)
function _lerpAngle(a, b, t) {
    let d = b - a;
    while (d >  Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * Math.min(1, t);
}

// HUNTING'e giren HER yol bunu kullanmalı — state'i tek başına set etmek huntGrace/
// lastKnownPlayerPosition gibi alanlardan birini unutursa entity bir sonraki karede
// sessizce SEARCHING'e "geri düşüyordu" (pusu yakalaması ve kaçış-sekansı serbest
// bırakma anlarında olduğu gibi).
function enterHunting(playerPos, opts = {}) {
    the_entity.state = 'HUNTING';
    the_entity.lastKnownPlayerPosition = playerPos.clone();
    if (opts.moveDir) {
        the_entity.lastPlayerMoveDirection.copy(opts.moveDir);
        if (the_entity.lastPlayerMoveDirection.lengthSq() > 0.0001) the_entity.lastPlayerMoveDirection.normalize();
    }
    the_entity.searchTimer = 10;
    // Skor arttıkça (öğrendikçe) görüşü kaybettikten sonra biraz daha ısrarcı olur (1.2sn → max ~2.2sn)
    the_entity.huntGrace = 1.2 + entityMemory.score * 0.1;
    entityMemory.wasHunting = true;
    directorAI.timeSinceLastEncounter = 0;
    if (opts.resetTimers) the_entity.teleportTimer = 15;
}

function updateTheEntity(delta, playerPos, oldPlayerPos) {
    if (cinematicPlaying) return; // Sinematik sırasında AI çalışmaz
    const enemyPos = the_entity.mesh.position;
    
    // V7.3: Dinamik Sinirlenme Hızı (Daha Agresif: %7 artış)
    const angerMult = 1 + (keysCollected * 0.07); 
    const currentPatrolSpeed = the_entity.patrolSpeed * angerMult;
    const currentHuntSpeed = the_entity.huntSpeed * angerMult;

    // V7.3: Cooldowns
    if (the_entity.ambushCooldown > 0) the_entity.ambushCooldown -= delta;

    // Sersemleme (Stun)
    if (the_entity.isStunned) {
        the_entity.stunTimer -= delta;
        if (the_entity.stunTimer <= 0) the_entity.isStunned = false;
        the_entity.eyeLight.color.set(0x00ffff);
        the_entity.eyeLight.intensity = 2;
        return;
    }

    if (the_entity.state === 'FROZEN') {
        const t = Date.now() * 0.01;
        the_entity.mesh.rotation.y = Math.sin(t) * entityTrembleBase;
        if (frozenEntityPosition) {
            the_entity.mesh.position.x = frozenEntityPosition.x;
            the_entity.mesh.position.z = frozenEntityPosition.z;
        }
        the_entity.mesh.position.y = 1.1 + Math.sin(t * 2) * entityTrembleBase;
        return;
    }

    const isHunting = the_entity.state === 'HUNTING';
    const distToPlayer = playerPos.distanceTo(enemyPos);

    // --- INTRO SEQUENCE ---
    if (gameIntro.active) {
        gameIntro.timer -= delta;
        if (gameIntro.timer <= 0 || distToPlayer < 5) {
            gameIntro.active = false;
            const farPts = walkableTiles.filter(p => p.distanceTo(playerPos) > 25);
            if (farPts.length > 0) {
                const fp = farPts[Math.floor(Math.random() * farPts.length)];
                enemyPos.copy(fp); enemyPos.y = 1.1;
                entityPathfinding.path = [];
            }
            setEntityVisibility(false);
            setNewPatrolTarget();
            showObjectiveToast();
            return;
        }
        // Intro hareketi — oyuncuya doğru yürü, başka bir şey yapma
        const iWp = entityGetNextWaypoint(enemyPos, playerPos, delta);
        const iDir = new THREE.Vector3(iWp.x - enemyPos.x, 0, iWp.z - enemyPos.z);
        if (iDir.length() > 0.1) {
            iDir.normalize();
            const iMv = iDir.clone().multiplyScalar(the_entity.patrolSpeed * delta);
            _tmpVec3A.copy(enemyPos).add(_tmpVec3B.set(iMv.x, 0, 0));
            if (!checkCollision(_tmpVec3A, the_entity.hitbox, false, !the_entity.isVisible)) enemyPos.x = _tmpVec3A.x;
            _tmpVec3A.copy(enemyPos).add(_tmpVec3B.set(0, 0, iMv.z));
            if (!checkCollision(_tmpVec3A, the_entity.hitbox, false, !the_entity.isVisible)) enemyPos.z = _tmpVec3A.z;
        }
        // lookAt zaten +Z'yi (yüz) oyuncuya çevirir — flip YOK
        the_entity.mesh.lookAt(playerPos.x, enemyPos.y, playerPos.z);
        return;
    }

    // VHS Glitch — sadece görünür ve saldırıyorken
    if (distToPlayer < 5 && isHunting && the_entity.isVisible) {
        document.body.classList.add('glitch-active');
    } else {
        document.body.classList.remove('glitch-active');
    }

    // --- GÖRÜNÜRLÜK & IŞINLAMA ---
    if (the_entity.isVisible) {
        if (isHunting) {
            // Avdayken HİÇBİR güç aktif edilemez — sadece saldırı
            the_entity.eyeLight.intensity = 3.0 + Math.random() * 2.5; // av: güçlü kırmızı titreşim
            // Oyuncu feneri ile bakıyorsa → timer'ları sıfırla (avdan çıkınca daha uzun bekler)
            if (isPlayerLookingAtEnemy(playerPos) && flashlightOn) {
                the_entity.visibilityTimer = the_entity.timeVisible;
                the_entity.teleportTimer = Math.max(the_entity.teleportTimer, 20);
            }
        } else {
            // Avlamıyor — görünürlük sayacı
            the_entity.visibilityTimer -= delta;
            if (the_entity.visibilityTimer <= 0) {
                // Görünmez ol + rastgele noktaya sıfırla
                const pts = walkableTiles.filter(p => p.distanceTo(playerPos) > 10 && p.distanceTo(playerPos) < 25);
                if (pts.length > 0) {
                    const pt = pts[Math.floor(Math.random() * pts.length)];
                    enemyPos.copy(pt);
                    enemyPos.y = 1.1;
                    entityPathfinding.path = [];
                }
                setEntityVisibility(false);
            }

            // Işınlanma — sadece görünür ve avlamıyorken, cooldown dolunca
            the_entity.teleportTimer -= delta;
            const directorWantsTeleport = directorAI.timeSinceLastEncounter > (25 - keysCollected * 2);
            const playerNotLooking = !isPlayerLookingAtEnemy(playerPos);
            if (the_entity.teleportTimer <= 0 && (distToPlayer > 25 || directorWantsTeleport) && playerNotLooking) {
                const pts = walkableTiles.filter(p => p.distanceTo(playerPos) > 12 && p.distanceTo(playerPos) < 22);
                if (pts.length > 0) {
                    const tp = pts[Math.floor(Math.random() * pts.length)];
                    enemyPos.copy(tp);
                    enemyPos.y = 1.1;
                    entityPathfinding.path = [];
                    the_entity.teleportTimer = 15;
                    directorAI.timeSinceLastEncounter = 0;
                    if (behindSound) behindSound.play();
                }
            }
        }
    } else {
        // GÖRÜNMEZ FAZ: yavaş, kapıdan geçer, saldıramaz, ışınlanamaz
        the_entity.visibilityTimer -= delta;

        // --- YAKLAŞMA SESLERİ (konum verme, sadece atmosfer) ---
        entityPathfinding.invisibleSoundTimer -= delta;
        if (entityPathfinding.invisibleSoundTimer <= 0) {
            const invDist = enemyPos.distanceTo(playerPos);
            if (invDist < 8) {
                // Çok yakın → scratch sesi daha sık
                if (scratchSound) { scratchSound.currentTime = 0; scratchSound.play().catch(() => {}); }
                entityPathfinding.invisibleSoundTimer = 2.0 + Math.random() * 1.5;
            } else if (invDist < 15) {
                // Orta mesafe → daha seyrek scratch
                if (scratchSound) { scratchSound.currentTime = 0; scratchSound.play().catch(() => {}); }
                entityPathfinding.invisibleSoundTimer = 4.0 + Math.random() * 3.0;
            } else {
                entityPathfinding.invisibleSoundTimer = 5.0;
            }
        }

        // Görünür olmadan ~3 saniye önce → giggle uyarısı (oyuncuya "bir şey geliyor" hissi)
        if (the_entity.visibilityTimer > 0 && the_entity.visibilityTimer < 3.0 && !the_entity._preRevealSoundPlayed) {
            the_entity._preRevealSoundPlayed = true;
            if (giggleSound) { giggleSound.currentTime = 0; giggleSound.play().catch(() => {}); }
        }

        if (the_entity.visibilityTimer <= 0 && the_entity.state !== 'AMBUSH') {
            // Görünür olmaya çalış — artık rastgele bir yere ışınlanmıyor, o an bulunduğu (yaklaşmış
            // olduğu) konumda ortaya çıkıyor. İki güvenlik payı var:
            // 1) Çok yakınken (< 4 birim) ortaya çıkarsa görünür+yakın kontrolü aynı karede oyuncuyu
            //    hiç tepki verme şansı olmadan öldürebiliyordu ("dibinden geçtim ve öldüm") — bu yüzden
            //    çok yakınken de biraz daha bekliyor.
            // 2) "Oyuncu bakıyorsa bekle" daha önce sınırsızdı — oyuncu sadece o yöne bakmaya devam
            //    ederek ortaya çıkışı SONSUZA kadar erteleyebiliyordu (ve her erteleme yeni bir giggle
            //    çalıyordu — "iki kez gülmesi gereken yerde hiç çıkmıyor" şikayeti buradan). Artık en
            //    fazla birkaç kez erteleniyor, sonra oyuncu bakıyor/yakın olsa bile ortaya çıkıyor.
            const toEntity = enemyPos.clone().sub(playerPos).normalize();
            camera.getWorldDirection(cachedCameraDirection);
            const playerLookingAt = cachedCameraDirection.dot(toEntity) > 0.65;
            const tooClose = distToPlayer < 4;
            the_entity._revealStallCount = the_entity._revealStallCount || 0;
            if ((playerLookingAt || tooClose) && the_entity._revealStallCount < 4) {
                the_entity._revealStallCount++;
                the_entity.visibilityTimer = 2.5; // Biraz daha bekle (giggle TEKRAR çalmaz, sadece bir sonraki gerçek ortaya çıkışta)
            } else {
                the_entity._revealStallCount = 0;
                the_entity._preRevealSoundPlayed = false;
                setEntityVisibility(true);
            }
        }
    }

    // Sesli Yanıltma
    if (Math.random() < 0.003 && gameRunning) {
        try { scratchSound.play(); } catch(e){}
    }

    const isSprinting = keyboard['ShiftLeft'] && !player.isCrouching && player.stamina > 0;
    const canSee = canEnemySeePlayer(isSprinting);

    if (canSee && the_entity.state !== 'AMBUSH') {
        // (Pusudayken görüş HUNTING'e çevirmesin → gizli hızlı rush bozulmasın; pusu kendi içinde çözülür)
        enterHunting(playerPos, { moveDir: playerPos.clone().sub(oldPlayerPos) });
    } else {
        directorAI.timeSinceLastEncounter += delta;
        if (the_entity.state === 'HUNTING') {
            // Köşeye saklanınca anında vazgeçmesin — kısa bir "ısrar" süresi
            the_entity.huntGrace -= delta;
            if (the_entity.huntGrace <= 0) {
                // Av gerçekten bitti — oyuncu kaçtı, öğren
                if (entityMemory.wasHunting) {
                    onHuntEnded(playerPos);
                    entityMemory.wasHunting = false;
                }
                the_entity.state = 'SEARCHING';
                the_entity.searchStage = 0;
                the_entity.searchStageTimer = 4;
            }
        }
    }

    // Bu frame içinde HUNTING'e yeni geçmiş olabilir — taze durumu kullan (isHunting frame başında alınmış, bayat)
    const isHuntingNow = the_entity.state === 'HUNTING';

    // PUSU MANTIĞI: kare-bağımsız (~0.12/sn) ve cooldown (90sn) kontrolü ile
    const canAmbush = !isHuntingNow && distToPlayer < 10 && !isPlayerLookingAtEnemy(playerPos);
    if (canAmbush && the_entity.ambushCooldown <= 0 && Math.random() < 0.12 * delta) {
        the_entity.state = 'AMBUSH';
        the_entity.ambushCooldown = 90; // Bir pusu sonrası 1.5 dakika bekle
        the_entity.ambushTimer = 9;     // 9 sn içinde yakalayamazsa pusu bozulur
        setEntityVisibility(false, false); // PUSU: anında saklan, kendini gösterme
    }

    let target = the_entity.targetPosition;
    let speed = the_entity.isVisible ? currentPatrolSpeed : the_entity.invisibleFollowSpeed;

    if (the_entity.state === 'HUNTING') {
        // score >= 2'den itibaren oyuncunun nereye gideceğini tahmin edip ÖNÜNÜ KESER
        if (entityMemory.score >= 2 && entityMemory.posHistory.length >= 6) {
            target = getPredictedPlayerPos(playerPos);
        } else {
            // Guard: her HUNTING-giriş yolunun lastKnownPlayerPosition set ettiğinden emin olsak da
            // (bkz. enterHunting), null'a karşı SEARCHING dalıyla tutarlı bir son çare bırakıyoruz —
            // aksi halde findPathAStar null'a distanceTo/x okumaya çalışıp tüm render loop'u çökertebilir.
            target = the_entity.lastKnownPlayerPosition || playerPos.clone();
        }
        const rawHuntSpeed = currentHuntSpeed + (the_entity.chaseDuration * 0.15);
        speed = the_entity.isVisible ? rawHuntSpeed : Math.min(rawHuntSpeed, the_entity.invisibleFollowSpeed);
        the_entity.chaseDuration += delta;
        the_entity.eyeLight.color.set(0xff0000); // parlaklık yukarıda titreşiyor (görünürken)
    } else if (the_entity.state === 'SEARCHING') {
        the_entity.chaseDuration = 0;
        // ÇOK AŞAMALI ARAMA: tek bir tahmin yerine sırayla 3 nokta kontrol eder — önce son görüldüğü
        // yer, sonra kaçış yönünde giderek uzaklaşan noktalar ("o tarafa gitti, şuraya da bakayım").
        // Bir noktaya yaklaşınca (2.5 birim) ya da o aşamada çok oyalanınca (4sn) sıradaki noktaya geçer.
        if (the_entity.lastKnownPlayerPosition) {
            const _searchPts = [
                the_entity.lastKnownPlayerPosition,
                the_entity.lastKnownPlayerPosition.clone().addScaledVector(the_entity.lastPlayerMoveDirection, 5),
                the_entity.lastKnownPlayerPosition.clone().addScaledVector(the_entity.lastPlayerMoveDirection, 10)
            ];
            target = _searchPts[the_entity.searchStage];
            the_entity.searchStageTimer -= delta;
            if ((enemyPos.distanceTo(target) < 2.5 || the_entity.searchStageTimer <= 0) && the_entity.searchStage < _searchPts.length - 1) {
                the_entity.searchStage++;
                the_entity.searchStageTimer = 4;
            }
        }
        speed = the_entity.searchSpeed * angerMult * 1.3; // biraz daha ısrarlı arar
        the_entity.eyeLight.color.set(0xffaa00); // turuncu
        the_entity.eyeLight.intensity = 2.5;
        the_entity.searchTimer -= delta;
        if (distToPlayer < 2 || the_entity.searchTimer <= 0) setNewPatrolTarget();
    } else if (the_entity.state === 'AMBUSH') {
        // PUSU (weeping-angel): görünmez kalır, oyuncu BAKMIYORKEN üstüne yüksek hızla atılır, BAKINCA donar.
        the_entity.eyeLight.intensity = 0; // görünmez zaten — ışık yok
        target = playerPos;

        // Oyuncu entity yönüne bakıyor mu? isPlayerLookingAtEnemy görünürlük şartı yüzünden çalışmaz
        // (entity zaten görünmez) — aynı koni/duvar mantığını (giriş şartı canAmbush ile TUTARLI,
        // eskiden farklı koni + duvar kontrolü YOKTU) paylaşan ortak fonksiyon kullanılıyor. Ayrıca
        // koni sınırındaki titreşimlerin anlık DON↔UÇ flip'i yapmaması için histerezis uygulanıyor.
        const _rawLooking = isPlayerLookingAtPoint(playerPos, enemyPos, 0.8);
        const _playerLooking = updateSmoothedLook(the_entity, _rawLooking, delta);

        // Bakmıyorsan üstüne UÇ, bakıyorsan DON (görmediğin için yakalayamazsın)
        speed = _playerLooking ? 0 : the_entity.huntSpeed * 2.3;

        the_entity.ambushTimer -= delta;
        if (distToPlayer < 3) {
            // Yeterince yaklaştı → ANİDEN ortaya çık + saldırıya geç
            setEntityVisibility(true);
            enterHunting(playerPos);
        } else if (distToPlayer > 14 || the_entity.ambushTimer <= 0) {
            // Pusu bozuldu (oyuncu uzaklaştı / süre doldu) → normal devriyeye dön (görünmez döngü sürdürür)
            setNewPatrolTarget();
        }
    } else {
        the_entity.chaseDuration = 0;
        the_entity.eyeLight.color.set(0xffffff); // devriye — sakin beyaz
        the_entity.eyeLight.intensity = 1.6;
        if (enemyPos.distanceTo(target) < 2) setNewPatrolTarget();
    }

    // ENTITY KOMBOSU: sahte entity charging'deyken gerçek entity de charging yönüne doğru hamle yapar.
    // AMBUSH hariç tutuluyor — yoksa pusunun "oyuncu bakınca don" mekaniğini (speed=0) ezip bozardı.
    let isComboActive = false;
    if (hallucinationManager.isActive && hallucinationManager.state === 'CHARGING' && the_entity.state !== 'HUNTING' && the_entity.state !== 'AMBUSH') {
        isComboActive = true;
        const fakePos = hallucinationManager.fakeEntity.position;
        const comboTarget = fakePos.clone().addScaledVector(hallucinationManager.chargeDirection, wallSize);
        target = comboTarget;
        speed = the_entity.isVisible ? currentHuntSpeed * 1.2 : the_entity.invisibleFollowSpeed * 1.2;
        the_entity.eyeLight.color.set(0xff6600); // turuncu-kırmızı — combo modu
        the_entity.eyeLight.intensity = 2.5;
    }

    // Hareket — A* waypoint takibi
    if (speed > 0) {
        const wp = entityGetNextWaypoint(enemyPos, target, delta);
        const dirToWp = new THREE.Vector3(wp.x - enemyPos.x, 0, wp.z - enemyPos.z);
        if (dirToWp.length() > 0.1) {
            dirToWp.normalize();

            // Yakındaki kapıyı aç — ÇIKIŞ kapısını ASLA açmaz (oyuncunun kaçış yolu).
            // Mesafe bazlı kontrol (yön bazlı raycast DEĞİL): waypoint hedefi, kapı hücresine ~1.8 birim
            // kala bir sonrakine ("corner-cut") geçtiği için — özellikle kapının hemen ardından dönüş
            // varsa — entity artık kapıya değil dönüşün ötesine bakıyor olabilir, raycast kapıyı ıskalar
            // ve entity kapalı kapıya çarpıp kilitli kalırdı. Mesafe kontrolü bu yön bağımlılığını ortadan kaldırır.
            for (const _dm of doorMeshes) {
                const _pivot = _dm.userData.pivot;
                if (_pivot.userData.isOpen || _pivot.userData.isExit) continue;
                if (enemyPos.distanceTo(_pivot.position) < 3.0) {
                    interactWithDoor(_pivot, true);
                }
            }

            const moveVec = dirToWp.clone().multiplyScalar(speed * delta);
            _tmpVec3A.copy(enemyPos).add(_tmpVec3B.set(moveVec.x, 0, 0));
            if (!checkCollision(_tmpVec3A, the_entity.hitbox, false, !the_entity.isVisible)) enemyPos.x = _tmpVec3A.x;
            _tmpVec3A.copy(enemyPos).add(_tmpVec3B.set(0, 0, moveVec.z));
            if (!checkCollision(_tmpVec3A, the_entity.hitbox, false, !the_entity.isVisible)) enemyPos.z = _tmpVec3A.z;
        }
    }

    // --- YÖNELİM: gövde YUMUŞAK döner, kafa bilinçli bakar ---
    // Sadece gerçekten görüyorsa/bildiği yere döner — görmüyorken boşuna oyuncuya bakmaz.
    const _bodyTarget = new THREE.Vector3();
    const _knows = the_entity.lastKnownPlayerPosition;
    if (canSee) {
        _bodyTarget.copy(playerPos);                                  // görüyor → oyuncuya
    } else if (isComboActive) {
        _bodyTarget.copy(target);                                     // kombo aktif → ayaklarla AYNI (canlı kombo) yöne baksın
    } else if ((the_entity.state === 'HUNTING' || the_entity.state === 'SEARCHING') && _knows) {
        _bodyTarget.copy(_knows);                                     // son gördüğü yere (canlı konuma değil)
    } else {
        _bodyTarget.copy(target);                                     // devriye → gittiği yöne
    }

    // Gövdeyi yumuşakça çevir (anında snap YOK → kafa öne geçer, gövde takip eder)
    const _bdx = _bodyTarget.x - enemyPos.x, _bdz = _bodyTarget.z - enemyPos.z;
    if (_bdx * _bdx + _bdz * _bdz > 0.25) {
        const _desiredYaw = Math.atan2(_bdx, _bdz); // lookAt +Z → rotation.y = atan2(dx,dz)
        const _turn = canSee ? 6 : (the_entity.state === 'PATROLLING' ? 2.5 : 4);
        the_entity.mesh.rotation.x = 0;
        the_entity.mesh.rotation.z = 0;
        the_entity.mesh.rotation.y = _lerpAngle(the_entity.mesh.rotation.y, _desiredYaw, _turn * delta);
    }

    // --- KAFA: görürken oyuncuya KİLİTLENİR (hızlı), aramada tarar, devriyede sakin ---
    if (the_entity.neckPivot) {
        let headTargetYaw = 0, headLerp = 2.5;
        const _bodyYaw = the_entity.mesh.rotation.y;
        if (canSee || (the_entity.state === 'HUNTING' && _knows)) {
            // Bilinçli bakış: gövde daha dönmediyse kafa önce oyuncuya/son yere kilitlenir
            const _look = canSee ? playerPos : _knows;
            let rel = Math.atan2(_look.x - enemyPos.x, _look.z - enemyPos.z) - _bodyYaw;
            while (rel >  Math.PI) rel -= Math.PI * 2;
            while (rel < -Math.PI) rel += Math.PI * 2;
            headTargetYaw = Math.max(-Math.PI * 0.7, Math.min(Math.PI * 0.7, rel));
            headLerp = canSee ? 10 : 5; // gördüğü an kafa hızla döner — "fark etti"
        } else if (the_entity.state === 'SEARCHING') {
            headTargetYaw = Math.sin(Date.now() * 0.0016) * Math.PI * 0.5; // yavaş, deliberate tarama
            headLerp = 3;
        } else {
            headTargetYaw = Math.sin(Date.now() * 0.0006) * 0.22; // devriye: çoğunlukla ileri, hafif bakınma
            headLerp = 2;
        }
        the_entity.neckPivot.rotation.y = THREE.MathUtils.lerp(
            the_entity.neckPivot.rotation.y, headTargetYaw, Math.min(1, headLerp * delta)
        );
    }

    // (Ayrı göz mesh'i yok — renk/tehdit tamamen tepe ışığından geliyor, V7 tarzı)

    // --- KOL ANİMASYONU: amaçlı/bilinçli (gerçek harekete ve duruma bağlı, rastgele DEĞİL) ---
    if (the_entity.leftArm && the_entity.rightArm) {
        // Yürüyüş fazını GERÇEK kat edilen mesafeyle ilerlet → kollar adımlarla senkron
        if (!the_entity._prevAnimPos) the_entity._prevAnimPos = enemyPos.clone();
        const _moved = Math.min(enemyPos.distanceTo(the_entity._prevAnimPos), 0.5); // teleport sıçramasını sınırla
        the_entity._prevAnimPos.copy(enemyPos);
        the_entity.walkPhase += _moved * 4.5;

        // axL/axR: kolun öne-arkaya açısı (x) · ezL/ezR: dirsek bükümü (x) · yL/yR: kolun YANA açılması (y, önden görünürlük + kucak genişliği)
        const _setArm = (axL, axR, ezL, ezR, yL, yR, k) => {
            const t = Math.min(1, k * delta);
            the_entity.leftArm.rotation.x  = THREE.MathUtils.lerp(the_entity.leftArm.rotation.x,  axL, t);
            the_entity.rightArm.rotation.x = THREE.MathUtils.lerp(the_entity.rightArm.rotation.x, axR, t);
            the_entity.leftArm.rotation.y  = THREE.MathUtils.lerp(the_entity.leftArm.rotation.y,  yL, t);
            the_entity.rightArm.rotation.y = THREE.MathUtils.lerp(the_entity.rightArm.rotation.y, yR, t);
            if (the_entity.leftElbow)  the_entity.leftElbow.rotation.x  = THREE.MathUtils.lerp(the_entity.leftElbow.rotation.x,  ezL, t);
            if (the_entity.rightElbow) the_entity.rightElbow.rotation.x = THREE.MathUtils.lerp(the_entity.rightElbow.rotation.x, ezR, t);
        };

        const _dp = enemyPos.distanceTo(playerPos);
        if ((isHuntingNow || isComboActive) && _dp < 6) {
            // YAKALAMA: kollar öne uzanır + YANA açılır (önden de net görünür, "kucaklayıp yakalama"), dirsekler bükük (pençe), hafif titrer
            const tr = Math.sin(Date.now() * 0.018) * 0.05;
            //      axL         axR         ezL   ezR    yL          yR          k
            _setArm(-1.2 + tr,  -1.2 - tr,  0.6,  0.6,  -0.4,        0.4,        6);
        } else if (isHuntingNow || isComboActive) {
            // KOŞU: kollar büyük genlikte, hızlı pompalar (yürüyüş fazıyla senkron)
            const s = Math.sin(the_entity.walkPhase) * 0.6;
            _setArm(s, -s, Math.max(0, s) * 0.6, Math.max(0, -s) * 0.6, 0, 0, 8);
        } else if (_moved > 0.002) {
            // YÜRÜME: doğal, ölçülü kol sallama (adımlarla senkron)
            const s = Math.sin(the_entity.walkPhase) * 0.32;
            _setArm(s, -s, Math.max(0, s) * 0.4, Math.max(0, -s) * 0.4, 0, 0, 5);
        } else {
            // DURUYOR: kollar doğal şekilde yanlarda asılı, sakin (bilinçli duruş)
            _setArm(0.06, 0.06, 0.12, 0.12, 0, 0, 2.5);
        }
    }
}

// =============================================================================
// 11. ANA OYUN DÖNGÜSÜ
// =============================================================================
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    if (delta > 0.1) return;

    updateObjectiveMarker();
    updateThrownObjects(delta);

    soundState.ambientSoundTimer -= delta;
    if (soundState.ambientSoundTimer <= 0 && gameRunning && ambientSounds.length > 0) {
        ambientSounds[Math.floor(Math.random() * ambientSounds.length)].play().catch(() => {});
        soundState.ambientSoundTimer = 20 + Math.random() * 25;
    }

    keys.children.forEach(key => key.rotation.y += delta);
    updateDoors(delta);

    if (gameRunning) {
        const playerPos = controls.getObject().position;
        const oldPos = playerPos.clone();

        if (cinematicPlaying) {
            updateCinematic(delta, playerPos);
        } else {
        player.isCrouching = keyboard['KeyC'];
        const targetPlayerHeight = player.isCrouching ? 1.0 : 1.8;
        const isMoving = keyboard['KeyW'] || keyboard['KeyS'] || keyboard['KeyA'] || keyboard['KeyD'];
        const canSprint = !player.isExhausted && player.stamina > 0 && !player.isCrouching;
        const isSprinting = keyboard['ShiftLeft'] && isMoving && canSprint;

        let currentSpeed = player.walkSpeed;
        if (player.isCrouching) currentSpeed = player.crouchSpeed;
        if (isSprinting) currentSpeed = player.sprintSpeed;

        let soundToPlay = walkSound;
        if (isSprinting) soundToPlay = sprintSound;
        if (!isMoving || player.isCrouching) soundToPlay = null;

        if (isSprinting) {
            player.stamina -= player.staminaDrainRate * delta;
            if (player.stamina <= 0) {
                player.stamina = 0;
                player.isExhausted = true;
            }
        } else {
            if (player.stamina < player.maxStamina) {
                player.stamina += player.staminaRegenRate * delta;
            }
            if (player.isExhausted && player.stamina >= player.staminaRecoveryThreshold) {
                player.isExhausted = false;
            }
        }
        player.stamina = Math.min(player.maxStamina, player.stamina);
        const staminaPct = player.stamina / player.maxStamina;
        staminaBar.style.backgroundColor = player.isExhausted ? '#882222'
            : staminaPct > 0.5 ? '#448844'
            : staminaPct > 0.2 ? '#887722'
            : '#882222';
        staminaBar.style.width = staminaPct * 100 + '%';

        const moveSpeed = currentSpeed * delta;
        if (keyboard['KeyW']) controls.moveForward(moveSpeed);
        if (keyboard['KeyS']) controls.moveForward(-moveSpeed);
        if (keyboard['KeyD']) controls.moveRight(moveSpeed);
        if (keyboard['KeyA']) controls.moveRight(-moveSpeed);

        manageFootstepSounds(soundToPlay);

        // --- V6 GÜNCELLEMESİ: HEAD BOBBING (Hareket edince kamera sallanması) ---
        if (isMoving && !player.isExhausted && !player.isCrouching) {
            // Koşuyorsa daha hızlı, yürüyorsa normal
            const speedMult = isSprinting ? 1.8 : 1.0;
            headBobTimer += delta * HEAD_BOB_FREQ * speedMult;
            
            // Sinüs dalgası (Yukarı-Aşağı hareket)
            camera.position.y = Math.sin(headBobTimer) * HEAD_BOB_AMP;
        } else {
            // Duruyorsa yavaşça merkeze (0) dönsün ama hafif bir nefes alma efekti kalsın
            headBobTimer += delta * 3;
            camera.position.y = THREE.MathUtils.lerp(camera.position.y, Math.sin(headBobTimer) * 0.05, delta * 5);
        }

        player.y_velocity -= GRAVITY * delta;
        playerPos.y += player.y_velocity * delta;
        if (playerPos.y < targetPlayerHeight) {
            playerPos.y = targetPlayerHeight;
            player.y_velocity = 0;
        }

        if (keyboard['Space'] && player.y_velocity === 0 && !player.isCrouching) {
            player.y_velocity = JUMP_STRENGTH;
        }

        // V7: Sliding Collision - duvara çarparken sadece temas eden yön engellenir
        _tmpVec3A.set(playerPos.x, oldPos.y, oldPos.z);
        _tmpVec3B.set(oldPos.x, oldPos.y, playerPos.z);
        const potentialPosX = _tmpVec3A;
        const potentialPosZ = _tmpVec3B;
        if (checkCollision(playerPos, player.hitbox, true)) {
            // Önce X eksenini dene
            if (!checkCollision(potentialPosX, player.hitbox, true)) {
                playerPos.x = potentialPosX.x;
                playerPos.z = oldPos.z;
            // Sonra Z eksenini dene
            } else if (!checkCollision(potentialPosZ, player.hitbox, true)) {
                playerPos.x = oldPos.x;
                playerPos.z = potentialPosZ.z;
            } else {
                // Her iki eksen de tIkali - tam eski poza dön
                playerPos.copy(oldPos);
            }
            playerPos.y = THREE.MathUtils.lerp(playerPos.y, targetPlayerHeight, delta * 10);
        }

        camera.getWorldDirection(cachedCameraDirection);
        flashlight.position.copy(playerPos);
        flashlight.target.position.set(
            playerPos.x + cachedCameraDirection.x,
            playerPos.y + cachedCameraDirection.y,
            playerPos.z + cachedCameraDirection.z
        );
        // V7: Fener Titremesi - Düşman kovaladığında hafif titreme
        if (flashlightOn && !flashlightDisabled) {
            if (the_entity.state === 'HUNTING') {
                flashlight.intensity = 1.5 + (Math.random() - 0.5) * 1.2;
            } else {
                flashlight.intensity = 1.8 + Math.sin(Date.now() * 0.003) * 0.05;
            }
        }
        // Beyaz sanity vignette — entity yaklaştıkça sersem etkisi artar
        {
            const distToEntity = playerPos.distanceTo(the_entity.mesh.position);
            if (distToEntity < 16 && !gameOver) {
                const intensity = Math.min(1, (16 - distToEntity) / 12);
                const size = Math.round(90 + intensity * 120);
                const opacity = (0.05 + intensity * 0.28).toFixed(3);
                sanityVignette.style.boxShadow = `inset 0 0 ${size}px rgba(255,255,255,${opacity})`;
            } else {
                sanityVignette.style.boxShadow = 'inset 0 0 90px rgba(255,255,255,0.05)';
            }
        }

        const isLooking = isPlayerLookingAtEnemy(playerPos);
        if (isLooking && keyboard['KeyF'] && !the_entity.isStunned && flashlightOn) {
            player.flashlightStunCharge += delta;
            flashlightStunContainer.style.opacity = '1';
            const angle = (player.flashlightStunCharge / player.stunRequirement) * 360;
            const rad = angle * Math.PI / 180;
            const px = Math.round(50 + Math.sin(rad) * 50);
            const py = Math.round(50 - Math.cos(rad) * 50);
            if (angle <= 90) {
                flashlightStunBar.style.clipPath = `polygon(50% 50%, 50% 0%, ${px}% ${py}%)`;
            } else if (angle <= 180) {
                flashlightStunBar.style.clipPath = `polygon(50% 50%, 50% 0%, 100% 0%, ${px}% ${py}%)`;
            } else if (angle <= 270) {
                flashlightStunBar.style.clipPath = `polygon(50% 50%, 50% 0%, 100% 0%, 100% 100%, ${px}% ${py}%)`;
            } else {
                flashlightStunBar.style.clipPath = `polygon(50% 50%, 50% 0%, 100% 0%, 100% 100%, 0% 100%, ${px}% ${py}%)`;
            }
            if (player.flashlightStunCharge >= player.stunRequirement) {
                the_entity.isStunned = true;
                the_entity.stunTimer = 3.5;
                player.stunRequirement += 0.5;
                player.flashlightStunCharge = 0;
            }
        } else {
            player.flashlightStunCharge = 0;
            flashlightStunContainer.style.opacity = '0';
        }

        if (keyboard['KeyG'] && player.inventory[player.activeSlot] && !player.isAiming) {
            player.isAiming = true;
        } else if (!keyboard['KeyG'] && player.isAiming) {
            handleThrow();
        }

        for (let i = keys.children.length - 1; i >= 0; i--) {
            const key = keys.children[i];
            if (playerPos.distanceToSquared(key.position) < 2.25) {
                keys.remove(key);
                keysCollected++;
                updateKeyCounterUI(true);
                if (keyPickupSound) keyPickupSound.play().catch(() => {});
                if (keysCollected >= TOTAL_KEYS && !keysCollectedHandled) {
                    keysCollectedHandled = true;
                    onAllKeysCollected();
                }
                break;
            }
        }

        updateMemory(delta, playerPos);
        updateHallucinations(delta, playerPos);
        updateTheEntity(delta, playerPos, oldPos);
        updateInteractionHint(delta);

        if (escapeCountdownActive) {
            escapeCountdown -= delta;
            try { countdownTimerEl.textContent = Math.ceil(escapeCountdown).toString(); } catch (e) {}
            if (escapeCountdown <= 0) {
                escapeCountdownActive = false;
                entityFrozen = false;
                // V7: Canavar hızlanır
                the_entity.huntSpeed = originalHuntSpeed * 1.35;
                // Frozen dönemindeki birikmiş zamanlayıcıları sıfırla (anlık TP engellemek için) +
                // huntGrace dahil TÜM HUNTING alanlarını kurar — yoksa aynı karede görüş kontrolü
                // başarısız olursa entity anında SEARCHING'e geri düşüp "hızlanmış canavar" finalini kaçırıyordu.
                enterHunting(controls.getObject().position, { resetTimers: true });
                try { countdownTimerEl.style.display = 'none'; } catch (e) {}
                try { escapeMessageEl.style.display = 'none'; } catch (e) {}
                // V7: Kırmızı ışık DEVAM eder, sönmez
                // try { if (corridorAmbient) { corridorAmbient.color.set(0xAAAA88); } } catch (e) {}
                // V7: background2 kapanmaz, gerilim müziği sürer
                // try { if (background2) { background2.pause(); background2.currentTime = 0; } } catch (e) {}
                try { if (ambientWind) { ambientWind.play().catch(() => {}); } } catch (e) {}
            }
        }

        if (the_entity.isVisible && playerPos.distanceToSquared(the_entity.mesh.position) < 2.25 && !the_entity.isStunned) triggerGameOver();

        if (keysCollectedHandled && entityFrozen && originalExitDoorPosition) {
            const escapeTriggerDist = 8;
            if (playerPos.distanceTo(originalExitDoorPosition) < escapeTriggerDist && !escapeCountdownActive) {
                try {
                    escapeMessageEl.textContent = "ÇIKIŞ MÜHÜRLENDİ! YENİ BİR YOL AÇILDI, ONU BUL!";
                    escapeMessageEl.style.display = 'block';
                } catch (e) {}
                try { countdownTimerEl.textContent = String(ESCAPE_COUNTDOWN_SECONDS); } catch (e) {}
                if (exitDoor) {
                    exitDoor.userData.isOpen = false;
                    exitDoor.userData.isAnimating = true;
                    exitDoor.userData.isExitLocked = true;
                }
                try { if (exitMarker && exitMarker.material) exitMarker.material.color.set(0xff4444); } catch (e) {}
                relocateExitToRandom();
                try { entityTrembleBase *= entityTrembleCloseMultiplier; } catch (e) {}
                startEscapeCountdown();
            }
        }

        // Kazanma: handleInteraction() içinde E tuşuyla tetikleniyor
        } // end else (!cinematicPlaying)
    }
    renderer.render(scene, camera);

    // V7.1: Telemetri Verisi Gönder (Monitor için)
    if (gameRunning && telemetryBoard) {
        telemetryBoard.postMessage({
            entity: {
                pos: the_entity.mesh.position,
                rot: { x: the_entity.mesh.rotation.x, y: the_entity.mesh.rotation.y, z: the_entity.mesh.rotation.z },
                state: the_entity.state,
                walkPhase: the_entity.walkPhase,
                isStunned: the_entity.isStunned,
                neckRotY: the_entity.neckPivot ? the_entity.neckPivot.rotation.y : 0,
                leftArmRot: the_entity.leftArm ? { x: the_entity.leftArm.rotation.x, y: the_entity.leftArm.rotation.y } : { x: 0, y: 0 },
                rightArmRot: the_entity.rightArm ? { x: the_entity.rightArm.rotation.x, y: the_entity.rightArm.rotation.y } : { x: 0, y: 0 },
                leftElbowRot: the_entity.leftElbow ? the_entity.leftElbow.rotation.x : 0.12,
                rightElbowRot: the_entity.rightElbow ? the_entity.rightElbow.rotation.x : 0.12,
                isVisible: the_entity.isVisible,
                eyeLightColor: the_entity.eyeLight ? '#' + the_entity.eyeLight.color.getHexString() : '#ffffff',
                eyeLightIntensity: the_entity.eyeLight ? the_entity.eyeLight.intensity : 1
            },
            player: {
                pos: controls.getObject().position,
                rot: { x: camera.rotation.x, y: camera.rotation.y, z: camera.rotation.z },
                isSprinting: keyboard['ShiftLeft'] && !player.isCrouching && player.stamina > 0,
                isCrouching: player.isCrouching,
                flashlightOn: flashlightOn,
                activeSlot: player.activeSlot,
                stamina: player.stamina
            },
            fakeEntity: hallucinationManager.isActive ? {
                pos: hallucinationManager.fakeEntity.position,
                state: hallucinationManager.state
            } : null,
            doors: doorMeshes.map(dm => dm.userData.pivot.userData.isOpen),
            keysCollected: keysCollected,
            // V7.3: Canlı anahtar ve exit pozisyonları
            keys: keys.children.map(k => ({ x: k.position.x, z: k.position.z })),
            exitDoor: exitDoor ? {
                pos: exitDoor.position,
                isLocked: exitDoor.userData.isExitLocked,
                isOpen: exitDoor.userData.isOpen
            } : null
        });
    }
}

updateInventoryUI();
animate();