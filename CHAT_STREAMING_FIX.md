# Chat Streaming Fix - Complete Message Content Issue

## Problems Fixed

### 1. Chat Response Content Disappears on Completion

When chat responses completed streaming, the final message had empty content (`contentLength: 0`). The streaming chunks would display correctly during streaming, but once `isComplete: true` arrived, the message would disappear.

### 2. Authorizer Returning Cached Authorization Decisions

The API Gateway authorizer was caching authorization decisions for 300 seconds (5 minutes), causing stale policies to be returned even after permissions changed.

## Root Causes

### Chat Streaming Issue

The backend WebSocket message handler was sending:

1. **Streaming chunks**: `createChatResponse(messageId, chunk.text, false)` - incremental text only
2. **Complete message**: `createChatResponse(messageId, '', true, metadata)` - **EMPTY STRING**

The frontend expected the complete message to contain the full accumulated content, but the backend was sending an empty string.

### Authorizer Cache Issue

The API Gateway authorizer had `authorizer_result_ttl_in_seconds = 300`, which cached authorization decisions for 5 minutes. This caused stale policies to be returned even after the authorizer logic changed (e.g., switching from specific endpoint ARN to wildcard ARN).

## Solutions

### Chat Streaming Fix

**File**: `lambda/websocket/message/src/index.ts` (Line 571-580)

**Before**:
```typescript
await messageSender.sendMessage(
    connectionId,
    MessageSender.createChatResponse(
        messageId,
        '',  // Empty string!
        true,
        retrievedChunksMetadata
    )
);
```

**After**:
```typescript
await messageSender.sendMessage(
    connectionId,
    MessageSender.createChatResponse(
        messageId,
        fullResponse,  // Send full accumulated content
        true,
        retrievedChunksMetadata
    )
);
```

### Frontend Changes

**File**: `frontend/src/components/Chat.tsx`

1. **Enhanced debugging**: Added detailed console logs to track content flow
2. **Improved fallback logic**: Uses content from complete message payload first, falls back to accumulated streaming content for backwards compatibility
3. **Removed setTimeout**: No longer needed since complete message now has full content
4. **Better empty message handling**: Skips adding messages with no content

### Authorizer Cache Fix

**File**: `terraform/modules/rest-api/main.tf` (Line 181)

**Before**:
```terraform
authorizer_result_ttl_in_seconds = 300  # 5 minute cache
```

**After**:
```terraform
authorizer_result_ttl_in_seconds = 0  # Disable cache during development
```

**Note**: The Lambda authorizer code also has the cache commented out for additional safety.

## Deployment

Run the deployment script:

```powershell
.\FIX-CHAT-STREAMING.ps1
```

This script will:
1. Rebuild the WebSocket message Lambda function
2. Deploy changes with Terraform (includes authorizer cache fix)
3. Provide next steps for testing

## Testing

### Chat Streaming Test

1. Clear browser cache (Ctrl+Shift+Delete)
2. Refresh the frontend application
3. Send a chat message
4. Verify:
   - Streaming chunks display during generation
   - Complete message persists after streaming finishes
   - Message content is not empty
   - RAG chunks (if any) are displayed

### Authorizer Cache Test

1. Make a request to a protected endpoint (e.g., `/documents`)
2. Verify authorization works correctly
3. Change authorizer logic (if needed for testing)
4. Make another request immediately
5. Verify new authorization logic is applied (not cached)

## Console Logs to Check

When testing, check browser console for:

```
=== Chat Response Debug ===
Message ID: msg-1234567890
Is Complete: true
Content from payload: "This is the full response..." (150 chars)
Current streaming state: 150 chars
Current streaming ref: 150 chars
Has RAG chunks: true 3
========================
```

The "Content from payload" should NOT be "NULL/EMPTY" when `Is Complete: true`.

## Related Files

- `lambda/websocket/message/src/index.ts` - Backend streaming handler
- `lambda/websocket/shared/src/message-sender.ts` - Message creation utility
- `lambda/auth/authorizer/src/index.ts` - Lambda authorizer (cache commented out)
- `terraform/modules/rest-api/main.tf` - API Gateway authorizer configuration
- `frontend/src/components/Chat.tsx` - Frontend chat component
- `rebuild-websocket-message.ps1` - Quick rebuild script
- `FIX-CHAT-STREAMING.ps1` - Complete deployment script

## Previous Attempts

1. **Attempt 1**: Added `streamingContentRef` to store content in a ref (not affected by closures)
   - Result: Didn't fix the issue because backend was sending empty content
   
2. **Attempt 2**: Modified frontend to accumulate streaming chunks
   - Result: Didn't work because backend sends incremental chunks, not accumulated

3. **Final Solution**: Fixed the backend to send full accumulated content in complete message
   - Result: ✅ Works correctly

## Notes

- The backend accumulates the full response in the `fullResponse` variable
- Each streaming chunk contains only the incremental text (`chunk.text`)
- The complete message now contains the full accumulated response
- Frontend maintains backwards compatibility by falling back to accumulated streaming content if needed
