import jwt from 'jsonwebtoken';

export const generateTokenAndSetCookie = (userId, res = null) => {
    const token = jwt.sign({ userId }, process.env.JWT_SECRET, {
        expiresIn: '2d',
    });

    // Only set cookie if response object is provided
    if (res) {
        res.cookie("jwt", token, {
        maxAge: 2 * 24 * 60 * 60 * 1000, // 2 days
        httpOnly: false, // set to true in production for security
        secure: process.env.NODE_ENV === "development", // Secure only in production
        sameSite: process.env.NODE_ENV === "development"
            // secure: process.env.NODE_ENV !== "development",
        });
    }
    
    return token; // Always return the token
};

// import jwt from 'jsonwebtoken';

// export const generateTokenAndSetCookie = (userId, res) => {
//     const token = jwt.sign({userId}, process.env.JWT_SECRET, {
//         expiresIn: '2d', // Token expiration time
//     });

//   res.cookie("jwt", token, { 
//     maxAge: 2 * 24 * 60 * 60 * 1000, // Cookie expiration time (2 days)
//     httpOnly: true, // Prevents client-side JavaScript from accessing the cookie
//     sameSite: "strict", // Helps prevent CSRF attacks cross-site request forgery attacks
//     secure: process.env.NODE_ENV !== "development", // Use secure cookies in development mode but change when in production in ENV file
//   })  
// }