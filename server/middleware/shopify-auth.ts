import { Request, Response, NextFunction } from "express";
import { sessionStorage, shopify } from "../shopify";

// Middleware to verify Shopify session
export async function requireShopifySession(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // Get shop from query parameter or header
    const rawShop = (req.query.shop as string) || req.headers["x-shopify-shop"] as string;
    const shop = rawShop ? shopify.utils.sanitizeShop(rawShop, true) : null;
    
    if (!shop) {
      return res.status(401).json({ 
        error: "Missing shop parameter. Please authenticate via Shopify." 
      });
    }

    // Load session for this shop
    const session = await sessionStorage.getSessionByShop(shop);
    
    if (!session) {
      return res.status(401).json({ 
        error: "No valid session found. Please authenticate via Shopify.",
        redirectUrl: `/api/auth?shop=${shop}`
      });
    }

    // Check if session is expired
    if (session.expires && new Date(session.expires) < new Date()) {
      await sessionStorage.deleteSession(session.id);
      return res.status(401).json({ 
        error: "Session expired. Please re-authenticate.",
        redirectUrl: `/api/auth?shop=${shop}`
      });
    }

    // Attach session to request for use in routes
    (req as any).shopifySession = session;
    (req as any).shop = shop;
    
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(500).json({ error: "Authentication error" });
  }
}

// Middleware that allows development testing with default shop
// but still enforces session validation
export function requireShopifySessionOrDev(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const rawShop = (req.query.shop as string) || req.headers["x-shopify-shop"] as string;
  const shop = rawShop ? shopify.utils.sanitizeShop(rawShop, true) : null;
  
  // If no shop provided in development, use default dev store
  if (!shop && process.env.NODE_ENV === "development") {
    (req as any).shop = "cro-autopilot-dev-store.myshopify.com";
    return next();
  }
  
  // Otherwise require proper session
  return requireShopifySession(req, res, next);
}