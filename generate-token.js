const puppeteer = require('puppeteer-core');

(async () => {
  try {
    const browser = await puppeteer.connect({
      browserURL: 'http://127.0.0.1:9222',
      defaultViewport: null,
    });

    const pages = await browser.pages();
    const ghPage = pages.find(p => p.url().includes('settings/tokens'));
    if (!ghPage) {
      console.log('Không tìm thấy trang settings/tokens');
      browser.disconnect();
      return;
    }

    console.log('Đang ở trang:', ghPage.url());

    // Điền Note
    await ghPage.type('#oauth_access_description, input[name="oauth_access[description]"]', 'deploy-only-token', { delay: 50 });

    // Tick chọn quyền 'repo'
    await ghPage.evaluate(() => {
      const repoCheckbox = document.querySelector('input[value="repo"]') || document.querySelector('#oauth_access_scopes_repo');
      if (repoCheckbox) repoCheckbox.checked = true;
    });

    console.log('Đã chọn quyền repo. Bấm Generate token...');
    // Bấm nút Generate token
    const clicked = await ghPage.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => b.textContent.trim().toLowerCase().includes('generate token'));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });

    if (clicked) {
      console.log('Đang chờ sinh token...');
      await ghPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});

      // Đọc token đã sinh
      const token = await ghPage.evaluate(() => {
        const tokenSpan = document.querySelector('#new-oauth-token, .js-token-text, [data-copy-hint]');
        return tokenSpan ? tokenSpan.textContent.trim() : null;
      });

      console.log('KẾT QUẢ TOKEN:', token);
    }

    browser.disconnect();
  } catch (err) {
    console.error('Lỗi:', err);
  }
})();
