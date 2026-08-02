/**
 * Password reset routes removed.
 * Forgot-password and reset-password endpoints are no longer available.
 * No emails are sent. All endpoints return 410 Gone.
 */
import { Router } from "express";

const router = Router();

const gone = (_req: unknown, res: { status: (c: number) => { json: (b: unknown) => void } }) =>
  res.status(410).json({ error: "Password reset has been removed from this app." });

router.post("/auth/forgot-password", gone);
router.post("/auth/reset-password",  gone);

export default router;
