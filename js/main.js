// Entry point — wires all modules together

import { requestMidiAccess, getInputPorts, getOutputPorts, connectInput, connectOutput, setMapping } from './midi-engine.js';
import { buildDefaultMapping } from './default-mapping.js';
import { initLedRenderer } from './led-renderer.js';
import { initUiController, updateMapping as updateUiMapping } from './ui-controller.js';
import { initTouchStrips, updateMapping as updateStripMapping } from './touchstrip.js';
import { initEncoder } from './encoder.js';
import { parseNcmj } from './xml-parser.js';

let currentMapping = buildDefaultMapping();

async function init() {
  // Init LED renderer first (subscribes to state events)
  initLedRenderer();

  // Set up MIDI
  try {
    await requestMidiAccess();
    populatePortDropdowns();
  } catch (err) {
    showStatus(`MIDI access denied: ${err.message}. Ensure HTTPS or localhost, and allow SysEx.`);
  }

  // Listen for port changes
  document.addEventListener('midi-ports-changed', populatePortDropdowns);

  // Set mapping
  setMapping(currentMapping);

  // Init interaction handlers
  initUiController(currentMapping);
  initTouchStrips(currentMapping);
  initEncoder();

  // Connect button
  document.getElementById('btn-connect').addEventListener('click', onConnect);

  // File upload
  document.getElementById('file-ncmj').addEventListener('change', onFileUpload);

  showStatus('Ready. Select MIDI ports and click Connect.');
}

function populatePortDropdowns() {
  const inputSelect = document.getElementById('midi-input');
  const outputSelect = document.getElementById('midi-output');
  const prevInput = inputSelect.value;
  const prevOutput = outputSelect.value;

  // Clear existing options (keep the "None" option)
  inputSelect.innerHTML = '<option value="">-- None --</option>';
  outputSelect.innerHTML = '<option value="">-- None --</option>';

  for (const port of getInputPorts()) {
    const opt = document.createElement('option');
    opt.value = port.id;
    opt.textContent = port.name;
    inputSelect.appendChild(opt);
  }

  for (const port of getOutputPorts()) {
    const opt = document.createElement('option');
    opt.value = port.id;
    opt.textContent = port.name;
    outputSelect.appendChild(opt);
  }

  // Restore previous selection if still available
  if (prevInput) inputSelect.value = prevInput;
  if (prevOutput) outputSelect.value = prevOutput;
}

function onConnect() {
  const inputId = document.getElementById('midi-input').value;
  const outputId = document.getElementById('midi-output').value;
  connectInput(inputId);
  connectOutput(outputId);

  const inputName = inputId ? document.getElementById('midi-input').selectedOptions[0]?.textContent : 'None';
  const outputName = outputId ? document.getElementById('midi-output').selectedOptions[0]?.textContent : 'None';
  showStatus(`Connected — In: ${inputName}, Out: ${outputName}`);
}

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

    currentMapping = mapping;
    setMapping(currentMapping);
    updateUiMapping(currentMapping);
    updateStripMapping(currentMapping);
    showStatus(`Loaded ${file.name}: ${mapping.outputMap.size} controls mapped.`);
  } catch (err) {
    showStatus(`Error loading ${file.name}: ${err.message}`);
  }
}

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
