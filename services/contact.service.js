/**
 * Contact Service
 * 
 * Business logic for contact management including CRUD, 
 * CSV import, duplicate detection, tags, and unsubscribe.
 */

const Contact = require('../models/Contact.model');
const List = require('../models/List.model');
const csv = require('csv-parser');
const { Readable } = require('stream');

class ContactService {
    /**
     * Create a new contact
     */
    async create(orgId, contactData, userId) {
        // Check for duplicate email in organization
        const existing = await Contact.findOne({
            orgId,
            email: contactData.email.toLowerCase(),
        });

        if (existing) {
            throw new Error('Contact with this email already exists');
        }

        // Create contact
        const contact = await Contact.create({
            orgId,
            ...contactData,
            email: contactData.email.toLowerCase(),
            createdBy: userId,
            source: {
                type: 'manual',
                detail: 'Created via API',
            },
        });

        // Update list stats if contact is added to lists
        if (contactData.lists && contactData.lists.length > 0) {
            await this.updateListStats(contactData.lists.map(l => l.listId));
        }

        return contact;
    }

    /**
     * Get contact by ID
     */
    async getById(orgId, contactId) {
        const contact = await Contact.findOne({ _id: contactId, orgId })
            .populate('lists.listId', 'name');

        if (!contact) {
            throw new Error('Contact not found');
        }

        return contact;
    }

