const fs = require('fs');
const path = require('path');

const processorsDir = path.join(__dirname, 'src', 'processors');

function fixFiles(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      fixFiles(fullPath);
    } else if (fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');

      // ai-response
      if (file === 'ai-response.processor.ts') {
        content = content.replace(/channel:/g, 'channelConnectionId:');
        content = content.replace(/tokensUsed:/g, 'tokenUsage:');
        content = content.replace(/conversationId: conversation.id,\s*status/g, 'conversationId: conversation.id, organizationId: conversation.organizationId, status');
      }

      // document-ingestion
      if (file === 'document-ingestion.processor.ts') {
        content = content.replace(/title:/g, 'name:');
      }

      // usage-aggregation
      if (file === 'usage-aggregation.processor.ts') {
        content = content.replace(/featureId/g, 'featureKey');
      }

      // whatsapp-incoming
      if (file === 'whatsapp-incoming.processor.ts') {
        content = content.replace(/phone:/g, 'primaryPhone:');
        content = content.replace(/channel:/g, 'channelConnectionId:');
      }

      // whatsapp-outgoing
      if (file === 'whatsapp-outgoing.processor.ts') {
        content = content.replace(/include: \{ channelConnection: true \}/g, '');
        content = content.replace(/include: \{\s*channelConnection: true\s*\}/g, '');
        content = content.replace(/message\.status/g, 'message.providerStatus');
        content = content.replace(/message\.conversation\.channelConnection\.providerInstanceId/g, 'message.channelConnectionId');
        content = content.replace(/message\.conversation\.contact\.primaryPhone/g, 'message.contactId');
        content = content.replace(/message\.content/g, 'message.text');
        content = content.replace(/status:/g, 'providerStatus:');
      }

      fs.writeFileSync(fullPath, content);
    }
  }
}
fixFiles(processorsDir);
