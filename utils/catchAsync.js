/**
 * Catch Async
 * 
 * Wrapper for async route handlers to catch errors automatically.
 * Eliminates try-catch blocks in controllers.
 */

module.exports = (fn) => {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
};
