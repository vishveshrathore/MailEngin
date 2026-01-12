/**
 * Tracking Service
 * 
 * Injects tracking pixels and rewrites links in email content.
 */

const crypto = require('crypto');

class TrackingService {
    constructor() {
        this.baseUrl = process.env.TRACKING_URL || process.env.APP_URL || 'http://localhost:3000';
    }

    /**
     * Process email content for tracking
     * - Injects open tracking pixel
     * - Rewrites links for click tracking
     */
    processEmailContent(html, options = {}) {
        const { trackingId, enableOpenTracking = true, enableClickTracking = true } = options;

        let processedHtml = html;
        let trackedLinks = [];

        // Rewrite links for click tracking
        if (enableClickTracking) {
            const result = this.rewriteLinks(processedHtml, trackingId);
            processedHtml = result.html;
            trackedLinks = result.links;
        }

        // Inject open tracking pixel
        if (enableOpenTracking) {
            processedHtml = this.injectTrackingPixel(processedHtml, trackingId);
        }

        // Add view in browser link if placeholder exists
        processedHtml = this.replaceViewInBrowserLink(processedHtml, trackingId);

        // Add unsubscribe link if placeholder exists
        processedHtml = this.replaceUnsubscribeLink(processedHtml, trackingId);

        return {
            html: processedHtml,
            trackedLinks,
        };
    }

    /**
     * Rewrite links for click tracking
     */
    rewriteLinks(html, trackingId) {
        const links = [];
        let linkIndex = 0;

        // Match href attributes in anchor tags
        const linkRegex = /<a\s+(?:[^>]*?\s+)?href=["']([^"']+)["']/gi;

        const processedHtml = html.replace(linkRegex, (match, url) => {
            // Skip special links
            if (this.shouldSkipLink(url)) {
                return match;
            }

            // Store original URL
            links.push({
                index: linkIndex,
                originalUrl: url,
                clickCount: 0,
            });

            // Create tracking URL
            const trackingUrl = this.createClickTrackingUrl(trackingId, linkIndex, url);
            linkIndex++;

            // Replace href with tracking URL
            return match.replace(url, trackingUrl);
        });

        return {
            html: processedHtml,
            links,
        };
    }

    /**
     * Check if link should be skipped from tracking
     */
    shouldSkipLink(url) {
        // Skip mailto links
        if (url.startsWith('mailto:')) return true;

        // Skip tel links
        if (url.startsWith('tel:')) return true;

        // Skip anchor links
        if (url.startsWith('#')) return true;

        // Skip special placeholders
        if (url.includes('{{')) return true;

        // Skip unsubscribe links (already tracked separately)
        if (url.includes('/unsubscribe') || url.includes('/t/u/')) return true;

        // Skip view in browser links
        if (url.includes('/view') || url.includes('/t/v/')) return true;

        return false;
    }

    /**
     * Create click tracking URL
     */
    createClickTrackingUrl(trackingId, linkIndex, originalUrl) {
        // Encode the original URL as fallback
        const encodedUrl = encodeURIComponent(originalUrl);
        return `${this.baseUrl}/t/c/${trackingId}/${linkIndex}?url=${encodedUrl}`;
    }

    /**
     * Inject open tracking pixel before </body>
     */
    injectTrackingPixel(html, trackingId) {
        const pixelUrl = `${this.baseUrl}/t/o/${trackingId}`;
        const pixelHtml = `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;" />`;

        // Try to inject before </body>
        if (html.includes('</body>')) {
            return html.replace('</body>', `${pixelHtml}</body>`);
        }

        // Fallback: append to end
        return html + pixelHtml;
    }

    /**
     * Replace view in browser placeholder
     */
    replaceViewInBrowserLink(html, trackingId) {
        const viewUrl = `${this.baseUrl}/t/v/${trackingId}`;

        // Replace common placeholders
        return html
            .replace(/\{\{view_in_browser_link\}\}/g, viewUrl)
            .replace(/\{\{view_in_browser\}\}/g, viewUrl)
            .replace(/\{\{webversion\}\}/g, viewUrl);
    }

    /**
     * Replace unsubscribe placeholder
     */
    replaceUnsubscribeLink(html, trackingId) {
        const unsubscribeUrl = `${this.baseUrl}/t/u/${trackingId}`;

        // Replace common placeholders
        return html
            .replace(/\{\{unsubscribe_link\}\}/g, unsubscribeUrl)
            .replace(/\{\{unsubscribe\}\}/g, unsubscribeUrl);
    }

    /**
     * Generate a unique tracking ID
     */
    generateTrackingId() {
        return crypto.randomBytes(16).toString('hex');
    }

    /**
     * Create List-Unsubscribe header value
     */
    createListUnsubscribeHeader(trackingId, email) {
        const unsubscribeUrl = `${this.baseUrl}/t/u/${trackingId}`;
        const mailtoUnsubscribe = `mailto:unsubscribe@${new URL(this.baseUrl).hostname}?subject=Unsubscribe&body=${email}`;

        return {
            'List-Unsubscribe': `<${unsubscribeUrl}>, <${mailtoUnsubscribe}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        };
    }

    /**
     * Get tracking statistics for an email
     */
    async getEmailTrackingStats(trackingId) {
        const EmailLog = require('../models/EmailLog.model');

        const log = await EmailLog.findOne({ trackingId })
            .select('engagement trackedLinks events');

        if (!log) {
            return null;
        }

        return {
            opened: log.engagement.opened,
            openCount: log.engagement.openCount,
            lastOpenedAt: log.engagement.lastOpenedAt,
            clicked: log.engagement.clicked,
            clickCount: log.engagement.clickCount,
            lastClickedAt: log.engagement.lastClickedAt,
            links: log.trackedLinks,
            events: log.events,
        };
    }
}

module.exports = new TrackingService();
