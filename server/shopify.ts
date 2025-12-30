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
  try {
    console.log('[Shopify API] Fetching products with session:', {
      shop: session.shop,
      hasAccessToken: !!session.accessToken,
      scopes: session.scope,
    });
    
    const client = new shopify.clients.Graphql({ session });
    let allProducts: any[] = [];
    let hasNextPage = true;
    let cursor: string | null = null;
    
    while (hasNextPage) {
      console.log('[Shopify API] Executing GraphQL query...', cursor ? `after: ${cursor}` : 'initial page');
      
      const response = await client.request(`
        query ($cursor: String) {
          products(first: 50, after: $cursor) {
            edges {
              node {
                id
                handle
                title
                description
                priceRangeV2 {
                  minVariantPrice {
                    amount
                    currencyCode
                  }
                  maxVariantPrice {
                    amount
                    currencyCode
                  }
                }
                variants(first: 100) {
                  edges {
                    node {
                      id
                      price
                      inventoryItem {
                        unitCost {
                          amount
                        }
                      }
                      title
                    }
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
              cursor
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `, {
        variables: {
          cursor
        }
      });

      if (response.errors) {
        console.error('[Shopify API] GraphQL errors:', response.errors);
        throw new Error(`GraphQL errors: ${JSON.stringify(response.errors)}`);
      }
      
      const data = response.data as any;
      const products = data?.products?.edges || [];
      allProducts = allProducts.concat(products);
      
      hasNextPage = data?.products?.pageInfo?.hasNextPage || false;
      cursor = data?.products?.pageInfo?.endCursor || null;
      
      console.log('[Shopify API] Fetched ${products.length} products, hasNextPage: ${hasNextPage}');
    }
    
    console.log(`[Shopify API] Total products fetched: ${allProducts.length}`);
    
    return {
      products: {
        edges: allProducts
      }
    };
  } catch (error) {
    console.error('[Shopify API] Error fetching products:', error);
    if (error instanceof Error) {
      console.error('[Shopify API] Error message:', error.message);
      console.error('[Shopify API] Error stack:', error.stack);
    }
    throw error;
  }
}

export async function updateProduct(session: Session, productId: string, updates: {
  title?: string;
  descriptionHtml?: string;
  variants?: Array<{
    id: string;
    price?: string;
  }>;
}) {
  const client = new shopify.clients.Graphql({ session });

  // Separate variant updates from product updates
  const { variants, ...productUpdates } = updates;

  // Update product fields (title, description)
  const response = await client.request(
    `mutation productUpdate($input: ProductInput!) {
      productUpdate(input: $input) {
        product {
          id
          title
          descriptionHtml
          variants(first: 1) {
            edges {
              node {
                id
                price
              }
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        input: {
          id: productId,
          ...productUpdates,
        },
      },
    }
  );
  
  if (response.data?.productUpdate?.userErrors?.length > 0) {
    console.error('[Shopify API] Product update errors:', response.data.productUpdate.userErrors);
    throw new Error(`Product update failed: ${JSON.stringify(response.data.productUpdate.userErrors)}`);
  }

  // Update variant prices separately if provided
  if (variants && variants.length > 0) {
    // Filter variants that have price updates
    const variantsWithPrices = variants.filter(v => v.price !== undefined) as Array<{ id: string; price: string }>;
    if (variantsWithPrices.length > 0) {
      await updateVariantPrices(session, productId, variantsWithPrices);
    }
  }
  
  return response.data;
}

// Update variant prices using bulk update mutation
async function updateVariantPrices(session: Session, productId: string, variants: Array<{ id: string; price: string }>) {
  const client = new shopify.clients.Graphql({ session });
  
  const response = await client.request(
    `mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants {
          id
          price
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        productId: productId,
        variants: variants,
      },
    }
  );

  if (response.data?.productVariantsBulkUpdate?.userErrors?.length > 0) {
    console.error('[Shopify API] Variant update errors:', response.data.productVariantsBulkUpdate.userErrors);
    throw new Error(`Variant update failed: ${JSON.stringify(response.data.productVariantsBulkUpdate.userErrors)}`);
  }

  return response.data;
}

