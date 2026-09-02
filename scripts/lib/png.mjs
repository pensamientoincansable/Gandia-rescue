/**
 * Utilidades PNG mínimas (decodificar, redimensionar y volver a codificar)
 * escritas sin dependencias externas para poder **adaptar** las imágenes de
 * `media/` al peso y resolución que necesita la web.
 *
 * Sólo soporta lo que entrega el material original: PNG de 8 bits en escala de
 * grises, RGB o RGBA, con filtros estándar (0-4) y sin entrelazado. Es más que
 * suficiente para el atlas de vegetación y los mapas de terreno del proyecto.
 */
import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';

/** Tabla de canales por tipo de color PNG. */
const CHANNELS_BY_COLOR_TYPE = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/** CRC32 (tabla precalculada) necesario para escribir chunks PNG. */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

/**
 * Decodifica un PNG en un buffer RGBA plano.
 * @param {string} path
 * @returns {{width:number, height:number, data:Uint8Array, channels:number}}
 */
export function decodePng(path) {
  const file = readFileSync(path);
  if (file.readUInt32BE(0) !== 0x89504e47) throw new Error(`${path}: no es un PNG válido`);

  let offset = 8;
  let header = null;
  const idat = [];
  let palette = null;
  let bitDepth = 8;

  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.toString('ascii', offset + 4, offset + 8);
    const body = file.subarray(offset + 8, offset + 8 + length);

    if (type === 'IHDR') {
      header = {
        width: body.readUInt32BE(0),
        height: body.readUInt32BE(4),
        depth: body[8],
        colorType: body[9],
        interlace: body[12],
      };
      bitDepth = header.depth;
      if (header.interlace !== 0) throw new Error(`${path}: PNG entrelazado no soportado`);
      if (header.depth !== 8) throw new Error(`${path}: profundidad ${header.depth} bits no soportada`);
    } else if (type === 'PLTE') {
      palette = body;
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }

  if (!header) throw new Error(`${path}: falta IHDR`);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const sourceChannels = CHANNELS_BY_COLOR_TYPE[header.colorType];
  if (!sourceChannels) throw new Error(`${path}: tipo de color ${header.colorType} no soportado`);
  if (header.colorType === 3 && !palette) throw new Error(`${path}: paleta ausente`);

  const bytesPerPixel = sourceChannels;
  const stride = header.width * bytesPerPixel;
  const pixels = Buffer.alloc(header.height * stride);
  let previous = Buffer.alloc(stride);
  let cursor = 0;

  for (let y = 0; y < header.height; y += 1) {
    const filter = raw[cursor];
    cursor += 1;
    const line = raw.subarray(cursor, cursor + stride);
    cursor += stride;
    const current = Buffer.alloc(stride);

    for (let x = 0; x < stride; x += 1) {
      const a = x >= bytesPerPixel ? current[x - bytesPerPixel] : 0;
      const b = previous[x];
      const c = x >= bytesPerPixel ? previous[x - bytesPerPixel] : 0;
      let value = line[x];

      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      current[x] = value & 0xff;
    }

    current.copy(pixels, y * stride);
    previous = current;
  }

  // Normalizamos siempre a RGBA de 8 bits para simplificar el resto del proceso.
  const rgba = new Uint8Array(header.width * header.height * 4);
  for (let i = 0, p = 0; i < header.width * header.height; i += 1, p += bytesPerPixel) {
    if (header.colorType === 0) {
      rgba[i * 4] = pixels[p];
      rgba[i * 4 + 1] = pixels[p];
      rgba[i * 4 + 2] = pixels[p];
      rgba[i * 4 + 3] = 255;
    } else if (header.colorType === 4) {
      rgba[i * 4] = pixels[p];
      rgba[i * 4 + 1] = pixels[p];
      rgba[i * 4 + 2] = pixels[p];
      rgba[i * 4 + 3] = pixels[p + 1];
    } else if (header.colorType === 3) {
      const index = pixels[p] * 3;
      rgba[i * 4] = palette[index];
      rgba[i * 4 + 1] = palette[index + 1];
      rgba[i * 4 + 2] = palette[index + 2];
      rgba[i * 4 + 3] = 255;
    } else {
      rgba[i * 4] = pixels[p];
      rgba[i * 4 + 1] = pixels[p + 1];
      rgba[i * 4 + 2] = pixels[p + 2];
      rgba[i * 4 + 3] = sourceChannels === 4 ? pixels[p + 3] : 255;
    }
  }

  return { width: header.width, height: header.height, data: rgba, channels: 4 };
}

/**
 * Redimensiona un buffer RGBA con filtro de caja (media de área). Es lento pero
 * sin dependencias y suficiente para bajar de 512² a 128-256².
 * @param {{width:number,height:number,data:Uint8Array}} image
 * @param {number} size Ancho y alto de destino (se fuerzan imágenes cuadradas).
 */
export function resizeSquare(image, size) {
  if (image.width === size && image.height === size) return image;
  const out = new Uint8Array(size * size * 4);
  const scaleX = image.width / size;
  const scaleY = image.height / size;

  for (let y = 0; y < size; y += 1) {
    const y0 = Math.floor(y * scaleY);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * scaleY));
    for (let x = 0; x < size; x += 1) {
      const x0 = Math.floor(x * scaleX);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * scaleX));

      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let sy = y0; sy < y1; sy += 1) {
        for (let sx = x0; sx < x1; sx += 1) {
          const i = (sy * image.width + sx) * 4;
          r += image.data[i];
          g += image.data[i + 1];
          b += image.data[i + 2];
          a += image.data[i + 3];
          n += 1;
        }
      }

      const o = (y * size + x) * 4;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
      out[o + 3] = Math.round(a / n);
    }
  }

  return { width: size, height: size, data: out, channels: 4 };
}

/**
 * Codifica un buffer RGBA como PNG. Si todos los píxeles son opacos se guarda
 * como RGB (colorType 2), que pesa bastante menos; en caso contrario se usa
 * RGBA (colorType 6).
 *
 * @param {{width:number,height:number,data:Uint8Array}} image
 * @returns {Buffer}
 */
export function encodePng(image) {
  const { width, height, data } = image;
  let opaque = true;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 255) { opaque = false; break; }
  }
  const channels = opaque ? 3 : 4;
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filtro None
    for (let x = 0; x < width; x += 1) {
      const s = (y * width + x) * 4;
      const d = rowStart + 1 + x * channels;
      raw[d] = data[s];
      raw[d + 1] = data[s + 1];
      raw[d + 2] = data[s + 2];
      if (!opaque) raw[d + 3] = data[s + 3];
    }
  }

  const chunk = (type, body) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(body.length, 0);
    const typeAndBody = Buffer.concat([Buffer.from(type, 'ascii'), body]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typeAndBody), 0);
    return Buffer.concat([length, typeAndBody, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = opaque ? 2 : 6; // color type
  ihdr[10] = 0; // compresión
  ihdr[11] = 0; // filtro
  ihdr[12] = 0; // entrelazado

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Lee un PNG de `media/`, lo reescala a `size` y lo escribe en `destination`.
 * Devuelve el tamaño final en bytes para poder informar del ahorro.
 */
export function adaptPng(from, to, size) {
  const decoded = decodePng(from);
  const resized = resizeSquare(decoded, size);
  const buffer = encodePng(resized);
  return buffer;
}
