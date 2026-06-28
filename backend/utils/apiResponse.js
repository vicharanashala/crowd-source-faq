class ApiResponse {
  static success(res, { statusCode = 200, data = null, message = null, meta = null } = {}) {
    const body = {
      success: true,
    };

    if (message) {
      body.message = message;
    }

    if (data !== null) {
      body.data = data;
    }

    if (meta !== null) {
      body.meta = meta;
    }

    return res.status(statusCode).json(body);
  }

  static created(res, { data = null, message = "Created", meta = null } = {}) {
    return ApiResponse.success(res, {
      statusCode: 201,
      data,
      message,
      meta,
    });
  }

  static error(
    res,
    { statusCode = 500, message = "Request failed", details = null, stack = null } = {}
  ) {
    const body = {
      success: false,
      error: {
        message,
      },
    };

    if (details !== null) {
      body.error.details = details;
    }

    if (stack) {
      body.error.stack = stack;
    }

    return res.status(statusCode).json(body);
  }
}

module.exports = ApiResponse;