    /**
     * Get all contacts with pagination and filters
     */
    async getAll(orgId, options = {}) {
        const {
            page = 1,
            limit = 50,
            search,
            status,
            listId,
            tag,
            engagementLevel,
            sortBy = 'createdAt',
            sortOrder = 'desc',
        } = options;

        const query = { orgId };

        // Status filter
        if (status) {
            query.status = status;
        }

        // List filter
        if (listId) {
            query['lists.listId'] = listId;
            query['lists.status'] = 'active';
        }

        // Tag filter
        if (tag) {
            query.tags = tag.toLowerCase();
        }

        // Engagement level filter
        if (engagementLevel) {
            query['engagement.level'] = engagementLevel;
        }

        // Search
        if (search) {
            query.$or = [
                { email: { $regex: search, $options: 'i' } },
                { firstName: { $regex: search, $options: 'i' } },
                { lastName: { $regex: search, $options: 'i' } },
                { company: { $regex: search, $options: 'i' } },
            ];
        }

        const skip = (page - 1) * limit;
        const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

        const [contacts, total] = await Promise.all([
            Contact.find(query)
                .sort(sort)
                .skip(skip)
                .limit(limit)
                .populate('lists.listId', 'name'),
            Contact.countDocuments(query),
        ]);

        return {
            contacts,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Update contact
     */
    async update(orgId, contactId, updateData, userId) {
        // Check email uniqueness if email is being changed
        if (updateData.email) {
            const existing = await Contact.findOne({
                orgId,
                email: updateData.email.toLowerCase(),
                _id: { $ne: contactId },
            });

            if (existing) {
                throw new Error('Another contact with this email already exists');
            }
        }

        const contact = await Contact.findOneAndUpdate(
            { _id: contactId, orgId },
            {
                ...updateData,
                lastModifiedBy: userId,
            },
            { new: true, runValidators: true }
        );

        if (!contact) {
            throw new Error('Contact not found');
        }

        return contact;
    }

    /**
     * Delete contact (soft delete by changing status)
     */
    async delete(orgId, contactId) {
        const contact = await Contact.findOne({ _id: contactId, orgId });

        if (!contact) {
            throw new Error('Contact not found');
        }

        // Remove from all lists
        const listIds = contact.lists.map(l => l.listId);

        await Contact.deleteOne({ _id: contactId, orgId });

        // Update list stats
        if (listIds.length > 0) {
            await this.updateListStats(listIds);
        }

        return { message: 'Contact deleted successfully' };
    }

    /**
     * Bulk delete contacts
     */
    async bulkDelete(orgId, contactIds) {
        const result = await Contact.deleteMany({
            _id: { $in: contactIds },
            orgId,
        });

        return {
            message: `${result.deletedCount} contacts deleted`,
            deletedCount: result.deletedCount,
        };
    }

    /**
     * Add tags to contact
     */
    async addTags(orgId, contactId, tags) {
        const normalizedTags = tags.map(t => t.toLowerCase().trim());

        const contact = await Contact.findOneAndUpdate(
            { _id: contactId, orgId },
            { $addToSet: { tags: { $each: normalizedTags } } },
            { new: true }
        );

        if (!contact) {
            throw new Error('Contact not found');
        }

        return contact;
    }

    /**
     * Remove tags from contact
     */
    async removeTags(orgId, contactId, tags) {
        const normalizedTags = tags.map(t => t.toLowerCase().trim());

        const contact = await Contact.findOneAndUpdate(
            { _id: contactId, orgId },
            { $pull: { tags: { $in: normalizedTags } } },
            { new: true }
        );

        if (!contact) {
            throw new Error('Contact not found');
        }

        return contact;
    }

    /**
     * Bulk add tags
     */
    async bulkAddTags(orgId, contactIds, tags) {
        const normalizedTags = tags.map(t => t.toLowerCase().trim());

        const result = await Contact.updateMany(
            { _id: { $in: contactIds }, orgId },
            { $addToSet: { tags: { $each: normalizedTags } } }
        );

        return {
            message: `Tags added to ${result.modifiedCount} contacts`,
            modifiedCount: result.modifiedCount,
        };
    }

    /**
     * Add contact to list
     */
    async addToList(orgId, contactId, listId) {
        const contact = await Contact.findOne({ _id: contactId, orgId });

        if (!contact) {
            throw new Error('Contact not found');
        }

        await contact.addToList(listId);
        await this.updateListStats([listId]);

        return contact;
    }

    /**
     * Remove contact from list
     */
    async removeFromList(orgId, contactId, listId) {
        const contact = await Contact.findOne({ _id: contactId, orgId });

        if (!contact) {
            throw new Error('Contact not found');
        }

        await contact.removeFromList(listId);
        await this.updateListStats([listId]);

        return contact;
    }

    /**
     * Unsubscribe contact
     */
    async unsubscribe(orgId, contactId, reason, campaignId = null) {
        const contact = await Contact.findOne({ _id: contactId, orgId });

        if (!contact) {
            throw new Error('Contact not found');
        }

        contact.status = 'unsubscribed';
        contact.statusReason = reason;
        contact.statusChangedAt = new Date();
        contact.unsubscribe = {
            unsubscribedAt: new Date(),
            reason,
            campaignId,
        };

        // Mark as unsubscribed in all lists
        contact.lists.forEach(list => {
            if (list.status === 'active') {
                list.status = 'unsubscribed';
            }
        });

        await contact.save();

        // Update all list stats
        const listIds = contact.lists.map(l => l.listId);
        if (listIds.length > 0) {
            await this.updateListStats(listIds);
        }

        return contact;
    }

    /**
     * Resubscribe contact
     */
    async resubscribe(orgId, contactId) {
        const contact = await Contact.findOneAndUpdate(
            { _id: contactId, orgId, status: 'unsubscribed' },
            {
                status: 'subscribed',
                statusReason: 'Resubscribed',
                statusChangedAt: new Date(),
                $unset: { unsubscribe: 1 },
            },
            { new: true }
        );

        if (!contact) {
            throw new Error('Contact not found or not unsubscribed');
        }

        return contact;
    }

    /**
     * Import contacts from CSV
     */
    async importCSV(orgId, fileBuffer, options, userId) {
        const {
            listId,
            tags = [],
            updateExisting = false,
            fieldMapping = {},
        } = options;

        const results = {
            total: 0,
            created: 0,
            updated: 0,
            skipped: 0,
            errors: [],
        };

        // Default field mapping
        const defaultMapping = {
            email: ['email', 'e-mail', 'email_address', 'emailaddress'],
            firstName: ['firstname', 'first_name', 'first name', 'fname'],
            lastName: ['lastname', 'last_name', 'last name', 'lname'],
            phone: ['phone', 'telephone', 'mobile', 'phone_number'],
            company: ['company', 'organization', 'org', 'company_name'],
        };

        const mapping = { ...defaultMapping, ...fieldMapping };

        // Parse CSV
        const rows = await this.parseCSV(fileBuffer);
        results.total = rows.length;

        // Process each row
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];

            try {
                const contactData = this.mapCSVRow(row, mapping);

                if (!contactData.email || !this.isValidEmail(contactData.email)) {
                    results.errors.push({
                        row: i + 2,
                        error: 'Invalid or missing email',
                        data: row,
                    });
                    results.skipped++;
                    continue;
                }

                // Check for duplicate
                const existing = await Contact.findOne({
                    orgId,
                    email: contactData.email.toLowerCase(),
                });

                if (existing) {
                    if (updateExisting) {
                        // Update existing contact
                        Object.assign(existing, contactData);

                        // Add to list if specified
                        if (listId) {
                            await existing.addToList(listId);
                        }

                        // Add tags
                        if (tags.length > 0) {
                            const normalizedTags = tags.map(t => t.toLowerCase().trim());
                            existing.tags = [...new Set([...existing.tags, ...normalizedTags])];
                        }

                        await existing.save();
                        results.updated++;
                    } else {
                        results.skipped++;
                    }
                } else {
                    // Create new contact
                    const newContact = await Contact.create({
                        orgId,
                        ...contactData,
                        email: contactData.email.toLowerCase(),
                        tags: tags.map(t => t.toLowerCase().trim()),
                        lists: listId ? [{ listId, status: 'active', addedAt: new Date() }] : [],
                        source: {
                            type: 'import',
                            detail: `CSV import by user ${userId}`,
                        },
                        createdBy: userId,
                    });

                    results.created++;
                }
            } catch (error) {
                results.errors.push({
                    row: i + 2,
                    error: error.message,
                    data: row,
                });
                results.skipped++;
            }
        }

        // Update list stats
        if (listId) {
            await this.updateListStats([listId]);
        }

        return results;
    }

