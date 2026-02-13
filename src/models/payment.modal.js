import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    subscriptionId: {
      type: String,
      require: true,
    },

    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubscriptionPlan",
      required: true,
    },

    stripeInvoiceId: { type: String, unique: true },

    stripePaymentIntentId: {
      type: String,
    },

    amount: {
      type: Number,
      required: true,
    },

    currency: {
      type: String,
      default: "usd",
    },

    status: {
      type: String,
      enum: ["succeeded", "failed", "pending", ""],
      required: true,
    },

    invoiceUrl: {
      type: String,
    },

    paidAt: {
      type: Date,
    },
    endAt:{
        type:Date,
    }
  },
  { timestamps: true },
);

const Payment = mongoose.model("Payment", paymentSchema);
export default Payment;
