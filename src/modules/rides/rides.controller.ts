import { Router, Response } from 'express';
import { RidesService } from './rides.service';
import { authMiddleware, AuthenticatedRequest } from '../auth/auth.middleware';

const router: Router = Router();
const vehicleTypes = ['motorbike', 'car_4seats', 'car_7seats'];
const maxPlaceNameLength = 200;
const maxNoteLength = 500;

function isValidCoordinatePair(lat: unknown, lon: unknown): boolean {
  const latitude = Number(lat);
  const longitude = Number(lon);
  return lat !== undefined && lon !== undefined && lat !== null && lon !== null && lat !== '' && lon !== '' && Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

// POST /api/v1/rides/estimate (Tính km, thời gian & giá sàn tham khảo)
router.post('/estimate', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { pickupLat, pickupLon, dropoffLat, dropoffLon, vehicleType } = req.body;
    const coords = [pickupLat, pickupLon, dropoffLat, dropoffLon].map(Number);
    if (!isValidCoordinatePair(pickupLat, pickupLon) || !isValidCoordinatePair(dropoffLat, dropoffLon)) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp tọa độ hợp lệ cho điểm đón và điểm đến' });
    }
    if (vehicleType !== undefined && !vehicleTypes.includes(vehicleType)) {
      return res.status(400).json({ success: false, message: 'Loại phương tiện không hợp lệ' });
    }
    const estimate = RidesService.estimateTrip(
      coords[0],
      coords[1],
      coords[2],
      coords[3],
      (vehicleType || 'motorbike') as 'motorbike' | 'car_4seats' | 'car_7seats'
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
    const body = req.body;
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ success: false, message: 'Dữ liệu yêu cầu chuyến đi không hợp lệ' });
    }
    const requiredText = ['pickupName', 'dropoffName'];
    if (requiredText.some((key) => typeof body[key] !== 'string' || !body[key].trim() || body[key].trim().length > maxPlaceNameLength)) {
      return res.status(400).json({ success: false, message: 'Tên điểm đón và điểm đến không hợp lệ' });
    }
    if (!isValidCoordinatePair(body.pickupLat, body.pickupLon) || !isValidCoordinatePair(body.dropoffLat, body.dropoffLon)) {
      return res.status(400).json({ success: false, message: 'Tọa độ điểm đón/điểm đến không hợp lệ' });
    }
    if (!vehicleTypes.includes(body.vehicleType)) {
      return res.status(400).json({ success: false, message: 'Loại phương tiện không hợp lệ' });
    }
    if (body.passengerNote !== undefined && (typeof body.passengerNote !== 'string' || body.passengerNote.trim().length > maxNoteLength)) {
      return res.status(400).json({ success: false, message: 'Ghi chú hành khách không hợp lệ' });
    }
    const numericBody = {
      ...body,
      pickupLat: Number(body.pickupLat),
      pickupLon: Number(body.pickupLon),
      dropoffLat: Number(body.dropoffLat),
      dropoffLon: Number(body.dropoffLon),
      suggestedPrice: body.suggestedPrice === undefined || body.suggestedPrice === '' ? undefined : Number(body.suggestedPrice),
    };
    if (numericBody.suggestedPrice !== undefined && (!Number.isFinite(numericBody.suggestedPrice) || numericBody.suggestedPrice < 0 || numericBody.suggestedPrice > 100000000)) {
      return res.status(400).json({ success: false, message: 'Giá đề xuất không hợp lệ' });
    }
    const ride = RidesService.createRideRequest(req.user!.userId, numericBody);
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
    const offers = RidesService.getRideOffers(req.params.id as string, req.user!.userId);
    res.json({ success: true, count: offers.length, data: offers });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// POST /api/v1/rides/:id/offer (Tài xế gửi báo giá / trả giá cuốc xe)
router.post('/:id/offer', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { offeredPrice, estimatedPickupMins, note } = req.body;
    const price = Number(offeredPrice);
    const eta = estimatedPickupMins === undefined || estimatedPickupMins === '' ? 5 : Number(estimatedPickupMins);
    if (!Number.isFinite(price) || price < 1000 || price > 10000000 || !Number.isFinite(eta) || eta < 1 || eta > 180) {
      return res.status(400).json({ success: false, message: 'Giá báo hoặc thời gian đón không hợp lệ' });
    }
    const offer = RidesService.makeRideOffer(req.user!.userId, req.params.id as string, {
      offeredPrice: price,
      estimatedPickupMins: eta,
      note: typeof note === 'string' ? note.slice(0, 120) : undefined,
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

// POST /api/v1/rides/:id/driver-location (Tài xế stream GPS khi đón khách)
router.post('/:id/driver-location', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { lat, lon } = req.body;
    const ride = RidesService.updateDriverLocation(req.user!.userId, req.params.id as string, Number(lat), Number(lon));
    res.json({ success: true, data: ride });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// POST /api/v1/rides/:id/status (Cập nhật trạng thái cuốc xe: đón, đến, hoàn thành, huỷ)
router.post('/:id/status', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status } = req.body;
    const allowedStatuses: Array<'picking_up' | 'arrived' | 'in_trip' | 'completed' | 'cancelled'> = [
      'picking_up',
      'arrived',
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
