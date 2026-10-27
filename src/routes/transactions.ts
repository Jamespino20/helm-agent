import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../server";

export const transactionRoutes = Router();

// Get all transactions
transactionRoutes.get("/", async (_req: Request, res: Response) => {
  const { type, status, search } = _req.query as any;
  const where: any = {};
  if (type) where.transactionType = type;
  if (status) where.transactionStatus = status;
  if (search) {
    where.OR = [
      { receiptNumber: { contains: search, mode: "insensitive" } },
      { buyerName: { contains: search, mode: "insensitive" } },
    ];
  }

  const transactions = await prisma.transaction.findMany({
    where,
    orderBy: { transactionDate: "desc" },
    include: { items: { include: { product: true } }, buyer: true },
  });
  res.json(transactions);
});

// Get single transaction
transactionRoutes.get("/:id", async (req: Request, res: Response) => {
  const transaction = await prisma.transaction.findUnique({
    where: { id: Number(req.params.id) },
    include: { items: { include: { product: true } }, buyer: true },
  });
  if (!transaction) return res.status(404).json({ error: "transaction not found" });
  res.json(transaction);
});

// Get transaction by receipt number
transactionRoutes.get("/receipt/:receiptNumber", async (req: Request, res: Response) => {
  const transaction = await prisma.transaction.findFirst({
    where: { receiptNumber: Number(req.params.receiptNumber) },
    include: { items: { include: { product: true } }, buyer: true },
  });
  if (!transaction) return res.status(404).json({ error: "receipt not found" });
  res.json(transaction);
});
