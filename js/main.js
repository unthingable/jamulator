// Entry point — wires all modules together

import { requestMidiAccess, getInputPorts, getOutputPorts, connectActions, connectFeedback, connectOutput, setMapping, sendReturnFromHost } from './midi-engine.js';
import { buildDefaultMapping } from './default-mapping.js';
import { initLedRenderer } from './led-renderer.js';
import { initUiController, updateMapping as updateUiMapping, pressButton, setShiftActive } from './ui-controller.js';
import { initTouchStrips, updateMapping as updateStripMapping } from './touchstrip.js';
import { initEncoder } from './encoder.js';
import { initEncoderDisplay } from './encoder-display.js';
import { initKeyboard, getPresetNames, setPreset, getActivePreset } from './keyboard.js';
import { parseNcmj } from './xml-parser.js';

let currentMapping = null;
let currentMappingName = null;

const PORT_STORAGE_KEY = 'jamulator-midi-ports';
const INTENT_STORAGE_KEY = 'jamulator-connect-intent';
const MAPPING_STORAGE_KEY = 'jamulator-mapping';
const DEFAULT_NCMJ = 'mappings/ext.ncmj';

let wantConnected = localStorage.getItem(INTENT_STORAGE_KEY) === 'true';

async function init() {
  // Conf tab (toolbar toggle) — before resize so zoom computes correct height
  initConf();
  // Resize handles (init early — no async dependency)
  initResize();

  // Init LED renderer first (subscribes to state events)
  initLedRenderer();

  // Load mapping from ext.ncmj, fall back to hardcoded
  await loadInitialMapping();

  // Set up MIDI
  try {
    await requestMidiAccess();
    populatePortDropdowns();
    restorePortSelections();
  } catch (err) {
    showStatus(`MIDI access denied: ${err.message}. Ensure HTTPS or localhost, and allow SysEx.`);
  }

  // Listen for port changes
  document.addEventListener('midi-ports-changed', () => {
    populatePortDropdowns();
    restorePortSelections();
    if (wantConnected) doConnect();
  });

  // Set mapping
  setMapping(currentMapping);

  // Init interaction handlers
  initUiController(currentMapping);
  initTouchStrips(currentMapping);
  initEncoder();
  initEncoderDisplay();
  initKeyboard(pressButton, setShiftActive, {
    '@connect': () => document.getElementById('btn-connect').click(),
    '@conf': () => document.querySelector('.conf-tab')?.click(),
  });
  initFootswitch();

  // Connect button toggles intent
  const btnConnect = document.getElementById('btn-connect');
  btnConnect.addEventListener('click', toggleConnect);
  updateConnectButton();

  // Port change → disconnect and drop intent so user can reconfigure
  for (const id of ['midi-actions', 'midi-feedback', 'midi-output']) {
    document.getElementById(id).addEventListener('change', () => {
      if (wantConnected) {
        wantConnected = false;
        localStorage.setItem(INTENT_STORAGE_KEY, false);
        doDisconnect();
      }
    });
  }

  // File upload + mapping popover
  document.getElementById('file-ncmj').addEventListener('change', onFileUpload);
  initMappingPicker();
  initKeyboardPicker();

  // Auto-connect on startup if intent was saved
  if (wantConnected) {
    doConnect();
  } else {
    showStatus('Ready. Select MIDI ports and connect.');
  }
}

// ─── Mapping Loading ───

async function fetchNcmj(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.statusText);
  const text = await res.text();
  const mapping = parseNcmj(text);
  if (mapping.outputMap.size === 0) throw new Error('No mappings found');
  return mapping;
}

async function loadInitialMapping() {
  // Try saved mapping name — if it points to a bundled file, re-fetch it
  const saved = localStorage.getItem(MAPPING_STORAGE_KEY);

  if (saved && saved !== 'default') {
    try {
      const mapping = await fetchNcmj(`mappings/${saved}`);
      applyMapping(mapping, saved);
      return;
    } catch {
      // Saved file not fetchable (custom upload or missing) — fall through
    }
  }

  // Default: load ext.ncmj
  try {
    const mapping = await fetchNcmj(DEFAULT_NCMJ);
    applyMapping(mapping, 'ext.ncmj');
    return;
  } catch (err) {
    console.warn('Could not load ext.ncmj, using hardcoded fallback:', err.message);
  }

  applyMapping(buildDefaultMapping(), 'default');
}

