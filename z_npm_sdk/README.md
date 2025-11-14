# GraphNode BE SDK

This SDK provides a convenient way to interact with the GraphNode Backend API from a TypeScript/JavaScript client.

## Installation

```bash
npm install <path-to-sdk-package>
```

## Getting Started

### Initialization

First, create a client instance. You need to provide the base URL of the API server.

```typescript
import { createGraphNodeClient } from 'graphnode-sdk';

const client = createGraphNodeClient({
  baseUrl: 'http://localhost:3000',
});
```

If your API requires authentication, you can set the session token after initialization.

```typescript
client.setSessionToken('your-session-token-here');
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

### Error Handling

The SDK uses a custom `HttpError` for API-related errors. You can check the `problem` property for RFC 9457 Problem Details.

```typescript
import { HttpError } from 'graphnode-sdk';

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
