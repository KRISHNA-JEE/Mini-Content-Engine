import serverless from "serverless-http";
import { app } from "../src/app";

const handler = serverless(app);

export default async function vercelHandler(req: any, res: any) {
  try {
    if (!process.env.DATABASE_URL) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "DATABASE_URL is not configured in Vercel" }));
      return;
    }

    return handler(req, res);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown Vercel runtime error";
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: message }));
  }
}