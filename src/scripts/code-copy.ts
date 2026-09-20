/**
 * A copy button on every code block in a post.
 *
 * 87 of the 104 posts carry code — connection strings, compose fragments, SQL —
 * and the whole point of publishing them is that someone runs them. Selecting a
 * multi-line block by hand is the one part of that the page controlled and was
 * not helping with.
 *
 * The button is injected at runtime rather than rendered into the markup: the
 * alternative is a `data-copy` attribute holding a second copy of every block,
 * which would roughly double the weight of a code-heavy page to save a few
 * lines of script. The text is read from the DOM at click time, so it is by
 * definition the code the reader is looking at.
 *
 * With JavaScript off the blocks render exactly as before — this adds an
 * affordance, it does not carry the content.
 */
import { write } from './clipboard';

const IDLE = 'copy';
const RESET_MS = 1600;

for (const pre of document.querySelectorAll<HTMLPreElement>('.post__body pre')) {
  // Shiki nests <code> inside <pre>; either way textContent is the source.
  const source = pre.textContent ?? '';
  if (!source.trim()) continue;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'codecopy';
  btn.textContent = IDLE;
  btn.setAttribute('aria-label', 'Copy this code block');

  // The button is positioned against the <pre>; a wrapper would change the
  // prose flow and the margins the stylesheet sets on sibling blocks.
  pre.classList.add('has-codecopy');
  pre.append(btn);

  let timer: number | undefined;
  btn.addEventListener('click', async () => {
    let ok = true;
    try {
      await write(source);
    } catch {
      ok = false;
    }
    btn.textContent = ok ? 'copied' : 'press ⌘C';
    btn.setAttribute('aria-label', ok ? 'Copied to clipboard' : 'Copy failed — select the code and press Command C');
    btn.classList.toggle('is-copied', ok);
    btn.classList.toggle('is-copyfailed', !ok);

    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      btn.textContent = IDLE;
      btn.setAttribute('aria-label', 'Copy this code block');
      btn.classList.remove('is-copied', 'is-copyfailed');
    }, RESET_MS);
  });
}
