const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    page.on('console', msg => {
        const txt = msg.text();
        if (txt.includes('produced') || txt.includes('Merged') || txt.includes('Mode:')) {
            console.log('BROWSER:', txt);
        }
    });
    page.on('pageerror', err => console.error('BROWSER ERROR:', err.toString()));
    
    await page.goto('http://localhost:5174/BubblePrinter/', { waitUntil: 'networkidle0' });

    console.log("Selecting model...");
    await page.select('#demoModelSelector', './models/cube_simple.obj');
    await new Promise(r => setTimeout(r, 1000));

    // 1. Set arrangement to poisson
    console.log("\n1. Setting arrangement to poisson, size mode to uniform");
    await page.select('#bubbleArrangement', 'poisson');
    await page.select('#bubbleSizeMode', 'uniform');
    await new Promise(r => setTimeout(r, 1000));

    // 2. Change size slider value
    console.log("\n2. Changing size slider to 0.8");
    await page.evaluate(() => {
        const slider = document.getElementById('bubbleSizeSlider');
        if (slider) {
            slider.value = "0.8";
            slider.dispatchEvent(new Event('input'));
            slider.dispatchEvent(new Event('change'));
        }
    });
    await new Promise(r => setTimeout(r, 1000));

    // 3. Switch arrangement to grid
    console.log("\n3. Setting arrangement to grid");
    await page.select('#bubbleArrangement', 'grid');
    await new Promise(r => setTimeout(r, 1000));

    // 4. Set arrangement to rejection (Random)
    console.log("\n4. Setting arrangement to rejection (Random)");
    await page.select('#bubbleArrangement', 'rejection');
    await new Promise(r => setTimeout(r, 1000));

    // 5. Change size mode to shell_gradient_in
    console.log("\n5. Changing size mode to shell_gradient_in");
    await page.select('#bubbleSizeMode', 'shell_gradient_in');
    await new Promise(r => setTimeout(r, 1000));

    // 6. Switch arrangement to grid
    console.log("\n6. Setting arrangement to grid (under shell_gradient_in)");
    await page.select('#bubbleArrangement', 'grid');
    await new Promise(r => setTimeout(r, 1000));

    // 7. Switch arrangement to hexagons
    console.log("\n7. Setting arrangement to hexagons (under shell_gradient_in)");
    await page.select('#bubbleArrangement', 'hexagons');
    await new Promise(r => setTimeout(r, 1000));

    await browser.close();
    console.log("Done.");
})();
