import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { runtimeConfig } from '../services/runtime-config.service.js';

export interface UsTaskTemplate {
  us: {
    subject_format: string;
    description_template: string;
    branch: { prefixes: string[]; default_prefix: string };
    contexto_rules?: string;
  };
  tags: {
    structure: Record<string, string[]>;
    rules?: string;
  };
  task: {
    language: string;
    domain_examples?: string[];
    few_shot: string[];
  };
  few_shot_example: {
    us: { subject: string; branch: string; contexto?: string };
    tagPlan: { aplicacao: string; escopo: string; tipo: string; dominio: string };
    tagColors?: Record<string, string>;
  };
}

let cachedTemplate: UsTaskTemplate | null = null;

export function loadTemplate(): UsTaskTemplate {
  if (cachedTemplate) {
    return cachedTemplate;
  }

  const templatePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../prompts/us-task-template.yaml',
  );
  const content = fs.readFileSync(templatePath, 'utf8');
  cachedTemplate = YAML.parse(content) as UsTaskTemplate;
  return cachedTemplate;
}

export function buildSystemPrompt(existingTags: string[], codebaseId?: number | null): string {
  const template = loadTemplate();
  const configuredDomains = runtimeConfig.getValidTaskDomains(codebaseId);
  const domains = configuredDomains.length
    ? configuredDomains.join(', ')
    : (template.task.domain_examples ?? ['Pedido', 'Checkout', 'Pagamento']).join(', ');

  const prefixes = template.us.branch.prefixes.join(', ');
  const tagStructure = Object.entries(template.tags.structure)
    .map(([key, values]) => `- ${key}: ${values.join(', ')}`)
    .join('\n');

  const closedTagBank = existingTags.map((tag) => tag.trim()).filter(Boolean);
  const tagsSection =
    closedTagBank.length > 0
      ? `## Tags (lista fechada)
Gere tagPlan com 4 campos (aplicacao, escopo, tipo, dominio).
Slots:
${tagStructure}

BANCO DO PROJETO (unicos nomes permitidos): ${closedTagBank.join(',')}
Regras:
- Escolha SOMENTE nomes deste banco, copiados exatamente
- Se nenhum servir, escolha o mais proximo do banco
- NUNCA invente tag nova, NUNCA traduza, NUNCA crie sinonimo
- tags = os 4 nomes escolhidos na ordem dos slots
- Nao envie tagColors; o sistema reutiliza as cores do Taiga`
      : `## Tags estruturadas (obrigatorio)
Gere tagPlan com 4 campos:
${tagStructure}

${template.tags.rules ?? ''}
Projeto sem tags cadastradas — defina tagPlan e tagColors (hex) para cada tag.
- tags (array) deve listar as 4 tags na ordem: aplicacao, escopo, tipo, dominio`;

  return `Voce e um assistente que gera User Stories e Tasks para o Taiga seguindo o padrao do time.

## User Story
- Subject: ${template.us.subject_format}
- Descricao com secoes exatas:
${template.us.description_template}

### Campo "contexto"
${template.us.contexto_rules ?? 'Texto enxuto sobre o estado atual do app.'}
- contextoGeral = briefing do usuario — NAO copiar para contexto
- contexto = resumo curto do estado atual do produto

### Branch
- Prefixos validos: ${prefixes}
- Escolha o prefixo adequado (nao force feat se for fix/chore/hotfix)
- Formato: prefixo/slug-kebab-case

## Tasks
- Linguagem: ${template.task.language}
- Prefixo por DOMINIO de negocio — nunca o escopo da US ([App], [Backend])
- Dominios validos: ${domains}
- Nao precisa incluir "Subir PR" nem "Merge"; o sistema acrescenta no fim
- Exemplos:
${template.task.few_shot.map((item) => `  - ${item}`).join('\n')}

${tagsSection}

## Exemplo
US: ${template.few_shot_example.us.subject}
Branch: ${template.few_shot_example.us.branch}
Contexto: ${template.few_shot_example.us.contexto ?? 'Estado atual resumido.'}

Responda APENAS JSON valido. Campos obrigatorios: escopo, titulo, contextoGeral, contexto, objetivo, criteriosAceite, branch, tagPlan, tags, tasks.`;
}
