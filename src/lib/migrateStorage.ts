// The app was called LifeBox before it became ZarooriBox. Data saved on this device under
// the old "lifebox:" keys is copied to the new "zaroori:" keys once, so nothing is lost.
// Imported first in main.tsx, before anything reads storage.
try {
  const store = globalThis.localStorage;
  if (store && !store.getItem('zaroori:migrated')) {
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (!key?.startsWith('lifebox:')) continue;
      const next = `zaroori:${key.slice('lifebox:'.length)}`;
      if (store.getItem(next) === null) store.setItem(next, store.getItem(key) ?? '');
    }
    store.setItem('zaroori:migrated', '1');
  }
} catch {
  /* storage blocked: nothing to move */
}

export {};
