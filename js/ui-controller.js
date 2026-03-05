// DOM events → MIDI output (button press/release)

import { sendCC, sendNoteOn, sendNoteOff, send } from './midi-engine.js';
import { buildSysEx } from './sysex.js';
import { state } from './state.js';

let currentMapping = null;

const lockedButtons = new Set(); // controlIds currently toggle-locked

// Dual-source shift tracking
let shiftFromKeyboard = false;
let shiftFromPointer = false;

/**
 * Initialize the UI controller with the given mapping.
 */
export function initUiController(mapping) {
  currentMapping = mapping;
  bindButtons();
}

/**
 * Update mapping (e.g. after .ncmj load).
 */
export function updateMapping(mapping) {
  currentMapping = mapping;
}

/**
 * Dual-source shift: keyboard and pointer can both drive BtnShift.
 * Only emits state/MIDI when the combined active state changes.
 */
export function setShiftActive(source, down) {
  if (source === 'keyboard') shiftFromKeyboard = down;
  else shiftFromPointer = down;
  const active = shiftFromKeyboard || shiftFromPointer;
  if (active !== state.shiftDown) {
    state.setPressed('BtnShift', active);
    state.setShift(active);
    send(buildSysEx(0x4D, [active ? 0x01 : 0x00]));
  }
}

/**
 * Press or release a button. Called from pointer handlers and keyboard.js.
 */
export function pressButton(controlId, pressed, { altKey = false } = {}) {
  // Shift uses dual-source logic
  if (controlId === 'BtnShift') {
    setShiftActive('pointer', pressed);
    return;
  }

  // Unlock: if locked and pressing again → unlock and release
  if (lockedButtons.has(controlId) && pressed) {
    lockedButtons.delete(controlId);
    const el = document.querySelector(`[data-control-id="${controlId}"]`);
    if (el) el.classList.remove('locked');
    doRelease(controlId);
    return;
  }

  // Skip release for locked buttons (they stay pressed)
  if (lockedButtons.has(controlId) && !pressed) {
    return;
  }

  if (pressed) {
    doPress(controlId);
    // Alt+press → lock (not for shift)
    if (altKey) {
      lockedButtons.add(controlId);
      const el = document.querySelector(`[data-control-id="${controlId}"]`);
      if (el) el.classList.add('locked');
    }
  } else {
    doRelease(controlId);
  }
}

function doPress(controlId) {
  if (!currentMapping) return;
  const def = currentMapping.outputMap.get(controlId);
  if (!def) return;

  state.setPressed(controlId, true);

  switch (def.type) {
    case 'cc':
      sendCC(def.channel, def.number, 127);
      break;
    case 'note':
      sendNoteOn(def.channel, def.number, 127);
      break;
  }
}

function doRelease(controlId) {
  if (!currentMapping) return;
  const def = currentMapping.outputMap.get(controlId);
  if (!def) return;

  state.setPressed(controlId, false);

  switch (def.type) {
    case 'cc':
      sendCC(def.channel, def.number, 0);
      break;
    case 'note':
      sendNoteOff(def.channel, def.number);
      break;
  }
}

function releaseAllLocked() {
  for (const controlId of lockedButtons) {
    const el = document.querySelector(`[data-control-id="${controlId}"]`);
    if (el) el.classList.remove('locked');
    doRelease(controlId);
  }
  lockedButtons.clear();
}

function bindButtons() {
  document.addEventListener('keyup', (e) => {
    if (e.key === 'Alt' || e.key === 'Meta') releaseAllLocked();
  });

  document.querySelectorAll('[data-control-id]').forEach(el => {
    const controlId = el.dataset.controlId;

    // Skip strips (handled by touchstrip.js) and encoder turn
    if (controlId.startsWith('Tst') || controlId.startsWith('Enc')) return;

    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      pressButton(controlId, true, { altKey: e.altKey });
    });

    el.addEventListener('pointerup', (e) => {
      el.releasePointerCapture(e.pointerId);
      pressButton(controlId, false);
    });

    el.addEventListener('pointercancel', (e) => {
      el.releasePointerCapture(e.pointerId);
      pressButton(controlId, false);
    });

    // Prevent context menu on long press
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  });
}
