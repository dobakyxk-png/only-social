import { Router, Response } from 'express';
import { RidesService } from './rides.service';
import { authMiddleware, AuthenticatedRequest } from '../auth/auth.middleware';

const router: Router = Router();

// POST /api/v1/rides/estimate (Tính km, thời gian & giá sàn tham khảo)
router.post('/estimate', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { pickupLat, pickupLon, dropoffLat, dropoffLon, vehicleType } = req.body;
    if (!pickupLat || !pickupLon || !dropoffLat || !dropoffLon) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp toạ độ điểm đón và điểm đến' });
    }
    const estimate = RidesService.estimateTrip(
      Number(pickupLat),
      Number(pickupLon),
      Number(dropoffLat),
      Number(dropoffLon),
      vehicleType || 'motorbike'
    );
    res.json({ success: true, data: estimate });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// POST /api/v1/rides/earning-mode (Tài xế Bật/Tắt Chế độ Kiếm Tiền)
router.post('/earning-mode', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = RidesService.toggleEarningMode(req.user!.userId, req.body);
    res.json({
      success: true,
      message: result.mode.isActive ? 'Đã bật Chế độ Kiếm Tiền 🟢' : 'Đã tắt Chế độ Kiếm Tiền',
      data: result,
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// POST /api/v1/rides/request (Hành khách đặt cuốc xe tiện chuyến)
router.post('/request', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const ride = RidesService.createRideRequest(req.user!.userId, req.body);
    res.status(201).json({
      success: true,
      message: 'Đã phát tín hiệu tìm xe quanh đây',
      data: ride,
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// GET /api/v1/rides/active (Lấy cuốc xe đang hoạt động của người dùng)
router.get('/active', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const ride = RidesService.getCurrentActiveRide(req.user!.userId);
    res.json({ success: true, data: ride });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// GET /api/v1/rides/:id/offers (Lấy danh sách các đề xuất giá của tài xế)
router.get('/:id/offers', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const offers = RidesService.getRideOffers(req.params.id as string);
    res.json({ success: true, count: offers.length, data: offers });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// POST /api/v1/rides/:id/offer (Tài xế gửi báo giá / trả giá cuốc xe)
router.post('/:id/offer', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { offeredPrice, estimatedPickupMins, note } = req.body;
    if (!offeredPrice || offeredPrice <= 0) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập giá đề xuất hợp lệ' });
    }
    const offer = RidesService.makeRideOffer(req.user!.userId, req.params.id as string, {
      offeredPrice: Number(offeredPrice),
      estimatedPickupMins: estimatedPickupMins ? Number(estimatedPickupMins) : 5,
      note,
    });
    res.status(201).json({ success: true, message: 'Đã gửi báo giá cho hành khách', data: offer });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// POST /api/v1/rides/:id/accept-offer/:offerId (Hành khách chốt tài xế & Cấp bảo hiểm nhúng)
router.post('/:id/accept-offer/:offerId', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const ride = RidesService.acceptDriverOffer(
      req.user!.userId,
      req.params.id as string,
      req.params.offerId as string
    );
    res.json({
      success: true,
      message: '🎉 Chốt chuyến đi thành công! Chuyến đi đã được kích hoạt Bảo hiểm tai nạn BIC/Bảo Việt.',
      data: ride,
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// POST /api/v1/rides/:id/status (Cập nhật trạng thái cuốc xe: đón, đến, hoàn thành, huỷ)
router.post('/:id/status', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status } = req.body;
    const allowedStatuses: Array<'picking_up' | 'in_trip' | 'completed' | 'cancelled'> = [
      'picking_up',
      'in_trip',
      'completed',
      'cancelled',
    ];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Trạng thái không hợp lệ' });
    }
    const ride = RidesService.updateRideStatus(req.user!.userId, req.params.id as string, status);
    res.json({
      success: true,
      message: `Cập nhật trạng thái chuyến đi: ${status}`,
      data: ride,
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export const ridesRouter: Router = router;
