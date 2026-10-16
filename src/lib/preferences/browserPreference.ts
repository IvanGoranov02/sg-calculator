type BrowserPreferenceOptions<T extends string> = {
  storageKey: string;
  eventName: string;
  defaultValue: T;
  values: readonly T[];
};

/** A primitive external-store snapshot that stays usable without browser storage. */
export function createBrowserPreference<T extends string>(options: BrowserPreferenceOptions<T>) {
  let memory = options.defaultValue;
  let memoryOverride = false;
  const parse = (value: string | null): T =>
    value != null && options.values.includes(value as T) ? value as T : options.defaultValue;

  function read(): T {
    if (typeof window === "undefined") return options.defaultValue;
    if (memoryOverride) return memory;
    try {
      memory = parse(window.localStorage.getItem(options.storageKey));
    } catch {
      // Retain the last known value if reads become unavailable.
    }
    return memory;
  }

  function write(next: T): void {
    if (typeof window === "undefined") return;
    memory = next;
    try {
      window.localStorage.setItem(options.storageKey, next);
      memoryOverride = false;
    } catch {
      // Reads may still succeed after a quota error; prefer the new in-memory value.
      memoryOverride = true;
    }
    window.dispatchEvent(new Event(options.eventName));
  }

  function subscribe(onChange: () => void): () => void {
    if (typeof window === "undefined") return () => {};
    const onStorage = (event: StorageEvent) => {
      if (event.key !== options.storageKey && event.key !== null) return;
      if (event.storageArea) {
        try {
          if (event.storageArea !== window.localStorage) return;
        } catch {
          return;
        }
      }
      memory = parse(event.newValue);
      memoryOverride = false;
      onChange();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(options.eventName, onChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(options.eventName, onChange);
    };
  }

  return { read, write, subscribe };
}
