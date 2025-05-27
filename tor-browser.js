const { chromium } = require('playwright');
require('dotenv').config();

const urls = process.env.URLS.split(',').map(url => url.trim());

(async () => {
    const browser = await chromium.launch({
      headless: false,
      proxy: {
        server: 'socks5://127.0.0.1:9150', // Ensure Tor is running
      },
    });

  while (true) {
    console.log('🚀 Starting new browser session...');


    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.99 (KHTML, like Gecko) Chrome/112 Safari/537.99',
    });

    const pages = [];

    // Launch all URLs in parallel tabs
    for (const url of urls) {
      const page = await context.newPage();
      // await new Promise(res => setTimeout(res, 500)); // 10..200
      const randomDelay = Math.floor(Math.random() * (200 - 10 + 1)) + 10;
      await new Promise(res => setTimeout(res, randomDelay));
      console.log(`🔁 Opening after ${randomDelay} ms...`);

      pages.push({ page, url });
    }

    // Perform tasks on all tabs
    await Promise.all(
      pages.map(async ({ page, url }) => {
        try {
          console.log(`🔗 Opening: ${url}`);
          await page.goto(url, { timeout: 15000 });

          console.log(`📜 Scrolling: ${url}`);
          await page.evaluate(async () => {
            const delay = ms => new Promise(res => setTimeout(res, ms));
            const distance = 100;
            const delayTime = 100;
            for (let i = 0; i < document.body.scrollHeight; i += distance) {
              window.scrollBy(0, distance);
              await delay(delayTime);
            }
          });

          // console.log(`🧭 Searching for clickable elements on ${url}`);
          // const clickableElements = await page.$$eval('a, button', elements =>
          //   elements
          //     .filter(el => {
          //       const rect = el.getBoundingClientRect();
          //       return rect.width > 0 && rect.height > 0 && !el.disabled;
          //     })
          //     .map(el => ({
          //       tag: el.tagName,
          //       text: el.innerText.trim(),
          //       selector:
          //         el.tagName +
          //         (el.id ? `#${el.id}` : '') +
          //         (el.className
          //           ? `.${el.className.split(' ').join('.')}`
          //           : ''),
          //     }))
          // );

          // if (clickableElements.length === 0) {
          //   console.log(`❌ No clickable elements on ${url}`);
          // } else {
          //   const randomIndex = Math.floor(Math.random() * clickableElements.length);
          //   const randomEl = clickableElements[randomIndex];
          //   console.log(`🖱️ Clicking: ${randomEl.tag} - "${randomEl.text}"`);
          //   try {
          //     await page.click(randomEl.selector, { timeout: 5000 });
          //   } catch (err) {
          //     console.warn(`⚠️ Failed to click on ${url}:`, err.message);
          //   }
          // }
        } catch (err) {
          console.error(`❌ Error on ${url}: ${err.message}`);
        }
      })
    );

    console.log('🛑 Closing browser after processing all tabs...');
    // await browser.close();
    pages.forEach(({ page }) => page.close());

    const delayMs = Math.floor(Math.random() * (1000 - 100 + 1)) + 100;
    console.log(`🔁 Restarting after ${delayMs} ms...`);
    await new Promise(res => setTimeout(res, delayMs));

  }
})();
