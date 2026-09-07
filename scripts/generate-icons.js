const fs = require('fs');
const path = require('path');

async function generateIcons() {
  const logoPath = path.join(__dirname, '..', 'assets', 'logo.jpg');
  const pngPath = path.join(__dirname, '..', 'assets', 'icon.png');
  const icoPath = path.join(__dirname, '..', 'assets', 'icon.ico');

  if (!fs.existsSync(logoPath)) {
    console.error('Logo não encontrada em assets/logo.jpg');
    process.exit(1);
  }

  try {
    const sharp = require('sharp');

    await sharp(logoPath)
      .resize(256, 256, { fit: 'cover' })
      .png()
      .toFile(pngPath);

    const sizes = [16, 32, 48, 64, 128, 256];
    const pngBuffers = await Promise.all(
      sizes.map((size) =>
        sharp(logoPath)
          .resize(size, size, { fit: 'cover' })
          .png()
          .toBuffer()
      )
    );

    const ico = buildIco(pngBuffers, sizes);
    fs.writeFileSync(icoPath, ico);

    console.log('Ícones gerados: icon.png e icon.ico');
  } catch (err) {
    console.warn('sharp não disponível, copiando logo como fallback:', err.message);
    fs.copyFileSync(logoPath, pngPath);
  }
}

function buildIco(buffers, sizes) {
  const count = buffers.length;
  const headerSize = 6 + count * 16;
  let offset = headerSize;
  const entries = [];

  for (let i = 0; i < count; i++) {
    entries.push({ size: sizes[i], buffer: buffers[i], offset });
    offset += buffers[i].length;
  }

  const totalSize = offset;
  const result = Buffer.alloc(totalSize);

  result.writeUInt16LE(0, 0);
  result.writeUInt16LE(1, 2);
  result.writeUInt16LE(count, 4);

  let entryOffset = 6;
  for (const entry of entries) {
    result.writeUInt8(entry.size === 256 ? 0 : entry.size, entryOffset);
    result.writeUInt8(entry.size === 256 ? 0 : entry.size, entryOffset + 1);
    result.writeUInt8(0, entryOffset + 2);
    result.writeUInt8(0, entryOffset + 3);
    result.writeUInt16LE(1, entryOffset + 4);
    result.writeUInt16LE(32, entryOffset + 6);
    result.writeUInt32LE(entry.buffer.length, entryOffset + 8);
    result.writeUInt32LE(entry.offset, entryOffset + 12);
    entryOffset += 16;
  }

  for (const entry of entries) {
    entry.buffer.copy(result, entry.offset);
  }

  return result;
}

generateIcons();
