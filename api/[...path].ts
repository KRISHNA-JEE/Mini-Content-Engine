import serverless from "serverless-http";
import { app, schemaReady } from "../src/app";

const handler = serverless(app);

export default async function vercelHandler(req: any, res: any) {
  await schemaReady;
  return handler(req, res);
}