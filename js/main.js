// Entry point — wires all modules together

import { requestMidiAccess, getInputPorts, getOutputPorts, connectActions, connectFeedback, connectOutput, setMapping } from './midi-engine.js';
import { buildDefaultMapping } from './default-mapping.js';
import { initLedRenderer } from './led-renderer.js';
import { initUiController, updateMapping as updateUiMapping } from './ui-controller.js';
import { initTouchStrips, updateMapping as updateStripMapping } from './touchstrip.js';
import { initEncoder } from './encoder.js';
import { parseNcmj } from './xml-parser.js';

let currentMapping = null;
let currentMappingName = null;

const PORT_STORAGE_KEY = 'jamulator-midi-ports';
const MAPPING_STORAGE_KEY = 'jamulator-mapping';
const DEFAULT_NCMJ = 'mappings/ext.ncmj';

async function init() {
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
  });

  // Set mapping
  setMapping(currentMapping);

  // Init interaction handlers
  initUiController(currentMapping);
  initTouchStrips(currentMapping);
  initEncoder();

  // Connect button
  document.getElementById('btn-connect').addEventListener('click', onConnect);

  // File upload + mapping popover
  document.getElementById('file-ncmj').addEventListener('change', onFileUpload);
  initMappingPicker();

  showStatus('Ready. Select MIDI ports and click Connect.');
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

  // Propagate to modules (safe to call before they're initialized — they'll get it via init args too)
  try { setMapping(currentMapping); } catch { /* not initialized yet */ }
  try { updateUiMapping(currentMapping); } catch { /* not initialized yet */ }
  try { updateStripMapping(currentMapping); } catch { /* not initialized yet */ }

  updateMappingUI();
}

// ─── Mapping Picker Popover ───

function initMappingPicker() {
  const btn = document.getElementById('btn-mapping');
  const popover = document.getElementById('mapping-popover');

  btn.addEventListener('click', () => {
    popover.hidden = !popover.hidden;
  });

  document.addEventListener('click', (e) => {
    if (!popover.hidden && !popover.contains(e.target) && e.target !== btn) {
      popover.hidden = true;
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !popover.hidden) {
      popover.hidden = true;
    }
  });

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

function onConnect() {
  const actionsSelect = document.getElementById('midi-actions');
  const feedbackSelect = document.getElementById('midi-feedback');
  const outputSelect = document.getElementById('midi-output');
  connectActions(actionsSelect.value);
  connectFeedback(feedbackSelect.value);
  connectOutput(outputSelect.value);

  // Persist selections by port name (IDs can change between sessions)
  savePortSelections(actionsSelect, feedbackSelect, outputSelect);

  const btn = document.getElementById('btn-connect');
  const anyConnected = actionsSelect.value || feedbackSelect.value || outputSelect.value;
  btn.textContent = anyConnected ? 'Connected' : 'Connect';
  btn.classList.toggle('connected', anyConnected);

  const getName = (sel) => sel.value ? sel.selectedOptions[0]?.textContent : 'None';
  showStatus(`Connected — Actions: ${getName(actionsSelect)}, Feedback: ${getName(feedbackSelect)}, Out: ${getName(outputSelect)}`);
}

function savePortSelections(actionsSelect, feedbackSelect, outputSelect) {
  const getName = (sel) => sel.value ? sel.selectedOptions[0]?.textContent : '';
  localStorage.setItem(PORT_STORAGE_KEY, JSON.stringify({
    actions: getName(actionsSelect),
    feedback: getName(feedbackSelect),
    output: getName(outputSelect),
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

function initResize() {
  const controller = document.getElementById('controller');
  const handles = controller.querySelectorAll('.resize-handle');
  let currentZoom = 1;

  // Clear stale key from old slider (stored percentages like "100")
  localStorage.removeItem('jamulator-zoom');

  const saved = localStorage.getItem('jamulator-zoom-level');
  if (saved) {
    currentZoom = Math.max(0.5, Math.min(2, parseFloat(saved)));
    controller.style.zoom = currentZoom;
  }

  handles.forEach(handle => {
    const isRight = handle.classList.contains('resize-handle-r');

    handle.addEventListener('mousedown', onStart);
    handle.addEventListener('touchstart', onStart, { passive: false });

    function onStart(e) {
      e.preventDefault();
      const startX = e.touches ? e.touches[0].clientX : e.clientX;
      const startZoom = currentZoom;
      // Natural width is layout width (unaffected by zoom in most browsers)
      const naturalWidth = controller.offsetWidth / currentZoom;
      const sign = isRight ? 1 : -1;

      function onMove(e) {
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const dx = (clientX - startX) * sign;
        // Multiply by 2 because controller is centered — dragging one side expands both
        const newZoom = Math.max(0.5, Math.min(2, startZoom + (dx * 2) / naturalWidth));
        currentZoom = newZoom;
        controller.style.zoom = currentZoom;
      }

      function onEnd() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onEnd);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onEnd);
        localStorage.setItem('jamulator-zoom-level', currentZoom);
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onEnd);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onEnd);
    }
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
