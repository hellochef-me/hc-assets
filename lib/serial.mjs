/** Exact identity retains punctuation; approximate matches require human review. */
export const serialIdentity = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

/** Catch a missing, extra, mistyped or transposed OCR character, never auto-merge. */
export function similarSerial(left, right) {
  const a = serialIdentity(left).replace(/[\s-]/g, "");
  const b = serialIdentity(right).replace(/[\s-]/g, "");
  if (Math.min(a.length, b.length) < 6 || Math.abs(a.length - b.length) > 1)
    return false;
  if (a === b) return true;
  if (a.length === b.length) {
    const differences = [];
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) differences.push(i);
    if (differences.length === 1) return true;
    const [i, j] = differences;
    return (
      differences.length === 2 && j === i + 1 && a[i] === b[j] && a[j] === b[i]
    );
  }
  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;
  let i = 0;
  while (i < shorter.length && shorter[i] === longer[i]) i++;
  return shorter.slice(i) === longer.slice(i + 1);
}
