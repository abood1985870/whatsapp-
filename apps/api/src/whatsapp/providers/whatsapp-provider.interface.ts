export interface CreateInstanceInput { name: string; organizationId: string; }
export interface QrCodeResult { qrCode: string; instanceId: string; expiresAt: Date; }
export interface ConnectionState { status: string; phoneNumber?: string; error?: string; }
export interface SendTextInput { instanceId: string; phoneNumber: string; text: string; }
export interface SendTemplateInput { instanceId: string; phoneNumber: string; templateName: string; parameters?: any[]; }
export interface SendMediaInput { instanceId: string; phoneNumber: string; url: string; caption?: string; mediaType: string; mimeType?: string; fileName?: string; }
export interface SetWebhookInput { instanceId: string; url: string; }
export interface ProviderMessageResult { messageId: string; status: string; }
export interface ValidatedWebhookEvent { eventType: string; phoneNumber: string; message?: { id: string; text?: string; type: string; timestamp: number }; instanceId: string; }

export interface WhatsAppProvider { 
  createInstance(input: CreateInstanceInput): Promise<{ instanceId: string }>; 
  requestQrCode(instanceId: string): Promise<QrCodeResult>; 
  getConnectionState(instanceId: string): Promise<ConnectionState>; 
  disconnect(instanceId: string): Promise<void>; 
  reconnect(instanceId: string): Promise<void>; 
  deleteInstance(instanceId: string): Promise<void>; 
  sendText(input: SendTextInput): Promise<ProviderMessageResult>; 
  sendTemplate(input: SendTemplateInput): Promise<ProviderMessageResult>; 
  sendMedia(input: SendMediaInput): Promise<ProviderMessageResult>; 
  setWebhook(input: SetWebhookInput): Promise<void>; 
  getMediaBuffer(instanceId: string, messageId: string): Promise<Buffer>;
  validateWebhook(input: unknown, headers: any, query?: any): Promise<ValidatedWebhookEvent | null>; 
}
