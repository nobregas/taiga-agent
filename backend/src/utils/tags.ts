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

export function mergeTagPlanIntoExisting(
  plan: StructuredTagPlan,
  existingTags: string[],
): StructuredTagPlan {
  const lower = new Set(existingTags.map((tag) => tag.toLowerCase()));
  const pick = (value: string, fallback: string) => {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return fallback;
    const match = existingTags.find((tag) => tag.toLowerCase() === normalized);
    return match ?? normalized;
  };

  return {
    aplicacao: pick(plan.aplicacao, existingTags.find((t) => ['app', 'dashboard'].includes(t.toLowerCase())) ?? 'app'),
    escopo: pick(plan.escopo, existingTags.find((t) => ['front', 'back', 'backend', 'frontend'].includes(t.toLowerCase())) ?? 'front'),
    tipo: pick(plan.tipo, existingTags.find((t) => ['feature', 'fix', 'teste'].includes(t.toLowerCase())) ?? 'feature'),
    dominio: pick(plan.dominio, plan.dominio || 'geral'),
  };
}
