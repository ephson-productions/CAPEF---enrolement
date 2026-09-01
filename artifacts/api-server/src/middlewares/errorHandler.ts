import { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction): void {
  logger.error({ err, reqId: (req as any).id, url: req.url }, "Unhandled server error");

  const statusCode = err.status || err.statusCode || 500;
  const message = statusCode === 500 ? "Une erreur interne du serveur est survenue" : err.message;

  res.status(statusCode).json({
    error: message,
    code: err.code || "INTERNAL_ERROR",
  });
}
