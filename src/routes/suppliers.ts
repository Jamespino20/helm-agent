import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../server";

export const supplierRoutes = Router();

// Get all suppliers
supplierRoutes.get("/", async (_req: Request, res: Response) => {
  const suppliers = await prisma.supplier.findMany({
    orderBy: { supplierName: "asc" },
    include: { _count: { select: { products: true } } },
  });
  res.json(suppliers);
});

// Get single supplier
supplierRoutes.get("/:id", async (req: Request, res: Response) => {
  const supplier = await prisma.supplier.findUnique({
    where: { id: Number(req.params.id) },
    include: { products: true },
  });
  if (!supplier) return res.status(404).json({ error: "supplier not found" });
  res.json(supplier);
});

// Create supplier
const supplierCreateSchema = z.object({
  supplierName: z.string().min(1),
  contactName: z.string().optional(),
  contactNumber: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  tin: z.string().optional(),
});

supplierRoutes.post("/", async (req: Request, res: Response) => {
  const data = supplierCreateSchema.parse(req.body);
  const supplier = await prisma.supplier.create({ data });
  res.status(201).json(supplier);
});

// Update supplier
supplierRoutes.patch("/:id", async (req: Request, res: Response) => {
  const data = supplierCreateSchema.partial().parse(req.body);
  const supplier = await prisma.supplier.update({
    where: { id: Number(req.params.id) },
    data,
  });
  res.json(supplier);
});

// Delete supplier
supplierRoutes.delete("/:id", async (req: Request, res: Response) => {
  const supplier = await prisma.supplier.findUnique({
    where: { id: Number(req.params.id) },
    include: { _count: { select: { products: true } } },
  });
  if (!supplier) return res.status(404).json({ error: "supplier not found" });
  if (supplier._count.products > 0) {
    return res.status(400).json({ error: "Cannot delete supplier with associated products" });
  }
  await prisma.supplier.delete({ where: { id: Number(req.params.id) } });
  res.status(204).send();
});
