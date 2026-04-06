import './style.css';

// Core
import { generateGameAsync, revealTile, scratchCell, useLuckyDrawTile } from './core/gameLogic';
import { getWordBank, getDefinition, prefetchDictChunks } from './core/wordBank';
import { saveScore, getAllScores, getUnlockedIds } from './core/storage';
import { checkAchievements } from './core/achievementCheck';

// UI — screens
import { renderHub }                                   from './ui/hub';
import { render, renderLoading, updateLoadingProgress, renderError, resetRenderer } from './ui/game';

// UI — modals
import { showDefinitionModal, hideDefinitionModal }    from './ui/modals/definition';
import { showNewTicketModal, hideNewTicketModal }       from './ui/modals/newTicket';
import { showHighScoreModal }                           from './ui/modals/highScores';
import { showSummaryModal, hideSummaryModal }           from './ui/modals/summary';
import { showAchievementsModal }                        from './ui/modals/achievements';
import { showAchievementToast }                        from './ui/modals/toast';
import { showHowToPlayModal }                          from './ui/modals/howToPlay';

// Types
import { DIFFICULTY_PRESETS } from './constants';
import type { GameState, GameConfig, RenderCallbacks, Word } from './types';

// ── App state ─────────────────────────────────────────────────────────────────

let state:         GameState | null = null;
let currentConfig: GameConfig = {
  difficulty:    DIFFICULTY_PRESETS.medium,
  difficultyKey: 'medium',
  gridSizeKey:   'normal',
};

// ── Session timer ─────────────────────────────────────────────────────────────

let timerStart:   number | null = null;
let timerEnd:     number | null = null;
let summaryShown: boolean       = false;

function getElapsedMs(): number {
  if (!timerStart) return 0;
  return (timerEnd ?? Date.now()) - timerStart;
}

function resetSession(): void {
  timerStart   = null;
  timerEnd     = null;
  summaryShown = false;
}

// ── Session helpers ───────────────────────────────────────────────────────────

function finaliseSession(): void {
  timerEnd ??= Date.now();
  if (state) saveScore(state, currentConfig);
}

function showAutoSummary(): void {
  if (!state || summaryShown) return;
  summaryShown = true;
  finaliseSession();

  showSummaryModal(state, currentConfig, getElapsedMs(), {
    onPlayAgain: () => {
      hideSummaryModal();
      startNewGame();
    },
    onChangeSettings: () => {
      hideSummaryModal();
      showNewTicketModal(currentConfig, newConfig => {
        hideNewTicketModal();
        currentConfig = newConfig;
        startNewGame();
      });
    },
  });
}

// ── Render callbacks ──────────────────────────────────────────────────────────

const callbacks: RenderCallbacks = {
  onRevealTile: (i, isBonus) => {
    if (!state) return;
    if (!timerStart) timerStart = Date.now();
    update(revealTile(state, i, isBonus));
  },
  onScratchCell: (r, c) => {
    if (!state) return;
    if (!timerStart) timerStart = Date.now();
    update(scratchCell(state, r, c));
  },
  onLuckyDrawPick: (letter) => {
    if (!state) return;
    if (!timerStart) timerStart = Date.now();
    update(useLuckyDrawTile(state, letter));
  },

  onNewGame: () => {
    showNewTicketModal(currentConfig, newConfig => {
      hideNewTicketModal();
      if (state && !summaryShown) {
        summaryShown = true;
        finaliseSession();
        showSummaryModal(state, currentConfig, getElapsedMs(), {
          onStart: () => {
            hideSummaryModal();
            currentConfig = newConfig;
            startNewGame();
          },
        });
      } else {
        currentConfig = newConfig;
        startNewGame();
      }
    });
  },

  onWordClick:        (word, onClosed) => handleWordClick(word, onClosed),
  onShowHighScores:   ()               => showHighScoreModal(getAllScores(), currentConfig),
  onShowAchievements: ()               => showAchievementsModal(getUnlockedIds()),
};

// ── State update cycle ────────────────────────────────────────────────────────

function update(next: GameState): void {
  state = next;
  render(state, callbacks, currentConfig);

  const newly = checkAchievements(state, currentConfig, getElapsedMs());
  newly.forEach((ach, i) => {
    setTimeout(() => showAchievementToast(ach.icon, ach.title), i * 1200);
  });

  if (!summaryShown && state.words.length > 0 && state.words.every(w => w.complete)) {
    timerEnd = Date.now();
    setTimeout(showAutoSummary, 700);
  }
}

// ── Word definition ───────────────────────────────────────────────────────────

async function handleWordClick(word: string, onClosed: () => void): Promise<void> {
  showDefinitionModal(word, null, onClosed);
  try {
    const def = await getDefinition(word);
    showDefinitionModal(word, def ?? '(No definition found)', onClosed);
  } catch {
    showDefinitionModal(word, '⚠️ Could not load dictionary.\nMake sure the /dictionary/ folder is in public/.', onClosed);
  }
}

// ── Game start ────────────────────────────────────────────────────────────────

async function startNewGame(): Promise<void> {
  hideDefinitionModal();
  resetSession();
  resetRenderer();
  renderLoading();

  let nextState: GameState | null = null;
  let failed = false;

  try {
    const wordBank = await getWordBank();
    const cfg      = currentConfig;
    await Promise.all([
      generateGameAsync(
        wordBank,
        (attempt, max, done) => updateLoadingProgress(attempt, max, done),
        cfg.difficulty,
        cfg.gridSizeKey
      ).then((s: GameState) => { nextState = s; })
       .catch(() => { failed = true; }),
      new Promise<void>(resolve => setTimeout(resolve, 2000)),
    ]);
  } catch { failed = true; }

  if (failed || !nextState) { renderError(() => startNewGame()); return; }

  const resolvedState = nextState as GameState;
  update(resolvedState);
  prefetchDictChunks(resolvedState.words.map((w: Word) => w.text));
}

// ── Bootstrap — show hub first ────────────────────────────────────────────────

renderHub({
  onNewGame: () => {
    showNewTicketModal(currentConfig, newConfig => {
      hideNewTicketModal();
      currentConfig = newConfig;
      startNewGame();
    });
  },
  onHowToPlay: showHowToPlayModal,
});
