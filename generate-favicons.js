import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';

// Create favicon images of different sizes from a source image
async function generateFavicons() {
  // Use one of the existing images as source
  const sourceImagePath = path.join('attached_assets', 'image_1756411620395.png');
  
  // Ensure the public assets directory exists
  const publicAssetsDir = path.join('client', 'public', 'assets');
  await fs.mkdir(publicAssetsDir, { recursive: true });
  
  // Define sizes for favicons
  const sizes = [16, 32, 48, 96, 180, 192, 512];
  
  try {
    // Generate favicons of different sizes
    for (const size of sizes) {
      const outputFileName = `favicon-${size}x${size}.png`;
      const outputPath = path.join(publicAssetsDir, outputFileName);
      
      await sharp(sourceImagePath)
        .resize(size, size)
        .png()
        .toFile(outputPath);
        
      console.log(`Generated ${outputFileName}`);
    }
    
    // Also copy the source image to be used as app icons and titles
    const appIconLightPath = path.join(publicAssetsDir, 'app-icon-light.png');
    const appIconDarkPath = path.join(publicAssetsDir, 'app-icon-dark.png');
    const appTitlePath = path.join(publicAssetsDir, 'app-title.png');
    const appTitleDarkPath = path.join(publicAssetsDir, 'app-title-dark.png');
    
    await sharp(sourceImagePath)
      .resize(48, 48)
      .png()
      .toFile(appIconLightPath);
      
    await sharp(sourceImagePath)
      .resize(48, 48)
      .png()
      .toFile(appIconDarkPath);
      
    await sharp(sourceImagePath)
      .resize(196, 40)
      .png()
      .toFile(appTitlePath);
      
    await sharp(sourceImagePath)
      .resize(196, 40)
      .png()
      .toFile(appTitleDarkPath);
      
    console.log('Generated app icons and titles');
    console.log('All favicon files generated successfully!');
  } catch (error) {
    console.error('Error generating favicons:', error);
  }
}

generateFavicons();