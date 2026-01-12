const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const connectDB = require("./utils/db.js");
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: ["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"],
  credentials: true
}));


app.use(morgan('dev'));
// Increase body size limits to handle large pasted dumps
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));


app.get('/', (req, res) => {
  res.send('🚀 Server is running successfully!');
});

connectDB();

app.listen(PORT, () => {
  console.log(`✅ Server Running at http://localhost:${PORT}`);
});



