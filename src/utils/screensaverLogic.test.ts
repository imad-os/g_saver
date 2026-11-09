import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS,
  sanitizeSettings,
  parseLaunchOverrides,
  resolveQualityBudget,
  computePixelOrbit,
  formatClockTime,
  buildMyPCHostUrl,
  SCENE_IDS,
  TRANSLATIONS,
} from './screensaverLogic';

test('sanitizeSettings preserves defaults and clamps out-of-range values', () => {
  const result = sanitizeSettings(DEFAULT_SETTINGS, {
    scene: 'campfire',
    fireIntensity: 9.5,
    emberDensity: -2,
    peakLuminance: 20,
    clockFormat: '12h',
    audioChannels: {
      woodCrackle: 1.8,
      rainDownpour: -0.5,
    },
  });

  assert.equal(result.scene, 'campfire');
  assert.equal(result.fireIntensity, 1.5);
  assert.equal(result.emberDensity, 0);
  assert.equal(result.peakLuminance, 40);
  assert.equal(result.clockFormat, '12h');
  assert.equal(result.audioChannels.woodCrackle, 1.0);
  assert.equal(result.audioChannels.rainDownpour, 0.0);
});

test('parseLaunchOverrides parses query parameters and MyPC launch paths', () => {
  const fromQuery = parseLaunchOverrides(
    '?scene=rain&mode=settings&clock=12h&quality=low&fire=1.2&orbit=0',
    null
  );
  assert.equal(fromQuery.scene, 'rain');
  assert.equal(fromQuery.mode, 'settings');
  assert.equal(fromQuery.clockFormat, '12h');
  assert.equal(fromQuery.qualityTier, 'low');
  assert.equal(fromQuery.fireIntensity, 1.2);
  assert.equal(fromQuery.burnInProtection, false);

  const fromDeepLink = parseLaunchOverrides('', 'scene/campfire');
  assert.equal(fromDeepLink.scene, 'campfire');

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

test('buildMyPCHostUrl generates valid round-trip launch URL', () => {
  const url = buildMyPCHostUrl('https://example.github.io/screensaver/', DEFAULT_SETTINGS, 'settings');
  assert.ok(url.includes('scene=hearth'));
  assert.ok(url.includes('mode=settings'));
  const parsed = parseLaunchOverrides(url.split('?')[1], null);
  assert.equal(parsed.scene, 'hearth');
  assert.equal(parsed.mode, 'settings');
});

test('all 4 MyPC languages cover all 6 scenes', () => {
  for (const lang of ['en', 'fr', 'es', 'ar'] as const) {
    for (const id of SCENE_IDS) {
      assert.ok(TRANSLATIONS[lang].scenes[id].name.length > 0);
      assert.ok(TRANSLATIONS[lang].scenes[id].subtitle.length > 0);
    }
  }
});
