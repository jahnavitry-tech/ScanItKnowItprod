import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';

// Function to generate multiple sizes of an image
async function generateSizes(sourcePath, baseName, sizes, outputDir) {
  for (const size of sizes) {
    const outputFileName = `${baseName}-${size}x${size}.png`;
    const outputPath = path.join(outputDir, outputFileName);
    
    try {
      await sharp(sourcePath)
        .resize(size, size)
        .png()
        .toFile(outputPath);
      console.log(`Generated ${outputFileName}`);
    } catch (error) {
      console.error(`Error generating ${outputFileName}:`, error);
    }
  }
}

// Function to generate app title images with correct dimensions (196x40)
async function generateAppTitle(sourcePath, outputFileName, outputDir) {
  const outputPath = path.join(outputDir, outputFileName);
  
  try {
    await sharp(sourcePath)
      .resize(196, 40)
      .png()
      .toFile(outputPath);
    console.log(`Generated ${outputFileName}`);
  } catch (error) {
    console.error(`Error generating ${outputFileName}:`, error);
  }
}

// Main function to update all assets
async function updateAssets() {
  const srcAssetsDir = path.join('client', 'src', 'assets');
  const publicAssetsDir = path.join('client', 'public', 'assets');
  
  // Ensure directories exist
  await fs.mkdir(srcAssetsDir, { recursive: true });
  await fs.mkdir(publicAssetsDir, { recursive: true });
  
  // Define sizes for favicons
  const faviconSizes = [16, 32, 48, 96, 180, 192, 512];
  
  try {
    // 1. Update favicon files from the reference dark and light favicons
    console.log('Updating favicon files...');
    const faviconDarkSource = path.join(srcAssetsDir, 'favicon-96x96-dark.png');
    const faviconLightSource = path.join(srcAssetsDir, 'favicon-96x96-light.png');
    
    // Generate dark favicons
    await generateSizes(faviconDarkSource, 'favicon-dark', faviconSizes, srcAssetsDir);
    await generateSizes(faviconDarkSource, 'favicon-dark', faviconSizes, publicAssetsDir);
    
    // Generate light favicons
    await generateSizes(faviconLightSource, 'favicon-light', faviconSizes, srcAssetsDir);
    await generateSizes(faviconLightSource, 'favicon-light', faviconSizes, publicAssetsDir);
    
    // 2. Update app icon files
    console.log('Updating app icon files...');
    const appIconDarkSource = path.join(srcAssetsDir, 'app-icon-dark.png');
    const appIconLightSource = path.join(srcAssetsDir, 'app-icon-light.png');
    
    // Generate app icons (48x48)
    await generateSizes(appIconDarkSource, 'app-icon-dark', [48], srcAssetsDir);
    await generateSizes(appIconDarkSource, 'app-icon-dark', [48], publicAssetsDir);
    
    await generateSizes(appIconLightSource, 'app-icon-light', [48], srcAssetsDir);
    await generateSizes(appIconLightSource, 'app-icon-light', [48], publicAssetsDir);
    
    // 3. Update app title files
    console.log('Updating app title files...');
    const appTitleDarkSource = path.join(srcAssetsDir, 'app-title-dark.png');
    let appTitleLightSource = path.join(srcAssetsDir, 'app-title-light.png');
    
    // Check if app-title-light.png exists, if not, use app-title.png
    try {
      await fs.access(appTitleLightSource);
    } catch {
      console.log('app-title-light.png not found, using app-title.png instead');
      appTitleLightSource = path.join(srcAssetsDir, 'app-title.png');
    }
    
    // Generate app titles (196x40)
    await generateAppTitle(appTitleDarkSource, 'app-title-dark.png', srcAssetsDir);
    await generateAppTitle(appTitleDarkSource, 'app-title-dark.png', publicAssetsDir);
    
    await generateAppTitle(appTitleLightSource, 'app-title-light.png', srcAssetsDir);
    await generateAppTitle(appTitleLightSource, 'app-title-light.png', publicAssetsDir);
    
    // Also make sure app-title.png exists for compatibility
    await generateAppTitle(appTitleLightSource, 'app-title.png', srcAssetsDir);
    await generateAppTitle(appTitleLightSource, 'app-title.png', publicAssetsDir);
    
    console.log('All assets updated successfully!');
  } catch (error) {
    console.error('Error updating assets:', error);
  }
}

updateAssets();