import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

// Fail fast with clear errors so Railway runtime logs show the cause
if (!process.env.APP_URL) throw new Error("APP_URL required");
if (!process.env.SESSION_SECRET) {
  console.error("ERROR: SESSION_SECRET is required. Set it in Railway → Variables.");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is required. Set it in Railway → Variables.");
  process.exit(1);
}

const port = parseInt(process.env.PORT || "3000", 10);
console.log(`[startup] NODE_ENV=${process.env.NODE_ENV} PORT=${port} APP_URL=${process.env.APP_URL ? "(set)" : "(missing)"}`);

const app = express();

// Health check for Railway/proxy – respond before any DB or heavy init
app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

// Log every request so we can see in Railway logs if traffic reaches the app
app.use((req, _res, next) => {
  console.log("[request]", req.method, req.path);
  next();
});

// Configure PostgreSQL session store
const PgSession = connectPgSimple(session);
const pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

// Configure session middleware with PostgreSQL storage
app.use(session({
  store: new PgSession({
    pool: pgPool,
    tableName: 'session',
    createTableIfMissing: true,
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  }
}));

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  const frameAncestors = [
    'https://admin.shopify.com',
    'https://*.myshopify.com',
  ].join(' ');
  res.setHeader(
    'Content-Security-Policy',
    `frame-ancestors ${frameAncestors};`
  );

  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    const server = await registerRoutes(app);

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      console.error("[express] Error:", message, err.stack ?? "");
      if (!res.headersSent) res.status(status).json({ message });
    });

    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    const host = process.env.HOST ?? (process.env.NODE_ENV === 'development' ? '127.0.0.1' : '0.0.0.0');
    server.listen({
      port,
      host,
      ...(process.env.NODE_ENV === 'production' && { reusePort: true }),
    }, () => {
      const dbHost = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).hostname : "(not set)";
      log(`serving at http://${host}:${port}`);
      log(`database: ${dbHost}`);
    });
  } catch (err) {
    console.error("Startup failed:", err instanceof Error ? err.message : err);
    if (err instanceof Error && err.stack) console.error(err.stack);
    process.exit(1);
  }
})();
