// .ncmj XML parser
// Handles Native Instruments controller mapping files in two formats:
// 1. Native NI format: <button>/<knob>/<wheel>/<led> with child elements
// 2. Template format: <Template><Entry> with attributes

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
 */
function parseNativeFormat(doc, outputMap, inputMap) {
  const aftertouches = []; // polyat entries deferred to pass 2

  // Pass 1: all <button>, <knob>, <wheel> elements (first occurrence wins)
  for (const el of doc.querySelectorAll('button, knob, wheel')) {
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
      aftertouches.push({ rawId, channel, number });
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
    if (outputMap.has(controlId)) continue; // first occurrence wins (pages have duplicates)

    const def = { type: midiType, channel, number, controlId, label: rawId };
    outputMap.set(controlId, def);
    inputMap.set(`${midiType}:${channel}:${number}`, controlId);
  }

  // Pass 2: link aftertouch entries to their strip control
  const seenAftertouch = new Set();
  for (const { rawId, channel, number } of aftertouches) {
    const key = `${rawId}:${channel}:${number}`;
    if (seenAftertouch.has(key)) continue; // skip duplicates across pages
    seenAftertouch.add(key);

    // CapTstA → try TstA, CapBrowse → try Browse
    const strippedId = rawId.replace(/^Cap/, '');
    const targetId = normalizeId(strippedId);
    const targetDef = outputMap.get(targetId);
    if (targetDef) {
      targetDef.aftertouchNote = number;
      inputMap.set(`aftertouch:${channel}:${number}`, targetId);
    } else {
      // Standalone aftertouch — use normalized ID
      const controlId = normalizeId(rawId);
      inputMap.set(`aftertouch:${channel}:${number}`, controlId);
    }
  }

  // Pass 3: <led> elements — input-only feedback mappings
  for (const el of doc.querySelectorAll('led')) {
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
      inputMap.set(key, controlId);
    }
  }

  // Add hardcoded entries not present in the file
  for (const h of HARDCODED) {
    if (!outputMap.has(h.controlId)) {
      outputMap.set(h.controlId, { ...h, label: h.controlId });
      inputMap.set(`${h.type}:${h.channel}:${h.number}`, h.controlId);
    }
  }
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
    inputMap.set(`${midiType}:${channel}:${number}`, controlId);
  }

  for (const { controlId, channel, number } of aftertouches) {
    inputMap.set(`aftertouch:${channel}:${number}`, controlId);
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
    inputMap.set(`${midiType}:${ch}:${num}`, id);
  }
}
