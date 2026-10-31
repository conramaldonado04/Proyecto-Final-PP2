const mongoose = require("mongoose");

const usuarioSchema = new mongoose.Schema(
  {
    nombre: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    // Datos para facturar. No son "required" a nivel modelo para no romper las
    // cuentas creadas antes; el registro los exige (routes/auth.js).
    apellido: {
      type: String,
      trim: true,
      maxlength: 50,
      default: "",
    },
    dni: {
      type: String,
      trim: true,
      match: /^\d{7,8}$/,
    },
    cuit: {
      type: String,
      trim: true,
      match: /^\d{11}$/,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    rol: {
      type: String,
      enum: ["cliente", "admin"],
      default: "cliente",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Usuario", usuarioSchema, "usuarios");