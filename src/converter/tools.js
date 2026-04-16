/**
 * Convert OpenAI tool definitions to JB parameters.data format
 */
function openaiToolsToJB(tools) {
  if (!tools || tools.length === 0) return [];

  const jbTools = tools
    .filter(t => t.type === 'function')
    .map(t => ({
      name: t.function.name,
      description: t.function.description || '',
      parameters: { schema: t.function.parameters || {} },
    }));

  return [
    { type: 'json', fqdn: 'llm.parameters.tools' },
    { type: 'json', value: JSON.stringify(jbTools) },
  ];
}

/**
 * Convert Anthropic tool definitions to JB parameters.data format
 */
function anthropicToolsToJB(tools) {
  if (!tools || tools.length === 0) return [];

  const jbTools = tools.map(t => ({
    name: t.name,
    description: t.description || '',
    parameters: { schema: t.input_schema || {} },
  }));

  return [
    { type: 'json', fqdn: 'llm.parameters.tools' },
    { type: 'json', value: JSON.stringify(jbTools) },
  ];
}

module.exports = { openaiToolsToJB, anthropicToolsToJB };
