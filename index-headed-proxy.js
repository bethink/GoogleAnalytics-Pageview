const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const dotenv = require('dotenv');
dotenv.config();
chromium.use(stealth);

process.on('unhandledRejection', (reason, promise) => {
    console.error('🧨 Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('🔥 Uncaught Exception:', err);
});

const urls = process.env.URLS.split(',').map((u) => u.trim());
const MAX_BROWSERS = parseInt(process.env.MAX_BROWSERS || '5', 10);

const delay = (ms) => new Promise((res) => setTimeout(res, ms));
const randomBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const userAgents = [
    // Windows - Chrome
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.112 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',

    // Windows - Firefox
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:117.0) Gecko/20100101 Firefox/117.0',

    // macOS - Chrome
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',

    // macOS - Safari
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.1 Safari/605.1.15',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Safari/605.1.15',

    // Linux - Chrome
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.85 Safari/537.36',

    // Android - Chrome
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.6045.134 Mobile Safari/537.36',

    // iPhone - Safari
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
];

async function simulatePageview(url, browserIndex) {
    let browser = null;
    let page = null;
    
    try {
        const proxy = process.env.PS_PROXY;
        const username = process.env.PS_USERNAME;
        const password = process.env.PS_PASSWORD;

        await delay(randomBetween(100, 4000));
        const userAgent = userAgents[randomBetween(0, userAgents.length - 1)];
        const viewport = {
            width: randomBetween(1200, 1600),
            height: randomBetween(700, 1000),
        };

        console.log("=== Proxy ===", proxy, username, password)

        browser = await chromium.launch({
            headless: false,
            args: [`--window-size=${viewport.width},${viewport.height}`, '--ignore-certificate-errors'],
            proxy: {
                server: `https://${proxy}`,
                username,
                password,
            }
        });

        const context = await browser.newContext({
            javaScriptEnabled: true,
            userAgent,
            viewport,
            locale: 'en-US',
            timezoneId: 'America/New_York',
            geolocation: {
                latitude: 40.7128 + Math.random() * 0.01,
                longitude: -74.0060 + Math.random() * 0.01,
            },
            permissions: ['geolocation'],
        });

        page = await context.newPage();

        await page.route("**/*", (route) => {
        const resourceType = route.request().resourceType();
        if (["image", "media", "font", "stylesheet"].includes(resourceType)) {
            route.abort();
        } else {
            route.continue();
        }
        });        

        console.log(`🔗 [Browser ${browserIndex}] Visiting ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

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

        await delay(6000);
        console.log(`✅ [Browser ${browserIndex}] Done with ${url}`);
    } catch (err) {
        console.error(`❌ [Browser ${browserIndex}] Error: ${err.message}`);
    } finally {
        // Ensure browser is always closed, even if an error occurs
        if (browser) {
            try {
                await browser.close();
                console.log(`🔒 [Browser ${browserIndex}] Browser closed for ${url}`);
            } catch (closeErr) {
                console.error(`⚠️ [Browser ${browserIndex}] Error closing browser: ${closeErr.message}`);
            }
        }
    }
}

(async () => {
  let cycle = 1;

  while (true) {    
      try {
          const numBrowsers = randomBetween(urls.length, MAX_BROWSERS);
          console.log(`🔁 Starting cycle ${cycle++} with ${numBrowsers} browsers...`);

          // Prepare URLs — fill extra slots randomly if needed
          let selectedUrls = [...urls];
          while (selectedUrls.length < numBrowsers) {
              const randomUrl = urls[randomBetween(0, urls.length - 1)];
              selectedUrls.push(randomUrl);
          }

          // Shuffle and slice to exact number of browsers
          selectedUrls = selectedUrls.sort(() => 0.5 - Math.random()).slice(0, numBrowsers);

          await Promise.all(
              selectedUrls.map((url, i) => simulatePageview(url, i + 1))
          );

          const wait = randomBetween(500, 3000);
          console.log(`⏳ Waiting ${wait / 1000}s before next cycle...`);
          await delay(wait);
      } catch (err) {
          console.error("Error resolving promise", err.message)
          console.error(err)
      }
  }
})();


// const { chromium } = require('playwright-extra');
// const stealth = require('puppeteer-extra-plugin-stealth')();
// const dotenv = require('dotenv');

// dotenv.config();
// chromium.use(stealth);

// const urls = process.env.URLS.split(',');

// const delay = (ms) => new Promise((res) => setTimeout(res, ms));
// const randomBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// const userAgents = [
//     // Windows - Chrome
//     'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.112 Safari/537.36',
//     'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',

//     // Windows - Firefox
//     'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
//     'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:117.0) Gecko/20100101 Firefox/117.0',

//     // macOS - Chrome
//     'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',

//     // macOS - Safari
//     'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.1 Safari/605.1.15',
//     'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Safari/605.1.15',

//     // Linux - Chrome
//     'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.85 Safari/537.36',

//     // Android - Chrome
//     'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36',
//     'Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.6045.134 Mobile Safari/537.36',

//     // iPhone - Safari
//     'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
// ];

// async function simulatePageview(url, index) {
//     // Add a random delay 
//     await delay(randomBetween(100, 4000));
//     const userAgent = userAgents[randomBetween(0, userAgents.length - 1)];
//     const viewport = {
//         width: randomBetween(1200, 1600),
//         height: randomBetween(700, 1000),
//     };

//     const browser = await chromium.launch({
//         headless: false,
//         args: [`--window-size=${viewport.width},${viewport.height}`],
//     });

//     const context = await browser.newContext({
//         userAgent,
//         viewport,
//         locale: 'en-US',
//         timezoneId: 'America/New_York',
//         geolocation: {
//             latitude: 40.7128 + Math.random() * 0.01,
//             longitude: -74.0060 + Math.random() * 0.01,
//         },
//         permissions: ['geolocation'],
//     });

//     const page = await context.newPage();

//     try {
//         console.log(`🔗 [${index + 1}] Visiting ${url}`);
//         await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

//         // Scroll to bottom
//         await page.evaluate(async () => {
//             await new Promise((resolve) => {
//                 let totalHeight = 0;
//                 const distance = 100;
//                 const timer = setInterval(() => {
//                     window.scrollBy(0, distance);
//                     totalHeight += distance;
//                     if (totalHeight >= document.body.scrollHeight) {
//                         clearInterval(timer);
//                         resolve();
//                     }
//                 }, 100);
//             });
//         });

//         console.log(`📜 [${index + 1}] Scrolled to bottom of ${url}`);

//         // Random click
//         try {
//             const bodyBox = await page.evaluate(() => ({
//                 width: document.body.scrollWidth,
//                 height: document.body.scrollHeight,
//             }));

//             const x = randomBetween(50, bodyBox.width - 50);
//             const y = randomBetween(100, bodyBox.height - 200);

//             await page.mouse.move(x, y);
//             await page.mouse.click(x, y);
//             console.log(`🖱️ Clicked at (${x}, ${y}) on ${url}`);
//         } catch (clickErr) {
//             console.warn(`⚠️ Failed to click on ${url}: ${clickErr.message}`);
//         }

//         await delay(5500);
//         console.log(`✅ [${index + 1}] Done with ${url}`);
//     } catch (err) {
//         console.error(`❌ [${index + 1}] Error on ${url}: ${err.message}`);
//     } finally {
//         await browser.close();
//     }
// }

// (async () => {
//     let count = 1;
//     while (true) {
//         const shuffled = urls.sort(() => 0.5 - Math.random());
//         await Promise.all(
//             shuffled.map((url, idx) => simulatePageview(url.trim(), idx))
//         );
//         const wait = randomBetween(100, 2000);
//         console.log(`⏳ Waiting for ${wait / 1000}s before next round... [Cycle ${count++}]`);
//         await delay(wait);
//     }
// })();
