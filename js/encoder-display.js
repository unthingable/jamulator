// Encoder turn display — arc flash + stacking counters

import { state } from './state.js';

const MAX_SLOTS = 4;
const IDLE_MS = 500;

let encoderEl = null;
let groups = [];       // newest first; each { direction, count, el, idleTimer, fading }
let activeGroup = null;

export function initEncoderDisplay() {
  encoderEl = document.querySelector('[data-control-id="EncPush"]');
  if (!encoderEl) return;

  state.addEventListener('encoder-turn', (e) => {
    onTurn(e.detail.direction);
  });
}

function onTurn(direction) {
  // ── Arc flash ──
  encoderEl.classList.remove('arc-cw', 'arc-ccw');
  void encoderEl.offsetWidth;
  encoderEl.classList.add(direction > 0 ? 'arc-cw' : 'arc-ccw');

  // ── Counter logic ──
  if (activeGroup && activeGroup.direction === direction) {
    // Same direction burst — increment
    activeGroup.count++;
    activeGroup.el.textContent = formatCount(activeGroup.count, direction);
    resetIdle();
  } else {
    // Direction change or fresh burst — push old counter down, create new one
    if (activeGroup) {
      clearTimeout(activeGroup.idleTimer);
      activeGroup.idleTimer = null;
    }

    // Evict oldest if at capacity
    while (groups.length >= MAX_SLOTS) {
      destroyGroup(groups[groups.length - 1]);
    }

    // Shift all existing groups down one slot and start fading
    groups.forEach((g, i) => {
      moveToSlot(g, i + 1);
      if (!g.fading) startFade(g);
    });

    // New counter at slot 0
    const el = document.createElement('div');
    el.className = `encoder-counter dir-${direction > 0 ? 'cw' : 'ccw'}`;
    el.textContent = formatCount(1, direction);
    moveToSlotEl(el, 0);
    encoderEl.appendChild(el);

    activeGroup = { direction, count: 1, el, idleTimer: null, fading: false };
    groups.unshift(activeGroup);
    resetIdle();
  }
}

function formatCount(count, direction) {
  return direction > 0 ? `+${count}` : `\u2212${count}`;
}

function moveToSlot(group, slot) {
  moveToSlotEl(group.el, slot);
}

function moveToSlotEl(el, slot) {
  el.style.top = `calc(${slot * 13}px)`;
}

function resetIdle() {
  if (activeGroup.idleTimer) clearTimeout(activeGroup.idleTimer);
  activeGroup.idleTimer = setTimeout(() => {
    if (activeGroup) {
      startFade(activeGroup);
      activeGroup = null;
    }
  }, IDLE_MS);
}

function startFade(group) {
  if (group.fading) return;
  group.fading = true;
  group.el.classList.add('fading');
  group.el.addEventListener('animationend', () => {
    destroyGroup(group);
  }, { once: true });
}

function destroyGroup(group) {
  group.el.remove();
  if (group.idleTimer) clearTimeout(group.idleTimer);
  const idx = groups.indexOf(group);
  if (idx !== -1) groups.splice(idx, 1);
  if (activeGroup === group) activeGroup = null;
  // Re-index remaining slots
  groups.forEach((g, i) => moveToSlot(g, i));
}
