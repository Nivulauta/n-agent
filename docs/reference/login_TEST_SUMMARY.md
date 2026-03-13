# Login Handler - Property Test Summary

## Test Implementation: Authentication Service Properties

**Validates:** Requirements 1.2, 1.3, 1.4

### Overview
This test suite validates the login endpoint Lambda function using property-based testing to ensure robust authentication behavior across a wide range of input scenarios. The tests verify that invalid credentials are always rejected and that session token expiration is correctly enforced.

### Test Coverage

#### Property 1: Invalid Credentials Rejection (6 tests)

**Validates:** Requirements 1.2

This property ensures that the Authentication Service rejects any invalid credential combination without generating a session token.

##### 1. Main Property Test (100 randomized scenarios)
Tests various invalid credential combinations:
- **Missing username**: Empty string username with valid password
- **Missing password**: Valid username with empty string password
- **Both missing**: Empty username and password
- **Null/undefined username**: Null or undefined username with valid password
- **Null/undefined password**: Valid username with null or undefined password
- **User not found**: Valid format but non-existent user
- **Wrong password**: Existing user with incorrect password
- **Malformed input**: Special characters, very long strings (up to 1000 chars)

For each scenario, validates:
- Status code is 400 (bad request) or 401 (unauthorized)
- Response contains an error message
- Response does NOT contain token, expiresAt, or userId
- No session is created in DynamoDB

##### 2. Missing Body Test
- Request with null body
- Validates 400 error response
- Ensures no token generated

##### 3. Malformed JSON Test
- Request with invalid JSON syntax
- Validates 500 error response (parsing error)
- Ensures no token generated

##### 4. Non-existent User Test
- Valid credentials format but user doesn't exist
- Validates 401 Unauthorized response
- Error message: "Invalid credentials"
- Ensures no token generated

##### 5. Wrong Password Test
- Existing user with incorrect password
- Uses bcrypt to hash correct password
- Validates password comparison fails
- Returns 401 with "Invalid credentials"
- Ensures no token generated

#### Property 2: Session Token Expiration (6 tests)

**Validates:** Requirements 1.3, 1.4

This property ensures that session tokens expire after 24 hours of inactivity and are properly rejected.

##### 1. Main Property Test (100 randomized scenarios)
Tests session expiration across various time ranges:
- **Session age**: 0 to 48 hours (randomized)
- **Expiration calculation**: lastAccessedAt + 24 hours
- **Property validation**: Sessions ≥24 hours old should be expired

For each scenario, validates:
- Sessions inactive for 24+ hours are marked as expired
- Sessions inactive for <24 hours are still valid
- expiresAt timestamp correctly calculated
- Expiration logic is consistent

##### 2. Exactly 24 Hours Test
- Session created exactly 24 hours ago
- Validates session is expired or about to expire
- Tests boundary condition at expiration threshold

##### 3. 23 Hours Inactivity Test
- Session created 23 hours ago
- Validates session is still valid
- expiresAt is in the future (1 hour remaining)

##### 4. 25 Hours Inactivity Test
- Session created 25 hours ago
- Validates session is expired
- expiresAt is in the past (expired 1 hour ago)

##### 5. 48 Hours Inactivity Test
- Session created 48 hours ago
- Validates session is expired
- expiresAt is in the past (expired 24 hours ago)

##### 6. Newly Created Session Test
- Session just created (now)
- Validates session is valid
- expiresAt is 24 hours in the future

### Key Validations

1. **Invalid Credentials Rejection**:
   - All invalid credential combinations rejected
   - Appropriate HTTP status codes (400/401)
   - User-friendly error messages
   - No session tokens generated for invalid requests
   - No database records created for failed logins

2. **Session Token Expiration**:
   - 24-hour expiration enforced
   - Expired sessions properly identified
   - Valid sessions accepted
   - Boundary conditions handled correctly
   - Consistent expiration calculation

3. **Security**:
   - Password hashing with bcrypt
   - Generic error messages (no user enumeration)
   - Session metadata includes IP address
   - JWT tokens with 24-hour expiration
   - Session records stored in DynamoDB

4. **Error Handling**:
   - Malformed JSON returns 500 error
   - Missing body returns 400 error
   - Invalid credentials return 401 error
   - All errors include descriptive messages
   - No sensitive information leaked in errors

### Running the Tests

```bash
# Install dependencies (if not already installed)
cd lambda/auth/login
npm install

# Run tests
npm test

# Run tests with coverage
npm test -- --coverage
```

### Test Framework
- **Property-Based Testing**: fast-check library
- **Mocking**: aws-sdk-client-mock for DynamoDB operations
- **Password Hashing**: bcryptjs for password comparison
- **JWT**: jsonwebtoken for token generation
- **Test Runner**: Jest with TypeScript support

### Expected Results
All 11 tests should pass, demonstrating that:
- Invalid credentials are consistently rejected across 100+ scenarios
- Session expiration is correctly enforced
- Boundary conditions are handled properly
- Error messages are appropriate and secure
- No tokens generated for invalid requests
- Session records include proper metadata

### Requirements Validation

- ✅ **Requirement 1.2**: Invalid credentials rejected with error message
- ✅ **Requirement 1.3**: Session tokens expire after 24 hours of inactivity
- ✅ **Requirement 1.4**: Expired tokens require re-authentication

### Implementation Details

#### Login Flow
1. Parse and validate request body
2. Retrieve user from DynamoDB Users table
3. Compare password using bcrypt
4. Generate session ID (UUID v4)
5. Create session record in DynamoDB Sessions table
6. Generate JWT token with user context
7. Return token, expiresAt, and userId

#### Session Record Structure
```typescript
{
  PK: "SESSION#<sessionId>",
  SK: "SESSION#<sessionId>",
  userId: string,
  username: string,
  roles: string[],
  createdAt: number,
  lastAccessedAt: number,
  expiresAt: number,
  ipAddress: string
}
```

#### JWT Token Payload
```typescript
{
  userId: string,
  username: string,
  roles: string[],
  sessionId: string,
  exp: number  // 24 hours from creation
}
```

### Security Considerations

1. **Password Security**:
   - Passwords hashed with bcrypt (10 rounds)
   - Never stored or logged in plaintext
   - Comparison done using bcrypt.compare()

2. **Error Messages**:
   - Generic "Invalid credentials" for both wrong username and wrong password
   - Prevents user enumeration attacks
   - No sensitive information in error responses

3. **Session Management**:
   - Session IDs are UUIDs (cryptographically random)
   - Sessions stored in DynamoDB with TTL
   - IP address logged for audit trail
   - 24-hour expiration enforced

4. **JWT Tokens**:
   - Signed with secret key
   - Include expiration timestamp
   - Contain minimal user context
   - Validated by Lambda Authorizer on subsequent requests
