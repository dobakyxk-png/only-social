// ==============================================================================
// ONLY SOCIAL APP - FRONTEND CLIENT JAVASCRIPT (GIAI ĐOẠN 1 & 2)
// Bản đồ Leaflet, Radar, Chat 1-1, Bảng Tin (Feed), Check-in, Like/Comment & Thông báo
// ==============================================================================

const STATE = {
  token: localStorage.getItem('only_token') || null,
  currentUser: null,
  currentLat: 21.028511, // Mặc định Hà Nội
  currentLon: 105.854167,
  radiusMeters: 5000,
  activeChatPartnerId: null,
  activeConversationId: null,
  activeConversationType: 'direct',
  activeConversationName: '',
  groupSelectedMembers: [],
  socket: null,
  map: null,
  userMarker: null,
  radarCircle: null,
  nearbyMarkers: [],
  nearbyUsers: [],

  // Giai đoạn 2 state
  checkinPinsVisible: true,
  checkinMarkers: [],
  pendingCheckin: null, // { name, lat, lon }
  feedFilter: 'all',
  notifications: [],
  selectedFeedFiles: [],

  // Giai đoạn 3 state (WebRTC Calling & Moderation)
  activeCallSession: null,
  callTimerInterval: null,
  callSeconds: 0,

  // Giai đoạn 4 state (Only Ride - Đi lại & Tiện chuyến)
  driverEarningMode: false,
  activeRide: null,
  rideOffers: [],
  rideOpenRequests: [],
  selectedDriverRideId: null,
  ridePickupCoords: null,
  rideDropoffCoords: null,
  rideEstimate: null,
  ridePickMode: null,
  rideStatusPollTimer: null,
  rideEstimateRequestId: 0,
  ridePickupMarker: null,
  rideDropoffMarker: null,
  rideDriverMarker: null,
  rideRouteLine: null,
  driverLocationWatchId: null,
};

// Khởi tạo icon Lucide
function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function showToast(message, type = 'info') {
  let toast = document.getElementById('onlyToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'onlyToast';
    toast.className = 'fixed left-1/2 -translate-x-1/2 bottom-20 md:bottom-6 z-[80] max-w-[90vw] px-4 py-3 rounded-2xl text-xs font-semibold shadow-2xl border transition opacity-0 pointer-events-none';
    document.body.appendChild(toast);
  }
  toast.className = `fixed left-1/2 -translate-x-1/2 bottom-20 md:bottom-6 z-[80] max-w-[90vw] px-4 py-3 rounded-2xl text-xs font-semibold shadow-2xl border transition opacity-100 ${type === 'error' ? 'bg-rose-950 text-rose-200 border-rose-800' : type === 'success' ? 'bg-emerald-950 text-emerald-200 border-emerald-800' : 'bg-slate-800 text-slate-100 border-slate-700'}`;
  toast.innerText = message;
  clearTimeout(window.__onlyToastTimer);
  window.__onlyToastTimer = setTimeout(() => {
    toast.classList.add('opacity-0');
    toast.classList.remove('opacity-100');
  }, 3200);
}

// ------------------------------------------------------------------------------
// 1. QUẢN LÝ PHIÊN & KHỞI CHẠY ỨNG DỤNG
// ------------------------------------------------------------------------------
async function initApp() {
  refreshIcons();
  setupEventListeners();

  // Khởi tạo bản đồ
  initMap();

  if (STATE.token) {
    try {
      await fetchCurrentUser();
      connectSocket();
      initGeolocation();
      loadNearbyUsers();
      loadConversations();
      loadFriends();
      loadFeed();
      loadNotifications();
      loadCheckinPins();
      loadActiveRide();
    } catch (e) {
      console.warn('Token hết hạn, mở modal đăng nhập:', e);
      openAuthModal('register');
    }
  } else {
    // Không tự động đăng nhập ngầm vào Lan Anh nữa! Mở ngay modal Đăng ký tài khoản mới cho người dùng
    renderUserHeader();
    openAuthModal('register');
    initGeolocation();
    loadNearbyUsers();
    loadFeed();
    loadCheckinPins();
    loadActiveRide();
  }
}

// ------------------------------------------------------------------------------
// 2. KHỞI TẠO BẢN ĐỒ GOOGLE MAPS & SATELLITE (MIỄN PHÍ)
// ------------------------------------------------------------------------------
function initMap() {
  STATE.map = L.map('map', {
    zoomControl: false,
    attributionControl: false,
  }).setView([STATE.currentLat, STATE.currentLon], 14);

  // 1. Google Maps Đường Phố Tiếng Việt chuẩn xác (Roadmap)
  const googleRoadmap = L.tileLayer('https://mt1.google.com/vt/lyrs=m&hl=vi&gl=vn&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
  });

  // 2. Google Maps Vệ Tinh (Satellite Hybrid kết hợp đường phố)
  const googleSatellite = L.tileLayer('https://mt1.google.com/vt/lyrs=y&hl=vi&gl=vn&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
  });

  // 3. OpenStreetMap
  const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
  });

  // Mặc định kích hoạt Google Maps Đường Phố quen thuộc
  googleRoadmap.addTo(STATE.map);

  // Hộp chọn chuyển đổi nhanh giữa Google Maps và Vệ Tinh ở góc dưới
  L.control.layers({
    '🗺️ Google Maps': googleRoadmap,
    '🛰️ Google Vệ Tinh': googleSatellite,
    '🌐 OpenStreetMap': osm,
  }, null, { position: 'bottomleft' }).addTo(STATE.map);

  // Zoom control góc dưới bên phải
  L.control.zoom({ position: 'bottomright' }).addTo(STATE.map);

  // Marker toả sóng biểu thị vị trí người dùng
  const userIcon = L.divIcon({
    className: 'user-radar-container',
    html: `<div class="user-radar-pulse"><div class="ring"></div><div class="dot"></div></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

  STATE.userMarker = L.marker([STATE.currentLat, STATE.currentLon], { icon: userIcon }).addTo(STATE.map);

  STATE.map.on('click', (event) => {
    if (STATE.ridePickMode) {
      setRideEndpoint(STATE.ridePickMode, event.latlng.lat, event.latlng.lng);
      STATE.ridePickMode = null;
      STATE.map.getContainer().classList.remove('ride-map-picking');
    }
  });

  // Vòng tròn thể hiện bán kính quét Radar
  STATE.radarCircle = L.circle([STATE.currentLat, STATE.currentLon], {
    radius: STATE.radiusMeters,
    color: '#10b981',
    fillColor: '#10b981',
    fillOpacity: 0.08,
    weight: 1.5,
    dashArray: '4, 8',
  }).addTo(STATE.map);

  // Đảm bảo map tự động căn chỉnh kích thước màn hình
  setTimeout(() => {
    STATE.map.invalidateSize();
  }, 400);
}

// ------------------------------------------------------------------------------
// 3. ĐỊNH VỊ GPS VÀ PING TOẠ ĐỘ
// ------------------------------------------------------------------------------
function initGeolocation() {
  const statusEl = document.getElementById('gpsStatusText');

  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        STATE.currentLat = pos.coords.latitude;
        STATE.currentLon = pos.coords.longitude;
        statusEl.innerText = 'GPS: Đã kết nối thực tế';
        updateMapPosition();
        sendLocationPing();
        loadNearbyUsers();
        loadCheckinPins();
      },
      (err) => {
        console.warn('Dùng toạ độ mẫu Hà Nội:', err.message);
        statusEl.innerText = 'GPS: Toạ độ mẫu (Hà Nội)';
        sendLocationPing();
        loadNearbyUsers();
        loadCheckinPins();
      },
      { enableHighAccuracy: true, timeout: 5000 }
    );
  } else {
    statusEl.innerText = 'GPS: Trình duyệt không hỗ trợ GPS';
    sendLocationPing();
  }
}

function updateMapPosition() {
  if (STATE.userMarker && STATE.map) {
    STATE.userMarker.setLatLng([STATE.currentLat, STATE.currentLon]);
    STATE.radarCircle.setLatLng([STATE.currentLat, STATE.currentLon]);
    STATE.map.panTo([STATE.currentLat, STATE.currentLon]);
  }
}

async function sendLocationPing() {
  try {
    if (STATE.socket && STATE.socket.connected) {
      STATE.socket.emit('location:update', {
        latitude: STATE.currentLat,
        longitude: STATE.currentLon,
      });
    } else {
      await apiRequest('/location/ping', 'POST', {
        latitude: STATE.currentLat,
        longitude: STATE.currentLon,
      });
    }
  } catch (err) {
    console.error('Lỗi khi ping vị trí:', err);
  }
}

// ------------------------------------------------------------------------------
// 4. QUÉT RADAR & VẼ MARKER NGƯỜI DÙNG XUNG QUANH
// ------------------------------------------------------------------------------
async function loadNearbyUsers() {
  const listEl = document.getElementById('listNearbyUsers');
  const countEl = document.getElementById('countNearby');
  const gender = document.getElementById('selectGender').value;

  // Đọc các giá trị bộ lọc nâng cao (Giai đoạn 3)
  const minAge = document.getElementById('inputMinAge')?.value || '';
  const maxAge = document.getElementById('inputMaxAge')?.value || '';
  const onlineOnly = document.getElementById('checkOnlineOnly')?.checked ? 'true' : 'false';
  const interest = document.getElementById('inputFilterInterest')?.value?.trim() || '';

  let queryUrl = `/location/nearby?radius=${STATE.radiusMeters}&gender=${gender}`;
  if (minAge) queryUrl += `&minAge=${minAge}`;
  if (maxAge) queryUrl += `&maxAge=${maxAge}`;
  if (onlineOnly === 'true') queryUrl += `&onlineOnly=true`;
  if (interest) queryUrl += `&interest=${encodeURIComponent(interest)}`;

  try {
    const res = await apiRequest(queryUrl);

    STATE.nearbyUsers = res.data;
    countEl.innerText = res.data.length;
    const countMobileEl = document.getElementById('countMobileNearby');
    if (countMobileEl) countMobileEl.innerText = res.data.length;
    const countSheetEl = document.getElementById('countSheetNearby');
    if (countSheetEl) countSheetEl.innerText = res.data.length;

    STATE.nearbyMarkers.forEach((m) => STATE.map.removeLayer(m));
    STATE.nearbyMarkers = [];

    const sheetListEl = document.getElementById('listMobileSheetUsers');
    if (sheetListEl) sheetListEl.innerHTML = '';

    if (res.data.length === 0) {
      listEl.innerHTML = `<div class="text-center py-8 text-xs text-slate-500">Không tìm thấy người nào trong bán kính ${formatDistance(STATE.radiusMeters)}</div>`;
      if (sheetListEl) sheetListEl.innerHTML = `<div class="text-center py-8 text-xs text-slate-500">Không tìm thấy người nào quanh đây</div>`;
      return;
    }

    listEl.innerHTML = '';

    res.data.forEach((user) => {
      // 1. Thêm vào danh sách bên trái
      const card = document.createElement('div');
      card.className =
        'p-2.5 rounded-xl bg-slate-800/50 hover:bg-slate-800 border border-slate-700/60 cursor-pointer flex items-center justify-between transition';
      card.innerHTML = `
        <div class="flex items-center gap-2.5 overflow-hidden">
          <img src="${user.avatarUrl || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + user.userId}" class="w-10 h-10 rounded-full border border-emerald-500/80 object-cover shrink-0">
          <div class="overflow-hidden">
            <h4 class="font-bold text-xs text-slate-200 truncate">${user.fullName}</h4>
            <p class="text-[10px] text-slate-400 truncate">${user.age} tuổi • ${user.gender === 'female' ? 'Nữ' : 'Nam'}</p>
          </div>
        </div>
        <div class="text-right shrink-0">
          <span class="text-[10px] text-emerald-400 font-semibold block">~${formatDistance(user.distanceMeters)}</span>
          <span class="text-[9px] text-slate-500 font-mono">Đã làm mờ</span>
        </div>
      `;
      card.onclick = () => openUserPopup(user);
      listEl.appendChild(card);

      // Thêm vào mobile sheet
      if (sheetListEl) {
        const sheetCard = card.cloneNode(true);
        sheetCard.onclick = () => {
          const sheet = document.getElementById('mobileNearbySheet');
          if (sheet) sheet.classList.add('translate-y-full');
          openUserPopup(user);
        };
        sheetListEl.appendChild(sheetCard);
      }

      // 2. Marker avatar trên bản đồ
      const avatarDiv = document.createElement('div');
      avatarDiv.className = 'marker-nearby-avatar';
      avatarDiv.style.backgroundImage = `url('${user.avatarUrl || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + user.userId}')`;

      const customIcon = L.divIcon({
        className: 'custom-user-marker',
        html: avatarDiv,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      });

      const marker = L.marker([user.blurredLat, user.blurredLon], { icon: customIcon })
        .addTo(STATE.map)
        .on('click', () => openUserPopup(user));

      STATE.nearbyMarkers.push(marker);
    });
  } catch (err) {
    listEl.innerHTML = `<div class="text-center py-4 text-xs text-rose-400">${err.message}</div>`;
  }
}

function formatDistance(meters) {
  if (meters >= 1000) {
    return (meters / 1000).toFixed(1) + ' km';
  }
  return meters + ' m';
}

function openUserPopup(user) {
  const popup = document.getElementById('userCardPopup');
  document.getElementById('popupAvatar').src = user.avatarUrl;
  document.getElementById('popupName').innerText = user.fullName;
  document.getElementById('popupMeta').innerText = `${user.age} tuổi • ${user.gender === 'female' ? 'Nữ' : 'Nam'} • Việt Nam`;
  document.getElementById('popupDistance').innerText = `Cách bạn ~${formatDistance(user.distanceMeters)}`;
  document.getElementById('popupBio').innerText = user.bio || 'Chưa có tiểu sử giới thiệu.';

  // Render Interests
  const interestsEl = document.getElementById('popupInterests');
  interestsEl.innerHTML = '';
  (user.interests || []).forEach((tag) => {
    const span = document.createElement('span');
    span.className = 'px-2 py-0.5 bg-slate-800 border border-slate-700 rounded-full text-[10px] text-slate-300';
    span.innerText = tag;
    interestsEl.appendChild(span);
  });

  // Nút Kết bạn
  const btnFriend = document.getElementById('btnPopupFriend');
  if (user.isFriend) {
    btnFriend.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5 text-emerald-400"></i> <span>Bạn Bè</span>`;
    btnFriend.disabled = true;
  } else if (user.friendshipStatus === 'pending') {
    btnFriend.innerHTML = `<i data-lucide="clock" class="w-3.5 h-3.5 text-amber-400"></i> <span>Đang Chờ</span>`;
    btnFriend.disabled = true;
  } else {
    btnFriend.innerHTML = `<i data-lucide="user-plus" class="w-3.5 h-3.5"></i> <span>Kết Bạn</span>`;
    btnFriend.disabled = false;
    btnFriend.onclick = async () => {
      try {
        await apiRequest(`/friends/request/${user.userId}`, 'POST');
        alert(`Đã gửi lời mời kết bạn tới ${user.fullName}`);
        user.friendshipStatus = 'pending';
        openUserPopup(user);
      } catch (e) {
        alert(e.message);
      }
    };
  }

  // Nút Nhắn tin
  const btnChat = document.getElementById('btnPopupChat');
  btnChat.onclick = () => {
    popup.classList.add('hidden');
    openChatWithUser(user);
  };

  popup.classList.remove('hidden');
  refreshIcons();

  STATE.map.panTo([user.blurredLat, user.blurredLon]);
}

