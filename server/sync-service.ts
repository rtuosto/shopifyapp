import { Session } from "@shopify/shopify-api";
import { fetchProducts } from "./shopify";
import { storage } from "./storage";
import { InsertProduct } from "@shared/schema";
import { startSync, completeSyncSuccess, completeSyncError } from "./sync-status";

interface ShopifyProduct {
  id: string;
  title: string;
  description: string | null;
  priceRangeV2: {
    minVariantPrice: {
      amount: string;
      currencyCode: string;
    };
    maxVariantPrice: {
      amount: string;
      currencyCode: string;
    };
  };
  images: {
    edges: Array<{
      node: {
        url: string;
      };
    }>;
  };
}

export async function syncProductsFromShopify(session: Session): Promise<number> {
  try {
    startSync(session.shop);
    console.log(`Starting product sync for shop: ${session.shop}`);
    
    const response = await fetchProducts(session);
    console.log(`[Sync] GraphQL response:`, JSON.stringify(response, null, 2));
    
    const shopifyProducts = (response as any).products?.edges || [];
    console.log(`[Sync] Found ${shopifyProducts.length} products`);
    
    let syncedCount = 0;
    
    for (const edge of shopifyProducts) {
      const shopifyProduct: ShopifyProduct = edge.node;
      
      const productData: InsertProduct = {
        shopifyProductId: shopifyProduct.id,
        title: shopifyProduct.title,
        description: shopifyProduct.description || null,
        price: shopifyProduct.priceRangeV2.minVariantPrice.amount,
        compareAtPrice: null,
        images: shopifyProduct.images.edges.map(img => img.node.url),
        rating: null,
        reviewCount: 0,
      };
      
      console.log(`[Sync] Processing product: ${shopifyProduct.title}`);
      
      // Check if product already exists using shopifyProductId
      const existing = await storage.getProductByShopifyId(session.shop, shopifyProduct.id);
      
      if (existing) {
        await storage.updateProduct(session.shop, existing.id, productData);
      } else {
        await storage.createProduct(session.shop, productData);
      }
      
      syncedCount++;
    }
    
    completeSyncSuccess(session.shop, syncedCount);
    console.log(`Successfully synced ${syncedCount} products for shop: ${session.shop}`);
    return syncedCount;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    completeSyncError(session.shop, errorMessage);
    console.error("Error syncing products from Shopify:", error);
    throw error;
  }
}

export async function initializeShopData(session: Session): Promise<void> {
  try {
    console.log(`Initializing shop data for: ${session.shop}`);
    
    await syncProductsFromShopify(session);
    
    console.log(`Shop initialization complete for: ${session.shop}`);
  } catch (error) {
    console.error("Error initializing shop data:", error);
    throw error;
  }
}
