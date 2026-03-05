# Clear Browser Cache - CORS Fix

## The Problem
Even though the Lambda functions are deployed with correct CORS headers, browsers aggressively cache CORS preflight responses. You need to completely clear the cache.

## Solution 1: Hard Refresh (Try This First)

### Chrome/Edge:
1. Open DevTools (F12)
2. Right-click the refresh button
3. Select "Empty Cache and Hard Reload"

OR press: `Ctrl + Shift + R` (Windows) or `Cmd + Shift + R` (Mac)

## Solution 2: Clear All Cache

### Chrome/Edge:
1. Press `Ctrl + Shift + Delete`
2. Select "All time"
3. Check:
   - ✅ Cached images and files
   - ✅ Cookies and other site data (optional, will log you out)
4. Click "Clear data"

### Firefox:
1. Press `Ctrl + Shift + Delete`
2. Select "Everything"
3. Check:
   - ✅ Cache
   - ✅ Cookies (optional)
4. Click "Clear Now"

## Solution 3: Incognito/Private Mode

Open a new incognito/private window:
- Chrome/Edge: `Ctrl + Shift + N`
- Firefox: `Ctrl + Shift + P`

Navigate to `http://localhost:5173` and try again.

## Solution 4: Disable Cache in DevTools

1. Open DevTools (F12)
2. Go to Network tab
3. Check "Disable cache"
4. Keep DevTools open while testing

## Solution 5: Test with curl

Test directly without browser cache:

```powershell
# Test OPTIONS (preflight)
curl.exe -i -X OPTIONS -H "Origin: http://localhost:5173" https://gv1ucj9hg9.execute-api.us-east-2.amazonaws.com/dev/documents/upload

# Should show:
# Access-Control-Allow-Origin: http://localhost:5173
# Access-Control-Allow-Credentials: true
```

## Verify the Fix

After clearing cache:

1. Open DevTools → Network tab
2. Try uploading a document
3. Look at the `/documents/upload` request
4. Check Response Headers:
   - ✅ `Access-Control-Allow-Origin: http://localhost:5173`
   - ✅ `Access-Control-Allow-Credentials: true`
   - ❌ NOT `Access-Control-Allow-Origin: *`

## Still Not Working?

If you've cleared cache and it still doesn't work:

1. Check CloudWatch Logs:
   ```powershell
   aws logs tail /aws/lambda/dev-document-upload --follow
   ```

2. Verify Lambda was actually updated:
   ```powershell
   aws lambda get-function --function-name dev-document-upload --query 'Configuration.LastModified'
   ```

3. Check if Lambda is returning headers:
   ```powershell
   .\test-lambda-response.ps1
   ```

## Common Issues

### Issue: "No CORS header in response"
**Cause**: Lambda is crashing or returning error before headers are set
**Fix**: Check CloudWatch logs for errors

### Issue: "Still seeing wildcard (*)"
**Cause**: Old Lambda code is still deployed
**Fix**: Redeploy Lambda:
```powershell
cd terraform
terraform apply -target=module.document_management -auto-approve
```

### Issue: "CORS works in curl but not browser"
**Cause**: Browser cache
**Fix**: Use incognito mode or clear cache completely
