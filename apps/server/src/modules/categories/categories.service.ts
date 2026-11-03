import type { Prisma } from '@prisma/client';
import { type CategoryDto, normalizeSearchText } from '@etiquetas/shared';
import { prisma } from '../../db.js';

export async function listCategories(): Promise<CategoryDto[]> {
  const categories = await prisma.category.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { products: { where: { active: true } } } } },
  });
  return categories.map((c) => ({ id: c.id, name: c.name, productCount: c._count.products }));
}

export type CategoryResolver = (name: string | null) => Promise<number | null>;

/**
 * Crea una función que devuelve el id de la categoría con ese nombre, creándola si no existe.
 * La comparación ignora mayúsculas y acentos para no duplicar "Analgésicos" y "ANALGESICOS".
 * Carga las categorías una sola vez: conviene reutilizarla para muchas filas (importaciones).
 */
export async function createCategoryResolver(tx: Prisma.TransactionClient): Promise<CategoryResolver> {
  const idsByName = new Map((await tx.category.findMany()).map((c) => [normalizeSearchText(c.name), c.id]));
  return async (name) => {
    if (name === null) return null;
    const key = normalizeSearchText(name);
    const existing = idsByName.get(key);
    if (existing !== undefined) return existing;
    const created = await tx.category.create({ data: { name } });
    idsByName.set(key, created.id);
    return created.id;
  };
}

export async function resolveCategoryId(tx: Prisma.TransactionClient, name: string | null): Promise<number | null> {
  return (await createCategoryResolver(tx))(name);
}
