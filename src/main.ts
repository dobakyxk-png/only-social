import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import app from './app';
import { CONFIG } from './config';
import { setupSocketGateway } from './modules/chat/chat.gateway';

const server = http.createServer(app);

// Khởi tạo Socket.io Server
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
});

// Cài đặt Gateway xử lý WebSocket Realtime
setupSocketGateway(io);

server.listen(CONFIG.PORT, () => {
  console.log('=====================================================');
  console.log(`🚀 ỨNG DỤNG MẠNG XÃ HỘI "ONLY" ĐANG CHẠY!`);
  console.log(`📡 HTTP Server: http://localhost:${CONFIG.PORT}`);
  console.log(`🌐 Web Client GUI: http://localhost:${CONFIG.PORT}/`);
  console.log(`🔌 WebSocket Endpoint: ws://localhost:${CONFIG.PORT}`);
  console.log(`🛡️ Tuân thủ Nghị định 13/2023/NĐ-CP (Location Fuzzing: ${CONFIG.LOCATION_BLUR.MIN_METERS}m - ${CONFIG.LOCATION_BLUR.MAX_METERS}m)`);
  console.log('=====================================================');
});
