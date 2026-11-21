/**
 * MathUtils — Pure mathematical helpers used across simulation and UI layers.
 */

export function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function lerp(start, end, t) {
  return start + (end - start) * clamp(t, 0, 1);
}

export function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

export function formatNumber(value) {
  if (!Number.isFinite(value)) return '0';
  return Math.floor(value).toLocaleString('en-US');
}

export function pickWeighted(entries, rng = Math.random) {
  const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
  if (total <= 0) return entries[0]?.value ?? null;
  let roll = rng() * total;
  for (const entry of entries) {
    roll -= Math.max(0, entry.weight);
    if (roll <= 0) return entry.value;
  }
  return entries[entries.length - 1]?.value ?? null;
}
