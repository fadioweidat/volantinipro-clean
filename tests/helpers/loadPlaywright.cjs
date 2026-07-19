const fs = require('node:fs');

function loadPlaywright() {
  try {
    return require('playwright');
  } catch (projectError) {
    const moduleRoot = process.env.PLAYWRIGHT_MODULE_PATH;
    if (moduleRoot) {
      try {
        const resolved = require.resolve('playwright', { paths: [moduleRoot] });
        return require(resolved);
      } catch (environmentError) {
        throw new Error(`PLAYWRIGHT_MODULE_PATH non contiene un modulo Playwright risolvibile: ${environmentError.message}`);
      }
    }
    throw new Error('Playwright non è risolvibile dal progetto. Installa la dipendenza del progetto oppure imposta PLAYWRIGHT_MODULE_PATH verso un node_modules esistente.');
  }
}

function browserLaunchOptions() {
  const executablePath = process.env.STEP2_BROWSER_EXECUTABLE;
  if (!executablePath) return { headless: true };
  if (!fs.existsSync(executablePath)) throw new Error(`STEP2_BROWSER_EXECUTABLE non esiste: ${executablePath}`);
  return { executablePath, headless: true };
}

module.exports = { browserLaunchOptions, loadPlaywright };
