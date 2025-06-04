const { chromium } = require("playwright-extra");
const stealth = require("puppeteer-extra-plugin-stealth")();
const dotenv = require("dotenv");

dotenv.config();
chromium.use(stealth);

// Error handling
process.on("unhandledRejection", (reason) => {
  console.error("🧨 Unhandled Rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("🔥 Uncaught Exception:", err);
});

const urls = process.env.URLS
  ? process.env.URLS.split(",").map((u) => u.trim())
  : [];
const proxies = process.env.PS_PROXY
  ? process.env.PS_PROXY.split(",").map((p) => p.trim())
  : [];
const MAX_BROWSERS = parseInt(process.env.MAX_BROWSERS || "5", 10);
const HEADLESS_MODE = false; // False for testing, true for production
const DISABLE_JAVASCRIPT = false; // True only if pages work without JS

if (!urls.length) {
  console.error("❌ No URLs provided in URLS.");
  process.exit(1);
}

const delay = (ms) => new Promise((res) => setTimeout(res, ms));
const randomBetween = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const userAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.112 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:117.0) Gecko/20100101 Firefox/117.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.1 Safari/605.1.15",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.85 Safari/537.36",
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.6045.134 Mobile Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
];

// Test proxy connectivity
async function testProxy(proxy, username, password) {
  let browser = null;
  let context = null;
  try {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({
      proxy: {
        server: `https://${proxy}`,
        username,
        password,
      },
    });
    const page = await context.newPage();
    await page.goto("https://www.example.com", {
      waitUntil: "domcontentloaded",
      timeout: 10000,
    });
    console.log(`✅ Proxy ${proxy} is working.`);
    return true;
  } catch (err) {
    console.error(`❌ Proxy ${proxy} failed: ${err.message}`);
    return false;
  } finally {
    if (context) await context.close();
    if (browser) await browser.close();
  }
}

