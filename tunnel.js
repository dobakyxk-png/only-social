const localtunnel = require('localtunnel');
const http = require('http');

// Lấy public IP để người dùng mở password nếu localtunnel yêu cầu
http.get({'host': 'api.ipify.org', 'port': 80, 'path': '/'}, function(resp) {
  resp.on('data', function(ip) {
    console.log("Your Public IP (Tunnel Password): " + ip);
  });
});

(async () => {
  try {
    const tunnel = await localtunnel({ port: 4000 });
    console.log('=====================================================');
    console.log('🌐 ỨNG DỤNG "ONLY" ĐÃ LÊN MẠNG INTERNET TOÀN CẦU!');
    console.log('🔗 ĐƯỜNG LINK TRUY CẬP CÔNG KHAI (HTTPS):', tunnel.url);
    console.log('=====================================================');

    tunnel.on('close', () => {
      console.log('Tunnel đã đóng');
    });
  } catch (err) {
    console.error('Lỗi khởi tạo tunnel:', err);
  }
})();
