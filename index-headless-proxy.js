const { chromium } = require("playwright-extra");
const stealth = require("puppeteer-extra-plugin-stealth")();
const dotenv = require("dotenv");
const fs = require("fs").promises;
const path = require("path");
dotenv.config();
chromium.use(stealth);

process.on("unhandledRejection", (reason, promise) => {
  console.error("🧨 Unhandled Rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("🔥 Uncaught Exception:", err);
});

// Handle process termination
async function saveOnExit() {
  console.log("🛑 Process terminating, saving analytics...");
  await saveAnalytics();
  process.exit();
}

process.on("SIGINT", saveOnExit); // Ctrl+C
process.on("SIGTERM", saveOnExit); // Termination signal

// Validate environment variables
const requiredEnvVars = ["URLS", "PS_PROXY", "PS_USERNAME", "PS_PASSWORD"];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Missing environment variable: ${envVar}`);
    process.exit(1);
  }
}

const urls = process.env.URLS.split(",").map((u) => u.trim());
const MAX_BROWSERS = parseInt(process.env.MAX_BROWSERS || "5", 10);
const ANALYTICS_FILE = "scraper_analytics.json";
const HEADLESS = process.env.HEADLESS === "false" ? false : true;

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

// Initialize analytics
let analytics = {
  startTime: null,
  endTime: null,
  cycles: 0,
  urls: {},
};

// Initialize URL analytics
urls.forEach((url) => {
  analytics.urls[url] = {
    hits: 0,
    successful: 0,
    failed: 0,
    lastVisited: null,
  };
});

// Validate analytics data
function validateAnalytics() {
  for (const url in analytics.urls) {
    const data = analytics.urls[url];
    if (data.hits !== data.successful + data.failed) {
      console.warn(
        `⚠️ Analytics mismatch for ${url}: hits (${data.hits}) ≠ successful (${data.successful}) + failed (${data.failed})`
      );
      data.failed = data.hits - data.successful;
    }
    if (data.hits < 0 || data.successful < 0 || data.failed < 0) {
      console.warn(
        `⚠️ Negative counts detected for ${url}: ${JSON.stringify(data)}`
      );
      data.hits = Math.max(data.hits, 0);
      data.successful = Math.max(data.successful, 0);
      data.failed = Math.max(data.failed, 0);
    }
  }
}

async function saveAnalytics() {
  console.log(`📊 Saving analytics: ${JSON.stringify(analytics, null, 2)}`);
  validateAnalytics();
  try {
    const filePath = path.resolve(ANALYTICS_FILE);
    console.log(`📂 Writing to file: ${filePath}`);
    await fs.writeFile(filePath, JSON.stringify(analytics, null, 2));
    console.log(`📊 Analytics saved to ${ANALYTICS_FILE}`);
  } catch (err) {
    console.error(
      `❌ Error saving analytics to ${ANALYTICS_FILE}: ${err.message}`
    );
    console.error(`Stack: ${err.stack}`);
  }
}

async function simulatePageview(url, browserIndex) {
  let browser = null;
  let page = null;
  let status = "failed";

  try {
    // Increment hits
    analytics.urls[url].hits += 1;
    console.log(`📈 [Browser ${browserIndex}] Incremented hits for ${url}`);

    const proxy = process.env.PS_PROXY;
    const username = process.env.PS_USERNAME;
    const password = process.env.PS_PASSWORD;

    await delay(randomBetween(50, 5000));
    const userAgent = userAgents[randomBetween(0, userAgents.length - 1)];
    const viewport = {
      width: randomBetween(1200, 1600),
      height: randomBetween(700, 1000),
    };

    console.log(`=== Proxy === ${proxy}, ${username}, ${password}`);

    browser = await chromium.launch({
      headless: true,
      args: [
        `--window-size=${viewport.width},${viewport.height}`,
        "--ignore-certificate-errors",
      ],
      proxy: {
        server: `https://${proxy}`,
        username,
        password,
      },
    });

    const context = await browser.newContext({
      javaScriptEnabled: true,
      userAgent,
      viewport,
      locale: "en-US",
      timezoneId: "America/New_York",
      geolocation: {
        latitude: 40.7128 + Math.random() * 0.01,
        longitude: -74.006 + Math.random() * 0.01,
      },
      permissions: ["geolocation"],
    });

    page = await context.newPage();

    // Fetch and print IP address
    try {
      const ipResponse = await page.goto("https://api.ipify.org?format=json", {
        waitUntil: "domcontentloaded",
        timeout: 10000,
      });
      const ipData = await ipResponse.json();
      console.log(`🌐 [Browser ${browserIndex}] IP Address: ${ipData.ip}`);
    } catch (ipErr) {
      console.error(
        `❌ [Browser ${browserIndex}] Failed to fetch IP: ${ipErr.message}`
      );
    }

    await page.route("**/*", (route) => {
      const resourceType = route.request().resourceType();
      if (["image", "media", "font", "stylesheet"].includes(resourceType)) {
        route.abort();
      } else {
        route.continue();
      }
    });

    console.log(`🔗 [Browser ${browserIndex}] Visiting ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });

    // Scroll to bottom
    try {
      await page.evaluate(async () => {
        await new Promise((resolve, reject) => {
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
          setTimeout(() => {
            clearInterval(timer);
            reject(new Error("Scrolling timed out"));
          }, 15000);
        });
      });
      console.log(`📜 [Browser ${browserIndex}] Scrolled to bottom`);
    } catch (scrollErr) {
      console.error(
        `❌ [Browser ${browserIndex}] Scroll failed: ${scrollErr.message}`
      );
      throw scrollErr;
    }

    // Random click
    try {
      const bodyBox = await page.evaluate(() => ({
        width: document.body.scrollWidth,
        height: document.body.scrollHeight,
      }));

      const x = randomBetween(50, bodyBox.width - 50);
      const y = randomBetween(100, bodyBox.height - 200);

      await page.mouse.move(x, y);
      await page.mouse.click(x, y);
      console.log(`🖱️ Clicked at (${x}, ${y})`);
    } catch (clickErr) {
      console.warn(`⚠️ Click failed: ${clickErr.message}`);
    }

    await delay(5000);
    status = "successful";
    console.log(`✅ [Browser ${browserIndex}] Done with ${url}`);
  } catch (err) {
    console.error(`❌ [Browser ${browserIndex}] Error: ${err.message}`);
    status = "failed";
  } finally {
    // Update analytics
    analytics.urls[url][status] += 1;
    analytics.urls[url].lastVisited = new Date().toISOString();
    analytics.endTime = new Date().toISOString();

    // Log counts
    console.log(
      `📊 [Browser ${browserIndex}] Counts for ${url}: Hits=${analytics.urls[url].hits}, Successful=${analytics.urls[url].successful}, Failed=${analytics.urls[url].failed}`
    );

    // Close browser
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
  // Initialize analytics file
  try {
    await fs.access(path.resolve(ANALYTICS_FILE));
  } catch {
    console.log(`📄 Creating new analytics file: ${ANALYTICS_FILE}`);
    await saveAnalytics();
  }

  analytics.startTime = new Date().toISOString();
  let cycle = 1;

  while (true) {
    try {
      const numBrowsers = randomBetween(urls.length, MAX_BROWSERS);
      console.log(
        `🔁 Starting cycle ${cycle++} with ${numBrowsers} browsers...`
      );

      // Prepare URLs
      let selectedUrls = [...urls];
      while (selectedUrls.length < numBrowsers) {
        const randomUrl = urls[randomBetween(0, urls.length - 1)];
        selectedUrls.push(randomUrl);
      }

      // Shuffle and slice
      selectedUrls = selectedUrls
        .sort(() => 0.5 - Math.random())
        .slice(0, numBrowsers);

      // Run visits
      await Promise.all(
        selectedUrls.map((url, i) => simulatePageview(url, i + 1))
      );

      // Save analytics
      await saveAnalytics();

      analytics.cycles += 1;
      analytics.endTime = new Date().toISOString();

      const wait = randomBetween(500, 3000);
      console.log(`⏳ Waiting ${wait / 1000}s before next cycle...`);
      await delay(wait);
    } catch (err) {
      console.error("❌ Error in cycle:", err.message);
      console.error(err);
      await saveAnalytics();
    }
  }
})();
