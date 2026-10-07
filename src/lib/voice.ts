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

/** Longest a single voice note may run; the person can always tap stop sooner. */
export const MAX_LISTEN_MS = 120_000;

const join = (...parts: string[]) => parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

/**
 * Speech recognizers stop by themselves at the first pause, which cut long
 * sentences short. This keeps listening: each time a stretch of speech ends, the
 * words are kept and recognition starts again, until the person taps stop, a
 * stretch ends with nothing new (they have finished), or MAX_LISTEN_MS passes.
 */
export function listenInStretches(
  h: VoiceHandlers,
  startStretch: (stretch: { partial(text: string): void; done(final?: string): void; fail(error: VoiceError): void }) => { stop(): void } | null,
  now: () => number = Date.now,
): VoiceSession | null {
  const began = now();
  let kept = '';
  let finished = false;
  let stopping = false;
  let current: { stop(): void } | null = null;

  const finish = () => {
    if (finished) return;
    finished = true;
    h.onEnd(kept);
  };

  const run = (): boolean => {
    let heard = '';
    let closed = false;
    current = startStretch({
      partial(text) {
        if (closed || finished) return;
        heard = text.trim();
        h.onPartial(join(kept, heard));
      },
      done(final) {
        if (closed || finished) return;
        closed = true;
        if (final && final.trim().length >= heard.length) heard = final.trim();
        kept = join(kept, heard);
        h.onPartial(kept);
        // Silence after speech, a tap on stop, or the time limit ends the note.
        if (stopping || !heard || now() - began > MAX_LISTEN_MS || !run()) finish();
      },
      fail(error) {
        if (closed || finished) return;
        closed = true;
        finished = true;
        // Anything already heard is kept; a failure on the first stretch is reported.
        if (kept || heard) h.onEnd(join(kept, heard));
        else h.onError(error);
      },
    });
    return !!current;
  };

  if (!run()) return null;
  return {
    stop() {
      stopping = true;
      current?.stop();
    },
  };
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
    let first = true;
    return listenInStretches(h, (stretch) => {
      const rec = new Ctor();
      rec.lang = lang;
      rec.interimResults = true;
      // One stretch at a time: "continuous" repeats words on Android Chrome.
      rec.continuous = false;
      rec.maxAlternatives = 1;
      let text = '';
      let failed = false;
      const isFirst = first;
      first = false;
      rec.onresult = (e) => {
        text = Array.from(e.results, (r) => r[0].transcript).join(' ').replace(/\s+/g, ' ').trim();
        stretch.partial(text);
      };
      rec.onerror = (e) => {
        if (e.error === 'aborted') return;
        // A later stretch with no speech just means the person has finished.
        if (e.error === 'no-speech' && !isFirst) return;
        failed = true;
        stretch.fail(mapWebError(e.error));
      };
      rec.onend = () => {
        if (!failed) stretch.done(text);
      };
      try {
        rec.start();
      } catch {
        if (isFirst) h.onError('failed');
        return null;
      }
      return { stop: () => rec.stop() };
    });
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

    // One set of listeners serves every stretch; `active` is the stretch in progress.
    let active: { partial(text: string): void; done(final?: string): void; fail(error: VoiceError): void } | null = null;
    let heard = '';
    const handles: PluginListenerHandle[] = [];
    const end = async () => {
      const stretch = active;
      if (!stretch) return;
      active = null;
      // The recognizer can hold back the last words; ask for them before moving on.
      const last = await NativeSpeech.getLastPartialResult().catch(() => null);
      stretch.done(last?.available && last.text.trim().length > heard.length ? last.text : heard);
    };
    handles.push(
      await NativeSpeech.addListener('partialResults', (d) => {
        const text = (d.matches?.[0] ?? d.accumulatedText ?? '').trim();
        if (!text) return;
        heard = text;
        active?.partial(text);
      }),
      await NativeSpeech.addListener('listeningState', (d) => {
        if (d.status === 'stopped' || d.state === 'stopped') void end();
      }),
    );
    const cleanup = (fn: (text: string) => void) => (text: string) => {
      handles.forEach((x) => void x.remove());
      fn(text);
    };
    const wrapped: VoiceHandlers = { onPartial: h.onPartial, onEnd: cleanup(h.onEnd), onError: (e) => cleanup(() => h.onError(e))('') };

    let first = true;
    return listenInStretches(wrapped, (stretch) => {
      const isFirst = first;
      first = false;
      heard = '';
      active = stretch;
      NativeSpeech.start({ language: lang, partialResults: true, popup: false, maxResults: 1, addPunctuation: false, muteRecognizerBeep: true })
        .then((r) => {
          // Some devices return the final words here instead of via partialResults.
          const final = r?.matches?.[0]?.trim();
          if (final && final.length > heard.length) heard = final;
        })
        .catch(() => {
          if (active !== stretch) return;
          active = null;
          // Nothing more was said: the note is complete. Silence on the very first try is an error.
          if (isFirst && !heard) stretch.fail('no-speech');
          else stretch.done(heard);
        });
      return {
        stop: () => {
          void NativeSpeech.stop()
            .catch(() => {})
            .finally(() => window.setTimeout(() => void end(), 400));
        },
      };
    });
  },
};

const none: VoiceInput = { kind: 'none', isSupported: () => false, start: async (h) => (h.onError('unsupported'), null) };

/** The best voice engine for where ZarooriBox is running. */
export function getVoiceInput(): VoiceInput {
  if (nativeVoice.isSupported()) return nativeVoice;
  if (webVoice.isSupported()) return webVoice;
  return none;
}
