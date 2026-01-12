/**
 * Worker Index
 * 
 * Entry point for starting all workers.
 * Run this as a separate process from the API server.
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Database connection
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ MongoDB Connected');
    } catch (error) {
        console.error('❌ MongoDB Connection Error:', error.message);
        process.exit(1);
    }
};

// Start workers
async function startWorkers() {
    console.log('🚀 Starting workers...\n');

    // Connect to database first
    await connectDB();

    // Import and start workers
    require('./email.worker');
    require('./campaign.worker');
    require('./analytics.worker');

    // Start automation worker
    const automationWorker = require('./automation.worker');
    automationWorker.start();

    // Start scheduler
    const { startScheduler } = require('../jobs/scheduler');
    startScheduler();

    console.log('\n✅ All workers started successfully');
    console.log('📊 Waiting for jobs...\n');
}

// Graceful shutdown
async function shutdown() {
    console.log('\n🛑 Shutting down workers...');

    const { closeAllQueues } = require('../queues');
    await closeAllQueues();

    await mongoose.connection.close();
    console.log('✅ Shutdown complete');
    process.exit(0);
}

// Handle shutdown signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start
startWorkers().catch((error) => {
    console.error('❌ Failed to start workers:', error);
    process.exit(1);
});
