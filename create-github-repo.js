const puppeteer = require('puppeteer-core');

(async () => {
  try {
    const browser = await puppeteer.connect({
      browserURL: 'http://127.0.0.1:9222',
      defaultViewport: null,
    });

    const pages = await browser.pages();
    const ghPage = pages.find(p => p.url().includes('github.com'));
    if (!ghPage) {
      console.log('Không tìm thấy tab GitHub');
      browser.disconnect();
      return;
    }

    console.log('Đang ở trang GitHub:', ghPage.url());
    
    // Nếu chưa ở https://github.com/new, chuyển hướng đến
    if (!ghPage.url().includes('/new')) {
      await ghPage.goto('https://github.com/new', { waitUntil: 'networkidle2' });
    }

    // Đợi ô nhập tên repository
    await ghPage.waitForSelector('input[data-testid="repository-name-input"], input[name="repository[name]"], #repository_name', { timeout: 10000 });

    const repoNameInput = await ghPage.$('input[data-testid="repository-name-input"]') || 
                          await ghPage.$('input[name="repository[name]"]') ||
                          await ghPage.$('#repository_name');

    if (repoNameInput) {
      console.log('Đang nhập tên repo: only-social');
      await repoNameInput.click();
      await ghPage.keyboard.type('only-social', { delay: 50 });
      await new Promise(r => setTimeout(r, 2000));
    }

    // Kiểm tra nút Create repository
    const createBtn = await ghPage.$('button[type="submit"].btn-primary, button[data-testid="create-repo-button"]') ||
                      await ghPage.evaluateHandle(() => {
                        const buttons = Array.from(document.querySelectorAll('button'));
                        return buttons.find(b => b.textContent.trim().toLowerCase().includes('create repository'));
                      });

    if (createBtn) {
      console.log('Bấm nút Create repository...');
      await createBtn.click();
      await ghPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
    }

    console.log('URL hiện tại trên tab GitHub sau khi tạo:', ghPage.url());
    browser.disconnect();
  } catch (err) {
    console.error('Lỗi thao tác GitHub:', err);
  }
})();
