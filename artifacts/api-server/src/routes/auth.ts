/**
 * Auth routes removed.
 * Login, registration, and account management are no longer supported.
 * All endpoints return 410 Gone so existing clients get a clear signal.
 */
import { Router } from "express";

const router = Router();

const gone = (_req: unknown, res: { status: (c: number) => { json: (b: unknown) => void } }) =>
  res.status(410).json({ error: "Authentication has been removed from this app." });

router.post("/auth/register",  gone);
router.post("/auth/login",     gone);
router.patch("/auth/me",       gone);
router.delete("/auth/me",      gone);
router.get("/auth/me",         gone);

export default router;