    /**
     * Parse CSV buffer to array of objects
     */
    parseCSV(buffer) {
        return new Promise((resolve, reject) => {
            const rows = [];
            const stream = Readable.from(buffer.toString());

            stream
                .pipe(csv())
                .on('data', (row) => rows.push(row))
                .on('end', () => resolve(rows))
                .on('error', (error) => reject(error));
        });
    }

    /**
     * Map CSV row to contact data using field mapping
     */
    mapCSVRow(row, mapping) {
        const contact = {};
        const rowLower = {};

        // Normalize row keys to lowercase
        Object.keys(row).forEach(key => {
            rowLower[key.toLowerCase().trim()] = row[key];
        });

        // Map fields
        Object.keys(mapping).forEach(field => {
            const possibleKeys = mapping[field];
            for (const key of possibleKeys) {
                if (rowLower[key] !== undefined && rowLower[key] !== '') {
                    contact[field] = rowLower[key].trim();
                    break;
                }
            }
        });

        // Handle custom fields (any unmapped columns)
        const mappedKeys = Object.values(mapping).flat();
        const customFields = {};

        Object.keys(rowLower).forEach(key => {
            if (!mappedKeys.includes(key) && rowLower[key]) {
                customFields[key] = rowLower[key];
            }
        });

        if (Object.keys(customFields).length > 0) {
            contact.customFields = customFields;
        }

        return contact;
    }

