import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS,
  CAMERA_VIEW_MODES,
  sanitizeSettings,
  parseLaunchOverrides,
  resolveQualityBudget,
  computePixelOrbit,
  formatClockTime,
  buildMyPCHostUrl,
  SCENE_IDS,
  TRANSLATIONS,
  normalizeVideosConfig,
  parseVideoUri,
  evaluateVideoSizeNotice,
} from './screensaverLogic';
import { findNextSpatialTarget, SpatialRect } from './tvNavigation';

test('sanitizeSettings preserves defaults, remaps legacy campfire to hearth, supports viewMode, and clamps out-of-range values', () => {
  const result = sanitizeSettings(DEFAULT_SETTINGS, {
    scene: 'campfire',
    fireIntensity: 9.5,
    emberDensity: -2,
    peakLuminance: 20,
    viewMode: 'hearth',
    cameraZoom: 5.0,
    fireEffectStyle: 'roaring_bonfire',
    clockFormat: '12h',
    audioChannels: {
      woodCrackle: 1.8,
      rainDownpour: -0.5,
    },
  });

  // Legacy 'campfire' is cleanly migrated to 'hearth'
  assert.equal(result.scene, 'hearth');
  assert.ok(!SCENE_IDS.includes('campfire' as any));
  assert.equal(result.fireIntensity, 1.5);
  assert.equal(result.emberDensity, 0);
  assert.equal(result.peakLuminance, 40);
  assert.equal(result.viewMode, 'hearth');
  assert.equal(result.cameraZoom, 2.2);
  assert.equal(result.fireEffectStyle, 'roaring_bonfire');
  assert.equal(result.clockFormat, '12h');
  assert.equal(result.audioChannels.woodCrackle, 1.0);
  assert.equal(result.audioChannels.rainDownpour, 0.0);
});

test('CAMERA_VIEW_MODES defines all 4 framing modes (wide, fit, hearth, logs) and migrates legacy zoom', () => {
  assert.deepEqual(
    CAMERA_VIEW_MODES.map((m) => m.id),
    ['wide', 'fit', 'hearth', 'logs']
  );
  assert.equal(DEFAULT_SETTINGS.viewMode, 'wide');

  // Legacy zoom >= 1.65 migrates to 'logs' when viewMode is omitted
  const migratedLogs = sanitizeSettings(DEFAULT_SETTINGS, { cameraZoom: 1.75 });
  assert.equal(migratedLogs.viewMode, 'logs');

  // Legacy zoom 1.35 migrates to 'hearth' when viewMode is omitted
  const migratedHearth = sanitizeSettings(DEFAULT_SETTINGS, { cameraZoom: 1.35 });
  assert.equal(migratedHearth.viewMode, 'hearth');
});

test('parseLaunchOverrides parses query parameters including viewMode and MyPC launch paths', () => {
  const fromQuery = parseLaunchOverrides(
    '?scene=rain&mode=settings&clock=12h&quality=low&fire=1.2&orbit=0&view=logs&zoom=1.5&fireStyle=volumetric_shader',
    null
  );
  assert.equal(fromQuery.scene, 'rain');
  assert.equal(fromQuery.mode, 'settings');
  assert.equal(fromQuery.clockFormat, '12h');
  assert.equal(fromQuery.qualityTier, 'low');
  assert.equal(fromQuery.fireIntensity, 1.2);
  assert.equal(fromQuery.burnInProtection, false);
  assert.equal(fromQuery.viewMode, 'logs');
  assert.equal(fromQuery.cameraZoom, 2.15);
  assert.equal(fromQuery.fireEffectStyle, 'volumetric_shader');

  const fromLegacyDeepLink = parseLaunchOverrides('', 'scene/campfire');
  assert.equal(fromLegacyDeepLink.scene, 'hearth');

  const fromCinematicLink = parseLaunchOverrides('', 'scene/cinematic');
  assert.equal(fromCinematicLink.scene, 'cinematic');

  const fromPreviewLink = parseLaunchOverrides('', 'preview/aurora');
  assert.equal(fromPreviewLink.scene, 'aurora');
  assert.equal(fromPreviewLink.mode, 'preview');
  assert.equal(fromPreviewLink.pureView, true);
});

