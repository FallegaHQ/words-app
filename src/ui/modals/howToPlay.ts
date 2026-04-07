import { createOverlay, openModal, closeModalById, bindClose } from './base';

const ID = 'htp-modal-overlay';

type Lang = 'en' | 'ar';

interface Step { icon: string; title: string; body: string; }

const STEPS: Record<Lang, Step[]> = {
  en: [
    { icon: '🃏', title: 'Scratch Your Tiles',   body: 'Tap the tiles in your hand to reveal letters. Each revealed letter unlocks matching cells on the grid.' },
    { icon: '✏️', title: 'Scratch the Grid',      body: 'Once a cell lights up (Available), tap it to scratch it off and reveal its letter.' },
    { icon: '✅', title: 'Complete Words',         body: 'Scratch every cell of a word to complete it and earn points. Completed words glow green.' },
    { icon: '⭐', title: 'Wild Cells',             body: 'Star cells can be scratched any time without needing a matching tile — great for tough spots!' },
    { icon: '🎁', title: 'Bonus Tiles',            body: 'Gift tiles in your hand can be revealed at any moment for extra letters.' },
    { icon: '🌫️', title: 'Fog of War',            body: 'Some grid cells are hidden in fog. Scratch nearby cells to reveal what\'s lurking underneath.' },
    { icon: '🍀', title: 'Lucky Draw',             body: 'After all your hand tiles are revealed, a Lucky Draw appears. Pick one bonus letter to use on the grid.' },
    { icon: '×3', title: 'Multiplier Cells',   body: '2× and 3× cells multiply the score of any word they belong to. Hunt for them!' },
    { icon: '🏆', title: 'Score & Achievements',  body: 'Earn stars based on how many words you find. Beat your high score and unlock achievements across games.' },
  ],
  ar: [
    { icon: '🃏', title: 'اكشط بلاطاتك',         body: 'اضغط على البلاطات في يدك لكشف الحروف. كل حرف مكشوف يفتح خلايا مطابقة على الشبكة.' },
    { icon: '✏️', title: 'اكشط الشبكة',           body: 'بمجرد إضاءة خلية (متاحة)، اضغط عليها لكشطها والكشف عن حرفها.' },
    { icon: '✅', title: 'أكمل الكلمات',           body: 'اكشط جميع خلايا الكلمة لإكمالها وكسب النقاط. تُضاء الكلمات المكتملة باللون الأخضر.' },
    { icon: '⭐', title: 'الخلايا البرية',         body: 'يمكن كشط خلايا النجوم في أي وقت دون الحاجة إلى بلاطة مطابقة — مفيدة جداً في المواقف الصعبة!' },
    { icon: '🎁', title: 'بلاطات المكافأة',        body: 'يمكن كشف بلاطات الهدايا في يدك في أي لحظة للحصول على حروف إضافية.' },
    { icon: '🌫️', title: 'ضباب الحرب',            body: 'بعض خلايا الشبكة مخفية في الضباب. اكشط الخلايا المجاورة للكشف عما يكمن خلفها.' },
    { icon: '🍀', title: 'السحب المحظوظ',          body: 'بعد كشف جميع بلاطات يدك، يظهر السحب المحظوظ. اختر حرفاً إضافياً واحداً لاستخدامه على الشبكة.' },
    { icon: '×2 ×3', title: 'خلايا المضاعفة',     body: 'تضاعف خلايا ×2 و ×3 نقاط أي كلمة تحتوي عليها. ابحث عنها!' },
    { icon: '🏆', title: 'النقاط والإنجازات',      body: 'اكسب النجوم بناءً على عدد الكلمات التي تجدها. تفوّق على رقمك القياسي واكسب الإنجازات عبر الألعاب.' },
  ],
};

const LABELS: Record<Lang, { title: string; toggle: string }> = {
  en: { title: 'How to Play',  toggle: 'عربي' },
  ar: { title: 'طريقة اللعب', toggle: 'English' },
};

function buildContent(lang: Lang): string {
  const { title, toggle } = LABELS[lang];
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const steps = STEPS[lang].map(s => `
    <div class="htp-step">
      <div class="htp-step-icon">${s.icon}</div>
      <div class="htp-step-text">
        <div class="htp-step-title">${s.title}</div>
        <div class="htp-step-body">${s.body}</div>
      </div>
    </div>`).join('');

  return `
    <div class="def-modal htp-modal" role="dialog" aria-modal="true" dir="${dir}">
      <div class="def-modal-header">
        <span class="def-modal-word">${title}</span>
        <div class="htp-header-actions">
          <button class="htp-lang-toggle" data-toggle-lang="${lang === 'en' ? 'ar' : 'en'}">${toggle}</button>
          <button class="def-modal-close" aria-label="Close">✕</button>
        </div>
      </div>
      <div class="def-modal-body htp-body">
        <div class="htp-steps">${steps}</div>
      </div>
    </div>`;
}

export function showHowToPlayModal(): void {
  let currentLang: Lang = 'en';

  const overlay = createOverlay(ID, buildContent(currentLang));

  function switchLang(lang: Lang) {
    currentLang = lang;
    // Swap inner modal content, keeping overlay in place
    overlay.innerHTML = buildContent(lang);
    bindModalEvents();
  }

  function bindModalEvents() {
    overlay.querySelector('.htp-lang-toggle')!.addEventListener('click', e => {
      const target = (e.currentTarget as HTMLElement).dataset.toggleLang as Lang;
      switchLang(target);
    });
    bindClose(overlay, hideHowToPlayModal);
  }

  bindModalEvents();
  openModal(overlay);
}

export function hideHowToPlayModal(): void { closeModalById(ID); }
