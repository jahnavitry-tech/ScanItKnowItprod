import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes, IMG_DIR } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import dotenv from "dotenv";
import { logger } from "./logger";

// Load environment variables
dotenv.config();

const app = express();

// Serve saved product images. Must be registered before registerRoutes so the
// static handler takes priority over the Vite catch-all in development.
app.use("/api/images", express.static(IMG_DIR, { maxAge: "1d", etag: true }));

// Increase payload limits for image base64 strings
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

logger.info("=".repeat(60));
logger.info("Server starting — NODE_ENV:", process.env.NODE_ENV);
logger.info("GEMINI_API_KEY present:      ", !!process.env.GEMINI_API_KEY);
logger.info("HUGGINGFACE_API_KEY present: ", !!process.env.HUGGINGFACE_API_KEY);
logger.info("OCR_API_KEY present:         ", !!process.env.OCR_API_KEY);
logger.info("USDA_API_KEY present:        ", !!process.env.USDA_API_KEY);
logger.info("Log file →", logger.filePath());
logger.info("=".repeat(60));

app.use((req, res, next) => {
  const start = Date.now();
  const reqPath = req.path;
  let capturedBody: Record<string, any> | undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedBody = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const ms = Date.now() - start;
    if (reqPath.startsWith("/api")) {
      logger.api(req.method, reqPath, res.statusCode, ms,
        res.statusCode >= 400 ? capturedBody : undefined);
      // Also keep the original short Vite log for the console
      let logLine = `${req.method} ${reqPath} ${res.statusCode} in ${ms}ms`;
      if (logLine.length > 80) logLine = logLine.slice(0, 79) + "…";
      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status  = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    logger.error(`Unhandled error on ${req.method} ${req.path}:`, message, err.stack ?? "");
    res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 10000 if not specified for Render compatibility.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '10000', 10);
  const host = '0.0.0.0';
  
  server.listen(port, host, () => {
    log(`[express] serving on ${host}:${port}`);
  });
})();
