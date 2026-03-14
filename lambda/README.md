# Lambda Functions

This directory contains all Lambda functions for the Nivulauta Agent system.

## Directory Structure

```
lambda/
├── auth/                    # Authentication Service
│   ├── authorizer/         # Lambda Authorizer for API Gateway
│   ├── login/              # Login endpoint
│   ├── logout/             # Logout endpoint
│   └── README.md
├── build.sh                # Build script for all Lambda functions
└── README.md
```

## Prerequisites

- Node.js 20.x or later
- npm or yarn
- TypeScript 5.x

## Building Lambda Functions

### Build All Functions

To build all Lambda functions at once:

```bash
cd lambda
chmod +x build.sh
./build.sh
```

### Build Individual Functions

To build a specific Lambda function:

```bash
cd lambda/auth/authorizer
npm install
npm run build
cd dist
zip -r index.zip .
```

## Deployment

Lambda functions are deployed using Terraform. After building the functions:

1. Ensure the deployment packages are created in each function's `dist/` directory
2. Run Terraform to deploy:

```bash
cd terraform
terraform init
terraform plan
terraform apply
```

## Environment Variables

Each Lambda function requires specific environment variables. These are configured in the Terraform modules:

### Lambda Authorizer
- `SESSIONS_TABLE`: DynamoDB Sessions table name
- `JWT_SECRET`: Secret key for JWT verification

### Login Lambda
- `SESSIONS_TABLE`: DynamoDB Sessions table name
- `USERS_TABLE`: DynamoDB Users table name
- `JWT_SECRET`: Secret key for JWT signing

### Logout Lambda
- `SESSIONS_TABLE`: DynamoDB Sessions table name

## Testing

Unit tests and property-based tests should be implemented for each Lambda function. To run tests:

```bash
cd lambda/auth/authorizer
npm test
```

## Security Considerations

1. **JWT Secret Management**: Store JWT secrets in AWS Secrets Manager
2. **IAM Roles**: Each Lambda has minimal IAM permissions (least privilege)
3. **Encryption**: All data at rest is encrypted using KMS
4. **Logging**: All functions log to CloudWatch with 365-day retention
5. **CORS**: Configure CORS headers appropriately for your frontend domain

## Adding New Lambda Functions

When adding new Lambda functions:

1. Create a new directory under the appropriate category (e.g., `auth/`, `chat/`, `documents/`)
2. Add `package.json`, `tsconfig.json`, and `src/index.ts`
3. Update the `build.sh` script to include the new function
4. Create a Terraform module in `terraform/modules/` for the new function
5. Update the main Terraform configuration to include the new module

## Monitoring

All Lambda functions emit logs to CloudWatch Logs. Monitor the following:

- Execution duration
- Error rates
- Invocation counts
- Throttling events

CloudWatch dashboards and alarms are configured in the Terraform monitoring module.
