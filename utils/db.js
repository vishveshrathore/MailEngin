const mongoose = require('mongoose');
require('dotenv').config(); // Make sure this is added

const connectDB = async () => {
  try {
    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error("MONGO_URI not found in .env file");

    await mongoose.connect(uri);

    console.log('✅ MongoDB Connected');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);     
    process.exit(1);
  }
};

module.exports = connectDB;
