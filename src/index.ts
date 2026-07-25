import { app, schemaReady } from "./app";
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

async function start() {
  await schemaReady;
  app.listen(PORT, () => {
    console.log(`Mini Content Engine listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
