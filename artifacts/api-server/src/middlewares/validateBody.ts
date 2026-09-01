import { Request, Response, NextFunction } from "express";
import { z } from "zod";

export function validateBody<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Support both direct payload and Orval nested `{ data: ... }` payload
    const bodyToValidate = req.body?.data && typeof req.body.data === "object" ? req.body.data : req.body;

    const result = schema.safeParse(bodyToValidate);
    if (!result.success) {
      res.status(400).json({
        error: "Payload de requête invalide",
        details: result.error.format(),
      });
      return;
    }

    // Assign validated and typed data back to req.body
    req.body = result.data as any;
    next();
  };
}
