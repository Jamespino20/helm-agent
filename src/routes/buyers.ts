import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../server";

export const buyerRoutes = Router();

// Get all buyers
buyerRoutes.get("/", async (_req: Request, res: Response) => {
  const buyers = await prisma.buyer.findMany({
    orderBy: { totalSpent: "desc" },
  });
  res.json(buyers);
});

// Get single buyer
buyerRoutes.get("/:id", async (req: Request, res: Response) => {
  const buyer = await prisma.buyer.findUnique({
    where: { id: Number(req.params.id) },
    include: { transactions: { include: { items: true } } },
  });
  if (!buyer) return res.status(404).json({ error: "buyer not found" });
  res.json(buyer);
});

// Create buyer
const buyerCreateSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  tin: z.string().optional(),
});

buyerRoutes.post("/", async (req: Request, res: Response) => {
  const data = buyerCreateSchema.parse(req.body);
  const existing = await prisma.buyer.findFirst({ where: { name: data.name } });
  if (existing) return res.status(400).json({ error: "buyer already exists" });
  const buyer = await prisma.buyer.create({ data });
  res.status(201).json(buyer);
});

// Update buyer
buyerRoutes.patch("/:id", async (req: Request, res: Response) => {
  const data = buyerCreateSchema.partial().parse(req.body);
  const buyer = await prisma.buyer.update({ where: { id: Number(req.params.id) }, data });
  res.json(buyer);
});

// Adjust credit balance
buyerRoutes.post("/:id/credit", async (req: Request, res: Response) => {
  const { delta } = z.object({ delta: z.number() }).parse(req.body);
  const buyer = await prisma.buyer.findUnique({ where: { id: Number(req.params.id) } });
  if (!buyer) return res.status(404).json({ error: "buyer not found" });
  const updated = await prisma.buyer.update({
    where: { id: Number(req.params.id) },
    data: { creditBalance: { increment: delta } },
  });
  res.json(updated);
});
