import { describe, expect, it, jest } from '@jest/globals';

import { RequestBuilder, type FetchLike } from '../../z_npm_sdk/src/http-builder';
import { GraphApi } from '../../z_npm_sdk/src/endpoints/graph';
import { GraphEditorApi } from '../../z_npm_sdk/src/endpoints/graphEditor';

function makeFetch() {
  return jest.fn<FetchLike>().mockResolvedValue({
    ok: true,
    status: 204,
    headers: new Headers(),
    text: async () => '',
  } as Response);
}

describe('SDK deleteEdge macroId forwarding', () => {
  it('client.graph.deleteEdge sends macroId in the backend DELETE request', async () => {
    const fetchMock = makeFetch();
    const api = new GraphApi(new RequestBuilder({ baseUrl: 'https://api.test', fetch: fetchMock }));

    await api.deleteEdge('edge-1', { permanent: true, macroId: 'macro-view-1' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test/v1/graph/edges/edge-1?permanent=true&macroId=macro-view-1',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('client.graphEditor.deleteEdge sends macroId in the backend DELETE request', async () => {
    const fetchMock = makeFetch();
    const api = new GraphEditorApi(new RequestBuilder({ baseUrl: 'https://api.test', fetch: fetchMock }));

    await api.deleteEdge('edge-1', { permanent: true, macroId: 'macro-view-1' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test/v1/graph/editor/edges/edge-1?permanent=true&macroId=macro-view-1',
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});
