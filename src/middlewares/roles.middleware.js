export const authorizeRoles = (...allowedRoles) => {
    return (req, res, next) => {

        if (!req.user) {
            return next({
                message: "Unauthorized",
                statusCode: 401
            });
        }        

        if(!allowedRoles.includes(req.user.role)){
            return next({
                message: "Forbidden",
                statusCode: 403
            });
        }

        next();
    }
}