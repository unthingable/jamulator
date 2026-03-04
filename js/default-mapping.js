// Default MIDI mapping from Bitwig Studio ext.ncmj
// Each entry: { controlId, type, channel, number, label }
// type: 'cc' = CC message, 'note' = Note On/Off, 'aftertouch' = Poly Aftertouch

const CC_BUTTONS = [
  // Left column
  { controlId: 'BtnArrange',    cc: 30,  label: 'Song' },
  { controlId: 'BtnStep',       cc: 31,  label: 'Step' },
  { controlId: 'BtnPadMode',    cc: 32,  label: 'Pad Mode' },
  { controlId: 'BtnClear',      cc: 95,  label: 'Clear' },
  { controlId: 'BtnDuplicate',  cc: 96,  label: 'Duplicate' },
  { controlId: 'BtnArpRepeat',  cc: 94,  label: 'Note Repeat' },
  { controlId: 'BtnMacro',      cc: 90,  label: 'Macro' },
  { controlId: 'BtnLevel',      cc: 91,  label: 'Level' },
  { controlId: 'BtnAux',        cc: 92,  label: 'Aux' },
  { controlId: 'BtnControl',    cc: 97,  label: 'Control' },
  { controlId: 'BtnAuto',       cc: 98,  label: 'Auto' },
  // Right column
  { controlId: 'BtnMst',        cc: 60,  label: 'Master' },
  { controlId: 'BtnGrp',        cc: 61,  label: 'Group' },
  { controlId: 'BtnIn1',        cc: 62,  label: 'In1' },
  { controlId: 'BtnCue',        cc: 63,  label: 'Cue' },
  { controlId: 'BtnBrowse',     cc: 44,  label: 'Browse' },
  { controlId: 'BtnPerform',    cc: 45,  label: 'Perform' },
  { controlId: 'BtnVariation',  cc: 46,  label: 'Notes' },
  { controlId: 'BtnLock',       cc: 47,  label: 'Lock' },
  { controlId: 'BtnTune',       cc: 48,  label: 'Tune' },
  { controlId: 'BtnSwing',      cc: 49,  label: 'Swing' },
  { controlId: 'BtnSelect',     cc: 80,  label: 'Select' },
  // D-pad
  { controlId: 'BtnDpad1',      cc: 40,  label: '▲' },
  { controlId: 'BtnDpad2',      cc: 43,  label: '▶' },
  { controlId: 'BtnDpad3',      cc: 41,  label: '▼' },
  { controlId: 'BtnDpad4',      cc: 42,  label: '◀' },
  // Bottom row
  { controlId: 'BtnPlay',       cc: 108, label: 'Play' },
  { controlId: 'BtnRecord',     cc: 109, label: 'Record' },
  { controlId: 'BtnArrowLeft',  cc: 107, label: '<' },
  { controlId: 'BtnArrowRight', cc: 104, label: '>' },
  { controlId: 'BtnTempo',      cc: 110, label: 'Tempo' },
  { controlId: 'BtnGrid',       cc: 113, label: 'Grid' },
  { controlId: 'BtnSolo',       cc: 111, label: 'Solo' },
  { controlId: 'BtnMute',       cc: 112, label: 'Mute' },
  // Encoder
  { controlId: 'EncPush',       cc: 87,  label: 'Encoder Push' },
  { controlId: 'EncTouch',      cc: 88,  label: 'Encoder Touch' },
  { controlId: 'EncTurn',       cc: 86,  label: 'Encoder Turn' },
];

// Scene/Group buttons: Note messages on channel 1
const NOTE_CH1_BUTTONS = [
  { controlId: 'BtnScene1', note: 0, label: '1' },
  { controlId: 'BtnScene2', note: 1, label: '2' },
  { controlId: 'BtnScene3', note: 2, label: '3' },
  { controlId: 'BtnScene4', note: 3, label: '4' },
  { controlId: 'BtnScene5', note: 4, label: '5' },
  { controlId: 'BtnScene6', note: 5, label: '6' },
  { controlId: 'BtnScene7', note: 6, label: '7' },
  { controlId: 'BtnScene8', note: 7, label: '8' },
  { controlId: 'BtnGroupA', note: 8,  label: 'A' },
  { controlId: 'BtnGroupB', note: 9,  label: 'B' },
  { controlId: 'BtnGroupC', note: 10, label: 'C' },
  { controlId: 'BtnGroupD', note: 11, label: 'D' },
  { controlId: 'BtnGroupE', note: 12, label: 'E' },
  { controlId: 'BtnGroupF', note: 13, label: 'F' },
  { controlId: 'BtnGroupG', note: 14, label: 'G' },
  { controlId: 'BtnGroupH', note: 15, label: 'H' },
];

