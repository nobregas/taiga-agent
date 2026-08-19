import { isReasonableNewTagName } from './acceptance-criteria.js';

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

const TAG_SYNONYM_GROUPS: string[][] = [
  ['app', 'aplicativo', 'aplicativos', 'aplicacao', 'aplicacoes', 'application', 'applications'],
  ['api', 'apis', 'endpoint', 'endpoints'],
  ['front', 'frontend', 'ui', 'web'],
  ['back', 'backend', 'server'],
  ['fullstack'],
  ['feature', 'feat', 'funcionalidade', 'funcionalidades'],
  ['fix', 'bugfix', 'hotfix', 'correcao'],
  ['teste', 'test', 'tests', 'testing', 'qa'],
  ['docs', 'doc', 'documentacao', 'documentation'],
  ['refactor', 'refatoracao'],
  ['chore', 'manutencao'],
  ['dashboard', 'painel', 'admin'],
  ['portal', 'portais'],
  ['mobile', 'android', 'ios'],
  ['pedido', 'pedidos', 'order', 'orders'],
  ['checkout'],
  ['pagamento', 'pagamentos', 'payment', 'payments'],
  ['carrinho', 'cart'],
  ['catalogo', 'catalog', 'catalogue'],
  ['usuario', 'user', 'users', 'usuarios'],
];

const SYNONYM_GROUP_BY_KEY = (() => {
  const map = new Map<string, number>();
  TAG_SYNONYM_GROUPS.forEach((group, index) => {
    for (const alias of group) {
      map.set(compactTagKey(alias), index);
    }
  });
  return map;
})();

export function flattenTagPlan(plan: StructuredTagPlan): string[] {
  return [plan.aplicacao, plan.escopo, plan.tipo, plan.dominio].map((tag) => tag.trim()).filter(Boolean);
}

export function tagPlanToTaigaTags(
  plan: StructuredTagPlan,
  customColors?: Record<string, string>,
): TagWithColor[] {
  return (Object.keys(plan) as Array<keyof StructuredTagPlan>)
    .map((category) => {
      const name = plan[category].trim();
      return {
        category,
        name,
        color:
          customColors?.[name] ??
          customColors?.[name.toLowerCase()] ??
          customColors?.[plan[category]] ??
          TAG_CATEGORY_COLORS[category],
      };
    })
    .filter((tag) => tag.name.length > 0);
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

export function normalizeTagKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' e ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function compactTagKey(value: string): string {
  return normalizeTagKey(value).replace(/\s+/g, '');
}

function singularize(key: string): string {
  if (key.endsWith('oes') && key.length > 5) {
    return `${key.slice(0, -3)}ao`;
  }
  if (key.endsWith('s') && !key.endsWith('ss') && key.length > 4) {
    return key.slice(0, -1);
  }
  return key;
}

function commonPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let index = 0;
  while (index < max && a[index] === b[index]) {
    index += 1;
  }
  return index;
}

