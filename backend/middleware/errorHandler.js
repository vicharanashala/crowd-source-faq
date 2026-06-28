const notFoundHandler = (req, res, next) => {
  const error = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || err.status || 500;
  const isDevelopment = process.env.NODE_ENV === "development";

  res.status(statusCode).json({
    success: false,
    error: {
      message:
        statusCode === 500 && !isDevelopment
          ? "Internal server error"
          : err.message || "Request failed",
      ...(isDevelopment && { stack: err.stack }),
    },
  });
};

module.exports = {
  notFoundHandler,
  errorHandler,
};
