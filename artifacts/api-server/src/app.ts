import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { errorHandler } from "./middlewares/errorHandler";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

// TODO: remove once fully migrated off Vercel
const legacyAllowedOrigins = [
  "https://capef-enrolement-capef.vercel.app",
  "https://capef-enrolement-capef-95fjqmhhx-ephson-productions-projects.vercel.app",
  "https://platforme-denrolement-digital-capef.onrender.com",
];

const envFrontendUrls = process.env.FRONTEND_URLS
  ? process.env.FRONTEND_URLS.split(",").map((url) => url.trim()).filter(Boolean)
  : [];

const envFrontendUrl = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL.trim()]
  : [];

const allowedOrigins = [
  ...legacyAllowedOrigins,
  ...envFrontendUrl,
  ...envFrontendUrls,
];

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    const isAllowed =
      allowedOrigins.includes(origin) ||
      origin.startsWith("http://localhost:") ||
      origin.startsWith("http://127.0.0.1:") ||
      origin.endsWith(".vercel.app") ||
      origin.endsWith("-ephson-productions-projects.vercel.app");

    if (!isAllowed) {
      logger.warn({ origin }, "CORS request rejected for origin");
    }

    callback(null, isAllowed);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.get("/", (_req, res) => {
  res.status(200).json({
    status: "ok",
    message: "API Server is active and healthy",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api", router);
app.use(errorHandler);

export default app;
