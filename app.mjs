import express from "express";
import mysql from "mysql2/promise";
import cors from "cors";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import fastCsv from "fast-csv";
import { fileURLToPath } from "url";

dotenv.config();
const app = express();

const connection = await mysql.createConnection({
  host: "localhost",
  user: "root",
  database: "absensi_staff_dan_guru",
});

app.use(express.json());
app.use(cors());

app.get("/", (req, res) => {});
app.post("/", validateAuth, async (req, res) => {
  const { latitude, longitude } = req.body;
  const { id } = req.userData;

  if (!latitude || !longitude) {
    return res.sendStatus(400);
  }

  try {
    const [lokasi] = await connection.query(
      "INSERT INTO lokasi(latitude, longitude) VALUES(?, ?)",
      [latitude, longitude]
    );

    if (lokasi.affectedRows > 0) {
      const date = new Date();
      const wibDate = date.toLocaleTimeString("en", {
        timeStyle: "short",
        hour12: false,
        timeZone: "Asia/Jakarta",
      });

      let status = "TIDAK TERLAMBAT";
      if (wibDate > "07:00") {
        status = "TERLAMBAT";
      }

      await connection.query(
        "INSERT INTO absensi(pengguna_id, lokasi_id, waktu, status) VALUES(?, ?, now(), ?)",
        [id, lokasi.insertId, status]
      );

      res.send("done");
    }
  } catch (error) {
    res.status(500).send(error.message);
  }
});
app.get("/download-data", async (req, res) => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  try {
    const [result] = await connection.query(
      "SELECT absensi.waktu, absensi.status, pengguna.nama, pengguna.email, pengguna.nisn FROM absensi INNER JOIN pengguna ON pengguna.id = absensi.pengguna_id"
    );

    const filePath = path.join(__dirname, "data.csv");
    const writeStream = fs.createWriteStream(filePath);
    const csvStream = fastCsv.format({ headers: true });

    csvStream.pipe(writeStream);
    result.forEach((row) => csvStream.write(row));
    csvStream.end();

    writeStream.on("finish", () => {
      res.download(filePath, "data.csv", (err) => {
        if (err) {
          console.error(err);
        }
        fs.unlinkSync(filePath);
      });
    });
  } catch (error) {
    res.send(error.message);
  }
});
app.post("/login", async (req, res) => {
  try {
    const { name, password } = req.body;

    const [result] = await connection.query(
      "SELECT * FROM pengguna WHERE nama = ?",
      [name]
    );
    if (!result.length) return res.sendStatus(404);

    const user = result[0];
    if (user.password != password) return res.sendStatus(401);

    const token = jwt.sign(user, process.env.JWT_ACCESS_TOKEN);

    res.status(200).send(token);
  } catch (error) {
    console.error(error.message);
  }
});
app.get("/user", validateAuth, async (req, res) => {
  res.send(req.userData);
});

function validateAuth(req, res, next) {
  const { authorization } = req.headers;
  if (!authorization) {
    return res.sendStatus(401);
  }

  const token = authorization.split(" ")[1];
  const secret = process.env.JWT_ACCESS_TOKEN;

  try {
    const jwtDecode = jwt.verify(token, secret);
    req.userData = jwtDecode;
  } catch (error) {
    return res.sendStatus(401);
  }

  next();
}

app.listen(3000);
