import * as Speech from "expo-speech";

/**
 * Talking-caddie text-to-speech.
 *
 * Uses `expo-speech`, which is on-device TTS on native and the Web Speech API
 * (`window.speechSynthesis`) on web. No keys or network required. Audio plays on
 * the user's device; in a headless/CI browser there may be no audio output even
 * though the calls succeed.
 */

let speaking = false;

export function isSpeaking(): boolean {
  return speaking;
}

export function speak(text: string, onDone?: () => void) {
  if (!text) return;
  // Interrupt any current utterance so updates feel responsive.
  Speech.stop();
  speaking = true;
  Speech.speak(text, {
    rate: 0.97,
    pitch: 1.02,
    onDone: () => {
      speaking = false;
      onDone?.();
    },
    onStopped: () => {
      speaking = false;
    },
    onError: () => {
      speaking = false;
    },
  });
}

export function stopSpeaking() {
  speaking = false;
  Speech.stop();
}
