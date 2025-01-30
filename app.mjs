import express from "express";
import mysql from "mysql2/promise";
import cors from "cors";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

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
      await connection.query(
        "INSERT INTO absensi(pengguna_id, lokasi_id, waktu) VALUES(?, ?, now())",
        [id, lokasi.insertId]
      );

      res.send("done");
    }
  } catch (error) {
    res.status(500).send(error);
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
