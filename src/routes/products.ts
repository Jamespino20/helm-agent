import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../server";

export const productRoutes = Router();

// Get all products (with optional filters)
productRoutes.get("/", async (_req: Request, res: Response) => {
  const { search, supplierId, minStock, available } = _req.query as any;
  const where: any = {};
  if (search) where.productName = { contains: search, mode: "insensitive" };
  if (supplierId) where.supplierId = Number(supplierId);
  if (available === "true") where.isAvailable = true;
  if (minStock) where.quantity = { gte: Number(minStock) };

  const products = await prisma.product.findMany({
    where,
    orderBy: { id: "desc" },
    include: { supplierRel: true },
  });
  res.json(products);
});

// Get single product
productRoutes.get("/:id", async (req: Request, res: Response) => {
  const product = await prisma.product.findUnique({
    where: { id: Number(req.params.id) },
    include: { supplierRel: true, transactionItems: true },
  });
  if (!product) return res.status(404).json({ error: "product not found" });
  res.json(product);
});

// Create product
const productCreateSchema = z.object({
  productName: z.string().min(1),
  category: z.string().default("Uncategorized"),
  supplierId: z.number().optional(),
  supplierName: z.string().default("Unknown"),
  brandName: z.string().default("Unbranded"),
  unitPrice: z.number().nonnegative().optional(),
  sellingPrice: z.number().nonnegative(),
  quantity: z.number().int().nonnegative().default(0),
  minThreshold: z.number().int().nonnegative().default(0),
  imageUrl: z.string().optional(),
});

productRoutes.post("/", async (req: Request, res: Response) => {
  const data = productCreateSchema.parse(req.body);
  const product = await prisma.product.create({
    data: {
      productName: data.productName,
      category: data.category,
      supplierId: data.supplierId,
      supplierName: data.supplierName,
      brandName: data.brandName,
      unitPrice: data.unitPrice,
      sellingPrice: data.sellingPrice,
      quantity: data.quantity,
      minThreshold: data.minThreshold,
      imageUrl: data.imageUrl,
      isAvailable: data.quantity > 0,
    },
    include: { supplierRel: true },
  });
  res.status(201).json(product);
});

// Update product
productRoutes.patch("/:id", async (req: Request, res: Response) => {
  const data = productCreateSchema.partial().parse(req.body);
  const product = await prisma.product.update({
    where: { id: Number(req.params.id) },
    data: { ...data, isAvailable: data.quantity !== undefined ? data.quantity > 0 : undefined },
    include: { supplierRel: true },
  });
  res.json(product);
});

// Delete product
productRoutes.delete("/:id", async (req: Request, res: Response) => {
  await prisma.product.delete({ where: { id: Number(req.params.id) } });
  res.status(204).send();
});

// Adjust stock (used by RMA flow)
productRoutes.post("/:id/stock", async (req: Request, res: Response) => {
  const { newQuantity } = z.object({ newQuantity: z.number().int().nonnegative() }).parse(req.body);
  const product = await prisma.product.update({
    where: { id: Number(req.params.id) },
    data: { quantity: newQuantity, isAvailable: newQuantity > 0 },
  });
  res.json(product);
});
