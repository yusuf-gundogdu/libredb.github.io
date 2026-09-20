/** Writing to the clipboard, and the fallback that makes it work off https.
 *
 *  Shared so the two callers — [data-copy] buttons and the code blocks in a post
 *  — cannot drift on the part that is easy to get subtly wrong. Falls back to a hidden textarea + execCommand so it
 *  still works on http:// origins where the async clipboard API is unavailable. */
export function write(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  return new Promise((resolve, reject) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      if (document.execCommand('copy')) resolve();
      else reject(new Error('copy rejected'));
    } catch (err) {
      reject(err);
    } finally {
      ta.remove();
    }
  });
}
