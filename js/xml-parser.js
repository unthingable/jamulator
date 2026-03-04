// .ncmj XML parser — modeled on XmlMap.scala
// Parses Native Instruments controller mapping files

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
  const aftertouches = []; // Collect aftertouch entries for second pass

  // Pass 1: Process all non-aftertouch entries (CC, Note)
  const templates = doc.querySelectorAll('Template > Entry');
  for (const entry of templates) {
    const idAttr = entry.getAttribute('ID');
    if (!idAttr) continue;

    const section = entry.getAttribute('Section');
    const type = entry.getAttribute('Type');
    const channel = parseInt(entry.getAttribute('Channel') || '0', 10);
    const number = parseInt(entry.getAttribute('Number') || '0', 10);

    // Determine MIDI type from the Type attribute
    let midiType;
    if (type === 'CC' || type === 'ControlChange') {
      midiType = 'cc';
    } else if (type === 'Note') {
      midiType = 'note';
    } else if (type === 'Aftertouch' || type === 'PolyAT') {
      midiType = 'aftertouch';
      // Save for second pass
      const controlId = section ? `${section}${idAttr}` : idAttr;
      aftertouches.push({ controlId, channel, number });
      continue; // Skip aftertouch in first pass
    } else {
      continue;
    }

    // Build control ID from Section + ID
    const controlId = section ? `${section}${idAttr}` : idAttr;

    const def = {
      type: midiType,
      channel,
      number,
      controlId,
      label: idAttr,
    };

    outputMap.set(controlId, def);
    inputMap.set(`${midiType}:${channel}:${number}`, controlId);
  }

  // Pass 2: Process aftertouch entries — now all CC/Note entries are already in outputMap
  for (const { controlId, channel, number } of aftertouches) {
    inputMap.set(`aftertouch:${channel}:${number}`, controlId);
    // Patch aftertouchNote on the control's definition
    const stripDef = outputMap.get(controlId);
    if (stripDef) {
      stripDef.aftertouchNote = number;
    }
  }

  // If parsing found entries from the "correct" XML structure, also look for
  // the simpler flat format used by some .ncmj files
  if (outputMap.size === 0) {
    parseFlatFormat(doc, outputMap, inputMap);
  }

  return { outputMap, inputMap };
}

function parseFlatFormat(doc, outputMap, inputMap) {
  // Try alternative XML structures
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
