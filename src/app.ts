import "dotenv/config";
import express from "express";
import path from "path";
import { healthRouter } from "./routes/health";
import { jobsRouter } from "./routes/jobs";
import { generateRouter } from "./routes/generate";

const app = express();

app.use((req, _res, next) => {
  if (req.url.startsWith("/api/")) {
    req.url = req.url.slice(4) || "/";
  }
  next();
});

app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));
app.use(express.static(path.join(__dirname, "..", "public")));

app.use(healthRouter);
app.use(generateRouter);
app.use(jobsRouter);

export { app };