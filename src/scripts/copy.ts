/** Copy-to-clipboard buttons: writes [data-copy], then shows "copied" for 1.6s
 *  (the prototype's timing). */
import { write } from './clipboard';

for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-copy]')) {
  const idle = btn.textContent ?? 'copy';
  const idleLabel = btn.getAttribute('aria-label') ?? idle;
  /* A [data-copy-flash] button IS the value — a grid cell holding the credential,
     not a button labelled "copy". Overwriting its text with "copied" would blank
     the thing the reader came for, so it keeps its text and takes a class instead;
     the component paints the confirmation. */
  const flash = btn.hasAttribute('data-copy-flash');
  let timer: number | undefined;

  btn.addEventListener('click', async () => {
    const text = btn.dataset.copy ?? '';
    let ok = true;
    try {
      await write(text);
    } catch {
      ok = false;
    }
    if (flash) {
      btn.classList.add(ok ? 'is-copied' : 'is-copyfailed');
      btn.setAttribute('aria-label', ok ? `Copied ${text}` : `Copy failed — select ${text} and press Command C`);
    } else {
      btn.textContent = ok ? 'copied' : 'press ⌘C';
      btn.setAttribute(
        'aria-label',
        ok ? 'Copied to clipboard' : 'Copy failed — select the command and press Command C',
      );
    }
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      btn.classList.remove('is-copied', 'is-copyfailed');
      if (!flash) btn.textContent = idle;
      btn.setAttribute('aria-label', idleLabel);
    }, 1600);
  });
}
