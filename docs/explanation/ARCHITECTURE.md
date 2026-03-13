# Vector Store Init Index - Architecture Diagram

## Module Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Terraform Module: vector-store-init              │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
        ┌──────────────────┐ ┌──────────────┐ ┌──────────────────┐
        │  Archive File    │ │  IAM Role    │ │ Lambda Function  │
        │  Data Source 