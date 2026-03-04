// Keyboard shortcuts → button presses, push-key modifier for encoder

const presets = {
  mnemonic: {
    Shift: 'BtnShift',
    p: 'EncPush',
    s: 'BtnSelect',     x: 'BtnClear',
    d: 'BtnDuplicate',  c: 'BtnControl',
    l: 'BtnLevel',      m: 'BtnMacro',
    b: 'BtnBrowse',     a: 'BtnAuto',
    t: 'BtnTempo',      g: 'BtnGrid',
    r: 'BtnRecord',     w: 'BtnSwing',
    k: 'BtnLock',       n: 'BtnArpRepeat',
    ' ': 'BtnPlay',
    '.': '@connect',
    ',': '@conf',
    '[': 'BtnArrowLeft',
    ']': 'BtnArrowRight',
  },
};

const STORAGE_KEY = 'jamulator-keymap';

let activePreset = localStorage.getItem(STORAGE_KEY) || 'mnemonic';
let keymap = presets[activePreset] || presets.mnemonic;

let pushKeyHeld = false;
const heldKeys = new Map(); // key → controlId

export function isPushKeyHeld() {
  return pushKeyHeld;
}

export function getPresetNames() {
  return Object.keys(presets);
}

export function getActivePreset() {
  return activePreset;
}

export function setPreset(name) {
  if (!presets[name]) return;
  activePreset = name;
  keymap = presets[name];
  localStorage.setItem(STORAGE_KEY, name);
}

function lookupKey(key) {
  return keymap[key] || (key.length === 1 ? keymap[key.toLowerCase()] : undefined);
}

export function initKeyboard(pressButton, setShiftActive, actions = {}) {
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select')) return;
    if (e.repeat) return;
    if (e.metaKey || e.ctrlKey) return;

    const controlId = lookupKey(e.key);
    if (!controlId) return;

    // Actions: fire-once on keydown, no hold/release
    if (controlId.startsWith('@')) {
      e.preventDefault();
      actions[controlId]?.();
      return;
    }

    if (controlId === 'BtnShift') {
      e.preventDefault();
      setShiftActive('keyboard', true);
      return;
    }

    if (controlId === 'EncPush') {
      e.preventDefault();
      pushKeyHeld = true;
      return;
    }

    e.preventDefault();
    heldKeys.set(e.key, controlId);
    pressButton(controlId, true, { altKey: e.altKey });
  });

  document.addEventListener('keyup', (e) => {
    const controlId = lookupKey(e.key);
    if (!controlId) return;

    if (controlId === 'BtnShift') {
      setShiftActive('keyboard', false);
      return;
    }

    if (controlId === 'EncPush') {
      pushKeyHeld = false;
      return;
    }

    if (heldKeys.has(e.key)) {
      heldKeys.delete(e.key);
      pressButton(controlId, false);
    }
  });

  window.addEventListener('blur', () => {
    // Release all held keyboard buttons
    for (const controlId of heldKeys.values()) {
      pressButton(controlId, false);
    }
    heldKeys.clear();

    // Release keyboard shift
    setShiftActive('keyboard', false);

    // Clear push modifier
    pushKeyHeld = false;
  });
}
