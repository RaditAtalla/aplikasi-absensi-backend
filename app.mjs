// Import library yang diperlukan
import express from "express";
import mysql from "mysql2/promise";
import cors from "cors";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import fastCsv from "fast-csv";
import { fileURLToPath } from "url";

// koneksi ke environment variable
dotenv.config();
// inisiasi aplikasi express
const app = express();

// koneksi ke database mysql
const connection = await mysql.createConnection({
  host: "localhost",
  user: "root",
  database: "absensi_staff_dan_guru",
});

// fungsi ini untuk memvalidasi login
function validateAuth(req, res, next) {
  // mengambil authorization dari header request
  const { authorization } = req.headers;
  // jika tidak ada authorization maka akan mengirim kode HTTP 401
  if (!authorization) {
    return res.sendStatus(401);
  }

  // mengambil token dari authorization
  const token = authorization.split(" ")[1];
  // mengambil secret key dari .env
  const secret = process.env.JWT_ACCESS_TOKEN;

  try {
    // memvalidasi token
    const jwtDecode = jwt.verify(token, secret);
    // jika valid, maka data user akan dimasukan ke req.body
    req.userData = jwtDecode;
  } catch (error) {
    // jika tidak valid, maka akan mengirim kode HTtp 401
    return res.sendStatus(401);
  }

  // fungsi ini untuk memberitahu bahwa fungsi ini telah selesai
  next();
}

// fungsi ini untuk melakukan parsing JSON untuk dikirim/diterima ke database
app.use(express.json());
// fungsi ini untuk memperbolehkan server frontend untuk berhubungan dengan backend
app.use(cors());
// fungsi ini untuk set folder public sebagai folder asset statis
app.use("/public", express.static("public"));

// fungsi ini untuk mengatur POST request ke "/"
app.post("/", validateAuth, async (req, res) => {
  // menerima latitude dan longitude yang diparsing dari JSON dari frontend
  const { latitude, longitude } = req.body;
  // mengambil id user yang sedang login
  const { id } = req.userData;

  // mengecek jika latitude atau longitudenya kosong, jika iya maka akan mengembalikan status 400
  if (!latitude || !longitude) {
    return res.sendStatus(400);
  }

  try {
    // melakukan query ke database tabel lokasi
    const [lokasi] = await connection.query(
      "INSERT INTO lokasi(latitude, longitude) VALUES(?, ?)",
      [latitude, longitude]
    );

    // mengecek apakah query sebelumnya berhasil atau tidak
    if (lokasi.affectedRows > 0) {
      // memasukkan waktu sekarang (timezone UTC) ke variable date
      const date = new Date();
      // mengubah timezone dari UTC ke WIB
      const wibDate = date.toLocaleTimeString("en", {
        timeStyle: "short",
        hour12: false,
        timeZone: "Asia/Jakarta",
      });

      // inisiasi variable status terlambat atau tidak
      let status = "";
      // mengecek jika waktu sekarang sudah lewat dari jam 7 pagi
      if (wibDate > "07:00") {
        // jika sudah lewat, maka status terlambat
        status = "TERLAMBAT";
      } else {
        // jika belum lewat, maka status tidak terlambat
        status = "TIDAK TERLAMBAT";
      }

      // melakukan query ke database table absensi
      await connection.query(
        "INSERT INTO absensi(pengguna_id, lokasi_id, waktu, status) VALUES(?, ?, now(), ?)",
        [id, lokasi.insertId, status]
      );

      // mengirim kode HTTP 200 (OK)
      res.sendStatus(200);
    }
  } catch (error) {
    // jika query pertama gagal, maka kode HTTP 500 akan terkirim
    res.status(500).send(error.message);
  }
});
// fungsi ini untuk mendownload data untuk admin
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
// fungsi ini untuk mengatur login user
app.post("/login", async (req, res) => {
  try {
    // menerima name dan password dari req.body yang dikirimkan oleh frontend
    const { name, password } = req.body;

    // melakukan query untuk mencari akun yang sesuai dengan name tersebut
    const [result] = await connection.query(
      "SELECT * FROM pengguna WHERE nama = ?",
      [name]
    );
    // jika tidak ditemukan maka mengirimkan kode HTTP 404
    if (!result.length) return res.sendStatus(404);

    // mengambil data dari hasil query
    const user = result[0];
    // jika password tidak sesuai maka akan mengirimkan kode HTTP 401
    if (user.password != password) return res.sendStatus(401);

    // membuat token JWT dengan payload yaitu data user yang sedang login
    const token = jwt.sign(user, process.env.JWT_ACCESS_TOKEN);

    // mengirim token dan kode HTTP 200
    res.status(200).send(token);
  } catch (error) {
    // jika query pertama error maka akan mengeluarkan pesan error
    console.error(error.message);
  }
});
// fungsi ini untuk mengambil data user yang sedang log in
app.get("/user", validateAuth, async (req, res) => {
  res.send(req.userData);
});

app.listen(3000);
