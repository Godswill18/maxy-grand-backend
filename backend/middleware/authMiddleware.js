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
    userRole === 'cleaner' ||
    userRole === 'receptionist' ||
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


export const adminMiddleware = (req, res, next) => {
  // This middleware assumes 'authMiddleware' has already run
  // and attached the user to req.user.
  if (req.user && req.user.role === 'admin') {
    next(); // User is an admin, proceed
  } else {
    // 403 Forbidden: User is authenticated, but lacks permission
    res.status(403).json({ message: 'Access denied. Admin role required.' });
  }
};


export const adminAndSuperAdminMiddleware = (req, res, next) => {
    const user = req.user;

    if (!user) {
        return res.status(401).json({
            success: false,
            error: "Unauthorized",
        });
    }

    // Allow admin + superadmin
    if (user.role === "admin" || user.role === "superadmin") {
        return next();
    }

    return res.status(403).json({
        success: false,
        error: "Forbidden - Only Admins or SuperAdmins can access this",
    });
};


/**
 * @desc    Superadmin Authorization Middleware
 * Checks if the logged-in user has a 'superadmin' role
 * @access  Private (Superadmin)
 */
export const superAdminMiddleware = (req, res, next) => {
  // This middleware also assumes 'authMiddleware' has run first.
  if (req.user && req.user.role === 'superadmin') {
    next(); // User is a superadmin, proceed
  } else {
    // 403 Forbidden: User is authenticated, but lacks permission
    res.status(403).json({ message: 'Access denied. Superadmin role required.' });
  }
};


/**
 * @desc    Cleaner Authorization Middleware
 * Checks if the logged-in user has a 'cleaner' role
 * @access  Private (Cleaner)
 */
export const cleanerMiddleware = (req, res, next) => {
  if (req.user && req.user.role === 'cleaner') {
    next(); // User is a cleaner, proceed
  } else {
    res.status(403).json({ message: 'Access denied. Cleaner role required.' });
  }
};

export const receptionistMiddleware = (req, res, next) => {
  if (req.user && req.user.role === 'receptionist') {
    next(); // User is a receptionist, proceed
  } else {
    res.status(403).json({ message: 'Access denied. Receptionist role required.' });
  }
};