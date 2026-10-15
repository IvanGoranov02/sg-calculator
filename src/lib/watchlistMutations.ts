import { normalizeTicker, WATCHLIST_MAX } from "@/lib/watchlistStorage";

/** Serialize whole-list writes so rapid actions always build on the last saved list. */
export function createWatchlistMutations(input: {
  symbols: string[];
  save: (symbols: string[], operation: { action: "add" | "remove"; symbol: string }) => Promise<boolean | { symbols: string[] }>;
  onSaved: (symbols: string[]) => void;
  onError: () => void;
}) {
  let symbols = [...input.symbols];
  let active = true;
  let queue = Promise.resolve(false);

  return {
    deactivate() { active = false; },
    mutate(action: "add" | "remove" | "toggle", raw: string): Promise<boolean> {
      const symbol = normalizeTicker(raw);
      queue = queue.then(async () => {
        if (!active || !symbol) return false;
        const exists = symbols.includes(symbol);
        const removing = action === "remove" || (action === "toggle" && exists);
        if (removing && !exists) return false;
        if (!removing && (exists || symbols.length >= WATCHLIST_MAX)) return false;
        const next = removing ? symbols.filter((s) => s !== symbol) : [...symbols, symbol];
        try {
          const saved = await input.save(next, { action: removing ? "remove" : "add", symbol });
          if (!active) return false;
          if (!saved) { input.onError(); return false; }
          symbols = typeof saved === "boolean" ? next : saved.symbols;
          input.onSaved(symbols);
          return true;
        } catch {
          if (active) input.onError();
          return false;
        }
      });
      return queue;
    },
  };
}
