export const DEFAULT_KNOWLEDGE_MANIFEST = {
  version: '2026.03.05-v1',
  embeddingVersion: 'lexical-v1',
  installedAt: new Date('2026-03-05T00:00:00.000Z').toISOString(),
  sources: [
    'https://qwen.readthedocs.io/en/latest/',
    'https://huggingface.co/Qwen/Qwen3.5-9B',
    'https://huggingface.co/datasets/bigcode/the-stack-v2',
    'https://github.com/github/CodeSearchNet',
    'https://arxiv.org/abs/2402.14658',
    'https://github.com/freeCodeCamp/devdocs',
    'https://github.com/princeton-nlp/SWE-bench',
    'https://github.com/bigcode-project/bigcodebench',
    'https://github.com/evalplus/evalplus',
    'https://github.com/openai/human-eval',
    'https://arxiv.org/abs/2403.07974',
  ],
  chunks: [
    {
      id: 'policy-01',
      title: 'Patch-first coding behavior',
      text:
        'Generate patch-style edits, run lint/test, and avoid broad rewrites unless explicitly requested.',
      tags: ['workflow', 'quality', 'patch'],
      citation: 'webide-internal://policy/patch-first',
    },
    {
      id: 'policy-02',
      title: 'Grounding and citation policy',
      text:
        'For non-trivial claims use grounded references and link supporting evidence in timeline citations.',
      tags: ['grounding', 'citation', 'safety'],
      citation: 'webide-internal://policy/grounding',
    },
    {
      id: 'test-01',
      title: 'Repair loop',
      text:
        'When tests fail, inspect failing output, localize faulty changes, patch minimal lines, rerun checks, then summarize.',
      tags: ['testing', 'repair', 'loop'],
      citation: 'webide-internal://playbook/repair-loop',
    },
  ],
} as const
