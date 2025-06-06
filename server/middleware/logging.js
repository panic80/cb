import chatLogger from '../services/logger.js';

export const loggingMiddleware = (req, res, next) => {
    // Store the original send method
    const originalSend = res.send;
    
    // Override send method to capture responses
    res.send = function(data) {
        res.locals.responseData = data;
        originalSend.apply(res, arguments);
    };

    // Continue to next middleware
    next();
};