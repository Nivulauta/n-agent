# Authentication Service Lambda Functions

This directory contains the Lambda functions for the Authentication Service of the Nivulauta Agent.

## Components

### 1. Lambda Authorizer (`authorizer/`)
- **Purpose**: Validates JWT tokens and authorizes API Gateway requests
- **Features**:
  - JWT token validation with 24-hour expiration
  - Session validation against DynamoDB Sessions table
  - IAM policy generation for API Gateway
  - In-memory caching of authorization decisions (5 minutes)
- **Environment Variables**:
  - `SESSIONS_TABLE`: DynamoDB table name for sessions
  - `JWT_SECRET`: Secret key for JWT token verification

### 2. Login Endpoint (`login/`)
- **Purpose**: Handles user authentication and session creation
- **Endpoint**: `POST /auth/login`
- **Features**:
  - Credential validation against DynamoDB Users table
  - Password verification using bcrypt
  - JWT token generation with user context
  - Session metadata storage in DynamoDB with TTL
- **Environment Variables**:
  - `SESSIONS_TABLE`: DynamoDB table name for sessions
  - `USERS_TABLE`: DynamoDB table name for users
  - `JWT_SECRET`: Secret key for JWT token signing

### 3. Logout Endpoint (`logout/`)
- **Purpose**: Revokes user sessions
- **Endpoint**: `POST /auth/logout`
- **Features**:
  - Session token revocation by deleting from DynamoDB
  - Requires valid authentication token
- **Environment Variables**:
  - `SESSIONS_TABLE`: DynamoDB table name for sessions

## Building

Each Lambda function can be built independently:

```bash
cd authorizer/
npm install
npm run build

cd ../login/
npm install
npm run build

cd ../logout/
npm install
npm run build
```

## Deployment

These Lambda functions should be deployed using the Terraform configuration in the `terraform/` directory. The Terraform configuration will:
- Create the Lambda functions with appropriate IAM roles
- Configure API Gateway integration
- Set up environment variables
- Configure VPC networking if needed

## Requirements Validation

These Lambda functions implement the following requirements:
- **Requirement 1.1**: Session token generation within 500ms
- **Requirement 1.2**: Invalid credential rejection
- **Requirement 1.3**: 24-hour session token expiration
- **Requirement 1.4**: Session token revocation
- **Requirement 1.5**: IAM roles with least privilege

## Security Considerations

1. **JWT Secret**: The `JWT_SECRET` should be stored in AWS Secrets Manager and rotated regularly
2. **Password Hashing**: Passwords are hashed using bcrypt with appropriate salt rounds
3. **Session TTL**: DynamoDB TTL automatically cleans up expired sessions
4. **Authorization Caching**: Authorization decisions are cached for 5 minutes to reduce DynamoDB load
5. **CORS**: CORS headers are configured to allow browser access (adjust origins as needed)

## Testing

Unit tests and property-based tests should be implemented according to the tasks in the implementation plan.
