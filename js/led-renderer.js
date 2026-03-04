// State changes → DOM visual updates (colors, brightness, press highlights)

import { state } from './state.js';
import { lookupColor, lookupBaseHex } from './colors.js';
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
    const { controlId, value } = e.detail;
    updateStripBar(controlId, value);
  });

  state.addEventListener('strip-touch-change', (e) => {
    const { controlId, touched } = e.detail;
    updateStripTouch(controlId, touched);
  });

  state.addEventListener('strip-led-change', (e) => {
    const { controlId, mode, color } = e.detail;
    updateStripLed(controlId, mode, color);
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
    if (el) el.style.setProperty('--level', `${(value / 127) * 100}%`);
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
    spawnRipple(el, controlId);
  }
}

function spawnRipple(el, controlId) {
  const ripple = document.createElement('div');
  ripple.className = 'ripple';

  // Use the button's current LED color for the ripple, or white if unlit
  const colorValue = state.getLedColor(controlId);
  const color = colorValue > 0 ? lookupBaseHex(colorValue) : '#ffffff';
  ripple.style.setProperty('--ripple-color', color);

  el.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove());
}

function updateStripBar(controlId, value) {
  const el = document.querySelector(`[data-control-id="${controlId}"]`);
  if (!el) return;
  el.style.setProperty('--strip-value', `${(value / 127) * 100}%`);
  // Update finger position if touched
  el.style.setProperty('--finger-pos', `${(1 - value / 127) * 100}%`);
}

function updateStripTouch(controlId, touched) {
  const el = document.querySelector(`[data-control-id="${controlId}"]`);
  if (!el) return;
  el.classList.toggle('touched', touched);
}

function updateStripLed(controlId, mode, colorValue) {
  const el = document.querySelector(`[data-control-id="${controlId}"]`);
  if (!el) return;

  const { hex, opacity } = lookupColor(colorValue);
  el.style.setProperty('--strip-color', hex === 'transparent' ? '#666' : hex);
  el.style.setProperty('--strip-brightness', opacity || 0.5);
  el.dataset.stripMode = mode;

  // Set mode class
  el.classList.remove('mode-single', 'mode-dot', 'mode-pan', 'mode-dual');
  switch (mode) {
    case STRIP_MODE.DOT:    el.classList.add('mode-dot'); break;
    case STRIP_MODE.PAN:    el.classList.add('mode-pan'); break;
    case STRIP_MODE.DUAL:   el.classList.add('mode-dual'); break;
    default:                el.classList.add('mode-single'); break;
  }
}
