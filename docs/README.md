# Nivulauta Agent Documentation

This documentation is organized following the [Diátaxis framework](https://diataxis.fr/) into four categories:

## 📚 Documentation Structure

### [Tutorials](./tutorials/) - Learning-oriented
Step-by-step guides for learning the system. Start here if you're new to the project.

- [Quick Start Guide](./tutorials/QUICK_START.md) - Get started with vector store initialization
- [E2E Test Guide](./tutorials/E2E_TEST_GUIDE.md) - Learn how to run end-to-end tests
- [Load Test Guide](./tutorials/LOAD_TEST_GUIDE.md) - Learn how to perform load testing
- [Error Handling Guide](./tutorials/ERROR_HANDLING_GUIDE.md) - Learn error handling patterns

### [How-to Guides](./how-to-guides/) - Goal-oriented
Practical guides for accomplishing specific tasks.

#### Deployment
- [Infrastructure Deployment](./how-to-guides/INFRASTRUCTURE_DEPLOYMENT.md) - Complete deployment guide
- [Deployment Checklist](./how-to-guides/DEPLOYMENT_CHECKLIST.md) - Pre/post deployment checklist
- [Frontend Deployment](./how-to-guides/FRONTEND_DEPLOYMENT.md) - Deploy the React frontend

#### Troubleshooting
- [Troubleshooting Guide](./how-to-guides/TROUBLESHOOTING.md) - Common issues and solutions
- [Fix 403 Error](./how-to-guides/FIX_403_ERROR.md) - Resolve OpenSearch 403 errors
- [CORS Fix](./how-to-guides/CORS_FIX_SUMMARY.md) - Fix CORS configuration issues
- [WebSocket Auth Fix](./how-to-guides/WEBSOCKET_AUTH_FIX.md) - Fix WebSocket authentication

#### Build & Configuration
- [Build Instructions](./how-to-guides/) - Various build guides for Lambda functions
- [OpenSearch Setup](./how-to-guides/OPENSEARCH_SETUP.md) - Configure OpenSearch
- [Logging Guide](./how-to-guides/LOGGING_GUIDE.md) - Set up logging

### [Explanation](./explanation/) - Understanding-oriented
Discussions that clarify and illuminate the project's design and architecture.

#### Architecture
- [Architecture Overview](./explanation/ARCHITECTURE.md) - System architecture diagram
- [Solution Summary](./explanation/SOLUTION_SUMMARY.md) - High-level solution overview

#### Implementation Details
- [Implementation Summaries](./explanation/) - Detailed implementation documentation for each module
- [Integration Summaries](./explanation/) - How components integrate together
- [Migration Guides](./explanation/) - Version migration documentation

#### Frontend
- [Chat Integration](./explanation/CHAT_INTEGRATION_SUMMARY.md) - Chat system integration
- [Message Handling](./explanation/MESSAGE_HANDLING_UPDATE.md) - Message handling patterns
- [State Persistence](./explanation/CHAT_STATE_PERSISTENCE.md) - State management

### [Reference](./reference/) - Information-oriented
Technical specifications, API documentation, and reference material.

#### Specifications
- [Design Document](./reference/design.md) - Complete system design specification
- [Requirements Document](./reference/requirements.md) - Functional and non-functional requirements
- [Tasks Document](./reference/tasks.md) - Implementation task breakdown

#### Monitoring & Metrics
- [Metrics Guide](./reference/METRICS_GUIDE.md) - CloudWatch metrics reference
- [Dashboard Reference](./reference/DASHBOARD.md) - Dashboard configuration
- [Alarms Reference](./reference/ALARMS.md) - Alarm configuration
- [Audit Logs](./reference/AUDIT_LOGS.md) - Audit logging specification

#### Component Reference
- [Usage Guides](./reference/) - API usage documentation for shared libraries
- [Test Results](./reference/) - Test execution results and summaries
- [Component READMEs](./reference/) - Frontend component documentation

#### Legal
- [License](./reference/LICENSE.md) - Project license

## 🚀 Quick Navigation

**New to the project?** Start with [Tutorials](./tutorials/)

**Need to deploy?** Check [Infrastructure Deployment](./how-to-guides/INFRASTRUCTURE_DEPLOYMENT.md)

**Troubleshooting?** See [How-to Guides](./how-to-guides/)

**Understanding the system?** Read [Explanation](./explanation/)

**Looking for specs?** Browse [Reference](./reference/)

## 📖 About This Organization

This documentation follows the Diátaxis framework which organizes documentation into four distinct types:

1. **Tutorials** - Learning by doing, step-by-step lessons
2. **How-to Guides** - Practical steps to achieve specific goals
3. **Explanation** - Understanding-oriented discussions
4. **Reference** - Technical descriptions and specifications

Each type serves a different purpose and user need. Choose the category that matches what you're trying to accomplish.

## 🔗 Additional Resources

- [Main README](../README.md) - Project overview
- [Terraform Modules](../terraform/modules/) - Infrastructure as Code
- [Lambda Functions](../lambda/) - Backend implementation
- [Frontend Application](../frontend/) - React UI

## 📝 Contributing to Documentation

When adding new documentation:

1. Determine which category it belongs to (Tutorials, How-to, Explanation, or Reference)
2. Place the file in the appropriate folder
3. Update this README with a link to the new document
4. Follow the existing naming conventions
5. Exclude README.md files from the main project folders

---

*Last updated: 2026*
