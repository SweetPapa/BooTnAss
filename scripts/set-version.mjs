#!/usr/bin/env node
/**
 * Syncs version X.Y.Z across package.json, src-tauri/tauri.conf.json, and src-tauri/Cargo.toml.
 */
import fs from 'node:fs';
import path from 'node:path';

const raw = process.argv[2];
if (!raw) {
  console.error('Usage: node scripts/set-version.mjs <X.Y.Z>');
  process.exit(1);
}
const version = raw.replace(/^v/, '');

// 1. package.json
const pkgPath = path.resolve('package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.version = version;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// 2. src-tauri/tauri.conf.json
const tauriPath = path.resolve('src-tauri/tauri.conf.json');
const tauri = JSON.parse(fs.readFileSync(tauriPath, 'utf8'));
tauri.version = version;
fs.writeFileSync(tauriPath, JSON.stringify(tauri, null, 2) + '\n');

// 3. src-tauri/Cargo.toml
const cargoPath = path.resolve('src-tauri/Cargo.toml');
let cargo = fs.readFileSync(cargoPath, 'utf8');
cargo = cargo.replace(/^version\s*=\s*"[^"]*"/m, `version = "${version}"`);
fs.writeFileSync(cargoPath, cargo);

console.log(`[set-version] Synced version to ${version}`);
