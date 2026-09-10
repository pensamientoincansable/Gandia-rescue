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
    if (header.depth !== 8 && header.depth !== 16) {
      throw new Error(`${path}: profundidad ${header.depth} bits no soportada`);
    }
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

  // Los PNG de 16 bits almacenan cada canal en 2 bytes (big endian): se avanza
  // de 2 en 2 y se conserva el byte alto, que ya representa 8 bits de precisión.
  const step = bitDepth === 16 ? 2 : 1;
  const bytesPerPixel = sourceChannels * step;
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
  // Los PNG de 16 bits se reducen tomando el byte alto de cada canal.
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
      rgba[i * 4 + 3] = pixels[p + step];
    } else if (header.colorType === 3) {
      const index = pixels[p] * 3;
      rgba[i * 4] = palette[index];
      rgba[i * 4 + 1] = palette[index + 1];
      rgba[i * 4 + 2] = palette[index + 2];
      rgba[i * 4 + 3] = 255;
    } else {
      rgba[i * 4] = pixels[p];
      rgba[i * 4 + 1] = pixels[p + step];
      rgba[i * 4 + 2] = pixels[p + step * 2];
      rgba[i * 4 + 3] = sourceChannels === 4 ? pixels[p + step * 3] : 255;
    }
  }

  return { width: header.width, height: header.height, data: rgba, channels: 4 };
}

/**
 * Recorta una región rectangular de un buffer RGBA (para rebanar el cruz
 * horizontal de los cubemaps en sus 6 caras).
 * @param {{width:number,height:number,data:Uint8Array}} image
 * @param {number} x Píxel de origen (esquina superior izquierda).
 * @param {number} y Píxel de origen (esquina superior izquierda).
 * @param {number} width Ancho de la región.
 * @param {number} height Alto de la región.
 */
export function cropRegion(image, x, y, width, height) {
  const out = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const source = ((y + row) * image.width + x) * 4;
    out.set(image.data.subarray(source, source + width * 4), row * width * 4);
  }
  return { width, height, data: out, channels: 4 };
}

/**
 * Redimensiona un buffer RGBA a un ancho y alto arbitrarios con filtro de caja
 * (media de área). Es lento pero sin dependencias y suficiente para bajar de
 * 2048×1024 a 512-1024 px o de una cara de 512² a 256².
 * @param {{width:number,height:number,data:Uint8Array}} image
 * @param {number} width Ancho de destino.
 * @param {number} height Alto de destino.
 */
export function resizeImage(image, width, height) {
  if (image.width === width && image.height === height) return image;
  const out = new Uint8Array(width * height * 4);
  const scaleX = image.width / width;
  const scaleY = image.height / height;

  for (let y = 0; y < height; y += 1) {
    const y0 = Math.floor(y * scaleY);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * scaleY));
    for (let x = 0; x < width; x += 1) {
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

      const o = (y * width + x) * 4;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
      out[o + 3] = Math.round(a / n);
    }
  }

  return { width, height, data: out, channels: 4 };
}

/**
 * Redimensiona un buffer RGBA con filtro de caja (media de área). Es lento pero
 * sin dependencias y suficiente para bajar de 512² a 128-256².
 * @param {{width:number,height:number,data:Uint8Array}} image
 * @param {number} size Ancho y alto de destino (se fuerzan imágenes cuadradas).
 */
export function resizeSquare(image, size) {
  return resizeImage(image, size, size);
}

/**
 * Codifica un buffer RGBA como PNG. Si todos los píxeles son opacos se guarda
 * como RGB (colorType 2), que pesa bastante menos; en caso contrario se usa
 * RGBA (colorType 6).
 *
 * Cada fila se comprime con el filtro estándar (None/Sub/Up/Average/Paeth) que
 * menor suma absoluta produzca —filtrado adaptativo—: en imágenes fotográficas
 * como los cielos reduce el peso un 30-45 % frente al filtro fijo None.
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
  const stride = width * channels;      // bytes por fila en la salida
  const sourceStride = width * 4;       // `data` siempre es RGBA
  const bytesPerPixel = channels;

  const filteredRows = [];
  const packedRows = []; // filas originales empaquetadas: la referencia (b, c)
  // de los filtros Up/Average/Paeth es la fila SIN filtrar, no la codificada.
  for (let y = 0; y < height; y += 1) {
    // Se desentrelaza la fila RGBA al formato de salida (RGB descarta el alfa).
    const source = data.subarray(y * sourceStride, (y + 1) * sourceStride);
    const packed = Buffer.alloc(stride);
    if (opaque) {
      for (let x = 0; x < width; x += 1) {
        packed[x * 3] = source[x * 4];
        packed[x * 3 + 1] = source[x * 4 + 1];
        packed[x * 3 + 2] = source[x * 4 + 2];
      }
    } else {
      packed.set(source);
    }
    packedRows.push(packed);
    const previous = y > 0 ? packedRows[y - 1] : null;
    let best = null;
    let bestScore = Infinity;
    let bestFilter = 0;
    for (let filter = 0; filter <= 4; filter += 1) {
      const candidate = Buffer.alloc(stride);
      let score = 0;
      for (let x = 0; x < stride; x += 1) {
        const a = x >= bytesPerPixel ? packed[x - bytesPerPixel] : 0;
        const b = previous ? previous[x] : 0;
        const c = previous && x >= bytesPerPixel ? previous[x - bytesPerPixel] : 0;
        let value = packed[x];
        if (filter === 1) value -= a;
        else if (filter === 2) value -= b;
        else if (filter === 3) value -= (a + b) >> 1;
        else if (filter === 4) {
          const pa = Math.abs(b - c);
          const pb = Math.abs(a - c);
          const pc = Math.abs(a + b - 2 * c);
          value -= pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        }
        candidate[x] = value & 0xff;
        const normalized = value & 0xff;
        score += Math.min(normalized, 256 - normalized);
      }
      if (score < bestScore) {
        bestScore = score;
        best = candidate;
        bestFilter = filter;
      }
    }
    const line = Buffer.alloc(stride + 1);
    line[0] = bestFilter;
    best.copy(line, 1);
    filteredRows.push(line);
  }

  const raw = Buffer.concat(filteredRows);

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
 * Lee un PNG de `media/`, lo reescala y lo codifica. Devuelve el buffer PNG
 * final para poder informar del ahorro.
 *
 * @param {string} from Ruta de origen.
 * @param {number|[number, number]} size Destino: un número (cuadrada) o un
 *   par [ancho, alto] para imágenes no cuadradas (panoramas).
 * @returns {Buffer}
 */
export function adaptPng(from, to, size) {
  const decoded = decodePng(from);
  const [width, height] = Array.isArray(size) ? size : [size, size];
  const resized = resizeImage(decoded, width, height);
  const buffer = encodePng(resized);
  return buffer;
}
