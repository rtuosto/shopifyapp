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
  
  const response = await client.request(`
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
                currencyCode
              }
              maxVariantPrice {
                amount
                currencyCode
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
  `);

  return response.data;
}

export async function updateProduct(session: Session, productId: string, updates: {
  title?: string;
  descriptionHtml?: string;
}) {
  const client = new shopify.clients.Graphql({ session });

  const response = await client.request(
    `mutation productUpdate($input: ProductInput!) {
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
    }`,
    {
      variables: {
        input: {
          id: productId,
          ...updates,
        },
      },
    }
  );
  
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