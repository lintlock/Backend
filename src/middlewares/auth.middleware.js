import jwt from "jsonwebtoken";
import asyncHandler from "../utility/asyncHandler.js";  
import User from "../models/users.model.js";

export const authenticated = asyncHandler(async (req, res, next) => {
    
    const authHeader = req.headers.authorization;

    if(!authHeader || !authHeader.startsWith("Bearer ")){
        return next({
            message: "Unauthorized",
            statusCode: 401
        }); 
    }

    const token = authHeader.split(" ")[1];
    let decoded;

    try {
        decoded = jwt.verify(token, process.env.ACCESS_KEY);
    } catch (error) {
        console.log(error.message);
        
        return next({
            message: "Unauthorized",
            statusCode: 401
        })
    }

    const user = await User.findOne({
        _id: decoded._id,
        isActive: true,
        deletedAt: null
    }).select("_id fullName email role");


    if (!user) {
        return next({
            message: "Unauthorized",
            statusCode: 401
        });
    }

    req.user = user;

    next();
});