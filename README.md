# Jamulator — Maschine Jam Web Emulator

A web-based GUI emulator of the Native Instruments Maschine Jam controller with full bidirectional MIDI support.

**Use cases:**
1. Test controller scripts (like monsterjam) without physical hardware
2. Virtual MIDI controller for DAW use
3. On-screen mirror for demo videos — reflects all button presses and touches in real-time

## Quick Start

### 1. Run a Local HTTP Server

```bash
cd /Users/user/work/music/jamulator
python3 -m http.server 8000
```

Or use VS Code Live Server extension.

### 2. Open in Browser

Navigate to `http://localhost:8000`

You should see the Jamulator UI — a dark-themed replica of the Maschine Jam controller with all buttons, pads, strips, and encoder.

### 3. Connect MIDI Ports

1. **MIDI In**: Select the input port you want to monitor (e.g., a loopback port for testing, or the Jam hardware's output for mirror mode)
2. **MIDI Out**: Select the output port to send MIDI to (e.g., a DAW, loopback, or back to the hardware)
3. Click **Connect**

You should see "Connected — In: [port], Out: [port]" at the bottom.

### 4. Test It

- **Click buttons** on the GUI → you should see MIDI CC/Note messages in any connected MIDI monitor
- **Send LED colors** from your DAW or MIDI monitor → buttons should light up
- **Drag touch strips** → CC values 0-127 are sent
- **Scroll the encoder knob** (use mouse wheel) → relative CC values sent
- **Connect real Jam hardware** for mirror mode → press buttons on real hardware, see them highlight on screen

## Features

### Button Types
- **Left column** (11 buttons): Song, Step, Pad Mode, Clear, Duplicate, Note Repeat, Macro, Level, Aux, Control, Auto
- **Right column** (11 buttons): Master, Group, In1, Cue, Browse, Perform, Notes, Lock, Tune, Swing, Select
- **Scene buttons** (8): Selectable scene rows
- **Group buttons** (8): Group A-H
- **Matrix** (8×8): 64 RGB pads for note triggering
- **D-Pad** (4): Navigation up/down/left/right
- **Bottom row** (8): Play, Record, <, >, Tempo, Grid, Solo, Mute
- **Encoder**: Click-enabled rotary knob with touch detection

### Touch Strips
8 touch-sensitive vertical strips. Drag up/down to send CC values (0-127). When touched, shows a glowing finger indicator.

**Strip modes** (received via SysEx):
- **SINGLE**: Fill from bottom (default)
- **DOT**: Single indicator dot at position
- **PAN**: Center-fill (stereo balance)
- **DUAL**: Dual fill (for level meters)

### MIDI Mapping

All MIDI mappings are derived from the Bitwig Studio monsterjam extension (`ext.ncmj`).

**Examples:**
- `BtnPlay` → CC 108 on channel 0
- `BtnScene1` → Note 0 on channel 1
- `BtnA1` (matrix pad) → Note 22 on channel 0
- `TstA` (strip A) → CC 8 on channel 0

Full mapping table is in `js/default-mapping.js`.

### Load Custom Mappings

Click **Load .ncmj** to upload a Native Instruments `.ncmj` XML file. The emulator will parse it and apply the custom mapping. Falls back to defaults if parsing fails.

## Architecture

### Single-Page App (No Framework, No Build Tools)

**Entry point**: `index.html`

**JavaScript modules** (ES6 modules):
- `main.js` — Initialization, port selection, file upload
- `state.js` — Centralized state store
- `midi-engine.js` — Web MIDI API integration
- `led-renderer.js` — State changes → DOM updates
- `ui-controller.js` — Button clicks → MIDI output
- `touchstrip.js` — Strip drag → MIDI output
- `encoder.js` — Scroll wheel + click interaction
- `sysex.js` — SysEx message parse/build
- `xml-parser.js` — `.ncmj` file parsing
- `colors.js` — 18-color palette lookup
- `default-mapping.js` — Hardcoded MIDI mapping

**CSS**: Responsive hardware-themed styling with CSS Grid layout.

## Bidirectional MIDI

### Outbound (GUI → MIDI)
User action (button click, strip drag, etc.) → update state → send MIDI message

### Inbound (MIDI → GUI)
Incoming MIDI → reverse-lookup control ID → update state → renderer updates DOM

### Mirror Mode
Connect input port to hardware Jam's output. Button presses from the real hardware trigger press highlights on the emulator screen. LED color commands from a DAW show the current button color. Shift button state arrives via SysEx.

## SysEx Protocol

**Header**: `F0 00 21 09 15 00 4D 50 00 01`

Supported commands:
- `05`: Strip LED colors + bar modes (extension → hardware)
- `04`: Strip bar positions in DUAL mode (extension → hardware)
- `4D`: Shift button state (hardware → extension)

## Requirements

- Modern browser with **Web MIDI API** support (Chrome, Edge, Opera; Firefox requires enabling about:config flag)
- **HTTPS or localhost** (Web MIDI requires secure context)
- System MIDI ports (virtual or physical)
- Optional: MIDI loopback utility (for testing without real hardware)

## Browser Support

| Browser | Support | HTTPS Required |
|---------|---------|----------------|
| Chrome/Chromium | ✓ Full | Yes* |
| Edge | ✓ Full | Yes* |
| Firefox | ✓ (experimental) | Yes* |
| Safari | ✗ Not supported | — |

*Localhost (127.0.0.1) is considered secure and doesn't require HTTPS.

## Troubleshooting

### "MIDI access denied"
- Ensure HTTPS or localhost
- Check browser allows Web MIDI (some require per-site permission)
- Ensure SysEx is allowed if using `.ncmj` files

### No MIDI ports appear
- Check your system's MIDI setup
- On Mac: MIDI Audio Setup, IAC Driver
- On Windows: Virtual MIDI tools (loopMIDI)
- On Linux: ALSA or JACK

### LED colors not showing
- Verify the MIDI input is connected
- Check that color messages are being sent on the correct channel (0 for most messages)
- Open browser DevTools console for any JS errors

### Buttons not responding
- Check MIDI output is connected
- Verify the DAW or MIDI monitor is receiving the messages
- Try a loopback connection to test locally

## Development Notes

### Adding New Features

1. **New button**: Add to `default-mapping.js`, HTML, and CSS
2. **New MIDI message type**: Update `midi-engine.js` and `state.js`
3. **Custom XML format**: Extend `xml-parser.js` parsing logic

### Testing

Use a MIDI monitor like:
- **Mac**: MIDI Monitor (free app)
- **Windows**: MIDIOX, Bome MIDI Translator Free
- **Web**: Online MIDI monitor (if using loopback)

Send test messages and watch buttons light up in real-time.

## References

- [Web MIDI API spec](https://www.w3.org/TR/webmidi/)
- [Monsterjam extension](https://github.com/chrishubert/monsterjam) — Source of MIDI mappings
- [Native Instruments documentation](https://www.native-instruments.com/en/products/maschine/maschine-jam/)

## License

This emulator is provided as-is for development and testing. Native Instruments Maschine Jam is a trademark of Native Instruments.

---

**Questions?** Check the browser console (F12) for debug output and error messages.
