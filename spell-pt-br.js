'use strict';

async function spellPortuguese(text, dictionaryPath, customWords = [], generateSuggestions = false) {
  if (!dictionaryPath) throw new Error('Portuguese dictionary path is not configured');

  const { spellCheckDocument } = await import('cspell-lib');
  const language = 'pt, pt_BR';
  const result = await spellCheckDocument(
    { uri: 'neo-spellcheck.txt', text, languageId: 'plaintext', locale: language },
    { noConfigSearch: true, generateSuggestions },
    {
      language,
      words: [...customWords],
      dictionaries: ['pt-br'],
      dictionaryDefinitions: [{
        name: 'pt-br',
        path: dictionaryPath,
        description: 'Dicionário VERO de Português do Brasil'
      }]
    }
  );

  if (result.dictionaryErrors && result.dictionaryErrors.size) {
    const errors = [...result.dictionaryErrors.values()].flat().map((err) => err.message);
    throw new Error(errors.join('; ') || 'Could not load spell dictionary');
  }

  return result.issues;
}

module.exports = { spellPortuguese };
