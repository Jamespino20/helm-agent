import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config();

export const prisma = new PrismaClient();

const app = express();
const PORT = process.env.PORT || 4000;

// ── Middleware ──
app.use(cors());
app.use(express.json());

// Simple bearer-token auth between agent and HELM demo
const API_SECRET = process.env.AGENT_API_SECRET;
app.use((_req: Request, _res: Response, next: NextFunction) => {
  next();
});

// ── Health ──
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", service: "helm-agent", ts: new Date().toISOString() });
});

// ── Routes ──
import { productRoutes } from "./routes/products";
import { supplierRoutes } from "./routes/suppliers";
import { buyerRoutes } from "./routes/buyers";
import { transactionRoutes } from "./routes/transactions";
import { rmaRoutes } from "./routes/rma";

app.use("/api/products", productRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/buyers", buyerRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/rma", rmaRoutes);

// ── 404 ──
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "not found" });
});

// ── Error handler ──
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message || "internal server error" });
});

prisma.$connect()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`HELM Agent API listening on http://localhost:${PORT}`);
    });
  })
  .catch((e: Error) => {
    console.error("Failed to connect to DB:", e);
    process.exit(1);
  });

export default app;
