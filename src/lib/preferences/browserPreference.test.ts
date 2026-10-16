import assert from "node:assert/strict";
import { it } from "node:test";

import { createBrowserPreference } from "@/lib/preferences/browserPreference";

const options = {
  storageKey: "test-locale",
  eventName: "test-locale-changed",
  defaultValue: "en" as const,
  values: ["en", "bg"] as const,
};

function inBrowser(run: (browser: {
  values: Map<string, string>;
  setReadBlocked: (blocked: boolean) => void;
  setWriteBlocked: (blocked: boolean) => void;
  emitStorage: (key: string | null, value: string | null, area?: object) => void;
}) => void) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  const values = new Map<string, string>();
  const browser = new EventTarget();
  let readBlocked = false;
  let writeBlocked = false;
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (writeBlocked) throw new Error("Quota exceeded");
      values.set(key, value);
    },
  };
  Object.defineProperty(browser, "localStorage", {
    get: () => {
      if (readBlocked) throw new Error("Storage access denied");
      return storage;
    },
  });
  Object.defineProperty(globalThis, "window", { value: browser, configurable: true });
  try {
    run({
      values,
      setReadBlocked: (blocked) => { readBlocked = blocked; },
      setWriteBlocked: (blocked) => { writeBlocked = blocked; },
      emitStorage: (key, newValue, storageArea = storage) => {
        const event = new Event("storage");
        Object.assign(event, { key, newValue, storageArea });
        browser.dispatchEvent(event);
      },
    });
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
}

it("does not retain server-side preference changes across SSR reads", () => {
  const preference = createBrowserPreference(options);
  preference.write("bg");
  assert.equal(preference.read(), "en");
  assert.doesNotThrow(preference.subscribe(() => {}));
});

it("keeps settings usable and notifies subscribers when storage access is denied", () => {
  inBrowser(({ setReadBlocked }) => {
    setReadBlocked(true);
    const preference = createBrowserPreference(options);
    let changes = 0;
    const unsubscribe = preference.subscribe(() => { changes += 1; });
    assert.equal(preference.read(), "en");
    preference.write("bg");
    assert.equal(preference.read(), "bg");
    assert.equal(changes, 1);
    unsubscribe();
    preference.write("en");
    assert.equal(changes, 1);
  });
});

it("does not replace a failed write with an older readable storage value", () => {
  inBrowser(({ values, setReadBlocked, setWriteBlocked }) => {
    values.set(options.storageKey, "en");
    const preference = createBrowserPreference(options);
    assert.equal(preference.read(), "en");
    setWriteBlocked(true);
    preference.write("bg");
    assert.equal(values.get(options.storageKey), "en");
    assert.equal(preference.read(), "bg");

    setWriteBlocked(false);
    preference.write("bg");
    assert.equal(values.get(options.storageKey), "bg");
    setReadBlocked(true);
    assert.equal(preference.read(), "bg");
  });
});

it("adopts cross-tab updates and clear events while ignoring unrelated/session storage", () => {
  inBrowser(({ values, setWriteBlocked, emitStorage }) => {
    const preference = createBrowserPreference(options);
    let changes = 0;
    const unsubscribe = preference.subscribe(() => { changes += 1; });
    values.set(options.storageKey, "invalid");
    assert.equal(preference.read(), "en");
    emitStorage("another-setting", "bg");
    emitStorage(options.storageKey, "bg", {});
    assert.equal(changes, 0);

    setWriteBlocked(true);
    preference.write("bg");
    assert.equal(preference.read(), "bg");
    values.set(options.storageKey, "en");
    emitStorage(options.storageKey, "en");
    assert.equal(preference.read(), "en");
    preference.write("bg");
    values.clear();
    emitStorage(null, null);
    assert.equal(preference.read(), "en");
    assert.equal(changes, 4);
    unsubscribe();
  });
});
