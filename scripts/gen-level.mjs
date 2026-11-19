#!/usr/bin/env node
/**
 * Generate a new validated STARBURST YAML level using the home-lab INFINITY LLM!
 * Usage: npm run gen-level -- "04 // Emerald Void — toxic green & gold asteroid run"
 */
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const promptArg = process.argv.slice(2).join(' ').trim();
if (!promptArg) {
  console.error('Usage: npm run gen-level -- "04 // Emerald Void — toxic green & gold asteroid run"');
  process.exit(1);
}

const LLM_URL = process.env.INFINITY_URL || 'http://192.168.1.99:8080/v1/chat/completions';
const systemPrompt = fs.readFileSync(path.resolve('LEVEL_GEN_PROMPT.md'), 'utf8');

console.log(`[GEN] Asking INFINITY (${LLM_URL}) to design: "${promptArg}"...`);

const res = await fetch(LLM_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'local',
    temperature: 0.7,
    max_tokens: 4096,
    chat_template_kwargs: { enable_thinking: false },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Create a balanced 28-36 event YAML level for: ${promptArg}` },
    ],
  }),
});

if (!res.ok) {
  console.error(`LLM request failed: HTTP ${res.status}`, await res.text());
  process.exit(1);
}

const json = await res.json();
const raw = json?.choices?.[0]?.message?.content || '';
const match = raw.match(/```yaml\s*([\s\S]*?)```/i);
const yamlText = (match ? match[1] : raw).trim();

const parsed = yaml.load(yamlText);
if (!parsed || typeof parsed !== 'object' || !parsed.id) {
  console.error('Generated output was not valid level YAML:\n', yamlText);
  process.exit(1);
}

const outFile = path.resolve(`src/levels/data/level-custom-${parsed.id}.yaml`);
fs.writeFileSync(outFile, yamlText + '\n', 'utf8');
console.log(`[GEN] Saved new level to ${outFile}`);
console.log('[GEN] Restart or reload the game — Vite will auto-register it in Level Select!');
