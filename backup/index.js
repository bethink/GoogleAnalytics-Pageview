require('dotenv').config();
const { chromium } = require('playwright');

const rawUrls = process.env.URLS || '';
const urls = rawUrls.split(',').map((u) => u.trim()).filter(Boolean);

if (urls.length === 0) {
  console.error('❌ No URLs found in .env file under URLS key.');
  process.exit(1);
}

const delay = (ms) => new Promise((res) => setTimeout(res, ms));
const randomBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// const simulatePageview = async (url, index) => {
//   try {
//     const browser = await chromium.launch({ headless: true });
//     const context = await browser.newContext({
//       userAgent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/${Math.floor(
//         Math.random() * 100 + 500
//       )}.36 (KHTML, like Gecko) Chrome/112.0.${Math.floor(Math.random() * 100)}.0 Safari/537.36`,
//     });

//     const page = await context.newPage();

//     console.log(`🔗 [${index + 1}] Visiting ${url}`);
//     await page.goto(url, { waitUntil: 'load', timeout: 15000 });

//     await delay(5500); // Stay on the page for 5.5 seconds

//     await browser.close();
//     console.log(`✅ [${index + 1}] Done with ${url}`);
//   } catch (err) {
//     console.error(`❌ [${index + 1}] Error on ${url}: ${err.message}`);
//   }
// };

const startInfiniteLoop = async () => {
  let cycle = 1;

  while (true) {
    console.log(`\n🌐 Cycle #${cycle} started...`);
    const promises = urls.map((url, index) => simulatePageview(url, index));
    await Promise.all(promises);

    const wait = randomBetween(3000, 10000);
    console.log(`⏳ Waiting ${wait / 1000}s before next round...`);
    await delay(wait);

    cycle++;
  }
};

const simulatePageview = async (url, index) => {
    try {
      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        userAgent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/${Math.floor(
          Math.random() * 100 + 500
        )}.36 (KHTML, like Gecko) Chrome/112.0.${Math.floor(Math.random() * 100)}.0 Safari/537.36`,
      });
  
      const page = await context.newPage();
  
      console.log(`🔗 [${index + 1}] Visiting ${url}`);
      await page.goto(url, { waitUntil: 'load', timeout: 15000 });
  
      // Step 1: Scroll to the bottom of the page
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          let totalHeight = 0;
          const distance = 100;
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;
  
            if (totalHeight >= scrollHeight) {
              clearInterval(timer);
              resolve();
            }
          }, 100);
        });
      });
  
      console.log(`📜 [${index + 1}] Scrolled to bottom of ${url}`);
  
      // Step 2: Wait for 5.5 seconds
      await delay(5100);
  
      // Step 3: Close the browser
      await browser.close();
      console.log(`✅ [${index + 1}] Closed ${url}`);
    } catch (err) {
      console.error(`❌ [${index + 1}] Error on ${url}: ${err.message}`);
    }
  };  

startInfiniteLoop();
