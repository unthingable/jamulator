// DOM events → MIDI output (button press/release)

import { sendCC, sendNoteOn, sendNoteOff, sendAftertouch, send } from './midi-engine.js';
import { buildSysEx } from './sysex.js';
import { state } from './state.js';

let currentMapping = null;

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

function bindButtons() {
  // All clickable controls
  document.querySelectorAll('[data-control-id]').forEach(el => {
    const controlId = el.dataset.controlId;

    // Skip strips (handled by touchstrip.js) and encoder turn
    if (controlId.startsWith('Tst') || controlId === 'EncTurn') return;

    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      onPress(controlId, true);
    });

    el.addEventListener('pointerup', (e) => {
      el.releasePointerCapture(e.pointerId);
      onPress(controlId, false);
    });

    el.addEventListener('pointercancel', (e) => {
      el.releasePointerCapture(e.pointerId);
      onPress(controlId, false);
    });

    // Prevent context menu on long press
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  });
}

function onPress(controlId, pressed) {
  // Shift uses SysEx, not CC/Note
  if (controlId === 'BtnShift') {
    state.setPressed(controlId, pressed);
    state.setShift(pressed);
    send(buildSysEx(0x4D, [pressed ? 0x01 : 0x00]));
    return;
  }

  if (!currentMapping) return;
  const def = currentMapping.outputMap.get(controlId);
  if (!def) return;

  // Update local pressed state
  state.setPressed(controlId, pressed);

  const value = pressed ? 127 : 0;

  switch (def.type) {
    case 'cc':
      sendCC(def.channel, def.number, value);
      break;
    case 'note':
      if (pressed) {
        sendNoteOn(def.channel, def.number, 127);
      } else {
        sendNoteOff(def.channel, def.number);
      }
      break;
  }
}
