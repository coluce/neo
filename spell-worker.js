// NEO's spellchecker, in its own process. Parsing a Hunspell dictionary
// takes from a quarter second (English) to several seconds (French); done
// here, the writing room never feels it. main.js forks this with Electron's
// utilityProcess and talks to it with plain messages.
'use strict';

const fs = require('fs');
const path = require('path');
const nspell = require('nspell');
const { spellPortuguese } = require('./spell-pt-br');
const { prepareRomanianDictionary, normalizeRomanianWord } = require('./spell-ro');

let spell = null;
let ptBrDictionaryPath = null;
let learnedWords = new Set();
let normalizeWord = (word) => word;

function reply(msg, extra) {
  process.parentPort.postMessage({ id: msg.id, ...extra });
}

async function handleMessage(msg) {
  try {
    if (msg.type === 'load') {
      learnedWords = new Set(msg.custom || []);
      if (msg.locale === 'pt-BR') {
        ptBrDictionaryPath = msg.dictionaryPath;
        spell = null;
        await spellPortuguese('biblioteca', ptBrDictionaryPath, learnedWords);
        reply(msg, { ok: true });
        return;
      }

      ptBrDictionaryPath = null;
      const dict = {
        aff: fs.readFileSync(path.join(msg.dir, 'index.aff')),
        dic: fs.readFileSync(path.join(msg.dir, 'index.dic'))
      };
      const romanian = msg.language === 'ro';
      const normalize = romanian ? normalizeRomanianWord : (word) => word;
      const next = nspell(romanian ? prepareRomanianDictionary(dict) : dict);
      for (const w of msg.custom || []) next.add(normalize(w));
      for (const w of learnedWords) next.add(w);
      spell = next;
      normalizeWord = normalize;
      reply(msg, { ok: true });
      spell = next;
      normalizeWord = normalize;
      reply(msg, { ok: true });
    } else if (msg.type === 'check') {
      const out = {};
      if (ptBrDictionaryPath) {
        const issues = await spellPortuguese((msg.words || []).join('\n'), ptBrDictionaryPath, learnedWords);
        const incorrect = new Set(issues.map((issue) => String(issue.text).toLowerCase()));
        for (const word of msg.words || []) out[word] = !incorrect.has(String(word).toLowerCase());
        reply(msg, { ok: true, result: out });
        return;
      }
      // dictionary still loading: report everything correct rather than crying wolf
      for (const w of msg.words || []) out[w] = spell ? spell.correct(normalizeWord(w)) : true;
      reply(msg, { ok: true, result: out });
    } else if (msg.type === 'suggest') {
      if (ptBrDictionaryPath) {
        const issues = await spellPortuguese(String(msg.word || ''), ptBrDictionaryPath, learnedWords, true);
        reply(msg, { ok: true, result: issues[0] ? (issues[0].suggestions || []).slice(0, 6) : [] });
        return;
      }
      reply(msg, { ok: true, result: spell ? spell.suggest(normalizeWord(msg.word)).slice(0, 6) : [] });
    } else if (msg.type === 'add') {
      if (typeof msg.word === 'string') learnedWords.add(String(msg.word).toLowerCase());
      if (spell && typeof msg.word === 'string') spell.add(normalizeWord(msg.word));
      reply(msg, { ok: true });
    } else {
      reply(msg, { ok: false, error: 'unknown message' });
    }
  } catch (err) {
    reply(msg, { ok: false, error: String(err && err.stack || err) });
  }
}

let queue = Promise.resolve();
process.parentPort.on('message', (e) => {
  const msg = e.data || {};
  queue = queue.then(() => handleMessage(msg));
});
