import asyncHandler from "../utility/asyncHandler.js";
import Subscription from "../models/subscription.modal.js";

/**
 * Middleware to check if the user has an active subscription.
 * If not, returns a 402 status code with a redirect URL to the billing page.
 * 
 * Active subscription statuses: 'active', 'trial'
 * 
 * IMPORTANT: This middleware must be used AFTER the authenticated middleware.
 */
export const verifyActiveSubscription = asyncHandler(async (req, res, next) => {
    const userId = req.user._id;
    const role = req.user.role;

    // Always allow admin users
    if (role === 'admin' || role === 'technician') {
        return next();
    }

    const subscription = await Subscription.findOne({
        ownerId: userId,
        status: { $in: ["active", "trial"] },
        currentPeriodEnd: { $gte: new Date() }
    });

    if (!subscription && role === 'owner') {
        const billingUrl = `/billing-details/${userId}`;
        const frontendBillingUrl = `${process.env.FRONTEND_URL}billing-details/${userId}`;
        const acceptsJson = req.headers.accept && req.headers.accept.includes('application/json');

        if (acceptsJson) {
            return res.status(402).json({
                success: false,
                message: "Active subscription required",
                requiresSubscription: true,
                redirectUrl: billingUrl,
                fullRedirectUrl: frontendBillingUrl
            });
        } else {
            return res.redirect(302, frontendBillingUrl);
        }
    }
    req.subscription = subscription;
    next();
});

