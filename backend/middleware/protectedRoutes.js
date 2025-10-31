import User from "../models/userModel.js";
import jwt from "jsonwebtoken";


export const protectedRoute = async (req, res, next) => {

    try{
        const token = req.cookies.jwt;
        if(!token) {
            return res.status(401).json({error: "Unauthorized, no token provided"});
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if(!decoded) {
            return res.status(401).json({error: "Unauthorized, invalid token"});
        }

        const user = await User.findById(decoded.userId).select("-password");

        if(!user) {
            return res.status(401).json({error: "Unauthorized, User not found"});
        }

        req.user = user; // Attach the user to the request object for use in the next middleware or route handler
        next(); // Call the next middleware or route handler

    }catch(error){
        console.log("Error in protectRoute middleware:", error.message);
        return res.status(500).json({ error: "Internal server error" });
    }

}