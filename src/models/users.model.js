import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const userSchema = new mongoose.Schema({
    fullName: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    profile_picture: {
        type: String,
        default: null
    },
    password: {
        type: String,
        required: true,
        select: false
    },
    role: {
        type: String,
        enum: ['owner', 'admin', 'technician'],
        default: 'owner'
    },
    refreshToken: {
        type: String,
    },
    forgotPasswordToken: {
        type: String
    },
    forgotPasswordTokenExpiry: {
        type: Date
    },
    taskReminders: {
        type: Boolean,
        default: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    terms: {
        type: Boolean,
        required: true,
    },
    deletedAt: {
        type: Date,
        default: null
    }

}, {timestamps: true})

userSchema.index({email: 1});

userSchema.methods.generateAccessToken = function() {
    const payload = {
        _id: this._id,
        email: this.email,
        role: this.role
    }

    const token = jwt.sign(payload, process.env.ACCESS_KEY, {expiresIn: '1h'});
    return token;
}

userSchema.methods.generateRefreshToken = function(expiresIn = '7d') {
    const payload = {
        _id: this._id,
        email: this.email,
    }

    const token = jwt.sign(payload, process.env.REFRESH_KEY, {expiresIn: expiresIn});

    return token;
}

userSchema.methods.generateForgotPasswordToken = function() {
    const token = crypto.randomBytes(20).toString('hex');

    this.forgotPasswordToken = crypto.createHash('sha256').update(token).digest('hex');
    this.forgotPasswordTokenExpiry = Date.now() + 15 * 60 * 1000; // 15 minutes

    return token;
}

const User = mongoose.model('User', userSchema)


export default User;