export interface StructuredTagPlan {
  aplicacao: string;
  escopo: string;
  tipo: string;
  dominio: string;
}

export interface TagWithColor {
  name: string;
  color: string;
  category: keyof StructuredTagPlan;
}

export const TAG_CATEGORY_COLORS: Record<keyof StructuredTagPlan, string> = {
  aplicacao: '#2563EB',
  escopo: '#525252',
  tipo: '#059669',
  dominio: '#D97706',
};

export const TAG_CATEGORY_LABELS: Record<keyof StructuredTagPlan, string> = {
  aplicacao: 'Aplicacao',
  escopo: 'Escopo',
  tipo: 'Tipo',
  dominio: 'Dominio',
};

export function flattenTagPlan(plan: StructuredTagPlan): string[] {
  return [plan.aplicacao, plan.escopo, plan.tipo, plan.dominio]
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
}

export function tagPlanToTaigaTags(
  plan: StructuredTagPlan,
  customColors?: Record<string, string>,
): TagWithColor[] {
  return (Object.keys(plan) as Array<keyof StructuredTagPlan>).map((category) => {
    const name = plan[category].trim().toLowerCase();
    return {
      category,
      name,
      color: customColors?.[name] ?? customColors?.[plan[category]] ?? TAG_CATEGORY_COLORS[category],
    };
  });
}

export function normalizeHexColor(color: string | null | undefined): string | null {
  if (!color) {
    return null;
  }

  const value = color.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(value)) {
    return value.toUpperCase();
  }

  if (/^#[0-9a-fA-F]{3}$/.test(value)) {
    const [, r, g, b] = value;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }

  return value;
}

export function findExistingTag(name: string, existingTags: string[]): string | undefined {
  const normalized = name.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  return existingTags.find((tag) => tag.toLowerCase() === normalized);
}

export function compactTagBank(existingTags: string[]): string {
  return existingTags.map((tag) => tag.trim()).filter(Boolean).join(',');
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const row = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = current;
    }
  }

  return row[b.length];
}

export function fuzzyMatchTag(name: string, existingTags: string[]): string | undefined {
  const exact = findExistingTag(name, existingTags);
  if (exact) {
    return exact;
  }

  const normalized = name.trim().toLowerCase();
  if (!normalized || !existingTags.length) {
    return undefined;
  }

  const startsWith = existingTags.find((tag) => {
    const value = tag.toLowerCase();
    return value.startsWith(normalized) || normalized.startsWith(value);
  });
  if (startsWith) {
    return startsWith;
  }

  const contained = existingTags.find((tag) => {
    const value = tag.toLowerCase();
    return value.includes(normalized) || normalized.includes(value);
  });
  if (contained && Math.abs(contained.length - normalized.length) <= 4) {
    return contained;
  }

  let best: string | undefined;
  let bestDistance = Infinity;

  for (const tag of existingTags) {
    const distance = levenshtein(normalized, tag.toLowerCase());
    const maxLen = Math.max(normalized.length, tag.length);
    if (distance < bestDistance && distance <= 2 && distance / maxLen <= 0.45) {
      bestDistance = distance;
      best = tag;
    }
  }

  return best;
}

export function constrainToExistingTag(name: string, existingTags: string[], fallback?: string): string {
  if (!existingTags.length) {
    return name.trim().toLowerCase();
  }

  return (
    fuzzyMatchTag(name, existingTags) ??
    (fallback ? fuzzyMatchTag(fallback, existingTags) : undefined) ??
    existingTags[0]
  );
}

export function constrainTagPlanToBank(
  plan: StructuredTagPlan,
  existingTags: string[],
): StructuredTagPlan {
  if (!existingTags.length) {
    return {
      aplicacao: plan.aplicacao.trim().toLowerCase(),
      escopo: plan.escopo.trim().toLowerCase(),
      tipo: plan.tipo.trim().toLowerCase(),
      dominio: plan.dominio.trim().toLowerCase(),
    };
  }

  return {
    aplicacao: constrainToExistingTag(plan.aplicacao, existingTags, 'app'),
    escopo: constrainToExistingTag(plan.escopo, existingTags, 'front'),
    tipo: constrainToExistingTag(plan.tipo, existingTags, 'feature'),
    dominio: constrainToExistingTag(plan.dominio, existingTags, 'geral'),
  };
}

export function buildTagEnumSchema(existingTags: string[]): { type: 'string'; enum: string[] } | { type: 'string' } {
  const unique = [...new Set(existingTags.map((tag) => tag.trim()).filter(Boolean))];
  if (unique.length === 0 || unique.length > 180) {
    return { type: 'string' };
  }

  return { type: 'string', enum: unique };
}

export function preferExistingTagNames(
  plan: StructuredTagPlan,
  existingTags: string[],
): StructuredTagPlan {
  const pick = (value: string) => findExistingTag(value, existingTags) ?? value.trim().toLowerCase();

  return {
    aplicacao: pick(plan.aplicacao),
    escopo: pick(plan.escopo),
    tipo: pick(plan.tipo),
    dominio: pick(plan.dominio),
  };
}

export function mergeTagColors(
  plan: StructuredTagPlan,
  generated: Record<string, string> | undefined,
  existingTagColors: Record<string, string | null>,
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const category of Object.keys(plan) as Array<keyof StructuredTagPlan>) {
    const name = plan[category].trim().toLowerCase();
    if (!name) {
      continue;
    }

    const existingEntry = Object.entries(existingTagColors).find(
      ([tag]) => tag.toLowerCase() === name,
    );
    const generatedColor = generated?.[name] ?? generated?.[plan[category]];
    result[name] =
      normalizeHexColor(existingEntry?.[1]) ??
      normalizeHexColor(generatedColor) ??
      TAG_CATEGORY_COLORS[category];
  }

  return result;
}

export function mergeTagPlanIntoExisting(
  plan: StructuredTagPlan,
  existingTags: string[],
): StructuredTagPlan {
  const pick = (value: string, fallback: string) => {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return fallback;
    return findExistingTag(value, existingTags) ?? normalized;
  };

  return {
    aplicacao: pick(plan.aplicacao, findExistingTag('app', existingTags) ?? findExistingTag('dashboard', existingTags) ?? 'app'),
    escopo: pick(plan.escopo, findExistingTag('front', existingTags) ?? findExistingTag('back', existingTags) ?? 'front'),
    tipo: pick(plan.tipo, findExistingTag('feature', existingTags) ?? 'feature'),
    dominio: pick(plan.dominio, plan.dominio || 'geral'),
  };
}
