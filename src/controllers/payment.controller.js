import Stripe from "stripe";
import asyncHandler from "../utility/asyncHandler.js";
import Subscription from "../models/subscription.modal.js";
import SubscriptionPlan from "../models/subsciptionPlan.modal.js";
import Payment from "../models/payment.modal.js";
import { logEvent } from "../services/auditLogger.js";
import User from "../models/users.model.js";

let stripe;
const getStripe = () => {
  if (!stripe) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripe;
};

export const createCheckoutSession = asyncHandler(async (req, res) => {
  const { planId } = req.body;
  const userId = req.user._id;

  if (!planId) {
    return res.status(400).json({ message: "planId is required" });
  }

  const plan = await SubscriptionPlan.findById(planId);
  if (!plan || !plan.isActive) {
    return res.status(404).json({ message: "Plan not found or inactive" });
  }

  let stripeCustomerId;
  const existingSub = await Subscription.findOne({ ownerId: userId });

  if (existingSub?.stripeCustomerId) {
    stripeCustomerId = existingSub.stripeCustomerId;
  } else {
    const customer = await getStripe().customers.create({
      email: req.user.email,
      name: req.user.fullName,
      metadata: { userId: userId.toString() },
    });
    stripeCustomerId = customer.id;
  }

  const subscriptionData = {
    metadata: {
      userId: userId.toString(),
      planId: planId.toString(),
    },
  };

  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    customer: stripeCustomerId,
    line_items: [
      {
        price: plan.priceId,
        quantity: 1,
      },
    ],
    subscription_data: subscriptionData,
    ui_mode: "embedded",
    return_url: `${process.env.FRONTEND_URL}subscriptions/complete?session_id={CHECKOUT_SESSION_ID}`,
  });

  res.status(200).json({
    sessionId: session.id,
    clientSecret: session.client_secret,
  });
});

export const stripeWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = getStripe().webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    return res.status(400).send(`Webhook error: ${err.message}`);
  }
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await upsertSubscription(event.data.object);
      break;

    case "customer.subscription.deleted":
      await markSubscriptionCanceled(event.data.object);
      break;

    case "invoice.payment_succeeded":
      await recordPayment(event.data.object);
      break;

    case "invoice.payment_failed":
      await markPaymentFailed(event.data.object);
      break;
  }

  res.json({ received: true });
};

function mapStripeStatus(status) {
  if (["active", "trialing"].includes(status)) return "active";
  if (["past_due", "unpaid"].includes(status)) return "past_due";
  return "cancelled";
}

async function upsertSubscription(stripeSub) {
  console.log("in create subscription web hook", stripeSub);
  

  const items = stripeSub.items.data[0];
  
  const { userId, planId } = stripeSub.metadata || {};
  if (!userId || !planId) return;

  

  const plan = await SubscriptionPlan.findById(planId)
    .select("plan_type name")
    .lean();

  
  const oldSubs = await Subscription.findOne({ ownerId: userId }).select(
    "stripeSubscriptionId",
  );

  await Subscription.findOneAndUpdate(
    { ownerId: userId },
    {
      ownerId: userId,
      planId,
      plan_type: plan.plan_type,
      stripeCustomerId: stripeSub.customer,
      stripeSubscriptionId: stripeSub.id,
      status:
        plan.plan_type === "trial"
          ? "trial"
          : mapStripeStatus(stripeSub.status),
      currentPeriodStart: new Date(items.current_period_start * 1000),
      currentPeriodEnd: new Date(items.current_period_end * 1000),
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
      prevSubscriptionId: oldSubs?.stripeSubscriptionId ?? "",
    },
    { upsert: true, new: true },
  );

  const user = await User.findById(userId);

  await logEvent({
    user,
    action: "SUBSCRIPTION_UPGRADED",
    entity: "subscription",
    entityId: planId,
    metadata: { planName: plan.name },
  });
}

async function markSubscriptionCanceled(stripeSub) {
  const subscription = await Subscription.findOne({
    stripeSubscriptionId: stripeSub.id,
  });
  const status = subscription?.plan_type === "trial" ? "expired" : "past_due";
  await Subscription.findOneAndUpdate(
    { stripeSubscriptionId: stripeSub.id },
    {
      status,
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end ?? false,
      currentPeriodEnd: stripeSub.current_period_end
        ? new Date(stripeSub.current_period_end * 1000)
        : new Date(),
    },
  );
}

// async function recordPayment(invoice) {
//   console.log(invoice);
  
//   if (!invoice.subscription) return;

//   const subscription = await Subscription.findOne({
//     stripeSubscriptionId: invoice.subscription,
//   });

//   if (!subscription) return;

//   const planId =
//     invoice.subscription_details?.metadata?.planId ||
//     invoice.metadata?.planId ||
//     subscription.planId;

