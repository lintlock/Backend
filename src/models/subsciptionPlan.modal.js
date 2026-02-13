
import mongoose from "mongoose";

const SubscriptionPlanSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        unique: true,
    },
    price: {
        type: Number,
        required: true,
        min: 0,
    },
    priceId: {
        type: String,
        required: true,
    },
    plan_type: {
        type: String,
        enum: ['trial', 'basic', 'pro','test'],
        required: true,
    },
    durationMonths: {
        type: Number,
        default: null,
    },
    trialDays: {
        type: Number,
        default: 0,
        min: 0,
    },
    isActive: {
        type: Boolean,
        default: true,
    },
}, { timestamps: true });

// Ensure canonical durations for known plan types
SubscriptionPlanSchema.pre('validate', function (next) {
    if (!this.plan_type) return next();

    if (this.plan_type === 'trial') {
        this.trialDays = this.trialDays || 7;
        this.durationMonths = null;
    } else if (this.plan_type === 'basic') {
        this.durationMonths = 6; 
        this.trialDays = 0;
    } else if (this.plan_type === 'pro') {
        this.durationMonths = 12; 
        this.trialDays = 0;
    }
    next();
});

SubscriptionPlanSchema.index({ name: 1 });

const SubscriptionPlan = mongoose.model('SubscriptionPlan', SubscriptionPlanSchema);
export default SubscriptionPlan;

