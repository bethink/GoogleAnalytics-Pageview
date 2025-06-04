const { chromium } = require("playwright-extra");
const stealth = require("puppeteer-extra-plugin-stealth")();
const dotenv = require("dotenv");
dotenv.config();
chromium.use(stealth);

process.on("unhandledRejection", (reason) => {
  console.error("🧨 Unhandled Rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("🔥 Uncaught Exception:", err);
});

const urls = process.env.URLS.split(",").map((u) => u.trim());
const MAX_BROWSERS = parseInt(process.env.MAX_BROWSERS || "5", 10);
const DISABLE_JS = process.env.DISABLE_JS === "true"; // Set in .env (e.g., DISABLE_JS=true)
const HEADLESS = process.env.HEADLESS === "false" ? false : true;

const delay = (ms) => new Promise((res) => setTimeout(res, ms));
const randomBetween = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const userAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.112 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.1 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.85 Safari/537.36",
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
];

async function simulatePageview(url, browserIndex) {
  let browser = null;
  let page = null;

  try {
    const proxy = process.env.PS_PROXY;
    const username = process.env.PS_USERNAME;
    const password = process.env.PS_PASSWORD;

    await delay(randomBetween(100, 2000)); // Reduced max delay
    const userAgent = userAgents[randomBetween(0, userAgents.length - 1)];
    const viewport = {
      width: randomBetween(1200, 1600),
      height: randomBetween(700, 1000),
    };

    browser = await chromium.launch({
      headless: HEADLESS, // Use the HEADLESS variable here
      args: [
        `--window-size=${viewport.width},${viewport.height}`,
        "--ignore-certificate-errors",
        "--disable-gpu",
      ],
      proxy: proxy
        ? { server: `https://${proxy}`, username, password }
        : undefined,
    });

    const context = await browser.newContext({
      userAgent,
      viewport,
      locale: "en-US",
      timezoneId: "America/New_York",
      geolocation: {
        latitude: 40.7128 + Math.random() * 0.01,
        longitude: -74.006 + Math.random() * 0.01,
      },
      permissions: ["geolocation"],
      javaScriptEnabled: !DISABLE_JS, // Conditionally disable JavaScript
    });

    // Block images, media, fonts, and CSS
    await context.route("**/*", (route) => {
      const resourceType = route.request().resourceType();
      if (["image", "media", "font", "stylesheet"].includes(resourceType)) {
        route.abort();
      } else {
        route.continue();
      }
    });

    page = await context.newPage();

    console.log(`🔗 [Browser ${browserIndex}] Visiting ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 }); // Reduced timeout

    // Minimal scroll (only 50% of page)
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 100;
        const maxScroll = document.body.scrollHeight * 0.5; // Scroll only halfway
        const timer = setInterval(() => {
          window.scrollBy(0, distance);
          totalHeight += distance;
          if (totalHeight >= maxScroll) {
            clearInterval(timer);
            resolve();
          }
        }, 50); // Faster scroll
      });
    });

    console.log(`📜 [Browser ${browserIndex}] Scrolled halfway`);

    // Optional minimal click (50% chance)
    if (Math.random() > 0.5) {
      try {
        const bodyBox = await page.evaluate(() => ({
          width: document.body.scrollWidth,
          height: document.body.scrollHeight,
        }));

        const x = randomBetween(50, bodyBox.width - 50);
        const y = randomBetween(100, bodyBox.height - 200);

        await page.mouse.move(x, y);
        await page.mouse.click(x, y);
        console.log(`🖱️ [Browser ${browserIndex}] Clicked at (${x}, ${y})`);
      } catch (clickErr) {
        console.warn(
          `⚠️ [Browser ${browserIndex}] Click failed: ${clickErr.message}`
        );
      }
    }

    await delay(2000); // Reduced dwell time
    console.log(`✅ [Browser ${browserIndex}] Done with ${url}`);
  } catch (err) {
    console.error(`❌ [Browser ${browserIndex}] Error: ${err.message}`);
  } finally {
    if (browser) {
      try {
        await browser.close();
        console.log(`🔒 [Browser ${browserIndex}] Browser closed for ${url}`);
      } catch (closeErr) {
        console.error(
          `⚠️ [Browser ${browserIndex}] Error closing browser: ${closeErr.message}`
        );
      }
    }
  }
}

(async () => {
  let cycle = 1;

  while (true) {
    try {
      const numBrowsers = randomBetween(urls.length, MAX_BROWSERS);
      console.log(
        `🔁 Starting cycle ${cycle++} with ${numBrowsers} browsers...`
      );

      let selectedUrls = [...urls];
      while (selectedUrls.length < numBrowsers) {
        const randomUrl = urls[randomBetween(0, urls.length - 1)];
        selectedUrls.push(randomUrl);
      }

      selectedUrls = selectedUrls
        .sort(() => 0.5 - Math.random())
        .slice(0, numBrowsers);

      await Promise.all(
        selectedUrls.map((url, i) => simulatePageview(url, i + 1))
      );

      const wait = randomBetween(500, 2000); // Reduced wait time
      console.log(`⏳ Waiting ${wait / 1000}s before next cycle...`);
      await delay(wait);
    } catch (err) {
      console.error("❌ Cycle error:", err.message);
    }
  }
})();
