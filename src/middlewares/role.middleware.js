// This function checks if a user is allowed to do something based on their role
authorizeRoles = (...roles) => { // We give it a list of allowed roles
  return (req, res, next) => { // This is what happens when someone tries to use a protected route
    if (!roles.includes(req.user.role)) { // If the user's role is not in the allowed list
      return res.status(403).json({ message: 'Forbidden: insufficient role, You are not allowed to take that action.' }); // Tell them they can't do this
    }
    next(); // If their role is allowed, let them use the route
  };
}; 

module.exports = { authorizeRoles }; // We export the function so it can be used in other files