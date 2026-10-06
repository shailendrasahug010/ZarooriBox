import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { SpeechRecognition as NativeSpeech } from '@capgo/capacitor-speech-recognition';

// Voice input for Quick Add. In the phone app it uses the operating system's speech
// recognizer (Android / iOS) through a Capacitor plugin; in browsers it uses the Web
// Speech API (Chrome, Edge, Safari, Android Chrome). Both report words as they are
// heard, so the Quick Add preview updates while the person is still speaking.

export type VoiceError = 'unsupported' | 'permission' | 'no-speech' | 'network' | 'failed';

export interface VoiceHandlers {
  /** Words heard so far (replaces the previous partial). */
  onPartial(text: string): void;
  /** Called once when listening ends, with the final text ('' if nothing was heard). */
  onEnd(text: string): void;
  onError(error: VoiceError): void;
}

export interface VoiceSession {
  stop(): void;
}

export interface VoiceInput {
  readonly kind: 'native' | 'web' | 'none';
  isSupported(): boolean;
  start(handlers: VoiceHandlers, lang?: string): Promise<VoiceSession | null>;
}

export const VOICE_ERROR_TEXT: Record<VoiceError, string> = {
  unsupported: 'Voice input isn’t available on this device.',
  permission: 'Allow microphone access to add things by voice.',
  'no-speech': 'Didn’t catch that. Tap the mic and try again.',
  network: 'Voice needs an internet connection on this device.',
  failed: 'Voice input stopped unexpectedly. Try again.',
};

export function defaultVoiceLang(): string {
  const nav = typeof navigator !== 'undefined' ? navigator.language : '';
  // Indian-language devices (hi-IN, ta-IN…) listen in that language; others in English.
  if (/^(hi|bn|mr|te|ta|gu|kn|ml|pa|or|ur)-IN$/i.test(nav)) return nav;
  return /^en-/i.test(nav) ? nav : 'en-IN';
}

/** The person's chosen voice language, else Hindi for the Hindi app, else the device's. */
export function voiceLangFor(settings: { voiceLanguage?: string | null }, appLanguage: string): string {
  if (settings.voiceLanguage) return settings.voiceLanguage;
  if (appLanguage === 'hi') return 'hi-IN';
  return defaultVoiceLang();
}

// ---- Web Speech API ------------------------------------------------------------

interface WebRecognitionResult {
  readonly isFinal: boolean;
  readonly 0: { transcript: string };
}
interface WebRecognitionEvent {
  readonly results: ArrayLike<WebRecognitionResult>;
}
interface WebRecognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: WebRecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type WebRecognitionCtor = new () => WebRecognition;

function webCtor(): WebRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: WebRecognitionCtor; webkitSpeechRecognition?: WebRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function mapWebError(code: string): VoiceError {
  if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') return 'permission';
  if (code === 'no-speech') return 'no-speech';
  if (code === 'network') return 'network';
  return 'failed';
}

export const webVoice: VoiceInput = {
  kind: 'web',
  isSupported: () => webCtor() !== null,
  async start(h, lang = defaultVoiceLang()) {
    const Ctor = webCtor();
    if (!Ctor) {
      h.onError('unsupported');
      return null;
    }
    const rec = new Ctor();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    let text = '';
    let failed = false;
    rec.onresult = (e) => {
      text = Array.from(e.results, (r) => r[0].transcript).join(' ').replace(/\s+/g, ' ').trim();
      h.onPartial(text);
    };
    rec.onerror = (e) => {
      if (e.error === 'aborted') return;
      failed = true;
      h.onError(mapWebError(e.error));
    };
    rec.onend = () => {
      if (!failed) h.onEnd(text);
    };
    try {
      rec.start();
    } catch {
      h.onError('failed');
      return null;
    }
    return { stop: () => rec.stop() };
  },
};

// ---- Native (Capacitor) --------------------------------------------------------

export const nativeVoice: VoiceInput = {
  kind: 'native',
  isSupported: () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('SpeechRecognition'),
  async start(h, lang = defaultVoiceLang()) {
    try {
      const { available } = await NativeSpeech.available();
      if (!available) {
        h.onError('unsupported');
        return null;
      }
      let perm = await NativeSpeech.checkPermissions();
      if (perm.speechRecognition !== 'granted') perm = await NativeSpeech.requestPermissions();
      if (perm.speechRecognition !== 'granted') {
        h.onError('permission');
        return null;
      }
    } catch {
      h.onError('failed');
      return null;
    }

    let text = '';
    let ended = false;
    const handles: PluginListenerHandle[] = [];
    const finish = () => {
      if (ended) return;
      ended = true;
      handles.forEach((x) => void x.remove());
      h.onEnd(text);
    };
    handles.push(
      await NativeSpeech.addListener('partialResults', (d) => {
        text = (d.accumulatedText ?? d.matches?.[0] ?? text).trim();
        h.onPartial(text);
      }),
      await NativeSpeech.addListener('listeningState', (d) => {
        if (d.status === 'stopped' || d.state === 'stopped') finish();
      }),
    );
    NativeSpeech.start({ language: lang, partialResults: true, popup: false, maxResults: 1, addPunctuation: false })
      .then((r) => {
        // Some devices return the final words here instead of via partialResults.
        if (r?.matches?.[0]) text = r.matches[0].trim();
      })
      .catch(() => {
        if (!ended) {
          ended = true;
          handles.forEach((x) => void x.remove());
          if (text) h.onEnd(text);
          else h.onError('no-speech');
        }
      });
    return {
      stop: () => {
        void NativeSpeech.stop().finally(finish);
      },
    };
  },
};

const none: VoiceInput = { kind: 'none', isSupported: () => false, start: async (h) => (h.onError('unsupported'), null) };

/** The best voice engine for where LifeBox is running. */
export function getVoiceInput(): VoiceInput {
  if (nativeVoice.isSupported()) return nativeVoice;
  if (webVoice.isSupported()) return webVoice;
  return none;
}
