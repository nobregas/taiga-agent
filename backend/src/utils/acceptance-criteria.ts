export function parseAcceptanceCriteria(value: string | string[] | null | undefined): string[] {
  if (value == null) {
    return [];
  }

  const lines = Array.isArray(value) ? value : value.split(/\r?\n/);
  return lines
    .map((line) => line.replace(/^\s*[-*]\s+/, '').replace(/^\s*[-*]\s*$/, '').trim())
    .filter(Boolean);
}

export function formatAcceptanceCriteria(value: string | string[] | null | undefined): string {
  const items = parseAcceptanceCriteria(value);
  return items.map((item) => `- ${item}`).join('\n');
}

export function isReasonableNewTagName(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  if (normalized.length < 2 || normalized.length > 28) {
    return false;
  }

  const dashed = normalized.replace(/\s+/g, '-');
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(dashed)) {
    return false;
  }

  return dashed.split('-').filter(Boolean).length <= 3;
}
