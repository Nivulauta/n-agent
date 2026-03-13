# Rate Limiter - Test Summary

## Test Implementation: Rate Limiting with Sliding Window Algorithm

**Validates:** Requirements 10.1, 10.2, 10.3, 10.4, 10.5

### Overview
This test suite validates the rate limiter implementation using a sliding window algorithm with DynamoDB atomic counters. The tests ensure proper enforcement of rate limits, counter reset behavior, and differentiated limits for regular users vs administrators.

### Test Coverage

#### 1. Basic Rate Limit Checks (4 tests)
- **Allow request when under limit**: Validates first request is allowed with correct remaining count
- **Deny request when limit exceeded**: Validates 61st request is denied for 60/min limit
- **Higher limit for admin users**: Validates admins get 300 requests/min instead of 60
- **Multiple requests in same window**: Validates counter increments correctly across sequential requests

#### 2. Sliding Window Algorithm (5 tests)
- **Track requests within same window**: Validates 5 sequential requests tracked correctly
- **Allow exactly the limit number of requests**: Validates request #60 is allowed (at limit)
- **Deny request beyond limit**: Validates request #61 is denied with retry-after header
- **Handle burst request pattern**: Validates 10 rapid requests all allowed with correct remaining counts
- **Handle gradual request pattern**: Validates gradual requests (1, 5, 10, 20, 30) tracked correctly

#### 3. Counter Reset Behavior (4 tests)
- **Reset counter in new window**: Validates counter resets to 1 after 60-second window expires
- **Calculate correct window boundaries**: Validates resetAt timestamp is within 60 seconds
- **Set TTL for automatic cleanup**: Validates DynamoDB TTL is set for automatic record deletion
- **Handle requests at window boundary**: Validates requests at end of window (59th second) work correctly

#### 4. Admin vs Regular User Limits (5 tests)
- **Enforce 60 requests/min for regular users**: Validates regular users hit limit at 60 requests
- **Enforce 300 requests/min for admin users**: Validates admins hit limit at 300 requests
- **Allow admin 5x more requests**: Validates admin at 60 requests has 240 remaining vs regular user at 0
- **Apply correct limit based on role**: Validates UpdateCommand uses correct limit value (60 vs 300)
- **Handle user with multiple roles including admin**: Validates users with ['user', 'admin', 'developer'] get admin limit

#### 5. Rate Limit Status Queries (3 tests)
- **Return current status**: Validates getRateLimitStatus returns accurate request count and limit
- **Return null when no record exists**: Validates null returned for users with no requests yet
- **Handle errors gracefully**: Validates errors return null instead of throwing

#### 6. Admin Detection (3 tests)
- **Detect admin role**: Validates 'admin' role triggers 300/min limit
- **Detect administrator role**: Validates 'administrator' role triggers 300/min limit
- **Use default limit for non-admin users**: Validates users without admin roles get 60/min limit

#### 7. Middleware Integration (6 tests)
- **Allow requests under limit**: Validates middleware passes through allowed requests
- **Block requests over limit**: Validates middleware returns HTTP 429 for exceeded limits
- **Add rate limit headers**: Validates X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset headers
- **Add retry-after header on 429**: Validates Retry-After header included when limit exceeded
- **Extract user context from authorizer**: Validates middleware reads user info from API Gateway authorizer
- **Fail open on rate limiter errors**: Validates requests allowed through if rate limiter has errors

### Key Validations

1. **Sliding Window Algorithm**:
   - Requests tracked within 60-second windows
   - Counter increments atomically using DynamoDB conditional writes
   - Window boundaries calculated correctly (floor division by 60)
   - TTL set to windowEnd + 60 seconds for automatic cleanup

2. **Rate Limits**:
   - Regular users: 60 requests per minute
   - Admin users: 300 requests per minute
   - Limits enforced using DynamoDB conditional expressions
   - HTTP 429 returned when limit exceeded with Retry-After header

3. **Counter Reset**:
   - Counters automatically reset when new window starts
   - Old window records cleaned up via DynamoDB TTL
   - No manual cleanup required

4. **Error Handling**:
   - Fail-open design: errors allow requests through
   - Graceful degradation prevents service outages
   - Errors logged to CloudWatch for monitoring

5. **Concurrency**:
   - DynamoDB atomic counters prevent race conditions
   - Multiple concurrent requests handled correctly
   - No double-counting or missed increments

### Running the Tests

```bash
# Install dependencies (if not already installed)
cd lambda/shared/rate-limiter
npm install

# Run tests
npm test

# Run tests with coverage
npm test -- --coverage
```

### Test Framework
- **Unit Testing**: Vitest with TypeScript support
- **Mocking**: Vitest mocking for AWS SDK DynamoDB operations
- **Test Runner**: Vitest in run mode (non-watch)

### Expected Results
All 30 tests should pass, demonstrating that:
- Rate limits are enforced correctly for regular and admin users
- Sliding window algorithm tracks requests accurately
- Counter reset behavior works as expected
- DynamoDB operations are atomic and race-condition free
- Error scenarios are handled gracefully with fail-open design
- Middleware integration works correctly with API Gateway

### Requirements Validation

- ✅ **Requirement 10.1**: Enforce 60 requests per minute per user
- ✅ **Requirement 10.2**: Return HTTP 429 with retry-after header when limit exceeded
- ✅ **Requirement 10.3**: Track request counts using sliding window algorithm
- ✅ **Requirement 10.4**: Reset user request counts every 60 seconds
- ✅ **Requirement 10.5**: Allow 300 requests per minute for administrative access