function sameSynonymGroup(a: string, b: string): boolean {
  const left = SYNONYM_GROUP_BY_KEY.get(a);
  const right = SYNONYM_GROUP_BY_KEY.get(b);
  return left != null && right != null && left === right;
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

function scoreTagMatch(query: string, tag: string): number {
  const queryNormalized = normalizeTagKey(query);
  const tagNormalized = normalizeTagKey(tag);
  if (!queryNormalized || !tagNormalized) {
    return 0;
  }
  if (queryNormalized === tagNormalized) {
    return 100;
  }

  const queryCompact = compactTagKey(query);
  const tagCompact = compactTagKey(tag);
  if (queryCompact === tagCompact) {
    return 95;
  }

  const querySingular = singularize(queryCompact);
  const tagSingular = singularize(tagCompact);
  if (querySingular === tagSingular) {
    return 92;
  }

  if (
    sameSynonymGroup(queryCompact, tagCompact) ||
    sameSynonymGroup(querySingular, tagSingular) ||
    sameSynonymGroup(queryNormalized.replace(/\s+/g, ''), tagNormalized.replace(/\s+/g, ''))
  ) {
    return 90;
  }

  const prefix = commonPrefixLength(querySingular, tagSingular);
  const shorter = Math.min(querySingular.length, tagSingular.length);
  if (prefix >= 5 || (prefix >= 4 && shorter > 0 && prefix / shorter >= 0.7)) {
    return 70 + Math.min(20, prefix);
  }

  const maxLen = Math.max(querySingular.length, tagSingular.length);
  if (shorter >= 5 && maxLen >= 5) {
    const distance = levenshtein(querySingular, tagSingular);
    if (distance === 1 && distance / maxLen <= 0.25) {
      return 60;
    }
    if (distance === 2 && maxLen >= 7 && distance / maxLen <= 0.3) {
      return 50;
    }
  }

  return 0;
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

export function fuzzyMatchTag(name: string, existingTags: string[]): string | undefined {
  const exact = findExistingTag(name, existingTags);
  if (exact) {
    return exact;
  }

  if (!name.trim() || !existingTags.length) {
    return undefined;
  }

  let best: string | undefined;
  let bestScore = 0;
  let bestDelta = Infinity;

  for (const tag of existingTags) {
    const score = scoreTagMatch(name, tag);
    if (score < 60) {
      continue;
    }

    const delta = Math.abs(compactTagKey(tag).length - compactTagKey(name).length);
    if (score > bestScore || (score === bestScore && delta < bestDelta)) {
      best = tag;
      bestScore = score;
      bestDelta = delta;
    }
  }

  return best;
}

export function constrainToExistingTag(name: string, existingTags: string[], fallback?: string): string {
  if (!existingTags.length) {
    return name.trim();
  }

  return (
    fuzzyMatchTag(name, existingTags) ??
    (fallback ? fuzzyMatchTag(fallback, existingTags) : undefined) ??
    name.trim()
  );
}

export function resolveTagName(name: string, existingTags: string[], fallback?: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return fallback ? resolveTagName(fallback, existingTags) : (existingTags[0] ?? 'geral');
  }

  const existing = fuzzyMatchTag(trimmed, existingTags);
  if (existing) {
    return existing;
  }

  if (fallback) {
    const fallbackMatch = fuzzyMatchTag(fallback, existingTags);
    if (fallbackMatch && scoreTagMatch(trimmed, fallback) >= 90) {
      return fallbackMatch;
    }
  }

  if (!existingTags.length || isReasonableNewTagName(normalizeTagKey(trimmed))) {
    return normalizeTagKey(trimmed).replace(/\s+/g, '-');
  }

  return constrainToExistingTag(trimmed, existingTags, fallback);
}

export function resolveTagPlanAllowingNew(
  plan: StructuredTagPlan,
  existingTags: string[],
): StructuredTagPlan {
  return {
    aplicacao: resolveTagName(plan.aplicacao, existingTags, 'app'),
    escopo: resolveTagName(plan.escopo, existingTags, 'front'),
    tipo: resolveTagName(plan.tipo, existingTags, 'feature'),
    dominio: plan.dominio.trim() ? resolveTagName(plan.dominio, existingTags, 'geral') : '',
  };
}

export function constrainTagPlanToBank(
  plan: StructuredTagPlan,
  existingTags: string[],
): StructuredTagPlan {
  return resolveTagPlanAllowingNew(plan, existingTags);
}

export function buildTagStringSchema(): { type: 'string' } {
  return { type: 'string' };
}

export function preferExistingTagNames(
  plan: StructuredTagPlan,
  existingTags: string[],
): StructuredTagPlan {
  const pick = (value: string) => fuzzyMatchTag(value, existingTags) ?? value.trim();

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
    const name = plan[category].trim();
    if (!name) {
      continue;
    }

    const existingEntry = Object.entries(existingTagColors).find(
      ([tag]) => tag.toLowerCase() === name.toLowerCase(),
    );
    const generatedColor = generated?.[name] ?? generated?.[name.toLowerCase()] ?? generated?.[plan[category]];
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
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    return fuzzyMatchTag(trimmed, existingTags) ?? trimmed;
  };

  return {
    aplicacao: pick(
      plan.aplicacao,
      fuzzyMatchTag('app', existingTags) ?? fuzzyMatchTag('dashboard', existingTags) ?? 'app',
    ),
    escopo: pick(plan.escopo, fuzzyMatchTag('front', existingTags) ?? fuzzyMatchTag('back', existingTags) ?? 'front'),
    tipo: pick(plan.tipo, fuzzyMatchTag('feature', existingTags) ?? 'feature'),
    dominio: pick(plan.dominio, plan.dominio || 'geral'),
  };
}
