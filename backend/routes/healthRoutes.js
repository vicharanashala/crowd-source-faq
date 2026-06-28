const express = require("express");

const { getDatabaseStatus } = require("../config/db");

const router = express.Router();

router.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome to Samagama AQ Portal API (v1)",
    docs: "Usage: /api/v1/health, /api/v1/search, /api/v1/questions, /api/v1/answers",
  });
});

router.get("/api/v1/health", (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      service: "aq-portal-api",
      status: "ok",
      database: getDatabaseStatus(),
    },
  });
});

module.exports = router;
