import { describe, expect, it } from 'vitest';
import { listenInStretches, MAX_LISTEN_MS, type VoiceError } from './voice';

type Stretch = { partial(text: string): void; done(final?: string): void; fail(error: VoiceError): void };

function harness(now: () => number = Date.now) {
  const stretches: Stretch[] = [];
  const partials: string[] = [];
  const out: { end?: string; error?: VoiceError } = {};
  let stopped = 0;
  const session = listenInStretches(
    { onPartial: (t) => partials.push(t), onEnd: (t) => (out.end = t), onError: (e) => (out.error = e) },
    (s) => {
      stretches.push(s);
      return { stop: () => stopped++ };
    },
    now,
  );
  return { stretches, partials, out, session, stopped: () => stopped };
}

describe('voice keeps listening across pauses', () => {
  it('joins every stretch of a long sentence instead of stopping at the first pause', () => {
    const h = harness();
    h.stretches[0].partial('Pay the electricity bill');
    h.stretches[0].done('Pay the electricity bill');
    expect(h.out.end).toBeUndefined();
    h.stretches[1].partial('and the water bill');
    expect(h.partials.at(-1)).toBe('Pay the electricity bill and the water bill');
    h.stretches[1].done();
    // A stretch with nothing new means the person has finished.
    h.stretches[2].done('');
    expect(h.out.end).toBe('Pay the electricity bill and the water bill');
  });

  it('stops after the current stretch when the person taps stop', () => {
    const h = harness();
    h.stretches[0].partial('Call Amit');
    h.session!.stop();
    expect(h.stopped()).toBe(1);
    h.stretches[0].done('Call Amit tomorrow at 6');
    expect(h.out.end).toBe('Call Amit tomorrow at 6');
    expect(h.stretches).toHaveLength(1);
  });

  it('keeps what was heard if a later stretch fails, and reports a failure at the start', () => {
    const h = harness();
    h.stretches[0].done('Renew passport');
    h.stretches[1].fail('network');
    expect(h.out).toEqual({ end: 'Renew passport' });
    const first = harness();
    first.stretches[0].fail('permission');
    expect(first.out).toEqual({ error: 'permission' });
  });

  it('ends at the time limit', () => {
    let t = 0;
    const h = harness(() => t);
    h.stretches[0].done('one');
    t = MAX_LISTEN_MS + 1;
    h.stretches[1].done('two');
    expect(h.out.end).toBe('one two');
    expect(h.stretches).toHaveLength(2);
  });
});