test('resolveQualityBudget respects auto and explicit TV quality tiers', () => {
  const lowBudget = resolveQualityBudget('auto', 'low');
  assert.equal(lowBudget.tier, 'low');
  assert.equal(lowBudget.enableHeatShimmer, false);
  assert.ok(lowBudget.maxFlameParticles < 100);

  const highBudget = resolveQualityBudget('high', 'low');
  assert.equal(highBudget.tier, 'high');
  assert.equal(highBudget.enableHeatShimmer, true);
  assert.ok(highBudget.maxFlameParticles >= 200);
});

test('computePixelOrbit stays bounded within rangePx and returns 0 when disabled', () => {
  const disabled = computePixelOrbit(50000, false, 16);
  assert.deepEqual(disabled, { x: 0, y: 0 });

  for (let t = 0; t <= 300000; t += 15000) {
    const pos = computePixelOrbit(t, true, 14);
    assert.ok(Math.abs(pos.x) <= 14.01);
    assert.ok(Math.abs(pos.y) <= 14.01);
  }
});

test('formatClockTime formats 12h and 24h accurately', () => {
  const sampleDate = new Date(2026, 10, 9, 15, 7, 9);
  const c24 = formatClockTime(sampleDate, '24h', false);
  assert.equal(c24.time, '15:07');
  assert.equal(c24.period, '');

  const c12 = formatClockTime(sampleDate, '12h', true);
  assert.equal(c12.time, '03:07:09');
  assert.equal(c12.period, 'PM');
});

test('buildMyPCHostUrl generates valid round-trip launch URL with viewMode and fireStyle', () => {
  const custom = sanitizeSettings(DEFAULT_SETTINGS, {
    scene: 'cinematic',
    viewMode: 'hearth',
    cameraZoom: 1.35,
    fireEffectStyle: 'fluid_ribbons',
  });
  const url = buildMyPCHostUrl('https://example.github.io/screensaver/', custom, 'settings');
  assert.ok(url.includes('scene=cinematic'));
  assert.ok(url.includes('mode=settings'));
  assert.ok(url.includes('view=hearth'));
  assert.ok(url.includes('fireStyle=fluid_ribbons'));
  const parsed = parseLaunchOverrides(url.split('?')[1], null);
  assert.equal(parsed.scene, 'cinematic');
  assert.equal(parsed.mode, 'settings');
  assert.equal(parsed.viewMode, 'hearth');
  assert.equal(parsed.fireEffectStyle, 'fluid_ribbons');
});

test('all 4 MyPC languages cover all 6 scenes (without campfire) including cinematic', () => {
  assert.equal(SCENE_IDS.length, 6);
  assert.ok(SCENE_IDS.includes('cinematic'));
  assert.ok(!SCENE_IDS.includes('campfire' as any));
  assert.equal(DEFAULT_SETTINGS.scene, 'hearth');
  assert.equal(DEFAULT_SETTINGS.fireplaceQuality, 'maximum');
  assert.equal(DEFAULT_SETTINGS.fireEffectStyle, 'game_flipbook');
  assert.equal(DEFAULT_SETTINGS.viewMode, 'wide');
  assert.equal(DEFAULT_SETTINGS.cameraZoom, 1.0);
  assert.equal(DEFAULT_SETTINGS.showDiagnostics, false);
  for (const lang of ['en', 'fr', 'es', 'ar'] as const) {
    for (const id of SCENE_IDS) {
      assert.ok(TRANSLATIONS[lang].scenes[id].name.length > 0);
      assert.ok(TRANSLATIONS[lang].scenes[id].subtitle.length > 0);
    }
  }
  const san = sanitizeSettings(DEFAULT_SETTINGS, {
    scene: 'cinematic',
    fireplaceQuality: 'automatic',
    showDiagnostics: true,
  });
  assert.equal(san.scene, 'cinematic');
  assert.equal(san.fireplaceQuality, 'automatic');
  assert.equal(san.showDiagnostics, true);
});

