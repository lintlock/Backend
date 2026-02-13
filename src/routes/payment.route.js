import express from "express";
import { authenticated } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/roles.middleware.js";
import { cancelSubscription, createCheckoutSession, getMySubscription, getPaymentHistory } from "../controllers/payment.controller.js";

const router = express.Router();

// Protected routes - require authentication
router.post("/create-checkout-session", authenticated,authorizeRoles("owner") , createCheckoutSession);
router.get("/payment-history", authenticated, authorizeRoles("owner","admin") , getPaymentHistory);
router.get("/my-subscription", authenticated, authorizeRoles("owner") , getMySubscription);
router.put("/cancel-Subscription",authenticated,authorizeRoles("owner"),cancelSubscription);

export default router;
