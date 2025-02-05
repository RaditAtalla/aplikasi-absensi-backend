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
  const { latitude, longitude, type, period, periodSlug } = req.body;
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
      const today = new Date();
      // mengubah timezone dari UTC ke WIB
      const wibDate = today.toLocaleTimeString("en", {
        timeStyle: "short",
        hour12: false,
        timeZone: "Asia/Jakarta",
      });

      const month = [
        "Januari",
        "Februari",
        "Maret",
        "April",
        "Mei",
        "Juni",
        "Juli",
        "Agustus",
        "September",
        "Oktober",
        "November",
        "Desember",
      ];

      const days = [
        "Senin",
        "Selasa",
        "Rabu",
        "Kamis",
        "Jumat",
        "Sabtu",
        "Minggu",
      ];

      const date = `${today.getDate()} ${
        month[today.getMonth()]
      } ${today.getFullYear()}`;

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

      const todayDay = days[today.getDay()];

      const [getDay] = await connection.query(
        "SELECT * FROM hari WHERE tanggal = ?",
        [date]
      );

      if (getDay.length > 0) {
        const dayId = getDay[0].id;

        const [absensi] = await connection.query(
          "INSERT INTO absensi(pengguna_id, lokasi_id, iso_waktu, status, periode, periode_slug, tipe_absensi, jam, hari_id) VALUES(?, ?, now(), ?, ?, ?, ?, ?, ?)",
          [
            id,
            lokasi.insertId,
            status,
            period,
            periodSlug,
            type,
            wibDate,
            dayId,
          ]
        );

        res.sendStatus(200);
      } else {
        const [day] = await connection.query(
          "INSERT INTO hari(tanggal, hari) VALUES(?, ?)",
          [date, todayDay]
        );

        const dayId = day.insertId;

        // melakukan query ke database table absensi
        const [absensi] = await connection.query(
          "INSERT INTO absensi(pengguna_id, lokasi_id, iso_waktu, status, periode, periode_slug, tipe_absensi, jam, hari_id) VALUES(?, ?, now(), ?, ?, ?, ?, ?, ?)",
          [
            id,
            lokasi.insertId,
            status,
            period,
            periodSlug,
            type,
            wibDate,
            dayId,
          ]
        );

        // mengirim kode HTTP 200 (OK)
        res.sendStatus(200);
      }
    }
  } catch (error) {
    // jika query pertama gagal, maka kode HTTP 500 akan terkirim
    res.status(500).send(error.message);
    console.log(error.message);
  }
});
// fungsi ini untuk mendownload data untuk admin
app.get("/download-data", async (req, res) => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  try {
    const [result] = await connection.query(
      "SELECT hari.hari absensi.jam, absensi.status, pengguna.nama, pengguna.email, pengguna.nisn FROM absensi INNER JOIN pengguna ON pengguna.id = absensi.pengguna_id INNER JOIN hari ON hari.id = absensi.hari_id"
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
  console.log("LOGIN");
  try {
    // menerima name dan password dari req.body yang dikirimkan oleh frontend
    const { email, password } = req.body;

    // melakukan query untuk mencari akun yang sesuai dengan name tersebut
    const [result] = await connection.query(
      "SELECT * FROM pengguna WHERE email = ?",
      [email]
    );

    // mengambil data dari hasil query
    const user = result[0];
    // jika password tidak sesuai maka akan mengirimkan kode HTTP 401
    if (user.password != password) return res.sendStatus(401);

    // membuat token JWT dengan payload yaitu data user yang sedang login
    const token = jwt.sign(user, process.env.JWT_ACCESS_TOKEN);

    // mengirim token dan kode HTTP 200
    res.status(200).send(token);
  } catch (error) {
    // jika user tidak ditemukan maka mengirimkan kode HTTP 404
    res.sendStatus(404);
  }
});
// fungsi ini untuk mengambil data user yang sedang log in
app.get("/user", validateAuth, async (req, res) => {
  res.send(req.userData);
});
// fungsi ini untuk mengambil data absensi sebelumnya (history)
app.get("/history", validateAuth, async (req, res) => {
  const { id } = req.userData;

  const [result] = await connection.query(
    "SELECT * FROM absensi WHERE pengguna_id = ?",
    [id]
  );
  res.send(result);
});
app.post("/history-detail", validateAuth, async (req, res) => {
  const { id } = req.userData;
  const { date } = req.body;

  const today = new Date();

  const month = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ];

  const todayDate = `${today.getDate()} ${
    month[today.getMonth()]
  } ${today.getFullYear()}`;

  try {
    const [hariRes] = await connection.query(
      "SELECT * FROM hari WHERE tanggal = ?",
      [todayDate]
    );
    const hari = hariRes[0];

    const [hadirRes] = await connection.query(
      "SELECT * FROM absensi WHERE pengguna_id = ? AND hari_id = ? AND tipe_absensi = 'HADIR'",
      [id, hari.id]
    );

    const [pulangRes] = await connection.query(
      "SELECT * FROM absensi WHERE pengguna_id = ? AND hari_id = ? AND tipe_absensi = 'PULANG'",
      [id, hari.id]
    );

    const hadir = hadirRes[0];
    const pulang = pulangRes[0];

    console.log(hadirRes[0]);
    res.send({
      tanggal: hadir.tanggal,
      iso_waktu: hadir.iso_waktu,
      jam_datang: hadir.jam,
      jam_pulang: pulang.jam,
      status: hadir.status,
    });
  } catch (error) {
    console.log(error.message);
    res.send(error.message);
  }
});
app.get("/has-absen", validateAuth, async (req, res) => {
  const { id } = req.userData;
  const today = new Date();

  const month = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ];

  const date = `${today.getDate()} ${
    month[today.getMonth()]
  } ${today.getFullYear()}`;

  try {
    const [result] = await connection.query(
      "SELECT * FROM absensi WHERE pengguna_id = ? AND tanggal = ?",
      [id, date]
    );

    if (result.length > 0) res.send(true);
    else res.send(false);
  } catch (error) {
    res.sendStatus(404);
  }
});
app.get("/day", validateAuth, async (req, res) => {
  const { id } = req.userData;
  try {
    const [result] = await connection.query(
      "SELECT hari.tanggal, hari.hari, absensi.hari_id, absensi.id FROM hari INNER JOIN absensi ON hari.id = absensi.hari_id WHERE pengguna_id = ?",
      [id]
    );

    const uniqueDates = [];
    const data = [];
    result.forEach((r) => {
      if (!uniqueDates.includes(r.tanggal)) {
        uniqueDates.push(r.tanggal);
        data.push({
          tanggal: r.tanggal,
          hari: r.hari,
          hari_id: r.hari_id,
          id: r.id,
        });
      }
    });
    res.send(data);
  } catch (error) {
    console.log(error.message);
  }
});

app.listen(3000);
