import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
    role: string;
  };
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    res.status(401).json({ error: "Access token is missing or invalid" });
    return;
  }

  jwt.verify(token, process.env.JWT_SECRET || "default_dev_secret", (err: any, user: any) => {
    if (err) {
      res.status(403).json({ error: "Token is expired or invalid" });
      return;
    }
    req.user = user;
    next();
  });
};

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user || req.user.role !== "Admin") {
    res.status(403).json({ error: "Access denied. Administrator privileges required." });
    return;
  }
  next();
};
