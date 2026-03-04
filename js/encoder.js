// Encoder: scroll-wheel, click-drag turn, touch/press split (shift = press)

import { sendCC } from './midi-engine.js';
import { state } from './state.js';

const ENCODER_CC_TURN = 86;
const ENCODER_CC_PUSH = 87;
const ENCODER_CC_TOUCH = 88;

const DRAG_PX_PER_STEP = 6;
const DRAG_DEAD_ZONE = 3;
const WHEEL_THRESHOLD = 40;

let dragging = false;
let dragStarted = false;
let lastClientY = 0;
let pixelAccum = 0;
let wheelAccum = 0;
let isPush = false;
let shiftHeld = false;

export function initEncoder() {
  const el = document.querySelector('[data-control-id="EncPush"]');
  if (!el) return;

  // ── Pointer: touch (click) or press (shift+click) + drag-to-turn ──

  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);

    isPush = e.shiftKey;
    dragging = true;
    dragStarted = false;
    lastClientY = e.clientY;
    pixelAccum = 0;

    // Always send touch
    sendCC(0, ENCODER_CC_TOUCH, 127);
    state.setEncoderTouched(true);

    // Press only with shift
    if (isPush) {
      sendCC(0, ENCODER_CC_PUSH, 127);
      state.setEncoderPushed(true);
      state.setPressed('EncPush', true);
    }
  });

  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;

    const deltaY = e.clientY - lastClientY;
    lastClientY = e.clientY;

    if (!dragStarted) {
      pixelAccum += deltaY;
      if (Math.abs(pixelAccum) >= DRAG_DEAD_ZONE) {
        dragStarted = true;
        pixelAccum = pixelAccum > 0
          ? pixelAccum - DRAG_DEAD_ZONE
          : pixelAccum + DRAG_DEAD_ZONE;
      } else {
        return;
      }
    } else {
      pixelAccum += deltaY;
    }

    // Convert accumulated pixels to turn steps
    while (Math.abs(pixelAccum) >= DRAG_PX_PER_STEP) {
      const direction = pixelAccum > 0 ? 1 : -1;
      pixelAccum -= direction * DRAG_PX_PER_STEP;
      sendCC(0, ENCODER_CC_TURN, direction > 0 ? 1 : 127);
      state.setEncoderTurn(direction);
    }
  });

  function endInteraction() {
    dragging = false;
    dragStarted = false;
    pixelAccum = 0;

    sendCC(0, ENCODER_CC_TOUCH, 0);
    state.setEncoderTouched(false);

    if (isPush) {
      sendCC(0, ENCODER_CC_PUSH, 0);
      state.setEncoderPushed(false);
      state.setPressed('EncPush', false);
    }
    isPush = false;
  }

  el.addEventListener('pointerup', (e) => {
    el.releasePointerCapture(e.pointerId);
    endInteraction();
  });

  el.addEventListener('pointercancel', (e) => {
    el.releasePointerCapture(e.pointerId);
    endInteraction();
  });

  // ── Scroll wheel (accumulator-based, reduced sensitivity) ──

  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    wheelAccum += e.deltaY;

    while (Math.abs(wheelAccum) >= WHEEL_THRESHOLD) {
      const direction = wheelAccum > 0 ? 1 : -1;
      wheelAccum -= direction * WHEEL_THRESHOLD;
      sendCC(0, ENCODER_CC_TURN, direction > 0 ? 1 : 127);
      state.setEncoderTurn(direction);
    }
  }, { passive: false });

  // ── Hover indicator + shift tracking ──

  el.addEventListener('pointerenter', () => {
    el.classList.add('hover');
    if (shiftHeld) el.classList.add('shift-hover');
  });

  el.addEventListener('pointerleave', () => {
    el.classList.remove('hover', 'shift-hover');
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Shift') {
      shiftHeld = true;
      if (el.matches(':hover')) el.classList.add('shift-hover');
    }
  });

  document.addEventListener('keyup', (e) => {
    if (e.key === 'Shift') {
      shiftHeld = false;
      el.classList.remove('shift-hover');
    }
  });

  window.addEventListener('blur', () => {
    shiftHeld = false;
    el.classList.remove('shift-hover');
  });

  el.addEventListener('contextmenu', (e) => e.preventDefault());
}
