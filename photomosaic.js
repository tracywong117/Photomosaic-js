function findNearestMultipleOf12(n) {
    const lowerMultiple = 12 * Math.floor(n / 12);
    const higherMultiple = 12 * Math.ceil(n / 12);
    
    // Compare which multiple is closer
    if (Math.abs(lowerMultiple - n) <= Math.abs(higherMultiple - n)) {
        return lowerMultiple;
    } else {
        return higherMultiple;
    }
}

document.getElementById('upload').addEventListener('change', async function(event) {
    const file = event.target.files[0];
    const reader = new FileReader();
    reader.onload = async function(e) {
        const img = new Image();
        img.onload = async function() {
            const numTiles = 466; // Number of tile images
            const tiles = await loadTileImages(numTiles);

            // Prepare canvas
            const canvas = document.getElementById('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);

            // Get image data from canvas
            const imageData = ctx.getImageData(0, 0, img.width, img.height);
            
            // Resize the width and height of image data to nearest 12 multipler
            const resizedImageData = bilinearInterpolation(imageData, findNearestMultipleOf12(img.width), findNearestMultipleOf12(img.height));

            // Create photomosaic
            const mosaic = await createPhotoMosaic(resizedImageData, tiles, ctx);

            // Draw the mosaic to the canvas
            ctx.putImageData(mosaic, 0, 0);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
});

function bilinearInterpolation(srcImageData, newWidth, newHeight) {
    const srcWidth = srcImageData.width;
    const srcHeight = srcImageData.height;
    const srcData = srcImageData.data;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = newWidth;
    canvas.height = newHeight;

    const resizedImageData = ctx.createImageData(newWidth, newHeight);
    const resizedData = resizedImageData.data;

    for (let y = 0; y < newHeight; y++) {
        for (let x = 0; x < newWidth; x++) {
            const srcX = (x / newWidth) * srcWidth;
            const srcY = (y / newHeight) * srcHeight;

            const xFloor = Math.floor(srcX);
            const xCeil = Math.min(srcWidth - 1, xFloor + 1);
            const yFloor = Math.floor(srcY);
            const yCeil = Math.min(srcHeight - 1, yFloor + 1);

            const pixels = [];
            pixels.push(getPixel(srcData, srcWidth, xFloor, yFloor));
            pixels.push(getPixel(srcData, srcWidth, xCeil, yFloor));
            pixels.push(getPixel(srcData, srcWidth, xFloor, yCeil));
            pixels.push(getPixel(srcData, srcWidth, xCeil, yCeil));

            const xWeight = srcX - xFloor;
            const yWeight = srcY - yFloor;

            const interpolatedPixel = interpolatePixels(pixels, xWeight, yWeight);
            const destIndex = (y * newWidth + x) * 4;
            resizedData[destIndex] = interpolatedPixel[0];
            resizedData[destIndex + 1] = interpolatedPixel[1];
            resizedData[destIndex + 2] = interpolatedPixel[2];
            resizedData[destIndex + 3] = 255; // Alpha channel
        }
    }

    return resizedImageData;
}

function getPixel(data, width, x, y) {
    const index = (y * width + x) * 4;
    return [data[index], data[index + 1], data[index + 2], data[index + 3]];
}

function interpolatePixels(pixels, xWeight, yWeight) {
    const r = interpolate(pixels[0][0],pixels[1][0], pixels[2][0], pixels[3][0], xWeight, yWeight);
    const g = interpolate(pixels[0][1], pixels[1][1], pixels[2][1], pixels[3][1], xWeight, yWeight);
    const b = interpolate(pixels[0][2], pixels[1][2], pixels[2][2], pixels[3][2], xWeight, yWeight);
    return [r, g, b];
}

function interpolate(topLeft, topRight, bottomLeft, bottomRight, xWeight, yWeight) {
    const top = topLeft * (1 - xWeight) + topRight * xWeight;
    const bottom = bottomLeft * (1 - xWeight) + bottomRight * xWeight;
    return top * (1 - yWeight) + bottom * yWeight;
}


function loadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load image at ${url}`));
        img.src = url;
    });
}

async function loadTileImages(numTiles) {
    let tiles = [];
    for (let i = 0; i < numTiles; i++) {
        tiles.push(loadImage(`photo_tiles/${i}.bmp`));
    }
    const images = await Promise.all(tiles);
    // resize all the images to 12x12 using bilinear interpolation
    return images.map(img => ({
        // img: bilinearInterpolation(img, 12, 12),
        img: img,
        avgColor: getAverageColorFromTile(img)
    }));
}

function getAverageColorFromTile(tile) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = tile.width;
    canvas.height = tile.height;
    ctx.drawImage(tile, 0, 0);
    const imageData = ctx.getImageData(0, 0, tile.width, tile.height);
    return getAverageColor(imageData);
}

function getAverageColor(imageData) {
    const data = imageData.data;
    let r = 0, g = 0, b = 0, count = 0;

    for (let i = 0; i < data.length; i += 4) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        count++;
    }

    return {
        r: r / count,
        g: g / count,
        b: b / count
    };
}

function findClosestTile(color, tiles) {
    let minDistance = Infinity;
    let closestTile = null;

    for (const tile of tiles) {
        const distance = colorDistance(color, tile.avgColor);
        if (distance < minDistance) {
            minDistance = distance;
            closestTile = tile.img;
        }
    }

    return closestTile;
}

function colorDistance(color1, color2) {
    let rDiff = color1.r - color2.r;
    let gDiff = color1.g - color2.g;
    let bDiff = color1.b - color2.b;
    return Math.sqrt(rDiff * rDiff + gDiff * gDiff + bDiff * bDiff);
}

async function createPhotoMosaic(imageData, tiles, ctx) {
    const tileWidth = 12; // Set based on your tile dimensions
    const tileHeight = 12; // Set based on your tile dimensions
    const numTilesX = Math.floor(imageData.width / tileWidth);
    const numTilesY = Math.floor(imageData.height / tileHeight);

    for (let y = 0; y < numTilesY; y++) {
        for (let x = 0; x < numTilesX; x++) {
            // Get the average color of the section
            const sectionData = ctx.getImageData(x * tileWidth, y * tileHeight, tileWidth, tileHeight);
            const avgColor = getAverageColor(sectionData);

            // Find the closest tile
            const closestTile = findClosestTile(avgColor, tiles);

            // Draw the tile
            ctx.drawImage(closestTile, x * tileWidth, y * tileHeight, tileWidth, tileHeight);
        }
    }

    return ctx.getImageData(0, 0, imageData.width, imageData.height);
}
