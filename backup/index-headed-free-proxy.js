const { chromium } = require("playwright-extra");
const stealth = require("puppeteer-extra-plugin-stealth")();
const dotenv = require("dotenv");
const axios = require("axios");
dotenv.config();
chromium.use(stealth);

process.on("unhandledRejection", (reason, promise) => {
  console.error("🧨 Unhandled Rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("🔥 Uncaught Exception:", err);
});

const urls = process.env.URLS.split(",").map((u) => u.trim());
const MAX_BROWSERS = parseInt(process.env.MAX_BROWSERS || "5", 10);

// ProxyScrape API endpoints
const proxyEndpoints = {
  http: "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all",
  https:
    "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=https&timeout=10000&country=all&ssl=all&anonymity=all",
};

// Store proxies for each protocol
let proxies = {
  http: [],
  https: [],
};

const delay = (ms) => new Promise((res) => setTimeout(res, ms));
const randomBetween = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const userAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.2592.68",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0",
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.71 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 14; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/126.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) CriOS/126.0.6478.53 Mobile/15E148 Safari/604.1",
];

// Fetch proxies from ProxyScrape API
async function fetchProxies() {
  try {
    proxies = { http: [], https: [] }; // Reset proxies
    for (const [protocol, endpoint] of Object.entries(proxyEndpoints)) {
      const response = await axios.get(endpoint);
      if (response.status === 200) {
        proxies[protocol] = response.data
          .trim()
          .split("\n")
          .filter((p) => p);
        console.log(proxies.http, proxies.https);
        console.log(
          `🌐 Fetched ${
            proxies[protocol].length
          } ${protocol.toUpperCase()} proxies at ${new Date().toLocaleString(
            "en-US",
            { timeZone: "Asia/Kolkata" }
          )}`
        );
      } else {
        console.error(
          `⚠️ Failed to fetch ${protocol.toUpperCase()} proxies: Status ${
            response.status
          }`
        );
        proxies[protocol] = [];
      }
    }
    const totalProxies = proxies.http.length + proxies.https.length;
    console.log(`📊 Total proxies fetched: ${totalProxies}`);
    return totalProxies > 0;
  } catch (err) {
    console.error(`❌ Error fetching proxies: ${err.message}`);
    proxies = { http: [], https: [] };
    return false;
  }
}

// Verify outgoing IP address
async function getOutgoingIP(page, proxy, protocol) {
  try {
    const response = await page.goto("https://api.ipify.org?format=json", {
      timeout: 10000,
    });
    if (response && response.status() === 200) {
      const data = await response.json();
      const ip = data.ip;
      console.log(
        `🌍 Outgoing IP for ${protocol.toUpperCase()} proxy ${proxy}: ${ip}`
      );
      return ip;
    } else {
      console.warn(
        `⚠️ Failed to verify IP for ${protocol.toUpperCase()} proxy ${proxy}`
      );
      return null;
    }
  } catch (err) {
    console.error(
      `❌ Error verifying IP for ${protocol.toUpperCase()} proxy ${proxy}: ${
        err.message
      }`
    );
    return null;
  }
}

async function simulatePageview(
  url,
  browserIndex,
  proxy,
  protocol,
  maxRetries = 3
) {
  let browser = null;
  let page = null;
  let retries = 0;
  let currentProxy = proxy;

  while (retries < maxRetries) {
    try {
      await delay(randomBetween(100, 4000));
      const userAgent = userAgents[randomBetween(0, userAgents.length - 1)];
      const viewport = {
        width: randomBetween(1200, 1600),
        height: randomBetween(700, 1000),
      };

      console.log(
        `=== Proxy === ${protocol.toUpperCase()}://${
          currentProxy || "No proxy"
        } (Attempt ${retries + 1})`
      );

      browser = await chromium.launch({
        headless: false,
        args: [
          `--window-size=${viewport.width},${viewport.height}`,
          "--ignore-certificate-errors",
        ],
        ...(currentProxy && {
          proxy: { server: `${protocol}://${currentProxy}` },
        }),
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
      });

      page = await context.newPage();

      // Verify outgoing IP
      const outgoingIP = await getOutgoingIP(page, currentProxy, protocol);
      if (!outgoingIP) {
        throw new Error("Failed to verify proxy IP");
      }

      console.log(
        `🔗 [Browser ${browserIndex}] Visiting ${url} with ${protocol.toUpperCase()} proxy: ${currentProxy}`
      );
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });

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

        await page.mouse.move(x, y);
        await page.mouse.click(x, y);
        console.log(`🖱️ Clicked at (${x}, ${y})`);
      } catch (clickErr) {
        console.warn(`⚠️ Click failed: ${clickErr.message}`);
      }

      await delay(5500);
      console.log(`✅ [Browser ${browserIndex}] Done with ${url}`);
      return true; // Success
    } catch (err) {
      console.error(
        `❌ [Browser ${browserIndex}] Error with ${protocol.toUpperCase()} proxy ${currentProxy}: ${
          err.message
        }`
      );
      retries++;
      if (retries < maxRetries) {
        console.log(`🔄 Retrying with a new proxy...`);
        currentProxy =
          proxies[protocol][randomBetween(0, proxies[protocol].length - 1)] ||
          null;
        if (!currentProxy) {
          console.warn(
            `⚠️ No more ${protocol.toUpperCase()} proxies available`
          );
          break;
        }
      }
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
  console.error(
    `❌ [Browser ${browserIndex}] Failed after ${maxRetries} retries for ${url}`
  );
  return false;
}

(async () => {
  let cycle = 1;

  while (true) {
    // Fetch fresh proxies at the start of each cycle
    const hasProxies = await fetchProxies();

    if (!hasProxies) {
      console.warn(
        "⚠️ No proxies available, waiting 5 minutes before retrying..."
      );
      await delay(300000); // Wait 5 minutes
      continue;
    }

    console.log(
      `🔁 Starting cycle ${cycle++} with ${
        proxies.http.length + proxies.https.length
      } proxies at ${new Date().toLocaleString("en-US", {
        timeZone: "Asia/Kolkata",
      })}`
    );

    // Process proxies in order: HTTP -> HTTPS
    for (const protocol of ["http", "https"]) {
      const proxyList = proxies[protocol];
      if (proxyList.length === 0) {
        console.log(
          `⚠️ No ${protocol.toUpperCase()} proxies available, skipping...`
        );
        continue;
      }

      console.log(
        `🚀 Processing ${proxyList.length} ${protocol.toUpperCase()} proxies...`
      );

      // Process proxies in batches of MAX_BROWSERS
      for (let i = 0; i < proxyList.length; i += MAX_BROWSERS) {
        const batch = proxyList.slice(i, i + MAX_BROWSERS);
        const selectedUrls = urls
          .sort(() => 0.5 - Math.random())
          .slice(0, Math.min(batch.length, urls.length));

        // Ensure enough URLs for the batch
        while (selectedUrls.length < batch.length) {
          selectedUrls.push(urls[randomBetween(0, urls.length - 1)]);
        }

        // Run pageviews for this batch
        await Promise.all(
          batch.map((proxy, j) =>
            simulatePageview(selectedUrls[j], i + j + 1, proxy, protocol)
          )
        );

        const wait = randomBetween(500, 3000);
        console.log(`⏳ Waiting ${wait / 1000}s before next batch...`);
        await delay(wait);
      }
    }

    console.log("✅ Completed cycle, fetching new proxies...");
    await delay(5000); // Brief pause before fetching new proxies
  }
})();
