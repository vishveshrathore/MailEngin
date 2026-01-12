/**
 * HTML Sanitization Utility
 * 
 * Sanitizes HTML content to prevent XSS attacks while
 * preserving safe email-friendly HTML.
 */

/**
 * Allowed HTML tags for email content
 */
const ALLOWED_TAGS = new Set([
    // Structure
    'html', 'head', 'body', 'div', 'span', 'p', 'br', 'hr',

    // Text formatting
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'sub', 'sup',
    'blockquote', 'pre', 'code',

    // Lists
    'ul', 'ol', 'li',

    // Tables
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',

    // Links and media
    'a', 'img',

    // Other
    'center', 'font', 'meta', 'title', 'style', 'link',
]);

/**
 * Allowed attributes by tag
 */
const ALLOWED_ATTRS = {
    '*': ['id', 'class', 'style', 'dir', 'lang', 'title'],
    'a': ['href', 'target', 'rel', 'name'],
    'img': ['src', 'alt', 'width', 'height', 'border'],
    'table': ['width', 'height', 'border', 'cellpadding', 'cellspacing', 'align', 'bgcolor'],
    'td': ['width', 'height', 'align', 'valign', 'bgcolor', 'colspan', 'rowspan'],
    'th': ['width', 'height', 'align', 'valign', 'bgcolor', 'colspan', 'rowspan', 'scope'],
    'tr': ['align', 'valign', 'bgcolor'],
    'font': ['color', 'face', 'size'],
    'p': ['align'],
    'div': ['align'],
    'span': ['align'],
    'h1': ['align'], 'h2': ['align'], 'h3': ['align'],
    'meta': ['charset', 'content', 'http-equiv', 'name'],
    'link': ['rel', 'href', 'type'],
};

/**
 * Dangerous patterns to remove
 */
const DANGEROUS_PATTERNS = [
    /<script\b[^>]*>[\s\S]*?<\/script>/gi,
    /<script\b[^>]*\/>/gi,
    /javascript:/gi,
    /vbscript:/gi,
    /data:/gi,
    /on\w+\s*=/gi,
    /<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi,
    /<object\b[^>]*>[\s\S]*?<\/object>/gi,
    /<embed\b[^>]*>/gi,
    /<form\b[^>]*>[\s\S]*?<\/form>/gi,
    /<input\b[^>]*>/gi,
    /<button\b[^>]*>[\s\S]*?<\/button>/gi,
    /<textarea\b[^>]*>[\s\S]*?<\/textarea>/gi,
    /<select\b[^>]*>[\s\S]*?<\/select>/gi,
    /expression\s*\(/gi,
    /url\s*\(\s*["']?\s*javascript:/gi,
];

/**
 * Sanitize HTML content for email
 */
function sanitizeHtml(html) {
    if (!html || typeof html !== 'string') {
        return '';
    }

    let sanitized = html;

    // Remove dangerous patterns
    for (const pattern of DANGEROUS_PATTERNS) {
        sanitized = sanitized.replace(pattern, '');
    }

    // Remove event handlers from remaining tags
    sanitized = sanitized.replace(
        /(<[^>]+)\s+on\w+\s*=\s*["'][^"']*["']/gi,
        '$1'
    );

    // Sanitize href attributes
    sanitized = sanitized.replace(
        /href\s*=\s*["']\s*(javascript|vbscript|data):[^"']*/gi,
        'href="#"'
    );

    // Sanitize src attributes
    sanitized = sanitized.replace(
        /src\s*=\s*["']\s*(javascript|vbscript|data):[^"']*/gi,
        'src=""'
    );

    return sanitized;
}

/**
 * Sanitize text content (strip all HTML)
 */
function sanitizeText(text) {
    if (!text || typeof text !== 'string') {
        return '';
    }

    return text
        .replace(/<[^>]+>/g, '') // Remove all HTML tags
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .trim();
}

/**
 * Escape HTML entities
 */
function escapeHtml(text) {
    if (!text || typeof text !== 'string') {
        return '';
    }

    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Validate URL is safe
 */
function isSafeUrl(url) {
    if (!url || typeof url !== 'string') {
        return false;
    }

    const lower = url.toLowerCase().trim();

    // Block dangerous protocols
    const dangerousProtocols = ['javascript:', 'vbscript:', 'data:', 'file:'];
    for (const protocol of dangerousProtocols) {
        if (lower.startsWith(protocol)) {
            return false;
        }
    }

    // Allow http, https, mailto, tel
    const safeProtocols = ['http://', 'https://', 'mailto:', 'tel:', '//'];
    const isAbsolute = safeProtocols.some(p => lower.startsWith(p));
    const isRelative = lower.startsWith('/') || lower.startsWith('#') || lower.startsWith('.');

    return isAbsolute || isRelative;
}

/**
 * Sanitize URL
 */
function sanitizeUrl(url) {
    if (!isSafeUrl(url)) {
        return '#';
    }
    return url.trim();
}

/**
 * Sanitize object recursively
 */
function sanitizeObject(obj, options = {}) {
    const { htmlFields = [], textFields = [] } = options;

    if (!obj || typeof obj !== 'object') {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item, options));
    }

    const sanitized = {};

    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
            if (htmlFields.includes(key)) {
                sanitized[key] = sanitizeHtml(value);
            } else if (textFields.includes(key)) {
                sanitized[key] = sanitizeText(value);
            } else {
                sanitized[key] = escapeHtml(value);
            }
        } else if (typeof value === 'object') {
            sanitized[key] = sanitizeObject(value, options);
        } else {
            sanitized[key] = value;
        }
    }

    return sanitized;
}

/**
 * Middleware to sanitize HTML fields in request body
 */
const sanitizeMiddleware = (htmlFields = ['htmlContent', 'html', 'content']) => {
    return (req, res, next) => {
        if (req.body && typeof req.body === 'object') {
            for (const field of htmlFields) {
                if (req.body[field] && typeof req.body[field] === 'string') {
                    req.body[field] = sanitizeHtml(req.body[field]);
                }
            }
        }
        next();
    };
};

module.exports = {
    sanitizeHtml,
    sanitizeText,
    escapeHtml,
    isSafeUrl,
    sanitizeUrl,
    sanitizeObject,
    sanitizeMiddleware,
    ALLOWED_TAGS,
    ALLOWED_ATTRS,
};
