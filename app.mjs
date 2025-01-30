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

app.listen(3000);
