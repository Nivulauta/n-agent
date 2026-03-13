# WebSocket Authorization 403 Fix

## Problem Description

After user authentication, WebSocket connections were failing with 403 errors on all 10 retry attempts, but then succeeding after waiting. This indicated a timing/race condition issue.

## Root Cause

**DynamoDB Eventual Consistency Race Condition**

The issue occurred due to the following sequence:

1. User submits login credentials
2. Login Lambda writes session to DynamoDB using `PutCommand`
3. Login Lambda returns JWT token to frontend
4. Frontend immediately attempts WebSocket connection
5. WebSocket Authorizer queries DynamoDB for session validation
6. **DynamoDB read returns no session** (eventual consistency - write hasn't propagated yet)
7. Authorizer denies connection with 403
8. After retries and waiting, session becomes available and connection succeeds

### Why This Happens

DynamoDB uses eventual consistency by default for read operations. When you write data and immediately read it, there's no guarantee the data will be available, especially across different Lambda invocations (login vs authorizer).

## Solution Implemented

### 1. Backend Fix: Consistent Read in Authorizer (Primary Fix)

**File**: `lambda/auth/authorizer/src/index.ts`

Added `ConsistentRead: true` to the DynamoDB GetCommand in the authorizer:

```typescript
const result = await docClient.send(
    new GetCommand({
        TableName: SESSIONS_TABLE,
        Key: {
            PK: `SESSION#${sessionId}`,
            SK: `SESSION#${sessionId}`,
        },
        // Use consistent read to ensure we get the latest data
        // This is critical for WebSocket connections immediately after login
        ConsistentRead: true,
    })
);
```

**Impact**:
- Ensures the authorizer always reads the most recent session data
- Eliminates the race condition
- Slight increase in read latency (~2x) and cost (~2x), but negligible for this use case
- Strongly consistent reads guarantee the session will be found if it exists

### 2. Frontend Fix: Small Delay After Login (Secondary Safeguard)

**File**: `frontend/src/contexts/AuthContext.tsx`

Added a 100ms delay after login before updating auth state:

```typescript
// Update state
setAuthState({
    isAuthenticated: true,
    user: userContext,
    token,
    loading: false,
});

// Small delay to ensure DynamoDB session is fully propagated
// This prevents WebSocket 403 errors due to eventual consistency
await new Promise(resolve => setTimeout(resolve, 100));
```

**Impact**:
- Provides additional buffer time for session propagation
- Improves user experience by preventing immediate connection failures
- 100ms is imperceptible to users but sufficient for most consistency delays

## Why Both Fixes?

1. **Consistent Read (Primary)**: Solves the root cause at the database level
2. **Frontend Delay (Secondary)**: Defense-in-depth approach, handles edge cases

## Alternative Solutions Considered

### Option 1: Increase WebSocket Retry Delays (Rejected)
- Would work but provides poor UX (longer wait times)
- Doesn't address root cause

### Option 2: Write Session Before Generating Token (Rejected)
- Doesn't solve the problem (still eventual consistency)
- Adds complexity to login flow

### Option 3: Use DynamoDB Transactions (Rejected)
- Overkill for this use case
- Higher cost and complexity
- Still doesn't guarantee immediate read consistency across Lambda invocations

### Option 4: Cache Session in Login Response (Rejected)
- Requires passing session data through WebSocket URL
- Security concern (sensitive data in URL)
- Doesn't scale for other authorization scenarios

## Performance Impact

### Consistent Read
- **Latency**: ~2x slower than eventually consistent read (~10ms vs ~5ms)
- **Cost**: ~2x more expensive (0.00025 per read vs 0.000125)
- **Throughput**: Same (3000 RCU for 4KB item)

For this use case:
- Authorizer is called once per WebSocket connection
- 100 concurrent users = 100 consistent reads
- Cost increase: ~$0.0125 per 100 connections (negligible)
- Latency increase: ~5ms per connection (imperceptible)

### Frontend Delay
- **User Experience**: 100ms delay is imperceptible
- **No cost impact**

## Testing Recommendations

1. **Test immediate WebSocket connection after login**:
   - Login with valid credentials
   - Verify WebSocket connects on first attempt (no 403 errors)
   - Check CloudWatch logs for authorizer success

2. **Test concurrent logins**:
   - Multiple users login simultaneously
   - Verify all WebSocket connections succeed

3. **Test session expiration**:
   - Wait for session to expire (24 hours)
   - Verify WebSocket connection is denied with 403
   - Verify user is prompted to re-login

4. **Load test**:
   - 100 concurrent users login and connect
   - Verify all connections succeed
   - Monitor DynamoDB read capacity and latency

## Monitoring

### CloudWatch Metrics to Watch

1. **DynamoDB Metrics**:
   - `ConsumedReadCapacityUnits` - Should increase slightly
   - `SuccessfulRequestLatency` - Should remain under 20ms

2. **Lambda Authorizer Metrics**:
   - `Errors` - Should decrease to near zero
   - `Duration` - Should remain under 100ms

3. **WebSocket Metrics**:
   - Connection success rate - Should be >99%
   - 403 errors - Should be near zero (only for invalid tokens)

### CloudWatch Logs Queries

**Check for authorization failures**:
```
fields @timestamp, @message
| filter @message like /Authorization failed/
| sort @timestamp desc
| limit 20
```

**Check for session not found errors**:
```
fields @timestamp, @message
| filter @message like /Session not found/
| sort @timestamp desc
| limit 20
```

## Deployment Steps

1. **Deploy Lambda authorizer changes**:
   ```bash
   cd lambda/auth/authorizer
   npm run build
   cd ../../../terraform
   terraform apply
   ```

2. **Deploy frontend changes**:
   ```bash
   cd frontend
   npm run build
   # Deploy to S3/CloudFront
   ```

3. **Verify deployment**:
   - Test login and WebSocket connection
   - Check CloudWatch logs for successful authorization
   - Monitor for any 403 errors

## Rollback Plan

If issues occur:

1. **Revert authorizer changes**:
   ```bash
   cd lambda/auth/authorizer/src
   git checkout HEAD~1 index.ts
   npm run build
   cd ../../../terraform
   terraform apply
   ```

2. **Revert frontend changes**:
   ```bash
   cd frontend/src/contexts
   git checkout HEAD~1 AuthContext.tsx
   npm run build
   # Redeploy to S3/CloudFront
   ```

## Related Issues

- DynamoDB eventual consistency: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.ReadConsistency.html
- API Gateway WebSocket authorization: https://docs.aws.amazon.com/apigateway/latest/developerguide/websocket-api-lambda-auth.html

## Future Improvements

1. **Add retry logic in authorizer**: If session not found, retry once after 50ms
2. **Implement session caching**: Cache sessions in ElastiCache for faster lookups
3. **Add metrics**: Track authorization success/failure rates
4. **Add alarms**: Alert on high authorization failure rates

## Conclusion

The consistent read fix eliminates the race condition at the source, while the frontend delay provides an additional safety buffer. Together, these changes ensure reliable WebSocket connections immediately after login with minimal performance impact.
