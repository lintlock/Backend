import mongoose from "mongoose";

const subscriptionSchema = new mongoose.Schema({
    ownerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        unique: true
    },
    planId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SubscriptionPlan",
        required: true
    },
    plan_type: {
        type: String,
        enum: ['trial', 'basic', 'pro'],
        required: true,
    },
    stripeCustomerId: {
        type: String,
    },
    stripeSubscriptionId: {
        type: String,
    },
    prevSubscriptionId: {
        type: String,
    },

    status: {
        type: String,
        enum: [
            "active",
            "past_due",
            "cancelled",
            "unpaid",
            "trial",
            "overridden"
        ],
        required: true
    },

    reason:{
        type: String,
    },

    currentPeriodStart: {
        type: Date,
        required: true
    },
    currentPeriodEnd: {
        type: Date,
        required: true
    },

    cancelAtPeriodEnd: {
        type: Boolean,
    }
}, { timestamps: true });


const Subscription = mongoose.model("Subscription", subscriptionSchema);

export default Subscription;