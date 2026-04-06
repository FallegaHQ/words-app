// ── Public API barrel ─────────────────────────────────────────────────────────
// Re-exports everything the rest of the app needs from the game/ modules.
// Consumers import from here — internal module structure stays an impl detail.

export { generateGameAsync, generateGridOnlyAsync,
         assembleHandIntoState, getDailySeedString,
         generateRandomSeedString }                  from './game/generator';
export { revealTile, scratchCell, useLuckyDrawTile, tileIsUseful,
         revealFullGridFog }                         from './game/actions';
export { computeScore, computeWordScore }            from './game/scoring';

// Exposed for tests / utilities that need them directly
export { randInt, shuffle, hashSeed,
         buildDraftSegments, getGridLetters }        from './game/utils';