// Scene/Group LED entries: same notes but on channel 0
const NOTE_CH1_LED_ENTRIES = NOTE_CH1_BUTTONS.map(b => ({
  controlId: b.controlId,
  note: b.note,
  channel: 0,
}));

// 8x8 Matrix: Notes on channel 0
// note = 22 + colIndex + (rowIndex * 8), row A=0..H=7 (groups/columns), col 1=0..8=7 (scenes/rows)
const MATRIX_BUTTONS = [];
const ROW_LETTERS = ['A','B','C','D','E','F','G','H'];
for (let col = 0; col < 8; col++) {
  for (let row = 0; row < 8; row++) {
    const note = 22 + col + (row * 8);
    MATRIX_BUTTONS.push({
      controlId: `Btn${ROW_LETTERS[row]}${col + 1}`,
      note,
      channel: 0,
      label: `${ROW_LETTERS[row]}${col + 1}`,
    });
  }
}

// Touch strips: CC for values, separate CC for touch on/off
const STRIP_LETTERS = ['A','B','C','D','E','F','G','H'];
const TOUCH_STRIPS = STRIP_LETTERS.map((letter, i) => ({
  controlId: `Tst${letter}`,
  cc: 8 + i,
  touchCc: 20 + i,
  aftertouchNote: 8 + i,
  channel: 0,
  label: `Strip ${letter}`,
}));

// Level meters
const LEVEL_METERS = [
  { controlId: 'LevelL', cc: 38, channel: 0, label: 'Level L' },
  { controlId: 'LevelR', cc: 39, channel: 0, label: 'Level R' },
];

/**
 * Build the complete mapping object with lookup tables.
 */
export function buildDefaultMapping() {
  // controlId → outbound message definition (for sending MIDI from GUI clicks)
  const outputMap = new Map();
  // Reverse lookup: incoming MIDI → controlId (for LED updates)
  // Key format: "type:channel:number" e.g. "cc:0:30", "note:0:22"
  const inputMap = new Map();

  // CC buttons (channel 0)
  for (const btn of CC_BUTTONS) {
    const def = { type: 'cc', channel: 0, number: btn.cc, controlId: btn.controlId, label: btn.label };
    outputMap.set(btn.controlId, def);
    inputMap.set(`cc:0:${btn.cc}`, btn.controlId);
  }

  // Note buttons on channel 1 (output)
  for (const btn of NOTE_CH1_BUTTONS) {
    const def = { type: 'note', channel: 1, number: btn.note, controlId: btn.controlId, label: btn.label };
    outputMap.set(btn.controlId, def);
    // Input from hardware: note on channel 1 (button press)
    inputMap.set(`note:1:${btn.note}`, btn.controlId);
  }

  // Scene/Group LED entries on channel 0 (for incoming LED color commands)
  for (const led of NOTE_CH1_LED_ENTRIES) {
    inputMap.set(`note:0:${led.note}`, led.controlId);
  }

  // Matrix buttons (channel 0, note on/off)
  for (const btn of MATRIX_BUTTONS) {
    const def = { type: 'note', channel: 0, number: btn.note, controlId: btn.controlId, label: btn.label };
    outputMap.set(btn.controlId, def);
    inputMap.set(`note:0:${btn.note}`, btn.controlId);
  }

  // Touch strips
  for (const strip of TOUCH_STRIPS) {
    outputMap.set(strip.controlId, {
      type: 'cc',
      channel: 0,
      number: strip.cc,
      controlId: strip.controlId,
      label: strip.label,
      aftertouchNote: strip.aftertouchNote,
    });
    inputMap.set(`cc:0:${strip.cc}`, strip.controlId);
    inputMap.set(`aftertouch:0:${strip.aftertouchNote}`, strip.controlId);
  }

  // Level meters
  for (const meter of LEVEL_METERS) {
    inputMap.set(`cc:0:${meter.cc}`, meter.controlId);
  }

  return { outputMap, inputMap };
}

