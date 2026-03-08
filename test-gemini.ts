import { geminiProvider } from './src/shared/ai-providers/gemini';

async function main() {
  const apiKey = 'AIzaSyCJ3SSPu1hCeh__zli50SeIQY1Ywwb9KZE';
  
  console.log('=== 1. API Key Validation Test (@google/genai) ===');
  const validResult = await geminiProvider.checkAPIKeyValid(apiKey);
  console.log('Validation Result:', JSON.stringify(validResult, null, 2));

  if (!validResult.ok) {
    console.error('API Key is invalid. Skipping chat test.');
    return;
  }

  console.log('\n=== 2. Chat Generation Test (Streaming / gemini-3-flash-preview) ===');
  const chatParams = {
    messages: [
      { role: 'user', content: 'Say "Gemini 3 Flash Success!"' }
    ],
    // model: 'gemini-3-flash-preview' // Provider will use default if not provided
  };

  let fullResponse = '';
  const chatResult = await geminiProvider.generateChat(
    apiKey,
    chatParams as any,
    (delta) => {
      process.stdout.write(delta);
      fullResponse += delta;
    }
  );

  console.log('\n\nFinal Chat Result:', JSON.stringify(chatResult, null, 2));

  console.log('\n=== 3. Title Generation Test ===');
  const titleResult = await geminiProvider.requestGenerateThreadTitle(
    apiKey,
    'Explain how to fix a relative import error in Python',
    { language: 'Korean' }
  );
  console.log('Title Result:', JSON.stringify(titleResult, null, 2));
}

main().catch(err => {
    console.error('Test script failed:', err);
});
