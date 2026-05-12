const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
    page.on('pageerror', err => console.log('BROWSER ERROR:', err.toString()));
    
    await page.goto('http://localhost:5174/BubblePrinter/', { waitUntil: 'networkidle0' });

    console.log("Selecting model...");
    await page.select('#demoModelSelector', './models/cube_simple.obj');
    
    // Wait a bit to let it process
    await new Promise(r => setTimeout(r, 2000));
    
    await browser.close();
})();
