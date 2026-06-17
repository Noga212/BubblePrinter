const puppeteer = require('puppeteer');

const demoModels = [
    "./models/cube_simple.obj", 
    "./models/sphere_smooth.obj",
    "./models/cylinder.obj",
    "./models/cone_smooth.obj",
    "./models/pyramid.obj",
    "./models/octahedron.obj",
    "./models/tetrahedron.obj",
    "./models/torus_complex.obj"
];

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    page.on('console', msg => {
        const txt = msg.text();
        if (txt.includes('error') || txt.includes('Error') || txt.includes('Exception') || txt.includes('warn') || txt.includes('produced') || txt.includes('Mode:')) {
            console.log('BROWSER LOG:', txt);
        }
    });
    page.on('pageerror', err => console.error('BROWSER ERROR:', err.toString()));
    
    await page.goto('http://localhost:5174/BubblePrinter/', { waitUntil: 'networkidle0' });

    for (const model of demoModels) {
        console.log(`\n================ Testing model: ${model} ================`);
        await page.select('#demoModelSelector', model);
        await new Promise(r => setTimeout(r, 1000));

        console.log("-> Sizing mode: shell_gradient_in");
        await page.select('#bubbleSizeMode', 'shell_gradient_in');
        // Wait for generation to finish. We can check by checking if a loader or canvas updates,
        // or just wait enough time since it blocks main thread. Let's wait 3 seconds.
        await new Promise(r => setTimeout(r, 3000));

        console.log("-> Sizing mode: adaptive");
        await page.select('#bubbleSizeMode', 'adaptive');
        await new Promise(r => setTimeout(r, 3000));
    }
    
    await browser.close();
    console.log("Done.");
})();
