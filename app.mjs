import express from "express";
import mysql from "mysql2/promise";
import cors from "cors";

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
    const { nama, password } = req.body;

    const [result] = await connection.query(
      "SELECT * FROM pengguna WHERE nama = ?",
      [nama]
    );
    if (!result.length) return res.send("user tidak ditemukan");

    const user = result[0];
    if (user.password != password) return res.send("password salah");

    res.send("login berhasil");
  } catch (error) {
    console.error(error.message);
  }
});

app.listen(3000);
