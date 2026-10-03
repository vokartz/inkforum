import { UseInterceptors, applyDecorators } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

export const ImageUpload = (maxBytes = 2 * 1024 * 1024) =>
  applyDecorators(
    UseInterceptors(
      FileInterceptor('file', {
        storage: memoryStorage(),
        limits: { fileSize: maxBytes, files: 1, fields: 5 },
      }),
    ),
  );

export interface UploadedImage {
  buffer: Buffer;
  size: number;
  originalname: string;
  mimetype: string;
}
