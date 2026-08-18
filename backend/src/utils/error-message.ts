export function formatErrorMessage(error: unknown, fallback = 'Unexpected error'): string {
  if (!(error instanceof Error)) {
    return fallback;
  }

  const parts: string[] = [];
  const seen = new Set<Error>();
  let current: unknown = error;

  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    if (current.message && !parts.includes(current.message)) {
      parts.push(current.message);
    }
    current = current.cause;
  }

  return parts.join(': ') || fallback;
}
