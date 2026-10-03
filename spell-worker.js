// NEO's spellchecker, in its own process. main.js forks this with
// Electron's utilityProcess and talks to it with plain messages: load,
// check, suggest, add.
//
// The engine is Hunspell itself (the checker LibreOffice uses), compiled to
// WebAssembly. It reads the same .aff/.dic files as-is and applies the affix
// rules on lookup instead of expanding every word form into memory up front,
// so even the big dictionaries (French, Portuguese) load in well under a
// second. See licenses/hunspell for its license and source.
'use strict';

const fs = require('fs');
const path = require('path');
const fs = require('fs');
const path = require('path');
const nspell = require('nspell');
const { loadModule } = require('@farscrl/hunspell-wasm');
const { spellPortuguese } = require('./spell-pt-br');
const { prepareRomanianDictionary, normalizeRomanianWord } = require('./spell-ro');

let factory = null;       // the WebAssembly module, loaded once
let spell = null;         // { hunspell, files } for the current language
let ptBrDictionaryPath = null;
let learnedWords = new Set();
let normalizeWord = (word) => word;
let mounts = 0;
let normalizeWord = (word) => word;
let mounts = 0;

function reply(msg, extra) {
  process.parentPort.postMessage({ id: msg.id, ...extra });
}

function correct(word) {
  if (!word) return true;
  if (ptBrDictionaryPath) return false;
  if (!spell) return true;
  return spell.hunspell.spell(normalizeWord(word));
}

async function load(msg) {
  if (!factory) factory = await loadModule();

  if (msg.language === 'pt-BR') {
    ptBrDictionaryPath = msg.dictionaryPath;
    spell = null;
    learnedWords = new Set(msg.custom || []);
    await spellPortuguese('biblioteca', ptBrDictionaryPath, learnedWords);
    return;
  }

  ptBrDictionaryPath = null;
  const aff = fs.readFileSync(path.join(msg.dir, 'index.aff'));
  const dic = fs.readFileSync(path.join(msg.dir, 'index.dic'));
  const romanian = msg.language === 'ro';
  const normalize = romanian ? normalizeRomanianWord : (word) => word;
  const n = ++mounts;
  const files = [
    factory.mountBuffer(aff, `neo-${n}.aff`),
    factory.mountBuffer(dic, `neo-${n}.dic`)
  ];
  let hunspell;
  try {
    hunspell = factory.create(files[0], files[1]);
  } catch (err) {
    for (const f of files) { try { factory.unmount(f); } catch { /* gone */ } }
    throw err;
  }
  const old = spell;
  spell = { hunspell, files };
  normalizeWord = normalize;
  if (old) {
    try { old.hunspell.dispose(); } catch { /* freed */ }
    for (const f of old.files) { try { factory.unmount(f); } catch { /* gone */ } }
  }
}

async function handle(msg) {
  try {
    if (msg.type === 'load') {
      await load(msg);
      reply(msg, { ok: true });
    } else if (msg.type === 'check') {
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
      for (const w of msg.words || []) out[w] = correct(w);
      reply(msg, { ok: true, result: out });
    } else if (msg.type === 'suggest') {
      const out = {};
      for (const w of msg.words || []) out[w] = correct(w);
      reply(msg, { ok: true, result: out });
    } else if (msg.type === 'suggest') {
      if (ptBrDictionaryPath) {
        const issues = await spellPortuguese(String(msg.word || ''), ptBrDictionaryPath, learnedWords, true);
        reply(msg, { ok: true, result: issues[0] ? (issues[0].suggestions || []).slice(0, 6) : [] });
        return;
      }
      reply(msg, { ok: true, result: spell && msg.word ? spell.hunspell.suggest(normalizeWord(msg.word)).slice(0, 6) : [] });
    } else if (msg.type === 'add') {
      if (spell && typeof msg.word === 'string' && msg.word) spell.hunspell.addWord(normalizeWord(msg.word));
      if (typeof msg.word === 'string') learnedWords.add(String(msg.word).toLowerCase());
      reply(msg, { ok: true });
    } else {
      reply(msg, { ok: false, error: 'unknown message' });
      reply(msg, { ok: true });
    } else {
      reply(msg, { ok: false, error: 'unknown message' });
    }
  } catch (err) {
    reply(msg, { ok: false, error: String(err && err.stack || err) });
  }
}

// One message at a time, in the order they came: a check sent after a load
// is answered by the new dictionary, never by a half-loaded one.
let queue = Promise.resolve();
process.parentPort.on('message', (e) => {
  const msg = e.data || {};
  queue = queue.then(() => handle(msg));
});
});
