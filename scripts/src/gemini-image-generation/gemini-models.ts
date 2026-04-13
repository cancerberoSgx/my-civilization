/**
 * Probe: list all models available for the given Gemini API key
 *
 * Usage:
 *   GEMINI_API_KEY=your_key npx tsx src/probes/gemini-models.ts
 *
 * Requires Node >= 18 (native fetch). No extra packages needed.
 */

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

interface Model {
  name: string;
  displayName: string;
  description: string;
  supportedGenerationMethods: string[];
  inputTokenLimit?: number;
  outputTokenLimit?: number;
}

interface ModelsResponse {
  models: Model[];
  nextPageToken?: string;
}

async function listModels(apiKey: string): Promise<void> {
  const models: Model[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(BASE_URL);
    url.searchParams.set("key", apiKey);
    url.searchParams.set("pageSize", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString());
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API error ${res.status}: ${text}`);
    }

    const json = (await res.json()) as ModelsResponse;
    models.push(...(json.models ?? []));
    pageToken = json.nextPageToken;
  } while (pageToken);

  console.log(`Found ${models.length} models:\n`);

  for (const m of models) {
    const id = m.name.replace("models/", "");
    const methods = m.supportedGenerationMethods.join(", ");
    const tokens =
      m.inputTokenLimit != null
        ? `in:${m.inputTokenLimit} out:${m.outputTokenLimit}`
        : "";
    console.log(`${id}`);
    console.log(`  display : ${m.displayName}`);
    console.log(`  methods : ${methods}`);
    if (tokens) console.log(`  tokens  : ${tokens}`);
    console.log();
  }
}

// ── entrypoint ────────────────────────────────────────────────────────────────

const apiKey = process.env.GEMINI_API_KEY ?? "";
if (!apiKey) {
  console.error("Error: set GEMINI_API_KEY environment variable");
  process.exit(1);
}

listModels(apiKey).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});





/* 


gemini-2.5-flash
  display : Gemini 2.5 Flash
  methods : generateContent, countTokens, createCachedContent, batchGenerateContent
  tokens  : in:1048576 out:65536

gemini-2.5-pro
  display : Gemini 2.5 Pro
  methods : generateContent, countTokens, createCachedContent, batchGenerateContent
  tokens  : in:1048576 out:65536

gemini-2.0-flash
  display : Gemini 2.0 Flash
  methods : generateContent, countTokens, createCachedContent, batchGenerateContent
  tokens  : in:1048576 out:8192

gemini-2.0-flash-001
  display : Gemini 2.0 Flash 001
  methods : generateContent, countTokens, createCachedContent, batchGenerateContent
  tokens  : in:1048576 out:8192

gemini-2.0-flash-lite-001
  display : Gemini 2.0 Flash-Lite 001
  methods : generateContent, countTokens, createCachedContent, batchGenerateContent
  tokens  : in:1048576 out:8192

gemini-2.0-flash-lite
  display : Gemini 2.0 Flash-Lite
  methods : generateContent, countTokens, createCachedContent, batchGenerateContent
  tokens  : in:1048576 out:8192

gemini-2.5-flash-preview-tts
  display : Gemini 2.5 Flash Preview TTS
  methods : countTokens, generateContent
  tokens  : in:8192 out:16384

gemini-2.5-pro-preview-tts
  display : Gemini 2.5 Pro Preview TTS
  methods : countTokens, generateContent, batchGenerateContent
  tokens  : in:8192 out:16384

gemma-3-1b-it
  display : Gemma 3 1B
  methods : generateContent, countTokens
  tokens  : in:32768 out:8192

gemma-3-4b-it
  display : Gemma 3 4B
  methods : generateContent, countTokens
  tokens  : in:32768 out:8192

gemma-3-12b-it
  display : Gemma 3 12B
  methods : generateContent, countTokens
  tokens  : in:32768 out:8192

gemma-3-27b-it
  display : Gemma 3 27B
  methods : generateContent, countTokens
  tokens  : in:131072 out:8192

gemma-3n-e4b-it
  display : Gemma 3n E4B
  methods : generateContent, countTokens
  tokens  : in:8192 out:2048

gemma-3n-e2b-it
  display : Gemma 3n E2B
  methods : generateContent, countTokens
  tokens  : in:8192 out:2048

gemma-4-26b-a4b-it
  display : Gemma 4 26B A4B IT
  methods : generateContent, countTokens
  tokens  : in:262144 out:32768

gemma-4-31b-it
  display : Gemma 4 31B IT
  methods : generateContent, countTokens
  tokens  : in:262144 out:32768

gemini-flash-latest
  display : Gemini Flash Latest
  methods : generateContent, countTokens, createCachedContent, batchGenerateContent
  tokens  : in:1048576 out:65536

gemini-flash-lite-latest
  display : Gemini Flash-Lite Latest
  methods : generateContent, countTokens, createCachedContent, batchGenerateContent
  tokens  : in:1048576 out:65536

gemini-pro-latest
  display : Gemini Pro Latest
  methods : generateContent, countTokens, createCachedContent, batchGenerateContent
  tokens  : in:1048576 out:65536

gemini-2.5-flash-lite
  display : Gemini 2.5 Flash-Lite
  methods : generateContent, countTokens, createCachedContent, batchGenerateContent
  tokens  : in:1048576 out:65536

gemini-2.5-flash-image
  display : Nano Banana
  methods : generateContent, countTokens, batchGenerateContent
  tokens  : in:32768 out:32768

gemini-3-pro-preview
  display : Gemini 3 Pro Preview
  methods : generateContent, countTokens, createCachedContent, batchGenerateContent
  tokens  : in:1048576 out:65536

gemini-3-flash-preview
  display : Gemini 3 Flash Preview
  methods : generateContent, countTokens, createCachedContent, batchGenerateContent
  tokens  : in:1048576 out:65536

gemini-3.1-pro-preview
  display : Gemini 3.1 Pro Preview
  methods : generateContent, countTokens, createCachedContent, batchGenerateContent
  tokens  : in:1048576 out:65536

gemini-3.1-pro-preview-customtools
  display : Gemini 3.1 Pro Preview Custom Tools
  methods : generateContent, countTokens, createCachedContent, batchGenerateContent
  tokens  : in:1048576 out:65536

gemini-3.1-flash-lite-preview
  display : Gemini 3.1 Flash Lite Preview
  methods : generateContent, countTokens, createCachedContent, batchGenerateContent
  tokens  : in:1048576 out:65536

gemini-3-pro-image-preview
  display : Nano Banana Pro
  methods : generateContent, countTokens, batchGenerateContent
  tokens  : in:131072 out:32768

nano-banana-pro-preview
  display : Nano Banana Pro
  methods : generateContent, countTokens, batchGenerateContent
  tokens  : in:131072 out:32768

gemini-3.1-flash-image-preview
  display : Nano Banana 2
  methods : generateContent, countTokens, batchGenerateContent
  tokens  : in:65536 out:65536

lyria-3-clip-preview
  display : Lyria 3 Clip Preview
  methods : generateContent, countTokens
  tokens  : in:1048576 out:65536

lyria-3-pro-preview
  display : Lyria 3 Pro Preview
  methods : generateContent, countTokens
  tokens  : in:1048576 out:65536

gemini-robotics-er-1.5-preview
  display : Gemini Robotics-ER 1.5 Preview
  methods : generateContent, countTokens
  tokens  : in:1048576 out:65536

gemini-2.5-computer-use-preview-10-2025
  display : Gemini 2.5 Computer Use Preview 10-2025
  methods : generateContent, countTokens
  tokens  : in:131072 out:65536

deep-research-pro-preview-12-2025
  display : Deep Research Pro Preview (Dec-12-2025)
  methods : generateContent, countTokens
  tokens  : in:131072 out:65536

gemini-embedding-001
  display : Gemini Embedding 001
  methods : embedContent, countTextTokens, countTokens, asyncBatchEmbedContent
  tokens  : in:2048 out:1

gemini-embedding-2-preview
  display : Gemini Embedding 2 Preview
  methods : embedContent, countTextTokens, countTokens, asyncBatchEmbedContent
  tokens  : in:8192 out:1

aqa
  display : Model that performs Attributed Question Answering.
  methods : generateAnswer
  tokens  : in:7168 out:1024

imagen-4.0-generate-001
  display : Imagen 4
  methods : predict
  tokens  : in:480 out:8192

imagen-4.0-ultra-generate-001
  display : Imagen 4 Ultra
  methods : predict
  tokens  : in:480 out:8192

imagen-4.0-fast-generate-001
  display : Imagen 4 Fast
  methods : predict
  tokens  : in:480 out:8192

veo-2.0-generate-001
  display : Veo 2
  methods : predictLongRunning
  tokens  : in:480 out:8192

veo-3.0-generate-001
  display : Veo 3
  methods : predictLongRunning
  tokens  : in:480 out:8192

veo-3.0-fast-generate-001
  display : Veo 3 fast
  methods : predictLongRunning
  tokens  : in:480 out:8192

veo-3.1-generate-preview
  display : Veo 3.1
  methods : predictLongRunning
  tokens  : in:480 out:8192

veo-3.1-fast-generate-preview
  display : Veo 3.1 fast
  methods : predictLongRunning
  tokens  : in:480 out:8192

veo-3.1-lite-generate-preview
  display : Veo 3.1 lite
  methods : predictLongRunning
  tokens  : in:480 out:8192

gemini-2.5-flash-native-audio-latest
  display : Gemini 2.5 Flash Native Audio Latest
  methods : countTokens, bidiGenerateContent
  tokens  : in:131072 out:8192

gemini-2.5-flash-native-audio-preview-09-2025
  display : Gemini 2.5 Flash Native Audio Preview 09-2025
  methods : countTokens, bidiGenerateContent
  tokens  : in:131072 out:8192

gemini-2.5-flash-native-audio-preview-12-2025
  display : Gemini 2.5 Flash Native Audio Preview 12-2025
  methods : countTokens, bidiGenerateContent
  tokens  : in:131072 out:8192

gemini-3.1-flash-live-preview
  display : Gemini 3.1 Flash Live Preview
  methods : bidiGenerateContent
  tokens  : in:131072 out:65536
  
*/