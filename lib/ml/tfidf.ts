/**
 * TF-IDF weighting for the Cyber Sakhi ML classifier.
 *
 * Mirror of `scripts/ml/common.py` (build_vocabulary / compute_idf /
 * tfidf_vector / l2_normalize) and of scikit-learn's defaults:
 *   sublinear_tf = True   ->  tf := 1 + log(tf)
 *   smooth_idf   = True   ->  idf := log((1+n)/(1+df)) + 1
 *   norm         = l2     ->  each document vector is L2 normalized
 *
 * The artifact stores the fitted vocabulary (token -> index) and IDF
 * weights; inference only needs tfidfVector + l2Normalize.
 */

export function tfidfVector(
  tokenStream: string[],
  vocab: Record<string, number>,
  idf: Record<string, number>
): Map<number, number> {
  const counts = new Map<string, number>();
  for (const token of tokenStream) {
    if (Object.prototype.hasOwnProperty.call(vocab, token)) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }
  const vec = new Map<number, number>();
  for (const [token, c] of counts) {
    const idx = vocab[token];
    const tf = 1 + Math.log(c);
    vec.set(idx, tf * idf[token]);
  }
  return vec;
}

export function l2Normalize(
  vec: Map<number, number>
): Map<number, number> {
  let normSq = 0;
  for (const v of vec.values()) normSq += v * v;
  const norm = Math.sqrt(normSq);
  if (norm === 0) return new Map();
  const out = new Map<number, number>();
  for (const [k, v] of vec) out.set(k, v / norm);
  return out;
}