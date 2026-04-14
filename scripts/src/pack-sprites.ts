/**
 * Pack individual PNG sprites into a PixiJS-compatible texture atlas.
 *
 * Usage (run from the scripts/ folder):
 *   npx tsx src/pack-sprites.ts [options] [source-dir] [atlas-name]
 *
 * Arguments:
 *   [source-dir]   Source PNG directory  (default: ../data/set1/units)
 *   [atlas-name]   Atlas output name     (default: basename of source-dir)
 *
 * Options:
 *   --resize <px>  Resize each sprite to <px>×<px> before packing
 *                  (requires ImageMagick; e.g. --resize 128)
 *   --size <px>    Max atlas sheet size, default 4096
 *
 * Output:
 *   ../public/assets/<atlas-name>.json   — PixiJS spritesheet descriptor
 *   ../public/assets/<atlas-name>.png    — packed spritesheet image
 *   (Multiple sheets are named <atlas-name>-0, <atlas-name>-1, … if needed)
 *
 * Workflow:
 *   1. Drop / edit PNGs in the source directory.
 *   2. Run:  npx tsx src/pack-sprites.ts  (or: npm run pack from project root)
 *   3. Load the atlas in PixiJS v8:
 *        await Assets.load('/assets/units.json');
 *        const tex = Texture.from('warrior');   // frame name = filename w/o .png
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

interface PackerImage { path: string; contents: Buffer; }
interface PackerFile  { name: string; buffer: Buffer; }

const { packAsync } = require('free-tex-packer-core') as {
  packAsync: (
    images: PackerImage[],
    options: Record<string, unknown>,
  ) => Promise<PackerFile[]>;
};

// ── parse args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

let resizePx: number | null = null;
let sheetSize = 4096;
const positional: string[] = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--resize' && args[i + 1]) {
    resizePx = parseInt(args[++i], 10);
  } else if (args[i] === '--size' && args[i + 1]) {
    sheetSize = parseInt(args[++i], 10);
  } else {
    positional.push(args[i]);
  }
}

const srcDir    = path.resolve(positional[0] ?? '../data/set1/units');
const atlasName = positional[1] ?? path.basename(srcDir);
const outDir    = path.resolve('../public/assets');

// ── helpers ───────────────────────────────────────────────────────────────────

/** Prefer `magick` (ImageMagick v7) but fall back to `convert` (v6). */
function magickCmd(): string {
  try { execSync('magick --version', { stdio: 'ignore' }); return 'magick'; }
  catch { return 'convert'; }
}

function resizeImage(srcPath: string, px: number, cmd: string): Buffer {
  const tmp = path.join(os.tmpdir(), `pack-resize-${Date.now()}-${path.basename(srcPath)}`);
  execSync(`${cmd} "${srcPath}" -resize ${px}x${px} "${tmp}"`);
  const buf = fs.readFileSync(tmp);
  fs.unlinkSync(tmp);
  return buf;
}

// ── gather images ─────────────────────────────────────────────────────────────

if (!fs.existsSync(srcDir)) {
  console.error(`Source directory not found: ${srcDir}`);
  process.exit(1);
}

const pngFiles = fs.readdirSync(srcDir)
  .filter(f => f.toLowerCase().endsWith('.png'))
  .sort();

if (pngFiles.length === 0) {
  console.error(`No PNG files found in: ${srcDir}`);
  process.exit(1);
}

console.log(`Packing ${pngFiles.length} sprites from ${srcDir}`);
if (resizePx) console.log(`Resizing to ${resizePx}×${resizePx} before packing`);
pngFiles.forEach(f => console.log(`  ${f}`));
console.log();

const cmd = resizePx ? magickCmd() : '';

const images: PackerImage[] = pngFiles.map(f => {
  const fullPath = path.join(srcDir, f);
  const contents = resizePx
    ? resizeImage(fullPath, resizePx, cmd)
    : fs.readFileSync(fullPath);
  return {
    path: path.basename(f, '.png'),   // frame name = filename without .png
    contents,
  };
});

// ── pack ──────────────────────────────────────────────────────────────────────

fs.mkdirSync(outDir, { recursive: true });

try {
  const files = await packAsync(images, {
    textureName: atlasName,
    width: sheetSize,
    height: sheetSize,
    fixedSize: false,
    padding: 4,
    allowRotation: false,
    detectIdentical: true,
    allowTrim: true,
    exporter: 'Pixi',
    removeFileExtension: false,
    prependFolderName: false,
  });

  // Remove previous atlas files for this name before writing new ones
  const prevFiles = fs.readdirSync(outDir).filter(f =>
    f.startsWith(atlasName) && (f.endsWith('.json') || f.endsWith('.png')),
  );
  for (const prev of prevFiles) {
    fs.unlinkSync(path.join(outDir, prev));
  }

  const jsonFiles: string[] = [];
  for (const file of files) {
    const dest = path.join(outDir, file.name);
    fs.writeFileSync(dest, file.buffer);
    console.log(`  wrote  ${dest}`);
    if (file.name.endsWith('.json')) jsonFiles.push(`/assets/${file.name}`);
  }

  const sheetCount = jsonFiles.length;
  const isSingleSheet = sheetCount === 1;
  // Single-sheet: rename to plain <atlasName>.json/.png for cleaner URLs
  if (isSingleSheet && files[0].name.endsWith('-0.json')) {
    const jsonSrc = path.join(outDir, `${atlasName}-0.json`);
    const pngSrc  = path.join(outDir, `${atlasName}-0.png`);
    const jsonDst = path.join(outDir, `${atlasName}.json`);
    const pngDst  = path.join(outDir, `${atlasName}.png`);
    // Patch the JSON to reference the plain .png name
    const json = JSON.parse(fs.readFileSync(jsonSrc, 'utf-8'));
    json.meta.image = `${atlasName}.png`;
    fs.writeFileSync(jsonDst, JSON.stringify(json, null, 2));
    fs.renameSync(pngSrc, pngDst);
    fs.unlinkSync(jsonSrc);
    console.log(`  renamed to ${atlasName}.json / ${atlasName}.png`);
  }

  console.log(`
Atlas ready (${sheetCount} sheet${sheetCount > 1 ? 's' : ''}).
Load in PixiJS v8:

  import { Assets, Texture } from 'pixi.js';
`);
  if (isSingleSheet) {
    console.log(`  await Assets.load('/assets/${atlasName}.json');`);
  } else {
    jsonFiles.forEach(p => console.log(`  await Assets.load('${p}');`));
  }
  console.log(`  const tex = Texture.from('warrior');  // frame name = PNG filename without extension`);
  console.log();
} catch (err) {
  console.error('Packing failed:', err);
  process.exit(1);
}
