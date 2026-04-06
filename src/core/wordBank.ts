// ── Word bank ─────────────────────────────────────────────────────────────────

let wordBankCache: string[] | null = null;

export async function getWordBank(): Promise<string[]> {
  if (wordBankCache) return wordBankCache;
  const res = await fetch('/wordbank.json');
  if (!res.ok) throw new Error(`Failed to load word bank: ${res.status}`);
  const raw: string[] = await res.json();
  wordBankCache = raw.map(w => w.toUpperCase());
  return wordBankCache;
}

// ── Dictionary ────────────────────────────────────────────────────────────────

const dictChunkCache: Record<string, Record<string, string>>           = {};
const dictChunkLoading: Record<string, Promise<Record<string, string>>> = {};

function getDictChunk(letter: string): Promise<Record<string, string>> {
  const l = letter.toLowerCase();
  if (dictChunkCache[l]) return Promise.resolve(dictChunkCache[l]);
  if (!dictChunkLoading[l]) {
    dictChunkLoading[l] = fetch(`/dictionary/${l}.json`)
      .then(res => {
        if (!res.ok) throw new Error();
        return res.json() as Promise<Record<string, string>>;
      })
      .then(chunk => { dictChunkCache[l] = chunk; delete dictChunkLoading[l]; return chunk; })
      .catch(err  => { delete dictChunkLoading[l]; throw err; });
  }
  return dictChunkLoading[l];
}

export async function getDefinition(word: string): Promise<string | null> {
  const lower = word.toLowerCase();
  const chunk = await getDictChunk(lower[0]);
  return chunk[lower] ?? null;
}

export function prefetchDictChunks(words: string[]): void {
  const letters = new Set(words.map(w => w[0].toLowerCase()));
  for (const letter of letters) getDictChunk(letter).catch(() => {});
}
