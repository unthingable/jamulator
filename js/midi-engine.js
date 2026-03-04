// Web MIDI API: port enumeration, connect, send/receive, SysEx routing

import { state } from './state.js';
import { parseSysEx, parseStripLeds, parseStripValues, parseShift, buildSysEx } from './sysex.js';

let midiAccess = null;
let actionsPort = null;
let feedbackPort = null;
let outputPort = null;
let currentMapping = null;

// Fixed backlight colors for non-RGB buttons (color table base values)
// RGB buttons (matrix, scene, group) get their color from the MIDI value.
const FIXED_BUTTON_COLORS = {
  BtnIn1: 44,     // Blue
  BtnPlay: 28,    // Green
  BtnRecord: 4,   // Red
  // All other fixed buttons default to White (68)
};

const STRIP_IDS = ['TstA','TstB','TstC','TstD','TstE','TstF','TstG','TstH'];

/**
 * Request MIDI access with SysEx support.
 * @returns {Promise<MIDIAccess>}
 */
export async function requestMidiAccess() {
  if (midiAccess) return midiAccess;
  midiAccess = await navigator.requestMIDIAccess({ sysex: true });
  midiAccess.onstatechange = () => {
    document.dispatchEvent(new CustomEvent('midi-ports-changed'));
  };
  return midiAccess;
}

/**
 * Get available input ports.
 */
export function getInputPorts() {
  if (!midiAccess) return [];
  return Array.from(midiAccess.inputs.values());
}

/**
 * Get available output ports.
 */
export function getOutputPorts() {
  if (!midiAccess) return [];
  return Array.from(midiAccess.outputs.values());
}

/**
 * Set the mapping to use for reverse lookups.
 */
export function setMapping(mapping) {
  currentMapping = mapping;
}

/**
 * Connect to the actions input port (physical Jam button presses).
 */
export function connectActions(portId) {
  if (actionsPort) {
    actionsPort.onmidimessage = null;
    actionsPort = null;
  }
  if (!portId || !midiAccess) return;
  const port = midiAccess.inputs.get(portId);
  if (!port) return;
  actionsPort = port;
  actionsPort.onmidimessage = (event) => onMidiMessage(event, 'actions');
}

/**
 * Connect to the feedback input port (LED data from Bitwig).
 */
export function connectFeedback(portId) {
  if (feedbackPort) {
    feedbackPort.onmidimessage = null;
    feedbackPort = null;
  }
  if (!portId || !midiAccess) return;
  const port = midiAccess.inputs.get(portId);
  if (!port) return;
  feedbackPort = port;
  feedbackPort.onmidimessage = (event) => onMidiMessage(event, 'feedback');
}

/**
 * Connect to an output port by ID.
 */
export function connectOutput(portId) {
  outputPort = null;
  if (!portId || !midiAccess) return;
  const port = midiAccess.outputs.get(portId);
  if (!port) return;
  outputPort = port;
}

/**
 * Send a raw MIDI message.
 * @param {number[]} bytes
 */
export function send(bytes) {
  if (!outputPort) return;
  outputPort.send(bytes);
}

/**
 * Send CC message.
 */
export function sendCC(channel, cc, value) {
  send([0xB0 | (channel & 0x0F), cc, value]);
}

/**
 * Send Note On.
 */
export function sendNoteOn(channel, note, velocity) {
  send([0x90 | (channel & 0x0F), note, velocity]);
}

/**
 * Send Note Off.
 */
export function sendNoteOff(channel, note) {
  send([0x80 | (channel & 0x0F), note, 0]);
}

/**
 * Send Polyphonic Aftertouch.
 */
export function sendAftertouch(channel, note, pressure) {
  send([0xA0 | (channel & 0x0F), note, pressure]);
}

/**
 * Send ReturnFromHost SysEx to request a full LED state dump.
 */
export function sendReturnFromHost() {
  send(buildSysEx(0x46, [0x01]));
}

