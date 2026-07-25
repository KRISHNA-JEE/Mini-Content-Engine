import { Router } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { pool } from "../db";
import { downloadImage } from "../services/imageGen";
import { processJob } from "../services/jobProcessor";
import { persistImageAsset } from "../services/assetStorage";
import { serializeJob } from "./jobs";
import { Job } from "../types";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export const generateRouter = Router();

generateRouter.post("/generate", upload.single("productImage"), async (req, res) => {
  const productName = (req.body?.productName ?? "").toString().trim();
  const description = (req.body?.description ?? "").toString().trim();
  const productImageUrl = (req.body?.productImageUrl ?? "").toString().trim();

  if (!productName || !description) {
    res.status(400).json({ error: "productName and description are required" });
    return;
  }

  const jobId = randomUUID();
  let referenceImagePath: string | null = null;

  try {
    if (req.file) {
      const ext = EXT_BY_CONTENT_TYPE[req.file.mimetype] ?? "jpg";
      const fileName = `reference-${jobId}.${ext}`;
      referenceImagePath = await persistImageAsset(req.file.buffer, req.file.mimetype, fileName);
    } else if (productImageUrl) {
      const { buffer, contentType } = await downloadImage(productImageUrl);
      const ext = EXT_BY_CONTENT_TYPE[contentType] ?? "jpg";
      const fileName = `reference-${jobId}.${ext}`;
      referenceImagePath = await persistImageAsset(buffer, contentType, fileName);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch reference image";
    res.status(400).json({ error: message });
    return;
  }

  try {
    await pool.query(
      `INSERT INTO jobs (id, product_name, description, reference_image_url, status)
       VALUES ($1, $2, $3, $4, 'pending')`,
      [jobId, productName, description, referenceImagePath]
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create job";
    res.status(503).json({ error: message });
    return;
  }

  if (process.env.VERCEL === "1") {
    void processJob(jobId, productName, description).catch((err) => {
      console.error(`Unhandled error processing job ${jobId}:`, err);
    });

    const result = await pool.query<Job>("SELECT * FROM jobs WHERE id = $1", [jobId]);
    if (result.rows[0]) {
      res.status(202).json(serializeJob(result.rows[0]));
      return;
    }

    res.status(500).json({ error: "Job was created but could not be loaded" });
    return;
  }

  res.status(202).json({ id: jobId, status: "pending" });

  setImmediate(() => {
    processJob(jobId, productName, description).catch((err) => {
      console.error(`Unhandled error processing job ${jobId}:`, err);
    });
  });
});