function applyMapping(mapping, name) {
  currentMapping = mapping;
  currentMappingName = name;
  localStorage.setItem(MAPPING_STORAGE_KEY, name);

  // Propagate to modules (no-op if called before init — each module stores mapping internally)
  setMapping(currentMapping);
  updateUiMapping(currentMapping);
  updateStripMapping(currentMapping);

  updateMappingUI();
  updateFootswitchVisibility(mapping);
}

// ─── Popover helper ───

function initPopover(btn, popover) {
  btn.addEventListener('click', () => {
    popover.hidden = !popover.hidden;
  });

  document.addEventListener('click', (e) => {
    if (!popover.hidden && !popover.contains(e.target) && !btn.contains(e.target)) {
      popover.hidden = true;
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !popover.hidden) {
      popover.hidden = true;
    }
  });
}

// ─── Mapping Picker Popover ───

function initMappingPicker() {
  const btn = document.getElementById('btn-mapping');
  const popover = document.getElementById('mapping-popover');

  initPopover(btn, popover);

  document.getElementById('btn-open-file').addEventListener('click', () => {
    popover.hidden = true;
    document.getElementById('file-ncmj').click();
  });

  updateMappingUI();
}

function updateMappingUI() {
  const btn = document.getElementById('btn-mapping');
  const label = document.getElementById('mapping-current');
  if (btn) btn.textContent = currentMappingName || '.ncmj';
  if (label) label.textContent = currentMappingName || '.ncmj';
}

// ─── Keyboard Preset Picker ───

function initKeyboardPicker() {
  const btn = document.getElementById('btn-keyboard');
  const popover = document.getElementById('keyboard-popover');

  function render() {
    const active = getActivePreset();
    popover.innerHTML = '';

    for (const name of getPresetNames()) {
      const item = document.createElement('button');
      item.className = 'mapping-action';
      item.textContent = name;
      if (name === active) item.style.color = 'var(--accent)';
      item.addEventListener('click', () => {
        setPreset(name);
        popover.hidden = true;
        render();
      });
      popover.appendChild(item);
    }
  }

  initPopover(btn, popover);
  render();
}

// ─── MIDI Port Management ───

function populatePortDropdowns() {
  const actionsSelect = document.getElementById('midi-actions');
  const feedbackSelect = document.getElementById('midi-feedback');
  const outputSelect = document.getElementById('midi-output');
  const prevActions = actionsSelect.value;
  const prevFeedback = feedbackSelect.value;
  const prevOutput = outputSelect.value;

  const noneOption = '<option value="">-- None --</option>';
  actionsSelect.innerHTML = noneOption;
  feedbackSelect.innerHTML = noneOption;
  outputSelect.innerHTML = noneOption;

  for (const port of getInputPorts()) {
    const opt = document.createElement('option');
    opt.value = port.id;
    opt.textContent = port.name;
    actionsSelect.appendChild(opt);
    feedbackSelect.appendChild(opt.cloneNode(true));
  }

  for (const port of getOutputPorts()) {
    const opt = document.createElement('option');
    opt.value = port.id;
    opt.textContent = port.name;
    outputSelect.appendChild(opt);
  }

  // Restore previous selections if still available
  if (prevActions) actionsSelect.value = prevActions;
  if (prevFeedback) feedbackSelect.value = prevFeedback;
  if (prevOutput) outputSelect.value = prevOutput;
}

function toggleConnect() {
  wantConnected = !wantConnected;
  localStorage.setItem(INTENT_STORAGE_KEY, wantConnected);
  if (wantConnected) {
    doConnect();
  } else {
    doDisconnect();
  }
}

function getPortName(sel) {
  return sel.value ? sel.selectedOptions[0]?.textContent : 'None';
}

