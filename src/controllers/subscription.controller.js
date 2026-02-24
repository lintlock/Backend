import SubscriptionPlan from "../models/subsciptionPlan.modal.js";
import asyncHandler from "../utility/asyncHandler.js";
import { logEvent } from "../services/auditLogger.js";
import Subscription from "../models/subscription.modal.js";

export const createSubscriptionPlan = asyncHandler(async (req, res, next) => {
  const { name, price, plan_type, durationMonths, trialDays, isActive, priceId } = req.body;

  if (!name || typeof name !== "string" || !name.trim()) {
    return next({ message: "`name` is required", statusCode: 400 });
  }
  if (price === undefined || isNaN(Number(price))) {
    return next({ message: "`price` is required and must be a number", statusCode: 400 });
  }
  if (!plan_type || !["trial", "basic", "pro","test"].includes(plan_type)) {
    return next({ message: "`plan_type` is required and must be one of: trial, basic, pro", statusCode: 400 });
  }

  const payload = {
    name: name.trim(),
    price: Number(price),
    plan_type,
    priceId,
    ...(durationMonths ? { durationMonths: Number(durationMonths) } : {}),
    ...(trialDays ? { trialDays: Number(trialDays) } : {}),
    ...(typeof isActive === 'boolean' ? { isActive } : {}),
  };

  const plan = await SubscriptionPlan.create(payload);

  logEvent({
    user: req.user,
    action: "SUBSCRIPTION_PLAN_CREATED",
    entity: "SubscriptionPlan",
    entityId: plan._id,
    metadata: {
      planName: plan.name,
      planType: plan.plan_type,
      price: plan.price,
    },
  });

  return res.status(200).json({ message: "Subscription plan created", plan });
});

export const getSubscriptionPlans = asyncHandler(async (req, res) => {
  
  const userId = req.user._id;
  const plans = await SubscriptionPlan.find({ isActive: true }).lean();

  const userSubscriptions = await Subscription.find({
    ownerId: userId,
    status: { $in: ["active", "trial"] },
    currentPeriodEnd: { $gt: new Date() },
  }).select("planId");

  const purchasedPlanIds = new Set(
    userSubscriptions.map((s) => String(s.planId))
  );

  const plansWithPurchaseInfo = plans.map((plan) => ({
    ...plan,
    isPurchased: purchasedPlanIds.has(String(plan._id)),
  }));

  return res.status(200).json({
    plans: plansWithPurchaseInfo,
  });
});


export const updateSubscriptionPlan = asyncHandler(async (req, res, next) => {
  const planId = req.query.planId;
  const { name, price, durationMonths, trialDays, isActive } = req.body;
  const updateData = {
    ...(name ? { name: name.trim() } : {}),
    ...(price !== undefined && !isNaN(Number(price)) ? { price: Number(price) } : {}),  
    ...(durationMonths !== undefined && !isNaN(Number(durationMonths)) ? { durationMonths: Number(durationMonths) } : {}),
    ...(trialDays !== undefined && !isNaN(Number(trialDays)) ? { trialDays: Number(trialDays) } : {}),
    ...(typeof isActive === 'boolean' ? { isActive } : {}),
  };
  const plan = await SubscriptionPlan.findOneAndUpdate(
    { _id: planId },
      { $set: updateData },
    { new: true, runValidators: true }
  );
  if (!plan) {
    return next({ message: "Subscription plan not found", statusCode: 404 });
  }

  logEvent({
    user: req.user,
    action: "SUBSCRIPTION_PLAN_UPDATED",
    entity: "SubscriptionPlan",
    entityId: plan._id,
    metadata: {
      planName: plan.name,
      updatedFields: Object.keys(updateData),
    },
  });

  return res.status(200).json({ message: "Subscription plan updated", plan });
});

export const deleteSubscriptionPlan = asyncHandler(async (req, res, next) => {
  const { planId } = req.query;
  const plan = await SubscriptionPlan.findOneAndDelete({ _id: planId });
  if (!plan) {
    return next({ message: "Subscription plan not found", statusCode: 404 });
  }

  logEvent({
    user: req.user,
    action: "SUBSCRIPTION_PLAN_DELETED",
    entity: "SubscriptionPlan",
    entityId: planId,
    metadata: {
      planName: plan.name,
      planType: plan.plan_type,
    },
  });

  return res.status(200).json({ message: "Subscription plan deleted" });;
});

export const getSubscriptionPlanById = asyncHandler(async (req, res, next) => {
  const { planId } = req.query;
  const plan = await SubscriptionPlan.findOne({ _id: planId });
  if (!plan) {
    return next({ message: "Subscription plan not found", statusCode: 404 });
  }
  return res.status(200).json({ plan });
});


