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
