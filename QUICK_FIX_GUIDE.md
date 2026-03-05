# Quick Fix Guide - Chat Streaming & Authorizer Cache

## What Was Fixed

1. **Chat streaming content disappearing** - Messages now persist after completion
2. **Authorizer cache causing stale policies** - Cache disabled for immediate policy updates

## Deploy the Fixes

Run this single command:

```powershell
.\FIX-CHAT-STREAMING.ps1
```

This will:
- Rebuild the WebSocket message Lambda
- Deploy all changes with Terraform
- Show you what to test

## Quick Test

1. **Clear browser cache**: Ctrl+Shift+Delete
2. **Refresh the app**: F5
3. **Send a chat message**: Type anything and press Enter
4. **Verify**: Message content stays visible after streaming completes

## What Changed

### Backend (WebSocket Message Handler)
```typescript
// Before: Sent empty string in complete message
MessageSender.createChatResponse(messageId, '', true, metadata)

// After: Sends full accumulated content
MessageSender.createChatResponse(messageId, fullResponse, true, metadata)
```

### Infrastructure (API Gateway Authorizer)
```terraform
# Before: 5 minute cache
authorizer_result_ttl_in_seconds = 300

# After: No cache
authorizer_result_ttl_in_seconds = 0
```

### Frontend (Chat Component)
- Uses content from complete message payload
- Falls back to accumulated streaming content for backwards compatibility
- Better debugging and error handling

## If Something Goes Wrong

### Chat messages still disappearing?
1. Check browser console for errors
2. Look for "Content from payload: NULL/EMPTY" in logs
3. Verify Lambda was rebuilt: `ls lambda/websocket/message/dist/`
4. Check Terraform applied: `cd terraform && terraform show | grep websocket-message`

### Authorization errors?
1. Check authorizer TTL: `cd terraform && terraform show | grep authorizer_result_ttl`
2. Should be `0`, not `300`
3. Clear any browser cookies/tokens
4. Log out and log back in

### Still having issues?
1. Check CloudWatch logs for the WebSocket message Lambda
2. Look for errors in the browser console
3. Verify the WebSocket connection is established
4. Check that the token is valid and not expired

## Files Modified

- `lambda/websocket/message/src/index.ts` - Line 577 (sends full content)
- `terraform/modules/rest-api/main.tf` - Line 181 (cache TTL = 0)
- `frontend/src/components/Chat.tsx` - Lines 150-220 (improved handling)

## Documentation

For detailed information, see:
- `CHAT_STREAMING_FIX.md` - Complete technical details
- `FIX-CHAT-STREAMING.ps1` - Deployment script
- `rebuild-websocket-message.ps1` - Quick rebuild only