//   await Payment.create({
//     userId: subscription.ownerId,
//     subscriptionId: subscription._id,
//     planId,
//     stripeInvoiceId: invoice.id,
//     stripePaymentIntentId: invoice.payment_intent,
//     amount: invoice.amount_paid / 100,
//     currency: invoice.currency,
//     status: "succeeded",
//     invoiceUrl: invoice.hosted_invoice_url,
//     paidAt: new Date(invoice.created * 1000),
//     endAt: subscription.currentPeriodEnd,
//   });

//   if (subscription.prevSubscriptionId) {
//     await getStripe().subscriptions.cancel(subscription.prevSubscriptionId);
//   }
// }

async function recordPayment(invoice) {
  console.log("Processing invoice:", invoice.id);

  const stripeSubscriptionId =
    invoice.subscription ||
    invoice.parent?.subscription_details?.subscription ||
    invoice.lines?.data?.[0]?.parent?.subscription_item_details?.subscription ||
    null;

  if (!stripeSubscriptionId) {
    console.log("No subscription ID found in invoice");
    return;
  }

  const subscription = await Subscription.findOne({
    stripeSubscriptionId,
  });

  if (!subscription) {
    console.log("Subscription not found in DB");
    return;
  }

  const planId =
    invoice.parent?.subscription_details?.metadata?.planId ||
    invoice.lines?.data?.[0]?.metadata?.planId ||
    invoice.metadata?.planId ||
    subscription.planId;

  const existingPayment = await Payment.findOne({
    stripeInvoiceId: invoice.id,
  });

  if (existingPayment) {
    console.log("Payment already recorded");
    return;
  }

  await Payment.create({
    userId: subscription.ownerId,
    subscriptionId: subscription._id,
    planId,
    stripeInvoiceId: invoice.id,
    stripePaymentIntentId: invoice.payment_intent,
    amount: invoice.amount_paid / 100,
    currency: invoice.currency,
    status: invoice.status === 'paid' ? 'succeeded' : 'pending',
    invoiceUrl: invoice.hosted_invoice_url,
    paidAt: new Date(invoice.status_transitions?.paid_at * 1000),
    endAt: subscription.currentPeriodEnd,
  });

  if (subscription.prevSubscriptionId) {
    await getStripe().subscriptions.cancel(
      subscription.prevSubscriptionId
    );
  }

  console.log("Payment recorded successfully");
}

async function markPaymentFailed(invoice) {
  if (!invoice.subscription) return;

  const subscription = await Subscription.findOne({
    stripeSubscriptionId: invoice.subscription,
  });

  if (!subscription) return;

  await Payment.create({
    userId: subscription.ownerId,
    subscriptionId: subscription._id,
    stripeInvoiceId: invoice.id,
    amount: invoice.amount_due / 100,
    currency: invoice.currency,
    status: "failed",
  });
}


export const cancelSubscription = asyncHandler(async (req, res) => {
  const userId = req.query.userId;
  const subscription = await Subscription.findOne({
    ownerId: userId,
    status: "active",
  });

  if (!subscription) {
    return res.status(404).json({ message: "No active subscription found" });
  }

  const stripeSub = await getStripe().subscriptions.update(
    subscription.stripeSubscriptionId,
    {
      cancel_at_period_end: true,
    },
  );

  res.status(200).json({
    success: true,
    message: "Subscription will cancel at period end",
    cancelAt: new Date(stripeSub.current_period_end * 1000),
  });
});


export const getMySubscription = asyncHandler(async (req, res) => {
  const subscription = await Subscription.findOne({
    ownerId: req.user._id,
  }).populate("planId");

  res.status(200).json({ subscription });
});


export const getPaymentHistory = asyncHandler(async (req, res) => {
  const userId = req.query.userId;
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
  const skip = (page - 1) * limit;

  const [payments, total] = await Promise.all([
    Payment.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path: "planId",
        select: "plan_type currentPeriodEnd trialDays durationMonths",
      })
      .lean(),

    Payment.countDocuments({ userId }),
  ]);

  const rows = payments.map((p, index) => ({
    index: skip + index + 1,
    planType: p.planId?.plan_type || "—",
    price: `$${p.amount}`,
    duration:
      p.planId?.trialDays === 0
        ? `${p.planId.durationMonths} Months`
        : `${p.planId.trialDays} Days`,
    transactionId: p.stripePaymentIntentId || p.stripeInvoiceId,
    purchaseDate: p.paidAt,
    nextRenewDate: p.endAt || null,
  }));

  res.status(200).json({
    paymentHistory: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

export const activateTrialSubscription = async({
  userEmail,
  userName,
  ownerId,
  priceId,
  planId,
}) => {
  const customer = await getStripe().customers.create({
    email: userEmail,
    name: userName,
  });

  const subscription = await getStripe().subscriptions.create({
    customer: customer.id,
    items: [{ price: priceId }],
    trial_period_days: 7,
    cancel_at_period_end: true,
    metadata: {
      userId: ownerId.toString(),
      planId: planId.toString(),
      planType: "trial",
    },
  });

  console.log("trial is created");
  

  return subscription;
};
