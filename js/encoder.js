// Encoder scroll-wheel + click interaction

import { sendCC } from './midi-engine.js';
import { state } from './state.js';

const ENCODER_CC_TURN = 86;
const ENCODER_CC_PUSH = 87;
const ENCODER_CC_TOUCH = 88;

export function initEncoder() {
  const el = document.querySelector('[data-control-id="EncPush"]');
  if (!el) return;

  // Click = push
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    sendCC(0, ENCODER_CC_PUSH, 127);
    sendCC(0, ENCODER_CC_TOUCH, 127);
    state.setEncoderPushed(true);
    state.setEncoderTouched(true);
    state.setPressed('EncPush', true);
  });

  el.addEventListener('pointerup', (e) => {
    el.releasePointerCapture(e.pointerId);
    sendCC(0, ENCODER_CC_PUSH, 0);
    sendCC(0, ENCODER_CC_TOUCH, 0);
    state.setEncoderPushed(false);
    state.setEncoderTouched(false);
    state.setPressed('EncPush', false);
  });

  el.addEventListener('pointercancel', (e) => {
    el.releasePointerCapture(e.pointerId);
    sendCC(0, ENCODER_CC_PUSH, 0);
    sendCC(0, ENCODER_CC_TOUCH, 0);
    state.setEncoderPushed(false);
    state.setEncoderTouched(false);
    state.setPressed('EncPush', false);
  });

  // Scroll = turn (relative 2's complement: CW = 1, CCW = 127-x)
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    // deltaY > 0 = scroll down = CW, deltaY < 0 = scroll up = CCW
    const direction = e.deltaY > 0 ? 1 : -1;
    // Speed: larger scroll = bigger increment
    const magnitude = Math.min(Math.abs(e.deltaY) > 50 ? 4 : 1, 63);
    const value = direction > 0 ? magnitude : 128 - magnitude;
    sendCC(0, ENCODER_CC_TURN, value);
    state.setEncoderTurn(direction);
  }, { passive: false });

  el.addEventListener('contextmenu', (e) => e.preventDefault());
}
