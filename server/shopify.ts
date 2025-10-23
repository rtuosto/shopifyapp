import "@shopify/shopify-api/adapters/node";
import { shopifyApi, Session, LogSeverity, ApiVersion } from "@shopify/shopify-api";

// Initialize Shopify API
export const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY!,
  apiSecretKey: process.env.SHOPIFY_API_SECRET!,
  scopes: ["read_products", "write_products", "read_orders"],
  hostName: process.env.REPLIT_DEV_DOMAIN || "localhost:5000",
  hostScheme: process.env.REPLIT_DEV_DOMAIN ? "https" : "http",
  apiVersion: ApiVersion.October24,
  isEmbeddedApp: true,
  logger: {
    level: LogSeverity.Info,
  },
});

// GraphQL query helpers
export async function fetchProducts(session: Session) {
  const client = new shopify.clients.Graphql({ session });
  
  const query = `
    query {
      products(first: 50) {
        edges {
          node {
            id
            title
            description
            priceRangeV2 {
              minVariantPrice {
                amount
              }
            }
            compareAtPriceRange {
              minVariantPrice {
                amount
              }
            }
            images(first: 5) {
              edges {
                node {
                  url
                }
              }
            }
          }
        }
      }
    }
  `;

  const response = await client.query({ data: query });
  return response.body;
}

export async function updateProduct(session: Session, productId: string, updates: {
  title?: string;
  descriptionHtml?: string;
}) {
  const client = new shopify.clients.Graphql({ session });
  
  const mutation = `
    mutation productUpdate($input: ProductInput!) {
      productUpdate(input: $input) {
        product {
          id
          title
          descriptionHtml
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    input: {
      id: productId,
      ...updates,
    },
  };

  const response = await client.query({ 
    data: { 
      query: mutation, 
      variables 
    } 
  });
  
  return response.body;
}

// Session storage (simple in-memory for demo, should use DB in production)
const sessions = new Map<string, Session>();

export const sessionStorage = {
  async storeSession(session: Session): Promise<boolean> {
    sessions.set(session.id, session);
    // Also store by shop for easy lookup
    const shopKey = `shop_${session.shop}`;
    sessions.set(shopKey, session);
    return true;
  },
  
  async loadSession(id: string): Promise<Session | undefined> {
    return sessions.get(id);
  },
  
  async deleteSession(id: string): Promise<boolean> {
    return sessions.delete(id);
  },
  
  async deleteSessions(ids: string[]): Promise<boolean> {
    for (const id of ids) {
      sessions.delete(id);
    }
    return true;
  },
  
  async findSessionsByShop(shop: string): Promise<Session[]> {
    return Array.from(sessions.values()).filter(s => s.shop === shop);
  },
  
  async getSessionByShop(shop: string): Promise<Session | undefined> {
    const shopKey = `shop_${shop}`;
    return sessions.get(shopKey);
  },
};