/**
 * 10-Foot Smart TV Spatial Navigation & Control Helper for My PC SDK v1.
 *
 * Because My PC runs apps inside a full-screen sandboxed iframe on Samsung Smart TVs (Tizen 8+)
 * and owns the hardware input, the iframe does not rely on native browser Tab focus.
 * Instead, all navigation from:
 *  - TV Remote (Left / Right / Up / Down arrows + OK)
 *  - Game Controllers (D-Pad, Left Stick, A / B / X / Y / LB / RB / LT / RT / Start / Select)
 *  - Keyboard (Arrow keys, WASD, Enter, Space, Esc / Backspace)
 * arrives via `MyPC.init({ onInput })` and `MyPC.gamepad` and drives this 2D spatial focus engine.
 */

export type NavDirection = 'up' | 'down' | 'left' | 'right';

export interface SpatialRect {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Pure 2D spatial navigation algorithm (unit-testable without DOM).
 * Given the current focused rect and a list of candidate rects, returns the best candidate ID
 * in the requested direction (`up`, `down`, `left`, `right`), or null if none exists.
 */
export function findNextSpatialTarget(
  current: SpatialRect,
  candidates: SpatialRect[],
  direction: NavDirection
): string | null {
  const cx = current.left + current.width / 2;
  const cy = current.top + current.height / 2;

  let bestSameLaneId: string | null = null;
  let bestSameLaneScore = Infinity;

  let bestAnyId: string | null = null;
  let bestAnyScore = Infinity;

  for (let i = 0; i < candidates.length; i++) {
    const cand = candidates[i];
    if (cand.id === current.id) continue;
    if (cand.width <= 0 || cand.height <= 0) continue;

    const tx = cand.left + cand.width / 2;
    const ty = cand.top + cand.height / 2;
    const dx = tx - cx;
    const dy = ty - cy;

    if (direction === 'left' && dx >= -4) continue;
    if (direction === 'right' && dx <= 4) continue;
    if (direction === 'up' && dy >= -4) continue;
    if (direction === 'down' && dy <= 4) continue;

    const primaryDist =
      direction === 'left' || direction === 'right' ? Math.abs(dx) : Math.abs(dy);
    const orthoDist =
      direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);

    // Check if candidate overlaps the current element's row (for left/right) or column (for up/down)
    const overlapsRow =
      cand.top < current.top + current.height + 14 &&
      cand.top + cand.height > current.top - 14;
    const overlapsCol =
      cand.left < current.left + current.width + 24 &&
      cand.left + cand.width > current.left - 24;

    const inSameLane =
      direction === 'left' || direction === 'right' ? overlapsRow : overlapsCol;

    if (inSameLane) {
      const laneScore = primaryDist + orthoDist * 1.75;
      if (laneScore < bestSameLaneScore) {
        bestSameLaneScore = laneScore;
        bestSameLaneId = cand.id;
      }
    }

    // Fallback score across adjacent rows/columns: heavily penalize orthogonal drift
    const anyScore = primaryDist + orthoDist * 3.2;
    if (anyScore < bestAnyScore) {
      bestAnyScore = anyScore;
      bestAnyId = cand.id;
    }
  }

  return bestSameLaneId ?? bestAnyId;
}

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input[type="range"]:not([disabled])',
  'select:not([disabled])',
  'input[type="text"]:not([disabled])',
  'input[type="number"]:not([disabled])',
  '[data-tv-focusable="true"]',
].join(', ');

/**
 * Returns all visible, interactive elements within the active scope (Settings dialog if open,
 * otherwise the main stage HUD).
 */
export function queryVisibleFocusableElements(rootScope: ParentNode | null): HTMLElement[] {
  if (!rootScope) return [];
  const rawList = rootScope.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
  const result: HTMLElement[] = [];

  for (let i = 0; i < rawList.length; i++) {
    const el = rawList[i];
    if (el.getAttribute('aria-hidden') === 'true') continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) continue;
    const style = window.getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') {
      continue;
    }
    result.push(el);
  }
  return result;
}

