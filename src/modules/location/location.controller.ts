import { Router, Response } from 'express';
import { LocationService } from './location.service';
import { authMiddleware, AuthenticatedRequest } from '../auth/auth.middleware';

const router = Router();

// POST /api/v1/location/ping (Cập nhật vị trí qua HTTP)
router.post('/ping', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { latitude, longitude, heading, speed } = req.body;
    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp vĩ độ (latitude) và kinh độ (longitude)',
      });
    }

    const updated = LocationService.updateLocation(
      req.user!.userId,
      Number(latitude),
      Number(longitude),
      heading !== undefined ? Number(heading) : undefined,
      speed !== undefined ? Number(speed) : undefined
    );

    res.json({
      success: true,
      message: 'Cập nhật vị trí thành công (toạ độ đã được làm mờ bảo mật)',
      data: {
        blurredLat: updated.blurredLat,
        blurredLon: updated.blurredLon,
        isSharingActive: updated.isSharingActive,
      },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message || 'Lỗi khi cập nhật toạ độ',
    });
  }
});

// GET /api/v1/location/nearby (Quét radar tìm người dùng xung quanh)
router.get('/nearby', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const radiusMeters = req.query.radius ? parseInt(req.query.radius as string, 10) : 5000;
    const minAge = req.query.minAge ? parseInt(req.query.minAge as string, 10) : undefined;
    const maxAge = req.query.maxAge ? parseInt(req.query.maxAge as string, 10) : undefined;
    const gender = req.query.gender as string;
    const interest = req.query.interest as string;
    const onlineOnly = req.query.onlineOnly === 'true';
    const interests = req.query.interests ? (req.query.interests as string).split(',') : undefined;

    const nearbyUsers = LocationService.getNearbyUsers(req.user!.userId, {
      radiusMeters,
      minAge,
      maxAge,
      gender,
      interest,
      interests,
      onlineOnly,
    });

    res.json({
      success: true,
      count: nearbyUsers.length,
      data: nearbyUsers,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message || 'Lỗi khi quét radar người dùng',
    });
  }
});

export const locationRouter: Router = router;
