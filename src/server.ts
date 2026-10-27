import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "helm-agent" });
});

// Only listen locally; on Vercel the app is exported as a serverless handler
if (process.env.VERCEL !== "1") {
  app.listen(PORT, () => {
    console.log(`HELM Agent API listening on http://localhost:${PORT}`);
  });
}

export default app;
