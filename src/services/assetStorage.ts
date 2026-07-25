import { promises as fs } from "fs";
import path from "path";

const UPLOADS_DIR = path.join(__dirname, "..", "..", "uploads");

function toDataUrl(buffer: Buffer, contentType: string): string {
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

export async function persistImageAsset(
  buffer: Buffer,
  contentType: string,
  fileName: string
): Promise<string> {
  if (process.env.VERCEL === "1") {
    return toDataUrl(buffer, contentType);
  }

  await fs.writeFile(path.join(UPLOADS_DIR, fileName), buffer);
  return `/uploads/${fileName}`;
}