const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
    page.on('pageerror', err => console.error('BROWSER ERROR:', err.toString()));
    
    await page.goto('http://localhost:5174/BubblePrinter/', { waitUntil: 'networkidle0' });

    console.log("Selecting model...");
    await page.select('#demoModelSelector', './models/cube_simple.obj');
    await new Promise(r => setTimeout(r, 1000));

    console.log("Setting arrangement to Poisson...");
    await page.select('#bubbleArrangement', 'poisson');
    await new Promise(r => setTimeout(r, 1000));

    console.log("Setting Lloyd Iterations to 5...");
    // Let's set lloydIterations slider to 5 and trigger input/change
    await page.evaluate(() => {
        const slider = document.getElementById('lloydIterationsSlider');
        slider.value = 5;
        slider.dispatchEvent(new Event('input'));
        slider.dispatchEvent(new Event('change'));
    });
    await new Promise(r => setTimeout(r, 2000));

    console.log("Selecting Shell Gradient size mode...");
    await page.select('#bubbleSizeMode', 'shell_gradient_in');
    await new Promise(r => setTimeout(r, 3000));

    console.log("Selecting Adaptive size mode...");
    await page.select('#bubbleSizeMode', 'adaptive');
    await new Promise(r => setTimeout(r, 3000));
    
    await browser.close();
    console.log("Done.");
})();
