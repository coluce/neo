'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spellPortuguese } = require('../spell-pt-br');

async function run() {
  const dictionaryPath = path.join(__dirname, '..', 'dict', 'pt_BR.trie.gz');
  const issues = await spellPortuguese(
    'biblioteca português capítulo tradução ação bibliotca',
    dictionaryPath,
    [],
    true
  );
  assert.deepEqual(issues.map((issue) => issue.text), ['bibliotca']);
  assert.ok(issues[0].suggestions.includes('biblioteca'));

  const learned = await spellPortuguese('meuNeologismo', dictionaryPath, ['meuNeologismo']);
  assert.deepEqual(learned, []);
  console.log('pt-BR spellcheck tests passed');
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