async function simulatePageview(
  url,
  browserIndex,
  proxy,
  username,
  password,
  cycle
) {
  let browser = null;
  let context = null;
  let page = null;
  let totalData = 0; // Track data usage in kB
  const randomnessLog = {
    url,
    browserIndex,
    userAgent: "",
    viewport: {},
    clickCoordinates: null,
    proxy: proxy || "No proxy",
    geolocation: {},
  };

  try {
    const userAgent = userAgents[randomBetween(0, userAgents.length - 1)];
    randomnessLog.userAgent = userAgent;
    const viewport = {
      width: randomBetween(1200, 1600),
      height: randomBetween(700, 1000),
    };
    randomnessLog.viewport = viewport;
    const geolocation = {
      latitude: 40.7128 + Math.random() * 0.01,
      longitude: -74.006 + Math.random() * 0.01,
    };
    randomnessLog.geolocation = geolocation;

    browser = await chromium.launch({
      headless: HEADLESS_MODE,
      args: ["--new-window", "--ignore-certificate-errors", "--no-sandbox"],
    });

    context = await browser.newContext({
      javaScriptEnabled: !DISABLE_JAVASCRIPT,
      locale: "en-US",
      timezoneId: "America/New_York",
      geolocation,
      permissions: ["geolocation"],
      ...(proxy && {
        proxy: {
          server: `http://${proxy}`,
          username,
          password,
        },
      }),
    });

    page = await context.newPage();
    await page.setViewportSize(viewport);
    await page.setExtraHTTPHeaders({ "User-Agent": userAgent });

    // Block images, media, fonts, and CSS
    await page.route("**/*", (route) => {
      const resourceType = route.request().resourceType();
      if (["image", "media", "font", "stylesheet"].includes(resourceType)) {
        route.abort();
      } else {
        route.continue();
      }
    });

    // Track data usage
    page.on("response", async (response) => {
      const buffer = await response.body().catch(() => null);
      const size = buffer ? buffer.length / 1024 : 0; // kB
      totalData += size;
      console.log(
        `[Browser ${browserIndex}] Response: ${response.url()} - ${response.status()} (${size.toFixed(
          2
        )} kB)`
      );
    });

    // Verify outgoing IP
    try {
      const ipResponse = await page.goto("https://api.ipify.org?format=json", {
        timeout: 10000,
      });
      const ipData = await ipResponse.json();
      console.log(`[Browser ${browserIndex}] Outgoing IP: ${ipData.ip}`);
    } catch (err) {
      console.warn(
        `[Browser ${browserIndex}] Failed to verify IP: ${err.message}`
      );
    }

    console.log(`🔗 [Browser ${browserIndex}] Visiting ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    console.log(
      `📄 [Browser ${browserIndex}] Page loaded (domcontentloaded) for ${url}`
    );

    // Wait for body
    try {
      await page.waitForSelector("body", { timeout: 5000 });
      console.log(`📄 [Browser ${browserIndex}] Body loaded for ${url}`);
    } catch (err) {
      console.warn(
        `⚠️ [Browser ${browserIndex}] Body selector not found: ${err.message}`
      );
    }

    // Stop further loading
    try {
      await page.evaluate(() => window.stop());
      console.log(
        `🛑 [Browser ${browserIndex}] Stopped further loading for ${url}`
      );
    } catch (err) {
      console.warn(
        `⚠️ [Browser ${browserIndex}] Failed to stop loading: ${err.message}`
      );
    }

    // Scroll to bottom
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 100;
        const timer = setInterval(() => {
          window.scrollBy(0, distance);
          totalHeight += distance;
          if (totalHeight >= document.body.scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });
    console.log(`📜 [Browser ${browserIndex}] Scrolled to bottom`);

    // Random click
    try {
      const bodyBox = await page.evaluate(() => ({
        width: document.body.scrollWidth,
        height: document.body.scrollHeight,
      }));

      const x = randomBetween(50, bodyBox.width - 50);
      const y = randomBetween(100, bodyBox.height - 200);
      randomnessLog.clickCoordinates = { x, y };

      await page.mouse.move(x, y);
      await page.mouse.click(x, y);
      console.log(`🖱️ [Browser ${browserIndex}] Clicked at (${x}, ${y})`);
    } catch (clickErr) {
      console.warn(
        `⚠️ [Browser ${browserIndex}] Click failed: ${clickErr.message}`
      );
    }

    await delay(5500);
    console.log(
      `✅ [Browser ${browserIndex}] Done with ${url} (Total Data: ${totalData.toFixed(
        2
      )} kB)`
    );

    // Log randomness details
    console.log(
      `[Cycle ${cycle}] [Browser ${browserIndex}] Randomness Log:`,
      randomnessLog
    );
  } catch (err) {
    console.error(`❌ [Browser ${browserIndex}] Error: ${err.message}`);
  } finally {
    // Keep browser open for inspection
    if (page) await page.close();
    if (context) await context.close();
    if (browser) await browser.close();
  }
}

(async () => {
  let cycle = 1;
  let proxyIndex = 0;

  // Test proxies
  const validProxies = [];
  for (const proxy of proxies) {
    if (
      await testProxy(proxy, process.env.PS_USERNAME, process.env.PS_PASSWORD)
    ) {
      validProxies.push(proxy);
    }
  }

  console.log(
    `✅ Using ${validProxies.length || 1} proxies:`,
    validProxies.length ? validProxies : ["No proxy"]
  );

  while (true) {
    try {
      const numBrowsers = randomBetween(urls.length, MAX_BROWSERS);
      console.log(`🔁 Starting cycle ${cycle} with ${numBrowsers} browsers...`);

      // Prepare URLs — fill extra slots randomly if needed
      let selectedUrls = [...urls];
      while (selectedUrls.length < numBrowsers) {
        const randomUrl = urls[randomBetween(0, urls.length - 1)];
        selectedUrls.push(randomUrl);
      }

      // Shuffle and slice to exact number of browsers
      selectedUrls = selectedUrls
        .sort(() => 0.5 - Math.random())
        .slice(0, numBrowsers);
      console.log(`[Cycle ${cycle}] Selected URLs:`, selectedUrls);

      // Prepare browsers with proxies
      const browserPromises = selectedUrls.map(async (url, i) => {
        const proxy =
          validProxies.length > 0
            ? validProxies[proxyIndex % validProxies.length]
            : null;
        proxyIndex =
          validProxies.length > 0
            ? (proxyIndex + 1) % validProxies.length
            : proxyIndex;
        const username = process.env.PS_USERNAME;
        const password = process.env.PS_PASSWORD;

        console.log(
          `[Cycle ${cycle}] [Browser ${i + 1}] Proxy: ${
            proxy || "No proxy"
          }, Username: ${username || "N/A"}`
        );

        return simulatePageview(url, i + 1, proxy, username, password, cycle);
      });

      // Open browsers with 20ms delay
      for (let i = 0; i < browserPromises.length; i++) {
        await browserPromises[i];
        await delay(20);
      }

      const wait = randomBetween(500, 3000);
      console.log(
        `[Cycle ${cycle}] ⏳ Waiting ${wait / 1000}s before next cycle...`
      );
      await delay(wait);
      cycle++;
    } catch (err) {
      console.error(`[Cycle ${cycle}] Error in cycle:`, err.message);
      console.error(err);
    }
  }
})();
