import { NextFunction, Request, Response } from "express";

export class ApiError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export const notFound = (req: Request, res: Response, next: NextFunction) => {
  next(new ApiError(404, `Route not found - ${req.originalUrl}`));
};

// Express recognizes error-handling middleware by its 4-argument signature.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler = (
  err: Error | ApiError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const statusCode = err instanceof ApiError ? err.statusCode : 500;
  const message = err.message || "Internal Server Error";

  console.error(`[error] ${statusCode} - ${message}`);

  res.status(statusCode).json({
    success: false,
    message,
  });
};
