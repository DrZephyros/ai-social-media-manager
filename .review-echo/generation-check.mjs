const originalFetch = globalThis.fetch;
process.env.TAVILY_API_KEY = 'local-generation-test';
globalThis.fetch = async (url, options) => {
  if (String(url).includes('api.tavily.com/search')) {
    return new Response(JSON.stringify({ results: [
      { title: 'Nature: AI models collapse when trained on recursively generated data', url: 'https://www.nature.com/articles/s41586-024-07566-y', content: 'Training generative models on recursively generated data causes model collapse, where tails of the original data distribution disappear.' },
      { title: ' arXiv: The Curse of Recursion', url: 'https://arxiv.org/abs/2404.01413', content: 'Mixing synthetic data with original real data prevents model collapse in the studied setting.' }
    ] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return originalFetch(url, options);
};
const { generateScript } = await import('../engine.js');
const result = await generateScript('What happens when AI keeps learning from AI-written content?', 'Tech & AI');
console.log(JSON.stringify(result.slides.map(({ slide_number, title, body_text, hook, isDiscussionSlide }) => ({ slide_number, title, body_text, hook, isDiscussionSlide })), null, 2));
