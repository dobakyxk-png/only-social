import { Router, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../auth/auth.middleware';
import { RoutingService } from './routing.service';
import { UsersService } from '../users/users.service';
import { db } from '../../database/data-store';

const router = Router();

router.post('/directions', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { from, to, profile } = req.body;
    const route = await RoutingService.getRoute({ from, to, profile });
    res.json({ success: true, data: route });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/users/:id/directions', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const target = UsersService.getPublicProfile(req.user!.userId, req.params.id as string);
    const viewerLocation = db.locations.get(req.user!.userId);
    const targetLocation = db.locations.get(req.params.id as string);
    if (!viewerLocation || !targetLocation || !targetLocation.isSharingActive) {
      return res.status(400).json({ success: false, message: 'Không có đủ vị trí để tính chỉ đường' });
    }
    const route = await RoutingService.getRoute({
      from: { lat: viewerLocation.exactLat, lon: viewerLocation.exactLon },
      to: { lat: targetLocation.blurredLat, lon: targetLocation.blurredLon },
      profile: 'driving',
    });
    res.json({ success: true, data: { target, route } });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export const routingRouter = router;
