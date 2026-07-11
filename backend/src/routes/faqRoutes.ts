import { Router } from "express";

import {
  getFaqs,
  getFaqById,
  createFaq,
  updateFaq,
  deleteFaq,
} from "../controllers/faqController";

const router = Router();

router.get("/", getFaqs);

router.get("/:id", getFaqById);

router.post("/", createFaq);

router.put("/:id", updateFaq);

router.delete("/:id", deleteFaq);

export default router;