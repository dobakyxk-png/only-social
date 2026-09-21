import { Router, Response } from 'express';
import { AuthService } from './auth.service';
import { authMiddleware, AuthenticatedRequest } from './auth.middleware';

const router = Router();

// POST /api/v1/auth/register (Đăng ký tài khoản không cần OTP)
router.post('/register', async (req, res) => {
  try {
    const { phone, email, password, fullName, dateOfBirth, gender } = req.body;
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const result = await AuthService.register({
      phone,
      email,
      password,
      fullName,
      dateOfBirth,
      gender,
      ipAddress,
      userAgent,
    });

    res.status(201).json({
      success: true,
      message: 'Đăng ký tài khoản thành công',
      data: result,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message || 'Lỗi khi đăng ký tài khoản',
    });
  }
});

// POST /api/v1/auth/login (Đăng nhập)
router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    const result = await AuthService.login(identifier, password);

    res.json({
      success: true,
      message: 'Đăng nhập thành công',
      data: result,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message || 'Lỗi khi đăng nhập',
    });
  }
});

// GET /api/v1/auth/me (Lấy thông tin tài khoản hiện tại)
router.get('/me', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = AuthService.getMe(req.user!.userId);
    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(404).json({
      success: false,
      message: error.message || 'Lỗi khi lấy thông tin người dùng',
    });
  }
});

export const authRouter: Router = router;