// Get product variants to update pricing
export async function getProductVariants(session: Session, productId: string) {
  const client = new shopify.clients.Graphql({ session });
  
  const response = await client.request(`
    query getProduct($id: ID!) {
      product(id: $id) {
        id
        title
        descriptionHtml
        variants(first: 10) {
          edges {
            node {
              id
              price
            }
          }
        }
      }
    }
  `, {
    variables: { id: productId }
  });
  
  return response.data;
}

// Get existing webhook subscriptions
export async function getWebhookSubscriptions(session: Session) {
  const client = new shopify.clients.Graphql({ session });
  
  const response = await client.request(`
    query {
      webhookSubscriptions(first: 25) {
        edges {
          node {
            id
            topic
            endpoint {
              __typename
              ... on WebhookHttpEndpoint {
                callbackUrl
              }
            }
          }
        }
      }
    }
  `);
  
  return response.data?.webhookSubscriptions?.edges?.map((edge: any) => edge.node) || [];
}

// Register webhooks for order tracking
export async function registerOrderWebhook(session: Session, webhookUrl: string) {
  const client = new shopify.clients.Graphql({ session });
  
  // First check if webhook already exists
  const existing = await getWebhookSubscriptions(session);
  const ordersWebhook = existing.find((w: any) => w.topic === 'ORDERS_CREATE');
  
  if (ordersWebhook) {
    console.log('[Shopify Webhook] ORDERS_CREATE webhook already exists');
    return { webhookSubscriptionCreate: { webhookSubscription: ordersWebhook } };
  }
  
  const response = await client.request(`
    mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
      webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
        webhookSubscription {
          id
          topic
          endpoint {
            __typename
            ... on WebhookHttpEndpoint {
              callbackUrl
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `, {
    variables: {
      topic: "ORDERS_CREATE",
      webhookSubscription: {
        callbackUrl: webhookUrl,
        format: "JSON",
      },
    },
  });
  
  if (response.data?.webhookSubscriptionCreate?.userErrors?.length > 0) {
    console.error('[Shopify Webhook] Registration errors:', response.data.webhookSubscriptionCreate.userErrors);
    throw new Error(`Webhook registration failed: ${JSON.stringify(response.data.webhookSubscriptionCreate.userErrors)}`);
  }
  
  console.log('[Shopify Webhook] Successfully registered ORDERS_CREATE webhook');
  return response.data;
}

