/**
 * Generate PNG images for every unit that has an "image-description" field
 * in notes/civ-reference/units-and-descriptions.json.
 *
 * For each unit:
 *   1. Call Gemini to generate a 512×512 image with a solid green background.
 *   2. Save the raw image to   tmp_units/<unit-slug>.png
 *   3. Run ImageMagick to strip the green bg → tmp_units/<unit-slug>-transparent.png
 *
 * Usage (run from the scripts/ folder):
 *   GEMINI_API_KEY=your_key npx tsx src/generate-unit-images.ts
 *
 * Already-completed units (transparent file exists) are skipped automatically.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";

// ── config ────────────────────────────────────────────────────────────────────

const MODEL = "gemini-3.1-flash-image-preview";
const BG_COLOR = "#00ff00";
const FUZZ = "3%"; // ImageMagick colour-match tolerance
const DELAY_MS = 2000; // pause between API calls to avoid rate-limit

const UNITS_JSON = path.resolve(
  "../notes/civ-reference/units-and-descriptions.json",
);
const OUT_DIR = path.resolve("tmp_units");

// ── types ─────────────────────────────────────────────────────────────────────

interface UnitEntry {
  Unit: string;
  Category?: string;
  "image-description"?: string;
  [key: string]: unknown;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function slug(unitName: string): string {
  return unitName.toLowerCase().replace(/\s+/g, "_");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Prefer `magick` (ImageMagick v7) but fall back to `convert` (v6). */
function magickCmd(): string {
  try {
    execSync("magick --version", { stdio: "ignore" });
    return "magick";
  } catch {
    return "convert";
  }
}

// ── core ──────────────────────────────────────────────────────────────────────

async function generateUnitImage(
  model: ReturnType<GoogleGenerativeAI["getGenerativeModel"]>,
  unit: UnitEntry,
  cmd: string,
): Promise<void> {
  const name = unit.Unit;
  const id = slug(name);
  const rawPng = path.join(OUT_DIR, `${id}.png`);
  const transparentPng = path.join(OUT_DIR, `${id}-transparent.png`);
  const description = unit["image-description"]!;

  if (fs.existsSync(transparentPng)) {
    console.log(`  skip   ${name}  - output file already exists`);
    return;
  }
  if(!description) {
    console.log(`  skip   ${name}  - no image-description`);
    return 
  }


  const prompt =
    `A top-down isometric pixel art of a "${description}", for a Civilization-style strategy game. ` +
    `Do not draw any terrain, hills, water, stones, grass, or any ground elements below the unit. The asked unit must be alone in the background solid color` +
    `The image must be 512×512 pixels. The unit must occupy most canvas vertical space. Image must have high quality (not pixelated)`;
    `Do not draw any shadows. ` +
    // `Vibrant colors, solid flat background color '${BG_COLOR}'. ` +
    `The background color must be something very pinkish or greenish so background removal is easy , a color like #00ff00 or #ff00ff ` +

  console.log(`  gen    ${name}\nprompt: ${prompt}`);

  const result = await model.generateContent(prompt);
  const parts = result.response.candidates?.[0]?.content?.parts ?? [];

  let saved = false;
  for (const part of parts) {
    if (part.inlineData?.data) {
      const buffer = Buffer.from(part.inlineData.data, "base64");
      fs.writeFileSync(rawPng, buffer);
      saved = true;
      break;
    }
  }

  if (!saved) {
    console.warn(`  warn   ${name}: no image part in response — skipping`);
    return;
  }

  // Detect actual background colour from top-left pixel, then strip it
  const bg = execSync(
    `${cmd} "${rawPng}" -format "%[pixel:p{0,0}]" info:`,
  ).toString().trim();
  execSync(
    `${cmd} "${rawPng}" -fuzz ${FUZZ} -transparent "${bg}" "${transparentPng}"`,
  );

  console.log(`  saved  ${id}-transparent.png`);
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY ?? "";
  if (!apiKey) {
    console.error("Error: set the GEMINI_API_KEY environment variable");
    process.exit(1);
  }

  if (!fs.existsSync(UNITS_JSON)) {
    console.error(`Error: units JSON not found at ${UNITS_JSON}`);
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const allUnits: UnitEntry[] = JSON.parse(fs.readFileSync(UNITS_JSON, "utf-8"));
  const units = allUnits.filter((u) => u["image-description"]);

  console.log(`Found ${units.length} units with image descriptions (${allUnits.length - units.length} skipped — no description)\n`);

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: MODEL });
  const cmd = magickCmd();
  console.log(`ImageMagick command: ${cmd}\n`);

  let ok = 0;
  let failed = 0;

  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    try {
      await generateUnitImage(model, unit, cmd);
      ok++;
    } catch (err) {
      console.error(
        `  error  ${unit.Unit}:`,
        err instanceof Error ? err.message : err,
      );
      failed++;
    }

    // Rate-limit pause between requests (skip after last unit)
    if (i < units.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  console.log(`\nDone — ${ok} succeeded, ${failed} failed.`);
}

async function applyTransparencyAgain(): Promise<void> {
  if (!fs.existsSync(OUT_DIR)) {
    console.error(`Error: output dir not found: ${OUT_DIR}`);
    process.exit(1);
  }

  const cmd = magickCmd();
  const rawFiles = fs.readdirSync(OUT_DIR).filter(
    (f) => f.endsWith(".png") && !f.endsWith("-transparent.png"),
  );

  if (rawFiles.length === 0) {
    console.log("No raw PNG files found in tmp_units/");
    return;
  }

  console.log(`Re-applying transparency to ${rawFiles.length} files (cmd: ${cmd})\n`);

  let ok = 0;
  let failed = 0;

  for (const file of rawFiles) {
    const rawPng = path.join(OUT_DIR, file);
    const transparentPng = path.join(OUT_DIR, file.replace(/\.png$/, "-transparent.png"));
    try {
      const bg = execSync(`${cmd} "${rawPng}" -format "%[pixel:p{0,0}]" info:`).toString().trim();
      execSync(`${cmd} "${rawPng}" -fuzz ${FUZZ} -transparent "${bg}" "${transparentPng}"`);
      console.log(`  ok     ${file}  (bg: ${bg})`);
      ok++;
    } catch (err) {
      console.error(`  error  ${file}:`, err instanceof Error ? err.message : err);
      failed++;
    }
  }

  console.log(`\nDone — ${ok} succeeded, ${failed} failed.`);
}

if (process.argv.includes("--regenerate-transparency")) {
  applyTransparencyAgain();
} else {
  main();
}
