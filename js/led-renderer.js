// State changes → DOM visual updates (colors, brightness, press highlights)

import { state } from './state.js';
import { lookupColor } from './colors.js';
import { STRIP_MODE } from './sysex.js';

let initialized = false;

/**
 * Initialize the LED renderer — subscribe to all state events.
 */
export function initLedRenderer() {
  if (initialized) return;
  initialized = true;

  state.addEventListener('led-change', (e) => {
    const { controlId, value } = e.detail;
    updateLed(controlId, value);
  });

  state.addEventListener('press-change', (e) => {
    const { controlId, pressed } = e.detail;
    updatePress(controlId, pressed);
  });

  state.addEventListener('strip-value-change', (e) => {
    renderSegments(e.detail.controlId);
  });

  state.addEventListener('strip-value2-change', (e) => {
    renderSegments(e.detail.controlId);
  });

  state.addEventListener('strip-touch-change', (e) => {
    const { controlId, touched } = e.detail;
    const unit = document.querySelector(`.strip-unit[data-control-id="${controlId}"]`);
    if (unit) unit.classList.toggle('touched', touched);
  });

  state.addEventListener('strip-led-change', (e) => {
    renderSegments(e.detail.controlId);
  });

  state.addEventListener('strip-finger-change', (e) => {
    const { controlId, value } = e.detail;
    const unit = document.querySelector(`.strip-unit[data-control-id="${controlId}"]`);
    if (unit) unit.style.setProperty('--finger-pos', `${(1 - value / 127) * 100}%`);
  });

  state.addEventListener('encoder-push-change', (e) => {
    const el = document.querySelector('[data-control-id="EncPush"]');
    if (el) el.classList.toggle('pressed', e.detail.pushed);
  });

  state.addEventListener('encoder-touch-change', (e) => {
    const el = document.querySelector('[data-control-id="EncPush"]');
    if (el) el.classList.toggle('touched', e.detail.touched);
  });

  state.addEventListener('encoder-turn', (e) => {
    const el = document.querySelector('[data-control-id="EncPush"]');
    if (!el) return;
    const dir = e.detail.direction;
    el.classList.remove('turn-cw', 'turn-ccw');
    // Force reflow to restart animation
    void el.offsetWidth;
    el.classList.add(dir > 0 ? 'turn-cw' : 'turn-ccw');
  });

  state.addEventListener('level-change', (e) => {
    const { channel, value } = e.detail;
    const el = document.getElementById(`level-${channel.toLowerCase()}`);
    if (!el) return;
    const segEls = el.children;
    const litCount = Math.round((value / 127) * 11);
    // segEls[0] = top (index 10), segEls[10] = bottom (index 0)
    for (let i = 0; i < 11; i++) {
      segEls[10 - i].classList.toggle('lit', i < litCount);
    }
  });
}

function updateLed(controlId, colorValue) {
  const el = document.querySelector(`[data-control-id="${controlId}"]`);
  if (!el) return;

  const { hex, opacity } = lookupColor(colorValue);
  if (hex === 'transparent' || opacity === 0) {
    el.classList.remove('lit');
    el.style.removeProperty('--led-color');
    el.style.removeProperty('--led-brightness');
  } else {
    el.classList.add('lit');
    el.style.setProperty('--led-color', hex);
    el.style.setProperty('--led-brightness', opacity);
  }
}

function updatePress(controlId, pressed) {
  const el = document.querySelector(`[data-control-id="${controlId}"]`);
  if (!el) return;

  el.classList.toggle('pressed', pressed);
  if (pressed) {
    spawnRipple(el);
  }
}

function spawnRipple(el) {
  const ripple = document.createElement('div');
  ripple.className = 'ripple';

  el.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove());
}

/**
 * Map a 0-127 value to segment index 0-10.
 */
function valueToSeg(value) {
  return Math.round((value / 127) * 10);
}

/**
 * Compute segment states for a strip.
 * Returns array of 11 descriptors, index 0 = bottom, 10 = top.
 * Each: { lit: bool, dot: bool, color: string, brightness: number }
 *   dot = white DAW-driven indicator (not finger position)
 */
function computeSegments(mode, value1, value2, colorHex, colorBrightness) {
  const segs = new Array(11);
  for (let i = 0; i < 11; i++) {
    segs[i] = { lit: false, dot: false, color: colorHex, brightness: colorBrightness };
  }

  switch (mode) {
    case STRIP_MODE.SINGLE:
    default: {
      // Fill from bottom up through segment N (nothing lit at value 0)
      if (value1 > 0) {
        const n = valueToSeg(value1);
        for (let i = 0; i <= n; i++) {
          segs[i].lit = true;
        }
      }
      break;
    }
    case STRIP_MODE.DOT: {
      // White dot at position
      const n = valueToSeg(value1);
      segs[n].dot = true;
      break;
    }
    case STRIP_MODE.PAN: {
      // Bipolar colored fill from center (segment 5)
      const center = 5;
      if (value1 < 64) {
        // Round toward center (ceil) so bar stays narrow near center
        const n = Math.ceil((value1 / 127) * 10);
        for (let i = n; i <= center; i++) {
          segs[i].lit = true;
        }
      } else if (value1 > 64) {
        // Round toward center (floor) so bar stays narrow near center
        const n = Math.floor((value1 / 127) * 10);
        for (let i = center; i <= n; i++) {
          segs[i].lit = true;
        }
      } else {
        segs[center].lit = true;
      }
      break;
    }
    case STRIP_MODE.DUAL: {
      // Colored bar fill from value1 (CC), white dot at value2 (SysEx 0x04)
      const numLit = Math.round((value1 / 127) * 11);
      for (let i = 0; i < numLit; i++) {
        segs[i].lit = true;
      }
      const dotN = valueToSeg(value2);
      segs[dotN].dot = true;
      break;
    }
  }

  return segs;
}

/**
 * Render the 11 LED segments for a strip.
 */
function renderSegments(controlId) {
  const unit = document.querySelector(`.strip-unit[data-control-id="${controlId}"]`);
  if (!unit) return;

  const segContainer = unit.querySelector('.strip-segments');
  if (!segContainer) return;

  // DOM children: first child = seg 10 (top), last child = seg 0 (bottom)
  const segEls = segContainer.children;
  if (segEls.length !== 11) return;

  const { mode, color: colorValue } = state.getStripLed(controlId);
  const { hex, opacity } = lookupColor(colorValue);
  const colorHex = hex === 'transparent' ? '#666' : hex;
  const colorBrightness = opacity || 0.5;

  const value1 = state.getStripValue(controlId);
  const value2 = state.getStripValue2(controlId);

  // Update strip color CSS var on unit (for touch circle glow)
  unit.style.setProperty('--strip-color', colorHex);
  unit.style.setProperty('--strip-brightness', colorBrightness);

  const segs = computeSegments(mode, value1, value2, colorHex, colorBrightness);

  for (let i = 0; i < 11; i++) {
    // segEls[0] = top (index 10), segEls[10] = bottom (index 0)
    const el = segEls[10 - i];
    const seg = segs[i];

    if (seg.dot) {
      el.classList.add('lit', 'dot');
      el.style.removeProperty('--seg-color');
      el.style.removeProperty('--seg-brightness');
    } else if (seg.lit) {
      el.classList.add('lit');
      el.classList.remove('dot');
      el.style.setProperty('--seg-color', seg.color);
      el.style.setProperty('--seg-brightness', seg.brightness);
    } else {
      el.classList.remove('lit', 'dot');
      el.style.removeProperty('--seg-color');
      el.style.removeProperty('--seg-brightness');
    }
  }
}
