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

const urls = process.env.URLS.split(",").map((u) => u.trim());
const proxies = process.env.PS_PROXY
  ? process.env.PS_PROXY.split(",").map((p) => p.trim())
  : [];
const NUM_TABS = 5; // Fixed to 5 tabs per cycle

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
        server: `http://${proxy}`, // Adjust to https if needed
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

async function simulatePageview(url, tabIndex, context) {
  let page = null;

  try {
    const userAgent = userAgents[randomBetween(0, userAgents.length - 1)];
    const viewport = {
      width: randomBetween(1200, 1600),
      height: randomBetween(700, 1000),
    };

    page = await context.newPage();
    await page.setViewportSize(viewport);
    await page.setExtraHTTPHeaders({ "User-Agent": userAgent });

    // Log HTTP responses for debugging
    page.on("response", (response) => {
      console.log(
        `[Tab ${tabIndex}] Response: ${response.url()} - ${response.status()}`
      );
    });

    console.log(`🔗 [Tab ${tabIndex}] Visiting ${url}`);
    // Try networkidle, fall back to domcontentloaded
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
      console.log(`📄 [Tab ${tabIndex}] Page loaded (networkidle) for ${url}`);
    } catch (err) {
      console.warn(
        `⚠️ [Tab ${tabIndex}] Networkidle failed: ${err.message}. Trying domcontentloaded...`
      );
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      console.log(
        `📄 [Tab ${tabIndex}] Page loaded (domcontentloaded) for ${url}`
      );
    }

    // Wait for body to ensure DOM is ready
    try {
      await page.waitForSelector("body", { timeout: 5000 });
      console.log(`📄 [Tab ${tabIndex}] Body loaded for ${url}`);
    } catch (err) {
      console.warn(
        `⚠️ [Tab ${tabIndex}] Body selector not found: ${err.message}`
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

    console.log(`📜 [Tab ${tabIndex}] Scrolled to bottom`);

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
      console.log(`🖱️ [Tab ${tabIndex}] Clicked at (${x}, ${y})`);
    } catch (clickErr) {
      console.warn(`⚠️ [Tab ${tabIndex}] Click failed: ${clickErr.message}`);
    }

    await delay(5500);
    console.log(`✅ [Tab ${tabIndex}] Done with ${url}`);
  } catch (err) {
    console.error(`❌ [Tab ${tabIndex}] Error: ${err.message}`);
  } finally {
    // Close the page to clean up
    if (page) {
      try {
        await page.close();
        console.log(`🔒 [Tab ${tabIndex}] Page closed for ${url}`);
      } catch (closeErr) {
        console.error(
          `⚠️ [Tab ${tabIndex}] Error closing page: ${closeErr.message}`
        );
      }
    }
  }
}

(async () => {
  let cycle = 1;
  let browser = null;
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

  try {
    // Launch a single browser instance
    browser = await chromium.launch({
      headless: false,
      args: ["--new-window", "--ignore-certificate-errors", "--no-sandbox"],
    });

    while (true) {
      let context = null;
      try {
        // Use proxy if available, otherwise no proxy
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
          `=== Proxy for Cycle ${cycle} ===`,
          proxy || "No proxy",
          username || "N/A"
        );

        // Create context with or without proxy
        context = await browser.newContext({
          locale: "en-US",
          timezoneId: "America/New_York",
          geolocation: {
            latitude: 40.7128 + Math.random() * 0.01,
            longitude: -74.006 + Math.random() * 0.01,
          },
          permissions: ["geolocation"],
          ...(proxy && {
            proxy: {
              server: `http://${proxy}`, // Adjust to https if needed
              username,
              password,
            },
          }),
        });

        console.log(`🔁 Starting cycle ${cycle++} with ${NUM_TABS} tabs...`);

        // Prepare 5 URLs
        let selectedUrls = [...urls];
        while (selectedUrls.length < NUM_TABS) {
          selectedUrls.push(urls[randomBetween(0, urls.length - 1)]);
        }
        selectedUrls = selectedUrls
          .sort(() => 0.5 - Math.random())
          .slice(0, NUM_TABS);

        // Open 5 tabs with a 20ms delay
        const tabPromises = [];
        for (let i = 0; i < NUM_TABS; i++) {
          tabPromises.push(simulatePageview(selectedUrls[i], i + 1, context));
          await delay(20); // 0.02-second delay
        }

        // Wait for all tabs to complete
        await Promise.all(tabPromises);

        const wait = randomBetween(500, 3000);
        console.log(`⏳ Waiting ${wait / 1000}s before next cycle...`);
        await delay(wait);
      } catch (err) {
        console.error("Error in cycle:", err.message);
      } finally {
        if (context) {
          try {
            await context.close();
            console.log(`🔒 Context closed for cycle ${cycle - 1}`);
          } catch (closeErr) {
            console.error(`⚠️ Error closing context: ${closeErr.message}`);
          }
        }
      }
    }
  } catch (err) {
    console.error("Error launching browser:", err.message);
  } finally {
    if (browser) {
      try {
        await browser.close();
        console.log("🔒 Browser closed");
      } catch (closeErr) {
        console.error("⚠️ Error closing browser:", closeErr.message);
      }
    }
  }
})();
