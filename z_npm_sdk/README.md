# GraphNode BE SDK

This SDK provides a convenient way to interact with the GraphNode Backend API from a TypeScript/JavaScript client.

## Installation

```bash
npm install @taco_tsinghua/graphnode-sdk
```

## Getting Started

### Initialization

Create a client instance. The base URL is automatically configured to point to the GraphNode backend.

```typescript
import { createGraphNodeClient } from '@taco_tsinghua/graphnode-sdk';

// No need to pass baseUrl, it defaults to the internal constant
const client = createGraphNodeClient();
```

If you need to pass custom fetch options (e.g., for testing or specific environments):

```typescript
const client = createGraphNodeClient({
  // fetch: customFetch
});
```

### API Usage Examples

The client is organized by API resources.

#### Health

Check the health of the API server.

```typescript
const health = await client.health.check();
console.log(health); // { ok: true }
```

#### Me (User Profile)

Get the profile of the currently authenticated user.

```typescript
try {
  const me = await client.me.getProfile();
  console.log(me); // { id: '...', displayName: '...' }
} catch (error) {
  console.error('Not authenticated');
}
```

#### Conversations

**Create a single conversation:**

```typescript
const newConversation = await client.conversations.create({
  id: 'client-generated-uuid-1',
  title: 'My First Conversation',
});
console.log(newConversation);
```

**Bulk create multiple conversations:**

```typescript
const response = await client.conversations.bulkCreate({
  conversations: [
    { id: 'bulk-uuid-1', title: 'Bulk Conversation 1' },
    { 
      id: 'bulk-uuid-2', 
      title: 'Bulk Conversation 2 with messages',
      messages: [{ id: 'msg-uuid-1', role: 'user', content: 'Hello!' }]
    }
  ]
});
console.log(response.conversations); // Array of created conversations
```

**List all conversations:**

```typescript
const conversations = await client.conversations.list();
console.log(conversations);
```

**Get a specific conversation:**

```typescript
const conversation = await client.conversations.get('conversation-id-123');
console.log(conversation);
```

#### Messages

Create a message within a conversation:

```typescript
const newMessage = await client.conversations.createMessage('conversation-id-123', {
  id: 'message-uuid-456',
  role: 'user',
  content: 'Hello, this is a new message.',
});
console.log(newMessage);
```

#### Graph

**Nodes:**

```typescript
// Create a node
const node = await client.graph.createNode({
  id: 1,
  label: 'My Node',
  type: 'concept',
  properties: { color: 'red' }
});

// List nodes
const nodes = await client.graph.listNodes();

// Get node
const myNode = await client.graph.getNode(1);

// Update node
await client.graph.updateNode(1, { label: 'Updated Node' });

// Delete node
await client.graph.deleteNode(1);

// Delete node cascade (with edges)
await client.graph.deleteNodeCascade(1);
```

**Edges:**

```typescript
// Create an edge
const edge = await client.graph.createEdge({
  source: 1,
  target: 2,
  relationship: 'related_to'
});

// List edges
const edges = await client.graph.listEdges();

// Delete edge
await client.graph.deleteEdge('edge-id');
```

**Clusters:**

```typescript
// Create cluster
const cluster = await client.graph.createCluster({
  name: 'My Cluster',
  nodeIds: [1, 2]
});

// List clusters
const clusters = await client.graph.listClusters();

// Get cluster
const myCluster = await client.graph.getCluster('cluster-id');

// Delete cluster
await client.graph.deleteCluster('cluster-id');

// Delete cluster cascade
await client.graph.deleteClusterCascade('cluster-id');
```

**Stats & Snapshot:**

```typescript
// Get stats
const stats = await client.graph.getStats();

// Get snapshot
const snapshot = await client.graph.getSnapshot();

// Save snapshot
await client.graph.saveSnapshot(snapshot);
```

#### Notes & Folders

**Notes:**

```typescript
// Create a note
const note = await client.note.createNote({
  title: 'My Note',
  content: '# Hello World',
  folderId: null // Optional
});

// List notes
const notes = await client.note.listNotes();

// Get note
const myNote = await client.note.getNote('note-id');

// Update note
const updatedNote = await client.note.updateNote('note-id', {
  content: '# Updated Content'
});

// Delete note
await client.note.deleteNote('note-id');
```

**Folders:**

```typescript
// Create a folder
const folder = await client.note.createFolder({
  name: 'My Folder',
  parentId: null // Optional
});

// List folders
const folders = await client.note.listFolders();

// Get folder
const myFolder = await client.note.getFolder('folder-id');

// Update folder
const updatedFolder = await client.note.updateFolder('folder-id', {
  name: 'Updated Folder Name'
});

// Delete folder
await client.note.deleteFolder('folder-id');
```

### Error Handling

The SDK uses a custom `HttpError` for API-related errors. You can check the `problem` property for RFC 9457 Problem Details.

```typescript
import { HttpError } from '@taco_tsinghua/graphnode-sdk';

try {
  await client.conversations.get('non-existent-id');
} catch (error) {
  if (error instanceof HttpError) {
    console.error('API Error:', error.problem.title);
    console.error('Status:', error.problem.status);
    console.error('Detail:', error.problem.detail);
  } else {
    console.error('Unknown error:', error);
  }
}
```
