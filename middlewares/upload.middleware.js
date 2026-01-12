/**
 * File Upload Middleware
 * 
 * Multer configuration for handling file uploads.
 */

const multer = require('multer');

// Memory storage for processing files without saving to disk
const storage = multer.memoryStorage();

// File filter for CSV files
const csvFilter = (req, file, cb) => {
    const allowedMimes = ['text/csv', 'application/vnd.ms-excel', 'text/plain'];
    const allowedExts = ['.csv'];

    const ext = file.originalname.toLowerCase().slice(-4);

    if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error('Only CSV files are allowed'), false);
    }
};

// File filter for images
const imageFilter = (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only image files (JPEG, PNG, GIF, WebP) are allowed'), false);
    }
};

// CSV upload configuration
const uploadCSV = multer({
    storage,
    fileFilter: csvFilter,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB max
    },
});

// Image upload configuration
const uploadImage = multer({
    storage,
    fileFilter: imageFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB max
    },
});

// Generic upload configuration
const upload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB max
    },
});

// Error handler for multer
const handleUploadError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'File too large. Maximum size is 10MB.',
            });
        }
        return res.status(400).json({
            success: false,
            message: err.message,
        });
    }

    if (err) {
        return res.status(400).json({
            success: false,
            message: err.message,
        });
    }

    next();
};

module.exports = {
    uploadCSV,
    uploadImage,
    upload,
    handleUploadError,
};