// ------------------------------------------------------------------------------
// 5. GIAI ĐOẠN 2: BẢNG TIN (NEWSFEED), CHECK-IN & TƯƠNG TÁC
// ------------------------------------------------------------------------------
async function loadFeed(filter = STATE.feedFilter) {
  STATE.feedFilter = filter;
  const listEl = document.getElementById('listFeedPosts');
  listEl.innerHTML = '<div class="text-center py-8 text-xs text-slate-500">Đang tải bài viết mới nhất...</div>';

  try {
    const res = await apiRequest(`/feed/posts?filter=${filter}&radius=10000`);
    if (res.data.length === 0) {
      listEl.innerHTML = '<div class="text-center py-8 text-xs text-slate-500">Chưa có bài viết nào phù hợp. Hãy là người đầu tiên đăng bài!</div>';
      return;
    }

    listEl.innerHTML = '';
    res.data.forEach((post) => {
      listEl.appendChild(createPostCardElement(post));
    });
    refreshIcons();
  } catch (err) {
    listEl.innerHTML = `<div class="text-center py-4 text-xs text-rose-400">${err.message}</div>`;
  }
}

function createPostCardElement(post) {
  const card = document.createElement('div');
  card.className = 'bg-slate-800/60 p-3.5 rounded-2xl border border-slate-700/70 flex flex-col gap-3 shadow';
  card.id = `postcard-${post.id}`;

  const timeAgo = formatTimeAgo(post.createdAt);
  const isLiked = post.isLikedByMe;

  // Media HTML
  let mediaHtml = '';
  if (post.mediaUrls && post.mediaUrls.length > 0) {
    mediaHtml = `
      <div class="grid grid-cols-${post.mediaUrls.length > 1 ? '2' : '1'} gap-1.5 rounded-xl overflow-hidden pt-1">
        ${post.mediaUrls.map((url) => `<img src="${url}" class="w-full h-44 object-cover cursor-pointer hover:opacity-95 transition" onclick="window.open('${url}')">`).join('')}
      </div>
    `;
  }

  // Checkin Tag HTML
  let checkinHtml = '';
  if (post.checkinName) {
    checkinHtml = `
      <div class="flex items-center gap-1 text-[11px] text-amber-400 font-medium bg-amber-950/30 px-2 py-0.5 rounded-md self-start border border-amber-800/40">
        <i data-lucide="map-pin" class="w-3 h-3 text-amber-400"></i>
        <span>${post.checkinName}</span>
      </div>
    `;
  }

  card.innerHTML = `
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2.5">
        <img src="${post.author.avatarUrl || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + post.author.userId}" class="w-9 h-9 rounded-full object-cover border border-emerald-500/80">
        <div>
          <h4 class="font-bold text-xs text-slate-100">${post.author.fullName}</h4>
          <p class="text-[10px] text-slate-400">${timeAgo} • ${post.privacy === 'public' ? '🌐 Công khai' : (post.privacy === 'friends' ? '👥 Bạn bè' : '🔒 Riêng tư')}</p>
        </div>
      </div>
    </div>

    <!-- Check-in Tag -->
    ${checkinHtml}

    <!-- Content -->
    ${post.content ? `<p class="text-xs text-slate-200 leading-relaxed whitespace-pre-line">${post.content}</p>` : ''}

    <!-- Media -->
    ${mediaHtml}

    <!-- Action Buttons (Like / Comment) -->
    <div class="flex items-center justify-between pt-2 border-t border-slate-700/60 text-xs">
      <div class="flex items-center gap-4">
        <!-- Like button -->
        <button class="btn-like flex items-center gap-1.5 text-xs font-semibold ${isLiked ? 'text-rose-500' : 'text-slate-400 hover:text-rose-400'} transition" data-id="${post.id}">
          <i data-lucide="heart" class="w-4 h-4 ${isLiked ? 'fill-rose-500' : ''}"></i>
          <span class="like-count">${post.likesCount}</span>
        </button>

        <!-- Comment button -->
        <button class="btn-toggle-comments flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-emerald-400 transition" data-id="${post.id}">
          <i data-lucide="message-circle" class="w-4 h-4"></i>
          <span class="comment-count">${post.commentsCount}</span>
        </button>
      </div>
    </div>

    <!-- Comments Section (Collapsed by default, or shows recent) -->
    <div class="comments-container flex flex-col gap-2 pt-2 border-t border-slate-700/40 text-[11px]">
      <!-- List of comments -->
      <div class="comments-list flex flex-col gap-1.5">
        ${(post.recentComments || []).map((c) => `
          <div class="p-2 bg-slate-900/60 rounded-xl flex items-start gap-2">
            <img src="${c.author.avatarUrl}" class="w-6 h-6 rounded-full object-cover shrink-0 mt-0.5">
            <div class="flex-1">
              <span class="font-bold text-slate-200">${c.author.fullName}:</span>
              <span class="text-slate-300 ml-1">${c.content}</span>
            </div>
          </div>
        `).join('')}
      </div>

      <!-- Add Comment Input -->
      <div class="flex items-center gap-2 pt-1">
        <input type="text" placeholder="Viết bình luận..." class="input-comment flex-1 bg-slate-900 border border-slate-700/80 rounded-xl px-2.5 py-1.5 text-[11px] text-slate-100 focus:outline-none focus:border-emerald-500">
        <button class="btn-submit-comment px-2.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-xl" data-id="${post.id}">
          Gửi
        </button>
      </div>
    </div>
  `;

  // Attach like event
  const btnLike = card.querySelector('.btn-like');
  btnLike.onclick = async () => {
    try {
      const res = await apiRequest(`/feed/posts/${post.id}/like`, 'POST');
      const countEl = btnLike.querySelector('.like-count');
      const icon = btnLike.querySelector('i');
      countEl.innerText = res.data.likesCount;
      if (res.data.isLiked) {
        btnLike.className = 'btn-like flex items-center gap-1.5 text-xs font-semibold text-rose-500 transition';
        icon.classList.add('fill-rose-500');
      } else {
        btnLike.className = 'btn-like flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-rose-400 transition';
        icon.classList.remove('fill-rose-500');
      }
    } catch (e) {
      alert(e.message);
    }
  };

  // Attach comment submit event
  const inputComment = card.querySelector('.input-comment');
  const btnSubmitComment = card.querySelector('.btn-submit-comment');
  const commentsList = card.querySelector('.comments-list');
  const commentCountEl = card.querySelector('.comment-count');

  const submitCommentFn = async () => {
    const text = inputComment.value.trim();
    if (!text) return;
    inputComment.value = '';

    try {
      const res = await apiRequest(`/feed/posts/${post.id}/comments`, 'POST', { content: text });
      const c = res.data;
      const cmtDiv = document.createElement('div');
      cmtDiv.className = 'p-2 bg-slate-900/60 rounded-xl flex items-start gap-2 animate-fade-in';
      cmtDiv.innerHTML = `
        <img src="${c.author.avatarUrl}" class="w-6 h-6 rounded-full object-cover shrink-0 mt-0.5">
        <div class="flex-1">
          <span class="font-bold text-slate-200">${c.author.fullName}:</span>
          <span class="text-slate-300 ml-1">${c.content}</span>
        </div>
      `;
      commentsList.appendChild(cmtDiv);
      commentCountEl.innerText = parseInt(commentCountEl.innerText || '0') + 1;
    } catch (e) {
      alert(e.message);
    }
  };

  btnSubmitComment.onclick = submitCommentFn;
  inputComment.onkeydown = (e) => {
    if (e.key === 'Enter') submitCommentFn();
  };

  return card;
}

function formatTimeAgo(dateInput) {
  const d = new Date(dateInput);
  const now = new Date();
  const diffSec = Math.round((now.getTime() - d.getTime()) / 1000);

  if (diffSec < 60) return 'Vừa xong';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} phút trước`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} giờ trước`;
  return `${Math.floor(diffSec / 86400)} ngày trước`;
}

