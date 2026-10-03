export type ImageType = 'png' | 'jpeg' | 'gif' | 'webp';

export interface ImageInfo {
  type: ImageType;
  mime: string;
  width: number;
  height: number;
}

const MIME: Record<ImageType, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

export function sniffImage(buf: Buffer): ImageInfo | null {
  if (buf.length < 24) return null;

  if (buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') {
    return { type: 'png', mime: MIME.png, width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }

  if (buf.toString('ascii', 0, 4) === 'GIF8') {
    return { type: 'gif', mime: MIME.gif, width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }

  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buf.toString('ascii', 12, 16);
    if (chunk === 'VP8 ' && buf.length >= 30) {
      return { type: 'webp', mime: MIME.webp, width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    }
    if (chunk === 'VP8L' && buf.length >= 25) {
      const b0 = buf[21]!;
      const b1 = buf[22]!;
      const b2 = buf[23]!;
      const b3 = buf[24]!;
      return {
        type: 'webp',
        mime: MIME.webp,
        width: 1 + (((b1 & 0x3f) << 8) | b0),
        height: 1 + (((b3 & 0xf) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
      };
    }
    if (chunk === 'VP8X' && buf.length >= 30) {
      return { type: 'webp', mime: MIME.webp, width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    }
    return null;
  }

  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buf.length) {
      if (buf[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = buf[offset + 1]!;
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      const length = buf.readUInt16BE(offset + 2);
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) {
        return { type: 'jpeg', mime: MIME.jpeg, height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
      }
      offset += 2 + length;
    }
    return null;
  }

  return null;
}

export const EXTENSION: Record<ImageType, string> = { png: 'png', jpeg: 'jpg', gif: 'gif', webp: 'webp' };