function doConnect() {
  const actionsSelect = document.getElementById('midi-actions');
  const feedbackSelect = document.getElementById('midi-feedback');
  const outputSelect = document.getElementById('midi-output');
  connectActions(actionsSelect.value);
  connectFeedback(feedbackSelect.value);
  connectOutput(outputSelect.value);

  savePortSelections(actionsSelect, feedbackSelect, outputSelect);
  updateConnectButton();

  sendReturnFromHost();

  showStatus(`Connected — Actions: ${getPortName(actionsSelect)}, Feedback: ${getPortName(feedbackSelect)}, Out: ${getPortName(outputSelect)}`);
}

function doDisconnect() {
  connectActions('');
  connectFeedback('');
  connectOutput('');
  updateConnectButton();
  showStatus('Disconnected.');
}

function updateConnectButton() {
  const btn = document.getElementById('btn-connect');
  btn.classList.toggle('connected', wantConnected);
  btn.title = wantConnected ? 'Disconnect MIDI ports' : 'Connect MIDI ports';
  const confGroup = document.querySelector('.conf-group');
  if (confGroup) confGroup.classList.toggle('conf-connected', wantConnected);
}

function savePortSelections(actionsSelect, feedbackSelect, outputSelect) {
  localStorage.setItem(PORT_STORAGE_KEY, JSON.stringify({
    actions: actionsSelect.value ? actionsSelect.selectedOptions[0]?.textContent : '',
    feedback: feedbackSelect.value ? feedbackSelect.selectedOptions[0]?.textContent : '',
    output: outputSelect.value ? outputSelect.selectedOptions[0]?.textContent : '',
  }));
}

function restorePortSelections() {
  const raw = localStorage.getItem(PORT_STORAGE_KEY);
  if (!raw) return;
  try {
    const saved = JSON.parse(raw);
    selectByName('midi-actions', saved.actions);
    selectByName('midi-feedback', saved.feedback);
    selectByName('midi-output', saved.output);
  } catch { /* ignore corrupt data */ }
}

function selectByName(selectId, name) {
  if (!name) return;
  const select = document.getElementById(selectId);
  for (const opt of select.options) {
    if (opt.textContent === name) {
      select.value = opt.value;
      return;
    }
  }
}

// ─── File Upload ───

async function onFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const mapping = parseNcmj(text);

    if (mapping.outputMap.size === 0) {
      showStatus(`Warning: No mappings found in ${file.name}. Using defaults.`);
      return;
    }

    applyMapping(mapping, file.name);
    showStatus(`Loaded ${file.name}: ${mapping.outputMap.size} controls mapped.`);
  } catch (err) {
    showStatus(`Error loading ${file.name}: ${err.message}`);
  }
}

// ─── Resize ───

const FSW_OVERHEAD = 12;   // px above controller at natural scale for FSW tab

