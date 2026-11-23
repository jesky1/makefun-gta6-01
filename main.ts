// Caldera Heat — a working gta6-01 entry (Node 22, standard library only).
// The game is this directory's game/ folder: plain static files a desktop
// browser loads offline (game/index.html and its ES modules, no library, no
// network request). This program validates the entry against the scorer's
// caps and the game's own shot contract, copies game/ and screenshots/ to
// the output, writes a deterministic sha256 manifest.json, and hands in
// dossier.json built with the vendored make.fun library.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const gameDir = join(here, 'game');
const shotsDir = join(here, 'screenshots');

function fail(msg: string): never { throw new Error('caldera-heat validation: ' + msg); }
function listFiles(dir: string, base = dir): string[] {
  const outFiles: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) outFiles.push(...listFiles(full, base));
    else outFiles.push(relative(base, full).split(sep).join('/'));
  }
  return outFiles;
}
const sha256 = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');

// ---- Validate game/ caps -------------------------------------------------
const gameFiles = listFiles(gameDir);
if (gameFiles.length > 993) fail(`game/ has ${gameFiles.length} files (cap 993)`);
let gameBytes = 0;
for (const f of gameFiles) {
  const size = statSync(join(gameDir, f)).size;
  gameBytes += size;
  if (('game/' + f).length > 1000) fail(`game path too long: ${f}`);
}
if (gameBytes > 50331648) fail(`game/ is ${gameBytes} bytes (cap 50331648)`);

// ---- Validate the closed, offline module graph ---------------------------
// Walk static imports from game/index.html's module script; every specifier
// must be relative and resolve to a file inside game/. No remote URLs.
const html = readFileSync(join(gameDir, 'index.html'), 'utf8');
const scriptMatch = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/) || html.match(/<script[^>]+src="([^"]+)"/);
if (!scriptMatch) fail('index.html has no module script');
const seen = new Set<string>();
const queue: string[] = [scriptMatch[1]];
while (queue.length) {
  const rel = queue.pop()!;
  const norm = rel.replace(/^\.\//, '');
  if (seen.has(norm)) continue;
  seen.add(norm);
  const full = resolve(gameDir, norm);
  if (!full.startsWith(resolve(gameDir) + sep)) fail(`module escapes game/: ${rel}`);
  if (!existsSync(full)) fail(`module not found: ${rel}`);
  const text = readFileSync(full, 'utf8');
  if (/from\s+['"]https?:\/\//.test(text) || /import\s*\(\s*['"]https?:/.test(text)) fail(`remote import in ${norm}`);
  const importRe = /(?:import|export)[^'"]*from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(text))) {
    const spec = m[1] || m[2];
    if (!spec.startsWith('./') && !spec.startsWith('../')) fail(`non-relative import "${spec}" in ${norm}`);
    const target = relative(gameDir, resolve(join(full, '..'), spec)).split(sep).join('/');
    queue.push(target);
  }
}

// ---- Validate shots.json against the staged scenes -----------------------
const shotsJson = JSON.parse(readFileSync(join(here, 'shots.json'), 'utf8'));
if (!Array.isArray(shotsJson) || shotsJson.length < 3 || shotsJson.length > 4) fail('shots.json must list 3 or 4 shots');
const shotsSrc = readFileSync(join(gameDir, 'src', 'shots.js'), 'utf8');
const namesMatch = shotsSrc.match(/SHOT_NAMES\s*=\s*\[([^\]]+)\]/);
if (!namesMatch) fail('shots.js does not declare SHOT_NAMES');
const staged = [...namesMatch[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
const shotFiles = listFiles(shotsDir);
if (shotFiles.length > 4) fail(`screenshots/ has ${shotFiles.length} files (cap 4)`);
for (const entry of shotsJson) {
  const q = new URLSearchParams(String(entry.query).replace(/^\?/, ''));
  const name = q.get('shot');
  if (!name || !staged.includes(name)) fail(`shots.json names unstaged scene: ${entry.query}`);
}
// Every screenshot file actually present must be a valid, in-cap image.
for (const fname of shotFiles) {
  const buf = readFileSync(join(shotsDir, fname));
  if (buf.length > 262144) fail(`screenshot over 256 KiB: ${fname}`);
  const isJpeg = buf.length > 2 && buf[0] === 0xff && buf[1] === 0xd8;
  const isPng = buf.length > 4 && buf[0] === 0x89 && buf[1] === 0x50;
  if (!isJpeg && !isPng) fail(`screenshot is not JPEG/PNG: ${fname}`);
}

// ---- Copy + manifest + dossier -------------------------------------------
mkdirSync(out, { recursive: true });
cpSync(gameDir, join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(shotsDir)) cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });

const manifestFiles: { path: string; bytes: number; sha256: string }[] = [];
for (const f of listFiles(out)) {
  if (f === 'manifest.json') continue;
  const buf = readFileSync(join(out, f));
  manifestFiles.push({ path: f, bytes: buf.length, sha256: sha256(buf) });
}
writeFileSync(join(out, 'manifest.json'), JSON.stringify({ game: 'Caldera Heat', files: manifestFiles }, null, 2) + '\n');

writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
