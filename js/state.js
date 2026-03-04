// Centralized state store with event emission

class State extends EventTarget {
  constructor() {
    super();
    // LED color values per control: controlId → color value (0-71)
    this.ledColors = new Map();
    // Pressed state per control: controlId → boolean
    this.pressed = new Map();
    // Strip values: controlId → 0-127
    this.stripValues = new Map();
    // Strip touch state: controlId → boolean
    this.stripTouched = new Map();
    // Strip LED modes: controlId → { mode, color }
    this.stripLeds = new Map();
    // Encoder state
    this.encoderPushed = false;
    this.encoderTouched = false;
    // Shift state (from SysEx)
    this.shiftDown = false;
    // Level meters
    this.levelL = 0;
    this.levelR = 0;
  }

  _emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  setLedColor(controlId, value) {
    this.ledColors.set(controlId, value);
    this._emit('led-change', { controlId, value });
  }

  getLedColor(controlId) {
    return this.ledColors.get(controlId) || 0;
  }

  setPressed(controlId, pressed) {
    this.pressed.set(controlId, pressed);
    this._emit('press-change', { controlId, pressed });
  }

  isPressed(controlId) {
    return this.pressed.get(controlId) || false;
  }

  setStripValue(controlId, value) {
    this.stripValues.set(controlId, value);
    this._emit('strip-value-change', { controlId, value });
  }

  getStripValue(controlId) {
    return this.stripValues.get(controlId) || 0;
  }

  setStripTouched(controlId, touched) {
    this.stripTouched.set(controlId, touched);
    this._emit('strip-touch-change', { controlId, touched });
  }

  isStripTouched(controlId) {
    return this.stripTouched.get(controlId) || false;
  }

  setStripLed(controlId, mode, color) {
    this.stripLeds.set(controlId, { mode, color });
    this._emit('strip-led-change', { controlId, mode, color });
  }

  getStripLed(controlId) {
    return this.stripLeds.get(controlId) || { mode: 0, color: 0 };
  }

  setEncoderPushed(pushed) {
    this.encoderPushed = pushed;
    this._emit('encoder-push-change', { pushed });
  }

  setEncoderTouched(touched) {
    this.encoderTouched = touched;
    this._emit('encoder-touch-change', { touched });
  }

  setEncoderTurn(direction) {
    // direction: 1 = CW, -1 = CCW
    this._emit('encoder-turn', { direction });
  }

  setShift(down) {
    this.shiftDown = down;
    this._emit('shift-change', { down });
  }

  setLevel(channel, value) {
    if (channel === 'L') this.levelL = value;
    else this.levelR = value;
    this._emit('level-change', { channel, value });
  }
}

export const state = new State();
