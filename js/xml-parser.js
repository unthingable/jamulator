// .ncmj XML parser
// Handles Native Instruments controller mapping files in two formats:
// 1. Native NI format: <button>/<knob>/<wheel>/<footswitch>/<led> with child elements
// 2. Template format: <Template><Entry> with attributes

import { addInput } from './default-mapping.js';

// ID renames: ncmj internal names → Jamulator controlIds
const ID_RENAMES = {
  'CapBrowse': 'EncTouch',
  'EncBrowse': 'EncTurn',
  'MetLevel1': 'LevelL',
  'MetLevel2': 'LevelR',
};

// Controls not present in the ncmj file (SysEx-driven or implicit)
const HARDCODED = [
  { controlId: 'EncPush', type: 'cc', channel: 0, number: 87 },
];

/**
 * Parse an .ncmj XML string into a mapping.
 * @param {string} xmlString
 * @returns {{ outputMap: Map, inputMap: Map }}
 */
export function parseNcmj(xmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'text/xml');
  const outputMap = new Map();
  const inputMap = new Map();

  // Try native NI format first (has <controls>, <scenePages>, etc.)
  if (doc.querySelector('ni-controller-midi-map')) {
    parseNativeFormat(doc, outputMap, inputMap);
  }

  // Fall back to Template > Entry attribute format
  if (outputMap.size === 0) {
    parseTemplateFormat(doc, outputMap, inputMap);
  }

  return { outputMap, inputMap };
}

/**
 * Parse native NI .ncmj format.
 * Elements: <button>, <knob>, <wheel> (interactive), <led> (input-only feedback).
 * MIDI info stored in child elements: <controller>, <note>, <polyat>, <channel>.
 *
 * Paged sections (scenePages, iolevelPages, touchstripPages) use current_index
 * to select the active page — only that page's elements are parsed.
 */