test('normalizeVideosConfig supports single object, array, and keyed dictionary in MyPC.app_config', () => {
  const singleObj = normalizeVideosConfig({
    uri: 'drive://1AbCdEfGhIjKlMnOpQrStUv',
    title: 'fire 4k',
    type: 'hearth',
    audioMode: 'both',
    sizeMb: 42,
  });
  assert.equal(singleObj.length, 1);
  assert.equal(singleObj[0].title, 'fire 4k');
  assert.equal(singleObj[0].uri, 'drive://1AbCdEfGhIjKlMnOpQrStUv');
  assert.equal(singleObj[0].type, 'hearth');
  assert.equal(singleObj[0].sizeBytes, 42 * 1024 * 1024);

  const dictObj = normalizeVideosConfig({
    hearth4k: { uri: 'drive://1111111111111111', title: 'Hearth 4K', type: 'hearth' },
    rain4k: { uri: 'https://example.com/rain.mp4', title: 'Rain 4K', type: 'rain' },
  });
  assert.equal(dictObj.length, 2);
  assert.equal(dictObj[1].type, 'rain');
});

test('parseVideoUri detects MyPC Drive IDs and direct video URLs', () => {
  assert.deepEqual(parseVideoUri('drive://1AbCdEfGhIjKlMnOpQrStUv'), {
    source: 'drive',
    driveFileId: '1AbCdEfGhIjKlMnOpQrStUv',
  });
  assert.deepEqual(
    parseVideoUri('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUv/view?usp=sharing'),
    {
      source: 'drive',
      driveFileId: '1AbCdEfGhIjKlMnOpQrStUv',
    }
  );
  assert.deepEqual(parseVideoUri('https://cdn.example.com/fireplace_4k.mp4'), {
    source: 'url',
    url: 'https://cdn.example.com/fireplace_4k.mp4',
  });
});

test('evaluateVideoSizeNotice classifies optimal, moderate, and large Smart TV video files', () => {
  const opt = evaluateVideoSizeNotice(45 * 1024 * 1024);
  assert.equal(opt.tier, 'optimal');

  const mod = evaluateVideoSizeNotice(120 * 1024 * 1024);
  assert.equal(mod.tier, 'moderate');

  const lrg = evaluateVideoSizeNotice(250 * 1024 * 1024);
  assert.equal(lrg.tier, 'large');
});

test('findNextSpatialTarget navigates 2D grids accurately for TV remote and gamepad D-pad', () => {
  const grid: SpatialRect[] = [
    { id: 'scene_0', left: 100, top: 200, width: 150, height: 48 },
    { id: 'scene_1', left: 260, top: 200, width: 150, height: 48 },
    { id: 'scene_2', left: 420, top: 200, width: 150, height: 48 },
    { id: 'vid_0', left: 100, top: 270, width: 120, height: 36 },
    { id: 'vid_1', left: 230, top: 270, width: 120, height: 36 },
    { id: 'top_settings', left: 420, top: 40, width: 140, height: 44 },
  ];

  // Right from scene_0 -> scene_1
  assert.equal(findNextSpatialTarget(grid[0], grid, 'right'), 'scene_1');
  // Right from scene_1 -> scene_2
  assert.equal(findNextSpatialTarget(grid[1], grid, 'right'), 'scene_2');
  // Left from scene_2 -> scene_1
  assert.equal(findNextSpatialTarget(grid[2], grid, 'left'), 'scene_1');
  // Down from scene_0 -> vid_0
  assert.equal(findNextSpatialTarget(grid[0], grid, 'down'), 'vid_0');
  // Up from scene_2 -> top_settings
  assert.equal(findNextSpatialTarget(grid[2], grid, 'up'), 'top_settings');
});
