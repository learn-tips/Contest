import { Request, Response, NextFunction } from "express";
import ResponseMessage from "../types/Session";
import { logger } from "../logger";

export function errorHandler(
    error: Error,
    req: Request,
    res: Response<ResponseMessage>,
    next: NextFunction
) {
    const statusCode = res.statusCode !== 200 ? res.statusCode : 500;
    logger.error(
        {
            error,
            method: req.method,
            url: req.originalUrl,
        },
        error.message
    );
    res.status(statusCode);
    res.json({
        message: error.message,
    });
}

export function ensureAuthenticated(
    req: Request,
    res: Response<ResponseMessage>,
    next: NextFunction
) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401);
    return next(new Error("Unauthenticated request"));
}