// Gửi bài viết mới
async function handleSubmitPost() {
  const content = document.getElementById('feedPostContent').value.trim();
  const privacy = document.getElementById('feedPrivacySelect').value;

  if (!content && STATE.selectedFeedFiles.length === 0) {
    alert('Vui lòng nhập nội dung bài viết hoặc đính kèm hình ảnh');
    return;
  }

  const formData = new FormData();
  formData.append('content', content);
  formData.append('privacy', privacy);

  if (STATE.pendingCheckin) {
    formData.append('checkinName', STATE.pendingCheckin.name);
    formData.append('checkinLat', STATE.pendingCheckin.lat);
    formData.append('checkinLon', STATE.pendingCheckin.lon);
  }

  for (const file of STATE.selectedFeedFiles) {
    formData.append('images', file);
  }

  try {
    const res = await fetch('/api/v1/feed/posts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${STATE.token}` },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);

    // Reset form
    document.getElementById('feedPostContent').value = '';
    STATE.selectedFeedFiles = [];
    document.getElementById('feedImagePreviewContainer').innerHTML = '';
    document.getElementById('feedImagePreviewContainer').classList.add('hidden');
    removeCheckinTag();

    alert('Đăng bài viết thành công!');
    loadFeed();
    loadCheckinPins(); // Cập nhật ghim check-in trên map
  } catch (err) {
    alert(err.message);
  }
}

// ------------------------------------------------------------------------------
// 6. GIAI ĐOẠN 2: GHIM CHECK-IN TRÊN BẢN ĐỒ (CHECK-IN PINS)
// ------------------------------------------------------------------------------
async function loadCheckinPins() {
  if (!STATE.checkinPinsVisible) {
    clearCheckinPins();
    return;
  }

  try {
    const res = await apiRequest(`/feed/checkins?radius=15000`);
    clearCheckinPins();

    res.data.forEach((pin) => {
      const pinIcon = L.divIcon({
        className: 'custom-checkin-marker',
        html: `<div class="marker-checkin-pin"><span>📍</span></div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
      });

      const marker = L.marker([pin.blurredLat, pin.blurredLon], { icon: pinIcon })
        .addTo(STATE.map)
        .bindPopup(`
          <div class="text-xs p-1 text-slate-900 font-sans" style="max-width: 220px;">
            <div class="font-bold text-amber-600 mb-0.5">📍 ${pin.checkinName}</div>
            <div class="text-[11px] text-slate-700 mb-1">Đăng bởi <strong>${pin.authorName}</strong> (~${formatDistance(pin.distanceMeters)})</div>
            ${pin.thumbnailUrl ? `<img src="${pin.thumbnailUrl}" class="w-full h-24 object-cover rounded-md mb-1.5">` : ''}
            <p class="text-[11px] text-slate-600 italic line-clamp-2">${pin.contentPreview}</p>
          </div>
        `);

      STATE.checkinMarkers.push(marker);
    });
  } catch (err) {
    console.error('Lỗi khi tải check-in pins:', err);
  }
}

function clearCheckinPins() {
  STATE.checkinMarkers.forEach((m) => STATE.map.removeLayer(m));
  STATE.checkinMarkers = [];
}

// ------------------------------------------------------------------------------
// 7. GIAI ĐOẠN 2: THÔNG BÁO THỜI GIAN THỰC (NOTIFICATIONS)
// ------------------------------------------------------------------------------
async function loadNotifications() {
  try {
    const res = await apiRequest('/notifications');
    STATE.notifications = res.data;

    const badge = document.getElementById('badgeNotifCount');
    if (res.unreadCount > 0) {
      badge.classList.remove('hidden');
      badge.innerText = res.unreadCount;
    } else {
      badge.classList.add('hidden');
    }

    renderNotificationsList();
  } catch (err) {
    console.error('Lỗi tải thông báo:', err);
  }
}

function renderNotificationsList() {
  const container = document.getElementById('listNotifsStream');
  if (STATE.notifications.length === 0) {
    container.innerHTML = '<div class="text-center py-6 text-xs text-slate-500">Chưa có thông báo nào</div>';
    return;
  }

  container.innerHTML = '';
  STATE.notifications.forEach((n) => {
    const item = document.createElement('div');
    item.className = `p-2 rounded-xl text-xs flex flex-col gap-0.5 transition cursor-pointer ${n.isRead ? 'bg-slate-800/40 text-slate-400' : 'bg-slate-800 text-slate-200 font-semibold border-l-2 border-emerald-400'}`;
    item.innerHTML = `
      <div class="flex items-center justify-between">
        <span class="text-emerald-400 text-[10px] font-bold">${n.title}</span>
        <span class="text-[9px] text-slate-500">${formatTimeAgo(n.createdAt)}</span>
      </div>
      <p class="text-[11px]">${n.body}</p>
    `;
    item.onclick = async () => {
      if (!n.isRead) {
        await apiRequest(`/notifications/${n.id}/read`, 'POST');
        n.isRead = true;
        loadNotifications();
      }
    };
    container.appendChild(item);
  });
}

function handleIncomingNotification(notification) {
  STATE.notifications.unshift(notification);
  const badge = document.getElementById('badgeNotifCount');
  badge.classList.remove('hidden');
  badge.innerText = parseInt(badge.innerText || '0') + 1;
  renderNotificationsList();

  // Hiển thị thông báo Toast nhanh góc màn hình
  console.log('[Push Alert]:', notification.title, notification.body);
  const rideId = notification.data?.rideId || notification.payloadData?.rideId;
  if (rideId && STATE.driverEarningMode) {
    loadOpenRideRequests();
    showToast(`🔔 ${notification.title}`, 'info');
  }
}

// ------------------------------------------------------------------------------
// 8. KẾT NỐI WEBSOCKET REALTIME (SOCKET.IO)
// ------------------------------------------------------------------------------
function connectSocket() {
  if (STATE.socket) {
    STATE.socket.disconnect();
  }

  STATE.socket = io({
    auth: { token: STATE.token },
  });

  STATE.socket.on('connect', () => {
    console.log('[Socket] Đã kết nối thành công:', STATE.socket.id);
  });

  // Nhận tin nhắn mới thời gian thực
  STATE.socket.on('chat:receive_message', (payload) => {
    handleIncomingMessage(payload);
  });

  // Xác nhận tin nhắn đã gửi
  STATE.socket.on('chat:sent_success', (payload) => {
    if (payload.conversation?.id) {
      STATE.activeConversationId = payload.conversation.id;
      STATE.activeConversationType = payload.conversation.type || STATE.activeConversationType;
    }
    appendMessageBubble(payload.message, true);
  });

  // Đối phương đang gõ phím
  STATE.socket.on('chat:user_typing', (payload) => {
    if (payload.userId === STATE.activeChatPartnerId) {
      const el = document.getElementById('chatTypingStatus');
      el.innerText = payload.isTyping ? 'Đang soạn tin nhắn...' : 'Đang trực tuyến';
    }
  });

  // Đối phương đã xem tin nhắn
  STATE.socket.on('chat:messages_read', () => {
    document.querySelectorAll('.msg-status').forEach((el) => {
      el.innerText = '✓✓ Đã xem';
      el.className = 'msg-status text-[9px] text-emerald-400 ml-1';
    });
  });

  // Giai đoạn 2: Nhận thông báo mới thời gian thực
  STATE.socket.on('notification:new', (notification) => {
    handleIncomingNotification(notification);
  });

  // GIAI ĐOẠN 3: SỰ KIỆN CUỘC GỌI WEBRTC
  // Có cuộc gọi đến
  STATE.socket.on('call:incoming', (payload) => {
    handleIncomingCall(payload);
  });

  // Máy người gọi: Người nhận đang đổ chuông
  STATE.socket.on('call:ringing', (payload) => {
    STATE.activeCallSession = payload.session;
    showCallToast('📞 Đang đổ chuông tới đối phương...');
  });

  // Người nhận đã bấm "Đồng ý"
  STATE.socket.on('call:accepted', (payload) => {
    handleCallAccepted(payload.session);
  });

  // Cuộc gọi bị từ chối
  STATE.socket.on('call:rejected', (payload) => {
    handleCallEnded('Cuộc gọi đã bị từ chối: ' + (payload.reason || 'Người nhận bận'));
  });

  // Cuộc gọi kết thúc (gác máy)
  STATE.socket.on('call:ended', (payload) => {
    handleCallEnded('Cuộc gọi đã kết thúc. Thời lượng: ' + (payload.callLog?.durationSeconds || 0) + ' giây');
  });

  // Lỗi cuộc gọi
  STATE.socket.on('call:error', (err) => {
    alert(err.message || 'Lỗi cuộc gọi');
  });

  // ONLY RIDE realtime: trạng thái, vị trí tài xế và lỗi kết nối
  STATE.socket.on('ride:status_changed', (payload) => {
    if (payload?.ride && (!STATE.activeRide || payload.ride.id === STATE.activeRide.id)) {
      STATE.activeRide = payload.ride;
      renderActiveRide();
      if (STATE.activeRide.status === 'completed' || STATE.activeRide.status === 'cancelled') {
        stopDriverLocationWatch();
      }
      renderRideMap();
    }
  });

  STATE.socket.on('ride:driver_moved', (payload) => {
    if (!STATE.activeRide || payload?.rideId !== STATE.activeRide.id) return;
    STATE.activeRide.driverLat = payload.lat;
    STATE.activeRide.driverLon = payload.lon;
    renderRideMap();
    updateRideStatusLive(`Tài xế đã cập nhật vị trí lúc ${formatTimeAgo(payload.updatedAt || new Date())}`);
  });

  STATE.socket.on('ride:alert', (payload) => {
    if (payload?.rideId && (!STATE.activeRide || payload.rideId === STATE.activeRide.id)) {
      showToast(payload.message || 'Có cập nhật chuyến đi', 'info');
      loadActiveRide();
    }
  });

  STATE.socket.on('ride:error', (payload) => {
    updateRideStatusLive(payload?.message || 'Không thể đồng bộ chuyến đi', true);
    showToast(payload?.message || 'Lỗi chuyến đi', 'error');
  });
}

function handleIncomingMessage(payload) {
  const isActiveConversation = STATE.activeConversationId === payload.conversation.id;
  if (isActiveConversation) {
    appendMessageBubble(payload.message, payload.message.senderId === STATE.currentUser?.id);
    if (STATE.socket) {
      const recipients = payload.conversation.memberIds?.filter((id) => id !== STATE.currentUser?.id) || [payload.message.senderId];
      recipients.forEach((partnerId) => {
        STATE.socket.emit('chat:read', {
          conversationId: payload.conversation.id,
          partnerId,
        });
      });
    }
  } else { 
    const badge = document.getElementById('badgeUnread');
    badge.classList.remove('hidden');
    badge.innerText = parseInt(badge.innerText || '0') + 1;
    loadConversations();
  }
}

// ------------------------------------------------------------------------------
// GIAI ĐOẠN 3: XỬ LÝ CUỘC GỌI WEBRTC (VOICE & VIDEO CALLING)
// ------------------------------------------------------------------------------
function showCallToast(msg) {
  console.log('[Call Status]:', msg);
}

function startCall(callType) {
  if (!STATE.activeChatPartnerId) {
    alert('Vui lòng chọn một người bạn để gọi');
    return;
  }

  if (STATE.socket && STATE.socket.connected) {
    STATE.socket.emit('call:initiate', {
      receiverId: STATE.activeChatPartnerId,
      callType,
    });

    const partnerAvatar = document.getElementById('chatPartnerAvatar').src;
    const partnerName = document.getElementById('chatPartnerName').innerText;

    document.getElementById('activeCallPartnerAvatar').src = partnerAvatar;
    document.getElementById('activeCallPartnerName').innerText = partnerName;
    document.getElementById('activeCallTimer').innerText = 'Đang đổ chuông...';
    document.getElementById('activeCallBadge').innerText = callType === 'video' ? 'Video Calling' : 'Voice Calling';

    if (callType === 'video') {
      document.getElementById('remoteVideo').classList.remove('hidden');
      document.getElementById('localVideo').classList.remove('hidden');
      document.getElementById('callAudioView').classList.add('hidden');
    } else {
      document.getElementById('remoteVideo').classList.add('hidden');
      document.getElementById('localVideo').classList.add('hidden');
      document.getElementById('callAudioView').classList.remove('hidden');
    }

    document.getElementById('activeCallModal').classList.remove('hidden');
  } else {
    alert('Chưa kết nối máy chủ thời gian thực');
  }
}

function handleIncomingCall(payload) {
  STATE.incomingCallSession = payload.session;
  document.getElementById('incomingCallerAvatar').src = payload.caller.avatarUrl;
  document.getElementById('incomingCallerName').innerText = payload.caller.fullName;
  document.getElementById('incomingCallTypeText').innerText =
    payload.session.callType === 'video' ? 'Cuộc gọi Video WebRTC đến...' : 'Cuộc gọi Thoại WebRTC đến...';

  document.getElementById('incomingCallModal').classList.remove('hidden');
  refreshIcons();
}

function acceptIncomingCall() {
  if (!STATE.incomingCallSession || !STATE.socket) return;

  STATE.socket.emit('call:accept', { sessionId: STATE.incomingCallSession.sessionId });
  document.getElementById('incomingCallModal').classList.add('hidden');

  const partnerAvatar = document.getElementById('incomingCallerAvatar').src;
  const partnerName = document.getElementById('incomingCallerName').innerText;

  document.getElementById('activeCallPartnerAvatar').src = partnerAvatar;
  document.getElementById('activeCallPartnerName').innerText = partnerName;
  document.getElementById('activeCallTimer').innerText = 'Đang kết nối...';

  if (STATE.incomingCallSession.callType === 'video') {
    document.getElementById('remoteVideo').classList.remove('hidden');
    document.getElementById('localVideo').classList.remove('hidden');
    document.getElementById('callAudioView').classList.add('hidden');
  } else {
    document.getElementById('remoteVideo').classList.add('hidden');
    document.getElementById('localVideo').classList.add('hidden');
    document.getElementById('callAudioView').classList.remove('hidden');
  }

  document.getElementById('activeCallModal').classList.remove('hidden');
}

function rejectIncomingCall() {
  if (!STATE.incomingCallSession || !STATE.socket) return;
  STATE.socket.emit('call:reject', {
    sessionId: STATE.incomingCallSession.sessionId,
    reason: 'Người nhận từ chối cuộc gọi',
  });
  document.getElementById('incomingCallModal').classList.add('hidden');
  STATE.incomingCallSession = null;
}

function handleCallAccepted(session) {
  STATE.activeCallSession = session;
  document.getElementById('incomingCallModal').classList.add('hidden');
  document.getElementById('activeCallModal').classList.remove('hidden');
  document.getElementById('activeCallBadge').innerText = 'Đang đàm thoại (TLS)';

  // Bắt đầu đếm thời gian cuộc gọi
  clearInterval(STATE.callTimerInterval);
  STATE.callSeconds = 0;
  STATE.callTimerInterval = setInterval(() => {
    STATE.callSeconds++;
    const mins = String(Math.floor(STATE.callSeconds / 60)).padStart(2, '0');
    const secs = String(STATE.callSeconds % 60).padStart(2, '0');
    document.getElementById('activeCallTimer').innerText = `${mins}:${secs}`;
  }, 1000);
}

function hangupCall() {
  if (STATE.activeCallSession && STATE.socket) {
    STATE.socket.emit('call:hangup', { sessionId: STATE.activeCallSession.sessionId });
  }
  handleCallEnded('Bạn đã gác máy');
}

function handleCallEnded(msg) {
  clearInterval(STATE.callTimerInterval);
  STATE.activeCallSession = null;
  STATE.incomingCallSession = null;
  document.getElementById('incomingCallModal').classList.add('hidden');
  document.getElementById('activeCallModal').classList.add('hidden');
  alert(msg);
}

// ------------------------------------------------------------------------------
// GIAI ĐOẠN 3: TRUNG TÂM KIỂM DUYỆT NỘI DUNG (MODERATION CENTER)
// ------------------------------------------------------------------------------
async function openModerationModal() {
  document.getElementById('moderationModal').classList.remove('hidden');
  loadModerationReports();
}

function closeModerationModal() {
  document.getElementById('moderationModal').classList.add('hidden');
}

async function loadModerationReports() {
  const listEl = document.getElementById('listModerationReports');
  listEl.innerHTML = '<div class="text-center py-4 text-xs text-slate-500">Đang tải danh sách báo cáo...</div>';

  try {
    const res = await apiRequest('/moderation/reports');
    if (res.data.length === 0) {
      listEl.innerHTML = '<div class="text-center py-6 text-xs text-slate-400">Không có báo cáo vi phạm nào đang chờ xử lý 🎉</div>';
      return;
    }

    listEl.innerHTML = '';
    res.data.forEach((r) => {
      const card = document.createElement('div');
      card.className = 'p-3 bg-slate-800/80 rounded-xl border border-slate-700 flex flex-col gap-2';
      card.innerHTML = `
        <div class="flex items-center justify-between">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold ${r.status === 'pending' ? 'bg-amber-950 text-amber-400 border border-amber-800' : 'bg-slate-700 text-slate-300'}">
            ${r.status === 'pending' ? 'Chờ xử lý' : r.status}
          </span>
          <span class="text-[10px] text-slate-500">${formatTimeAgo(r.createdAt)}</span>
        </div>
        <p class="text-xs text-slate-200"><strong>Người bị báo cáo:</strong> ${r.reportedUser.fullName} (ID: ${r.reportedUser.userId})</p>
        <p class="text-xs text-slate-200"><strong>Lý do:</strong> ${r.reasonCategory}</p>
        ${r.description ? `<p class="text-[11px] text-slate-400 italic bg-slate-900/60 p-1.5 rounded">"${r.description}"</p>` : ''}
        ${r.status === 'pending' ? `
          <div class="flex items-center gap-2 pt-1 border-t border-slate-700/60">
            <button class="btn-mod-suspend px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-[10px] font-bold" data-id="${r.id}">
              Tạm khoá tài khoản
            </button>
            <button class="btn-mod-dismiss px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded text-[10px]" data-id="${r.id}">
              Bác bỏ
            </button>
          </div>
        ` : ''}
      `;

      const btnSuspend = card.querySelector('.btn-mod-suspend');
      if (btnSuspend) {
        btnSuspend.onclick = async () => {
          await apiRequest(`/moderation/reports/${r.id}/resolve`, 'POST', { action: 'suspend_user' });
          alert('Đã tạm khoá tài khoản vi phạm');
          loadModerationReports();
        };
      }
      const btnDismiss = card.querySelector('.btn-mod-dismiss');
      if (btnDismiss) {
        btnDismiss.onclick = async () => {
          await apiRequest(`/moderation/reports/${r.id}/resolve`, 'POST', { action: 'dismiss' });
          loadModerationReports();
        };
      }

      listEl.appendChild(card);
    });
  } catch (err) {
    listEl.innerHTML = `<div class="text-center py-4 text-xs text-rose-400">${err.message}</div>`;
  }
}

async function testProfanity() {
  const text = document.getElementById('inputProfanityTest').value.trim();
  const resEl = document.getElementById('profanityResultText');
  if (!text) return;

  try {
    const res = await apiRequest('/moderation/check-text', 'POST', { text });
    if (res.data.hasProfanity) {
      resEl.innerHTML = `<span class="text-rose-400 font-bold">⚠️ Phát hiện từ cấm: [${res.data.matchedWords.join(', ')}]</span><br><span class="text-emerald-400">Văn bản sau khi lọc: "${res.data.cleanText}"</span>`;
    } else {
      resEl.innerHTML = `<span class="text-emerald-400 font-bold">✅ Văn bản an toàn, không có từ thô tục vi phạm!</span>`;
    }
  } catch (err) {
    resEl.innerHTML = `<span class="text-rose-400">${err.message}</span>`;
  }
}

// ------------------------------------------------------------------------------
// 9. NHẮN TIN 1-1 (CHAT DRAWER)
// ------------------------------------------------------------------------------
async function openChatConversation(conversation, directUser = null) {
  STATE.activeConversationId = conversation.conversationId || conversation.id;
  STATE.activeConversationType = conversation.type || 'direct';
  STATE.activeConversationName = conversation.name || directUser?.fullName || conversation.partner?.fullName || 'Tin nhắn';
  STATE.activeChatPartnerId = directUser?.userId || conversation.partner?.userId || null;

  const avatar = directUser?.avatarUrl || conversation.partner?.avatarUrl || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + STATE.activeConversationId;
  document.getElementById('chatPartnerAvatar').src = avatar;
  document.getElementById('chatPartnerName').innerText = STATE.activeConversationName;
  document.getElementById('chatTypingStatus').innerText = STATE.activeConversationType === 'group'
    ? `${conversation.memberCount || conversation.members?.length || 0} thành viên`
    : 'Đang trực tuyến';
  document.getElementById('chatDrawer').classList.remove('translate-x-full');

  const stream = document.getElementById('chatMessagesStream');
  stream.innerHTML = '<div class="text-center py-4 text-xs text-slate-500">Đang tải lịch sử trò chuyện...</div>';
  try {
    const resMsg = await apiRequest(`/chat/conversations/${STATE.activeConversationId}/messages`);
    renderMessagesStream(resMsg.data);
    await apiRequest(`/chat/conversations/${STATE.activeConversationId}/read`, 'POST');
  } catch (err) {
    stream.innerHTML = `<div class="text-center py-4 text-xs text-rose-400">${err.message}</div>`;
  }
}

async function openChatWithUser(user) {
  STATE.activeChatPartnerId = user.userId;
  STATE.activeConversationType = 'direct';
  STATE.activeConversationName = user.fullName;
  document.getElementById('chatPartnerAvatar').src = user.avatarUrl || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + user.userId;
  document.getElementById('chatPartnerName').innerText = user.fullName;
  document.getElementById('chatTypingStatus').innerText = 'Đang trực tuyến';
  document.getElementById('chatDrawer').classList.remove('translate-x-full');

  const stream = document.getElementById('chatMessagesStream');
  stream.innerHTML = '<div class="text-center py-4 text-xs text-slate-500">Đang tải lịch sử trò chuyện...</div>';

  try {
    const resConv = await apiRequest('/chat/conversations');
    const existing = resConv.data.find(
      (c) => c.partner && c.partner.userId === user.userId
    );

    if (existing) {
      STATE.activeConversationId = existing.conversationId;
      const resMsg = await apiRequest(
        `/chat/conversations/${existing.conversationId}/messages`
      );
      renderMessagesStream(resMsg.data);
      await apiRequest(`/chat/conversations/${existing.conversationId}/read`, 'POST');
    } else {
      STATE.activeConversationId = null;
      stream.innerHTML = `<div class="text-center py-8 text-xs text-slate-400">Hãy gửi lời chào đầu tiên tới <strong>${user.fullName}</strong> 👋</div>`;
    }
  } catch (err) {
    stream.innerHTML = `<div class="text-center py-4 text-xs text-rose-400">${err.message}</div>`;
  }
}

function renderMessagesStream(messages) {
  const stream = document.getElementById('chatMessagesStream');
  stream.innerHTML = '';
  messages.forEach((msg) => {
    const isMe = msg.senderId === STATE.currentUser.id;
    appendMessageBubble(msg, isMe);
  });
  stream.scrollTop = stream.scrollHeight;
}

function appendMessageBubble(msg, isMe) {
  const stream = document.getElementById('chatMessagesStream');
  const bubble = document.createElement('div');
  bubble.className = `flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[85%] ${isMe ? 'self-end' : 'self-start'}`;

  const timeStr = new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const statusStr = isMe ? (msg.status === 'read' ? '✓✓ Đã xem' : '✓ Đã gửi') : '';

  let contentHtml = '';
  if (msg.type === 'image' && msg.mediaUrl) {
    contentHtml = `<img src="${msg.mediaUrl}" class="rounded-lg max-h-48 object-cover cursor-pointer mb-1" onclick="window.open('${msg.mediaUrl}')">`;
  }
  if (msg.content) {
    contentHtml += `<p class="break-words">${msg.content}</p>`;
  }

  bubble.innerHTML = `
    <div class="px-3.5 py-2 rounded-2xl text-xs ${isMe ? 'bg-emerald-600 text-white rounded-br-none' : 'bg-slate-800 text-slate-200 rounded-bl-none'} shadow">
      ${contentHtml}
    </div>
    <div class="text-[9px] text-slate-500 mt-0.5 px-1 flex items-center">
      <span>${timeStr}</span>
      ${isMe ? `<span class="msg-status ml-1 ${msg.status === 'read' ? 'text-emerald-400' : ''}">${statusStr}</span>` : ''}
    </div>
  `;

  stream.appendChild(bubble);
  stream.scrollTop = stream.scrollHeight;
}

async function handleSendMessage() {
  const input = document.getElementById('chatTextInput');
  const text = input.value.trim();
  if (!text || (!STATE.activeConversationId && !STATE.activeChatPartnerId)) return;

  input.value = '';
  const payload = STATE.activeConversationType === 'group'
    ? { conversationId: STATE.activeConversationId, content: text, type: 'text' }
    : { receiverId: STATE.activeChatPartnerId, content: text, type: 'text' };

  if (STATE.socket && STATE.socket.connected) {
    STATE.socket.emit('chat:send', payload);
  } else {
    try {
      const res = await apiRequest('/chat/send', 'POST', payload);
      STATE.activeConversationId = res.data.conversation.id;
      appendMessageBubble(res.data.message, true);
    } catch (e) {
      alert(e.message);
    }
  }
}

async function searchUsersForChat(query, target = 'general') {
  const statusId = target === 'group' ? 'groupChatStatus' : 'userSearchStatus';
  const resultsId = target === 'group' ? 'listGroupMemberSearchResults' : 'listUserSearchResults';
  const statusEl = document.getElementById(statusId);
  const resultsEl = document.getElementById(resultsId);
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    statusEl.innerText = '';
    resultsEl.innerHTML = '';
    resultsEl.classList.add('hidden');
    return [];
  }

  statusEl.innerText = 'Đang tìm người dùng...';
  try {
    const res = await apiRequest(`/users/search?q=${encodeURIComponent(cleanQuery)}`);
    const users = res.data || [];
    statusEl.innerText = users.length ? `Tìm thấy ${users.length} người dùng` : 'Không tìm thấy người dùng phù hợp';
    resultsEl.innerHTML = '';
    resultsEl.classList.remove('hidden');
    resultsEl.classList.add('flex');

    users.forEach((user) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'w-full min-h-14 text-left p-2 rounded-xl bg-slate-900/70 hover:bg-slate-700 border border-slate-700/70 flex items-center justify-between gap-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400';
      const avatar = user.avatarUrl || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + user.userId;
      item.innerHTML = `
        <span class="flex items-center gap-2 min-w-0">
          <img src="${avatar}" alt="${user.fullName}" class="w-9 h-9 rounded-full object-cover shrink-0">
          <span class="min-w-0">
            <strong class="block text-xs text-slate-100 truncate">${user.fullName}</strong>
            <span class="block text-[10px] text-slate-400 truncate">${user.phoneMasked || (user.isFriend ? 'Bạn bè' : 'Người dùng Only')}</span>
          </span>
        </span>
        <span class="text-[10px] text-emerald-400 shrink-0">${target === 'group' ? 'Thêm' : 'Nhắn tin'}</span>
      `;
      item.onclick = () => {
        if (target === 'group') {
          addGroupMember(user);
        } else {
          resultsEl.classList.add('hidden');
          openChatWithUser(user);
        }
      };
      resultsEl.appendChild(item);
    });
    return users;
  } catch (err) {
    statusEl.innerText = err.message;
    resultsEl.innerHTML = '';
    resultsEl.classList.add('hidden');
    return [];
  }
}

function renderSelectedGroupMembers() {
  const listEl = document.getElementById('listSelectedGroupMembers');
  listEl.innerHTML = '';
  if (!STATE.groupSelectedMembers.length) {
    listEl.innerHTML = '<span class="text-[10px] text-slate-500 italic">Chưa chọn ai ngoài bạn</span>';
    return;
  }
  STATE.groupSelectedMembers.forEach((user) => {
    const chip = document.createElement('span');
    chip.className = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-emerald-950/70 border border-emerald-800 text-[10px] text-emerald-300';
    chip.innerHTML = `<span>${user.fullName}</span><button type="button" class="min-w-6 min-h-6 rounded-full hover:bg-rose-900 hover:text-rose-300" aria-label="Bỏ ${user.fullName}">×</button>`;
    chip.querySelector('button').onclick = () => {
      STATE.groupSelectedMembers = STATE.groupSelectedMembers.filter((member) => member.userId !== user.userId);
      renderSelectedGroupMembers();
    };
    listEl.appendChild(chip);
  });
}

function addGroupMember(user) {
  if (!STATE.groupSelectedMembers.some((member) => member.userId === user.userId)) {
    STATE.groupSelectedMembers.push(user);
    renderSelectedGroupMembers();
    document.getElementById('inputGroupMemberSearch').value = '';
    document.getElementById('listGroupMemberSearchResults').classList.add('hidden');
    document.getElementById('groupChatStatus').innerText = `Đã chọn ${STATE.groupSelectedMembers.length} thành viên`;
  }
}

function openGroupChatModal() {
  STATE.groupSelectedMembers = [];
  document.getElementById('inputGroupName').value = '';
  document.getElementById('inputGroupMemberSearch').value = '';
  document.getElementById('listGroupMemberSearchResults').innerHTML = '';
  document.getElementById('listGroupMemberSearchResults').classList.add('hidden');
  document.getElementById('groupChatStatus').innerText = '';
  renderSelectedGroupMembers();
  document.getElementById('groupChatModal').classList.remove('hidden');
  document.getElementById('inputGroupName').focus();
  refreshIcons();
}

function closeGroupChatModal() {
  document.getElementById('groupChatModal').classList.add('hidden');
}

async function createGroupChat() {
  const name = document.getElementById('inputGroupName').value.trim();
  const statusEl = document.getElementById('groupChatStatus');
  if (!name) {
    statusEl.innerText = 'Vui lòng nhập tên nhóm';
    document.getElementById('inputGroupName').focus();
    return;
  }
  if (!STATE.groupSelectedMembers.length) {
    statusEl.innerText = 'Hãy chọn ít nhất một thành viên';
    return;
  }
  statusEl.innerText = 'Đang tạo nhóm...';
  try {
    const res = await apiRequest('/chat/conversations', 'POST', {
      name,
      memberIds: STATE.groupSelectedMembers.map((member) => member.userId),
    });
    closeGroupChatModal();
    await loadConversations();
    showToast('✅ Đã tạo nhóm chat thành công', 'success');
    openChatConversation(res.data);
  } catch (err) {
    statusEl.innerText = err.message;
  }
}

async function loadConversations() {
  const listEl = document.getElementById('listConversations');
  try {
    const res = await apiRequest('/chat/conversations');
    if (res.data.length === 0) {
      listEl.innerHTML = '<div class="text-center py-6 text-xs text-slate-500">Chưa có cuộc trò chuyện nào</div>';
      return;
    }

    listEl.innerHTML = '';
    res.data.forEach((c) => {
      const isGroup = c.type === 'group';
      if (!isGroup && !c.partner) return;
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'w-full text-left p-2.5 min-h-16 rounded-xl bg-slate-800/40 hover:bg-slate-800 border border-slate-700/50 cursor-pointer flex items-center justify-between transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400';
      const title = isGroup ? (c.name || 'Nhóm chat Only') : c.partner.fullName;
      const subtitle = isGroup
        ? `${c.memberCount || c.members?.length || 0} thành viên${c.lastMessage?.content ? ` · ${c.lastMessage.content}` : ''}`
        : (c.lastMessage?.content || '[Hình ảnh]');
      const avatar = isGroup
        ? 'https://api.dicebear.com/7.x/shapes/svg?seed=' + c.conversationId
        : (c.partner.avatarUrl || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + c.partner.userId);
      item.innerHTML = `
        <div class="flex items-center gap-2.5 overflow-hidden">
          <img src="${avatar}" alt="${title}" class="w-10 h-10 rounded-full object-cover shrink-0">
          <div class="overflow-hidden">
            <h4 class="font-bold text-xs text-slate-200 truncate">${title}</h4>
            <p class="text-[10px] text-slate-400 truncate">${subtitle}</p>
          </div>
        </div>
        ${c.unreadCount > 0 ? `<span class="px-1.5 py-0.5 text-[9px] bg-emerald-500 text-slate-950 font-bold rounded-full">${c.unreadCount}</span>` : ''}
      `;
      item.onclick = () => isGroup ? openChatConversation(c) : openChatWithUser(c.partner);
      listEl.appendChild(item);
    });
  } catch (err) {
    listEl.innerHTML = `<div class="text-center py-4 text-xs text-rose-400">${err.message}</div>`;
  }
}

// ------------------------------------------------------------------------------
// 10. QUẢN LÝ BẠN BÈ
// ------------------------------------------------------------------------------
async function loadFriends() {
  const listPending = document.getElementById('listPendingFriends');
  const listAccepted = document.getElementById('listAcceptedFriends');

  try {
    const resReq = await apiRequest('/friends/requests');
    if (resReq.data.received.length === 0) {
      listPending.innerHTML = '<div class="text-xs text-slate-500 italic px-2">Không có lời mời nào</div>';
    } else {
      listPending.innerHTML = '';
      resReq.data.received.forEach((req) => {
        const d = document.createElement('div');
        d.className = 'p-2 bg-slate-800/70 border border-slate-700 rounded-xl flex items-center justify-between';
        d.innerHTML = `
          <div class="flex items-center gap-2">
            <img src="${req.avatarUrl}" class="w-8 h-8 rounded-full">
            <div>
              <p class="text-xs font-bold text-slate-200">${req.fullName}</p>
              <p class="text-[10px] text-slate-400">${req.age} tuổi</p>
            </div>
          </div>
          <div class="flex gap-1">
            <button class="btn-accept px-2 py-1 bg-emerald-500 hover:bg-emerald-600 text-slate-950 text-[10px] font-bold rounded" data-id="${req.requestId}">Đồng ý</button>
            <button class="btn-decline px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-[10px] rounded" data-id="${req.requestId}">Từ chối</button>
          </div>
        `;
        d.querySelector('.btn-accept').onclick = async () => {
          await apiRequest(`/friends/accept/${req.requestId}`, 'POST');
          loadFriends();
          loadNearbyUsers();
        };
        d.querySelector('.btn-decline').onclick = async () => {
          await apiRequest(`/friends/decline/${req.requestId}`, 'POST');
          loadFriends();
        };
        listPending.appendChild(d);
      });
    }

    const resFriends = await apiRequest('/friends');
    if (resFriends.data.length === 0) {
      listAccepted.innerHTML = '<div class="text-xs text-slate-500 italic px-2">Chưa có bạn bè nào</div>';
    } else {
      listAccepted.innerHTML = '';
      resFriends.data.forEach((f) => {
        const d = document.createElement('div');
        d.className = 'p-2 bg-slate-800/50 border border-slate-700/60 rounded-xl flex items-center justify-between';
        d.innerHTML = `
          <div class="flex items-center gap-2">
            <img src="${f.avatarUrl}" class="w-8 h-8 rounded-full">
            <div>
              <p class="text-xs font-bold text-slate-200">${f.fullName}</p>
              <p class="text-[10px] text-emerald-400">Bạn bè</p>
            </div>
          </div>
          <button class="btn-chat-friend p-1.5 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-slate-950 rounded-lg transition">
            <i data-lucide="message-circle" class="w-3.5 h-3.5"></i>
          </button>
        `;
        d.querySelector('.btn-chat-friend').onclick = () => openChatWithUser(f);
        listAccepted.appendChild(d);
      });
    }
  } catch (err) {
    console.error('Lỗi tải bạn bè:', err);
  }
}

// ------------------------------------------------------------------------------
// 11. CÀI ĐẶT GHOST MODE & QUYỀN RIÊNG TƯ
// ------------------------------------------------------------------------------
async function toggleGhostMode(enabled) {
  try {
    await apiRequest('/users/settings', 'PUT', { ghostMode: enabled });
    if (STATE.socket) {
      STATE.socket.emit('location:toggle_ghost', { ghostMode: enabled });
    }
    if (enabled) {
      alert('👻 Đã bật Chế độ Ẩn danh (Ghost Mode)! Bạn đã biến mất hoàn toàn khỏi radar của người khác.');
      if (STATE.radarCircle) STATE.radarCircle.setStyle({ color: '#a855f7', fillColor: '#a855f7' });
    } else {
      alert('Đã tắt Ghost Mode. Vị trí của bạn đang được chia sẻ an toàn (làm mờ 100-300m).');
      if (STATE.radarCircle) STATE.radarCircle.setStyle({ color: '#10b981', fillColor: '#10b981' });
    }
  } catch (err) {
    alert(err.message);
  }
}

// ------------------------------------------------------------------------------
// 12. XÁC THỰC (ĐĂNG NHẬP / ĐĂNG KÝ)
// ------------------------------------------------------------------------------
async function fetchCurrentUser() {
  const res = await apiRequest('/auth/me');
  STATE.currentUser = res.data;
  renderUserHeader();

  const ghostToggle = document.getElementById('ghostModeToggle');
  if (ghostToggle && res.data.settings) {
    ghostToggle.checked = res.data.settings.ghostMode;
  }

  // Cập nhật avatar trên form đăng bài
  if (res.data.profile) {
    document.getElementById('feedMyAvatar').src = res.data.profile.avatarUrl;
    document.getElementById('feedMyName').innerText = `${res.data.profile.fullName}, bạn đang nghĩ gì?`;
  }
}

function renderUserHeader() {
  const area = document.getElementById('userHeaderArea');
  if (STATE.currentUser) {
    const avatarUrl = STATE.currentUser.profile?.avatarUrl || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + STATE.currentUser.id;
    const fullName = STATE.currentUser.profile?.fullName || 'Người dùng';

    // Cập nhật tắt ảnh avatar bên tab Settings
    const setAvt = document.getElementById('settingsAvatarPreview');
    if (setAvt) setAvt.src = avatarUrl;
    const setName = document.getElementById('settingsFullName');
    if (setName) setName.innerText = fullName;

    area.innerHTML = `
      <div class="flex items-center gap-2">
        <button id="btnHeaderOpenProfile" class="flex items-center gap-2 p-1 rounded-xl hover:bg-slate-800 transition text-left group" title="Bấm để xem và sửa trang cá nhân, đổi ảnh đại diện">
          <img src="${avatarUrl}" class="w-8 h-8 rounded-full border-2 border-emerald-400 object-cover shadow group-hover:scale-105 transition">
          <div class="hidden sm:flex flex-col">
            <span class="text-xs font-bold text-slate-100 truncate max-w-[110px] group-hover:text-emerald-400 transition">${fullName}</span>
            <span class="text-[9px] text-emerald-400 font-medium">Sửa trang cá nhân ✎</span>
          </div>
        </button>
        <button id="btnNewAccountHeader" class="px-2.5 py-1.5 text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-slate-950 rounded-xl transition shadow flex items-center gap-1.5" title="Tạo tài khoản mới">
          <i data-lucide="user-plus" class="w-3.5 h-3.5"></i> <span>Tạo Nick Mới</span>
        </button>
        <button id="btnLogout" class="text-slate-400 hover:text-rose-400 p-1.5 rounded-lg hover:bg-slate-800 transition" title="Đăng xuất">
          <i data-lucide="log-out" class="w-4 h-4"></i>
        </button>
      </div>
    `;
    document.getElementById('btnLogout').onclick = logout;
    document.getElementById('btnHeaderOpenProfile').onclick = openMyProfileModal;
    document.getElementById('btnNewAccountHeader').onclick = () => openAuthModal('register');
  } else {
    area.innerHTML = `
      <div class="flex items-center gap-2">
        <button id="btnHeaderRegister" class="px-3 py-1.5 text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-slate-950 rounded-xl transition shadow flex items-center gap-1.5 animate-pulse">
          <i data-lucide="user-plus" class="w-3.5 h-3.5"></i> <span>Tạo Tài Khoản Mới</span>
        </button>
        <button id="btnHeaderLogin" class="px-2.5 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition border border-slate-700">
          Đăng Nhập
        </button>
      </div>
    `;
    document.getElementById('btnHeaderRegister').onclick = () => openAuthModal('register');
    document.getElementById('btnHeaderLogin').onclick = () => openAuthModal('login');
  }
  refreshIcons();
}

async function quickLogin(identifier, password) {
  const res = await apiRequest('/auth/login', 'POST', { identifier, password });
  STATE.token = res.data.token;
  localStorage.setItem('only_token', STATE.token);
  STATE.currentUser = res.data.user;
  renderUserHeader();
  connectSocket();
  initGeolocation();
  loadNearbyUsers();
  loadConversations();
  loadFriends();
  loadFeed();
  loadNotifications();
  loadCheckinPins();
  closeAuthModal();
}

// ------------------------------------------------------------------------------
// QUẢN LÝ TRANG CÁ NHÂN & CẬP NHẬT AVATAR CỦA TÔI
// ------------------------------------------------------------------------------
let userInterestsCopy = [];

function openMyProfileModal() {
  if (!STATE.currentUser || !STATE.currentUser.profile) {
    openAuthModal('login');
    return;
  }

  const p = STATE.currentUser.profile;
  document.getElementById('myProfileModalAvatar').src = p.avatarUrl || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + STATE.currentUser.id;
  document.getElementById('editFullName').value = p.fullName || '';
  document.getElementById('editBio').value = p.bio || '';
  document.getElementById('editDob').value = p.dateOfBirth || '1995-01-01';
  document.getElementById('editGender').value = p.gender || 'male';
  document.getElementById('editCity').value = p.generalCity || '';

  userInterestsCopy = [...(p.interests || [])];
  renderMyInterestsTags();

  document.getElementById('myProfileModal').classList.remove('hidden');
  refreshIcons();
}

function closeMyProfileModal() {
  document.getElementById('myProfileModal').classList.add('hidden');
}

function renderMyInterestsTags() {
  const container = document.getElementById('myInterestsList');
  container.innerHTML = '';
  if (userInterestsCopy.length === 0) {
    container.innerHTML = '<span class="text-[11px] text-slate-500 italic">Chưa có sở thích nào. Hãy thêm vài sở thích bên dưới!</span>';
    return;
  }
  userInterestsCopy.forEach((tag, idx) => {
    const span = document.createElement('span');
    span.className = 'px-2.5 py-1 bg-slate-800 border border-slate-700 rounded-full text-slate-300 flex items-center gap-1.5 text-[11px]';
    span.innerHTML = `<span>${tag}</span><button type="button" class="text-slate-400 hover:text-rose-400" onclick="removeMyInterest(${idx})">✕</button>`;
    container.appendChild(span);
  });
}

window.removeMyInterest = function(index) {
  userInterestsCopy.splice(index, 1);
  renderMyInterestsTags();
};

async function saveMyProfile() {
  const fullName = document.getElementById('editFullName').value.trim();
  const bio = document.getElementById('editBio').value.trim();
  const dateOfBirth = document.getElementById('editDob').value;
  const gender = document.getElementById('editGender').value;
  const generalCity = document.getElementById('editCity').value.trim();

  if (!fullName) {
    alert('Vui lòng nhập họ và tên');
    return;
  }

  try {
    const res = await apiRequest('/users/profile', 'PUT', {
      fullName,
      bio,
      dateOfBirth,
      gender,
      generalCity,
      interests: userInterestsCopy,
    });

    STATE.currentUser.profile = res.data;
    renderUserHeader();
    closeMyProfileModal();
    alert('✅ Cập nhật trang cá nhân thành công!');
    loadNearbyUsers(); // Cập nhật lại radar
  } catch (err) {
    alert(err.message);
  }
}

async function uploadMyAvatar(file) {
  if (!file) return;

  const formData = new FormData();
  formData.append('avatar', file);

  try {
    const res = await fetch('/api/v1/users/avatar', {
      method: 'POST',
      headers: { Authorization: `Bearer ${STATE.token}` },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);

    STATE.currentUser.profile = data.data.profile;
    document.getElementById('myProfileModalAvatar').src = data.data.avatarUrl;
    renderUserHeader();
    alert('✅ Cập nhật ảnh đại diện (Avatar) thành công!');
    loadNearbyUsers();
  } catch (err) {
    alert(err.message);
  }
}

function logout() {
  STATE.token = null;
  STATE.currentUser = null;
  localStorage.removeItem('only_token');
  if (STATE.socket) STATE.socket.disconnect();
  location.reload();
}

// ------------------------------------------------------------------------------
// 13. TIỆN ÍCH GỌI API (FETCH WRAPPER)
// ------------------------------------------------------------------------------
async function apiRequest(endpoint, method = 'GET', body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (STATE.token) {
    headers['Authorization'] = `Bearer ${STATE.token}`;
  }

  const opt = { method, headers };
  if (body) {
    opt.body = JSON.stringify(body);
  }

  const res = await fetch(`/api/v1${endpoint}`, opt);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || 'Lỗi yêu cầu máy chủ');
  }
  return data;
}

function removeCheckinTag() {
  STATE.pendingCheckin = null;
  document.getElementById('checkinPreviewTag').classList.add('hidden');
  document.getElementById('checkinNameText').innerText = '';
}

// ------------------------------------------------------------------------------
// CHUYỂN TAB TẬP TRUNG (RESPONSIVE CẢ MOBILE VÀ DESKTOP)
// ------------------------------------------------------------------------------
function switchTab(tabKey) {
  STATE.activeTab = tabKey;

  const tabDefs = [
    { key: 'radar', desktopBtn: 'tabRadar', mobileBtn: 'mobileTabRadar', panel: 'panelRadar' },
    { key: 'ride', desktopBtn: 'tabRide', mobileBtn: 'mobileTabRide', panel: 'panelRide' },
    { key: 'feed', desktopBtn: 'tabFeed', mobileBtn: 'mobileTabFeed', panel: 'panelFeed' },
    { key: 'messages', desktopBtn: 'tabMessages', mobileBtn: 'mobileTabMessages', panel: 'panelMessages' },
    { key: 'friends', desktopBtn: 'tabFriends', mobileBtn: 'mobileTabFriends', panel: 'panelFriends' },
    { key: 'settings', desktopBtn: 'tabSettings', mobileBtn: 'mobileTabSettings', panel: 'panelSettings' },
  ];

  const sidebarEl = document.getElementById('sidebar');
  const mainMapEl = document.getElementById('mainMapArea');

  tabDefs.forEach((t) => {
    const isCurrent = t.key === tabKey;
    const dBtn = document.getElementById(t.desktopBtn);
    const mBtn = document.getElementById(t.mobileBtn);
    const panel = document.getElementById(t.panel);

    if (dBtn) {
      dBtn.className = isCurrent
        ? 'py-2.5 flex flex-col items-center gap-1 border-b-2 border-emerald-400 text-emerald-400 bg-slate-800/40 font-bold'
        : 'py-2.5 flex flex-col items-center gap-1 border-b-2 border-transparent hover:text-slate-200';
    }

    if (mBtn) {
      mBtn.className = isCurrent
        ? 'flex flex-col items-center gap-0.5 text-[10px] text-emerald-400 font-bold px-2 py-1 transition'
        : 'flex flex-col items-center gap-0.5 text-[10px] text-slate-400 hover:text-slate-200 px-2 py-1 transition';
    }

    if (panel) {
      if (isCurrent) {
        panel.classList.remove('hidden');
      } else {
        panel.classList.add('hidden');
      }
    }
  });

  // XỬ LÝ GIAO DIỆN DI ĐỘNG (< 768px):
  const isMobile = window.innerWidth < 768;

  if (isMobile) {
    if (tabKey === 'radar') {
      // Ở tab Radar: Bản đồ chiếm 100% toàn màn hình điện thoại
      sidebarEl.className = 'hidden md:flex w-full md:w-96 bg-slate-900/95 border-r border-slate-800 flex-col z-10 transition-all duration-300 h-full overflow-hidden shrink-0';
      mainMapEl.classList.remove('hidden');
      mainMapEl.classList.add('flex');
      setTimeout(() => {
        if (STATE.map) STATE.map.invalidateSize();
      }, 150);
    } else {
      // Ở các tab Bảng Tin, Chat, Bạn bè, Cá nhân: Hiển thị toàn màn hình nội dung, ẩn bản đồ
      sidebarEl.className = 'flex fixed inset-0 top-[49px] pb-14 bg-slate-950 z-20 w-full flex-col h-[calc(100dvh-49px)] overflow-hidden';
      mainMapEl.classList.add('hidden');
      mainMapEl.classList.remove('flex');
    }
  } else {
    // Trên máy tính Desktop: Luôn hiển thị cả Sidebar bên trái và Bản đồ bên phải
    sidebarEl.className = 'hidden md:flex w-full md:w-96 bg-slate-900/95 border-r border-slate-800 flex-col z-10 transition-all duration-300 h-full overflow-hidden shrink-0';
    mainMapEl.classList.remove('hidden');
    mainMapEl.classList.add('flex');
    setTimeout(() => {
      if (STATE.map) STATE.map.invalidateSize();
    }, 150);
  }

  // Tải dữ liệu tương ứng
  if (tabKey === 'radar') {
    loadNearbyUsers();
  } else if (tabKey === 'ride') {
    loadActiveRide();
    if (STATE.driverEarningMode) loadOpenRideRequests();
  } else if (tabKey === 'feed') {
    loadFeed();
  } else if (tabKey === 'messages') {
    const badge = document.getElementById('badgeUnread');
    if (badge) { badge.classList.add('hidden'); badge.innerText = '0'; }
    const mBadge = document.getElementById('mobileBadgeUnread');
    if (mBadge) { mBadge.classList.add('hidden'); mBadge.innerText = '0'; }
    loadConversations();
  } else if (tabKey === 'friends') {
    loadFriends();
  }
}

// ------------------------------------------------------------------------------
// 14. BẮT SỰ KIỆN GIAO DIỆN (EVENT LISTENERS)
// ------------------------------------------------------------------------------
function setupEventListeners() {
  // Bắt sự kiện 5 Tab Desktop
  document.getElementById('tabRadar').onclick = () => switchTab('radar');
  const desktopRideTab = document.getElementById('tabRide');
  if (desktopRideTab) desktopRideTab.addEventListener('click', () => switchTab('ride'));
  document.getElementById('tabFeed').onclick = () => switchTab('feed');
  document.getElementById('tabMessages').onclick = () => switchTab('messages');
  document.getElementById('tabFriends').onclick = () => switchTab('friends');
  document.getElementById('tabSettings').onclick = () => switchTab('settings');

  // Tìm người và tạo nhóm chat
  const userSearchForm = document.getElementById('formUserSearch');
  if (userSearchForm) {
    userSearchForm.onsubmit = (event) => {
      event.preventDefault();
      searchUsersForChat(document.getElementById('inputUserSearch').value, 'general');
    };
  }
  const groupMemberSearchForm = document.getElementById('formGroupMemberSearch');
  if (groupMemberSearchForm) {
    groupMemberSearchForm.onsubmit = (event) => {
      event.preventDefault();
      searchUsersForChat(document.getElementById('inputGroupMemberSearch').value, 'group');
    };
  }
  const openGroupBtn = document.getElementById('btnOpenGroupChatModal');
  const closeGroupBtn = document.getElementById('btnCloseGroupChatModal');
  const createGroupBtn = document.getElementById('btnCreateGroup');
  if (openGroupBtn) openGroupBtn.onclick = openGroupChatModal;
  if (closeGroupBtn) closeGroupBtn.onclick = closeGroupChatModal;
  if (createGroupBtn) createGroupBtn.onclick = createGroupChat;
  const groupModal = document.getElementById('groupChatModal');
  if (groupModal) groupModal.addEventListener('click', (event) => {
    if (event.target.id === 'groupChatModal') closeGroupChatModal();
  });

  // Bắt sự kiện 5 Tab Mobile Bottom Navigation Bar
  document.getElementById('mobileTabRadar').onclick = () => switchTab('radar');
  const mobileRideTab = document.getElementById('mobileTabRide');
  if (mobileRideTab) mobileRideTab.onclick = () => switchTab('ride');
  document.getElementById('mobileTabFeed').onclick = () => switchTab('feed');
  document.getElementById('mobileTabMessages').onclick = () => switchTab('messages');
  document.getElementById('mobileTabFriends').onclick = () => switchTab('friends');
  document.getElementById('mobileTabSettings').onclick = () => switchTab('settings');

  // Mobile Bottom Sheet "Mọi Người Quanh Đây" trên bản đồ
  const btnOpenNearbySheet = document.getElementById('btnMobileOpenNearbySheet');
  const nearbySheet = document.getElementById('mobileNearbySheet');
  const btnCloseNearbySheet = document.getElementById('btnCloseMobileNearbySheet');
  if (btnOpenNearbySheet && nearbySheet) {
    btnOpenNearbySheet.onclick = () => {
      nearbySheet.classList.remove('translate-y-full');
    };
  }
  if (btnCloseNearbySheet && nearbySheet) {
    btnCloseNearbySheet.onclick = () => {
      nearbySheet.classList.add('translate-y-full');
    };
  }

  // Ride endpoint selection, current location and estimate
  const pickPickupBtn = document.getElementById('btnPickRidePickup');
  if (pickPickupBtn) pickPickupBtn.addEventListener('click', () => beginRideMapPick('pickup'));
  const pickDropoffBtn = document.getElementById('btnPickRideDropoff');
  if (pickDropoffBtn) pickDropoffBtn.addEventListener('click', () => beginRideMapPick('dropoff'));
  const currentPickupBtn = document.getElementById('btnUseCurrentRidePickup');
  if (currentPickupBtn) currentPickupBtn.addEventListener('click', useCurrentRidePickup);
  const rideVehicle = document.getElementById('selectRideVehicle');
  if (rideVehicle) rideVehicle.addEventListener('change', requestRideEstimate);
  const ridePickupInput = document.getElementById('inputRidePickup');
  if (ridePickupInput) ridePickupInput.addEventListener('input', () => {
    if (STATE.ridePickupCoords) requestRideEstimate();
  });
  const rideDropoffInput = document.getElementById('inputRideDropoff');
  if (rideDropoffInput) rideDropoffInput.addEventListener('input', () => {
    if (STATE.rideDropoffCoords) requestRideEstimate();
  });
  const refreshRideRequestsBtn = document.getElementById('btnRefreshRideRequests');
  if (refreshRideRequestsBtn) refreshRideRequestsBtn.addEventListener('click', loadOpenRideRequests);
  const submitOfferBtn = document.getElementById('btnSubmitDriverOffer');
  if (submitOfferBtn) submitOfferBtn.addEventListener('click', submitDriverOffer);

  // Tự động căn chỉnh lại map khi xoay màn hình điện thoại hoặc đổi kích thước
  window.addEventListener('resize', () => {
    if (STATE.map) {
      setTimeout(() => STATE.map.invalidateSize(), 200);
    }
    // Cập nhật lại giao diện theo kích thước màn hình
    switchTab(STATE.activeTab || 'radar');
  });

  // Notification dropdown toggle
  const notifBtn = document.getElementById('btnNotificationBell');
  const notifDropdown = document.getElementById('dropdownNotifs');
  notifBtn.onclick = (e) => {
    e.stopPropagation();
    notifDropdown.classList.toggle('hidden');
  };

  document.addEventListener('click', (e) => {
    if (!notifDropdown.contains(e.target) && e.target !== notifBtn) {
      notifDropdown.classList.add('hidden');
    }
  });

  document.getElementById('btnMarkAllNotifsRead').onclick = async () => {
    await apiRequest('/notifications/read-all', 'POST');
    loadNotifications();
  };

  // Toggle Checkin Pins on Map
  const btnToggleCheckins = document.getElementById('btnToggleCheckins');
  btnToggleCheckins.onclick = () => {
    STATE.checkinPinsVisible = !STATE.checkinPinsVisible;
    const textEl = document.getElementById('btnToggleCheckinsText');
    if (STATE.checkinPinsVisible) {
      textEl.innerText = 'Ghim Check-in (Bật)';
      btnToggleCheckins.className = 'bg-slate-900/90 backdrop-blur px-3 py-1.5 rounded-lg border border-slate-700 hover:border-amber-500/80 text-xs flex items-center gap-1.5 text-amber-300 font-semibold shadow transition';
      loadCheckinPins();
    } else {
      textEl.innerText = 'Ghim Check-in (Tắt)';
      btnToggleCheckins.className = 'bg-slate-900/90 backdrop-blur px-3 py-1.5 rounded-lg border border-slate-700 text-xs flex items-center gap-1.5 text-slate-400 font-normal shadow transition';
      clearCheckinPins();
    }
  };

  // Feed Filter buttons (all, friends, nearby)
  document.querySelectorAll('.btn-feed-filter').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('.btn-feed-filter').forEach((b) => {
        b.className = 'btn-feed-filter flex-1 py-1 text-center rounded-lg text-slate-400 hover:text-slate-200';
      });
      btn.className = 'btn-feed-filter flex-1 py-1 text-center rounded-lg bg-emerald-600 text-white font-semibold';
      loadFeed(btn.dataset.filter);
    };
  });

  // Post image selection
  const feedImageInput = document.getElementById('feedImageInput');
  feedImageInput.onchange = (e) => {
    const files = Array.from(e.target.files);
    STATE.selectedFeedFiles = files;

    const previewContainer = document.getElementById('feedImagePreviewContainer');
    previewContainer.innerHTML = '';
    if (files.length > 0) {
      previewContainer.classList.remove('hidden');
      files.forEach((file) => {
        const url = URL.createObjectURL(file);
        const img = document.createElement('img');
        img.src = url;
        img.className = 'w-12 h-12 rounded-lg object-cover border border-emerald-500';
        previewContainer.appendChild(img);
      });
    } else {
      previewContainer.classList.add('hidden');
    }
  };

  // Checkin Modal handlers
  document.getElementById('btnOpenCheckinModal').onclick = () => {
    document.getElementById('checkinModal').classList.remove('hidden');
  };
  document.getElementById('btnCloseCheckinModal').onclick = () => {
    document.getElementById('checkinModal').classList.add('hidden');
  };

  document.getElementById('btnAutoGpsCheckin').onclick = () => {
    document.getElementById('inputCheckinName').value = 'Vị trí hiện tại của tôi (Hà Nội)';
  };

  document.getElementById('btnConfirmCheckin').onclick = () => {
    const name = document.getElementById('inputCheckinName').value.trim();
    if (!name) {
      alert('Vui lòng nhập tên địa điểm check-in');
      return;
    }
    STATE.pendingCheckin = {
      name,
      lat: STATE.currentLat,
      lon: STATE.currentLon,
    };
    document.getElementById('checkinNameText').innerText = name;
    document.getElementById('checkinPreviewTag').classList.remove('hidden');
    document.getElementById('checkinPreviewTag').classList.add('flex');
    document.getElementById('checkinModal').classList.add('hidden');
    refreshIcons();
  };

  document.getElementById('btnRemoveCheckin').onclick = removeCheckinTag;

  // Submit Post
  document.getElementById('btnSubmitPost').onclick = handleSubmitPost;

  // Ghost Mode toggle
  document.getElementById('ghostModeToggle').onchange = (e) => {
    toggleGhostMode(e.target.checked);
  };

  // Radius buttons
  document.querySelectorAll('.btn-radius').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('.btn-radius').forEach((b) => {
        b.className = 'btn-radius py-1 px-2 text-[11px] rounded bg-slate-700 hover:bg-slate-600 font-medium';
      });
      btn.className = 'btn-radius py-1 px-2 text-[11px] rounded bg-emerald-600 text-white font-medium';
      STATE.radiusMeters = parseInt(btn.dataset.radius, 10);
      document.getElementById('labelRadius').innerText = formatDistance(STATE.radiusMeters);
      if (STATE.radarCircle) {
        STATE.radarCircle.setRadius(STATE.radiusMeters);
      }
      loadNearbyUsers();
    };
  });

  // Nút Quét radar
  document.getElementById('btnScanNearby').onclick = loadNearbyUsers;
  document.getElementById('selectGender').onchange = loadNearbyUsers;

  // Recenter GPS
  document.getElementById('btnRecenter').onclick = () => {
    updateMapPosition();
    STATE.map.setView([STATE.currentLat, STATE.currentLon], 14);
  };

  // Popup close
  document.getElementById('btnClosePopup').onclick = () => {
    document.getElementById('userCardPopup').classList.add('hidden');
  };

  // Chat drawer close
  document.getElementById('btnCloseChat').onclick = () => {
    document.getElementById('chatDrawer').classList.add('translate-x-full');
    STATE.activeChatPartnerId = null;
  };

  // GIAI ĐOẠN 3: GỌI THOẠI & GỌI VIDEO WEBRTC
  document.getElementById('btnVoiceCall').onclick = () => startCall('audio');
  document.getElementById('btnVideoCall').onclick = () => startCall('video');
  document.getElementById('btnAcceptCall').onclick = acceptIncomingCall;
  document.getElementById('btnRejectCall').onclick = rejectIncomingCall;
  document.getElementById('btnHangupCall').onclick = hangupCall;
  document.getElementById('btnToggleMic').onclick = () => alert('Đã chuyển đổi trạng thái Micro');
  document.getElementById('btnToggleCam').onclick = () => alert('Đã chuyển đổi trạng thái Camera');

  // GIAI ĐOẠN 3: BỘ LỌC RADAR NÂNG CAO
  const btnToggleAdv = document.getElementById('btnToggleAdvancedFilter');
  if (btnToggleAdv) {
    btnToggleAdv.onclick = () => {
      document.getElementById('advancedFilterBox').classList.toggle('hidden');
    };
  }
  const minAgeInput = document.getElementById('inputMinAge');
  const maxAgeInput = document.getElementById('inputMaxAge');
  const ageLabel = document.getElementById('labelAgeRange');
  if (minAgeInput && maxAgeInput && ageLabel) {
    const updateAgeLabel = () => {
      ageLabel.innerText = `${minAgeInput.value} - ${maxAgeInput.value} tuổi`;
    };
    minAgeInput.oninput = updateAgeLabel;
    maxAgeInput.oninput = updateAgeLabel;
  }

  // GIAI ĐOẠN 3: TRUNG TÂM KIỂM DUYỆT
  document.getElementById('btnOpenModeration').onclick = openModerationModal;
  document.getElementById('btnCloseModerationModal').onclick = closeModerationModal;
  document.getElementById('btnCheckProfanity').onclick = testProfanity;

  // PROFILE MODAL EVENT LISTENERS
  document.getElementById('btnCloseProfileModal').onclick = closeMyProfileModal;
  const btnOpenProfileFromSettings = document.getElementById('btnOpenMyProfileFromSettings');
  if (btnOpenProfileFromSettings) {
    btnOpenProfileFromSettings.onclick = openMyProfileModal;
  }
  document.getElementById('btnSaveMyProfile').onclick = saveMyProfile;
  document.getElementById('btnAddInterest').onclick = () => {
    const input = document.getElementById('inputNewInterest');
    const val = input.value.trim();
    if (val && !userInterestsCopy.includes(val)) {
      userInterestsCopy.push(val);
      input.value = '';
      renderMyInterestsTags();
    }
  };
  document.getElementById('myAvatarFileInput').onchange = (e) => {
    const file = e.target.files[0];
    if (file) uploadMyAvatar(file);
  };

  // Send message
  document.getElementById('btnSendMessage').onclick = handleSendMessage;
  document.getElementById('chatTextInput').onkeydown = (e) => {
    if (e.key === 'Enter') handleSendMessage();
  };

  // Auth modal handlers
  document.getElementById('btnCloseAuthModal').onclick = closeAuthModal;

  document.getElementById('authTabLogin').onclick = () => {
    document.getElementById('authTabLogin').className = 'flex-1 pb-2.5 text-xs font-bold border-b-2 border-emerald-400 text-emerald-400';
    document.getElementById('authTabRegister').className = 'flex-1 pb-2.5 text-xs font-bold border-b-2 border-transparent text-slate-400 hover:text-slate-200';
    document.getElementById('formLogin').classList.remove('hidden');
    document.getElementById('formRegister').classList.add('hidden');
  };

  document.getElementById('authTabRegister').onclick = () => {
    document.getElementById('authTabRegister').className = 'flex-1 pb-2.5 text-xs font-bold border-b-2 border-emerald-400 text-emerald-400';
    document.getElementById('authTabLogin').className = 'flex-1 pb-2.5 text-xs font-bold border-b-2 border-transparent text-slate-400 hover:text-slate-200';
    document.getElementById('formRegister').classList.remove('hidden');
    document.getElementById('formLogin').classList.add('hidden');
  };

  // GIAI ĐOẠN 4: ONLY RIDE EVENT LISTENERS
  const driverToggle = document.getElementById('driverEarningToggle');
  if (driverToggle) {
    driverToggle.onchange = (e) => toggleDriverEarningMode(e.target.checked);
  }

  const btnFindRides = document.getElementById('btnFindRides');
  if (btnFindRides) {
    btnFindRides.onclick = handleCreateRideRequest;
  }

  const btnCancelRide = document.getElementById('btnCancelActiveRide');
  if (btnCancelRide) {
    btnCancelRide.onclick = handleCancelActiveRide;
  }

  document.getElementById('formLogin').onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById('loginIdentifier').value;
    const pass = document.getElementById('loginPassword').value;
    try {
      await quickLogin(id, pass);
    } catch (err) {
      alert(err.message);
    }
  };

  document.querySelectorAll('.btn-demo-login').forEach((btn) => {
    btn.onclick = async () => {
      try {
        await quickLogin(btn.dataset.id, '123456');
      } catch (err) {
        alert(err.message);
      }
    };
  });

  document.getElementById('formRegister').onsubmit = async (e) => {
    e.preventDefault();
    const fullName = document.getElementById('regFullName').value;
    const phone = document.getElementById('regPhone').value;
    const email = document.getElementById('regEmail').value;
    const dateOfBirth = document.getElementById('regDob').value;
    const gender = document.getElementById('regGender').value;
    const password = document.getElementById('regPassword').value;

    try {
      const res = await apiRequest('/auth/register', 'POST', {
        fullName,
        phone,
        email,
        dateOfBirth,
        gender,
        password,
      });

      alert('Đăng ký tài khoản thành công! Tự động đăng nhập vào Only.');
      STATE.token = res.data.token;
      localStorage.setItem('only_token', STATE.token);
      STATE.currentUser = res.data.user;
      renderUserHeader();
      connectSocket();
      initGeolocation();
      loadNearbyUsers();
      loadConversations();
      loadFriends();
      loadFeed();
      loadNotifications();
      loadCheckinPins();
      closeAuthModal();
    } catch (err) {
      alert(err.message);
    }
  };
}

function openAuthModal(tab = 'register') {
  document.getElementById('authModal').classList.remove('hidden');
  if (tab === 'register') {
    document.getElementById('authTabRegister').className =
      'flex-1 pb-2.5 text-xs font-bold border-b-2 border-emerald-400 text-emerald-400';
    document.getElementById('authTabLogin').className =
      'flex-1 pb-2.5 text-xs font-bold border-b-2 border-transparent text-slate-400 hover:text-slate-200';
    document.getElementById('formRegister').classList.remove('hidden');
    document.getElementById('formLogin').classList.add('hidden');
    setTimeout(() => document.getElementById('regFullName')?.focus(), 100);
  } else {
    document.getElementById('authTabLogin').className =
      'flex-1 pb-2.5 text-xs font-bold border-b-2 border-emerald-400 text-emerald-400';
    document.getElementById('authTabRegister').className =
      'flex-1 pb-2.5 text-xs font-bold border-b-2 border-transparent text-slate-400 hover:text-slate-200';
    document.getElementById('formLogin').classList.remove('hidden');
    document.getElementById('formRegister').classList.add('hidden');
    setTimeout(() => document.getElementById('loginIdentifier')?.focus(), 100);
  }
  refreshIcons();
}

function closeAuthModal() {
  document.getElementById('authModal').classList.add('hidden');
}

// ==============================================================================
// GIAI ĐOẠN 4: ONLY RIDE - KẾT NỐI ĐI LẠI & TIỆN CHUYẾN CỘNG ĐỒNG
// ==============================================================================

// Toggle Driver Earning Mode (Bật/Tắt Chế độ Kiếm Tiền)
async function toggleDriverEarningMode(isActive) {
  try {
    const vehicleType = document.getElementById('driverVehicleType')?.value || 'motorbike';
    const vehiclePlate = document.getElementById('driverVehiclePlate')?.value || '';
    await apiRequest('/rides/earning-mode', 'POST', {
      isActive,
      vehicleType,
      licensePlate: vehiclePlate,
    });

    STATE.driverEarningMode = isActive;
    const configBox = document.getElementById('driverConfigBox');
    const discovery = document.getElementById('driverRequestDiscovery');
    if (isActive) {
      configBox?.classList.remove('hidden');
      configBox?.classList.add('flex');
      discovery?.classList.remove('hidden');
      showToast('🟢 Đã bật Chế độ Kiếm Tiền! Đang tải cuốc xe phù hợp.', 'success');
      loadOpenRideRequests();
    } else {
      configBox?.classList.add('hidden');
      discovery?.classList.add('hidden');
      document.getElementById('driverRideActionBox')?.classList.add('hidden');
      STATE.rideOpenRequests = [];
      STATE.selectedDriverRideId = null;
      showToast('Đã tắt Chế độ Kiếm Tiền', 'info');
    }
  } catch (err) {
    showToast(err.message, 'error');
    const toggle = document.getElementById('driverEarningToggle');
    if (toggle) toggle.checked = false;
  }
}

async function loadActiveRide() {
  if (!STATE.token) return;
  try {
    const res = await apiRequest('/rides/active');
    STATE.activeRide = res.data || null;
    if (STATE.activeRide) {
      STATE.ridePickupCoords = { lat: STATE.activeRide.pickupLat, lon: STATE.activeRide.pickupLon };
      STATE.rideDropoffCoords = { lat: STATE.activeRide.dropoffLat, lon: STATE.activeRide.dropoffLon };
      document.getElementById('inputRidePickup').value = STATE.activeRide.pickupName;
      document.getElementById('inputRideDropoff').value = STATE.activeRide.dropoffName;
      renderActiveRide();
      loadRideOffers();
    } else {
      renderActiveRide();
    }
  } catch (err) {
    updateRideStatusLive(`Không thể tải chuyến đang hoạt động: ${err.message}`, true);
  }
}

async function loadRideOffers() {
  if (!STATE.activeRide) return;
  try {
    const res = await apiRequest(`/rides/${STATE.activeRide.id}/offers`);
    STATE.rideOffers = res.data || [];
    if (STATE.activeRide.status === 'searching' && STATE.rideOffers.length) STATE.activeRide.status = 'negotiating';
    renderRideOffers();
    renderActiveRide();
  } catch (err) {
    const list = document.getElementById('listDriverOffers');
    if (list) list.innerHTML = `<div class="text-center py-4 text-xs text-rose-400">${err.message}</div>`;
  }
}

async function loadOpenRideRequests() {
  const panel = document.getElementById('driverRequestDiscovery');
  const status = document.getElementById('driverRequestStatus');
  const list = document.getElementById('listOpenRideRequests');
  if (!panel || !list || !STATE.driverEarningMode) return;
  panel.classList.remove('hidden');
  if (status) status.textContent = 'Đang tìm cuốc xe phù hợp...';
  list.innerHTML = '<div class="text-center py-4 text-xs text-slate-500">Đang tải...</div>';
  try {
    // The current backend exposes private ride details only to participants. Driver
    // discovery therefore uses the route/price snapshot in ride notifications.
    const requests = STATE.notifications
      .filter((notification) => {
        const title = String(notification.title || '').toLowerCase();
        return Boolean(notification.data?.rideId) && title.includes('cuốc xe tiện chuyến mới');
      })
      .map(parseRideRequestNotification)
      .filter(Boolean);
    STATE.rideOpenRequests = requests.filter((ride, index, arr) => arr.findIndex((item) => item.id === ride.id) === index);
    renderOpenRideRequests();
    if (status) status.textContent = STATE.rideOpenRequests.length ? `${STATE.rideOpenRequests.length} cuốc đang chờ báo giá` : 'Chưa có cuốc mới. Bạn sẽ nhận thông báo khi có cuốc phù hợp.';
  } catch (err) {
    if (status) status.textContent = err.message;
    list.innerHTML = `<div class="text-center py-4 text-xs text-rose-400">${err.message}</div>`;
  }
}

function parseRideRequestNotification(notification) {
  const data = notification.data || notification.payloadData || {};
  const body = String(notification.body || '');
  const routeMatch = body.match(/cần đi\s+([\d.,]+)km từ (.+?) tới (.+?)(?: \(Giá đề xuất:\s*([\d.,]+)đ\))?$/i);
  if (!data.rideId || !routeMatch) return null;
  const distanceKm = Number(routeMatch[1].replace(',', '.'));
  const suggestedPrice = Number((routeMatch[4] || '0').replace(/[.,]/g, ''));
  if (!Number.isFinite(distanceKm) || !Number.isFinite(suggestedPrice)) return null;
  return {
    id: data.rideId,
    pickupName: routeMatch[2].trim(),
    dropoffName: routeMatch[3].trim(),
    distanceKm,
    suggestedPrice,
    status: 'searching',
    createdAt: notification.createdAt,
    // Coordinates are deliberately absent: the available notification route has no coordinates.
  };
}

function renderOpenRideRequests() {
  const list = document.getElementById('listOpenRideRequests');
  if (!list) return;
  list.innerHTML = '';
  if (!STATE.rideOpenRequests.length) {
    list.innerHTML = '<div class="text-center py-4 text-xs text-slate-500">Chưa có cuốc xe mở.</div>';
    return;
  }
  STATE.rideOpenRequests.forEach((ride) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'w-full text-left min-h-16 p-2.5 rounded-xl bg-slate-800/70 hover:bg-slate-800 border border-slate-700/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300';
    card.innerHTML = `<span class="block text-xs font-bold text-slate-100">${ride.pickupName} → ${ride.dropoffName}</span><span class="block text-[10px] text-slate-400">${ride.distanceKm} km · khách đề xuất ${formatMoney(ride.suggestedPrice)} · ${RIDE_STATUS_META[ride.status]?.label || ride.status}</span>`;
    card.onclick = () => selectDriverRide(ride);
    list.appendChild(card);
  });
}

function selectDriverRide(ride) {
  STATE.selectedDriverRideId = ride.id;
  const box = document.getElementById('driverRideActionBox');
  box?.classList.remove('hidden');
  document.getElementById('driverRideDistanceLabel').textContent = `${ride.distanceKm} km · ${formatMoney(ride.suggestedPrice)}`;
  document.getElementById('driverRideRouteLabel').textContent = `${ride.pickupName} → ${ride.dropoffName}`;
  document.getElementById('driverOfferPrice').value = ride.suggestedPrice || '';
  document.getElementById('driverOfferEta').value = '5';
  document.getElementById('driverOfferStatus').textContent = 'Thông báo không kèm tọa độ; gửi báo giá theo thông tin tuyến hiện có.';
  if (Number.isFinite(ride.pickupLat) && Number.isFinite(ride.pickupLon) && Number.isFinite(ride.dropoffLat) && Number.isFinite(ride.dropoffLon)) {
    STATE.map?.fitBounds([[ride.pickupLat, ride.pickupLon], [ride.dropoffLat, ride.dropoffLon]], { padding: [40, 40], maxZoom: 15 });
  }
}

async function submitDriverOffer() {
  const rideId = STATE.selectedDriverRideId;
  const status = document.getElementById('driverOfferStatus');
  const offeredPrice = Number(document.getElementById('driverOfferPrice').value);
  const estimatedPickupMins = Number(document.getElementById('driverOfferEta').value);
  const note = document.getElementById('driverOfferNote').value.trim();
  if (!rideId || !offeredPrice || offeredPrice <= 0 || !estimatedPickupMins || estimatedPickupMins <= 0) {
    if (status) status.textContent = 'Nhập giá báo và thời gian đến đón hợp lệ.';
    return;
  }
  if (status) status.textContent = 'Đang gửi báo giá...';
  try {
    await apiRequest(`/rides/${rideId}/offer`, 'POST', { offeredPrice, estimatedPickupMins, note });
    if (status) status.textContent = 'Đã gửi báo giá cho khách.';
    showToast('✅ Đã gửi báo giá cho khách', 'success');
    STATE.rideOpenRequests = STATE.rideOpenRequests.filter((ride) => ride.id !== rideId);
    STATE.selectedDriverRideId = null;
    document.getElementById('driverRideActionBox')?.classList.add('hidden');
    renderOpenRideRequests();
  } catch (err) {
    if (status) status.textContent = err.message;
    showToast(err.message, 'error');
  }
}

function startDriverLocationWatch() {
  const isDriver = STATE.activeRide?.driver?.userId === STATE.currentUser?.id;
  if (!isDriver || STATE.driverLocationWatchId !== null || !navigator.geolocation || !STATE.activeRide) return;
  STATE.driverLocationWatchId = navigator.geolocation.watchPosition((position) => {
    const payload = { rideId: STATE.activeRide.id, lat: position.coords.latitude, lon: position.coords.longitude };
    if (STATE.socket?.connected) STATE.socket.emit('ride:driver_loc', payload);
    else apiRequest(`/rides/${STATE.activeRide.id}/driver-location`, 'POST', { lat: payload.lat, lon: payload.lon }).catch(() => {});
  }, () => updateRideStatusLive('Không thể lấy vị trí tài xế trên thiết bị.', true), { enableHighAccuracy: true, maximumAge: 5000 });
}

function stopDriverLocationWatch() {
  if (STATE.driverLocationWatchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(STATE.driverLocationWatchId);
  STATE.driverLocationWatchId = null;
}

function updateRideStatusLive(message, isError = false) {
  const el = document.getElementById('rideLiveStatus');
  if (el) {
    el.textContent = message || '';
    el.className = `min-h-4 text-[10px] ${isError ? 'text-rose-400' : 'text-slate-400'}`;
  }
}

function setRideEndpoint(kind, lat, lon) {
  const coords = { lat: Number(lat), lon: Number(lon) };
  const input = document.getElementById(kind === 'pickup' ? 'inputRidePickup' : 'inputRideDropoff');
  if (kind === 'pickup') {
    STATE.ridePickupCoords = coords;
    if (!input.value.trim()) input.value = 'Điểm đón trên bản đồ';
  } else {
    STATE.rideDropoffCoords = coords;
    if (!input.value.trim()) input.value = 'Điểm đến trên bản đồ';
  }
  renderRideEndpointMarkers();
  updateRideRouteHint();
  requestRideEstimate();
}

function beginRideMapPick(kind) {
  STATE.ridePickMode = kind;
  switchTab('ride');
  STATE.map?.getContainer().classList.add('ride-map-picking');
  updateRideStatusLive(kind === 'pickup' ? 'Đang chọn điểm đón: chạm vào bản đồ.' : 'Đang chọn điểm đến: chạm vào bản đồ.');
  showToast(kind === 'pickup' ? 'Chạm bản đồ để đặt điểm đón' : 'Chạm bản đồ để đặt điểm đến', 'info');
}

function useCurrentRidePickup() {
  setRideEndpoint('pickup', STATE.currentLat, STATE.currentLon);
  const input = document.getElementById('inputRidePickup');
  if (input) input.value = 'Vị trí hiện tại của tôi';
  STATE.map?.setView([STATE.currentLat, STATE.currentLon], Math.max(STATE.map.getZoom(), 14));
}

function updateRideRouteHint() {
  const hint = document.getElementById('rideRouteHint');
  if (!hint) return;
  const pickup = STATE.ridePickupCoords ? 'điểm đón ✓' : 'điểm đón chưa chọn';
  const dropoff = STATE.rideDropoffCoords ? 'điểm đến ✓' : 'điểm đến chưa chọn';
  hint.textContent = `${pickup} · ${dropoff}. ${STATE.ridePickupCoords && STATE.rideDropoffCoords ? 'Đang tính lộ trình thực tế.' : 'Chọn cả hai trên bản đồ.'}`;
}

function renderRideEndpointMarkers() {
  if (!STATE.map) return;
  if (STATE.ridePickupMarker) STATE.map.removeLayer(STATE.ridePickupMarker);
  if (STATE.rideDropoffMarker) STATE.map.removeLayer(STATE.rideDropoffMarker);
  const endpointIcon = (color, label) => L.divIcon({
    className: 'ride-endpoint-icon',
    html: `<span style="--ride-marker-color:${color}" aria-label="${label}"></span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
  if (STATE.ridePickupCoords) STATE.ridePickupMarker = L.marker([STATE.ridePickupCoords.lat, STATE.ridePickupCoords.lon], { icon: endpointIcon('#34d399', 'Điểm đón') }).addTo(STATE.map);
  if (STATE.rideDropoffCoords) STATE.rideDropoffMarker = L.marker([STATE.rideDropoffCoords.lat, STATE.rideDropoffCoords.lon], { icon: endpointIcon('#fb7185', 'Điểm đến') }).addTo(STATE.map);
  if (STATE.ridePickupCoords && STATE.rideDropoffCoords) {
    STATE.map.fitBounds([[STATE.ridePickupCoords.lat, STATE.ridePickupCoords.lon], [STATE.rideDropoffCoords.lat, STATE.rideDropoffCoords.lon]], { padding: [40, 40], maxZoom: 15 });
  }
}

function renderRideMap() {
  renderRideEndpointMarkers();
  if (STATE.rideRouteLine) STATE.map?.removeLayer(STATE.rideRouteLine);
  if (STATE.activeRide?.pickupLat && STATE.activeRide?.dropoffLat && STATE.map) {
    const points = [[STATE.activeRide.pickupLat, STATE.activeRide.pickupLon], [STATE.activeRide.dropoffLat, STATE.activeRide.dropoffLon]];
    STATE.rideRouteLine = L.polyline(points, { color: '#f59e0b', weight: 4, opacity: 0.75, dashArray: '8 8' }).addTo(STATE.map);
  }
  if (STATE.rideDriverMarker) STATE.map?.removeLayer(STATE.rideDriverMarker);
  if (Number.isFinite(STATE.activeRide?.driverLat) && Number.isFinite(STATE.activeRide?.driverLon) && STATE.map) {
    const driverIcon = L.divIcon({ className: 'ride-driver-icon', html: '<span aria-label="Vị trí tài xế">🚗</span>', iconSize: [34, 34], iconAnchor: [17, 17] });
    STATE.rideDriverMarker = L.marker([STATE.activeRide.driverLat, STATE.activeRide.driverLon], { icon: driverIcon }).addTo(STATE.map);
  }
}

async function requestRideEstimate() {
  if (!STATE.ridePickupCoords || !STATE.rideDropoffCoords || !STATE.token) {
    updateRideRouteHint();
    return;
  }
  const requestId = ++STATE.rideEstimateRequestId;
  const status = document.getElementById('rideEstimateStatus');
  if (status) status.textContent = 'Đang tính khoảng cách, ETA và giá...';
  try {
    const res = await apiRequest('/rides/estimate', 'POST', {
      pickupLat: STATE.ridePickupCoords.lat,
      pickupLon: STATE.ridePickupCoords.lon,
      dropoffLat: STATE.rideDropoffCoords.lat,
      dropoffLon: STATE.rideDropoffCoords.lon,
      vehicleType: document.getElementById('selectRideVehicle').value,
    });
    if (requestId !== STATE.rideEstimateRequestId) return;
    STATE.rideEstimate = res.data;
    document.getElementById('rideEstimateInfo').textContent = `${res.data.distanceKm} km · khoảng ${res.data.estimatedMins} phút`;
    document.getElementById('rideEstimateRange').textContent = `${formatMoney(res.data.priceRange.min)} – ${formatMoney(res.data.priceRange.max)}`;
    const price = document.getElementById('inputRidePrice');
    if (price && !price.value) price.value = res.data.suggestedPrice;
    if (status) status.textContent = 'Đã cập nhật theo dữ liệu máy chủ.';
  } catch (err) {
    if (status) status.textContent = `Không thể tính lộ trình: ${err.message}`;
  }
}

function formatMoney(value) {
  return `${Number(value || 0).toLocaleString('vi-VN')}đ`;
}

// Tạo yêu cầu di chuyển / Đặt cuốc xe
async function handleCreateRideRequest() {
  const actionStatus = document.getElementById('rideActionStatus');
  try {
    if (!STATE.token) {
      showToast('Vui lòng đăng nhập để sử dụng tính năng Đi Lại', 'error');
      return;
    }
    if (!STATE.ridePickupCoords || !STATE.rideDropoffCoords) {
      const missing = !STATE.ridePickupCoords ? 'điểm đón' : 'điểm đến';
      updateRideStatusLive(`Cần chọn ${missing} trên bản đồ trước khi đặt chuyến.`, true);
      showToast(`Vui lòng chọn ${missing} có tọa độ`, 'error');
      return;
    }

    const pickupName = document.getElementById('inputRidePickup').value.trim() || 'Điểm đón trên bản đồ';
    const dropoffName = document.getElementById('inputRideDropoff').value.trim() || 'Điểm đến trên bản đồ';
    const vehicleType = document.getElementById('selectRideVehicle').value;
    const suggestedPrice = parseInt(document.getElementById('inputRidePrice').value, 10) || STATE.rideEstimate?.suggestedPrice || 0;
    if (!suggestedPrice) {
      await requestRideEstimate();
    }
    if (actionStatus) actionStatus.textContent = 'Đang gửi yêu cầu chuyến đi...';
    const res = await apiRequest('/rides/request', 'POST', {
      pickupName,
      pickupLat: STATE.ridePickupCoords.lat,
      pickupLon: STATE.ridePickupCoords.lon,
      dropoffName,
      dropoffLat: STATE.rideDropoffCoords.lat,
      dropoffLon: STATE.rideDropoffCoords.lon,
      vehicleType,
      suggestedPrice: parseInt(document.getElementById('inputRidePrice').value, 10) || STATE.rideEstimate?.suggestedPrice || 0,
    });

    STATE.activeRide = res.data;
    STATE.rideOffers = [];
    showToast('🛵 Đã phát tín hiệu tìm xe! Đang chờ tài xế...', 'success');
    if (actionStatus) actionStatus.textContent = 'Đã gửi yêu cầu. Bạn sẽ nhận cập nhật realtime.';
    renderActiveRide();
    pollRideOffers();
  } catch (err) {
    if (actionStatus) actionStatus.textContent = err.message;
    showToast(err.message, 'error');
  }
}

const RIDE_STATUS_META = {
  searching: { label: 'Đang tìm tài xế', detail: 'Yêu cầu đã được phát tới tài xế phù hợp', color: 'emerald' },
  negotiating: { label: 'Đang thương lượng', detail: 'Có báo giá mới để bạn lựa chọn', color: 'amber' },
  accepted: { label: 'Đã nhận chuyến', detail: 'Tài xế đang chuẩn bị tới điểm đón', color: 'sky' },
  picking_up: { label: 'Tài xế đang đến đón', detail: 'Theo dõi vị trí tài xế trên bản đồ', color: 'sky' },
  arrived: { label: 'Tài xế đã đến', detail: 'Vui lòng ra điểm đón để bắt đầu chuyến', color: 'violet' },
  in_trip: { label: 'Đang trong chuyến', detail: 'Chúc bạn thượng lộ bình an', color: 'emerald' },
  completed: { label: 'Đã hoàn thành', detail: 'Chuyến đi đã kết thúc', color: 'slate' },
  cancelled: { label: 'Đã huỷ', detail: 'Chuyến đi không còn hoạt động', color: 'rose' },
};
const RIDE_STATUS_ORDER = ['searching', 'negotiating', 'accepted', 'picking_up', 'arrived', 'in_trip', 'completed'];

function renderRideStatusTimeline(status) {
  const el = document.getElementById('rideStatusTimeline');
  if (!el) return;
  if (status === 'cancelled') {
    el.innerHTML = '<span class="ride-status-step is-cancelled">✕ Đã huỷ chuyến</span>';
    return;
  }
  if (status === 'completed') {
    el.innerHTML = '<span class="ride-status-step is-done"><span class="ride-status-marker">✓</span>Đã hoàn thành</span>';
    return;
  }
  const currentIndex = RIDE_STATUS_ORDER.indexOf(status);
  el.innerHTML = RIDE_STATUS_ORDER.map((key, index) => {
    const meta = RIDE_STATUS_META[key];
    const cls = index < currentIndex ? 'is-done' : index === currentIndex ? 'is-current' : '';
    return `<span class="ride-status-step ${cls}"><span class="ride-status-marker">${index < currentIndex ? '✓' : index + 1}</span>${meta.label}</span>`;
  }).join('');
}

function renderRideStatusActions() {
  const actions = document.getElementById('rideStatusActions');
  if (!actions || !STATE.activeRide) return;
  const ride = STATE.activeRide;
  const isDriver = ride.driver?.userId && ride.driver.userId === STATE.currentUser?.id;
  const next = isDriver ? ({ accepted: 'picking_up', picking_up: 'arrived', arrived: 'in_trip', in_trip: 'completed' }[ride.status]) : null;
  actions.innerHTML = '';
  if (next) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'min-h-11 px-3 rounded-xl bg-sky-500 hover:bg-sky-600 text-slate-950 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300';
    button.textContent = `Cập nhật: ${RIDE_STATUS_META[next].label}`;
    button.onclick = () => updateRideStatus(next);
    actions.appendChild(button);
    actions.classList.remove('hidden');
  } else {
    actions.classList.add('hidden');
  }
}

function updateRideStatus(status) {
  if (!STATE.activeRide) return;
  if (STATE.socket?.connected) {
    STATE.socket.emit('ride:status_update', { rideId: STATE.activeRide.id, status });
    updateRideStatusLive('Đang đồng bộ trạng thái...');
  } else {
    apiRequest(`/rides/${STATE.activeRide.id}/status`, 'POST', { status }).then((res) => {
      STATE.activeRide = res.data;
      renderActiveRide();
    }).catch((err) => updateRideStatusLive(err.message, true));
  }
}

function renderActiveRide() {
  const container = document.getElementById('activeRideContainer');
  if (!container) return;
  if (!STATE.activeRide) {
    container.classList.add('hidden');
    clearTimeout(STATE.rideStatusPollTimer);
    return;
  }

  container.classList.remove('hidden');
  const ride = STATE.activeRide;
  const meta = RIDE_STATUS_META[ride.status] || RIDE_STATUS_META.searching;
  const statusText = document.getElementById('activeRideStatusText');
  const detailText = document.getElementById('activeRideDetailText');
  if (statusText) statusText.textContent = meta.label;
  if (detailText) detailText.textContent = `${ride.pickupName} → ${ride.dropoffName} · ${ride.distanceKm} km · ${meta.detail}`;
  const dot = document.getElementById('activeRideStatusDot');
  if (dot) dot.className = `w-3 h-3 rounded-full shrink-0 ${ride.status === 'cancelled' ? 'bg-rose-400' : ride.status === 'completed' ? 'bg-slate-400' : 'bg-emerald-400 animate-ping'}`;
  renderRideStatusTimeline(ride.status);
  renderRideStatusActions();

  const insurance = document.getElementById('rideInsuranceInfo');
  if (insurance && ride.insurancePolicyId) {
    insurance.textContent = `🛡️ Bảo hiểm chuyến đi đã kích hoạt · Mã: ${ride.insurancePolicyId}`;
    insurance.classList.remove('hidden');
  }
  const driverInfo = document.getElementById('rideDriverLocationInfo');
  if (driverInfo && Number.isFinite(ride.driverLat) && Number.isFinite(ride.driverLon)) {
    driverInfo.textContent = `🚗 Vị trí tài xế: ${ride.driverLat.toFixed(5)}, ${ride.driverLon.toFixed(5)} · cập nhật ${formatTimeAgo(ride.driverLocationUpdatedAt || new Date())}`;
    driverInfo.classList.remove('hidden');
  }
  renderRideMap();
  if (ride.status === 'accepted' || ride.status === 'picking_up' || ride.status === 'arrived' || ride.status === 'in_trip') startDriverLocationWatch();
  else stopDriverLocationWatch();
  if (ride.status === 'searching' || ride.status === 'negotiating') pollRideOffers();
}

// Poll danh sách báo giá từ tài xế
async function pollRideOffers() {
  if (!STATE.activeRide || !['searching', 'negotiating'].includes(STATE.activeRide.status)) return;

  try {
    await loadRideOffers();
    const active = await apiRequest('/rides/active');
    if (active.data && active.data.id === STATE.activeRide.id) {
      STATE.activeRide = active.data;
      renderActiveRide();
    }
    clearTimeout(STATE.rideStatusPollTimer);
    STATE.rideStatusPollTimer = setTimeout(pollRideOffers, 4000);
  } catch (err) {
    updateRideStatusLive(`Không thể tải báo giá: ${err.message}`, true);
  }
}

// Render danh sách tài xế báo giá
function renderRideOffers() {
  const listEl = document.getElementById('listDriverOffers');
  if (!listEl) return;
  if (!STATE.rideOffers || STATE.rideOffers.length === 0) {
    listEl.innerHTML = `<div class="text-center py-6 text-xs text-slate-500">${STATE.activeRide?.status === 'negotiating' ? 'Đang tải báo giá từ tài xế...' : 'Đang chờ tài xế gửi đề xuất giá...'}</div>`;
    return;
  }

  listEl.innerHTML = '';
  STATE.rideOffers.forEach((offer) => {
    const card = document.createElement('div');
    card.className = 'bg-slate-800/80 border border-slate-700 p-2.5 rounded-xl flex items-center justify-between hover:border-amber-500 transition cursor-pointer';
    card.innerHTML = `
      <div class="flex items-center gap-2">
        <img src="${offer.driver.avatarUrl || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + offer.driverId}" class="w-10 h-10 rounded-full border border-slate-600">
        <div>
          <h5 class="text-xs font-bold text-slate-100">${offer.driver.fullName}</h5>
          <p class="text-[10px] text-slate-400">${offer.driver.vehicleBrand} - ${offer.driver.licensePlate}</p>
          <p class="text-[10px] text-amber-400">⭐ ${offer.driver.ratingAvg} (${offer.driver.totalTrips} chuyến)</p>
        </div>
      </div>
      <div class="text-right">
        <p class="text-sm font-bold text-emerald-400">${offer.offeredPrice.toLocaleString('vi-VN')}đ</p>
        <p class="text-[10px] text-slate-400">~${offer.estimatedPickupMins} phút</p>
      </div>
    `;
    card.onclick = () => confirmDriverOffer(offer);
    listEl.appendChild(card);
  });
}

// Chốt chọn tài xế
async function confirmDriverOffer(offer) {
  const confirmed = confirm(`Chốt tài xế ${offer.driver.fullName} với giá ${offer.offeredPrice.toLocaleString('vi-VN')}đ?\n\nChuyến đi sẽ tự động được kích hoạt Bảo hiểm tai nạn BIC/Bảo Việt.`);
  if (!confirmed) return;

  try {
    const res = await apiRequest(`/rides/${STATE.activeRide.id}/accept-offer/${offer.id}`, 'POST');
    STATE.activeRide = res.data;
    showToast('🎉 Chốt chuyến thành công! Tài xế đang di chuyển tới đón bạn.', 'success');
    renderActiveRide();
    document.getElementById('listDriverOffers').innerHTML = '<div class="text-center py-4 text-xs text-emerald-400">✅ Đã chốt tài xế. Đang di chuyển tới đón bạn...</div>';
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Huỷ cuốc xe
async function handleCancelActiveRide() {
  if (!STATE.activeRide) return;
  const confirmed = confirm('Bạn có chắc muốn huỷ chuyến đi này?');
  if (!confirmed) return;

  try {
    await apiRequest(`/rides/${STATE.activeRide.id}/status`, 'POST', { status: 'cancelled' });
    STATE.activeRide = null;
    STATE.rideOffers = [];
    showToast('Đã huỷ chuyến đi', 'info');
    document.getElementById('activeRideContainer').classList.add('hidden');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

window.addEventListener('DOMContentLoaded', initApp);
