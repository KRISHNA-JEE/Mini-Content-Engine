import serverless from "serverless-http";
import { app } from "../src/app";

const handler = serverless(app);

export default async function vercelHandler(req: any, res: any) {
  return handler(req, res);
}