// Resolve inputMap value to an array of controlIds (supports string | string[])
function resolveIds(mapping, key) {
  const raw = mapping.inputMap.get(key);
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

// Internal: handle incoming MIDI messages
// source: 'actions' (physical button presses) or 'feedback' (LED data from DAW)
function onMidiMessage(event, source) {
  const data = event.data;
  if (!data || data.length === 0) return;

  // SysEx
  if (data[0] === 0xF0) {
    handleSysEx(data);
    return;
  }

  if (!currentMapping) return;

  const statusByte = data[0];
  const msgType = statusByte & 0xF0;
  const channel = statusByte & 0x0F;

  switch (msgType) {
    case 0x90: { // Note On
      const note = data[1];
      const velocity = data[2];
      for (const controlId of resolveIds(currentMapping, `note:${channel}:${note}`)) {
        if (source === 'feedback') {
          // LED color update: velocity = color value
          state.setLedColor(controlId, velocity);
        } else {
          // Button press from hardware
          state.setPressed(controlId, velocity > 0);
        }
      }
      break;
    }
    case 0x80: { // Note Off
      const note = data[1];
      for (const controlId of resolveIds(currentMapping, `note:${channel}:${note}`)) {
        if (source === 'feedback') {
          state.setLedColor(controlId, 0);
        } else {
          state.setPressed(controlId, false);
        }
      }
      break;
    }
    case 0xB0: { // CC
      const cc = data[1];
      const value = data[2];

      // Strip touch CCs: 20-27 map to TstA-TstH (position CC + 12)
      if (channel === 0 && cc >= 20 && cc <= 27) {
        state.setStripTouched(STRIP_IDS[cc - 20], value > 0);
        break;
      }

      for (const controlId of resolveIds(currentMapping, `cc:${channel}:${cc}`)) {
        if (controlId.startsWith('Tst')) {
          if (source === 'feedback') {
            state.setStripValue(controlId, value);
          } else {
            state.setStripFingerPos(controlId, value);
          }
        } else if (controlId === 'EncTurn') {
          // Relative 2's complement: 1-63 = CW, 65-127 = CCW
          const direction = value < 64 ? 1 : -1;
          state.setEncoderTurn(direction);
        } else if (controlId === 'EncPush') {
          state.setEncoderPushed(value > 0);
          state.setPressed('EncPush', value > 0);
        } else if (controlId === 'EncTouch') {
          state.setEncoderTouched(value > 0);
        } else if (controlId === 'LevelL') {
          state.setLevel('L', value);
        } else if (controlId === 'LevelR') {
          state.setLevel('R', value);
        } else {
          if (source === 'feedback') {
            if (controlId.startsWith('Fsw')) continue; // footswitches have no LED
            // LED update from DAW — CC buttons have fixed backlight colors
            const base = FIXED_BUTTON_COLORS[controlId] ?? 68; // default white
            state.setLedColor(controlId, value > 0 ? base + 3 : 0);
          } else {
            // Button press/release from hardware
            state.setPressed(controlId, value > 0);
          }
        }
      }
      break;
    }
    case 0xA0: { // Polyphonic Aftertouch
      const note = data[1];
      const pressure = data[2];
      for (const controlId of resolveIds(currentMapping, `aftertouch:${channel}:${note}`)) {
        state.setStripTouched(controlId, pressure > 0);
      }
      break;
    }
  }
}

function handleSysEx(data) {
  const parsed = parseSysEx(data);
  if (!parsed) return;

  switch (parsed.command) {
    case 0x05: {
      // Strip LED colors + modes
      const strips = parseStripLeds(parsed.payload);
      for (let i = 0; i < strips.length; i++) {
        state.setStripLed(STRIP_IDS[i], strips[i].mode, strips[i].color);
      }
      break;
    }
    case 0x04: {
      // Strip bar positions (DUAL mode) — second value, separate from CC
      const values = parseStripValues(parsed.payload);
      for (let i = 0; i < values.length; i++) {
        state.setStripValue2(STRIP_IDS[i], values[i]);
      }
      break;
    }
    case 0x4D: {
      // Shift button
      state.setShift(parseShift(parsed.payload));
      break;
    }
  }
}
