import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  fuzzyMatchTag,
  resolveTagName,
  resolveTagPlanAllowingNew,
  tagPlanToTaigaTags,
} from './tags.js';

const bank = ['aplicativo', 'frontend', 'feature', 'pedido', 'API'];

test('maps app to existing aplicativo instead of creating app', () => {
  assert.equal(fuzzyMatchTag('app', bank), 'aplicativo');
  assert.equal(resolveTagName('app', bank), 'aplicativo');
});

test('preserves original casing and spelling of the existing tag', () => {
  assert.equal(fuzzyMatchTag('api', bank), 'API');
  assert.equal(resolveTagName('API', ['aplicativo', 'API']), 'API');
});

test('maps common abbreviations and synonyms onto existing tags', () => {
  assert.equal(fuzzyMatchTag('front', ['frontend', 'backend']), 'frontend');
  assert.equal(fuzzyMatchTag('front-end', ['frontend']), 'frontend');
  assert.equal(fuzzyMatchTag('aplicacao', ['aplicativo']), 'aplicativo');
  assert.equal(fuzzyMatchTag('pedidos', ['pedido']), 'pedido');
});

test('does not map api onto aplicativo', () => {
  assert.equal(fuzzyMatchTag('api', ['aplicativo', 'pedido']), undefined);
});

test('does not treat app as a typo of api', () => {
  assert.equal(fuzzyMatchTag('app', ['API']), undefined);
  assert.equal(resolveTagName('app', ['API']), 'app');
});

test('resolves a full tag plan onto existing project tags', () => {
  const resolved = resolveTagPlanAllowingNew(
    { aplicacao: 'app', escopo: 'front', tipo: 'feat', dominio: 'pedidos' },
    bank,
  );

  assert.deepEqual(resolved, {
    aplicacao: 'aplicativo',
    escopo: 'frontend',
    tipo: 'feature',
    dominio: 'pedido',
  });
});

test('does not invent a near-duplicate when a close existing tag covers the concept', () => {
  const name = resolveTagName('aplicativos', ['aplicativo', 'dashboard']);
  assert.equal(name, 'aplicativo');
  assert.notEqual(name, 'aplicativos');
});

test('keeps the existing tag string when sending to Taiga', () => {
  const tags = tagPlanToTaigaTags(
    { aplicacao: 'aplicativo', escopo: 'frontend', tipo: 'feature', dominio: '' },
    {},
  );
  assert.equal(tags[0]?.name, 'aplicativo');
});
