export interface FileAttachment {
  id: string;
  type: 'image' | 'file';
  url: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface FileUploadResponse {
  attachments: FileAttachment[];
}
