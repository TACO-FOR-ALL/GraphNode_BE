/**
 * @public
 */
export interface MicroscopeDocument {
  id: string;
  s3Key: string;
  fileName: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  sourceId?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * @public
 */
export interface MicroscopeWorkspace {
  _id: string;
  userId: string;
  name: string;
  documents: MicroscopeDocument[];
  createdAt: string;
  updatedAt: string;
}
