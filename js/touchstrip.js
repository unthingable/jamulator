// Touch strip click+drag interaction

import { sendCC, sendAftertouch } from './midi-engine.js';
import { state } from './state.js';

let currentMapping = null;

export function initTouchStrips(mapping) {
  currentMapping = mapping;
  document.querySelectorAll('.strip-unit[data-control-id]').forEach(unit => {
    const strip = unit.querySelector('.touch-strip');
    if (strip) bindStrip(strip, unit);
  });
}

export function updateMapping(mapping) {
  currentMapping = mapping;
}

function bindStrip(el, unit) {
  const controlId = unit.dataset.controlId;

  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    onStripStart(el, controlId, e);
  });

  el.addEventListener('pointermove', (e) => {
    if (!el.hasPointerCapture(e.pointerId)) return;
    onStripMove(el, controlId, e);
  });

  el.addEventListener('pointerup', (e) => {
    el.releasePointerCapture(e.pointerId);
    onStripEnd(el, controlId);
  });

  el.addEventListener('pointercancel', (e) => {
    el.releasePointerCapture(e.pointerId);
    onStripEnd(el, controlId);
  });

  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

function posToValue(el, clientY) {
  const rect = el.getBoundingClientRect();
  const ratio = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
  return Math.round(ratio * 127);
}

function onStripStart(el, controlId, e) {
  if (!currentMapping) return;
  const def = currentMapping.outputMap.get(controlId);
  if (!def) return;

  // Send touch sensor (CC or aftertouch depending on mapping)
  if (def.touchCc != null) {
    sendCC(def.channel, def.touchCc, 127);
  } else {
    sendAftertouch(def.channel, def.aftertouchNote, 127);
  }
  state.setStripTouched(controlId, true);

  // Send initial value
  const value = posToValue(el, e.clientY);
  sendCC(def.channel, def.number, value);
  state.setStripFingerPos(controlId, value);
}

function onStripMove(el, controlId, e) {
  if (!currentMapping) return;
  const def = currentMapping.outputMap.get(controlId);
  if (!def) return;

  const value = posToValue(el, e.clientY);
  sendCC(def.channel, def.number, value);
  state.setStripFingerPos(controlId, value);
}

function onStripEnd(el, controlId) {
  if (!currentMapping) return;
  const def = currentMapping.outputMap.get(controlId);
  if (!def) return;

  if (def.touchCc != null) {
    sendCC(def.channel, def.touchCc, 0);
  } else {
    sendAftertouch(def.channel, def.aftertouchNote, 0);
  }
  state.setStripTouched(controlId, false);
}