// Session storage using PostgreSQL
import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Initialize session table
async function initSessionTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shopify_sessions (
      id VARCHAR(255) PRIMARY KEY,
      shop VARCHAR(255) NOT NULL,
      state VARCHAR(255) NOT NULL,
      is_online BOOLEAN NOT NULL DEFAULT false,
      scope VARCHAR(1024),
      expires TIMESTAMP,
      access_token VARCHAR(255),
      user_id VARCHAR(255),
      user_first_name VARCHAR(255),
      user_last_name VARCHAR(255),
      user_email VARCHAR(255),
      user_email_verified BOOLEAN,
      account_number INTEGER,
      account_owner BOOLEAN,
      locale VARCHAR(255),
      collaborator BOOLEAN,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Create index on shop for faster lookups
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_shopify_sessions_shop 
    ON shopify_sessions(shop)
  `);
  
  console.log('[Session Storage] Database tables initialized');
}

initSessionTable().catch(err => {
  console.error('[Session Storage] Failed to initialize tables:', err);
});

export const sessionStorage = {
  async storeSession(session: Session): Promise<boolean> {
    try {
      const query = `
        INSERT INTO shopify_sessions (
          id, shop, state, is_online, scope, expires, access_token,
          user_id, user_first_name, user_last_name, user_email,
          user_email_verified, account_number, account_owner,
          locale, collaborator, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO UPDATE SET
          shop = EXCLUDED.shop,
          state = EXCLUDED.state,
          is_online = EXCLUDED.is_online,
          scope = EXCLUDED.scope,
          expires = EXCLUDED.expires,
          access_token = EXCLUDED.access_token,
          user_id = EXCLUDED.user_id,
          user_first_name = EXCLUDED.user_first_name,
          user_last_name = EXCLUDED.user_last_name,
          user_email = EXCLUDED.user_email,
          user_email_verified = EXCLUDED.user_email_verified,
          account_number = EXCLUDED.account_number,
          account_owner = EXCLUDED.account_owner,
          locale = EXCLUDED.locale,
          collaborator = EXCLUDED.collaborator,
          updated_at = CURRENT_TIMESTAMP
      `;
      
      await pool.query(query, [
        session.id,
        session.shop,
        session.state,
        session.isOnline,
        session.scope,
        session.expires,
        session.accessToken,
        (session as any).onlineAccessInfo?.associated_user?.id,
        (session as any).onlineAccessInfo?.associated_user?.first_name,
        (session as any).onlineAccessInfo?.associated_user?.last_name,
        (session as any).onlineAccessInfo?.associated_user?.email,
        (session as any).onlineAccessInfo?.associated_user?.email_verified,
        (session as any).onlineAccessInfo?.associated_user?.account_number,
        (session as any).onlineAccessInfo?.associated_user?.account_owner,
        (session as any).onlineAccessInfo?.associated_user?.locale,
        (session as any).onlineAccessInfo?.associated_user?.collaborator,
      ]);
      
      console.log(`[Session Storage] Stored session for shop: ${session.shop}`);
      return true;
    } catch (error) {
      console.error('[Session Storage] Error storing session:', error);
      return false;
    }
  },
  
  async loadSession(id: string): Promise<Session | undefined> {
    try {
      const result = await pool.query(
        'SELECT * FROM shopify_sessions WHERE id = $1',
        [id]
      );
      
      if (result.rows.length === 0) {
        return undefined;
      }
      
      const row = result.rows[0];
      return rowToSession(row);
    } catch (error) {
      console.error('[Session Storage] Error loading session:', error);
      return undefined;
    }
  },
  
  async deleteSession(id: string): Promise<boolean> {
    try {
      await pool.query('DELETE FROM shopify_sessions WHERE id = $1', [id]);
      return true;
    } catch (error) {
      console.error('[Session Storage] Error deleting session:', error);
      return false;
    }
  },
  
  async deleteSessions(ids: string[]): Promise<boolean> {
    try {
      await pool.query(
        'DELETE FROM shopify_sessions WHERE id = ANY($1)',
        [ids]
      );
      return true;
    } catch (error) {
      console.error('[Session Storage] Error deleting sessions:', error);
      return false;
    }
  },
  
  async findSessionsByShop(shop: string): Promise<Session[]> {
    try {
      const result = await pool.query(
        'SELECT * FROM shopify_sessions WHERE shop = $1',
        [shop]
      );
      
      return result.rows.map(rowToSession);
    } catch (error) {
      console.error('[Session Storage] Error finding sessions:', error);
      return [];
    }
  },
  
  async getSessionByShop(shop: string): Promise<Session | undefined> {
    try {
      const result = await pool.query(
        'SELECT * FROM shopify_sessions WHERE shop = $1 ORDER BY created_at DESC LIMIT 1',
        [shop]
      );
      
      if (result.rows.length === 0) {
        console.log(`[Session Storage] No session found for shop: ${shop}`);
        return undefined;
      }
      
      console.log(`[Session Storage] Found session for shop: ${shop}`);
      return rowToSession(result.rows[0]);
    } catch (error) {
      console.error('[Session Storage] Error getting session by shop:', error);
      return undefined;
    }
  },
};

/**
 * Create a template clone product for theme analysis
 * Creates a product with all fields populated (title, description, price, variants, images)
 * Product is marked as draft and unlisted so it doesn't appear in the store
 */
export async function createTemplateCloneProduct(session: Session): Promise<{ id: string; handle: string }> {
  const client = new shopify.clients.Graphql({ session });
  
  const response = await client.request(`
    mutation createProduct($input: ProductInput!) {
      productCreate(input: $input) {
        product {
          id
          handle
        }
        userErrors {
          field
          message
        }
      }
    }
  `, {
    variables: {
      input: {
        title: "Shoptimizer Theme Analysis Template (DO NOT DELETE)",
        descriptionHtml: `<div style="margin: 20px 0;">
          <h3>Product Description</h3>
          <p>This is a template product used by Shoptimizer to analyze your theme's layout and positioning. It contains sample content to help determine where different elements should appear on your product pages.</p>
          <ul>
            <li>Feature one: Premium quality materials</li>
            <li>Feature two: Free shipping on orders over $50</li>
            <li>Feature three: 30-day money-back guarantee</li>
          </ul>
          <p><strong>This product is hidden and will not appear in your store.</strong></p>
        </div>`,
        vendor: "Shoptimizer",
        productType: "System Template",
        status: "DRAFT", // Draft products are hidden from storefront
        tags: ["shoptimizer-template", "do-not-delete"],
        variants: [
          {
            price: "99.99",
            inventoryPolicy: "DENY",
            inventoryManagement: "SHOPIFY",
            inventoryQuantities: {
              availableQuantity: 0,
              locationId: "gid://shopify/Location/1" // Default location
            }
          }
        ]
      }
    }
  });

  if (response.data?.productCreate?.userErrors?.length > 0) {
    console.error('[Shopify API] Clone product creation errors:', response.data.productCreate.userErrors);
    throw new Error(`Clone product creation failed: ${JSON.stringify(response.data.productCreate.userErrors)}`);
  }

  const product = response.data?.productCreate?.product;
  if (!product) {
    throw new Error('Clone product creation returned no product data');
  }

  console.log(`[Shopify API] Created template clone product: ${product.id} (${product.handle})`);
  return {
    id: product.id,
    handle: product.handle
  };
}

/**
 * Delete a clone product by ID
 */
export async function deleteCloneProduct(session: Session, productId: string): Promise<boolean> {
  const client = new shopify.clients.Graphql({ session });
  
  const response = await client.request(`
    mutation deleteProduct($input: ProductDeleteInput!) {
      productDelete(input: $input) {
        deletedProductId
        userErrors {
          field
          message
        }
      }
    }
  `, {
    variables: {
      input: {
        id: productId
      }
    }
  });

  if (response.data?.productDelete?.userErrors?.length > 0) {
    console.error('[Shopify API] Clone product deletion errors:', response.data.productDelete.userErrors);
    return false;
  }

  console.log(`[Shopify API] Deleted clone product: ${productId}`);
  return true;
}

/**
 * Fetch storefront HTML for a product page
 * This is used to analyze theme structure and DOM positioning
 */
export async function fetchProductPageHtml(shop: string, productHandle: string): Promise<string> {
  // Construct storefront URL
  const storefrontUrl = `https://${shop}/products/${productHandle}`;
  
  console.log(`[Shopify API] Fetching storefront HTML from: ${storefrontUrl}`);
  
  try {
    const response = await fetch(storefrontUrl, {
      headers: {
        'User-Agent': 'Shoptimizer Theme Analyzer/1.0'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const html = await response.text();
    console.log(`[Shopify API] Fetched ${html.length} bytes of HTML`);
    
    return html;
  } catch (error) {
    console.error('[Shopify API] Error fetching storefront HTML:', error);
    throw error;
  }
}

/**
 * Fetch the current published theme ID and name from Shopify
 */
export async function fetchCurrentTheme(session: Session): Promise<{ id: string; name: string } | null> {
  const client = new shopify.clients.Graphql({ session });
  
  try {
    const response = await client.request(`
      query {
        themes(first: 10) {
          edges {
            node {
              id
              name
              role
            }
          }
        }
      }
    `);
    
    if (response.errors) {
      console.error('[Shopify API] Theme fetch errors:', response.errors);
      return null;
    }
    
    const themes = response.data?.themes?.edges || [];
    const publishedTheme = themes.find((edge: any) => edge.node.role === 'MAIN');
    
    if (publishedTheme) {
      console.log(`[Shopify API] Found published theme: ${publishedTheme.node.name} (${publishedTheme.node.id})`);
      return {
        id: publishedTheme.node.id,
        name: publishedTheme.node.name
      };
    }
    
    console.log('[Shopify API] No published theme found');
    return null;
  } catch (error) {
    console.error('[Shopify API] Error fetching theme:', error);
    return null;
  }
}

// Helper function to convert database row to Session object
function rowToSession(row: any): Session {
  const session = new Session({
    id: row.id,
    shop: row.shop,
    state: row.state,
    isOnline: row.is_online,
  });
  
  if (row.scope) session.scope = row.scope;
  if (row.expires) session.expires = row.expires;
  if (row.access_token) session.accessToken = row.access_token;
  
  // Reconstruct onlineAccessInfo if user data exists
  if (row.user_id) {
    (session as any).onlineAccessInfo = {
      associated_user: {
        id: row.user_id,
        first_name: row.user_first_name,
        last_name: row.user_last_name,
        email: row.user_email,
        email_verified: row.user_email_verified,
        account_number: row.account_number,
        account_owner: row.account_owner,
        locale: row.locale,
        collaborator: row.collaborator,
      },
    };
  }
  
  return session;
}