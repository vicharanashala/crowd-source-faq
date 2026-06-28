const express = require("express");

const { searchAndTriage } = require("../controllers/triageController");

const router = express.Router();

router.get("/", searchAndTriage);

module.exports = router;
