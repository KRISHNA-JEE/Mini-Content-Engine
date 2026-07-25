const IMAGE_API_BASE = "https://image.pollinations.ai/prompt";
const FALLBACK_IMAGE_BASE = "https://picsum.photos/seed";

const DEFAULT_TIMEOUT_MS = 45_000;
const RETRY_DELAYS_MS = [500, 1200, 2500];

type ImageVariant = {
  width: number;
  height: number;
};

const IMAGE_VARIANTS: ImageVariant[] = [
  { width: 1024, height: 1024 },
  { width: 768, height: 768 },
  { width: 512, height: 512 },
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

function normalizePrompt(prompt: string): string {
  // Pollinations is less likely to error when prompts are moderately sized.
  return prompt.replace(/\s+/g, " ").trim().slice(0, 700);
}

async function fetchImage(prompt: string, seed: number, variant: ImageVariant): Promise<Buffer> {
  const url =
    `${IMAGE_API_BASE}/${encodeURIComponent(prompt)}` +
    `?width=${variant.width}&height=${variant.height}&nologo=true&seed=${seed}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      const details = (await response.text().catch(() => "")).slice(0, 200);
      const detailSuffix = details ? ` - ${details}` : "";
      throw new Error(
        `Image generation failed: ${response.status} ${response.statusText}${detailSuffix}`.trim()
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchFallbackImage(seed: number, variant: ImageVariant): Promise<Buffer> {
  const url = `${FALLBACK_IMAGE_BASE}/${seed}/${variant.width}/${variant.height}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Fallback image fetch failed: ${response.status} ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Generates an image from a text prompt using a free, keyless image API
 * (Pollinations' Flux-based text-to-image endpoint).
 *
 * `seed` is derived from the job id so the same job always reproduces the same
 * image if regenerated, while different jobs get different results.
 */
export async function generateImageFromPrompt(prompt: string, seed: number): Promise<Buffer> {
  const safePrompt = normalizePrompt(prompt);
  let lastError = "Image generation failed for unknown reason";

  for (const variant of IMAGE_VARIANTS) {
    for (let i = 0; i <= RETRY_DELAYS_MS.length; i++) {
      try {
        return await fetchImage(safePrompt, seed, variant);
      } catch (err) {
        lastError = getErrorMessage(err);
        if (i < RETRY_DELAYS_MS.length) {
          await sleep(RETRY_DELAYS_MS[i]);
        }
      }
    }
  }

  try {
    return await fetchFallbackImage(seed, { width: 1024, height: 1024 });
  } catch (fallbackErr) {
    const fallbackMessage = getErrorMessage(fallbackErr);
    throw new Error(`${lastError}; fallback failed: ${fallbackMessage}`);
  }
}

/** Simple, deterministic 32-bit hash of a job id, used as the image seed. */
export function seedFromJobId(jobId: string): number {
  let hash = 0;
  for (let i = 0; i < jobId.length; i++) {
    hash = (hash * 31 + jobId.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** Downloads an externally-hosted reference image (e.g. the product photo URL). */
export async function downloadImage(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download reference image: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  return { buffer: Buffer.from(arrayBuffer), contentType };
}
