(function () {
  var APP_URL = 'https://only-social-network.onrender.com/';

  function showLauncher() {
    var root = document.getElementById('app') || document.body;
    root.innerHTML = '';

    var main = document.createElement('main');
    main.setAttribute('lang', 'vi');
    main.style.cssText = 'min-height:100dvh;display:grid;place-items:center;background:#071426;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;padding:24px;box-sizing:border-box;';

    var panel = document.createElement('section');
    panel.style.cssText = 'width:min(100%,440px);text-align:center;';

    var logo = document.createElement('img');
    logo.src = './only-brand-logo.png';
    logo.alt = 'Only';
    logo.width = 76;
    logo.height = 76;
    logo.style.cssText = 'width:76px;height:76px;border-radius:20px;object-fit:cover;';

    var title = document.createElement('h1');
    title.textContent = 'Only';
    title.style.cssText = 'margin:12px 0 4px;font-size:24px;';

    var description = document.createElement('p');
    description.textContent = 'Kết nối với bạn bè quanh bạn và tìm chuyến đi phù hợp.';
    description.style.cssText = 'color:#cbd5e1;line-height:1.55;';

    var note = document.createElement('p');
    note.textContent = 'Mở Only để sử dụng Radar, Chat và Đi Lại.';
    note.style.cssText = 'min-height:24px;color:#cbd5e1;font-size:14px;';

    var button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Mở Only';
    button.setAttribute('aria-label', 'Mở ứng dụng Only');
    button.style.cssText = 'width:100%;min-height:48px;margin-top:14px;padding:12px 16px;border:0;border-radius:14px;background:#3CACFD;color:#071426;font-weight:700;font-size:16px;';
    button.addEventListener('click', function () {
      note.textContent = 'Đang mở Only…';
      window.location.assign(APP_URL);
    });

    panel.appendChild(logo);
    panel.appendChild(title);
    panel.appendChild(description);
    panel.appendChild(note);
    panel.appendChild(button);
    main.appendChild(panel);
    root.appendChild(main);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showLauncher, { once: true });
  } else {
    showLauncher();
  }
})();
