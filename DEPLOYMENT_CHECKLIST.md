# Deployment Checklist - Chat Streaming & Authorizer Fixes

Use this checklist to deploy and verify the fixes.

## Pre-Deployment

- [ ] Review changes in `FIXES_SUMMARY.md`
- [ ] Ensure you're in the project root directory
- [ ] Verify AWS credentials are configured
- [ ] Check that Terraform is initialized (`cd terraform && terraform init`)

## Deployment

### Option A: Automated (Recommended)
- [ ] Run `.\FIX-CHAT-STREAMING.ps1`
- [ ] Wait for build to complete
- [ ] Wait for Terraform apply to complete
- [ ] Note any errors or warnings

### Option B: Manual
- [ ] Navigate to `lambda/websocket/message`
- [ ] Run `npm install`
- [ ] Run `npm run build`
- [ ] Verify `dist/index.mjs` exists
- [ ] Navigate to `terraform`
- [ ] Run `terraform apply`
- [ ] Type `yes` to confirm
- [ ] Wait for deployment to complete

## Post-Deployment Verification

### 1. Infrastructure Check
- [ ] Navigate to `terraform` directory
- [ ] Run `terraform show | grep authorizer_result_ttl`
- [ ] Verify output shows `authorizer_result_ttl_in_seconds = 0`
- [ ] Run `terraform show | grep websocket-message`
- [ ] Verify Lambda function was updated

### 2. Lambda Function Check
- [ ] Open AWS Console → Lambda
- [ ] Find `dev-websocket-message` function
- [ ] Check "Last modified" timestamp (should be recent)
- [ ] Click "Test" tab (optional)
- [ ] Verify function code is updated

### 3. Frontend Preparation
- [ ] Open browser
- [ ] Press Ctrl+Shift+Delete
- [ ] Select "All time" or "Everything"
- [ ] Check "Cookies" and "Cached images and files"
- [ ] Click "Clear data"
- [ ] Close and reopen browser

### 4. Application Test
- [ ] Navigate to frontend URL (http://localhost:5173)
- [ ] Open browser DevTools (F12)
- [ ] Go to Console tab
- [ ] Log in to the application
- [ ] Send a test chat message (e.g., "Hello, how are you?")
- [ ] Watch the console logs

### 5. Verify Chat Streaming
- [ ] Streaming chunks appear during generation ✓
- [ ] Message content is visible while streaming ✓
- [ ] Message content persists after completion ✓
- [ ] No "NULL/EMPTY" in console logs ✓
- [ ] Console shows: "Content from payload: ..." with actual content ✓

### 6. Verify Console Logs
Look for this pattern in browser console:
```
=== Chat Response Debug ===
Message ID: msg-[timestamp]
Is Complete: true
Content from payload: "[actual content]..." ([number] chars)
Current streaming state: [number] chars
Current streaming ref: [number] chars
Has RAG chunks: [true/false] [number]
========================
```

- [ ] "Content from payload" shows actual content (NOT "NULL/EMPTY")
- [ ] Content length is greater than 0
- [ ] No errors in console

### 7. Verify Authorization
- [ ] Upload a document (tests authorization)
- [ ] List documents (tests authorization)
- [ ] Delete a document (tests authorization)
- [ ] No "User is not authorized" errors ✓
- [ ] No CORS errors ✓

### 8. CloudWatch Logs Check (Optional)
- [ ] Open AWS Console → CloudWatch → Log Groups
- [ ] Find `/aws/lambda/dev-websocket-message`
- [ ] Check recent log streams
- [ ] Look for "Streaming complete. Total tokens: X, Response length: Y"
- [ ] Verify Y (response length) is greater than 0
- [ ] No errors in logs

## Troubleshooting

### Issue: Chat messages still disappearing
- [ ] Check browser console for "Content from payload: NULL/EMPTY"
- [ ] Verify Lambda was rebuilt: `ls lambda/websocket/message/dist/index.mjs`
- [ ] Check file modification time: `ls -la lambda/websocket/message/dist/`
- [ ] Redeploy: `cd terraform && terraform apply -auto-approve`
- [ ] Clear browser cache again

### Issue: Authorization errors
- [ ] Check authorizer TTL: `cd terraform && terraform show | grep authorizer_result_ttl`
- [ ] Should be `0`, not `300`
- [ ] If not, run `terraform apply` again
- [ ] Log out and log back in
- [ ] Clear browser cookies

### Issue: CORS errors
- [ ] Check preflight response headers in Network tab
- [ ] Verify `Access-Control-Allow-Origin` is NOT `*`
- [ ] Verify `Access-Control-Allow-Credentials: true` is present
- [ ] Run `.\check-cors-status.ps1` to verify all endpoints

### Issue: Build errors
- [ ] Check Node.js version: `node --version` (should be 22+)
- [ ] Check npm version: `npm --version`
- [ ] Clear node_modules: `rm -rf lambda/websocket/message/node_modules`
- [ ] Reinstall: `cd lambda/websocket/message && npm install`
- [ ] Rebuild: `npm run build`

### Issue: Terraform errors
- [ ] Check AWS credentials: `aws sts get-caller-identity`
- [ ] Check Terraform state: `cd terraform && terraform state list`
- [ ] Refresh state: `terraform refresh`
- [ ] Try again: `terraform apply`

## Success Criteria

All of the following must be true:

- [x] Deployment completed without errors
- [x] Lambda function shows recent "Last modified" timestamp
- [x] Authorizer cache TTL is 0
- [x] Browser cache cleared
- [x] Chat messages persist after streaming completes
- [x] Console logs show actual content (not NULL/EMPTY)
- [x] No authorization errors
- [x] No CORS errors
- [x] Document upload/list/delete works

## Rollback (If Needed)

If something goes wrong and you need to rollback:

1. **Revert code changes**:
   ```bash
   git checkout HEAD~1 lambda/websocket/message/src/index.ts
   git checkout HEAD~1 terraform/modules/rest-api/main.tf
   git checkout HEAD~1 frontend/src/components/Chat.tsx
   ```

2. **Rebuild and redeploy**:
   ```bash
   cd lambda/websocket/message
   npm run build
   cd ../../..
   cd terraform
   terraform apply -auto-approve
   ```

3. **Clear browser cache again**

## Next Steps

After successful deployment:

- [ ] Test with different types of messages
- [ ] Test with RAG-enabled queries (upload documents first)
- [ ] Test with multiple concurrent users (if applicable)
- [ ] Monitor CloudWatch logs for any errors
- [ ] Consider re-enabling authorizer cache for production (with shorter TTL)

## Documentation

For more information, see:
- `QUICK_FIX_GUIDE.md` - Quick reference
- `CHAT_STREAMING_FIX.md` - Detailed technical documentation
- `FIXES_SUMMARY.md` - Complete summary of all fixes

## Notes

- Authorizer cache is disabled for development to avoid stale policies
- For production, consider setting `authorizer_result_ttl_in_seconds = 60` (1 minute)
- Frontend maintains backwards compatibility with old backend behavior
- All changes are backwards compatible and can be rolled back if needed