    /**
     * Validate email format
     */
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Export contacts to CSV format
     */
    async exportCSV(orgId, options = {}) {
        const { listId, status, tags } = options;

        const query = { orgId };

        if (listId) {
            query['lists.listId'] = listId;
            query['lists.status'] = 'active';
        }

        if (status) {
            query.status = status;
        }

        if (tags && tags.length > 0) {
            query.tags = { $in: tags };
        }

        const contacts = await Contact.find(query)
            .select('email firstName lastName phone company tags status engagement.score createdAt')
            .lean();

        // Convert to CSV rows
        const rows = contacts.map(c => ({
            email: c.email,
            first_name: c.firstName || '',
            last_name: c.lastName || '',
            phone: c.phone || '',
            company: c.company || '',
            tags: (c.tags || []).join(', '),
            status: c.status,
            engagement_score: c.engagement?.score || 0,
            subscribed_at: c.createdAt?.toISOString() || '',
        }));

        return rows;
    }

    /**
     * Find duplicate contacts
     */
    async findDuplicates(orgId, field = 'email') {
        const duplicates = await Contact.aggregate([
            { $match: { orgId } },
            {
                $group: {
                    _id: `$${field}`,
                    count: { $sum: 1 },
                    contacts: { $push: { _id: '$_id', email: '$email', firstName: '$firstName', lastName: '$lastName' } },
                },
            },
            { $match: { count: { $gt: 1 } } },
            { $sort: { count: -1 } },
        ]);

        return duplicates;
    }

    /**
     * Merge duplicate contacts
     */
    async mergeDuplicates(orgId, primaryId, duplicateIds) {
        const primary = await Contact.findOne({ _id: primaryId, orgId });

        if (!primary) {
            throw new Error('Primary contact not found');
        }

        // Get all duplicates
        const duplicates = await Contact.find({
            _id: { $in: duplicateIds },
            orgId,
        });

        // Merge data from duplicates into primary
        for (const dup of duplicates) {
            // Merge tags
            primary.tags = [...new Set([...primary.tags, ...dup.tags])];

            // Merge lists
            for (const list of dup.lists) {
                if (!primary.lists.some(l => l.listId.equals(list.listId))) {
                    primary.lists.push(list);
                }
            }

            // Merge custom fields
            if (dup.customFields) {
                primary.customFields = primary.customFields || new Map();
                dup.customFields.forEach((value, key) => {
                    if (!primary.customFields.has(key)) {
                        primary.customFields.set(key, value);
                    }
                });
            }

            // Sum engagement stats
            primary.engagement.emailsReceived += dup.engagement.emailsReceived;
            primary.engagement.emailsOpened += dup.engagement.emailsOpened;
            primary.engagement.emailsClicked += dup.engagement.emailsClicked;
        }

        // Recalculate engagement score
        await primary.updateEngagementScore();

        // Delete duplicates
        await Contact.deleteMany({ _id: { $in: duplicateIds }, orgId });

        return primary;
    }

    /**
     * Get all unique tags in organization
     */
    async getAllTags(orgId) {
        const tags = await Contact.distinct('tags', { orgId });
        return tags.sort();
    }

    /**
     * Update list statistics
     */
    async updateListStats(listIds) {
        for (const listId of listIds) {
            const list = await List.findById(listId);
            if (list) {
                await list.refreshStats();
            }
        }
    }

    /**
     * Get contact statistics for organization
     */
    async getStats(orgId) {
        const stats = await Contact.aggregate([
            { $match: { orgId } },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                },
            },
        ]);

        const engagementStats = await Contact.aggregate([
            { $match: { orgId, status: 'subscribed' } },
            {
                $group: {
                    _id: '$engagement.level',
                    count: { $sum: 1 },
                },
            },
        ]);

        const totalContacts = await Contact.countDocuments({ orgId });
        const thisMonth = new Date();
        thisMonth.setDate(1);
        thisMonth.setHours(0, 0, 0, 0);

        const newThisMonth = await Contact.countDocuments({
            orgId,
            createdAt: { $gte: thisMonth },
        });

        return {
            total: totalContacts,
            newThisMonth,
            byStatus: stats.reduce((acc, s) => {
                acc[s._id] = s.count;
                return acc;
            }, {}),
            byEngagement: engagementStats.reduce((acc, s) => {
                acc[s._id] = s.count;
                return acc;
            }, {}),
        };
    }
}

module.exports = new ContactService();
