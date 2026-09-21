import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { CONFIG } from '../../config';

// Đảm bảo thư mục upload tồn tại
if (!fs.existsSync(CONFIG.UPLOAD_DIR)) {
  fs.mkdirSync(CONFIG.UPLOAD_DIR, { recursive: true });
}

// Cấu hình Multer lưu tệp vào thư mục uploads cục bộ (hoàn toàn miễn phí)
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, CONFIG.UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `file-${uniqueSuffix}${ext}`);
  },
});

export const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // Giới hạn 10MB/tệp
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ chấp nhận tệp ảnh định dạng JPEG, PNG, WebP hoặc GIF'));
    }
  },
});

export class StorageService {
  /**
   * Sinh đường dẫn URL truy cập công khai cho tệp tin đã tải lên
   */
  static getPublicUrl(filename: string): string {
    return `/uploads/${filename}`;
  }
}