function initResize() {
  const controller = document.getElementById('controller');
  const toolbar = document.getElementById('toolbar');
  const handles = controller.querySelectorAll('.resize-handle');
  const toggleBtn = document.getElementById('btn-zoom-mode');
  let currentZoom = 1;
  let zoomMode = localStorage.getItem('jamulator-zoom-mode') || 'window';

  // Clear stale key from old slider (stored percentages like "100")
  localStorage.removeItem('jamulator-zoom');

  function setZoom(value) {
    currentZoom = Math.max(0.5, value);
    controller.style.zoom = currentZoom;
    localStorage.setItem('jamulator-zoom-level', currentZoom);
    if (zoomMode === 'window') {
      document.body.style.paddingTop = (FSW_OVERHEAD * currentZoom) + 'px';
    }
  }

  function computeWindowZoom() {
    const widthZoom = window.innerWidth / controller.scrollWidth;
    const controllerNaturalHeight = controller.scrollHeight + FSW_OVERHEAD;
    const nonZoomedHeight = toolbar.offsetHeight + 14; // toolbar + gap
    const availableForController = window.innerHeight - nonZoomedHeight;
    const heightZoom = availableForController / controllerNaturalHeight;
    return Math.min(widthZoom, heightZoom);
  }

  function onWindowResize() {
    if (zoomMode === 'window') setZoom(computeWindowZoom());
  }

  function applyMode() {
    const isWindow = zoomMode === 'window';
    document.body.classList.toggle('zoom-fit', isWindow);
    if (!isWindow) document.body.style.paddingTop = '';
    handles.forEach(h => h.hidden = isWindow);
    toggleBtn.classList.toggle('active', isWindow);
    toggleBtn.title = isWindow
      ? 'Window zoom: resize window to scale'
      : 'Manual zoom: drag corner handles to scale';
    if (isWindow) setZoom(computeWindowZoom());
  }

  function toggleZoomMode() {
    zoomMode = zoomMode === 'window' ? 'manual' : 'window';
    localStorage.setItem('jamulator-zoom-mode', zoomMode);
    applyMode();
  }

  // Restore saved zoom for manual mode, then apply current mode
  const saved = localStorage.getItem('jamulator-zoom-level');
  if (saved) {
    currentZoom = Math.max(0.5, parseFloat(saved));
    controller.style.zoom = currentZoom;
  }
  applyMode();

  window.addEventListener('resize', onWindowResize);
  toggleBtn.addEventListener('click', toggleZoomMode);

  // Manual drag handles
  handles.forEach(handle => {
    const isRight = handle.classList.contains('resize-handle-r');

    handle.addEventListener('mousedown', onStart);
    handle.addEventListener('touchstart', onStart, { passive: false });

    function onStart(e) {
      e.preventDefault();
      const startX = e.touches ? e.touches[0].clientX : e.clientX;
      const startZoom = currentZoom;
      const naturalWidth = controller.offsetWidth / currentZoom;
      const sign = isRight ? 1 : -1;

      function onMove(e) {
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const dx = (clientX - startX) * sign;
        setZoom(startZoom + (dx * 2) / naturalWidth);
      }

      function onEnd() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onEnd);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onEnd);
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onEnd);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onEnd);
    }
  });
}

// ─── Footswitch ───

function initFootswitch() {
  const group = document.querySelector('.fsw-group');
  if (!group) return;
  const tab = group.querySelector('.fsw-tab');
  const indicators = group.querySelector('.fsw-indicators');

  // Restore saved state (default: active/visible)
  const saved = localStorage.getItem('jamulator-fsw-active');
  const active = saved !== 'false';
  group.classList.toggle('fsw-active', active);
  if (indicators) indicators.hidden = !active;

  tab.addEventListener('click', () => {
    const nowActive = group.classList.toggle('fsw-active');
    if (indicators) indicators.hidden = !nowActive;
    localStorage.setItem('jamulator-fsw-active', nowActive);
  });
}

function updateFootswitchVisibility(mapping) {
  const hasFootswitch = mapping.outputMap.has('FswTip') || mapping.outputMap.has('FswRing');
  const group = document.querySelector('.fsw-group');
  if (group) {
    group.hidden = !hasFootswitch;
    if (!hasFootswitch) {
      group.classList.remove('fsw-active');
      const indicators = group.querySelector('.fsw-indicators');
      if (indicators) indicators.hidden = true;
    }
  }
}

// ─── CONF tab (toolbar toggle) ───

function initConf() {
  const group = document.querySelector('.conf-group');
  if (!group) return;
  const tab = group.querySelector('.conf-tab');
  const toolbar = document.getElementById('toolbar');

  // Restore saved state (default: active/visible)
  const saved = localStorage.getItem('jamulator-conf-active');
  const active = saved !== 'false';
  group.classList.toggle('conf-active', active);
  if (toolbar) toolbar.hidden = !active;

  tab.addEventListener('click', () => {
    const nowActive = group.classList.toggle('conf-active');
    if (toolbar) toolbar.hidden = !nowActive;
    localStorage.setItem('jamulator-conf-active', nowActive);
    // Recalc zoom-fit after toolbar visibility change
    window.dispatchEvent(new Event('resize'));
  });
}

// ─── Utilities ───

function showStatus(msg) {
  const el = document.getElementById('status');
  if (el) el.textContent = msg;
}

// Boot
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
