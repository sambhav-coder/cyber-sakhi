/**
 * Text normalization + tokenization for the Cyber Sakhi ML classifier.
 *
 * This is the TypeScript mirror of `scripts/ml/common.py`. The two MUST
 * produce identical output for the same input:
 *
 *   normalizeEmailText  <->  normalize_email_text
 *   tokenize            <->  tokenize
 *
 * Order of operations in normalizeEmailText (do not reorder):
 *   1. URL        -> " __url__ "
 *   2. email      -> " __email__ "
 *   3. phone-run  -> " __phone__ "
 *   4. number-run -> " __num__ "
 *   5. lowercase
 *
 * Separator characters are whitespace + ASCII punctuation; underscore is a
 * word character so placeholder tokens (__url__, __email__, ...) survive
 * tokenization. Words shorter than 2 characters are dropped; a bigram is
 * never formed when either word is a __placeholder__ token.
 *
 * Known, documented deviation: Python's `re` treats Unicode letters as word
 * characters for `\b`, while JS `\b` is ASCII-only. E-mail/URL detection is
 * overwhelmingly ASCII, so the practical impact is negligible; the fixture
 * parity tests (tests/ml/tokenizer.test.ts) assert byte-identical output for
 * the representative cases we care about.
 */

export const URL_RE =
  /[a-zA-Z][a-zA-Z0-9+.-]*:\/\/\S+|\bwww\.[a-zA-Z0-9.-]+\.[a-z]{2,}\S*/g;
export const EMAIL_RE =
  /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;
export const PHONE_RE = /(?:\+?[\d][\s.-]*)?[6-9][\d]{9}(?!\d)/g;
export const NUM_RE = /[\d][\d.,]*/g;

export const SEPARATOR_RE =
  /[\s!"#$%&'()*+,./:;<=>?@\\^`{|}~\-]+/;

export function normalizeEmailText(text: string | null | undefined): string {
  if (text == null) return "";
  let t = String(text);
  t = t.replace(URL_RE, " __url__ ");
  t = t.replace(EMAIL_RE, " __email__ ");
  t = t.replace(PHONE_RE, " __phone__ ");
  t = t.replace(NUM_RE, " __num__ ");
  return t.toLowerCase();
}

export const isPlaceholder = (token: string): boolean =>
  token.startsWith("__");

export function tokenize(featureText: string): string[] {
  const words = featureText.split(SEPARATOR_RE).filter((w) => w.length > 0);
  const tokens: string[] = [];
  let prev: string | null = null;
  for (const w of words) {
    if (w.length < 2) {
      prev = null;
      continue;
    }
    tokens.push(w);
    if (prev !== null && !(isPlaceholder(prev) || isPlaceholder(w))) {
      tokens.push(`${prev} ${w}`);
    }
    prev = w;
  }
  return tokens;
}