/**
 * Applies the 3-meter-visible TV focus marker (`data-tv-focused="true"`) to `target`
 * and clears it from all other elements.
 */
export function applyTvFocusToElement(
  target: HTMLElement | null,
  scrollIntoView = true
): HTMLElement | null {
  if (typeof document === 'undefined') return null;

  const prev = document.querySelectorAll<HTMLElement>('[data-tv-focused="true"]');
  for (let i = 0; i < prev.length; i++) {
    if (prev[i] !== target) {
      prev[i].removeAttribute('data-tv-focused');
    }
  }

  if (!target) return null;

  target.setAttribute('data-tv-focused', 'true');

  if (scrollIntoView && typeof target.scrollIntoView === 'function') {
    try {
      target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } catch {
      // ignore on older engines
    }
  }

  // Only call native .focus() on buttons/ranges/selects so text inputs don't trap arrow keys
  // until explicitly confirmed with OK.
  const tag = target.tagName.toLowerCase();
  const type = (target as HTMLInputElement).type?.toLowerCase();
  if (tag !== 'input' || type === 'range') {
    try {
      target.focus({ preventScroll: true });
    } catch {
      // ignore in sandboxed iframe
    }
  } else if (document.activeElement && document.activeElement !== document.body) {
    // Blur any previously active text input when moving spatial focus away from it
    if (document.activeElement !== target) {
      try {
        (document.activeElement as HTMLElement).blur();
      } catch {
        // ignore
      }
    }
  }

  return target;
}

/**
 * Steps a React-controlled `<input type="range">` or `<input type="number">` value
 * and dispatches native `input` and `change` events so React state updates immediately.
 */
export function stepRangeOrNumberInput(
  input: HTMLInputElement,
  deltaDirection: -1 | 1
): number {
  const min = input.min !== '' ? parseFloat(input.min) : 0;
  const max = input.max !== '' ? parseFloat(input.max) : 100;
  const rawStep = input.step && input.step !== 'any' ? parseFloat(input.step) : (max - min) / 20;
  const step = Number.isFinite(rawStep) && rawStep > 0 ? rawStep : (max - min) / 20;
  const currentVal = Number.isFinite(parseFloat(input.value)) ? parseFloat(input.value) : min;

  // Use a slightly larger comfortable TV remote step if step is tiny (e.g. 0.02 -> 0.05)
  const effectiveStep =
    input.type === 'range' && max - min >= 0.8 && step < 0.04 ? 0.05 : step;

  const rawNext = currentVal + deltaDirection * effectiveStep;
  const clamped = Math.max(min, Math.min(max, Math.round(rawNext * 1000) / 1000));

  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  )?.set;

  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(input, String(clamped));
  } else {
    input.value = String(clamped);
  }

  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return clamped;
}

/**
 * Cycles a React-controlled `<select>` element to the next or previous `<option>`
 * so TV remote users can change any dropdown with the OK button (or Left/Right) without
 * needing a native OS popup menu inside the sandboxed TV iframe.
 */
export function cycleSelectElement(
  select: HTMLSelectElement,
  delta: 1 | -1 = 1
): string {
  const options = Array.from(select.options).filter((o) => !o.disabled);
  if (options.length === 0) return select.value;

  const currentIndex = options.findIndex((o) => o.value === select.value);
  const nextIndex =
    currentIndex >= 0
      ? (currentIndex + delta + options.length) % options.length
      : 0;
  const nextValue = options[nextIndex].value;

  const nativeSelectValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLSelectElement.prototype,
    'value'
  )?.set;

  if (nativeSelectValueSetter) {
    nativeSelectValueSetter.call(select, nextValue);
  } else {
    select.value = nextValue;
  }

  select.dispatchEvent(new Event('input', { bubbles: true }));
  select.dispatchEvent(new Event('change', { bubbles: true }));
  return options[nextIndex].text || nextValue;
}
