import { Session } from "@shopify/shopify-api";
import { fetchProducts } from "./shopify";
import { storage } from "./storage";
import { Product } from "@shared/schema";

interface ShopifyProduct {
  id: string;
  title: string;
  description: string | null;
  priceRangeV2: {
    minVariantPrice: {
      amount: string;
    };
  };
  compareAtPriceRange: {
    minVariantPrice: {
      amount: string | null;
    } | null;
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
    console.log(`Starting product sync for shop: ${session.shop}`);
    
    const response = await fetchProducts(session);
    const products = (response as any).data?.products?.edges || [];
    
    let syncedCount = 0;
    
    for (const edge of products) {
      const shopifyProduct: ShopifyProduct = edge.node;
      
      const productData: Omit<Product, 'id' | 'createdAt' | 'updatedAt'> = {
        shopifyProductId: shopifyProduct.id,
        title: shopifyProduct.title,
        description: shopifyProduct.description || "",
        price: shopifyProduct.priceRangeV2.minVariantPrice.amount,
        compareAtPrice: shopifyProduct.compareAtPriceRange?.minVariantPrice?.amount || null,
        images: shopifyProduct.images.edges.map(img => img.node.url),
        rating: null,
        reviewCount: 0,
      };
      
      const existingProducts = await storage.getProducts(session.shop);
      const existing = existingProducts.find(p => p.shopifyProductId === shopifyProduct.id);
      
      if (existing) {
        await storage.updateProduct(session.shop, existing.id, productData);
      } else {
        await storage.createProduct(session.shop, productData);
      }
      
      syncedCount++;
    }
    
    console.log(`Successfully synced ${syncedCount} products for shop: ${session.shop}`);
    return syncedCount;
  } catch (error) {
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
