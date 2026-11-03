-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_products" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "barcode" TEXT,
    "sku" TEXT,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "presentation" TEXT,
    "categoryId" INTEGER,
    "priceCents" BIGINT NOT NULL,
    "priceUpdatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastPrintedPriceCents" BIGINT,
    "lastPrintedAt" DATETIME,
    "searchText" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_products" ("active", "barcode", "brand", "categoryId", "createdAt", "id", "lastPrintedAt", "lastPrintedPriceCents", "name", "presentation", "priceCents", "priceUpdatedAt", "sku", "updatedAt") SELECT "active", "barcode", "brand", "categoryId", "createdAt", "id", "lastPrintedAt", "lastPrintedPriceCents", "name", "presentation", "priceCents", "priceUpdatedAt", "sku", "updatedAt" FROM "products";
DROP TABLE "products";
ALTER TABLE "new_products" RENAME TO "products";
CREATE UNIQUE INDEX "products_barcode_key" ON "products"("barcode");
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");
CREATE INDEX "products_name_idx" ON "products"("name");
CREATE INDEX "products_categoryId_idx" ON "products"("categoryId");
CREATE INDEX "products_active_idx" ON "products"("active");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
