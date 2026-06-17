const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    page.on('console', msg => {
        const txt = msg.text();
        console.log('BROWSER LOG:', txt);
    });
    page.on('pageerror', err => {
        console.error('BROWSER ERROR:', err.toString());
    });
    
    await page.goto('http://localhost:5174/BubblePrinter/', { waitUntil: 'networkidle0' });

    console.log("Selecting model...");
    await page.select('#demoModelSelector', './models/cube_simple.obj');
    await new Promise(r => setTimeout(r, 1000));

    const arrangements = ['grid', 'oranges', 'hexagons', 'rejection', 'poisson'];
    const sizeModes = ['uniform', 'shell_gradient_in', 'adaptive', 'z_gradient_down', 'z_gradient_up'];

    // Let's run a combination of updates
    for (let i = 0; i < 3; i++) {
        for (const arr of arrangements) {
            for (const sm of sizeModes) {
                console.log(`\n--- Setting Arrangement: ${arr}, Size Mode: ${sm} ---`);
                await page.select('#bubbleArrangement', arr);
                await page.select('#bubbleSizeMode', sm);
                
                // Also simulate changing some slider values
                await page.evaluate(() => {
                    const lloydSlider = document.getElementById('lloydIterationsSlider');
                    if (lloydSlider) {
                        lloydSlider.value = "5";
                        lloydSlider.dispatchEvent(new Event('input'));
                        lloydSlider.dispatchEvent(new Event('change'));
                    }
                    const jitterSlider = document.getElementById('jitterSlider');
                    if (jitterSlider) {
                        jitterSlider.value = "25";
                        jitterSlider.dispatchEvent(new Event('input'));
                        jitterSlider.dispatchEvent(new Event('change'));
                    }
                    const pRadiusSlider = document.getElementById('poissonRadiusSlider');
                    if (pRadiusSlider) {
                        pRadiusSlider.value = "0.3";
                        pRadiusSlider.dispatchEvent(new Event('input'));
                        pRadiusSlider.dispatchEvent(new Event('change'));
                    }
                });

                await new Promise(r => setTimeout(r, 1500));
            }
        }
    }
    
    await browser.close();
    console.log("Done.");
})();
