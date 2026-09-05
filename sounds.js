// =============================================================================
// SOUNDS.JS — Tüm ses yönetimi
// =============================================================================

export function createSafeAudio(src, volume = 1.0) {
    try {
        const audio = new Audio(src);
        audio.volume = volume;
        audio.addEventListener('error', () => console.warn(`Ses yüklenemedi: ${src}`));
        return audio;
    } catch (e) {
        console.warn(`Ses oluşturulamadı: ${src}`, e);
        return null;
    }
}

export function makeAudio(src, vol = 1.0, loop = false) {
    const a = createSafeAudio(src, vol);
    if (a) try { a.loop = !!loop; } catch (e) {}
    return a;
}

// Sabit ses dosyaları
export const bottleBreakSound = createSafeAudio('bottle_break.mp3', 0.8) || createSafeAudio('scratch.mp3', 0.8);
export const fakeEntitySound  = createSafeAudio('decoy_alert.mp3', 0.7)  || createSafeAudio('scream.mp3', 0.6);
export const itemPickupSound  = createSafeAudio('pickup.mp3', 1.0)        || createSafeAudio('pickup2.mp3', 1.0);
export const doorSlamSound    = createSafeAudio('door_slam.mp3', 0.9);
export const victoryMusic     = makeAudio('victory.mp3', 0.5, false);
export const backgroundMusic  = makeAudio('background.mp3', 0.3, true);
export const walkSound        = makeAudio('walk.mp3', 1, true);
export const sprintSound      = makeAudio('sprint.mp3', 1, true);
export const screamSound      = makeAudio('scream.mp3', 1, false);
export const keyPickupSound   = makeAudio('pickup2.mp3', 1, false);
export const doorOpenSound    = makeAudio('door_unlock.mp3', 0.9, false);
export const doorCloseSound   = makeAudio('door_locked.mp3', 0.9, false);
export const giggleSound      = makeAudio('caller_voice.mp3', 0.7, false);
export const aiDoorOpenSound  = makeAudio('door_unlock.mp3', 0.9, false);
export const ambientSounds    = [
    makeAudio('scratch.mp3', 0.4, false),
    makeAudio('ambient_wind.mp3', 0.15, false),
    makeAudio('behind.mp3', 0.2, false)
].filter(Boolean);
export const tenseMusic       = makeAudio('tense_music.mp3', 0.4, false);
export const ambientWind      = makeAudio('ambient_wind.mp3', 0.45, true);
export const behindSound      = createSafeAudio('behind.mp3', 0.7);
export const scratchSound     = makeAudio('scratch.mp3', 0.35, false);
export const deathMusic       = (() => {
    const d = createSafeAudio('death_music.mp3', 0.6);
    if (d) d.loop = false;
    return d;
})();

// Oyun ses durumu — phase takibi duraklatma/devam bug'ını düzeltir
export const soundState = {
    phase: 'normal',       // 'normal' | 'post-keys' | 'escape'
    currentFootstepSound: null,
    ambientSoundTimer: 30,
    background2: null
};

// background2 async yükleme
try {
    fetch('background2.mp3', { method: 'HEAD' })
        .then(r => {
            if (r.ok) soundState.background2 = makeAudio('background2.mp3', 0.45, true);
            else console.warn('background2.mp3 bulunamadı');
        })
        .catch(e => console.warn('background2 kontrolü:', e));
} catch (e) {}

// Adım sesi yönetimi
export function manageFootstepSounds(soundToPlay) {
    if (soundState.currentFootstepSound !== soundToPlay) {
        if (soundState.currentFootstepSound) soundState.currentFootstepSound.pause();
        if (soundToPlay) soundToPlay.play().catch(() => {});
        soundState.currentFootstepSound = soundToPlay;
    }
}

// Tüm sesleri durdur (game state'e bakılmaksızın)
export function pauseAllSounds() {
    const allSounds = [
        backgroundMusic, tenseMusic, ambientWind,
        deathMusic, victoryMusic, screamSound, doorSlamSound,
        giggleSound, behindSound, fakeEntitySound, bottleBreakSound,
        itemPickupSound, keyPickupSound, doorOpenSound, doorCloseSound,
        aiDoorOpenSound, scratchSound, soundState.background2,
        soundState.currentFootstepSound
    ];
    allSounds.forEach(s => { try { if (s && !s.paused) s.pause(); } catch (e) {} });
    try { ambientSounds.forEach(s => { if (!s.paused) s.pause(); }); } catch (e) {}
}
