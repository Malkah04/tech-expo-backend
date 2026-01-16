const { validationResult } = require('express-validator'); // This brings in the tool to check if the user's input is correct

// This function checks if there were any mistakes in what the user typed
exports.validate = (req, res, next) => { // This is what happens after we check the user's input
  const errors = validationResult(req); // Get all the mistakes (if any)
  if (!errors.isEmpty()) { // If there are mistakes
    return res.status(400).json({ errors: errors.array() }); // Tell the user what they did wrong
  }
  next(); // If no mistakes, let them keep going
}; 