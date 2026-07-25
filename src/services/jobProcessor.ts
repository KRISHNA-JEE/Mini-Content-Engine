import { pool } from "../db";
import { buildImagePrompt } from "./llm";
import { generateImageFromPrompt, seedFromJobId } from "./imageGen";
import { persistImageAsset } from "./assetStorage";

async function setStatus(
  jobId: string,
  status: string,
  fields: Record<string, string | null> = {}
): Promise<void> {
  const columns = Object.keys(fields);
  const setClauses = ["status = $1", "updated_at = now()"];
  const values: unknown[] = [status];

  columns.forEach((col, i) => {
    setClauses.push(`${col} = $${i + 2}`);
    values.push(fields[col]);
  });

  values.push(jobId);
  await pool.query(
    `UPDATE jobs SET ${setClauses.join(", ")} WHERE id = $${values.length}`,
    values
  );
}

/**
 * Runs the full generation pipeline for a job in the background:
 * LLM prompt writing -> image generation -> persist result. Never throws;
 * failures are recorded on the job row so clients see status: "failed".
 */
export async function processJob(jobId: string, productName: string, description: string): Promise<void> {
  try {
    await setStatus(jobId, "processing");

    const prompt = await buildImagePrompt(productName, description);
    await setStatus(jobId, "processing", { generated_prompt: prompt });

    const seed = seedFromJobId(jobId);
    const imageBuffer = await generateImageFromPrompt(prompt, seed);

    const fileName = `result-${jobId}.jpg`;
    const resultImagePath = await persistImageAsset(imageBuffer, "image/jpeg", fileName);

    await setStatus(jobId, "completed", {
      generated_prompt: prompt,
      result_image_url: resultImagePath,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error during generation";
    await setStatus(jobId, "failed", { error_message: message });
  }
}
