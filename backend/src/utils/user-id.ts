/**
 * Normalizes a candidate Taiga user id.
 *
 * Taiga (Django) primary keys start at 1, so `0`, negative numbers, `NaN` and
 * anything non-finite can never refer to a real user. Treat all of those the
 * same as "no id" (`null`) so callers never accidentally forward them to the
 * Taiga API as `assigned_to`, which would fail with something like
 * `Invalid pk "0" - object does not exist.`
 */
export function toValidUserId(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.trunc(parsed);
}

/**
 * Same normalization as {@link toValidUserId}, but preserves `undefined` as-is.
 *
 * Useful for PATCH-style payloads where `undefined` means "leave the field
 * untouched" while `null`/an invalid number means "no assignee" — collapsing
 * `undefined` into `null` in those cases would turn a no-op into an explicit
 * unassign.
 */
export function sanitizeAssignedTo(value: number | null | undefined): number | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  return toValidUserId(value);
}
