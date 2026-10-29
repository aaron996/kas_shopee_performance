import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { CHAT_TOOLS, executeChatTool } from '../chat/tools.js';
import { toPublicError } from '../chat/errors.js';

// Only the read-only dashboard/glossary tools are exposed over MCP. The chat-only
// interaction tools (request_metric_query, search_public_information) have no
// meaning outside the chat UI turn loop and are left out on purpose.
const MCP_TOOL_NAMES = new Set([
  'get_metric_trend',
  'get_data_coverage',
  'get_metric_summary',
  'get_latest_metric_summary',
  'get_ca1_summary',
  'get_leadtime_summary',
  'get_metric_definition',
  'get_dashboard_help'
]);

const MCP_TOOLS = CHAT_TOOLS.filter(tool => MCP_TOOL_NAMES.has(tool.name)).map(tool => ({
  name: tool.name,
  description: tool.description,
  inputSchema: tool.parameters
}));

/**
 * Builds a stateless MCP server instance exposing the same validated,
 * scope- and size-limited dashboard reads the AI chatbot uses internally
 * (server/chat/tools.js). One instance is created per request; it carries
 * no session state of its own.
 */
export function createMcpServer({ serviceClient }) {
  const server = new Server(
    { name: 'kas-shopee-performance', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: MCP_TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async request => {
    const { name, arguments: args } = request.params;
    if (!MCP_TOOL_NAMES.has(name)) {
      return { isError: true, content: [{ type: 'text', text: `Tool "${name}" không được phép.` }] };
    }
    try {
      const result = await executeChatTool(
        { name, arguments: args ?? {} },
        { userClient: serviceClient }
      );
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (error) {
      const failure = toPublicError(error);
      return { isError: true, content: [{ type: 'text', text: `${failure.code}: ${failure.message}` }] };
    }
  });

  return server;
}
