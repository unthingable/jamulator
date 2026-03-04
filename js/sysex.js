// SysEx parse/build for Maschine Jam
// Header: F0 00 21 09 15 00 4D 50 00 01
// Strip white color (68) remapped to 120 per StripBank.scala

const SYSEX_HEADER = [0xF0, 0x00, 0x21, 0x09, 0x15, 0x00, 0x4D, 0x50, 0x00, 0x01];

// Strip LED color remap: white 68 → 120
const WHITE_REMAP = 120;
const WHITE_BASE = 68;

export const STRIP_MODE = {
  SINGLE: 0x00,
  DOT: 0x01,
  PAN: 0x02,
  DUAL: 0x03,
};

/**
 * Parse incoming SysEx message.
 * @param {Uint8Array} data - Raw SysEx bytes
 * @returns {{ command: number, payload: Uint8Array } | null}
 */
export function parseSysEx(data) {
  // Verify header
  if (data.length < SYSEX_HEADER.length + 2) return null; // header + cmd + F7
  for (let i = 0; i < SYSEX_HEADER.length; i++) {
    if (data[i] !== SYSEX_HEADER[i]) return null;
  }
  const command = data[SYSEX_HEADER.length];
  const payload = data.slice(SYSEX_HEADER.length + 1, data.length - 1); // exclude F7
  return { command, payload };
}

/**
 * Parse strip LED colors command (cmd 0x05).
 * Payload: 16 bytes = 8 × [mode, color]
 * @returns {Array<{ mode: number, color: number }>}
 */
export function parseStripLeds(payload) {
  const strips = [];
  for (let i = 0; i < 8; i++) {
    let color = payload[i * 2 + 1];
    // Reverse white remap
    if (color >= WHITE_REMAP && color <= WHITE_REMAP + 3) {
      color = WHITE_BASE + (color - WHITE_REMAP);
    }
    strips.push({
      mode: payload[i * 2],
      color,
    });
  }
  return strips;
}

/**
 * Parse strip bar positions command (cmd 0x04).
 * Payload: 8 bytes (values 0-127) — used in DUAL mode only.
 * @returns {number[]}
 */
export function parseStripValues(payload) {
  return Array.from(payload.slice(0, 8));
}

/**
 * Parse shift button command (cmd 0x4D).
 * Payload: 1 byte — 0x01 = down, 0x00 = up
 * @returns {boolean}
 */
export function parseShift(payload) {
  return payload[0] === 0x01;
}

/**
 * Build a SysEx message.
 */
export function buildSysEx(command, payload) {
  return new Uint8Array([...SYSEX_HEADER, command, ...payload, 0xF7]);
}
