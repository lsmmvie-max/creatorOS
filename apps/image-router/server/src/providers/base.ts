export interface ImageRequest {
  prompt: string;
  width?: number;
  height?: number;
}

export interface ImageResult {
  image_b64: string;
  provider: string;
}

export interface ImageProvider {
  name: string;
  generate(req: ImageRequest): Promise<ImageResult>;
}
