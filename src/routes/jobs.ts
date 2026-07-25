import { Router } from "express";
import { pool } from "../db";
import { Job } from "../types";

export const jobsRouter = Router();

export function serializeJob(job: Job) {
  return {
    id: job.id,
    productName: job.product_name,
    description: job.description,
    referenceImageUrl: job.reference_image_url,
    generatedPrompt: job.generated_prompt,
    resultImageUrl: job.result_image_url,
    status: job.status,
    error: job.error_message,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  };
}

jobsRouter.get("/jobs", async (_req, res) => {
  const result = await pool.query<Job>("SELECT * FROM jobs ORDER BY created_at DESC LIMIT 100");
  res.json(result.rows.map(serializeJob));
});

jobsRouter.get("/jobs/:id", async (req, res) => {
  const result = await pool.query<Job>("SELECT * FROM jobs WHERE id = $1", [req.params.id]);

  if (result.rows.length === 0) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  res.json(serializeJob(result.rows[0]));
});
