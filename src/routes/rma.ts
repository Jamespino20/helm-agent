import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { rmaAgent } from "../agent/core/orchestrator";

export const rmaRoutes = Router();

// Create an RMA intake transaction (Return / Damage / Adjustment)
// This is the agent's primary action endpoint — delegates to rmaAgent orchestrator
const rmaCreateSchema = z.object({
  receiptNumber: z.number().int().positive(),
  buyerName: z.string().min(1),
  buyerAddress: z.string().optional(),
  buyerContact: z.string().optional(),
  sellerId: z.number().int().positive().optional(),
  sellerName: z.string().default("Agent"),
  requestedItems: z.array(
    z.object({
      productId: z.number().int().positive(),
      quantity: z.number().int().positive(),
    })
  ).min(1),
  damageImage: z.string().optional(), // base64 image for SAM 3.1 assessment
});

rmaRoutes.post("/", async (req: Request, res: Response) => {
  const data = rmaCreateSchema.parse(req.body);

  try {
    const result = await rmaAgent.intake({
      receiptNumber: data.receiptNumber,
      buyerName: data.buyerName,
      requestedItems: data.requestedItems,
      sellerId: data.sellerId,
      sellerName: data.sellerName,
      damageImage: data.damageImage,
    });

    res.status(201).json(result);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// Stock adjustment endpoint (agent can restock or write off)
rmaRoutes.post("/stock-adjust", async (req: Request, res: Response) => {
  const { productId, newQuantity, reason } = z.object({
    productId: z.number().int().positive(),
    newQuantity: z.number().int().nonnegative(),
    reason: z.string(),
  }).parse(req.body);

  const { prisma } = await import("../server");
  const product = await prisma.product.update({
    where: { id: productId },
    data: { quantity: newQuantity, isAvailable: newQuantity > 0 },
  });
  res.json({ product, reason });
});
