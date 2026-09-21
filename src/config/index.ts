import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

export const CONFIG = {
  PORT: parseInt(process.env.PORT || '4000', 10),
  JWT_SECRET: process.env.JWT_SECRET || 'only-social-secure-jwt-secret-key-2026',
  JWT_EXPIRES_IN: '7d',
  
  // Tuân thủ Nghị định 13/2023/NĐ-CP: Làm mờ vị trí từ 100m đến 300m
  LOCATION_BLUR: {
    MIN_METERS: parseInt(process.env.BLUR_MIN_METERS || '100', 10),
    MAX_METERS: parseInt(process.env.BLUR_MAX_METERS || '300', 10),
  },

  // Đường dẫn lưu trữ tệp tin tải lên (ảnh đại diện, ảnh tin nhắn)
  UPLOAD_DIR: path.resolve(__dirname, '../../uploads'),
  PUBLIC_DIR: path.resolve(__dirname, '../public'),
  
  // Môi trường
  NODE_ENV: process.env.NODE_ENV || 'development',
};
