const express = require("express");
const multer = require("multer");
const path = require("path");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const mysql = require("mysql2");
const fs = require("fs");
require("dotenv").config();

const app = express();
const port = 3000;

const upload = multer({
  dest: "uploads/",
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"), false);
    }
  },
});

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

db.connect(err => {
  if (err) {
    console.error("MySQL connection error:", err);
    process.exit(1);
  }
  console.log("MySQL connected");
});

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.post("/upload", upload.single("image"), async (req, res) => {
  const { username, password, mobile, email } = req.body;
  const file = req.file;

  if (!file) {
    return res.status(400).send("No image file uploaded.");
  }

  const fileStream = fs.createReadStream(file.path);
  const s3Key = Date.now() + "_" + file.originalname;

  const uploadParams = {
    Bucket: process.env.S3_BUCKET,
    Key: s3Key,
    Body: fileStream,
    ContentType: file.mimetype,
  };

  try {
    await s3.send(new PutObjectCommand(uploadParams));
    const imageUrl = `https://${process.env.S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;

    const sql = "INSERT INTO users (username, password, mobile, email, image_url) VALUES (?, ?, ?, ?, ?)";
    db.query(sql, [username, password, mobile, email, imageUrl], (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).send("Error saving user data");
      }
      console.log("User data saved");

      try {
        fs.unlinkSync(file.path); // Clean up uploaded file
      } catch (unlinkErr) {
        console.warn("Could not delete temp file:", unlinkErr.message);
      }

      res.send("User registered and image uploaded successfully!");
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).send("Error uploading or saving data");
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server started at http://0.0.0.0:${port}`);
});
