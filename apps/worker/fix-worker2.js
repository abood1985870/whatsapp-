const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'src', 'processors');

function fix(file) {
  let content = fs.readFileSync(path.join(dir, file), 'utf8');

  if (file === 'ai-response.processor.ts') {
    content = content.replace(/content:/g, 'text:');
    // For AiRunCreateInput
    content = content.replace(/agentId:\s*agent\.id,\s*conversationId/g, 'agentId: agent.id, organizationId: conversation.organizationId, conversationId');
    content = content.replace(/agentId:\s*agent\.id,\s*conversationId/g, 'agentId: agent.id, organizationId: conversation.organizationId, conversationId');
  }

  if (file === 'document-ingestion.processor.ts') {
    content = content.replace(/documentType:/g, '// documentType:');
  }

  if (file === 'usage-aggregation.processor.ts') {
    content = content.replace(/startDate:/g, 'periodStart:');
    content = content.replace(/endDate:/g, 'periodEnd:');
  }

  if (file === 'whatsapp-incoming.processor.ts') {
    content = content.replace(/phone:/g, 'primaryPhone:');
    content = content.replace(/content:/g, 'text:');
    // Fix duplicate channelConnectionId
    content = content.replace(/channelConnectionId:\s*channelConnectionId,\s*\n\s*channelConnectionId:\s*channelConnectionId/g, 'channelConnectionId: channelConnectionId');
    content = content.replace(/channelConnectionId:\s*connection\.id,\s*\n\s*channelConnectionId:\s*connection\.id/g, 'channelConnectionId: connection.id');
  }

  if (file === 'whatsapp-outgoing.processor.ts') {
    content = content.replace(/include:\s*\{\s*channelConnection:\s*true\s*\}/g, 'include: { }');
    content = content.replace(/message\.conversation\.channelConnection/g, 'message');
    content = content.replace(/message\.conversation\.contact/g, 'message');
  }

  fs.writeFileSync(path.join(dir, file), content);
}

const files = fs.readdirSync(dir);
files.filter(f => f.endsWith('.ts')).forEach(fix);
