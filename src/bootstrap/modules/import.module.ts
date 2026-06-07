import type { Router } from 'express';

import { createImportRouter } from '../../app/routes/ImportRouter';
import { container } from '../container';

export function makeImportRouter(): Router {
  return createImportRouter({
    importArchiveService: container.getImportArchiveService(),
  });
}