function parseNativeFormat(doc, outputMap, inputMap) {
  const activeRoots = getActiveElements(doc);
  const touchSensors = []; // cap sensor entries deferred to pass 2

  // Pass 1: <button>, <knob>, <wheel>, <footswitch> from active elements only
  for (const root of activeRoots) {
    for (const el of root.querySelectorAll('button, knob, wheel, footswitch')) {
      const rawId = el.getAttribute('id');
      if (!rawId) continue;

      const channel = intChild(el, 'channel', 0);
      const ccEl = el.querySelector('controller');
      const noteEl = el.querySelector('note');
      const polyatEl = el.querySelector('polyat');

      let midiType, number;

      if (polyatEl) {
        // Aftertouch cap sensor — defer to pass 2
        number = parseInt(polyatEl.textContent, 10);
        touchSensors.push({ rawId, channel, number, sensorType: 'aftertouch' });
        continue;
      } else if (ccEl && rawId.startsWith('CapTst')) {
        // CC-mapped cap sensor (e.g. page H) — defer to pass 2
        number = parseInt(ccEl.textContent, 10);
        touchSensors.push({ rawId, channel, number, sensorType: 'cc' });
        continue;
      } else if (noteEl) {
        midiType = 'note';
        number = parseInt(noteEl.textContent, 10);
      } else if (ccEl) {
        midiType = 'cc';
        number = parseInt(ccEl.textContent, 10);
      } else {
        continue;
      }

      const controlId = normalizeId(rawId);
      if (outputMap.has(controlId)) continue; // first occurrence wins

      const def = { type: midiType, channel, number, controlId, label: rawId };
      outputMap.set(controlId, def);
      addInput(inputMap, `${midiType}:${channel}:${number}`, controlId);
    }
  }

  // Pass 2: link touch sensor entries to their parent strip control
  const seen = new Set();
  for (const { rawId, channel, number, sensorType } of touchSensors) {
    const key = `${rawId}:${channel}:${number}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // CapTstA → TstA, CapBrowse → EncTouch (via normalizeId)
    const strippedId = rawId.replace(/^Cap/, '');
    const targetId = normalizeId(strippedId);
    const targetDef = outputMap.get(targetId);
    if (targetDef) {
      if (sensorType === 'cc') {
        targetDef.touchCc = number;
      } else {
        targetDef.aftertouchNote = number;
      }
      addInput(inputMap, `${sensorType}:${channel}:${number}`, targetId);
    } else {
      const controlId = normalizeId(rawId);
      addInput(inputMap, `${sensorType}:${channel}:${number}`, controlId);
    }
  }

  // Pass 3: <led> elements — input-only feedback mappings
  for (const root of activeRoots) {
    for (const el of root.querySelectorAll('led')) {
      const rawId = el.getAttribute('id');
      if (!rawId) continue;

      // Strip "IDX" suffix: BtnGroupAIDX → BtnGroupA
      const controlId = rawId.replace(/IDX$/, '');
      if (!outputMap.has(controlId)) continue; // only add LED input for known controls

      const channel = intChild(el, 'channel', 0);
      const ccEl = el.querySelector('controller');
      const noteEl = el.querySelector('note');

      let midiType, number;
      if (noteEl) {
        midiType = 'note';
        number = parseInt(noteEl.textContent, 10);
      } else if (ccEl) {
        midiType = 'cc';
        number = parseInt(ccEl.textContent, 10);
      } else {
        continue;
      }

      const key = `${midiType}:${channel}:${number}`;
      if (!inputMap.has(key)) {
        addInput(inputMap, key, controlId);
      }
    }
  }

  // Add hardcoded entries not present in the file
  for (const h of HARDCODED) {
    if (!outputMap.has(h.controlId)) {
      outputMap.set(h.controlId, { ...h, label: h.controlId });
      addInput(inputMap, `${h.type}:${h.channel}:${h.number}`, h.controlId);
    }
  }
}

/**
 * Collect the active element roots from paged sections.
 * Each paged section (scenePages, iolevelPages, touchstripPages) has a
 * current_index selecting which child page is active.
 */
function getActiveElements(doc) {
  const roots = [];

  // Main controls (not paged)
  const controls = doc.querySelector('controls');
  if (controls) roots.push(controls);

  // Paged sections
  for (const [section, childTag] of [
    ['scenePages', 'scene'],
    ['iolevelPages', 'page'],
    ['touchstripPages', 'page'],
  ]) {
    const sectionEl = doc.querySelector(section);
    if (!sectionEl) continue;
    const indexEl = sectionEl.querySelector('current_index');
    const index = indexEl ? parseInt(indexEl.textContent, 10) : 0;
    const pages = sectionEl.querySelectorAll(`:scope > ${childTag}`);
    if (pages[index]) roots.push(pages[index]);
  }

  return roots;
}

function normalizeId(rawId) {
  return ID_RENAMES[rawId] || rawId;
}

function intChild(el, tagName, fallback) {
  const child = el.querySelector(tagName);
  return child ? parseInt(child.textContent, 10) : fallback;
}

/**
 * Parse Template > Entry attribute-based format.
 */
function parseTemplateFormat(doc, outputMap, inputMap) {
  const aftertouches = [];

  const templates = doc.querySelectorAll('Template > Entry');
  for (const entry of templates) {
    const idAttr = entry.getAttribute('ID');
    if (!idAttr) continue;

    const section = entry.getAttribute('Section');
    const type = entry.getAttribute('Type');
    const channel = parseInt(entry.getAttribute('Channel') || '0', 10);
    const number = parseInt(entry.getAttribute('Number') || '0', 10);

    let midiType;
    if (type === 'CC' || type === 'ControlChange') {
      midiType = 'cc';
    } else if (type === 'Note') {
      midiType = 'note';
    } else if (type === 'Aftertouch' || type === 'PolyAT') {
      midiType = 'aftertouch';
      const controlId = section ? `${section}${idAttr}` : idAttr;
      aftertouches.push({ controlId, channel, number });
      continue;
    } else {
      continue;
    }

    const controlId = section ? `${section}${idAttr}` : idAttr;
    const def = { type: midiType, channel, number, controlId, label: idAttr };
    outputMap.set(controlId, def);
    addInput(inputMap, `${midiType}:${channel}:${number}`, controlId);
  }

  for (const { controlId, channel, number } of aftertouches) {
    addInput(inputMap, `aftertouch:${channel}:${number}`, controlId);
    const stripDef = outputMap.get(controlId);
    if (stripDef) {
      stripDef.aftertouchNote = number;
    }
  }

  // Try flat format if Template format found nothing
  if (outputMap.size === 0) {
    parseFlatFormat(doc, outputMap, inputMap);
  }
}

function parseFlatFormat(doc, outputMap, inputMap) {
  const entries = doc.querySelectorAll('Entry, entry, Control, control');
  for (const entry of entries) {
    const id = entry.getAttribute('ID') || entry.getAttribute('id') ||
               entry.getAttribute('Name') || entry.getAttribute('name');
    if (!id) continue;

    const ch = parseInt(entry.getAttribute('Channel') || entry.getAttribute('channel') || '0', 10);
    const num = parseInt(entry.getAttribute('Number') || entry.getAttribute('number') ||
                         entry.getAttribute('CC') || entry.getAttribute('cc') ||
                         entry.getAttribute('Note') || entry.getAttribute('note') || '0', 10);
    const type = (entry.getAttribute('Type') || entry.getAttribute('type') || 'cc').toLowerCase();

    let midiType = 'cc';
    if (type.includes('note')) midiType = 'note';
    else if (type.includes('after')) midiType = 'aftertouch';

    const def = { type: midiType, channel: ch, number: num, controlId: id, label: id };
    outputMap.set(id, def);
    addInput(inputMap, `${midiType}:${ch}:${num}`, id);
  }
}
