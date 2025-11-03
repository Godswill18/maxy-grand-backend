/**
 * Middleware to check if the user is staff, admin, or superadmin.
 * This must be placed *after* the protectedRoute middleware
 * because it relies on `req.user` being populated.
 */
export const isStaffOrAdmin = (req, res, next) => {
  // Check if req.user was populated by a previous middleware
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: "Not authenticated. User data not found.",
    });
  }

  const userRole = req.user.role;

  // Check if the user's role is one of the allowed roles
  if (
    userRole === 'staff' ||
    userRole === 'admin' ||
    userRole === 'superadmin'
  ) {
    // User has a valid role, proceed to the next middleware/controller
    return next();
  }

  // User's role is not authorized
  return res.status(403).json({
    success: false,
    error: "Forbidden: You do not have the required permissions.",
  });
};