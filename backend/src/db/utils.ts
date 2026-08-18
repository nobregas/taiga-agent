export function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function stringifyJsonArray(values: string[] | undefined | null): string | null {
  if (!values?.length) {
    return null;
  }

  return JSON.stringify(values);
}

export function maskSecret(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  if (value.length <= 4) {
    return '••••';
  }

  return `••••${value.slice(-4)}`;
}
