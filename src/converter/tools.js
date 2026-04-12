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

/**
 * Build JB parameters.data array - only tools, no other params
 * JB API doesn't accept temperature/top_p/max_tokens in parameters.data
 */
function buildParametersData(toolsData) {
  return [...toolsData];
}

module.exports = { openaiToolsToJB, anthropicToolsToJB, buildParametersData };
